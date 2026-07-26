import { ref } from 'vue';

export type AiSyncChannel = 'system' | 'social';
export type AiSyncMode = 'inherit-main' | 'second-ai';
export type AiSyncTransport = 'legacy-main' | 'tavern-custom-api' | 'browser-fetch' | 'unavailable';

export interface AiSyncChannelStatus {
  enabled: boolean;
  lastRunAt: string | null;
  lastFields: string[];
  lastError: string | null;
  runCount: number;
}

export interface AiSyncStatus {
  mode: AiSyncMode;
  transport: AiSyncTransport;
  configured: boolean;
  hasApiKey: boolean;
  configError: string | null;
  environment: 'tavern' | 'browser';
  baseUrl: string;
  model: string;
  system: AiSyncChannelStatus;
  social: AiSyncChannelStatus;
}

function createChannelStatus(): AiSyncChannelStatus {
  return {
    enabled: false,
    lastRunAt: null,
    lastFields: [],
    lastError: null,
    runCount: 0,
  };
}

const status = ref<AiSyncStatus>({
  mode: 'inherit-main',
  transport: 'unavailable',
  configured: false,
  hasApiKey: false,
  configError: null,
  environment: 'browser',
  baseUrl: '',
  model: '',
  system: createChannelStatus(),
  social: createChannelStatus(),
});

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

function getChannelStatus(channel: AiSyncChannel): AiSyncChannelStatus {
  return channel === 'system' ? status.value.system : status.value.social;
}

export function useAiSyncStatus() {
  return status;
}

export function updateAiSyncAvailability(next: {
  mode: AiSyncMode;
  transport: AiSyncTransport;
  configured: boolean;
  hasApiKey: boolean;
  configError: string | null;
  environment: 'tavern' | 'browser';
  baseUrl: string;
  model: string;
  systemEnabled: boolean;
  socialEnabled: boolean;
}): void {
  status.value.mode = next.mode;
  status.value.transport = next.transport;
  status.value.configured = next.configured;
  status.value.hasApiKey = next.hasApiKey;
  status.value.configError = next.configError;
  status.value.environment = next.environment;
  status.value.baseUrl = next.baseUrl;
  status.value.model = next.model;
  status.value.system.enabled = next.systemEnabled;
  status.value.social.enabled = next.socialEnabled;
}

export function recordAiSyncSuccess(channel: AiSyncChannel, fields: string[]): void {
  const channelStatus = getChannelStatus(channel);
  channelStatus.lastRunAt = getNowLabel();
  channelStatus.lastFields = fields;
  channelStatus.lastError = null;
  channelStatus.runCount += 1;
}

export function recordAiSyncError(channel: AiSyncChannel, error: unknown): void {
  const channelStatus = getChannelStatus(channel);
  channelStatus.lastRunAt = getNowLabel();
  channelStatus.lastError = error instanceof Error ? error.message : String(error);
  channelStatus.runCount += 1;
}
