from typing import Literal
from pydantic import BaseModel, Field, model_validator

class FieldRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    years: int = Field(default=4, ge=2, le=6)
    history: list[str] = Field(default_factory=list, max_length=10)
    allowed_crops: list[str] | None = None
    scenario: Literal['balanced', 'soil', 'resilience', 'profit'] = 'balanced'
    top_k: int = Field(default=5, ge=1, le=20)
    max_candidates: int = Field(default=100000, ge=100, le=500000)
    mode: Literal['live', 'demo'] = 'live'
    climate_years: int = Field(default=10, ge=3, le=20)
    ph_override: float | None = Field(default=None, ge=0, le=14)
    sand_override: float | None = Field(default=None, ge=0, le=100)
    soc_override: float | None = Field(default=None, ge=0)

    @model_validator(mode='after')
    def check_crops(self):
        if self.allowed_crops is not None and (not self.allowed_crops):
            raise ValueError('allowed_crops cannot be empty')
        return self

class SoilLayer(BaseModel):
    depth: str
    ph: float | None = None
    soc_g_kg: float | None = None
    clay_pct: float | None = None
    sand_pct: float | None = None
    silt_pct: float | None = None
    warnings: list[str] = Field(default_factory=list)

class SoilProfile(BaseModel):
    layers: list[SoilLayer] = Field(default_factory=list)
    ph: float | None = None
    soc_g_kg: float | None = None
    clay_pct: float | None = None
    sand_pct: float | None = None
    silt_pct: float | None = None
    source: str
    warnings: list[str] = Field(default_factory=list)

class ClimateProfile(BaseModel):
    avg_temp_c: float | None = None
    annual_rain_mm: float | None = None
    annual_rain_days: int | None = None
    observation_days: int | None = None
    climate_years: int | None = None
    annual_rain_std_mm: float | None = None
    dry_spell_max_days: int | None = None
    frost_days_mean: float | None = None
    source: str
    warnings: list[str] = Field(default_factory=list)

class AdaptRequest(FieldRequest):
    completed_crop: str
    previous_rotation: list[str] = Field(default_factory=list, max_length=6)
