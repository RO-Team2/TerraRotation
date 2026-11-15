export {};

declare global {
  interface Window {
    terraApi: {
      windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
      exportPdf: (view?: 'analysis' | 'map') => Promise<{ savedPath?: string }>;
      health: () => Promise<{ status: string; service?: string; version?: string }>;
      config: () => Promise<ApiConfig>;
      crops: () => Promise<{ crops: Crop[]; note?: string }>;
      recommend: (payload: RecommendRequest) => Promise<RecommendResponse>;
      mapJobStart: (payload: SatelliteRequest) => Promise<MapJob>;
      mapJobStatus: (id: string) => Promise<MapJob>;
      mapJobCancel: (id: string) => Promise<MapJob>;
      mapAnalyze: (payload: SatelliteRequest) => Promise<MapAnalysisResponse>;
      satellite: (payload: SatelliteRequest) => Promise<SatelliteResponse>;
    };
  }
}

export interface FieldPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export type SatelliteRequest = {
  start_date: string;
  end_date: string;
  max_cloud_coverage: number;
  include_geotiff: boolean;
} & ({ latitude: number; longitude: number; radius_m: number; geometry?: never }
  | { geometry: FieldPolygon; latitude?: never; longitude?: never });

export interface SatelliteResponse {
  source: string;
  resolution_m: number;
  crs: string;
  start_date: string;
  end_date: string;
  geometry: FieldPolygon;
  area_ha: number;
  geotiff: string | null;
  stats: { mean: number; min: number; max: number; median: number; valid_pixels: number; total_pixels: number; valid_percent: number };
  assessment: string;
  warnings: string[];
}

export interface ApiConfig {
  scenarios: string[];
  modes: string[];
  defaults: { years: number; scenario: string; climate_years: number; top_k: number; mode: string };
  limits: { years: { min: number; max: number }; climate_years: { min: number; max: number }; top_k: { min: number; max: number } };
}

export interface Crop {
  id: string;
  name?: string;
  [key: string]: unknown;
}

export interface RecommendRequest {
  latitude: number;
  longitude: number;
  years: number;
  scenario: string;
  climate_years: number;
  mode: 'demo' | 'live';
  top_k: number;
  history: string[];
  allowed_crops: string[] | null;
}

export interface RotationYear {
  year: number;
  crop: string;
  fit?: number;
  nitrogen_index?: number;
  organic_matter_index?: number;
}

export interface Recommendation {
  rotation: string[];
  score: number;
  metrics?: Record<string, number>;
  explanations?: string[];
  year_by_year?: RotationYear[];
}

export interface RecommendResponse {
  input?: RecommendRequest;
  soil?: { [key: string]: unknown; layers?: Array<Record<string, unknown>>; warnings?: string[]; source?: string };
  climate?: Record<string, unknown> & { warnings?: string[]; source?: string };
  engine: { status: string; recommendations?: Recommendation[]; warnings?: string[]; truncated?: boolean };
  disclaimer?: string;
}

export interface MapSource<T> { status: 'ok' | 'unavailable' | 'pending'; data: T | null; message: string | null }
export interface MapPower {
  source: string; resolution: string; start_date: string; end_date: string;
  days_requested: number; valid_days: number; coverage_percent: number;
  mean_temp_c: number; rain_mm: number; hot_days: number; frost_days: number;
  longest_dry_spell_days: number;
}
export interface MapSmap {
  source: string; resolution_km: number; depth_cm: string; observation_date: string;
  surface_moisture_percent: number; quality_flag: number; orbit: string;
  pixel_latitude: number; pixel_longitude: number; distance_to_pixel_center_km: number; sampling: string;
}
export interface MapEcostress {
  source: string; lst_c: number; lst_kelvin: number; resolution_m: number;
  observation_time: string; quality_flag: number; sampling: string;
}
export interface MapAnalysisResponse {
  status: 'ok' | 'partial' | 'unavailable' | 'running'; latitude: number; longitude: number;
  start_date: string; end_date: string;
  power: MapSource<MapPower>; sentinel: MapSource<SatelliteResponse>; smap: MapSource<MapSmap>; ecostress: MapSource<MapEcostress>;
  findings: Array<{ code: string; severity: string; title: string; evidence: string[]; action: string }>;
  warnings: string[];
}

export interface MapJob {
  id: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  completed_sources: number;
  result: MapAnalysisResponse;
}
