import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Crop, RecommendRequest, RecommendResponse } from './types';
import MapView from './MapView';
import PdfExportButton from './PdfExportButton';

const scenarioLabels: Record<string, string> = {
  balanced: 'Balanced', soil: 'Soil health', resilience: 'Resilience', profit: 'Profitability',
};

const cropLabels: Record<string, string> = {
  wheat: 'Wheat',
  rye: 'Rye',
  barley: 'Barley',
  oats: 'Oats',
  oat: 'Oats',
  maize: 'Maize',
  corn: 'Maize',
  potato: 'Potato',
  rapeseed: 'Rapeseed',
  pea: 'Pea',
  soybean: 'Soybean',
  soy: 'Soybean',
  sunflower: 'Sunflower',
  sugar_beet: 'Sugar beet',
  sugarbeet: 'Sugar beet',
  beet: 'Beet',
  triticale: 'Triticale',
  buckwheat: 'Buckwheat',
  lupin: 'Lupin',
  alfalfa: 'Alfalfa',
  clover: 'Clover',
  faba_bean: 'Faba bean',
  field_bean: 'Faba bean',
};

const metricLabels: Record<string, string> = {
  fit: 'Suitability',
  soil: 'Soil',
  profit: 'Profitability',
  resilience: 'Resilience',
  diversity: 'Diversity',
};

function displayName(crops: Crop[], id: string): string {
  const key = id.toLowerCase();
  const crop = crops.find((item) => item.id === id);
  return cropLabels[key] ?? crop?.name ?? id.replaceAll('_', ' ');
}

function translateMessage(message: string): string {
  if (/^Heuristic prototype; verify with local agronomist and field sampling\.?$/i.test(message.trim())) {
    return 'Heuristic prototype. Verify results with an agronomist and soil testing.';
  }
  return message;
}

function value(input: unknown, suffix = ''): string {
  return typeof input === 'number' && Number.isFinite(input)
    ? `${input.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${suffix}`
    : '—';
}

