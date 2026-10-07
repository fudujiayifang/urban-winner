import type { GenerateResult, RawGenerateRequest } from '../adapters/runtime';
import type { GameState } from '../schema';
import {
  buildSystemStateSyncUserInput,
  sanitizeSystemStateSyncPatch,
  SYSTEM_SYNC_JSON_SCHEMA,
  type SystemStateSyncPatch,
} from './system-state-sync';
import {
  buildSocialSyncUserInput,
  parseSocialSyncResponse,
  sanitizeSocialSyncPatch,
  SOCIAL_SYNC_JSON_SCHEMA,
  type SocialSyncPatch,
} from './social-sync';
import { stabilizeSocialScenePatch } from './social-state-api';

export interface CombinedStateSyncPatch {
  system: SystemStateSyncPatch | null;
  social: SocialSyncPatch | null;
}

const COMBINED_STATE_SYNC_JSON_SCHEMA = {
  name: 'combined_state_sync_patch',
  description: '用于一次性修正地点、天气、任务和社交人物状态的 JSON 补丁',
  value: {
    type: 'object',
    additionalProperties: false,
    properties: {
      零七系统: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ...SYSTEM_SYNC_JSON_SCHEMA.value.properties.零七系统.properties,
          ...SOCIAL_SYNC_JSON_SCHEMA.value.properties.零七系统.properties,
        },
      },
      周围人物: SOCIAL_SYNC_JSON_SCHEMA.value.properties.周围人物,
      历史人物: SOCIAL_SYNC_JSON_SCHEMA.value.properties.历史人物,
      攻略目标: SOCIAL_SYNC_JSON_SCHEMA.value.properties.攻略目标,
    },
  },
} as const;

function buildCombinedStateSyncPrompt(systemEnabled: boolean, socialEnabled: boolean): string {
  const sections: string[] = [
    '你是一个只负责同步游戏结构化状态的 JSON 同步器。',
    '这是一次请求，必须只返回一个最小 JSON patch；不要输出解释、Markdown、XML 或额外文本。',
    '可以同时输出零七系统和人物社交字段；没有明确变化的部分不要输出。',
  ];

  if (systemEnabled) {
    sections.push(
      '系统状态范围：零七系统 下只允许输出 当前地点、当前天气、任务列表、已完成任务列表。',
      '系统规则：时间和日期由主系统根据正文统一结算，不要输出日期或时间；天气只写当前场景正在发生或明确切换的天气。',
      '新任务或任务状态变化写入任务列表；完成任务写入已完成任务列表并从任务列表删除同名任务，保留奖励配置字段。',
      '没有明确的地点、天气或任务变化时，不要猜测或创建任务。',
    );
  }

  if (socialEnabled) {
    sections.push(
      '社交状态范围：只允许输出周围人物、历史人物、攻略目标，以及零七系统.当前地点。',
      '周围人物只保留当前场景中确实在玩家身边、可立刻互动的人；离场人物移除，必要时在历史人物保留档案。',
      '玩家与单个角色独处或只剩两人时，周围人物必须只保留该角色；多人明确同场时列出能确认的具名人物。',
      '攻略目标只能更新已有角色，不允许新增全新攻略目标；无法稳定确认身份时不要猜。',
      '如果输出周围人物，必须回显当前地点；不要改任务、背包、商店、积分、签到、总结或手机社区字段。',
      '周围人物、历史人物和攻略目标只写本轮明确确认的变化；没有社交变化时返回空对象或省略这些字段。',
    );
  }

  sections.push('最终输出必须符合提供的 JSON schema，并且只能使用本请求允许的字段。');
  return sections.join('\n');
}

function buildCombinedStateSyncUserInput(options: {
  state: GameState;
  userInput: string;
  maintext: string;
  systemEnabled: boolean;
  socialEnabled: boolean;
}): string {
  const { state, userInput, maintext, systemEnabled, socialEnabled } = options;
  const payload: Record<string, unknown> = {};

  if (systemEnabled) {
    payload.系统同步输入 = JSON.parse(buildSystemStateSyncUserInput({ state, userInput, maintext }));
  }
  if (socialEnabled) {
    payload.社交同步输入 = JSON.parse(buildSocialSyncUserInput({ state, userInput, maintext }));
  }

  return JSON.stringify(payload, null, 2);
}

export async function syncCombinedStateBestEffort(options: {
  generateRaw?: (request: RawGenerateRequest) => Promise<GenerateResult>;
  state: GameState;
  userInput: string;
  maintext: string;
  systemEnabled: boolean;
  socialEnabled: boolean;
}): Promise<CombinedStateSyncPatch | null> {
  const {
    generateRaw,
    state,
    userInput,
    maintext,
    systemEnabled,
    socialEnabled,
  } = options;

  if (!maintext.trim() || !generateRaw || (!systemEnabled && !socialEnabled)) {
    return null;
  }

  const response = await generateRaw({
    systemPrompt: buildCombinedStateSyncPrompt(systemEnabled, socialEnabled),
    userInput: buildCombinedStateSyncUserInput({
      state,
      userInput,
      maintext,
      systemEnabled,
      socialEnabled,
    }),
    jsonSchema: COMBINED_STATE_SYNC_JSON_SCHEMA,
  });

  const parsed = parseSocialSyncResponse(response.rawText);
  const systemPatch = systemEnabled
    ? sanitizeSystemStateSyncPatch(parsed, state)
    : null;
  const rawSocialPatch = socialEnabled
    ? sanitizeSocialSyncPatch(parsed, state)
    : null;
  const socialPatch = socialEnabled
    ? stabilizeSocialScenePatch({
        state,
        patch: rawSocialPatch,
        userInput,
        maintext,
      })
    : null;

  return {
    system: systemPatch,
    social: socialPatch && Object.keys(socialPatch).length > 0 ? socialPatch : null,
  };
}
