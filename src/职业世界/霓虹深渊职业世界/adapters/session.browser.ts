import type { ManualSaveSnapshot, SessionState } from './runtime';

const SESSION_STORAGE_KEY = 'neon-abyss-career-world.story_session';
const MANUAL_SAVE_STORAGE_KEY = 'neon-abyss-career-world.story_manual_save';
const MANUAL_SAVES_STORAGE_KEY = 'neon-abyss-career-world.story_manual_saves';

function normalizeManualSave(value: unknown, fallbackName: string): ManualSaveSnapshot | null {
  if (!_.isPlainObject(value)) {
    return null;
  }

  const snapshot = value as Partial<ManualSaveSnapshot>;
  if (snapshot.version !== 1 || !snapshot.gameState || !snapshot.session) {
    return null;
  }

  return {
    ...(snapshot as ManualSaveSnapshot),
    id: typeof snapshot.id === 'string' && snapshot.id ? snapshot.id : `legacy-${snapshot.savedAt ?? Date.now()}`,
    name: typeof snapshot.name === 'string' && snapshot.name.trim() ? snapshot.name : fallbackName,
    savedAt: typeof snapshot.savedAt === 'string' ? snapshot.savedAt : new Date().toISOString(),
    socialAvatars: _.isPlainObject(snapshot.socialAvatars) ? snapshot.socialAvatars : {},
  };
}

function parseStoredManualSaves(raw: string | null): ManualSaveSnapshot[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry, index) => normalizeManualSave(entry, `存档 ${index + 1}`))
        .filter((entry): entry is ManualSaveSnapshot => entry !== null);
    }

    const legacy = normalizeManualSave(parsed, '旧存档');
    return legacy ? [legacy] : [];
  } catch {
    return [];
  }
}

export function loadBrowserSession(): Partial<SessionState> | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return _.isPlainObject(parsed) ? (parsed as Partial<SessionState>) : null;
  } catch {
    return null;
  }
}

export function saveBrowserSession(session: SessionState): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function loadBrowserManualSaves(): ManualSaveSnapshot[] {
  const current = parseStoredManualSaves(localStorage.getItem(MANUAL_SAVES_STORAGE_KEY));
  if (current.length > 0) {
    return current;
  }

  return parseStoredManualSaves(localStorage.getItem(MANUAL_SAVE_STORAGE_KEY));
}

export function saveBrowserManualSaves(snapshots: ManualSaveSnapshot[]): void {
  localStorage.setItem(MANUAL_SAVES_STORAGE_KEY, JSON.stringify(snapshots));
}
