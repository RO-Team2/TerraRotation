import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Crop, RecommendRequest, RecommendResponse } from './types';

const scenarioLabels: Record<string, string> = {
  balanced: 'Zrównoważony', soil: 'Zdrowie gleby', resilience: 'Odporność', profit: 'Opłacalność',
};

function displayName(crops: Crop[], id: string): string {
  const crop = crops.find((item) => item.id === id);
  return crop?.name ?? id.replaceAll('_', ' ');
}

function value(value: unknown, suffix = ''): string {
  return typeof value === 'number' ? `${value.toFixed(1)}${suffix}` : '—';
}

export default function App() {
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [latitude, setLatitude] = useState('52.28');
  const [longitude, setLongitude] = useState('16.70');
  const [years, setYears] = useState(4);
  const [scenario, setScenario] = useState('balanced');
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
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
        <div className="nav-item active"><span>▦</span> Analiza pola</div>
        <div className="side-note"><span className={`status-dot ${apiOnline ? 'online' : ''}`} />
          {apiOnline === null ? 'Sprawdzam API…' : apiOnline ? 'Backend połączony' : 'Backend niedostępny'}
        </div>
        <div className="sidebar-bottom">NASA POWER · ISRIC SoilGrids<br />Prototyp hackathonowy</div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><span className="eyebrow">NARZĘDZIE DECYZYJNE</span><h1>Planowanie płodozmianu</h1></div><div className="top-badge">WERSJA DEMO</div></header>
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
                <label className="control-label">Lata planu<select value={years} onChange={(e) => setYears(Number(e.target.value))}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} lata</option>)}</select></label>
                <label className="control-label">Historia klimatu<select value={climateYears} onChange={(e) => setClimateYears(Number(e.target.value))}>{[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} lat</option>)}</select></label>
              </div>
              <div className="mode-select"><div><strong>Źródło danych</strong><small>{mode === 'demo' ? 'Przykładowe dane — najlepsze do prezentacji UI' : 'Pobieranie aktualnie dostępnych danych zewnętrznych'}</small></div><select aria-label="Tryb danych" value={mode} onChange={(e) => setMode(e.target.value as 'demo' | 'live')}><option value="demo">Demo</option><option value="live">Live</option></select></div>
              <button className="primary-button" type="submit" disabled={loading || apiOnline === false}>
                {loading ? <><span className="spinner" /> Analizuję dane…</> : <>Utwórz plan <span>→</span></>}
              </button>
              {apiOnline === false && <p className="form-hint">Uruchom backend FastAPI, a następnie odśwież aplikację.</p>}
            </form>
          </section>

          <section className="results-column">
            {!result && !loading && !error && <div className="empty-state"><div className="empty-icon">⌁</div><h3>Twój plan pojawi się tutaj</h3><p>Uzupełnij dane pola i uruchom analizę. Na początek wybierz tryb demo.</p></div>}
            {loading && <div className="empty-state"><div className="spinner large"/><h3>Analizuję warunki pola</h3><p>Pierwsze pobranie danych live może chwilę potrwać.</p></div>}
            {error && <div className="alert error"><strong>Nie udało się wygenerować planu</strong><p>{error}</p><button className="text-button" onClick={() => setError('')}>Zamknij</button></div>}
            {result && <>
              <div className="result-heading"><div><span className="eyebrow">02 · WYNIKI ANALIZY</span><h2>Warunki i rekomendacje</h2></div><span className={`result-status ${result.engine.status === 'ok' ? 'success' : ''}`}>{result.engine.status === 'ok' ? 'Analiza gotowa' : result.engine.status}</span></div>
              <div className="stats-grid">
                <article className="stat-card"><span>ŚREDNIA TEMP.</span><strong>{value(result.climate?.avg_temp_c, '°C')}</strong><small>średnia z danych klimatycznych</small></article>
                <article className="stat-card"><span>ROCZNE OPADY</span><strong>{value(result.climate?.annual_rain_mm, ' mm')}</strong><small>średnia suma opadów</small></article>
                <article className="stat-card"><span>pH GLEBY</span><strong>{value(result.soil?.layers?.[0]?.ph)}</strong><small>{String(result.soil?.layers?.[0]?.depth ?? 'profil gleby')}</small></article>
              </div>
              {warnings.length > 0 && <div className="alert warning"><strong>Informacje o danych</strong><ul>{warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div>}
              {result.engine.status !== 'ok' && <div className="alert warning">Nie wygenerowano rekomendacji. Sprawdź ostrzeżenia lub spróbuj trybu demo.</div>}
              {first && <article className="recommendation-card">
                <div className="recommendation-top"><div><span className="eyebrow">NAJLEPSZE DOPASOWANIE</span><h3>Rekomendowana rotacja</h3></div><div className="score"><strong>{Math.round(first.score * 100)}</strong><span>pkt</span></div></div>
                <div className="rotation-timeline">{first.rotation.map((crop, index) => <div className="rotation-year" key={`${crop}-${index}`}><span>ROK {index + 1}</span><strong>{displayName(crops, crop)}</strong>{index < first.rotation.length - 1 && <i>→</i>}</div>)}</div>
                {first.explanations?.length ? <div className="explanations"><strong>Dlaczego ten plan?</strong><ul>{first.explanations.map((text, index) => <li key={index}>{text}</li>)}</ul></div> : null}
                {first.metrics && <div className="metrics">{Object.entries(first.metrics).map(([key, score]) => <div className="metric" key={key}><span>{key}</span><div className="meter"><i style={{ width: `${Math.max(0, Math.min(100, score * 100))}%` }} /></div><b>{Math.round(score * 100)}%</b></div>)}</div>}
              </article>}
              {recommendations.length > 1 && <section className="other-plans"><h3>Inne warianty</h3>{recommendations.slice(1).map((item, index) => <div className="other-plan" key={index}><span>Wariant {index + 2}</span><strong>{item.rotation.map((id) => displayName(crops, id)).join(' → ')}</strong><b>{Math.round(item.score * 100)} pkt</b></div>)}</section>}
              {result.disclaimer && <p className="disclaimer">ⓘ {result.disclaimer}</p>}
            </>}
          </section>
        </div>
        <footer>TerraRotation · Dane historyczne NASA POWER i szacunki gleby SoilGrids. Wyniki są demonstracyjne — nie zastępują porady agronomicznej.</footer>
      </main>
    </div>
  );
}
