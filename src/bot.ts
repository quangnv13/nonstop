import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger.js';
import { buildSessionActionMarkup } from './session-controls.js';
import { SessionOutputMessage } from './session-output.js';
import { ActiveSessionState, SessionPreset, Workspace, WorkspaceDraft } from './types.js';
import { createWorkspaceId } from './store.js';

const grammyRequire: NodeRequire = require;
const { Bot, InlineKeyboard } = grammyRequire('grammy') as GrammyModule;

type BotContext = any;
type InlineKeyboardInstance = {
  text: (label: string, callbackData: string) => InlineKeyboardInstance;
  row: () => InlineKeyboardInstance;
};

type GrammyModule = {
  Bot: new (token: string) => GrammyBot;
  InlineKeyboard: new () => InlineKeyboardInstance;
};

type GrammyBot = {
  api: {
    getMe: () => Promise<{ username?: string }>;
    sendMessage: (
      chatId: number,
      text: string,
      options?: SessionOutputMessage['options'] | { reply_markup?: unknown; parse_mode?: string }
    ) => Promise<unknown>;
  };
  use: (handler: (ctx: BotContext, next: () => Promise<void>) => Promise<void>) => void;
  command: (command: string, handler: (ctx: BotContext) => Promise<void>) => void;
  on: (filter: string, handler: (ctx: BotContext) => Promise<void>) => void;
  callbackQuery: (trigger: string | RegExp, handler: (ctx: BotContext) => Promise<void>) => void;
  start: () => Promise<void>;
  stop: () => void;
  catch: (handler: (error: { error: unknown }) => void) => void;
};

export interface CreateBotRuntimeDependencies {
  getWorkspaces: () => Workspace[];
  saveWorkspaces: (workspaces: Workspace[]) => void;
  getActiveSession: () => ActiveSessionState | null;
  startSession: (chatId: number, workspaceId: string, preset: SessionPreset) => Promise<void>;
  stopSession: () => Promise<void>;
  sendInput: (data: string) => void;
  sendKey: (key: string) => void;
  setInputMode: (inputMode: boolean) => void;
  setAutoEnter: (autoEnter: boolean) => void;
}

export interface BotRuntime {
  start(options?: { onStart?: (botInfo: { username?: string }) => void }): Promise<void>;
  stop(): Promise<void>;
  pushSessionOutput: (
    chatId: number,
    text: string,
    options?: SessionOutputMessage['options']
  ) => Promise<void>;
  showConfirmationPrompt: (session: ActiveSessionState, text: string) => Promise<void>;
}

interface ChatState {
  workspaceDraft: WorkspaceDraft | null;
}

const SUPPORTED_PRESETS: SessionPreset[] = ['powershell', 'bash', 'codex', 'antigravity'];
const LAST_CHAT_ID_PATH = path.join(process.cwd(), 'data', 'last-chat-id.txt');

function saveLastChatId(chatId: number): void {
  try {
    fs.mkdirSync(path.dirname(LAST_CHAT_ID_PATH), { recursive: true });
    fs.writeFileSync(LAST_CHAT_ID_PATH, String(chatId), 'utf8');
  } catch {
    // ignore
  }
}

