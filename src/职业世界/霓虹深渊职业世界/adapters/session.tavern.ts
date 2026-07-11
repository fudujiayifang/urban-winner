import type { SessionState } from './runtime';

const TAVERN_VARIABLE_OPTION = { type: 'chat' } as const satisfies VariableOption;

export function loadTavernSession(): Partial<SessionState> | null {
  const variables = getVariables(TAVERN_VARIABLE_OPTION);
  const session = _.get(variables, 'story_session');
  return _.isPlainObject(session) ? (session as Partial<SessionState>) : null;
}

export function saveTavernSession(session: SessionState): void {
  updateVariablesWith(variables => _.set(variables, 'story_session', klona(session)), TAVERN_VARIABLE_OPTION);
}
