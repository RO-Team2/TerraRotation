# TerraRotation Engine 1.0.0 — NASA Space Apps Hackathon MVP

<div align="center">

  <img src="TerraRotation_logo.svg" alt="TerraRotation Logo" width="240">

  <h3>Smart Crop Rotation & Satellite Field Analysis</h3>

  <p>
    Crop rotation planning powered by NASA Earth observation data.
  </p>

  <p>
    <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
    <img src="https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron">
    <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  </p>

  <p>
    <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
    <img src="https://img.shields.io/badge/NASA-POWER-0B3D91?style=for-the-badge&logo=nasa&logoColor=white" alt="NASA POWER">
    <img src="https://img.shields.io/badge/Sentinel--2-1976D2?style=for-the-badge&logoColor=white" alt="Sentinel-2">
    <img src="https://img.shields.io/badge/NASA-SMAP-0B3D91?style=for-the-badge&logo=nasa&logoColor=white" alt="NASA SMAP">
    <img src="https://img.shields.io/badge/NASA-ECOSTRESS-0B3D91?style=for-the-badge&logo=nasa&logoColor=white" alt="NASA ECOSTRESS">
  </p>

</div>

A FastAPI backend for recommending multi-year crop rotations based on field coordinates, historical NASA POWER data, and an estimated soil profile from ISRIC SoilGrids. **This is a hackathon demonstrator, not a validated agricultural advisory system.** The frontend is a separate team project.

## 1. What is included?

```text
terrarotation/
  api.py        # FastAPI, CORS, and /api/v1 endpoints
  models.py     # Input validation (Pydantic)
  providers.py  # NASA POWER + ISRIC SoilGrids WCS
  crops.py      # Crop catalog
  engine.py     # Crop rotation scoring and generation
  __init__.py
frontend-example/
  api.js        # Ready-to-use JS client for React/Vite
.env.example    # Example backend environment variables
pyproject.toml  # Dependencies and version 1.0.0
README.md
```

## 2. Requirements

- Python **3.12+**, pip, and an internet connection for `live` mode.
- GDAL with the Python `osgeo` module for reading SoilGrids rasters; on Fedora, the easiest option is to use the system Python and the `gdal` and `python3-gdal` packages.
- `curl` and optionally `jq` for manual testing.

### Fedora installation

```bash
sudo dnf install python3-gdal gdal python3-pip
cd ~/Pulpit/nasa/terrarotation-mvp   # or the directory containing the extracted package
python -m pip install -e .
python -c 'from osgeo import gdal, osr; print("GDAL:", gdal.VersionInfo())'
python -m uvicorn terrarotation.api:app --reload --host 127.0.0.1 --port 8000
```

If `from osgeo import gdal` fails, check that `python` points to the installation where `python3-gdal` is installed. Virtual environments often cannot access the system GDAL. Avoid blindly installing another GDAL version through pip: the bindings should match the system library.

**Available URLs:** `http://127.0.0.1:8000/docs` (Swagger), `http://127.0.0.1:8000/openapi.json` (specification), `http://127.0.0.1:8000/api/v1/health`.

## 3. Frontend API

