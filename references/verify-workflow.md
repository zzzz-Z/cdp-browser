# 前端改完验证流程

1. `--list` 找标签 → `@targetId` 锁定
2. `--wait-selector <关键DOM> 15` 等 HMR 稳定（比 sleep 靠谱）
3. 开事件收集：`--collect snapshot <覆盖交互的秒数>`，命令返回即含该时段所有 console/error/exception/网络失败
4. 断言/交互：`--eval` / `--find` / `--click <uid>` / `--fill <uid>`；需要登录/2FA 见 background-handoff.md
5. `--save` 截图；改前改后各一张可用 compare 组件展示
6. 看第 3 步 collect 的 events：有 exception/error 即验证失败，直接定位

> 报错收集必须在**同一个进程内** enable + 收集：每条 node cdp.js 命令都是独立 WebSocket，跨命令的事件收不到。所以 `--collect` 把 enable、订阅、等待、汇总打包成一条命令。批量纯命令操作用 `--batch`，但它不收集事件。

实测能抓到：`{"kind":"console","type":"error","text":"..."}` 与 `{"kind":"exception","text":"Error: ..."}`。

Lighthouse 审计、性能洞察可视化这类重型分析 CDP 原始数据能取，但结论层需另装 lighthouse 库，不必为此恢复 Chrome MCP。
