import _ from 'lodash';

import { normalizePenisState } from '../schema';
import type { GameState, SocialCharacterState, TargetState } from '../schema';

export type SocialCharacterPatch = Partial<SocialCharacterState> | null;
export type TargetPatch = Partial<TargetState>;

export type SocialScenePatch = {
  零七系统?: {
    当前地点?: string;
  };
  周围人物?: Record<string, SocialCharacterPatch>;
  历史人物?: Record<string, SocialCharacterPatch>;
  攻略目标?: Record<string, TargetPatch>;
};

export type ScenePresenceMode = 'replace' | 'append' | 'solitude';

export interface SetScenePresenceInput {
  names: string[];
  mode: ScenePresenceMode;
  location?: string;
  characterPatches?: Record<string, Partial<SocialCharacterState>>;
}

const MAX_NAME_LENGTH = 24;
const SOLITUDE_PATTERN = /独处|单独|只有|只剩|仅有|两人|二人|一对一|私下|没(?:有)?别人|无人打扰/;
const GROUP_PRESENCE_PATTERN = /(?:[一二两三四五六七八九十\d]+\s*个?人|大家|众人|全员|所有人|一行人)(?:都|全|一起|同时)?(?:在|到齐|聚在|留在|站在|坐在|集合|出现)/;

function sanitizeName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().slice(0, MAX_NAME_LENGTH);
  return normalized.length > 0 ? normalized : null;
}

function getAllTrackedNames(state: GameState): string[] {
  return _.uniq([
    ...Object.keys(state.周围人物),
    ...Object.keys(state.历史人物),
    ...Object.keys(state.攻略目标),
  ]);
}

function getTrackedNamesInText(text: string, state: GameState): string[] {
  return getAllTrackedNames(state).filter(name => text.includes(name));
}

function getCurrentNearbyNames(state: GameState): string[] {
  return Object.keys(state.周围人物);
}

function getTrackedCharacterLocation(state: GameState, name: string): string | undefined {
  return state.攻略目标[name]?.当前位置
    ?? state.周围人物[name]?.当前位置
    ?? state.历史人物[name]?.当前位置;
}

export function hasStrongSolitudeSignal(text: string): boolean {
  return SOLITUDE_PATTERN.test(text);
}

export function hasGroupPresenceSignal(text: string): boolean {
  return GROUP_PRESENCE_PATTERN.test(text);
}

export function targetToSocialCharacterPatch(target: TargetState): Partial<SocialCharacterState> {
  return {
    好感度: target.好感度,
    关系: target.好感度等级,
    心情: target.心情,
    当前位置: target.当前位置,
    心里想法: target.心里想法,
    身份: target.基础信息.身份,
    年龄: target.基础信息.年龄,
    种族: target.基础信息.种族,
    性格: target.职业信息.天赋,
    当前状态: normalizePenisState(target.阴茎状态),
    外貌: target.职业信息.职业名称,
    衣着: [
      target.衣物状态.衣服,
      target.衣物状态.裤子,
      target.衣物状态.鞋子,
    ].filter(Boolean).join(' / '),
    备注: `${target.职业信息.职业名称}｜${target.职业信息.派系}`,
  };
}

function resolveSocialCharacterPatch(
  state: GameState,
  name: string,
  override?: Partial<SocialCharacterState>,
): Partial<SocialCharacterState> | null {
  const existing = state.周围人物[name] ?? state.历史人物[name];
  const target = state.攻略目标[name];
  const base = target
    ? {
        ...existing,
        ...targetToSocialCharacterPatch(target),
        备注: existing?.备注 || targetToSocialCharacterPatch(target).备注,
      }
    : existing;
  const merged = {
    ...(base ?? {}),
    ...(override ?? {}),
  };

  return Object.keys(merged).length > 0 ? merged : null;
}

