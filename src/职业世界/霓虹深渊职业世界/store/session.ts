import _ from 'lodash';

import type { ChatTurn, FloorSummary, NarrativeBlock, RerollSnapshot, SessionSnapshot, SessionState } from '../adapters/runtime';
import type { GameState } from '../schema';
import { createRuntimeAdapter } from '../adapters/runtime';
import { createIntroSeedTurn, DEFAULT_INTRO_BLOCKS, isIntroSeedTurn } from '../services/intro';
import { rebuildNarrativeFromHistory } from '../services/response-parser';

function createSessionSnapshot(session: SessionSnapshot): SessionSnapshot {
  return {
    history: klona(session.history),
    narrativeBlocks: klona(session.narrativeBlocks),
    summary: session.summary,
    summaryHistory: klona(session.summaryHistory),
    options: klona(session.options),
  };
}

function hasRealTurn(history: ChatTurn[]): boolean {
  return history.some(turn => !isIntroSeedTurn(turn));
}

function ensureIntroSeed(history: ChatTurn[]): ChatTurn[] {
  if (history.some(isIntroSeedTurn) || hasRealTurn(history)) {
    return history;
  }

  return [createIntroSeedTurn(), ...history];
}

function normalizeRerollSnapshot(snapshot: unknown): RerollSnapshot | null {
  if (!_.isPlainObject(snapshot)) {
    return null;
  }

  const candidate = snapshot as Partial<RerollSnapshot>;
  if (typeof candidate.userInput !== 'string' || !_.isPlainObject(candidate.gameState) || !_.isPlainObject(candidate.session)) {
    return null;
  }

  const session = normalizeSession(candidate.session as Partial<SessionState>);
  return {
    userInput: candidate.userInput,
    gameState: klona(candidate.gameState) as GameState,
    session: createSessionSnapshot(session),
  };
}

function normalizeSession(session: Partial<SessionState> | null): SessionState {
  const rawHistory = Array.isArray(session?.history) ? session.history.filter(isChatTurn) : [];
  const history = ensureIntroSeed(rawHistory);
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
    rerollSnapshot: normalizeRerollSnapshot(session?.rerollSnapshot),
  };
}

function isChatTurn(value: unknown): value is ChatTurn {
  if (!_.isPlainObject(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const role = candidate.role;
  const source = candidate.source;
  return (role === 'user' || role === 'assistant')
    && typeof candidate.content === 'string'
    && (source === undefined || source === 'intro-seed');
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
  const rerollSnapshot = ref<RerollSnapshot | null>(null);
  const canReroll = computed(() => rerollSnapshot.value !== null);
  const hasRealProgress = computed(() => hasRealTurn(history.value));
  const effectiveHistoryCount = computed(() => history.value.filter(turn => !isIntroSeedTurn(turn)).length);

  const currentSessionSnapshot = computed<SessionSnapshot>(() => ({
    history: history.value,
    narrativeBlocks: narrativeBlocks.value,
    summary: lastSummary.value,
    summaryHistory: summaryHistory.value,
    options: suggestedActions.value,
  }));

  const stateForSave = computed<SessionState>(() => ({
    ...createSessionSnapshot(currentSessionSnapshot.value),
    rerollSnapshot: rerollSnapshot.value ? klona(rerollSnapshot.value) : null,
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
    rerollSnapshot.value = session.rerollSnapshot ?? null;
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

  function saveRerollSnapshot(userInput: string, gameState: GameState): void {
    rerollSnapshot.value = {
      userInput,
      gameState: klona(gameState),
      session: createSessionSnapshot(currentSessionSnapshot.value),
    };
  }

  function restoreRerollSessionSnapshot(): string | null {
    const snapshot = rerollSnapshot.value;
    if (!snapshot) {
      return null;
    }

    history.value = klona(snapshot.session.history);
    narrativeBlocks.value = klona(snapshot.session.narrativeBlocks);
    suggestedActions.value = klona(snapshot.session.options);
    lastSummary.value = snapshot.session.summary;
    summaryHistory.value = klona(snapshot.session.summaryHistory);
    inputDraft.value = '';
    error.value = null;
    clearLiveAssistantBlock();
    save();
    return snapshot.userInput;
  }

  function clearRerollSnapshot(): void {
    rerollSnapshot.value = null;
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
    rerollSnapshot,
    canReroll,
    hasRealProgress,
    effectiveHistoryCount,
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
    saveRerollSnapshot,
    restoreRerollSessionSnapshot,
    clearRerollSnapshot,
    fillInput,
  };
});
