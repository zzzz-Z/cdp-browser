#!/usr/bin/env node
// cdp.js —— 通用 CDP 网关（零依赖，Node 22+ 内置 WebSocket）
// 连接已开启 --remote-debugging-port=9222 的 Chrome，对指定标签执行任意 CDP 命令。
// 借鉴 OpenCode 官方 opencode-browser 的直连 CDP / 显式 target_id / [uid] 快照设计。
//
// 用法:
//   node cdp.js --list                                    列出所有可调试标签
//   node cdp.js <URL片段|@targetId> <METHOD> '[JSON]'      page 级任意命令
//   node cdp.js <URL片段|@targetId> --eval "JS表达式"
//   node cdp.js <URL片段|@targetId> --save <PNG路径>
//   node cdp.js <URL片段|@targetId> --snapshot             可访问性树 [uid] 快照
//   node cdp.js <URL片段|@targetId> --click <uid>           按 uid 点击
//   node cdp.js <URL片段|@targetId> --fill <uid> <text>     按 uid 填写（兼容 React/Vue）
//   node cdp.js <URL片段|@targetId> --find <文本>           按可见文本查找元素
//   node cdp.js <URL片段|@targetId> --wait-url <片段> [秒]  轮询 URL 等待人工完成
//   node cdp.js <URL片段|@targetId> --wait-selector <CSS> [秒]
//   node cdp.js <URL片段|@targetId> --collect <动作> [秒]   事件收集 console/error/network
//   echo '[...]' | node cdp.js <URL片段|@targetId> --batch
//   node cdp.js --browser --bgwin <URL>                    开后台窗口并最小化
//   node cdp.js --browser --show <targetId>                恢复窗口并激活标签
//   node cdp.js --browser <Browser.*|Target.*> '<JSON>'     browser 级任意命令
//
// 约定: stdout 只输出 JSON；诊断走 stderr；单命令 20s 超时（CDP_TIMEOUT 可改）

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, '.uid-cache');
const BASE = 'http://127.0.0.1:' + (process.env.CDP_PORT || 9222);
const TIMEOUT = Number(process.env.CDP_TIMEOUT || 20000);
const err = (m) => console.error('[cdp] ' + m);
const die = (m, c = 1) => { err(m); process.exit(c); };
const out = (o) => console.log(JSON.stringify(o));

async function getJSON(path) {
  let res;
  try { res = await fetch(BASE + path); }
  catch { die('无法连接 ' + BASE + path + '；Chrome 是否带 --remote-debugging-port 启动？'); }
  if (!res.ok) die(path + ' 返回 HTTP ' + res.status);
  return res.json();
}

async function connect(wsUrl) {
  let ws;
  try { ws = new WebSocket(wsUrl); }
  catch (e) { die('WebSocket URL 非法: ' + e.message); }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket 连接失败')); });
  let seq = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = ({ data }) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (m.id && pending.has(m.id)) {
      const { resolve, timer } = pending.get(m.id);
      clearTimeout(timer);
      pending.delete(m.id);
      resolve(m);
    } else if (m.method) {
      for (const fn of listeners) { try { fn(m); } catch {} }
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve) => {
    const id = ++seq;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    const timer = setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); resolve({ error: { message: '超时 ' + TIMEOUT + 'ms: ' + method } }); }
    }, TIMEOUT);
    pending.set(id, { resolve, timer });
    ws.send(JSON.stringify(msg));
  });
  const onEvent = (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };
  const close = () => {
    for (const { timer } of pending.values()) clearTimeout(timer);
    pending.clear();
    try { ws.close(); } catch {}
  };
  return { ws, send, onEvent, close };
}

function findPage(ts, selector) {
  if (typeof selector === 'string' && selector.startsWith('@')) {
    const id = selector.slice(1);
    return ts.find(t => t.type === 'page' && t.id === id);
  }
  return ts.find(t => t.type === 'page' && t.url.includes(selector));
}

function pageMatches(ts, selector) {
  if (typeof selector === 'string' && selector.startsWith('@')) {
    const p = findPage(ts, selector);
    return p ? [p] : [];
  }
  return ts.filter(t => t.type === 'page' && t.url.includes(selector));
}

const argv = process.argv.slice(2);
if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
  let help = '';
  try { help = readFileSync(join(HERE, 'SKILL.md'), 'utf8'); } catch {}
  const block = help.split('## 命令速查')[1] || '';
  console.log('cdp.js —— 通用 CDP 网关（详细见 SKILL.md）\n' + block.split('##')[0].trim());
  process.exit(0);
}

