import { useEffect, useRef, useState, type FormEvent } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
    L.control.layers({ 'Zdjęcia terenu · Esri': hybrid, 'Mapa drogowa · OSM': streets }).addTo(instance);
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
      setError('Wybierz poprawny zakres obejmujący maksymalnie 31 dni.'); return;
    }
    const common = { start_date: startDate, end_date: endDate, max_cloud_coverage: clouds, include_geotiff: includeGeotiff };
    let request: SatelliteRequest;
    if (mode === 'polygon') {
      if (isDrawing || vertices.length < 3) { setError('Zaznacz przynajmniej 3 wierzchołki i zakończ obrys.'); return; }
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
        setError(reason instanceof Error ? reason.message : 'Nie udało się uruchomić analizy.');
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
        if (keepResult && requestVersion.current === version) setError(reason instanceof Error ? reason.message : 'Nie udało się anulować zadania.');
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
          setError(reason instanceof Error ? reason.message : 'Utracono połączenie z zadaniem.');
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
    <section className="intro"><div><h2>Wskaż pole. Połącz pogodę, roślinność i wodę.</h2><p>Zdjęcia terenu pomagają wybrać działkę. Kliknięcie punktu lub zakończenie obrysu uruchamia raport POWER, Sentinel-2, SMAP i ECOSTRESS.</p></div><div className="intro-icon">◎</div></section>
    <div className="workspace sentinel-workspace">
      <section className="panel form-panel">
        <div className="panel-heading"><div className="step-number">01</div><div><h3>Wybierz pole</h3><p>Punkt lub obrys działki</p></div></div>
        <form onSubmit={analyze}>
          <fieldset className="field-selection">
            <div className="map-view-switch" role="group" aria-label="Wybór obszaru">
              <button type="button" aria-pressed={mode === 'point'} onClick={() => chooseMode('point')}>Punkt i otoczenie</button>
              <button type="button" aria-pressed={mode === 'polygon'} onClick={() => chooseMode('polygon')}>Obrysuj pole</button>
            </div>
            {mode === 'point' ? <>
              <div className="coordinate-grid">
                <label>Szerokość geograficzna<input required type="number" step="any" min="-79" max="83" value={latitude} onChange={e => setLatitude(e.target.value)} /></label>
                <label>Długość geograficzna<input required type="number" step="any" min="-179.9" max="179.9" value={longitude} onChange={e => setLongitude(e.target.value)} /></label>
              </div>
              <button type="button" className="text-button" disabled={!validPoint} onClick={() => map.current?.setView([Number(latitude), Number(longitude)], 17)}>Pokaż punkt na mapie</button>
              <label className="control-label">Zasięg analizy<select value={radius} onChange={e => setRadius(Number(e.target.value))}>{[100, 250, 500, 1000, 2500].map(value => <option key={value} value={value}>{2 * value} × {2 * value} m wokół punktu</option>)}</select></label>
            </> : <>
              <p className="map-caption">Klikaj kolejne narożniki działki na zdjęciu. Maksymalnie 100 wierzchołków i 5 km rozpiętości.</p>
              <p role="status">{vertices.length} wierzchołków · {isDrawing ? (vertices.length >= 3 ? 'Kliknij „Zakończ obrys”, aby uruchomić analizę.' : 'Dodaj co najmniej 3 narożniki, następnie zakończ obrys.') : 'obrys gotowy'}</p>
              <div className="map-downloads">
                <button type="button" className="text-button" disabled={!isDrawing || vertices.length < 3} onClick={finishPolygon}>Zakończ obrys</button>
                <button type="button" className="text-button" disabled={!isDrawing || !vertices.length} onClick={() => setVertices(points => points.slice(0, -1))}>Cofnij punkt</button>
                <button type="button" className="text-button" onClick={() => chooseMode('polygon')}>Narysuj ponownie</button>
              </div>
            </>}
            <div className="coordinate-grid">
              <label className="control-label">Analiza od<input className="map-input" required type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} /></label>
              <label className="control-label">Analiza do<input className="map-input" required type="date" value={endDate} min={startDate} max={isoDay(0)} onChange={e => setEndDate(e.target.value)} /></label>
            </div>
            <label className="control-label">Maksymalne zachmurzenie sceny<select value={clouds} onChange={e => setClouds(Number(e.target.value))}>{[10, 30, 50, 80, 100].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
            <label className="geotiff-option"><input type="checkbox" checked={includeGeotiff} onChange={e => setIncludeGeotiff(e.target.checked)} /> Dołącz raster NDVI do pobrania</label>
            {mode === 'polygon' && isDrawing ? <button type="button" className="primary-button" disabled={vertices.length < 3} onClick={finishPolygon}>
              {vertices.length < 3 ? `Zaznacz narożniki pola (${vertices.length}/3)` : 'Zakończ obrys i analizuj'}
            </button> : <button type="submit" className="primary-button" disabled={loading || !ready}>{loading ? 'Analiza trwa w tle…' : 'Analizuj · POWER + NDVI + SMAP + LST'}</button>}
            {loading && <div className="map-source-progress" role="status" aria-live="polite">
              <strong>{jobId ? 'Analiza obrysu lub punktu w toku' : 'Uruchamianie zadania…'}</strong>
              <ul>{(['power', 'sentinel', 'smap', 'ecostress'] as const).map(source => {
                const status = result?.[source]?.status ?? 'pending';
                const label = { power: 'NASA POWER', sentinel: 'Sentinel-2 NDVI', smap: 'NASA SMAP', ecostress: 'NASA ECOSTRESS' }[source];
                return <li key={source} data-status={status}><span>{label}</span><b>{status === 'ok' ? 'Gotowe' : status === 'unavailable' ? 'Brak danych' : 'Pobieranie…'}</b></li>;
              })}</ul>
              <p>SMAP pobiera plik satelitarny i może potrwać do około 100 s. Gotowe wyniki są już dostępne w raporcie poniżej mapy.</p>
              <button type="button" className="text-button" onClick={() => void cancelAnalysis()}>Anuluj analizę</button>
            </div>}
          </fieldset>
        </form>
        <button className="text-button" disabled={!ready || loading} onClick={useLocation}>Użyj lokalizacji w analizie płodozmianu →</button>
        {error && <div className="alert error" role="alert">{error}</div>}
      </section>
      <section className="results-column" aria-busy={loading}>
        <article className="panel map-panel">
          <div className="result-heading"><h2>Zdjęcia terenu</h2><span className="result-status success">Podkład wizualny</span></div>
          <div ref={container} className="leaflet-field-map" aria-label="Zdjęcia terenu. Kliknij punkt lub obrysuj granice pola." />
          <p className="map-caption">Podkład Esri służy do wskazywania pola. Jego daty i szczegółowość są niezależne od analizy Sentinel-2. Przełącznik warstw w prawym górnym rogu udostępnia też mapę drogową.</p>
          {tileError && <div className="alert warning" role="status">Nie udało się wczytać części zdjęć terenu. Sprawdź połączenie lub wybierz mapę drogową w przełączniku warstw.</div>}
        </article>
        {loading && <div className="panel analysis-progress" role="status">Analiza działa w tle · gotowe źródła: {result ? [result.power, result.sentinel, result.smap, result.ecostress].filter(source => source && source.status !== 'pending').length : 0}/4. Wyniki pojawiają się na bieżąco. Możesz wskazać inne pole lub anulować pobieranie.</div>}
        {result && <article className="panel analysis-results map-integrated-report">
          <div className="result-heading"><h2>Raport agrotechniczny</h2><span className="result-status">{result.status === 'running' ? 'Analiza w toku' : result.status === 'ok' ? '4 źródła dostępne' : result.status === 'partial' ? 'Dane częściowe' : 'Brak danych'}</span></div>
          <p className="map-caption">{result.start_date} – {result.end_date} · punkt odniesienia: {result.latitude.toFixed(5)}, {result.longitude.toFixed(5)}. POWER i SMAP są próbkowane dla punktu wewnątrz obrysu, NDVI dla całego obszaru.</p>
          <div className="map-source-grid">
            <section className="map-source-card"><h3>NASA POWER · pogoda</h3>{result.power.data ? <>
              <strong>{result.power.data.mean_temp_c}°C</strong><p>Średnia temperatura · opady {result.power.data.rain_mm} mm</p>
              <p>Pełne dni: {result.power.data.valid_days}/{result.power.data.days_requested} ({result.power.data.coverage_percent}%)</p>
              <p>Upały: {result.power.data.hot_days} dni · przymrozki: {result.power.data.frost_days} dni</p>
              <small>{result.power.data.resolution}</small>
            </> : <p role="status">{result.power.message}</p>}</section>
            <section className="map-source-card"><h3>Sentinel-2 · roślinność</h3>{satellite ? <>
              <strong>{satellite.stats.mean.toFixed(3)}</strong><p>Średni NDVI · ważne piksele: {satellite.stats.valid_percent}%</p><small>Siatka {satellite.resolution_m} m · kompozycja okresu</small>
            </> : <p role="status">{result.sentinel.message}</p>}</section>
            <section className="map-source-card"><h3>NASA SMAP · woda w glebie</h3>{result.smap.data ? <>
              <strong>{result.smap.data.surface_moisture_percent}%</strong><p>Objętościowa wilgotność powierzchniowa · {result.smap.data.observation_date} · {result.smap.data.orbit}</p>
              <p>Siatka {result.smap.data.resolution_km} km · głębokość {result.smap.data.depth_cm} cm · flaga jakości {result.smap.data.quality_flag}</p>
              <small>Środek piksela: {result.smap.data.pixel_latitude.toFixed(3)}, {result.smap.data.pixel_longitude.toFixed(3)} · odległość {result.smap.data.distance_to_pixel_center_km} km. {result.smap.data.sampling}</small>
            </> : <p role="status">{result.smap.message}</p>}</section>
            <section className="map-source-card"><h3>NASA ECOSTRESS · temperatura LST</h3>{result.ecostress?.data ? <>
              <strong>{result.ecostress.data.lst_c.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}°C</strong>
              <p>Temperatura powierzchni ziemi · przelot ISS: {new Date(result.ecostress.data.observation_time).toLocaleString('pl-PL', { timeZone: 'UTC' })} UTC</p>
              <p>Siatka {result.ecostress.data.resolution_m} m · flaga jakości {result.ecostress.data.quality_flag}</p>
              <small>{result.ecostress.data.sampling}</small>
            </> : <p role="status">{result.ecostress?.message ?? (result.ecostress ? 'Pobieranie danych…' : 'Uruchom ponownie backend, aby włączyć ECOSTRESS.')}</p>}</section>
          </div>
          <h3>Interpretacja i zalecane sprawdzenia</h3>
          {result.findings.map(finding => <section key={finding.code} className={`map-finding ${finding.severity}`}>
            <h4>{finding.title}</h4><ul>{finding.evidence.map(evidence => <li key={evidence}>{evidence}</li>)}</ul><p>{finding.action}</p>
          </section>)}
          <details className="map-report-limits"><summary>Metoda i ograniczenia interpretacji</summary><ul>{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>
        </article>}
        {satellite && <article className="panel analysis-results">
          <div className="result-heading"><h2>Wyniki analizy pola</h2><span className="result-status success">Sentinel-2 L2A · {satellite.resolution_m} m</span></div>
          <p className="map-caption">Okres analizy: {satellite.start_date} – {satellite.end_date} · powierzchnia: {satellite.area_ha.toFixed(2)} ha. Niebieska przerywana linia na mapie oznacza analizowany obszar.</p>
          <div className="stats-grid ndvi-stats">
            <article className="stat-card"><span>ŚREDNI NDVI</span><strong>{satellite.stats.mean.toFixed(3)}</strong></article>
            <article className="stat-card"><span>MEDIANA NDVI</span><strong>{satellite.stats.median.toFixed(3)}</strong></article>
            <article className="stat-card"><span>WAŻNE PIKSELE</span><strong>{satellite.stats.valid_percent}%</strong></article>
          </div>
          <p className="map-caption">Zakres NDVI: {satellite.stats.min.toFixed(3)} do {satellite.stats.max.toFixed(3)} · {satellite.stats.valid_pixels} / {satellite.stats.total_pixels} pikseli obszaru.</p>
          <p>{satellite.assessment}</p>
          <button className="text-button" onClick={() => {
            const layer = L.geoJSON(satellite.geometry); map.current?.fitBounds(layer.getBounds(), { padding: [20, 20], maxZoom: 18 });
          }}>Pokaż analizowany obszar</button>
          {satellite.geotiff && <a className="text-button analytical-download" href={satellite.geotiff} download={`ndvi-${satellite.start_date}-${satellite.end_date}.tif`}>Pobierz analityczny GeoTIFF NDVI</a>}
          <div className="alert warning"><ul>{satellite.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>
        </article>}
      </section>
    </div>
  </>;
}
