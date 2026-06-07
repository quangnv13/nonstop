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

  constructor(command: string, args: string[], cwd: string, cols = 80, rows = 24) {
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
      cwd,
      cols,
      rows
    });

    this.ptyProcess = pty.spawn(spawnCmd, spawnArgs, {
      name: 'xterm-color',
      cols,
      rows,
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

export const SUPPORTED_PRESETS: SessionPreset[] = ['powershell', 'bash', 'codex', 'antigravity', 'claude'];

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
    case 'claude': {
      const command = process.env.CLAUDE_CMD || 'claude';
      let args: string[] = [];
      if (process.env.CLAUDE_ARGS) {
        try {
          args = JSON.parse(process.env.CLAUDE_ARGS);
        } catch {
          args = process.env.CLAUDE_ARGS.split(/\s+/).filter(Boolean);
        }
      }
      return { command, args };
    }
  }
}

export class VirtualTerminal {
  public width: number;
  public height: number;
  public grid: string[][]; // 2D character array grid
  public row: number = 0;
  public col: number = 0;
  private savedRow: number = 0;
  private savedCol: number = 0;

  // Parser state machine
  private state: 'NORMAL' | 'ESC' | 'CSI' | 'OSC' | 'OSC_ESC' | 'CHARSET' = 'NORMAL';
  private csiParams: string = '';
  private oscBuffer: string = '';

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = [];
    this.clearGrid();
  }

  private clearGrid(): void {
    this.grid = [];
    for (let r = 0; r < this.height; r++) {
      this.grid.push(new Array(this.width).fill(' '));
    }
  }

  public resize(width: number, height: number): void {
    const newGrid: string[][] = [];
    for (let r = 0; r < height; r++) {
      const newRow = new Array(width).fill(' ');
      if (r < this.height) {
        for (let c = 0; c < width; c++) {
          if (c < this.width) {
            newRow[c] = this.grid[r][c];
          }
        }
      }
      newGrid.push(newRow);
    }
    this.grid = newGrid;
    this.width = width;
    this.height = height;
    this.row = Math.min(this.row, height - 1);
    this.col = Math.min(this.col, width - 1);
  }

  public write(chunk: string): void {
    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];

      switch (this.state) {
        case 'NORMAL':
          if (char === '\x1b') {
            this.state = 'ESC';
          } else if (char === '\n') {
            this.handleNewLine();
            this.col = 0;
          } else if (char === '\r') {
            this.col = 0;
          } else if (char === '\b') {
            this.col = Math.max(0, this.col - 1);
          } else if (char === '\t') {
            // Move cursor to next tab stop (multiples of 8)
            const nextTab = Math.min(this.width, (Math.floor(this.col / 8) + 1) * 8);
            while (this.col < nextTab) {
              this.writeChar(' ');
            }
          } else if (char >= ' ') {
            this.writeChar(char);
          }
          break;

        case 'ESC':
          if (char === '[') {
            this.state = 'CSI';
            this.csiParams = '';
          } else if (char === ']') {
            this.state = 'OSC';
            this.oscBuffer = '';
          } else if (char === '(' || char === ')') {
            this.state = 'CHARSET';
          } else {
            // Single character escape commands
            if (char === 'M') { // Reverse Index (move cursor up, scroll if at top)
              if (this.row > 0) {
                this.row--;
              } else {
                this.scrollDown();
              }
            } else if (char === 'D') { // Index (move cursor down, scroll if at bottom)
              this.handleNewLine();
            } else if (char === '7') { // Save cursor
              this.savedRow = this.row;
              this.savedCol = this.col;
            } else if (char === '8') { // Restore cursor
              this.row = this.savedRow;
              this.col = this.savedCol;
            }
            this.state = 'NORMAL';
          }
          break;

        case 'CSI':
          // CSI parameters: numbers, semicolon, question marks (0x30-0x3F)
          if (char >= '0' && char <= '?') {
            this.csiParams += char;
          } else if (char >= '@' && char <= '~') {
            // CSI termination character
            this.executeCSI(char, this.csiParams);
            this.state = 'NORMAL';
          } else {
            // Invalid character in CSI - fall back
            this.state = 'NORMAL';
          }
          break;

        case 'OSC':
          // OSC terminates on BEL (\x07) or ST (\x1b\)
          if (char === '\x07') {
            this.state = 'NORMAL';
          } else if (char === '\x1b') {
            this.state = 'OSC_ESC';
          } else {
            this.oscBuffer += char;
          }
          break;

        case 'OSC_ESC':
          if (char === '\\') {
            this.state = 'NORMAL';
          } else {
            this.oscBuffer += '\x1b' + char;
            this.state = 'OSC';
          }
          break;

        case 'CHARSET':
          // Skip character set designation (e.g. 'B' or '0')
          this.state = 'NORMAL';
          break;
      }
    }
  }

  private writeChar(char: string): void {
    if (this.col >= this.width) {
      // Autowrap
      this.handleNewLine();
      this.col = 0;
    }
    this.grid[this.row][this.col] = char;
    this.col++;
  }

  private handleNewLine(): void {
    if (this.row >= this.height - 1) {
      this.scrollUp();
    } else {
      this.row++;
    }
  }

  private scrollUp(): void {
    this.grid.shift();
    this.grid.push(new Array(this.width).fill(' '));
  }

  private scrollDown(): void {
    this.grid.pop();
    this.grid.unshift(new Array(this.width).fill(' '));
  }

  private executeCSI(cmd: string, paramsStr: string): void {
    const params = paramsStr ? paramsStr.split(';').map(p => parseInt(p, 10)) : [];
    
    // Helper to get parameter with custom default
    const getParam = (idx: number, def: number): number => {
      const val = params[idx];
      return (val === undefined || isNaN(val)) ? def : val;
    };

    switch (cmd) {
      case 'A': // Cursor Up
        this.row = Math.max(0, this.row - getParam(0, 1));
        break;
      case 'B': // Cursor Down
        this.row = Math.min(this.height - 1, this.row + getParam(0, 1));
        break;
      case 'C': // Cursor Forward
        this.col = Math.min(this.width - 1, this.col + getParam(0, 1));
        break;
      case 'D': // Cursor Backward
        this.col = Math.max(0, this.col - getParam(0, 1));
        break;
      case 'G': // Cursor Horizontal Absolute
        this.col = Math.min(this.width - 1, Math.max(0, getParam(0, 1) - 1));
        break;
      case 'H': // Cursor Position
      case 'f':
        const r = Math.min(this.height - 1, Math.max(0, getParam(0, 1) - 1));
        const c = Math.min(this.width - 1, Math.max(0, getParam(1, 1) - 1));
        this.row = r;
        this.col = c;
        break;
      case 'J': { // Erase in Display
        const mode = getParam(0, 0);
        if (mode === 0) {
          this.clearFrom(this.row, this.col);
        } else if (mode === 1) {
          this.clearTo(this.row, this.col);
        } else if (mode === 2 || mode === 3) {
          this.clearGrid();
        }
        break;
      }
      case 'K': { // Erase in Line
        const mode = getParam(0, 0);
        if (mode === 0) {
          // Clear from cursor to end of line
          for (let c = this.col; c < this.width; c++) {
            this.grid[this.row][c] = ' ';
          }
        } else if (mode === 1) {
          // Clear from start of line to cursor
          for (let c = 0; c <= this.col; c++) {
            this.grid[this.row][c] = ' ';
          }
        } else if (mode === 2) {
          // Clear entire line
          this.grid[this.row].fill(' ');
        }
        break;
      }
      case 's': // Save Cursor
        this.savedRow = this.row;
        this.savedCol = this.col;
        break;
      case 'u': // Restore Cursor
        this.row = this.savedRow;
        this.col = this.savedCol;
        break;
    }
  }

  private clearFrom(row: number, col: number): void {
    // Clear current line from cursor
    for (let c = col; c < this.width; c++) {
      this.grid[row][c] = ' ';
    }
    // Clear all subsequent lines
    for (let r = row + 1; r < this.height; r++) {
      this.grid[r].fill(' ');
    }
  }

  private clearTo(row: number, col: number): void {
    // Clear all previous lines
    for (let r = 0; r < row; r++) {
      this.grid[r].fill(' ');
    }
    // Clear current line up to cursor
    for (let c = 0; c <= col; c++) {
      this.grid[row][c] = ' ';
    }
  }

  public getLines(): string[] {
    return this.grid.map(row => row.join(''));
  }
}
