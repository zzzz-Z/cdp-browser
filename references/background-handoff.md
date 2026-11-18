# 后台运行 + 人工交接（借鉴 opencode-browser 实现）

OpenCode 官方浏览器实现（opencode-browser）已改为直连 CDP、无扩展无 broker，与本脚本同源。借鉴它的显式端点 / 显式 target_id / accessibility tree 的 [uid] 语义定位，加上后台窗口能力。CDP 没有 UI 层标签折叠，改用独立后台窗口 + 最小化，效果等价。

## 标准流程
1. 开后台窗口：`node cdp.js --browser --bgwin <URL>` → 返回 `targetId` / `windowId`，窗口最小化、不抢焦点
2. agent 静默工作：用 `@<targetId>` + 普通 page 命令（`--snapshot` / `--eval` / `--save`）操作那个标签；窗口最小化不影响 CDP
3. 检测需要人工：agent 用 `--eval` 读 `location.href` / 页面文本，命中登录页、2FA、验证码、支付页就交接
4. 交还用户：`node cdp.js --browser --show <targetId>` 恢复并激活窗口，然后用 `ask_user_question` 提示用户接手
5. 等待继续：`node cdp.js @<targetId> --wait-no-url login 300` 轮询到 URL **离开登录页**即 `matched:true`，agent 接着跑。**不要猜登录后的目标 URL**（可能跳到任意页面，硬编码片段会永远等不到）；用 `--wait-no-url login` 只判断「已离开 login」，最稳。若明确知道目标 URL 才用 `--wait-url <片段>`。

## 语义化快照（opencode 的 uid 机制）
- `node cdp.js <URL片段> --snapshot` → 输出 `[uid] role "name"` 列表，uid→backendDOMNodeId 映射存 `.uid-cache/<targetId>.json`
- `node cdp.js <URL片段> --click <uid>` / `--fill <uid> <text>` 按 uid 操作，不必写 CSS 选择器
- 页面导航后 uid 失效，需重新 `--snapshot`

## 新增 browser 命令
- `--browser --bgwin <URL>`：开后台窗口并最小化
- `--browser --show <targetId>`：恢复窗口并激活标签
- `--browser <Browser.*|Target.*> '<JSON>'`：任意 browser 级命令
- page 定位支持 `@<targetId>` 精确匹配，多标签不串台

## 与 opencode 扩展版的区别
- 扩展版用折叠标签组；CDP 无此 UI，改用独立窗口 + 最小化，不装任何扩展
- 扩展版靠 native messaging 注入；本方案只需 Chrome 带 `--remote-debugging-port`，零依赖
- 两者都复用真实登录态；人工交接用 `ask_user_question` 而非浏览器内提示