function mergeScenePatches(...patches: Array<SocialScenePatch | null | undefined>): SocialScenePatch | null {
  const result: SocialScenePatch = {};

  for (const patch of patches) {
    if (!patch) {
      continue;
    }

    if (patch.零七系统?.当前地点) {
      result.零七系统 = {
        ...result.零七系统,
        当前地点: patch.零七系统.当前地点,
      };
    }

    if (patch.周围人物) {
      result.周围人物 = {
        ...(result.周围人物 ?? {}),
        ...patch.周围人物,
      };
    }

    if (patch.历史人物) {
      result.历史人物 = {
        ...(result.历史人物 ?? {}),
        ...patch.历史人物,
      };
    }

    if (patch.攻略目标) {
      result.攻略目标 = {
        ...(result.攻略目标 ?? {}),
        ...patch.攻略目标,
      };
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

export function setScenePresence(state: GameState, input: SetScenePresenceInput): SocialScenePatch | null {
  const names = _.uniq(input.names.map(sanitizeName).filter((name): name is string => name != null));
  if (names.length === 0) {
    return null;
  }

  const nearbyPatch: Record<string, SocialCharacterPatch> = {};
  for (const name of names) {
    const characterPatch = resolveSocialCharacterPatch(state, name, input.characterPatches?.[name]);
    if (characterPatch) {
      nearbyPatch[name] = characterPatch;
    }
  }

  if (input.mode === 'replace' || input.mode === 'solitude') {
    for (const existingName of getCurrentNearbyNames(state)) {
      if (!(existingName in nearbyPatch)) {
        nearbyPatch[existingName] = null;
      }
    }
  }

  if (Object.keys(nearbyPatch).length === 0) {
    return null;
  }

  return {
    零七系统: {
      当前地点: input.location ?? state.零七系统.当前地点,
    },
    周围人物: nearbyPatch,
  };
}

export function enterSolitudeWith(state: GameState, name: string, location?: string): SocialScenePatch | null {
  return setScenePresence(state, {
    names: [name],
    mode: 'solitude',
    location,
  });
}

export function completeNearbyReplacement(state: GameState, patch: SocialScenePatch): SocialScenePatch | null {
  if (!patch.周围人物) {
    return Object.keys(patch).length > 0 ? patch : null;
  }

  const presentNames = Object.entries(patch.周围人物)
    .filter(([, characterPatch]) => characterPatch !== null)
    .map(([name]) => name);
  const characterPatches = Object.fromEntries(
    Object.entries(patch.周围人物).filter(([, characterPatch]) => characterPatch !== null),
  ) as Record<string, Partial<SocialCharacterState>>;
  const replacementPatch = setScenePresence(state, {
    names: presentNames,
    mode: 'replace',
    location: patch.零七系统?.当前地点,
    characterPatches,
  });

  return mergeScenePatches(
    patch,
    replacementPatch
      ? {
          ...replacementPatch,
          周围人物: {
            ...patch.周围人物,
            ...replacementPatch.周围人物,
          },
        }
      : null,
  );
}

export function inferScenePresenceFromText(options: {
  state: GameState;
  userInput: string;
  maintext: string;
  basePatch?: SocialScenePatch;
}): SocialScenePatch | null {
  const { state, userInput, maintext, basePatch } = options;
  const socialText = `${userInput}\n${maintext}`;
  const namedTrackedCharacters = getTrackedNamesInText(socialText, state);

  if (hasStrongSolitudeSignal(socialText) && namedTrackedCharacters.length === 1) {
    const name = namedTrackedCharacters[0];
    return enterSolitudeWith(
      state,
      name,
      basePatch?.零七系统?.当前地点 ?? getTrackedCharacterLocation(state, name) ?? state.零七系统.当前地点,
    );
  }

  if (hasGroupPresenceSignal(socialText)) {
    const currentNearbyNames = getCurrentNearbyNames(state);
    const fallbackNames = namedTrackedCharacters.length > 0
      ? namedTrackedCharacters
      : currentNearbyNames;

    if (fallbackNames.length > 0) {
      return setScenePresence(state, {
        names: fallbackNames,
        mode: 'replace',
        location: basePatch?.零七系统?.当前地点 ?? state.零七系统.当前地点,
      });
    }
  }

  return null;
}

export function stabilizeSocialScenePatch(options: {
  state: GameState;
  patch?: SocialScenePatch | null;
  userInput: string;
  maintext: string;
}): SocialScenePatch | null {
  const completedPatch = options.patch ? completeNearbyReplacement(options.state, options.patch) : null;
  const textPatch = inferScenePresenceFromText({
    state: options.state,
    userInput: options.userInput,
    maintext: options.maintext,
    basePatch: completedPatch ?? undefined,
  });

  return mergeScenePatches(completedPatch, textPatch);
}
