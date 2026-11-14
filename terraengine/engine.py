from .crops import CROPS

WEIGHTS = {
    "balanced": {"fit": .35, "soil": .25, "resilience": .20, "profit": .20},
    "soil": {"fit": .25, "soil": .50, "resilience": .15, "profit": .10},
    "resilience": {"fit": .25, "soil": .20, "resilience": .45, "profit": .10},
    "profit": {"fit": .25, "soil": .10, "resilience": .10, "profit": .55},
}

def interval_score(value, lo, hi, margin):
    if value is None:
        return .5
    if lo <= value <= hi:
        return 1.0
    distance = min(abs(value - lo), abs(value - hi))
    return max(0.0, 1.0 - distance / margin)

def depth_weighted(soil, field):
    weights = {"0-5cm": 0.2, "5-15cm": 0.4, "15-30cm": 0.4}
    valid = [(getattr(layer, field), weights[layer.depth]) for layer in soil.layers
             if layer.depth in weights and getattr(layer, field) is not None]
    if not valid:
        return getattr(soil, field)
    weighted_total = sum(value * weight for value, weight in valid)
    total_weight = sum(weight for _, weight in valid)
    return weighted_total / total_weight

def crop_fit(crop, soil, climate):
    ph = depth_weighted(soil, "ph")
    sand = depth_weighted(soil, "sand_pct")
    components = [interval_score(ph, crop.ph_min, crop.ph_max, 1.5),
                  interval_score(climate.annual_rain_mm, crop.rain_min, crop.rain_max, 350),
                  interval_score(climate.avg_temp_c, crop.temp_min, crop.temp_max, 6)]
    if sand is not None:
        components.append(1.0 if sand <= 60 else max(0.0, 1 - ((sand-60)/40)*(1-crop.sand_tolerance)))
    return sum(components) / len(components)

def can_follow(sequence, crop_id):
    crop = CROPS[crop_id]

    for i, old in enumerate(reversed(sequence), 1):
        if old == crop_id and i < crop.min_return_years:
            return False

    if sequence and CROPS[sequence[-1]].family == crop.family:
        return False
    return True

def simulate_rotation(rotation, soil, climate, history=()):
    """Transparent dimensionless soil-health and N-balance proxies; NOT kg N/ha or SOC forecasts."""
    nitrogen = 0.5
    organic = 0.5
    timeline = []
    previous = history[-1] if history else None

    for year, name in enumerate(rotation, 1):
        crop = CROPS[name]
        legume_previous = previous is not None and CROPS[previous].family == 'fabaceae'
        legume_current = crop.family == 'fabaceae'
        pre_crop_bonus = 0.08 if legume_previous and not legume_current else 0.0
        n_delta = 0.11 if legume_current else (-0.07 if name in ('maize', 'rapeseed') else -0.04)
        organic_delta = crop.soil_effect * 0.035
        nitrogen = max(0., min(1., nitrogen + n_delta))
        organic = max(0., min(1., organic + organic_delta))
        annual_fit = min(1., crop_fit(crop, soil, climate) + pre_crop_bonus)
        timeline.append({'year': year, 'crop': name,
                         'previous_crop': previous, 'pre_crop_bonus': round(pre_crop_bonus, 4),
                         'fit': round(annual_fit, 4), 'nitrogen_index': round(nitrogen, 4),
                         'organic_matter_index': round(organic, 4)})
        previous = name
    return timeline

def metrics(rotation, soil, climate, history=()):
    crops = [CROPS[name] for name in rotation]
    timeline = simulate_rotation(rotation, soil, climate, history)
    fit = sum(row["fit"] for row in timeline)/len(timeline)

    soil_score = max(0.0, min(1.0, .5 * timeline[-1]["nitrogen_index"] + .5 * timeline[-1]["organic_matter_index"]))
    resilience = sum(c.resilience for c in crops)/len(crops)

    if climate.annual_rain_mm and climate.annual_rain_std_mm is not None:
        cv = climate.annual_rain_std_mm / max(climate.annual_rain_mm, 1)
        resilience *= max(.65, 1 - min(cv, .7)*.30)
    if climate.dry_spell_max_days is not None:
        resilience *= max(.75, 1 - max(0, climate.dry_spell_max_days-20)*.005)
    profit = sum(c.profit for c in crops)/len(crops)
    diversity = len({c.family for c in crops}) / len(crops)
    return {"fit": round(fit, 4), "soil": round(soil_score, 4),
            "resilience": round(resilience, 4), "profit": round(profit, 4),
            "diversity": round(diversity, 4)}

