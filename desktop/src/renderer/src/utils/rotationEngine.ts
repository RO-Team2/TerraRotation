export type SoilType = 'gliniasta' | 'piaszczysto-gliniasta' | 'piaszczysta' | 'mada_rzeczna';
export type BotanicalFamily = 'Poaceae' | 'Fabaceae' | 'Brassicaceae' | 'Asteraceae';
export type StressScenario = 'normal' | 'drought_30' | 'heavy_rain_gpm';

export interface FieldData {
  id: string;
  name: string;
  parcelNumber: string;
  areaHa: number;
  soilType: SoilType;
  soilPh: number;
  organicMatterPct: number;
  slopeDeg: number;
  coordinates: [number, number][];
  center: [number, number]; 
}

export interface NasaMetrics {
  smapSurfaceMoisturePct: number;
  smapRootZoneMoisturePct: number;
  ecostressTempC: number; 
  ecostressEsi: number; 
  gpmAnnualPrecipMm: number; 
  gpmPrecipTrendPct: number; 
  gpmExtremeRainDays: number; 
  powerFrostRiskDays: number;  
  powerHeatStressDays: number;
  ndviCurrent: number;
  lastSyncIso: string;
}

export interface FarmerPriorities {
  waterConservation: number; 
  soilHealth: number;   
  nitrogenFixing: number;
  erosionControl: number;  
  marketValue: number;   
}

export interface CropProfile {
  id: string;
  name: string;
  latinName: string;
  family: BotanicalFamily;
  category: 'Bobowate' | 'Zboża ozime' | 'Okopowe / Jare' | 'Oleiste';
  waterDemandMm: number;   
  droughtTolerance: number;   
  nitrogenBalanceKgHa: number; 
  soilOrganicMatterDelta: number; 
  erosionProtection: number;   
  baseYieldTha: number;  
  grossMarginPlnHa: number;      
  preferredSoils: SoilType[];
  minPh: number;
}

export interface ScoreBreakdown {
  waterScore: number;
  soilHealthScore: number;
  nitrogenScore: number;
  erosionScore: number;
  marketScore: number;
  sequenceBonus: number;
}

export interface CropScoreResult {
  crop: CropProfile;
  totalScore: number; 
  breakdown: ScoreBreakdown;
  projectedYieldTha: number;
  projectedErosionTha: number;
  waterDeficitMm: number;
  agronomicNote: string;
}

export const CROP_DATABASE: CropProfile[] = [
  {
    id: 'alfalfa',
    name: 'Lucerna siewna',
    latinName: 'Medicago sativa',
    family: 'Fabaceae',
    category: 'Bobowate',
    waterDemandMm: 460,
    droughtTolerance: 86,
    nitrogenBalanceKgHa: 115,
    soilOrganicMatterDelta: 14,
    erosionProtection: 94,
    baseYieldTha: 9.2,
    grossMarginPlnHa: 4100,
    preferredSoils: ['gliniasta', 'mada_rzeczna', 'piaszczysto-gliniasta'],
    minPh: 6.2,
  },
  {
    id: 'soybean',
    name: 'Soja zwyczajna',
    latinName: 'Glycine max',
    family: 'Fabaceae',
    category: 'Bobowate',
    waterDemandMm: 430,
    droughtTolerance: 74,
    nitrogenBalanceKgHa: 65,
    soilOrganicMatterDelta: 8,
    erosionProtection: 68,
    baseYieldTha: 3.1,
    grossMarginPlnHa: 4850,
    preferredSoils: ['gliniasta', 'mada_rzeczna', 'piaszczysto-gliniasta'],
    minPh: 6.0,
  },
  {
    id: 'winter_wheat',
    name: 'Pszenica ozima',
    latinName: 'Triticum aestivum',
    family: 'Poaceae',
    category: 'Zboża ozime',
    waterDemandMm: 480,
    droughtTolerance: 72,
    nitrogenBalanceKgHa: -125,
    soilOrganicMatterDelta: 3,
    erosionProtection: 82,
    baseYieldTha: 7.8,
    grossMarginPlnHa: 5400,
    preferredSoils: ['gliniasta', 'mada_rzeczna', 'piaszczysto-gliniasta'],
    minPh: 5.8,
  },
  {
    id: 'grain_corn',
    name: 'Kukurydza na ziarno',
    latinName: 'Zea mays',
    family: 'Poaceae',
    category: 'Okopowe / Jare',
    waterDemandMm: 560,
    droughtTolerance: 58,
    nitrogenBalanceKgHa: -155,
    soilOrganicMatterDelta: -4,
    erosionProtection: 42,
    baseYieldTha: 10.4,
    grossMarginPlnHa: 6350,
    preferredSoils: ['mada_rzeczna', 'gliniasta', 'piaszczysto-gliniasta'],
    minPh: 5.6,
  },
  {
    id: 'winter_rapeseed',
    name: 'Rzepak ozimy',
    latinName: 'Brassica napus',
    family: 'Brassicaceae',
    category: 'Oleiste',
    waterDemandMm: 510,
    droughtTolerance: 66,
    nitrogenBalanceKgHa: -135,
    soilOrganicMatterDelta: 5,
    erosionProtection: 79,
    baseYieldTha: 3.9,
    grossMarginPlnHa: 6100,
    preferredSoils: ['gliniasta', 'mada_rzeczna'],
    minPh: 6.0,
  },
  {
    id: 'narrow_lupin',
    name: 'Łubin wąskolistny',
    latinName: 'Lupinus angustifolius',
    family: 'Fabaceae',
    category: 'Bobowate',
    waterDemandMm: 360,
    droughtTolerance: 89,
    nitrogenBalanceKgHa: 80,
    soilOrganicMatterDelta: 10,
    erosionProtection: 73,
    baseYieldTha: 2.4,
    grossMarginPlnHa: 3650,
    preferredSoils: ['piaszczysta', 'piaszczysto-gliniasta'],
    minPh: 5.2,
  },
  {
    id: 'winter_rye',
    name: 'Żyto ozime hybrydowe',
    latinName: 'Secale cereale',
    family: 'Poaceae',
    category: 'Zboża ozime',
    waterDemandMm: 380,
    droughtTolerance: 91,
    nitrogenBalanceKgHa: -95,
    soilOrganicMatterDelta: 4,
    erosionProtection: 85,
    baseYieldTha: 6.4,
    grossMarginPlnHa: 4300,
    preferredSoils: ['piaszczysta', 'piaszczysto-gliniasta'],
    minPh: 5.0,
  },
];

