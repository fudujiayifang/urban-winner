import _ from 'lodash';

import type { ChatTurn, NarrativeBlock, SessionState } from '../adapters/runtime';
import { createRuntimeAdapter } from '../adapters/runtime';
import { DEFAULT_INTRO_BLOCKS } from '../services/intro';
import { rebuildNarrativeFromHistory } from '../services/response-parser';

function normalizeSession(session: Partial<SessionState> | null): SessionState {
  const history = Array.isArray(session?.history) ? session.history.filter(isChatTurn) : [];
  const narrativeBlocks = history.length > 0
    ? rebuildNarrativeFromHistory(history)
    : Array.isArray(session?.narrativeBlocks) && session.narrativeBlocks.length > 0
      ? session.narrativeBlocks.filter(isNarrativeBlock)
      : klona(DEFAULT_INTRO_BLOCKS);

  return {
    history,
    narrativeBlocks,
    summary: typeof session?.summary === 'string' ? session.summary : '',
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

export const useSessionStore = defineStore('neon-abyss-career-world.session', () => {
  const runtime = createRuntimeAdapter();
  const history = ref<ChatTurn[]>([]);
  const narrativeBlocks = ref<NarrativeBlock[]>(klona(DEFAULT_INTRO_BLOCKS));
  const suggestedActions = ref<string[]>([]);
  const lastSummary = ref('');
  const inputDraft = ref('');
  const isGenerating = ref(false);
  const error = ref<string | null>(null);
  const initialized = ref(false);
  const liveAssistantBlock = ref<NarrativeBlock | null>(null);

  const stateForSave = computed<SessionState>(() => ({
    history: history.value,
    narrativeBlocks: narrativeBlocks.value,
    summary: lastSummary.value,
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
    setError,
    setGenerating,
    fillInput,
  };
});
