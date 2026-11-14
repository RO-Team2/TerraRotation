import asyncio
import os
import unittest
from datetime import date
from unittest.mock import AsyncMock, patch

import httpx
import numpy as np
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from terraengine.api import app
from terraengine.ecostress import download, ecostress, granule_files, read_pixel
from terraengine.map_sources import _cache


def raster(value, dtype='float32', *, nodata=None, scale=None):
    with MemoryFile() as mem:
        with mem.open(driver='GTiff', width=1, height=1, count=1, dtype=dtype,
                      crs='EPSG:4326', transform=from_origin(16, 53, 1, 1), nodata=nodata) as dst:
            dst.write(np.array([[value]], dtype=dtype), 1)
            if scale is not None:
                dst.scales = [scale]
        return mem.read()


def rasters(**overrides):
    return {'lst': raster(300), 'qc': raster(0, 'uint16'), 'cloud': raster(0, 'uint8'),
            'water': raster(0, 'uint8')} | overrides


class EcostressPixelTests(unittest.TestCase):
    def test_kelvin_conversion_and_packed_scale(self):
        self.assertEqual(read_pixel(rasters(), 52.5, 16.5)['lst_c'], 26.85)
        for scale in (None, 0.02):
            result = read_pixel(rasters(lst=raster(15000, 'uint16', scale=scale)), 52.5, 16.5)
            self.assertEqual(result['lst_c'], 26.85)

    def test_cloud_water_bad_quality_nodata_and_outside_are_empty(self):
        for files in [rasters(cloud=raster(1, 'uint8')), rasters(water=raster(1, 'uint8')),
                      rasters(qc=raster(1, 'uint16')), rasters(lst=raster(0)),
                      rasters(lst=raster(-9999, nodata=-9999)), rasters(lst=raster(float('nan')))]:
            self.assertIsNone(read_pixel(files, 52.5, 16.5))
        self.assertIsNone(read_pixel(rasters(), 0, 0))

    def test_links_require_data_files_and_recognize_mask_names(self):
        granule = {'links': [{'href': f'https://data.lpdaac.earthdatacloud.nasa.gov/ECO_{band}.tif',
                             'rel': 'http://esipfed.org/ns/fedsearch/1.1/data#'}
                            for band in ('LST', 'QC', 'cloud', 'water_mask', 'LST_err')]}
        self.assertEqual(set(granule_files(granule)), {'lst', 'qc', 'cloud', 'water'})


class EcostressFetchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        _cache.clear()
        self.token_patch = patch.dict(os.environ, {'EARTHDATA_TOKEN': 'test-token'})
        self.token_patch.start()
        self.addCleanup(self.token_patch.stop)

    async def test_absent_iss_pass_returns_clear_empty_message(self):
        response = httpx.Response(200, json={'feed': {'entry': []}}, request=httpx.Request('GET', 'https://test'))
        with patch('terraengine.ecostress.httpx.AsyncClient.get', new=AsyncMock(return_value=response)):
            with self.assertRaisesRegex(ValueError, 'Brak danych ECOSTRESS'):
                await ecostress(52.5, 16.5, date(2024,6,1), date(2024,6,15))

    async def test_timeout_is_bounded_and_safe(self):
        async def slow(*args, **kwargs):
            await asyncio.Event().wait()
        with patch('terraengine.ecostress.httpx.AsyncClient.get', new=slow), \
             patch('terraengine.ecostress.TIMEOUT_SECONDS', 0.01):
            with self.assertRaisesRegex(ValueError, 'czas pobierania'):
                await ecostress(52.5, 16.5, date(2024,6,1), date(2024,6,15))

    async def test_bearer_only_sent_to_nasa_not_storage_redirect(self):
        requests = []
        def handler(request):
            requests.append(request)
            if request.url.host.endswith('.nasa.gov'):
                return httpx.Response(303, headers={'location': 'https://example.cloudfront.net/signed.tif?Signature=test'})
            return httpx.Response(200, content=b'tiff')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            self.assertEqual(await download(client, 'https://data.lpdaac.earthdatacloud.nasa.gov/data.tif', 'test-token'), b'tiff')
            self.assertEqual(requests[0].headers['Authorization'], 'Bearer test-token')
            self.assertNotIn('Authorization', requests[1].headers)
            with self.assertRaises(ValueError):
                await download(client, 'https://example.cloudfront.net/untrusted.tif', 'test-token')

    async def test_fourth_source_failure_does_not_break_other_results(self):
        from terraengine.map_analysis import _jobs
        _jobs.clear()
        # Minimal valid reports for the existing interpreter.
        weather = {'coverage_percent': 100, 'rain_mm': 10, 'valid_days': 14,
                   'longest_dry_spell_days': 0, 'hot_days': 0, 'frost_days': 0, 'daily': []}
        satellite = {'stats': {'mean': 0.6, 'valid_percent': 100, 'min': 0.5, 'max': 0.7}}
        moisture = {'observation_date': '2024-06-14', 'surface_moisture_m3_m3': 0.25, 'surface_moisture_percent': 25}
        gate = asyncio.Event()
        async def failing_thermal(*args):
            await gate.wait()
            raise httpx.ReadTimeout('private backend data')
        with patch('terraengine.map_analysis.power', new=AsyncMock(return_value=weather)), \
             patch('terraengine.map_analysis.sentinel_field', new=AsyncMock(return_value=satellite)), \
             patch('terraengine.map_analysis.smap', new=AsyncMock(return_value=moisture)), \
             patch('terraengine.map_analysis.ecostress', new=failing_thermal):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                response = await client.post('/api/map/jobs', json={'latitude':52.5, 'longitude':16.5, 'start_date':'2024-06-01','end_date':'2024-06-15'})
                self.assertEqual(response.status_code, 202)
                job_id = response.json()['id']
                try:
                    await asyncio.sleep(0)
                    pending = (await client.get(f'/api/map/jobs/{job_id}')).json()
                    self.assertEqual(pending['result']['ecostress']['status'], 'pending')
                    gate.set()
                    await _jobs[job_id]['task']
                    finished = (await client.get(f'/api/map/jobs/{job_id}')).json()
                    self.assertEqual(finished['status'], 'completed')
                    self.assertEqual(finished['completed_sources'], 4)
                    self.assertEqual(finished['result']['ecostress']['status'], 'unavailable')
                    self.assertEqual(finished['result']['power']['status'], 'ok')
                    self.assertEqual(finished['result']['sentinel']['status'], 'ok')
                    self.assertEqual(finished['result']['smap']['status'], 'ok')
                    self.assertNotIn('private backend data', str(finished))
                finally:
                    gate.set()
                    await _jobs[job_id]['task']
                    _jobs.clear()
