"""Independent map sources, partial failure, quality gates and field API regression."""
import io
import unittest
from datetime import date
from unittest.mock import AsyncMock, patch

import h5py
import httpx
import numpy as np

from terraengine.api import app
from terraengine.map_analysis import SourceResult, interpret
from terraengine.map_sources import read_smap, power, smap, download_granule, _cache

WEATHER = {
    'coverage_percent': 100, 'rain_mm': 2, 'valid_days': 14,
    'longest_dry_spell_days': 12, 'hot_days': 3, 'frost_days': 0, 'daily': [],
}
SATELLITE = {'stats': {'mean': 0.25, 'valid_percent': 95, 'min': 0.1, 'max': 0.7}}
MOISTURE = {'observation_date': '2024-06-14', 'surface_moisture_m3_m3': 0.12, 'surface_moisture_percent': 12}


class InterpretationTests(unittest.TestCase):
    def findings(self, weather=WEATHER, satellite=SATELLITE, moisture=MOISTURE):
        return interpret(*[SourceResult(status='ok' if value else 'unavailable', data=value)
                           for value in (weather, satellite, moisture)], date(2024, 6, 15))

    def test_combined_water_signal_uses_evidence_from_all_sources(self):
        findings, _ = self.findings()
        combined = next(x for x in findings if x.code == 'combined_water_stress')
        self.assertEqual(len(combined.evidence), 3)
        self.assertEqual(combined.severity, 'watch')

    def test_missing_weather_never_infers_water_stress(self):
        findings, _ = self.findings(weather=None)
        self.assertNotIn('combined_water_stress', [x.code for x in findings])

    def test_temporal_and_quality_gates(self):
        for weather, satellite, moisture in [
            (WEATHER | {'coverage_percent': 50}, SATELLITE, MOISTURE),
            (WEATHER, SATELLITE, MOISTURE | {'observation_date': '2024-06-01'}),
        ]:
            findings, warnings = self.findings(weather, satellite, moisture)
            self.assertNotIn('combined_water_stress', [x.code for x in findings])
            self.assertGreater(len(warnings), 3)
        findings, _ = self.findings(satellite={'stats': SATELLITE['stats'] | {'valid_percent': 40}})
        combined = next(x for x in findings if x.code == 'combined_water_stress')
        self.assertEqual(len(combined.evidence), 2)


class SmapTests(unittest.TestCase):
    def raster(self, quality=0, value=0.12):
        stream = io.BytesIO()
        with h5py.File(stream, 'w') as file:
            group = file.create_group('Soil_Moisture_Retrieval_Data_PM')
            for name, values in {'latitude_pm': [[52.28, 52.28]], 'longitude_pm': [[16.7, 17.3]],
                                 'soil_moisture_pm': [[value, 0.3]], 'retrieval_qual_flag_pm': [[quality, 0]]}.items():
                group.create_dataset(name, data=np.array(values))
        return stream.getvalue()

    def test_nearest_pixel_units_quality_and_no_replacement(self):
        result = read_smap(self.raster(8), 52.28, 16.7)
        self.assertEqual(result['surface_moisture_percent'], 12)
        self.assertEqual(result['quality_flag'], 8)
        self.assertIsNone(read_smap(self.raster(1), 52.28, 16.7))
        self.assertIsNone(read_smap(self.raster(value=-9999), 52.28, 16.7))
        self.assertIsNone(read_smap(self.raster(), 0, 0))


class MapApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.thermal_patch = patch('terraengine.map_analysis.ecostress', new=AsyncMock(side_effect=ValueError('Brak przelotu ISS')))
        self.thermal_patch.start()
        self.addCleanup(self.thermal_patch.stop)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')
        self.params = dict(latitude=52.28, longitude=16.7, start_date='2024-06-01', end_date='2024-06-15')

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_partial_failure_and_field_provider_isolation(self):
        with patch('terraengine.map_analysis.power', new=AsyncMock(return_value=WEATHER)), \
             patch('terraengine.map_analysis.sentinel_field', new=AsyncMock(side_effect=ValueError('Brak scen'))), \
             patch('terraengine.map_analysis.smap', new=AsyncMock(return_value=MOISTURE)), \
             patch('terraengine.api.get_profiles', new=AsyncMock()) as field_provider:
            response = await self.client.post('/api/map/analyze', json=self.params)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['sentinel']['status'], 'unavailable')
        self.assertEqual(result['power']['data']['rain_mm'], 2)
        field_provider.assert_not_called()

    async def test_no_sources_has_explicit_unavailable_status(self):
        with patch('terraengine.map_analysis.power', new=AsyncMock(side_effect=ValueError('Brak'))), \
             patch('terraengine.map_analysis.sentinel_field', new=AsyncMock(side_effect=TimeoutError())), \
             patch('terraengine.map_analysis.smap', new=AsyncMock(side_effect=RuntimeError('secret'))):
            response = await self.client.post('/api/map/analyze', json=self.params)
        self.assertEqual(response.json()['status'], 'unavailable')
        self.assertNotIn('secret', response.text)

    async def test_polygon_representative_point_and_invalid_aoi(self):
        params = {k: v for k, v in self.params.items() if k not in ('latitude', 'longitude')}
        params['geometry'] = {'type': 'Polygon', 'coordinates': [[[16.7,52.28],[16.701,52.28],[16.701,52.281],[16.7,52.28]]]}
        with patch('terraengine.map_analysis.power', new=AsyncMock(return_value=WEATHER)) as fetch, \
             patch('terraengine.map_analysis.sentinel_field', new=AsyncMock(side_effect=ValueError('Brak'))), \
             patch('terraengine.map_analysis.smap', new=AsyncMock(side_effect=ValueError('Brak'))):
            response = await self.client.post('/api/map/analyze', json=params)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertTrue(52.28 <= fetch.call_args.args[0] <= 52.281)
            fetch.reset_mock()
            params['geometry']['coordinates'] = [[[16,52],[17,52],[17,53],[16,52]]]
            response = await self.client.post('/api/map/analyze', json=params)
            self.assertEqual(response.status_code, 422)
            fetch.assert_not_called()

    async def test_invalid_dates_and_coordinates(self):
        for changes in ({'end_date': '2024-05-01'}, {'latitude': 99}, {'end_date': '2024-08-01'}):
            response = await self.client.post('/api/map/analyze', json=self.params | changes)
            self.assertEqual(response.status_code, 422)

    async def test_power_filters_fill_values_preserves_gaps_and_caches(self):
        _cache.clear()
        data = {key: {'20240601': value, '20240603': value} for key, value in
                {'T2M':20, 'T2M_MIN':10, 'T2M_MAX':31, 'PRECTOTCORR':0, 'RH2M':50, 'WS2M':2}.items()}
        data['PRECTOTCORR']['20240602'] = -999
        response = httpx.Response(200, json={'properties': {'parameter': data}}, request=httpx.Request('GET', 'https://test'))
        with patch('terraengine.map_sources.httpx.AsyncClient.get', new=AsyncMock(return_value=response)) as get:
            result = await power(52, 16, date(2024,6,1), date(2024,6,3))
            await power(52, 16, date(2024,6,1), date(2024,6,3))
        self.assertEqual(result['valid_days'], 2)
        self.assertEqual(result['longest_dry_spell_days'], 1)
        self.assertEqual(get.await_count, 1)


class SmapAccessTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_token_is_explicit(self):
        with patch.dict('os.environ', {'EARTHDATA_TOKEN': ''}):
            with self.assertRaisesRegex(ValueError, 'EARTHDATA_TOKEN'):
                await smap(52, 16, date(2024, 6, 1), date(2024, 6, 15))

    async def test_token_not_forwarded_to_signed_s3_and_external_redirect_blocked(self):
        requests = []
        def handler(request):
            requests.append(request)
            if request.url.host.endswith('.nasa.gov'):
                return httpx.Response(302, headers={'location': 'https://d3h5e2j7riftk6.cloudfront.net/data.h5?signature=test'})
            return httpx.Response(200, content=b'example hdf5')
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            raw = await download_granule(client, 'https://data.nsidc.earthdata.nasa.gov/file.h5', 'private-token')
            self.assertEqual(raw, b'example hdf5')
            self.assertEqual(requests[0].headers['Authorization'], 'Bearer private-token')
            self.assertNotIn('Authorization', requests[1].headers)
            with self.assertRaises(ValueError):
                await download_granule(client, 'https://attacker.example/file.h5', 'private-token')


class MapJobTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.thermal_patch = patch('terraengine.map_analysis.ecostress', new=AsyncMock(side_effect=ValueError('Brak przelotu ISS')))
        self.thermal_patch.start()
        self.addCleanup(self.thermal_patch.stop)
        import asyncio
        from terraengine.map_analysis import _jobs
        self.jobs = _jobs
        self.jobs.clear()
        self.gate = asyncio.Event()
        self.power_done = asyncio.Event()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')
        self.params = dict(latitude=52.28, longitude=16.7, start_date='2024-06-01', end_date='2024-06-15')

    async def asyncTearDown(self):
        import asyncio
        tasks = [job['task'] for job in self.jobs.values()]
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self.jobs.clear()
        await self.client.aclose()

    async def weather(self, *args):
        self.power_done.set()
        return WEATHER

    async def slow_smap(self, *args):
        await self.gate.wait()
        return MOISTURE

    async def test_start_returns_before_slow_source_and_exposes_partial_results(self):
        import asyncio
        with patch('terraengine.map_analysis.power', new=self.weather), \
             patch('terraengine.map_analysis.sentinel_field', new=AsyncMock(side_effect=ValueError('Brak scen'))), \
             patch('terraengine.map_analysis.smap', new=self.slow_smap):
            async with asyncio.timeout(2):
                response = await self.client.post('/api/map/jobs', json=self.params)
                self.assertEqual(response.status_code, 202)
                job_id = response.json()['id']
                await self.power_done.wait()
                await asyncio.sleep(0)
                snapshot = (await self.client.get(f'/api/map/jobs/{job_id}')).json()
                self.assertEqual(snapshot['status'], 'running')
                self.assertEqual(snapshot['result']['power']['data']['rain_mm'], 2)
                self.assertEqual(snapshot['result']['smap']['status'], 'pending')
                self.assertGreaterEqual(snapshot['completed_sources'], 1)
                self.gate.set()
                await self.jobs[job_id]['task']
                done = (await self.client.get(f'/api/map/jobs/{job_id}')).json()
                self.assertEqual(done['status'], 'completed')
                self.assertEqual(done['completed_sources'], 4)
                self.assertEqual(done['result']['status'], 'partial')

    async def test_cancellation_stops_download_and_releases_capacity(self):
        with patch('terraengine.map_analysis.power', new=self.slow_smap), \
             patch('terraengine.map_analysis.sentinel_field', new=self.slow_smap), \
             patch('terraengine.map_analysis.smap', new=self.slow_smap), \
             patch('terraengine.map_analysis.MAX_RUNNING', 1):
            response = await self.client.post('/api/map/jobs', json=self.params)
            job_id = response.json()['id']
            limit = await self.client.post('/api/map/jobs', json=self.params)
            self.assertEqual(limit.status_code, 429)
            cancelled = (await self.client.delete(f'/api/map/jobs/{job_id}')).json()
            self.assertEqual(cancelled['status'], 'cancelled')
            self.assertEqual(cancelled['completed_sources'], 4)
            self.assertTrue(self.jobs[job_id]['task'].done())
            another = await self.client.post('/api/map/jobs', json=self.params)
            self.assertEqual(another.status_code, 202)

    async def test_unknown_expired_and_invalid_jobs(self):
        from terraengine.map_analysis import JOB_TTL
        import time
        for method in (self.client.get, self.client.delete):
            self.assertEqual((await method('/api/map/jobs/missing')).status_code, 404)
        invalid = await self.client.post('/api/map/jobs', json=self.params | {'latitude': 100})
        self.assertEqual(invalid.status_code, 422)
        self.jobs['expired'] = {'status': 'completed', 'finished_at': time.monotonic() - JOB_TTL - 1}
        self.assertEqual((await self.client.get('/api/map/jobs/expired')).status_code, 404)
