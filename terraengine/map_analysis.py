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
        'Ocena heurystyczna, bez znajomości uprawy, fazy rozwojowej i tekstury gleby; progi nie są skalibrowane lokalnie.',
        'POWER opisuje pogodę historyczną w siatce regionalnej. SMAP opisuje powierzchniowe 0–5 cm gleby w siatce 36 km; nie wilgotność strefy korzeniowej działki.',
        'NDVI jest kompozycją wybranego okresu, a nie szeregiem czasowym; sam niski NDVI nie dowodzi stresu ani niedoboru azotu.',
    ]
    def add(code, severity, title, evidence, action):
        findings.append(Finding(code=code, severity=severity, title=title, evidence=evidence, action=action))
    w, s, m = weather.data, satellite.data, moisture.data
    weather_ok = w is not None and w['coverage_percent'] >= 80
    ndvi_ok = s is not None and s['stats']['valid_percent'] >= 70
    moisture_ok = m is not None and 0 <= (end_date - date.fromisoformat(m['observation_date'])).days <= 7
    if w and not weather_ok:
        warnings.append('POWER: mniej niż 80% pełnych dni; suma opadów jest niepełna, pominięto wnioskowanie o bilansie wodnym.')
    if s and not ndvi_ok:
        warnings.append('Sentinel-2: mniej niż 70% ważnych pikseli; pominięto łączenie NDVI z oceną stresu.')
    if m and not moisture_ok:
        warnings.append('SMAP: pomiar starszy niż 7 dni względem końca okresu; pominięto łączenie z pogodą i NDVI.')
    if weather_ok:
        evidence = [f"Opady: {w['rain_mm']} mm / {w['valid_days']} pełnych dni", f"Najdłuższy ciąg dni <1 mm: {w['longest_dry_spell_days']}"]
        if w['longest_dry_spell_days'] >= 7:
            add('dry_spell', 'watch', 'Okres bez istotnych opadów', evidence,
                'Sprawdź wilgotność w strefie korzeniowej i objawy więdnięcia; nie ustalaj dawki nawodnienia wyłącznie z tych danych.')
        if w['hot_days']:
            add('heat', 'watch', 'Występowały dni gorące', [f"Tmax ≥30°C: {w['hot_days']} dni"],
                'Porównaj daty upałów z fazą rozwojową uprawy; sprawdź objawy stresu cieplnego.')
        if w['frost_days']:
            add('frost', 'watch', 'Występowały przymrozki w danych POWER', [f"Tmin <0°C: {w['frost_days']} dni"],
                'Sprawdź wrażliwe uprawy w terenie; temperatura przy gruncie może różnić się od temperatury na 2 m.')
        heavy = [r for r in w['daily'] if r['PRECTOTCORR'] is not None and r['PRECTOTCORR'] >= 25]
        if heavy:
            add('heavy_rain', 'watch', 'Epizody intensywnych opadów', [f"Dni z opadem ≥25 mm: {len(heavy)}"],
                'Skontroluj zastoiska i ślady spływu, szczególnie na stokach; brak danych o nachyleniu i infiltracji uniemożliwia obliczenie erozji.')
    if ndvi_ok:
        stats = s['stats']
        if stats['mean'] < 0.3:
            add('sparse_cover', 'info', 'Niska aktywność lub niewielkie pokrycie roślinnością',
                [f"Średni NDVI: {stats['mean']:.3f}", f"Ważne piksele: {stats['valid_percent']}%"],
                'Porównaj z terminem siewu, zbiorem i fazą uprawy. Gleba odsłonięta, woda lub spoczynek sezonowy mogą wyjaśniać wynik.')
        if stats['max'] - stats['min'] > 0.5:
            add('heterogeneity', 'info', 'Duża rozpiętość NDVI w obszarze',
                [f"NDVI min–max: {stats['min']:.3f}–{stats['max']:.3f}"],
                'Sprawdź granice pola i strefy odmiennej roślinności; zakres min–max jest wrażliwy na pojedyncze piksele.')
    if weather_ok and moisture_ok:
        dry = w['longest_dry_spell_days'] >= 7
        value = m['surface_moisture_m3_m3']
        evidence = [f"SMAP: {m['surface_moisture_percent']}% objętościowo ({m['observation_date']})",
                    f"POWER: maks. {w['longest_dry_spell_days']} kolejnych dni <1 mm"]
        if dry and value < 0.15:
            if ndvi_ok:
                evidence.append(f"NDVI: {s['stats']['mean']:.3f}")
            add('combined_water_stress', 'watch', 'Zbieżne sygnały możliwego niedoboru wody', evidence,
                'Nadaj priorytet lustracji i pomiarowi wilgotności w profilu glebowym. Niski NDVI, jeśli występuje, wymaga potwierdzenia aktywnej uprawy.')
        elif dry and value >= 0.3:
            add('mixed_water_signals', 'info', 'Rozbieżne sygnały pogody i wilgotności powierzchni', evidence,
                'Sprawdź datę przelotu, lokalne opady i nawadnianie; regionalny piksel SMAP może obejmować inne warunki niż pole.')
    if not findings:
        available_sources = (weather, satellite, moisture) + ((thermal,) if thermal is not None else ())
        add('limited_assessment', 'info', 'Brak jednoznacznego sygnału w dostępnych danych',
            [f"Dostępne źródła: {sum(x.status == 'ok' for x in available_sources)}/{len(available_sources)}"],
            'Brak alertu nie potwierdza dobrego stanu uprawy. Porównaj kolejne terminy i obserwacje terenowe.')
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
        return SourceResult(status='unavailable', message=f'{name}: przekroczono czas pobierania danych.')
    except Exception:
        return SourceResult(status='unavailable', message=f'{name}: źródło jest niedostępne lub zwróciło niepoprawne dane.')


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
                entry['sources'][key] = SourceResult(status='unavailable', message='Pobieranie anulowane.')
        raise
    except Exception:
        entry['status'] = 'failed'
        for key, value in entry['sources'].items():
            if value.status == 'pending':
                entry['sources'][key] = SourceResult(status='unavailable', message='Zadanie przerwane; ponów analizę.')
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
        raise HTTPException(429, 'Trwają już 4 analizy mapy. Poczekaj na wynik lub anuluj poprzednią.')
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
             'sources': {key: SourceResult(status='pending', message='Pobieranie danych…')
                         for key in ('power', 'sentinel', 'smap', 'ecostress')}}
    _jobs[job_id] = entry
    entry['task'] = asyncio.create_task(run_job(entry))
    return job_snapshot(entry)


def get_job(job_id):
    prune_jobs()
    if job_id not in _jobs:
        raise HTTPException(404, 'Zadanie wygasło lub backend został uruchomiony ponownie. Uruchom analizę ponownie.')
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
                    entry['sources'][key] = SourceResult(status='unavailable', message='Pobieranie anulowane.')
    return job_snapshot(entry)
