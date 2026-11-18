# 命令参考与约定

脚本：本 skill 目录下的 `cdp.js`（Node 22+ 内置 WebSocket，零依赖，无需 npm install）。本质是对已开 Chrome 的 CDP 端口执行任意命令，等价于 Chrome MCP 的底层能力，但不新增浏览器进程、不常驻 MCP 工具 schema。执行前先 `cd` 到脚本所在目录，或用绝对路径调用。

**默认后台**：`--browser --bg <URL>` 开同窗口后台标签（不抢焦点、跨平台）并记会话；后续命令省略目标即走该会话，结束用 `@目标 --close` 或 `--run` 自动关闭。详见 `background-handoff.md`。

## 前提：启动带调试端口的 Chrome

先跑 `node cdp.js --list`。若报「无法连接 9222」才需要启动 Chrome；已开着就别重复启动。用独立 profile 避免和日常 Chrome 冲突：

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \\
  --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-e2e-profile"

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-e2e-profile"

# Windows (PowerShell)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 --user-data-dir="$env:USERPROFILE\.chrome-e2e-profile"
```

启动后 `node cdp.js --list` 验证。登录态保存在该 profile，首次人工登录一次后长期复用；端口非 9222 设 `CDP_PORT`。

## 调用方式（用 run_code 里的 bash 执行）
- 帮助：`node cdp.js --help`
- 列出标签：`node cdp.js --list`（只返回 page 类型，过滤掉 chrome:// 内部页）
- 后台会话：`node cdp.js --browser --bg <URL>` 开后台标签并记会话（后续命令可省略目标）；`--browser --bgwin <URL>` 兼容别名等同 --bg
- 一步后台流水线：`node cdp.js --run <URL> '[{"name":"...","expr":"...","expect":...}, ...]'` 开后台→执行步骤→自动关闭
- 交接/收尾：`--browser --show [@targetId]` 把后台标签切前台；`@<targetId> --close` 或 `--browser --close [@targetId]` 关闭标签并清会话
- 任意命令：`node cdp.js <URL片段|@targetId> <CDP方法> '<JSON参数>'`
- 执行 JS：`node cdp.js <URL片段|@targetId> --eval "document.title"`；**带变量声明的脚本必须用 IIFE 包裹**（如 `--eval "(function(){const b=...; return ...})()"`）——多次 `--eval` 共享页面全局词法环境，顶层 `const`/`let` 会残留，重复声明会报 `Identifier ... has already been declared`
- 截图保存：`node cdp.js <URL片段|@targetId> --save /path/out.png`
- 语义快照：`--snapshot` → `[uid] role "name"`（uid 缓存带 URL，页面导航后自动失效需重取）；**纯图标按钮（没有 accessible name 的 `div[role=button]`，例如头像）不会出现在快照里**，先用 `--eval` 配 CSS 选择器触发点击展开，再对展开后的菜单重新 `--snapshot`
- 语义操作：`--click <uid>` / `--fill <uid> <text>`（fill 用原生 setter，兼容 React/Vue 受控组件）
- 文本查找：`--find <可见文本>` → 返回元素中心坐标 x/y
- 等待条件：`--wait-url <片段> [秒]`（等 URL 含片段）/ `--wait-no-url <片段> [秒]`（等 URL 不含片段，人工交接等离开登录页用这个）/ `--wait-selector <CSS> [秒]`（HMR 稳定/异步渲染）
- 事件收集：`--collect snapshot [秒]` → 捕获该时段内 console/error/exception/网络失败（关键：每次连接是新 WebSocket，enable 后的事件只在本连接期间产生，必须在同一进程内 enable+收集）
- 批量：`echo '[{"method":"Page.enable"},{"method":"Runtime.evaluate","params":{"expression":"location.href"}}]' | node cdp.js <URL片段|@targetId> --batch`
- 端口非 9222 设 `CDP_PORT`；超时设 `CDP_TIMEOUT`（默认 20000ms）

cwd 设为脚本所在目录，或用绝对路径调用。stdout 只输出 JSON，诊断走 stderr。exit code：0 成功，1 参数错误/CDP 报错/JS 异常。多标签 URL 片段歧义时 stderr 警告并取第一个，用 @targetId 精确定位。

## 约定
- 目标定位优先级：省略目标（走当前 `--bg` 会话） > URL片段（includes 匹配第一个 page，歧义时 stderr 警告，用独特子串） > `@targetId` 精确锁定
- 同一时刻只让本脚本或 Chrome MCP 其中一方驱动同一个标签，避免指令打架
- 前端改完等 HMR 稳定再操作/截图；截图前可轮询目标 DOM 出现
- 省内存：`Network.setBlockedURLs` 挡 `*.png/*.jpg/*.woff*/*.mp4`；用完 `Target.closeTarget`
- 连接取自 `/json` 返回的 webSocketDebuggerUrl，全程不新建浏览器进程
- `--snapshot` 会在本 skill 目录 `.uid-cache/<targetId>.json` 落盘 uid 映射；导航后缓存带 URL 校验自动失效，需重新 `--snapshot`
- 命令 stdout JSON 关键字段：`--eval` → `{value}`；`--list` → `[{type,id,title,url}]`；`--snapshot` → `{targetId,count,cache,lines}`；`--find` → `{found,element:{tag,text,x,y}}`；`--wait-url/--wait-no-url/--wait-selector` → `{matched,...}`；`--collect` → `{seconds,events}`；`--save` → `{saved,bytes}`
- 拿到数据自行判断，不要套固定流程

## 常用 CDP 方法速查
- Page: `enable` · `navigate {url}` · `reload` · `captureScreenshot {format,captureBeyondViewport}` · `printToPDF` · `handleJavaScriptDialog {accept}`
- Runtime: `evaluate {expression,returnByValue,awaitPromise}` · `callFunctionOn` · `getProperties`；事件 `consoleAPICalled` `exceptionThrown`
- DOM: `getDocument` · `querySelector {nodeId,selector}` · `querySelectorAll` · `getBoxModel` · `setOuterHTML` · `focus`
- Input: `dispatchMouseEvent {type,x,y,button}` · `dispatchKeyEvent {type,key}` · `insertText {text}`
- Network: `enable` · `getResponseBody {requestId}` · `setBlockedURLs {urls}` · `emulateNetworkConditions`
- Emulation: `setDeviceMetricsOverride {width,height,deviceScaleFactor,mobile}` · `setUserAgentOverride` · `setGeolocationOverride`
- Target: `getTargets` · `createTarget {url}` · `closeTarget {targetId}`
- Storage: `getCookies` · `setCookie` · `clearDataForOrigin`
- CSS: `getMatchedStylesForNode {nodeId}` · `setStyleSheetText`
- Tracing/Performance: `start {categories}` · `end` · `getMetrics`