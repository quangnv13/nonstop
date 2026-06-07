import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadRuntimeState, isPidRunning, RuntimeStateSnapshot, saveShouldRunState } from './runtime-state.js';
import { AppLanguage, loadConfigFromDisk } from './config.js';
import { createTranslator } from './i18n.js';

export interface RuntimeStatus {
  running: boolean;
  snapshot: RuntimeStateSnapshot | null;
}

export function getRuntimeStatus(): RuntimeStatus {
  const snapshot = loadRuntimeState();
  if (!snapshot) {
    return { running: false, snapshot: null };
  }

  if (!isPidRunning(snapshot.pid)) {
    return { running: false, snapshot: null };
  }

  return { running: true, snapshot };
}

export function getEntryScriptPath(): string {
  // Try relative to __dirname (compiled location inside dist/)
  const prodPath = path.join(__dirname, 'index.js');
  if (fs.existsSync(prodPath)) {
    return prodPath;
  }

  // Try relative to process.cwd() (local dev environment)
  const localDevPath = path.join(process.cwd(), 'dist', 'index.js');
  if (fs.existsSync(localDevPath)) {
    return localDevPath;
  }

  // Fallback to process.argv[1]
  if (process.argv[1] && process.argv[1].endsWith('.js') && fs.existsSync(process.argv[1])) {
    return process.argv[1];
  }

  throw new Error('dist/index.js not found. Please ensure the project is built.');
}

export function startBackgroundRuntime(language?: AppLanguage): string {
  const resolvedLang = language || 'en';
  const t = createTranslator(resolvedLang);
  const isRunning = getRuntimeStatus().running;
  if (isRunning) {
    return t('cli.runtime.alreadyRunning');
  }

  const entryScriptPath = getEntryScriptPath();
  saveShouldRunState(true);

  const child = spawn(process.execPath, [entryScriptPath, '--background'], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore'
  });

  child.unref();
  const pid = child.pid ?? 'unknown';
  return t('cli.runtime.started', { pid });
}

export function stopBackgroundRuntime(snapshot: RuntimeStateSnapshot | null, language?: AppLanguage): string {
  const resolvedLang = language || 'en';
  const t = createTranslator(resolvedLang);
  if (!snapshot || !isPidRunning(snapshot.pid)) {
    return t('cli.runtime.notRunning');
  }

  saveShouldRunState(false);

  try {
    process.kill(snapshot.pid);
    return t('cli.runtime.stopped', { pid: snapshot.pid });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(t('cli.runtime.stopFailed', { pid: snapshot.pid, error: errorMsg }));
  }
}

export function getCurrentVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version;
  } catch {
    return '1.0.13';
  }
}

export function checkForUpdate(currentVersion: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, 4000);

    exec('npm view @quangnv13/nonstop version', (error, stdout) => {
      clearTimeout(timer);
      if (error) {
        resolve(null);
        return;
      }
      const latest = stdout.trim();
      if (latest && latest !== currentVersion) {
        resolve(latest);
      } else {
        resolve(null);
      }
    });
  });
}

export async function checkUpdateOnStartup(isBackground: boolean, language: AppLanguage): Promise<void> {
  const currentVersion = getCurrentVersion();
  const latestVersion = await checkForUpdate(currentVersion);

  if (latestVersion) {
    if (isBackground) {
      promptUpgradeBackground(currentVersion, latestVersion, language);
    }
  }
}

function promptUpgradeBackground(currentVersion: string, latestVersion: string, language: AppLanguage): void {
  const platform = os.platform();
  let resolvedLang = language;
  try {
    const config = loadConfigFromDisk();
    resolvedLang = config.language;
  } catch {
    // fallback to parameter
  }
  const t = createTranslator(resolvedLang);

  if (platform === 'win32') {
    const title = t('cli.upgrade.title');
    const msg = t('cli.upgrade.available', { latest: latestVersion, current: currentVersion });
    const upgradingMsg = t('cli.upgrade.upgrading');
    const successMsg = t('cli.upgrade.success');
    const failMsg = t('cli.upgrade.failed');
    const skippedMsg = t('cli.upgrade.skipped');

    const psCommand = `
      $Host.UI.RawUI.WindowTitle = '${title}';
      Write-Host '${msg}' -NoNewline -ForegroundColor Yellow;
      $choice = Read-Host;
      if ($choice -eq 'y' -or $choice -eq 'yes') {
        Write-Host '${upgradingMsg}' -ForegroundColor Blue;
        npm install -g @quangnv13/nonstop@latest;
        if ($LASTEXITCODE -eq 0) {
          Write-Host '${successMsg}' -ForegroundColor Green;
        } else {
          Write-Host '${failMsg}' -ForegroundColor Red;
          Start-Sleep -Seconds 3;
        }
        $null = [Console]::ReadKey();
      } else {
        Write-Host '${skippedMsg}' -ForegroundColor Gray;
        Start-Sleep -Seconds 1;
      }
    `.replace(/\r?\n/g, ' ').trim();

    const cmd = 'cmd.exe';
    const args = [
      '/c',
      'start',
      'powershell',
      '-NoProfile',
      '-Command',
      psCommand
    ];

    spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      shell: true
    }).unref();
  } else {
    console.log(t('cli.upgrade.availableNonInteractive', { latest: latestVersion, current: currentVersion }));
  }
}
