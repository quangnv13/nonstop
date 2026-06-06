import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec, execSync, spawn } from 'child_process';
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
import { getRuntimeStatus, startBackgroundRuntime, stopBackgroundRuntime, getEntryScriptPath, getCurrentVersion, checkForUpdate } from './runtime-manager.js';
import { applyStartupMode } from './startup.js';
import { loadWorkspaces, saveWorkspaces, createWorkspaceId } from './store.js';
import { RuntimeStateSnapshot } from './runtime-state.js';
import { Workspace } from './types.js';
import { resolvePreset } from './terminal.js';

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

async function pause(language?: AppLanguage): Promise<void> {
  const isVi = language !== 'en';
  await askQuestion(`\n${chalk.gray(isVi ? 'Nhấn Enter để tiếp tục...' : 'Press Enter to continue...')}`);
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
  const isVi = config.language === 'vi';

  console.log(titleBox('nonstop client'));
  console.log('');
  console.log(infoRow(isVi ? 'Trạng thái' : 'Status', isRunning ? `${runtimeLabel}  ${chalk.gray(`(${snapshot!.mode})`)}` : runtimeLabel));
  console.log(infoRow('Client', config.clientName, chalk.white));
  console.log(infoRow('Admin', config.adminUsername || '-', chalk.white));
  console.log(infoRow(isVi ? 'Ngôn ngữ' : 'Language', config.language === 'vi' ? 'Tiếng Việt' : 'English', chalk.white));
  console.log(infoRow(isVi ? 'Khởi động' : 'Startup', config.startupMode, chalk.white));
  if (snapshot?.startedAt) {
    const dt = new Date(snapshot.startedAt);
    console.log(infoRow(isVi ? 'Bật lúc' : 'Started at', dt.toLocaleTimeString(isVi ? 'vi-VN' : 'en-US'), chalk.white));
  }
  if (session) {
    console.log(separator());
    console.log(infoRow(isVi ? 'Phiên' : 'Session', `${session.preset}`, chalk.yellow));
    const shortCwd = session.cwd.length > 40 ? '...' + session.cwd.slice(-38) : session.cwd;
    console.log(infoRow(isVi ? 'Thư mục' : 'Directory', shortCwd, chalk.gray));
  }
  if (snapshot?.lastError) {
    console.log(separator());
    console.log(infoRow(isVi ? 'Lỗi' : 'Error', snapshot.lastError, chalk.red));
  }
  console.log('');
  console.log(chalk.bold.blue('  ' + t('dashboard.menu')));
}


async function executeUpgrade(latestVersion: string, isVi: boolean): Promise<void> {
  clearScreen();
  console.log(titleBox(isVi ? 'Đang nâng cấp nonstop' : 'Upgrading nonstop'));
  console.log('');

  const platform = os.platform();
  if (platform === 'win32') {
    console.log(chalk.yellow(isVi 
      ? '  Đang mở cửa sổ PowerShell mới để nâng cấp. Tiến trình hiện tại sẽ tự đóng...' 
      : '  Opening new PowerShell window for upgrade. Current process will exit...'));

    const cmd = 'cmd.exe';
    const args = [
      '/c',
      'start',
      'powershell',
      '-NoProfile',
      '-Command',
      `Start-Sleep -Seconds 1; Write-Host 'Đang nâng cấp @quangnv13/nonstop lên phiên bản ${latestVersion}...'; npm install -g @quangnv13/nonstop@latest; Write-Host 'Hoàn tất! Cửa sổ này sẽ tự đóng sau 3 giây...'; Start-Sleep -Seconds 3`
    ];

    spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      shell: true
    }).unref();

    process.exit(0);
  } else {
    console.log(chalk.blue(isVi ? '  Đang chạy lệnh cài đặt...' : '  Running install command...'));
    try {
      execSync('npm install -g @quangnv13/nonstop@latest', { stdio: 'inherit' });
      console.log(chalk.green(isVi ? '\n  ✓ Nâng cấp thành công! Vui lòng khởi động lại nonstop.' : '\n  ✓ Upgrade successful! Please restart nonstop.'));
      await pause(isVi ? 'vi' : 'en');
      process.exit(0);
    } catch (error) {
      console.error(chalk.red(isVi ? '\n  ❌ Lỗi nâng cấp: ' : '\n  ❌ Upgrade failed: '), error);
      await pause(isVi ? 'vi' : 'en');
    }
  }
}

