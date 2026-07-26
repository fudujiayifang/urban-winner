import _ from 'lodash';

export type AiSyncMode = 'inherit-main' | 'second-ai';

export interface AiSyncConfig {
  mode: AiSyncMode;
  systemEnabled: boolean;
  socialEnabled: boolean;
  baseUrl: string;
  model: string;
  temperature: string;
  maxTokens: string;
  hasApiKey: boolean;
}

export interface AiSyncSecret {
  apiKey: string;
  historyKeys?: Record<string, {
    apiKey: string;
    updatedAt: string;
    hint: string;
  }>;
}

export interface AiSyncHistoryEntry {
  id: string;
  mode: AiSyncMode;
  systemEnabled: boolean;
  socialEnabled: boolean;
  baseUrl: string;
  model: string;
  temperature: string;
  maxTokens: string;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
  hasStoredApiKey: boolean;
  apiKeyHint?: string;
}

interface AiSyncHistoryState {
  entries: AiSyncHistoryEntry[];
}

export interface AiSyncHistoryApplyResult {
  config: AiSyncConfig;
  restoredApiKey: boolean;
}

export interface NormalizedAiSyncConfig {
  mode: AiSyncMode;
  systemEnabled: boolean;
  socialEnabled: boolean;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  hasApiKey: boolean;
}

export interface AiSyncConfigValidationResult {
  ok: boolean;
  error: string | null;
}

const CONFIG_STORAGE_KEY = 'neon-abyss-career-world.ai_sync.config';
const SECRET_STORAGE_KEY = 'neon-abyss-career-world.ai_sync.secret';
const HISTORY_STORAGE_KEY = 'neon-abyss-career-world.ai_sync.history';
const TAVERN_VARIABLE_OPTION = { type: 'chat' } as const satisfies VariableOption;
const CONFIG_VARIABLE_PATH = 'ai_sync_config';
const SECRET_VARIABLE_PATH = 'ai_sync_secret';
const HISTORY_VARIABLE_PATH = 'ai_sync_history';
const MAX_AI_SYNC_HISTORY_ENTRIES = 8;

const DEFAULT_AI_SYNC_CONFIG: AiSyncConfig = {
  mode: 'inherit-main',
  systemEnabled: true,
  socialEnabled: true,
  baseUrl: '',
  model: '',
  temperature: '',
  maxTokens: '',
  hasApiKey: false,
};

const STORAGE_VARIABLE_PATHS: Record<string, string> = {
  [CONFIG_STORAGE_KEY]: CONFIG_VARIABLE_PATH,
  [SECRET_STORAGE_KEY]: SECRET_VARIABLE_PATH,
  [HISTORY_STORAGE_KEY]: HISTORY_VARIABLE_PATH,
};

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function hasTavernVariables(): boolean {
  return typeof getVariables === 'function' && typeof updateVariablesWith === 'function';
}

function readVariableJson<T>(path: string): Partial<T> | null {
  if (!hasTavernVariables()) {
    return null;
  }

  const variables = getVariables(TAVERN_VARIABLE_OPTION);
  const value = _.get(variables, path);
  return _.isPlainObject(value) ? (value as Partial<T>) : null;
}

function writeVariableJson<T>(path: string, value: T): void {
  if (!hasTavernVariables()) {
    return;
  }

  updateVariablesWith(variables => _.set(variables, path, klona(value)), TAVERN_VARIABLE_OPTION);
}

function removeVariableValue(path: string): void {
  if (!hasTavernVariables()) {
    return;
  }

  updateVariablesWith(variables => {
    _.unset(variables, path);
    return variables;
  }, TAVERN_VARIABLE_OPTION);
}

function parseNumberField(value: string): number | undefined {
  const text = value.trim();
  if (!text) {
    return undefined;
  }

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function readJson<T>(storageKey: string): Partial<T> | null {
  if (hasTavernVariables()) {
    const variablePath = STORAGE_VARIABLE_PATHS[storageKey];
    const value = variablePath ? readVariableJson<T>(variablePath) : null;
    if (value) {
      return value;
    }
  }

  if (!hasLocalStorage()) {
    return null;
  }

  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    return _.isPlainObject(parsed) ? (parsed as Partial<T>) : null;
  } catch {
    return null;
  }
}

function writeJson<T>(storageKey: string, value: T): void {
  if (hasTavernVariables()) {
    const variablePath = STORAGE_VARIABLE_PATHS[storageKey];
    if (variablePath) {
      writeVariableJson(variablePath, value);
    }
    return;
  }

  if (!hasLocalStorage()) {
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(value));
}

