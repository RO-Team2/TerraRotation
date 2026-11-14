from .engine import metrics, simulate_rotation, weighted_score
SCENARIOS = {'baseline': (1.0, 0.0), 'drought': (0.75, 1.5), 'wet': (1.3, 0.0), 'heat': (0.9, 3.0)}

def rotation_dna(rotation, soil, climate, history=()):
    dimensions = metrics(rotation, soil, climate, history)
    timeline = simulate_rotation(rotation, soil, climate, history)
    return {'dimensions': dimensions, 'strongest': max(dimensions, key=dimensions.get), 'weakest': min(dimensions, key=dimensions.get), 'year_by_year': timeline, 'method': 'relative_heuristic_indices'}

def confidence_report(soil, climate, mode, requested_years):
    soil_fields = ('ph', 'sand_pct', 'clay_pct', 'silt_pct', 'soc_g_kg')
    available = sum((getattr(soil, field) is not None for field in soil_fields))
    years = climate.climate_years or 0
    checks = {'real_data': mode == 'live' and (not soil.source.startswith('unavailable')) and (not climate.source.startswith('unavailable')), 'soil_coverage': available / len(soil_fields), 'climate_coverage': min(years / requested_years, 1.0), 'soil_layers': len(soil.layers), 'climate_years': years}
    limitations = ['Ocena jakości danych, nie prawdopodobieństwo poprawności rekomendacji.']
    if mode == 'demo':
        limitations.append('Dane demonstracyjne są syntetyczne lub przykładowe.')
    if available < len(soil_fields):
        limitations.append('Niekompletne parametry gleby.')
    if years < requested_years:
        limitations.append('Mniej pełnych lat klimatycznych niż zażądano.')
    if soil.warnings or climate.warnings:
        limitations.append('Źródła danych zgłosiły ostrzeżenia.')
    return {'checks': checks, 'limitations': limitations, 'validated_prediction': False}

def stress_test(recommendations, soil, climate, scenario, history=()):
    if climate.annual_rain_mm is None or climate.avg_temp_c is None:
        return {'method': 'heuristic_sensitivity_analysis', 'scenarios': [], 'warnings': ['Brak danych klimatycznych.']}
    scenarios = []
    baseline = {tuple(plan['rotation']): plan['score'] for plan in recommendations}
    for name, (rain_factor, temperature_delta) in SCENARIOS.items():
        modified = climate.model_copy(update={'annual_rain_mm': climate.annual_rain_mm * rain_factor, 'avg_temp_c': climate.avg_temp_c + temperature_delta})
        plans = []
        for plan in recommendations:
            rotation = plan['rotation']
            values = metrics(rotation, soil, modified, history)
            score = weighted_score(values, scenario)
            plans.append({'rotation': rotation, 'score': score, 'score_change': round(score - baseline[tuple(rotation)], 5), 'metrics': values, 'year_by_year': simulate_rotation(rotation, soil, modified, history)})
        plans.sort(key=lambda item: (-item['score'], item['rotation']))
        scenarios.append({'id': name, 'rain_change_pct': round((rain_factor - 1) * 100), 'temperature_change_c': temperature_delta, 'plans': plans})
    robustness = []
    for plan in recommendations:
        rotation = plan['rotation']
        scores = [next((p['score'] for p in s['plans'] if p['rotation'] == rotation)) for s in scenarios]
        robustness.append({'rotation': rotation, 'worst_score': min(scores), 'best_score': max(scores), 'average_score': round(sum(scores) / len(scores), 5), 'range': round(max(scores) - min(scores), 5)})
    robustness.sort(key=lambda item: (-item['worst_score'], -item['average_score'], item['rotation']))
    return {'method': 'heuristic_sensitivity_analysis', 'scenarios': scenarios, 'robustness': robustness, 'disclaimer': 'Hipotetyczne zmiany średnich warunków; nie są prognozą pogody, plonów ani dynamiki gleby.'}
