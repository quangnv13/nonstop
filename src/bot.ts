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

export function createBotRuntime(deps: CreateBotRuntimeDependencies): BotRuntime {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required.');
  }

  const allowedUsername = normalizeUsername(
    process.env.ADMIN_USERNAME || process.env.TELEGRAM_USERNAME || ''
  );
  const bot = new Bot(token);
  const chatStates = new Map<number, ChatState>();

  function getChatState(chatId: number): ChatState {
    const existing = chatStates.get(chatId);
    if (existing) {
      return existing;
    }

    const nextState: ChatState = { workspaceDraft: null };
    chatStates.set(chatId, nextState);
    return nextState;
  }

  async function safeAnswerCallback(ctx: BotContext, text?: string): Promise<void> {
    if (!ctx.callbackQuery) {
      return;
    }

    try {
      await ctx.answerCallbackQuery(text ? { text } : undefined);
    } catch {
      return;
    }
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
      } catch {
        // Fallback to reply when callback message is no longer editable.
      }
    }

    await ctx.reply(text, replyMarkup ? { reply_markup: replyMarkup } : undefined);
  }

  function createKeyboard(): InlineKeyboardInstance {
    return new InlineKeyboard();
  }

  function getWorkspaceById(workspaceId: string): Workspace | undefined {
    return deps.getWorkspaces().find((workspace) => workspace.id === workspaceId);
  }

  function buildMainMenuText(): string {
    const activeSession = deps.getActiveSession();
    return [
      'Local Telegram CLI',
      '',
      `Workspaces: ${deps.getWorkspaces().length}`,
      activeSession
        ? `Active session: ${activeSession.preset} | ${activeSession.cwd}`
        : 'Active session: none'
    ].join('\n');
  }

  function buildMainMenuKeyboard(): unknown {
    return createKeyboard()
      .text('📁 Workspaces', 'workspaces_list')
      .text('⚡ Session', 'sessions_list')
      .row()
      .text('ℹ️ Help', 'help_view');
  }

  async function showMainMenu(ctx: BotContext): Promise<void> {
    await renderText(ctx, buildMainMenuText(), buildMainMenuKeyboard());
  }

  async function showHelp(ctx: BotContext): Promise<void> {
    await renderText(
      ctx,
      [
        'Commands',
        '',
        '/start - open main menu',
        '/status - show local runtime status',
        '/help - show this help',
        '',
        'When session input mode is ON, plain text is sent to the active session.'
      ].join('\n'),
      createKeyboard().text('⬅️ Back', 'main_menu')
    );
  }

  async function showStatus(ctx: BotContext): Promise<void> {
    const activeSession = deps.getActiveSession();
    await renderText(
      ctx,
      [
        'Local Runtime Status',
        '',
        `Configured user: ${allowedUsername || 'not restricted'}`,
        `Workspaces: ${deps.getWorkspaces().length}`,
        `Running session: ${activeSession ? 'yes' : 'no'}`,
        activeSession ? `Preset: ${activeSession.preset}` : 'Preset: -',
        activeSession ? `CWD: ${activeSession.cwd}` : 'CWD: -'
      ].join('\n'),
      createKeyboard().text('⬅️ Back', 'main_menu')
    );
  }

  async function showWorkspacesMenu(ctx: BotContext): Promise<void> {
    const workspaces = deps.getWorkspaces();
    const lines = ['Workspaces', ''];
    const keyboard = createKeyboard();

    if (workspaces.length === 0) {
      lines.push('No workspaces saved yet.');
    } else {
      for (const workspace of workspaces) {
        lines.push(`• ${workspace.name}`);
        lines.push(`  ${workspace.path}`);
        keyboard.text(`📁 ${workspace.name}`, `view_workspace:${workspace.id}`).row();
      }
    }

    keyboard.text('➕ Add Workspace', 'workspace_action:add').row().text('⬅️ Back', 'main_menu');
    await renderText(ctx, lines.join('\n'), keyboard);
  }

  function buildWorkspaceDetailsKeyboard(workspace: Workspace): unknown {
    return createKeyboard()
      .text('✏️ Edit Name', `workspace_action:edit_name:${workspace.id}`)
      .text('🛠️ Edit Path', `workspace_action:edit_path:${workspace.id}`)
      .row()
      .text('🗑️ Delete', `workspace_action:delete:${workspace.id}`)
      .row()
      .text('Powershell', `start_session:${workspace.id}:powershell`)
      .text('Bash', `start_session:${workspace.id}:bash`)
      .row()
      .text('Codex', `start_session:${workspace.id}:codex`)
      .text('Antigravity', `start_session:${workspace.id}:antigravity`)
      .row()
      .text('⬅️ Back', 'workspaces_list');
  }

  async function showWorkspaceDetails(ctx: BotContext, workspaceId: string): Promise<void> {
    const workspace = getWorkspaceById(workspaceId);
    if (!workspace) {
      await renderText(
        ctx,
        'Workspace not found.',
        createKeyboard().text('⬅️ Back', 'workspaces_list')
      );
      return;
    }

    await renderText(
      ctx,
      ['Workspace Details', '', `Name: ${workspace.name}`, `Path: ${workspace.path}`].join('\n'),
      buildWorkspaceDetailsKeyboard(workspace)
    );
  }

  async function showSessionsMenu(ctx: BotContext): Promise<void> {
    const activeSession = deps.getActiveSession();
    const keyboard = createKeyboard();
    const lines = ['Session', ''];

    if (!activeSession || activeSession.status !== 'running') {
      lines.push('No active session.');
    } else {
      lines.push(`ID: ${activeSession.sessionId}`);
      lines.push(`Preset: ${activeSession.preset}`);
      lines.push(`CWD: ${activeSession.cwd}`);
      keyboard.text('⚡ Open Controls', `view_session:${activeSession.sessionId}`).row();
    }

    keyboard.text('⬅️ Back', 'main_menu');
    await renderText(ctx, lines.join('\n'), keyboard);
  }

  async function showSessionDetails(ctx: BotContext, sessionId?: string): Promise<void> {
    const session = deps.getActiveSession();
    if (!session || session.status !== 'running' || (sessionId && session.sessionId !== sessionId)) {
      await renderText(ctx, 'Session is not running.', createKeyboard().text('⬅️ Back', 'main_menu'));
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
        'Session Details',
        '',
        `ID: ${session.sessionId}`,
        `Preset: ${session.preset}`,
        `Status: ${session.status}`,
        `CWD: ${session.cwd}`,
        `Input mode: ${session.inputMode ? 'ON' : 'OFF'}`,
        `Auto enter: ${session.autoEnter ? 'ON' : 'OFF'}`
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
    if (!chatId) {
      return;
    }

    getChatState(chatId).workspaceDraft = workspaceDraft;
    await ctx.reply(prompt);
  }

  async function handleWorkspaceDraft(ctx: BotContext): Promise<boolean> {
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text?.trim();
    if (!chatId || !text) {
      return false;
    }

    const state = getChatState(chatId);
    const draft = state.workspaceDraft;
    if (!draft) {
      return false;
    }

    const workspaces = [...deps.getWorkspaces()];

    if (draft.mode === 'add_name') {
      state.workspaceDraft = { mode: 'add_path', name: text };
      await ctx.reply('Enter the workspace path.');
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
      await ctx.reply(`Added workspace "${workspace.name}".`);
      await showWorkspaceDetails(ctx, workspace.id);
      return true;
    }

    const targetIndex = workspaces.findIndex((workspace) => workspace.id === draft.workspaceId);
    if (targetIndex === -1) {
      state.workspaceDraft = null;
      await ctx.reply('Workspace no longer exists.');
      return true;
    }

    if (draft.mode === 'edit_name') {
      workspaces[targetIndex] = { ...workspaces[targetIndex], name: text };
      deps.saveWorkspaces(workspaces);
      state.workspaceDraft = null;
      await ctx.reply('Workspace name updated.');
      await showWorkspaceDetails(ctx, workspaces[targetIndex].id);
      return true;
    }

    if (draft.mode === 'edit_path') {
      workspaces[targetIndex] = { ...workspaces[targetIndex], path: text };
      deps.saveWorkspaces(workspaces);
      state.workspaceDraft = null;
      await ctx.reply('Workspace path updated.');
      await showWorkspaceDetails(ctx, workspaces[targetIndex].id);
      return true;
    }

    return false;
  }

  bot.use(async (ctx, next) => {
    const username = normalizeUsername(ctx.from?.username);
    if (allowedUsername && username !== allowedUsername) {
      await ctx.reply('This bot is restricted to the configured local Telegram account.');
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

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) {
      return;
    }

    if (await handleWorkspaceDraft(ctx)) {
      return;
    }

    const session = deps.getActiveSession();
    if (session?.status === 'running' && session.inputMode) {
      const payload = session.autoEnter ? `${ctx.message.text}\r` : ctx.message.text;
      deps.sendInput(payload);
      await ctx.reply(`Sent to session: ${ctx.message.text}`);
      return;
    }

    await ctx.reply('Use /start to open the menu.');
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
    await beginWorkspaceDraft(ctx, { mode: 'add_name' }, 'Enter a name for the new workspace.');
  });

  bot.callbackQuery(/^workspace_action:edit_name:(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    await beginWorkspaceDraft(
      ctx,
      { mode: 'edit_name', workspaceId: ctx.match[1] },
      'Enter the new workspace name.'
    );
  });

  bot.callbackQuery(/^workspace_action:edit_path:(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    await beginWorkspaceDraft(
      ctx,
      { mode: 'edit_path', workspaceId: ctx.match[1] },
      'Enter the new workspace path.'
    );
  });

  bot.callbackQuery(/^workspace_action:delete:(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    const workspaces = deps.getWorkspaces().filter((workspace) => workspace.id !== ctx.match[1]);
    deps.saveWorkspaces(workspaces);
    await showWorkspacesMenu(ctx);
  });

  bot.callbackQuery(/^start_session:(.+):(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    const workspaceId = ctx.match[1];
    const preset = ctx.match[2] as SessionPreset;

    if (!SUPPORTED_PRESETS.includes(preset)) {
      await ctx.reply(`Unsupported preset: ${preset}`);
      return;
    }

    if (deps.getActiveSession()?.status === 'running') {
      await ctx.reply('Đã có một session đang chạy. Hãy dừng session hiện tại trước.');
      return;
    }

    const workspace = getWorkspaceById(workspaceId);
    if (!workspace) {
      await ctx.reply('Workspace not found.');
      return;
    }

    try {
      await deps.startSession(ctx.chat.id, workspace.id, preset);
      await showSessionDetails(ctx);
    } catch (error) {
      logger.error('Failed to start session', {
        workspaceId,
        preset,
        error: error instanceof Error ? error.message : String(error)
      });
      await ctx.reply(`Lỗi khi khởi chạy session / Error starting session: ${error instanceof Error ? error.message : String(error)}`);
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
      await ctx.reply('Session is not running.');
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
        await ctx.reply(`Unsupported session action: ${action}`);
        return;
    }

    await showSessionDetails(ctx, sessionId);
  });

  bot.callbackQuery(/^confirm_input:(.+):(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    const session = deps.getActiveSession();
    const sessionId = ctx.match[1];
    const payload = ctx.match[2];

    if (!session || session.sessionId !== sessionId || session.status !== 'running') {
      await ctx.reply('Session is not running.');
      return;
    }

    switch (payload) {
      case 'yes':
        deps.sendInput('y\r');
        break;
      case 'no':
        deps.sendInput('n\r');
        break;
      case 'up':
        deps.sendKey('send_up');
        break;
      case 'down':
        deps.sendKey('send_down');
        break;
      case 'enter':
        deps.sendKey('send_enter');
        break;
      case 'interrupt':
        deps.sendKey('send_escape');
        break;
      default:
        await ctx.reply(`Unsupported confirmation action: ${payload}`);
        return;
    }

    await ctx.reply(`Sent action: ${payload}`);
  });

  bot.catch((error) => {
    logger.error('Bot update handler error', {
      error: error.error instanceof Error ? error.error.message : String(error.error)
    });
  });

  return {
    async start(options) {
      const botInfo = await bot.api.getMe();
      await bot.start();
      options?.onStart?.(botInfo);
    },
    async stop() {
      bot.stop();
    },
    async pushSessionOutput(chatId, text, options) {
      await bot.api.sendMessage(chatId, text, options);
    },
    async showConfirmationPrompt(session, text) {
      const keyboard = createKeyboard()
        .text('✅ Yes', `confirm_input:${session.sessionId}:yes`)
        .text('❌ No', `confirm_input:${session.sessionId}:no`)
        .row()
        .text('⬆️ Up', `confirm_input:${session.sessionId}:up`)
        .text('⬇️ Down', `confirm_input:${session.sessionId}:down`)
        .row()
        .text('⏎ Enter', `confirm_input:${session.sessionId}:enter`)
        .text('⎋ Interrupt', `confirm_input:${session.sessionId}:interrupt`);

      await bot.api.sendMessage(
        session.listenerChatId,
        `Confirmation prompt detected in session ${session.sessionId}\n\n${text.slice(0, 500)}`,
        { reply_markup: keyboard }
      );
    }
  };
}

function normalizeUsername(username: string | null | undefined): string {
  const value = (username || '').trim();
  if (!value) {
    return '';
  }

  return value.startsWith('@') ? value.toLowerCase() : `@${value.toLowerCase()}`;
}
