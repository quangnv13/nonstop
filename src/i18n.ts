import { AppLanguage } from './config.js';

type TranslationKey =
  | 'wizard.title'
  | 'wizard.token'
  | 'wizard.admin'
  | 'wizard.clientName'
  | 'wizard.startupMode'
  | 'wizard.complete'
  | 'dashboard.title'
  | 'dashboard.running'
  | 'dashboard.stopped'
  | 'dashboard.menu'
  | 'menu.settings'
  | 'menu.workspaces'
  | 'menu.startup'
  | 'menu.language'
  | 'menu.logs'
  | 'menu.exit'
  | 'startup.disabled'
  | 'startup.background'
  | 'startup.openUi'
  // Bot translation keys
  | 'bot.menu.workspaces'
  | 'bot.menu.session'
  | 'bot.menu.config'
  | 'bot.menu.help'
  | 'bot.menu.activeSessionNone'
  | 'bot.menu.activeSessionRunning'
  | 'bot.help.title'
  | 'bot.help.start'
  | 'bot.help.status'
  | 'bot.help.help'
  | 'bot.help.config'
  | 'bot.help.send'
  | 'bot.help.inputModeNotice'
  | 'bot.status.title'
  | 'bot.status.user'
  | 'bot.status.unlimited'
  | 'bot.status.workspaces'
  | 'bot.status.session'
  | 'bot.status.running'
  | 'bot.status.none'
  | 'bot.status.preset'
  | 'bot.status.directory'
  | 'bot.config.title'
  | 'bot.config.notConfigured'
  | 'bot.config.languageLabel'
  | 'bot.config.startupLabel'
  | 'bot.config.updated'
  | 'bot.config.enterValue'
  | 'bot.config.invalidValue'
  | 'bot.config.telegramBotTokenWarning'
  | 'bot.workspaces.title'
  | 'bot.workspaces.empty'
  | 'bot.workspaces.add'
  | 'bot.workspaces.editName'
  | 'bot.workspaces.editPath'
  | 'bot.workspaces.delete'
  | 'bot.workspaces.notFound'
  | 'bot.workspaces.detailsTitle'
  | 'bot.workspaces.detailsName'
  | 'bot.workspaces.detailsPath'
  | 'bot.workspaces.addNamePrompt'
  | 'bot.workspaces.addPathPrompt'
  | 'bot.workspaces.added'
  | 'bot.workspaces.notExists'
  | 'bot.workspaces.updatedName'
  | 'bot.workspaces.updatedPath'
  | 'bot.sessions.title'
  | 'bot.sessions.empty'
  | 'bot.sessions.control'
  | 'bot.sessionDetails.title'
  | 'bot.sessionDetails.notRunning'
  | 'bot.sessionDetails.preset'
  | 'bot.sessionDetails.status'
  | 'bot.sessionDetails.directory'
  | 'bot.sessionDetails.inputMode'
  | 'bot.sessionDetails.autoEnter'
  | 'bot.sessionDetails.on'
  | 'bot.sessionDetails.off'
  | 'bot.sessionMarkup.inputOff'
  | 'bot.sessionMarkup.inputOn'
  | 'bot.sessionMarkup.autoEnterOff'
  | 'bot.sessionMarkup.autoEnterOn'
  | 'bot.sessionMarkup.refresh'
  | 'bot.sessionMarkup.up'
  | 'bot.sessionMarkup.down'
  | 'bot.sessionMarkup.stop'
  | 'bot.sessionMarkup.back'
  | 'cli.ui.workspaces.tableNo'
  | 'bot.sessionControls.presetNotSupported'
  | 'bot.sessionControls.runningSessionExists'
  | 'bot.sessionControls.startError'
  | 'bot.sessionControls.notRunning'
  | 'bot.sessionControls.unsupportedAction'
  | 'bot.general.back'
  | 'bot.general.authError'
  | 'bot.general.sendUsage'
  | 'bot.general.noActiveSession'
  | 'bot.general.sentCommand'
  | 'bot.general.dangerousConfirm'
  | 'bot.general.confirmYes'
  | 'bot.general.confirmNo'
  | 'bot.general.confirmCancelled'
  | 'bot.general.defaultMessage'
  // CLI / Daemon keys
  | 'cli.runtime.alreadyRunning'
  | 'cli.runtime.started'
  | 'cli.runtime.notRunning'
  | 'cli.runtime.stopped'
  | 'cli.runtime.stopFailed'
  | 'cli.upgrade.title'
  | 'cli.upgrade.available'
  | 'cli.upgrade.upgrading'
  | 'cli.upgrade.success'
  | 'cli.upgrade.failed'
  | 'cli.upgrade.skipped'
  | 'cli.startup.unsupported'
  | 'cli.startup.disabled'
  | 'cli.startup.enabledWindows'
  | 'cli.startup.enabledLinuxUi'
  | 'cli.startup.enabledLinuxBg'
  | 'cli.runtime.startupSuccess'
  | 'cli.status.daemonStatus'
  | 'cli.status.property'
  | 'cli.status.value'
  | 'cli.status.running'
  | 'cli.status.yes'
  | 'cli.status.no'
  | 'cli.status.startedAt'
  | 'cli.status.lastHeartbeat'
  | 'cli.status.mode'
  | 'cli.status.activeSession'
  | 'cli.status.noActiveSessions'
  | 'cli.status.configSummary'
  | 'cli.status.configKey'
  | 'cli.workspace.noWorkspaces'
  | 'cli.workspace.name'
  | 'cli.workspace.path'
  | 'cli.workspace.added'
  | 'cli.workspace.notFound'
  | 'cli.workspace.removed'
  | 'cli.config.invalidKey'
  | 'cli.config.invalidValue'
  | 'cli.config.invalidLanguage'
  | 'cli.config.invalidStartupMode'
  | 'cli.config.updated'
  | 'cli.session.noActive'
  | 'cli.session.runtimeNotRunning'
  // CLI UI / TUI keys
  | 'cli.ui.pressEnter'
  | 'cli.ui.connectingTelegram'
  | 'cli.ui.connectedTelegram'
  | 'cli.ui.unableConfirmTelegram'
  | 'cli.ui.telegramStatus.notRunning'
  | 'cli.ui.telegramStatus.connected'
  | 'cli.ui.telegramStatus.disconnected'
  | 'cli.ui.mode.background'
  | 'cli.ui.mode.foreground'
  | 'cli.ui.status'
  | 'cli.ui.version'
  | 'cli.ui.language'
  | 'cli.ui.startup'
  | 'cli.ui.startedAt'
  | 'cli.ui.session'
  | 'cli.ui.directory'
  | 'cli.ui.error'
  | 'cli.ui.upgrade.title'
  | 'cli.ui.upgrade.opening'
  | 'cli.ui.upgrade.upgrading'
  | 'cli.ui.upgrade.complete'
  | 'cli.ui.upgrade.runningCmd'
  | 'cli.ui.upgrade.success'
  | 'cli.ui.upgrade.failed'
  | 'cli.ui.update.available'
  | 'cli.ui.update.checking'
  | 'cli.ui.update.currentVersion'
  | 'cli.ui.update.latestVersion'
  | 'cli.ui.update.prompt'
  | 'cli.ui.update.yes'
  | 'cli.ui.update.no'
  | 'cli.ui.menu.stopBg'
  | 'cli.ui.menu.startBg'
  | 'cli.ui.menu.listSessions'
  | 'cli.ui.menu.exited'
  | 'cli.ui.sessions.backToMenu'
  | 'cli.ui.sessions.title'
  | 'cli.ui.sessions.notRunning'
  | 'cli.ui.sessions.noActive'
  | 'cli.ui.setup.title'
  | 'cli.ui.setup.promptLang'
  | 'cli.ui.config.edit'
  | 'cli.ui.config.logRetentionDays'
  | 'cli.ui.config.logRetentionDays.invalid'
  | 'cli.ui.config.logRotationHourly'
  | 'cli.ui.config.saved'
  | 'cli.ui.config.tokenChangedPrompt'
  | 'cli.ui.config.tokenChangedWarn'
  | 'cli.ui.workspaces.addNew'
  | 'cli.ui.workspaces.title'
  | 'cli.ui.workspaces.noWorkspaces'
  | 'cli.ui.workspaces.select'
  | 'cli.ui.workspaces.add'
  | 'cli.ui.workspaces.name'
  | 'cli.ui.workspaces.path'
  | 'cli.ui.workspaces.pathEmpty'
  | 'cli.ui.workspaces.pathNotExist'
  | 'cli.ui.workspaces.added'
  | 'cli.ui.workspaces.actions'
  | 'cli.ui.workspaces.selected'
  | 'cli.ui.workspaces.edit'
  | 'cli.ui.workspaces.delete'
  | 'cli.ui.workspaces.back'
  | 'cli.ui.workspaces.deleted'
  | 'cli.ui.workspaces.editTitle'
  | 'cli.ui.workspaces.newName'
  | 'cli.ui.workspaces.newPath'
  | 'cli.ui.workspaces.newPathEmpty'
  | 'cli.ui.workspaces.newPathNotExist'
  | 'cli.ui.workspaces.updated'
  | 'cli.ui.startup.title'
  | 'cli.ui.startup.currentMode'
  | 'cli.ui.startup.disabledLabel'
  | 'cli.ui.startup.backgroundLabel'
  | 'cli.ui.startup.openUiLabel'
  | 'cli.ui.language.switch'
  | 'cli.ui.language.current'
  | 'cli.ui.language.warningTitle'
  | 'cli.ui.language.warningMsg'
  | 'cli.ui.language.confirm'
  | 'cli.ui.logs.title'
  | 'cli.ui.logs.empty'
  | 'cli.ui.sessionAttach.connecting'
  | 'cli.ui.sessionAttach.connected'
  | 'cli.ui.sessionAttach.detachHint'
  | 'cli.ui.sessionAttach.detaching'
  | 'cli.ui.sessionAttach.exited'
  | 'cli.ui.sessionAttach.ipcError'
  | 'cli.ui.sessionAttach.disconnected'
  | 'cli.runtime.autoRestarting'
  | 'cli.upgrade.availableNonInteractive'
  | 'bot.session.exitedWithCode';