**Base URL:** `http://127.0.0.1:8000` (local); prefix: `/api/v1`.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/health` | Status and version |
| GET | `/api/v1/config` | Allowed scenarios, defaults, and limits |
| GET | `/api/v1/crops` | Crop identifiers and parameters |
| POST | `/api/v1/recommend` | Soil and climate data, recommendations, and yearly simulation |
| GET | `/docs` | Interactive Swagger UI |
| GET | `/openapi.json` | OpenAPI contract for generating types |

The legacy `/health`, `/crops`, and `/recommend` endpoints still work, but **the frontend should use `/api/v1/*`**.

### Minimal request

```bash
curl -sS http://127.0.0.1:8000/api/v1/recommend \
  -H 'Content-Type: application/json' \
  -d '{"latitude":52.28,"longitude":16.70,"years":4,"scenario":"balanced","climate_years":10,"mode":"live"}' \
  | jq '{status:.engine.status, soil:.soil.layers, climate:.climate, best:.engine.recommendations[0]}'
```

**`live`** fetches data from external sources. **`demo`** uses sample data and is useful for UI development without waiting for network requests:

```bash
curl -sS http://127.0.0.1:8000/api/v1/recommend \
  -H 'Content-Type: application/json' \
  -d '{"latitude":52.28,"longitude":16.70,"years":4,"mode":"demo"}' | jq .
```

### `POST /api/v1/recommend` parameters

| Field | Type | Default | Description |
|---|---|---|---|
| `latitude` | number, -90…90 | required | Latitude |
| `longitude` | number, -180…180 | required | Longitude |
| `years` | integer, 2…6 | `4` | Plan duration |
| `scenario` | string | `balanced` | `balanced`, `soil`, `resilience`, `profit` |
| `climate_years` | integer, 3…20 | `10` | Number of complete years of climate history |
| `mode` | string | `live` | `live` or `demo` |
| `top_k` | integer, 1…20 | `5` | Maximum number of recommendations |
| `history` | string[] | `[]` | Crop history using identifiers from `/crops` |
| `allowed_crops` | string[] or null | `null` | Allowed crops; null = all |
| `max_candidates` | integer, 100…500000 | `100000` | Search limit |
| `ph_override` | number or null, 0…14 | `null` | Manual pH instead of the aggregated value |
| `sand_override` | number or null, 0…100 | `null` | Manual sand content (%) |
| `soc_override` | number or null, >=0 | `null` | Manual SOC (g/kg) |

**Do not use Polish crop names in `history` or `allowed_crops`:** the API uses identifiers such as `pea`, `rye`, `rapeseed`, and `potato`. Fetch the list from `/api/v1/crops`.

### Response structure

```json
{
  "input": {"latitude": 52.28, "longitude": 16.70, "years": 4},
  "soil": {"layers": [{"depth": "0-5cm", "ph": 6.3}], "warnings": []},
  "climate": {"avg_temp_c": 9.9, "annual_rain_mm": 627, "warnings": []},
  "engine": {
    "status": "ok",
    "explored": 2172,
    "truncated": false,
    "recommendations": [
      {"rotation": ["pea", "rapeseed", "potato", "rye"],
       "score": 0.74,
       "metrics": {"fit": 0.98, "soil": 0.47, "resilience": 0.55, "profit": 0.71, "diversity": 1.0},
       "explanations": ["..."],
       "year_by_year": [{"year": 1, "crop": "pea", "nitrogen_index": 0.61, "organic_matter_index": 0.5245}]}
    ],
    "warnings": []
  },
  "disclaimer": "..."
}
```

This is an **abbreviated illustrative example**, not a complete response: actual objects contain additional fields. The frontend should not rely on the example numbers. The complete current schema is available at `/openapi.json`.

- `engine.status`: `ok`, `insufficient_data`, or `no_feasible_rotation`.
- For `ok`, read `engine.recommendations` (the array may be empty for other statuses).
- `soil.layers`: a profile at depths of 0–5, 5–15, and 15–30 cm, where available.
- `year_by_year`: yearly entries with `crop`, `previous_crop`, `pre_crop_bonus`, `fit`, `nitrogen_index`, and `organic_matter_index`.
- `soil.warnings`, `climate.warnings`, `engine.warnings`: display these to the user.
- `truncated: true` means that not all combinations were searched.
- **HTTP 422**: invalid parameters, such as out-of-range coordinates or unknown crops.
- **HTTP 200 with `insufficient_data`**: required source data is missing; this does not indicate a successful recommendation.

## 4. React / Vite integration

### Field map and independent Sentinel-2 analysis

The application has two independent layers:

- **Leaflet visual basemap:** Esri World Imagery tiles with labels for
  identifying terrain and marking field boundaries. OSM is an alternative.
  The provider and data contributors are credited on the map. Image detail
  and acquisition dates depend on the location and provider; the analysis date does not change the basemap.
- **FastAPI analysis engine:** fetches Copernicus Sentinel-2 L2A data,
  calculates NDVI from B08/B04 on a 10 m UTM grid, and returns numerical results.
  It does not generate an RGB basemap or map tiles. The response can optionally
  include a downloadable NDVI raster, which is not used as a background layer.

In the **Map** tab, choose “Point and surroundings” or “Outline field”.
In outline mode, click the field corners, then select “Finish outline” and
“Analyze field · Sentinel-2”. The “Undo point” button removes the last vertex.
A single polygon without holes is supported, with up to 100 vertices,
no intersecting edges, and a span of up to 5 km.
GeoJSON coordinates use the `[longitude, latitude]` order.

**Backend configuration:** create a Sentinel Hub OAuth client in the
[Copernicus Dashboard](https://shapps.dataspace.copernicus.eu/dashboard/).
See the [authentication guide](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/Authentication.html).
Keep credentials on the backend, not in `VITE_*` variables.

```bash
python -m pip install -e .
export COPERNICUS_CLIENT_ID='your-client-id'
export COPERNICUS_CLIENT_SECRET='your-client-secret'
python -m uvicorn terraengine.api:app --host 127.0.0.1 --port 8000
```

For Docker Compose, populate `.env` using `.env.example` and run
`docker compose up --build`. Uvicorn does not load `.env` automatically.

**API:** `POST /api/v1/satellite/field` analyzes a point or polygon.
Polygon example:

```bash
curl --fail http://127.0.0.1:8000/api/v1/satellite/field \
  -H 'Content-Type: application/json' \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[16.70,52.28],[16.703,52.28],[16.703,52.282],[16.70,52.282],[16.70,52.28]]]},"start_date":"2024-06-01","end_date":"2024-06-15","max_cloud_coverage":30,"include_geotiff":false}' \
  --output field.json
```

For a point, replace `geometry` with `latitude`, `longitude`, and `radius_m`
(50–2500 m, in multiples of 10). Do not supply both a point and a polygon.
Point analysis covers a square with sides of `2 * radius_m`.

The response includes `stats` (mean, median, minimum and maximum NDVI, valid
pixel count, total pixel count within the area, and percentage of valid data),
`area_ha`, `geometry` (the actual area analyzed), `assessment`, `warnings`,
`source`, `resolution_m`, `crs`, `start_date`, and `end_date`.
`geotiff` is null by default; set `include_geotiff=true` to receive
an analytical 10 m Float32 GeoTIFF with `nodata=-9999` as a data URL.
The raster contains nodata outside the polygon. The `image`, `rgb_image`,
`rgb_geotiff`, and preview `bounds` fields are no longer present.

Field boundaries are sent to the Process API and also masked locally.
Statistics cover pixels whose centers fall inside the polygon.
The `area_ha` value comes from the geometry in UTM, not from the pixel count.
A small polygon containing no 10 m pixel centers returns 422.

The SCL mask has a resolution of 20 m; classes 4, 5, and 6 are retained
(vegetation, soil, and water). Clouds, shadows, snow, and missing data are excluded.
The cloud coverage limit applies to the scene and does not guarantee a cloud-free field.
The `leastCC` mosaic may combine different passes within a period of up to 31 days.
Without crop context, growth stage, and comparisons over time, NDVI alone is
not a diagnosis of crop condition or a yield forecast; the application displays this limitation.
The crop rotation engine continues to use NASA POWER and SoilGrids separately.

Errors: 404 for no valid pixels, 422 for invalid parameters/geometry, 429 for rate limits,
503 for missing configuration/permissions, and 502/504 for Copernicus errors or timeouts.

Documentation: [Process API](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Process/Examples/S2L2A.html),
[Esri World Imagery](https://doc.arcgis.com/en/data-appliance/2024/maps/world-imagery.htm).
Tests: `python -m unittest discover -s tests -v`.

Add `.env.local` to the frontend repository:

```dotenv
VITE_API_URL=http://127.0.0.1:8000
```

Copy `frontend-example/api.js` to `src/api.js`, then:

```js
import { getConfig, getCrops, recommendRotation } from './api';

const config = await getConfig();
const catalog = await getCrops();
const result = await recommendRotation({ latitude: 52.28, longitude: 16.70, years: 4, mode: 'live' });
if (result.engine.status === 'ok') {
  console.log(result.engine.recommendations[0]?.rotation);
} else {
  console.warn(result.engine.status, result.engine.warnings);
}
```

The map provides `latitude` and `longitude`, the form provides `years`, `scenario`, and optionally `history`, and the results view displays `soil.layers`, `climate`, and `engine.recommendations`. Crop selection in the UI should use the catalog's `id` values.

### CORS and running on two computers

By default, origins `http://localhost` and `http://127.0.0.1` on ports `3000`, `5173`, and `8080` are accepted. For a different frontend origin, configure the backend:

```bash
TERRAROTATION_CORS_ORIGINS='http://localhost:5173,http://192.168.1.20:5173' \
  python -m uvicorn terrarotation.api:app --host 0.0.0.0 --port 8000
```

`192.168.1.20` is an **example**; replace it with the actual address of the frontend machine. A frontend on another computer **cannot** use `127.0.0.1` as the backend address: use the backend server's IP address or domain. Port 8000 must be accessible on the network; do not expose an unsecured development server to the public internet.

## 5. Common issues

- **`ModuleNotFoundError: osgeo`** — Python cannot access the GDAL bindings; check `python -c 'from osgeo import gdal'`.
- **`No module named uvicorn`** — run `python -m pip install -e .` using the same Python installation.
- **CORS blocked** — add the exact frontend origin to `TERRAROTATION_CORS_ORIGINS` and restart the backend.
- **`Failed to fetch`** — check `/api/v1/health`, the host, port, firewall, and whether the browser can connect to the backend.
- **`insufficient_data`** — check the warnings; NASA POWER / SoilGrids sources may be unavailable; switch to `demo` for UI demonstrations.
- **422** — check the request body in `/docs`, crop identifiers, and parameter ranges.
- **The first `live` request takes longer** — data is fetched from external services; the frontend should show a loading state and allow retries.

## 6. What is modeled, and what comes from data?

- **NASA POWER**: historical temperatures and precipitation; **not a weather forecast**.
- **SoilGrids**: spatial estimates of pH, SOC, and texture at three depths; **not laboratory soil sample results**.
- **Crop scores, preceding crop effects, profitability, nitrogen and organic matter indices**: demonstration heuristics, **not actual kg N/ha, predicted yields, or validated SOC changes**.
- This is a hackathon MVP: do not use it as the sole basis for production decisions.

## 7. Team handoff

The backend developer starts the server and shares the API address; the frontend developer uses `frontend-example/api.js`, `/docs`, and `/openapi.json`. Use `mode: "demo"` for visual development; check `mode: "live"` and error messages before presenting to the judges.

## Integrated analysis in the Map view

The Esri map has a separate endpoint, `POST /api/map/analyze`. It does not change
`/api/v1/recommend`, `/api/v1/adapt`, or the providers used by Field Analysis.
It accepts the same point/outline, a date range of up to 31 days, cloud coverage,
and GeoTIFF option as `/api/v1/satellite/field`. Clicking a point or finishing
an outline starts analysis automatically; the button allows retries.

Sources are fetched independently, in parallel:

- **NASA POWER Daily / AG**: daily mean/min/max temperature, precipitation,
  air humidity, and wind (UTC). The report shows daily data completeness, total
  precipitation, heat events, frosts, and the longest run of days with precipitation
  below 1 mm. Missing data breaks dry spells; precipitation totals are not extrapolated.
- **Sentinel-2**: the existing NDVI service, called without changing its implementation.
- **NASA SMAP SPL3SMP v009**: surface soil moisture at 0–5 cm on a 36 km grid.
  Up to 3 of the period's most recent granules are fetched from NASA CMR / NSIDC.
  The nearest pixel is selected, then checked for quality (flag 0 or 8); an invalid
  pixel is not replaced by a neighboring one. The result is a single observation,
  not an average across the outline or root-zone soil moisture.

Install dependencies with `python -m pip install -e .` (new dependency: `h5py`).
POWER does not require a key. Sentinel-2 requires the existing Copernicus variables.
SMAP requires an **`EARTHDATA_TOKEN`** from [Earthdata Login](https://urs.earthdata.nasa.gov/),
valid for NSIDC downloads, and authorization for the appropriate Earthdata application.
Set the token only on the backend. Compose passes it from `.env`;
uvicorn requires exporting it in the terminal. A missing token does not block POWER
or NDVI. SMAP downloads are limited to 64 MB per file. Point data is cached
for 15 minutes in a memory-bounded cache independent of Field Analysis.

The response contains `power`, `sentinel`, and `smap` (each with `status`, `data`,
and `message`), `findings`, `warnings`, and an overall status of `ok`, `partial`,
or `unavailable`. For polygons, POWER and SMAP sample a point inside the outline;
NDVI covers the entire outline. Missing sources are explicitly reported and do not trigger demo data.

Interpretation is heuristic: among other factors, it combines at least 7 days
without significant precipitation with SMAP moisture below 0.15 m³/m³, and accounts
for NDVI, heat, and rainfall events of ≥25 mm/day. Weather inference requires
≥80% complete days, NDVI use requires ≥70% valid pixels, and SMAP requires an
observation within 7 days of the period's end. These thresholds are indicative;
the report does not determine fertilizer or irrigation rates and does not equate low NDVI with nitrogen deficiency.

Source documentation: [POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/),
[SMAP SPL3SMP v9](https://nsidc.org/data/spl3smp/versions/9),
[CMR Search API](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html).


### Background map analysis

The map interface uses `POST /api/map/jobs` (HTTP 202) and polls
`GET /api/map/jobs/{id}` approximately once per second. Each source's results
are available as soon as it finishes, without waiting for SMAP. `DELETE /api/map/jobs/{id}`
cancels data retrieval. Changing the area or parameters cancels the previous job;
late responses do not overwrite results for the new field. The interface remains
active during analysis and shows the number of completed sources.

Job statuses: `running`, `completed`, `cancelled`, `failed`; source statuses:
`pending`, `ok`, `unavailable`. During retrieval, the report has a `running` status;
the final interpretation is updated as further results arrive. The existing
`POST /api/map/analyze` remains available for clients expecting a complete response.

Jobs are stored in the memory of **a single backend process**: up to 4 active
and 32 stored jobs. Completed results expire after 15 minutes;
restarting the backend removes them. This version requires a single uvicorn process
(without multiple workers); sharing jobs across processes requires a separate store/queue.


### Fourth tile: NASA ECOSTRESS LST

The map report also includes `ecostress` (`pending`, `ok`, or `unavailable`).
This source runs independently within the same job and uses the existing
`EARTHDATA_TOKEN` (LP DAAC access). The `ECO_L2T_LSTE.002` product has a 70 m grid;
the report shows surface temperature in °C, the UTC observation time, and a quality flag.
This is a single pixel for a point inside the outline, not a field average or air temperature.

Up to 3 of the period's most recent scenes are checked. LST, QC, the cloud mask,
and the water mask are downloaded, and reading takes place in a separate thread.
NoData values, clouds, water, and poor-quality data are rejected. The total source
timeout is 60 seconds (including cache waiting), with a 32 MB file limit. Missing
ISS passes, missing tokens, and network errors produce a message in this tile
without blocking POWER, Sentinel-2, or SMAP. The report now tracks four sources (0/4–4/4).

Specification: [ECOSTRESS L2 User Guide v002](https://lpdaac.usgs.gov/documents/1574/ECOL2_User_Guide_V2.pdf).
