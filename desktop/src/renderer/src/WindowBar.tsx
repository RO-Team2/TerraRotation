export default function WindowBar() {
  return <header className="window-bar">
    <span>TerraRotation</span>
    <div className="window-buttons">
      <button aria-label="Minimize window" title="Minimize" onClick={() => void window.terraApi.windowControl('minimize')}>−</button>
      <button aria-label="Maximize or restore window" title="Maximize / restore" onClick={() => void window.terraApi.windowControl('maximize')}>□</button>
      <button className="window-close" aria-label="Close application" title="Close" onClick={() => void window.terraApi.windowControl('close')}>×</button>
    </div>
  </header>;
}
