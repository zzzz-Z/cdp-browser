# 后台运行 + 人工交接（纯 CDP，跨平台）

借鉴 OpenCode 官方 opencode-browser 的直连 CDP / 显式 target_id / [uid] 语义定位。**默认所有操作在后台标签进行，完成自动关闭，不抢焦点、不新开窗口、不依赖任何平台特定 API**。macOS / Linux / Windows 通吃。CDP 的 `Target.createTarget {background:true}` 在同一浏览器窗口开后台标签（不激活），这就是「后台运行」；跨平台的窗口最小化在部分系统不可靠，故不再使用。

## 标准流程（默认后台，结束即关）
1. 开后台标签：`node cdp.js --browser --bg <URL>` → 返回 `targetId`，同时把会话写到 `.uid-cache/.session.json`。后续 page 命令**省略目标**即自动走这个标签（也可显式 `@<targetId>`）。stderr 可能出现「焦点抑制不可用（浏览器版本不支持）」，不影响后台标签，可忽略。
2. agent 静默工作：`node cdp.js --eval '...'`、`--snapshot`、`--click`、`--fill`、`--save` 等，全部作用于后台标签，前台用户无感。
3. 一步流水线（推荐）：`node cdp.js --run <URL> '[{"name":"...","expr":"...","expect":...}, ...]'` —— 内部开后台 → 依次执行 JS → **无论成败自动关闭标签**，返回 `{results,autoClosed,failed}`，零残留。
4. 检测需要人工：用 `--eval` 读 `location.href` / 页面文本，命中登录页、2FA、验证码、支付页就交接。
5. 交还用户：`node cdp.js --browser --show [@targetId]` 把后台标签切到前台并激活，再提示用户接手：主 agent 用 `ask_user_question`；**子代理用 `send_message({agent:'lead', message:'...'})` 通知 lead 联系用户**，然后结束当前 turn 等待回传，不要自己猜凭据或无限轮询。
6. 等待继续：`node cdp.js @<targetId> --wait-no-url login 300` 轮询到 URL **离开登录页**即 `matched:true`，接着跑。**不要猜登录后的目标 URL**，用 `--wait-no-url login` 只判断已离开最稳。
7. 收尾：`node cdp.js @<targetId> --close`（或 `--browser --close [@targetId]`）关闭标签并清理会话文件。`--run` 已自动完成本步。

## 语义化快照（opencode 的 uid 机制）
- `node cdp.js <URL片段|@targetId> --snapshot` → `[uid] role "name"`，uid→backendDOMNodeId 映射存 `.uid-cache/<targetId>.json`
- `node cdp.js <URL片段|@targetId> --click <uid>` / `--fill <uid> <text>` 按 uid 操作，不必写 CSS 选择器
- 页面导航后 uid 失效，需重新 `--snapshot`

## 会话与关闭命令
- `--browser --bg <URL>`：开后台标签并记录会话（省 token：后续命令可省略 `@targetId`）
- `--browser --bgwin <URL>`：兼容别名，等同 --bg（不再新窗口/最小化）
- `--browser --show [@targetId]`：把后台标签切到前台激活（人工交接）
- `--browser --close [@targetId]` / `<目标> --close`：关闭标签并清理会话文件
- `--run <URL> <steps-json>`：开后台→跑步骤→自动关闭（推荐一次性流程）
- page 定位支持省略目标（走当前会话）、URL片段、`@targetId` 三级

## 与 opencode 扩展版的区别
- 扩展版用折叠标签组；CDP 无此 UI，改用同窗口后台标签，不装任何扩展
- 扩展版靠 native messaging 注入；本方案只需 Chrome 带 `--remote-debugging-port`，零依赖、跨平台
- 完成自动关闭标签，不留后台进程/窗口；人工交接靠宿主提问，而非浏览器内提示
