import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import boxen from 'boxen';
import {
  AppConfig,
  AppLanguage,
  StartupMode,
  ensureEnvExampleFile,
  getMissingConfigFields,
  loadConfigFromDisk,
  saveConfigToDisk
} from './config.js';
import { createTranslator } from './i18n.js';
import { getRuntimeStatus, startBackgroundRuntime, stopBackgroundRuntime, getEntryScriptPath } from './runtime-manager.js';
import { applyStartupMode } from './startup.js';
import { loadWorkspaces, saveWorkspaces, createWorkspaceId } from './store.js';
import { RuntimeStateSnapshot } from './runtime-state.js';
import { Workspace } from './types.js';

interface Option<T> {
  label: string;
  value: T;
}

function clearScreen(): void {
  // \u001b[2J clears visible area, \u001b[3J clears scrollback buffer, \u001b[H moves cursor home
  output.write('\u001b[2J\u001b[3J\u001b[H');
}

function titleBox(title: string): string {
  return boxen(chalk.bold.cyan(title), {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    borderStyle: 'round',
    borderColor: 'cyan',
    textAlignment: 'center'
  });
}

function infoRow(label: string, value: string, valueColor: (s: string) => string = (s) => s): string {
  return `  ${chalk.gray(label.padEnd(12))} ${valueColor(value)}`;
}

function separator(): string {
  return chalk.gray('  ' + '─'.repeat(44));
}

async function askQuestion(query: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    return await rl.question(query);
  } finally {
    rl.close();
    process.stdin.resume();
  }
}

async function pause(): Promise<void> {
  await askQuestion(`\n${chalk.gray('Nhấn Enter để tiếp tục...')}`);
}

async function askWithDefault(
  label: string,
  currentValue: string
): Promise<string> {
  const prompt = `${chalk.bold(label)}${currentValue ? chalk.gray(` [${currentValue}]`) : ''}: `;
  const answer = await askQuestion(prompt);
  return answer.trim() || currentValue;
}

async function runSelectionMenu<T>(
  headerRenderer: () => void,
  options: Option<T>[],
  initialIndex: number = 0
): Promise<T> {
  let selectedIndex = Math.min(initialIndex, options.length - 1);

  return new Promise<T>((resolve, reject) => {
    const isTTY = process.stdin.isTTY;
    const wasRaw = process.stdin.isRaw;

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      process.stdout.write('\u001b[?25h');
      if (isTTY) {
        try { process.stdin.setRawMode(wasRaw); } catch { /* ignore */ }
      }
    };

    function render() {
      clearScreen();
      headerRenderer();
      console.log('');
      options.forEach((opt, idx) => {
        if (idx === selectedIndex) {
          console.log(`  ${chalk.cyan('❯')} ${chalk.bold.cyan(opt.label)}`);
        } else {
          console.log(`    ${chalk.gray(opt.label)}`);
        }
      });
      console.log('');
      console.log(chalk.gray('  ↑↓ di chuyển   Enter xác nhận'));
    }

    try {
      readline.emitKeypressEvents(process.stdin);
      if (isTTY) process.stdin.setRawMode(true);
      process.stdout.write('\u001b[?25l');
    } catch (err) {
      cleanup();
      reject(err);
      return;
    }

    render();

    function onKeypress(_str: string, key: { ctrl?: boolean; name?: string }) {
      if (key?.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }
      if (key?.name === 'up') {
        selectedIndex = (selectedIndex - 1 + options.length) % options.length;
        render();
      } else if (key?.name === 'down') {
        selectedIndex = (selectedIndex + 1) % options.length;
        render();
      } else if (key?.name === 'return' || key?.name === 'enter') {
        cleanup();
        resolve(options[selectedIndex].value);
      }
    }

    process.stdin.on('keypress', onKeypress);
  });
}

