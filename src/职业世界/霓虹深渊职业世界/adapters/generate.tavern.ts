import type { ChatTurn, GenerateRequest, GenerateResult, RawGenerateRequest } from './runtime';

const TAVERN_CHARACTER_DESCRIPTION = '谢自国 - 谢氏家族三子，玄阴体，天穹学府大一新生，职业为生命系灵医';
const TAVERN_SCENARIO = '2778年赛博朋克世界，星城天穹学府';
const DEFAULT_RAW_JSON_SCHEMA = {
  name: 'raw_sync_patch',
  description: '用于约束副 AI 返回结构化 JSON patch',
  value: {
    type: 'object',
    additionalProperties: true,
  },
} as const;

function toTavernHistoryPrompts(history: ChatTurn[]): { role: ChatTurn['role']; content: string }[] {
  return history
    .map(turn => ({ role: turn.role, content: turn.content.trim() }))
    .filter(turn => turn.content.length > 0);
}

function extractGeneratedText(response: string | { content?: string; response?: string }): string {
  if (typeof response === 'string') {
    return response;
  }

  return response.content ?? response.response ?? '';
}

function makeGenerationId(): string {
  return `neon-abyss-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export async function generateWithTavern(request: GenerateRequest): Promise<GenerateResult> {
  const tavernGenerate = window.parent?.TavernHelper?.generate ?? globalThis.generate;
  if (!tavernGenerate) {
    throw new Error('TavernHelper.generate 不可用');
  }

  const generationId = makeGenerationId();
  const streamListener = (incrementalText: string, receivedGenerationId: string) => {
    if (receivedGenerationId === generationId) {
      request.onStreamDelta?.(incrementalText);
    }
  };
  const streamSubscription = typeof eventOn === 'function'
    ? eventOn(iframe_events.STREAM_TOKEN_RECEIVED_INCREMENTALLY, streamListener)
    : null;

  try {
    const response = await tavernGenerate({
      generation_id: generationId,
      should_stream: true,
      user_input: request.userInput,
      injects: [
        {
          role: 'system',
          content: request.systemPrompt,
          position: 'in_chat',
          depth: 0,
          should_scan: false,
        },
      ],
      overrides: {
        char_description: TAVERN_CHARACTER_DESCRIPTION,
        scenario: TAVERN_SCENARIO,
        chat_history: {
          with_depth_entries: true,
          prompts: toTavernHistoryPrompts(request.recentHistory),
        },
      },
    });

    return { rawText: extractGeneratedText(response) };
  } finally {
    streamSubscription?.stop();
  }
}

export async function generateRawWithTavern(request: RawGenerateRequest): Promise<GenerateResult> {
  const tavernGenerateRaw = window.parent?.TavernHelper?.generateRaw ?? globalThis.generateRaw;
  if (tavernGenerateRaw) {
    const response = await tavernGenerateRaw({
      generation_id: makeGenerationId(),
      should_stream: false,
      should_silence: true,
      user_input: request.userInput,
      overrides: {
        char_description: TAVERN_CHARACTER_DESCRIPTION,
        scenario: TAVERN_SCENARIO,
        chat_history: {
          with_depth_entries: false,
          prompts: [],
        },
      },
      ordered_prompts: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userInput },
      ],
      ...(request.customApi
        ? {
            custom_api: {
              apiurl: request.customApi.apiurl,
              key: request.customApi.key,
              model: request.customApi.model,
              source: request.customApi.source,
              temperature: request.customApi.temperature,
              max_tokens: request.customApi.maxTokens,
            },
          }
        : {}),
      json_schema: request.jsonSchema ?? DEFAULT_RAW_JSON_SCHEMA,
    });

    return { rawText: extractGeneratedText(response) };
  }

  const tavernGenerate = window.parent?.TavernHelper?.generate ?? globalThis.generate;
  if (!tavernGenerate) {
    throw new Error('TavernHelper.generateRaw / generate 均不可用');
  }

  const response = await tavernGenerate({
    generation_id: makeGenerationId(),
    should_stream: false,
    should_silence: true,
    user_input: request.userInput,
    injects: [
      {
        role: 'system',
        content: request.systemPrompt,
        position: 'in_chat',
        depth: 0,
        should_scan: false,
      },
    ],
    overrides: {
      char_description: TAVERN_CHARACTER_DESCRIPTION,
      scenario: TAVERN_SCENARIO,
      chat_history: {
        with_depth_entries: false,
        prompts: [],
      },
    },
  });

  return { rawText: extractGeneratedText(response) };
}