function readSecret(): AiSyncSecret {
  const raw = readJson<AiSyncSecret>(SECRET_STORAGE_KEY);
  const historyKeys = raw?.historyKeys;
  return {
    apiKey: typeof raw?.apiKey === 'string' ? raw.apiKey : '',
    historyKeys: _.isPlainObject(historyKeys) ? historyKeys : {},
  };
}

function writeSecret(secret: AiSyncSecret): void {
  writeJson(SECRET_STORAGE_KEY, {
    apiKey: secret.apiKey,
    historyKeys: secret.historyKeys ?? {},
  } satisfies AiSyncSecret);
}

function getNowLabel(): string {
  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map(value => String(value).padStart(2, '0'))
    .join('.');
  const time = [now.getHours(), now.getMinutes()]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
  return `${date} ${time}`;
}

function getApiKeyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed ? `••••${trimmed.slice(-4)}` : '';
}

function createHistoryEntryId(baseUrl: string, model: string): string {
  let hash = 0;
  for (const char of `${baseUrl}\n${model}`) {
    hash = ((hash << 5) - hash + char.codePointAt(0)!) >>> 0;
  }

  return `ai-sync-${hash.toString(36) || 'default'}`;
}

function normalizeConfigForHistory(config: Omit<AiSyncConfig, 'hasApiKey'>): Omit<AiSyncConfig, 'hasApiKey'> {
  return {
    mode: config.mode,
    systemEnabled: config.systemEnabled,
    socialEnabled: config.socialEnabled,
    baseUrl: config.baseUrl.trim().replace(/\/+$/, ''),
    model: config.model.trim(),
    temperature: config.temperature.trim(),
    maxTokens: config.maxTokens.trim(),
  };
}

function sanitizeHistoryEntry(value: unknown, secret: AiSyncSecret): AiSyncHistoryEntry | null {
  if (!_.isPlainObject(value)) {
    return null;
  }

  const record = value as Partial<AiSyncHistoryEntry>;
  if (typeof record.id !== 'string' || typeof record.baseUrl !== 'string' || typeof record.model !== 'string') {
    return null;
  }

  const id = record.id.trim();
  const baseUrl = record.baseUrl.trim().replace(/\/+$/, '');
  const model = record.model.trim();
  if (!id || !baseUrl || !model) {
    return null;
  }

  const historyKey = secret.historyKeys?.[id];
  return {
    id,
    mode: record.mode === 'inherit-main' ? 'inherit-main' : 'second-ai',
    systemEnabled: typeof record.systemEnabled === 'boolean' ? record.systemEnabled : true,
    socialEnabled: typeof record.socialEnabled === 'boolean' ? record.socialEnabled : true,
    baseUrl,
    model,
    temperature: typeof record.temperature === 'string' ? record.temperature : '',
    maxTokens: typeof record.maxTokens === 'string' ? record.maxTokens : '',
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : getNowLabel(),
    lastUsedAt: typeof record.lastUsedAt === 'string' ? record.lastUsedAt : getNowLabel(),
    useCount: Number.isFinite(Number(record.useCount)) ? Math.max(0, Math.trunc(Number(record.useCount))) : 0,
    hasStoredApiKey: Boolean(historyKey?.apiKey),
    ...(historyKey?.hint ? { apiKeyHint: historyKey.hint } : {}),
  };
}

function sortAndLimitHistory(entries: AiSyncHistoryEntry[]): AiSyncHistoryEntry[] {
  return _.uniqBy(entries, entry => entry.id)
    .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
    .slice(0, MAX_AI_SYNC_HISTORY_ENTRIES);
}

export function loadAiSyncHistory(): AiSyncHistoryEntry[] {
  const secret = readSecret();
  const raw = readJson<AiSyncHistoryState>(HISTORY_STORAGE_KEY);
  const rawEntries = raw?.entries;
  const entries = Array.isArray(rawEntries)
    ? rawEntries.map(entry => sanitizeHistoryEntry(entry, secret)).filter((entry): entry is AiSyncHistoryEntry => entry != null)
    : [];

  if (!entries.length) {
    const current = loadAiSyncConfig();
    if (current.mode === 'second-ai' && current.baseUrl.trim() && current.model.trim()) {
      const normalized = normalizeConfigForHistory(current);
      const now = getNowLabel();
      const id = createHistoryEntryId(normalized.baseUrl, normalized.model);
      const historyKey = secret.historyKeys?.[id];
      return [{
        id,
        mode: 'second-ai',
        systemEnabled: normalized.systemEnabled,
        socialEnabled: normalized.socialEnabled,
        baseUrl: normalized.baseUrl,
        model: normalized.model,
        temperature: normalized.temperature,
        maxTokens: normalized.maxTokens,
        createdAt: now,
        lastUsedAt: now,
        useCount: 1,
        hasStoredApiKey: Boolean(historyKey?.apiKey || secret.apiKey),
        apiKeyHint: historyKey?.hint ?? getApiKeyHint(secret.apiKey),
      }];
    }
  }

  return sortAndLimitHistory(entries);
}

