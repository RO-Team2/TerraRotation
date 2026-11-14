"""Stable, frontend-friendly HTTP interface for the hackathon MVP."""
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import FieldRequest
from .providers import get_profiles
from .engine import recommend
from .crops import CROPS

app = FastAPI(
    title="TerraRotation API",
    version="1.0.0",
    description="Hackathon MVP: crop rotation recommendations from NASA POWER and ISRIC SoilGrids.",
)

# Comma-separated frontend origins; localhost defaults cover typical dev servers.
origins = [x.strip() for x in os.getenv(
    "TERRAROTATION_CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,"
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:8080,http://127.0.0.1:8080",
).split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)

@app.get("/api/v1/health", tags=["System"])
@app.get("/health", include_in_schema=False)
def health():
    return {"status": "ok", "service": "terrarotation", "version": "1.0.0"}

@app.get("/api/v1/config", tags=["Frontend"])
def config():
    """Values to populate UI selects without hardcoding backend rules."""
    return {
        "api_version": "v1",
        "scenarios": ["balanced", "soil", "resilience", "profit"],
        "modes": ["live", "demo"],
        "defaults": {"years": 4, "scenario": "balanced", "climate_years": 10,
                     "top_k": 5, "mode": "live"},
        "limits": {"years": {"min": 2, "max": 6},
                   "climate_years": {"min": 3, "max": 20},
                   "top_k": {"min": 1, "max": 20}},
    }

@app.get("/api/v1/crops", tags=["Frontend"])
@app.get("/crops", include_in_schema=False)
def crops():
    return {"crops": [vars(c) for c in CROPS.values()],
            "note": "Heuristic MVP catalog; not calibrated agronomic advice"}

@app.post("/api/v1/recommend", tags=["Recommendations"])
@app.post("/recommend", include_in_schema=False)
async def recommendation(req: FieldRequest):
    soil, climate = await get_profiles(req.latitude, req.longitude, req.mode, req.climate_years)
    updates = {}
    if req.ph_override is not None:
        updates["ph"] = req.ph_override
    if req.sand_override is not None:
        updates["sand_pct"] = req.sand_override
    if req.soc_override is not None:
        updates["soc_g_kg"] = req.soc_override
    if updates:
        soil = soil.model_copy(update=updates)
        soil.warnings = [*soil.warnings, "User-provided soil overrides applied"]
    try:
        result = recommend(req, soil, climate)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"input": req.model_dump(), "soil": soil.model_dump(),
            "climate": climate.model_dump(), "engine": result,
            "disclaimer": "Heuristic prototype; verify with local agronomist and field sampling"}
