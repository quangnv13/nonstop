import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger.js';
import { buildSessionActionMarkup } from './session-controls.js';
import { SessionOutputMessage } from './session-output.js';
import { ActiveSessionState, SessionPreset, Workspace, WorkspaceDraft } from './types.js';
import { createWorkspaceId } from './store.js';
import { AppConfig, StartupMode } from './config.js';
import { createTranslator } from './i18n.js';

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
  getConfig: () => AppConfig;
  saveConfig: (config: AppConfig) => Promise<void>;
  getWorkspaces: () => Workspace[];
  saveWorkspaces: (workspaces: Workspace[]) => void;
  getActiveSession: () => ActiveSessionState | null;
  startSession: (chatId: number, workspaceId: string, preset: SessionPreset) => Promise<void>;
  stopSession: () => Promise<void>;
  sendInput: (data: string) => void;
  sendKey: (key: string) => void;
  setInputMode: (inputMode: boolean) => void;
  setAutoEnter: (autoEnter: boolean) => void;
  flushSessionOutput: () => Promise<void>;
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
  configFieldDraft: { field: keyof AppConfig } | null;
  pendingDangerousCommand?: string;
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

  const bot = new Bot(token);
  const chatStates = new Map<number, ChatState>();
  const getT = () => createTranslator(deps.getConfig().language);

  function getChatState(chatId: number): ChatState {
    const existing = chatStates.get(chatId);
    if (existing) return existing;
    const nextState: ChatState = { workspaceDraft: null, configFieldDraft: null };
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
    const t = getT();
    return [
      '🖥  nonstop client',
      '',
      `📁 Workspaces: ${deps.getWorkspaces().length}`,
      activeSession
        ? t('bot.menu.activeSessionRunning', { preset: activeSession.preset, cwd: activeSession.cwd })
        : t('bot.menu.activeSessionNone')
    ].join('\n');
  }

  function buildMainMenuKeyboard(): unknown {
    const t = getT();
    return createKeyboard()
      .text(t('bot.menu.workspaces'), 'workspaces_list')
      .text(t('bot.menu.session'), 'sessions_list')
      .row()
      .text(t('bot.menu.config'), 'config_menu')
      .text(t('bot.menu.help'), 'help_view');
  }

  async function showMainMenu(ctx: BotContext): Promise<void> {
    await renderText(ctx, buildMainMenuText(), buildMainMenuKeyboard());
  }

  async function showHelp(ctx: BotContext): Promise<void> {
    const t = getT();
    await renderText(
      ctx,
      [
        t('bot.help.title'),
        '',
        t('bot.help.start'),
        t('bot.help.status'),
        t('bot.help.help'),
        t('bot.help.config'),
        t('bot.help.send'),
        '',
        t('bot.help.inputModeNotice')
      ].join('\n'),
      createKeyboard().text(t('bot.general.back'), 'main_menu')
    );
  }

  async function showStatus(ctx: BotContext): Promise<void> {
    const activeSession = deps.getActiveSession();
    const currentAllowedUsername = normalizeUsername(
      process.env.ADMIN_USERNAME || process.env.TELEGRAM_USERNAME || ''
    );
    const t = getT();
    await renderText(
      ctx,
      [
        t('bot.status.title'),
        '',
        `${t('bot.status.user')}: ${currentAllowedUsername || t('bot.status.unlimited')}`,
        `${t('bot.status.workspaces')}: ${deps.getWorkspaces().length}`,
        `${t('bot.status.session')}: ${activeSession ? t('bot.status.running') : t('bot.status.none')}`,
        activeSession ? `${t('bot.status.preset')}: ${activeSession.preset}` : '',
        activeSession ? `${t('bot.status.directory')}: ${activeSession.cwd}` : ''
      ].filter(Boolean).join('\n'),
      createKeyboard().text(t('bot.general.back'), 'main_menu')
    );
  }

  async function showConfigMenu(ctx: BotContext): Promise<void> {
    const config = deps.getConfig();
    const t = getT();
    const notConfigured = t('bot.config.notConfigured');
    const lines = [
      t('bot.config.title'),
      '',
      `• Token: ${config.telegramBotToken ? '••••' + config.telegramBotToken.slice(-4) : notConfigured}`,
      `• Admin Username: ${config.adminUsername || notConfigured}`,
      `• Client Name: ${config.clientName || notConfigured}`,
      `• Telegram Username: ${config.telegramUsername || notConfigured}`,
      `• ${t('bot.config.languageLabel')}: ${config.language} (vi/en)`,
      `• ${t('bot.config.startupLabel')}: ${config.startupMode} (disabled/background/open-ui)`,
      `• Output Interval: ${config.outputInterval} ms`,
      `• Max Output Lines: ${config.maxOutputLines}`,
      `• Max Render Lines: ${config.maxRenderLines}`,
      `• Codex Cmd: ${config.codexCmd}`,
      `• Codex Args: ${config.codexArgs}`,
      `• Antigravity Cmd: ${config.antigravityCmd}`,
      `• Antigravity Args: ${config.antigravityArgs}`,
      `• Dangerous Cmds: ${config.dangerousCommandConfirm || notConfigured}`
    ];

    const keyboard = createKeyboard()
      .text('Token', 'config_edit:telegramBotToken')
      .text('Admin', 'config_edit:adminUsername')
      .row()
      .text('Client Name', 'config_edit:clientName')
      .text('Telegram User', 'config_edit:telegramUsername')
      .row()
      .text(`${t('bot.config.languageLabel')} (${config.language === 'vi' ? '🇻🇳 vi' : '🇬🇧 en'})`, 'config_edit:language')
      .text(`${t('bot.config.startupLabel')} (${config.startupMode})`, 'config_edit:startupMode')
      .row()
      .text('Interval', 'config_edit:outputInterval')
      .text('Max Output Lines', 'config_edit:maxOutputLines')
      .row()
      .text('Max Render Lines', 'config_edit:maxRenderLines')
      .text('Codex Cmd', 'config_edit:codexCmd')
      .row()
      .text('Codex Args', 'config_edit:codexArgs')
      .text('Antigravity Cmd', 'config_edit:antigravityCmd')
      .row()
      .text('Antigravity Args', 'config_edit:antigravityArgs')
      .row()
      .text('Dangerous Cmds', 'config_edit:dangerousCommandConfirm')
      .row()
      .text(t('bot.general.back'), 'main_menu');

    await renderText(ctx, lines.join('\n'), keyboard);
  }

  async function showWorkspacesMenu(ctx: BotContext): Promise<void> {
    const workspaces = deps.getWorkspaces();
    const t = getT();
    const lines = [t('bot.workspaces.title'), ''];
    const keyboard = createKeyboard();

    if (workspaces.length === 0) {
      lines.push(t('bot.workspaces.empty'));
    } else {
      for (const ws of workspaces) {
        lines.push(`• ${ws.name}`);
        lines.push(`  ${ws.path}`);
        keyboard.text(`📁 ${ws.name}`, `view_workspace:${ws.id}`).row();
      }
    }

    keyboard.text(t('bot.workspaces.add'), 'workspace_action:add').row().text(t('bot.general.back'), 'main_menu');
    await renderText(ctx, lines.join('\n'), keyboard);
  }

  function buildWorkspaceDetailsKeyboard(workspace: Workspace): unknown {
    const t = getT();
    return createKeyboard()
      .text(t('bot.workspaces.editName'), `workspace_action:edit_name:${workspace.id}`)
      .text(t('bot.workspaces.editPath'), `workspace_action:edit_path:${workspace.id}`)
      .row()
      .text(t('bot.workspaces.delete'), `workspace_action:delete:${workspace.id}`)
      .row()
      .text('Powershell', `start_session:${workspace.id}:powershell`)
      .text('Bash', `start_session:${workspace.id}:bash`)
      .row()
      .text('Codex', `start_session:${workspace.id}:codex`)
      .text('Antigravity', `start_session:${workspace.id}:antigravity`)
      .row()
      .text(t('bot.general.back'), 'workspaces_list');
  }

  async function showWorkspaceDetails(ctx: BotContext, workspaceId: string): Promise<void> {
    const workspace = getWorkspaceById(workspaceId);
    const t = getT();
    if (!workspace) {
      await renderText(ctx, t('bot.workspaces.notFound'), createKeyboard().text(t('bot.general.back'), 'workspaces_list'));
      return;
    }
    await renderText(
      ctx,
      [t('bot.workspaces.detailsTitle'), '', `${t('bot.workspaces.detailsName')}: ${workspace.name}`, `${t('bot.workspaces.detailsPath')}: ${workspace.path}`].join('\n'),
      buildWorkspaceDetailsKeyboard(workspace)
    );
  }

  async function showSessionsMenu(ctx: BotContext): Promise<void> {
    const activeSession = deps.getActiveSession();
    const keyboard = createKeyboard();
    const t = getT();
    const lines = [t('bot.sessions.title'), ''];

    if (!activeSession || activeSession.status !== 'running') {
      lines.push(t('bot.sessions.empty'));
    } else {
      lines.push(`ID: ${activeSession.sessionId}`);
      lines.push(`Preset: ${activeSession.preset}`);
      lines.push(`${t('bot.sessionDetails.directory')}: ${activeSession.cwd}`);
      keyboard.text(t('bot.sessions.control'), `view_session:${activeSession.sessionId}`).row();
    }

    keyboard.text(t('bot.general.back'), 'main_menu');
    await renderText(ctx, lines.join('\n'), keyboard);
  }

  async function showSessionDetails(ctx: BotContext, sessionId?: string): Promise<void> {
    const session = deps.getActiveSession();
    const t = getT();
    if (!session || session.status !== 'running' || (sessionId && session.sessionId !== sessionId)) {
      await renderText(ctx, t('bot.sessionDetails.notRunning'), createKeyboard().text(t('bot.general.back'), 'main_menu'));
      return;
    }

    const keyboard = buildSessionActionMarkup({
      sessionId: session.sessionId,
      inputMode: session.inputMode,
      autoEnter: session.autoEnter,
      includeBackButton: true,
      language: deps.getConfig().language
    });

    const onText = t('bot.sessionDetails.on');
    const offText = t('bot.sessionDetails.off');

    await renderText(
      ctx,
      [
        t('bot.sessionDetails.title'),
        '',
        `ID: ${session.sessionId}`,
        `${t('bot.sessionDetails.preset')}: ${session.preset}`,
        `${t('bot.sessionDetails.status')}: ${session.status}`,
        `${t('bot.sessionDetails.directory')}: ${session.cwd}`,
        `${t('bot.sessionDetails.inputMode')}: ${session.inputMode ? onText : offText}`,
        `${t('bot.sessionDetails.autoEnter')}: ${session.autoEnter ? onText : offText}`
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
    const t = getT();

    if (draft.mode === 'add_name') {
      state.workspaceDraft = { mode: 'add_path', name: text };
      await ctx.reply(t('bot.workspaces.addPathPrompt'));
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
      await ctx.reply(t('bot.workspaces.added', { name: workspace.name }));
      await showWorkspaceDetails(ctx, workspace.id);
      return true;
    }

    const targetIndex = workspaces.findIndex((w) => w.id === draft.workspaceId);
    if (targetIndex === -1) {
      state.workspaceDraft = null;
      await ctx.reply(t('bot.workspaces.notExists'));
      return true;
    }

    if (draft.mode === 'edit_name') {
      workspaces[targetIndex] = { ...workspaces[targetIndex], name: text };
      deps.saveWorkspaces(workspaces);
      state.workspaceDraft = null;
      await ctx.reply(t('bot.workspaces.updatedName'));
      await showWorkspaceDetails(ctx, workspaces[targetIndex].id);
      return true;
    }

    if (draft.mode === 'edit_path') {
      workspaces[targetIndex] = { ...workspaces[targetIndex], path: text };
      deps.saveWorkspaces(workspaces);
      state.workspaceDraft = null;
      await ctx.reply(t('bot.workspaces.updatedPath'));
      await showWorkspaceDetails(ctx, workspaces[targetIndex].id);
      return true;
    }

    return false;
  }

  async function handleConfigDraft(ctx: BotContext): Promise<boolean> {
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text?.trim();
    if (!chatId || text === undefined) return false;

    const state = getChatState(chatId);
    const draft = state.configFieldDraft;
    if (!draft) return false;

    const field = draft.field;
    const config = deps.getConfig();
    const isNumeric = ['outputInterval', 'maxOutputLines', 'maxRenderLines'].includes(field);
    const t = getT();

    if (isNumeric) {
      const parsed = parseInt(text, 10);
      if (isNaN(parsed) || !Number.isFinite(parsed)) {
        await ctx.reply(t('bot.config.invalidValue', { field }));
        return true;
      }
      const nextConfig = { ...config, [field]: parsed };
      await deps.saveConfig(nextConfig);
    } else {
      let value = text;
      if (field === 'adminUsername' || field === 'telegramUsername') {
        value = text.startsWith('@') ? text : `@${text}`;
      }
      const nextConfig = { ...config, [field]: value };
      await deps.saveConfig(nextConfig);
    }

    state.configFieldDraft = null;
    await ctx.reply(t('bot.config.updated', { field }));
    await showConfigMenu(ctx);
    return true;
  }

  // Middleware: kiểm tra quyền & lưu chat ID
  bot.use(async (ctx, next) => {
    trackChatId(ctx);
    const username = normalizeUsername(ctx.from?.username);
    const currentAllowedUsername = normalizeUsername(
      process.env.ADMIN_USERNAME || process.env.TELEGRAM_USERNAME || ''
    );
    if (currentAllowedUsername && username !== currentAllowedUsername) {
      const t = getT();
      await ctx.reply(t('bot.general.authError'));
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

  bot.command('config', async (ctx) => {
    await showConfigMenu(ctx);
  });

  // /send <lệnh> — gửi raw text tới session đang chạy
  bot.command('send', async (ctx) => {
    const rawText = ctx.message?.text ?? '';
    const t = getT();
    // Bỏ phần "/send " ở đầu
    const payload = rawText.replace(/^\/send\s*/i, '').trim();
    if (!payload) {
      await ctx.reply(t('bot.general.sendUsage'));
      return;
    }
    const session = deps.getActiveSession();
    if (!session || session.status !== 'running') {
      await ctx.reply(t('bot.general.noActiveSession'));
      return;
    }
    const finalInput = session.autoEnter ? `${payload}\r` : payload;
    const config = deps.getConfig();
    const dangerousCmdsList = (config.dangerousCommandConfirm || '')
      .split(',')
      .map(c => c.trim().toLowerCase())
      .filter(Boolean);
    const isDangerous = dangerousCmdsList.some(dangerous => payload.toLowerCase().includes(dangerous));

    if (isDangerous) {
      const chatId = ctx.chat?.id;
      if (chatId) {
        getChatState(chatId).pendingDangerousCommand = finalInput;
        const keyboard = createKeyboard()
          .text(t('bot.general.confirmYes'), 'confirm_dangerous_yes')
          .text(t('bot.general.confirmNo'), 'confirm_dangerous_no');
        await ctx.reply(t('bot.general.dangerousConfirm', { command: payload }), { reply_markup: keyboard });
        return;
      }
    }

    deps.sendInput(finalInput);
    await ctx.reply(t('bot.general.sentCommand'));
  });

  bot.on('message:text', async (ctx) => {
    const text: string = ctx.message.text;
    const t = getT();

    // Bỏ qua các lệnh bắt đầu bằng /
    if (text.startsWith('/')) return;

    if (await handleWorkspaceDraft(ctx)) return;
    if (await handleConfigDraft(ctx)) return;

    const session = deps.getActiveSession();
    if (session?.status === 'running' && session.inputMode) {
      const payload = session.autoEnter ? `${text}\r` : text;
      
      const config = deps.getConfig();
      const dangerousCmdsList = (config.dangerousCommandConfirm || '')
        .split(',')
        .map(c => c.trim().toLowerCase())
        .filter(Boolean);
      const isDangerous = dangerousCmdsList.some(dangerous => text.toLowerCase().includes(dangerous));

      if (isDangerous) {
        const chatId = ctx.chat?.id;
        if (chatId) {
          getChatState(chatId).pendingDangerousCommand = payload;
          const keyboard = createKeyboard()
            .text(t('bot.general.confirmYes'), 'confirm_dangerous_yes')
            .text(t('bot.general.confirmNo'), 'confirm_dangerous_no');
          await ctx.reply(t('bot.general.dangerousConfirm', { command: text }), { reply_markup: keyboard });
          return;
        }
      }

      deps.sendInput(payload);
      await ctx.reply(t('bot.general.sentCommand'));
      return;
    }

    await ctx.reply(t('bot.general.defaultMessage'));
  });

  bot.callbackQuery('confirm_dangerous_yes', async (ctx) => {
    await safeAnswerCallback(ctx);
    const chatId = ctx.chat?.id;
    const t = getT();
    if (!chatId) return;

    const state = getChatState(chatId);
    const command = state.pendingDangerousCommand;
    state.pendingDangerousCommand = undefined;

    if (!command) {
      await ctx.reply(t('bot.general.defaultMessage'));
      return;
    }

    const session = deps.getActiveSession();
    if (!session || session.status !== 'running') {
      await ctx.reply(t('bot.general.noActiveSession'));
      return;
    }

    deps.sendInput(command);
    try {
      await ctx.editMessageText(t('bot.general.sentCommand'));
    } catch {
      await ctx.reply(t('bot.general.sentCommand'));
    }
  });

  bot.callbackQuery('confirm_dangerous_no', async (ctx) => {
    await safeAnswerCallback(ctx);
    const chatId = ctx.chat?.id;
    const t = getT();
    if (!chatId) return;

    const state = getChatState(chatId);
    state.pendingDangerousCommand = undefined;

    try {
      await ctx.editMessageText(t('bot.general.confirmCancelled'));
    } catch {
      await ctx.reply(t('bot.general.confirmCancelled'));
    }
  });

  bot.callbackQuery('main_menu', async (ctx) => {
    await safeAnswerCallback(ctx);
    await showMainMenu(ctx);
  });

  bot.callbackQuery('config_menu', async (ctx) => {
    await safeAnswerCallback(ctx);
    await showConfigMenu(ctx);
  });

  bot.callbackQuery(/^config_edit:(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    const field = ctx.match[1] as keyof AppConfig;

    if (field === 'language') {
      const config = deps.getConfig();
      const nextLang = config.language === 'vi' ? 'en' : 'vi';
      await deps.saveConfig({ ...config, language: nextLang });
      await showConfigMenu(ctx);
      return;
    }

    if (field === 'startupMode') {
      const config = deps.getConfig();
      let nextMode: StartupMode;
      if (config.startupMode === 'disabled') {
        nextMode = 'background';
      } else if (config.startupMode === 'background') {
        nextMode = 'open-ui';
      } else {
        nextMode = 'disabled';
      }
      await deps.saveConfig({ ...config, startupMode: nextMode });
      await showConfigMenu(ctx);
      return;
    }

    const chatId = ctx.chat?.id;
    if (!chatId) return;
    getChatState(chatId).configFieldDraft = { field };
    const t = getT();
    await ctx.reply(t('bot.config.enterValue', { field }));
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
    const t = getT();
    await beginWorkspaceDraft(ctx, { mode: 'add_name' }, t('bot.workspaces.addNamePrompt'));
  });

  bot.callbackQuery(/^workspace_action:edit_name:(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    const t = getT();
    await beginWorkspaceDraft(
      ctx,
      { mode: 'edit_name', workspaceId: ctx.match[1] },
      t('bot.workspaces.addNamePrompt')
    );
  });

  bot.callbackQuery(/^workspace_action:edit_path:(.+)$/, async (ctx) => {
    await safeAnswerCallback(ctx);
    const t = getT();
    await beginWorkspaceDraft(
      ctx,
      { mode: 'edit_path', workspaceId: ctx.match[1] },
      t('bot.workspaces.addPathPrompt')
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
    const t = getT();

    if (!SUPPORTED_PRESETS.includes(preset)) {
      await ctx.reply(t('bot.sessionControls.presetNotSupported', { preset }));
      return;
    }

    if (deps.getActiveSession()?.status === 'running') {
      await ctx.reply(t('bot.sessionControls.runningSessionExists'));
      return;
    }

    const workspace = getWorkspaceById(workspaceId);
    if (!workspace) {
      await ctx.reply(t('bot.workspaces.notFound'));
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
      await ctx.reply(t('bot.sessionControls.startError', { error: error instanceof Error ? error.message : String(error) }));
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
    const t = getT();

    if (!session || session.sessionId !== sessionId || session.status !== 'running') {
      await ctx.reply(t('bot.sessionControls.notRunning'));
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
        await deps.flushSessionOutput();
        break;
      default:
        await ctx.reply(t('bot.sessionControls.unsupportedAction', { action }));
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
      try {
        await bot.api.sendMessage(chatId, text, options);
      } catch (error) {
        logger.error('Failed to send Telegram message', {
          chatId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
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
