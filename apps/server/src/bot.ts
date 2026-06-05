import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import {
  addAllowedUser,
  getAdminUserId,
  getConfiguredAdminUsername,
  isUserAllowed,
  normalizeUsername,
  saveSessions,
  saveUserWorkspaceRegistry,
  setActiveClient,
  setClientWorkspaces,
  setUserLanguage
} from './store.js';
import {
  activeClients,
  activeSessions,
  addSessionListener,
  findOnlineClientForUser,
  getOnlineClientsForUser,
  getSessionListeners,
  getWorkspaceStateForUser,
  io,
  markSessionOutputBypass,
  userWorkspaceRegistry
} from './socket.js';
import { SessionInfo, Workspace } from './types.js';
import { logger } from './logger.js';

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || 'dummy_token');

interface WorkspaceDraft {
  clientName: string;
  mode: 'add_name' | 'add_path' | 'edit_name' | 'edit_path';
  workspaceId?: string;
  name?: string;
}

interface UserState {
  activeSessionId?: string;
  inputMode?: boolean;
  autoEnter?: boolean;
  workspaceDraft?: WorkspaceDraft;
}

const userStates: Record<number, UserState> = {};

function getUserState(userId: number): UserState {
  if (!userStates[userId]) userStates[userId] = {};
  return userStates[userId];
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pulseAction(ctx: any, text: string) {
  if (!ctx.callbackQuery) return;
  try {
    await ctx.editMessageText(`⏳ ${text}`);
  } catch {
    // Ignore transient edit failures.
  }
  await wait(350);
}

function getTelegramUsernameFromCtx(ctx: any): string | null {
  return normalizeUsername(ctx.from?.username);
}

function getOwnedState(ctx: any) {
  const username = getTelegramUsernameFromCtx(ctx);
  if (!username) return null;
  return getWorkspaceStateForUser(username);
}

function getClientNamesForUser(username: string): string[] {
  const state = getWorkspaceStateForUser(username);
  const storedNames = Object.keys(state.clients);
  const onlineNames = getOnlineClientsForUser(username).map(client => client.name);
  return Array.from(new Set([...storedNames, ...onlineNames])).sort((left, right) => left.localeCompare(right));
}

function getActiveWorkspaceForUser(username: string): Workspace | undefined {
  const state = getWorkspaceStateForUser(username);
  const clientName = state.activeClientName;
  if (!clientName) return undefined;
  return state.clients[clientName]?.find(workspace => workspace.id === state.activeWorkspaceId);
}

function ensureClientRecord(username: string, clientName: string): Workspace[] {
  const state = getWorkspaceStateForUser(username);
  if (!state.clients[clientName]) state.clients[clientName] = [];
  if (!state.activeClientName) state.activeClientName = clientName;
  return state.clients[clientName];
}

function createWorkspaceId(): string {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

async function showMainMenu(ctx: any) {
  const username = getTelegramUsernameFromCtx(ctx) || 'unknown';
  const state = getOwnedState(ctx);
  const text = [
    'Remote CLI Control',
    '',
    `Telegram user: ${username}`,
    `Active client: ${state?.activeClientName || 'chưa chọn'}`,
    `Active workspace: ${getActiveWorkspaceForUser(username)?.name || 'chưa chọn'}`
  ].join('\n');

  const keyboard = new InlineKeyboard()
    .text('🖥️ Clients', 'clients_list')
    .text('📁 Workspaces', 'workspaces_list')
    .row()
    .text('⚡ Sessions', 'sessions_list')
    .text('📊 Status', 'status_view')
    .row()
    .text('ℹ️ Help', 'help_view');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: keyboard });
  } else {
    await ctx.reply(text, { reply_markup: keyboard });
  }
}

