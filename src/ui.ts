import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import pc from 'picocolors';
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
import { getRuntimeStatus, startBackgroundRuntime, stopBackgroundRuntime } from './runtime-manager.js';
import { applyStartupMode } from './startup.js';
import { loadWorkspaces, saveWorkspaces, createWorkspaceId } from './store.js';
import { RuntimeStateSnapshot } from './runtime-state.js';
import { Workspace } from './types.js';

interface Option<T> {
  label: string;
  value: T;
}

/**
 * Renders an interactive CLI selection menu with arrow keys.
 * Ensures raw mode and cursor visibility are properly restored in try-finally.
 */
async function runSelectionMenu<T>(
  headerRenderer: () => void,
  options: Option<T>[],
  initialIndex: number = 0
): Promise<T> {
  let selectedIndex = initialIndex;
  
  return new Promise<T>((resolve, reject) => {
    const isTTY = process.stdin.isTTY;
    const wasRaw = process.stdin.isRaw;
    
    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      // Restore cursor visibility
      process.stdout.write('\u001b[?25h');
      if (isTTY) {
        try {
          process.stdin.setRawMode(wasRaw);
        } catch {
          // Ignore
        }
      }
    };

    function render() {
      clearScreen();
      headerRenderer();
      options.forEach((opt, idx) => {
        if (idx === selectedIndex) {
          // Premium visually highlight: cyan chevron and bold cyan label
          console.log(`  ${pc.cyan('❯')} ${pc.bold(pc.cyan(opt.label))}`);
        } else {
          console.log(`    ${pc.gray(opt.label)}`);
        }
      });
    }

    try {
      readline.emitKeypressEvents(process.stdin);
      if (isTTY) {
        process.stdin.setRawMode(true);
      }
      // Hide cursor for cleaner interaction
      process.stdout.write('\u001b[?25l');
    } catch (err) {
      cleanup();
      reject(err);
      return;
    }

    render();

    function onKeypress(str: string, key: any) {
      if (key && key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      }

      if (key) {
        if (key.name === 'up') {
          selectedIndex = (selectedIndex - 1 + options.length) % options.length;
          render();
        } else if (key.name === 'down') {
          selectedIndex = (selectedIndex + 1) % options.length;
          render();
        } else if (key.name === 'return' || key.name === 'enter') {
          cleanup();
          resolve(options[selectedIndex].value);
        }
      }
    }

    process.stdin.on('keypress', onKeypress);
  });
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

    const rl = createInterface({ input, output });

    try {
      let lastSelection = 0;
      while (true) {
        const t = createTranslator(config.language);
        const isRunning = getRuntimeStatus().running;
        const toggleLabel = config.language === 'vi'
          ? (isRunning ? 'Tắt runtime nền' : 'Bật runtime nền')
          : (isRunning ? 'Stop background runtime' : 'Start background runtime');

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

        if (choice === 'exit') {
          break;
        }

        if (choice === 'toggle') {
          await handleToggleRuntime(config, rl);
          continue;
        }

        if (choice === 'settings') {
          config = await editConfig(config, rl);
          continue;
        }

        if (choice === 'workspaces') {
          await manageWorkspaces(rl, config.language);
          continue;
        }

        if (choice === 'startup') {
          config = await configureStartup(config, rl);
          continue;
        }

        if (choice === 'language') {
          config = await switchLanguage(config, rl);
          continue;
        }

        if (choice === 'logs') {
          await showRecentLogs(rl);
          continue;
        }
      }
    } finally {
      rl.close();
    }
  } finally {
    // Ultimate fallback cleanup to guarantee terminal usability
    process.stdout.write('\u001b[?25h');
    if (isTTY) {
      try {
        process.stdin.setRawMode(wasRaw);
      } catch {
        // Ignore
      }
    }
  }
}

