import type { GameState } from '../schema';

const STORAGE_KEY = 'neon-abyss-career-world.stat_data';
const AVATAR_STORAGE_KEY = 'neon-abyss-career-world.social_avatars';

export function loadBrowserState(): Partial<GameState> | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return _.isPlainObject(parsed) ? (parsed as Partial<GameState>) : null;
  } catch {
    return null;
  }
}

export function saveBrowserState(data: GameState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadBrowserAvatarState(): Record<string, string> | null {
  const raw = localStorage.getItem(AVATAR_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return _.isPlainObject(parsed) ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

export function saveBrowserAvatarState(data: Record<string, string>): void {
  localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(data));
}
