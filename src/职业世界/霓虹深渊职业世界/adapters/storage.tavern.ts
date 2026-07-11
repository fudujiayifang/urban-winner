import type { GameState } from '../schema';

const TAVERN_VARIABLE_OPTION = { type: 'chat' } as const satisfies VariableOption;

export function loadTavernState(): Partial<GameState> | null {
  const variables = getVariables(TAVERN_VARIABLE_OPTION);
  const statData = _.get(variables, 'stat_data');
  return _.isPlainObject(statData) ? (statData as Partial<GameState>) : null;
}

export function saveTavernState(data: GameState): void {
  updateVariablesWith(variables => _.set(variables, 'stat_data', klona(data)), TAVERN_VARIABLE_OPTION);
}
