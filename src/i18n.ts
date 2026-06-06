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
  | 'bot.help.back'
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
  | 'bot.sessionDetails.id'
  | 'bot.sessionDetails.preset'
  | 'bot.sessionDetails.status'
  | 'bot.sessionDetails.directory'
  | 'bot.sessionDetails.inputMode'
  | 'bot.sessionDetails.autoEnter'
  | 'bot.sessionDetails.on'
  | 'bot.sessionDetails.off'
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
  | 'bot.general.defaultMessage';

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
    'startup.openUi': 'Open UI',
    // Bot English
    'bot.menu.workspaces': '📁 Workspaces',
    'bot.menu.session': '⚡ Session',
    'bot.menu.config': '⚙️ Settings',
    'bot.menu.help': 'ℹ️ Help',
    'bot.menu.activeSessionNone': '⚡ Session: none',
    'bot.menu.activeSessionRunning': '⚡ Session: {preset} | {cwd}',
    'bot.help.title': '📖 Available Commands',
    'bot.help.start': '/start — Open main menu',
    'bot.help.status': '/status — Runtime status',
    'bot.help.help': '/help — Help text',
    'bot.help.config': '/config — System configuration',
    'bot.help.send': '/send <command> — Send raw input directly to the active session',
    'bot.help.inputModeNotice': 'When Input Mode is ON, any normal text message you send (without a leading /) will be fed directly into your shell.',
    'bot.help.back': '⬅️ Back',
    'bot.status.title': '📊 Runtime Status',
    'bot.status.user': 'User',
    'bot.status.unlimited': 'unlimited',
    'bot.status.workspaces': 'Workspaces',
    'bot.status.session': 'Session',
    'bot.status.running': 'running',
    'bot.status.none': 'none',
    'bot.status.preset': 'Preset',
    'bot.status.directory': 'Directory',
    'bot.config.title': '⚙️ nonstop configuration',
    'bot.config.notConfigured': 'Not configured',
    'bot.config.languageLabel': 'Language',
    'bot.config.startupLabel': 'Startup Mode',
    'bot.config.updated': '✓ Config updated for "{field}".',
    'bot.config.enterValue': 'Enter new value for field "{field}":',
    'bot.config.invalidValue': '❌ Invalid value. Please enter a valid integer for field "{field}".',
    'bot.workspaces.title': '📁 Workspace List',
    'bot.workspaces.empty': 'No workspaces configured.',
    'bot.workspaces.add': '➕ Add workspace',
    'bot.workspaces.editName': '✏️ Edit name',
    'bot.workspaces.editPath': '🛠️ Edit path',
    'bot.workspaces.delete': '🗑️ Delete',
    'bot.workspaces.notFound': 'Workspace not found.',
    'bot.workspaces.detailsTitle': '📁 Workspace Details',
    'bot.workspaces.detailsName': 'Name',
    'bot.workspaces.detailsPath': 'Path',
    'bot.workspaces.addNamePrompt': 'Enter new workspace name:',
    'bot.workspaces.addPathPrompt': 'Enter workspace path:',
    'bot.workspaces.added': '✓ Added workspace "{name}".',
    'bot.workspaces.notExists': 'Workspace no longer exists.',
    'bot.workspaces.updatedName': '✓ Updated workspace name.',
    'bot.workspaces.updatedPath': '✓ Updated workspace path.',
    'bot.sessions.title': '⚡ Session',
    'bot.sessions.empty': 'No running session.',
    'bot.sessions.control': '🎮 Control',
    'bot.sessionDetails.title': '🎮 Session Control',
    'bot.sessionDetails.notRunning': 'Session is not running.',
    'bot.sessionDetails.id': 'ID',
    'bot.sessionDetails.preset': 'Preset',
    'bot.sessionDetails.status': 'Status',
    'bot.sessionDetails.directory': 'Directory',
    'bot.sessionDetails.inputMode': 'Input mode',
    'bot.sessionDetails.autoEnter': 'Auto enter',
    'bot.sessionDetails.on': 'ON',
    'bot.sessionDetails.off': 'OFF',
    'bot.sessionControls.presetNotSupported': 'Preset not supported: {preset}',
    'bot.sessionControls.runningSessionExists': 'There is already a running session. Stop the current session first.',
    'bot.sessionControls.startError': 'Error starting session: {error}',
    'bot.sessionControls.notRunning': 'Session is not running.',
    'bot.sessionControls.unsupportedAction': 'Unsupported action: {action}',
    'bot.general.back': '⬅️ Back',
    'bot.general.authError': 'This bot is only for the configured Telegram account.',
    'bot.general.sendUsage': 'Usage: /send <command to send>',
    'bot.general.noActiveSession': 'No active session running.',
    'bot.general.sentCommand': '✓ Command sent',
    'bot.general.defaultMessage': 'Use /start to open the menu.'
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
    'startup.openUi': 'Mở giao diện',
    // Bot Vietnamese
    'bot.menu.workspaces': '📁 Workspaces',
    'bot.menu.session': '⚡ Session',
    'bot.menu.config': '⚙️ Cấu hình',
    'bot.menu.help': 'ℹ️ Trợ giúp',
    'bot.menu.activeSessionNone': '⚡ Session: không có',
    'bot.menu.activeSessionRunning': '⚡ Session: {preset} | {cwd}',
    'bot.help.title': '📖 Lệnh có sẵn',
    'bot.help.start': '/start — Mở menu chính',
    'bot.help.status': '/status — Trạng thái runtime',
    'bot.help.help': '/help — Trợ giúp',
    'bot.help.config': '/config — Cấu hình hệ thống',
    'bot.help.send': '/send <lệnh> — Gửi lệnh thô tới session',
    'bot.help.inputModeNotice': 'Khi input mode BẬT, tin nhắn thường sẽ được gửi thẳng vào session.',
    'bot.help.back': '⬅️ Quay lại',
    'bot.status.title': '📊 Trạng thái Runtime',
    'bot.status.user': 'Người dùng',
    'bot.status.unlimited': 'không giới hạn',
    'bot.status.workspaces': 'Workspaces',
    'bot.status.session': 'Session',
    'bot.status.running': 'đang chạy',
    'bot.status.none': 'không có',
    'bot.status.preset': 'Preset',
    'bot.status.directory': 'Thư mục',
    'bot.config.title': '⚙️ Cấu hình nonstop',
    'bot.config.notConfigured': 'Chưa cấu hình',
    'bot.config.languageLabel': 'Ngôn ngữ',
    'bot.config.startupLabel': 'Chế độ khởi động',
    'bot.config.updated': '✓ Đã cập nhật cấu hình cho "{field}".',
    'bot.config.enterValue': 'Nhập giá trị mới cho field "{field}":',
    'bot.config.invalidValue': '❌ Giá trị nhập vào không hợp lệ. Vui lòng nhập một số nguyên hợp lệ cho field "{field}".',
    'bot.workspaces.title': '📁 Danh sách Workspace',
    'bot.workspaces.empty': 'Chưa có workspace nào.',
    'bot.workspaces.add': '➕ Thêm workspace',
    'bot.workspaces.editName': '✏️ Sửa tên',
    'bot.workspaces.editPath': '🛠️ Sửa đường dẫn',
    'bot.workspaces.delete': '🗑️ Xóa',
    'bot.workspaces.notFound': 'Workspace không tìm thấy.',
    'bot.workspaces.detailsTitle': '📁 Chi tiết Workspace',
    'bot.workspaces.detailsName': 'Tên',
    'bot.workspaces.detailsPath': 'Đường dẫn',
    'bot.workspaces.addNamePrompt': 'Nhập tên workspace mới:',
    'bot.workspaces.addPathPrompt': 'Nhập đường dẫn workspace:',
    'bot.workspaces.added': '✓ Đã thêm workspace "{name}".',
    'bot.workspaces.notExists': 'Workspace không còn tồn tại.',
    'bot.workspaces.updatedName': '✓ Đã cập nhật tên workspace.',
    'bot.workspaces.updatedPath': '✓ Đã cập nhật đường dẫn workspace.',
    'bot.sessions.title': '⚡ Session',
    'bot.sessions.empty': 'Không có session đang chạy.',
    'bot.sessions.control': '🎮 Điều khiển',
    'bot.sessionDetails.title': '🎮 Điều khiển Session',
    'bot.sessionDetails.notRunning': 'Session không đang chạy.',
    'bot.sessionDetails.id': 'ID',
    'bot.sessionDetails.preset': 'Preset',
    'bot.sessionDetails.status': 'Trạng thái',
    'bot.sessionDetails.directory': 'Thư mục',
    'bot.sessionDetails.inputMode': 'Input mode',
    'bot.sessionDetails.autoEnter': 'Auto enter',
    'bot.sessionDetails.on': 'BẬT',
    'bot.sessionDetails.off': 'TẮT',
    'bot.sessionControls.presetNotSupported': 'Preset không hỗ trợ: {preset}',
    'bot.sessionControls.runningSessionExists': 'Đã có session đang chạy. Dừng session hiện tại trước.',
    'bot.sessionControls.startError': 'Lỗi khi khởi chạy session: {error}',
    'bot.sessionControls.notRunning': 'Session không đang chạy.',
    'bot.sessionControls.unsupportedAction': 'Hành động không hỗ trợ: {action}',
    'bot.general.back': '⬅️ Quay lại',
    'bot.general.authError': 'Bot này chỉ dành cho tài khoản Telegram đã cấu hình.',
    'bot.general.sendUsage': 'Cách dùng: /send <lệnh cần gửi>',
    'bot.general.noActiveSession': 'Không có session đang chạy.',
    'bot.general.sentCommand': '✓ Đã gửi lệnh',
    'bot.general.defaultMessage': 'Dùng /start để mở menu.'
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