async function showStatus(ctx: any) {
  const username = getTelegramUsernameFromCtx(ctx) || 'unknown';
  const state = getWorkspaceStateForUser(username);
  const onlineClients = getOnlineClientsForUser(username);
  const workspaceCount = state.activeClientName ? (state.clients[state.activeClientName] || []).length : 0;
  const text = [
    'System Status',
    '',
    `Admin: ${getConfiguredAdminUsername() || getAdminUserId() || 'unknown'}`,
    `User: ${username}`,
    `Online clients của bạn: ${onlineClients.length}`,
    `Active client: ${state.activeClientName || 'chưa chọn'}`,
    `Workspace của active client: ${workspaceCount}`,
    `Session đang chạy: ${Object.values(activeSessions).filter(session => session.status === 'running').length}`
  ].join('\n');

  const keyboard = new InlineKeyboard().text('⬅️ Back', 'main_menu');
  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { reply_markup: keyboard });
  } else {
    await ctx.reply(text, { reply_markup: keyboard });
  }
}

async function showClientsMenu(ctx: any) {
  const username = getTelegramUsernameFromCtx(ctx);
  if (!username) {
    await ctx.reply('Telegram username chưa có trên account này.');
    return;
  }

  const state = getWorkspaceStateForUser(username);
  const onlineClients = getOnlineClientsForUser(username);
  const onlineNames = new Set(onlineClients.map(client => client.name));
  const clientNames = getClientNamesForUser(username);
  const lines = ['Clients của bạn', ''];
  const keyboard = new InlineKeyboard();

  if (clientNames.length === 0) {
    lines.push('Chưa có client nào kết nối với TELEGRAM_USERNAME này.');
  } else {
    for (const clientName of clientNames) {
      const isActive = state.activeClientName === clientName;
      const isOnline = onlineNames.has(clientName);
      lines.push(`${isActive ? '👉' : '•'} ${clientName} ${isOnline ? '🟢' : '🔴'}`);
      keyboard.text(`${isActive ? '👉' : '🖥️'} ${clientName}`, `select_client:${encodeURIComponent(clientName)}`).row();
    }
  }

  keyboard.text('⬅️ Back', 'main_menu');
  await ctx.editMessageText(lines.join('\n'), { reply_markup: keyboard });
}

async function showWorkspacesMenu(ctx: any) {
  const username = getTelegramUsernameFromCtx(ctx);
  if (!username) {
    await ctx.reply('Telegram username chưa có trên account này.');
    return;
  }

  const state = getWorkspaceStateForUser(username);
  if (!state.activeClientName) {
    await ctx.editMessageText('Bạn cần chọn active client trước.', {
      reply_markup: new InlineKeyboard().text('🖥️ Chọn client', 'clients_list').row().text('⬅️ Back', 'main_menu')
    });
    return;
  }

  const workspaces = state.clients[state.activeClientName] || [];
  const lines = [`Workspaces của client ${state.activeClientName}`, ''];
  const keyboard = new InlineKeyboard();

  if (workspaces.length === 0) {
    lines.push('Chưa có workspace nào. Bấm Add Workspace để tạo mới.');
  } else {
    for (const workspace of workspaces) {
      const isActive = state.activeWorkspaceId === workspace.id;
      lines.push(`${isActive ? '👉' : '•'} ${workspace.name}`);
      lines.push(`   ${workspace.path}`);
      keyboard.text(`${isActive ? '👉' : '📁'} ${workspace.name}`, `view_workspace:${workspace.id}`).row();
    }
  }

  keyboard
    .text('➕ Add Workspace', `workspace_action:add:${encodeURIComponent(state.activeClientName)}`)
    .row()
    .text('⬅️ Back', 'main_menu');

  await ctx.editMessageText(lines.join('\n'), { reply_markup: keyboard });
}

