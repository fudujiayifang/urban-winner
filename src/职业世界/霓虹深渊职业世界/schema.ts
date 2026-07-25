import _ from 'lodash';

export const PENIS_STATE_BASE_VALUES = ['自然下垂', '晨勃', '半勃起', '微软', '勃起'] as const;
export type PenisStateBase = (typeof PENIS_STATE_BASE_VALUES)[number];

const PENIS_STATE_DEFAULT: PenisStateBase = '自然下垂';
const PENIS_STATE_FORBIDDEN_PATTERNS = [/收鞘/g, /入鞘/g, /缩回鞘内/g, /退回鞘内/g, /鞘内/g, /生殖腔/g];
const PENIS_STATE_ALIAS_ENTRIES: Array<{ base: PenisStateBase; aliases: string[] }> = [
  { base: '晨勃', aliases: ['晨勃'] },
  { base: '半勃起', aliases: ['半勃起', '半硬', '轻微勃起', '略微勃起'] },
  { base: '微软', aliases: ['微软', '微硬', '微微抬头', '微勃'] },
  { base: '勃起', aliases: ['勃起', '完全勃起', '坚挺'] },
  { base: '自然下垂', aliases: ['自然下垂', '下垂'] },
];

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanupPenisStateDescription(value: string): string {
  return normalizeInlineText(
    value
      .replace(/^[,，。；;、:：|｜/\\\-—–]+/, '')
      .replace(/[,，。；;、:：|｜/\\\-—–]+$/, ''),
  );
}

function stripForbiddenPenisTerms(value: string): string {
  let next = value;
  for (const pattern of PENIS_STATE_FORBIDDEN_PATTERNS) {
    next = next.replace(pattern, ' ');
  }
  return cleanupPenisStateDescription(next);
}

function findPenisStateBase(value: string): { base: PenisStateBase; alias: string } | null {
  for (const entry of PENIS_STATE_ALIAS_ENTRIES) {
    for (const alias of [...entry.aliases].sort((left, right) => right.length - left.length)) {
      if (value.includes(alias)) {
        return { base: entry.base, alias };
      }
    }
  }

  return null;
}

export function tryNormalizePenisStateText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = normalizeInlineText(value);
  if (!normalized) {
    return null;
  }

  const hasForbidden = PENIS_STATE_FORBIDDEN_PATTERNS.some(pattern => pattern.test(normalized));
  const matched = findPenisStateBase(normalized);
  return hasForbidden || matched ? normalizePenisState(normalized) : null;
}

export function normalizePenisState(value: unknown): string {
  if (typeof value !== 'string') {
    return PENIS_STATE_DEFAULT;
  }

  const normalized = normalizeInlineText(value);
  if (!normalized) {
    return PENIS_STATE_DEFAULT;
  }

  const matched = findPenisStateBase(normalized);
  const base = matched?.base ?? PENIS_STATE_DEFAULT;
  const descriptionSource = matched ? normalized.replace(matched.alias, ' ') : normalized;
  const description = stripForbiddenPenisTerms(descriptionSource);

  return description ? `${base}｜${description}` : base;
}

const ItemSchema = z.object({
  数量: z.coerce.number().int().nonnegative(),
  描述: z.string(),
  图标: z.string().default('chip'),
  品质: z.enum(['N', 'R', 'SR', 'SSR']).default('N'),
});

const RewardItemSchema = z.object({
  名称: z.string(),
  数量: z.coerce.number().int().positive(),
  描述: z.string(),
  图标: z.string().optional(),
  品质: z.enum(['N', 'R', 'SR', 'SSR']).optional(),
});

const ShopCategorySchema = z.enum(['日常', '修炼', '情趣']);

const ShopItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: ShopCategorySchema,
  price: z.coerce.number().int().positive(),
  rarity: z.enum(['N', 'R', 'SR', 'SSR']),
  icon: z.string().default('chip'),
  description: z.string(),
});

const ShopSlotStateSchema = ShopItemSchema.extend({
  slotId: z.string().optional(),
  status: z.enum(['available', 'sold_out']).default('available'),
  soldAt: z.string().optional(),
});

const RewardPoolCollectionSchema = z.object({
  日常: z.array(RewardItemSchema).default([]),
  修炼: z.array(RewardItemSchema).default([]),
  情趣: z.array(RewardItemSchema).default([]),
});

const SummarySettingsSchema = z.object({
  floorSummaryLength: z.coerce.number().int().min(20).max(300).default(75),
  floorSummarySendLimit: z.coerce.number().int().min(1).max(400).default(400),
  autoSummaryEnabled: z.boolean().default(true),
  summaryPrompt: z.string().default(''),
}).default({
  floorSummaryLength: 75,
  floorSummarySendLimit: 400,
  autoSummaryEnabled: true,
  summaryPrompt: '',
});

const PointAccountTypeSchema = z.enum(['系统', '学府']);

const QuestSchema = z.object({
  类型: z.string(),
  状态: z.string().optional(),
  描述: z.string(),
  地点: z.string(),
  积分奖励: z.coerce.number().optional(),
  积分奖励类型: PointAccountTypeSchema.optional(),
  完成时间: z.string().optional(),
  获得积分: z.coerce.number().optional(),
  获得积分类型: PointAccountTypeSchema.optional(),
  奖励池: ShopCategorySchema.optional(),
  奖励池抽取数: z.coerce.number().int().positive().optional(),
  物品奖励: z.array(RewardItemSchema).optional(),
  获得物品: z.array(RewardItemSchema).optional(),
});

