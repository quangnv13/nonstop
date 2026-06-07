import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec, execSync, spawn } from 'child_process';
import chalk from 'chalk';
import boxen from 'boxen';
import inquirer from 'inquirer';
import Table from 'cli-table3';
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
import { RuntimeStateSnapshot, getIpcSocketPath } from './runtime-state.js';
import * as net from 'net';
import { Workspace } from './types.js';
import { resolvePreset } from './terminal.js';

interface Option<T> {
  label: string;
  value: T;
}

function clearScreen(): void {
  // \u001b[2J clears visible area, \u001b[3J clears scrollback buffer, \u001b[H moves cursor home
  process.stdout.write('\u001b[2J\u001b[3J\u001b[H');
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

async function pause(language?: AppLanguage): Promise<void> {
  const isVi = language !== 'en';
  await inquirer.prompt([
    {
      type: 'input',
      name: 'pressEnter',
      message: chalk.gray(isVi ? 'Nhấn Enter để tiếp tục...' : 'Press Enter to continue...')
    }
  ]);
}

async function runSelectionMenu<T>(
  headerRenderer: () => void,
  options: Option<T>[],
  initialIndex: number = 0,
  language?: AppLanguage
): Promise<T> {
  let resolvedLang = language;
  if (!resolvedLang) {
    try {
      resolvedLang = loadConfigFromDisk().language;
    } catch {
      resolvedLang = 'en';
    }
  }
  const isVi = resolvedLang === 'vi';

  clearScreen();
  headerRenderer();

  const answers = await inquirer.prompt([
    {
      type: 'select',
      name: 'value',
      message: chalk.cyan(isVi ? 'Lựa chọn:' : 'Menu:'),
      choices: options.map(opt => ({
        name: opt.label,
        value: opt.value
      })),
      default: options[initialIndex]?.value,
      loop: true
    }
  ]);

  return answers.value;
}

function renderDashboardHeader(config: AppConfig, snapshot: RuntimeStateSnapshot | null): void {
  const t = createTranslator(config.language);
  const isRunning = !!snapshot;
  const runtimeLabel = isRunning ? chalk.bold.green(t('dashboard.running')) : chalk.bold.red(t('dashboard.stopped'));
  const session = snapshot?.activeSession;
  const isVi = config.language === 'vi';

  let modeLabel = '';
  if (snapshot) {
    if (snapshot.mode === 'background') {
      modeLabel = isVi ? 'chạy nền' : 'background';
    } else if (snapshot.mode === 'foreground') {
      modeLabel = isVi ? 'chạy trực tiếp' : 'foreground';
    } else {
      modeLabel = snapshot.mode;
    }
  }

  let startupModeLabel = '';
  if (config.startupMode === 'disabled') {
    startupModeLabel = isVi ? 'Tắt' : 'Disabled';
  } else if (config.startupMode === 'background') {
    startupModeLabel = isVi ? 'Chạy nền' : 'Background';
  } else if (config.startupMode === 'open-ui') {
    startupModeLabel = isVi ? 'Mở giao diện' : 'Open UI';
  } else {
    startupModeLabel = config.startupMode;
  }

  console.log(titleBox(t('dashboard.title')));
  console.log('');
  console.log(infoRow(isVi ? 'Trạng thái' : 'Status', isRunning ? `${runtimeLabel}  ${chalk.gray(`(${modeLabel})`)}` : runtimeLabel));
  console.log(infoRow('Client', config.clientName, chalk.white));
  console.log(infoRow('Admin', config.adminUsername || '-', chalk.white));
  console.log(infoRow(isVi ? 'Ngôn ngữ' : 'Language', config.language === 'vi' ? 'Tiếng Việt' : 'English', chalk.white));
  console.log(infoRow(isVi ? 'Khởi động' : 'Startup', startupModeLabel, chalk.white));
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
      : '  Opening a new PowerShell window for the upgrade. The current process will now exit...'));

    const upgradingMsg = isVi 
      ? `Đang nâng cấp @quangnv13/nonstop lên phiên bản ${latestVersion}...` 
      : `Upgrading @quangnv13/nonstop to version ${latestVersion}...`;
    const completeMsg = isVi 
      ? `Nâng cấp nonstop hoàn tất! Cửa sổ này sẽ tự đóng sau 3 giây...` 
      : `nonstop upgrade completed! This window will close in 3 seconds...`;

    const cmd = 'cmd.exe';
    const args = [
      '/c',
      'start',
      'powershell',
      '-NoProfile',
      '-Command',
      `Start-Sleep -Seconds 1; Write-Host '${upgradingMsg}'; npm install -g @quangnv13/nonstop@latest; Write-Host '${completeMsg}'; Start-Sleep -Seconds 3`
    ];

    spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      shell: true
    }).unref();

    process.exit(0);
  } else {
    console.log(chalk.blue(isVi ? '  Đang chạy lệnh cài đặt...' : '  Running the installation command...'));
    try {
      execSync('npm install -g @quangnv13/nonstop@latest', { stdio: 'inherit' });
      console.log(chalk.green(isVi ? '\n  ✓ Nâng cấp nonstop thành công! Vui lòng khởi động lại nonstop.' : '\n  ✓ nonstop upgraded successfully! Please restart nonstop.'));
      await pause(isVi ? 'vi' : 'en');
      process.exit(0);
    } catch (error) {
      console.error(chalk.red(isVi ? '\n  ❌ Lỗi nâng cấp nonstop: ' : '\n  ❌ nonstop upgrade failed: '), error);
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
      0,
      config.language
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
        { label: isVi ? 'Danh sách CLI đã spawn' : 'List active sessions', value: 'sessions' },
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
        lastSelection,
        config.language
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
        label: `● Attach: [${session.preset.toUpperCase()}] ID: ${session.sessionId}`,
        value: { type: 'select', preset: session.preset, cwd: session.cwd }
      });
    }

    options.push({
      label: isVi ? '← Quay lại menu chính' : '← Back to main menu',
      value: { type: 'back' }
    });

    const choice = await runSelectionMenu(
      () => {
        console.log(titleBox(isVi ? 'Danh sách CLI đã spawn' : 'List Active Sessions'));
        console.log('');
        if (!status.running) {
          console.log(chalk.yellow(isVi
            ? '  ⚠ Runtime nền hiện không chạy.'
            : '  ⚠ The background runtime is not running.'));
        } else if (!session || session.status !== 'running') {
          console.log(chalk.gray(isVi
            ? '  Không có session nào đang chạy.'
            : '  No active sessions running.'));
        } else {
          const table = new Table({
            head: [chalk.cyan('ID'), chalk.cyan('Preset'), chalk.cyan('Status'), chalk.cyan('CWD')],
            chars: {
              'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
              'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
              'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
              'right': '│', 'right-mid': '┤', 'middle': '│'
            }
          });
          table.push([session.sessionId, session.preset.toUpperCase(), chalk.green(session.status), session.cwd]);
          console.log(table.toString());
          console.log('');
        }
      },
      options,
      0,
      language
    );

    if (choice.type === 'back') {
      return;
    }

    if (choice.type === 'select' && choice.preset && choice.cwd) {
      await attachToBackgroundSession(choice.preset, choice.cwd, language);
    }
  }
}

