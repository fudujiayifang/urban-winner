import type { GameState } from '../schema';
import { normalizeWorldbook, type Worldbook } from '../services/worldbook';
import { generateWithBrowser } from './generate.browser';
import { generateRawWithTavern, generateWithTavern } from './generate.tavern';
import {
  loadBrowserSession,
  loadBrowserManualSaves,
  saveBrowserSession,
  saveBrowserManualSaves,
} from './session.browser';
import { loadTavernSession, loadTavernManualSaves, saveTavernSession, saveTavernManualSaves } from './session.tavern';
import { loadBrowserAvatarState, loadBrowserState, saveBrowserAvatarState, saveBrowserState } from './storage.browser';
import { loadTavernAvatarState, loadTavernState, saveTavernAvatarState, saveTavernState } from './storage.tavern';

export type RuntimeEnvironment = 'tavern' | 'browser';

export interface EnvironmentInfo {
  environment: RuntimeEnvironment;
  isTavern: boolean;
  isEmbedded: boolean;
}

export type ChatTurnSource = 'intro-seed';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  source?: ChatTurnSource;
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

export interface SessionSnapshot {
  history: ChatTurn[];
  summary: string;
  summaryHistory: FloorSummary[];
  options: string[];
  narrativeBlocks: NarrativeBlock[];
}

export interface RerollSnapshot {
  userInput: string;
  gameState: GameState;
  session: SessionSnapshot;
}

export interface SessionState extends SessionSnapshot {
  rerollSnapshot?: RerollSnapshot | null;
}

export interface ManualSaveSnapshot {
  version: 1;
  id: string;
  name: string;
  savedAt: string;
  gameState: GameState;
  socialAvatars: Record<string, string>;
  session: SessionState;
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

export interface RawGenerateRequest {
  systemPrompt: string;
  userInput: string;
  jsonSchema?: {
    name: string;
    description?: string;
    value: Record<string, unknown>;
  };
  customApi?: {
    apiurl: string;
    key?: string;
    model: string;
    source?: 'openai';
    temperature?: number;
    maxTokens?: number;
  };
}

export interface RuntimeAdapter {
  environment: RuntimeEnvironment;
  loadState(): Partial<GameState> | null;
  saveState(data: GameState): void;
  loadAvatarState(): Record<string, string> | null;
  saveAvatarState(data: Record<string, string>): void;
  loadSession(): Partial<SessionState> | null;
  saveSession(session: SessionState): void;
  loadManualSaves(): ManualSaveSnapshot[];
  saveManualSaves(snapshots: ManualSaveSnapshot[]): void;
  generate(request: GenerateRequest): Promise<GenerateResult>;
  generateRaw?(request: RawGenerateRequest): Promise<GenerateResult>;
  generateRawWithCustomApi?(request: RawGenerateRequest): Promise<GenerateResult>;
  parseVariableUpdate?(message: string, currentState: GameState): Promise<Partial<GameState> | null>;
  loadLorebook(): Promise<Worldbook | null>;
  getEnvironmentInfo(): EnvironmentInfo;
}

function isTavernEnvironment(): boolean {
  try {
    if (typeof getVariables === 'function') {
      return true;
    }
  } catch {
    // ignore
  }

  try {
    return typeof window.parent?.TavernHelper?.generate === 'function';
  } catch {
    return false;
  }
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
      loadAvatarState: loadTavernAvatarState,
      saveAvatarState: saveTavernAvatarState,
      loadSession: loadTavernSession,
      saveSession: saveTavernSession,
      loadManualSaves: loadTavernManualSaves,
      saveManualSaves: saveTavernManualSaves,
      generate: generateWithTavern,
      generateRaw: generateRawWithTavern,
      generateRawWithCustomApi: generateRawWithTavern,
      parseVariableUpdate: parseTavernVariableUpdate,
      loadLorebook: loadTavernLorebook,
      getEnvironmentInfo: () => createEnvironmentInfo('tavern'),
    };
  }

  return {
    environment: 'browser',
    loadState: loadBrowserState,
    saveState: saveBrowserState,
    loadAvatarState: loadBrowserAvatarState,
    saveAvatarState: saveBrowserAvatarState,
    loadSession: loadBrowserSession,
    saveSession: saveBrowserSession,
    loadManualSaves: loadBrowserManualSaves,
    saveManualSaves: saveBrowserManualSaves,
    generate: generateWithBrowser,
    loadLorebook: async () => null,
    getEnvironmentInfo: () => createEnvironmentInfo('browser'),
  };
}
