import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Crop, RecommendRequest, RecommendResponse } from './types';
import MapView from './MapView';
import PdfExportButton from './PdfExportButton';

const scenarioLabels: Record<string, string> = {
  balanced: 'Zrównoważony', soil: 'Zdrowie gleby', resilience: 'Odporność', profit: 'Opłacalność',
};

const cropLabels: Record<string, string> = {
  wheat: 'Pszenica',
  rye: 'Żyto',
  barley: 'Jęczmień',
  oats: 'Owies',
  oat: 'Owies',
  maize: 'Kukurydza',
  corn: 'Kukurydza',
  potato: 'Ziemniak',
  rapeseed: 'Rzepak',
  pea: 'Groch',
  soybean: 'Soja',
  soy: 'Soja',
  sunflower: 'Słonecznik',
  sugar_beet: 'Burak cukrowy',
  sugarbeet: 'Burak cukrowy',
  beet: 'Burak',
  triticale: 'Pszenżyto',
  buckwheat: 'Gryka',
  lupin: 'Łubin',
  alfalfa: 'Lucerna',
  clover: 'Koniczyna',
  faba_bean: 'Bobik',
  field_bean: 'Bobik',
};

const metricLabels: Record<string, string> = {
  fit: 'Dopasowanie',
  soil: 'Gleba',
  profit: 'Opłacalność',
  resilience: 'Odporność',
  diversity: 'Różnorodność',
};

function displayName(crops: Crop[], id: string): string {
  const key = id.toLowerCase();
  const crop = crops.find((item) => item.id === id);
  return cropLabels[key] ?? crop?.name ?? id.replaceAll('_', ' ');
}

function translateMessage(message: string): string {
  if (/^Heuristic prototype; verify with local agronomist and field sampling\.?$/i.test(message.trim())) {
    return 'Prototyp oparty na modelu heurystycznym. Wyniki należy zweryfikować z agronomem i badaniami gleby.';
  }
  return message;
}

function value(input: unknown, suffix = ''): string {
  return typeof input === 'number' && Number.isFinite(input)
    ? `${input.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}`
    : '—';
}