async function runSetupWizard(currentConfig: AppConfig): Promise<AppConfig> {
  const languageOptions = [
    { label: 'English (en)', value: 'en' as AppLanguage },
    { label: 'Tiếng Việt (vi)', value: 'vi' as AppLanguage }
  ];
  
  const language = await runSelectionMenu(
    () => {
      console.log(titleBlock('nonstop setup wizard'));
      console.log(`${pc.gray('Choose language / Chon ngon ngu:')}\n`);
    },
    languageOptions,
    currentConfig.language === 'vi' ? 1 : 0
  );

  const t = createTranslator(language);
  const rl = createInterface({ input, output });

  try {
    clearScreen();
    console.log(titleBlock(t('wizard.title')));

    const telegramBotToken = await askWithDefault(rl, t('wizard.token'), currentConfig.telegramBotToken);
    const adminUsername = await askWithDefault(rl, t('wizard.admin'), currentConfig.adminUsername);
    const clientName = await askWithDefault(rl, t('wizard.clientName'), currentConfig.clientName);

    rl.close(); // Temporarily close rl for the next interactive selection

    const startupOptions: { label: string; value: StartupMode }[] = [
      { label: `${t('startup.disabled')} (disabled)`, value: 'disabled' },
      { label: `${t('startup.background')} (background)`, value: 'background' },
      { label: `${t('startup.openUi')} (open-ui)`, value: 'open-ui' }
    ];

    const startupMode = await runSelectionMenu(
      () => {
        console.log(titleBlock(t('wizard.title')));
        console.log(`${pc.gray(t('wizard.startupMode') + ':')}\n`);
      },
      startupOptions,
      startupOptions.findIndex(opt => opt.value === currentConfig.startupMode) !== -1
        ? startupOptions.findIndex(opt => opt.value === currentConfig.startupMode)
        : 0
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

    // Recreate rl to call pause()
    const rl2 = createInterface({ input, output });
    try {
      clearScreen();
      console.log(titleBlock(t('wizard.title')));
      console.log(`\n${pc.green(t('wizard.complete'))}`);
      await pause(rl2);
    } finally {
      rl2.close();
    }

    return nextConfig;
  } finally {
    rl.close();
  }
}

function formatBoxLine(
  label: string,
  value: string,
  colorFn: (str: string) => string = (s) => s,
  borderColor = pc.cyan
): string {
  const labelWidth = 10;
  const interiorWidth = 60;
  
  // Format label to be 10 chars, left aligned
  const paddedLabel = label.padEnd(labelWidth, ' ');
  const colorizedLabel = pc.gray(paddedLabel);
  
  // Check if value fits. If it's too long, truncate it.
  const maxValueLength = interiorWidth - labelWidth - 6; // 2 left spaces, 2 right spaces, ': ' is 2 chars
  let displayValue = value;
  if (displayValue.length > maxValueLength) {
    displayValue = displayValue.slice(0, maxValueLength - 3) + '...';
  }
  
  const colorizedValue = colorFn(displayValue);
  
  // We need to calculate how many spaces we need to pad the line.
  // Visual length of left side = 2 (spaces) + labelWidth + 2 (': ') = 14.
  // Visual length of value = displayValue.length.
  // Total visual length = 14 + displayValue.length.
  // Padding spaces at the end = interiorWidth - totalVisualLength - 2 (spaces on right)
  const paddingRight = interiorWidth - 14 - displayValue.length - 2;
  const rightSpaces = ' '.repeat(Math.max(0, paddingRight));
  
  return borderColor('│') + '  ' + colorizedLabel + pc.gray(': ') + colorizedValue + '  ' + rightSpaces + borderColor('│');
}

function renderDashboardHeader(config: AppConfig, snapshot: RuntimeStateSnapshot | null): void {
  const t = createTranslator(config.language);
  const runtimeStatus = snapshot ? t('dashboard.running') : t('dashboard.stopped');
  const runtimeColor = snapshot ? pc.green : pc.red;
  const started = snapshot?.startedAt || '-';
  const session = snapshot?.activeSession;

  const interiorWidth = 60;
  console.log(pc.cyan(`┌${'─'.repeat(interiorWidth)}┐`));
  
  // Title
  const titleStr = t('dashboard.title');
  const padLeft = Math.floor((interiorWidth - titleStr.length) / 2);
  const padRight = interiorWidth - titleStr.length - padLeft;
  console.log(pc.cyan('│') + ' '.repeat(padLeft) + pc.bold(pc.cyan(titleStr)) + ' '.repeat(padRight) + pc.cyan('│'));
  
  // Divider
  console.log(pc.cyan(`├${'─'.repeat(interiorWidth)}┤`));
  
  // Fields
  const statusStr = snapshot ? `${runtimeStatus} (${snapshot.mode || '-'})` : runtimeStatus;
  console.log(formatBoxLine('Runtime', statusStr, runtimeColor));
  console.log(formatBoxLine('Client', config.clientName, pc.white));
  console.log(formatBoxLine('Admin', config.adminUsername || '-', pc.white));
  console.log(formatBoxLine('Language', config.language, pc.white));
  console.log(formatBoxLine('Startup', config.startupMode, pc.white));
  console.log(formatBoxLine('Started', started, pc.white));
  
  const sessionStr = session ? `${session.preset} | ${session.cwd}` : '-';
  console.log(formatBoxLine('Session', sessionStr, pc.white));

  if (snapshot?.lastError) {
    console.log(formatBoxLine('Error', snapshot.lastError, pc.yellow));
  }
  
  // Bottom border
  console.log(pc.cyan(`└${'─'.repeat(interiorWidth)}┘`));
  
  console.log(`\n${pc.bold(pc.blue(t('dashboard.menu')))}`);
}

async function handleToggleRuntime(
  config: AppConfig,
  rl: ReturnType<typeof createInterface>
): Promise<void> {
  const status = getRuntimeStatus();
  const targetState = !status.running;
  try {
    if (status.running) {
      console.log(`\n${pc.yellow(stopBackgroundRuntime(status.snapshot))}`);
    } else {
      console.log(`\n${pc.green(startBackgroundRuntime())}`);
    }

    // Polling loop to wait until status matches the target state
    const startTime = Date.now();
    while (getRuntimeStatus().running !== targetState && Date.now() - startTime < 1500) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } catch (error) {
    console.log(`\n${pc.red(error instanceof Error ? error.message : String(error))}`);
  }

  await pause(rl);
}

async function editConfig(
  config: AppConfig,
  rl: ReturnType<typeof createInterface>
): Promise<AppConfig> {
  clearScreen();
  console.log(titleBlock(config.language === 'vi' ? 'Sua cau hinh' : 'Edit config'));
  
  const nextConfig: AppConfig = {
    ...config,
    telegramBotToken: await askWithDefault(rl, 'TELEGRAM_BOT_TOKEN', config.telegramBotToken),
    adminUsername: await askWithDefault(rl, 'ADMIN_USERNAME', config.adminUsername),
    clientName: await askWithDefault(rl, 'CLIENT_NAME', config.clientName),
    telegramUsername: await askWithDefault(rl, 'TELEGRAM_USERNAME', config.telegramUsername),
    codexCmd: await askWithDefault(rl, 'CODEX_CMD', config.codexCmd),
    antigravityCmd: await askWithDefault(rl, 'ANTIGRAVITY_CMD', config.antigravityCmd)
  };

  saveConfigToDisk(nextConfig);
  const t = createTranslator(nextConfig.language);
  console.log(`\n${pc.green(t('settings.saved'))}`);
  console.log(pc.gray('Restart background runtime if it is already running to apply all changes.'));
  await pause(rl);
  return nextConfig;
}

async function manageWorkspaces(
  rl: ReturnType<typeof createInterface>,
  language: AppLanguage
): Promise<void> {
  const isVi = language === 'vi';
  
  while (true) {
    const workspaces = loadWorkspaces();
    const options: { label: string; value: { type: 'add' | 'workspace' | 'back'; index?: number } }[] = [];
    
    // Add option
    options.push({
      label: isVi ? '+ Them workspace moi' : '+ Add new workspace',
      value: { type: 'add' }
    });

    // Workspace options
    workspaces.forEach((workspace, index) => {
      options.push({
        label: `● ${workspace.name} (${workspace.path})`,
        value: { type: 'workspace', index }
      });
    });

    // Back option
    options.push({
      label: isVi ? '← Quay lai menu chinh' : '← Back to main menu',
      value: { type: 'back' }
    });

    const titleText = isVi ? 'Quan ly workspace' : 'Manage workspaces';

    const selection = await runSelectionMenu(
      () => {
        console.log(titleBlock(titleText));
        console.log(`${pc.gray(isVi ? 'Chon workspace de chinh sua/xoa hoac tao moi:' : 'Select a workspace to edit/delete or add new:')}\n`);
      },
      options
    );

    if (selection.type === 'back') {
      return;
    }

    if (selection.type === 'add') {
      clearScreen();
      console.log(titleBlock(isVi ? 'Them workspace moi' : 'Add new workspace'));
      const name = (await rl.question(isVi ? 'Ten workspace: ' : 'Workspace name: ')).trim();
      const rawPath = (await rl.question(isVi ? 'Duong dan workspace: ' : 'Workspace path: ')).trim();
      
      if (!rawPath) {
        console.log(`${pc.red(isVi ? 'Duong dan khong the de trong.' : 'Path cannot be empty.')}`);
        await pause(rl);
        continue;
      }

      const resolvedPath = path.resolve(rawPath);
      if (!fs.existsSync(resolvedPath)) {
        console.log(`\n${pc.yellow(isVi ? 'Canh bao' : 'Warning')}: ${pc.gray(isVi ? 'Duong dan khong ton tai tren dia' : 'Path does not exist on disk')}: "${resolvedPath}"`);
      }

      workspaces.push({
        id: createWorkspaceId(),
        name: name || 'Workspace',
        path: resolvedPath
      });
      saveWorkspaces(workspaces);
      console.log(`\n${pc.green(isVi ? 'Da them workspace.' : 'Workspace added.')}`);
      await pause(rl);
      continue;
    }

    if (selection.type === 'workspace' && typeof selection.index === 'number') {
      const idx = selection.index;
      const workspace = workspaces[idx];
      
      const subOptions = [
        { label: isVi ? 'Sua workspace' : 'Edit workspace', value: 'edit' },
        { label: isVi ? 'Xoa workspace' : 'Delete workspace', value: 'delete' },
        { label: isVi ? '← Quay lai' : '← Back', value: 'back' }
      ];

      const action = await runSelectionMenu(
        () => {
          console.log(titleBlock(isVi ? 'Thao tac workspace' : 'Workspace Actions'));
          console.log(`${pc.gray(isVi ? 'Workspace dang chon:' : 'Selected Workspace:')} ${pc.bold(workspace.name)}`);
          console.log(`${pc.gray(isVi ? 'Duong dan:' : 'Path:')} ${workspace.path}\n`);
        },
        subOptions
      );

      if (action === 'back') {
        continue;
      }

      if (action === 'delete') {
        workspaces.splice(idx, 1);
        saveWorkspaces(workspaces);
        clearScreen();
        console.log(titleBlock(isVi ? 'Xoa workspace' : 'Delete workspace'));
        console.log(`\n${pc.green(isVi ? 'Da xoa workspace.' : 'Workspace deleted.')}`);
        await pause(rl);
        continue;
      }

      if (action === 'edit') {
        clearScreen();
        console.log(titleBlock(isVi ? 'Sua workspace' : 'Edit workspace'));
        const newName = await askWithDefault(rl, isVi ? 'Ten workspace moi' : 'New workspace name', workspace.name);
        const newPath = await askWithDefault(rl, isVi ? 'Duong dan workspace moi' : 'New workspace path', workspace.path);
        
        const resolvedPath = path.resolve(newPath.trim());
        if (!fs.existsSync(resolvedPath)) {
          console.log(`\n${pc.yellow(isVi ? 'Canh bao' : 'Warning')}: ${pc.gray(isVi ? 'Duong dan khong ton tai tren dia' : 'Path does not exist on disk')}: "${resolvedPath}"`);
        }

        workspaces[idx] = {
          ...workspace,
          name: newName.trim() || workspace.name,
          path: resolvedPath
        };
        saveWorkspaces(workspaces);
        console.log(`\n${pc.green(isVi ? 'Da cap nhat workspace.' : 'Workspace updated.')}`);
        await pause(rl);
        continue;
      }
    }
  }
}

async function configureStartup(
  config: AppConfig,
  rl: ReturnType<typeof createInterface>
): Promise<AppConfig> {
  const t = createTranslator(config.language);
  const options: { label: string; value: StartupMode }[] = [
    { label: `${t('startup.disabled')} (disabled)`, value: 'disabled' },
    { label: `${t('startup.background')} (background)`, value: 'background' },
    { label: `${t('startup.openUi')} (open-ui)`, value: 'open-ui' }
  ];

  const initialIndex = options.findIndex(opt => opt.value === config.startupMode) !== -1
    ? options.findIndex(opt => opt.value === config.startupMode)
    : 0;

  const titleText = config.language === 'vi' ? 'Cau hinh khoi dong' : 'Configure startup';

  const nextMode = await runSelectionMenu(
    () => {
      console.log(titleBlock(titleText));
      console.log(`${pc.gray('Current startup mode:')} ${config.startupMode}\n`);
    },
    options,
    initialIndex
  );

  const entryScriptPath = path.join(process.cwd(), 'dist', 'index.js');
  const result = applyStartupMode(nextMode, entryScriptPath, process.cwd());
  const nextConfig = { ...config, startupMode: nextMode };
  saveConfigToDisk(nextConfig);

  clearScreen();
  console.log(titleBlock(titleText));
  console.log(`\n${pc.green(result)}`);
  await pause(rl);
  return nextConfig;
}

async function switchLanguage(
  config: AppConfig,
  rl: ReturnType<typeof createInterface>
): Promise<AppConfig> {
  const options: { label: string; value: AppLanguage }[] = [
    { label: 'English (en)', value: 'en' },
    { label: 'Tiếng Việt (vi)', value: 'vi' }
  ];

  const initialIndex = options.findIndex(opt => opt.value === config.language) !== -1
    ? options.findIndex(opt => opt.value === config.language)
    : 0;

  const titleText = config.language === 'vi' ? 'Chon ngon ngu' : 'Switch language';

  const language = await runSelectionMenu(
    () => {
      console.log(titleBlock(titleText));
      console.log(`${pc.gray('Current language:')} ${config.language}\n`);
    },
    options,
    initialIndex
  );

  const nextConfig = { ...config, language };
  saveConfigToDisk(nextConfig);
  return nextConfig;
}

async function showRecentLogs(rl: ReturnType<typeof createInterface>): Promise<void> {
  clearScreen();
  console.log(titleBlock('Recent logs'));
  const logPath = path.join(process.cwd(), 'data', 'nonstop.log');
  if (!fs.existsSync(logPath)) {
    console.log('No logs yet.');
    await pause(rl);
    return;
  }

  const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-20);
  console.log(lines.join('\n'));
  await pause(rl);
}

async function askWithDefault(
  rl: ReturnType<typeof createInterface>,
  label: string,
  currentValue: string
): Promise<string> {
  const prompt = `${pc.bold(label)}${currentValue ? pc.gray(` [${currentValue}]`) : ''}: `;
  const answer = await rl.question(prompt);
  return answer.trim() || currentValue;
}

function titleBlock(title: string): string {
  const interiorWidth = 60;
  const padLeft = Math.floor((interiorWidth - title.length) / 2);
  const padRight = interiorWidth - title.length - padLeft;
  const titleLine = ' '.repeat(padLeft) + pc.bold(pc.cyan(title)) + ' '.repeat(padRight);
  return (
    pc.cyan(`┌${'─'.repeat(interiorWidth)}┐\n`) +
    pc.cyan('│') + titleLine + pc.cyan('│\n') +
    pc.cyan(`└${'─'.repeat(interiorWidth)}┘`)
  );
}

function clearScreen(): void {
  output.write('\u001b[2J\u001b[0;0H');
}

async function pause(rl: ReturnType<typeof createInterface>): Promise<void> {
  await rl.question(`\n${pc.gray('Press Enter to continue...')}`);
}