export async function launchControlCenter(): Promise<void> {
  ensureEnvExampleFile();
  let config = loadConfigFromDisk();

  const isTTY = process.stdin.isTTY;
  const wasRaw = process.stdin.isRaw;

  // 1. Kiểm tra cập nhật khi khởi chạy
  const currentVersion = getCurrentVersion();
  console.log(chalk.gray(`\n  ${config.language === 'vi' ? 'Đang kiểm tra cập nhật' : 'Checking for updates'} (v${currentVersion})...`));
  const latestVersion = await checkForUpdate(currentVersion);

  if (latestVersion) {
    clearScreen();
    const isVi = config.language === 'vi';
    const upgradeChoice = await runSelectionMenu(
      () => {
        console.log(titleBox(isVi ? 'Có bản cập nhật mới!' : 'Update Available!'));
        console.log('');
        console.log(`  ${isVi ? 'Phiên bản hiện tại:' : 'Current version:'} ${chalk.yellow(currentVersion)}`);
        console.log(`  ${isVi ? 'Phiên bản mới nhất:' : 'Latest version:'} ${chalk.green(latestVersion)}`);
        console.log('');
        console.log(chalk.bold(`  ${isVi ? 'Bạn có muốn nâng cấp ngay bây giờ không?' : 'Do you want to upgrade now?'}`));
      },
      [
        { label: isVi ? 'Có, nâng cấp ngay' : 'Yes, upgrade now', value: true },
        { label: isVi ? 'Không, để sau' : 'No, skip for now', value: false }
      ],
      0
    );

    if (upgradeChoice) {
      await executeUpgrade(latestVersion, isVi);
      return;
    }
  }

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
        ? (isVi ? 'Tắt runtime nền' : 'Stop background runtime')
        : (isVi ? 'Bật runtime nền' : 'Start background runtime');

      const options = [
        { label: toggleLabel, value: 'toggle' },
        { label: isVi ? 'Danh sách CLI đã spawn' : 'List of spawned CLIs', value: 'sessions' },
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
      if (choice === 'sessions') { await manageActiveSessions(config.language); continue; }
      if (choice === 'settings') { config = await editConfig(config); continue; }
      if (choice === 'workspaces') { await manageWorkspaces(config.language); continue; }
      if (choice === 'startup') { config = await configureStartup(config); continue; }
      if (choice === 'language') { config = await switchLanguage(config); continue; }
      if (choice === 'logs') { await showRecentLogs(config.language); continue; }
    }
  } finally {
    process.stdout.write('\u001b[?25h');
    if (isTTY) {
      try { process.stdin.setRawMode(wasRaw); } catch { /* ignore */ }
    }
    clearScreen();
    console.log(chalk.gray(config.language === 'vi' ? 'Đã thoát nonstop client.' : 'Exited nonstop client.'));
  }
}

