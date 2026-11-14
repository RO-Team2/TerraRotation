# TerraRotation Desktop (Electron)

Frontend desktopowy dla istniejącego FastAPI. Renderer jest zbudowany w React + TypeScript; żądania HTTP wykonuje Electron main process przez bezpieczne API z `preload`/IPC.

## Uruchomienie deweloperskie

Wymagany Node.js 20+ oraz działający backend FastAPI z repo. W terminalu 1 uruchom backend według głównego README. Domyślnie frontend oczekuje API pod `http://127.0.0.1:8000`.

W terminalu 2:

```bash
cd desktop
npm install
npm run dev
```

Jeśli backend działa pod innym adresem, ustaw zmienną przed uruchomieniem:

```bash
TERRAROTATION_API_URL=http://192.168.1.20:8000 npm run dev
```

Windows PowerShell:

```powershell
$env:TERRAROTATION_API_URL="http://127.0.0.1:8000"
npm run dev
```

Aplikacja pobiera katalog upraw i status z `/api/v1/crops` oraz `/api/v1/health`; formularz wysyła żądanie do `/api/v1/recommend`. Tryb `demo` jest ustawiony domyślnie. Odpowiedź `live` może potrwać dłużej, a jej wynik nie jest prognozą pogody ani zweryfikowaną poradą agronomiczną.

## Budowanie

```bash
npm run build
```

To tworzy skompilowane pliki Electron/Vite w `out/`. Instalatory systemowe nie są jeszcze skonfigurowane.

## Bezpieczeństwo

Okno Electron ma `contextIsolation` i `sandbox` włączone oraz `nodeIntegration` wyłączone. Renderer nie ma bezpośredniego dostępu do Node.js. Backend FastAPI musi być uruchomiony osobno.

## Mapa pola i analityka

Leaflet wyświetla szczegółowy podkład Esri World Imagery z etykietami.
Przełącznik warstw udostępnia również mapę drogową OSM. Kafelki są pobierane
bezpośrednio od dostawcy; nie korzystają z kluczy Copernicus ani z dat analizy.

Wybierz punkt lub „Obrysuj pole”, zaznacz narożniki i zakończ obrys.
Ustaw daty i limit chmur, a następnie wybierz „Analizuj pole · Sentinel-2”.
Backend zwraca statystyki NDVI i powierzchnię analizowanego obszaru.
Opcjonalny GeoTIFF jest plikiem analitycznym do pobrania, nie tłem mapy.

Klient OAuth Copernicus (`COPERNICUS_CLIENT_ID`, `COPERNICUS_CLIENT_SECRET`)
pozostaje na backendzie. Frontend komunikuje się przez Electron IPC z
`POST /api/v1/satellite/field`. Konfiguracja i kontrakt API są w głównym README.

## Widoki po scaleniu interfejsu

Górny przełącznik zachowuje oba interfejsy: „Analiza LIVE i mapa” obsługuje
rzeczywisty backend FastAPI i Sentinel-2, a „Panel zespołu · DEMO” zawiera
nowy pulpit zespołu z przykładowymi gospodarstwami i lokalnymi metrykami.
