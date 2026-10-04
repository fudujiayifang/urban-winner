import type { GameState } from '../schema';

const TAVERN_VARIABLE_OPTION = { type: 'chat' } as const satisfies VariableOption;
const TAVERN_GLOBAL_OPTION = { type: 'global' } as const satisfies VariableOption;

export function loadTavernState(): Partial<GameState> | null {
  const variables = getVariables(TAVERN_VARIABLE_OPTION);
  const statData = _.get(variables, 'stat_data');
  return _.isPlainObject(statData) ? (statData as Partial<GameState>) : null;
}

export function saveTavernState(data: GameState): void {
  updateVariablesWith(variables => _.set(variables, 'stat_data', klona(data)), TAVERN_VARIABLE_OPTION);
}

export function loadTavernAvatarState(): Record<string, string> | null {
  const variables = getVariables(TAVERN_GLOBAL_OPTION);
  const avatarData = _.get(variables, 'neon_abyss_career_world.social_avatars');
  return _.isPlainObject(avatarData) ? (avatarData as Record<string, string>) : null;
}

export function saveTavernAvatarState(data: Record<string, string>): void {
  updateVariablesWith(variables => _.set(variables, 'neon_abyss_career_world.social_avatars', klona(data)), TAVERN_GLOBAL_OPTION);
}