async function manageActiveSessions(language: AppLanguage): Promise<void> {
  const isVi = language === 'vi';

  while (true) {
    const status = getRuntimeStatus();
    const session = status.snapshot?.activeSession;

    const options: { label: string; value: { type: 'select' | 'back'; preset?: any; cwd?: string } }[] = [];

    if (status.running && session && session.status === 'running') {
      options.push({
        label: `● [${session.preset.toUpperCase()}] ID: ${session.sessionId} | ${session.cwd}`,
        value: { type: 'select', preset: session.preset, cwd: session.cwd }
      });
    }

    options.push({
      label: isVi ? '← Quay lại menu chính' : '← Back to main menu',
      value: { type: 'back' }
    });

    const choice = await runSelectionMenu(
      () => {
        console.log(titleBox(isVi ? 'Danh sách CLI đã spawn' : 'List of spawned CLIs'));
        console.log('');
        if (!status.running) {
          console.log(chalk.yellow(isVi
            ? '  ⚠ Runtime nền hiện không chạy.'
            : '  ⚠ Background runtime is not running.'));
        } else if (!session || session.status !== 'running') {
          console.log(chalk.gray(isVi
            ? '  Không có session nào đang chạy.'
            : '  No active sessions running.'));
        } else {
          console.log(chalk.gray(isVi
            ? '  Chọn session để tiếp tục trực tiếp:'
            : '  Select a session to continue locally:'));
        }
      },
      options
    );

    if (choice.type === 'back') {
      return;
    }

    if (choice.type === 'select' && choice.preset && choice.cwd) {
      const action = await runSelectionMenu(
        () => {
          console.log(titleBox(isVi ? 'Chi tiết Phiên làm việc' : 'Session Details'));
          console.log('');
          console.log(`  Preset:  ${chalk.cyan(choice.preset.toUpperCase())}`);
          console.log(`  Cwd:     ${chalk.cyan(choice.cwd)}`);
          console.log('');
          console.log(chalk.bold(isVi
            ? '  Chọn hành động cho phiên làm việc này:'
            : '  Select action for this session:'));
        },
        [
          {
            label: isVi
              ? 'Mở trong terminal (tiếp tục phiên cục bộ)'
              : 'Open in terminal (continue locally, no remote)',
            value: 'open'
          },
          {
            label: isVi ? '← Quay lại' : '← Back',
            value: 'back'
          }
        ]
      );

      if (action === 'back') {
        continue;
      }

      if (action === 'open') {
        clearScreen();
        console.log(chalk.blue(isVi
          ? 'Đang ngắt kết nối phiên làm việc chạy nền...'
          : 'Disconnecting background session...'));

        const ipcPath = path.join(process.cwd(), 'data', 'ipc-command.json');
        fs.writeFileSync(ipcPath, JSON.stringify({ action: 'stop-session' }), 'utf8');

        // Polling to wait for session to disconnect
        const deadline = Date.now() + 5000;
        let disconnected = false;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 100));
          const currentStatus = getRuntimeStatus();
          if (!currentStatus.snapshot?.activeSession || currentStatus.snapshot.activeSession.status !== 'running') {
            disconnected = true;
            break;
          }
        }

        if (!disconnected) {
          console.log(chalk.red(isVi
            ? 'Không thể ngắt kết nối phiên làm việc chạy nền. Vui lòng thử lại.'
            : 'Failed to disconnect background session. Please try again.'));
          await pause(language);
          continue;
        }

        console.log(chalk.green(isVi
          ? 'Đang mở phiên làm việc trong terminal cục bộ...'
          : 'Opening session in local terminal...'));
        console.log(chalk.gray(isVi
          ? 'Gõ "exit" để thoát và quay lại menu nonstop.'
          : 'Type "exit" to quit and return to nonstop menu.'));
        console.log('');

        await new Promise((r) => setTimeout(r, 1000));

        try {
          const { command, args } = resolvePreset(choice.preset);

          await new Promise<void>((resolve) => {
            const child = spawn(command, args, { stdio: 'inherit', cwd: choice.cwd });
            child.on('exit', () => {
              process.stdin.resume();
              resolve();
            });
            child.on('error', (err) => {
              console.error(chalk.red(isVi
                ? `Lỗi khi chạy lệnh: ${err.message}`
                : `Error running command: ${err.message}`));
              process.stdin.resume();
              resolve();
            });
          });
        } catch (err) {
          console.error(chalk.red(isVi
            ? `Lỗi không xác định: ${err instanceof Error ? err.message : String(err)}`
            : `Unknown error: ${err instanceof Error ? err.message : String(err)}`));
          await pause(language);
        }
      }
    }
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
  await pause(language);

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
      const msg = stopBackgroundRuntime(status.snapshot, config.language);
      console.log(`\n${chalk.yellow(msg)}`);
    } else {
      const msg = startBackgroundRuntime(config.language);
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
    await pause(config.language);
    return;
  }
}

async function editConfig(
  config: AppConfig
): Promise<AppConfig> {
  clearScreen();
  console.log(titleBox(config.language === 'vi' ? 'Sửa cấu hình' : 'Edit config'));
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
  console.log(`\n${chalk.green(config.language === 'vi' ? '✓ Đã lưu cấu hình.' : '✓ Settings saved.')}`);
  console.log(chalk.gray(config.language === 'vi' ? 'Khởi động lại runtime nền nếu đang chạy để áp dụng thay đổi.' : 'Restart the background runtime if running to apply changes.'));
  await pause(config.language);
  return nextConfig;
}