function renderDashboardHeader(config: AppConfig, snapshot: RuntimeStateSnapshot | null): void {
  const t = createTranslator(config.language);
  const isRunning = !!snapshot;
  const runtimeLabel = isRunning ? chalk.bold.green(t('dashboard.running')) : chalk.bold.red(t('dashboard.stopped'));
  const session = snapshot?.activeSession;

  console.log(titleBox('nonstop client'));
  console.log('');
  console.log(infoRow('Trạng thái', isRunning ? `${runtimeLabel}  ${chalk.gray(`(${snapshot!.mode})`)}` : runtimeLabel));
  console.log(infoRow('Client', config.clientName, chalk.white));
  console.log(infoRow('Admin', config.adminUsername || '-', chalk.white));
  console.log(infoRow('Ngôn ngữ', config.language === 'vi' ? 'Tiếng Việt' : 'English', chalk.white));
  console.log(infoRow('Khởi động', config.startupMode, chalk.white));
  if (snapshot?.startedAt) {
    const dt = new Date(snapshot.startedAt);
    console.log(infoRow('Bật lúc', dt.toLocaleTimeString('vi-VN'), chalk.white));
  }
  if (session) {
    console.log(separator());
    console.log(infoRow('Session', `${session.preset}`, chalk.yellow));
    const shortCwd = session.cwd.length > 40 ? '...' + session.cwd.slice(-38) : session.cwd;
    console.log(infoRow('Thư mục', shortCwd, chalk.gray));
  }
  if (snapshot?.lastError) {
    console.log(separator());
    console.log(infoRow('Lỗi', snapshot.lastError, chalk.red));
  }
  console.log('');
  console.log(chalk.bold.blue('  ' + t('dashboard.menu')));
}

export async function launchControlCenter(): Promise<void> {
  ensureEnvExampleFile();
  let config = loadConfigFromDisk();

  const isTTY = process.stdin.isTTY;
  const wasRaw = process.stdin.isRaw;

  try {
    if (getMissingConfigFields(config).length > 0) {
      config = await runSetupWizard(config);
    }

    let lastSelection = 0;
    while (true) {
      config = loadConfigFromDisk();
      const t = createTranslator(config.language);
      const isRunning = getRuntimeStatus().running;
      const isVi = config.language === 'vi';
      const toggleLabel = isRunning
        ? (isVi ? 'Tắt runtime nền' : 'Dừng background runtime')
        : (isVi ? 'Bật runtime nền' : 'Chạy background runtime');

      const options = [
        { label: toggleLabel, value: 'toggle' },
        { label: t('menu.settings'), value: 'settings' },
        { label: t('menu.workspaces'), value: 'workspaces' },
        { label: t('menu.startup'), value: 'startup' },
        { label: t('menu.language'), value: 'language' },
        { label: t('menu.logs'), value: 'logs' },
        { label: t('menu.exit'), value: 'exit' }
      ];

      const choice = await runSelectionMenu(
        () => renderDashboardHeader(config, getRuntimeStatus().snapshot),
        options,
        lastSelection
      );

      lastSelection = options.findIndex(opt => opt.value === choice);
      if (lastSelection < 0) lastSelection = 0;

      if (choice === 'exit') break;
      if (choice === 'toggle') { await handleToggleRuntime(config); continue; }
      if (choice === 'settings') { config = await editConfig(config); continue; }
      if (choice === 'workspaces') { await manageWorkspaces(config.language); continue; }
      if (choice === 'startup') { config = await configureStartup(config); continue; }
      if (choice === 'language') { config = await switchLanguage(config); continue; }
      if (choice === 'logs') { await showRecentLogs(); continue; }
    }
  } finally {
    process.stdout.write('\u001b[?25h');
    if (isTTY) {
      try { process.stdin.setRawMode(wasRaw); } catch { /* ignore */ }
    }
    clearScreen();
    console.log(chalk.gray('Đã thoát nonstop client.'));
  }
}

async function runSetupWizard(
  currentConfig: AppConfig
): Promise<AppConfig> {
  const language = await runSelectionMenu(
    () => {
      console.log(titleBox('Thiết lập nonstop'));
      console.log(chalk.gray('  Chọn ngôn ngữ / Choose language:'));
    },
    [
      { label: 'Tiếng Việt (vi)', value: 'vi' as AppLanguage },
      { label: 'English (en)', value: 'en' as AppLanguage }
    ],
    currentConfig.language === 'en' ? 1 : 0
  );

  const t = createTranslator(language);

  clearScreen();
  console.log(titleBox(t('wizard.title')));
  console.log('');

  const telegramBotToken = await askWithDefault(t('wizard.token'), currentConfig.telegramBotToken);
  const adminUsername = await askWithDefault(t('wizard.admin'), currentConfig.adminUsername);
  const clientName = await askWithDefault(t('wizard.clientName'), currentConfig.clientName);

  const startupMode = await runSelectionMenu(
    () => {
      console.log(titleBox(t('wizard.title')));
      console.log(chalk.gray(`  ${t('wizard.startupMode')}:`));
    },
    [
      { label: `Tắt (disabled)`, value: 'disabled' as StartupMode },
      { label: `Chạy nền (background)`, value: 'background' as StartupMode },
      { label: `Mở giao diện (open-ui)`, value: 'open-ui' as StartupMode }
    ],
    0
  );

  const nextConfig: AppConfig = {
    ...currentConfig,
    language,
    telegramBotToken,
    adminUsername,
    telegramUsername: adminUsername,
    clientName,
    startupMode
  };

  saveConfigToDisk(nextConfig);

  clearScreen();
  console.log(titleBox(t('wizard.title')));
  console.log(`\n${chalk.green(t('wizard.complete'))}`);
  await pause();

  return nextConfig;
}

