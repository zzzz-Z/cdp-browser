# cdp-browser

直连已开启远端调试端口的 Chrome，零依赖、不常驻 MCP 工具 schema 的通用 CDP 网关。供 DSH skill 使用，也兼容任意 Node 22+ 环境。

## 功能
- 连接已带 `--remote-debugging-port=9222` 启动的 Chrome，复用真实登录态
- 截图、DOM/JS、网络与控制台事件、语义快照（uid）、文本查找、条件等待
- 默认后台运行（跨平台同窗口后台标签、完成后自动关闭）+ 登录/2FA/验证码时交还用户接手
- 所有操作走 CDP 命令，stdout 仅输出 JSON，诊断走 stderr

## 安装
克隆到 DSH skills 目录即可：

```bash
git clone <repo-url> ~/.dsh/skills/cdp-browser
```

Node 22+ 内置 WebSocket，无需 npm install。

## 使用
启动 Chrome（一次）：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-e2e-profile"
```

常用命令：

```bash
node cdp.js --list
node cdp.js localhost:5173 --eval "document.title"
node cdp.js @<targetId> --save /tmp/out.png
node cdp.js @<targetId> --collect snapshot 5
node cdp.js --browser --bg http://localhost:5173   # 开后台标签并记会话
node cdp.js --run http://localhost:5173 '[{"name":"title","expr":"document.title"}]'  # 后台跑完自动关
```

完整命令与工作流见 `SKILL.md` 与 `references/`。

## License
MIT