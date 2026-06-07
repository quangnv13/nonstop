#!/usr/bin/env node
import { Command } from 'commander';
import Table from 'cli-table3';
import chalk from 'chalk';
import * as path from 'path';

import {
  applyConfigToProcessEnv,
  ensureEnvExampleFile,
  getMissingConfigFields,
  loadConfigFromDisk,
  saveConfigToDisk,
  AppConfig
} from './config.js';
import { createTranslator } from './i18n.js';
import { logger, cleanOldLogs } from './logger.js';
import { NonstopRuntime } from './runtime.js';
import { launchControlCenter, attachToBackgroundSession } from './ui.js';
import { getRuntimeStatus, stopBackgroundRuntime, checkUpdateOnStartup, startBackgroundRuntime, getCurrentVersion } from './runtime-manager.js';
import { saveShouldRunState, loadShouldRunState } from './runtime-state.js';
import { loadWorkspaces, saveWorkspaces, createWorkspaceId } from './store.js';

async function main(): Promise<void> {
  ensureEnvExampleFile();
  try {
    cleanOldLogs();
  } catch {
    // ignore
  }

  const args = new Set(process.argv.slice(2));
  const isBackground = args.has('--background');
  const isOpenUi = args.has('--open-ui');

  // Handle background runner immediately to bypass commander parsing
  if (isBackground) {
    const config = loadConfigFromDisk();
    applyConfigToProcessEnv(config);

    const missingFields = getMissingConfigFields(config);
    if (missingFields.length > 0) {
      logger.error('Cannot start background runtime because the configuration is incomplete', {
        missingFields
      });
      process.exitCode = 1;
      return;
    }

    saveShouldRunState(true);

    void checkUpdateOnStartup(true, config.language);

    const runtime = new NonstopRuntime(config, 'background');
    await runtime.startBot();

    const shutdown = async () => {
      await runtime.stopBot();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', async (error) => {
      logger.error('Unhandled exception', {
        error: error.message,
        stack: error.stack
      });
      await runtime.stopBot();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      logger.error('Unhandled promise rejection', {
        reason: reason instanceof Error ? reason.message : String(reason)
      });
      await runtime.stopBot();
      process.exit(1);
    });

    return;
  }

  const config = loadConfigFromDisk();
  applyConfigToProcessEnv(config);
  const t = createTranslator(config.language);

  // Default command: start the interactive dashboard
  if (process.argv.length <= 2 || isOpenUi) {
    const status = getRuntimeStatus();
    if (!status.running && loadShouldRunState()) {
      console.log(t('cli.runtime.autoRestarting'));
      try {
        const msg = startBackgroundRuntime(config.language);
        console.log(msg);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
      }
    }

    await launchControlCenter();
    return;
  }

  const program = new Command();
  program
    .name('nonstop')
    .description('nonstop Telegram terminal control CLI')
    .version(getCurrentVersion());

  // nonstop start / daemon:start
  program
    .command('start')
    .alias('daemon:start')
    .description('Start the background daemon')
    .action(async () => {
      const status = getRuntimeStatus();
      if (status.running) {
        console.log(t('cli.runtime.alreadyRunning'));
        return;
      }
      try {
        const msg = startBackgroundRuntime(config.language);
        console.log(msg);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  // nonstop stop / daemon:stop
  program
    .command('stop')
    .alias('daemon:stop')
    .description('Stop the background daemon')
    .action(async () => {
      saveShouldRunState(false);
      const status = getRuntimeStatus();
      if (status.running && status.snapshot) {
        try {
          const msg = stopBackgroundRuntime(status.snapshot, config.language);
          console.log(msg);
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        }
      } else {
        console.log(t('cli.runtime.notRunning'));
      }
    });

  // nonstop status / daemon:status
  program
    .command('status')
    .alias('daemon:status')
    .description('View daemon, active sessions, and configuration status')
    .action(async () => {
      const status = getRuntimeStatus();
      const t = createTranslator(config.language);

      // 1. Daemon Status
      console.log(chalk.bold.cyan('\n=== ' + t('cli.status.daemonStatus') + ' ==='));
      const daemonTable = new Table({
        head: [chalk.cyan(t('cli.status.property')), chalk.cyan(t('cli.status.value'))],
        chars: {
          'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
          'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
          'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
          'right': '│', 'right-mid': '┤', 'middle': '│'
        }
      });
      const locales = { en: 'en-US', vi: 'vi-VN', zh: 'zh-CN' };
      const timeLocale = locales[config.language] || 'en-US';

      daemonTable.push(
        [t('cli.status.running'), status.running ? chalk.bold.green(t('cli.status.yes')) : chalk.bold.red(t('cli.status.no'))],
        ['PID', status.snapshot?.pid || '-'],
        [t('cli.status.startedAt'), status.snapshot?.startedAt ? new Date(status.snapshot.startedAt).toLocaleString(timeLocale) : '-'],
        [t('cli.status.lastHeartbeat'), status.snapshot?.lastHeartbeatAt ? new Date(status.snapshot.lastHeartbeatAt).toLocaleString(timeLocale) : '-'],
        [t('cli.status.mode'), status.snapshot?.mode || '-']
      );
      console.log(daemonTable.toString());

      // 2. Active Session
      console.log(chalk.bold.cyan('\n=== ' + t('cli.status.activeSession') + ' ==='));
      const session = status.snapshot?.activeSession;
      if (status.running && session && session.status === 'running') {
        const sessionTable = new Table({
          head: ['Session ID', 'Preset', 'Status', 'CWD'],
          chars: {
            'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
            'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
            'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
            'right': '│', 'right-mid': '┤', 'middle': '│'
          }
        });
        sessionTable.push([
          session.sessionId,
          session.preset.toUpperCase(),
          chalk.green(session.status),
          session.cwd
        ]);
        console.log(sessionTable.toString());
      } else {
        console.log(chalk.gray(t('cli.status.noActiveSessions')));
      }

      // 3. Configuration Summary
      console.log(chalk.bold.cyan('\n=== ' + t('cli.status.configSummary') + ' ==='));
      const configTable = new Table({
        head: [chalk.cyan(t('cli.status.configKey')), chalk.cyan(t('cli.status.value'))],
        chars: {
          'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
          'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
          'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
          'right': '│', 'right-mid': '┤', 'middle': '│'
        }
      });

      const maskToken = (token: string) => {
        if (!token) return '-';
        if (token.length <= 8) return '********';
        return token.slice(0, 4) + '...' + token.slice(-4);
      };

      configTable.push(
        ['TELEGRAM_BOT_TOKEN', maskToken(config.telegramBotToken)],
        ['ADMIN_USERNAME', config.adminUsername || '-'],
        ['CLIENT_NAME', config.clientName || '-'],
        ['APP_LANGUAGE', config.language],
        ['STARTUP_MODE', config.startupMode]
      );
      console.log(configTable.toString());
      console.log('');
    });

  // nonstop workspace ...
  const workspaceCmd = program.command('workspace').description('Manage workspaces');

  workspaceCmd
    .command('list')
    .alias('ls')
    .description('List registered workspaces')
    .action(() => {
      const workspaces = loadWorkspaces();
      const t = createTranslator(config.language);
      if (workspaces.length === 0) {
        console.log(chalk.yellow(t('cli.workspace.noWorkspaces')));
        return;
      }
      const table = new Table({
        head: [chalk.cyan('ID'), chalk.cyan(t('cli.workspace.name')), chalk.cyan(t('cli.workspace.path'))],
        chars: {
          'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
          'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
          'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
          'right': '│', 'right-mid': '┤', 'middle': '│'
        }
      });
      workspaces.forEach(ws => {
        table.push([ws.id, ws.name, ws.path]);
      });
      console.log(table.toString());
    });

  workspaceCmd
    .command('add <name> <path>')
    .description('Add a new workspace')
    .action((name, wsPath) => {
      const workspaces = loadWorkspaces();
      const t = createTranslator(config.language);
      const resolvedPath = path.resolve(wsPath);

      const newWs = {
        id: createWorkspaceId(),
        name,
        path: resolvedPath
      };

      workspaces.push(newWs);
      saveWorkspaces(workspaces);

      console.log(chalk.green(t('cli.workspace.added', { id: newWs.id })));
    });

  workspaceCmd
    .command('remove <id_or_name>')
    .description('Remove a workspace')
    .action((idOrName) => {
      const workspaces = loadWorkspaces();
      const t = createTranslator(config.language);
      const index = workspaces.findIndex(ws => ws.id === idOrName || ws.name === idOrName);

      if (index === -1) {
        console.error(chalk.red(t('cli.workspace.notFound', { idOrName })));
        process.exitCode = 1;
        return;
      }

      const removed = workspaces.splice(index, 1)[0];
      saveWorkspaces(workspaces);
      console.log(chalk.green(t('cli.workspace.removed', { name: removed.name })));
    });

  // nonstop config ...
  const configCmd = program.command('config').description('Manage configuration');

  configCmd
    .command('get [key]')
    .description('Print configuration')
    .action((key) => {
      const t = createTranslator(config.language);

      const maskToken = (k: string, v: string) => {
        if (k === 'telegramBotToken' && v) {
          if (v.length <= 8) return '********';
          return v.slice(0, 4) + '...' + v.slice(-4);
        }
        return v;
      };

      if (key) {
        if (key in config) {
          console.log(`${key}=${config[key as keyof AppConfig]}`);
        } else {
          console.error(chalk.red(t('cli.config.invalidKey', { key })));
          process.exitCode = 1;
        }
        return;
      }

      const table = new Table({
        head: [chalk.cyan(t('cli.status.configKey')), chalk.cyan(t('cli.status.value'))],
        chars: {
          'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
          'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
          'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
          'right': '│', 'right-mid': '┤', 'middle': '│'
        }
      });

      Object.entries(config).forEach(([k, v]) => {
        table.push([k, maskToken(k, String(v))]);
      });
      console.log(table.toString());
    });

  configCmd
    .command('set <key> <value>')
    .description('Set configuration dynamically')
    .action((key, value) => {
      const t = createTranslator(config.language);
      if (!(key in config)) {
        console.error(chalk.red(t('cli.config.invalidKey', { key })));
        process.exitCode = 1;
        return;
      }

      let parsedValue: any = value;
      const originalValue = config[key as keyof AppConfig];
      if (typeof originalValue === 'number') {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          console.error(chalk.red(t('cli.config.invalidValue', { value })));
          process.exitCode = 1;
          return;
        }
        parsedValue = num;
      } else if (key === 'language') {
        if (value !== 'vi' && value !== 'en' && value !== 'zh') {
          console.error(chalk.red(t('cli.config.invalidLanguage')));
          process.exitCode = 1;
          return;
        }
      } else if (key === 'startupMode') {
        if (value !== 'disabled' && value !== 'background' && value !== 'open-ui') {
          console.error(chalk.red(t('cli.config.invalidStartupMode')));
          process.exitCode = 1;
          return;
        }
      }

      const nextConfig = {
        ...config,
        [key]: parsedValue
      };
      saveConfigToDisk(nextConfig);

      console.log(chalk.green(t('cli.config.updated', { key })));
    });

  // nonstop session ...
  const sessionCmd = program.command('session').description('Manage active sessions');

  sessionCmd
    .command('list')
    .description('List active spawned PTY sessions')
    .action(() => {
      const status = getRuntimeStatus();
      const t = createTranslator(config.language);
      const session = status.snapshot?.activeSession;

      const table = new Table({
        head: [
          chalk.cyan('Session ID'),
          chalk.cyan('Preset'),
          chalk.cyan('Status'),
          chalk.cyan('CWD'),
          chalk.cyan('Auto Enter'),
          chalk.cyan('Input Mode')
        ],
        chars: {
          'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
          'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
          'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
          'right': '│', 'right-mid': '┤', 'middle': '│'
        }
      });

      if (status.running && session && session.status === 'running') {
        table.push([
          session.sessionId,
          session.preset.toUpperCase(),
          chalk.green(session.status),
          session.cwd,
          session.autoEnter ? 'Yes' : 'No',
          session.inputMode ? 'Yes' : 'No'
        ]);
        console.log(table.toString());
      } else {
        console.log(chalk.yellow(t('cli.session.noActive')));
      }
    });

  sessionCmd
    .command('attach <preset> <cwd>')
    .description('Attach to an active session locally')
    .action(async (preset, cwd) => {
      const t = createTranslator(config.language);
      const status = getRuntimeStatus();
      if (!status.running) {
        console.error(chalk.red(t('cli.session.runtimeNotRunning')));
        process.exitCode = 1;
        return;
      }

      try {
        await attachToBackgroundSession(preset, cwd, config.language);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  await program.parseAsync(process.argv);
}

void main();

