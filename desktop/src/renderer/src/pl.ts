export const cropNames: Record<string, string> = {
  pea: 'Groch',
  rapeseed: 'Rzepak',
  potato: 'Ziemniak',
  rye: 'Żyto',
  wheat: 'Pszenica',
  barley: 'Jęczmień',
  oats: 'Owies',
  maize: 'Kukurydza',
  soybean: 'Soja',
  sunflower: 'Słonecznik',
  sugar_beet: 'Burak cukrowy',
};

export function cropName(id: string): string {
  return cropNames[id.toLowerCase()] ?? id;
}
