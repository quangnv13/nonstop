import { buildSessionActionMarkup, InlineKeyboardMarkup } from './session-controls.js';

export interface SessionOutputMessage {
  text: string;
  options: {
    parse_mode: 'MarkdownV2';
    reply_markup: InlineKeyboardMarkup;
  };
}

export interface BuildSessionOutputMessagesOptions {
  sessionId: string;
  snapshot: string;
  inputMode?: boolean;
  autoEnter?: boolean;
}

const TELEGRAM_MESSAGE_LIMIT = 4000;
const CODE_FENCE_OVERHEAD = '```\n\n```'.length;

export function buildSessionOutputMessages(
  options: BuildSessionOutputMessagesOptions
): SessionOutputMessage[] {
  const markup = buildSessionActionMarkup({
    sessionId: options.sessionId,
    inputMode: options.inputMode,
    autoEnter: options.autoEnter,
    includeBackButton: false
  });

  return chunkTelegramCodeBlocks(options.snapshot, TELEGRAM_MESSAGE_LIMIT).map((chunk) => ({
    text: `\`\`\`\n${chunk}\n\`\`\``,
    options: {
      parse_mode: 'MarkdownV2',
      reply_markup: markup
    }
  }));
}

function chunkTelegramCodeBlocks(text: string, limit: number): string[] {
  const source = text || '';
  if (!source) {
    return [];
  }

  const maxChunkLength = Math.max(1, limit - CODE_FENCE_OVERHEAD);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const character of source) {
    const escapedCharacter = escapeTelegramCodeBlockCharacter(character);

    if (currentChunk.length + escapedCharacter.length > maxChunkLength) {
      chunks.push(currentChunk);
      currentChunk = escapedCharacter;
      continue;
    }

    currentChunk += escapedCharacter;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function escapeTelegramCodeBlockCharacter(character: string): string {
  if (character === '\\') {
    return '\\\\';
  }

  if (character === '`') {
    return '\\`';
  }

  return character;
}
