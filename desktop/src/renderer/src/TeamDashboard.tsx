import React, { useMemo, useState } from 'react';
import {
  Satellite,
  Droplets,
  ThermometerSun,
  Mountain,
  Sprout,
  ShieldCheck,
  TrendingUp,
  Wifi,
  WifiOff,
  RefreshCw,
  Layers,
  PenTool,
  Download,
  FileText,
  AlertTriangle,
  Sliders,
  Compass,
  Minus,
  Square,
  X,
  Sparkles,
  CloudRain,
  Activity,
  CheckCircle2,
  ArrowRight,
  Grid,
  RotateCcw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  FieldData,
  NasaMetrics,
  FarmerPriorities,
  StressScenario,
  generateOptimalRotation,
} from './utils/rotationEngine';

type MapLayer = 'satellite' | 'smap' | 'ecostress' | 'srtm';

interface FarmProfile {
  id: string;
  name: string;
  region: string;
  fields: FieldData[];
}

const FARMS_DATA: FarmProfile[] = [
  {
    id: 'farm-wlkp',
    name: 'Gospodarstwo Wielkopolska Północ',
    region: 'Powiat obornicki • 52.65°N, 16.81°E',
    fields: [
      {
        id: 'field-104a',
        name: 'Kwatera A4 — Dębowa Górka',
        parcelNumber: '301602_2.0014.104/2',
        areaHa: 48.6,
        soilType: 'gliniasta',
        soilPh: 6.4,
        organicMatterPct: 2.45,
        slopeDeg: 3.1,
        center: [16.8124, 52.6542],
        coordinates: [
          [18, 22],
          [76, 16],
          [84, 68],
          [52, 82],
          [15, 71],
        ],
      },
      {
        id: 'field-209b',
        name: 'Pole B9 — Dolina Wełny',
        parcelNumber: '301602_2.0014.209/1',
        areaHa: 62.3,
        soilType: 'mada_rzeczna',
        soilPh: 6.7,
        organicMatterPct: 3.1,
        slopeDeg: 1.2,
        center: [16.8291, 52.6488],
        coordinates: [
          [22, 18],
          [82, 24],
          [78, 78],
          [28, 74],
        ],
      },
      {
        id: 'field-312c',
        name: 'Działka C2 — Piaski Wschodnie',
        parcelNumber: '301602_2.0014.312/4',
        areaHa: 34.8,
        soilType: 'piaszczysta',
        soilPh: 5.5,
        organicMatterPct: 1.65,
        slopeDeg: 4.8,
        center: [16.8415, 52.6601],
        coordinates: [
          [25, 25],
          [72, 19],
          [80, 62],
          [44, 79],
          [19, 55],
        ],
      },
    ],
  },
  {
    id: 'farm-kujawy',
    name: 'Majątek Rolny Kujawy Zachód',
    region: 'Powiat inowrocławski • 52.79°N, 18.26°E',
    fields: [
      {
        id: 'field-k01',
        name: 'Kompleks Czarnoziem S1',
        parcelNumber: '040704_2.0008.88/1',
        areaHa: 94.2,
        soilType: 'gliniasta',
        soilPh: 6.8,
        organicMatterPct: 3.35,
        slopeDeg: 1.5,
        center: [18.2612, 52.7931],
        coordinates: [
          [16, 20],
          [84, 20],
          [84, 76],
          [16, 76],
        ],
      },
    ],
  },
];

const NASA_METRICS_BY_FIELD: Record<string, NasaMetrics> = {
  'field-104a': {
    smapSurfaceMoisturePct: 23.4,
    smapRootZoneMoisturePct: 27.8,
    ecostressTempC: 28.6,
    ecostressEsi: 0.69,
    gpmAnnualPrecipMm: 518,
    gpmPrecipTrendPct: -11.4,
    gpmExtremeRainDays: 6,
    powerFrostRiskDays: 9,
    powerHeatStressDays: 14,
    ndviCurrent: 0.74,
    lastSyncIso: '14.11.2026 • 06:30 UTC',
  },
  'field-209b': {
    smapSurfaceMoisturePct: 31.2,
    smapRootZoneMoisturePct: 35.6,
    ecostressTempC: 25.1,
    ecostressEsi: 0.84,
    gpmAnnualPrecipMm: 534,
    gpmPrecipTrendPct: -7.2,
    gpmExtremeRainDays: 5,
    powerFrostRiskDays: 11,
    powerHeatStressDays: 10,
    ndviCurrent: 0.82,
    lastSyncIso: '14.11.2026 • 06:30 UTC',
  },
  'field-312c': {
    smapSurfaceMoisturePct: 14.9,
    smapRootZoneMoisturePct: 18.2,
    ecostressTempC: 33.4,
    ecostressEsi: 0.46,
    gpmAnnualPrecipMm: 492,
    gpmPrecipTrendPct: -15.8,
    gpmExtremeRainDays: 7,
    powerFrostRiskDays: 8,
    powerHeatStressDays: 19,
    ndviCurrent: 0.56,
    lastSyncIso: '14.11.2026 • 06:30 UTC',
  },
  'field-k01': {
    smapSurfaceMoisturePct: 26.5,
    smapRootZoneMoisturePct: 30.1,
    ecostressTempC: 27.2,
    ecostressEsi: 0.76,
    gpmAnnualPrecipMm: 505,
    gpmPrecipTrendPct: -9.8,
    gpmExtremeRainDays: 5,
    powerFrostRiskDays: 7,
    powerHeatStressDays: 13,
    ndviCurrent: 0.79,
    lastSyncIso: '14.11.2026 • 06:30 UTC',
  },
};

