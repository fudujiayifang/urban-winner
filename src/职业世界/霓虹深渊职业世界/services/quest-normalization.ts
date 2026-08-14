const QUEST_FIELD_NAME_PATTERN = /^(?:任务(?:名称|名)?|名称|标题|类型|任务类型|描述|任务描述|目标|任务目标|内容|任务内容|地点|任务地点|位置|发生地点|奖励|物品奖励|固定奖励|奖励物品|奖励池|状态)$/;
const QUEST_TITLE_PREFIX_PATTERN = /^(?:正文触发的)?(?:新任务|获得任务|接取任务|接到任务|新增任务|解锁任务|任务发布|任务已发布|任务解锁|发布任务|派发任务|生成任务|检测到任务|扫描到任务|零七任务|任务)[：:：\s]+/;
const QUEST_WRAPPER_CHARS_PATTERN = /^[\s\-—–>「『“'‘《〈【[（(]+|[\s\-—–<」』”'’》〉】\]）).。！？!?，,、；;：:]+$/g;

export function normalizeQuestName(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  let text = raw
    .normalize('NFKC')
    .replace(/<\/?零七任务>/g, '')
    .replace(/<\/?quest>/gi, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  text = text.replace(QUEST_TITLE_PREFIX_PATTERN, '').trim();
  text = text.replace(QUEST_WRAPPER_CHARS_PATTERN, '').trim();
  text = text.replace(QUEST_WRAPPER_CHARS_PATTERN, '').trim();

  if (!text || text.length > 64 || QUEST_FIELD_NAME_PATTERN.test(text)) {
    return null;
  }

  if (/[<>]/.test(text) || /(?:^|[：:：])(?:类型|描述|地点|奖励|状态)(?:$|[：:：])/.test(text)) {
    return null;
  }

  return text;
}

export function getQuestCanonicalKey(raw: unknown): string | null {
  const name = normalizeQuestName(raw);
  if (!name) {
    return null;
  }

  const canonical = name
    .normalize('NFKC')
    .toLocaleLowerCase('zh-Hans-CN')
    .replace(/[\s\-—–_「『“'‘”’《〈【[（(」』》〉】\]）).。！？!?，,、；;：:]/g, '');

  return canonical || null;
}

export function findQuestKeyByCanonical<T>(record: Record<string, T>, rawName: unknown): string | undefined {
  const canonical = getQuestCanonicalKey(rawName);
  if (!canonical) {
    return undefined;
  }

  return Object.keys(record).find(key => getQuestCanonicalKey(key) === canonical);
}

export function resolveQuestPatchKey<T>(
  activeQuests: Record<string, T>,
  completedQuests: Record<string, T>,
  rawName: unknown,
): string | null {
  const normalized = normalizeQuestName(rawName);
  if (!normalized) {
    return null;
  }

  return findQuestKeyByCanonical(activeQuests, normalized)
    ?? findQuestKeyByCanonical(completedQuests, normalized)
    ?? normalized;
}
