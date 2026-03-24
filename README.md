# WeChat Claude Code VSCode Extension

通过微信控制 VSCode 项目 - 使用 Claude Code 处理微信消息

## 功能

- **扫码绑定**：用户点击插件按钮或命令后，工作区显示 WebView 鼔板展示微信绑定二维码
- **后台运行**: 绑定成功后，自动在后台启动消息监听守护进程
- **微信操作项目**: 微信收到的消息通过 Claude Code SDK 处理，操作当前 VSCode 打开的工作目录
- **状态显示**: 在 VSCode 状态栏显示连接状态（未连接/已连接/处理中等)

- **VSCode 娡块（OpenClaw)** 操作当前 VSCode 巡缝

### 技术方案

- VSCode 扩展主进程
- 将 wechat-claude-code 的 wechat 模块复制到扩展中
- 修改 `.js` 扩展名为 `.ts`
- 使用 VSCode Extension Host 运行
- 二维码显示改为在 WebView 中显示
    - 添加 VSCode extension 入口 (activate/deactivate)
    - 添加状态栏显示连接状态
    - 添加 VSCode 命令：WeChat Connect, WeChat Disconnect, WeChat Show Panel

### 使用依赖
- qrcode@^1.5.4
- @types/vscode@^1.85.0
- - [vscodeignore]
src/**/*.ts
test/
.idea-extension.vsix