export function loadLastChatId(): number | null {
  try {
    if (!fs.existsSync(LAST_CHAT_ID_PATH)) return null;
    const val = parseInt(fs.readFileSync(LAST_CHAT_ID_PATH, 'utf8').trim(), 10);
    return Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

export function createBotRuntime(deps: CreateBotRuntimeDependencies): BotRuntime {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN là bắt buộc.');
  }

  const allowedUsername = normalizeUsername(
    process.env.ADMIN_USERNAME || process.env.TELEGRAM_USERNAME || ''
  );
  const bot = new Bot(token);
  const chatStates = new Map<number, ChatState>();

  function getChatState(chatId: number): ChatState {
    const existing = chatStates.get(chatId);
    if (existing) return existing;
    const nextState: ChatState = { workspaceDraft: null };
    chatStates.set(chatId, nextState);
    return nextState;
  }

  // Lưu chat ID mỗi lần có tương tác
  function trackChatId(ctx: BotContext): void {
    const chatId = ctx.chat?.id;
    if (chatId) saveLastChatId(chatId);
  }

  async function safeAnswerCallback(ctx: BotContext, text?: string): Promise<void> {
    if (!ctx.callbackQuery) return;
    try {
      await ctx.answerCallbackQuery(text ? { text } : undefined);
    } catch { /* ignore */ }
  }

  async function renderText(
    ctx: BotContext,
    text: string,
    replyMarkup?: unknown,
    useEdit = true
  ): Promise<void> {
    if (useEdit && ctx.callbackQuery) {
      try {
        await ctx.editMessageText(text, replyMarkup ? { reply_markup: replyMarkup } : undefined);
        return;
      } catch { /* fallback to reply */ }
    }
    await ctx.reply(text, replyMarkup ? { reply_markup: replyMarkup } : undefined);
  }

  function createKeyboard(): InlineKeyboardInstance {
    return new InlineKeyboard();
  }

  function getWorkspaceById(workspaceId: string): Workspace | undefined {
    return deps.getWorkspaces().find((w) => w.id === workspaceId);
  }

  function buildMainMenuText(): string {
    const activeSession = deps.getActiveSession();
    return [
      '🖥  nonstop client',
      '',
      `📁 Workspaces: ${deps.getWorkspaces().length}`,
      activeSession
        ? `⚡ Session: ${activeSession.preset} | ${activeSession.cwd}`
        : '⚡ Session: không có'
    ].join('\n');
  }

  function buildMainMenuKeyboard(): unknown {
    return createKeyboard()
      .text('📁 Workspaces', 'workspaces_list')
      .text('⚡ Session', 'sessions_list')
      .row()
      .text('ℹ️ Trợ giúp', 'help_view');
  }

  async function showMainMenu(ctx: BotContext): Promise<void> {
    await renderText(ctx, buildMainMenuText(), buildMainMenuKeyboard());
  }

  async function showHelp(ctx: BotContext): Promise<void> {
    await renderText(
      ctx,
      [
        '📖 Lệnh có sẵn',
        '',
        '/start — Mở menu chính',
        '/status — Trạng thái runtime',
        '/help — Trợ giúp',
        '/send <lệnh> — Gửi lệnh thô tới session',
        '',
        'Khi input mode BẬT, tin nhắn thường sẽ được gửi thẳng vào session.'
      ].join('\n'),
      createKeyboard().text('⬅️ Quay lại', 'main_menu')
    );
  }

  async function showStatus(ctx: BotContext): Promise<void> {
    const activeSession = deps.getActiveSession();
    await renderText(
      ctx,
      [
        '📊 Trạng thái Runtime',
        '',
        `Người dùng: ${allowedUsername || 'không giới hạn'}`,
        `Workspaces: ${deps.getWorkspaces().length}`,
        `Session: ${activeSession ? 'đang chạy' : 'không có'}`,
        activeSession ? `Preset: ${activeSession.preset}` : '',
        activeSession ? `Thư mục: ${activeSession.cwd}` : ''
      ].filter(Boolean).join('\n'),
      createKeyboard().text('⬅️ Quay lại', 'main_menu')
    );
  }

  async function showWorkspacesMenu(ctx: BotContext): Promise<void> {
    const workspaces = deps.getWorkspaces();
    const lines = ['📁 Danh sách Workspace', ''];
    const keyboard = createKeyboard();

    if (workspaces.length === 0) {
      lines.push('Chưa có workspace nào.');
    } else {
      for (const ws of workspaces) {
        lines.push(`• ${ws.name}`);
        lines.push(`  ${ws.path}`);
        keyboard.text(`📁 ${ws.name}`, `view_workspace:${ws.id}`).row();
      }
    }

    keyboard.text('➕ Thêm workspace', 'workspace_action:add').row().text('⬅️ Quay lại', 'main_menu');
    await renderText(ctx, lines.join('\n'), keyboard);
  }

  function buildWorkspaceDetailsKeyboard(workspace: Workspace): unknown {
    return createKeyboard()
      .text('✏️ Sửa tên', `workspace_action:edit_name:${workspace.id}`)
      .text('🛠️ Sửa đường dẫn', `workspace_action:edit_path:${workspace.id}`)
      .row()
      .text('🗑️ Xóa', `workspace_action:delete:${workspace.id}`)
      .row()
      .text('Powershell', `start_session:${workspace.id}:powershell`)
      .text('Bash', `start_session:${workspace.id}:bash`)
      .row()
      .text('Codex', `start_session:${workspace.id}:codex`)
      .text('Antigravity', `start_session:${workspace.id}:antigravity`)
      .row()
      .text('⬅️ Quay lại', 'workspaces_list');
  }

  async function showWorkspaceDetails(ctx: BotContext, workspaceId: string): Promise<void> {
    const workspace = getWorkspaceById(workspaceId);
    if (!workspace) {
      await renderText(ctx, 'Workspace không tìm thấy.', createKeyboard().text('⬅️ Quay lại', 'workspaces_list'));
      return;
    }
    await renderText(
      ctx,
      ['📁 Chi tiết Workspace', '', `Tên: ${workspace.name}`, `Đường dẫn: ${workspace.path}`].join('\n'),
      buildWorkspaceDetailsKeyboard(workspace)
    );
  }

  async function showSessionsMenu(ctx: BotContext): Promise<void> {
    const activeSession = deps.getActiveSession();
    const keyboard = createKeyboard();
    const lines = ['⚡ Session', ''];

    if (!activeSession || activeSession.status !== 'running') {
      lines.push('Không có session đang chạy.');
    } else {
      lines.push(`ID: ${activeSession.sessionId}`);
      lines.push(`Preset: ${activeSession.preset}`);
      lines.push(`Thư mục: ${activeSession.cwd}`);
      keyboard.text('🎮 Điều khiển', `view_session:${activeSession.sessionId}`).row();
    }

    keyboard.text('⬅️ Quay lại', 'main_menu');
    await renderText(ctx, lines.join('\n'), keyboard);
  }

  async function showSessionDetails(ctx: BotContext, sessionId?: string): Promise<void> {
    const session = deps.getActiveSession();
    if (!session || session.status !== 'running' || (sessionId && session.sessionId !== sessionId)) {
      await renderText(ctx, 'Session không đang chạy.', createKeyboard().text('⬅️ Quay lại', 'main_menu'));
      return;
    }

    const keyboard = buildSessionActionMarkup({
      sessionId: session.sessionId,
      inputMode: session.inputMode,
      autoEnter: session.autoEnter,
      includeBackButton: true
    });

    await renderText(
      ctx,
      [
        '🎮 Điều khiển Session',
        '',
        `ID: ${session.sessionId}`,
        `Preset: ${session.preset}`,
        `Trạng thái: ${session.status}`,
        `Thư mục: ${session.cwd}`,
        `Input mode: ${session.inputMode ? 'BẬT' : 'TẮT'}`,
        `Auto enter: ${session.autoEnter ? 'BẬT' : 'TẮT'}`
      ].join('\n'),
      keyboard
    );
  }

  async function beginWorkspaceDraft(
    ctx: BotContext,
    workspaceDraft: WorkspaceDraft,
    prompt: string
  ): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    getChatState(chatId).workspaceDraft = workspaceDraft;
    await ctx.reply(prompt);
  }

  async function handleWorkspaceDraft(ctx: BotContext): Promise<boolean> {
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text?.trim();
    if (!chatId || !text) return false;

    const state = getChatState(chatId);
    const draft = state.workspaceDraft;
    if (!draft) return false;

    const workspaces = [...deps.getWorkspaces()];

    if (draft.mode === 'add_name') {
      state.workspaceDraft = { mode: 'add_path', name: text };
      await ctx.reply('Nhập đường dẫn workspace:');
      return true;
    }

    if (draft.mode === 'add_path') {
      const workspace: Workspace = {
        id: createWorkspaceId(),
        name: draft.name || 'Workspace',
        path: text
      };
      workspaces.push(workspace);
      deps.saveWorkspaces(workspaces);
      state.workspaceDraft = null;
      await ctx.reply(`✓ Đã thêm workspace "${workspace.name}".`);
      await showWorkspaceDetails(ctx, workspace.id);
      return true;
    }

    const targetIndex = workspaces.findIndex((w) => w.id === draft.workspaceId);
    if (targetIndex === -1) {
      state.workspaceDraft = null;
      await ctx.reply('Workspace không còn tồn tại.');
      return true;
    }

    if (draft.mode === 'edit_name') {
      workspaces[targetIndex] = { ...workspaces[targetIndex], name: text };
      deps.saveWorkspaces(workspaces);
      state.workspaceDraft = null;
      await ctx.reply('✓ Đã cập nhật tên workspace.');
      await showWorkspaceDetails(ctx, workspaces[targetIndex].id);
      return true;
    }

    if (draft.mode === 'edit_path') {
      workspaces[targetIndex] = { ...workspaces[targetIndex], path: text };
      deps.saveWorkspaces(workspaces);
      state.workspaceDraft = null;
      await ctx.reply('✓ Đã cập nhật đường dẫn workspace.');
      await showWorkspaceDetails(ctx, workspaces[targetIndex].id);
      return true;
    }

    return false;
  }

  // Middleware: kiểm tra quyền & lưu chat ID
  bot.use(async (ctx, next) => {
    trackChatId(ctx);
    const username = normalizeUsername(ctx.from?.username);
    if (allowedUsername && username !== allowedUsername) {
      await ctx.reply('Bot này chỉ dành cho tài khoản Telegram đã cấu hình.');
      return;
    }
    await next();
  });

  bot.command('start', async (ctx) => {
    await showMainMenu(ctx);
  });

  bot.command('help', async (ctx) => {
    await showHelp(ctx);
  });

  bot.command('status', async (ctx) => {
    await showStatus(ctx);
  });

  // /send <lệnh> — gửi raw text tới session đang chạy
  bot.command('send', async (ctx) => {
    const rawText = ctx.message?.text ?? '';
    // Bỏ phần "/send " ở đầu
    const payload = rawText.replace(/^\/send\s*/i, '').trim();
    if (!payload) {
      await ctx.reply('Cách dùng: /send <lệnh cần gửi>');
      return;
    }
    const session = deps.getActiveSession();
    if (!session || session.status !== 'running') {
      await ctx.reply('Không có session đang chạy.');
      return;
    }
    deps.sendInput(session.autoEnter ? `${payload}\r` : payload);
    await ctx.reply('✓ Đã gửi lệnh');
  });

  bot.on('message:text', async (ctx) => {
    const text: string = ctx.message.text;

    // Bỏ qua các lệnh bắt đầu bằng /
    if (text.startsWith('/')) return;

    if (await handleWorkspaceDraft(ctx)) return;

    const session = deps.getActiveSession();
    if (session?.status === 'running' && session.inputMode) {
      const payload = session.autoEnter ? `${text}\r` : text;
      deps.sendInput(payload);
      await ctx.reply('✓ Đã gửi lệnh');
      return;
    }

    await ctx.reply('Dùng /start để mở menu.');
  });

  bot.callbackQuery('main_menu', async (ctx) => {
    await safeAnswerCallback(ctx);
    await showMainMenu(ctx);
  });

  bot.callbackQuery('help_view', async (ctx) => {
    await safeAnswerCallback(ctx);
    await showHelp(ctx);
  });

  bot.callbackQuery('workspaces_list', async (ctx) => {
    await safeAnswerCallback(ctx);
    await showWorkspacesMenu(ctx);
  });

  bot.callbackQuery(/^view_workspace:(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    await showWorkspaceDetails(ctx, ctx.match[1]);
  });

  bot.callbackQuery('workspace_action:add', async (ctx) => {
    await safeAnswerCallback(ctx);
    await beginWorkspaceDraft(ctx, { mode: 'add_name' }, 'Nhập tên workspace mới:');
  });

  bot.callbackQuery(/^workspace_action:edit_name:(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    await beginWorkspaceDraft(
      ctx,
      { mode: 'edit_name', workspaceId: ctx.match[1] },
      'Nhập tên workspace mới:'
    );
  });

  bot.callbackQuery(/^workspace_action:edit_path:(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    await beginWorkspaceDraft(
      ctx,
      { mode: 'edit_path', workspaceId: ctx.match[1] },
      'Nhập đường dẫn workspace mới:'
    );
  });

  bot.callbackQuery(/^workspace_action:delete:(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    const workspaces = deps.getWorkspaces().filter((w) => w.id !== ctx.match[1]);
    deps.saveWorkspaces(workspaces);
    await showWorkspacesMenu(ctx);
  });

  bot.callbackQuery(/^start_session:(.+):(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    const workspaceId = ctx.match[1];
    const preset = ctx.match[2] as SessionPreset;

    if (!SUPPORTED_PRESETS.includes(preset)) {
      await ctx.reply(`Preset không hỗ trợ: ${preset}`);
      return;
    }

    if (deps.getActiveSession()?.status === 'running') {
      await ctx.reply('Đã có session đang chạy. Dừng session hiện tại trước.');
      return;
    }

    const workspace = getWorkspaceById(workspaceId);
    if (!workspace) {
      await ctx.reply('Workspace không tìm thấy.');
      return;
    }

    try {
      await deps.startSession(ctx.chat.id, workspace.id, preset);
      await showSessionDetails(ctx);
    } catch (error) {
      logger.error('Lỗi khi khởi chạy session', {
        workspaceId,
        preset,
        error: error instanceof Error ? error.message : String(error)
      });
      await ctx.reply(`Lỗi khi khởi chạy session: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  bot.callbackQuery('sessions_list', async (ctx) => {
    await safeAnswerCallback(ctx);
    await showSessionsMenu(ctx);
  });

  bot.callbackQuery(/^view_session:(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    await showSessionDetails(ctx, ctx.match[1]);
  });

  bot.callbackQuery(/^session_cmd:(.+):(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    const session = deps.getActiveSession();
    const sessionId = ctx.match[1];
    const action = ctx.match[2];

    if (!session || session.sessionId !== sessionId || session.status !== 'running') {
      await ctx.reply('Session không đang chạy.');
      return;
    }

    switch (action) {
      case 'toggle_input':
        deps.setInputMode(!session.inputMode);
        break;
      case 'toggle_enter':
        deps.setAutoEnter(!session.autoEnter);
        break;
      case 'send_enter':
      case 'send_up':
      case 'send_down':
      case 'send_escape':
        deps.sendKey(action);
        break;
      case 'stop':
        await deps.stopSession();
        await showSessionsMenu(ctx);
        return;
      case 'refresh':
        break;
      default:
        await ctx.reply(`Hành động không hỗ trợ: ${action}`);
        return;
    }

    await showSessionDetails(ctx, sessionId);
  });

  bot.catch((error) => {
    logger.error('Lỗi bot handler', {
      error: error.error instanceof Error ? error.error.message : String(error.error)
    });
  });

  return {
    async start(options) {
      const botInfo = await bot.api.getMe();
      void bot.start();
      // Đợi bot khởi động
      await new Promise(r => setTimeout(r, 800));
      options?.onStart?.(botInfo);
    },
    async stop() {
      bot.stop();
    },
    async pushSessionOutput(chatId, text, options) {
      await bot.api.sendMessage(chatId, text, options);
    },
    // Confirmation prompt đã bị xóa — không dùng nữa
    async showConfirmationPrompt(_session, _text) {
      // Intentionally disabled
    }
  };
}

function normalizeUsername(username: string | null | undefined): string {
  const value = (username || '').trim();
  if (!value) return '';
  return value.startsWith('@') ? value.toLowerCase() : `@${value.toLowerCase()}`;
}
