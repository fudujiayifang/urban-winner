import { DEFAULT_SHOP_MASTER_POOL } from '../defaults';
import { parseGameTimeParts } from './game-date';
import { parseLooseJsonObject } from './response-parser';
import type {
  GameState,
  PhoneOrder,
  PhonePrivateAgreementEntry,
  PhonePrivateChatMemory,
  PhonePrivateMemoryEntry,
  PhoneThread,
  RewardItem,
  ShopItem,
} from '../schema';

export type PhoneAppKey = 'contacts' | 'forum' | 'delivery' | 'tieba' | 'taobao' | 'orders';
export type PhoneOrderApp = 'delivery' | 'taobao';

export interface PhoneCatalogItem {
  id: string;
  app: PhoneOrderApp;
  title: string;
  description: string;
  price: number;
  icon: string;
  rarity: RewardItem['品质'];
  pickupLocation: string;
  rewardItem: RewardItem;
}

export type PhoneAction =
  | { kind: 'contact-message'; target: string; text: string }
  | { kind: 'contact-read'; target: string }
  | { kind: 'feed-post'; app: 'forum' | 'tieba'; title: string; body: string }
  | { kind: 'order-create'; app: PhoneOrderApp; itemId: string }
  | { kind: 'order-pickup'; orderId: string };

export interface PrivatePhoneChatRequest {
  target: string;
  text: string;
  displayText: string;
}

export interface PhoneActionResult {
  success: boolean;
  displayText?: string;
  narrativeInput?: string;
  privateChatRequest?: PrivatePhoneChatRequest;
  applyBeforePrompt?: () => void;
  applyAfterResponse?: (maintext: string) => void;
  reason?: string;
}

const MAX_THREAD_MESSAGES = 20;
const MAX_ORDERS = 30;
const MAX_FEED_POSTS = 30;
const PRIVATE_CHAT_ALLOWED_TARGET_FIELDS = ['好感度', '心情', '心里想法'] as const;
const DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET = {
  summaryChars: 160,
  unresolvedTopicsMax: 4,
  agreementsMax: 4,
  keyMemoriesMax: 6,
  listItemChars: 24,
  recentMessagesCount: 6,
} as const;

interface PrivateChatPolicy {
  target: string;
  injectMemoryToMainPrompt: boolean;
  allowStatePatchToTarget: boolean;
  allowedTargetPatchFields: readonly (typeof PRIVATE_CHAT_ALLOWED_TARGET_FIELDS)[number][];
  memoryBudget: typeof DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET;
}

const DELIVERY_CATALOG: PhoneCatalogItem[] = [
  {
    id: 'delivery-night-shift-set',
    app: 'delivery',
    title: '夜班职业者套餐',
    description: '高热量便当、盐汽水和一小包醒神糖，适合折腾了一下午的新生。',
    price: 42,
    icon: '🍱',
    rarity: 'N',
    pickupLocation: '当前地点附近的配送点',
    rewardItem: { 名称: '夜班职业者套餐', 数量: 1, 描述: '外卖送来的高热量套餐，能让人暂时从疲惫里缓过来。', 图标: 'gift', 品质: 'N' },
  },
  {
    id: 'delivery-campus-tea',
    app: 'delivery',
    title: '低温药剂奶茶',
    description: '学府奶茶店联名款，标签上写着“无明显副作用”。',
    price: 26,
    icon: '🧋',
    rarity: 'R',
    pickupLocation: 'G栋门口',
    rewardItem: { 名称: '低温药剂奶茶', 数量: 1, 描述: '带着淡蓝色冷雾的奶茶，甜味下面有轻微药剂感。', 图标: 'potion', 品质: 'R' },
  },
  {
    id: 'delivery-dorm-snack',
    app: 'delivery',
    title: 'G栋宵夜拼盘',
    description: '适合多人分食的炸物和烤串，备注里可以写“不要让零七看见”。',
    price: 88,
    icon: '🍢',
    rarity: 'R',
    pickupLocation: 'G栋一层门禁外',
    rewardItem: { 名称: 'G栋宵夜拼盘', 数量: 1, 描述: '分量很足的宵夜拼盘，香味明显到很难偷偷带回房间。', 图标: 'gift', 品质: 'R' },
  },
];

function getCurrentTimestamp(state: GameState): string {
  return `${state.零七系统.日期} ${state.零七系统.时间}`;
}

function resolvePrivateChatPolicy(state: GameState, target: string): PrivateChatPolicy | null {
  const normalizedTarget = normalizeText(target);
  if (!normalizedTarget) {
    return null;
  }

  return {
    target: normalizedTarget,
    injectMemoryToMainPrompt: true,
    allowStatePatchToTarget: Boolean(state.攻略目标[normalizedTarget]),
    allowedTargetPatchFields: PRIVATE_CHAT_ALLOWED_TARGET_FIELDS,
    memoryBudget: DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET,
  };
}

