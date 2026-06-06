import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StartupMode } from './config.js';

export function buildWindowsStartupCommand(entryScriptPath: string, mode: StartupMode): string {
  const runtimeFlag = mode === 'background' ? '--background' : '--open-ui';
  return `node "${entryScriptPath}" ${runtimeFlag}`;
}

export function buildLinuxAutostartDesktopEntry(entryScriptPath: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=nonstop',
    `Exec=node ${entryScriptPath} --open-ui`,
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n');
}

export function buildLinuxSystemdService(workdir: string, entryScriptPath: string): string {
  return [
    '[Unit]',
    'Description=nonstop background runtime',
    '',
    '[Service]',
    `WorkingDirectory=${workdir}`,
    `ExecStart=node ${entryScriptPath} --background`,
    'Restart=on-failure',
    '',
    '[Install]',
    'WantedBy=default.target',
    ''
  ].join('\n');
}

export function detectPlatform(): 'windows' | 'linux' | 'unsupported' {
  if (process.platform === 'win32') {
    return 'windows';
  }

  if (process.platform === 'linux') {
    return 'linux';
  }

  return 'unsupported';
}

export function applyStartupMode(mode: StartupMode, entryScriptPath: string, workdir: string, language?: string): string {
  const platform = detectPlatform();
  const isVi = language === 'vi';
  if (platform === 'unsupported') {
    return isVi ? 'Hệ điều hành không hỗ trợ cấu hình khởi động.' : 'Unsupported OS for startup integration.';
  }

  clearStartupArtifacts();

  if (mode === 'disabled') {
    return isVi ? 'Đã tắt khởi động cùng hệ điều hành.' : 'Startup with OS disabled.';
  }

  if (platform === 'windows') {
    const startupDir = path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup'
    );

    fs.mkdirSync(startupDir, { recursive: true });
    const cmdPath = path.join(startupDir, 'nonstop.cmd');
    fs.writeFileSync(cmdPath, `@echo off\r\ncd /d "${workdir}"\r\n${buildWindowsStartupCommand(entryScriptPath, mode)}\r\n`, 'utf8');
    return isVi ? `Đã bật khởi động cùng Windows (${mode === 'background' ? 'chạy nền' : 'mở giao diện'}).` : `Startup enabled on Windows (${mode}).`;
  }

  if (mode === 'open-ui') {
    const autostartDir = path.join(os.homedir(), '.config', 'autostart');
    fs.mkdirSync(autostartDir, { recursive: true });
    fs.writeFileSync(
      path.join(autostartDir, 'nonstop.desktop'),
      buildLinuxAutostartDesktopEntry(entryScriptPath),
      'utf8'
    );
    return isVi ? 'Đã bật khởi động khi đăng nhập Linux desktop (open-ui).' : 'Startup enabled on Linux desktop login (open-ui).';
  }

  const systemdDir = path.join(os.homedir(), '.config', 'systemd', 'user');
  fs.mkdirSync(systemdDir, { recursive: true });
  fs.writeFileSync(
    path.join(systemdDir, 'nonstop.service'),
    buildLinuxSystemdService(workdir, entryScriptPath),
    'utf8'
  );
  return isVi ? 'Đã bật khởi động dạng user service trên Linux (background).' : 'Startup enabled on Linux user service (background).';
}

export function clearStartupArtifacts(): void {
  const windowsStartupScript = path.join(
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
    'nonstop.cmd'
  );
  const linuxDesktop = path.join(os.homedir(), '.config', 'autostart', 'nonstop.desktop');
  const linuxService = path.join(os.homedir(), '.config', 'systemd', 'user', 'nonstop.service');

  for (const filePath of [windowsStartupScript, linuxDesktop, linuxService]) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