function saveAiSyncHistory(entries: AiSyncHistoryEntry[]): AiSyncHistoryEntry[] {
  const nextEntries = sortAndLimitHistory(entries);
  writeJson(HISTORY_STORAGE_KEY, { entries: nextEntries } satisfies AiSyncHistoryState);
  return nextEntries;
}

export function upsertAiSyncHistoryEntry(
  config: Omit<AiSyncConfig, 'hasApiKey'>,
  options: { apiKey?: string; rememberApiKey?: boolean } = {},
): AiSyncHistoryEntry[] {
  const normalized = normalizeConfigForHistory(config);
  if (normalized.mode !== 'second-ai' || !normalized.baseUrl || !normalized.model) {
    return loadAiSyncHistory();
  }

  const now = getNowLabel();
  const id = createHistoryEntryId(normalized.baseUrl, normalized.model);
  const secret = readSecret();
  const trimmedApiKey = options.apiKey?.trim() ?? '';
  if (options.rememberApiKey && trimmedApiKey) {
    secret.historyKeys = {
      ...(secret.historyKeys ?? {}),
      [id]: {
        apiKey: trimmedApiKey,
        updatedAt: now,
        hint: getApiKeyHint(trimmedApiKey),
      },
    };
    writeSecret(secret);
  }

  const existing = loadAiSyncHistory().find(entry => entry.id === id);
  const historyKey = secret.historyKeys?.[id];
  const nextEntry: AiSyncHistoryEntry = {
    id,
    mode: 'second-ai',
    systemEnabled: normalized.systemEnabled,
    socialEnabled: normalized.socialEnabled,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    temperature: normalized.temperature,
    maxTokens: normalized.maxTokens,
    createdAt: existing?.createdAt ?? now,
    lastUsedAt: now,
    useCount: (existing?.useCount ?? 0) + 1,
    hasStoredApiKey: Boolean(historyKey?.apiKey || trimmedApiKey || secret.apiKey),
    apiKeyHint: historyKey?.hint ?? getApiKeyHint(trimmedApiKey || secret.apiKey),
  };

  return saveAiSyncHistory([nextEntry, ...loadAiSyncHistory().filter(entry => entry.id !== id)]);
}

export function applyAiSyncHistoryEntry(id: string): AiSyncHistoryApplyResult | null {
  const entry = loadAiSyncHistory().find(item => item.id === id);
  if (!entry) {
    return null;
  }

  const secret = readSecret();
  const historyKey = secret.historyKeys?.[id];
  const restoredApiKey = Boolean(historyKey?.apiKey);
  if (historyKey?.apiKey) {
    secret.apiKey = historyKey.apiKey;
    writeSecret(secret);
  }

  const config = saveAiSyncConfig({
    mode: 'second-ai',
    systemEnabled: entry.systemEnabled,
    socialEnabled: entry.socialEnabled,
    baseUrl: entry.baseUrl,
    model: entry.model,
    temperature: entry.temperature,
    maxTokens: entry.maxTokens,
  });
  upsertAiSyncHistoryEntry(config);

  return {
    config,
    restoredApiKey,
  };
}

export function deleteAiSyncHistoryEntry(id: string): AiSyncHistoryEntry[] {
  const secret = readSecret();
  if (secret.historyKeys?.[id]) {
    delete secret.historyKeys[id];
    writeSecret(secret);
  }

  return saveAiSyncHistory(loadAiSyncHistory().filter(entry => entry.id !== id));
}

export function clearAiSyncHistory(): AiSyncHistoryEntry[] {
  const secret = readSecret();
  secret.historyKeys = {};
  writeSecret(secret);

  if (hasTavernVariables()) {
    removeVariableValue(HISTORY_VARIABLE_PATH);
  }
  if (hasLocalStorage()) {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  }

  return [];
}