function createPhoneId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function createEmptyPrivateChatMemory(): PhonePrivateChatMemory {
  return {
    summary: '',
    lastPrivateChatAt: '',
    unresolvedTopics: [],
    agreements: [],
    keyMemories: [],
  };
}

function clampTextByChars(value: string, limit: number): string {
  return normalizeText(value).slice(0, limit);
}

function normalizeMemoryEntry(value: unknown, fallbackRecordedAt = ''): PhonePrivateMemoryEntry | null {
  if (typeof value === 'string') {
    const content = clampTextByChars(value, DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET.listItemChars);
    return content ? { content, recordedAt: fallbackRecordedAt } : null;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const entry = value as Partial<PhonePrivateMemoryEntry>;
  const content = clampTextByChars(String(entry.content ?? ''), DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET.listItemChars);
  if (!content) {
    return null;
  }

  return {
    content,
    recordedAt: clampTextByChars(String(entry.recordedAt ?? fallbackRecordedAt), 32),
  };
}

function clampMemoryEntries(
  values: unknown[],
  limit: number,
  itemChars: number,
  fallbackRecordedAt = '',
): PhonePrivateMemoryEntry[] {
  return values
    .map(value => {
      const entry = normalizeMemoryEntry(value, fallbackRecordedAt);
      if (!entry) {
        return null;
      }

      return {
        content: clampTextByChars(entry.content, itemChars),
        recordedAt: clampTextByChars(entry.recordedAt || fallbackRecordedAt, 32),
      } satisfies PhonePrivateMemoryEntry;
    })
    .filter((entry): entry is PhonePrivateMemoryEntry => Boolean(entry?.content))
    .slice(0, limit);
}

function normalizeAgreementEntry(value: unknown, fallbackRecordedAt = ''): PhonePrivateAgreementEntry | null {
  if (typeof value === 'string') {
    const content = clampTextByChars(value, DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET.listItemChars);
    return content ? { content, recordedAt: fallbackRecordedAt, status: 'pending' } : null;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const entry = value as Partial<PhonePrivateAgreementEntry>;
  const content = clampTextByChars(String(entry.content ?? ''), DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET.listItemChars);
  if (!content) {
    return null;
  }

  const status = entry.status === 'completed' || entry.status === 'failed' ? entry.status : 'pending';
  return {
    content,
    recordedAt: clampTextByChars(String(entry.recordedAt ?? fallbackRecordedAt), 32),
    status,
  };
}

function clampAgreementEntries(
  values: unknown[],
  limit: number,
  itemChars: number,
  fallbackRecordedAt = '',
): PhonePrivateAgreementEntry[] {
  return values
    .map(value => {
      const entry = normalizeAgreementEntry(value, fallbackRecordedAt);
      if (!entry) {
        return null;
      }

      return {
        content: clampTextByChars(entry.content, itemChars),
        recordedAt: clampTextByChars(entry.recordedAt || fallbackRecordedAt, 32),
        status: entry.status,
      } satisfies PhonePrivateAgreementEntry;
    })
    .filter((entry): entry is PhonePrivateAgreementEntry => Boolean(entry?.content))
    .slice(0, limit);
}

function compactPrivateChatMemory(
  memory: Partial<PhonePrivateChatMemory> | null | undefined,
  budget = DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET,
): PhonePrivateChatMemory {
  const fallbackRecordedAt = clampTextByChars(memory?.lastPrivateChatAt ?? '', 32);

  return {
    summary: clampTextByChars(memory?.summary ?? '', budget.summaryChars),
    lastPrivateChatAt: fallbackRecordedAt,
    unresolvedTopics: clampMemoryEntries(
      Array.isArray(memory?.unresolvedTopics) ? memory.unresolvedTopics : [],
      budget.unresolvedTopicsMax,
      budget.listItemChars,
      fallbackRecordedAt,
    ),
    agreements: clampAgreementEntries(
      Array.isArray(memory?.agreements) ? memory.agreements : [],
      budget.agreementsMax,
      budget.listItemChars,
      fallbackRecordedAt,
    ),
    keyMemories: clampMemoryEntries(
      Array.isArray(memory?.keyMemories) ? memory.keyMemories : [],
      budget.keyMemoriesMax,
      budget.listItemChars,
      fallbackRecordedAt,
    ),
  };
}

function normalizePrivateChatMemory(
  memory: Partial<PhonePrivateChatMemory> | null | undefined,
  budget = DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET,
): PhonePrivateChatMemory {
  return compactPrivateChatMemory(memory, budget);
}

function getPhoneThread(state: GameState, target: string, budget = DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET): PhoneThread {
  const current = state.零七系统.手机.通讯记录[target];
  if (current) {
    current.privateChatMemory = normalizePrivateChatMemory(current.privateChatMemory, budget);
    return current;
  }

  const nextThread: PhoneThread = {
    unread: 0,
    messages: [],
    privateChatMemory: createEmptyPrivateChatMemory(),
  };
  state.零七系统.手机.通讯记录[target] = nextThread;
  return nextThread;
}

function pushThreadMessage(thread: PhoneThread, message: {
  id: string;
  direction: 'out' | 'in' | 'system';
  app?: 'contacts';
  text: string;
  at: string;
}): void {
  thread.messages.push({
    id: message.id,
    direction: message.direction,
    app: message.app ?? 'contacts',
    text: message.text,
    at: message.at,
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanupPhoneReply(value: string | undefined): string | null {
  const cleaned = normalizeText(value ?? '')
    .replace(/^[“”‘’"'「」『』：:，,。\s]+/, '')
    .replace(/[“”‘’"'「」『』\s]+$/, '')
    .trim();

  return cleaned ? cleaned.slice(0, 120) : null;
}

function extractPhoneReply(maintext: string, target: string): string | null {
  const normalized = normalizeText(maintext);
  if (!normalized) {
    return null;
  }

  const safeTarget = escapeRegex(target);
  const quotedReply = '([^”"’\'」』。！？；;]{1,120})';
  const freeformReply = '([^”"’\'」』]{1,120})';
  const replyPatterns = [
    new RegExp(`【(?:手机回复|通讯回复|短信回复)(?:[｜|\\s]*${safeTarget})?】\\s*[“"‘'「『]?${quotedReply}[”"’'」』]?`),
    new RegExp(`【${safeTarget}(?:的)?(?:回复|回信|消息|短信)】\\s*[“"‘'「『]?${quotedReply}[”"’'」』]?`),
    new RegExp(`${safeTarget}[^。！？；;]{0,36}(?:回复|回信|消息|短信)[^：:]{0,24}[：:]\\s*[“"‘'「『]?${quotedReply}[”"’'」』]?`),
    new RegExp(`${safeTarget}[^“"‘'「『。！？；;]{0,36}[“"‘'「『]${freeformReply}[”"’'」』]`),
    new RegExp(`${safeTarget}\\s*[：:]\\s*[“"‘'「『]?${quotedReply}[”"’'」』]?`),
    /(?:回复|回信|消息|短信)[^：:]{0,16}[：:]\s*[“"‘'「『]?([^”"’'」』。！？；;]{1,80})[”"’'」』]?/,
  ];

  for (const pattern of replyPatterns) {
    const reply = cleanupPhoneReply(normalized.match(pattern)?.[1]);
    if (reply) {
      return reply;
    }
  }

  return null;
}

export function syncMarkedPhoneRepliesFromNarrative(state: GameState, maintext: string): boolean {
  const normalized = normalizeText(maintext);
  if (!normalized) {
    return false;
  }

  let changed = false;
  const markerPattern = /【(?:手机回复|通讯回复|短信回复)[｜|\s]*([^】｜|\s]{1,24})】\s*[“"‘'「『]?([^”"’'」』。！？；;]{1,120})[”"’'」』]?/g;
  for (const match of normalized.matchAll(markerPattern)) {
    const target = cleanupPhoneReply(match[1]);
    const reply = cleanupPhoneReply(match[2]);
    if (!target || !reply) {
      continue;
    }

    const beforeCount = state.零七系统.手机.通讯记录[target]?.messages.length ?? 0;
    appendIncomingMessage(state, target, reply);
    const afterCount = state.零七系统.手机.通讯记录[target]?.messages.length ?? 0;
    changed ||= afterCount > beforeCount;
  }

  if (changed) {
    trimPhoneState(state);
  }
  return changed;
}

function appendIncomingMessage(state: GameState, target: string, text: string): void {
  const thread = getPhoneThread(state, target);
  const alreadyExists = thread.messages.some(message => message.direction === 'in' && message.text === text);
  if (alreadyExists) {
    return;
  }

  pushThreadMessage(thread, {
    id: createPhoneId('reply'),
    direction: 'in',
    app: 'contacts',
    text,
    at: getCurrentTimestamp(state),
  });
  thread.unread += 1;
  state.零七系统.手机.通讯记录[target] = thread;
}

function trimPhoneState(state: GameState): void {
  const phone = state.零七系统.手机;

  for (const thread of Object.values(phone.通讯记录)) {
    if (thread.messages.length > MAX_THREAD_MESSAGES) {
      thread.messages = thread.messages.slice(-MAX_THREAD_MESSAGES);
    }
  }

  const orders = Object.entries(phone.订单)
    .sort((left, right) => left[1].updatedAt.localeCompare(right[1].updatedAt));
  for (const [orderId] of orders.slice(0, Math.max(0, orders.length - MAX_ORDERS))) {
    delete phone.订单[orderId];
  }

  if (phone.动态记录.length > MAX_FEED_POSTS) {
    phone.动态记录 = phone.动态记录.slice(-MAX_FEED_POSTS);
  }
}

function toTaobaoCatalogItem(item: ShopItem, index: number): PhoneCatalogItem {
  return {
    id: `taobao-${item.id}`,
    app: 'taobao',
    title: item.name,
    description: item.description,
    price: Math.max(1, item.price * 10),
    icon: item.icon,
    rarity: item.rarity,
    pickupLocation: index % 2 === 0 ? '学府快递柜' : 'G栋前台代收点',
    rewardItem: {
      名称: item.name,
      数量: 1,
      描述: item.description,
      图标: item.icon,
      品质: item.rarity,
    },
  };
}

export function getPhoneCatalog(app?: PhoneOrderApp): PhoneCatalogItem[] {
  const taobaoItems = DEFAULT_SHOP_MASTER_POOL.slice(0, 12).map(toTaobaoCatalogItem);
  const items = [...DELIVERY_CATALOG, ...taobaoItems];
  return app ? items.filter(item => item.app === app) : items;
}

export function getOrderStatusLabel(status: PhoneOrder['status']): string {
  const labels: Record<PhoneOrder['status'], string> = {
    ordered: '已下单',
    shipping: '配送中',
    ready: '待领取',
    picked_up: '已签收',
    cancelled: '已取消',
    abnormal: '异常',
  };
  return labels[status];
}

function findCatalogItem(action: Extract<PhoneAction, { kind: 'order-create' }>): PhoneCatalogItem | null {
  return getPhoneCatalog(action.app).find(item => item.id === action.itemId) ?? null;
}

export function isPrivatePhoneChatTarget(state: GameState, target: string): boolean {
  return resolvePrivateChatPolicy(state, target) != null;
}

export function appendOutgoingPhoneMessage(state: GameState, target: string, text: string, sentAt = getCurrentTimestamp(state)): PhoneThread {
  const normalizedTarget = normalizeText(target);
  const normalizedText = normalizeText(text);
  const thread = getPhoneThread(state, normalizedTarget);
  pushThreadMessage(thread, {
    id: createPhoneId('msg'),
    direction: 'out',
    app: 'contacts',
    text: normalizedText,
    at: sentAt,
  });
  trimPhoneState(state);
  return thread;
}

function summarizeRecentPrivateMessages(thread: PhoneThread, target: string, count = DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET.recentMessagesCount): string {
  return thread.messages
    .slice(-count)
    .map(message => `${message.direction === 'out' ? '谢自国' : target}：${normalizeText(message.text)}`)
    .join('\n');
}

function buildPrivateChatSystemPrompt(target: string, policy: PrivateChatPolicy): string {
  const statePatchRule = policy.allowStatePatchToTarget
    ? `7. statePatch 只允许更新 攻略目标.${target}，且字段仅限 ${policy.allowedTargetPatchFields.join('、')}。`
    : '7. 因为该联系人当前不是攻略目标，statePatch 必须返回空对象。';

  return [
    `你负责生成“${target}”的手机私聊回复，不生成正文叙事。`,
    `目标联系人固定为：${target}。`,
    '手机私聊必须满足：',
    '1. 输出只服务于手机聊天线程，不能写正文场景描写。',
    '2. 手机私聊不代表联系人出现在当前场景，不能把对方加入周围人物。',
    '3. 可以根据聊天推进对玩家的态度、心情、未解决话题与约定。',
    '4. summary 必须是当前这位联系人的完整压缩摘要，不是本轮增量备注。',
    '5. unresolvedTopics / agreements / keyMemories 都应返回压缩后的当前列表；已解决、已失效、重复信息不要保留。',
    '6. 回复要像即时通讯消息，简洁自然，不要写成小说段落。',
    statePatchRule,
    '请严格输出 JSON，不要额外解释。结构：',
    '{',
    `  "reply": "${target}发来的手机消息",`,
    '  "summary": "当前完整压缩摘要",',
    '  "unresolvedTopics": [{ "content": "当前仍未解决的话题", "recordedAt": "当前游戏内时间" }],',
    '  "agreements": [{ "content": "当前仍有效的约定", "recordedAt": "当前游戏内时间", "status": "pending" }],',
    '  "keyMemories": [{ "content": "后续正文应记住的长期信息", "recordedAt": "当前游戏内时间" }],',
    policy.allowStatePatchToTarget
      ? `  "statePatch": { "攻略目标": { "${target}": { "${policy.allowedTargetPatchFields[0]}": "可选" } } },`
      : '  "statePatch": {},',
    '  "minutesAdvance": 0',
    '}',
    'minutesAdvance 为建议推进分钟数，可为 0。',
  ].join('\n');
}

function buildPrivateChatJsonSchema(policy: PrivateChatPolicy) {
  return {
    name: 'private_phone_chat_reply',
    description: `${policy.target}手机私聊回复与记忆更新`,
    value: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reply: { type: 'string' },
        summary: { type: 'string' },
        unresolvedTopics: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              content: { type: 'string' },
              recordedAt: { type: 'string' },
            },
            required: ['content', 'recordedAt'],
          },
        },
        agreements: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              content: { type: 'string' },
              recordedAt: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'completed', 'failed'] },
            },
            required: ['content', 'recordedAt', 'status'],
          },
        },
        keyMemories: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              content: { type: 'string' },
              recordedAt: { type: 'string' },
            },
            required: ['content', 'recordedAt'],
          },
        },
        statePatch: { type: 'object', additionalProperties: true },
        minutesAdvance: { type: 'number' },
      },
      required: ['reply', 'summary', 'unresolvedTopics', 'agreements', 'keyMemories', 'statePatch', 'minutesAdvance'],
    },
  } as const;
}

