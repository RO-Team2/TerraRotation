import { useCallback, useEffect, useState } from 'react';
import { Activity, Cloud, Sprout, Wifi, WifiOff } from 'lucide-react';

type LiveSnapshot = {
  online: boolean | null;
  service: string;
  version: string;
  cropCount: number | null;
  scenarios: string[];
  checkedAt: Date | null;
  error: string;
};

const initial: LiveSnapshot = {
  online: null, service: 'Sprawdzanie backendu…', version: '', cropCount: null,
  scenarios: [], checkedAt: null, error: '',
};

export default function LiveTeamStats() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot>(initial);
  const refresh = useCallback(async () => {
    try {
      const [health, crops, config] = await Promise.all([
        window.terraApi.health(), window.terraApi.crops(), window.terraApi.config(),
      ]);
      setSnapshot({
        online: health.status === 'ok',
        service: health.service ?? 'TerraRotation API',
        version: health.version ?? '',
        cropCount: crops.crops?.length ?? 0,
        scenarios: config.scenarios ?? [],
        checkedAt: new Date(),
        error: '',
      });
    } catch (reason) {
      setSnapshot((previous) => ({
        ...previous, online: false, checkedAt: new Date(),
        error: reason instanceof Error ? reason.message : 'Nie udało się odczytać danych backendu.',
      }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const synced = snapshot.checkedAt?.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) ?? '—';
  return <section className="live-team-stats" aria-live="polite">
    <div className="live-team-heading">
      <div><span className="live-kicker"><Activity size={14} /> DANE NA ŻYWO Z APLIKACJI</span><h2>Stan zespołu i usług</h2><p>Statystyki pobierane z aktywnego backendu, odświeżane co 15 sekund.</p></div>
      <button className="live-refresh" onClick={() => void refresh()}>Odśwież teraz</button>
    </div>
    <div className="live-stat-grid">
      <article className="live-stat"><span>Status API</span><strong className={snapshot.online ? 'online-text' : snapshot.online === false ? 'offline-text' : ''}>{snapshot.online === null ? 'Sprawdzanie…' : snapshot.online ? 'Połączono' : 'Offline'}</strong><small>{snapshot.service}{snapshot.version ? ` · v${snapshot.version}` : ''}</small>{snapshot.online ? <Wifi size={16} /> : <WifiOff size={16} />}</article>
      <article className="live-stat"><span>Katalog upraw</span><strong>{snapshot.cropCount ?? '—'}</strong><small>pozycji pobranych z API</small><Sprout size={16} /></article>
      <article className="live-stat"><span>Scenariusze API</span><strong>{snapshot.scenarios.length || '—'}</strong><small>{snapshot.scenarios.join(' · ') || 'brak danych'}</small><Cloud size={16} /></article>
      <article className="live-stat"><span>Ostatnie sprawdzenie</span><strong>{synced}</strong><small>{snapshot.checkedAt ? 'automatyczna synchronizacja' : 'oczekuje na odpowiedź'}</small><Activity size={16} /></article>
    </div>
    {snapshot.error && <p className="live-api-error" role="status">Backend niedostępny: {snapshot.error}</p>}
    <p className="live-data-note">To są bieżące dane usługowe API, a nie statystyki całego zespołu ani deklarowane wyniki produkcyjne.</p>
  </section>;
}
