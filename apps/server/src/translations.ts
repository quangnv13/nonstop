export const translations: Record<string, Record<string, string>> = {
  en: {
    start_bootstrap: "🎉 *First User Bootstrap:* You are now the Admin\\!\nYour Telegram User ID: `{userId}`",
    no_admin: "⚠️ System has no admin\\. Send /start to bootstrap admin\\.",
    unauthorized: "❌ *Unauthorized:* You do not have access\\. User ID: `{userId}` \\(ask admin to run `/allow {userId}`\\)",
    added_allowed: "✅ Added user ID `{targetId}` to allowed list\\.",
    admin_only: "❌ Admin only command\\.",
    invalid_id: "❌ Invalid user ID\\.",
    specify_id: "⚠️ Please specify a user ID, e.g\\. `/allow 123456789`",
    help_text: `
🤖 *Remote CLI Control Platform*

*Commands:*
/start \\- Show main menu and initialize admin
/help \\- Show this help message
/send \\<text\\> \\- Send raw input to active session
/enter \\- Send Enter key
/kill \\- Terminate active session\\(s\\)
/input\\_on \\- Enable Interactive Input Mode \\(messages send to PTY\\)
/input\\_off \\- Disable Interactive Input Mode
/input\\_enter\\_on \\- Auto\\-append Enter to Interactive inputs
/input\\_enter\\_off \\- Do not auto\\-append Enter
/status \\- Show system status
/allow \\<id\\> \\- Admin only: Allow another user ID
`,
    main_menu_title: "🛸 *Remote CLI Control Platform*\n\nChoose an option from the menu below:",
    status_title: "📊 *System Status*\n\n👤 *Admin ID:* `{adminId}`\n🖥️ *Online Clients:* `{clientCount}`\n⚡ *Active Sessions:* `{runningSessions}`\n📁 *Registered Workspaces:* `{workspaceCount}`",
    clients_title: "🖥️ *Registered Clients* ({count})\n\n",
    no_clients: "_No clients registered yet\\._",
    workspaces_title: "📁 *Registered Workspaces*\n\n",
    no_workspaces: "_No online workspaces found\\. Ensure your client is connected\\._",
    workspace_details: "📁 *Workspace Details*\n\n*Name:* {name}\n*Client:* {client} \\({status}\\)\n*Path:* `{path}`\n\n🚀 *Launch a CLI Preset:*",
    session_started: "🚀 Starting *{preset}* in workspace `{workspace}`\\.\\.\\.\nOutput will be streamed here\\.\n⌨️ *Interactive Input Mode* auto\\-enabled\\.",
    active_sessions_title: "⚡ *Active PTY Sessions*\n\n",
    no_sessions: "_No active CLI sessions running\\._",
    session_details: "⚡ *Session Details*\n\n*ID:* `{id}`\n*Preset:* `{preset}`\n*Client:* {client}\n*Status:* `{status}`\n*CWD:* `{cwd}`\n*Running Time:* `{runningTime}s`\n\n⌨️ *Active Input:* `{inputMode}`\n⏎ *Auto\\-Enter:* `{autoEnter}`",
    btn_clients: "🖥️ Clients",
    btn_workspaces: "📁 Workspaces",
    btn_sessions: "⚡ Sessions",
    btn_status: "📊 Status",
    btn_help: "ℹ️ Help",
    btn_back: "⬅️ Back",
    btn_back_menu: "⬅️ Back to Menu",
    btn_enable_input: "⌨️ Enable Input",
    btn_disable_input: "⌨️ Disable Input",
    btn_enable_enter: "⏎ Enable Auto-Enter",
    btn_disable_enter: "⏎ Disable Auto-Enter",
    btn_send_enter: "⏎ Send Enter",
    btn_ctrlc: "🛑 Ctrl+C",
    btn_stop: "⏹️ Stop Session",
    btn_refresh: "🔄 Refresh",
    btn_change_lang: "🌐 Language / Ngôn ngữ",
    lang_changed: "✅ Language changed to English\\!",
    choose_lang: "🌐 Choose your language / Chọn ngôn ngữ của bạn:",
    btn_lang_en: "English 🇬🇧",
    btn_lang_vi: "Tiếng Việt 🇻🇳",
    choose_kill_session: "⚡ *Select a session to stop:*",
    no_active_sessions: "⚠️ No active CLI sessions running\\.",
    kill_all: "⏹️ Stop All",
    all_killed: "⏹️ All sessions stopped\\!",
    session_killed: "⏹️ Session `{id}` stopped\\!"
  },
  vi: {
    start_bootstrap: "🎉 *Khởi tạo Admin:* Bạn hiện là Admin\\!\nID Telegram của bạn: `{userId}`",
    no_admin: "⚠️ Hệ thống chưa có admin\\. Hãy gửi /start để khởi tạo admin\\.",
    unauthorized: "❌ *Không có quyền truy cập:* Bạn chưa được cấp quyền\\. ID của bạn: `{userId}` \\(yêu cầu admin chạy `/allow {userId}`\\)",
    added_allowed: "✅ Đã thêm user ID `{targetId}` vào danh sách được phép\\.",
    admin_only: "❌ Lệnh này chỉ dành cho Admin\\.",
    invalid_id: "❌ ID người dùng không hợp lệ\\.",
    specify_id: "⚠️ Vui lòng chỉ định user ID, ví dụ `/allow 123456789`",
    help_text: `
🤖 *Nền tảng điều khiển CLI từ xa*

*Danh sách lệnh:*
/start \\- Hiển thị menu chính và đăng ký Admin
/help \\- Hiển thị trợ giúp này
/send \\<text\\> \\- Gửi nội dung thô vào session đang hoạt động
/enter \\- Gửi phím Enter
/kill \\- Dừng session đang chạy \\(chọn 1 hoặc dừng tất cả\\)
/input\\_on \\- Bật Chế độ nhập tương tác \\(gửi tin nhắn chat vào PTY\\)
/input\\_off \\- Tắt Chế độ nhập tương tác
/input\\_enter\\_on \\- Tự động thêm phím Enter sau mỗi tin nhắn tương tác
/input\\_enter\\_off \\- Gửi chữ thô không kèm phím Enter
/status \\- Xem trạng thái hệ thống
/allow \\<id\\> \\- Chỉ Admin: Cấp quyền cho user ID khác
`,
    main_menu_title: "🛸 *Nền tảng điều khiển CLI từ xa*\n\nChọn một tùy chọn từ menu bên dưới:",
    status_title: "📊 *Trạng thái hệ thống*\n\n👤 *ID Admin:* `{adminId}`\n🖥️ *Client trực tuyến:* `{clientCount}`\n⚡ *Session đang chạy:* `{runningSessions}`\n📁 *Workspace đã đăng ký:* `{workspaceCount}`",
    clients_title: "🖥️ *Danh sách Client* ({count})\n\n",
    no_clients: "_Chưa có client nào đăng ký\\._",
    workspaces_title: "📁 *Danh sách Workspace*\n\n",
    no_workspaces: "_Không tìm thấy workspace nào online\\. Hãy chắc chắn client đã kết nối\\._",
    workspace_details: "📁 *Chi tiết Workspace*\n\n*Tên:* {name}\n*Client:* {client} \\({status}\\)\n*Đường dẫn:* `{path}`\n\n🚀 *Chạy một CLI Preset:*",
    session_started: "🚀 Đang khởi chạy *{preset}* trong workspace `{workspace}`\\.\\.\\.\nKết quả sẽ được truyền về đây\\.\n⌨️ *Chế độ nhập tương tác* tự động bật\\.",
    active_sessions_title: "⚡ *Session PTY đang chạy*\n\n",
    no_sessions: "_Không có session CLI nào đang chạy\\._",
    session_details: "⚡ *Chi tiết Session*\n\n*ID:* `{id}`\n*Preset:* `{preset}`\n*Client:* {client}\n*Trạng thái:* `{status}`\n*CWD:* `{cwd}`\n*Thời gian chạy:* `{runningTime}s`\n\n⌨️ *Chế độ nhập:* `{inputMode}`\n⏎ *Tự động Enter:* `{autoEnter}`",
    btn_clients: "🖥️ Danh sách Client",
    btn_workspaces: "📁 Workspace",
    btn_sessions: "⚡ Danh sách Session",
    btn_status: "📊 Trạng thái",
    btn_help: "ℹ️ Trợ giúp",
    btn_back: "⬅️ Quay lại",
    btn_back_menu: "⬅️ Về Menu chính",
    btn_enable_input: "⌨️ Bật Chế độ nhập",
    btn_disable_input: "⌨️ Tắt Chế độ nhập",
    btn_enable_enter: "⏎ Bật Tự động Enter",
    btn_disable_enter: "⏎ Tắt Tự động Enter",
    btn_send_enter: "⏎ Gửi Enter",
    btn_ctrlc: "🛑 Gửi Ctrl+C",
    btn_stop: "⏹️ Dừng Session",
    btn_refresh: "🔄 Làm mới",
    btn_change_lang: "🌐 Language / Ngôn ngữ",
    lang_changed: "✅ Đã thay đổi ngôn ngữ sang Tiếng Việt\\!",
    choose_lang: "🌐 Choose your language / Chọn ngôn ngữ của bạn:",
    btn_lang_en: "English 🇬🇧",
    btn_lang_vi: "Tiếng Việt 🇻🇳",
    choose_kill_session: "⚡ *Chọn session để dừng:*",
    no_active_sessions: "⚠️ Không có session nào đang hoạt động\\.",
    kill_all: "⏹️ Dừng tất cả",
    all_killed: "⏹️ Đã dừng tất cả các session\\!",
    session_killed: "⏹️ Đã dừng session `{id}`\\!"
  }
};