function points(score: number): string {
  return (score * 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function scoreDifference(best: number, other: number): string {
  return ((best - other) * 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function yearLabel(years: number): string {
  return `${years} ${years === 1 ? 'year' : 'years'}`;
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
      setError(reason instanceof Error ? reason.message : 'An unknown error occurred.');
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
        <div className="side-caption">CROP PLANNING</div>
        <nav aria-label="Main navigation">
          <button className={`nav-item ${tab === 'analysis' ? 'active' : ''}`} aria-current={tab === 'analysis' ? 'page' : undefined} onClick={() => setTab('analysis')}><span>▦</span> Field analysis</button>
          <button className={`nav-item ${tab === 'map' ? 'active' : ''}`} aria-current={tab === 'map' ? 'page' : undefined} onClick={() => setTab('map')}><span>◎</span> Map</button>
        </nav>
        <div className="side-note"><span className={`status-dot ${apiOnline ? 'online' : ''}`} />
          {apiOnline === null ? 'Checking API…' : apiOnline ? 'Backend connected' : 'Backend unavailable'}
        </div>
        <div className="sidebar-bottom">NASA POWER · ISRIC SoilGrids<br />Hackathon prototype</div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><span className="eyebrow">DECISION SUPPORT TOOL</span><h1>{tab === 'map' ? 'Satellite map' : 'Crop rotation planning'}</h1></div><div className="top-badge">VERSION 1.0 · LIVE</div></header>
        <div hidden={tab !== 'map'}><MapView active={visible && tab === 'map'} onSelect={(lat, lon) => { setLatitude(lat.toFixed(5)); setLongitude(lon.toFixed(5)); setResult(null); setError(''); setTab('analysis'); }} /></div>
        <div hidden={tab !== 'analysis'}>
        <section className="intro"><div><h2>Better decisions start with data.</h2><p>Check field conditions and compare crop rotations for your chosen location.</p></div><div className="intro-icon">✳</div></section>

        <div className="workspace">
          <section className="panel form-panel">
            <div className="panel-heading"><div className="step-number">01</div><div><h3>Field settings</h3><p>Choose a location and planning priority.</p></div></div>
            <form onSubmit={submit}>
              <div className="field-label">COORDINATES</div>
              <div className="coordinate-grid">
                <label>Latitude<input required type="number" step="any" min="-90" max="90" value={latitude} onChange={(e) => setLatitude(e.target.value)} /></label>
                <label>Longitude<input required type="number" step="any" min="-180" max="180" value={longitude} onChange={(e) => setLongitude(e.target.value)} /></label>
              </div>
              <label className="control-label">Scenario
                <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
                  {Object.entries(scenarioLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <div className="coordinate-grid">
                <label className="control-label">Plan duration<select value={years} onChange={(e) => setYears(Number(e.target.value))}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{yearLabel(n)}</option>)}</select></label>
                <label className="control-label">Climate history<select value={climateYears} onChange={(e) => setClimateYears(Number(e.target.value))}>{[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} years</option>)}</select></label>
              </div>
              <div className="mode-select"><div><strong>Data source</strong><small>{mode === 'demo' ? 'Sample data — ideal for UI demonstrations' : 'Fetching currently available external data'}</small></div><select aria-label="Data mode" value={mode} onChange={(e) => setMode(e.target.value as 'demo' | 'live')}><option value="demo">DEMO</option><option value="live">LIVE</option></select></div>
              <button className="primary-button" type="submit" disabled={loading || apiOnline === false}>
                {loading ? <><span className="spinner" /> Analyzing data…</> : <>Create plan <span>→</span></>}
              </button>
              {apiOnline === false && <p className="form-hint">Start the FastAPI backend, then refresh the app.</p>}
            </form>
          </section>

          <section className="results-column" data-pdf-report="analysis" data-pdf-ready={!!result && !loading}>
            {!result && !loading && !error && <div className="empty-state"><div className="empty-icon">⌁</div><h3>Your plan will appear here</h3><p>Enter field details and start the analysis. Real climate and soil data is used by default.</p></div>}
            {loading && <div className="empty-state"><div className="spinner large"/><h3>Analyzing field conditions</h3><p>Fetching data from NASA POWER and SoilGrids may take a moment.</p></div>}
            {error && <div className="alert error"><strong>Could not generate a plan</strong><p>{error}</p><button className="text-button" onClick={() => setError('')}>Close</button></div>}
            {result && <>
              <PdfExportButton view="analysis" disabled={loading} />
              <header className="pdf-only pdf-report-header">
                <span>TerraRotation · Field analysis</span><h1>Crop rotation plan</h1>
                <p>Point: {result.input?.latitude ?? latitude}, {result.input?.longitude ?? longitude} · Plan: {first?.rotation.length ?? result.input?.years ?? years} years · Scenario: {scenarioLabels[result.input?.scenario ?? scenario] ?? scenario}</p>
                <p data-pdf-export-time />
              </header>
              <section className="pdf-only pdf-parameters">
                <h2>Soil and climate parameters</h2>
                <p>Soil: {result.soil?.source ?? 'No source'} · Climate: {String(result.climate?.source ?? 'No source')}</p>
                <table><thead><tr><th>Soil layer</th><th>pH</th><th>Sand (%)</th><th>Clay (%)</th><th>Silt (%)</th><th>SOC (g/kg)</th></tr></thead>
                  <tbody>{(result.soil?.layers?.length ? result.soil.layers : [result.soil ?? {}]).map((layer, index) => <tr key={index}>
                    <td>{String(layer.depth ?? 'Profile')}</td><td>{value(layer.ph)}</td><td>{value(layer.sand_pct)}</td><td>{value(layer.clay_pct)}</td><td>{value(layer.silt_pct)}</td><td>{value(layer.soc_g_kg)}</td>
                  </tr>)}</tbody></table>
                <table><tbody>{[
                  ['Years of climate history', 'climate_years', ''], ['Precipitation variability (standard deviation)', 'annual_rain_std_mm', ' mm'],
                  ['Longest dry spell', 'dry_spell_max_days', ' days'], ['Average annual frost days', 'frost_days_mean', ' days'],
                ].map(([label, key, unit]) => <tr key={key}><th>{label}</th><td>{value(result.climate?.[key], unit)}</td></tr>)}</tbody></table>
              </section>
              <div className="result-heading"><div><span className="eyebrow">02 · ANALYSIS RESULTS</span><h2>Conditions and recommendations</h2></div><span className={`result-status ${result.engine.status === 'ok' ? 'success' : ''}`}>{result.engine.status === 'ok' ? 'Analysis complete' : result.engine.status}</span></div>
              <div className="stats-grid">
                <article className="stat-card"><span>AVG. TEMPERATURE</span><strong>{value(result.climate?.avg_temp_c, '°C')}</strong><small>average from climate data</small></article>
                <article className="stat-card"><span>ANNUAL PRECIPITATION</span><strong>{value(result.climate?.annual_rain_mm, ' mm')}</strong><small>average precipitation total</small></article>
                <article className="stat-card"><span>SOIL pH</span><strong>{value(result.soil?.layers?.[0]?.ph)}</strong><small>{String(result.soil?.layers?.[0]?.depth ?? 'soil profile')}</small></article>
              </div>
              {warnings.length > 0 && <div className="alert warning"><strong>Data information</strong><ul>{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{translateMessage(warning)}</li>)}</ul></div>}
              {result.engine.status !== 'ok' && <div className="alert warning">No recommendations generated. Check data information and external source availability.</div>}
              {first && <article className="recommendation-card">
                <div className="recommendation-top"><div><span className="eyebrow">BEST MATCH</span><h3>Recommended rotation</h3></div><div className="score"><strong>{points(first.score)}</strong><span>pts</span></div></div>
                {recommendations.length > 1 && Math.abs(first.score - recommendations[1].score) < 0.00005 && <p className="form-hint">The top two options scored almost identically. Their order does not indicate a clear agronomic advantage.</p>}
                <div className="rotation-timeline">{first.rotation.map((crop, index) => <div className="rotation-year" key={`${crop}-${index}`}><span>YEAR {index + 1}</span><strong>{displayName(crops, crop)}</strong>{index < first.rotation.length - 1 && <i>→</i>}</div>)}</div>
                {first.explanations?.length ? <div className="explanations"><strong>Why this plan?</strong><ul>{first.explanations.map((text, index) => <li key={index}>{translateMessage(text)}</li>)}</ul></div> : null}
                {first.metrics && <div className="metrics">{Object.entries(first.metrics).map(([key, score]) => <div className="metric" key={key}><span>{metricLabels[key] ?? key}</span><div className="meter"><i style={{ width: `${Math.max(0, Math.min(100, score * 100))}%` }} /></div><b>{Math.round(score * 100)}%</b></div>)}</div>}
              </article>}
              {recommendations.length > 1 && <section className="other-plans"><h3>Other options</h3><p className="form-hint">Scores are shown to 0.01 points. Close scores indicate comparable options, not necessarily a significant advantage for the first.</p>{recommendations.slice(1).map((item, index) => <div className="other-plan" key={index}><span>Option {index + 2}</span><strong>{item.rotation.map((id) => displayName(crops, id)).join(' → ')}</strong><b title={`Difference from the first: ${scoreDifference(first.score, item.score)} pts`}>{points(item.score)} pts</b></div>)}</section>}
              {result.disclaimer && <p className="disclaimer">ⓘ {translateMessage(result.disclaimer)}</p>}
            </>}
          </section>
        </div>
        </div>
        <footer>TerraRotation · Historical NASA POWER data and SoilGrids soil estimates. Model results are indicative and do not replace soil testing or agronomic advice.</footer>
      </main>
    </div>
  );
}
