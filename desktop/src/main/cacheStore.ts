import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface CachedNasaRecord {
  fieldId: string;
  syncedAt: string;
  payload: Record<string, unknown>;
}

function getCacheFilePath(): string {
  return join(app.getPath('userData'), 'nasa-earth-cache.json');
}

export function readNasaCache(fieldId: string): CachedNasaRecord | null {
  try {
    const filePath = getCacheFilePath();
    if (!existsSync(filePath)) return null;
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, CachedNasaRecord>;
    return raw[fieldId] ?? null;
  } catch {
    return null;
  }
}

export function writeNasaCache(fieldId: string, payload: Record<string, unknown>): CachedNasaRecord {
  const filePath = getCacheFilePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let store: Record<string, CachedNasaRecord> = {};
  if (existsSync(filePath)) {
    try {
      store = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, CachedNasaRecord>;
    } catch {
      store = {};
    }
  }

  const record: CachedNasaRecord = {
    fieldId,
    syncedAt: new Date().toISOString(),
    payload,
  };
  store[fieldId] = record;
  writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
  return record;
}
