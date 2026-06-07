import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
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
import { getRecentLogLines } from './logger.js';
import * as net from 'net';
import { Workspace } from './types.js';
import { resolvePreset } from './terminal.js';

export class EscapePressedError extends Error {
  constructor() {
    super('Escape key pressed');
    this.name = 'EscapePressedError';
  }
}

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

function infoRow(icon: string, label: string, value: string, valueColor: (s: string) => string = (s) => s): string {
  return `  ${icon}  ${chalk.gray(label.padEnd(11))} ${valueColor(value)}`;
}

function separator(): string {
  return chalk.gray('  ' + '─'.repeat(44));
}

async function pause(language?: AppLanguage): Promise<void> {
  const t = createTranslator(language || 'en');
  await inquirer.prompt([
    {
      type: 'input',
      name: 'pressEnter',
      message: chalk.gray(t('cli.ui.pressEnter')),
      theme: { prefix: '' }
    }
  ]);
}

async function waitForDaemonStart(config: AppConfig, oldPid?: number): Promise<void> {
  const t = createTranslator(config.language);
  const start = Date.now();
  const timeoutMs = 8000;
  
  console.log(chalk.cyan(t('cli.ui.connectingTelegram')));
  
  while (Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const status = getRuntimeStatus();
    if (status.running && (!oldPid || status.snapshot?.pid !== oldPid)) {
      if (status.snapshot?.telegramConnected) {
        console.log(chalk.green(t('cli.ui.connectedTelegram')));
        await new Promise(resolve => setTimeout(resolve, 800));
        return;
      }
    }
  }
  
  const status = getRuntimeStatus();
  if (status.running && status.snapshot && !status.snapshot.telegramConnected) {
    console.log(chalk.yellow(t('cli.ui.unableConfirmTelegram')));
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
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

  clearScreen();
  headerRenderer();

  // Ensure keypress events are emitted on stdin
  try {
    readline.emitKeypressEvents(process.stdin);
  } catch {
    // ignore
  }

  let promptInstance: any = null;
  const onKeypress = (ch: any, key: any) => {
    if (key && key.name === 'escape') {
      if (promptInstance && promptInstance.ui) {
        try {
          promptInstance.ui.close();
        } catch {
          // ignore
        }
      }
    }
  };

  process.stdin.on('keypress', onKeypress);

  try {
    const promptPromise = inquirer.prompt([
      {
        type: 'select',
        name: 'value',
        prefix: '',
        theme: { prefix: '' },
        message: '',
        choices: options.map(opt => ({
          name: opt.label,
          value: opt.value
        })),
        default: options[initialIndex]?.value,
        loop: true
      }
    ]);
    promptInstance = promptPromise;

    const answers = await promptPromise;
    return answers.value;
  } catch (error: any) {
    if (error && (error.name === 'AbortPromptError' || error.message?.includes('aborted'))) {
      throw new EscapePressedError();
    }
    throw error;
  } finally {
    process.stdin.removeListener('keypress', onKeypress);
  }
}

function renderDashboardHeader(config: AppConfig, snapshot: RuntimeStateSnapshot | null): void {
  const t = createTranslator(config.language);
  const isRunning = !!snapshot;
  const runtimeLabel = isRunning ? chalk.bold.green(t('dashboard.running')) : chalk.bold.red(t('dashboard.stopped'));
  const session = snapshot?.activeSession;

  let telegramStatus = '';
  let telegramColor = chalk.gray;
  if (!snapshot) {
    telegramStatus = t('cli.ui.telegramStatus.notRunning');
    telegramColor = chalk.gray;
  } else if (snapshot.telegramConnected) {
    telegramStatus = t('cli.ui.telegramStatus.connected');
    telegramColor = chalk.green;
  } else {
    telegramStatus = t('cli.ui.telegramStatus.disconnected');
    telegramColor = chalk.red;
  }

  let modeLabel = '';
  if (snapshot) {
    if (snapshot.mode === 'background') {
      modeLabel = t('cli.ui.mode.background');
    } else if (snapshot.mode === 'foreground') {
      modeLabel = t('cli.ui.mode.foreground');
    } else {
      modeLabel = snapshot.mode;
    }
  }

  let startupModeLabel = '';
  if (config.startupMode === 'disabled') {
    startupModeLabel = t('cli.ui.startup.disabledLabel');
  } else if (config.startupMode === 'background') {
    startupModeLabel = t('cli.ui.startup.backgroundLabel');
  } else if (config.startupMode === 'open-ui') {
    startupModeLabel = t('cli.ui.startup.openUiLabel');
  } else {
    startupModeLabel = config.startupMode;
  }

  console.log(titleBox(t('dashboard.title')));
  console.log('');
  console.log(infoRow('ℹ️', t('cli.ui.status'), isRunning ? `${runtimeLabel}  ${chalk.gray(`(${modeLabel})`)}` : runtimeLabel));
  console.log(infoRow('🏷️', t('cli.ui.version'), `v${getCurrentVersion()}`, chalk.white));
  console.log(infoRow('💬', 'Telegram', telegramStatus, telegramColor));
  console.log(infoRow('💻', 'Client', config.clientName, chalk.white));
  console.log(infoRow('👤', 'Admin', config.adminUsername || '-', chalk.white));
  
  const langNames = { en: 'English', vi: 'Tiếng Việt', zh: '中文' };
  const displayLang = langNames[config.language] || 'English';
  console.log(infoRow('🌐', t('cli.ui.language'), displayLang, chalk.white));
  console.log(infoRow('🚀', t('cli.ui.startup'), startupModeLabel, chalk.white));
  if (snapshot?.startedAt) {
    const dt = new Date(snapshot.startedAt);
    const locales = { en: 'en-US', vi: 'vi-VN', zh: 'zh-CN' };
    const timeLocale = locales[config.language] || 'en-US';
    console.log(infoRow('⏰', t('cli.ui.startedAt'), dt.toLocaleTimeString(timeLocale), chalk.white));
  }
  if (session) {
    console.log(separator());
    console.log(infoRow('⚡', t('cli.ui.session'), `${session.preset}`, chalk.yellow));
    const shortCwd = session.cwd.length > 40 ? '...' + session.cwd.slice(-38) : session.cwd;
    console.log(infoRow('📁', t('cli.ui.directory'), shortCwd, chalk.gray));
  }
  if (snapshot?.lastError) {
    console.log(separator());
    console.log(infoRow('⚠️', t('cli.ui.error'), snapshot.lastError, chalk.red));
  }
  console.log('');
  console.log(chalk.bold.underline.blue('  ' + t('dashboard.menu').toUpperCase()));
}


async function executeUpgrade(latestVersion: string, language: AppLanguage): Promise<void> {
  let resolvedLang = language;
  try {
    resolvedLang = loadConfigFromDisk().language;
  } catch {
    // fallback
  }

  const t = createTranslator(resolvedLang);

  clearScreen();
  console.log(titleBox(t('cli.ui.upgrade.title')));
  console.log('');

  const platform = os.platform();
  if (platform === 'win32') {
    console.log(chalk.yellow(t('cli.ui.upgrade.opening')));

    const upgradingMsg = t('cli.ui.upgrade.upgrading', { version: latestVersion });
    const completeMsg = t('cli.ui.upgrade.complete');

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
    console.log(chalk.blue(t('cli.ui.upgrade.runningCmd')));
    try {
      execSync('npm install -g @quangnv13/nonstop@latest', { stdio: 'inherit' });
      console.log(chalk.green(t('cli.ui.upgrade.success')));
      await pause(resolvedLang);
      process.exit(0);
    } catch (error) {
      console.error(chalk.red(t('cli.ui.upgrade.failed')), error);
      await pause(resolvedLang);
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
  const initT = createTranslator(config.language);
  console.log(chalk.gray(`\n  ${initT('cli.ui.update.checking')} (v${currentVersion})...`));
  const latestVersion = await checkForUpdate(currentVersion);

  if (latestVersion) {
    clearScreen();
    let upgradeChoice = false;
    try {
      upgradeChoice = await runSelectionMenu(
        () => {
          console.log(titleBox(initT('cli.ui.update.available')));
          console.log('');
          console.log(`  ${initT('cli.ui.update.currentVersion')} ${chalk.yellow(currentVersion)}`);
          console.log(`  ${initT('cli.ui.update.latestVersion')} ${chalk.green(latestVersion)}`);
          console.log('');
          console.log(chalk.bold(`  ${initT('cli.ui.update.prompt')}`));
        },
        [
          { label: initT('cli.ui.update.yes'), value: true },
          { label: initT('cli.ui.update.no'), value: false }
        ],
        0,
        config.language
      );
    } catch (error) {
      if (!(error instanceof EscapePressedError)) {
        throw error;
      }
    }

    if (upgradeChoice) {
      await executeUpgrade(latestVersion, config.language);
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
      const toggleLabel = isRunning
        ? t('cli.ui.menu.stopBg')
        : t('cli.ui.menu.startBg');

      const options = [
        { label: toggleLabel, value: 'toggle' },
        { label: t('cli.ui.menu.listSessions'), value: 'sessions' },
        { label: t('menu.settings'), value: 'settings' },
        { label: t('menu.workspaces'), value: 'workspaces' },
        { label: t('menu.startup'), value: 'startup' },
        { label: t('menu.language'), value: 'language' },
        { label: t('menu.logs'), value: 'logs' },
        { label: t('menu.exit'), value: 'exit' }
      ];

      let choice;
      try {
        choice = await runSelectionMenu(
          () => renderDashboardHeader(config, getRuntimeStatus().snapshot),
          options,
          lastSelection,
          config.language
        );
      } catch (error) {
        if (error instanceof EscapePressedError) {
          continue;
        }
        throw error;
      }

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
    const t = createTranslator(config.language);
    console.log(chalk.gray(t('cli.ui.menu.exited')));
  }
}

async function manageActiveSessions(language: AppLanguage): Promise<void> {
  const t = createTranslator(language);

  while (true) {
    const status = getRuntimeStatus();
    const session = status.snapshot?.activeSession;

    const options: { label: string; value: { type: 'select' | 'back'; preset?: any; cwd?: string } }[] = [];

    if (status.running && session && session.status === 'running') {
      options.push({
        label: `🔗 Attach: [${session.preset.toUpperCase()}] ID: ${session.sessionId}`,
        value: { type: 'select', preset: session.preset, cwd: session.cwd }
      });
    }

    options.push({
      label: t('cli.ui.sessions.backToMenu'),
      value: { type: 'back' }
    });

    let choice;
    try {
      choice = await runSelectionMenu(
        () => {
          console.log(titleBox(t('cli.ui.sessions.title')));
          console.log('');
          if (!status.running) {
            console.log(chalk.yellow(t('cli.ui.sessions.notRunning')));
          } else if (!session || session.status !== 'running') {
            console.log(chalk.gray(t('cli.ui.sessions.noActive')));
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
    } catch (error) {
      if (error instanceof EscapePressedError) {
        return;
      }
      throw error;
    }

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
  let language = currentConfig.language;
  const initT = createTranslator(currentConfig.language);
  try {
    language = await runSelectionMenu(
      () => {
        console.log(titleBox(initT('cli.ui.setup.title')));
        console.log(chalk.gray(initT('cli.ui.setup.promptLang')));
      },
      [
        { label: 'English (en)', value: 'en' as AppLanguage },
        { label: 'Tiếng Việt (vi)', value: 'vi' as AppLanguage },
        { label: '中文 (zh)', value: 'zh' as AppLanguage }
      ],
      currentConfig.language === 'zh' ? 2 : (currentConfig.language === 'vi' ? 1 : 0),
      currentConfig.language
    );
  } catch (error) {
    if (!(error instanceof EscapePressedError)) {
      throw error;
    }
  }

  const t = createTranslator(language);

  clearScreen();
  console.log(titleBox(t('wizard.title')));
  console.log('');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'telegramBotToken',
      message: t('wizard.token'),
      default: currentConfig.telegramBotToken,
      theme: { prefix: '' }
    },
    {
      type: 'input',
      name: 'adminUsername',
      message: t('wizard.admin'),
      default: currentConfig.adminUsername,
      theme: { prefix: '' }
    },
    {
      type: 'input',
      name: 'clientName',
      message: t('wizard.clientName'),
      default: currentConfig.clientName,
      theme: { prefix: '' }
    }
  ]);

  let startupMode: StartupMode = 'disabled';
  try {
    startupMode = await runSelectionMenu(
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
  } catch (error) {
    if (!(error instanceof EscapePressedError)) {
      throw error;
    }
  }

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
  clearScreen();
  try {
    if (status.running) {
      const msg = stopBackgroundRuntime(status.snapshot, config.language);
      console.log(`\n${chalk.yellow(msg)}`);
      
      // Polling: chờ trạng thái thực sự tắt (tối đa 3 giây)
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 80));
        if (!getRuntimeStatus().running) break;
      }
    } else {
      const msg = startBackgroundRuntime(config.language);
      console.log(`\n${chalk.green(msg)}`);
      
      // Wait for daemon start and verify Telegram connection
      await waitForDaemonStart(config);
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
  const t = createTranslator(config.language);
  clearScreen();
  console.log(titleBox(t('cli.ui.config.edit')));
  console.log('');

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'telegramBotToken',
      message: 'TELEGRAM_BOT_TOKEN',
      default: config.telegramBotToken,
      theme: { prefix: '' }
    },
    {
      type: 'input',
      name: 'adminUsername',
      message: 'ADMIN_USERNAME',
      default: config.adminUsername,
      theme: { prefix: '' }
    },
    {
      type: 'input',
      name: 'clientName',
      message: 'CLIENT_NAME',
      default: config.clientName,
      theme: { prefix: '' }
    },
    {
      type: 'input',
      name: 'telegramUsername',
      message: 'TELEGRAM_USERNAME',
      default: config.telegramUsername,
      theme: { prefix: '' }
    },
    {
      type: 'input',
      name: 'codexCmd',
      message: 'CODEX_CMD',
      default: config.codexCmd,
      theme: { prefix: '' }
    },
    {
      type: 'input',
      name: 'antigravityCmd',
      message: 'ANTIGRAVITY_CMD',
      default: config.antigravityCmd,
      theme: { prefix: '' }
    },
    {
      type: 'input',
      name: 'claudeCmd',
      message: 'CLAUDE_CMD',
      default: config.claudeCmd,
      theme: { prefix: '' }
    },
    {
      type: 'input',
      name: 'dangerousCommandConfirm',
      message: 'DANGEROUS_COMMAND_CONFIRM',
      default: config.dangerousCommandConfirm,
      theme: { prefix: '' }
    },
    {
      type: 'input',
      name: 'logRetentionDays',
      message: t('cli.ui.config.logRetentionDays'),
      default: String(config.logRetentionDays),
      validate: (input) => {
        const val = parseInt(input, 10);
        return Number.isInteger(val) && val >= 1 ? true : t('cli.ui.config.logRetentionDays.invalid');
      },
      theme: { prefix: '' }
    },
    {
      type: 'confirm',
      name: 'logRotationHourly',
      message: t('cli.ui.config.logRotationHourly'),
      default: config.logRotationHourly,
      theme: { prefix: '' }
    }
  ]);

  const nextConfig: AppConfig = {
    ...config,
    ...answers,
    logRetentionDays: parseInt(answers.logRetentionDays, 10)
  };

  const tokenChanged = config.telegramBotToken !== nextConfig.telegramBotToken;
  saveConfigToDisk(nextConfig);
  console.log(`\n${chalk.green(t('cli.ui.config.saved'))}`);

  const status = getRuntimeStatus();
  if (tokenChanged && status.running) {
    const confirmRestart = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'restart',
        message: t('cli.ui.config.tokenChangedPrompt'),
        default: true,
        theme: { prefix: '' }
      }
    ]);

    if (confirmRestart.restart) {
      try {
        const oldPid = status.snapshot?.pid;
        stopBackgroundRuntime(status.snapshot, config.language);
        startBackgroundRuntime(nextConfig.language);
        await waitForDaemonStart(nextConfig, oldPid);
      } catch (error) {
        console.log(`\n${chalk.red(error instanceof Error ? error.message : String(error))}`);
        await pause(nextConfig.language);
      }
    } else {
      console.log(chalk.gray(t('cli.ui.config.tokenChangedWarn')));
      await pause(nextConfig.language);
    }
  } else {
    await pause(config.language);
  }

  return nextConfig;
}

