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
import { getRuntimeStatus, stopBackgroundRuntime } from './runtime-manager.js';

async function main(): Promise<void> {
  ensureEnvExampleFile();

  const args = new Set(process.argv.slice(2));
  const isBackground = args.has('--background');
  const isStop = args.has('--stop');

  const config = loadConfigFromDisk();
  applyConfigToProcessEnv(config);

  if (isStop) {
    const status = getRuntimeStatus();
    if (status.running && status.snapshot) {
      try {
        const msg = stopBackgroundRuntime(status.snapshot);
        console.log(msg);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    } else {
      console.log('nonstop background runtime is not running.');
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

  await launchControlCenter();
}

void main();
