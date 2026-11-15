"""Map-only data access. Does not import or change field-analysis providers."""
import asyncio
import io
import math
import os
import time
from datetime import timedelta
from urllib.parse import urljoin, urlparse

import httpx
import numpy as np

POWER_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point'
CMR_URL = 'https://cmr.earthdata.nasa.gov/search/granules.json'
_cache = {}
_locks = {'power': asyncio.Lock(), 'smap': asyncio.Lock(), 'ecostress': asyncio.Lock()}


async def cached(key, fetch):
    # Bound memory and serialize duplicate upstream requests (separate from field analysis).
    async with _locks[key[0]]:
        entry = _cache.get(key)
        if entry and entry[0] > time.monotonic():
            return entry[1]
        value = await fetch()
        if len(_cache) >= 128:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (time.monotonic() + 900, value)
        return value


def numeric(value, low=-100, high=100):
    return isinstance(value, (int, float)) and math.isfinite(value) and low <= value <= high


async def power(lat, lon, start, end):
    async def fetch():
        async with httpx.AsyncClient(timeout=40) as client:
            response = await client.get(POWER_URL, params={
                'parameters': 'T2M,T2M_MIN,T2M_MAX,PRECTOTCORR,RH2M,WS2M',
                'community': 'AG', 'latitude': lat, 'longitude': lon,
                'start': start.strftime('%Y%m%d'), 'end': end.strftime('%Y%m%d'),
                'format': 'JSON', 'time-standard': 'UTC',
            })
            response.raise_for_status()
            data = response.json()['properties']['parameter']
        days = []
        for i in range((end - start).days + 1):
            day = (start + timedelta(days=i)).strftime('%Y%m%d')
            row = {'date': day}
            for key, bounds in {'T2M': (-100, 70), 'T2M_MIN': (-100, 70), 'T2M_MAX': (-100, 70),
                                'PRECTOTCORR': (0, 2000), 'RH2M': (0, 100), 'WS2M': (0, 150)}.items():
                value = data.get(key, {}).get(day)
                row[key] = value if numeric(value, *bounds) else None
            days.append(row)
        valid = [r for r in days if all(r[k] is not None for k in ('T2M', 'T2M_MIN', 'T2M_MAX', 'PRECTOTCORR'))]
        if not valid:
            raise ValueError('No valid POWER observations in the selected period.')
        dry = longest = 0
        for row in days:
            dry = dry + 1 if row['PRECTOTCORR'] is not None and row['PRECTOTCORR'] < 1 else 0
            longest = max(longest, dry)
        return {'source': 'NASA POWER Daily / AG', 'source_url': POWER_URL,
                'start_date': start.isoformat(), 'end_date': end.isoformat(),
                'resolution': 'Weather grid approximately 0.5° × 0.625°; not a field measurement',
                'days_requested': len(days), 'valid_days': len(valid),
                'coverage_percent': round(100 * len(valid) / len(days), 1),
                'mean_temp_c': round(sum(r['T2M'] for r in valid) / len(valid), 1),
                'rain_mm': round(sum(r['PRECTOTCORR'] for r in valid), 1),
                'hot_days': sum(r['T2M_MAX'] >= 30 for r in valid),
                'frost_days': sum(r['T2M_MIN'] < 0 for r in valid),
                'longest_dry_spell_days': longest, 'daily': days}
    return await cached(('power', lat, lon, start, end), fetch)