async function manageWorkspaces(
  language: AppLanguage
): Promise<void> {
  const t = createTranslator(language);

  while (true) {
    const workspaces = loadWorkspaces();
    const options: { label: string; value: { type: 'add' | 'workspace' | 'back'; index?: number } }[] = [
      { label: t('cli.ui.workspaces.addNew'), value: { type: 'add' } },
      ...workspaces.map((ws, i) => ({
        label: `📁 ${ws.name}  ${chalk.gray(ws.path.length > 30 ? '...' + ws.path.slice(-28) : ws.path)}`,
        value: { type: 'workspace' as const, index: i }
      })),
      { label: t('cli.ui.sessions.backToMenu'), value: { type: 'back' } }
    ];

    let selection;
    try {
      selection = await runSelectionMenu(
        () => {
          console.log(titleBox(t('cli.ui.workspaces.title')));
          console.log('');
          if (workspaces.length === 0) {
            console.log(chalk.gray(t('cli.ui.workspaces.noWorkspaces')));
          } else {
            const table = new Table({
              head: [chalk.cyan(t('cli.ui.workspaces.tableNo')), chalk.cyan(t('cli.workspace.name')), chalk.cyan(t('cli.workspace.path'))],
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
          console.log(chalk.gray(`  ${t('cli.ui.workspaces.select')}`));
        },
        options,
        0,
        language
      );
    } catch (error) {
      if (error instanceof EscapePressedError) {
        return;
      }
      throw error;
    }

    if (selection.type === 'back') return;

    if (selection.type === 'add') {
      clearScreen();
      console.log(titleBox(t('cli.ui.workspaces.add')));
      console.log('');

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: t('cli.ui.workspaces.name'),
          default: 'Workspace',
          theme: { prefix: '' }
        },
        {
          type: 'input',
          name: 'rawPath',
          message: t('cli.ui.workspaces.path'),
          validate: (input) => input.trim() ? true : t('cli.ui.workspaces.pathEmpty'),
          theme: { prefix: '' }
        }
      ]);
      const name = answers.name.trim();
      const rawPath = answers.rawPath.trim();

      const resolvedPath = path.resolve(rawPath);
      if (!fs.existsSync(resolvedPath)) {
        console.log(chalk.yellow(`  ⚠ ${t('cli.ui.workspaces.pathNotExist')}`));
      }

      workspaces.push({ id: createWorkspaceId(), name: name || 'Workspace', path: resolvedPath });
      saveWorkspaces(workspaces);
      console.log(chalk.green(`\n  ✓ ${t('cli.ui.workspaces.added')}`));
      await pause(language);
      continue;
    }

    if (selection.type === 'workspace' && typeof selection.index === 'number') {
      const idx = selection.index;
      const ws = workspaces[idx];

      let action;
      try {
        action = await runSelectionMenu(
          () => {
            console.log(titleBox(t('cli.ui.workspaces.actions')));
            console.log(chalk.gray(`  ${t('cli.ui.workspaces.selected')} `) + chalk.bold(ws.name));
            console.log(chalk.gray(`  ${t('cli.ui.workspaces.path')} `) + ws.path);
          },
          [
            { label: t('cli.ui.workspaces.edit'), value: 'edit' },
            { label: t('cli.ui.workspaces.delete'), value: 'delete' },
            { label: t('cli.ui.workspaces.back'), value: 'back' }
          ],
          0,
          language
        );
      } catch (error) {
        if (error instanceof EscapePressedError) {
          continue;
        }
        throw error;
      }

      if (action === 'back') continue;

      if (action === 'delete') {
        workspaces.splice(idx, 1);
        saveWorkspaces(workspaces);
        clearScreen();
        console.log(chalk.green(`\n  ✓ ${t('cli.ui.workspaces.deleted')}`));
        await pause(language);
        continue;
      }

      if (action === 'edit') {
        clearScreen();
        console.log(titleBox(t('cli.ui.workspaces.editTitle')));
        console.log('');

        const newAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: t('cli.ui.workspaces.newName'),
            default: ws.name,
            theme: { prefix: '' }
          },
          {
            type: 'input',
            name: 'path',
            message: t('cli.ui.workspaces.newPath'),
            default: ws.path,
            validate: (input) => input.trim() ? true : t('cli.ui.workspaces.newPathEmpty'),
            theme: { prefix: '' }
          }
        ]);
        const newName = newAnswers.name.trim();
        const newPath = newAnswers.path.trim();

        const resolvedPath = path.resolve(newPath);
        if (!fs.existsSync(resolvedPath)) {
          console.log(chalk.yellow(`  ⚠ ${t('cli.ui.workspaces.newPathNotExist')}`));
        }
        workspaces[idx] = { ...ws, name: newName || ws.name, path: resolvedPath };
        saveWorkspaces(workspaces);
        console.log(chalk.green(`\n  ✓ ${t('cli.ui.workspaces.updated')}`));
        await pause(language);
        continue;
      }
    }
  }
}