async function showWorkspaceDetails(ctx: any, workspaceId: string) {
  const username = getTelegramUsernameFromCtx(ctx);
  if (!username) {
    await ctx.reply('Telegram username chưa có trên account này.');
    return;
  }

  const state = getWorkspaceStateForUser(username);
  const clientName = state.activeClientName;
  if (!clientName) {
    await showWorkspacesMenu(ctx);
    return;
  }

  const workspace = (state.clients[clientName] || []).find(item => item.id === workspaceId);
  if (!workspace) {
    await ctx.reply('Workspace không tồn tại hoặc đã bị xoá.');
    return;
  }

  const activeClient = findOnlineClientForUser(username, clientName);
  const text = [
    'Workspace Details',
    '',
    `Tên: ${workspace.name}`,
    `Path: ${workspace.path}`,
    `Client: ${clientName} ${activeClient ? '🟢 online' : '🔴 offline'}`,
    `Active: ${state.activeWorkspaceId === workspace.id ? 'yes' : 'no'}`
  ].join('\n');

  const keyboard = new InlineKeyboard()
    .text('✅ Set Active', `workspace_action:set_active:${workspace.id}`)
    .text('✏️ Edit Name', `workspace_action:edit_name:${workspace.id}`)
    .row()
    .text('🛠️ Edit Path', `workspace_action:edit_path:${workspace.id}`)
    .text('🗑️ Delete', `workspace_action:delete:${workspace.id}`)
    .row()
    .text('Powershell', `start_session:${workspace.id}:powershell`)
    .text('CMD', `start_session:${workspace.id}:cmd`)
    .row()
    .text('Bash', `start_session:${workspace.id}:bash`)
    .text('Codex CLI', `start_session:${workspace.id}:codex`)
    .row()
    .text('Antigravity CLI', `start_session:${workspace.id}:antigravity`)
    .row()
    .text('⬅️ Back', 'workspaces_list');

  await ctx.editMessageText(text, { reply_markup: keyboard });
}

function sendSessionInput(sessionId: string, data: string) {
  const session = activeSessions[sessionId];
  if (!session || session.status !== 'running') {
    logger.warn('Attempted to send input to inactive session', { sessionId });
    return;
  }

  markSessionOutputBypass(sessionId, 'session_input');
  io.to(session.clientId).emit('session:input', { sessionId, data });
}

function sendSessionKey(sessionId: string, key: string) {
  const session = activeSessions[sessionId];
  if (!session || session.status !== 'running') {
    logger.warn('Attempted to send key to inactive session', { sessionId });
    return;
  }

  if (['\r', '\x03', '\x1b[A', '\x1b[B'].includes(key)) {
    markSessionOutputBypass(sessionId, `session_key:${JSON.stringify(key)}`);
  }
  io.to(session.clientId).emit('session:key', { sessionId, key });
}

async function showSessionsMenu(ctx: any) {
  const sessions = Object.values(activeSessions).filter(session => session.status === 'running');
  const lines = ['Running sessions', ''];
  const keyboard = new InlineKeyboard();

  if (sessions.length === 0) {
    lines.push('Không có session nào đang chạy.');
  } else {
    for (const session of sessions) {
      lines.push(`• ${session.sessionId} | ${session.cliPreset} | ${session.cwd}`);
      keyboard.text(`⚡ ${session.cliPreset} ${session.sessionId.slice(-4)}`, `view_session:${session.sessionId}`).row();
    }
  }

  keyboard.text('⬅️ Back', 'main_menu');
  await ctx.editMessageText(lines.join('\n'), { reply_markup: keyboard });
}

async function showSessionDetails(ctx: any, sessionId: string) {
  const session = activeSessions[sessionId];
  if (!session) {
    await ctx.reply('Session không tồn tại.');
    return;
  }

  const userId = ctx.from.id;
  const state = getUserState(userId);
  state.activeSessionId = sessionId;
  const text = [
    'Session Details',
    '',
    `ID: ${session.sessionId}`,
    `Preset: ${session.cliPreset}`,
    `Status: ${session.status}`,
    `CWD: ${session.cwd}`,
    `Input mode: ${state.inputMode ? 'ON' : 'OFF'}`,
    `Auto enter: ${state.autoEnter !== false ? 'ON' : 'OFF'}`
  ].join('\n');

  const keyboard = new InlineKeyboard()
    .text(state.inputMode ? '⌨️ Input OFF' : '⌨️ Input ON', `session_cmd:${sessionId}:toggle_input`)
    .text(state.autoEnter !== false ? '⏎ AutoEnter OFF' : '⏎ AutoEnter ON', `session_cmd:${sessionId}:toggle_enter`)
    .row()
    .text('⬆️ Up', `session_cmd:${sessionId}:send_up`)
    .text('⬇️ Down', `session_cmd:${sessionId}:send_down`)
    .row()
    .text('⏎ Enter', `session_cmd:${sessionId}:send_enter`)
    .text('🛑 Ctrl+C', `session_cmd:${sessionId}:send_ctrlc`)
    .row()
    .text('⏹️ Stop', `session_cmd:${sessionId}:stop`)
    .text('🔄 Refresh', `session_cmd:${sessionId}:refresh`)
    .row()
    .text('⬅️ Back', 'sessions_list');

  addSessionListener(sessionId, userId);
  await ctx.editMessageText(text, { reply_markup: keyboard });
}

