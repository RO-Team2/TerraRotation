# TerraRotation — frontend integration with TerraEngine

Documentation for the Electron / React / TypeScript team. Applies to the backend version from `TerraEngine_Clean_Readable.zip` (November 14, 2026).

## 1. Starting the backend

From the repository root:

```bash
python -m pip install -e .
python -m uvicorn terraengine.api:app --reload --port 8000
```

API: `http://127.0.0.1:8000`  
Swagger: `http://127.0.0.1:8000/docs`

By default, CORS allows localhost on ports including 3000, 5173, and 8080. In the Electron application, use the existing `window.terraApi` (preload + IPC) rather than calling `fetch` directly from the React view if that is the project's established pattern.

## 2. Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Backend status |
| GET | `/api/v1/config` | Scenarios, modes, defaults, and limits |
| GET | `/api/v1/crops` | Crop catalog with identifiers |
| POST | `/api/v1/recommend` | Recommendations + DNA + climate stress tests + data quality |
| POST | `/api/v1/adapt` | Replanning after a completed year |

The aliases `/health`, `/crops`, and `/recommend` also exist (excluded from the Swagger schema).

## 3. Recommendation request

```json
{
  "latitude": 52.28,
  "longitude": 16.70,
  "years": 4,
  "history": [],
  "allowed_crops": null,
  "scenario": "balanced",
  "top_k": 5,
  "mode": "live",
  "climate_years": 10
}
```

Coordinates are required. All other fields have defaults. Additional optional fields: `max_candidates` (100–500000, default 100000), `ph_override` (0–14), `sand_override` (0–100), and `soc_override` (>= 0). Send coordinates as numbers with a decimal point; use a decimal comma only for display in the UI.

- `scenario`: `balanced`, `soil`, `resilience`, `profit`.
- `mode`: `live` (NASA POWER + ISRIC SoilGrids) or `demo` (sample data).
- `years`: 2–6; `climate_years`: 3–20; `top_k`: 1–20.
- `history`: a list of previous crop identifiers (up to 10).
- `allowed_crops`: `null` = all crops; a list of IDs restricts the selection.

## 4. `/api/v1/recommend` response structure

```text
{
  input: {...},
  soil: { ph, sand_pct, soc_g_kg, layers, source, warnings, ... },
  climate: { avg_temp_c, annual_rain_mm, climate_years, source, warnings, ... },
  engine: {
    status, explored, truncated, recommendations, warnings,
    confidence: { checks, limitations, validated_prediction },
    stress_lab?: { method, scenarios, robustness, disclaimer }
  },
  disclaimer
}
```

`engine.status` values include `ok`, `insufficient_data`, and `no_feasible_rotation`. When the status is not `ok`, `recommendations` may be empty and `stress_lab` is absent. Check for `engine.stress_lab` before accessing it.

A single `engine.recommendations[]` item:

```text
{
  rotation: ["pea", "rapeseed", "potato", "rye"],
  score: number,                  // 0–1 scale
  metrics: { fit, soil, resilience, profit, diversity },
  explanations: string[],
  year_by_year: [{ year, crop, previous_crop, pre_crop_bonus,
                   fit, nitrogen_index, organic_matter_index }],
  dna: {
    dimensions: { fit, soil, resilience, profit, diversity },
    strongest: string,
    weakest: string,
    year_by_year: [...],
    method: "relative_heuristic_indices"
  }
}
```

`score` and the metrics have values roughly in the 0–1 range. To display a score on a 100-point scale, use `Math.round(score * 100)`, or two decimal places when needed to distinguish close results. Do not interpret it as a probability of success.

## 5. Climate Stress Lab

Access: `response.engine.stress_lab` (only when `status === "ok"`).

`scenarios[]` contains:

| `id` | Precipitation change | Temperature change |
|---|---:|---:|
| `baseline` | 0% | 0°C |
| `drought` | −25% | +1.5°C |
| `wet` | +30% | 0°C |
| `heat` | −10% | +3°C |

Each scenario contains `plans[]`: `rotation`, `score`, `score_change`, `metrics`, and `year_by_year`. `score_change` is the difference from that rotation's baseline score (also on a 0–1 scale).

For each rotation considered, `robustness[]` contains `rotation`, `worst_score`, `best_score`, `average_score`, and `range`. The list is sorted by the highest `worst_score` (a maximin strategy). **Important:** only rotations already returned in `recommendations` are tested, not all possible rotations.

