import type { GenerateResult, RawGenerateRequest, RuntimeAdapter } from '../adapters/runtime';
import { getAiSyncSecret, normalizeAiSyncConfig, type AiSyncConfig } from './ai-sync-config';

export type AiSyncTransport = 'legacy-main' | 'tavern-custom-api' | 'unavailable';

export interface AiSyncRawGenerator {
  transport: AiSyncTransport;
  configured: boolean;
  configError: string | null;
  generate: (request: RawGenerateRequest) => Promise<GenerateResult>;
}

export function createAiSyncRawGenerator(options: {
  runtime: RuntimeAdapter;
  config: AiSyncConfig;
}): AiSyncRawGenerator {
  const { runtime, config } = options;
  const normalized = normalizeAiSyncConfig(config);

  if (config.mode === 'second-ai') {
    if (!normalized.baseUrl || !normalized.model || !config.hasApiKey) {
      return {
        transport: 'unavailable',
        configured: false,
        configError: '副 AI 配置不完整。',
        generate: async () => {
          throw new Error('副 AI 配置不完整。');
        },
      };
    }

    if (runtime.environment !== 'tavern') {
      return {
        transport: 'unavailable',
        configured: false,
        configError: '当前环境暂不支持独立副 AI，同步只能在 Tavern 中使用第二套接口。',
        generate: async () => {
          throw new Error('当前环境暂不支持独立副 AI。');
        },
      };
    }

    const secret = getAiSyncSecret();
    if (!secret.apiKey.trim()) {
      return {
        transport: 'unavailable',
        configured: false,
        configError: '副 AI API Key 缺失。',
        generate: async () => {
          throw new Error('副 AI API Key 缺失。');
        },
      };
    }

    return {
      transport: 'tavern-custom-api',
      configured: true,
      configError: null,
      generate: request => runtime.generateRawWithCustomApi?.({
        ...request,
        customApi: {
          apiurl: normalized.baseUrl,
          key: secret.apiKey.trim(),
          model: normalized.model,
          source: 'openai',
          temperature: normalized.temperature,
          maxTokens: normalized.maxTokens,
        },
      }) ?? Promise.reject(new Error('当前运行时不支持独立副 AI custom_api。')),
    };
  }

  if (runtime.generateRaw) {
    return {
      transport: 'legacy-main',
      configured: true,
      configError: null,
      generate: request => runtime.generateRaw!(request),
    };
  }

  return {
    transport: 'unavailable',
    configured: false,
    configError: '当前环境没有可用的 raw 同步能力。',
    generate: async () => {
      throw new Error('当前环境没有可用的 raw 同步能力。');
    },
  };
}