async def download_granule(client, url, token):
    # Do not forward Earthdata tokens to arbitrary redirects or log upstream bodies.
    for _ in range(5):
        parsed = urlparse(url)
        nasa_host = bool(parsed.hostname and parsed.hostname.endswith('.nasa.gov'))
        # NSIDC Earthdata Cloud redirects to its signed CloudFront distribution.
        signed_s3 = parsed.hostname in {
            'nsidc-cumulus-prod-protected.s3.us-west-2.amazonaws.com',
            'd3h5e2j7riftk6.cloudfront.net',
        }
        if parsed.scheme != 'https' or not (nasa_host or signed_s3):
            raise ValueError('Unsupported SMAP file URL; a NASA server or NSIDC store is required.')
        headers = {'Authorization': f'Bearer {token}'} if nasa_host else {}
        async with client.stream('GET', url, headers=headers) as response:
            if response.status_code in (301, 302, 303, 307, 308):
                url = urljoin(url, response.headers['location'])
                continue
            if response.status_code in (401, 403):
                raise ValueError('SMAP: check EARTHDATA_TOKEN and NSIDC data access authorization in Earthdata Login.')
            response.raise_for_status()
            chunks, size = [], 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > 64 * 1024 * 1024:
                    raise ValueError('SMAP file exceeds the 64 MB limit.')
                chunks.append(chunk)
            return b''.join(chunks)
    raise ValueError('Could not authenticate the SMAP download.')


def read_smap(raw, lat, lon):
    import h5py
    with h5py.File(io.BytesIO(raw), 'r') as file:
        for orbit in ('PM', 'AM'):
            group = file.get(f'Soil_Moisture_Retrieval_Data_{orbit}')
            if group is None:
                continue
            suffix = '_pm' if orbit == 'PM' else ''
            def dataset(name):
                return group[name + suffix] if name + suffix in group else group[name]
            lats, lons = dataset('latitude')[:], dataset('longitude')[:]
            valid = np.isfinite(lats) & np.isfinite(lons) & (np.abs(lats) <= 90) & (np.abs(lons) <= 180)
            delta_lon = (lons - lon + 180) % 360 - 180
            a = np.sin(np.radians(lats - lat) / 2) ** 2 + math.cos(math.radians(lat)) * np.cos(np.radians(lats)) * np.sin(np.radians(delta_lon) / 2) ** 2
            distance = 6371 * 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
            distance[~valid] = np.inf
            index = np.unravel_index(np.argmin(distance), distance.shape)
            if distance[index] > 40:
                continue
            moisture = float(dataset('soil_moisture')[index])
            quality = int(dataset('retrieval_qual_flag')[index])
            if not numeric(moisture, 0, 0.7) or quality not in (0, 8):
                continue
            return {'surface_moisture_m3_m3': round(moisture, 4), 'surface_moisture_percent': round(moisture * 100, 1),
                    'quality_flag': quality, 'orbit': orbit, 'pixel_latitude': float(lats[index]),
                    'pixel_longitude': float(lons[index]), 'distance_to_pixel_center_km': round(float(distance[index]), 1)}
    return None


async def smap(lat, lon, start, end):
    token = os.getenv('EARTHDATA_TOKEN', '')
    if not token:
        raise ValueError('SMAP wymaga EARTHDATA_TOKEN na backendzie (Earthdata Login / NSIDC).')
    async def fetch():
        async with httpx.AsyncClient(timeout=45, follow_redirects=False) as client:
            response = await client.get(CMR_URL, params={
                'short_name': 'SPL3SMP', 'version': '009', 'page_size': 3, 'sort_key': '-start_date',
                'temporal': f'{start}T00:00:00Z,{end}T23:59:59Z',
                'point': f'{lon},{lat}',
            })
            response.raise_for_status()
            for granule in response.json()['feed']['entry']:
                links = [link['href'] for link in granule.get('links', [])
                         if not link.get('inherited') and '/data#' in link.get('rel', '')
                         and urlparse(link.get('href', '')).path.lower().endswith('.h5')]
                if not links:
                    continue
                raw = await download_granule(client, links[0], token)
                result = await asyncio.to_thread(read_smap, raw, lat, lon)
                if result:
                    return {**result, 'source': 'NASA SMAP SPL3SMP v009', 'resolution_km': 36,
                            'depth_cm': '0–5', 'granule_id': granule['title'],
                            'observation_date': granule['time_start'][:10],
                            'source_url': 'https://nsidc.org/data/spl3smp/versions/9',
                            'sampling': 'Latest valid pixel from up to 3 recent granules in the period; not a field or period average.'}
        raise ValueError('No valid SMAP observation in the 3 most recent granules of the period (e.g. ice, water, or a gap in coverage).')
    return await cached(('smap', lat, lon, start, end), fetch)
