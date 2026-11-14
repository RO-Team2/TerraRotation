const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'terrarotation-pdf-'));
const project = path.resolve(__dirname, '..');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

const metrics = { fit: .92, soil: .74, resilience: .81, profit: .65, diversity: 1 };
const plan = { rotation: ['pea', 'rapeseed', 'potato', 'rye'], score: .89, metrics,
  explanations: ['Zmianowanie obejmuje cztery lata i różne rodziny botaniczne.'], year_by_year: [] };
const recommendation = {
  input: { latitude: 52.28, longitude: 16.7, years: 4, scenario: 'balanced' },
  soil: { source: 'SoilGrids TEST', layers: [{ depth: '0-5cm', ph: 6.3, sand_pct: 40, clay_pct: 25, silt_pct: 35, soc_g_kg: 20 }] },
  climate: { source: 'NASA POWER TEST', avg_temp_c: 9.5, annual_rain_mm: 600, climate_years: 10, annual_rain_std_mm: 80, dry_spell_max_days: 20, frost_days_mean: 40 },
  engine: { status: 'ok', recommendations: [plan, { ...plan, rotation: ['rye', 'pea', 'rapeseed', 'potato'], score: .86 }] },
  disclaimer: 'ANALYSIS_END: Wyniki wymagają sprawdzenia w terenie.',
};
const satellite = { source: 'Sentinel-2', resolution_m: 10, crs: 'EPSG:32633', start_date: '2024-06-01', end_date: '2024-06-15',
  geometry: { type: 'Polygon', coordinates: [[[16.7,52.28],[16.701,52.28],[16.701,52.281],[16.7,52.28]]] }, area_ha: 1,
  stats: { mean: .65, median: .66, min: .2, max: .9, valid_pixels: 900, total_pixels: 1000, valid_percent: 90 },
  assessment: 'Roślinność wymaga interpretacji w kontekście fazy uprawy.', warnings: ['NDVI_END: Nie jest to pomiar plonu.'], geotiff: null };
const report = {
  status: 'partial', latitude: 52.28, longitude: 16.7, start_date: '2024-06-01', end_date: '2024-06-15',
  power: { status: 'ok', data: { mean_temp_c: 22.4, rain_mm: 18, valid_days: 15, days_requested: 15, coverage_percent: 100, hot_days: 2, frost_days: 0, resolution: 'Regionalna siatka POWER' } },
  sentinel: { status: 'ok', data: satellite },
  smap: { status: 'ok', data: { surface_moisture_percent: 18.4, observation_date: '2024-06-14', orbit: 'PM', resolution_km: 36, depth_cm: '0–5', quality_flag: 0, pixel_latitude:52.3, pixel_longitude:16.8, distance_to_pixel_center_km: 7, sampling: 'Pomiar powierzchniowy.' } },
  ecostress: { status: 'unavailable', data: null, message: 'ECOSTRESS_EMPTY: Brak bezchmurnego przelotu ISS w wybranym okresie.' },
  findings: Array.from({ length: 12 }, (_, index) => ({ code: `finding-${index}`, severity: 'watch', title: `Interpretacja ${index + 1}`,
    evidence: ['POWER, NDVI i wilgotność są niezależnymi pomiarami.', 'Długi opis dowodów pozostaje czytelny po podziale na strony A4.'],
    action: `FIELD_CHECK_${index}: Sprawdź warunki gleby i stan roślinności w terenie; porównaj dane z fazą rozwojową uprawy.` })),
  warnings: ['LIMITS_END: Interpretacja heurystyczna nie zastępuje badań terenowych.'],
};
const job = { id: 'pdf-test', status: 'completed', completed_sources: 4, result: report };
const preload = path.join(output, 'preload.cjs');
fs.writeFileSync(preload, `const {contextBridge} = require('electron');
const recommendation = ${JSON.stringify(recommendation)}; const job = ${JSON.stringify(job)};
contextBridge.exposeInMainWorld('terraApi', {
health: async () => ({status:'ok'}), crops:async()=>({crops:[]}), config:async()=>({}),
recommend:async()=>recommendation, mapJobStart:async()=>job, mapJobStatus:async()=>job, mapJobCancel:async()=>job,
windowControl:async()=>{}, exportPdf:async()=>({}) });`);

