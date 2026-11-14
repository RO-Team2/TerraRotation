# TerraRotation Engine 1.0.0 — NASA Space Apps Hackathon MVP

Backend FastAPI do rekomendowania wieloletniego płodozmianu na podstawie współrzędnych pola, danych historycznych NASA POWER i szacunkowego profilu gleby ISRIC SoilGrids. **To demonstrator hackathonowy, nie zweryfikowany system doradztwa rolniczego.** Frontend jest osobnym projektem zespołu.

## 1. Co jest w paczce?

```text
terrarotation/
  api.py        # FastAPI, CORS i endpointy /api/v1
  models.py     # Walidacja parametrów wejściowych (Pydantic)
  providers.py  # NASA POWER + ISRIC SoilGrids WCS
  crops.py      # Katalog roślin
  engine.py     # Ocena i generowanie płodozmianów
  __init__.py
frontend-example/
  api.js        # Gotowy klient JS do wklejenia do React/Vite
.env.example    # Przykładowe zmienne dla backendu
pyproject.toml  # Zależności i wersja 1.0.0
README.md
```

## 2. Wymagania

- Python **3.12+**, pip, połączenie internetowe do pracy w `live`.
- GDAL z modułem Python `osgeo` dla odczytu rasterów SoilGrids; na Fedorze najłatwiej korzystać z systemowego Pythona i pakietów `gdal`, `python3-gdal`.
- `curl` i opcjonalnie `jq` do ręcznych testów.

### Fedora — instalacja

```bash
sudo dnf install python3-gdal gdal python3-pip
cd ~/Pulpit/nasa/terrarotation-mvp   # lub katalog rozpakowanej paczki
python -m pip install -e .
python -c 'from osgeo import gdal, osr; print("GDAL:", gdal.VersionInfo())'
python -m uvicorn terrarotation.api:app --reload --host 127.0.0.1 --port 8000
```

Jeśli `from osgeo import gdal` nie działa, sprawdź, czy `python` wskazuje na tę samą instalację, w której zainstalowano `python3-gdal`. Wirtualne środowiska często nie widzą systemowego GDAL. Nie instaluj w ciemno innej wersji GDAL przez pip — bindingi powinny odpowiadać bibliotece systemowej.

**Działające adresy:** `http://127.0.0.1:8000/docs` (Swagger), `http://127.0.0.1:8000/openapi.json` (specyfikacja), `http://127.0.0.1:8000/api/v1/health`.

## 3. API dla frontendu

**Base URL:** `http://127.0.0.1:8000` (lokalnie); prefix: `/api/v1`.

| Metoda | Ścieżka | Co zwraca |
|---|---|---|
| GET | `/api/v1/health` | Status i wersja |
| GET | `/api/v1/config` | Dozwolone scenariusze, wartości domyślne, limity |
| GET | `/api/v1/crops` | Lista identyfikatorów i parametrów upraw |
| POST | `/api/v1/recommend` | Dane gleby i klimatu + rekomendacje i symulacja roczna |
| GET | `/docs` | Interaktywny Swagger UI |
| GET | `/openapi.json` | Kontrakt OpenAPI do generowania typów |

Stare `/health`, `/crops`, `/recommend` również działają, ale **frontend powinien używać `/api/v1/*`**.

### Minimalny request

```bash
curl -sS http://127.0.0.1:8000/api/v1/recommend \
  -H 'Content-Type: application/json' \
  -d '{"latitude":52.28,"longitude":16.70,"years":4,"scenario":"balanced","climate_years":10,"mode":"live"}' \
  | jq '{status:.engine.status, soil:.soil.layers, climate:.climate, best:.engine.recommendations[0]}'
```

**`live`** pobiera dane ze źródeł zewnętrznych. **`demo`** korzysta z danych przykładowych i jest dobry do pracy nad UI bez czekania na sieć:

```bash
curl -sS http://127.0.0.1:8000/api/v1/recommend \
  -H 'Content-Type: application/json' \
  -d '{"latitude":52.28,"longitude":16.70,"years":4,"mode":"demo"}' | jq .
```

### Parametry `POST /api/v1/recommend`

| Pole | Typ | Domyślnie | Znaczenie |
|---|---|---|---|
| `latitude` | number, -90…90 | wymagane | Szerokość geograficzna |
| `longitude` | number, -180…180 | wymagane | Długość geograficzna |
| `years` | integer, 2…6 | `4` | Długość planu |
| `scenario` | string | `balanced` | `balanced`, `soil`, `resilience`, `profit` |
| `climate_years` | integer, 3…20 | `10` | Liczba pełnych lat historii klimatu |
| `mode` | string | `live` | `live` lub `demo` |
| `top_k` | integer, 1…20 | `5` | Maksymalna liczba rekomendacji |
| `history` | string[] | `[]` | Historia upraw, identyfikatory z `/crops` |
| `allowed_crops` | string[] lub null | `null` | Dozwolone uprawy; null = wszystkie |
| `max_candidates` | integer, 100…500000 | `100000` | Limit przeszukania |
| `ph_override` | number lub null, 0…14 | `null` | Ręczne pH zamiast wartości zagregowanej |
| `sand_override` | number lub null, 0…100 | `null` | Ręczny udział piasku (%) |
| `soc_override` | number lub null, >=0 | `null` | Ręczny SOC (g/kg) |

**Nie wpisuj nazw polskich w `history` ani `allowed_crops`:** API używa identyfikatorów, np. `pea`, `rye`, `rapeseed`, `potato`. Listę pobieraj z `/api/v1/crops`.

### Struktura odpowiedzi