const HISTORICAL_CLIMATE_TREND = [
  { year: '2017', gpmMm: 612, smapPct: 31.4, nitrogenIdx: 72 },
  { year: '2018', gpmMm: 468, smapPct: 21.8, nitrogenIdx: 68 },
  { year: '2019', gpmMm: 485, smapPct: 22.9, nitrogenIdx: 74 },
  { year: '2020', gpmMm: 554, smapPct: 28.5, nitrogenIdx: 79 },
  { year: '2021', gpmMm: 579, smapPct: 29.7, nitrogenIdx: 81 },
  { year: '2022', gpmMm: 441, smapPct: 19.6, nitrogenIdx: 75 },
  { year: '2023', gpmMm: 532, smapPct: 26.4, nitrogenIdx: 82 },
  { year: '2024', gpmMm: 496, smapPct: 24.1, nitrogenIdx: 84 },
  { year: '2025', gpmMm: 511, smapPct: 25.0, nitrogenIdx: 86 },
  { year: '2026', gpmMm: 518, smapPct: 27.8, nitrogenIdx: 88 },
];

export function TeamDashboard(): JSX.Element {
  const [selectedFarmId, setSelectedFarmId] = useState<string>(FARMS_DATA[0].id);
  const currentFarm = useMemo(
    () => FARMS_DATA.find((f) => f.id === selectedFarmId) || FARMS_DATA[0],
    [selectedFarmId]
  );

  const [selectedFieldId, setSelectedFieldId] = useState<string>(FARMS_DATA[0].fields[0].id);
  const [customPolygons, setCustomPolygons] = useState<Record<string, [number, number][]>>({});
  const [customAreas, setCustomAreas] = useState<Record<string, number>>({});
  const activeField: FieldData = useMemo(() => {
    const base =
      currentFarm.fields.find((f) => f.id === selectedFieldId) || currentFarm.fields[0];
    return {
      ...base,
      coordinates: customPolygons[base.id] || base.coordinates,
      areaHa: customAreas[base.id] || base.areaHa,
    };
  }, [currentFarm, selectedFieldId, customPolygons, customAreas]);

  const activeMetrics: NasaMetrics = useMemo(
    () => NASA_METRICS_BY_FIELD[activeField.id] || NASA_METRICS_BY_FIELD['field-104a'],
    [activeField.id]
  );

  const [isOfflineCache, setIsOfflineCache] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [priorities, setPriorities] = useState<FarmerPriorities>({
    waterConservation: 80,
    soilHealth: 75,
    nitrogenFixing: 70,
    erosionControl: 65,
    marketValue: 85,
  });

  const [committedPriorities, setCommittedPriorities] = useState<FarmerPriorities>(priorities);
  const [isComputingRotation, setIsComputingRotation] = useState<boolean>(false);
  const [activeLayer, setActiveLayer] = useState<MapLayer>('smap');
  const [isDrawingPolygon, setIsDrawingPolygon] = useState<boolean>(false);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [cursorCoords, setCursorCoords] = useState<{ lat: string; lon: string; elev: string }>({
    lat: '52.6542° N',
    lon: '16.8124° E',
    elev: '94.2 m n.p.m.',
  });

  const [scenario, setScenario] = useState<StressScenario>('normal');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3800);
  };

  const rotationPlan = useMemo(
    () => generateOptimalRotation(activeField, activeMetrics, committedPriorities, scenario, 4),
    [activeField, activeMetrics, committedPriorities, scenario]
  );

  const simulationSummary = useMemo(() => {
    const avgYield =
      rotationPlan.reduce((acc, item) => acc + item.projectedYieldTha, 0) / rotationPlan.length;
    const avgErosion =
      rotationPlan.reduce((acc, item) => acc + item.projectedErosionTha, 0) / rotationPlan.length;
    const totalNitrogenDelta = rotationPlan.reduce(
      (acc, item) => acc + item.crop.nitrogenBalanceKgHa,
      0
    );
    return {
      avgYield: avgYield.toFixed(2),
      avgErosion: avgErosion.toFixed(2),
      totalNitrogenDelta,
    };
  }, [rotationPlan]);

  const handleWindowControl = (action: 'minimize' | 'maximize' | 'close') => {
    if (window.nasaApi?.windowControl) {
      void window.nasaApi.windowControl(action);
    } else {
      triggerToast(`Sygnał okna Electron IPC: ${action.toUpperCase()}`);
    }
  };

  const handleSyncData = async () => {
    if (isOfflineCache) {
      triggerToast('Tryb OFFLINE CACHE aktywny — odczyt z lokalnej bazy NASA JSON/SQLite.');
      return;
    }
    setIsSyncing(true);
    try {
      if (window.nasaApi?.syncNasaData) {
        const res = await window.nasaApi.syncNasaData(activeField.id);
        triggerToast(
          res.fromCache
            ? `Brak sieci — wczytano snapshot NASA z cache dla ${activeField.name}.`
            : `Zsynchronizowano paczkę NASA SMAP/POWER/GPM dla ${activeField.name}.`
        );
      } else {
        await new Promise((r) => setTimeout(r, 650));
        triggerToast(`Zsynchronizowano paczkę NASA SMAP/POWER/GPM dla ${activeField.name}.`);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGenerateRotation = () => {
    setIsComputingRotation(true);
    setTimeout(() => {
      setCommittedPriorities({ ...priorities });
      setIsComputingRotation(false);
      triggerToast('Przeliczono optymalną sekwencję 4-letnią z uwzględnieniem wag i danych NASA.');
    }, 380);
  };

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawingPolygon) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = Number((((e.clientX-rect.left)/rect.width)*100).toFixed(1));
    const yPct = Number((((e.clientY-rect.top)/rect.height)*100).toFixed(1));
    setDraftPoints((prev) => [...prev, [xPct, yPct]]);
  };

  const handleFinishPolygon = () => {
    if (draftPoints.length < 3) {
      triggerToast('Zaznacz minimum 3 wierzchołki granicy pola.');
      return;
    }
    let area = 0;
    for (let i = 0; i < draftPoints.length; i++) {
      const [x1, y1] = draftPoints[i];
      const [x2, y2] = draftPoints[(i + 1) % draftPoints.length];
      area += x1 * y2 - x2 * y1;
    }
    const computedHa = Number(Math.max(5.5, Math.abs(area) * 0.022).toFixed(1));

    setCustomPolygons((prev) => ({ ...prev, [activeField.id]: draftPoints }));
    setCustomAreas((prev) => ({ ...prev, [activeField.id]: computedHa }));
    setDraftPoints([]);
    setIsDrawingPolygon(false);
    triggerToast(`Zapisano nową granicę działki (${computedHa} ha) oraz przeliczono maskę SMAP.`);
  };

  const handleMapMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX-rect.left)/rect.width;
    const relY = (e.clientY-rect.top)/rect.height;
    const lon = (activeField.center[0]-0.015+relX*0.03).toFixed(4);
    const lat = (activeField.center[1]+0.01-relY*0.02).toFixed(4);
    const elev = (88+(1-relY)*14+relX*4).toFixed(1);
    setCursorCoords({
      lat: `${lat}° N`,
      lon: `${lon}° E`,
      elev: `${elev} m n.p.m.`,
    });
  };

  const handleExportGeoJSON = async () => {
    const geoJsonPayload = {
      type: 'FeatureCollection',
      metadata: {
        generator: 'FieldShift // NASA Earth Data v2.0',
        generatedAt: new Date().toISOString(),
        fieldId: activeField.id,
        parcelNumber: activeField.parcelNumber,
        areaHa: activeField.areaHa,
        scenario,
      },
      features: [
        {
          type: 'Feature',
          properties: {
            name: activeField.name,
            soilType: activeField.soilType,
            smapMoisturePct: activeMetrics.smapRootZoneMoisturePct,
            rotationPlan: rotationPlan.map((step, i) => ({
              year: 2027+i,
              crop: step.crop.name,
              score: step.totalScore,
              projectedYieldTha: step.projectedYieldTha,
            })),
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              activeField.coordinates.map(([x, y]) => [
                Number((activeField.center[0]+(x-50)*0.0003).toFixed(6)),
                Number((activeField.center[1]+(50-y)*0.0002).toFixed(6)),
              ]),
            ],
          },
        },
      ],
    };

    if (window.nasaApi?.exportGeoJSON) {
      const res = await window.nasaApi.exportGeoJSON(geoJsonPayload);
      if (res?.savedPath) {
        triggerToast(`Wyeksportowano mapę aplikacyjną GeoJSON: ${res.savedPath}`);
      }
      return;
    }

    const blob = new Blob([JSON.stringify(geoJsonPayload, null, 2)], {
      type: 'application/geo+json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fieldshift_${activeField.id}_tractor.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast(`Pobrano plik GeoJSON dla terminala ciągnika (${activeField.id}).`);
  };

  const handleExportPDF = async () => {
    if (window.nasaApi?.exportPDF) {
      const res = await window.nasaApi.exportPDF({
        field: activeField,
        metrics: activeMetrics,
        rotationPlan,
        scenario,
      });
      if (res?.savedPath) {
        triggerToast(`Zapisano raport PDF: ${res.savedPath}`);
      }
    } else {
      window.print();
      triggerToast('Otwarto okno drukowania/zapisu raportu PDF.');
    }
  };

  const polygonPointsAttr = activeField.coordinates.map(([x, y]) => `${x},${y}`).join(' ');

  return (
    <div className="team-workspace flex flex-col overflow-hidden bg-[#0F172A] text-slate-100 select-none font-sans">
      <header className="team-toolbar flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-[#0B1120] px-4">
        <div className="titlebar-no-drag flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <Satellite className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5 text-sm font-bold tracking-wider text-slate-100">
                FIELDSHIFT <span className="text-emerald-400">//</span>{' '}
                <span className="font-mono text-xs font-medium text-sky-400">NASA EARTH DATA</span>
              </div>
              <div className="text-[10px] tracking-widest text-slate-500 uppercase">
                Tactical Crop Rotation &amp; Telemetry
              </div>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-800" />

          <div className="flex items-center gap-2">
            <Compass className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedFarmId}
              onChange={(e) => {
                const farmId = e.target.value;
                setSelectedFarmId(farmId);
                const nextFarm = FARMS_DATA.find((f) => f.id === farmId);
                if (nextFarm?.fields[0]) setSelectedFieldId(nextFarm.fields[0].id);
              }}
              className="rounded-md border border-slate-700/80 bg-[#1E293B] px-2.5 py-1 text-xs font-medium text-slate-200 outline-none transition hover:border-emerald-500/50 focus:border-emerald-400"
            >
              {FARMS_DATA.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="titlebar-no-drag flex items-center gap-2.5">
          <button
            onClick={() => setIsOfflineCache((prev) => !prev)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
              isOfflineCache
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            }`}
            title="Przełącz tryb pracy Electron Offline Cache / Live NASA API"
          >
            {isOfflineCache ? (
              <>
                <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                <span>OFFLINE CACHE</span>
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                <span>ONLINE TELEMETRY</span>
              </>
            )}
            <span className="border-l border-slate-700 pl-2 font-mono text-[11px] font-normal text-slate-400">
              Sync: {activeMetrics.lastSyncIso}
            </span>
          </button>

          <button
            onClick={handleSyncData}
            disabled={isSyncing}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300 transition hover:border-sky-500/50 hover:text-sky-300 disabled:opacity-50"
            title="Wymuś synchronizację z NASA POWER / SMAP"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-sky-400' : ''}`} />
            <span className="hidden xl:inline">Sync NASA</span>
          </button>
        </div>

        <div className="titlebar-no-drag flex items-center gap-1">
          <button
            onClick={() => handleWindowControl('minimize')}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            aria-label="Minimalizuj"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleWindowControl('maximize')}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
            aria-label="Maksymalizuj"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            onClick={() => handleWindowControl('close')}
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-rose-600 hover:text-white"
            aria-label="Zamknij"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {toastMessage && (
        <div className="fixed top-14 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-emerald-500/50 bg-[#0F172A]/95 px-4 py-2 text-xs font-medium text-emerald-300 shadow-2xl backdrop-blur-md">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="team-columns flex flex-1 overflow-hidden">
        <aside className="team-sidebar team-sidebar-left flex w-[320px] shrink-0 flex-col justify-between border-r border-slate-800 bg-[#1E293B]/75 p-4 backdrop-blur-md overflow-y-auto custom-scrollbar">
          <div className="space-y-5">
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                  Działki ewidencyjne ({currentFarm.fields.length})
                </span>
                <span className="font-mono text-[11px] text-emerald-400">
                  {currentFarm.fields
                    .reduce((s, f) => s + (customAreas[f.id] || f.areaHa), 0)
                    .toFixed(1)}{' '}
                  ha
                </span>
              </div>

              <div className="space-y-2">
                {currentFarm.fields.map((field) => {
                  const isSelected = field.id === activeField.id;
                  const fMetrics = NASA_METRICS_BY_FIELD[field.id];
                  const fArea = customAreas[field.id] || field.areaHa;
                  return (
                    <button
                      key={field.id}
                      onClick={() => {
                        setSelectedFieldId(field.id);
                        setIsDrawingPolygon(false);
                        setDraftPoints([]);
                      }}
                      className={`w-full rounded-lg border p-2.5 text-left transition ${
                        isSelected
                          ? 'border-emerald-500/70 bg-emerald-500/10 shadow-[inset_0_1px_0_rgba(16,185,129,0.25)]'
                          : 'border-slate-700/70 bg-[#0F172A]/60 hover:border-slate-600 hover:bg-[#0F172A]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-100">{field.name}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                            {field.parcelNumber}
                          </div>
                        </div>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-400 tabular-nums">
                          {fArea} ha
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-1.5 text-[11px]">
                        <span className="capitalize text-slate-300">
                          Gleba:{' '}
                          <strong className="font-medium">{field.soilType.replace('_', ' ')}</strong>
                        </span>
                        <span className="flex items-center gap-1 font-mono text-sky-400 tabular-nums">
                          <Droplets className="h-3 w-3" />
                          {fMetrics?.smapRootZoneMoisturePct}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/70 bg-[#0F172A]/70 p-3.5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-slate-200 uppercase">
                  <Sliders className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Priorytety rolnika</span>
                </div>
                <button
                  onClick={() =>
                    setPriorities({
                      waterConservation: 95,
                      soilHealth: 80,
                      nitrogenFixing: 75,
                      erosionControl: 85,
                      marketValue: 55,
                    })
                  }
                  className="text-[10px] font-medium text-amber-400 hover:underline"
                  title="Ustaw profil ochrony przed suszą"
                >
                  Profil: Susza
                </button>
              </div>

              <div className="space-y-3">
                {[
                  {
                    key: 'waterConservation' as const,
                    label: 'Oszczędność wody',
                    accent: 'text-sky-400',
                  },
                  {
                    key: 'soilHealth' as const,
                    label: 'Zdrowie gleby i próchnica',
                    accent: 'text-emerald-400',
                  },
                  {
                    key: 'nitrogenFixing' as const,
                    label: 'Wiązanie azotu',
                    accent: 'text-teal-400',
                  },
                  {
                    key: 'erosionControl' as const,
                    label: 'Redukcja erozji',
                    accent: 'text-amber-400',
                  },
                  {
                    key: 'marketValue' as const,
                    label: 'Opłacalność rynkowa',
                    accent: 'text-indigo-400',
                  },
                ].map((item) => (
                  <div key={item.key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-slate-300">{item.label}</span>
                      <span className={`font-mono font-bold tabular-nums ${item.accent}`}>
                        {priorities[item.key]}%
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label={item.label}
                      min={0}
                      max={100}
                      step={5}
                      value={priorities[item.key]}
                      onChange={(e) =>
                        setPriorities((prev) => ({
                          ...prev,
                          [item.key]: Number(e.target.value),
                        }))
                      }
                      className="tactical-slider w-full"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="team-sidebar-actions mt-4 pt-2">
            <button
              onClick={handleGenerateRotation}
              disabled={isComputingRotation}
              className="group relative flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-3 text-xs font-bold tracking-wide text-slate-950 uppercase shadow-[0_0_24px_rgba(16,185,129,0.35)] transition hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.99] disabled:opacity-60"
            >
              <Sparkles className={`h-4 w-4 ${isComputingRotation ? 'animate-spin' : ''}`} />
              <span>
                {isComputingRotation
                  ? 'Analiza warstw NASA...'
                  : 'Generuj optymalny płodozmian (AI + NASA)'}
              </span>
            </button>
          </div>
        </aside>

        <main className="team-center flex flex-1 flex-col overflow-hidden bg-[#0F172A]">
          <section className="team-map relative w-full border-b border-slate-800 tactical-grid overflow-hidden">
            <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-1 rounded-lg border border-slate-700/80 bg-[#0F172A]/90 p-1 backdrop-blur-md shadow-xl">
              <div className="flex items-center gap-1 px-2 text-[11px] font-semibold text-slate-400">
                <Layers className="h-3.5 w-3.5 text-emerald-400" />
                <span>Warstwa:</span>
              </div>
              {[
                { id: 'satellite' as const, label: 'Satelita', icon: Satellite },
                { id: 'smap' as const, label: 'SMAP Wilgotność', icon: Droplets },
                { id: 'ecostress' as const, label: 'ECOSTRESS Ciepło', icon: ThermometerSun },
                { id: 'srtm' as const, label: 'SRTM 3D Teren', icon: Mountain },
              ].map((layer) => {
                const Icon = layer.icon;
                const active = activeLayer === layer.id;
                return (
                  <button
                    key={layer.id}
                    onClick={() => setActiveLayer(layer.id)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{layer.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#0F172A]/90 p-1 backdrop-blur-md shadow-xl">
              {!isDrawingPolygon ? (
                <button
                  onClick={() => {
                    setIsDrawingPolygon(true);
                    setDraftPoints([]);
                    triggerToast('Kliknij na mapie kolejne wierzchołki granicy działki.');
                  }}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-800 hover:text-emerald-400"
                >
                  <PenTool className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Rysuj granicę pola</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleFinishPolygon}
                    className="rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                  >
                    Zatwierdź ({draftPoints.length} pkt)
                  </button>
                  <button
                    onClick={() => {
                      setIsDrawingPolygon(false);
                      setDraftPoints([]);
                    }}
                    className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-white"
                  >
                    Anuluj
                  </button>
                </>
              )}
              {customPolygons[activeField.id] && (
                <button
                  onClick={() => {
                    setCustomPolygons((prev) => {
                      const copy = { ...prev };
                      delete copy[activeField.id];
                      return copy;
                    });
                    setCustomAreas((prev) => {
                      const copy = { ...prev };
                      delete copy[activeField.id];
                      return copy;
                    });
                    triggerToast('Przywrócono oryginalny obrys ewidencyjny LPIS.');
                  }}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-amber-400"
                  title="Przywróć obrys LPIS"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              onClick={handleMapClick}
              onMouseMove={handleMapMouseMove}
              className={`h-full w-full ${isDrawingPolygon ? 'cursor-crosshair' : 'cursor-grab'}`}
            >
              <defs>
                <linearGradient id="grad-smap" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.55" />
                  <stop offset="50%" stopColor="#10B981" stopOpacity="0.50" />
                  <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.68" />
                </linearGradient>

                <linearGradient id="grad-ecostress" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.48" />
                  <stop offset="55%" stopColor="#F59E0B" stopOpacity="0.62" />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity="0.68" />
                </linearGradient>

                <linearGradient id="grad-satellite" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#065F46" stopOpacity="0.68" />
                  <stop offset="60%" stopColor="#10B981" stopOpacity="0.52" />
                  <stop offset="100%" stopColor="#047857" stopOpacity="0.65" />
                </linearGradient>

                <linearGradient id="grad-srtm" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#E2E8F0" stopOpacity="0.45" />
                  <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.42" />
                  <stop offset="100%" stopColor="#1E293B" stopOpacity="0.72" />
                </linearGradient>

                <pattern
                  id="ortho-rows"
                  width="3"
                  height="3"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(18)"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="3"
                    stroke="#94A3B8"
                    strokeWidth="0.22"
                    strokeOpacity="0.25"
                  />
                </pattern>
              </defs>

              <rect x="0" y="0" width="100" height="100" fill="url(#ortho-rows)" />

              {activeLayer === 'srtm' && (
                <g stroke="#94A3B8" strokeOpacity="0.35" strokeWidth="0.25" fill="none">
                  <ellipse cx="48" cy="46" rx="34" ry="24" />
                  <ellipse cx="48" cy="46" rx="24" ry="16" />
                  <ellipse cx="48" cy="46" rx="13" ry="8" />
                </g>
              )}

              <polygon
                points={polygonPointsAttr}
                fill={`url(#grad-${activeLayer})`}
                stroke="#10B981"
                strokeWidth="0.65"
                strokeLinejoin="round"
              />

              {activeField.coordinates.map(([x, y], idx) => (
                <circle
                  key={idx}
                  cx={x}
                  cy={y}
                  r="0.85"
                  fill="#0F172A"
                  stroke="#38BDF8"
                  strokeWidth="0.45"
                />
              ))}

              {isDrawingPolygon && draftPoints.length > 0 && (
                <g>
                  <polyline
                    points={draftPoints.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="rgba(56, 189, 248, 0.2)"
                    stroke="#38BDF8"
                    strokeWidth="0.6"
                    strokeDasharray="1.2 1"
                  />
                  {draftPoints.map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r="1.1" fill="#38BDF8" />
                  ))}
                </g>
              )}
            </svg>

            <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-700/80 bg-[#0F172A]/85 px-3 py-1.5 text-center backdrop-blur-sm">
              <div className="text-xs font-bold text-slate-100">{activeField.name}</div>
              <div className="font-mono text-[11px] text-emerald-400">
                {activeField.areaHa} ha • pH {activeField.soilPh} • Próchnica{' '}
                {activeField.organicMatterPct}%
              </div>
            </div>

            <div className="absolute bottom-3 left-3 z-20 rounded-lg border border-slate-700/80 bg-[#0F172A]/90 px-3 py-2 backdrop-blur-md">
              <div className="mb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                {activeLayer === 'smap' && 'NASA SMAP — Wilgotność gleby (% VWC)'}
                {activeLayer === 'ecostress' && 'NASA ECOSTRESS — Temperatura łanu (°C)'}
                {activeLayer === 'srtm' && 'NASA SRTM — Wysokość n.p.m. (m)'}
                {activeLayer === 'satellite' && 'Sentinel / Landsat — Wigor NDVI'}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-slate-300">
                  {activeLayer === 'smap' && '12%'}
                  {activeLayer === 'ecostress' && '19°C'}
                  {activeLayer === 'srtm' && '84 m'}
                  {activeLayer === 'satellite' && '0.25'}
                </span>
                <div
                  className={`h-2 w-32 rounded-full ${
                    activeLayer === 'smap'
                      ? 'bg-gradient-to-r from-amber-500 via-emerald-500 to-sky-400'
                      : activeLayer === 'ecostress'
                      ? 'bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500'
                      : activeLayer === 'srtm'
                      ? 'bg-gradient-to-r from-slate-700 via-amber-500 to-slate-200'
                      : 'bg-gradient-to-r from-amber-700 via-emerald-600 to-emerald-400'
                  }`}
                />
                <span className="font-mono text-[10px] text-slate-300">
                  {activeLayer === 'smap' && '42%'}
                  {activeLayer === 'ecostress' && '38°C'}
                  {activeLayer === 'srtm' && '112 m'}
                  {activeLayer === 'satellite' && '0.90'}
                </span>
              </div>
            </div>

            <div className="absolute right-3 bottom-3 z-20 flex items-center gap-2 rounded-lg border border-slate-700/80 bg-[#0F172A]/90 px-3 py-1.5 font-mono text-[11px] text-slate-300 backdrop-blur-md tabular-nums">
              <Grid className="h-3.5 w-3.5 text-sky-400" />
              <span>{cursorCoords.lat}</span>
              <span className="text-slate-600">|</span>
              <span>{cursorCoords.lon}</span>
              <span className="text-slate-600">|</span>
              <span className="text-amber-400">SRTM: {cursorCoords.elev}</span>
            </div>
          </section>

          <section className="team-rotations flex flex-col justify-between bg-[#0B1120] p-4 overflow-y-auto custom-scrollbar">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sprout className="h-4 w-4 text-emerald-400" />
                <h2 className="text-xs font-bold tracking-wider text-slate-100 uppercase">
                  Rekomendowana sekwencja płodozmianu (2027 – 2030)
                </h2>
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                  Bilans N cyklu: {simulationSummary.totalNitrogenDelta > 0 ? '+' : ''}
                  {simulationSummary.totalNitrogenDelta} kg/ha
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Scenariusz:{' '}
                <strong className="text-slate-200">
                  {scenario === 'normal'
                    ? 'Normalny sezon'
                    : scenario === 'drought_30'
                    ? 'Susza -30% opadów'
                    : 'Gwałtowne ulewy GPM'}
                </strong>
              </span>
            </div>

            <div className="team-rotation-grid grid flex-1 grid-cols-1 gap-3 md:grid-cols-4">
              {rotationPlan.map((step, index) => {
                const yearLabel = 2027 + index;
                const isNitrogenPositive = step.crop.nitrogenBalanceKgHa > 0;

                return (
                  <div
                    key={`${step.crop.id}-${index}`}
                    className="relative flex flex-col justify-between rounded-xl border border-slate-700/80 bg-[#1E293B]/85 p-3 shadow-lg transition hover:border-emerald-500/50"
                  >
                    {index < rotationPlan.length - 1 && (
                      <div className="pointer-events-none absolute top-1/2 -right-2.5 z-10 hidden -translate-y-1/2 rounded-full border border-slate-700 bg-[#0F172A] p-0.5 text-emerald-400 md:block">
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-sky-400">
                          ROK {index+1} • {yearLabel}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                            step.totalScore >= 80
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : step.totalScore >= 65
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {step.totalScore}/100
                        </span>
                      </div>

                      <div className="mt-2">
                        <div className="text-sm font-bold text-slate-100">{step.crop.name}</div>
                        <div className="text-[11px] italic text-slate-400">
                          {step.crop.latinName} • {step.crop.category}
                        </div>
                      </div>

                      <div className="mt-2.5 space-y-1.5 border-t border-slate-700/70 pt-2 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-slate-400">
                            <Droplets className="h-3 w-3 text-sky-400" />
                            Woda:
                          </span>
                          <span className="font-mono font-semibold text-slate-200 tabular-nums">
                            {step.crop.waterDemandMm} mm{' '}
                            {step.waterDeficitMm > 0 && (
                              <span className="text-amber-400">(-{step.waterDeficitMm})</span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-slate-400">
                            <Sprout className="h-3 w-3 text-emerald-400" />
                            Bilans N:
                          </span>
                          <span
                            className={`font-mono font-bold tabular-nums ${
                              isNitrogenPositive ? 'text-emerald-400' : 'text-amber-300'
                            }`}
                          >
                            {isNitrogenPositive ? '+' : ''}
                            {step.crop.nitrogenBalanceKgHa} kg/ha
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-slate-400">
                            <ShieldCheck className="h-3 w-3 text-amber-400" />
                            Odporność susza:
                          </span>
                          <span className="font-mono font-semibold text-slate-200 tabular-nums">
                            {step.crop.droughtTolerance}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 border-t border-slate-800 pt-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Prognoza plonu:</span>
                        <span className="font-mono font-bold text-emerald-300 tabular-nums">
                          {step.projectedYieldTha} t/ha
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-400">
                        {step.agronomicNote}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>

        <aside className="team-sidebar team-sidebar-right flex w-[340px] shrink-0 flex-col justify-between border-l border-slate-800 bg-[#1E293B]/75 p-4 backdrop-blur-md overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                <Activity className="h-3.5 w-3.5 text-sky-400" />
                <span>Telemetria NASA Earth Data</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <div className="rounded-lg border border-slate-700/70 bg-[#0F172A]/80 p-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Wilgotność gleby (SMAP L4)</span>
                    <Droplets className="h-3.5 w-3.5 text-sky-400" />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="font-mono text-lg font-bold text-sky-400 tabular-nums">
                      {activeMetrics.smapRootZoneMoisturePct}%
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      Powierzchnia: {activeMetrics.smapSurfaceMoisturePct}%
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700/70 bg-[#0F172A]/80 p-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Ryzyko termiczne (POWER / ECO)</span>
                    <ThermometerSun className="h-3.5 w-3.5 text-amber-400" />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="font-mono text-lg font-bold text-amber-400 tabular-nums">
                      {activeMetrics.ecostressTempC}°C LST
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      Upały: {activeMetrics.powerHeatStressDays}d • Przymr.:{' '}
                      {activeMetrics.powerFrostRiskDays}d
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700/70 bg-[#0F172A]/80 p-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Trend opadów 10-letnich (GPM)</span>
                    <CloudRain className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="font-mono text-lg font-bold text-slate-100 tabular-nums">
                      {activeMetrics.gpmAnnualPrecipMm} mm/r
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-amber-400 tabular-nums">
                      {activeMetrics.gpmPrecipTrendPct}% / 10 lat
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/70 bg-[#0F172A]/80 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300">
                  Historia GPM (mm) vs SMAP (%)
                </span>
                <span className="font-mono text-[10px] text-slate-500">2017–2026</span>
              </div>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={HISTORICAL_CLIMATE_TREND}
                    margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="gpmArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis
                      dataKey="year"
                      tick={{ fill: '#64748B', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fill: '#64748B', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis yAxisId="right" orientation="right" hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}
                    />
                    <Area
                      yAxisId="left"
                      type="monotone"
                      dataKey="gpmMm"
                      name="Opady GPM (mm)"
                      stroke="#38BDF8"
                      strokeWidth={2}
                      fill="url(#gpmArea)"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="smapPct"
                      name="SMAP (%)"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-[#0F172A]/85 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-300 uppercase">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span>Symulator „What-If” (Stress Test)</span>
              </div>

              <div className="space-y-1.5">
                {[
                  {
                    id: 'normal' as const,
                    label: 'Normalny sezon (Baseline NASA)',
                    badge: '100% GPM',
                  },
                  {
                    id: 'drought_30' as const,
                    label: 'Ekstremalna susza (-30% opadów)',
                    badge: 'ALERT SMAP',
                  },
                  {
                    id: 'heavy_rain_gpm' as const,
                    label: 'Gwałtowne ulewy GPM (+25%)',
                    badge: 'EROZJA SRTM',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setScenario(opt.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                      scenario === opt.id
                        ? 'border-amber-500/70 bg-amber-500/15 text-amber-200 font-semibold'
                        : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className="font-mono text-[9px] text-slate-400">{opt.badge}</span>
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800 pt-2.5">
                <div className="rounded bg-slate-900/90 p-2">
                  <div className="text-[10px] text-slate-400">Śr. plon cyklu</div>
                  <div className="mt-0.5 flex items-center gap-1 font-mono text-sm font-bold text-emerald-400 tabular-nums">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>{simulationSummary.avgYield} t/ha</span>
                  </div>
                </div>
                <div className="rounded bg-slate-900/90 p-2">
                  <div className="text-[10px] text-slate-400">Ryzyko erozji</div>
                  <div
                    className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${
                      Number(simulationSummary.avgErosion) > 1.8
                        ? 'text-rose-400'
                        : 'text-sky-400'
                    }`}
                  >
                    {simulationSummary.avgErosion} t/ha/r
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="team-sidebar-actions mt-4 space-y-2 pt-2">
            <button
              onClick={handleExportGeoJSON}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-sky-500/50 bg-sky-500/15 px-3 py-2.5 text-xs font-bold text-sky-300 transition hover:bg-sky-500/25"
            >
              <Download className="h-4 w-4" />
              <span>Eksportuj do ciągnika</span>
            </button>

            <button
              onClick={handleExportPDF}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              <FileText className="h-4 w-4 text-emerald-400" />
              <span>Generuj raport PDF</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default TeamDashboard;