async function startWorkspaceDraft(userId: number, draft: WorkspaceDraft, prompt: string, ctx: any) {
  const state = getUserState(userId);
  state.workspaceDraft = draft;
  await ctx.reply(prompt);
}

async function handleWorkspaceDraft(ctx: any): Promise<boolean> {
  const userId = ctx.from.id;
  const username = getTelegramUsernameFromCtx(ctx);
  const state = getUserState(userId);
  const draft = state.workspaceDraft;

  if (!draft || !username) return false;

  const text = ctx.message.text.trim();
  const workspaces = ensureClientRecord(username, draft.clientName);

  if (draft.mode === 'add_name') {
    state.workspaceDraft = {
      ...draft,
      mode: 'add_path',
      name: text
    };
    await ctx.reply('Nhập Windows path cho workspace mới.');
    return true;
  }

  if (draft.mode === 'add_path') {
    const workspace: Workspace = {
      id: createWorkspaceId(),
      name: draft.name || 'Workspace',
      path: text
    };
    workspaces.push(workspace);
    setClientWorkspaces(userWorkspaceRegistry, username, draft.clientName, workspaces);
    const userWorkspaceState = getWorkspaceStateForUser(username);
    userWorkspaceState.activeClientName = draft.clientName;
    userWorkspaceState.activeWorkspaceId = workspace.id;
    saveUserWorkspaceRegistry(userWorkspaceRegistry);
    state.workspaceDraft = undefined;
    await ctx.reply(`Đã thêm workspace "${workspace.name}".`);
    return true;
  }

  const target = workspaces.find(workspace => workspace.id === draft.workspaceId);
  if (!target) {
    state.workspaceDraft = undefined;
    await ctx.reply('Workspace không còn tồn tại.');
    return true;
  }

  if (draft.mode === 'edit_name') {
    target.name = text;
    saveUserWorkspaceRegistry(userWorkspaceRegistry);
    state.workspaceDraft = undefined;
    await ctx.reply('Đã cập nhật tên workspace.');
    return true;
  }

  if (draft.mode === 'edit_path') {
    target.path = text;
    saveUserWorkspaceRegistry(userWorkspaceRegistry);
    state.workspaceDraft = undefined;
    await ctx.reply('Đã cập nhật path workspace.');
    return true;
  }

  return false;
}

bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  const username = ctx.from?.username ? `@${ctx.from.username}` : null;
  if (!userId) return;

  const currentAdmin = getAdminUserId();
  const configuredAdminUsername = getConfiguredAdminUsername();

  if (configuredAdminUsername && normalizeUsername(username) === configuredAdminUsername) {
    if (currentAdmin === null || currentAdmin !== userId) {
      setUserLanguage(userId, 'vi');
    }
    await next();
    return;
  }

  if (currentAdmin === null && configuredAdminUsername) {
    await ctx.reply(`Chỉ admin ${configuredAdminUsername} được phép dùng bot này.`);
    return;
  }

  if (!isUserAllowed(userId, username)) {
    logger.warn('Unauthorized Telegram access attempt', {
      userId,
      username: ctx.from?.username || ''
    });
    await ctx.reply(`Không có quyền truy cập. User ID: ${userId}`);
    return;
  }

  await next();
});

bot.command('start', async (ctx) => {
  await showMainMenu(ctx);
});

bot.command('help', async (ctx) => {
  await ctx.reply([
    'Lệnh hỗ trợ:',
    '/start - mở menu',
    '/send <text> - gửi raw input',
    '/enter - gửi Enter',
    '/kill - dừng session',
    '/status - trạng thái hệ thống'
  ].join('\n'));
});

