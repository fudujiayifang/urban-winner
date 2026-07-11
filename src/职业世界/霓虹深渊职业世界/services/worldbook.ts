import type { ChatTurn } from '../adapters/runtime';

export interface WorldbookEntry {
  id: string;
  name: string;
  enabled: boolean;
  strategy: {
    type: 'constant' | 'selective';
    keys: string[];
    keysSecondary: {
      logic: 'and_any' | 'and_all' | 'not_all' | 'not_any';
      keys: string[];
    };
  };
  content: string;
  order: number;
}

export interface Worldbook {
  name: string;
  entries: WorldbookEntry[];
}

interface WorldbookContextOptions {
  userInput: string;
  recentHistory: ChatTurn[];
}

const MAX_MATCHED_ENTRIES = 8;
const MAX_CONTEXT_CHARS = 4000;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function normalizeSelectiveLogic(value: unknown): WorldbookEntry['strategy']['keysSecondary']['logic'] {
  switch (value) {
    case 0:
    case 'and_any':
      return 'and_any';
    case 1:
    case 'not_all':
      return 'not_all';
    case 2:
    case 'not_any':
      return 'not_any';
    case 3:
    case 'and_all':
      return 'and_all';
    default:
      return 'and_any';
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Array.isArray(value) === false;
}

function normalizeExportEntry(entryId: string, entry: unknown): WorldbookEntry | null {
  if (!isPlainRecord(entry)) {
    return null;
  }

  const disable = entry.disable;
  const excluded = entry.excluded;
  if (disable === true || excluded === true) {
    return null;
  }

  const keys = asStringArray(entry.key);
  const keysSecondary = asStringArray(entry.keysecondary);
  const rawContent = entry.content;
  const content = typeof rawContent === 'string' ? rawContent.trim() : '';
  if (content.length === 0) {
    return null;
  }

  const comment = entry.comment;
  const uid = entry.uid;
  const order = entry.order;
  const constant = entry.constant;
  const selectiveLogic = entry.selectiveLogic;

  return {
    id: `export-${typeof uid === 'number' ? uid : entryId}`,
    name: typeof comment === 'string' && comment.trim().length > 0 ? comment : `条目 ${entryId}`,
    enabled: true,
    strategy: {
      type: constant === true ? 'constant' : 'selective',
      keys,
      keysSecondary: {
        logic: normalizeSelectiveLogic(selectiveLogic),
        keys: keysSecondary,
      },
    },
    content,
    order: typeof order === 'number' ? order : 100,
  };
}

function normalizeRuntimeEntry(entry: unknown, index: number): WorldbookEntry | null {
  if (!isPlainRecord(entry) || entry.enabled !== true) {
    return null;
  }

  const strategyValue = entry.strategy;
  if (!isPlainRecord(strategyValue)) {
    return null;
  }

  const strategyType = strategyValue.type;
  if (strategyType !== 'constant' && strategyType !== 'selective') {
    return null;
  }

  const rawContent = entry.content;
  if (typeof rawContent !== 'string') {
    return null;
  }

  const content = rawContent.trim();
  if (content.length === 0) {
    return null;
  }

  const uid = entry.uid;
  const rawName = entry.name;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const position = entry.position;
  const keysSecondaryValue = strategyValue.keys_secondary;
  const rawOrder = isPlainRecord(position) ? position.order : undefined;

  return {
    id: typeof uid === 'number' ? `runtime-${uid}` : `runtime-${index}`,
    name: name.length > 0 ? name : `条目 ${index + 1}`,
    enabled: true,
    strategy: {
      type: strategyType,
      keys: asStringArray(strategyValue.keys),
      keysSecondary: {
        logic: normalizeSelectiveLogic(strategyValue.selectiveLogic),
        keys: isPlainRecord(keysSecondaryValue) ? asStringArray(keysSecondaryValue.keys) : [],
      },
    },
    content,
    order: typeof rawOrder === 'number' ? rawOrder : 100,
  };
}

export function normalizeWorldbook(source: unknown): Worldbook | null {
  if (Array.isArray(source)) {
    const entries = source
      .map((entry, index) => normalizeRuntimeEntry(entry, index))
      .filter((entry): entry is WorldbookEntry => entry !== null)
      .sort((lhs, rhs) => lhs.order - rhs.order);

    return entries.length > 0 ? { name: 'Tavern Worldbook', entries } : null;
  }

  if (!isPlainRecord(source)) {
    return null;
  }

  const exportWorldbook = source;
  const rawEntries = exportWorldbook.entries;
  if (!isPlainRecord(rawEntries)) {
    return null;
  }

  const rawName = exportWorldbook.name;
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const entries = Object.entries(rawEntries)
    .map(([entryId, entry]) => normalizeExportEntry(entryId, entry))
    .filter((entry): entry is WorldbookEntry => entry !== null)
    .sort((lhs, rhs) => lhs.order - rhs.order);

  return entries.length > 0
    ? {
        name: name.length > 0 ? name : '职业世界设定',
        entries,
      }
    : null;
}

function matchesSecondaryKeys(scanText: string, keysSecondary: WorldbookEntry['strategy']['keysSecondary']): boolean {
  if (keysSecondary.keys.length === 0) {
    return true;
  }

  const matches = keysSecondary.keys.map(key => scanText.includes(key));
  switch (keysSecondary.logic) {
    case 'and_all':
      return matches.every(Boolean);
    case 'not_all':
      return matches.includes(false);
    case 'not_any':
      return matches.every(matched => matched === false);
    case 'and_any':
    default:
      return matches.some(Boolean);
  }
}

function matchesEntry(entry: WorldbookEntry, scanText: string): boolean {
  if (!entry.enabled) {
    return false;
  }

  if (entry.strategy.type === 'constant') {
    return true;
  }

  if (entry.strategy.keys.length === 0) {
    return false;
  }

  const primaryMatched = entry.strategy.keys.some(key => scanText.includes(key));
  return primaryMatched && matchesSecondaryKeys(scanText, entry.strategy.keysSecondary);
}

function buildScanText(options: WorldbookContextOptions): string {
  return [
    options.userInput,
    ...options.recentHistory.slice(-3).map(turn => turn.content),
  ]
    .map(text => text.trim())
    .filter(Boolean)
    .join('\n');
}

export function collectWorldbookContext(worldbook: Worldbook | null, options: WorldbookContextOptions): string | null {
  if (!worldbook) {
    return null;
  }

  const scanText = buildScanText(options);
  if (!scanText) {
    return null;
  }

  const matchedEntries = worldbook.entries
    .filter(entry => matchesEntry(entry, scanText))
    .slice(0, MAX_MATCHED_ENTRIES);

  if (matchedEntries.length === 0) {
    return null;
  }

  const lines: string[] = [];
  let totalChars = 0;

  for (const entry of matchedEntries) {
    const block = `- ${entry.name}\n${entry.content}`;
    if (totalChars + block.length > MAX_CONTEXT_CHARS) {
      break;
    }
    lines.push(block);
    totalChars += block.length;
  }

  return lines.length > 0 ? lines.join('\n\n') : null;
}
