import type { GameState } from '../schema';
import { normalizeWorldbook, type Worldbook } from '../services/worldbook';
import { generateWithBrowser } from './generate.browser';
import { generateWithTavern } from './generate.tavern';
import { loadBrowserSession, saveBrowserSession } from './session.browser';
import { loadTavernSession, saveTavernSession } from './session.tavern';
import { loadBrowserState, saveBrowserState } from './storage.browser';
import { loadTavernState, saveTavernState } from './storage.tavern';

export type RuntimeEnvironment = 'tavern' | 'browser';

export interface EnvironmentInfo {
  environment: RuntimeEnvironment;
  isTavern: boolean;
  isEmbedded: boolean;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface NarrativeBlock {
  id: string;
  kind: 'intro' | 'player' | 'maintext' | 'system';
  text: string;
  turnId?: string;
}

export interface FloorSummary {
  turnId: string;
  content: string;
}

export interface SessionState {
  history: ChatTurn[];
  summary: string;
  summaryHistory: FloorSummary[];
  options: string[];
  narrativeBlocks: NarrativeBlock[];
}

export interface GenerateRequest {
  userInput: string;
  systemPrompt: string;
  recentHistory: ChatTurn[];
  onStreamDelta?: (deltaText: string) => void;
}

export interface GenerateResult {
  rawText: string;
}

export interface RuntimeAdapter {
  environment: RuntimeEnvironment;
  loadState(): Partial<GameState> | null;
  saveState(data: GameState): void;
  loadSession(): Partial<SessionState> | null;
  saveSession(session: SessionState): void;
  generate(request: GenerateRequest): Promise<GenerateResult>;
  parseVariableUpdate?(message: string, currentState: GameState): Promise<Partial<GameState> | null>;
  loadLorebook(): Promise<Worldbook | null>;
  getEnvironmentInfo(): EnvironmentInfo;
}

function isTavernEnvironment(): boolean {
  return typeof window.parent?.TavernHelper?.generate === 'function' || typeof getVariables === 'function';
}

function createEnvironmentInfo(environment: RuntimeEnvironment): EnvironmentInfo {
  return {
    environment,
    isTavern: environment === 'tavern',
    isEmbedded: window.parent !== window,
  };
}

async function loadTavernLorebook(): Promise<Worldbook | null> {
  try {
    if (typeof getChatWorldbookName === 'function') {
      const chatWorldbookName = getChatWorldbookName('current');
      if (chatWorldbookName && typeof getWorldbook === 'function') {
        const chatWorldbook = await getWorldbook(chatWorldbookName);
        const normalizedChatWorldbook = normalizeWorldbook(chatWorldbook);
        if (normalizedChatWorldbook) {
          return normalizedChatWorldbook;
        }
      }
    }

    if (typeof getCharWorldbookNames === 'function' && typeof getWorldbook === 'function') {
      const charWorldbooks = getCharWorldbookNames('current');
      const worldbookNames = [charWorldbooks.primary, ...charWorldbooks.additional].filter(
        (name): name is string => typeof name === 'string' && name.trim().length > 0,
      );

      for (const worldbookName of worldbookNames) {
        const worldbook = await getWorldbook(worldbookName);
        const normalizedWorldbook = normalizeWorldbook(worldbook);
        if (normalizedWorldbook) {
          return normalizedWorldbook;
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function parseTavernVariableUpdate(message: string, currentState: GameState): Promise<Partial<GameState> | null> {
  if (typeof Mvu === 'undefined' || typeof Mvu.parseMessage !== 'function') {
    return null;
  }

  const baseData = {
    ...(typeof Mvu.getMvuData === 'function' ? Mvu.getMvuData({ type: 'chat' }) : {}),
    stat_data: klona(currentState),
  } as Mvu.MvuData;
  const nextData = await Mvu.parseMessage(message, baseData);
  const statData = _.get(nextData, 'stat_data');

  return _.isPlainObject(statData) ? (statData as Partial<GameState>) : null;
}

export function createRuntimeAdapter(): RuntimeAdapter {
  if (isTavernEnvironment()) {
    return {
      environment: 'tavern',
      loadState: loadTavernState,
      saveState: saveTavernState,
      loadSession: loadTavernSession,
      saveSession: saveTavernSession,
      generate: generateWithTavern,
      parseVariableUpdate: parseTavernVariableUpdate,
      loadLorebook: loadTavernLorebook,
      getEnvironmentInfo: () => createEnvironmentInfo('tavern'),
    };
  }

  return {
    environment: 'browser',
    loadState: loadBrowserState,
    saveState: saveBrowserState,
    loadSession: loadBrowserSession,
    saveSession: saveBrowserSession,
    generate: generateWithBrowser,
    loadLorebook: async () => null,
    getEnvironmentInfo: () => createEnvironmentInfo('browser'),
  };
}
