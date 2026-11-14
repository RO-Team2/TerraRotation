## Sentinel-2 credentials (optional)

The Esri/OSM basemap does not need Copernicus credentials. The **Sentinel-2 NDVI analysis** does: create an OAuth client in the [Copernicus Data Space Dashboard](https://shapps.dataspace.copernicus.eu/dashboard/) and set the credentials in the same terminal that will start the backend. In WSL/Linux:

```bash
cd ~/nasa-git
export COPERNICUS_CLIENT_ID='your-client-id'
export COPERNICUS_CLIENT_SECRET='your-client-secret'
python -m uvicorn terraengine.api:app --reload --host 0.0.0.0 --port 8000
```

In PowerShell:

```powershell
$env:COPERNICUS_CLIENT_ID = 'your-client-id'
$env:COPERNICUS_CLIENT_SECRET = 'your-client-secret'
python -m uvicorn terraengine.api:app --reload --host 0.0.0.0 --port 8000
```

Keep the client secret on the backend. Do not put credentials in the renderer, commit them to Git, or use `VITE_` variables for secrets. If you have not created a Copernicus OAuth client, rotation planning with NASA POWER/SoilGrids can still be used; only the Sentinel-2 analysis action requires these credentials.