const MESSAGES: Record<AppLanguage, Record<TranslationKey, string>> = {
  en: {
    'wizard.title': 'nonstop Setup Wizard',
    'wizard.token': 'Telegram Bot Token',
    'wizard.admin': 'Authorized Telegram username (e.g., @yourusername)',
    'wizard.clientName': 'Client Name',
    'wizard.startupMode': 'Startup Mode',
    'wizard.complete': 'Setup completed and saved.',
    'dashboard.title': 'nonstop Client',
    'dashboard.running': 'RUNNING',
    'dashboard.stopped': 'STOPPED',
    'dashboard.menu': 'Menu',
    'menu.settings': '⚙️ Edit configuration',
    'menu.workspaces': '📁 Manage workspaces',
    'menu.startup': '🔄 Configure startup',
    'menu.language': '💬 Switch language',
    'menu.logs': '📝 View recent logs',
    'menu.exit': '❌ Exit',
    'startup.disabled': 'Disabled',
    'startup.background': 'Background',
    'startup.openUi': 'Open UI',
    // Bot English
    'bot.menu.workspaces': '📁 Workspaces',
    'bot.menu.session': '⚡ Active Session',
    'bot.menu.config': '⚙️ Settings',
    'bot.menu.help': 'ℹ️ Help',
    'bot.menu.activeSessionNone': '⚡ Active Session: None',
    'bot.menu.activeSessionRunning': '⚡ Active Session: {preset} | {cwd}',
    'bot.help.title': '📖 Available Commands',
    'bot.help.start': '/start — Open the main menu',
    'bot.help.status': '/status — Check runtime status',
    'bot.help.help': '/help — Show help information',
    'bot.help.config': '/config — View or edit settings',
    'bot.help.send': '/send <command> — Send a command directly to the active session',
    'bot.help.inputModeNotice': 'When Input Mode is ON, any message you send (without a leading "/") is forwarded directly to the active shell session.',
    'bot.status.title': '📊 Runtime Status',
    'bot.status.user': 'User',
    'bot.status.unlimited': 'unlimited',
    'bot.status.workspaces': 'Workspaces',
    'bot.status.session': 'Active Session',
    'bot.status.running': 'running',
    'bot.status.none': 'none',
    'bot.status.preset': 'Preset',
    'bot.status.directory': 'Directory',
    'bot.config.title': '⚙️ nonstop Configuration',
    'bot.config.notConfigured': 'Not configured',
    'bot.config.languageLabel': 'Language',
    'bot.config.startupLabel': 'Startup Mode',
    'bot.config.updated': '✓ Configuration updated for "{field}".',
    'bot.config.enterValue': 'Enter a new value for "{field}":',
    'bot.config.invalidValue': '❌ Invalid value. Please enter a valid integer for "{field}".',
    'bot.config.telegramBotTokenWarning': '⚠️ WARNING: Changing the Telegram Bot Token will immediately STOP the current Bot and restart with the new Token. You will lose connection to this Bot and will need to message the new Bot to continue.\n\nPlease enter the new Telegram Bot Token:',
    'bot.workspaces.title': '📁 Workspaces',
    'bot.workspaces.empty': 'No workspaces configured.',
    'bot.workspaces.add': '➕ Add Workspace',
    'bot.workspaces.editName': '✏️ Edit Name',
    'bot.workspaces.editPath': '🛠️ Edit Path',
    'bot.workspaces.delete': '🗑️ Delete',
    'bot.workspaces.notFound': 'Workspace not found.',
    'bot.workspaces.detailsTitle': '📁 Workspace Details',
    'bot.workspaces.detailsName': 'Name',
    'bot.workspaces.detailsPath': 'Path',
    'bot.workspaces.addNamePrompt': 'Enter a name for the new workspace:',
    'bot.workspaces.addPathPrompt': 'Enter the absolute path for the workspace:',
    'bot.workspaces.added': '✓ Workspace "{name}" has been added.',
    'bot.workspaces.notExists': 'Workspace does not exist.',
    'bot.workspaces.updatedName': '✓ Workspace name updated.',
    'bot.workspaces.updatedPath': '✓ Workspace path updated.',
    'bot.sessions.title': '⚡ Active Session',
    'bot.sessions.empty': 'No active session is currently running.',
    'bot.sessions.control': '🎮 Control',
    'bot.sessionDetails.title': '🎮 Session Control',
    'bot.sessionDetails.notRunning': 'The session is not running.',
    'bot.sessionDetails.preset': 'Preset',
    'bot.sessionDetails.status': 'Status',
    'bot.sessionDetails.directory': 'Directory',
    'bot.sessionDetails.inputMode': 'Input Mode',
    'bot.sessionDetails.autoEnter': 'Auto Enter',
    'bot.sessionDetails.on': 'ON',
    'bot.sessionDetails.off': 'OFF',
    'bot.sessionMarkup.inputOff': '⌨️ Input OFF',
    'bot.sessionMarkup.inputOn': '⌨️ Input ON',
    'bot.sessionMarkup.autoEnterOff': '⏎ AutoEnter OFF',
    'bot.sessionMarkup.autoEnterOn': '⏎ AutoEnter ON',
    'bot.sessionMarkup.refresh': '🔄 Refresh',
    'bot.sessionMarkup.up': '⬆️ Up',
    'bot.sessionMarkup.down': '⬇️ Down',
    'bot.sessionMarkup.stop': '🛑 Stop',
    'bot.sessionMarkup.back': '⬅️ Back',
    'cli.ui.workspaces.tableNo': 'No.',
    'bot.sessionControls.presetNotSupported': 'Preset "{preset}" is not supported.',
    'bot.sessionControls.runningSessionExists': 'A session is already running. Please stop the current session first.',
    'bot.sessionControls.startError': 'Failed to start the session: {error}',
    'bot.sessionControls.notRunning': 'The session is not running.',
    'bot.sessionControls.unsupportedAction': 'Action "{action}" is not supported.',
    'bot.general.back': '⬅️ Back',
    'bot.general.authError': 'Access denied. This bot is configured for a specific Telegram account.',
    'bot.general.sendUsage': 'Usage: /send <command>',
    'bot.general.noActiveSession': 'No active session is currently running.',
    'bot.general.sentCommand': '✓ Command sent.',
    'bot.general.dangerousConfirm': '⚠️ WARNING: This command may be destructive and cannot be undone: "{command}". Are you sure you want to execute it?',
    'bot.general.confirmYes': 'Yes, execute',
    'bot.general.confirmNo': 'Cancel',
    'bot.general.confirmCancelled': 'Command execution cancelled.',
    'bot.general.defaultMessage': 'Use /start to open the main menu.',
    // CLI English
    'cli.runtime.alreadyRunning': 'The nonstop background runtime is already running.',
    'cli.runtime.started': '✓ Started the nonstop background runtime (PID {pid}).',
    'cli.runtime.notRunning': 'The background runtime is not running.',
    'cli.runtime.stopped': '✓ Stopped the nonstop background runtime ({pid}).',
    'cli.runtime.stopFailed': 'Failed to stop the background runtime ({pid}): {error}',
    'cli.upgrade.title': 'nonstop Update',
    'cli.upgrade.available': 'A new version of nonstop is available: {latest} (Current: {current}). Do you want to upgrade? (y/n): ',
    'cli.upgrade.upgrading': 'Upgrading @quangnv13/nonstop to the latest version...',
    'cli.upgrade.success': 'nonstop update successful! Press any key to close...',
    'cli.upgrade.failed': 'nonstop update failed.',
    'cli.upgrade.skipped': 'nonstop update skipped.',
    'cli.startup.unsupported': 'Unsupported OS for startup integration.',
    'cli.startup.disabled': 'Startup with OS disabled.',
    'cli.startup.enabledWindows': 'Startup enabled on Windows ({mode}).',
    'cli.startup.enabledLinuxUi': 'Startup enabled on Linux desktop login (open-ui).',
    'cli.startup.enabledLinuxBg': 'Startup enabled on Linux user service (background).',
    'cli.runtime.startupSuccess': '✅ nonstop client (v{version}) started successfully and is running!\n🖥 Client: {clientName}',
    'cli.status.daemonStatus': 'DAEMON STATUS',
    'cli.status.property': 'Property',
    'cli.status.value': 'Value',
    'cli.status.running': 'Running',
    'cli.status.yes': 'Yes',
    'cli.status.no': 'No',
    'cli.status.startedAt': 'Started At',
    'cli.status.lastHeartbeat': 'Last Heartbeat',
    'cli.status.mode': 'Mode',
    'cli.status.activeSession': 'ACTIVE SESSION',
    'cli.status.noActiveSessions': '  No active sessions.',
    'cli.status.configSummary': 'CONFIGURATION SUMMARY',
    'cli.status.configKey': 'Config Key',
    'cli.workspace.noWorkspaces': 'No workspaces registered.',
    'cli.workspace.name': 'Name',
    'cli.workspace.path': 'Path',
    'cli.workspace.added': '✓ Workspace added successfully! (ID: {id})',
    'cli.workspace.notFound': '❌ Workspace not found with ID or Name: {idOrName}',
    'cli.workspace.removed': '✓ Workspace "{name}" removed successfully!',
    'cli.config.invalidKey': '❌ Invalid config key: {key}',
    'cli.config.invalidValue': '❌ Value must be an integer: {value}',
    'cli.config.invalidLanguage': '❌ Language must be \'vi\', \'en\' or \'zh\'',
    'cli.config.invalidStartupMode': '❌ Startup mode must be \'disabled\', \'background\', or \'open-ui\'',
    'cli.config.updated': '✓ Config {key} updated successfully! (Restart the background runtime if it is running to apply the changes)',
    'cli.session.noActive': 'No active PTY sessions.',
    'cli.session.runtimeNotRunning': '❌ Cannot attach because the background runtime is not running.',
    'cli.ui.pressEnter': 'Press Enter to continue...',
    'cli.ui.connectingTelegram': '\n  Connecting to Telegram...',
    'cli.ui.connectedTelegram': '  ✓ Connected to Telegram successfully!',
    'cli.ui.unableConfirmTelegram': '  ⚠ Unable to confirm Telegram connection immediately. The system is still starting up.',
    'cli.ui.telegramStatus.notRunning': 'NOT RUNNING',
    'cli.ui.telegramStatus.connected': 'CONNECTED',
    'cli.ui.telegramStatus.disconnected': 'DISCONNECTED',
    'cli.ui.mode.background': 'background',
    'cli.ui.mode.foreground': 'foreground',
    'cli.ui.status': 'Status',
    'cli.ui.version': 'Version',
    'cli.ui.language': 'Language',
    'cli.ui.startup': 'Startup',
    'cli.ui.startedAt': 'Started at',
    'cli.ui.session': 'Session',
    'cli.ui.directory': 'Directory',
    'cli.ui.error': 'Error',
    'cli.ui.upgrade.title': 'Upgrading nonstop',
    'cli.ui.upgrade.opening': '  Opening a new PowerShell window for the upgrade. The current process will now exit...',
    'cli.ui.upgrade.upgrading': 'Upgrading @quangnv13/nonstop to version {version}...',
    'cli.ui.upgrade.complete': 'nonstop upgrade completed! This window will close in 3 seconds...',
    'cli.ui.upgrade.runningCmd': '  Running the installation command...',
    'cli.ui.upgrade.success': '\n  ✓ nonstop upgraded successfully! Please restart nonstop.',
    'cli.ui.upgrade.failed': '\n  ❌ nonstop upgrade failed: ',
    'cli.ui.update.available': 'Update Available!',
    'cli.ui.update.checking': 'Checking for updates',
    'cli.ui.update.currentVersion': 'Current version:',
    'cli.ui.update.latestVersion': 'Latest version:',
    'cli.ui.update.prompt': 'Do you want to upgrade now?',
    'cli.ui.update.yes': 'Yes, upgrade now',
    'cli.ui.update.no': 'No, skip for now',
    'cli.ui.menu.stopBg': '⏹️ Stop background runtime',
    'cli.ui.menu.startBg': '▶️ Start background runtime',
    'cli.ui.menu.listSessions': '⚡ List active sessions',
    'cli.ui.menu.exited': 'Exited nonstop client.',
    'cli.ui.sessions.backToMenu': '🔙 ← Back to main menu',
    'cli.ui.sessions.title': 'List Active Sessions',
    'cli.ui.sessions.notRunning': '  ⚠ The background runtime is not running.',
    'cli.ui.sessions.noActive': '  No active sessions running.',
    'cli.ui.setup.title': 'nonstop Setup',
    'cli.ui.setup.promptLang': '  Choose language / Chọn ngôn ngữ:',
    'cli.ui.config.edit': 'Edit config',
    'cli.ui.config.logRetentionDays': 'Log retention period in days (LOG_RETENTION_DAYS)',
    'cli.ui.config.logRetentionDays.invalid': 'Please enter a positive integer.',
    'cli.ui.config.logRotationHourly': 'Enable hourly log rotation (LOG_ROTATION_HOURLY)?',
    'cli.ui.config.saved': '✓ Settings saved.',
    'cli.ui.config.tokenChangedPrompt': 'Telegram Bot Token has changed. Do you want to restart the background runtime now to apply changes?',
    'cli.ui.config.tokenChangedWarn': '⚠ Note: You will need to restart the background runtime manually to apply the new settings.',
    'cli.ui.workspaces.addNew': '➕ Add new workspace',
    'cli.ui.workspaces.title': 'Manage Workspaces',
    'cli.ui.workspaces.noWorkspaces': '  No workspaces registered.',
    'cli.ui.workspaces.select': 'Select workspace or add new:',
    'cli.ui.workspaces.add': 'Add workspace',
    'cli.ui.workspaces.name': 'Workspace name:',
    'cli.ui.workspaces.path': 'Path:',
    'cli.ui.workspaces.pathEmpty': 'Path cannot be empty.',
    'cli.ui.workspaces.pathNotExist': 'The path does not exist on disk.',
    'cli.ui.workspaces.added': 'Workspace added.',
    'cli.ui.workspaces.actions': 'Workspace Actions',
    'cli.ui.workspaces.selected': 'Selected:',
    'cli.ui.workspaces.edit': '✏️ Edit workspace',
    'cli.ui.workspaces.delete': '🗑️ Delete workspace',
    'cli.ui.workspaces.back': '🔙 ← Back',
    'cli.ui.workspaces.deleted': 'Workspace deleted.',
    'cli.ui.workspaces.editTitle': 'Edit workspace',
    'cli.ui.workspaces.newName': 'New name:',
    'cli.ui.workspaces.newPath': 'New path:',
    'cli.ui.workspaces.newPathEmpty': 'Path cannot be empty.',
    'cli.ui.workspaces.newPathNotExist': 'The path does not exist.',
    'cli.ui.workspaces.updated': 'Workspace updated.',
    'cli.ui.startup.title': 'Configure startup',
    'cli.ui.startup.currentMode': 'Current mode:',
    'cli.ui.startup.disabledLabel': 'Disabled',
    'cli.ui.startup.backgroundLabel': 'Background',
    'cli.ui.startup.openUiLabel': 'Open UI',
    'cli.ui.language.switch': 'Switch Language',
    'cli.ui.language.current': 'Current:',
    'cli.ui.language.warningTitle': '⚠️ WARNING',
    'cli.ui.language.warningMsg': '  Warning: Changing language will RESTART the entire nonstop system.\n  Active sessions might be lost and cannot be recovered.\n  This action cannot be undone.',
    'cli.ui.language.confirm': 'Do you want to proceed with language change?',
    'cli.ui.logs.title': 'Recent logs',
    'cli.ui.logs.empty': '\n  No logs found.',
    'cli.ui.sessionAttach.connecting': 'Connecting to the background session...',
    'cli.ui.sessionAttach.connected': '--- Connected to the {preset} session | Start typing to interact ---',
    'cli.ui.sessionAttach.detachHint': '--- Press Ctrl+B then D to detach (the session will keep running in the background) ---',
    'cli.ui.sessionAttach.detaching': '\n\nDetaching...',
    'cli.ui.sessionAttach.exited': '\n\n[Session exited with code {code}]',
    'cli.ui.sessionAttach.ipcError': '\nIPC connection error: {error}',
    'cli.ui.sessionAttach.disconnected': '\nDisconnected from the background session.',
    'cli.runtime.autoRestarting': '↻ Detected previous running state. Auto-restarting the background runtime...',
    'cli.upgrade.availableNonInteractive': 'Update available: {latest} (Current version: {current})',
    'bot.session.exitedWithCode': 'Session `{sessionId}` exited with code `{code}`.'
  },
  vi: {
    'wizard.title': 'Thiết lập nonstop',
    'wizard.token': 'Bot token Telegram',
    'wizard.admin': 'Username Telegram được phép (ví dụ: @yourname)',
    'wizard.clientName': 'Tên máy / client',
    'wizard.startupMode': 'Chế độ khởi động cùng hệ thống',
    'wizard.complete': 'Đã lưu cấu hình.',
    'dashboard.title': 'nonstop client',
    'dashboard.running': 'ĐANG CHẠY',
    'dashboard.stopped': 'ĐANG DỪNG',
    'dashboard.menu': 'Menu',
    'menu.settings': '⚙️ Sửa cấu hình',
    'menu.workspaces': '📁 Quản lý không gian làm việc',
    'menu.startup': '🔄 Cấu hình khởi động',
    'menu.language': '💬 Đổi ngôn ngữ',
    'menu.logs': '📝 Xem nhật ký gần đây',
    'menu.exit': '❌ Thoát',
    'startup.disabled': 'Tắt',
    'startup.background': 'Chạy nền',
    'startup.openUi': 'Mở giao diện',
    // Bot Vietnamese
    'bot.menu.workspaces': '📁 Không gian làm việc',
    'bot.menu.session': '⚡ Phiên làm việc',
    'bot.menu.config': '⚙️ Cấu hình',
    'bot.menu.help': 'ℹ️ Trợ giúp',
    'bot.menu.activeSessionNone': '⚡ Phiên làm việc: không có',
    'bot.menu.activeSessionRunning': '⚡ Phiên làm việc: {preset} | {cwd}',
    'bot.help.title': '📖 Lệnh có sẵn',
    'bot.help.start': '/start — Mở menu chính',
    'bot.help.status': '/status — Trạng thái runtime',
    'bot.help.help': '/help — Trợ giúp',
    'bot.help.config': '/config — Cấu hình hệ thống',
    'bot.help.send': '/send <lệnh> — Gửi lệnh thô tới phiên làm việc',
    'bot.help.inputModeNotice': 'Khi chế độ nhập BẬT, tin nhắn thường sẽ được gửi thẳng vào phiên làm việc.',
    'bot.status.title': '📊 Trạng thái Runtime',
    'bot.status.user': 'Người dùng',
    'bot.status.unlimited': 'không giới hạn',
    'bot.status.workspaces': 'Không gian làm việc',
    'bot.status.session': 'Phiên làm việc',
    'bot.status.running': 'đang chạy',
    'bot.status.none': 'không có',
    'bot.status.preset': 'Preset',
    'bot.status.directory': 'Thư mục',
    'bot.config.title': '⚙️ Cấu hình nonstop',
    'bot.config.notConfigured': 'Chưa cấu hình',
    'bot.config.languageLabel': 'Ngôn ngữ',
    'bot.config.startupLabel': 'Chế độ khởi động',
    'bot.config.updated': '✓ Đã cập nhật cấu hình cho "{field}".',
    'bot.config.enterValue': 'Nhập giá trị mới cho trường "{field}":',
    'bot.config.invalidValue': '❌ Giá trị nhập vào không hợp lệ. Vui lòng nhập một số nguyên hợp lệ cho trường "{field}".',
    'bot.config.telegramBotTokenWarning': '⚠️ CẢNH BÁO: Việc thay đổi Telegram Bot Token sẽ DỪNG Bot hiện tại lập tức và khởi động lại với Token mới. Bạn sẽ mất kết nối với Bot này và cần nhắn tin với Bot mới để tiếp tục.\n\nVui lòng nhập Telegram Bot Token mới:',
    'bot.workspaces.title': '📁 Danh sách không gian làm việc',
    'bot.workspaces.empty': 'Chưa có không gian làm việc nào.',
    'bot.workspaces.add': '➕ Thêm không gian làm việc',
    'bot.workspaces.editName': '✏️ Sửa tên',
    'bot.workspaces.editPath': '🛠️ Sửa đường dẫn',
    'bot.workspaces.delete': '🗑️ Xóa',
    'bot.workspaces.notFound': 'Không tìm thấy không gian làm việc.',
    'bot.workspaces.detailsTitle': '📁 Chi tiết không gian làm việc',
    'bot.workspaces.detailsName': 'Tên',
    'bot.workspaces.detailsPath': 'Đường dẫn',
    'bot.workspaces.addNamePrompt': 'Nhập tên không gian làm việc mới:',
    'bot.workspaces.addPathPrompt': 'Nhập đường dẫn không gian làm việc:',
    'bot.workspaces.added': '✓ Đã thêm không gian làm việc "{name}".',
    'bot.workspaces.notExists': 'Không gian làm việc không còn tồn tại.',
    'bot.workspaces.updatedName': '✓ Đã cập nhật tên không gian làm việc.',
    'bot.workspaces.updatedPath': '✓ Đã cập nhật đường dẫn không gian làm việc.',
    'bot.sessions.title': '⚡ Phiên làm việc',
    'bot.sessions.empty': 'Không có phiên làm việc đang chạy.',
    'bot.sessions.control': '🎮 Điều khiển',
    'bot.sessionDetails.title': '🎮 Điều khiển phiên',
    'bot.sessionDetails.notRunning': 'Phiên làm việc không đang chạy.',
    'bot.sessionDetails.preset': 'Preset',
    'bot.sessionDetails.status': 'Trạng thái',
    'bot.sessionDetails.directory': 'Thư mục',
    'bot.sessionDetails.inputMode': 'Chế độ nhập',
    'bot.sessionDetails.autoEnter': 'Tự động Enter',
    'bot.sessionDetails.on': 'BẬT',
    'bot.sessionDetails.off': 'TẮT',
    'bot.sessionMarkup.inputOff': '⌨️ Tắt Nhập',
    'bot.sessionMarkup.inputOn': '⌨️ Bật Nhập',
    'bot.sessionMarkup.autoEnterOff': '⏎ Tắt AutoEnter',
    'bot.sessionMarkup.autoEnterOn': '⏎ Bật AutoEnter',
    'bot.sessionMarkup.refresh': '🔄 Tải lại',
    'bot.sessionMarkup.up': '⬆️ Lên',
    'bot.sessionMarkup.down': '⬇️ Xuống',
    'bot.sessionMarkup.stop': '🛑 Dừng',
    'bot.sessionMarkup.back': '⬅️ Quay lại',
    'cli.ui.workspaces.tableNo': 'STT',
    'bot.sessionControls.presetNotSupported': 'Preset không hỗ trợ: {preset}',
    'bot.sessionControls.runningSessionExists': 'Đã có phiên làm việc đang chạy. Dừng phiên hiện tại trước.',
    'bot.sessionControls.startError': 'Lỗi khi khởi chạy phiên làm việc: {error}',
    'bot.sessionControls.notRunning': 'Phiên làm việc không đang chạy.',
    'bot.sessionControls.unsupportedAction': 'Hành động không hỗ trợ: {action}',
    'bot.general.back': '⬅️ Quay lại',
    'bot.general.authError': 'Bot này chỉ dành cho tài khoản Telegram đã cấu hình.',
    'bot.general.sendUsage': 'Cách dùng: /send <lệnh cần gửi>',
    'bot.general.noActiveSession': 'Không có phiên làm việc đang chạy.',
    'bot.general.sentCommand': '✓ Đã gửi lệnh',
    'bot.general.dangerousConfirm': '⚠️ Lệnh này có thể nguy hiểm và không thể hoàn tác: "{command}". Bạn có chắc chắn muốn thực hiện không?',
    'bot.general.confirmYes': 'Đồng ý, chạy lệnh',
    'bot.general.confirmNo': 'Hủy',
    'bot.general.confirmCancelled': 'Đã hủy thực hiện lệnh.',
    'bot.general.defaultMessage': 'Dùng /start để mở menu.',
    // CLI Vietnamese
    'cli.runtime.alreadyRunning': '⚠ Runtime nền của nonstop đã đang chạy.',
    'cli.runtime.started': '✓ Đã khởi chạy runtime nền của nonstop (pid {pid}).',
    'cli.runtime.notRunning': '⚠ Runtime nền không đang chạy.',
    'cli.runtime.stopped': '✓ Đã dừng runtime nền của nonstop ({pid}).',
    'cli.runtime.stopFailed': '❌ Lỗi khi dừng runtime nền ({pid}): {error}',
    'cli.upgrade.title': 'Cập nhật nonstop',
    'cli.upgrade.available': 'Có phiên bản mới của nonstop: {latest} (Hiện tại: {current}). Bạn có muốn nâng cấp không? (y/n): ',
    'cli.upgrade.upgrading': 'Đang nâng cấp @quangnv13/nonstop lên phiên bản mới nhất...',
    'cli.upgrade.success': 'Cập nhật nonstop thành công! Nhấn phím bất kỳ để đóng...',
    'cli.upgrade.failed': 'Cập nhật nonstop thất bại.',
    'cli.upgrade.skipped': 'Đã bỏ qua cập nhật nonstop.',
    'cli.startup.unsupported': 'Hệ điều hành không hỗ trợ cấu hình khởi động.',
    'cli.startup.disabled': 'Đã tắt khởi động cùng hệ điều hành.',
    'cli.startup.enabledWindows': 'Đã bật khởi động cùng Windows ({mode}).',
    'cli.startup.enabledLinuxUi': 'Đã bật khởi động khi đăng nhập Linux desktop (open-ui).',
    'cli.startup.enabledLinuxBg': 'Đã bật khởi động dạng user service trên Linux (background).',
    'cli.runtime.startupSuccess': '✅ nonstop client (v{version}) đã khởi động thành công và đang chạy!\n🖥 Client: {clientName}',
    'cli.status.daemonStatus': 'TRẠNG THÁI DAEMON',
    'cli.status.property': 'Thuộc tính',
    'cli.status.value': 'Giá trị',
    'cli.status.running': 'Đang chạy',
    'cli.status.yes': 'Có',
    'cli.status.no': 'Không',
    'cli.status.startedAt': 'Bật lúc',
    'cli.status.lastHeartbeat': 'Heartbeat cuối',
    'cli.status.mode': 'Chế độ',
    'cli.status.activeSession': 'PHIÊN HOẠT ĐỘNG',
    'cli.status.noActiveSessions': '  Không có phiên hoạt động nào.',
    'cli.status.configSummary': 'TÓM TẮT CẤU HÌNH',
    'cli.status.configKey': 'Cấu hình',
    'cli.workspace.noWorkspaces': 'Không có không gian làm việc nào được đăng ký.',
    'cli.workspace.name': 'Tên',
    'cli.workspace.path': 'Đường dẫn',
    'cli.workspace.added': '✓ Đã thêm không gian làm việc thành công! (ID: {id})',
    'cli.workspace.notFound': '❌ Không tìm thấy không gian làm việc với ID hoặc Tên: {idOrName}',
    'cli.workspace.removed': '✓ Đã xóa không gian làm việc "{name}" thành công!',
    'cli.config.invalidKey': '❌ Khóa cấu hình không hợp lệ: {key}',
    'cli.config.invalidValue': '❌ Giá trị phải là số nguyên: {value}',
    'cli.config.invalidLanguage': '❌ Ngôn ngữ phải là \'vi\', \'en\' hoặc \'zh\'',
    'cli.config.invalidStartupMode': '❌ Startup mode phải là \'disabled\', \'background\', hoặc \'open-ui\'',
    'cli.config.updated': '✓ Đã cập nhật cấu hình {key} thành công! (Khởi động lại runtime nền nếu đang chạy để áp dụng)',
    'cli.session.noActive': 'Không có phiên PTY nào đang hoạt động.',
    'cli.session.runtimeNotRunning': '❌ Không thể kết nối vì runtime nền không chạy.',
    'cli.ui.pressEnter': 'Nhấn Enter để tiếp tục...',
    'cli.ui.connectingTelegram': '\n  Đang kết nối tới Telegram...',
    'cli.ui.connectedTelegram': '  ✓ Đã kết nối Telegram thành công!',
    'cli.ui.unableConfirmTelegram': '  ⚠ Không thể xác nhận kết nối Telegram ngay lập tức. Hệ thống vẫn đang khởi chạy.',
    'cli.ui.telegramStatus.notRunning': 'CHƯA KHỞI ĐỘNG',
    'cli.ui.telegramStatus.connected': 'ĐÃ KẾT NỐI',
    'cli.ui.telegramStatus.disconnected': 'MẤT KẾT NỐI',
    'cli.ui.mode.background': 'chạy nền',
    'cli.ui.mode.foreground': 'chạy trực tiếp',
    'cli.ui.status': 'Trạng thái',
    'cli.ui.version': 'Phiên bản',
    'cli.ui.language': 'Ngôn ngữ',
    'cli.ui.startup': 'Khởi động',
    'cli.ui.startedAt': 'Bật lúc',
    'cli.ui.session': 'Phiên',
    'cli.ui.directory': 'Thư mục',
    'cli.ui.error': 'Lỗi',
    'cli.ui.upgrade.title': 'Đang nâng cấp nonstop',
    'cli.ui.upgrade.opening': '  Đang mở cửa sổ PowerShell mới để nâng cấp. Tiến trình hiện tại sẽ tự đóng...',
    'cli.ui.upgrade.upgrading': 'Đang nâng cấp @quangnv13/nonstop lên phiên bản {version}...',
    'cli.ui.upgrade.complete': 'Nâng cấp nonstop hoàn tất! Cửa sổ này sẽ tự đóng sau 3 giây...',
    'cli.ui.upgrade.runningCmd': '  Đang chạy lệnh cài đặt...',
    'cli.ui.upgrade.success': '\n  ✓ Nâng cấp nonstop thành công! Vui lòng khởi động lại nonstop.',
    'cli.ui.upgrade.failed': '\n  ❌ Lỗi nâng cấp nonstop: ',
    'cli.ui.update.available': 'Có bản cập nhật mới!',
    'cli.ui.update.checking': 'Đang kiểm tra cập nhật',
    'cli.ui.update.currentVersion': 'Phiên bản hiện tại:',
    'cli.ui.update.latestVersion': 'Phiên bản mới nhất:',
    'cli.ui.update.prompt': 'Bạn có muốn nâng cấp ngay bây giờ không?',
    'cli.ui.update.yes': 'Có, nâng cấp ngay',
    'cli.ui.update.no': 'Không, để sau',
    'cli.ui.menu.stopBg': '⏹️ Tắt runtime nền',
    'cli.ui.menu.startBg': '▶️ Bật runtime nền',
    'cli.ui.menu.listSessions': '⚡ Danh sách CLI đã spawn',
    'cli.ui.menu.exited': 'Đã thoát nonstop client.',
    'cli.ui.sessions.backToMenu': '🔙 ← Quay lại menu chính',
    'cli.ui.sessions.title': 'Danh sách CLI đã spawn',
    'cli.ui.sessions.notRunning': '  ⚠ Runtime nền hiện không chạy.',
    'cli.ui.sessions.noActive': '  Không có session nào đang chạy.',
    'cli.ui.setup.title': 'Thiết lập nonstop',
    'cli.ui.setup.promptLang': '  Chọn ngôn ngữ / Choose language:',
    'cli.ui.config.edit': 'Sửa cấu hình',
    'cli.ui.config.logRetentionDays': 'Số ngày giữ nhật ký (LOG_RETENTION_DAYS)',
    'cli.ui.config.logRetentionDays.invalid': 'Vui lòng nhập một số nguyên dương.',
    'cli.ui.config.logRotationHourly': 'Bật xoay vòng nhật ký theo giờ (LOG_ROTATION_HOURLY)?',
    'cli.ui.config.saved': '✓ Đã lưu cấu hình.',
    'cli.ui.config.tokenChangedPrompt': 'Telegram Bot Token đã thay đổi. Bạn có muốn khởi động lại runtime nền ngay bây giờ để áp dụng không?',
    'cli.ui.config.tokenChangedWarn': '⚠ Lưu ý: Bạn cần khởi động lại runtime nền thủ công để áp dụng cấu hình mới.',
    'cli.ui.workspaces.addNew': '➕ Thêm không gian làm việc mới',
    'cli.ui.workspaces.title': 'Quản lý không gian làm việc',
    'cli.ui.workspaces.noWorkspaces': '  Không có không gian làm việc nào.',
    'cli.ui.workspaces.select': 'Chọn không gian làm việc hoặc thêm mới:',
    'cli.ui.workspaces.add': 'Thêm không gian làm việc mới',
    'cli.ui.workspaces.name': 'Tên không gian làm việc:',
    'cli.ui.workspaces.path': 'Đường dẫn:',
    'cli.ui.workspaces.pathEmpty': 'Đường dẫn không được để trống.',
    'cli.ui.workspaces.pathNotExist': 'Đường dẫn không tồn tại trên ổ đĩa.',
    'cli.ui.workspaces.added': 'Đã thêm không gian làm việc.',
    'cli.ui.workspaces.actions': 'Hành động không gian làm việc',
    'cli.ui.workspaces.selected': 'Đang chọn:',
    'cli.ui.workspaces.edit': '✏️ Sửa không gian làm việc',
    'cli.ui.workspaces.delete': '🗑️ Xóa không gian làm việc',
    'cli.ui.workspaces.back': '🔙 ← Quay lại',
    'cli.ui.workspaces.deleted': 'Đã xóa không gian làm việc.',
    'cli.ui.workspaces.editTitle': 'Sửa không gian làm việc',
    'cli.ui.workspaces.newName': 'Tên mới:',
    'cli.ui.workspaces.newPath': 'Đường dẫn mới:',
    'cli.ui.workspaces.newPathEmpty': 'Đường dẫn không được để trống.',
    'cli.ui.workspaces.newPathNotExist': 'Đường dẫn không tồn tại.',
    'cli.ui.workspaces.updated': 'Đã cập nhật không gian làm việc.',
    'cli.ui.startup.title': 'Cấu hình khởi động',
    'cli.ui.startup.currentMode': 'Chế độ hiện tại:',
    'cli.ui.startup.disabledLabel': 'Tắt (disabled)',
    'cli.ui.startup.backgroundLabel': 'Chạy nền (background)',
    'cli.ui.startup.openUiLabel': 'Mở giao diện (open-ui)',
    'cli.ui.language.switch': 'Đổi ngôn ngữ',
    'cli.ui.language.current': 'Hiện tại:',
    'cli.ui.language.warningTitle': '⚠️ CẢNH BÁO',
    'cli.ui.language.warningMsg': '  Cảnh báo: Đổi ngôn ngữ sẽ KHỞI ĐỘNG LẠI toàn bộ hệ thống nonstop.\n  Các phiên hoạt động (active sessions) hiện tại có thể bị mất và không thể khôi phục.\n  Hành động này không thể hoàn tác.',
    'cli.ui.language.confirm': 'Bạn có muốn tiếp tục đổi ngôn ngữ?',
    'cli.ui.logs.title': 'Nhật ký gần đây',
    'cli.ui.logs.empty': '\n  Chưa có nhật ký.',
    'cli.ui.sessionAttach.connecting': 'Đang kết nối tới phiên chạy nền...',
    'cli.ui.sessionAttach.connected': '--- Đã kết nối tới phiên {preset} | Gõ phím để tương tác ---',
    'cli.ui.sessionAttach.detachHint': '--- Nhấn Ctrl+B rồi nhấn D để ngắt kết nối (session vẫn chạy nền) ---',
    'cli.ui.sessionAttach.detaching': '\n\nĐang ngắt kết nối...',
    'cli.ui.sessionAttach.exited': '\n\n[Phiên làm việc đã kết thúc với mã thoát {code}]',
    'cli.ui.sessionAttach.ipcError': '\nLỗi kết nối IPC: {error}',
    'cli.ui.sessionAttach.disconnected': '\nĐã ngắt kết nối với phiên chạy nền.',
    'cli.runtime.autoRestarting': '↻ Phát hiện trạng thái trước đó đang chạy. Đang tự khởi động lại runtime nền...',
    'cli.upgrade.availableNonInteractive': 'Có bản cập nhật mới: {latest} (Phiên bản hiện tại: {current})',
    'bot.session.exitedWithCode': 'Phiên làm việc `{sessionId}` đã kết thúc với mã thoát `{code}`.'
  },
  zh: {
    'wizard.title': 'nonstop 安装向导',
    'wizard.token': 'Telegram Bot Token',
    'wizard.admin': '授权的 Telegram 用户名 (例如 @yourusername)',
    'wizard.clientName': '客户端名称',
    'wizard.startupMode': '开机启动模式',
    'wizard.complete': '设置已完成并保存。',
    'dashboard.title': 'nonstop 客户端',
    'dashboard.running': '运行中',
    'dashboard.stopped': '已停止',
    'dashboard.menu': '菜单',
    'menu.settings': '⚙️ 修改配置',
    'menu.workspaces': '📁 管理工作区',
    'menu.startup': '🔄 配置开机启动',
    'menu.language': '💬 切换语言',
    'menu.logs': '📝 查看最近日志',
    'menu.exit': '❌ 退出',
    'startup.disabled': '已禁用',
    'startup.background': '后台运行',
    'startup.openUi': '打开界面',
    // Bot Chinese
    'bot.menu.workspaces': '📁 工作区',
    'bot.menu.session': '⚡ 活动会话',
    'bot.menu.config': '⚙️ 设置',
    'bot.menu.help': 'ℹ️ 帮助',
    'bot.menu.activeSessionNone': '⚡ 活动会话：无',
    'bot.menu.activeSessionRunning': '⚡ 活动会话：{preset} | {cwd}',
    'bot.help.title': '📖 可用命令',
    'bot.help.start': '/start — 打开主菜单',
    'bot.help.status': '/status — 检查运行状态',
    'bot.help.help': '/help — 显示帮助信息',
    'bot.help.config': '/config — 查看或修改设置',
    'bot.help.send': '/send <command> — 直接发送命令到活动会话',
    'bot.help.inputModeNotice': '当输入模式开启时，您发送的任何消息（不以 "/" 开头）都将直接转发到活动的 Shell 会话。',
    'bot.status.title': '📊 运行状态',
    'bot.status.user': '用户',
    'bot.status.unlimited': '无限制',
    'bot.status.workspaces': '工作区',
    'bot.status.session': '活动会话',
    'bot.status.running': '运行中',
    'bot.status.none': '无',
    'bot.status.preset': '预设',
    'bot.status.directory': '目录',
    'bot.config.title': '⚙️ nonstop 配置',
    'bot.config.notConfigured': '未配置',
    'bot.config.languageLabel': '语言',
    'bot.config.startupLabel': '开机启动模式',
    'bot.config.updated': '✓ 字段 "{field}" 的配置已更新。',
    'bot.config.enterValue': '请输入 "{field}" 的新值：',
    'bot.config.invalidValue': '❌ 无效值。请输入有效的整数作为 "{field}" 的值。',
    'bot.config.telegramBotTokenWarning': '⚠️ 警告：修改 Telegram Bot Token 将立即停止当前 Bot 并使用新 Token 重新启动。您将失去与当前 Bot 的连接，需要向新 Bot 发送消息以继续。\n\n请输入新的 Telegram Bot Token：',
    'bot.workspaces.title': '📁 工作区',
    'bot.workspaces.empty': '未配置工作区。',
    'bot.workspaces.add': '➕ 添加工作区',
    'bot.workspaces.editName': '✏️ 修改名称',
    'bot.workspaces.editPath': '🛠️ 修改路径',
    'bot.workspaces.delete': '🗑️ 删除',
    'bot.workspaces.notFound': '未找到工作区。',
    'bot.workspaces.detailsTitle': '📁 工作区详情',
    'bot.workspaces.detailsName': '名称',
    'bot.workspaces.detailsPath': '路径',
    'bot.workspaces.addNamePrompt': '请输入新工作区的名称：',
    'bot.workspaces.addPathPrompt': '请输入工作区的绝对路径：',
    'bot.workspaces.added': '✓ 已添加工作区 "{name}"。',
    'bot.workspaces.notExists': '工作区不存在。',
    'bot.workspaces.updatedName': '✓ 工作区名称已更新。',
    'bot.workspaces.updatedPath': '✓ 工作区路径已更新。',
    'bot.sessions.title': '⚡ 活动会话',
    'bot.sessions.empty': '当前没有活动的会话在运行。',
    'bot.sessions.control': '🎮 控制',
    'bot.sessionDetails.title': '🎮 会话控制',
    'bot.sessionDetails.notRunning': '会话未运行。',
    'bot.sessionDetails.preset': '预设',
    'bot.sessionDetails.status': '状态',
    'bot.sessionDetails.directory': '目录',
    'bot.sessionDetails.inputMode': '输入模式',
    'bot.sessionDetails.autoEnter': '自动回车',
    'bot.sessionDetails.on': '开启',
    'bot.sessionDetails.off': '关闭',
    'bot.sessionMarkup.inputOff': '⌨️ 关闭输入',
    'bot.sessionMarkup.inputOn': '⌨️ 开启输入',
    'bot.sessionMarkup.autoEnterOff': '⏎ 关闭自动回车',
    'bot.sessionMarkup.autoEnterOn': '⏎ 开启自动回车',
    'bot.sessionMarkup.refresh': '🔄 刷新',
    'bot.sessionMarkup.up': '⬆️ 向上',
    'bot.sessionMarkup.down': '⬇️ 向下',
    'bot.sessionMarkup.stop': '🛑 停止',
    'bot.sessionMarkup.back': '⬅️ 返回',
    'cli.ui.workspaces.tableNo': '序号',
    'bot.sessionControls.presetNotSupported': '不支持预设 "{preset}"。',
    'bot.sessionControls.runningSessionExists': '已有会话在运行。请先停止当前会话。',
    'bot.sessionControls.startError': '启动会话失败: {error}',
    'bot.sessionControls.notRunning': '会话未运行。',
    'bot.sessionControls.unsupportedAction': '不支持操作 "{action}"。',
    'bot.general.back': '⬅️ 返回',
    'bot.general.authError': '拒绝访问。此 Bot 已配置为仅限特定 Telegram 账户。',
    'bot.general.sendUsage': '用法: /send <命令>',
    'bot.general.noActiveSession': '当前没有活动会话在运行。',
    'bot.general.sentCommand': '✓ 命令已发送。',
    'bot.general.dangerousConfirm': '⚠️ 警告：此命令可能具有破坏性且无法撤销："{command}"。确定要执行吗？',
    'bot.general.confirmYes': '是的，执行',
    'bot.general.confirmNo': '取消',
    'bot.general.confirmCancelled': '命令执行已取消。',
    'bot.general.defaultMessage': '使用 /start 打开主菜单。',
    // CLI Chinese
    'cli.runtime.alreadyRunning': '⚠ nonstop 后台运行环境已经在运行。',
    'cli.runtime.started': '✓ nonstop 后台运行环境已启动 (PID {pid})。',
    'cli.runtime.notRunning': '⚠ 后台运行环境未运行。',
    'cli.runtime.stopped': '✓ nonstop 后台运行环境已停止 ({pid})。',
    'cli.runtime.stopFailed': '❌ 停止后台运行环境失败 ({pid}): {error}',
    'cli.upgrade.title': 'nonstop 更新',
    'cli.upgrade.available': '发现 nonstop 新版本: {latest} (当前版本: {current})。是否要升级？(y/n): ',
    'cli.upgrade.upgrading': '正在升级 @quangnv13/nonstop 至最新版本...',
    'cli.upgrade.success': 'nonstop 更新成功！按任意键关闭...',
    'cli.upgrade.failed': 'nonstop 更新失败。',
    'cli.upgrade.skipped': '已跳过 nonstop 更新。',
    'cli.startup.unsupported': '操作系统不支持开机启动配置。',
    'cli.startup.disabled': '已禁用开机启动。',
    'cli.startup.enabledWindows': '已启用 Windows 开机启动 ({mode})。',
    'cli.startup.enabledLinuxUi': '已启用 Linux 桌面登录启动 (open-ui)。',
    'cli.startup.enabledLinuxBg': '已启用 Linux 用户服务启动 (background)。',
    'cli.runtime.startupSuccess': '✅ nonstop 客户端 (v{version}) 已成功启动并正在运行！\n🖥 客户端: {clientName}',
    'cli.status.daemonStatus': '守护进程状态',
    'cli.status.property': '属性',
    'cli.status.value': '值',
    'cli.status.running': '运行中',
    'cli.status.yes': '是',
    'cli.status.no': '否',
    'cli.status.startedAt': '启动于',
    'cli.status.lastHeartbeat': '最后心跳',
    'cli.status.mode': '模式',
    'cli.status.activeSession': '活动会话',
    'cli.status.noActiveSessions': '  没有活动会话。',
    'cli.status.configSummary': '配置摘要',
    'cli.status.configKey': '配置项',
    'cli.workspace.noWorkspaces': '没有注册的工作区。',
    'cli.workspace.name': '名称',
    'cli.workspace.path': '路径',
    'cli.workspace.added': '✓ 成功添加工作区！(ID: {id})',
    'cli.workspace.notFound': '❌ 未找到 ID 或名称为 {idOrName} 的工作区',
    'cli.workspace.removed': '✓ 成功删除工作区 "{name}"！',
    'cli.config.invalidKey': '❌ 无效的配置键: {key}',
    'cli.config.invalidValue': '❌ 值必须为整数: {value}',
    'cli.config.invalidLanguage': '❌ 语言必须为 \'vi\', \'en\' 或 \'zh\'',
    'cli.config.invalidStartupMode': '❌ 开机启动模式必须为 \'disabled\', \'background\' 或 \'open-ui\'',
    'cli.config.updated': '✓ 成功更新配置 {key}！(如果后台运行环境正在运行，请重启以应用更改)',
    'cli.session.noActive': '没有活动的 PTY 会话。',
    'cli.session.runtimeNotRunning': '❌ 无法连接，因为后台运行环境未运行。',
    'cli.ui.pressEnter': '按 Enter 键继续...',
    'cli.ui.connectingTelegram': '\n  正在连接到 Telegram...',
    'cli.ui.connectedTelegram': '  ✓ 成功连接到 Telegram！',
    'cli.ui.unableConfirmTelegram': '  ⚠ 无法立即确认 Telegram 连接。系统仍在启动中。',
    'cli.ui.telegramStatus.notRunning': '未启动',
    'cli.ui.telegramStatus.connected': '已连接',
    'cli.ui.telegramStatus.disconnected': '断开连接',
    'cli.ui.mode.background': '后台运行',
    'cli.ui.mode.foreground': '前台运行',
    'cli.ui.status': '状态',
    'cli.ui.version': '版本',
    'cli.ui.language': '语言',
    'cli.ui.startup': '开机启动',
    'cli.ui.startedAt': '启动于',
    'cli.ui.session': '会话',
    'cli.ui.directory': '目录',
    'cli.ui.error': '错误',
    'cli.ui.upgrade.title': '正在升级 nonstop',
    'cli.ui.upgrade.opening': '  正在打开新的 PowerShell 窗口进行升级。当前进程即将退出...',
    'cli.ui.upgrade.upgrading': '正在升级 @quangnv13/nonstop 至版本 {version}...',
    'cli.ui.upgrade.complete': 'nonstop 升级完成！此窗口将在 3 秒后自动关闭...',
    'cli.ui.upgrade.runningCmd': '  正在运行安装命令...',
    'cli.ui.upgrade.success': '\n  ✓ nonstop 升级成功！请重新启动 nonstop。',
    'cli.ui.upgrade.failed': '\n  ❌ nonstop 升级失败: ',
    'cli.ui.update.available': '有新版本可用！',
    'cli.ui.update.checking': '正在检查更新',
    'cli.ui.update.currentVersion': '当前版本:',
    'cli.ui.update.latestVersion': '最新版本:',
    'cli.ui.update.prompt': '您现在要升级吗？',
    'cli.ui.update.yes': '是，立即升级',
    'cli.ui.update.no': '否，稍后提醒',
    'cli.ui.menu.stopBg': '⏹️ 停止后台运行环境',
    'cli.ui.menu.startBg': '▶️ 启动后台运行环境',
    'cli.ui.menu.listSessions': '⚡ 已生成的 CLI 列表',
    'cli.ui.menu.exited': '已退出 nonstop 客户端。',
    'cli.ui.sessions.backToMenu': '🔙 ← 返回主菜单',
    'cli.ui.sessions.title': '已生成的 CLI 列表',
    'cli.ui.sessions.notRunning': '  ⚠ 后台运行环境当前未运行。',
    'cli.ui.sessions.noActive': '  当前无正在运行的会话。',
    'cli.ui.setup.title': 'nonstop 设置',
    'cli.ui.setup.promptLang': '  选择语言 / Choose language:',
    'cli.ui.config.edit': '修改配置',
    'cli.ui.config.logRetentionDays': '日志保留天数 (LOG_RETENTION_DAYS)',
    'cli.ui.config.logRetentionDays.invalid': '请输入一个正整数。',
    'cli.ui.config.logRotationHourly': '是否按小时循环日志 (LOG_ROTATION_HOURLY)？',
    'cli.ui.config.saved': '✓ 配置已保存。',
    'cli.ui.config.tokenChangedPrompt': 'Telegram Bot Token 已更改。您想立即重启后台运行环境以应用更改吗？',
    'cli.ui.config.tokenChangedWarn': '⚠ 注意：您需要手动重启后台运行环境以应用新设置。',
    'cli.ui.workspaces.addNew': '➕ 添加新工作区',
    'cli.ui.workspaces.title': '工作区管理',
    'cli.ui.workspaces.noWorkspaces': '  未注册工作区。',
    'cli.ui.workspaces.select': '选择工作区或添加新工作区:',
    'cli.ui.workspaces.add': '添加新工作区',
    'cli.ui.workspaces.name': '工作区名称:',
    'cli.ui.workspaces.path': '路径:',
    'cli.ui.workspaces.pathEmpty': '路径不能为空。',
    'cli.ui.workspaces.pathNotExist': '该路径在磁盘上不存在。',
    'cli.ui.workspaces.added': '工作区已添加。',
    'cli.ui.workspaces.actions': '工作区操作',
    'cli.ui.workspaces.selected': '已选择:',
    'cli.ui.workspaces.edit': '✏️ 编辑工作区',
    'cli.ui.workspaces.delete': '🗑️ 删除工作区',
    'cli.ui.workspaces.back': '🔙 ← 返回',
    'cli.ui.workspaces.deleted': '工作区已删除。',
    'cli.ui.workspaces.editTitle': '编辑工作区',
    'cli.ui.workspaces.newName': '新名称:',
    'cli.ui.workspaces.newPath': '新路径:',
    'cli.ui.workspaces.newPathEmpty': '路径不能为空。',
    'cli.ui.workspaces.newPathNotExist': '路径不存在。',
    'cli.ui.workspaces.updated': '工作区已更新。',
    'cli.ui.startup.title': '配置开机启动',
    'cli.ui.startup.currentMode': '当前模式:',
    'cli.ui.startup.disabledLabel': '禁用 (disabled)',
    'cli.ui.startup.backgroundLabel': '后台运行 (background)',
    'cli.ui.startup.openUiLabel': '打开界面 (open-ui)',
    'cli.ui.language.switch': '切换语言',
    'cli.ui.language.current': '当前语言:',
    'cli.ui.language.warningTitle': '⚠️ 警告',
    'cli.ui.language.warningMsg': '  警告：切换语言将重启整个 nonstop 系统。\n  当前活动会话可能会丢失且无法恢复。\n  此操作无法撤销。',
    'cli.ui.language.confirm': '您确定要继续切换语言吗？',
    'cli.ui.logs.title': '最近日志',
    'cli.ui.logs.empty': '\n  未找到日志。',
    'cli.ui.sessionAttach.connecting': '正在连接到后台会话...',
    'cli.ui.sessionAttach.connected': '--- 已连接到 {preset} 会话 | 开始输入以交互 ---',
    'cli.ui.sessionAttach.detachHint': '--- 按 Ctrl+B 然后按 D 断开连接 (会话将继续在后台运行) ---',
    'cli.ui.sessionAttach.detaching': '\n\n正在断开连接...',
    'cli.ui.sessionAttach.exited': '\n\n[会话已退出，退出代码 {code}]',
    'cli.ui.sessionAttach.ipcError': '\nIPC 连接错误: {error}',
    'cli.ui.sessionAttach.disconnected': '\n已断开与后台会话的连接。',
    'cli.runtime.autoRestarting': '↻ 检测到之前的运行状态。正在自动重启后台运行环境...',
    'cli.upgrade.availableNonInteractive': '有新版本可用: {latest} (当前版本: {current})',
    'bot.session.exitedWithCode': '会话 `{sessionId}` 已退出，退出代码为 `{code}`。'
  }
};

export function createTranslator(language: AppLanguage) {
  return (key: TranslationKey, params?: Record<string, string | number>): string => {
    let msg = MESSAGES[language][key] || MESSAGES.en[key];
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        msg = msg.replace(new RegExp(`{${k}}`, 'g'), String(v));
      }
    }
    return msg;
  };
}
