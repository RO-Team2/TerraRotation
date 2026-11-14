export {};

declare global {
  interface Window {
    terraApi: {
      health: () => Promise<{ status: string; service?: string; version?: string }>;
      config: () => Promise<ApiConfig>;
      crops: () => Promise<{ crops: Crop[]; note?: string }>;
      recommend: (payload: RecommendRequest) => Promise<RecommendResponse>;
    };
  }
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
