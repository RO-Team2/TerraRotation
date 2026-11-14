from dataclasses import dataclass

@dataclass(frozen=True)
class Crop:
    id: str
    family: str
    ph_min: float
    ph_max: float
    rain_min: float
    rain_max: float
    temp_min: float
    temp_max: float
    min_return_years: int
    soil_effect: float
    resilience: float
    profit: float
    sand_tolerance: float
CROPS = {crop.id: crop for crop in [Crop('wheat', 'poaceae', 6.0, 7.5, 450, 850, 6, 15, 2, -0.5, 0.55, 0.75, 0.55), Crop('barley', 'poaceae', 6.0, 7.5, 350, 750, 6, 16, 2, -0.4, 0.65, 0.65, 0.65), Crop('rye', 'poaceae', 5.0, 7.0, 300, 750, 4, 14, 2, -0.3, 0.8, 0.55, 0.95), Crop('oats', 'poaceae', 5.0, 7.0, 400, 900, 5, 15, 2, -0.2, 0.7, 0.55, 0.75), Crop('maize', 'poaceae', 5.8, 7.5, 450, 900, 9, 19, 2, -0.7, 0.45, 0.85, 0.45), Crop('potato', 'solanaceae', 5.0, 6.5, 450, 850, 6, 16, 4, -0.6, 0.55, 0.8, 0.7), Crop('rapeseed', 'brassicaceae', 6.0, 7.5, 500, 900, 5, 15, 4, -0.4, 0.5, 0.85, 0.35), Crop('soybean', 'fabaceae', 6.0, 7.5, 450, 900, 10, 19, 3, 0.7, 0.6, 0.75, 0.55), Crop('pea', 'fabaceae', 6.0, 7.5, 350, 800, 5, 16, 3, 0.7, 0.7, 0.65, 0.65), Crop('clover', 'fabaceae', 5.8, 7.5, 450, 1000, 4, 16, 3, 1.0, 0.8, 0.25, 0.6)]}