```json
{
  "input": {"latitude": 52.28, "longitude": 16.70, "years": 4},
  "soil": {"layers": [{"depth": "0-5cm", "ph": 6.3}], "warnings": []},
  "climate": {"avg_temp_c": 9.9, "annual_rain_mm": 627, "warnings": []},
  "engine": {
    "status": "ok",
    "explored": 2172,
    "truncated": false,
    "recommendations": [
      {"rotation": ["pea", "rapeseed", "potato", "rye"],
       "score": 0.74,
       "metrics": {"fit": 0.98, "soil": 0.47, "resilience": 0.55, "profit": 0.71, "diversity": 1.0},
       "explanations": ["..."],
       "year_by_year": [{"year": 1, "crop": "pea", "nitrogen_index": 0.61, "organic_matter_index": 0.5245}]}
    ],
    "warnings": []
  },
  "disclaimer": "..."
}
```

Powyżej jest **skrócony przykład poglądowy**, a nie pełna odpowiedź: realne obiekty zawierają więcej pól. Frontend nie powinien polegać na przykładowych liczbach. Pełny aktualny schemat jest w `/openapi.json`.

- `engine.status`: `ok`, `insufficient_data` albo `no_feasible_rotation`.
- Przy `ok` czytaj `engine.recommendations` (tablica może być pusta w innych statusach).
- `soil.layers`: profil 0–5, 5–15, 15–30 cm (o ile dostępny).
- `year_by_year`: lista lat z `crop`, `previous_crop`, `pre_crop_bonus`, `fit`, `nitrogen_index`, `organic_matter_index`.
- `soil.warnings`, `climate.warnings`, `engine.warnings`: wyświetlaj użytkownikowi.
- `truncated: true` oznacza, że nie przeszukano wszystkich wariantów.
- **HTTP 422**: błędne parametry (np. współrzędne poza zakresem, nieznane rośliny).
- **HTTP 200 z `insufficient_data`**: brak wymaganych danych źródłowych, a nie sukces rekomendacji.

## 4. Integracja z React / Vite

W repo frontendu dodaj `.env.local`:

```dotenv
VITE_API_URL=http://127.0.0.1:8000
```

Skopiuj `frontend-example/api.js` do `src/api.js`, a potem:

```js
import { getConfig, getCrops, recommendRotation } from './api';

const config = await getConfig();
const catalog = await getCrops();
const result = await recommendRotation({ latitude: 52.28, longitude: 16.70, years: 4, mode: 'live' });
if (result.engine.status === 'ok') {
  console.log(result.engine.recommendations[0]?.rotation);
} else {
  console.warn(result.engine.status, result.engine.warnings);
}
```

Mapa daje `latitude` i `longitude`, formularz daje `years`, `scenario`, opcjonalnie `history`, a widok wyniku wyświetla `soil.layers`, `climate` i `engine.recommendations`. Wybór upraw w UI powinien używać `id` z katalogu.

### CORS i uruchamianie na dwóch komputerach

Domyślnie akceptowane są originy `http://localhost` i `http://127.0.0.1` na portach `3000`, `5173`, `8080`. Inny frontend? Ustaw na backendzie:

```bash
TERRAROTATION_CORS_ORIGINS='http://localhost:5173,http://192.168.1.20:5173' \
  python -m uvicorn terrarotation.api:app --host 0.0.0.0 --port 8000
```

`192.168.1.20` jest **przykładem**, podmień na rzeczywisty adres maszyny frontendu. Frontend na innym komputerze **nie może** używać `127.0.0.1` jako adresu backendu — podaj adres IP lub domenę serwera backendowego. Port 8000 musi być dostępny w sieci; nie wystawiaj developmentowego serwera bez zabezpieczeń do publicznego Internetu.

## 5. Najczęstsze problemy

- **`ModuleNotFoundError: osgeo`** — Python nie widzi bindingów GDAL; sprawdź `python -c 'from osgeo import gdal'`.
- **`No module named uvicorn`** — uruchom `python -m pip install -e .` tym samym Pythonem.
- **CORS blocked** — dodaj dokładny origin frontendu do `TERRAROTATION_CORS_ORIGINS` i uruchom backend ponownie.
- **`Failed to fetch`** — sprawdź `/api/v1/health`, host, port, firewall i czy przeglądarka może połączyć się z backendem.
- **`insufficient_data`** — sprawdź ostrzeżenia; źródła NASA POWER / SoilGrids mogą być niedostępne; do pokazu UI przełącz na `demo`.
- **422** — sprawdź body w `/docs`, identyfikatory upraw i zakresy parametrów.
- **Pierwsze wywołanie `live` trwa dłużej** — dane pobierane są z zewnętrznych usług; frontend powinien pokazać loading i umożliwić ponowienie.

## 6. Co dokładnie jest modelem, a co danymi?

- **NASA POWER**: historyczne temperatury i opady; **to nie prognoza pogody**.
- **SoilGrids**: przestrzenne estymacje pH, SOC i tekstury na trzech głębokościach; **to nie wyniki próbek laboratoryjnych**.
- **Wynik upraw, wpływ przedplonu, rentowność, indeksy azotu i materii organicznej**: heurystyki demonstracyjne, **nie rzeczywiste kg N/ha, przewidywany plon ani zweryfikowane zmiany SOC**.
- To MVP na hackathon: nie podejmuj na tej podstawie samodzielnie decyzji produkcyjnych.

## 7. Przekazanie zespołowi

Backendowiec uruchamia serwer i udostępnia adres API; frontendowiec bierze `frontend-example/api.js` oraz `/docs` i `/openapi.json`. Do pracy nad wyglądem można używać `mode: "demo"`; przed pokazem jury sprawdzić `mode: "live"` i komunikaty błędów.
# 2026-hackathon-nasa
# 2026-hackathon-nasa