bot.command('status', async (ctx) => {
  await showStatus(ctx);
});

bot.command('allow', async (ctx) => {
  if (ctx.from!.id !== getAdminUserId()) {
    await ctx.reply('Lệnh này chỉ dành cho admin.');
    return;
  }
  const targetId = parseInt(ctx.match.trim(), 10);
  if (isNaN(targetId)) {
    await ctx.reply('ID không hợp lệ.');
    return;
  }
  addAllowedUser(targetId);
  await ctx.reply(`Đã cấp quyền cho ${targetId}.`);
});

bot.command('send', async (ctx) => {
  const state = getUserState(ctx.from!.id);
  if (!state.activeSessionId) {
    await ctx.reply('Chưa chọn session.');
    return;
  }
  sendSessionInput(state.activeSessionId, ctx.match);
  await ctx.reply('Đã gửi raw input.');
});

bot.command('enter', async (ctx) => {
  const state = getUserState(ctx.from!.id);
  if (!state.activeSessionId) {
    await ctx.reply('Chưa chọn session.');
    return;
  }
  sendSessionKey(state.activeSessionId, '\r');
  await ctx.reply('Đã gửi Enter.');
});

bot.command('kill', async (ctx) => {
  const sessions = Object.values(activeSessions).filter(session => session.status === 'running');
  if (sessions.length === 0) {
    await ctx.reply('Không có session nào đang chạy.');
    return;
  }
  const keyboard = new InlineKeyboard();
  for (const session of sessions) {
    keyboard.text(`⏹️ ${session.cliPreset} ${session.sessionId.slice(-4)}`, `kill_session:${session.sessionId}`).row();
  }
  keyboard.text('⏹️ Stop All', 'kill_all_sessions');
  await ctx.reply('Chọn session cần dừng:', { reply_markup: keyboard });
});

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;

  if (await handleWorkspaceDraft(ctx)) return;

  const userId = ctx.from.id;
  const state = getUserState(userId);
  if (state.inputMode && state.activeSessionId) {
    const payload = state.autoEnter !== false ? `${ctx.message.text}\r` : ctx.message.text;
    sendSessionInput(state.activeSessionId, payload);
    await ctx.reply(`Đã gửi: ${ctx.message.text}`);
    return;
  }

  await ctx.reply('Dùng /start để mở menu.');
});

bot.callbackQuery('main_menu', async (ctx) => {
  await ctx.answerCallbackQuery();
  await pulseAction(ctx, 'Đang mở menu...');
  await showMainMenu(ctx);
});

bot.callbackQuery('status_view', async (ctx) => {
  await ctx.answerCallbackQuery();
  await pulseAction(ctx, 'Đang tải trạng thái...');
  await showStatus(ctx);
});

bot.callbackQuery('help_view', async (ctx) => {
  await ctx.answerCallbackQuery();
  await pulseAction(ctx, 'Đang mở trợ giúp...');
  await ctx.editMessageText('Dùng menu để chọn client/workspace, CRUD workspace, và mở session.', {
    reply_markup: new InlineKeyboard().text('⬅️ Back', 'main_menu')
  });
});

bot.callbackQuery('clients_list', async (ctx) => {
  await ctx.answerCallbackQuery();
  await pulseAction(ctx, 'Đang tải clients...');
  await showClientsMenu(ctx);
});

bot.callbackQuery(/^select_client:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await pulseAction(ctx, 'Đang chọn client...');
  const username = getTelegramUsernameFromCtx(ctx);
  if (!username) return;
  const clientName = decodeURIComponent(ctx.match[1]);
  setActiveClient(userWorkspaceRegistry, username, clientName);
  saveUserWorkspaceRegistry(userWorkspaceRegistry);
  await showWorkspacesMenu(ctx);
});

bot.callbackQuery('workspaces_list', async (ctx) => {
  await ctx.answerCallbackQuery();
  await pulseAction(ctx, 'Đang tải workspace...');
  await showWorkspacesMenu(ctx);
});

