---
name: cdp-browser
description: 操作网页、前端改完验证、e2e、截图、取 DOM/接口、抓控制台报错，或需要后台运行浏览器并在登录/2FA/验证码时交还用户接手时，直连已开 Chrome 的 CDP 端口执行任意命令；替代 Chrome MCP，零依赖、不常驻工具 schema。
---

# CDP 直连浏览器（通用网关）

脚本：本 skill 目录下的 `cdp.js`（Node 22+ 内置 WebSocket，零依赖）。stdout 只输出 JSON，诊断走 stderr。

## 按需读取
- 先看 `node cdp.js --help` 获取完整命令速查（脚本自带，无需打开文件）
- `references/commands.md` — 调用约定、参数细节、CDP 方法速查表
- `references/verify-workflow.md` — 前端改完验证流程（截图 + 报错收集）
- `references/background-handoff.md` — 后台窗口 + 登录/2FA 人工交接