interface PrivateChatModelResult {
  reply: string;
  summary: string;
  unresolvedTopics: PhonePrivateMemoryEntry[];
  agreements: PhonePrivateAgreementEntry[];
  keyMemories: PhonePrivateMemoryEntry[];
  statePatch: unknown;
  minutesAdvance: number;
}

function parsePrivateChatResult(
  rawText: string,
  budget = DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET,
): PrivateChatModelResult {
  const parsed = parseLooseJsonObject(rawText) as Partial<PrivateChatModelResult>;
  const fallbackRecordedAt = '';

  return {
    reply: normalizeText(parsed.reply ?? ''),
    summary: clampTextByChars(parsed.summary ?? '', budget.summaryChars),
    unresolvedTopics: clampMemoryEntries(
      Array.isArray(parsed.unresolvedTopics) ? parsed.unresolvedTopics : [],
      budget.unresolvedTopicsMax,
      budget.listItemChars,
      fallbackRecordedAt,
    ),
    agreements: clampAgreementEntries(
      Array.isArray(parsed.agreements) ? parsed.agreements : [],
      budget.agreementsMax,
      budget.listItemChars,
      fallbackRecordedAt,
    ),
    keyMemories: clampMemoryEntries(
      Array.isArray(parsed.keyMemories) ? parsed.keyMemories : [],
      budget.keyMemoriesMax,
      budget.listItemChars,
      fallbackRecordedAt,
    ),
    statePatch: parsed.statePatch && typeof parsed.statePatch === 'object' ? parsed.statePatch : {},
    minutesAdvance: Number.isFinite(Number(parsed.minutesAdvance)) ? Math.max(0, Math.trunc(Number(parsed.minutesAdvance))) : 0,
  };
}