export function loadAiSyncConfig(): AiSyncConfig {
  const raw = readJson<AiSyncConfig>(CONFIG_STORAGE_KEY);
  const secret = readSecret();

  return {
    mode: raw?.mode === 'second-ai' ? 'second-ai' : 'inherit-main',
    systemEnabled: typeof raw?.systemEnabled === 'boolean' ? raw.systemEnabled : DEFAULT_AI_SYNC_CONFIG.systemEnabled,
    socialEnabled: typeof raw?.socialEnabled === 'boolean' ? raw.socialEnabled : DEFAULT_AI_SYNC_CONFIG.socialEnabled,
    baseUrl: typeof raw?.baseUrl === 'string' ? raw.baseUrl : DEFAULT_AI_SYNC_CONFIG.baseUrl,
    model: typeof raw?.model === 'string' ? raw.model : DEFAULT_AI_SYNC_CONFIG.model,
    temperature: typeof raw?.temperature === 'string' ? raw.temperature : DEFAULT_AI_SYNC_CONFIG.temperature,
    maxTokens: typeof raw?.maxTokens === 'string' ? raw.maxTokens : DEFAULT_AI_SYNC_CONFIG.maxTokens,
    hasApiKey: Boolean(secret.apiKey),
  };
}

export function getAiSyncSecret(): AiSyncSecret {
  return readSecret();
}

export function saveAiSyncConfig(config: Omit<AiSyncConfig, 'hasApiKey'>, apiKey?: string): AiSyncConfig {
  writeJson(CONFIG_STORAGE_KEY, config);

  if (typeof apiKey === 'string' && apiKey.trim()) {
    const secret = readSecret();
    writeSecret({
      ...secret,
      apiKey: apiKey.trim(),
    });
  }

  return loadAiSyncConfig();
}

export function clearAiSyncApiKey(): AiSyncConfig {
  const secret = readSecret();
  writeSecret({
    ...secret,
    apiKey: '',
  });

  return loadAiSyncConfig();
}

export function clearAiSyncConfig(): AiSyncConfig {
  if (hasTavernVariables()) {
    removeVariableValue(CONFIG_VARIABLE_PATH);
  }
  if (hasLocalStorage()) {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
  }

  const secret = readSecret();
  writeSecret({
    ...secret,
    apiKey: '',
  });

  return loadAiSyncConfig();
}

export function normalizeAiSyncConfig(config: AiSyncConfig): NormalizedAiSyncConfig {
  return {
    mode: config.mode,
    systemEnabled: config.systemEnabled,
    socialEnabled: config.socialEnabled,
    baseUrl: config.baseUrl.trim().replace(/\/+$/, ''),
    model: config.model.trim(),
    temperature: parseNumberField(config.temperature),
    maxTokens: parseNumberField(config.maxTokens),
    hasApiKey: config.hasApiKey,
  };
}

export function validateAiSyncConfig(config: AiSyncConfig, draftApiKey = ''): AiSyncConfigValidationResult {
  if (config.mode !== 'second-ai') {
    return { ok: true, error: null };
  }

  const normalized = normalizeAiSyncConfig(config);
  const hasEffectiveApiKey = config.hasApiKey || Boolean(draftApiKey.trim());
  if (!normalized.baseUrl) {
    return { ok: false, error: '请填写 OpenAI 兼容 Base URL。' };
  }

  if (!/^https?:\/\//.test(normalized.baseUrl)) {
    return { ok: false, error: 'Base URL 需要以 http:// 或 https:// 开头。' };
  }

  if (!normalized.model) {
    return { ok: false, error: '请填写副 AI 的模型名称。' };
  }

  if (!hasEffectiveApiKey) {
    return { ok: false, error: '请填写副 AI 的 API Key。' };
  }

  if (normalized.temperature != null && (normalized.temperature < 0 || normalized.temperature > 2)) {
    return { ok: false, error: 'Temperature 需要在 0 到 2 之间。' };
  }

  if (normalized.maxTokens != null && (!Number.isInteger(normalized.maxTokens) || normalized.maxTokens <= 0)) {
    return { ok: false, error: 'Max tokens 需要是正整数。' };
  }

  return { ok: true, error: null };
}

export function getRedactedAiSyncSummary(config: AiSyncConfig): { baseUrl: string; model: string; hasApiKey: boolean } {
  const normalized = normalizeAiSyncConfig(config);
  return {
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    hasApiKey: config.hasApiKey,
  };
}
