import { useEffect, useRef, useState, type FormEvent } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import PdfExportButton from './PdfExportButton';
import type { SatelliteRequest, MapAnalysisResponse } from './types';

const isoDay = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
type Point = [number, number];

export default function MapView({ active, onSelect }: { active: boolean; onSelect: (lat: number, lon: number) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const selection = useRef<L.LayerGroup | null>(null);
  const modeRef = useRef<'point' | 'polygon'>('point');
  const drawing = useRef(false);
  const busy = useRef(false);
  const [mode, setMode] = useState<'point' | 'polygon'>('point');
  const [isDrawing, setIsDrawing] = useState(false);
  const [vertices, setVertices] = useState<Point[]>([]);
  const [latitude, setLatitude] = useState('52.28');
  const [longitude, setLongitude] = useState('16.70');
  const [radius, setRadius] = useState(500);
  const [startDate, setStartDate] = useState(() => isoDay(14));
  const [endDate, setEndDate] = useState(() => isoDay(1));
  const [clouds, setClouds] = useState(30);
  const [includeGeotiff, setIncludeGeotiff] = useState(false);
  const [result, setResult] = useState<MapAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);
  const jobIdRef = useRef<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [selectionTouched, setSelectionTouched] = useState(false);
  const satellite = result?.sentinel.data;
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current).setView([52.28, 16.70], 16);
    L.control.scale({ imperial: false }).addTo(instance);
    // Keep labels below selection paths; sharing overlayPane can cover SVG paths with tiles.
    instance.createPane('basemapLabels').style.zIndex = '350';
    instance.getPane('basemapLabels')!.style.pointerEvents = 'none';
    instance.createPane('fieldSelection').style.zIndex = '450';
    instance.getPane('fieldSelection')!.style.pointerEvents = 'none';
    const imagery = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri — Source: Esri, Vantor, Earthstar Geographics, GIS User Community',
    });
    const labels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Labels &copy; Esri', pane: 'basemapLabels',
    });
    const hybrid = L.layerGroup([imagery, labels]).addTo(instance);
    const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    let tileFailures = 0;
    imagery.on('loading', () => { tileFailures = 0; setTileError(false); });
    imagery.on('tileerror', () => { tileFailures += 1; setTileError(true); });
    imagery.on('load', () => setTileError(tileFailures > 0));
    L.control.layers({ 'Terrain imagery · Esri': hybrid, 'Road map · OSM': streets }).addTo(instance);
    selection.current = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => {
      const lat = event.latlng.lat, lon = L.Util.wrapNum(event.latlng.lng, [-180, 180]);
      if (lat < -79 || lat > 83 || Math.abs(lon) > 179.9) return;
      setSelectionTouched(true);
      if (modeRef.current === 'polygon') {
        if (drawing.current) setVertices(points => points.length < 100 ? [...points, [lat, lon]] : points);
      } else {
        setLatitude(lat.toFixed(6)); setLongitude(lon.toFixed(6));
      }
    });
    map.current = instance;
    return () => { instance.remove(); map.current = null; selection.current = null; };
  }, []);

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => map.current?.invalidateSize());
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    const group = selection.current;
    if (!group) return;
    group.clearLayers();
    if (mode === 'polygon') {
      if (vertices.length >= 3 && !isDrawing) L.polygon(vertices, { pane: 'fieldSelection', interactive: false, color: '#e5b94c', weight: 3, fillOpacity: 0.15 }).addTo(group);
      else if (vertices.length > 1) L.polyline(vertices, { pane: 'fieldSelection', interactive: false, color: '#e5b94c', weight: 3 }).addTo(group);
      vertices.forEach(point => L.circleMarker(point, { pane: 'fieldSelection', interactive: false, radius: 5, weight: 2, color: '#fff', fillColor: '#e5b94c', fillOpacity: 1 }).addTo(group));
    } else {
      const lat = Number(latitude), lon = Number(longitude);
      if (!latitude || !longitude || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -79 || lat > 83 || Math.abs(lon) > 179.9) return;
      L.circleMarker([lat, lon], { pane: 'fieldSelection', interactive: false, radius: 7, color: '#fff', fillColor: '#e98440', fillOpacity: 1 }).addTo(group);
      const center = L.CRS.EPSG3857.project(L.latLng(lat, lon));
      // Geodesic approximation for the selection hint; backend returns the exact UTM AOI.
      const d = radius / Math.cos(lat * Math.PI / 180);
      const sw = L.CRS.EPSG3857.unproject(L.point(center.x - d, center.y - d));
      const ne = L.CRS.EPSG3857.unproject(L.point(center.x + d, center.y + d));
      L.rectangle(L.latLngBounds(sw, ne), { pane: 'fieldSelection', interactive: false, color: '#e5b94c', weight: 2, fillOpacity: 0.05 }).addTo(group);
    }
  }, [mode, vertices, isDrawing, latitude, longitude, radius]);

  useEffect(() => { void cancelAnalysis(false); setResult(null); setError(''); }, [mode, vertices, isDrawing, latitude, longitude, radius, startDate, endDate, clouds, includeGeotiff]);

  useEffect(() => {
    if (!satellite || !map.current) return;
    const outline = L.geoJSON(satellite.geometry, {
      pane: 'fieldSelection',
      style: { color: '#63c8ff', weight: 3, dashArray: '7 5', fillOpacity: 0, interactive: false },
    }).addTo(map.current);
    return () => { outline.remove(); };
  }, [satellite]);

  function chooseMode(next: 'point' | 'polygon') {
    modeRef.current = next; setMode(next);
    drawing.current = next === 'polygon'; setIsDrawing(next === 'polygon');
    setVertices([]);
  }

  function finishPolygon() {
    if (vertices.length < 3) return;
    drawing.current = false; setIsDrawing(false);
  }

  async function analyze(event?: FormEvent) {
    event?.preventDefault();
    if (busy.current) return;
    setError('');
    if (startDate > endDate || (Date.parse(endDate) - Date.parse(startDate)) / 86400000 > 30) {
      setError('Choose a valid date range of up to 31 days.'); return;
    }
    const common = { start_date: startDate, end_date: endDate, max_cloud_coverage: clouds, include_geotiff: includeGeotiff };
    let request: SatelliteRequest;
    if (mode === 'polygon') {
      if (isDrawing || vertices.length < 3) { setError('Mark at least 3 vertices and finish the outline.'); return; }
      const ring = vertices.map(([lat, lon]) => [lon, lat] as Point);
      request = { ...common, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } };
    } else request = { ...common, latitude: Number(latitude), longitude: Number(longitude), radius_m: radius };
    busy.current = true; setLoading(true); setResult(null);
    const version = ++requestVersion.current;
    try {
      const job = await window.terraApi.mapJobStart(request);
      if (requestVersion.current !== version) {
        void window.terraApi.mapJobCancel(job.id).catch(() => {});
        return;
      }
      jobIdRef.current = job.id; setJobId(job.id); setResult(job.result);
    }
    catch (reason) {
      if (requestVersion.current === version) {
        setError(reason instanceof Error ? reason.message : 'Could not start analysis.');
        busy.current = false; setLoading(false);
      }
    }
  }

  async function cancelAnalysis(keepResult = true) {
    const version = ++requestVersion.current;
    const id = jobIdRef.current;
    jobIdRef.current = null; setJobId(null); busy.current = false; setLoading(false);
    if (id) {
      try {
        const job = await window.terraApi.mapJobCancel(id);
        if (keepResult && requestVersion.current === version) setResult(job.result);
      } catch (reason) {
        if (keepResult && requestVersion.current === version) setError(reason instanceof Error ? reason.message : 'Could not cancel the job.');
      }
    }
  }

  useEffect(() => {
    if (!jobId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const job = await window.terraApi.mapJobStatus(jobId);
        if (disposed) return;
        failures = 0; setError(''); setResult(job.result);
        if (job.status !== 'running') {
          jobIdRef.current = null; setJobId(null); busy.current = false; setLoading(false);
          return;
        }
      } catch (reason) {
        if (disposed) return;
        failures += 1;
        if (failures >= 3) {
          setError(reason instanceof Error ? reason.message : 'Lost connection to the job.');
          void cancelAnalysis(false);
          return;
        }
      }
      timer = setTimeout(() => void poll(), failures ? 2500 : 1000);
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [jobId]);

  useEffect(() => () => {
    requestVersion.current += 1;
    const id = jobIdRef.current;
    if (id) void window.terraApi.mapJobCancel(id).catch(() => {});
  }, []);

  const validPoint = latitude !== '' && longitude !== '' && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && Number(latitude) >= -79 && Number(latitude) <= 83 && Math.abs(Number(longitude)) <= 179.9;
  const ready = mode === 'point' ? validPoint : !isDrawing && vertices.length >= 3;
  useEffect(() => {
    if (!active || !selectionTouched || !ready) return;
    const timer = window.setTimeout(() => { void analyze(); }, 700);
    return () => window.clearTimeout(timer);
  }, [active, selectionTouched, mode, latitude, longitude, radius, vertices, isDrawing, startDate, endDate, clouds, includeGeotiff]);

  const useLocation = () => {
    if (mode === 'point') onSelect(Number(latitude), Number(longitude));
    else if (vertices.length) {
      const center = L.latLngBounds(vertices).getCenter(); onSelect(center.lat, center.lng);
    }
  };

  return <>
    <section className="intro"><div><h2>Select a field. Connect weather, vegetation, and water.</h2><p>Use the imagery to select a field. Click a point or finish an outline to start a POWER, Sentinel-2, SMAP, and ECOSTRESS report.</p></div><div className="intro-icon">◎</div></section>
    <div className="workspace sentinel-workspace">
      <section className="panel form-panel">
        <div className="panel-heading"><div className="step-number">01</div><div><h3>Select field</h3><p>Point or field outline</p></div></div>
        <form onSubmit={analyze}>
          <fieldset className="field-selection">
            <div className="map-view-switch" role="group" aria-label="Area selection">
              <button type="button" aria-pressed={mode === 'point'} onClick={() => chooseMode('point')}>Point and surroundings</button>
              <button type="button" aria-pressed={mode === 'polygon'} onClick={() => chooseMode('polygon')}>Outline field</button>
            </div>
            {mode === 'point' ? <>
              <div className="coordinate-grid">
                <label>Latitude<input required type="number" step="any" min="-79" max="83" value={latitude} onChange={e => setLatitude(e.target.value)} /></label>
                <label>Longitude<input required type="number" step="any" min="-179.9" max="179.9" value={longitude} onChange={e => setLongitude(e.target.value)} /></label>
              </div>
              <button type="button" className="text-button" disabled={!validPoint} onClick={() => map.current?.setView([Number(latitude), Number(longitude)], 17)}>Show point on map</button>
              <label className="control-label">Analysis extent<select value={radius} onChange={e => setRadius(Number(e.target.value))}>{[100, 250, 500, 1000, 2500].map(value => <option key={value} value={value}>{2 * value} × {2 * value} m around the point</option>)}</select></label>
            </> : <>
              <p className="map-caption">Click the field corners on the imagery. Maximum 100 vertices and a span of 5 km.</p>
              <p role="status">{vertices.length} vertices · {isDrawing ? (vertices.length >= 3 ? 'Click “Finish outline” to start analysis.' : 'Add at least 3 corners, then finish the outline.') : 'outline ready'}</p>
              <div className="map-downloads">
                <button type="button" className="text-button" disabled={!isDrawing || vertices.length < 3} onClick={finishPolygon}>Finish outline</button>
                <button type="button" className="text-button" disabled={!isDrawing || !vertices.length} onClick={() => setVertices(points => points.slice(0, -1))}>Undo point</button>
                <button type="button" className="text-button" onClick={() => chooseMode('polygon')}>Redraw</button>
              </div>
            </>}
            <div className="coordinate-grid">
              <label className="control-label">Start date<input className="map-input" required type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} /></label>
              <label className="control-label">End date<input className="map-input" required type="date" value={endDate} min={startDate} max={isoDay(0)} onChange={e => setEndDate(e.target.value)} /></label>
            </div>
            <label className="control-label">Maximum scene cloud coverage<select value={clouds} onChange={e => setClouds(Number(e.target.value))}>{[10, 30, 50, 80, 100].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
            <label className="geotiff-option"><input type="checkbox" checked={includeGeotiff} onChange={e => setIncludeGeotiff(e.target.checked)} /> Include downloadable NDVI raster</label>
            {mode === 'polygon' && isDrawing ? <button type="button" className="primary-button" disabled={vertices.length < 3} onClick={finishPolygon}>
              {vertices.length < 3 ? `Mark field corners (${vertices.length}/3)` : 'Finish outline and analyze'}
            </button> : <button type="submit" className="primary-button" disabled={loading || !ready}>{loading ? 'Analysis running in background…' : 'Analyze · POWER + NDVI + SMAP + LST'}</button>}
            {loading && <div className="map-source-progress" role="status" aria-live="polite">
              <strong>{jobId ? 'Analyzing outline or point' : 'Starting job…'}</strong>
              <ul>{(['power', 'sentinel', 'smap', 'ecostress'] as const).map(source => {
                const status = result?.[source]?.status ?? 'pending';
                const label = { power: 'NASA POWER', sentinel: 'Sentinel-2 NDVI', smap: 'NASA SMAP', ecostress: 'NASA ECOSTRESS' }[source];
                return <li key={source} data-status={status}><span>{label}</span><b>{status === 'ok' ? 'Ready' : status === 'unavailable' ? 'No data' : 'Fetching…'}</b></li>;
              })}</ul>
              <p>SMAP downloads a satellite file and may take about 100 seconds. Completed results are already available in the report below the map.</p>
              <button type="button" className="text-button" onClick={() => void cancelAnalysis()}>Cancel analysis</button>
            </div>}
          </fieldset>
        </form>
        <button className="text-button" disabled={!ready || loading} onClick={useLocation}>Use location for crop rotation analysis →</button>
        {error && <div className="alert error" role="alert">{error}</div>}
      </section>
      <section className="results-column" aria-busy={loading} data-pdf-report="map" data-pdf-ready={!!result && !loading && result.status !== 'running'}>
        <article className="panel map-panel">
          <div className="result-heading"><h2>Terrain imagery</h2><span className="result-status success">Visual basemap</span></div>
          <div ref={container} className="leaflet-field-map" aria-label="Terrain imagery. Click a point or outline field boundaries." />
          <p className="map-caption">Use the Esri basemap to locate your field. Its dates and detail are independent of Sentinel-2 analysis. A road map is also available in the layer selector in the top right.</p>
          {tileError && <div className="alert warning" role="status">Some imagery could not be loaded. Check your connection or select the road map in the layer selector.</div>}
        </article>
        {loading && <div className="panel analysis-progress" role="status">Analysis running in background · completed sources: {result ? [result.power, result.sentinel, result.smap, result.ecostress].filter(source => source && source.status !== 'pending').length : 0}/4. Results appear as they arrive. You can select another field or cancel retrieval.</div>}
        {result && <article className="panel analysis-results map-integrated-report">
          <PdfExportButton view="map" disabled={loading || result.status === 'running'} />
          <header className="pdf-only pdf-report-header"><span>TerraRotation · Map</span><h1>Satellite and agronomic report</h1>
            <p>Period: {result.start_date} – {result.end_date} · Point: {result.latitude.toFixed(5)}, {result.longitude.toFixed(5)}</p><p data-pdf-export-time />
          </header>
          <div className="result-heading"><h2>Agronomic report</h2><span className="result-status">{result.status === 'running' ? 'Analysis in progress' : result.status === 'ok' ? '4 sources available' : result.status === 'partial' ? 'Partial data' : 'No data'}</span></div>
          <p className="map-caption">{result.start_date} – {result.end_date} · reference point: {result.latitude.toFixed(5)}, {result.longitude.toFixed(5)}. POWER and SMAP sample a point inside the outline; NDVI covers the entire area.</p>
          <div className="map-source-grid">
            <section className="map-source-card"><h3>NASA POWER · weather</h3>{result.power.data ? <>
              <strong>{result.power.data.mean_temp_c}°C</strong><p>Mean temperature · precipitation {result.power.data.rain_mm} mm</p>
              <p>Complete days: {result.power.data.valid_days}/{result.power.data.days_requested} ({result.power.data.coverage_percent}%)</p>
              <p>Heat: {result.power.data.hot_days} days · frost: {result.power.data.frost_days} days</p>
              <small>{result.power.data.resolution}</small>
            </> : <p role="status">{result.power.message}</p>}</section>
            <section className="map-source-card"><h3>Sentinel-2 · vegetation</h3>{satellite ? <>
              <strong>{satellite.stats.mean.toFixed(3)}</strong><p>Mean NDVI · valid pixels: {satellite.stats.valid_percent}%</p><small>Grid {satellite.resolution_m} m · period composite</small>
            </> : <p role="status">{result.sentinel.message}</p>}</section>
            <section className="map-source-card"><h3>NASA SMAP · soil moisture</h3>{result.smap.data ? <>
              <strong>{result.smap.data.surface_moisture_percent}%</strong><p>Volumetric surface soil moisture · {result.smap.data.observation_date} · {result.smap.data.orbit}</p>
              <p>Grid {result.smap.data.resolution_km} km · depth {result.smap.data.depth_cm} cm · quality flag {result.smap.data.quality_flag}</p>
              <small>Pixel center: {result.smap.data.pixel_latitude.toFixed(3)}, {result.smap.data.pixel_longitude.toFixed(3)} · distance {result.smap.data.distance_to_pixel_center_km} km. {result.smap.data.sampling}</small>
            </> : <p role="status">{result.smap.message}</p>}</section>
            <section className="map-source-card"><h3>NASA ECOSTRESS · LST temperature</h3>{result.ecostress?.data ? <>
              <strong>{result.ecostress.data.lst_c.toLocaleString('en-GB', { maximumFractionDigits: 2 })}°C</strong>
              <p>Land surface temperature · ISS pass: {new Date(result.ecostress.data.observation_time).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</p>
              <p>Grid {result.ecostress.data.resolution_m} m · quality flag {result.ecostress.data.quality_flag}</p>
              <small>{result.ecostress.data.sampling}</small>
            </> : <p role="status">{result.ecostress?.message ?? (result.ecostress ? 'Fetching data…' : 'Restart the backend to enable ECOSTRESS.')}</p>}</section>
          </div>
          <h3>Interpretation and recommended checks</h3>
          {result.findings.map(finding => <section key={finding.code} className={`map-finding ${finding.severity}`}>
            <h4>{finding.title}</h4><ul>{finding.evidence.map(evidence => <li key={evidence}>{evidence}</li>)}</ul><p>{finding.action}</p>
          </section>)}
          <details className="map-report-limits"><summary>Method and interpretation limitations</summary><ul>{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>
        </article>}
        {satellite && <article className="panel analysis-results">
          <div className="result-heading"><h2>Field analysis results</h2><span className="result-status success">Sentinel-2 L2A · {satellite.resolution_m} m</span></div>
          <p className="map-caption">Analysis period: {satellite.start_date} – {satellite.end_date} · area: {satellite.area_ha.toFixed(2)} ha. The dashed blue line on the map marks the analyzed area.</p>
          <div className="stats-grid ndvi-stats">
            <article className="stat-card"><span>MEAN NDVI</span><strong>{satellite.stats.mean.toFixed(3)}</strong></article>
            <article className="stat-card"><span>MEDIAN NDVI</span><strong>{satellite.stats.median.toFixed(3)}</strong></article>
            <article className="stat-card"><span>VALID PIXELS</span><strong>{satellite.stats.valid_percent}%</strong></article>
          </div>
          <p className="map-caption">NDVI range: {satellite.stats.min.toFixed(3)} to {satellite.stats.max.toFixed(3)} · {satellite.stats.valid_pixels} / {satellite.stats.total_pixels} area pixels.</p>
          <p>{satellite.assessment}</p>
          <button className="text-button" onClick={() => {
            const layer = L.geoJSON(satellite.geometry); map.current?.fitBounds(layer.getBounds(), { padding: [20, 20], maxZoom: 18 });
          }}>Show analyzed area</button>
          {satellite.geotiff && <a className="text-button analytical-download" href={satellite.geotiff} download={`ndvi-${satellite.start_date}-${satellite.end_date}.tif`}>Download analytical NDVI GeoTIFF</a>}
          <div className="alert warning"><ul>{satellite.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>
        </article>}
      </section>
    </div>
  </>;
}
