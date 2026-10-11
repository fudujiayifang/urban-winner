import type { ManualSaveSnapshot, SessionState } from './runtime';

const TAVERN_VARIABLE_OPTION = { type: 'chat' } as const satisfies VariableOption;
const TAVERN_CHARACTER_OPTION = { type: 'character' } as const satisfies VariableOption;

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

function normalizeManualSaves(value: unknown): ManualSaveSnapshot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => normalizeManualSave(entry, `存档 ${index + 1}`))
    .filter((entry): entry is ManualSaveSnapshot => entry !== null);
}

export function loadTavernSession(): Partial<SessionState> | null {
  const variables = getVariables(TAVERN_VARIABLE_OPTION);
  const session = _.get(variables, 'story_session');
  return _.isPlainObject(session) ? (session as Partial<SessionState>) : null;
}

export function saveTavernSession(session: SessionState): void {
  updateVariablesWith(variables => _.set(variables, 'story_session', klona(session)), TAVERN_VARIABLE_OPTION);
}

export function loadTavernManualSaves(): ManualSaveSnapshot[] {
  const characterVariables = getVariables(TAVERN_CHARACTER_OPTION);
  const saves = normalizeManualSaves(_.get(characterVariables, 'neon_abyss_career_world.manual_saves'));
  if (saves.length > 0) {
    return saves;
  }

  const chatVariables = getVariables(TAVERN_VARIABLE_OPTION);
  const legacySave = normalizeManualSave(_.get(chatVariables, 'story_manual_save'), '旧存档');
  return legacySave ? [legacySave] : [];
}

export function saveTavernManualSaves(snapshots: ManualSaveSnapshot[]): void {
  updateVariablesWith(
    variables => _.set(variables, 'neon_abyss_career_world.manual_saves', klona(snapshots)),
    TAVERN_CHARACTER_OPTION,
  );
}
