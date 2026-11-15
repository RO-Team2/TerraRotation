import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronLeft, Compass, Leaf, MapPin, X } from 'lucide-react';
import './startup.css';

const FIRST_RUN_KEY = 'terrarotation.first-run-complete.v1';
const SPLASH_DURATION_MS = 2200;

const steps = [
  {
    eyebrow: 'STEP 1 OF 3',
    title: 'Introduce your farm',
    description: 'Complete your local profile with your farm name, role, and region. You can edit it later using the button in the top bar.',
    icon: Compass,
    action: 'Set up profile later',
  },
  {
    eyebrow: 'STEP 2 OF 3',
    title: 'Start the backend',
    description: 'Crop rotation analysis requires the FastAPI backend. Start it in a WSL terminal from the repository directory, then start the desktop app in a second terminal.',
    icon: Leaf,
    action: 'Next',
  },
  {
    eyebrow: 'STEP 3 OF 3',
    title: 'Sentinel-2 is optional',
    description: 'The basemap and NASA POWER / SoilGrids crop rotation analysis work independently. Sentinel-2 NDVI analysis requires Copernicus OAuth configured only in the backend terminal. Never store the secret in the app or repository.',
    icon: MapPin,
    action: 'Get started',
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

    {splash && <section className="welcome-splash" aria-label="Welcome to TerraRotation">
      <div className="welcome-orbit welcome-orbit-one" />
      <div className="welcome-orbit welcome-orbit-two" />
      <div className="welcome-content">
        <img className="welcome-logo" src="/terrarotation.svg" alt="TerraRotation" />
        <div className="welcome-rule"><span /></div>
        <p>Smart decisions for healthy soil</p>
        <div className="welcome-loading"><span /><span /><span /></div>
      </div>
      <span className="welcome-footer">NASA EARTH DATA · FIELD INTELLIGENCE</span>
    </section>}

    {tutorial && !splash && <div className="setup-backdrop">
      <section className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <button className="setup-close" onClick={finishTutorial} aria-label="Skip tutorial"><X size={18} /></button>
        <img className="setup-logo" src="/terrarotation.svg" alt="TerraRotation" />
        <div className="setup-step-indicator">{steps.map((item, index) => <span key={item.eyebrow} className={index <= step ? 'complete' : ''} />)}</div>
        <div className="setup-copy" key={step}>
          <span className="setup-eyebrow">{steps[step].eyebrow} · SETUP</span>
          <div className="setup-icon"><CurrentIcon size={23} /></div>
          <h1 id="setup-title">{steps[step].title}</h1>
          <p>{steps[step].description}</p>
        </div>
        <div className="setup-note"><Check size={15} /> You can change these settings easily and start working right away.</div>
        <footer className="setup-actions">
          <button className="setup-skip" onClick={finishTutorial}>Skip tutorial</button>
          {step > 0 && <button className="setup-back" onClick={() => setStep((current) => current-1)}><ChevronLeft size={16} /> Back</button>}
          <button className="setup-next" onClick={() => step === steps.length-1 ? finishTutorial() : setStep((current) => current+1)}>
            {steps[step].action}<ArrowRight size={16} />
          </button>
        </footer>
      </section>
    </div>}
  </>;
}