function buildPrivateReplyFallback(inputText: string, memory: PhonePrivateChatMemory, state: GameState): string {
  const text = normalizeText(inputText);
  const currentHour = parseGameTimeParts(state.零七系统.时间).hour;
  if (/(晚点|回头|之后|等会|稍后|忙|上课|训练|值班|开会)/.test(text)) {
    return '我先记下了，忙完再回你。';
  }
  if (currentHour >= 23 || currentHour < 7) {
    return '我看到了，先别急，晚些再细说。';
  }
  if (memory.agreements.length || memory.unresolvedTopics.length) {
    return '我记着，之后按这个继续。';
  }
  return '我看到了，先记着。';
}

function sanitizePrivateChatStatePatch(rawPatch: unknown, policy: PrivateChatPolicy): Record<string, unknown> {
  if (!policy.allowStatePatchToTarget) {
    return {};
  }

  if (!rawPatch || typeof rawPatch !== 'object' || Array.isArray(rawPatch)) {
    return {};
  }

  const patch = rawPatch as Record<string, unknown>;
  const targetPatch = patch.攻略目标;
  if (!targetPatch || typeof targetPatch !== 'object' || Array.isArray(targetPatch)) {
    return {};
  }

  const currentTargetPatch = (targetPatch as Record<string, unknown>)[policy.target];
  if (!currentTargetPatch || typeof currentTargetPatch !== 'object' || Array.isArray(currentTargetPatch)) {
    return {};
  }

  const allowedFields = new Set(policy.allowedTargetPatchFields);
  const sanitizedTargetPatch = Object.fromEntries(
    Object.entries(currentTargetPatch as Record<string, unknown>).filter(([key, value]) => value !== undefined && allowedFields.has(key as never)),
  );
  if (!Object.keys(sanitizedTargetPatch).length) {
    return {};
  }

  return {
    攻略目标: {
      [policy.target]: sanitizedTargetPatch,
    },
  };
}

