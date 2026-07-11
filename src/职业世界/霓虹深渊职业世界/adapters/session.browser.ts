import type { SessionState } from './runtime';

const SESSION_STORAGE_KEY = 'neon-abyss-career-world.story_session';

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
