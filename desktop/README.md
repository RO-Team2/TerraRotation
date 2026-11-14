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


## Eksport PDF według widoku

Przycisk „Eksportuj do PDF” przy wynikach zapisuje wyłącznie raport aktywnej
zakładki. Analiza pola zawiera podsumowanie lokalizacji i scenariusza,
parametry gleby/klimatu, pełną rotację, wykresy punktacji oraz alternatywy.
Mapa zawiera POWER, NDVI, SMAP, ECOSTRESS, interpretację, ograniczenia oraz
szczegółowe wyniki NDVI. Eksport jest dostępny po zakończeniu analizy;
raport z częściowo niedostępnymi źródłami zachowuje informacje o brakach.

Main process robi kopię wyników przed otwarciem okna zapisu i drukuje ją
przez `webContents.printToPDF()` w ukrytym oknie. Zmiana zakładki podczas
zapisywania nie zmienia treści PDF. Reguły `@media print` w `print.css`
zapewniają pionowe A4, marginesy, zawijanie długich wariantów i podział
wielostronicowych raportów bez ograniczeń wysokości ekranu. Formularze,
nawigacja, podkład Esri i przyciski nie są drukowane.

Test integracyjny: `npm run test:pdf` (wymaga sesji graficznej oraz
`pdftotext` i `pdfinfo` z Popplera). Test uruchamia rzeczywisty renderer
z danymi testowymi, generuje oba PDF-y natywną metodą Electrona i sprawdza
A4, kompletność tekstu, brak treści drugiej zakładki, paginację i anulowanie
okna zapisu. Pliki wynikowe są w katalogu tymczasowym wskazanym przez test.
