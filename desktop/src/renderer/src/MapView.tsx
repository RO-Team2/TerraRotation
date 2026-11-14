import { useEffect, useRef, useState, type FormEvent } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SatelliteRequest, SatelliteResponse } from './types';

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
  const [result, setResult] = useState<SatelliteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current).setView([52.28, 16.70], 16);
    L.control.scale({ imperial: false }).addTo(instance);
    const imagery = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri — Source: Esri, Vantor, Earthstar Geographics, GIS User Community',
    });
    const labels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Labels &copy; Esri', pane: 'overlayPane',
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
      if (busy.current) return;
      const lat = event.latlng.lat, lon = L.Util.wrapNum(event.latlng.lng, [-180, 180]);
      if (lat < -79 || lat > 83 || Math.abs(lon) > 179.9) return;
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
      if (vertices.length >= 3 && !isDrawing) L.polygon(vertices, { color: '#e5b94c', weight: 3, fillOpacity: 0.08 }).addTo(group);
      else if (vertices.length > 1) L.polyline(vertices, { color: '#e5b94c', weight: 3 }).addTo(group);
      vertices.forEach(point => L.circleMarker(point, { radius: 4, color: '#fff', fillColor: '#e5b94c', fillOpacity: 1 }).addTo(group));
    } else {
      const lat = Number(latitude), lon = Number(longitude);
      if (!latitude || !longitude || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -79 || lat > 83 || Math.abs(lon) > 179.9) return;
      L.circleMarker([lat, lon], { radius: 7, color: '#fff', fillColor: '#e98440', fillOpacity: 1 }).addTo(group);
      const center = L.CRS.EPSG3857.project(L.latLng(lat, lon));
      // Geodesic approximation for the selection hint; backend returns the exact UTM AOI.
      const d = radius / Math.cos(lat * Math.PI / 180);
      const sw = L.CRS.EPSG3857.unproject(L.point(center.x - d, center.y - d));
      const ne = L.CRS.EPSG3857.unproject(L.point(center.x + d, center.y + d));
      L.rectangle(L.latLngBounds(sw, ne), { color: '#e5b94c', weight: 2, fillOpacity: 0.05 }).addTo(group);
    }
  }, [mode, vertices, isDrawing, latitude, longitude, radius]);

  useEffect(() => { setResult(null); setError(''); }, [mode, vertices, isDrawing, latitude, longitude, radius, startDate, endDate, clouds, includeGeotiff]);

  useEffect(() => {
    if (!result || !map.current) return;
    const outline = L.geoJSON(result.geometry, {
      style: { color: '#63c8ff', weight: 3, dashArray: '7 5', fillOpacity: 0, interactive: false },
    }).addTo(map.current);
    return () => { outline.remove(); };
  }, [result]);

  function chooseMode(next: 'point' | 'polygon') {
    modeRef.current = next; setMode(next);
    drawing.current = next === 'polygon'; setIsDrawing(next === 'polygon');
    setVertices([]);
  }

  async function analyze(event: FormEvent) {
    event.preventDefault(); setError('');
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
    try { setResult(await window.terraApi.satellite(request)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Nie udało się przeprowadzić analizy.'); }
    finally { busy.current = false; setLoading(false); }
  }

  const validPoint = latitude !== '' && longitude !== '' && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) && Number(latitude) >= -79 && Number(latitude) <= 83 && Math.abs(Number(longitude)) <= 179.9;
  const ready = mode === 'point' ? validPoint : !isDrawing && vertices.length >= 3;
  const useLocation = () => {
    if (mode === 'point') onSelect(Number(latitude), Number(longitude));
    else if (vertices.length) {
      const center = L.latLngBounds(vertices).getCenter(); onSelect(center.lat, center.lng);
    }
  };

  return <>
    <section className="intro"><div><h2>Wskaż pole. Poznaj wskaźniki roślinności.</h2><p>Zdjęcia terenu pomagają wybrać działkę. Sentinel-2 analizuje roślinność w zaznaczonym obszarze.</p></div><div className="intro-icon">◎</div></section>
    <div className="workspace sentinel-workspace">
      <section className="panel form-panel">
        <div className="panel-heading"><div className="step-number">01</div><div><h3>Wybierz pole</h3><p>Punkt lub obrys działki</p></div></div>
        <form onSubmit={analyze}>
          <fieldset className="field-selection" disabled={loading}>
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
              <p role="status">{vertices.length} wierzchołków · {isDrawing ? 'rysowanie obrysu' : 'obrys gotowy'}</p>
              <div className="map-downloads">
                <button type="button" className="text-button" disabled={!isDrawing || vertices.length < 3} onClick={() => { drawing.current = false; setIsDrawing(false); }}>Zakończ obrys</button>
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
            <button className="primary-button" disabled={loading || !ready}>{loading ? 'Analizuję pole…' : 'Analizuj pole · Sentinel-2'}</button>
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
        {loading && <div className="panel analysis-progress" role="status">Trwa pobieranie danych i obliczanie wskaźników Sentinel-2. Możesz nadal przeglądać mapę.</div>}
        {result && <article className="panel analysis-results">
          <div className="result-heading"><h2>Wyniki analizy pola</h2><span className="result-status success">Sentinel-2 L2A · {result.resolution_m} m</span></div>
          <p className="map-caption">Okres analizy: {result.start_date} – {result.end_date} · powierzchnia: {result.area_ha.toFixed(2)} ha. Niebieska przerywana linia na mapie oznacza analizowany obszar.</p>
          <div className="stats-grid ndvi-stats">
            <article className="stat-card"><span>ŚREDNI NDVI</span><strong>{result.stats.mean.toFixed(3)}</strong></article>
            <article className="stat-card"><span>MEDIANA NDVI</span><strong>{result.stats.median.toFixed(3)}</strong></article>
            <article className="stat-card"><span>WAŻNE PIKSELE</span><strong>{result.stats.valid_percent}%</strong></article>
          </div>
          <p className="map-caption">Zakres NDVI: {result.stats.min.toFixed(3)} do {result.stats.max.toFixed(3)} · {result.stats.valid_pixels} / {result.stats.total_pixels} pikseli obszaru.</p>
          <p>{result.assessment}</p>
          <button className="text-button" onClick={() => {
            const layer = L.geoJSON(result.geometry); map.current?.fitBounds(layer.getBounds(), { padding: [20, 20], maxZoom: 18 });
          }}>Pokaż analizowany obszar</button>
          {result.geotiff && <a className="text-button analytical-download" href={result.geotiff} download={`ndvi-${result.start_date}-${result.end_date}.tif`}>Pobierz analityczny GeoTIFF NDVI</a>}
          <div className="alert warning"><ul>{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>
        </article>}
      </section>
    </div>
  </>;
}