async function runSetupWizard(
  currentConfig: AppConfig
): Promise<AppConfig> {
  const language = await runSelectionMenu(
    () => {
      console.log(titleBox(currentConfig.language === 'vi' ? 'Thiết lập nonstop' : 'nonstop Setup'));
      console.log(chalk.gray(currentConfig.language === 'vi' ? '  Chọn ngôn ngữ / Choose language:' : '  Choose language / Chọn ngôn ngữ:'));
    },
    [
      { label: 'Tiếng Việt (vi)', value: 'vi' as AppLanguage },
      { label: 'English (en)', value: 'en' as AppLanguage }
    ],
    currentConfig.language === 'en' ? 1 : 0,
    currentConfig.language
  );

  const t = createTranslator(language);

  clearScreen();
  console.log(titleBox(t('wizard.title')));
  console.log('');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'telegramBotToken',
      message: t('wizard.token'),
      default: currentConfig.telegramBotToken
    },
    {
      type: 'input',
      name: 'adminUsername',
      message: t('wizard.admin'),
      default: currentConfig.adminUsername
    },
    {
      type: 'input',
      name: 'clientName',
      message: t('wizard.clientName'),
      default: currentConfig.clientName
    }
  ]);

  const startupMode = await runSelectionMenu(
    () => {
      console.log(titleBox(t('wizard.title')));
      console.log(chalk.gray(`  ${t('wizard.startupMode')}:`));
    },
    [
      { label: t('startup.disabled'), value: 'disabled' as StartupMode },
      { label: t('startup.background'), value: 'background' as StartupMode },
      { label: t('startup.openUi'), value: 'open-ui' as StartupMode }
    ],
    0,
    language
  );

  const nextConfig: AppConfig = {
    ...currentConfig,
    language,
    telegramBotToken: answers.telegramBotToken,
    adminUsername: answers.adminUsername,
    telegramUsername: answers.adminUsername,
    clientName: answers.clientName,
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

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'telegramBotToken',
      message: 'TELEGRAM_BOT_TOKEN',
      default: config.telegramBotToken
    },
    {
      type: 'input',
      name: 'adminUsername',
      message: 'ADMIN_USERNAME',
      default: config.adminUsername
    },
    {
      type: 'input',
      name: 'clientName',
      message: 'CLIENT_NAME',
      default: config.clientName
    },
    {
      type: 'input',
      name: 'telegramUsername',
      message: 'TELEGRAM_USERNAME',
      default: config.telegramUsername
    },
    {
      type: 'input',
      name: 'codexCmd',
      message: 'CODEX_CMD',
      default: config.codexCmd
    },
    {
      type: 'input',
      name: 'antigravityCmd',
      message: 'ANTIGRAVITY_CMD',
      default: config.antigravityCmd
    },
    {
      type: 'input',
      name: 'claudeCmd',
      message: 'CLAUDE_CMD',
      default: config.claudeCmd
    },
    {
      type: 'input',
      name: 'dangerousCommandConfirm',
      message: 'DANGEROUS_COMMAND_CONFIRM',
      default: config.dangerousCommandConfirm
    }
  ]);

  const nextConfig: AppConfig = {
    ...config,
    ...answers
  };

  saveConfigToDisk(nextConfig);
  console.log(`\n${chalk.green(config.language === 'vi' ? '✓ Đã lưu cấu hình.' : '✓ Settings saved.')}`);
  console.log(chalk.gray(config.language === 'vi' ? 'Khởi động lại runtime nền nếu đang chạy để áp dụng thay đổi.' : 'Restart the background runtime if it is running to apply changes.'));
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
        console.log('');
        if (workspaces.length === 0) {
          console.log(chalk.gray(isVi ? '  Không có không gian làm việc nào.' : '  No workspaces registered.'));
        } else {
          const table = new Table({
            head: [chalk.cyan(isVi ? 'STT' : 'No.'), chalk.cyan(isVi ? 'Tên' : 'Name'), chalk.cyan(isVi ? 'Đường dẫn' : 'Path')],
            chars: {
              'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
              'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
              'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
              'right': '│', 'right-mid': '┤', 'middle': '│'
            }
          });
          workspaces.forEach((ws, idx) => {
            table.push([idx + 1, ws.name, ws.path]);
          });
          console.log(table.toString());
        }
        console.log('');
        console.log(chalk.gray(`  ${isVi ? 'Chọn không gian làm việc hoặc thêm mới:' : 'Select workspace or add new:'}`));
      },
      options,
      0,
      language
    );

    if (selection.type === 'back') return;

    if (selection.type === 'add') {
      clearScreen();
      console.log(titleBox(isVi ? 'Thêm không gian làm việc mới' : 'Add workspace'));
      console.log('');

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: isVi ? 'Tên không gian làm việc:' : 'Workspace name:',
          default: 'Workspace'
        },
        {
          type: 'input',
          name: 'rawPath',
          message: isVi ? 'Đường dẫn:' : 'Path:',
          validate: (input) => input.trim() ? true : (isVi ? 'Đường dẫn không được để trống.' : 'Path cannot be empty.')
        }
      ]);
      const name = answers.name.trim();
      const rawPath = answers.rawPath.trim();

      const resolvedPath = path.resolve(rawPath);
      if (!fs.existsSync(resolvedPath)) {
        console.log(chalk.yellow(`  ⚠ ${isVi ? 'Đường dẫn không tồn tại trên ổ đĩa.' : 'The path does not exist on disk.'}`));
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
        ],
        0,
        language
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

        const newAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: isVi ? 'Tên mới:' : 'New name:',
            default: ws.name
          },
          {
            type: 'input',
            name: 'path',
            message: isVi ? 'Đường dẫn mới:' : 'New path:',
            default: ws.path,
            validate: (input) => input.trim() ? true : (isVi ? 'Đường dẫn không được để trống.' : 'Path cannot be empty.')
          }
        ]);
        const newName = newAnswers.name.trim();
        const newPath = newAnswers.path.trim();

        const resolvedPath = path.resolve(newPath);
        if (!fs.existsSync(resolvedPath)) {
          console.log(chalk.yellow(`  ⚠ ${isVi ? 'Đường dẫn không tồn tại.' : 'The path does not exist.'}`));
        }
        workspaces[idx] = { ...ws, name: newName || ws.name, path: resolvedPath };
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
    ['disabled', 'background', 'open-ui'].indexOf(config.startupMode),
    config.language
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
      console.log(titleBox(config.language === 'vi' ? 'Đổi ngôn ngữ' : 'Switch Language'));
      console.log(chalk.gray(config.language === 'vi' ? `  Hiện tại: ${config.language}` : `  Current: ${config.language}`));
    },
    [
      { label: 'Tiếng Việt (vi)', value: 'vi' as AppLanguage },
      { label: 'English (en)', value: 'en' as AppLanguage }
    ],
    config.language === 'en' ? 1 : 0,
    config.language
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

