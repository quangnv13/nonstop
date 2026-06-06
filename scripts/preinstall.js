#!/usr/bin/env node
const { execSync } = require('child_process');
const os = require('os');

function killOldProcesses() {
  const platform = os.platform();
  console.log(`[nonstop] Pre-install hook: Checking for running nonstop processes on ${platform}...`);

  try {
    if (platform === 'win32') {
      // Windows PowerShell command to find and kill node processes running nonstop background
      const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name = 'node.exe'\\" | Where-Object { $_.CommandLine -like '*nonstop*' -and $_.CommandLine -like '*--background*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Killed nonstop background process PID' $_.ProcessId }"`;
      const output = execSync(cmd, { encoding: 'utf8' });
      if (output.trim()) {
        console.log(output.trim());
      } else {
        console.log('[nonstop] No running nonstop background processes found on Windows.');
      }
    } else {
      // Unix/Linux/macOS command
      try {
        const cmd = `pkill -9 -f "node.*nonstop.*--background"`;
        execSync(cmd);
        console.log('[nonstop] Killed running nonstop background processes on Unix.');
      } catch (err) {
        // pkill exits with 1 if no processes match
        console.log('[nonstop] No running nonstop background processes found on Unix.');
      }
    }
  } catch (error) {
    console.warn('[nonstop] Warning during pre-install check:', error.message);
  }
}

killOldProcesses();