async function configureStartup(
  config: AppConfig
): Promise<AppConfig> {
  const t = createTranslator(config.language);

  let nextMode;
  try {
    nextMode = await runSelectionMenu(
      () => {
        console.log(titleBox(t('cli.ui.startup.title')));
        console.log(chalk.gray(`  ${t('cli.ui.startup.currentMode')} ${config.startupMode}`));
      },
      [
        { label: t('cli.ui.startup.disabledLabel'), value: 'disabled' as StartupMode },
        { label: t('cli.ui.startup.backgroundLabel'), value: 'background' as StartupMode },
        { label: t('cli.ui.startup.openUiLabel'), value: 'open-ui' as StartupMode },
        { label: t('cli.ui.workspaces.back'), value: 'back' as any }
      ],
      ['disabled', 'background', 'open-ui'].indexOf(config.startupMode),
      config.language
    );
  } catch (error) {
    if (error instanceof EscapePressedError) {
      return config;
    }
    throw error;
  }

  if (nextMode === ('back' as any)) {
    return config;
  }

  const entryScriptPath = getEntryScriptPath();
  const result = applyStartupMode(nextMode, entryScriptPath, process.cwd(), config.language);
  const nextConfig = { ...config, startupMode: nextMode };
  saveConfigToDisk(nextConfig);

  clearScreen();
  console.log(titleBox(t('cli.ui.startup.title')));
  console.log(`\n${chalk.green(result)}`);
  await pause(config.language);
  return nextConfig;
}