const SocialCharacterSchema = z.object({
  好感度: z.coerce.number().default(0),
  关系: z.string().default('普通'),
  心情: z.string().default('未知'),
  当前位置: z.string().default('未知'),
  心里想法: z.string().default(''),
  身份: z.string().default('未知'),
  年龄: z.string().default('未知'),
  种族: z.string().default('未知'),
  性格: z.string().default('未知'),
  当前状态: z.string().transform(value => tryNormalizePenisStateText(value) ?? value).default('可互动'),
  外貌: z.string().default(''),
  衣着: z.string().default(''),
  备注: z.string().default(''),
});

const TargetSchema = z.object({
  好感度: z.coerce.number(),
  好感度等级: z.string(),
  兴奋值: z.coerce.number().transform(value => _.clamp(value, 0, 100)),
  阴茎状态: z.string().transform(normalizePenisState).default(PENIS_STATE_DEFAULT),
  心情: z.string(),
  当前位置: z.string(),
  心里想法: z.string(),
  基础信息: z.object({
    年龄: z.string(),
    身份: z.string(),
    种族: z.string(),
  }),
  职业信息: z.object({
    职业名称: z.string(),
    派系: z.string(),
    天赋: z.string(),
    境界: z.string(),
  }),
  衣物状态: z.object({
    衣服: z.string().default('未知'),
    裤子: z.string().default('未知'),
    内裤: z.string().default('未知'),
    鞋子: z.string().default('未知'),
    配饰1: z.string().default('无'),
  }).default({
    衣服: '未知',
    裤子: '未知',
    内裤: '未知',
    鞋子: '未知',
    配饰1: '无',
  }),
});

export const Schema = z.object({
  谢自国: z.object({
    国籍: z.string(),
    年龄: z.string(),
    身高: z.string(),
    身份: z.string(),
    种族: z.string(),
    金钱: z.coerce.number(),
    功勋: z.coerce.number().default(0),
    stats: z.object({
      力量: z.coerce.number().transform(value => _.clamp(value, 0, 100)),
      敏捷: z.coerce.number().transform(value => _.clamp(value, 0, 100)),
      智力: z.coerce.number().transform(value => _.clamp(value, 0, 100)),
      耐力: z.coerce.number().transform(value => _.clamp(value, 0, 100)),
    }),
    背包: z.record(z.string(), ItemSchema).transform(items => _.pickBy(items, item => item.数量 > 0)),
  }),
  零七系统: z.object({
    积分: z.coerce.number(),
    学府积分: z.coerce.number().default(0),
    日期: z.string(),
    时间: z.string(),
    当前地点: z.string(),
    当前天气: z.string(),
    温度: z.string(),
    签到: z.object({
      今日已签到: z.boolean(),
      连续天数: z.coerce.number().nonnegative(),
      历史记录: z.array(z.coerce.number().int().positive()),
      奖励记录: z.array(z.object({
        日期: z.string(),
        日序号: z.coerce.number().int().positive(),
        获得积分: z.coerce.number().int().nonnegative(),
        获得物品: z.array(RewardItemSchema),
        签到时间: z.string(),
      })).default([]),
    }),
    商店: z.object({
      当前商品: z.array(ShopSlotStateSchema),
      刷新价格: z.coerce.number().int().nonnegative(),
      刷新次数: z.coerce.number().int().nonnegative(),
      上次刷新时间: z.string(),
      已见商品: z.array(z.string()).default([]),
      已售商品: z.array(z.string()).default([]),
      补货轮次: z.coerce.number().int().nonnegative().default(0),
      分类补货轮次: z.object({
        日常: z.coerce.number().int().nonnegative().default(0),
        修炼: z.coerce.number().int().nonnegative().default(0),
        情趣: z.coerce.number().int().nonnegative().default(0),
      }).default({ 日常: 0, 修炼: 0, 情趣: 0 }),
    }),
    商品池: z.object({
      商店主池: z.array(ShopItemSchema),
      奖励池: RewardPoolCollectionSchema,
    }),
    summarySettings: SummarySettingsSchema,
    任务列表: z.record(z.string(), QuestSchema),
    已完成任务列表: z.record(z.string(), QuestSchema),
  }),
  周围人物: z.record(z.string(), SocialCharacterSchema).default({}),
  历史人物: z.record(z.string(), SocialCharacterSchema).default({}),
  攻略目标: z.record(z.string(), TargetSchema),
});

export type GameState = z.output<typeof Schema>;
export type RewardItem = z.output<typeof RewardItemSchema>;
export type ShopCategory = z.output<typeof ShopCategorySchema>;
export type ShopItem = z.output<typeof ShopItemSchema>;
export type ShopSlotState = z.output<typeof ShopSlotStateSchema>;
export type ShopItemState = ShopSlotState;
export type RewardPoolCollection = z.output<typeof RewardPoolCollectionSchema>;
export type SummarySettings = z.output<typeof SummarySettingsSchema>;
export type QuestState = z.output<typeof QuestSchema>;
export type SocialCharacterState = z.output<typeof SocialCharacterSchema>;
export type TargetState = z.output<typeof TargetSchema>;