bot.callbackQuery(/^view_workspace:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await pulseAction(ctx, 'Đang mở chi tiết workspace...');
  await showWorkspaceDetails(ctx, ctx.match[1]);
});

bot.callbackQuery(/^workspace_action:add:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const clientName = decodeURIComponent(ctx.match[1]);
  await startWorkspaceDraft(ctx.from.id, { clientName, mode: 'add_name' }, 'Nhập tên workspace mới.', ctx);
});

bot.callbackQuery(/^workspace_action:set_active:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await pulseAction(ctx, 'Đang chọn workspace...');
  const username = getTelegramUsernameFromCtx(ctx);
  if (!username) return;
  const state = getWorkspaceStateForUser(username);
  state.activeWorkspaceId = ctx.match[1];
  saveUserWorkspaceRegistry(userWorkspaceRegistry);
  await showWorkspaceDetails(ctx, ctx.match[1]);
});

bot.callbackQuery(/^workspace_action:edit_name:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const username = getTelegramUsernameFromCtx(ctx);
  if (!username) return;
  const clientName = getWorkspaceStateForUser(username).activeClientName;
  if (!clientName) return;
  await startWorkspaceDraft(ctx.from.id, { clientName, workspaceId: ctx.match[1], mode: 'edit_name' }, 'Nhập tên mới cho workspace.', ctx);
});

bot.callbackQuery(/^workspace_action:edit_path:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const username = getTelegramUsernameFromCtx(ctx);
  if (!username) return;
  const clientName = getWorkspaceStateForUser(username).activeClientName;
  if (!clientName) return;
  await startWorkspaceDraft(ctx.from.id, { clientName, workspaceId: ctx.match[1], mode: 'edit_path' }, 'Nhập Windows path mới cho workspace.', ctx);
});

bot.callbackQuery(/^workspace_action:delete:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await pulseAction(ctx, 'Đang xoá workspace...');
  const username = getTelegramUsernameFromCtx(ctx);
  if (!username) return;
  const state = getWorkspaceStateForUser(username);
  const clientName = state.activeClientName;
  if (!clientName) return;

  state.clients[clientName] = (state.clients[clientName] || []).filter(workspace => workspace.id !== ctx.match[1]);
  if (state.activeWorkspaceId === ctx.match[1]) {
    state.activeWorkspaceId = state.clients[clientName][0]?.id;
  }
  saveUserWorkspaceRegistry(userWorkspaceRegistry);
  await showWorkspacesMenu(ctx);
});

bot.callbackQuery(/^start_session:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await pulseAction(ctx, 'Đang khởi chạy session...');
  const username = getTelegramUsernameFromCtx(ctx);
  if (!username) return;
  const workspaceId = ctx.match[1];
  const preset = ctx.match[2];
  const state = getWorkspaceStateForUser(username);
  const clientName = state.activeClientName;
  if (!clientName) {
    await ctx.reply('Chưa có active client.');
    return;
  }
  const workspace = (state.clients[clientName] || []).find(item => item.id === workspaceId);
  if (!workspace) {
    await ctx.reply('Workspace không tồn tại.');
    return;
  }

  const client = findOnlineClientForUser(username, clientName);
  if (!client) {
    await ctx.reply(`Client ${clientName} đang offline.`);
    return;
  }

  const sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const session: SessionInfo = {
    sessionId,
    clientId: client.socketId,
    workspaceId: workspace.id,
    cliPreset: preset,
    cwd: workspace.path,
    createdAt: Date.now(),
    status: 'running'
  };

  activeSessions[sessionId] = session;
  saveSessions(activeSessions);
  addSessionListener(sessionId, ctx.from.id);

  io.to(client.socketId).emit('session:start', {
    sessionId,
    workspaceId: workspace.id,
    workspacePath: workspace.path,
    cliPreset: preset
  });

  const userState = getUserState(ctx.from.id);
  userState.activeSessionId = sessionId;
  userState.inputMode = true;
  userState.autoEnter = true;

  await showSessionDetails(ctx, sessionId);
});