async function switchLanguage(
  config: AppConfig
): Promise<AppConfig> {
  const t = createTranslator(config.language);
  let language;
  try {
    language = await runSelectionMenu(
      () => {
        console.log(titleBox(t('cli.ui.language.switch')));
        console.log(chalk.gray(`  ${t('cli.ui.language.current')} ${config.language}`));
      },
      [
        { label: 'English (en)', value: 'en' as AppLanguage },
        { label: 'Tiếng Việt (vi)', value: 'vi' as AppLanguage },
        { label: '中文 (zh)', value: 'zh' as AppLanguage },
        { label: t('cli.ui.workspaces.back'), value: 'back' as any }
      ],
      config.language === 'zh' ? 2 : (config.language === 'vi' ? 1 : 0),
      config.language
    );
  } catch (error) {
    if (error instanceof EscapePressedError) {
      return config;
    }
    throw error;
  }

  if (language === ('back' as any) || language === config.language) {
    return config;
  }

  clearScreen();
  console.log(titleBox(t('cli.ui.language.warningTitle')));
  console.log('');
  
  const warningMsg = t('cli.ui.language.warningMsg');
  const lines = warningMsg.split('\n');
  lines.forEach((line, idx) => {
    if (idx === lines.length - 1) {
      console.log(chalk.yellow(line));
    } else {
      console.log(chalk.red(line));
    }
  });
  console.log('');

  const confirmAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: t('cli.ui.language.confirm'),
      default: false,
      theme: { prefix: '' }
    }
  ]);

  if (!confirmAnswer.proceed) {
    return config;
  }

  const nextConfig = { ...config, language };
  saveConfigToDisk(nextConfig);

  const status = getRuntimeStatus();
  if (status.running) {
    try {
      const oldPid = status.snapshot?.pid;
      stopBackgroundRuntime(status.snapshot, config.language);
      startBackgroundRuntime(language);
      await waitForDaemonStart(nextConfig, oldPid);
    } catch {
      // ignore
    }
  }

  return nextConfig;
}

