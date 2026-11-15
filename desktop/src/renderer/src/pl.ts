export const cropNames: Record<string, string> = {
  pea: 'Pea',
  rapeseed: 'Rapeseed',
  potato: 'Potato',
  rye: 'Rye',
  wheat: 'Wheat',
  barley: 'Barley',
  oats: 'Oats',
  maize: 'Maize',
  soybean: 'Soybean',
  sunflower: 'Sunflower',
  sugar_beet: 'Sugar beet',
};

export function cropName(id: string): string {
  return cropNames[id.toLowerCase()] ?? id;
}
