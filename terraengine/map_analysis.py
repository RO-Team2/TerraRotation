"""Independent map orchestration and explicitly heuristic agronomic interpretation."""
import asyncio
import secrets
import time
from datetime import date

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from shapely.geometry import shape

from .imagery import SentinelFieldRequest, SentinelFieldResponse, field_grid, sentinel_field
from .map_sources import power, smap
from .ecostress import ecostress

router = APIRouter(prefix='/api/map', tags=['Map analysis'])


class SourceResult(BaseModel):
    status: str
    data: dict | None = None
    message: str | None = None


class Finding(BaseModel):
    code: str
    severity: str
    title: str
    evidence: list[str]
    action: str


class MapResponse(BaseModel):
    status: str
    latitude: float
    longitude: float
    start_date: date
    end_date: date
    power: SourceResult
    sentinel: SourceResult
    smap: SourceResult
    ecostress: SourceResult
    findings: list[Finding]
    warnings: list[str]


def interpret(weather, satellite, moisture, end_date, thermal=None):
    findings = []
    warnings = [
        'Heuristic assessment without crop, growth stage, or soil texture context; thresholds are not locally calibrated.',
        'POWER describes historical weather on a regional grid. SMAP describes the top 0–5 cm of soil on a 36 km grid, not field root-zone moisture.',
        'NDVI is a composite of the selected period, not a time series; low NDVI alone does not demonstrate stress or nitrogen deficiency.',
    ]
    def add(code, severity, title, evidence, action):
        findings.append(Finding(code=code, severity=severity, title=title, evidence=evidence, action=action))
    w, s, m = weather.data, satellite.data, moisture.data
    weather_ok = w is not None and w['coverage_percent'] >= 80
    ndvi_ok = s is not None and s['stats']['valid_percent'] >= 70
    moisture_ok = m is not None and 0 <= (end_date - date.fromisoformat(m['observation_date'])).days <= 7
    if w and not weather_ok:
        warnings.append('POWER: fewer than 80% complete days; precipitation totals are incomplete, so water balance inference was skipped.')
    if s and not ndvi_ok:
        warnings.append('Sentinel-2: fewer than 70% valid pixels; NDVI was excluded from stress assessment.')
    if m and not moisture_ok:
        warnings.append('SMAP: observation more than 7 days before the period end; excluded from combined weather and NDVI assessment.')
    if weather_ok:
        evidence = [f"Precipitation: {w['rain_mm']} mm / {w['valid_days']} complete days", f"Longest run of days <1 mm: {w['longest_dry_spell_days']}"]
        if w['longest_dry_spell_days'] >= 7:
            add('dry_spell', 'watch', 'Period without significant precipitation', evidence,
                'Check root-zone moisture and signs of wilting; do not determine irrigation rates from these data alone.')
        if w['hot_days']:
            add('heat', 'watch', 'Hot days recorded', [f"Tmax ≥30°C: {w['hot_days']} days"],
                'Compare heat event dates with the crop growth stage; check for heat stress symptoms.')
        if w['frost_days']:
            add('frost', 'watch', 'Frost recorded in POWER data', [f"Tmin <0°C: {w['frost_days']} days"],
                'Inspect sensitive crops in the field; ground-level temperatures may differ from temperatures at 2 m.')
        heavy = [r for r in w['daily'] if r['PRECTOTCORR'] is not None and r['PRECTOTCORR'] >= 25]
        if heavy:
            add('heavy_rain', 'watch', 'Heavy rainfall events', [f"Days with precipitation ≥25 mm: {len(heavy)}"],
                'Check for ponding and runoff, especially on slopes; erosion cannot be calculated without slope and infiltration data.')
    if ndvi_ok:
        stats = s['stats']
        if stats['mean'] < 0.3:
            add('sparse_cover', 'info', 'Low vegetation activity or sparse cover',
                [f"Mean NDVI: {stats['mean']:.3f}", f"Valid pixels: {stats['valid_percent']}%"],
                'Compare with sowing and harvest dates and crop stage. Bare soil, water, or seasonal dormancy may explain the result.')
        if stats['max'] - stats['min'] > 0.5:
            add('heterogeneity', 'info', 'Wide NDVI range within the area',
                [f"NDVI min–max: {stats['min']:.3f}–{stats['max']:.3f}"],
                'Check field boundaries and zones with different vegetation; the min–max range is sensitive to individual pixels.')
    if weather_ok and moisture_ok:
        dry = w['longest_dry_spell_days'] >= 7
        value = m['surface_moisture_m3_m3']
        evidence = [f"SMAP: {m['surface_moisture_percent']}% by volume ({m['observation_date']})",
                    f"POWER: maks. {w['longest_dry_spell_days']} kolejnych days <1 mm"]
        if dry and value < 0.15:
            if ndvi_ok:
                evidence.append(f"NDVI: {s['stats']['mean']:.3f}")
            add('combined_water_stress', 'watch', 'Converging signs of possible water shortage', evidence,
                'Prioritize field inspection and soil profile moisture measurements. If NDVI is low, confirm that an active crop is present.')
        elif dry and value >= 0.3:
            add('mixed_water_signals', 'info', 'Conflicting weather and surface moisture signals', evidence,
                'Check the satellite pass date, local precipitation, and irrigation; the regional SMAP pixel may represent conditions different from the field.')
    if not findings:
        available_sources = (weather, satellite, moisture) + ((thermal,) if thermal is not None else ())
        add('limited_assessment', 'info', 'No clear signal in the available data',
            [f"Available sources: {sum(x.status == 'ok' for x in available_sources)}/{len(available_sources)}"],
            'The absence of an alert does not confirm good crop condition. Compare subsequent dates and field observations.')
    return findings, warnings


