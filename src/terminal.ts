import * as pty from 'node-pty';
import { logger } from './logger.js';
import { SessionPreset } from './types.js';

export interface TerminalDriver {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (code: number, signal?: number) => void): void;
}

export class NodePtyTerminalDriver implements TerminalDriver {
  private ptyProcess: pty.IPty;

  constructor(command: string, args: string[], cwd: string) {
    const isWindows = process.platform === 'win32';
    
    let spawnCmd = command;
    let spawnArgs = args;

    if (isWindows) {
      const lowerCmd = command.toLowerCase();
      if (!lowerCmd.endsWith('.exe')) {
        spawnCmd = 'cmd.exe';
        spawnArgs = ['/c', command, ...args];
      }
    }

    logger.info('Spawning PTY process', {
      command,
      args,
      spawnCmd,
      spawnArgs,
      cwd
    });

    this.ptyProcess = pty.spawn(spawnCmd, spawnArgs, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>
    });
  }

  write(data: string): void {
    this.ptyProcess.write(data);
  }

  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
  }

  kill(signal?: string): void {
    try {
      logger.warn('Killing PTY process', { signal: signal ?? 'default' });
      this.ptyProcess.kill(signal);
    } catch (err) {
      logger.error('Error killing PTY process', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  onData(cb: (data: string) => void): void {
    this.ptyProcess.onData(cb);
  }

  onExit(cb: (code: number, signal?: number) => void): void {
    this.ptyProcess.onExit(({ exitCode, signal }) => {
      cb(exitCode, signal);
    });
  }
}

export const SUPPORTED_PRESETS: SessionPreset[] = ['powershell', 'bash', 'codex', 'antigravity'];

export function resolvePreset(presetName: SessionPreset): { command: string; args: string[] } {
  const isWindows = process.platform === 'win32';

  switch (presetName) {
    case 'powershell':
      return {
        command: isWindows ? 'powershell.exe' : 'pwsh',
        args: []
      };
    case 'bash':
      return {
        command: 'bash',
        args: []
      };
    case 'codex': {
      const command = process.env.CODEX_CMD || 'codex';
      let args: string[] = [];
      if (process.env.CODEX_ARGS) {
        try {
          args = JSON.parse(process.env.CODEX_ARGS);
        } catch {
          args = process.env.CODEX_ARGS.split(/\s+/).filter(Boolean);
        }
      }
      return { command, args };
    }
    case 'antigravity': {
      const command = process.env.ANTIGRAVITY_CMD || 'agy';
      let args: string[] = [];
      if (process.env.ANTIGRAVITY_ARGS) {
        try {
          args = JSON.parse(process.env.ANTIGRAVITY_ARGS);
        } catch {
          args = process.env.ANTIGRAVITY_ARGS.split(/\s+/).filter(Boolean);
        }
      }
      return { command, args };
    }
    default:
      throw new Error(`Unsupported preset "${presetName}".`);
  }
}
