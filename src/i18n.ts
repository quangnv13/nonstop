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
    'wizard.startupMode': 'Startup mode',
    'wizard.complete': 'Setup saved.',
    'dashboard.title': 'nonstop client',
    'dashboard.running': 'RUNNING',
    'dashboard.stopped': 'STOPPED',
    'dashboard.menu': 'Menu',
    'dashboard.choice': 'Choose an option',
    'menu.toggleRuntime': 'Start/Stop background runtime',
    'menu.settings': 'Edit config',
    'menu.workspaces': 'Manage workspaces',
    'menu.startup': 'Configure startup',
    'menu.language': 'Switch language',
    'menu.logs': 'View recent logs',
    'menu.exit': 'Exit',
    'settings.saved': 'Settings saved.',
    'startup.disabled': 'Disabled',
    'startup.background': 'Background',
    'startup.openUi': 'Open UI'
  },
  vi: {
    'wizard.title': 'Thiết lập nonstop',
    'wizard.language': 'Chọn ngôn ngữ (en/vi)',
    'wizard.token': 'Bot token Telegram',
    'wizard.admin': 'Username Telegram được phép (ví dụ: @yourname)',
    'wizard.clientName': 'Tên máy / client',
    'wizard.startupMode': 'Chế độ khởi động cùng hệ thống',
    'wizard.complete': 'Đã lưu cấu hình.',
    'dashboard.title': 'nonstop client',
    'dashboard.running': 'ĐANG CHẠY',
    'dashboard.stopped': 'ĐANG DỪNG',
    'dashboard.menu': 'Menu',
    'dashboard.choice': 'Chọn một tùy chọn',
    'menu.toggleRuntime': 'Bật/Tắt runtime nền',
    'menu.settings': 'Sửa cấu hình',
    'menu.workspaces': 'Quản lý workspace',
    'menu.startup': 'Cấu hình khởi động',
    'menu.language': 'Đổi ngôn ngữ',
    'menu.logs': 'Xem nhật ký gần đây',
    'menu.exit': 'Thoát',
    'settings.saved': 'Đã lưu cấu hình.',
    'startup.disabled': 'Tắt',
    'startup.background': 'Chạy nền',
    'startup.openUi': 'Mở giao diện'
  }
};

export function createTranslator(language: AppLanguage) {
  return (key: TranslationKey): string => MESSAGES[language][key] || MESSAGES.en[key];
}
