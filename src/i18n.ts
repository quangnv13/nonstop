import { AppLanguage } from './config.js';

type TranslationKey =
  | 'wizard.title'
  | 'wizard.language'
  | 'wizard.token'
  | 'wizard.admin'
  | 'wizard.clientName'
  | 'wizard.startupMode'
  | 'wizard.complete'
  | 'dashboard.title'
  | 'dashboard.running'
  | 'dashboard.stopped'
  | 'dashboard.menu'
  | 'dashboard.choice'
  | 'menu.toggleRuntime'
  | 'menu.settings'
  | 'menu.workspaces'
  | 'menu.startup'
  | 'menu.language'
  | 'menu.logs'
  | 'menu.exit'
  | 'settings.saved'
  | 'startup.disabled'
  | 'startup.background'
  | 'startup.openUi';

const MESSAGES: Record<AppLanguage, Record<TranslationKey, string>> = {
  en: {
    'wizard.title': 'nonstop setup wizard',
    'wizard.language': 'Choose language (en/vi)',
    'wizard.token': 'Telegram bot token',
    'wizard.admin': 'Telegram username to allow (example: @yourname)',
    'wizard.clientName': 'Client name',
    'wizard.startupMode': 'Startup mode (disabled/background/open-ui)',
    'wizard.complete': 'Setup saved.',
    'dashboard.title': 'nonstop client',
    'dashboard.running': 'RUNNING',
    'dashboard.stopped': 'STOPPED',
    'dashboard.menu': 'Menu',
    'dashboard.choice': 'Choose an option',
    'menu.toggleRuntime': 'Start/Stop background runtime',
    'menu.settings': 'Edit config',
    'menu.workspaces': 'Manage workspaces',
    'menu.startup': 'Configure startup with OS',
    'menu.language': 'Switch language',
    'menu.logs': 'View recent logs',
    'menu.exit': 'Exit',
    'settings.saved': 'Settings saved.',
    'startup.disabled': 'disabled',
    'startup.background': 'background',
    'startup.openUi': 'open-ui'
  },
  vi: {
    'wizard.title': 'Thiet lap nonstop',
    'wizard.language': 'Chon ngon ngu (en/vi)',
    'wizard.token': 'Bot token Telegram',
    'wizard.admin': 'Username Telegram duoc phep (vi du: @yourname)',
    'wizard.clientName': 'Ten may/client',
    'wizard.startupMode': 'Che do khoi dong cung OS (disabled/background/open-ui)',
    'wizard.complete': 'Da luu cau hinh.',
    'dashboard.title': 'client nonstop',
    'dashboard.running': 'DANG CHAY',
    'dashboard.stopped': 'DANG DUNG',
    'dashboard.menu': 'Menu',
    'dashboard.choice': 'Chon mot tuy chon',
    'menu.toggleRuntime': 'Bat/Tat runtime nen',
    'menu.settings': 'Sua cau hinh',
    'menu.workspaces': 'Quan ly workspace',
    'menu.startup': 'Cau hinh khoi dong cung OS',
    'menu.language': 'Doi ngon ngu',
    'menu.logs': 'Xem log gan day',
    'menu.exit': 'Thoat',
    'settings.saved': 'Da luu cau hinh.',
    'startup.disabled': 'tat',
    'startup.background': 'nen',
    'startup.openUi': 'mo giao dien'
  }
};

export function createTranslator(language: AppLanguage) {
  return (key: TranslationKey): string => MESSAGES[language][key] || MESSAGES.en[key];
}