async def collect(name, operation):
    try:
        async with asyncio.timeout(100):
            result = await operation
        data = result.model_dump(mode='json') if isinstance(result, SentinelFieldResponse) else result
        return SourceResult(status='ok', data=data)
    except HTTPException as exc:
        return SourceResult(status='unavailable', message=str(exc.detail))
    except ValueError as exc:
        return SourceResult(status='unavailable', message=str(exc))
    except (TimeoutError, httpx.TimeoutException):
        return SourceResult(status='unavailable', message=f'{name}: data retrieval timed out.')
    except Exception:
        return SourceResult(status='unavailable', message=f'{name}: source is unavailable or returned invalid data.')


@router.post('/analyze', response_model=MapResponse)
async def analyze_map(req: SentinelFieldRequest):
    field_grid(req)  # Validate AOI size before any network requests.
    if req.geometry:
        center = shape(req.geometry.model_dump()).representative_point()
        lat, lon = center.y, center.x
    else:
        lat, lon = req.latitude, req.longitude
    weather, satellite, moisture, thermal = await asyncio.gather(
        collect('NASA POWER', power(lat, lon, req.start_date, req.end_date)),
        collect('Sentinel-2', sentinel_field(req)),
        collect('NASA SMAP', smap(lat, lon, req.start_date, req.end_date)),
        collect('NASA ECOSTRESS', ecostress(lat, lon, req.start_date, req.end_date)),
    )
    findings, warnings = interpret(weather, satellite, moisture, req.end_date, thermal)
    return MapResponse(status='ok' if all(x.status == 'ok' for x in (weather, satellite, moisture, thermal)) else
                       'partial' if any(x.status == 'ok' for x in (weather, satellite, moisture, thermal)) else 'unavailable',
                       latitude=lat, longitude=lon, start_date=req.start_date, end_date=req.end_date,
                       power=weather, sentinel=satellite, smap=moisture, ecostress=thermal, findings=findings, warnings=warnings)

# Jobs are deliberately isolated from field analysis and retained in this process only.
MAX_JOBS = 32
MAX_RUNNING = 4
JOB_TTL = 900
_jobs = {}


class MapJob(BaseModel):
    id: str
    status: str
    completed_sources: int
    result: MapResponse


