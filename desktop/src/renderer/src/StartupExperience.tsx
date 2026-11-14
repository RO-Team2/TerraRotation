import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronLeft, Compass, Leaf, MapPin, X } from 'lucide-react';
import './startup.css';

const FIRST_RUN_KEY = 'terrarotation.first-run-complete.v1';
const SPLASH_DURATION_MS = 2200;

const steps = [
  {
    eyebrow: 'KROK 1 Z 3',
    title: 'Poznaj swoje gospodarstwo',
    description: 'Uzupełnij lokalny profil użytkownika: nazwę gospodarstwa, rolę i region. Profil można później edytować z przycisku w górnym pasku.',
    icon: Compass,
    action: 'Otwórz profil później',
  },
  {
    eyebrow: 'KROK 2 Z 3',
    title: 'Uruchom backend',
    description: 'Analiza płodozmianu wymaga uruchomionego API FastAPI. Uruchom je w terminalu WSL z katalogu repozytorium; aplikację desktopową uruchom w drugim terminalu.',
    icon: Leaf,
    action: 'Dalej',
  },
  {
    eyebrow: 'KROK 3 Z 3',
    title: 'Sentinel-2 jest opcjonalny',
    description: 'Podkład mapy oraz płodozmian NASA POWER / SoilGrids działają niezależnie. Analiza NDVI Sentinel-2 wymaga OAuth Copernicus ustawionego wyłącznie w terminalu backendu. Nigdy nie zapisuj sekretu w aplikacji ani w repozytorium.',
    icon: MapPin,
    action: 'Rozpocznij pracę',
  },
];

export default function StartupExperience({ children }: { children: ReactNode }) {
  const [splash, setSplash] = useState(true);
  const [tutorial, setTutorial] = useState(false);
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSplash(false);
      setVisible(true);
      if (localStorage.getItem(FIRST_RUN_KEY) !== 'true') setTutorial(true);
    }, SPLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  function finishTutorial() {
    localStorage.setItem(FIRST_RUN_KEY, 'true');
    setTutorial(false);
  }

  const CurrentIcon = steps[step].icon;
  return <>
    <div className={`startup-app ${visible ? 'startup-app-visible' : ''}`} aria-hidden={splash || tutorial}>
      {children}
    </div>

    {splash && <section className="welcome-splash" aria-label="Witamy w TerraRotation">
      <div className="welcome-orbit welcome-orbit-one" />
      <div className="welcome-orbit welcome-orbit-two" />
      <div className="welcome-content">
        <img className="welcome-logo" src="/terrarotation-lockup.svg" alt="TerraRotation" />
        <div className="welcome-rule"><span /></div>
        <p>Inteligentne decyzje dla zdrowej gleby</p>
        <div className="welcome-loading"><span /><span /><span /></div>
      </div>
      <span className="welcome-footer">NASA EARTH DATA · FIELD INTELLIGENCE</span>
    </section>}

    {tutorial && !splash && <div className="setup-backdrop">
      <section className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <button className="setup-close" onClick={finishTutorial} aria-label="Pomiń samouczek"><X size={18} /></button>
        <img className="setup-logo" src="/terrarotation-lockup.svg" alt="TerraRotation" />
        <div className="setup-step-indicator">{steps.map((item, index) => <span key={item.eyebrow} className={index <= step ? 'complete' : ''} />)}</div>
        <div className="setup-copy" key={step}>
          <span className="setup-eyebrow">{steps[step].eyebrow} · KONFIGURACJA</span>
          <div className="setup-icon"><CurrentIcon size={23} /></div>
          <h1 id="setup-title">{steps[step].title}</h1>
          <p>{steps[step].description}</p>
        </div>
        <div className="setup-note"><Check size={15} /> Ustawienia są proste do zmiany i nie blokują rozpoczęcia pracy.</div>
        <footer className="setup-actions">
          <button className="setup-skip" onClick={finishTutorial}>Pomiń samouczek</button>
          {step > 0 && <button className="setup-back" onClick={() => setStep((current) => current - 1)}><ChevronLeft size={16} /> Wstecz</button>}
          <button className="setup-next" onClick={() => step === steps.length - 1 ? finishTutorial() : setStep((current) => current + 1)}>
            {steps[step].action}<ArrowRight size={16} />
          </button>
        </footer>
      </section>
    </div>}
  </>;
}
