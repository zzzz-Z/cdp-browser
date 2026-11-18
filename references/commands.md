# 命令参考与约定

脚本：本 skill 目录下的 `cdp.js`（Node 22+ 内置 WebSocket，零依赖，无需 npm install）。本质是对已开 Chrome 的 CDP 端口执行任意命令，等价于 Chrome MCP 的底层能力，但不新增浏览器进程、不常驻 MCP 工具 schema。执行前先 `cd` 到脚本所在目录，或用绝对路径调用。

## 调用方式（用 run_code 里的 bash 执行）
- 帮助：`node cdp.js --help`
- 列出标签：`node cdp.js --list`（只返回 page 类型，过滤掉 chrome:// 内部页）
- 任意命令：`node cdp.js <URL片段|@targetId> <CDP方法> '<JSON参数>'`
- 执行 JS：`node cdp.js <URL片段|@targetId> --eval "document.title"`
- 截图保存：`node cdp.js <URL片段|@targetId> --save /path/out.png`
- 语义快照：`--snapshot` → `[uid] role "name"`（uid 缓存带 URL，页面导航后自动失效需重取）
- 语义操作：`--click <uid>` / `--fill <uid> <text>`（fill 用原生 setter，兼容 React/Vue 受控组件）
- 文本查找：`--find <可见文本>` → 返回元素中心坐标 x/y
- 等待条件：`--wait-url <片段> [秒]` / `--wait-selector <CSS> [秒]`（HMR 稳定/异步渲染）
- 事件收集：`--collect snapshot [秒]` → 捕获该时段内 console/error/exception/网络失败（关键：每次连接是新 WebSocket，enable 后的事件只在本连接期间产生，必须在同一进程内 enable+收集）
- 批量：`echo '[{"method":"Page.enable"},{"method":"Runtime.evaluate","params":{"expression":"location.href"}}]' | node cdp.js <URL片段|@targetId> --batch`
- 端口非 9222 设 `CDP_PORT`；超时设 `CDP_TIMEOUT`（默认 20000ms）

cwd 设为脚本所在目录，或用绝对路径调用。stdout 只输出 JSON，诊断走 stderr。exit code：0 成功，1 参数错误/CDP 报错/JS 异常。多标签 URL 片段歧义时 stderr 警告并取第一个，用 @targetId 精确定位。

## 约定
- URL片段按 includes 匹配第一个 page 标签，用独特子串（如 localhost:5173）更稳；拿不准先 `--list`
- 同一时刻只让本脚本或 Chrome MCP 其中一方驱动同一个标签，避免指令打架
- 前端改完等 HMR 稳定再操作/截图；截图前可轮询目标 DOM 出现
- 省内存：`Network.setBlockedURLs` 挡 `*.png/*.jpg/*.woff*/*.mp4`；用完 `Target.closeTarget`
- 连接取自 `/json` 返回的 webSocketDebuggerUrl，全程不新建浏览器进程
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