async function manageWorkspaces(
  language: AppLanguage
): Promise<void> {
  const isVi = language === 'vi';

  while (true) {
    const workspaces = loadWorkspaces();
    const options: { label: string; value: { type: 'add' | 'workspace' | 'back'; index?: number } }[] = [
      { label: isVi ? '+ Thêm không gian làm việc mới' : '+ Add new workspace', value: { type: 'add' } },
      ...workspaces.map((ws, i) => ({
        label: `● ${ws.name}  ${chalk.gray(ws.path.length > 30 ? '...' + ws.path.slice(-28) : ws.path)}`,
        value: { type: 'workspace' as const, index: i }
      })),
      { label: isVi ? '← Quay lại menu chính' : '← Back', value: { type: 'back' } }
    ];

    const selection = await runSelectionMenu(
      () => {
        console.log(titleBox(isVi ? 'Quản lý không gian làm việc' : 'Manage Workspaces'));
        console.log(chalk.gray(`  ${isVi ? 'Chọn không gian làm việc hoặc thêm mới:' : 'Select workspace or add new:'}`));
      },
      options
    );

    if (selection.type === 'back') return;

    if (selection.type === 'add') {
      clearScreen();
      console.log(titleBox(isVi ? 'Thêm không gian làm việc mới' : 'Add workspace'));
      console.log('');
      const name = (await askQuestion(chalk.bold(isVi ? 'Tên không gian làm việc: ' : 'Workspace name: '))).trim();
      const rawPath = (await askQuestion(chalk.bold(isVi ? 'Đường dẫn: ' : 'Path: '))).trim();

      if (!rawPath) {
        console.log(chalk.red(isVi ? '  Đường dẫn không được để trống.' : '  Path cannot be empty.'));
        await pause(language);
        continue;
      }

      const resolvedPath = path.resolve(rawPath);
      if (!fs.existsSync(resolvedPath)) {
        console.log(chalk.yellow(`  ⚠ ${isVi ? 'Đường dẫn không tồn tại trên ổ đĩa.' : 'Path does not exist on disk.'}`));
      }

      workspaces.push({ id: createWorkspaceId(), name: name || 'Workspace', path: resolvedPath });
      saveWorkspaces(workspaces);
      console.log(chalk.green(`\n  ✓ ${isVi ? 'Đã thêm không gian làm việc.' : 'Workspace added.'}`));
      await pause(language);
      continue;
    }

    if (selection.type === 'workspace' && typeof selection.index === 'number') {
      const idx = selection.index;
      const ws = workspaces[idx];

      const action = await runSelectionMenu(
        () => {
          console.log(titleBox(isVi ? 'Hành động không gian làm việc' : 'Workspace Actions'));
          console.log(chalk.gray(`  ${isVi ? 'Đang chọn:' : 'Selected:'} `) + chalk.bold(ws.name));
          console.log(chalk.gray(`  ${isVi ? 'Đường dẫn:' : 'Path:'} `) + ws.path);
        },
        [
          { label: isVi ? 'Sửa không gian làm việc' : 'Edit workspace', value: 'edit' },
          { label: isVi ? 'Xóa không gian làm việc' : 'Delete workspace', value: 'delete' },
          { label: isVi ? '← Quay lại' : '← Back', value: 'back' }
        ]
      );

      if (action === 'back') continue;

      if (action === 'delete') {
        workspaces.splice(idx, 1);
        saveWorkspaces(workspaces);
        clearScreen();
        console.log(chalk.green(`\n  ✓ ${isVi ? 'Đã xóa không gian làm việc.' : 'Workspace deleted.'}`));
        await pause(language);
        continue;
      }

      if (action === 'edit') {
        clearScreen();
        console.log(titleBox(isVi ? 'Sửa không gian làm việc' : 'Edit workspace'));
        console.log('');
        const newName = await askWithDefault(isVi ? 'Tên mới' : 'New name', ws.name);
        const newPath = await askWithDefault(isVi ? 'Đường dẫn mới' : 'New path', ws.path);
        const resolvedPath = path.resolve(newPath.trim());
        if (!fs.existsSync(resolvedPath)) {
          console.log(chalk.yellow(`  ⚠ ${isVi ? 'Đường dẫn không tồn tại.' : 'Path does not exist.'}`));
        }
        workspaces[idx] = { ...ws, name: newName.trim() || ws.name, path: resolvedPath };
        saveWorkspaces(workspaces);
        console.log(chalk.green(`\n  ✓ ${isVi ? 'Đã cập nhật không gian làm việc.' : 'Workspace updated.'}`));
        await pause(language);
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
  const result = applyStartupMode(nextMode, entryScriptPath, process.cwd(), config.language);
  const nextConfig = { ...config, startupMode: nextMode };
  saveConfigToDisk(nextConfig);

  clearScreen();
  console.log(titleBox(isVi ? 'Cấu hình khởi động' : 'Configure startup'));
  console.log(`\n${chalk.green(result)}`);
  await pause(config.language);
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

async function showRecentLogs(language: AppLanguage): Promise<void> {
  const isVi = language === 'vi';
  clearScreen();
  console.log(titleBox(isVi ? 'Nhật ký gần đây' : 'Recent logs'));
  const logPath = path.join(process.cwd(), 'data', 'nonstop.log');
  if (!fs.existsSync(logPath)) {
    console.log(chalk.gray(isVi ? '\n  Chưa có nhật ký.' : '\n  No logs found.'));
    await pause(language);
    return;
  }

  const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-25);
  console.log('\n' + lines.map(l => chalk.gray('  ') + l).join('\n'));
  await pause(language);
}
