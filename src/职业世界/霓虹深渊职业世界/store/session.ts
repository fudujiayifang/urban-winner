import _ from 'lodash';

import type { ChatTurn, FloorSummary, NarrativeBlock, SessionState } from '../adapters/runtime';
import { createRuntimeAdapter } from '../adapters/runtime';
import { DEFAULT_INTRO_BLOCKS } from '../services/intro';
import { rebuildNarrativeFromHistory } from '../services/response-parser';

function normalizeSession(session: Partial<SessionState> | null): SessionState {
  const history = Array.isArray(session?.history) ? session.history.filter(isChatTurn) : [];
  const summaryHistory = Array.isArray(session?.summaryHistory) ? session.summaryHistory.filter(isFloorSummary) : [];
  const narrativeBlocks = history.length > 0
    ? rebuildNarrativeFromHistory(history)
    : Array.isArray(session?.narrativeBlocks) && session.narrativeBlocks.length > 0
      ? session.narrativeBlocks.filter(isNarrativeBlock)
      : klona(DEFAULT_INTRO_BLOCKS);

  return {
    history,
    narrativeBlocks,
    summary: typeof session?.summary === 'string' ? session.summary : '',
    summaryHistory,
    options: Array.isArray(session?.options) ? session.options.filter(option => typeof option === 'string') : [],
  };
}

function isChatTurn(value: unknown): value is ChatTurn {
  if (!_.isPlainObject(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const role = candidate.role;
  return (role === 'user' || role === 'assistant') && typeof candidate.content === 'string';
}

function isNarrativeBlock(value: unknown): value is NarrativeBlock {
  if (!_.isPlainObject(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  return (kind === 'intro' || kind === 'player' || kind === 'maintext' || kind === 'system')
    && typeof candidate.id === 'string'
    && typeof candidate.text === 'string';
}

function isFloorSummary(value: unknown): value is FloorSummary {
  if (!_.isPlainObject(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.turnId === 'string' && typeof candidate.content === 'string';
}

export const useSessionStore = defineStore('neon-abyss-career-world.session', () => {
  const runtime = createRuntimeAdapter();
  const history = ref<ChatTurn[]>([]);
  const narrativeBlocks = ref<NarrativeBlock[]>(klona(DEFAULT_INTRO_BLOCKS));
  const suggestedActions = ref<string[]>([]);
  const lastSummary = ref('');
  const summaryHistory = ref<FloorSummary[]>([]);
  const inputDraft = ref('');
  const isGenerating = ref(false);
  const error = ref<string | null>(null);
  const initialized = ref(false);
  const liveAssistantBlock = ref<NarrativeBlock | null>(null);

  const stateForSave = computed<SessionState>(() => ({
    history: history.value,
    narrativeBlocks: narrativeBlocks.value,
    summary: lastSummary.value,
    summaryHistory: summaryHistory.value,
    options: suggestedActions.value,
  }));

  function init(): void {
    if (initialized.value) {
      return;
    }

    const session = normalizeSession(runtime.loadSession());
    history.value = session.history;
    narrativeBlocks.value = session.narrativeBlocks;
    suggestedActions.value = session.options;
    lastSummary.value = session.summary;
    summaryHistory.value = session.summaryHistory;
    initialized.value = true;
  }

  function save(): void {
    runtime.saveSession(stateForSave.value);
  }

  function appendTurn(turn: ChatTurn): void {
    history.value.push(turn);
    if (history.value.length > 40) {
      history.value = history.value.slice(-40);
    }
  }

  function appendNarrativeBlock(block: NarrativeBlock): void {
    narrativeBlocks.value.push(block);
  }

  function appendNarrativeBlocks(blocks: NarrativeBlock[]): void {
    narrativeBlocks.value.push(...blocks);
  }

  function startLiveAssistantBlock(turnId: string): void {
    liveAssistantBlock.value = {
      id: `${turnId}-live`,
      kind: 'maintext',
      text: '',
      turnId,
    };
  }

  function appendLiveAssistantText(delta: string): void {
    if (!delta || !liveAssistantBlock.value) {
      return;
    }

    liveAssistantBlock.value = {
      ...liveAssistantBlock.value,
      text: `${liveAssistantBlock.value.text}${delta}`,
    };
  }

  function clearLiveAssistantBlock(): void {
    liveAssistantBlock.value = null;
  }

  function setOptions(options: string[]): void {
    suggestedActions.value = options;
  }

  function setSummary(summary: string): void {
    lastSummary.value = summary;
  }

  function addFloorSummary(turnId: string, summary: string): void {
    const content = summary.trim();
    if (!content) {
      return;
    }

    summaryHistory.value.push({ turnId, content });
    if (summaryHistory.value.length > 400) {
      summaryHistory.value = summaryHistory.value.slice(-400);
    }
  }

  function getRecentSummaries(limit: number): FloorSummary[] {
    return summaryHistory.value.slice(-Math.max(0, limit));
  }

  function setError(message: string | null): void {
    error.value = message;
  }

  function setGenerating(value: boolean): void {
    isGenerating.value = value;
  }

  function fillInput(text: string): void {
    inputDraft.value = text;
  }

  return {
    history,
    narrativeBlocks,
    suggestedActions,
    lastSummary,
    summaryHistory,
    inputDraft,
    isGenerating,
    error,
    initialized,
    liveAssistantBlock,
    init,
    save,
    appendTurn,
    appendNarrativeBlock,
    appendNarrativeBlocks,
    startLiveAssistantBlock,
    appendLiveAssistantText,
    clearLiveAssistantBlock,
    setOptions,
    setSummary,
    addFloorSummary,
    getRecentSummaries,
    setError,
    setGenerating,
    fillInput,
  };
});
