import { AppLanguage } from './config.js';

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
  const isVi = options.language === 'vi';

  const rows: InlineKeyboardButton[][] = [
    [
      {
        text: inputMode
          ? (isVi ? '⌨️ Tắt Nhập' : '⌨️ Input OFF')
          : (isVi ? '⌨️ Bật Nhập' : '⌨️ Input ON'),
        callback_data: `session_cmd:${options.sessionId}:toggle_input`
      },
      {
        text: autoEnter
          ? (isVi ? '⏎ Tắt AutoEnter' : '⏎ AutoEnter OFF')
          : (isVi ? '⏎ Bật AutoEnter' : '⏎ AutoEnter ON'),
        callback_data: `session_cmd:${options.sessionId}:toggle_enter`
      },
      {
        text: isVi ? '🔄 Tải lại' : '🔄 Refresh',
        callback_data: `session_cmd:${options.sessionId}:refresh`
      }
    ],
    [
      {
        text: '⛔ Esc',
        callback_data: `session_cmd:${options.sessionId}:send_escape`
      },
      {
        text: isVi ? '⬆️ Lên' : '⬆️ Up',
        callback_data: `session_cmd:${options.sessionId}:send_up`
      },
      {
        text: isVi ? '⬇️ Xuống' : '⬇️ Down',
        callback_data: `session_cmd:${options.sessionId}:send_down`
      }
    ],
    [
      {
        text: '⏎ Enter',
        callback_data: `session_cmd:${options.sessionId}:send_enter`
      },
      {
        text: isVi ? '🛑 Dừng' : '🛑 Stop',
        callback_data: `session_cmd:${options.sessionId}:stop`
      }
    ]
  ];

  if (options.includeBackButton) {
    rows.push([
      {
        text: isVi ? '⬅️ Quay lại' : '⬅️ Back',
        callback_data: 'sessions_list'
      }
    ]);
  }

  return { inline_keyboard: rows };
}
