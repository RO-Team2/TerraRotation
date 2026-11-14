export default function WindowBar() {
  return <header className="window-bar">
    <span>TerraRotation</span>
    <div className="window-buttons">
      <button aria-label="Minimalizuj okno" title="Minimalizuj" onClick={() => void window.terraApi.windowControl('minimize')}>−</button>
      <button aria-label="Maksymalizuj lub przywróć okno" title="Maksymalizuj / przywróć" onClick={() => void window.terraApi.windowControl('maximize')}>□</button>
      <button className="window-close" aria-label="Zamknij aplikację" title="Zamknij" onClick={() => void window.terraApi.windowControl('close')}>×</button>
    </div>
  </header>;
}
