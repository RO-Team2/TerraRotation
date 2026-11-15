"""Map-only ECOSTRESS L2T LST v002: one clear, quality-controlled 70 m pixel."""
import asyncio
from contextlib import ExitStack
import math
import os
from pathlib import PurePosixPath
from urllib.parse import urljoin, urlparse

import httpx
from rasterio.io import MemoryFile
from rasterio.warp import transform
from rasterio.windows import Window

from .map_sources import CMR_URL, cached

TIMEOUT_SECONDS = 60
PRODUCT = 'ECO_L2T_LSTE'
VERSION = '002'


def granule_files(granule):
    files = {}
    aliases = {'lst': 'lst', 'qc': 'qc', 'cloud': 'cloud', 'cloud_mask': 'cloud',
               'water': 'water', 'water_mask': 'water'}
    for link in granule.get('links', []):
        if link.get('inherited') or '/data#' not in link.get('rel', ''):
            continue
        url = link.get('href', '')
        name = PurePosixPath(urlparse(url).path).name.lower()
        for suffix, key in aliases.items():
            if name.endswith(f'_{suffix}.tif') or name.endswith(f'_{suffix}.tiff'):
                files[key] = url
    return files


async def download(client, url, token):
    trusted_redirect = None
    for _ in range(5):
        parsed = urlparse(url)
        nasa = bool(parsed.hostname and parsed.hostname.endswith('.nasa.gov'))
        # Only permit a signed-storage destination supplied by a NASA HTTPS response.
        storage = parsed.hostname == trusted_redirect and parsed.hostname and (
            parsed.hostname.endswith('.cloudfront.net') or parsed.hostname.endswith('.amazonaws.com'))
        if parsed.scheme != 'https' or not (nasa or storage):
            raise ValueError('ECOSTRESS: unsupported NASA download URL.')
        async with client.stream('GET', url, headers={'Authorization': f'Bearer {token}'} if nasa else {}) as response:
            if response.status_code in (301, 302, 303, 307, 308):
                next_url = urljoin(url, response.headers.get('location', ''))
                if nasa:
                    trusted_redirect = urlparse(next_url).hostname
                url = next_url
                continue
            if response.status_code in (401, 403):
                raise ValueError('ECOSTRESS: check EARTHDATA_TOKEN validity and LP DAAC authorization in Earthdata Login.')
            response.raise_for_status()
            chunks, size = [], 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > 32 * 1024 * 1024:
                    raise ValueError('ECOSTRESS: file exceeds the 32 MB limit.')
                chunks.append(chunk)
            return b''.join(chunks)
    raise ValueError('ECOSTRESS: could not download the file after redirects.')


def read_pixel(files, lat, lon):
    with ExitStack() as stack:
        datasets = {}
        for key, raw in files.items():
            mem = stack.enter_context(MemoryFile(raw))
            datasets[key] = stack.enter_context(mem.open())
        values = {}
        for key, dataset in datasets.items():
            if not dataset.crs:
                return None
            xs, ys = transform('EPSG:4326', dataset.crs, [lon], [lat])
            row, col = dataset.index(xs[0], ys[0])
            if not (0 <= row < dataset.height and 0 <= col < dataset.width):
                return None
            pixel = dataset.read(1, window=Window(col, row, 1, 1), masked=True)
            if bool(pixel.mask.any()):
                return None
            values[key] = float(pixel[0, 0])
        if not all(math.isfinite(value) for value in values.values()):
            return None
        # In collection 2, QC alone does NOT exclude cloudy pixels: require cloud mask.
        if values['cloud'] != 0 or values['water'] != 0:
            return None
        qc = int(values['qc'])
        if qc < 0 or qc > 65535 or qc & 0b1111:
            return None
        lst = datasets['lst']
        scale = lst.scales[0]
        if lst.dtypes[0].startswith(('uint', 'int')) and scale == 1:
            scale = 0.02  # v002 packed uint16; tiled float COGs are already in Kelvin.
        kelvin = values['lst'] * scale + lst.offsets[0]
        if not 150 <= kelvin <= 400:
            return None
        return {'lst_c': round(kelvin - 273.15, 2), 'lst_kelvin': round(kelvin, 2),
                'quality_flag': qc, 'resolution_m': 70,
                'sampling': 'A single cloud-free land pixel at the point; not a field average or air temperature.'}


async def ecostress(lat, lon, start, end):
    token = os.getenv('EARTHDATA_TOKEN', '')
    if not token:
        raise ValueError('ECOSTRESS wymaga EARTHDATA_TOKEN na backendzie (Earthdata Login / LP DAAC).')
    async def fetch():
        async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
            response = await client.get(CMR_URL, params={
                'short_name': PRODUCT, 'version': VERSION, 'page_size': 3,
                'sort_key': '-start_date', 'point': f'{lon},{lat}',
                'temporal': f'{start}T00:00:00Z,{end}T23:59:59Z',
            })
            response.raise_for_status()
            for granule in response.json()['feed']['entry']:
                links = granule_files(granule)
                if not all(key in links for key in ('lst', 'qc', 'cloud', 'water')):
                    continue
                keys = ('lst', 'qc', 'cloud', 'water')
                raw = await asyncio.gather(*(download(client, links[key], token) for key in keys))
                result = await asyncio.to_thread(read_pixel, dict(zip(keys, raw)), lat, lon)
                if result:
                    return {**result, 'source': f'NASA ECOSTRESS {PRODUCT} v{VERSION}',
                            'observation_time': granule['time_start'], 'granule_id': granule['title'],
                            'source_url': 'https://doi.org/10.5067/ECOSTRESS/ECO_L2T_LSTE.002'}
        raise ValueError('No ECOSTRESS data for the point and period: no ISS pass, cloud cover, or no valid pixel in the 3 most recent scenes.')
    try:
        async with asyncio.timeout(TIMEOUT_SECONDS):
            return await cached(('ecostress', lat, lon, start, end), fetch)
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise ValueError('ECOSTRESS: download timed out (60 s). Other sources remain independently available.') from exc
