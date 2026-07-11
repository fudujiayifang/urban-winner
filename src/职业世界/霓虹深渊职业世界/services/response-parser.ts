import { jsonrepair } from 'jsonrepair';
import type { NarrativeBlock } from '../adapters/runtime';

export interface ParsedResponse {
  raw: string;
  maintext: string;
  options: string[];
  varsText: string | null;
  updateVariableText: string | null;
  vars: unknown | null;
  summary: string;
}

export interface NarrativeInlineSegment {
  kind: 'text' | 'npc-name';
  text: string;
}

const SCENE_DIVIDER_PATTERNS = [
  /^[-—–_*]{3,}$/,
  /^【(?:场景切换|转场|过场|分界)】$/,
  /^[◇◆◈]\s*.+\s*[◇◆◈]$/,
];

const NPC_NAME_PREFIX = /^([\p{Script=Han}A-Za-z0-9·]{1,12})(：)(.*)$/u;
const NON_NPC_PREFIXES = new Set(['系统', '提示', '旁白']);
const ZERO_SEVEN_SYSTEM_PREFIX = /^【零七(?:系统|碎碎念)】/;

function normalizeNarrativeText(text: string): string {
  return text
    .replace(/^\*\*([\s\S]*?)\*\*$/u, '$1')
    .replace(/^\*([\s\S]*?)\*$/u, '$1')
    .trim();
}

function extractTag(raw: string, tag: string): string {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(raw);
  return match?.[1]?.trim() ?? '';
}

function isContentPlaceholder(text: string): boolean {
  return /已在\s*content\s*标签中输出/i.test(text.trim());
}

export function applyInternalRegexRules(text: string): string {
  return text
    .replace(/[\s\S]*?<content>/i, '')
    .replace(/<\/content>[\s\S]*/i, '')
    .replace(/<update_variable>[\s\S]*?<\/update_variable>/gi, '')
    .replace(/<branches>[\s\S]*?<\/branches>/gi, '')
    .trim();
}

export function parseOptions(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/^\s*(?:[-*]|[A-Da-d][.、:：]|\d+[.、])\s*/, '').trim())
    .filter(Boolean);
}

export function parseVars(varsText: string | null): unknown | null {
  if (!varsText?.trim()) {
    return null;
  }

  return JSON.parse(jsonrepair(varsText));
}

export function parseModelResponse(raw: string): ParsedResponse {
  const rawMaintext = extractTag(raw, 'maintext');
  const contentText = extractTag(raw, 'content');
  const maintextSource = rawMaintext && !isContentPlaceholder(rawMaintext)
    ? rawMaintext
    : contentText || rawMaintext || raw;
  const maintext = applyInternalRegexRules(maintextSource);
  const optionText = extractTag(raw, 'option') || extractTag(raw, 'branches');
  const varsText = extractTag(raw, 'vars') || null;
  const updateVariableText = extractTag(raw, 'update_variable') || null;
  const summary = extractTag(raw, 'sum');

  return {
    raw,
    maintext,
    options: parseOptions(optionText),
    varsText,
    updateVariableText,
    vars: parseVars(varsText),
    summary,
  };
}

export function isSystemNarrativeText(text: string): boolean {
  const normalized = normalizeNarrativeText(text);
  return normalized.startsWith('▸')
    || normalized.includes('class="sys-msg"')
    || ZERO_SEVEN_SYSTEM_PREFIX.test(normalized);
}

export function isSceneDividerText(text: string): boolean {
  const value = text.trim();
  return SCENE_DIVIDER_PATTERNS.some(pattern => pattern.test(value));
}

export function splitNarrativeSegments(text: string): NarrativeInlineSegment[] {
  const match = NPC_NAME_PREFIX.exec(text.trim());
  if (!match) {
    return [{ kind: 'text', text }];
  }

  const [, name, colon, rest] = match;
  if (NON_NPC_PREFIXES.has(name)) {
    return [{ kind: 'text', text }];
  }

  return [
    { kind: 'npc-name', text: name },
    { kind: 'text', text: `${colon}${rest}` },
  ];
}

export function narrativeBlocksFromText(text: string, turnId: string): NarrativeBlock[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const isSystem = isSystemNarrativeText(line);
      const cleanText = normalizeNarrativeText(
        line
          .replace(/<[^>]+>/g, '')
          .replace(/^▸\s*/, ''),
      );

      return {
        id: `${turnId}-${index}`,
        kind: isSystem ? 'system' : 'maintext',
        text: cleanText,
        turnId,
      } satisfies NarrativeBlock;
    });
}

export function rebuildNarrativeFromHistory(history: { role: 'user' | 'assistant'; content: string }[]): NarrativeBlock[] {
  return history.flatMap((turn, index) => {
    const turnId = `history-${index}`;
    if (turn.role === 'user') {
      return [{ id: turnId, kind: 'player', text: turn.content, turnId } satisfies NarrativeBlock];
    }

    const parsed = parseModelResponse(turn.content);
    return narrativeBlocksFromText(parsed.maintext, turnId);
  });
}