async function handleToggleRuntime(
  config: AppConfig
): Promise<void> {
  const status = getRuntimeStatus();
  const targetState = !status.running;
  clearScreen();
  try {
    if (status.running) {
      const msg = stopBackgroundRuntime(status.snapshot);
      console.log(`\n${chalk.yellow(msg)}`);
    } else {
      const msg = startBackgroundRuntime();
      console.log(`\n${chalk.green(msg)}`);
    }

    // Polling: chờ trạng thái thực sự thay đổi (tối đa 3 giây)
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 80));
      if (getRuntimeStatus().running === targetState) break;
    }
  } catch (error) {
    console.log(`\n${chalk.red(error instanceof Error ? error.message : String(error))}`);
    await pause();
    return;
  }
}

async function editConfig(
  config: AppConfig
): Promise<AppConfig> {
  clearScreen();
  console.log(titleBox('Sửa cấu hình'));
  console.log('');

  const nextConfig: AppConfig = {
    ...config,
    telegramBotToken: await askWithDefault('TELEGRAM_BOT_TOKEN', config.telegramBotToken),
    adminUsername: await askWithDefault('ADMIN_USERNAME', config.adminUsername),
    clientName: await askWithDefault('CLIENT_NAME', config.clientName),
    telegramUsername: await askWithDefault('TELEGRAM_USERNAME', config.telegramUsername),
    codexCmd: await askWithDefault('CODEX_CMD', config.codexCmd),
    antigravityCmd: await askWithDefault('ANTIGRAVITY_CMD', config.antigravityCmd)
  };

  saveConfigToDisk(nextConfig);
  console.log(`\n${chalk.green('✓ Đã lưu cấu hình.')}`);
  console.log(chalk.gray('Khởi động lại runtime nền nếu đang chạy để áp dụng thay đổi.'));
  await pause();
  return nextConfig;
}

async function manageWorkspaces(
  language: AppLanguage
): Promise<void> {
  const isVi = language === 'vi';

  while (true) {
    const workspaces = loadWorkspaces();
    const options: { label: string; value: { type: 'add' | 'workspace' | 'back'; index?: number } }[] = [
      { label: isVi ? '+ Thêm workspace mới' : '+ Add new workspace', value: { type: 'add' } },
      ...workspaces.map((ws, i) => ({
        label: `● ${ws.name}  ${chalk.gray(ws.path.length > 30 ? '...' + ws.path.slice(-28) : ws.path)}`,
        value: { type: 'workspace' as const, index: i }
      })),
      { label: isVi ? '← Quay lại menu chính' : '← Back', value: { type: 'back' } }
    ];

    const selection = await runSelectionMenu(
      () => {
        console.log(titleBox(isVi ? 'Quản lý Workspace' : 'Manage Workspaces'));
        console.log(chalk.gray(`  ${isVi ? 'Chọn workspace hoặc thêm mới:' : 'Select workspace or add new:'}`));
      },
      options
    );

    if (selection.type === 'back') return;

    if (selection.type === 'add') {
      clearScreen();
      console.log(titleBox(isVi ? 'Thêm workspace mới' : 'Add workspace'));
      console.log('');
      const name = (await askQuestion(chalk.bold(isVi ? 'Tên workspace: ' : 'Workspace name: '))).trim();
      const rawPath = (await askQuestion(chalk.bold(isVi ? 'Đường dẫn: ' : 'Path: '))).trim();

      if (!rawPath) {
        console.log(chalk.red(isVi ? '  Đường dẫn không được để trống.' : '  Path cannot be empty.'));
        await pause();
        continue;
      }

      const resolvedPath = path.resolve(rawPath);
      if (!fs.existsSync(resolvedPath)) {
        console.log(chalk.yellow(`  ⚠ ${isVi ? 'Đường dẫn không tồn tại trên ổ đĩa.' : 'Path does not exist on disk.'}`));
      }

      workspaces.push({ id: createWorkspaceId(), name: name || 'Workspace', path: resolvedPath });
      saveWorkspaces(workspaces);
      console.log(chalk.green(`\n  ✓ ${isVi ? 'Đã thêm workspace.' : 'Workspace added.'}`));
      await pause();
      continue;
    }

    if (selection.type === 'workspace' && typeof selection.index === 'number') {
      const idx = selection.index;
      const ws = workspaces[idx];

      const action = await runSelectionMenu(
        () => {
          console.log(titleBox(isVi ? 'Hành động Workspace' : 'Workspace Actions'));
          console.log(chalk.gray(`  ${isVi ? 'Đang chọn:' : 'Selected:'} `) + chalk.bold(ws.name));
          console.log(chalk.gray(`  ${isVi ? 'Đường dẫn:' : 'Path:'} `) + ws.path);
        },
        [
          { label: isVi ? 'Sửa workspace' : 'Edit workspace', value: 'edit' },
          { label: isVi ? 'Xóa workspace' : 'Delete workspace', value: 'delete' },
          { label: isVi ? '← Quay lại' : '← Back', value: 'back' }
        ]
      );

      if (action === 'back') continue;

      if (action === 'delete') {
        workspaces.splice(idx, 1);
        saveWorkspaces(workspaces);
        clearScreen();
        console.log(chalk.green(`\n  ✓ ${isVi ? 'Đã xóa workspace.' : 'Workspace deleted.'}`));
        await pause();
        continue;
      }

      if (action === 'edit') {
        clearScreen();
        console.log(titleBox(isVi ? 'Sửa workspace' : 'Edit workspace'));
        console.log('');
        const newName = await askWithDefault(isVi ? 'Tên mới' : 'New name', ws.name);
        const newPath = await askWithDefault(isVi ? 'Đường dẫn mới' : 'New path', ws.path);
        const resolvedPath = path.resolve(newPath.trim());
        if (!fs.existsSync(resolvedPath)) {
          console.log(chalk.yellow(`  ⚠ ${isVi ? 'Đường dẫn không tồn tại.' : 'Path does not exist.'}`));
        }
        workspaces[idx] = { ...ws, name: newName.trim() || ws.name, path: resolvedPath };
        saveWorkspaces(workspaces);
        console.log(chalk.green(`\n  ✓ ${isVi ? 'Đã cập nhật workspace.' : 'Workspace updated.'}`));
        await pause();
        continue;
      }
    }
  }
}

