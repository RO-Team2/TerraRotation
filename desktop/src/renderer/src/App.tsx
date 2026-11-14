import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, MapPin, Pencil, RotateCcw, UserRound, X } from 'lucide-react';
import FieldAnalysis from './FieldAnalysis';
import TeamDashboard from './TeamDashboard';
import LiveTeamStats from './LiveTeamStats';
import './product-ui.css';
import './profile.css';

type View = 'live' | 'team';
type UserProfile = {
  name: string;
  role: string;
  farm: string;
  email: string;
  region: string;
  avatarColor: string;
};

const PROFILE_KEY = 'terrarotation.user-profile.v2';
const DEFAULT_PROFILE: UserProfile = {
  name: '', role: 'Rolnik / agronom', farm: '', email: '', region: '', avatarColor: '#245440',
};
const AVATAR_COLORS = ['#245440', '#4477a8', '#8a5a35', '#71569b', '#a3545c'];

function loadProfile(): UserProfile {
  try {
    const stored = localStorage.getItem(PROFILE_KEY);
    if (!stored) return DEFAULT_PROFILE;
    const parsed: Partial<UserProfile> = JSON.parse(stored);
    return {
      ...DEFAULT_PROFILE,
      ...Object.fromEntries(Object.keys(DEFAULT_PROFILE).map((key) => [
        key,
        typeof parsed[key as keyof UserProfile] === 'string'
          ? parsed[key as keyof UserProfile]
          : DEFAULT_PROFILE[key as keyof UserProfile],
      ])),
    } as UserProfile;
  } catch {
    return DEFAULT_PROFILE;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('') : 'U';
}

export default function App() {
  const [view, setView] = useState<View>('live');
  const [profile, setProfile] = useState<UserProfile>(loadProfile);
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [profileOpen, setProfileOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  const profileCompletion = useMemo(() => {
    const fields = [profile.name, profile.role, profile.farm, profile.email, profile.region];
    return Math.round(fields.filter((field) => field.trim().length > 0).length / fields.length * 100);
  }, [profile]);

  function openProfile() {
    setDraft(profile);
    setSaved(false);
    setProfileOpen(true);
  }

  function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) as UserProfile;
    setProfile(next);
    setSaved(true);
    window.setTimeout(() => setProfileOpen(false), 450);
  }

  return <div className={view === 'team' ? 'app-layout app-layout-team' : 'app-layout'}>
    <nav className="app-view-switch" aria-label="Widok aplikacji">
      <button aria-pressed={view === 'live'} onClick={() => setView('live')}>Analiza LIVE i mapa</button>
      <button aria-pressed={view === 'team'} onClick={() => setView('team')}>Panel zespołu</button>
      <button className="profile-toggle profile-toggle-enhanced" aria-expanded={profileOpen} onClick={openProfile}>
        <span className="profile-avatar" style={{ backgroundColor: profile.avatarColor }}>{initials(profile.name)}</span>
        <span className="profile-toggle-copy"><strong>{profile.name || 'Ustaw profil'}</strong><small>{profile.farm || 'Profil lokalny'}</small></span>
        <ChevronDown size={15} />
      </button>
    </nav>
    <div hidden={view !== 'live'}><FieldAnalysis visible={view === 'live'} /></div>
    {view === 'team' && <section className="team-dashboard-view"><LiveTeamStats /><TeamDashboard /></section>}

    {profileOpen && <div className="profile-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
      <section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header className="profile-dialog-header">
          <div className="profile-dialog-identity">
            <span className="profile-avatar profile-avatar-xl" style={{ backgroundColor: draft.avatarColor }}>{initials(draft.name)}</span>
            <div><span className="profile-eyebrow"><UserRound size={13} /> KONTO LOKALNE</span><h2 id="profile-title">Profil użytkownika</h2><p>Dane profilu są zapisane wyłącznie na tym urządzeniu.</p></div>
          </div>
          <button className="profile-close" aria-label="Zamknij profil" onClick={() => setProfileOpen(false)}><X size={18} /></button>
        </header>
        <div className="profile-completion"><div><span>Uzupełnienie profilu</span><strong>{profileCompletion}%</strong></div><div className="profile-progress"><span style={{ width: `${profileCompletion}%` }} /></div></div>
        <form className="profile-form" onSubmit={saveProfile}>
          <div className="profile-form-grid">
            <label>Imię i nazwisko<input autoFocus autoComplete="name" maxLength={60} placeholder="np. Julia Nowak" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>Rola w gospodarstwie<input maxLength={80} placeholder="np. właścicielka, agronom" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} /></label>
            <label>Gospodarstwo<input maxLength={100} placeholder="Nazwa gospodarstwa" value={draft.farm} onChange={(event) => setDraft({ ...draft, farm: event.target.value })} /></label>
            <label>E-mail kontaktowy <span className="profile-optional">opcjonalnie</span><input type="email" autoComplete="email" maxLength={120} placeholder="adres@gospodarstwo.pl" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
            <label className="profile-region-label"><span className="profile-label-with-icon"><MapPin size={14} /> Region / lokalizacja</span><input maxLength={100} placeholder="np. Kujawy, Polska" value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })} /></label>
          </div>
          <fieldset className="avatar-colors"><legend>Kolor awatara</legend><div>{AVATAR_COLORS.map((color) => <button key={color} type="button" className={`avatar-color ${draft.avatarColor === color ? 'selected' : ''}`} style={{ backgroundColor: color }} aria-label={`Wybierz kolor ${color}`} aria-pressed={draft.avatarColor === color} onClick={() => setDraft({ ...draft, avatarColor: color })}>{draft.avatarColor === color && <Check size={15} />}</button>)}</div></fieldset>
          <footer className="profile-dialog-actions">
            <button type="button" className="profile-reset" onClick={() => setDraft(DEFAULT_PROFILE)}><RotateCcw size={14} /> Przywróć domyślne</button>
            <button type="button" className="profile-cancel" onClick={() => setProfileOpen(false)}>Anuluj</button>
            <button type="submit" className="profile-save"><Check size={15} /> {saved ? 'Zapisano' : 'Zapisz profil'}</button>
          </footer>
        </form>
      </section>
    </div>}
  </div>;
}
