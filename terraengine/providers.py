import asyncio
import datetime as dt
import json
import math
import urllib.parse
import urllib.request
from .models import ClimateProfile, SoilLayer, SoilProfile
IGHPROJ = '+proj=igh +datum=WGS84 +units=m +no_defs'

def demo_profiles():
    return (SoilProfile(ph=6.3, soc_g_kg=55.6, clay_pct=8.6, sand_pct=73.7, silt_pct=17.7, source='demo: SoilGrids sample 52.28,16.70', warnings=['DEMO: fixed sample, not actual field data']), ClimateProfile(avg_temp_c=9.5, annual_rain_mm=600, annual_rain_days=None, source='demo: illustrative climate', warnings=['DEMO: synthetic climate, not NASA measurements']))

def _wcs_sync(lat, lon):
    try:
        from osgeo import gdal, osr
    except ImportError as exc:
        raise RuntimeError('Live SoilGrids requires Python GDAL bindings (osgeo)') from exc
    gdal.UseExceptions()
    src = osr.SpatialReference()
    src.ImportFromEPSG(4326)
    src.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    dst = osr.SpatialReference()
    dst.ImportFromProj4(IGHPROJ)
    x, y, _ = osr.CoordinateTransformation(src, dst).TransformPoint(lon, lat)
    result = {}
    warnings = []
    depths = ('0-5cm', '5-15cm', '15-30cm')
    for depth in depths:
        for prop in ('phh2o', 'soc', 'clay', 'sand', 'silt'):
            params = [('map', f'/map/{prop}.map'), ('SERVICE', 'WCS'), ('VERSION', '2.0.1'), ('REQUEST', 'GetCoverage'), ('COVERAGEID', f'{prop}_{depth}_mean'), ('SUBSET', f'x({x - 1000:.2f},{x + 1000:.2f})'), ('SUBSET', f'y({y - 1000:.2f},{y + 1000:.2f})'), ('FORMAT', 'image/tiff')]
            url = 'https://maps.isric.org/mapserv?' + urllib.parse.urlencode(params)
            try:
                with urllib.request.urlopen(url, timeout=20) as response:
                    data = response.read()
                if data[:4] not in (b'II*\x00', b'MM\x00*'):
                    raise ValueError('WCS returned non-TIFF')
                path = f'/vsimem/terrarotation_{prop}_{id(data)}.tif'
                gdal.FileFromMemBuffer(path, data)
                try:
                    ds = gdal.Open(path)
                    inv = gdal.InvGeoTransform(ds.GetGeoTransform())
                    px, py = gdal.ApplyGeoTransform(inv, x, y)
                    col, row = (math.floor(px), math.floor(py))
                    if not (0 <= col < ds.RasterXSize and 0 <= row < ds.RasterYSize):
                        raise ValueError('Coordinate outside returned raster')
                    band = ds.GetRasterBand(1)
                    raw = float(band.ReadAsArray(col, row, 1, 1)[0, 0])
                    nodata = band.GetNoDataValue()
                    result[depth, prop] = None if raw == 0 or (nodata is not None and raw == nodata) else raw/10
                    if result[depth, prop] is None:
                        warnings.append(f'{depth}/{prop}: zero or NoData; not interpreted as valid value')
                    band = None
                    ds = None
                finally:
                    gdal.Unlink(path)
            except Exception as exc:
                result[depth, prop] = None
                warnings.append(f'{depth}/{prop}: {type(exc).__name__}: {exc}')
    layers = [SoilLayer(depth=depth, ph=result.get((depth, 'phh2o')), soc_g_kg=result.get((depth, 'soc')), clay_pct=result.get((depth, 'clay')), sand_pct=result.get((depth, 'sand')), silt_pct=result.get((depth, 'silt')), warnings=[w for w in warnings if w.startswith(depth + '/')]) for depth in depths]
    surface = layers[0]
    return SoilProfile(ph=surface.ph, soc_g_kg=surface.soc_g_kg, clay_pct=surface.clay_pct, sand_pct=surface.sand_pct, silt_pct=surface.silt_pct, layers=layers, source='ISRIC SoilGrids WCS mean 0-30cm (3 layers)', warnings=warnings)

def _power_sync(lat, lon, climate_years=10):
    year = dt.date.today().year-1
    start = year-climate_years+1
    params = {'parameters': 'T2M,T2M_MIN,PRECTOTCORR', 'community': 'AG', 'longitude': lon, 'latitude': lat, 'start': f'{start}0101', 'end': f'{year}1231', 'format': 'JSON'}
    url = 'https://power.larc.nasa.gov/api/temporal/daily/point?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=90) as response:
        payload = json.load(response)
    data = payload['properties']['parameter']
    by_year = []
    for yr in range(start, year + 1):
        keys = sorted((k for k in data['T2M'] if k.startswith(str(yr))))
        valid = []
        for key in keys:
            t = data['T2M'].get(key)
            rain = data['PRECTOTCORR'].get(key)
            tmin = data['T2M_MIN'].get(key)
            if all((isinstance(v, (int, float)) and math.isfinite(v) and (v > -900) for v in (t, rain, tmin))) and rain >= 0:
                valid.append((t, rain, tmin))
        expected = 366 if yr%4 == 0 and (yr%100 != 0 or yr%400 == 0) else 365
        if len(valid) < expected - 5:
            continue
        rain_total = sum((v[1] for v in valid))
        dry_run = longest = 0
        for _, rain, _ in valid:
            dry_run = dry_run + 1 if rain < 1 else 0
            longest = max(longest, dry_run)
        by_year.append((sum((v[0] for v in valid))/len(valid), rain_total, sum((v[1] >= 1 for v in valid)), longest, sum((v[2] < 0 for v in valid)), len(valid)))
    if len(by_year) < max(3, math.ceil(climate_years*0.7)):
        raise ValueError(f'Insufficient complete NASA POWER years: {len(by_year)}/{climate_years}')
    rain_totals = [v[1] for v in by_year]
    rain_mean = sum(rain_totals)/len(rain_totals)
    rain_std = (sum(((r-rain_mean) ** 2 for r in rain_totals))/len(rain_totals))**0.5

    def annual_mean(index):
        return sum((year_data[index] for year_data in by_year))/len(by_year)
    return ClimateProfile(avg_temp_c=annual_mean(0), annual_rain_mm=rain_mean, annual_rain_days=round(annual_mean(2)), observation_days=sum((v[5] for v in by_year)), climate_years=len(by_year), annual_rain_std_mm=rain_std, dry_spell_max_days=max((v[3] for v in by_year)), frost_days_mean=annual_mean(4), source=f'NASA POWER daily {start}-{year}', warnings=[f'Only {len(by_year)} of {climate_years} years passed completeness checks'] if len(by_year) < climate_years else [])

async def get_profiles(lat, lon, mode, climate_years=10):
    if mode == 'demo':
        return demo_profiles()

    try:
        soli_result, climate_result = await asyncio.gather(
            asyncio.to_thread(_wcs_sync, lat, lon),
            asyncio.to_thread(_power_sync, lat, lon, climate_years),
            return_execptions=True,
        )
    except Exception:
        return demo_profiles()

    warnings = []
    if isinstance(soil_result, Exception):
        warnings.append(f'SoilGrids unavailable: {soil_result}')
        soil_result = SoilProfile(source='unavailable', warnings=warnings[:])
    if isinstance(climate_result, Execption):
        climate_result = ClimateProfile(source='unavailable', warnings=[f'NASA POWER unavailable: {climate_result}'])

    return (soil_result, climate_result)
