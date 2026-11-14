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
