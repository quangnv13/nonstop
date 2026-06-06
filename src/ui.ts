import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
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

const COLORS = {
  reset: '\u001b[0m',
  cyan: '\u001b[36m',
  blue: '\u001b[34m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  gray: '\u001b[90m',
  bold: '\u001b[1m'
};

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
          // Premium visually highlight: cyan arrow and bold cyan label
          console.log(`  ${COLORS.cyan}➔ ${COLORS.bold}${COLORS.cyan}${opt.label}${COLORS.reset}`);
        } else {
          console.log(`     ${COLORS.gray}${opt.label}${COLORS.reset}`);
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
        const options = [
          { label: t('menu.toggleRuntime'), value: 'toggle' },
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
      console.log(`${COLORS.gray}Choose language / Chon ngon ngu:${COLORS.reset}\n`);
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
        console.log(`${COLORS.gray}${t('wizard.startupMode')}:${COLORS.reset}\n`);
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
      console.log(`\n${COLORS.green}${t('wizard.complete')}${COLORS.reset}`);
      await pause(rl2);
    } finally {
      rl2.close();
    }

    return nextConfig;
  } finally {
    rl.close();
  }
}

function renderDashboardHeader(config: AppConfig, snapshot: RuntimeStateSnapshot | null): void {
  const t = createTranslator(config.language);
  const runtimeStatus = snapshot ? t('dashboard.running') : t('dashboard.stopped');
  const runtimeColor = snapshot ? COLORS.green : COLORS.red;
  const started = snapshot?.startedAt || '-';
  const session = snapshot?.activeSession;

  console.log(titleBlock(t('dashboard.title')));
  console.log(`${COLORS.gray}Project:${COLORS.reset} ${COLORS.bold}nonstop${COLORS.reset}`);
  console.log(
    `${COLORS.gray}Runtime:${COLORS.reset} ${runtimeColor}${runtimeStatus}${COLORS.reset}    ${COLORS.gray}Mode:${COLORS.reset} ${snapshot?.mode || '-'}`
  );
  console.log(`${COLORS.gray}Client:${COLORS.reset} ${config.clientName}`);
  console.log(`${COLORS.gray}Admin:${COLORS.reset} ${config.adminUsername || '-'}`);
  console.log(`${COLORS.gray}Language:${COLORS.reset} ${config.language}`);
  console.log(`${COLORS.gray}Startup:${COLORS.reset} ${config.startupMode}`);
  console.log(`${COLORS.gray}Started:${COLORS.reset} ${started}`);
  console.log(
    `${COLORS.gray}Session:${COLORS.reset} ${
      session ? `${session.preset} | ${session.cwd}` : '-'
    }`
  );

  if (snapshot?.lastError) {
    console.log(`${COLORS.yellow}Last error:${COLORS.reset} ${snapshot.lastError}`);
  }

  console.log(`\n${COLORS.blue}${t('dashboard.menu')}${COLORS.reset}`);
}

async function handleToggleRuntime(
  config: AppConfig,
  rl: ReturnType<typeof createInterface>
): Promise<void> {
  const status = getRuntimeStatus();
  try {
    if (status.running) {
      console.log(`\n${COLORS.yellow}${stopBackgroundRuntime(status.snapshot)}${COLORS.reset}`);
    } else {
      console.log(`\n${COLORS.green}${startBackgroundRuntime()}${COLORS.reset}`);
    }
  } catch (error) {
    console.log(`\n${COLORS.red}${error instanceof Error ? error.message : String(error)}${COLORS.reset}`);
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
  console.log(`\n${COLORS.green}${createTranslator(nextConfig.language)('settings.saved')}${COLORS.reset}`);
  console.log(`${COLORS.gray}Restart background runtime if it is already running to apply all changes.${COLORS.reset}`);
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
        console.log(`${COLORS.gray}${isVi ? 'Chon workspace de chinh sua/xoa hoac tao moi:' : 'Select a workspace to edit/delete or add new:'}${COLORS.reset}\n`);
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
        console.log(`${COLORS.red}${isVi ? 'Duong dan khong the de trong.' : 'Path cannot be empty.'}${COLORS.reset}`);
        await pause(rl);
        continue;
      }

      const resolvedPath = path.resolve(rawPath);
      if (!fs.existsSync(resolvedPath)) {
        console.log(`\n${COLORS.yellow}${isVi ? 'Canh bao' : 'Warning'}: ${isVi ? 'Duong dan khong ton tai tren dia' : 'Path does not exist on disk'}: "${resolvedPath}"${COLORS.reset}`);
      }

      workspaces.push({
        id: createWorkspaceId(),
        name: name || 'Workspace',
        path: resolvedPath
      });
      saveWorkspaces(workspaces);
      console.log(`\n${COLORS.green}${isVi ? 'Da them workspace.' : 'Workspace added.'}${COLORS.reset}`);
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
          console.log(`${COLORS.gray}${isVi ? 'Workspace dang chon:' : 'Selected Workspace:'}${COLORS.reset} ${COLORS.bold}${workspace.name}${COLORS.reset}`);
          console.log(`${COLORS.gray}${isVi ? 'Duong dan:' : 'Path:'}${COLORS.reset} ${workspace.path}\n`);
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
        console.log(`\n${COLORS.green}${isVi ? 'Da xoa workspace.' : 'Workspace deleted.'}${COLORS.reset}`);
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
          console.log(`\n${COLORS.yellow}${isVi ? 'Canh bao' : 'Warning'}: ${isVi ? 'Duong dan khong ton tai tren dia' : 'Path does not exist on disk'}: "${resolvedPath}"${COLORS.reset}`);
        }

        workspaces[idx] = {
          ...workspace,
          name: newName.trim() || workspace.name,
          path: resolvedPath
        };
        saveWorkspaces(workspaces);
        console.log(`\n${COLORS.green}${isVi ? 'Da cap nhat workspace.' : 'Workspace updated.'}${COLORS.reset}`);
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
      console.log(`${COLORS.gray}Current startup mode:${COLORS.reset} ${config.startupMode}\n`);
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
  console.log(`\n${COLORS.green}${result}${COLORS.reset}`);
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
      console.log(`${COLORS.gray}Current language:${COLORS.reset} ${config.language}\n`);
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
  const answer = await rl.question(`${label}${currentValue ? ` [${currentValue}]` : ''}: `);
  return answer.trim() || currentValue;
}

function titleBlock(title: string): string {
  return `${COLORS.bold}${COLORS.cyan}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${title.padEnd(58, ' ')}┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${COLORS.reset}`;
}

function clearScreen(): void {
  output.write('\u001b[2J\u001b[0;0H');
}

async function pause(rl: ReturnType<typeof createInterface>): Promise<void> {
  await rl.question('\nPress Enter to continue...');
}