if (argv[0] === '--browser') {
  const ver = await getJSON('/json/version');
  if (!ver.webSocketDebuggerUrl) die('/json/version 未提供 webSocketDebuggerUrl');
  const { send, close } = await connect(ver.webSocketDebuggerUrl);

  if (argv[1] === '--bgwin') {
    const url = argv[2];
    if (!url) die('--bgwin 需要 URL');
    const created = await send('Target.createTarget', { url, newWindow: true, background: true });
    if (created.error) { out({ error: created.error }); close(); process.exit(1); }
    const targetId = created.result.targetId;
    const win = await send('Browser.getWindowForTarget', { targetId });
    const windowId = win.result?.windowId;
    if (windowId != null) { await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } }); }
    out({ targetId, windowId, minimized: windowId != null, url });
    close(); process.exit(0);
  }

  if (argv[1] === '--show') {
    const targetId = argv[2];
    if (!targetId) die('--show 需要 targetId');
    const win = await send('Browser.getWindowForTarget', { targetId });
    const windowId = win.result?.windowId;
    if (windowId != null) { await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }); }
    const act = await send('Target.activateTarget', { targetId });
    out({ targetId, windowId, activated: !act.error });
    close(); process.exit(0);
  }

  const method = argv[1];
  if (!method) die('--browser 需要方法名');
  let params = {};
  if (argv[2]) { try { params = JSON.parse(argv[2]); } catch (e) { die('参数不是合法 JSON: ' + e.message); } }
  const r = await send(method, params);
  out({ method, ...(r.error ? { error: r.error } : { result: r.result }) });
  close(); process.exit(0);
}

if (argv[0] === '--list') {
  const ts = await getJSON('/json');
  out(ts.filter(t => t.type === 'page').map(t => ({ type: t.type, id: t.id, title: t.title, url: t.url })));
  process.exit(0);
}

const [selector, command, arg1, arg2] = argv;
if (!selector || !command) die('用法: node cdp.js <URL片段|@targetId> <METHOD|COMMAND> [参数]');

const ts = await getJSON('/json');
const matches = pageMatches(ts, selector);
if (!matches.length) die('没找到匹配 "' + selector + '" 的 page 标签；先运行 --list');
if (matches.length > 1 && !String(selector).startsWith('@')) {
  err('警告: URL 片段匹配到 ' + matches.length + ' 个标签，默认取第一个；建议用 @targetId 精确定位: ' + matches.map(t => t.id).join(', '));
}
const page = matches[0];
const { send, onEvent, close } = await connect(page.webSocketDebuggerUrl);
const finish = (o, code = 0) => { out(o); close(); process.exit(code); };

if (command === '--snapshot') {
  await send('Accessibility.enable');
  const ax = await send('Accessibility.getFullAXTree');
  if (ax.error) finish({ error: ax.error }, 1);
  const nodes = ax.result.nodes || [];
  const roles = new Set(['button','link','textbox','combobox','searchbox','checkbox','radio','slider','heading','img','tab','menuitem','listitem','option','switch','text']);
  const lines = []; const map = {};
  let uid = 0;
  for (const n of nodes) {
    const role = n.role?.value || '';
    const name = (n.name?.value || '').replace(/\s+/g, ' ').trim();
    const bd = n.backendDOMNodeId;
    if (!bd || !roles.has(role)) continue;
    if (!name && !['textbox','searchbox','button'].includes(role)) continue;
    uid++;
    map[uid] = { backendNodeId: bd, role, name };
    lines.push('[' + uid + '] ' + role + ' "' + name + '"');
  }
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, page.id + '.json'), JSON.stringify({ url: page.url, time: Date.now(), nodes: map }, null, 2));
  finish({ targetId: page.id, count: uid, cache: join(CACHE_DIR, page.id + '.json'), lines });
}

if (command === '--find') {
  const text = arg1;
  if (!text) finish({ error: '--find 需要文本' }, 1);
  const expr = '(()=>{const t=' + JSON.stringify(text) + ';const els=[...document.querySelectorAll("a,button,input,[role=button],[onclick]")];const hit=els.find(e=>(e.innerText||e.value||"").includes(t)||(e.getAttribute("aria-label")||"").includes(t));if(!hit)return null;hit.scrollIntoView({block:"center"});const r=hit.getBoundingClientRect();return {tag:hit.tagName,text:(hit.innerText||hit.value||"").slice(0,80),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()';
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  finish(r.error ? { error: r.error } : { found: !!(r.result?.result?.value), element: r.result?.result?.value || null }, r.error ? 1 : 0);
}