Suggested UI: **Baseline / Drought / Wet year / Heat** tabs, score comparisons, and a separate “Plan robustness” section. Caption: “Hypothetical scenarios, not yield forecasts”.

## 6. Rotation DNA

Access: `response.engine.recommendations[i].dna`.

- `dimensions` — five metrics for a radar chart or horizontal bars.
- `strongest`, `weakest` — **metric keys**, not ready-made Polish labels.
- `year_by_year` — yearly progression of indices and preceding crop bonuses.

UI labels: `fit` → Suitability, `soil` → Soil, `resilience` → Resilience, `profit` → Profitability, `diversity` → Diversity.

## 7. Confidence Engine

Access: `response.engine.confidence`.

`checks` contains `real_data` (boolean), `soil_coverage` (0–1), `climate_coverage` (0–1), `soil_layers` (number), and `climate_years` (number). `limitations` is a list of messages in Polish. `validated_prediction` is `false`.

This is an **assessment of data completeness and provenance**, not a confidence percentage that the recommendation is correct. For example, do not display `soil_coverage: 0.8` as “80% confidence”.

## 8. Adaptive Rotation

`POST /api/v1/adapt` accepts all `FieldRequest` fields plus:

```json
{
  "latitude": 52.28,
  "longitude": 16.70,
  "years": 3,
  "history": [],
  "completed_crop": "pea",
  "previous_rotation": ["rapeseed", "potato", "rye"],
  "scenario": "balanced",
  "mode": "demo",
  "climate_years": 10
}
```

`years` means **the number of remaining years to plan**, not the length of the original rotation; it must be within 2–6. The backend appends `completed_crop` to the history and recalculates recommendations.

The response has the same structure as `/recommend`, with an additional field:

```text
adaptation: {
  completed_crop: string,
  remaining_years: number,
  previous_rotation: string[],
  changed: boolean
}
```

`changed` is a simple array comparison, not a measure of how significant the change is. Ideally, send `previous_rotation` as the previously planned **remaining portion** of the rotation, with the same length as the new plan.

## 9. Electron integration

The current preload supports `health`, `crops`, and `recommend`. For adaptation, add a new method in three places: main-process IPC, preload (`window.terraApi.adapt`), and TypeScript definitions. DNA, stress lab, and confidence **do not require new endpoints**: they are included in the `/recommend` response.

Example types for extending the existing definitions:

```ts
type MetricKey = 'fit' | 'soil' | 'resilience' | 'profit' | 'diversity';
type Metrics = Record<MetricKey, number>;

type RotationDNA = {
  dimensions: Metrics;
  strongest: MetricKey;
  weakest: MetricKey;
  year_by_year: YearEntry[];
  method: string;
};

type StressPlan = {
  rotation: string[];
  score: number;
  score_change: number;
  metrics: Metrics;
  year_by_year: YearEntry[];
};

type StressLab = {
  method: string;
  scenarios: Array<{
    id: 'baseline' | 'drought' | 'wet' | 'heat';
    rain_change_pct: number;
    temperature_change_c: number;
    plans: StressPlan[];
  }>;
  robustness: Array<{
    rotation: string[];
    worst_score: number;
    best_score: number;
    average_score: number;
    range: number;
  }>;
  disclaimer: string;
};
```

Define `YearEntry` using the `year_by_year` fields described above. Mark `stress_lab` as optional in the response type.

## 10. Guidelines and limitations

- JSON identifiers remain **in English**; translate only user-visible text.
- In `live` mode, sources may not respond; handle missing data, warnings, and empty rankings.
- Validation errors return HTTP **422** (FastAPI); connection problems require separate handling.
- `demo` does not represent actual data from the user's location.
- Results are heuristic; they are not forecasts of yields, income, or actual changes in soil nitrogen content.
- If two results are very close, show more precise scores rather than artificially separating them.

## 11. Frontend implementation order

1. Extend `RecommendResponse` types with `dna`, `confidence`, and optional `stress_lab`.
2. Add Climate Stress Lab with a scenario selector and a robustness table.
3. Add Rotation DNA to the recommendation card.
4. Add a data quality and warnings section.
5. Add `adapt` to IPC/preload and a form for updates after a completed year.

For a quick demonstration, select `mode: "demo"`. Before a LIVE presentation, check NASA POWER and SoilGrids availability and the GDAL dependencies on the demonstration machine.
