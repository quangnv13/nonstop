export interface SessionActionMarkupOptions {
  sessionId: string;
  inputMode?: boolean;
  autoEnter?: boolean;
  includeBackButton?: boolean;
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
  const rows: InlineKeyboardButton[][] = [
    [
      {
        text: inputMode ? '⌨️ Input OFF' : '⌨️ Input ON',
        callback_data: `session_cmd:${options.sessionId}:toggle_input`
      },
      {
        text: autoEnter ? '⏎ AutoEnter OFF' : '⏎ AutoEnter ON',
        callback_data: `session_cmd:${options.sessionId}:toggle_enter`
      },
      {
        text: '🔄 Refresh',
        callback_data: `session_cmd:${options.sessionId}:refresh`
      }
    ],
    [
      {
        text: '⛔ Esc',
        callback_data: `session_cmd:${options.sessionId}:send_escape`
      },
      {
        text: '⬆️ Up',
        callback_data: `session_cmd:${options.sessionId}:send_up`
      },
      {
        text: '⬇️ Down',
        callback_data: `session_cmd:${options.sessionId}:send_down`
      }
    ],
    [
      {
        text: '⏎ Enter',
        callback_data: `session_cmd:${options.sessionId}:send_enter`
      },
      {
        text: '🛑 Stop',
        callback_data: `session_cmd:${options.sessionId}:stop`
      }
    ]
  ];

  if (options.includeBackButton) {
    rows.push([
      {
        text: '⬅️ Back',
        callback_data: 'sessions_list'
      }
    ]);
  }

  return { inline_keyboard: rows };
}
