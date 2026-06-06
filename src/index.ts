#!/usr/bin/env node
import {
  applyConfigToProcessEnv,
  ensureEnvExampleFile,
  getMissingConfigFields,
  loadConfigFromDisk
} from './config.js';
import { logger } from './logger.js';
import { NonstopRuntime } from './runtime.js';
import { launchControlCenter } from './ui.js';
import { getRuntimeStatus, stopBackgroundRuntime, checkUpdateOnStartup, startBackgroundRuntime } from './runtime-manager.js';
import { saveShouldRunState, loadShouldRunState } from './runtime-state.js';

async function main(): Promise<void> {
  ensureEnvExampleFile();

  const args = new Set(process.argv.slice(2));
  const isBackground = args.has('--background');
  const isStop = args.has('--stop');

  const config = loadConfigFromDisk();
  applyConfigToProcessEnv(config);

  if (isStop) {
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
        : 'nonstop background runtime is not running.');
    }
    return;
  }

  if (isBackground) {
    const missingFields = getMissingConfigFields(config);
    if (missingFields.length > 0) {
      logger.error('Cannot start background runtime because config is incomplete', {
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

  // Auto-restart if it was running but is not currently running (e.g. after system restart)
  const status = getRuntimeStatus();
  if (!status.running && loadShouldRunState()) {
    console.log(config.language === 'vi'
      ? '↻ Phát hiện trạng thái trước đó đang chạy. Đang tự khởi động lại runtime nền...'
      : '↻ Detected previous running state. Auto-restarting background runtime...');
    try {
      const msg = startBackgroundRuntime(config.language);
      console.log(msg);
      // Chờ một chút để tiến trình nền khởi động và ghi state/heartbeat
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
    }
  }

  await launchControlCenter();
}

void main();
