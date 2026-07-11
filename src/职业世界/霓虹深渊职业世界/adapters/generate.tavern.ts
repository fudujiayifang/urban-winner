import type { ChatTurn, GenerateRequest, GenerateResult } from './runtime';

const TAVERN_CHARACTER_DESCRIPTION = '谢自国 - 谢氏家族三子，玄阴体，天穹学府大一新生，职业为生命系灵医';
const TAVERN_SCENARIO = '2778年赛博朋克世界，星城天穹学府';

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
