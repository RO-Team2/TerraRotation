"""Sentinel-2 analytical engine. Basemap tiles are a frontend concern."""
import asyncio
import base64
from datetime import date
import math
import os
import time
from typing import Literal

import httpx
import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field, model_validator
import rasterio
from rasterio.features import geometry_mask
from rasterio.io import MemoryFile
from rasterio.transform import from_origin
from rasterio.warp import transform, transform_bounds, transform_geom
from shapely.geometry import shape

router = APIRouter(prefix="/api/v1/satellite", tags=["Field analytics"])
TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
PROCESS_URL = "https://sh.dataspace.copernicus.eu/process/v1"
NODATA = -9999.0
RESOLUTION = 10

# SCL is native 20 m, resampled nearest. We keep vegetation, soil and water.
EVALSCRIPT = """//VERSION=3
function setup() {
  return { input: ["B04", "B08", "SCL", "dataMask"],
           output: {bands: 1, sampleType: "FLOAT32", nodataValue: -9999} };
}
function evaluatePixel(s) {
  const valid = s.dataMask === 1 && [4, 5, 6].includes(s.SCL);
  const sum = s.B08 + s.B04;
  if (!valid || sum <= 0) return [-9999];
  return [(s.B08 - s.B04) / sum];
}
"""


class FieldPolygon(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[list[tuple[float, float]]] = Field(min_length=1, max_length=1)

    @model_validator(mode="after")
    def check_polygon(self):
        ring = self.coordinates[0]
        if not 4 <= len(ring) <= 101 or ring[0] != ring[-1]:
            raise ValueError("The polygon must have 3–100 vertices and a closed ring.")
        if any(not (-180 <= lon <= 180 and -80 <= lat <= 84) for lon, lat in ring):
            raise ValueError("Polygon coordinates are outside the supported range.")
        polygon = shape(self.model_dump())
        if not polygon.is_valid or polygon.area <= 0:
            raise ValueError("Invalid polygon: check for intersecting edges.")
        return self


class SentinelFieldRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    latitude: float | None = Field(default=None, ge=-79, le=83)
    longitude: float | None = Field(default=None, ge=-179.9, le=179.9)
    geometry: FieldPolygon | None = None
    radius_m: int = Field(default=500, ge=50, le=2500, multiple_of=10)
    start_date: date
    end_date: date
    max_cloud_coverage: int = Field(default=30, ge=0, le=100)
    include_geotiff: bool = False

    @model_validator(mode="after")
    def check_request(self):
        if self.geometry is None and (self.latitude is None or self.longitude is None):
            raise ValueError("Provide a point (latitude and longitude) or a Polygon geometry.")
        if self.geometry is not None and (self.latitude is not None or self.longitude is not None):
            raise ValueError("Provide either a point or a polygon, not both.")
        if self.end_date < self.start_date or (self.end_date - self.start_date).days > 30:
            raise ValueError("Choose a valid date range of up to 31 days.")
        if self.end_date > date.today():
            raise ValueError("Future observations cannot be analyzed.")
        return self


class NdviStats(BaseModel):
    mean: float
    min: float
    max: float
    median: float
    valid_pixels: int
    total_pixels: int
    valid_percent: float


class SentinelFieldResponse(BaseModel):
    source: str = "Copernicus Sentinel-2 L2A"
    resolution_m: int = RESOLUTION
    crs: str
    start_date: date
    end_date: date
    geometry: FieldPolygon
    area_ha: float
    stats: NdviStats
    assessment: str
    geotiff: str | None = None
    warnings: list[str]


class CopernicusClient:
    def __init__(self):
        self._token = ""
        self._expires = 0.0
        self._credentials = None
        self._lock = asyncio.Lock()

    async def token(self, client: httpx.AsyncClient) -> str:
        client_id = os.getenv("COPERNICUS_CLIENT_ID", "")
        secret = os.getenv("COPERNICUS_CLIENT_SECRET", "")
        if not client_id or not secret:
            raise HTTPException(503, "Configure COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET on the backend.")
        async with self._lock:
            credentials = (client_id, secret)
            if self._credentials == credentials and self._token and time.monotonic() < self._expires:
                return self._token
            response = await client.post(TOKEN_URL, data={
                "grant_type": "client_credentials", "client_id": client_id, "client_secret": secret,
            })
            if response.status_code in (400, 401, 403):
                raise HTTPException(503, "Copernicus rejected the OAuth credentials. Check the backend configuration.")
            check_upstream(response)
            try:
                body = response.json()
                token = body["access_token"]
                lifetime = float(body["expires_in"])
                if not isinstance(token, str) or not token or not math.isfinite(lifetime) or lifetime <= 0:
                    raise ValueError
            except (ValueError, KeyError, TypeError) as exc:
                raise HTTPException(502, "Invalid Copernicus authentication response.") from exc
            self._token, self._credentials = token, credentials
            self._expires = time.monotonic() + max(0, lifetime - 30)
            return token

    async def fetch(self, payload: dict) -> bytes:
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                token = await self.token(client)
                response = await client.post(PROCESS_URL, headers={
                    "Authorization": f"Bearer {token}", "Accept": "image/tiff",
                }, json=payload)
                if response.status_code == 401:
                    self._expires = 0
                    token = await self.token(client)
                    response = await client.post(PROCESS_URL, headers={
                        "Authorization": f"Bearer {token}", "Accept": "image/tiff",
                    }, json=payload)
                check_upstream(response)
                if response.content[:4] not in (b"II*\x00", b"MM\x00*"):
                    raise HTTPException(502, "Copernicus did not return a GeoTIFF raster.")
                return response.content
        except httpx.TimeoutException as exc:
            raise HTTPException(504, "Copernicus request timed out.") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(502, "Cannot connect to Copernicus.") from exc


def check_upstream(response: httpx.Response):
    if response.status_code == 429:
        raise HTTPException(429, "Copernicus rate limit reached. Try again later.", headers={"Retry-After": "60"})
    if response.status_code in (401, 403):
        raise HTTPException(503, "Missing Sentinel Hub permissions. Check the Copernicus account and OAuth client.")
    if not response.is_success:
        raise HTTPException(502, "Copernicus rejected the Sentinel-2 data download.")


copernicus = CopernicusClient()


def projected_polygon(req: SentinelFieldRequest, crs: str) -> dict | None:
    if req.geometry is None:
        return None
    return transform_geom("EPSG:4326", crs, req.geometry.model_dump())


def field_grid(req: SentinelFieldRequest):
    if req.geometry is not None:
        center = shape(req.geometry.model_dump()).centroid
        lon, lat = center.x, center.y
    else:
        lon, lat = req.longitude, req.latitude
    zone = min(60, int((lon + 180) // 6) + 1)
    crs = f"EPSG:{(32600 if lat >= 0 else 32700) + zone}"
    if req.geometry is None:
        xs, ys = transform("EPSG:4326", crs, [lon], [lat])
        x, y = round(xs[0] / 10) * 10, round(ys[0] / 10) * 10
        bounds = (x - req.radius_m, y - req.radius_m, x + req.radius_m, y + req.radius_m)
        size = req.radius_m * 2 // RESOLUTION
    else:
        left, bottom, right, top = shape(projected_polygon(req, crs)).bounds
        left, bottom = math.floor(left / 10) * 10, math.floor(bottom / 10) * 10
        size = math.ceil(max(right - left, top - bottom) / RESOLUTION)
        if size > 500:
            raise HTTPException(422, "The field area must span no more than 5 km.")
        bounds = (left, bottom, left + size * 10, bottom + size * 10)
    geographic = transform_bounds(crs, "EPSG:4326", *bounds)
    if geographic[0] >= geographic[2] or geographic[2] - geographic[0] > 1:
        raise HTTPException(422, "The area must not cross the 180° meridian.")
    return crs, bounds, size


def process_payload(req: SentinelFieldRequest, crs: str, bounds: tuple) -> dict:
    spatial = {"bbox": list(bounds), "properties": {
        "crs": f"http://www.opengis.net/def/crs/EPSG/0/{crs.split(':')[1]}",
    }}
    polygon = projected_polygon(req, crs)
    if polygon is not None:
        spatial["geometry"] = polygon
    return {
        "input": {"bounds": spatial, "data": [{
            "type": "sentinel-2-l2a",
            "dataFilter": {
                "timeRange": {"from": f"{req.start_date}T00:00:00Z", "to": f"{req.end_date}T23:59:59.999Z"},
                "maxCloudCoverage": req.max_cloud_coverage, "mosaickingOrder": "leastCC",
            },
            "processing": {"upsampling": "NEAREST", "downsampling": "NEAREST"},
        }]},
        "output": {"resx": 10, "resy": 10,
                   "responses": [{"identifier": "default", "format": {"type": "image/tiff"}}]},
        "evalscript": EVALSCRIPT,
    }


def render_result(raw: bytes, req: SentinelFieldRequest, crs: str, bounds: tuple, size: int):
    """Compute numerical statistics within the AOI; never produce basemap images."""
    grid = from_origin(bounds[0], bounds[3], RESOLUTION, RESOLUTION)
    try:
        with MemoryFile(raw) as mem, mem.open() as src:
            if (src.count != 1 or src.shape != (size, size) or src.crs != rasterio.crs.CRS.from_string(crs)
                    or not src.transform.almost_equals(grid, precision=0.01)):
                raise ValueError("unexpected raster grid")
            ndvi = src.read(1).astype("float32")
    except (rasterio.errors.RasterioError, ValueError) as exc:
        raise HTTPException(502, "Invalid Copernicus raster or analysis grid.") from exc
    polygon = projected_polygon(req, crs)
    inside = (geometry_mask([polygon], out_shape=ndvi.shape, transform=grid, invert=True)
              if polygon is not None else np.ones(ndvi.shape, dtype=bool))
    if not inside.any():
        raise HTTPException(422, "The field is too small: it contains no 10 m pixel centers.")
    valid = inside & np.isfinite(ndvi) & (ndvi >= -1) & (ndvi <= 1)
    if not valid.any():
        raise HTTPException(404, "No valid Sentinel-2 pixels in the field. Change the dates or cloud coverage limit.")
    ndvi[~valid] = NODATA
    values = ndvi[valid]
    valid_percent = round(float(valid.sum() / inside.sum()) * 100, 2)
    geotiff = None
    if req.include_geotiff:
        with MemoryFile() as mem:
            with mem.open(driver="GTiff", width=size, height=size, count=1, dtype="float32",
                          crs=crs, transform=grid, nodata=NODATA, compress="deflate") as dst:
                dst.write(ndvi, 1)
            geotiff = f"data:image/tiff;base64,{base64.b64encode(mem.read()).decode('ascii')}"
    if req.geometry is None:
        left, bottom, right, top = bounds
        polygon = {"type": "Polygon", "coordinates": [[[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]]]}
    geometry = FieldPolygon.model_validate(transform_geom(crs, "EPSG:4326", polygon))
    area_ha = shape(polygon).area / 10000
    warnings = [
        "NDVI describes vegetation activity; without crop type, growth stage, and comparisons over time, it does not diagnose crop condition or yield.",
        "The leastCC mosaic may combine different passes within the selected date range.",
        "B04/B08 bands: 10 m; SCL mask: 20 m. Classes 4, 5, 6 retained (vegetation, soil, water).",
        "Basemap imagery dates are independent of Sentinel-2 analysis dates.",
    ]
    if req.geometry is None:
        warnings.append("Point analysis covers a square around the coordinates, not the field boundaries.")
    if valid_percent < 70:
        warnings.append("Fewer than 70% of field pixels have valid data; the result may not represent the entire field.")
    return SentinelFieldResponse(
        crs=crs, start_date=req.start_date, end_date=req.end_date, geometry=geometry,
        area_ha=round(area_ha, 4), geotiff=geotiff,
        stats=NdviStats(mean=float(values.mean()), min=float(values.min()), max=float(values.max()),
                        median=float(np.median(values)), valid_pixels=int(valid.sum()),
                        total_pixels=int(inside.sum()), valid_percent=valid_percent),
        assessment="NDVI calculated. Agronomic assessment requires crop context and observations from subsequent dates.",
        warnings=warnings,
    )


@router.post("/field", response_model=SentinelFieldResponse)
async def sentinel_field(req: SentinelFieldRequest):
    """Analyze a WGS84 field polygon or point AOI, return numerical NDVI results."""
    crs, bounds, size = field_grid(req)
    raw = await copernicus.fetch(process_payload(req, crs, bounds))
    return await run_in_threadpool(render_result, raw, req, crs, bounds, size)