const PRIVATE_CHAT_MINUTE_BUCKETS = [0, 1, 5, 10] as const;

function snapPrivateChatMinutes(minutes: number): number {
  return PRIVATE_CHAT_MINUTE_BUCKETS.reduce((closest, candidate) => {
    return Math.abs(candidate - minutes) < Math.abs(closest - minutes) ? candidate : closest;
  }, PRIVATE_CHAT_MINUTE_BUCKETS[0]);
}

function resolvePrivateChatMinutesAdvance(options: {
  suggestedMinutes: number;
  playerText: string;
  reply: string;
  memoryChanged: boolean;
  state: GameState;
}): number {
  const combinedText = normalizeText(`${options.playerText} ${options.reply}`);
  const suggested = snapPrivateChatMinutes(Math.max(0, Math.trunc(options.suggestedMinutes || 0)));

  if (/(明天|改天|下次|之后见|见面聊|忙完再说)/.test(combinedText)) {
    return Math.max(10, suggested);
  }

  if (/(晚点|回头|之后|等会|稍后|过会|忙完)/.test(combinedText)) {
    return Math.max(5, suggested);
  }

  return suggested > 0 ? Math.min(suggested, 1) : 1;
}

function hasPrivateMemoryChanges(parsed: PrivateChatModelResult): boolean {
  return Boolean(
    parsed.summary
    || parsed.unresolvedTopics.length
    || parsed.agreements.length
    || parsed.keyMemories.length
  );
}

