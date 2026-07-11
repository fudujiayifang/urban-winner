type ParserState = 'normal' | 'buffer-tag' | 'tagged' | 'opaque';

const STREAM_TAGS = ['thinking', 'think', 'maintext', 'content', 'option', 'branches', 'vars', 'update_variable', 'sum'];
const OPAQUE_TAGS = ['thinking', 'think'];
const PARTIAL_TAG_LIMIT = 64;

export interface StreamingResponseParser {
  feed(chunk: string): void;
  finish(): void;
}

export function createStreamingResponseParser(onMaintextDelta: (delta: string) => void): StreamingResponseParser {
  let state: ParserState = 'normal';
  let partialTag = '';
  let currentTag = '';
  let currentBuffer = '';

  function emitChunk(tag: string, chunk: string): void {
    if (tag === 'maintext' || tag === 'content') {
      onMaintextDelta(chunk);
    }
  }

  function openTag(tag: string): void {
    currentTag = tag;
    currentBuffer = '';
    state = OPAQUE_TAGS.includes(tag) ? 'opaque' : 'tagged';
  }

  function closeTag(): void {
    currentTag = '';
    currentBuffer = '';
    state = 'normal';
  }

  function flushTagBuffer(): void {
    const tagText = partialTag.trim().toLowerCase();
    partialTag = '';
    const isClose = tagText.startsWith('/');
    const tagName = isClose ? tagText.slice(1).trim() : tagText;

    if (isClose) {
      if (currentTag === tagName) {
        closeTag();
      } else {
        state = currentTag ? 'tagged' : 'normal';
      }
      return;
    }

    if (STREAM_TAGS.includes(tagName)) {
      openTag(tagName);
      return;
    }

    if (currentTag) {
      const rawTag = `<${tagText}>`;
      currentBuffer += rawTag;
      emitChunk(currentTag, rawTag);
      state = 'tagged';
      return;
    }

    state = 'normal';
  }

  function consumeChar(char: string): void {
    if (state === 'normal') {
      if (char === '<') {
        partialTag = '';
        state = 'buffer-tag';
      }
      return;
    }

    if (state === 'buffer-tag') {
      if (char === '>') {
        flushTagBuffer();
        return;
      }

      partialTag += char;
      if (partialTag.length > PARTIAL_TAG_LIMIT) {
        if (currentTag) {
          const rawText = `<${partialTag}`;
          currentBuffer += rawText;
          emitChunk(currentTag, rawText);
          state = 'tagged';
        } else {
          state = 'normal';
        }
        partialTag = '';
      }
      return;
    }

    if (state === 'opaque') {
      currentBuffer += char;
      const closeMarker = `</${currentTag}>`;
      if (currentBuffer.toLowerCase().endsWith(closeMarker)) {
        closeTag();
      }
      return;
    }

    if (state === 'tagged') {
      if (char === '<') {
        partialTag = '';
        state = 'buffer-tag';
        return;
      }

      currentBuffer += char;
      emitChunk(currentTag, char);
    }
  }

  return {
    feed(chunk: string): void {
      for (const char of chunk) {
        consumeChar(char);
      }
    },
    finish(): void {
      if (state === 'buffer-tag' && partialTag && currentTag) {
        emitChunk(currentTag, `<${partialTag}`);
      }
      closeTag();
      partialTag = '';
    },
  };
}
