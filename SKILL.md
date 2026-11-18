---
name: cdp-browser
description: 操作网页、前端改完验证、e2e、截图、取 DOM/接口、抓控制台报错，或需要后台运行浏览器并在登录/2FA/验证码时交还用户接手时，直连已开 Chrome 的 CDP 端口执行任意命令；替代 Chrome MCP，零依赖、不常驻工具 schema。
---

# CDP 直连浏览器（通用网关）

脚本：`/Users/apple/.dsh/skills/cdp-browser/cdp.js`（Node 22+ 内置 WebSocket，零依赖）。stdout 只输出 JSON，诊断走 stderr。用 run_code 里的 bash 执行，cwd 设脚本目录或用绝对路径。

## 启动 Chrome（一次，长期复用登录态）
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-e2e-profile"
```
端口非 9222 设 `CDP_PORT`，超时设 `CDP_TIMEOUT`（默认 20s）。

## 命令速查
- `--list` 列标签（只 page 类型）→ 用 `@targetId` 精确锁定目标
- `<目标> --eval "JS"` 执行 JS ｜ `--save path.png` 整页截图
- `--snapshot` → `[uid] role "name"`；`--click <uid>` / `--fill <uid> <text>`（fill 兼容 React/Vue）
- `--find <文本>` 按可见文本定位 ｜ `--wait-url <片段> [秒]` / `--wait-selector <CSS> [秒]` 等待条件
- `--collect snapshot [秒]` 抓该时段 console/error/exception/网络失败（验证必用，见 verify-workflow）
- `--batch` 从 stdin 读 JSON 数组批量发 CDP 命令
- `--browser --bgwin <URL>` / `--show <id>` 后台窗口与人工交接（见 background-handoff）
- 任意 CDP 命令：`<目标> <CDP方法> '<JSON参数>'`（如 `Page.navigate`）

## 按需读取详细文档（仅在确实需要时打开）
- `references/commands.md` — 全部命令参数、约定、CDP 方法速查表、健壮性说明
- `references/verify-workflow.md` — 前端改完验证流程（截图 + 报错收集）
- `references/background-handoff.md` — 后台窗口 + 登录/2FA 人工交接