function stampMemoryEntries(entries: PhonePrivateMemoryEntry[], recordedAt: string): PhonePrivateMemoryEntry[] {
  return entries.map(entry => ({
    content: entry.content,
    recordedAt: entry.recordedAt || recordedAt,
  }));
}

function stampAgreementEntries(entries: PhonePrivateAgreementEntry[], recordedAt: string): PhonePrivateAgreementEntry[] {
  return entries.map(entry => ({
    content: entry.content,
    recordedAt: entry.recordedAt || recordedAt,
    status: entry.status || 'pending',
  }));
}

function mergePrivateChatMemory(
  base: PhonePrivateChatMemory,
  parsed: PrivateChatModelResult,
  lastPrivateChatAt: string,
  budget = DEFAULT_PRIVATE_CHAT_MEMORY_BUDGET,
): PhonePrivateChatMemory {
  const currentMemory = normalizePrivateChatMemory(base, budget);
  const nextMemory = {
    summary: parsed.summary || currentMemory.summary,
    lastPrivateChatAt,
    unresolvedTopics: parsed.unresolvedTopics.length ? stampMemoryEntries(parsed.unresolvedTopics, lastPrivateChatAt) : currentMemory.unresolvedTopics,
    agreements: parsed.agreements.length ? stampAgreementEntries(parsed.agreements, lastPrivateChatAt) : currentMemory.agreements,
    keyMemories: parsed.keyMemories.length ? stampMemoryEntries(parsed.keyMemories, lastPrivateChatAt) : currentMemory.keyMemories,
  } satisfies PhonePrivateChatMemory;
  return compactPrivateChatMemory(nextMemory, budget);
}

function buildPrivateChatUserInput(state: GameState, target: string, text: string, policy: PrivateChatPolicy): string {
  const thread = getPhoneThread(state, target, policy.memoryBudget);
  const targetState = state.攻略目标[target];
  const memory = compactPrivateChatMemory(thread.privateChatMemory, policy.memoryBudget);
  const payload = {
    当前时间: getCurrentTimestamp(state),
    当前地点: state.零七系统.当前地点,
    玩家消息: text,
    联系人: target,
    联系人当前状态: targetState
      ? {
          好感度: targetState.好感度,
          好感度等级: targetState.好感度等级,
          心情: targetState.心情,
          当前位置: targetState.当前位置,
          心里想法: targetState.心里想法,
        }
      : null,
    既有私聊记忆: memory,
    最近聊天记录: summarizeRecentPrivateMessages(thread, target, policy.memoryBudget.recentMessagesCount),
    规则提醒: [
      '这是手机私聊，不是现场见面。',
      '不要让联系人自动进入周围人物。',
      '回复应短消息化，适合手机气泡展示。',
      '记忆字段要返回当前压缩快照，而不是不断累加旧内容。',
    ],
  };

  return JSON.stringify(payload, null, 2);
}