const clamp = (val: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, val));

export function calculateRotationScore(
  fieldData: FieldData,
  nasaMetrics: NasaMetrics,
  priorities: FarmerPriorities,
  crop: CropProfile,
  previousCrops: CropProfile[] = [],
  scenario: StressScenario = 'normal'
): CropScoreResult {
  const effectivePrecipMm =
    scenario === 'drought_30'
      ? nasaMetrics.gpmAnnualPrecipMm*0.7
      : scenario === 'heavy_rain_gpm'
      ? nasaMetrics.gpmAnnualPrecipMm*1.25
      : nasaMetrics.gpmAnnualPrecipMm;

  const effectiveRootMoisture =
    scenario === 'drought_30'
      ? nasaMetrics.smapRootZoneMoisturePct*0.72
      : scenario === 'heavy_rain_gpm'
      ? Math.min(45, nasaMetrics.smapRootZoneMoisturePct*1.18)
      : nasaMetrics.smapRootZoneMoisturePct;

  const soilRetentionFactor =
    fieldData.soilType === 'gliniasta' || fieldData.soilType === 'mada_rzeczna'
      ? 1.12
      : fieldData.soilType === 'piaszczysto-gliniasta'
      ? 0.96
      : 0.78;

  const availableWaterMm =
    effectivePrecipMm*0.78*soilRetentionFactor+effectiveRootMoisture*3.8;
  const waterDeficitMm = Math.max(0, Math.round(crop.waterDemandMm-availableWaterMm));

  const droughtExposure =
    (1 - nasaMetrics.ecostressEsi)*45+nasaMetrics.powerHeatStressDays*1.4;
  const rawWaterFit =
    100-
    waterDeficitMm*0.42-
    Math.max(0, droughtExposure - crop.droughtTolerance*0.45);
  const waterScore = clamp(rawWaterFit);

  const soilMatchBonus = crop.preferredSoils.includes(fieldData.soilType) ? 16 : -14;
  const phPenalty = fieldData.soilPh < crop.minPh ? (crop.minPh-fieldData.soilPh)* 32 : 0;
  const omNeedFactor = fieldData.organicMatterPct < 2.2 ? 1.35 : 1.0;
  const soilHealthScore = clamp(
    62+crop.soilOrganicMatterDelta*1.9*omNeedFactor+soilMatchBonus-phPenalty
  );

  const lastCrop = previousCrops[previousCrops.length-1];
  const nitrogenCredit =
    lastCrop && lastCrop.nitrogenBalanceKgHa > 0 ? lastCrop.nitrogenBalanceKgHa*0.45 : 0;
  const effectiveNitrogenBalance = crop.nitrogenBalanceKgHa+nitrogenCredit;
  const nitrogenScore = clamp(55 + effectiveNitrogenBalance*0.32);

  const rainErosivity =
    scenario === 'heavy_rain_gpm'
      ? nasaMetrics.gpmExtremeRainDays*2.1
      : nasaMetrics.gpmExtremeRainDays*1.2;
  const terrainRisk = fieldData.slopeDeg*4.5+rainErosivity;
  const erosionScore = clamp(
    crop.erosionProtection - Math.max(0, terrainRisk - crop.erosionProtection*0.35)
  );

  const yieldFactor = clamp(
    1 -
      waterDeficitMm/950-
      (scenario === 'heavy_rain_gpm' && crop.erosionProtection < 60 ? 0.14 : 0),
    0.55,
    1.12
  );
  const projectedYieldTha = Number((crop.baseYieldTha*yieldFactor).toFixed(2));
  const adjustedMargin = crop.grossMarginPlnHa*yieldFactor;
  const marketScore = clamp((adjustedMargin/6800)*100);

  let sequenceBonus = 0;
  let agronomicNote = 'Stabilna pozycja w zmianowaniu na podstawie bilansu SMAP/POWER.';

  if (lastCrop) {
    if (lastCrop.id === crop.id) {
      sequenceBonus -= 42;
      agronomicNote = 'Ostrzeżenie: monokultura, wysokie ryzyko patogenów glebowych.';
    } else if (lastCrop.family === crop.family) {
      sequenceBonus -= 22;
      agronomicNote = `Ta sama rodzina botaniczna (${crop.family}) rok po roku obniża potencjał plonu.`;
    } else if (lastCrop.nitrogenBalanceKgHa >= 60 && crop.nitrogenBalanceKgHa <= -110) {
      sequenceBonus += 16;
      agronomicNote = `Optymalne wykorzystanie azotu (+${Math.round(nitrogenCredit)} kg N/ha) po uprawie ${lastCrop.name}.`;
    } else if (crop.nitrogenBalanceKgHa >= 60) {
      sequenceBonus += 9;
      agronomicNote = `Odbudowa struktury gruzełkowatej i wiązanie azotu atmosferycznego (+${crop.nitrogenBalanceKgHa} kg/ha).`;
    }
  } else if (crop.nitrogenBalanceKgHa >= 60) {
    sequenceBonus += 10;
    agronomicNote = 'Silny przedplon strukturotwórczy otwierający 4-letni cykl.';
  }

  const totalWeight =
    priorities.waterConservation +
    priorities.soilHealth +
    priorities.nitrogenFixing +
    priorities.erosionControl +
    priorities.marketValue || 1;

  const weightedSum =
    waterScore * priorities.waterConservation +
    soilHealthScore * priorities.soilHealth +
    nitrogenScore * priorities.nitrogenFixing +
    erosionScore * priorities.erosionControl +
    marketScore * priorities.marketValue;

  const totalScore = Math.round(clamp(weightedSum / totalWeight + sequenceBonus, 12, 99));

  const projectedErosionTha = Number(
    Math.max(
      0.3,
      ((fieldData.slopeDeg*0.45 + (scenario === 'heavy_rain_gpm' ? 2.4 : 0.9)) *
        (100-crop.erosionProtection))/
        65
    ).toFixed(2)
  );

  return {
    crop,
    totalScore,
    breakdown: {
      waterScore: Math.round(waterScore),
      soilHealthScore: Math.round(soilHealthScore),
      nitrogenScore: Math.round(nitrogenScore),
      erosionScore: Math.round(erosionScore),
      marketScore: Math.round(marketScore),
      sequenceBonus,
    },
    projectedYieldTha,
    projectedErosionTha,
    waterDeficitMm,
    agronomicNote,
  };
}

export function generateOptimalRotation(
  fieldData: FieldData,
  nasaMetrics: NasaMetrics,
  priorities: FarmerPriorities,
  scenario: StressScenario = 'normal',
  years = 4
): CropScoreResult[] {
  const plan: CropScoreResult[] = [];
  const chosenCrops: CropProfile[] = [];

  for (let yearIdx = 0; yearIdx < years; yearIdx++) {
    const scoredCandidates = CROP_DATABASE.map((crop) =>
      calculateRotationScore(fieldData, nasaMetrics, priorities, crop, chosenCrops, scenario)
    ).sort((a, b) => b.totalScore - a.totalScore);

    const bestCandidate =
      scoredCandidates.find(
        (candidate) => !chosenCrops.some((used) => used.id === candidate.crop.id)
      ) || scoredCandidates[0];

    plan.push(bestCandidate);
    chosenCrops.push(bestCandidate.crop);
  }

  return plan;
}