def job_snapshot(entry):
    sources = entry['sources']
    completed = sum(source.status != 'pending' for source in sources.values())
    findings, warnings = interpret(sources['power'], sources['sentinel'], sources['smap'], entry['request'].end_date, sources['ecostress'])
    running = entry['status'] == 'running'
    if running:
        findings = [finding for finding in findings if finding.code != 'limited_assessment']
    result_status = ('running' if running else 'ok' if all(x.status == 'ok' for x in sources.values()) else
                     'partial' if any(x.status == 'ok' for x in sources.values()) else 'unavailable')
    return MapJob(id=entry['id'], status=entry['status'], completed_sources=completed,
                  result=MapResponse(status=result_status, latitude=entry['lat'], longitude=entry['lon'],
                                     start_date=entry['request'].start_date, end_date=entry['request'].end_date,
                                     **sources, findings=findings, warnings=warnings))


async def run_job(entry):
    req, lat, lon = entry['request'], entry['lat'], entry['lon']
    async def source(key, label, operation):
        entry['sources'][key] = await collect(label, operation)
    try:
        await asyncio.gather(
            source('power', 'NASA POWER', power(lat, lon, req.start_date, req.end_date)),
            source('sentinel', 'Sentinel-2', sentinel_field(req)),
            source('smap', 'NASA SMAP', smap(lat, lon, req.start_date, req.end_date)),
            source('ecostress', 'NASA ECOSTRESS', ecostress(lat, lon, req.start_date, req.end_date)),
        )
        entry['status'] = 'completed'
    except asyncio.CancelledError:
        entry['status'] = 'cancelled'
        for key, value in entry['sources'].items():
            if value.status == 'pending':
                entry['sources'][key] = SourceResult(status='unavailable', message='Retrieval cancelled.')
        raise
    except Exception:
        entry['status'] = 'failed'
        for key, value in entry['sources'].items():
            if value.status == 'pending':
                entry['sources'][key] = SourceResult(status='unavailable', message='Job interrupted; retry the analysis.')
    finally:
        entry['finished_at'] = time.monotonic()


def prune_jobs():
    now = time.monotonic()
    for key, entry in list(_jobs.items()):
        if entry['status'] != 'running' and now - entry.get('finished_at', now) > JOB_TTL:
            del _jobs[key]


@router.post('/jobs', response_model=MapJob, status_code=202)
async def start_map_job(req: SentinelFieldRequest):
    field_grid(req)
    prune_jobs()
    if sum(entry['status'] == 'running' for entry in _jobs.values()) >= MAX_RUNNING:
        raise HTTPException(429, '4 map analyses are already running. Wait for a result or cancel a previous analysis.')
    if len(_jobs) >= MAX_JOBS:
        oldest = min((entry for entry in _jobs.values() if entry['status'] != 'running'),
                     key=lambda entry: entry.get('finished_at', 0))
        del _jobs[oldest['id']]
    if req.geometry:
        center = shape(req.geometry.model_dump()).representative_point()
        lat, lon = center.y, center.x
    else:
        lat, lon = req.latitude, req.longitude
    job_id = secrets.token_urlsafe(24)
    entry = {'id': job_id, 'status': 'running', 'request': req, 'lat': lat, 'lon': lon,
             'sources': {key: SourceResult(status='pending', message='Fetching data…')
                         for key in ('power', 'sentinel', 'smap', 'ecostress')}}
    _jobs[job_id] = entry
    entry['task'] = asyncio.create_task(run_job(entry))
    return job_snapshot(entry)


def get_job(job_id):
    prune_jobs()
    if job_id not in _jobs:
        raise HTTPException(404, 'The job expired or the backend restarted. Run the analysis again.')
    return _jobs[job_id]


@router.get('/jobs/{job_id}', response_model=MapJob)
async def map_job_status(job_id: str):
    return job_snapshot(get_job(job_id))


@router.delete('/jobs/{job_id}', response_model=MapJob)
async def cancel_map_job(job_id: str):
    entry = get_job(job_id)
    if entry['status'] == 'running':
        entry['task'].cancel()
        try:
            await entry['task']
        except asyncio.CancelledError:
            pass
        # Cancellation before the coroutine's first instruction also needs a terminal state.
        if entry['status'] == 'running':
            entry['status'] = 'cancelled'
            entry['finished_at'] = time.monotonic()
            for key, source in entry['sources'].items():
                if source.status == 'pending':
                    entry['sources'][key] = SourceResult(status='unavailable', message='Retrieval cancelled.')
    return job_snapshot(entry)