function points(score: number): string {
  return (score * 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function scoreDifference(best: number, other: number): string {
  return ((best - other) * 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function yearLabel(years: number): string {
  return `${years} ${years === 1 ? 'rok' : years >= 2 && years <= 4 ? 'lata' : 'lat'}`;
}

export default function FieldAnalysis({ visible = true }: { visible?: boolean }) {
  const [tab, setTab] = useState<'analysis' | 'map'>('analysis');
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [latitude, setLatitude] = useState('52.28');
  const [longitude, setLongitude] = useState('16.70');
  const [years, setYears] = useState(4);
  const [scenario, setScenario] = useState('balanced');
  const [mode, setMode] = useState<'demo' | 'live'>('live');
  const [climateYears, setClimateYears] = useState(10);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([window.terraApi.health(), window.terraApi.crops()])
      .then(([, catalog]) => { setApiOnline(true); setCrops(catalog.crops ?? []); })
      .catch(() => setApiOnline(false));
  }, []);

  const warnings = useMemo(() => [
    ...(result?.soil?.warnings ?? []),
    ...(result?.climate?.warnings ?? []),
    ...(result?.engine?.warnings ?? []),
  ], [result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    const payload: RecommendRequest = {
      latitude: Number(latitude), longitude: Number(longitude), years,
      scenario, mode, climate_years: climateYears, top_k: 5,
      history: [], allowed_crops: null,
    };
    try {
      const response = await window.terraApi.recommend(payload);
      setResult(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Wystąpił nieznany błąd.');
    } finally {
      setLoading(false);
    }
  }

  const recommendations = result?.engine?.recommendations ?? [];
  const first = recommendations[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">T</span><span>Terra<span className="brand-light">Rotation</span></span></div>
        <div className="side-caption">PLANOWANIE UPRAW</div>
        <nav aria-label="Nawigacja główna">
          <button className={`nav-item ${tab === 'analysis' ? 'active' : ''}`} aria-current={tab === 'analysis' ? 'page' : undefined} onClick={() => setTab('analysis')}><span>▦</span> Analiza pola</button>
          <button className={`nav-item ${tab === 'map' ? 'active' : ''}`} aria-current={tab === 'map' ? 'page' : undefined} onClick={() => setTab('map')}><span>◎</span> Mapa</button>
        </nav>
        <div className="side-note"><span className={`status-dot ${apiOnline ? 'online' : ''}`} />
          {apiOnline === null ? 'Sprawdzam API…' : apiOnline ? 'Backend połączony' : 'Backend niedostępny'}
        </div>
        <div className="sidebar-bottom">NASA POWER · ISRIC SoilGrids<br />Prototyp hackathonowy</div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><span className="eyebrow">NARZĘDZIE DECYZYJNE</span><h1>{tab === 'map' ? 'Mapa satelitarna' : 'Planowanie płodozmianu'}</h1></div><div className="top-badge">WERSJA 1.0 · LIVE</div></header>
        <div hidden={tab !== 'map'}><MapView active={visible && tab === 'map'} onSelect={(lat, lon) => { setLatitude(lat.toFixed(5)); setLongitude(lon.toFixed(5)); setResult(null); setError(''); setTab('analysis'); }} /></div>
        <div hidden={tab !== 'analysis'}>
        <section className="intro"><div><h2>Lepsze decyzje zaczynają się od danych.</h2><p>Sprawdź warunki pola i porównaj możliwe rotacje upraw dla wybranej lokalizacji.</p></div><div className="intro-icon">✳</div></section>

        <div className="workspace">
          <section className="panel form-panel">
            <div className="panel-heading"><div className="step-number">01</div><div><h3>Ustawienia pola</h3><p>Wybierz lokalizację i priorytet planu.</p></div></div>
            <form onSubmit={submit}>
              <div className="field-label">WSPÓŁRZĘDNE</div>
              <div className="coordinate-grid">
                <label>Szerokość geograficzna<input required type="number" step="any" min="-90" max="90" value={latitude} onChange={(e) => setLatitude(e.target.value)} /></label>
                <label>Długość geograficzna<input required type="number" step="any" min="-180" max="180" value={longitude} onChange={(e) => setLongitude(e.target.value)} /></label>
              </div>
              <label className="control-label">Scenariusz
                <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                  {Object.entries(scenarioLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <div className="coordinate-grid">
                <label className="control-label">Lata planu<select value={years} onChange={(e) => setYears(Number(e.target.value))}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{yearLabel(n)}</option>)}</select></label>
                <label className="control-label">Historia klimatu<select value={climateYears} onChange={(e) => setClimateYears(Number(e.target.value))}>{[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} lat</option>)}</select></label>
              </div>
              <div className="mode-select"><div><strong>Źródło danych</strong><small>{mode === 'demo' ? 'Przykładowe dane — najlepsze do prezentacji UI' : 'Pobieranie aktualnie dostępnych danych zewnętrznych'}</small></div><select aria-label="Tryb danych" value={mode} onChange={(e) => setMode(e.target.value as 'demo' | 'live')}><option value="demo">DEMO</option><option value="live">LIVE</option></select></div>
              <button className="primary-button" type="submit" disabled={loading || apiOnline === false}>
                {loading ? <><span className="spinner" /> Analizuję dane…</> : <>Utwórz plan <span>→</span></>}
              </button>
              {apiOnline === false && <p className="form-hint">Uruchom backend FastAPI, a następnie odśwież aplikację.</p>}
            </form>
          </section>

          <section className="results-column" data-pdf-report="analysis" data-pdf-ready={!!result && !loading}>
            {!result && !loading && !error && <div className="empty-state"><div className="empty-icon">⌁</div><h3>Twój plan pojawi się tutaj</h3><p>Uzupełnij dane pola i uruchom analizę. Domyślnie korzystamy z rzeczywistych danych klimatycznych i glebowych.</p></div>}
            {loading && <div className="empty-state"><div className="spinner large"/><h3>Analizuję warunki pola</h3><p>Pobieranie danych z NASA POWER i SoilGrids może chwilę potrwać.</p></div>}
            {error && <div className="alert error"><strong>Nie udało się wygenerować planu</strong><p>{error}</p><button className="text-button" onClick={() => setError('')}>Zamknij</button></div>}
            {result && <>
              <PdfExportButton view="analysis" disabled={loading} />
              <header className="pdf-only pdf-report-header">
                <span>TerraRotation · Analiza pola</span><h1>Plan zmianowania</h1>
                <p>Punkt: {result.input?.latitude ?? latitude}, {result.input?.longitude ?? longitude} · Plan: {first?.rotation.length ?? result.input?.years ?? years} lata · Scenariusz: {scenarioLabels[result.input?.scenario ?? scenario] ?? scenario}</p>
                <p data-pdf-export-time />
              </header>
              <section className="pdf-only pdf-parameters">
                <h2>Parametry gleby i klimatu</h2>
                <p>Gleba: {result.soil?.source ?? 'Brak źródła'} · Klimat: {String(result.climate?.source ?? 'Brak źródła')}</p>
                <table><thead><tr><th>Warstwa gleby</th><th>pH</th><th>Piasek (%)</th><th>Ił (%)</th><th>Pył (%)</th><th>SOC (g/kg)</th></tr></thead>
                  <tbody>{(result.soil?.layers?.length ? result.soil.layers : [result.soil ?? {}]).map((layer, index) => <tr key={index}>
                    <td>{String(layer.depth ?? 'Profil')}</td><td>{value(layer.ph)}</td><td>{value(layer.sand_pct)}</td><td>{value(layer.clay_pct)}</td><td>{value(layer.silt_pct)}</td><td>{value(layer.soc_g_kg)}</td>
                  </tr>)}</tbody></table>
                <table><tbody>{[
                  ['Lata historii klimatu', 'climate_years', ''], ['Zmienność opadów (odch. standardowe)', 'annual_rain_std_mm', ' mm'],
                  ['Najdłuższy okres bez opadów', 'dry_spell_max_days', ' dni'], ['Średnia liczba dni mroźnych rocznie', 'frost_days_mean', ' dni'],
                ].map(([label, key, unit]) => <tr key={key}><th>{label}</th><td>{value(result.climate?.[key], unit)}</td></tr>)}</tbody></table>
              </section>
              <div className="result-heading"><div><span className="eyebrow">02 · WYNIKI ANALIZY</span><h2>Warunki i rekomendacje</h2></div><span className={`result-status ${result.engine.status === 'ok' ? 'success' : ''}`}>{result.engine.status === 'ok' ? 'Analiza gotowa' : result.engine.status}</span></div>
              <div className="stats-grid">
                <article className="stat-card"><span>ŚREDNIA TEMP.</span><strong>{value(result.climate?.avg_temp_c, '°C')}</strong><small>średnia z danych klimatycznych</small></article>
                <article className="stat-card"><span>ROCZNE OPADY</span><strong>{value(result.climate?.annual_rain_mm, ' mm')}</strong><small>średnia suma opadów</small></article>
                <article className="stat-card"><span>pH GLEBY</span><strong>{value(result.soil?.layers?.[0]?.ph)}</strong><small>{String(result.soil?.layers?.[0]?.depth ?? 'profil gleby')}</small></article>
              </div>
              {warnings.length > 0 && <div className="alert warning"><strong>Informacje o danych</strong><ul>{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{translateMessage(warning)}</li>)}</ul></div>}
              {result.engine.status !== 'ok' && <div className="alert warning">Nie wygenerowano rekomendacji. Sprawdź informacje o danych i dostępność źródeł zewnętrznych.</div>}
              {first && <article className="recommendation-card">
                <div className="recommendation-top"><div><span className="eyebrow">NAJLEPSZE DOPASOWANIE</span><h3>Rekomendowana rotacja</h3></div><div className="score"><strong>{points(first.score)}</strong><span>pkt</span></div></div>
                {recommendations.length > 1 && Math.abs(first.score - recommendations[1].score) < 0.00005 && <p className="form-hint">Pierwsze dwa warianty uzyskały praktycznie identyczny wynik. Kolejność na liście nie oznacza wyraźnej przewagi agronomicznej.</p>}
                <div className="rotation-timeline">{first.rotation.map((crop, index) => <div className="rotation-year" key={`${crop}-${index}`}><span>ROK {index + 1}</span><strong>{displayName(crops, crop)}</strong>{index < first.rotation.length - 1 && <i>→</i>}</div>)}</div>
                {first.explanations?.length ? <div className="explanations"><strong>Dlaczego ten plan?</strong><ul>{first.explanations.map((text, index) => <li key={index}>{translateMessage(text)}</li>)}</ul></div> : null}
                {first.metrics && <div className="metrics">{Object.entries(first.metrics).map(([key, score]) => <div className="metric" key={key}><span>{metricLabels[key] ?? key}</span><div className="meter"><i style={{ width: `${Math.max(0, Math.min(100, score * 100))}%` }} /></div><b>{Math.round(score * 100)}%</b></div>)}</div>}
              </article>}
              {recommendations.length > 1 && <section className="other-plans"><h3>Inne warianty</h3><p className="form-hint">Punktacja z dokładnością do 0,01 pkt. Zbliżone wyniki oznaczają porównywalne warianty, niekoniecznie istotną przewagę pierwszego.</p>{recommendations.slice(1).map((item, index) => <div className="other-plan" key={index}><span>Wariant {index + 2}</span><strong>{item.rotation.map((id) => displayName(crops, id)).join(' → ')}</strong><b title={`Różnica względem pierwszego: ${scoreDifference(first.score, item.score)} pkt`}>{points(item.score)} pkt</b></div>)}</section>}
              {result.disclaimer && <p className="disclaimer">ⓘ {translateMessage(result.disclaimer)}</p>}
            </>}
          </section>
        </div>
        </div>
        <footer>TerraRotation · Dane historyczne NASA POWER i szacunki gleby SoilGrids. Wyniki modelu mają charakter orientacyjny i nie zastępują badań gleby ani porady agronomicznej.</footer>
      </main>
    </div>
  );
}
