import { useState } from 'react';
import FieldAnalysis from './FieldAnalysis';
import TeamDashboard from './TeamDashboard';

export default function App() {
  const [view, setView] = useState<'live' | 'team'>('live');
  return <>
    <nav className="app-view-switch" aria-label="Widok aplikacji">
      <button aria-pressed={view === 'live'} onClick={() => setView('live')}>Analiza LIVE i mapa</button>
      <button aria-pressed={view === 'team'} onClick={() => setView('team')}>Panel zespołu · DEMO</button>
    </nav>
    <div hidden={view !== 'live'}><FieldAnalysis visible={view === 'live'} /></div>
    {view === 'team' && <section className="team-dashboard-view"><TeamDashboard /></section>}
  </>;
}