def weighted_score(metrics_by_key, scenario):
    weights = WEIGHTS[scenario]
    weighted_metrics = sum(
        metrics_by_key[key] * weight for key, weight in weights.items()
    )
    return round(weighted_metrics * 0.9 + 0.1 * metrics_by_key["diversity"], 5)

def dominates(a, b):
    keys = ('fit', 'soil', 'resilience', 'profit', 'diversity')
    return all(a[k] >= b[k] for k in keys) and any(a[k] > b[k] for k in keys)

def explain(rotation, soil, climate, m):
    explanations = [f"Uprawy należą do różnych rodzin botanicznych; zachowano wymagane odstępy w {len(rotation)}-letnim planie.",
                    "Roczne wskaźniki azotu i materii organicznej są szacunkowe i nie przedstawiają rzeczywistych pomiarów gleby."]
    if any(CROPS[c].family == 'fabaceae' for c in rotation):
        explanations.append("Plan uwzględnia roślinę strączkową; jej korzystny wpływ na glebę jest modelowany, a nie potwierdzony pomiarem wiązania azotu.")
    if soil.sand_pct is not None and soil.sand_pct > 65:
        explanations.append(f"Uwzględniono udział piasku w glebie ({soil.sand_pct:.1f}%) przy ocenie dopasowania upraw.")
    if climate.climate_years:
        explanations.append(f"Dopasowanie klimatyczne oparto na {climate.climate_years} pełnych latach danych historycznych, a nie na prognozie pogody.")
    if climate.dry_spell_max_days is not None:
        explanations.append(f"Najdłuższy historyczny okres z opadem poniżej 1 mm/dzień: {climate.dry_spell_max_days} dni.")
    if climate.annual_rain_mm is None:
        explanations.append("Brak danych o opadach; ocena dopasowania upraw jest obarczona większą niepewnością.")
    explanations.append(f"Średnie dopasowanie agronomiczne: {m['fit']:.2f} w heurystycznej skali od 0 do 1.")
    return explanations

def recommend(req, soil, climate):
    allowed = sorted(set(req.allowed_crops) if req.allowed_crops is not None else CROPS)
    unknown = [x for x in allowed + req.history if x not in CROPS]
    if unknown:
        raise ValueError(f"Unknown crops: {sorted(set(unknown))}")
    if len(allowed) < 2:
        raise ValueError("At least two crops are required for rotation")

    missing = [name for name, value in (("soil.ph", soil.ph), ("soil.sand_pct", soil.sand_pct),
              ("climate.avg_temp_c", climate.avg_temp_c), ("climate.annual_rain_mm", climate.annual_rain_mm))
              if value is None]
    if missing:
        return {"status": "insufficient_data", "explored": 0, "truncated": False,
                "pareto_pool_limited": False, "recommendations": [],
                "warnings": ["Missing required inputs: " + ", ".join(missing)]}

    scores = []
    visited = 0
    truncated = False

    def dfs(seq):
        nonlocal visited, truncated
        if visited >= req.max_candidates:
            truncated = True
            return
        if len(seq) == req.years:
            visited += 1
            m = metrics(seq, soil, climate, req.history)
            scores.append((weighted_score(m, req.scenario), tuple(seq), m))
            return
        for name in allowed:
            if can_follow(req.history + seq, name):
                dfs(seq + [name])
                if truncated:
                    return

    dfs([])
    if not scores:
        return {"status": "no_feasible_rotation", "explored": visited, "truncated": truncated,
                "recommendations": [], "warnings": ["No rotation satisfies configured hard constraints"]}

    scores.sort(key=lambda x: (-x[0], x[1]))
    frontier = []
    for item in scores:
        if any(dominates(existing[2], item[2]) for existing in frontier):
            continue
        frontier = [existing for existing in frontier if not dominates(item[2], existing[2])]
        frontier.append(item)
    frontier.sort(key=lambda x: (-x[0], x[1]))
    chosen = frontier[:req.top_k]
    return {"status": "ok", "explored": visited, "truncated": truncated,
            "pareto_pool_limited": False,
            "recommendations": [{"rotation": list(seq), "score": score, "metrics": m,
                "explanations": explain(seq, soil, climate, m),
                "year_by_year": simulate_rotation(seq, soil, climate, req.history)} for score, seq, m in chosen],
            "warnings": (["Search truncated: results are not exhaustive"] if truncated else [])}
