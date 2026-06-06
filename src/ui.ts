import * as fs from 'fs';
import * as path from 'path';
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

export async function launchControlCenter(): Promise<void> {
  ensureEnvExampleFile();
  let config = loadConfigFromDisk();

  if (getMissingConfigFields(config).length > 0) {
    config = await runSetupWizard(config);
  }

  const rl = createInterface({ input, output });

  try {
    while (true) {
      clearScreen();
      renderDashboard(config, getRuntimeStatus().snapshot);
      const answer = (await rl.question(`\n${COLORS.cyan}${createTranslator(config.language)('dashboard.choice')}: ${COLORS.reset}`)).trim().toLowerCase();

      if (answer === '1') {
        await handleToggleRuntime(config, rl);
        continue;
      }

      if (answer === '2') {
        config = await editConfig(config, rl);
        continue;
      }

      if (answer === '3') {
        await manageWorkspaces(rl, config.language);
        continue;
      }

      if (answer === '4') {
        config = await configureStartup(config, rl);
        continue;
      }

      if (answer === '5') {
        config = await switchLanguage(config, rl);
        continue;
      }

      if (answer === '6') {
        await showRecentLogs(rl);
        continue;
      }

      if (answer === 'q' || answer === '7') {
        break;
      }
    }
  } finally {
    rl.close();
  }
}

async function runSetupWizard(currentConfig: AppConfig): Promise<AppConfig> {
  const rl = createInterface({ input, output });

  try {
    clearScreen();
    const languageAnswer = (
      await rl.question(`${COLORS.cyan}Language / Ngon ngu [en/vi] (${currentConfig.language}): ${COLORS.reset}`)
    ).trim();

    const language: AppLanguage =
      languageAnswer === 'vi' || languageAnswer === 'en' ? languageAnswer : currentConfig.language;
    const t = createTranslator(language);

    clearScreen();
    console.log(titleBlock(t('wizard.title')));

    const telegramBotToken = await askWithDefault(rl, t('wizard.token'), currentConfig.telegramBotToken);
    const adminUsername = await askWithDefault(rl, t('wizard.admin'), currentConfig.adminUsername);
    const clientName = await askWithDefault(rl, t('wizard.clientName'), currentConfig.clientName);
    const startupMode = (await askWithDefault(
      rl,
      t('wizard.startupMode'),
      currentConfig.startupMode
    )) as StartupMode;

    const nextConfig: AppConfig = {
      ...currentConfig,
      language,
      telegramBotToken,
      adminUsername,
      telegramUsername: adminUsername,
      clientName,
      startupMode: normalizeStartupMode(startupMode)
    };

    saveConfigToDisk(nextConfig);
    console.log(`\n${COLORS.green}${t('wizard.complete')}${COLORS.reset}`);
    await pause(rl);
    return nextConfig;
  } finally {
    rl.close();
  }
}

function renderDashboard(config: AppConfig, snapshot: RuntimeStateSnapshot | null): void {
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
  console.log(`  1. ${t('menu.toggleRuntime')}`);
  console.log(`  2. ${t('menu.settings')}`);
  console.log(`  3. ${t('menu.workspaces')}`);
  console.log(`  4. ${t('menu.startup')}`);
  console.log(`  5. ${t('menu.language')}`);
  console.log(`  6. ${t('menu.logs')}`);
  console.log(`  7. ${t('menu.exit')}`);
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
  while (true) {
    clearScreen();
    const workspaces = loadWorkspaces();
    console.log(titleBlock(language === 'vi' ? 'Quan ly workspace' : 'Manage workspaces'));
    workspaces.forEach((workspace, index) => {
      console.log(`  ${index + 1}. ${workspace.name} ${COLORS.gray}${workspace.path}${COLORS.reset}`);
    });
    console.log('\n  a. Add workspace');
    console.log('  e. Edit workspace');
    console.log('  d. Delete workspace');
    console.log('  q. Back');

    const answer = (await rl.question('\nChoice: ')).trim().toLowerCase();
    if (answer === 'q') {
      return;
    }

    if (answer === 'a') {
      const name = await rl.question('Workspace name: ');
      const workspacePath = await rl.question('Workspace path: ');
      workspaces.push({
        id: createWorkspaceId(),
        name: name.trim() || 'Workspace',
        path: workspacePath.trim()
      });
      saveWorkspaces(workspaces);
      continue;
    }

    if (answer === 'e') {
      const indexValue = parseInt(await rl.question('Workspace number to edit: '), 10) - 1;
      if (Number.isInteger(indexValue) && workspaces[indexValue]) {
        workspaces[indexValue] = await promptWorkspaceEdit(rl, workspaces[indexValue]);
        saveWorkspaces(workspaces);
      }
      continue;
    }

    if (answer === 'd') {
      const indexValue = parseInt(await rl.question('Workspace number to delete: '), 10) - 1;
      if (Number.isInteger(indexValue) && workspaces[indexValue]) {
        workspaces.splice(indexValue, 1);
        saveWorkspaces(workspaces);
      }
    }
  }
}

async function promptWorkspaceEdit(
  rl: ReturnType<typeof createInterface>,
  workspace: Workspace
): Promise<Workspace> {
  return {
    ...workspace,
    name: await askWithDefault(rl, 'New workspace name', workspace.name),
    path: await askWithDefault(rl, 'New workspace path', workspace.path)
  };
}

async function configureStartup(
  config: AppConfig,
  rl: ReturnType<typeof createInterface>
): Promise<AppConfig> {
  clearScreen();
  const nextMode = (await askWithDefault(
    rl,
    'Startup mode (disabled/background/open-ui)',
    config.startupMode
  )) as StartupMode;
  const normalizedMode = normalizeStartupMode(nextMode);
  const entryScriptPath = path.join(process.cwd(), 'dist', 'index.js');
  const result = applyStartupMode(normalizedMode, entryScriptPath, process.cwd());
  const nextConfig = { ...config, startupMode: normalizedMode };
  saveConfigToDisk(nextConfig);
  console.log(`\n${COLORS.green}${result}${COLORS.reset}`);
  await pause(rl);
  return nextConfig;
}

async function switchLanguage(
  config: AppConfig,
  rl: ReturnType<typeof createInterface>
): Promise<AppConfig> {
  const answer = (await askWithDefault(rl, 'Language', config.language)).toLowerCase();
  const language: AppLanguage = answer === 'vi' ? 'vi' : 'en';
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

function normalizeStartupMode(value: string): StartupMode {
  if (value === 'background' || value === 'open-ui') {
    return value;
  }

  return 'disabled';
}