const serviceModule = new Module(path.join(project, 'src/main/exportService.test.cjs'), module);
serviceModule.filename = path.join(project, 'src/main/exportService.test.cjs');
serviceModule.paths = module.paths;
serviceModule._compile(ts.transpileModule(fs.readFileSync(path.join(project, 'src/main/exportService.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, serviceModule.filename);
const { captureActiveReport, renderReportPdf, savePdfReportDialog } = serviceModule.exports;

async function waitFor(win, expression) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await win.webContents.executeJavaScript(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${expression}`);
}
const capture = (win, view) => win.webContents.executeJavaScript(`(${captureActiveReport.toString()})(${JSON.stringify(view)})`);
async function verifyPdf(name, snapshot, expected, excluded) {
  const pdf = await renderReportPdf(snapshot);
  const filename = path.join(output, `${name}.pdf`);
  fs.writeFileSync(filename, pdf);
  const text = execFileSync('pdftotext', ['-layout', filename, '-'], { encoding: 'utf8' });
  for (const value of expected) assert(text.includes(value), `Missing in ${name}: ${value}`);
  for (const value of excluded) assert(!text.includes(value), `Unexpected in ${name}: ${value}`);
  const info = execFileSync('pdfinfo', [filename], { encoding: 'utf8' });
  const size = info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/);
  assert(size && Math.abs(Number(size[1]) - 595.28) < 1 && Math.abs(Number(size[2]) - 841.89) < 1, info);
  console.log(`${name}: ${info.match(/Pages:\s+\d+/)[0]}, A4; content and isolation OK`);
  return text;
}

app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, width: 1480, height: 1000,
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    win.webContents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }));
    await win.loadFile(path.join(project, 'out/renderer/index.html'));
    await waitFor(win, `!!document.querySelector('[data-pdf-report="analysis"]')`);
    await assert.rejects(capture(win, 'analysis'));
    await win.webContents.executeJavaScript(`document.querySelector('[data-pdf-report=analysis]').parentElement.querySelector('form').requestSubmit()`);
    await waitFor(win, `document.querySelector('[data-pdf-report="analysis"]').dataset.pdfReady === 'true'`);
    const analysis = await capture(win, 'analysis');
    const analysisText = await verifyPdf('analysis', analysis,
      ['Plan zmianowania', 'SoilGrids TEST', 'NASA POWER TEST', 'ROK 4', 'Inne warianty', 'ANALYSIS_END'],
      ['NASA SMAP', 'NASA ECOSTRESS', 'Ustawienia pola', 'Eksportuj do PDF']);
    assert(analysisText.includes('92%'), 'Fit chart percentage is missing');
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.nav-item')).find(button => button.textContent.includes('Mapa')).click()`);
    await win.webContents.executeJavaScript(`document.querySelector('.field-selection').closest('form').requestSubmit()`);
    await waitFor(win, `document.querySelector('[data-pdf-report="map"]').dataset.pdfReady === 'true'`);
    const map = await capture(win, 'map');
    // Switching tabs after capture must not change the frozen satellite report.
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.nav-item')).find(button => button.textContent.includes('Analiza pola')).click()`);
    await assert.rejects(capture(win, 'map'));
    const mapText = await verifyPdf('map', map,
      ['Raport satelitarny', 'NASA POWER', 'Sentinel-2', 'NASA SMAP', 'NASA ECOSTRESS', 'ECOSTRESS_EMPTY', 'FIELD_CHECK_11', 'LIMITS_END', 'NDVI_END'],
      ['Plan zmianowania', 'Wybierz pole', 'Eksportuj do PDF', 'Zdjęcia terenu', 'ANALYSIS_END']);
    assert(mapText.split('\f').length > 2, 'Long report must paginate');
    // Cancelled save dialogs must not create a print window or output file.
    const { dialog } = require('electron');
    const originalDialog = dialog.showSaveDialog;
    try {
      dialog.showSaveDialog = async () => ({ canceled: true });
      assert.deepEqual(await savePdfReportDialog(win, 'analysis'), {});
      // The dialog may remain open while the active tab changes. Export the captured plan.
      dialog.showSaveDialog = async () => {
        await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.nav-item')).find(button => button.textContent.includes('Mapa')).click()`);
        return { canceled: false, filePath: path.join(output, 'saved-plan') };
      };
      const saved = await savePdfReportDialog(win, 'analysis');
      assert(saved.savedPath.endsWith('.pdf'));
      const savedText = execFileSync('pdftotext', [saved.savedPath, '-'], { encoding: 'utf8' });
      assert(savedText.includes('ANALYSIS_END'));
      assert(!savedText.includes('ECOSTRESS_EMPTY'));
      console.log('Save dialog cancellation, extension and tab-switch snapshot OK');
    } finally { dialog.showSaveDialog = originalDialog; }
    console.log(`PDF artifacts: ${output}`);
    win.destroy(); app.exit(0);
  } catch (error) {
    console.error(error); if (win && !win.isDestroyed()) win.destroy(); app.exit(1);
  }
});
setTimeout(() => { console.error('PDF test timeout'); app.exit(1); }, 90000).unref();
