export {};

declare global {
  interface Window {
    nasaApi: {
      windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
      syncNasaData: (fieldId: string) => Promise<{ metrics: Record<string, unknown>; fromCache: boolean }>;
      exportGeoJSON: (payload: unknown) => Promise<{ savedPath?: string }>;
      exportPDF: (payload?: unknown) => Promise<{ savedPath?: string }>;
    };
    terraApi: {
      windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>;
      syncField: (fieldId: string) => Promise<{ metrics: Record<string, unknown>; fromCache: boolean }>;
      exportGeoJson: (payload: unknown) => Promise<{ savedPath?: string }>;
      exportPdf: () => Promise<{ savedPath?: string }>;
      health: () => Promise<{ status: string; service?: string; version?: string }>;
      config: () => Promise<ApiConfig>;
      crops: () => Promise<{ crops: Crop[]; note?: string }>;
      recommend: (payload: RecommendRequest) => Promise<RecommendResponse>;
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
  soil?: { layers?: Array<Record<string, unknown>>; warnings?: string[]; source?: string };
  climate?: Record<string, unknown> & { warnings?: string[]; source?: string };
  engine: { status: string; recommendations?: Recommendation[]; warnings?: string[]; truncated?: boolean };
  disclaimer?: string;
}