async function showRecentLogs(language: AppLanguage): Promise<void> {
  const t = createTranslator(language);
  clearScreen();
  console.log(titleBox(t('cli.ui.logs.title')));

  const lines = getRecentLogLines(25);
  if (lines.length === 0) {
    console.log(chalk.gray(t('cli.ui.logs.empty')));
    await pause(language);
    return;
  }

  console.log('\n' + lines.map(l => chalk.gray('  ') + l).join('\n'));
  await pause(language);
}

export async function attachToBackgroundSession(
  preset: string,
  cwd: string,
  language: AppLanguage
): Promise<void> {
  const t = createTranslator(language);
  const socketPath = getIpcSocketPath();

  clearScreen();
  console.log(chalk.blue(t('cli.ui.sessionAttach.connecting')));

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
      console.log(chalk.bold.green(
        t('cli.ui.sessionAttach.connected', { preset: preset.toUpperCase() })
      ));
      console.log(chalk.gray(
        t('cli.ui.sessionAttach.detachHint')
      ));
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
          console.log(chalk.yellow(t('cli.ui.sessionAttach.detaching')));
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
              console.log(chalk.yellow(t('cli.ui.sessionAttach.exited', { code: msg.code })));
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
      console.log(chalk.red(t('cli.ui.sessionAttach.ipcError', { error: err.message })));
      pause(language).then(cleanup);
    });

    socket.on('close', () => {
      if (isClosed) return;
      console.log(chalk.gray(t('cli.ui.sessionAttach.disconnected')));
      pause(language).then(cleanup);
    });
  });
}
