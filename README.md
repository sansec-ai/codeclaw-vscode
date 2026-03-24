# WeChat Claude Code - VSCode Extension

通过微信控制 VSCode 项目，使用 Claude Code CLI 处理微信消息。

## 功能

- **扫码绑定**: 用户点击插件按钮或命令后，在工作区显示 WebView 鼉板，展示微信绑定二维码
- **后台运行**: 绑定成功后，自动在后台启动消息监听守护进程
- **微信操作项目**: 微信收到的消息通过 Claude Code CLI 处理，操作当前 VSCode 打开的工作目录
- **状态显示**: 在 VSCode 状态栏显示连接状态（未连接/已连接/处理中等）