if (command === '--click' || command === '--fill') {
  const uid = arg1;
  const cachePath = join(CACHE_DIR, page.id + '.json');
  if (!existsSync(cachePath)) finish({ error: '没有 uid 缓存，请先 --snapshot' }, 1);
  let cache;
  try { cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch { finish({ error: 'uid 缓存损坏，请重新 --snapshot' }, 1); }
  const map = cache.nodes || cache;
  if (cache.url && cache.url !== page.url) finish({ error: '页面已导航（缓存 URL ' + cache.url + ' 不等于当前 ' + page.url + '），请重新 --snapshot' }, 1);
  const node = map[uid];
  if (!node) finish({ error: 'uid ' + uid + ' 不存在，请重新 --snapshot' }, 1);
  const resolved = await send('DOM.resolveNode', { backendNodeId: node.backendNodeId });
  if (resolved.error) finish({ error: resolved.error }, 1);
  const objectId = resolved.result.object.objectId;
  let expr, args = [];
  if (command === '--click') {
    expr = 'function(){ this.scrollIntoView?.({block:"center"}); const r=this.getBoundingClientRect(); const x=r.x+r.width/2,y=r.y+r.height/2; const o={bubbles:true,cancelable:true,view:window,clientX:x,clientY:y}; this.dispatchEvent(new PointerEvent("pointerdown",o)); this.dispatchEvent(new MouseEvent("mousedown",o)); this.dispatchEvent(new PointerEvent("pointerup",o)); this.dispatchEvent(new MouseEvent("mouseup",o)); this.dispatchEvent(new MouseEvent("click",o)); }';
  } else {
    if (arg2 === undefined) finish({ error: '--fill 需要文本参数' }, 1);
    expr = 'function(v){ this.focus?.(); const proto=this instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set; setter?.call(this,v); if(!setter)this.value=v; this.dispatchEvent(new Event("input",{bubbles:true})); this.dispatchEvent(new Event("change",{bubbles:true})); }';
    args = [{ value: arg2 }];
  }
  const r = await send('Runtime.callFunctionOn', { objectId, functionDeclaration: expr, arguments: args, returnByValue: true });
  finish({ uid, role: node.role, name: node.name, action: command, ...(r.error ? { error: r.error } : { ok: true }) }, r.error ? 1 : 0);
}

if (command === '--wait-url') {
  const needle = arg1;
  const secs = Number(arg2 || 120);
  if (!needle) finish({ error: '--wait-url 需要 URL 片段' }, 1);
  const deadline = Date.now() + secs * 1000;
  let last = '';
  while (Date.now() < deadline) {
    const r = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
    last = r.result?.result?.value || '';
    if (last.includes(needle)) finish({ matched: true, url: last });
    await new Promise(r => setTimeout(r, 1000));
  }
  finish({ matched: false, url: last, timeoutSec: secs });
}

if (command === '--wait-selector') {
  const sel = arg1;
  const secs = Number(arg2 || 30);
  if (!sel) finish({ error: '--wait-selector 需要 CSS 选择器' }, 1);
  const expr = '!!document.querySelector(' + JSON.stringify(sel) + ')';
  const deadline = Date.now() + secs * 1000;
  while (Date.now() < deadline) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result?.result?.value === true) finish({ matched: true, selector: sel });
    await new Promise(r => setTimeout(r, 500));
  }
  finish({ matched: false, selector: sel, timeoutSec: secs });
}

if (command === '--collect') {
  const action = arg1 || 'snapshot';
  if (action === 'snapshot') {
    await Promise.all([send('Runtime.enable'), send('Log.enable'), send('Network.enable')]);
    const events = [];
    const off = onEvent(m => {
      if (m.method === 'Runtime.consoleAPICalled') {
        events.push({ kind: 'console', type: m.params.type, text: (m.params.args || []).map(a => a.value ?? a.description ?? '').join(' ') });
      } else if (m.method === 'Runtime.exceptionThrown') {
        events.push({ kind: 'exception', text: m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text });
      } else if (m.method === 'Log.entryAdded') {
        events.push({ kind: 'log', level: m.params.entry.level, text: m.params.entry.text });
      } else if (m.method === 'Network.loadingFailed') {
        events.push({ kind: 'network-failed', text: m.params.errorText, type: m.params.type });
      }
    });
    const secs = Number(arg2 || 3);
    await new Promise(r => setTimeout(r, secs * 1000));
    off();
    finish({ seconds: secs, events });
  }
  finish({ error: '用法: --collect snapshot [秒]' }, 1);
}

if (command === '--save') {
  if (!arg1) finish({ error: '--save 需要输出 PNG 路径' }, 1);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  if (r.error) finish({ error: r.error }, 1);
  const buf = Buffer.from(r.result.data, 'base64');
  writeFileSync(arg1, buf);
  finish({ saved: arg1, bytes: buf.length });
}

if (command === '--eval') {
  const r = await send('Runtime.evaluate', { expression: arg1, returnByValue: true, awaitPromise: true });
  if (r.error) finish({ error: r.error }, 1);
  const val = r.result?.exceptionDetails
    ? { exception: r.result.exceptionDetails.text + ': ' + (r.result.exceptionDetails.exception?.description || '') }
    : { value: r.result?.result?.value };
  finish(val, r.result?.exceptionDetails ? 1 : 0);
}

if (command === '--batch') {
  let cmds;
  try { cmds = JSON.parse(readFileSync(0, 'utf8')); }
  catch (e) { die('--batch 需要 stdin 提供合法 JSON 数组: ' + e.message); }
  if (!Array.isArray(cmds)) die('--batch 的 stdin 必须是 JSON 数组');
  const results = [];
  for (const c of cmds) {
    const r = await send(c.method, c.params ?? {});
    results.push({ method: c.method, ...(r.error ? { error: r.error } : { result: r.result }) });
  }
  finish({ results });
}

let params = {};
if (arg1) { try { params = JSON.parse(arg1); } catch (e) { die('参数不是合法 JSON: ' + e.message); } }
const r = await send(command, params);
finish({ method: command, ...(r.error ? { error: r.error } : { result: r.result }) }, r.error ? 1 : 0);
