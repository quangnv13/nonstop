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
  | 'bot.general.dangerousConfirm'
  | 'bot.general.confirmYes'
  | 'bot.general.confirmNo'
  | 'bot.general.confirmCancelled'
  | 'bot.general.defaultMessage';

const MESSAGES: Record<AppLanguage, Record<TranslationKey, string>> = {
  en: {
    'wizard.title': 'nonstop Setup Wizard',
    'wizard.language': 'Select language (en/vi)',
    'wizard.token': 'Telegram Bot Token',
    'wizard.admin': 'Authorized Telegram username (e.g., @yourusername)',
    'wizard.clientName': 'Client Name',
    'wizard.startupMode': 'Startup Mode',
    'wizard.complete': 'Setup completed and saved.',
    'dashboard.title': 'nonstop Client',
    'dashboard.running': 'RUNNING',
    'dashboard.stopped': 'STOPPED',
    'dashboard.menu': 'Menu',
    'dashboard.choice': 'Select an option',
    'menu.toggleRuntime': 'Start/Stop background runtime',
    'menu.settings': '⚙️ Edit configuration',
    'menu.workspaces': '📁 Manage workspaces',
    'menu.startup': '🔄 Configure startup',
    'menu.language': '💬 Switch language',
    'menu.logs': '📝 View recent logs',
    'menu.exit': '❌ Exit',
    'settings.saved': 'Settings saved.',
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
    'bot.help.back': '⬅️ Back',
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
    'bot.sessionDetails.id': 'ID',
    'bot.sessionDetails.preset': 'Preset',
    'bot.sessionDetails.status': 'Status',
    'bot.sessionDetails.directory': 'Directory',
    'bot.sessionDetails.inputMode': 'Input Mode',
    'bot.sessionDetails.autoEnter': 'Auto Enter',
    'bot.sessionDetails.on': 'ON',
    'bot.sessionDetails.off': 'OFF',
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
    'bot.general.defaultMessage': 'Use /start to open the main menu.'
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
    'menu.settings': '⚙️ Sửa cấu hình',
    'menu.workspaces': '📁 Quản lý không gian làm việc',
    'menu.startup': '🔄 Cấu hình khởi động',
    'menu.language': '💬 Đổi ngôn ngữ',
    'menu.logs': '📝 Xem nhật ký gần đây',
    'menu.exit': '❌ Thoát',
    'settings.saved': 'Đã lưu cấu hình.',
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
    'bot.help.back': '⬅️ Quay lại',
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
    'bot.sessionDetails.id': 'ID',
    'bot.sessionDetails.preset': 'Preset',
    'bot.sessionDetails.status': 'Trạng thái',
    'bot.sessionDetails.directory': 'Thư mục',
    'bot.sessionDetails.inputMode': 'Chế độ nhập',
    'bot.sessionDetails.autoEnter': 'Tự động Enter',
    'bot.sessionDetails.on': 'BẬT',
    'bot.sessionDetails.off': 'TẮT',
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