async function configureStartup(
  config: AppConfig
): Promise<AppConfig> {
  const isVi = config.language === 'vi';

  const nextMode = await runSelectionMenu(
    () => {
      console.log(titleBox(isVi ? 'Cấu hình khởi động' : 'Configure startup'));
      console.log(chalk.gray(`  ${isVi ? 'Chế độ hiện tại:' : 'Current mode:'} ${config.startupMode}`));
    },
    [
      { label: isVi ? 'Tắt (disabled)' : 'Disabled', value: 'disabled' as StartupMode },
      { label: isVi ? 'Chạy nền (background)' : 'Background', value: 'background' as StartupMode },
      { label: isVi ? 'Mở giao diện (open-ui)' : 'Open UI', value: 'open-ui' as StartupMode }
    ],
    ['disabled', 'background', 'open-ui'].indexOf(config.startupMode)
  );

  const entryScriptPath = getEntryScriptPath();
  const result = applyStartupMode(nextMode, entryScriptPath, process.cwd());
  const nextConfig = { ...config, startupMode: nextMode };
  saveConfigToDisk(nextConfig);

  clearScreen();
  console.log(titleBox(isVi ? 'Cấu hình khởi động' : 'Configure startup'));
  console.log(`\n${chalk.green(result)}`);
  await pause();
  return nextConfig;
}

async function switchLanguage(
  config: AppConfig
): Promise<AppConfig> {
  const language = await runSelectionMenu(
    () => {
      console.log(titleBox('Đổi ngôn ngữ / Switch language'));
      console.log(chalk.gray(`  Hiện tại: ${config.language}`));
    },
    [
      { label: 'Tiếng Việt (vi)', value: 'vi' as AppLanguage },
      { label: 'English (en)', value: 'en' as AppLanguage }
    ],
    config.language === 'en' ? 1 : 0
  );

  const nextConfig = { ...config, language };
  saveConfigToDisk(nextConfig);
  return nextConfig;
}

async function showRecentLogs(): Promise<void> {
  clearScreen();
  console.log(titleBox('Nhật ký gần đây'));
  const logPath = path.join(process.cwd(), 'data', 'nonstop.log');
  if (!fs.existsSync(logPath)) {
    console.log(chalk.gray('\n  Chưa có nhật ký.'));
    await pause();
    return;
  }

  const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-25);
  console.log('\n' + lines.map(l => chalk.gray('  ') + l).join('\n'));
  await pause();
}