export async function runPrivatePhoneChat(action: Extract<PhoneAction, { kind: 'contact-message' }>, state: GameState, helpers: {
  save: () => void;
  mergeVars: (vars: unknown) => GameState;
  advanceClock: (minutes: number) => GameState;
  generate?: (request: {
    userInput: string;
    systemPrompt: string;
    recentHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) => Promise<{ rawText: string }>;
  generateRaw?: (request: {
    systemPrompt: string;
    userInput: string;
    jsonSchema?: {
      name: string;
      description?: string;
      value: Record<string, unknown>;
    };
  }) => Promise<{ rawText: string }>;
}): Promise<PhoneActionResult> {
  const target = normalizeText(action.target);
  const text = normalizeText(action.text);
  if (!target || !text) {
    return { success: false, reason: '请选择联系人并输入消息。' };
  }

  const policy = resolvePrivateChatPolicy(state, target);
  if (!policy) {
    return { success: false, reason: '当前联系人未接入私聊链路。' };
  }

  if (!helpers.generateRaw && !helpers.generate) {
    return { success: false, reason: '当前运行环境不支持私聊专用生成。' };
  }

  const sentAt = getCurrentTimestamp(state);
  const displayText = `用手机给${target}发消息：“${text}”`;
  const thread = appendOutgoingPhoneMessage(state, target, text, sentAt);
  thread.privateChatMemory = normalizePrivateChatMemory(thread.privateChatMemory, policy.memoryBudget);
  thread.privateChatMemory.lastPrivateChatAt = sentAt;
  helpers.save();

  let rawText = '';
  if (helpers.generateRaw) {
    const response = await helpers.generateRaw({
      systemPrompt: buildPrivateChatSystemPrompt(target, policy),
      userInput: buildPrivateChatUserInput(state, target, text, policy),
      jsonSchema: buildPrivateChatJsonSchema(policy),
    });
    rawText = response.rawText;
  } else if (helpers.generate) {
    const response = await helpers.generate({
      userInput: buildPrivateChatUserInput(state, target, text, policy),
      systemPrompt: buildPrivateChatSystemPrompt(target, policy),
      recentHistory: [],
    });
    rawText = response.rawText;
  } else {
    return { success: false, reason: '当前运行环境不支持私聊专用生成。' };
  }

  let parsedResult: PrivateChatModelResult;
  try {
    parsedResult = parsePrivateChatResult(rawText, policy.memoryBudget);
  } catch (error) {
    console.warn('private phone chat parse failed:', error);
    parsedResult = {
      reply: '',
      summary: '',
      unresolvedTopics: [],
      agreements: [],
      keyMemories: [],
      statePatch: {},
      minutesAdvance: 0,
    };
  }

  const parsed = parsedResult;
  const safeReply = parsed.reply || buildPrivateReplyFallback(text, thread.privateChatMemory, state);
  const sanitizedStatePatch = sanitizePrivateChatStatePatch(parsed.statePatch, policy);

  let nextState = state;
  if (Object.keys(sanitizedStatePatch).length > 0) {
    try {
      nextState = helpers.mergeVars(sanitizedStatePatch);
    } catch (error) {
      console.warn('private phone chat state patch skipped:', error);
      nextState = state;
    }
  }

  const nextThread = getPhoneThread(nextState, target, policy.memoryBudget);
  appendIncomingMessage(nextState, target, safeReply);
  nextThread.privateChatMemory = mergePrivateChatMemory(
    nextThread.privateChatMemory,
    parsed,
    getCurrentTimestamp(nextState),
    policy.memoryBudget,
  );
  trimPhoneState(nextState);
  helpers.save();

  const minutesAdvance = resolvePrivateChatMinutesAdvance({
    suggestedMinutes: parsed.minutesAdvance,
    playerText: text,
    reply: safeReply,
    memoryChanged: hasPrivateMemoryChanges(parsed),
    state: nextState,
  });
  if (minutesAdvance > 0) {
    helpers.advanceClock(minutesAdvance);
  }

  return {
    success: true,
    displayText,
  };
}

export function preparePhoneAction(action: PhoneAction, state: GameState, helpers: {
  getState: () => GameState;
  save: () => void;
  addInventoryItem: (name: string, item: { 描述: string; 图标?: string; 品质?: RewardItem['品质'] }, amount?: number) => void;
}): PhoneActionResult {
  if (action.kind === 'contact-read') {
    const target = normalizeText(action.target);
    const thread = target ? state.零七系统.手机.通讯记录[target] : null;
    if (!thread || thread.unread <= 0) {
      return { success: true };
    }

    thread.unread = 0;
    state.零七系统.手机.通讯记录[target] = thread;
    helpers.save();
    return { success: true };
  }

  if (action.kind === 'contact-message') {
    const target = normalizeText(action.target);
    const text = normalizeText(action.text);
    if (!target || !text) {
      return { success: false, reason: '请选择联系人并输入消息。' };
    }

    if (isPrivatePhoneChatTarget(state, target)) {
      return {
        success: true,
        displayText: `用手机给${target}发消息：“${text}”`,
        privateChatRequest: {
          target,
          text,
          displayText: `用手机给${target}发消息：“${text}”`,
        },
      };
    }

    const sentAt = getCurrentTimestamp(state);
    const displayText = `用手机给${target}发消息：“${text}”`;
    const narrativeInput = `【手机操作｜联系人】谢自国通过个人终端给${target}发送消息：“${text}”。这条通讯已经写入零七系统.手机.通讯记录。请根据${target}当前关系、位置、心情和剧情状态自然回应；通讯联系不代表${target}在当前场景中在场，除非正文明确安排其到场。如果${target}通过手机回复，请在正文中用“【手机回复｜${target}】回复内容”写出手机收到的原文，并在 <vars> 中同步更新 零七系统.手机.通讯记录.${target} 的 messages 和 unread。`;

    return {
      success: true,
      displayText,
      narrativeInput,
      applyBeforePrompt: () => {
        const thread = getPhoneThread(state, target);
        pushThreadMessage(thread, {
          id: createPhoneId('msg'),
          direction: 'out',
          app: 'contacts',
          text,
          at: sentAt,
        });
        state.零七系统.手机.通讯记录[target] = thread;
        trimPhoneState(state);
        helpers.save();
      },
      applyAfterResponse: maintext => {
        const reply = extractPhoneReply(maintext, target);
        if (!reply) {
          return;
        }

        const currentState = helpers.getState();
        appendIncomingMessage(currentState, target, reply);
        trimPhoneState(currentState);
        helpers.save();
      },
    };
  }

  if (action.kind === 'feed-post') {
    const title = normalizeText(action.title);
    const body = normalizeText(action.body);
    if (!title || !body) {
      return { success: false, reason: '请输入标题和内容。' };
    }

    const postedAt = getCurrentTimestamp(state);
    const appLabel = action.app === 'forum' ? '论坛' : '贴吧';
    const displayText = `在${appLabel}发帖：“${title}”`;
    const narrativeInput = `【手机操作｜${appLabel}】谢自国在${appLabel}发布帖子《${title}》：${body}。这条动态已经写入零七系统.手机.动态记录。请判断这条发帖是否引来回复、线索、任务或人物反应；如果有手机动态变化，请在 <vars> 中同步更新 零七系统.手机.动态记录。`;

    return {
      success: true,
      displayText,
      narrativeInput,
      applyBeforePrompt: () => {
        state.零七系统.手机.动态记录.push({
          id: createPhoneId(action.app),
          app: action.app,
          author: '谢自国',
          title,
          body,
          at: postedAt,
        });
        trimPhoneState(state);
        helpers.save();
      },
    };
  }

  if (action.kind === 'order-create') {
    const item = findCatalogItem(action);
    if (!item) {
      return { success: false, reason: '商品不存在或已下架。' };
    }

    if (state.谢自国.金钱 < item.price) {
      return { success: false, reason: `金钱不足，购买 ${item.title} 需要 ${item.price}。` };
    }

    const now = getCurrentTimestamp(state);
    const orderId = createPhoneId(action.app);
    const appLabel = action.app === 'delivery' ? '外卖' : '淘宝';
    const status: PhoneOrder['status'] = action.app === 'delivery' ? 'shipping' : 'ordered';
    const displayText = `用手机在${appLabel}下单：${item.title}`;
    const narrativeInput = `【手机操作｜${appLabel}】谢自国用个人终端下单“${item.title}”，支付 ${item.price} 金钱，订单号 ${orderId}，当前状态为“${getOrderStatusLabel(status)}”，预计取件/收货地点：${item.pickupLocation}。订单已经写入 零七系统.手机.订单，且金钱已扣除。请把这次下单视为会影响正文的真实世界事件；物理商品不要立刻写入背包，只有取件、签收或实际获得时才加入 谢自国.背包。若配送、异常、被人发现或送达状态变化，请在 <vars> 中同步更新订单。`;

    return {
      success: true,
      displayText,
      narrativeInput,
      applyBeforePrompt: () => {
        state.谢自国.金钱 -= item.price;
        state.零七系统.手机.订单[orderId] = {
          id: orderId,
          app: action.app,
          title: item.title,
          description: item.description,
          price: item.price,
          status,
          pickupLocation: item.pickupLocation,
          orderedAt: now,
          updatedAt: now,
          rewardItem: { ...item.rewardItem },
        };
        trimPhoneState(state);
        helpers.save();
      },
    };
  }

  const order = state.零七系统.手机.订单[action.orderId];
  if (!order) {
    return { success: false, reason: '订单不存在。' };
  }

  if (order.status === 'picked_up') {
    return { success: false, reason: '这个订单已经签收过了。' };
  }

  if (order.status === 'cancelled') {
    return { success: false, reason: '这个订单已经取消。' };
  }

  if (!order.rewardItem) {
    return { success: false, reason: '这个订单没有可领取物品。' };
  }

  const now = getCurrentTimestamp(state);
  const appLabel = order.app === 'delivery' ? '外卖' : '淘宝';
  const displayText = `领取${appLabel}订单：${order.title}`;
  const narrativeInput = `【手机操作｜订单签收】谢自国准备领取/签收${appLabel}订单“${order.title}”，订单号 ${order.id}，取件/收货地点：${order.pickupLocation}。系统已将该订单标记为已签收，并把“${order.rewardItem.名称}”加入背包。请在正文中描写领取过程及可能的异常、线索或人物反应；如果领取导致任务、关系、地点、时间或手机订单状态变化，请在 <vars> 中同步更新。`;

  return {
    success: true,
    displayText,
    narrativeInput,
    applyBeforePrompt: () => {
      order.status = 'picked_up';
      order.updatedAt = now;
      helpers.addInventoryItem(
        order.rewardItem!.名称,
        {
          描述: order.rewardItem!.描述,
          图标: order.rewardItem!.图标,
          品质: order.rewardItem!.品质,
        },
        order.rewardItem!.数量,
      );
      trimPhoneState(state);
      helpers.save();
    },
  };
}
