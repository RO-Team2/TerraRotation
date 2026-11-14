# TerraRotation — integracja frontendu z TerraEngine

Dokument dla zespołu Electron / React / TypeScript. Dotyczy wersji backendu z paczki `TerraEngine_Clean_Readable.zip` (14.11.2026).

## 1. Uruchomienie backendu

Z głównego katalogu repozytorium:

```bash
python -m pip install -e .
python -m uvicorn terraengine.api:app --reload --port 8000
```

API: `http://127.0.0.1:8000`  
Swagger: `http://127.0.0.1:8000/docs`

Domyślnie CORS dopuszcza m.in. localhost na portach 3000, 5173 i 8080. W aplikacji Electron korzystajcie z istniejącego `window.terraApi` (preload + IPC), a nie z bezpośredniego wywoływania `fetch` z widoku React, jeśli taki jest obecny wzorzec projektu.

## 2. Endpointy

| Metoda | Endpoint | Cel |
|---|---|---|
| GET | `/api/v1/health` | Status backendu |
| GET | `/api/v1/config` | Scenariusze, tryby, wartości domyślne i limity |
| GET | `/api/v1/crops` | Katalog upraw z identyfikatorami |
| POST | `/api/v1/recommend` | Rekomendacje + DNA + testy klimatyczne + jakość danych |
| POST | `/api/v1/adapt` | Ponowne planowanie po zakończeniu roku |

Istnieją też aliasy `/health`, `/crops`, `/recommend` (poza schematem Swagger).

## 3. Rekomendacja — request

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

Wymagane są współrzędne. Pozostałe pola mają wartości domyślne. Dodatkowe opcjonalne pola: `max_candidates` (100–500000, domyślnie 100000), `ph_override` (0–14), `sand_override` (0–100), `soc_override` (>= 0). Współrzędne przesyłajcie jako liczby z kropką dziesiętną; przecinek stosujcie wyłącznie do wyświetlania w UI.

- `scenario`: `balanced`, `soil`, `resilience`, `profit`.
- `mode`: `live` (NASA POWER + ISRIC SoilGrids) albo `demo` (przykładowe dane).
- `years`: 2–6; `climate_years`: 3–20; `top_k`: 1–20.
- `history`: lista identyfikatorów wcześniejszych upraw (maks. 10).
- `allowed_crops`: `null` = wszystkie uprawy, lista ID = ograniczenie wyboru.

## 4. Struktura odpowiedzi `/api/v1/recommend`

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

`engine.status` przyjmuje m.in. `ok`, `insufficient_data`, `no_feasible_rotation`. Gdy status nie jest `ok`, `recommendations` może być puste, a `stress_lab` nie występuje. Nie zakładajcie obecności `engine.stress_lab` bez sprawdzenia.

Pojedynczy element `engine.recommendations[]`:

```text
{
  rotation: ["pea", "rapeseed", "potato", "rye"],
  score: number,                  // skala 0–1
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

`score` i metryki to wartości z zakresu około 0–1. Do wyświetlenia w punktach procentowych użyjcie `Math.round(score * 100)` albo dwóch miejsc po przecinku, jeśli trzeba rozróżnić bliskie wyniki. Nie interpretujcie tego jako prawdopodobieństwa sukcesu.

## 5. Climate Stress Lab

Dostęp: `response.engine.stress_lab` (tylko gdy `status === "ok"`).

`scenarios[]` zawiera:

| `id` | Zmiana opadów | Zmiana temperatury |
|---|---:|---:|
| `baseline` | 0% | 0°C |
| `drought` | −25% | +1,5°C |
| `wet` | +30% | 0°C |
| `heat` | −10% | +3°C |

Każdy scenariusz zawiera `plans[]`: `rotation`, `score`, `score_change`, `metrics`, `year_by_year`. `score_change` to różnica względem wyniku bazowego danej rotacji (również w skali 0–1).

`robustness[]` zawiera dla każdej rozważanej rotacji: `rotation`, `worst_score`, `best_score`, `average_score`, `range`. Lista jest posortowana według najwyższego `worst_score` (strategia maximin). **Ważne:** testowane są tylko rotacje już zwrócone w `recommendations`, a nie wszystkie możliwe rotacje.

Proponowany UI: zakładki **Bazowy / Susza / Mokry rok / Upały**, porównanie punktacji i osobna sekcja „Odporność planu”. Podpis: „Scenariusze hipotetyczne, nie prognoza plonów”.

## 6. Rotation DNA

Dostęp: `response.engine.recommendations[i].dna`.

- `dimensions` — pięć metryk do wykresu radarowego lub poziomych pasków.
- `strongest`, `weakest` — **klucze metryk**, nie gotowe polskie etykiety.
- `year_by_year` — roczny przebieg wskaźników i premii za przedplon.

Etykiety w UI: `fit` → Dopasowanie, `soil` → Gleba, `resilience` → Odporność, `profit` → Opłacalność, `diversity` → Różnorodność.

## 7. Confidence Engine

Dostęp: `response.engine.confidence`.

`checks` zawiera: `real_data` (boolean), `soil_coverage` (0–1), `climate_coverage` (0–1), `soil_layers` (liczba), `climate_years` (liczba). `limitations` to lista komunikatów po polsku. `validated_prediction` jest `false`.

To **ocena kompletności i pochodzenia danych**, nie procent pewności, że rekomendacja jest poprawna. Nie pokazujcie np. `soil_coverage: 0.8` jako „80% pewności”.

## 8. Adaptive Rotation

`POST /api/v1/adapt` przyjmuje wszystkie pola z `FieldRequest` oraz:

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

`years` oznacza **liczbę lat pozostałych do zaplanowania**, nie długość pierwotnej rotacji; musi mieścić się w zakresie 2–6. Backend dopisuje `completed_crop` do historii i przelicza rekomendacje.

Odpowiedź ma strukturę taką jak `/recommend`, z dodatkowym polem:

```text
adaptation: {
  completed_crop: string,
  remaining_years: number,
  previous_rotation: string[],
  changed: boolean
}
```

`changed` to proste porównanie tablic, a nie miara istotności zmiany. `previous_rotation` najlepiej przesyłać jako poprzednio planowaną **pozostałą część** rotacji, o tej samej długości co nowy plan.

## 9. Integracja z Electronem

Obecny preload obsługuje `health`, `crops`, `recommend`. Dla adaptacji dodajcie nową metodę w trzech miejscach: IPC main process, preload (`window.terraApi.adapt`) i definicje TypeScript. Dla DNA, stress lab i confidence **nie potrzeba nowych endpointów** — przychodzą razem z odpowiedzią `/recommend`.

Przykładowy typ do rozszerzenia istniejących typów:

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

`YearEntry` należy zdefiniować według pól `year_by_year` opisanych wyżej. `stress_lab` w odpowiedzi oznaczcie jako opcjonalne.

## 10. Zasady i ograniczenia

- Identyfikatory w JSON zostają **po angielsku**; tłumaczymy wyłącznie tekst widoczny dla użytkownika.
- Dla `live` źródła mogą nie odpowiedzieć; obsługujcie brak danych, ostrzeżenia i pusty ranking.
- Błędy walidacji zwracają HTTP **422** (FastAPI); problemy z połączeniem wymagają osobnej obsługi.
- `demo` nie oznacza rzeczywistych danych z lokalizacji użytkownika.
- Wyniki są heurystyczne; nie są prognozą plonów, dochodu ani rzeczywistych zmian zawartości azotu w glebie.
- Jeśli dwa wyniki są bardzo bliskie, pokazujcie dokładniejszą punktację zamiast sztucznie je rozdzielać.

## 11. Kolejność prac frontendowych

1. Rozszerzyć typy `RecommendResponse` o `dna`, `confidence` i opcjonalne `stress_lab`.
2. Dodać Climate Stress Lab z przełącznikiem scenariuszy i tabelą odporności.
3. Dodać Rotation DNA do karty rekomendacji.
4. Dodać sekcję jakości danych i ostrzeżeń.
5. Dodać `adapt` w IPC/preload oraz formularz aktualizacji po zakończeniu roku.

Do szybkiej demonstracji wybierzcie `mode: "demo"`. Przed pokazem LIVE sprawdźcie dostępność NASA POWER, SoilGrids oraz zależności GDAL na maszynie demonstracyjnej.
