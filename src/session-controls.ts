import { AppLanguage } from './config.js';
import { createTranslator } from './i18n.js';

export interface SessionActionMarkupOptions {
  sessionId: string;
  inputMode?: boolean;
  autoEnter?: boolean;
  includeBackButton?: boolean;
  language?: AppLanguage;
}

interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export function buildSessionActionMarkup(options: SessionActionMarkupOptions): InlineKeyboardMarkup {
  const inputMode = options.inputMode ?? true;
  const autoEnter = options.autoEnter ?? true;
  const t = createTranslator(options.language || 'en');

  const rows: InlineKeyboardButton[][] = [
    [
      {
        text: inputMode ? t('bot.sessionMarkup.inputOff') : t('bot.sessionMarkup.inputOn'),
        callback_data: `session_cmd:${options.sessionId}:toggle_input`
      },
      {
        text: autoEnter ? t('bot.sessionMarkup.autoEnterOff') : t('bot.sessionMarkup.autoEnterOn'),
        callback_data: `session_cmd:${options.sessionId}:toggle_enter`
      },
      {
        text: t('bot.sessionMarkup.refresh'),
        callback_data: `session_cmd:${options.sessionId}:refresh`
      }
    ],
    [
      {
        text: '⛔ Esc',
        callback_data: `session_cmd:${options.sessionId}:send_escape`
      },
      {
        text: t('bot.sessionMarkup.up'),
        callback_data: `session_cmd:${options.sessionId}:send_up`
      },
      {
        text: t('bot.sessionMarkup.down'),
        callback_data: `session_cmd:${options.sessionId}:send_down`
      }
    ],
    [
      {
        text: '⏎ Enter',
        callback_data: `session_cmd:${options.sessionId}:send_enter`
      },
      {
        text: t('bot.sessionMarkup.stop'),
        callback_data: `session_cmd:${options.sessionId}:stop`
      }
    ]
  ];

  if (options.includeBackButton) {
    rows.push([
      {
        text: t('bot.sessionMarkup.back'),
        callback_data: 'sessions_list'
      }
    ]);
  }

  return { inline_keyboard: rows };
}
