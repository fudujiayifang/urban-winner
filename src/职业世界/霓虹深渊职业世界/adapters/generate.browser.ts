import type { GenerateRequest, GenerateResult } from './runtime';

type BrowserApiSettings = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temp?: number;
};

function readSettings(): BrowserApiSettings {
  try {
    return JSON.parse(localStorage.getItem('API_SETTINGS') || '{}') as BrowserApiSettings;
  } catch {
    return {};
  }
}

export async function generateWithBrowser(request: GenerateRequest): Promise<GenerateResult> {
  const settings = readSettings();
  if (!settings.apiKey || !settings.baseUrl || !settings.model) {
    throw new Error('浏览器 fallback 需要先在 localStorage.API_SETTINGS 中配置 baseUrl、apiKey 和 model');
  }

  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        ...request.recentHistory,
        { role: 'user', content: request.userInput },
      ],
      stream: false,
      temperature: settings.temp ?? 0.7,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(_.get(errorData, 'error.message', `HTTP ${response.status}`));
  }

  const data = await response.json();
  const rawText = _.get(data, 'choices.0.message.content', '');
  return { rawText: String(rawText) };
}
