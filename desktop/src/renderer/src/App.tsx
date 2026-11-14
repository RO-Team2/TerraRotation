import { useEffect, useState } from 'react';
import FieldAnalysis from './FieldAnalysis';
import TeamDashboard from './TeamDashboard';
import LiveTeamStats from './LiveTeamStats';
import './product-ui.css';

type View = 'live' | 'team';
type UserProfile = { name: string; role: string; farm: string };
const PROFILE_KEY = 'terrarotation.user-profile.v1';
const DEFAULT_PROFILE: UserProfile = { name: 'Użytkownik', role: 'Rolnik / agronom', farm: 'Moje gospodarstwo' };

function loadProfile(): UserProfile {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    return stored ? { ...DEFAULT_PROFILE, ...JSON.parse(stored) as Partial<UserProfile> } : DEFAULT_PROFILE;
  } catch { return DEFAULT_PROFILE; }
}

export default function App() {
  const [view, setView] = useState<View>('live');
  const [profile, setProfile] = useState<UserProfile>(loadProfile);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  return <>
    <nav className="app-view-switch" aria-label="Widok aplikacji">
      <button aria-pressed={view === 'live'} onClick={() => setView('live')}>Analiza LIVE i mapa</button>
      <button aria-pressed={view === 'team'} onClick={() => setView('team')}>Panel zespołu</button>
      <button className="profile-toggle" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}>
        <span className="profile-avatar">{profile.name.trim().charAt(0).toUpperCase() || 'U'}</span>
        <span>{profile.name || 'Profil użytkownika'}</span>
      </button>
    </nav>
    {profileOpen && <section className="profile-popover" aria-label="Profil użytkownika">
      <div className="profile-heading"><div className="profile-avatar large">{profile.name.trim().charAt(0).toUpperCase() || 'U'}</div><div><strong>Profil użytkownika</strong><small>Ustawienia zapisują się lokalnie</small></div></div>
      <label>Imię i nazwisko<input value={profile.name} maxLength={60} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label>
      <label>Rola<input value={profile.role} maxLength={80} onChange={(event) => setProfile({ ...profile, role: event.target.value })} /></label>
      <label>Gospodarstwo<input value={profile.farm} maxLength={100} onChange={(event) => setProfile({ ...profile, farm: event.target.value })} /></label>
      <button className="profile-done" onClick={() => setProfileOpen(false)}>Gotowe</button>
    </section>}
    <div hidden={view !== 'live'}><FieldAnalysis visible={view === 'live'} /></div>
    {view === 'team' && <section className="team-dashboard-view"><LiveTeamStats /><TeamDashboard /></section>}
  </>;
}
