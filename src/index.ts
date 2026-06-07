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

  // Default command: start the interactive dashboard
  if (process.argv.length <= 2 || isOpenUi) {
    const status = getRuntimeStatus();
    if (!status.running && loadShouldRunState()) {
      console.log(config.language === 'vi'
        ? '↻ Phát hiện trạng thái trước đó đang chạy. Đang tự khởi động lại runtime nền...'
        : '↻ Detected previous running state. Auto-restarting the background runtime...');
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
        console.log(config.language === 'vi'
          ? '⚠ Runtime nền của nonstop đã đang chạy.'
          : 'The nonstop background runtime is already running.');
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
        console.log(config.language === 'vi'
          ? '⚠ Runtime nền của nonstop không đang chạy.'
          : 'The nonstop background runtime is not running.');
      }
    });

  // nonstop status / daemon:status
  program
    .command('status')
    .alias('daemon:status')
    .description('View daemon, active sessions, and configuration status')
    .action(async () => {
      const status = getRuntimeStatus();
      const isVi = config.language === 'vi';

      // 1. Daemon Status
      console.log(chalk.bold.cyan('\n=== ' + (isVi ? 'TRẠNG THÁI DAEMON' : 'DAEMON STATUS') + ' ==='));
      const daemonTable = new Table({
        head: [chalk.cyan(isVi ? 'Thuộc tính' : 'Property'), chalk.cyan(isVi ? 'Giá trị' : 'Value')],
        chars: {
          'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
          'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
          'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
          'right': '│', 'right-mid': '┤', 'middle': '│'
        }
      });
      daemonTable.push(
        [isVi ? 'Đang chạy' : 'Running', status.running ? chalk.bold.green(isVi ? 'Có' : 'Yes') : chalk.bold.red(isVi ? 'Không' : 'No')],
        [isVi ? 'PID' : 'PID', status.snapshot?.pid || '-'],
        [isVi ? 'Bật lúc' : 'Started At', status.snapshot?.startedAt ? new Date(status.snapshot.startedAt).toLocaleString() : '-'],
        [isVi ? 'Heartbeat cuối' : 'Last Heartbeat', status.snapshot?.lastHeartbeatAt ? new Date(status.snapshot.lastHeartbeatAt).toLocaleString() : '-'],
        [isVi ? 'Chế độ' : 'Mode', status.snapshot?.mode || '-']
      );
      console.log(daemonTable.toString());

      // 2. Active Session
      console.log(chalk.bold.cyan('\n=== ' + (isVi ? 'PHIÊN HOẠT ĐỘNG' : 'ACTIVE SESSION') + ' ==='));
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
        console.log(chalk.gray(isVi ? '  Không có phiên hoạt động nào.' : '  No active sessions.'));
      }

      // 3. Configuration Summary
      console.log(chalk.bold.cyan('\n=== ' + (isVi ? 'TÓM TẮT CẤU HÌNH' : 'CONFIGURATION SUMMARY') + ' ==='));
      const configTable = new Table({
        head: [chalk.cyan(isVi ? 'Cấu hình' : 'Config Key'), chalk.cyan(isVi ? 'Giá trị' : 'Value')],
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
      const isVi = config.language === 'vi';
      if (workspaces.length === 0) {
        console.log(chalk.yellow(isVi ? 'Không có không gian làm việc nào được đăng ký.' : 'No workspaces registered.'));
        return;
      }
      const table = new Table({
        head: [chalk.cyan('ID'), chalk.cyan(isVi ? 'Tên' : 'Name'), chalk.cyan(isVi ? 'Đường dẫn' : 'Path')],
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
      const isVi = config.language === 'vi';
      const resolvedPath = path.resolve(wsPath);

      const newWs = {
        id: createWorkspaceId(),
        name,
        path: resolvedPath
      };

      workspaces.push(newWs);
      saveWorkspaces(workspaces);

      console.log(chalk.green(isVi
        ? `✓ Đã thêm không gian làm việc thành công! (ID: ${newWs.id})`
        : `✓ Workspace added successfully! (ID: ${newWs.id})`));
    });

  workspaceCmd
    .command('remove <id_or_name>')
    .description('Remove a workspace')
    .action((idOrName) => {
      const workspaces = loadWorkspaces();
      const isVi = config.language === 'vi';
      const index = workspaces.findIndex(ws => ws.id === idOrName || ws.name === idOrName);

      if (index === -1) {
        console.error(chalk.red(isVi
          ? `❌ Không tìm thấy không gian làm việc với ID hoặc Tên: ${idOrName}`
          : `❌ Workspace not found with ID or Name: ${idOrName}`));
        process.exitCode = 1;
        return;
      }

      const removed = workspaces.splice(index, 1)[0];
      saveWorkspaces(workspaces);
      console.log(chalk.green(isVi
        ? `✓ Đã xóa không gian làm việc "${removed.name}" thành công!`
        : `✓ Workspace "${removed.name}" removed successfully!`));
    });

  // nonstop config ...
  const configCmd = program.command('config').description('Manage configuration');

  configCmd
    .command('get [key]')
    .description('Print configuration')
    .action((key) => {
      const isVi = config.language === 'vi';

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
          console.error(chalk.red(isVi ? `❌ Khóa cấu hình không hợp lệ: ${key}` : `❌ Invalid config key: ${key}`));
          process.exitCode = 1;
        }
        return;
      }

      const table = new Table({
        head: [chalk.cyan(isVi ? 'Cấu hình' : 'Config Key'), chalk.cyan(isVi ? 'Giá trị' : 'Value')],
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
      const isVi = config.language === 'vi';
      if (!(key in config)) {
        console.error(chalk.red(isVi ? `❌ Khóa cấu hình không hợp lệ: ${key}` : `❌ Invalid config key: ${key}`));
        process.exitCode = 1;
        return;
      }

      let parsedValue: any = value;
      const originalValue = config[key as keyof AppConfig];
      if (typeof originalValue === 'number') {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          console.error(chalk.red(isVi ? `❌ Giá trị phải là số nguyên: ${value}` : `❌ Value must be an integer: ${value}`));
          process.exitCode = 1;
          return;
        }
        parsedValue = num;
      } else if (key === 'language') {
        if (value !== 'vi' && value !== 'en') {
          console.error(chalk.red(isVi ? `❌ Ngôn ngữ phải là 'vi' hoặc 'en'` : `❌ Language must be 'vi' or 'en'`));
          process.exitCode = 1;
          return;
        }
      } else if (key === 'startupMode') {
        if (value !== 'disabled' && value !== 'background' && value !== 'open-ui') {
          console.error(chalk.red(isVi ? `❌ Startup mode phải là 'disabled', 'background', hoặc 'open-ui'` : `❌ Startup mode must be 'disabled', 'background', or 'open-ui'`));
          process.exitCode = 1;
          return;
        }
      }

      const nextConfig = {
        ...config,
        [key]: parsedValue
      };
      saveConfigToDisk(nextConfig);

      console.log(chalk.green(isVi
        ? `✓ Đã cập nhật cấu hình ${key} thành công! (Khởi động lại runtime nền nếu đang chạy để áp dụng)`
        : `✓ Config ${key} updated successfully! (Restart the background runtime if it is running to apply the changes)`));
    });

  // nonstop session ...
  const sessionCmd = program.command('session').description('Manage active sessions');

  sessionCmd
    .command('list')
    .description('List active spawned PTY sessions')
    .action(() => {
      const status = getRuntimeStatus();
      const isVi = config.language === 'vi';
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
        console.log(chalk.yellow(isVi ? 'Không có phiên PTY nào đang hoạt động.' : 'No active PTY sessions.'));
      }
    });

  sessionCmd
    .command('attach <preset> <cwd>')
    .description('Attach to an active session locally')
    .action(async (preset, cwd) => {
      const isVi = config.language === 'vi';
      const status = getRuntimeStatus();
      if (!status.running) {
        console.error(chalk.red(isVi
          ? '❌ Không thể kết nối vì runtime nền không chạy.'
          : '❌ Cannot attach because the background runtime is not running.'));
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