export async function attachToBackgroundSession(
  preset: string,
  cwd: string,
  language: AppLanguage
): Promise<void> {
  const isVi = language === 'vi';
  const socketPath = getIpcSocketPath();

  clearScreen();
  console.log(chalk.blue(isVi 
    ? 'Đang kết nối tới phiên chạy nền...' 
    : 'Connecting to the background session...'));

  return new Promise<void>((resolve) => {
    const socket = net.createConnection(socketPath);

    let isClosed = false;
    const cleanup = () => {
      if (isClosed) return;
      isClosed = true;

      // Restore stdin & stdout
      process.stdin.removeListener('data', onStdinData);
      process.stdout.removeListener('resize', onResize);
      if (process.stdin.isTTY) {
        try {
          process.stdin.setRawMode(false);
        } catch { /* ignore */ }
      }
      process.stdin.resume();

      socket.destroy();
      resolve();
    };

    socket.on('connect', () => {
      clearScreen();
      console.log(chalk.bold.green(isVi
        ? `--- Đã kết nối tới phiên ${preset.toUpperCase()} | Gõ phím để tương tác ---`
        : `--- Connected to the ${preset.toUpperCase()} session | Start typing to interact ---`));
      console.log(chalk.gray(isVi
        ? '--- Nhấn Ctrl+B rồi nhấn D để ngắt kết nối (session vẫn chạy nền) ---'
        : '--- Press Ctrl+B then D to detach (the session will keep running in the background) ---'));
      console.log('');

      if (process.stdin.isTTY) {
        try {
          process.stdin.setRawMode(true);
        } catch { /* ignore */ }
      }
      process.stdin.resume();

      // Send initial size
      if (process.stdout.isTTY) {
        socket.write(JSON.stringify({
          type: 'resize',
          cols: process.stdout.columns || 80,
          rows: process.stdout.rows || 24
        }) + '\n');
      }
    });

    let lastKeyWasCtrlB = false;

    function onStdinData(data: Buffer) {
      if (isClosed) return;

      if (data.length === 1 && data[0] === 2) {
        lastKeyWasCtrlB = true;
        return;
      }

      if (lastKeyWasCtrlB) {
        lastKeyWasCtrlB = false;
        if (data.length === 1 && (data[0] === 100 || data[0] === 68)) {
          console.log(chalk.yellow(isVi ? '\n\nĐang ngắt kết nối...' : '\n\nDetaching...'));
          cleanup();
          return;
        }
        socket.write(JSON.stringify({ type: 'input', data: '\u0002' }) + '\n');
      }

      socket.write(JSON.stringify({ type: 'input', data: data.toString('utf8') }) + '\n');
    }

    function onResize() {
      if (isClosed) return;
      socket.write(JSON.stringify({
        type: 'resize',
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 24
      }) + '\n');
    }

    process.stdin.on('data', onStdinData);
    process.stdout.on('resize', onResize);

    let buffer = '';
    socket.on('data', (data) => {
      if (isClosed) return;

      buffer += data.toString();
      let boundary = buffer.indexOf('\n');
      while (boundary !== -1) {
        const line = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 1);
        if (line) {
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'output') {
              process.stdout.write(msg.data);
            } else if (msg.type === 'exit') {
              console.log(chalk.yellow(isVi
                ? `\n\n[Phiên làm việc đã kết thúc với mã thoát ${msg.code}]`
                : `\n\n[Session exited with code ${msg.code}]`));
              cleanup();
            }
          } catch (err) {
            // Ignore
          }
        }
        boundary = buffer.indexOf('\n');
      }
    });

    socket.on('error', (err) => {
      if (isClosed) return;
      console.log(chalk.red(isVi
        ? `\nLỗi kết nối IPC: ${err.message}`
        : `\nIPC connection error: ${err.message}`));
      pause(language).then(cleanup);
    });

    socket.on('close', () => {
      if (isClosed) return;
      console.log(chalk.gray(isVi
        ? '\nĐã ngắt kết nối với phiên chạy nền.'
        : '\nDisconnected from the background session.'));
      pause(language).then(cleanup);
    });
  });
}
