import type { CustomOpening } from './runtime';

const STORAGE_KEY = 'neon-abyss-career-world.custom_openings';
const CHARACTER_OPTION = { type: 'character' } as const satisfies VariableOption;

function normalizeOpenings(value: unknown): CustomOpening[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CustomOpening =>
    _.isPlainObject(item) &&
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.content === 'string',
  );
}

export function loadCustomOpenings(): CustomOpening[] {
  try {
    if (typeof getVariables === 'function') {
      return normalizeOpenings(_.get(getVariables(CHARACTER_OPTION), 'neon_abyss_career_world.custom_openings'));
    }
    return normalizeOpenings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function saveCustomOpenings(openings: CustomOpening[]): void {
  if (typeof updateVariablesWith === 'function' && typeof getVariables === 'function') {
    updateVariablesWith(variables => _.set(variables, 'neon_abyss_career_world.custom_openings', klona(openings)), CHARACTER_OPTION);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(openings));
}