bot.callbackQuery('sessions_list', async (ctx) => {
  await ctx.answerCallbackQuery();
  await pulseAction(ctx, 'Đang tải sessions...');
  await showSessionsMenu(ctx);
});

bot.callbackQuery(/^view_session:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await pulseAction(ctx, 'Đang mở session...');
  await showSessionDetails(ctx, ctx.match[1]);
});

bot.callbackQuery(/^session_cmd:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const sessionId = ctx.match[1];
  const action = ctx.match[2];
  const state = getUserState(ctx.from.id);
  const session = activeSessions[sessionId];
  if (!session) {
    await ctx.reply('Session không tồn tại.');
    return;
  }

  switch (action) {
    case 'toggle_input':
      state.activeSessionId = sessionId;
      state.inputMode = !state.inputMode;
      break;
    case 'toggle_enter':
      state.autoEnter = state.autoEnter === false ? true : false;
      break;
    case 'send_enter':
      sendSessionKey(sessionId, '\r');
      break;
    case 'send_up':
      sendSessionKey(sessionId, '\x1b[A');
      break;
    case 'send_down':
      sendSessionKey(sessionId, '\x1b[B');
      break;
    case 'send_ctrlc':
      sendSessionKey(sessionId, '\x03');
      break;
    case 'stop':
      io.to(session.clientId).emit('session:stop', { sessionId });
      session.status = 'stopped';
      saveSessions(activeSessions);
      break;
    case 'refresh':
      break;
  }

  await pulseAction(ctx, 'Đang cập nhật session...');
  await showSessionDetails(ctx, sessionId);
});

bot.callbackQuery(/^confirm_input:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const sessionId = ctx.match[1];
  const payload = ctx.match[2];

  switch (payload) {
    case 'yes':
      sendSessionInput(sessionId, 'y\r');
      break;
    case 'no':
      sendSessionInput(sessionId, 'n\r');
      break;
    case 'up':
      sendSessionKey(sessionId, '\x1b[A');
      break;
    case 'down':
      sendSessionKey(sessionId, '\x1b[B');
      break;
    case 'enter':
      sendSessionKey(sessionId, '\r');
      break;
    case 'ctrlc':
      sendSessionKey(sessionId, '\x03');
      break;
  }
  await ctx.reply(`Đã gửi action: ${payload}`);
});

export function triggerConfirmationPrompt(sessionId: string, text: string) {
  const listeners = getSessionListeners(sessionId);
  if (listeners.length === 0) return;

  const keyboard = new InlineKeyboard()
    .text('✅ Yes', `confirm_input:${sessionId}:yes`)
    .text('❌ No', `confirm_input:${sessionId}:no`)
    .row()
    .text('⬆️ Up', `confirm_input:${sessionId}:up`)
    .text('⬇️ Down', `confirm_input:${sessionId}:down`)
    .row()
    .text('⏎ Enter', `confirm_input:${sessionId}:enter`)
    .text('🛑 Ctrl+C', `confirm_input:${sessionId}:ctrlc`);

  const promptText = `Confirmation prompt detected in session ${sessionId}\n\n${text.substring(0, 500)}`;
  for (const listener of listeners) {
    void bot.api.sendMessage(listener, promptText, { reply_markup: keyboard });
  }
}

bot.callbackQuery(/^kill_session:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const sessionId = ctx.match[1];
  const session = activeSessions[sessionId];
  if (session?.status === 'running') {
    io.to(session.clientId).emit('session:stop', { sessionId });
    session.status = 'stopped';
    saveSessions(activeSessions);
  }
  await ctx.reply(`Đã dừng session ${sessionId}.`);
});

bot.callbackQuery('kill_all_sessions', async (ctx) => {
  await ctx.answerCallbackQuery();
  for (const session of Object.values(activeSessions).filter(item => item.status === 'running')) {
    io.to(session.clientId).emit('session:stop', { sessionId: session.sessionId });
    session.status = 'stopped';
  }
  saveSessions(activeSessions);
  await ctx.reply('Đã dừng tất cả session.');
});

bot.catch(err => {
  logger.error('Bot update handler error', {
    error: err.error instanceof Error ? err.error.message : String(err.error)
  });
});
