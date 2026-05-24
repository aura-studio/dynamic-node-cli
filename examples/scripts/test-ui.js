import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = process.env.TEST_UI_PORT || 3456;

const clients = new Map();

const STEPS = [
  {
    id: "00-create-config",
    name: "00 生成配置",
    category: "配置",
    desc: "生成测试配置文件 dynamic-node-cli.yaml，包含 bundle 和 full 两套环境以及对应 sample-app / service-app / wire-app 三组共 6 个 procedure。自动探测当前 OS / 架构 / 编译器版本。",
    needsS3: false,
    needsBuild: false,
    isSuite: false,
  },
  {
    id: "01-smoke",
    name: "01 冒烟测试",
    category: "验证",
    desc: "验证 CLI 最基础的功能是否完好。依次执行：\n① npm run check（语法检查脚本）\n② dynamic-node --help 能正常输出\n③ dynamic-node version 能正常输出\n④ dynamic-node toolchain describe all 能正常输出\n⑤ dynamic-node toolchain script 输出包含 DYNAMIC_COMPILER 环境变量",
    needsS3: false,
    needsBuild: false,
    isSuite: false,
  },
  {
    id: "02-toolchain-check",
    name: "02 工具链检查",
    category: "验证",
    desc: "验证当前 Node.js 版本和平台是否满足配置中所有 6 个 procedure (sample/service/wire × bundle/full) 的构建环境要求。",
    needsS3: false,
    needsBuild: false,
    isSuite: false,
  },
  {
    id: "03-build-bundle",
    name: "03 Bundle 构建",
    category: "构建",
    desc: "使用 esbuild 将 sample-app 的入口文件 (index.js) 打包为单文件 CJS 模块，封装为 Tunnel 接口（Init/Invoke/Meta/Close），内置 dynamic-meta.json 元数据文件，最终生成 libnode_test_bundle_xxx.zip。\n\nBundle 模式下 node_modules 被 tree-shake，产物体积小，适合生产部署。",
    needsS3: false,
    needsBuild: false,
    isSuite: false,
  },
  {
    id: "04-build-full",
    name: "04 Full 构建",
    category: "构建",
    desc: "将 sample-app 完整项目目录（含 node_modules 及所有文件）整体打包为 libnode_test_full_xxx.zip。保留完整目录结构、所有依赖和原始文件。\n\nFull 模式产物体积较大，但能保证与开发环境完全一致的运行时行为。",
    needsS3: false,
    needsBuild: false,
    isSuite: false,
  },
  {
    id: "05-build-all",
    name: "05 全量构建",
    category: "构建",
    desc: "不指定 -p procedure 参数，一次性构建配置文件中声明的全部 6 个 procedure（sample/service/wire × bundle/full）。验证批量构建功能，所有 target zip 产物均成功生成。",
    needsS3: false,
    needsBuild: false,
    isSuite: false,
  },
  {
    id: "06-push",
    name: "06 推送到 S3",
    category: "远程",
    desc: "将本地 warehouse 目录中的所有构建产物上传至远程 S3 桶。上传完成后通过 ListObjectsV2 API 列出远程 Key，断言 bundle 和 full 两个 zip 均已存在于远程。\n\n🐳 未配置 S3 凭证时自动启动 MinIO Docker 容器模拟 S3，测试结束后自动清理容器。\n⚠ 若已配置 AWS 凭证或 S3 endpoint 环境变量则直接使用。",
    needsS3: true,
    needsBuild: true,
    isSuite: false,
  },
  {
    id: "07-pull",
    name: "07 从 S3 拉取",
    category: "远程",
    desc: "先清空本地 warehouse 目录（模拟全新环境），再从远程 S3 下载构建产物。拉取完成后验证 bundle 和 full 两个 zip 均恢复存在于本地 warehouse 中。\n\n🐳 未配置 S3 凭证时自动启动 MinIO Docker 容器，先 build → push → pull 形成闭环，测试结束后自动清理容器。\n⚠ 若已配置 AWS 凭证或 S3 endpoint 环境变量则直接使用。",
    needsS3: true,
    needsBuild: false,
    isSuite: false,
  },
  {
    id: "08-clean-cache",
    name: "08 清理缓存",
    category: "清理",
    desc: "在 warehouse 中手动创建模拟缓存文件（cache-check/cache.tmp），然后执行 clean cache 命令。验证：\n① 缓存文件被正确删除\n② 已有的 zip 构建产物未被误删（保留）\n\n测试 clean cache 的精确过滤能力。",
    needsS3: false,
    needsBuild: true,
    isSuite: false,
  },
  {
    id: "09-clean-useless",
    name: "09 清理无用文件",
    category: "清理",
    desc: "为 bundle zip 创建一个带 .manual-backup 后缀的副本文件，模拟构建过程中产生的时间戳备份（如 .zip.2026-05-23T15-29-32Z）。执行 clean useless 后验证：\n① 备份/时间戳文件被删除\n② 主 zip 产物被保留",
    needsS3: false,
    needsBuild: true,
    isSuite: false,
  },
  {
    id: "10-clean-package",
    name: "10 清理产物包",
    category: "清理",
    desc: "执行 clean package 命令，验证当前 procedure 对应的所有 zip artifact 均被删除。与其他 clean 子命令不同，package 只清除产物文件本身，不影响缓存、目录结构等。",
    needsS3: false,
    needsBuild: true,
    isSuite: false,
  },
  {
    id: "11-clean-all",
    name: "11 全面清理",
    category: "清理",
    desc: "先确保 warehouse 中有构建产物（若无则自动构建），然后执行 clean all 命令。验证整个 warehouse 目录被彻底清空 —— 所有文件、子目录、缓存、产�及临时文件全部删除。\n\n这是最彻底的清理操作。",
    needsS3: false,
    needsBuild: false,
    isSuite: false,
  },
  {
    id: "12-install-from-github",
    name: "12 GitHub 安装",
    category: "配置",
    desc: "运行 npm install -g --force github:aura-studio/dynamic-node-cli 从 GitHub 全局安装 CLI，然后验证安装后的 dynamic-node version 命令可正常输出。\n\n⚠ Linux/macOS 需 bash，Windows 直接用 npm 全局安装。",
    needsS3: false,
    needsBuild: false,
    isSuite: false,
  },
  {
    id: "13-clean-s3",
    name: "13 S3 远程清理",
    category: "远程",
    desc: "通过 S3 API（DeleteObjectsCommand）递归删除远程仓库中所有测试 Key，将远程环境重置为干净状态。\n\n🐳 未配置 S3 凭证时自动启动 MinIO Docker 容器，测试结束后自动清理容器。\n⚠ 若已配置 AWS 凭证或 S3 endpoint 环境变量则直接使用。",
    needsS3: true,
    needsBuild: false,
    isSuite: false,
  },
  {
    id: "14-meta",
    name: "14 元数据测试",
    category: "验证",
    desc: "对所有已构建的 target package (bundle, full, service-bundle, service-full, wire-bundle, wire-full) 分别验证 meta read 和 meta call 输出含正确的 variant 信息。\n\n另外对 bundle/full zip 验证 meta nm（列出 zip 条目）和 meta objdump（JSON 清单）。",
    needsS3: false,
    needsBuild: true,
    isSuite: false,
  },
  {
    id: "15-service",
    name: "15 Service 目标",
    category: "验证",
    desc: "测试 @aura-studio/service-node 封装的 service-app 构建产物。对 service-bundle 和 service-full 两个 zip：\n\n① loadBuiltTunnel 从 zip 提取并加载 Tunnel 模块\n② 调用 init() → invoke(\"/greet-user\") → close()\n③ 验证 service envelope 中 meta.handler === \"greetUser\"\n④ 验证 payload.message === \"hello <target>\"\n⑤ 验证 payload.route === \"/greet-user\"\n\n确保 service-node 包装的应用在 zip 构建后可正确运行。",
    needsS3: false,
    needsBuild: true,
    isSuite: false,
  },
  {
    id: "16-wire",
    name: "16 Wire 目标",
    category: "验证",
    desc: "测试 @aura-studio/wire-node 封装的 wire-app 构建产物。对 wire-bundle 和 wire-full 两个 zip：\n\n① loadBuiltTunnel 从 zip 提取并加载 Tunnel 模块\n② 创建 HTTP server 通过 tunnel.invoke() 透传原生 req/res\n③ 发 GET /hello 请求，断言 status=200\n④ 验证响应 body：{ message: \"hello wire-node\", method: \"GET\" }\n⑤ 验证自定义 header x-dynamic-node-target 正确传递\n\n确保 wire-node 包装的 HTTP 应用在 zip 构建后可正确处理原生请求。",
    needsS3: false,
    needsBuild: true,
    isSuite: false,
  },
  {
    id: "99-run-all-local",
    name: "99 全部本地测试",
    category: "套件",
    desc: "按顺序自动执行所有不需要 S3 的测试步骤：\n00 → 01 → 02 → 03 → 04 → 05 → 14 → 15 → 16 → 08 → 09 → 10 → 11\n\n全部通过则表明本地核心功能（含 service-node 和 wire-node 封装验证）完好。",
    needsS3: false,
    needsBuild: false,
    isSuite: true,
  },
  {
    id: "99-run-all-with-s3",
    name: "99 完整 S3 测试",
    category: "套件",
    desc: "按顺序执行包含 S3 上传/下载/清理的完整测试流程：\n00 → 01 → 02 → 05 → 06 → 07 → 14 → 15 → 16 → 08→11\n\n⚠ 需要 AWS 凭证或 S3 endpoint。测试结束自动清理远程数据。",
    needsS3: true,
    needsBuild: false,
    isSuite: true,
  },
  {
    id: "99-run-all-docker-s3",
    name: "99 Docker S3 测试",
    category: "套件",
    desc: "自动启动一个 MinIO Docker 容器（minio/minio:latest）模拟 S3 服务：\n① 自动分配空闲端口\n② 启动容器并等待健康检查通过\n③ 自动配置 AWS_ENDPOINT_URL、AWS_S3_FORCE_PATH_STYLE 等环境变量\n④ 运行完整 S3 测试流程\n⑤ 测试结束自动停止并清理容器\n\n⚠ 需要本地 Docker 在运行。无需真实 AWS 账号，适合本地开发测试。",
    needsS3: true,
    needsBuild: false,
    isSuite: true,
  },
];

// ── HTML 模板 ──

function getHTML() {
  const btnHtml = STEPS.map((s, i) => {
    const badges = [];
    if (s.needsS3) badges.push('<span class="badge s3">S3</span>');
    if (s.isSuite) badges.push('<span class="badge suite">套件</span>');
    return `<button class="step-btn" data-step="${s.id}" data-idx="${i}">
      <span class="idx">${String(i + 1).padStart(2, "0")}</span>
      <span class="name">${s.name}</span>
      <span class="cat">${s.category}</span>
      ${badges.join("")}
      <span class="status" id="st-${s.id}"></span>
    </button>`;
  }).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>dynamic-node-cli 测试面板</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;display:flex;height:100vh;background:#0d1117;color:#c9d1d9}
/* ─ 左侧 ─ */
#side{width:340px;min-width:340px;background:#161b22;display:flex;flex-direction:column;border-right:1px solid #21262d}
#side-top{padding:16px 16px 12px;background:#0d1117;border-bottom:1px solid #21262d}
#side-top h1{font-size:17px;font-weight:600;color:#58a6ff}
#side-top .sub{font-size:11px;color:#8b949e;margin-top:2px}
#side-top .env{font-size:10px;color:#484f58;margin-top:8px;display:flex;gap:10px;flex-wrap:wrap}
#list{flex:1;overflow-y:auto;padding:6px 8px}
.step-btn{display:flex;align-items:center;width:100%;padding:8px 10px;margin-bottom:3px;border:1px solid transparent;border-radius:5px;background:#0d1117;color:#8b949e;cursor:pointer;font-size:12px;text-align:left;transition:.12s;gap:6px}
.step-btn:hover{background:#1c2129;border-color:#30363d;color:#c9d1d9}
.step-btn.running{background:#0b1a17;border-color:#3fb950;color:#c9d1d9}
.step-btn.pass{background:#0b1a17;border-color:#1a3d2a}
.step-btn.fail{background:#1a0b0b;border-color:#da3633}
.step-btn:disabled{opacity:.45;cursor:not-allowed}
.step-btn .idx{font-size:10px;color:#484f58;min-width:22px}
.step-btn .name{flex:1;font-weight:500;font-size:12px}
.step-btn .cat{font-size:9px;padding:1px 5px;border-radius:3px;background:#21262d;color:#6e7681}
.badge{font-size:9px;padding:1px 4px;border-radius:3px;font-weight:700}
.badge.s3{background:#d29922;color:#000}
.badge.suite{background:#a371f7;color:#fff}
.status{font-size:11px;min-width:24px;text-align:right}
.status.pass{color:#3fb950}
.status.fail{color:#da3633}
.status.run{color:#d29922}
/* ─ 右侧 ─ */
#main{flex:1;display:flex;flex-direction:column;overflow:hidden}
#info{padding:14px 20px;background:#161b22;border-bottom:1px solid #21262d;min-height:100px;max-height:260px;overflow-y:auto}
#info h2{font-size:15px;color:#58a6ff;margin-bottom:6px;display:flex;align-items:center;gap:8px}
#info .desc{font-size:12px;line-height:1.65;color:#8b949e;white-space:pre-line}
#info .flags{margin-top:8px;font-size:11px;color:#484f58;display:flex;gap:14px;flex-wrap:wrap}
#info .flags span{display:flex;align-items:center;gap:3px}
#out-panel{flex:1;display:flex;flex-direction:column;background:#0d1117;min-height:0;overflow:hidden}
#out-head{padding:7px 20px;background:#161b22;font-size:11px;color:#484f58;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1c2129}
#out-head button{background:none;border:1px solid #30363d;color:#6e7681;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:10px}
#out-head button:hover{border-color:#58a6ff;color:#58a6ff}
#output{flex:1;overflow-y:auto;padding:10px 20px 16px;font-family:'Cascadia Code','Fira Code','Consolas',monospace;font-size:11.5px;line-height:1.55;white-space:pre-wrap;word-break:break-all;color:#7ee787}
#output .err{color:#f778ba}
#output .sys{color:#484f58}
#output .ok{color:#3fb950;font-weight:700}
#output .ko{color:#da3633;font-weight:700}
#output .head{color:#58a6ff;font-weight:700}
#bar{padding:6px 20px;background:#161b22;font-size:10px;color:#484f58;border-top:1px solid #21262d;display:flex;gap:18px;align-items:center}
#bar .dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:4px}
.dot.idle{background:#484f58}
.dot.run{background:#d29922}
.dot.pass{background:#3fb950}
.dot.fail{background:#da3633}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#21262d;border-radius:3px}
</style>
</head>
<body>
<div id="side">
  <div id="side-top">
    <h1>dynamic-node-cli</h1>
    <div class="sub">测试面板 &middot; Test Runner <button onclick="shutdown()" title="关闭服务器 (Ctrl+Q)" style="background:none;border:1px solid #da3633;color:#da3633;padding:1px 8px;border-radius:3px;cursor:pointer;font-size:10px;margin-left:8px">关闭</button></div>
    <div class="env" id="env">加载中...</div>
  </div>
  <div id="list">${btnHtml}</div>
</div>
<div id="main">
  <div id="info">
    <h2 id="info-title">📋 选择左侧测试项</h2>
    <div class="desc" id="info-desc">点击左侧任意按钮开始运行对应的测试步骤。每个按钮代表一个独立测试，右侧将显示详细的测试说明和实时输出日志。</div>
    <div class="flags" id="info-flags"></div>
  </div>
  <div id="out-panel">
    <div id="out-head"><span>输出日志</span><button onclick="clearOut()">清空 (Ctrl+L)</button></div>
    <div id="output"></div>
  </div>
  <div id="bar">
    <span id="indicator"><span class="dot idle"></span>就绪</span>
    <span id="total">共 ${STEPS.length} 项</span>
    <span id="passed">通过 0</span>
    <span id="failed">失败 0</span>
  </div>
</div>
<script>
const ALL = ${JSON.stringify(STEPS)};
const MAP = Object.fromEntries(ALL.map(s => [s.id, s]));
let busy = null, es = null, cid = crypto.randomUUID();
let nPass = 0, nFail = 0;

async function loadEnv(){
  try{
    const r = await fetch('/env'), d = await r.json();
    document.getElementById('env').innerHTML =
      '<span>🟢 '+d.compiler+'</span><span>💻 '+d.os+'</span><span>📐 '+d.arch+'</span>';
  }catch(e){ document.getElementById('env').textContent='无法获取环境信息'; }
}

function connect(){
  es = new EventSource('/events?cid='+cid);
  es.addEventListener('out', e => { const d = JSON.parse(e.data); append(d.t, d.s); });
  es.addEventListener('done', e => { const d = JSON.parse(e.data); finish(d.step, d.code); });
  es.onerror = () => {};
}

function append(text, stream){
  const out = document.getElementById('output'), d = document.createElement('div');
  d.className = 'line ' + (stream||'stdout');
  d.textContent = text;
  out.appendChild(d);
  out.scrollTop = out.scrollHeight;
}

function clearOut(){ document.getElementById('output').innerHTML = ''; }

function shutdown(){ fetch('/shutdown').then(()=>document.body.innerHTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#8b949e;font-size:18px">服务器已关闭，可以关闭此页面。</div>'); }

function showInfo(id){
  const s = MAP[id];
  document.getElementById('info-title').textContent = s.name;
  document.getElementById('info-desc').textContent = s.desc;
  const flags = [];
  if(s.needsS3) flags.push('<span>⚠ 需要 S3 连接</span>');
  if(s.needsBuild) flags.push('<span>📦 依赖前置构建</span>');
  if(s.isSuite) flags.push('<span>📋 测试套件（包含多个子步骤）</span>');
  document.getElementById('info-flags').innerHTML = flags.join('');
}

async function run(id){
  if(busy) return;
  const btn = document.querySelector('[data-step="'+id+'"]');
  if(!btn) return;
  document.querySelectorAll('.step-btn').forEach(b => b.disabled = true);
  busy = id;
  showInfo(id);
  clearOut();
  append('\\n▶ 开始运行: ' + MAP[id].name, 'sys');
  btn.classList.add('running');
  setStatus(id, '...', 'run');
  setIndicator('run', '运行中: ' + MAP[id].name);
  try{
    const r = await fetch('/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({step:id,cid})});
    if(!r.ok) throw new Error('HTTP '+r.status);
  }catch(e){ append('错误: '+e.message,'err'); finish(id,1); }
}

function finish(id, code){
  busy = null;
  setStatus(id, code===0 ? '✓' : '✗', code===0 ? 'pass' : 'fail');
  const btn = document.querySelector('[data-step="'+id+'"]');
  btn.classList.remove('running');
  btn.classList.add(code===0?'pass':'fail');
  if(code===0){ append('\\n✓ 测试通过','ok'); nPass++; }
  else{ append('\\n✗ 测试失败 (exit '+code+')','ko'); nFail++; }
  document.querySelectorAll('.step-btn').forEach(b => b.disabled = false);
  setIndicator('idle','就绪');
  document.getElementById('passed').textContent = '通过 '+nPass;
  document.getElementById('failed').textContent = '失败 '+nFail;
}

function setStatus(id,text,cls){ const el=document.getElementById('st-'+id); el.textContent=text; el.className='status '+cls; }
function setIndicator(cls,text){ document.getElementById('indicator').innerHTML='<span class="dot '+cls+'"></span>'+text; }

document.getElementById('list').addEventListener('click', e => {
  const btn = e.target.closest('.step-btn');
  if(btn) run(btn.dataset.step);
});
document.addEventListener('keydown', e => { if(e.ctrlKey && e.key==='l'){ e.preventDefault(); clearOut(); } });
document.addEventListener('keydown', e => { if(e.ctrlKey && e.key==='q'){ e.preventDefault(); shutdown(); } });

loadEnv(); connect();
</script>
</body>
</html>`;
}

// ── HTTP Server ──

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (u.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(getHTML());
    return;
  }

  if (u.pathname === "/env" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      compiler: `node${process.versions.node}`,
      os: process.platform,
      arch: process.arch,
      cwd: REPO_ROOT.replace(/\\/g, "/"),
    }));
    return;
  }

  if (u.pathname === "/events" && req.method === "GET") {
    const cid = u.searchParams.get("cid");
    if (!cid) { res.writeHead(400); res.end("missing cid"); return; }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write(":ok\n\n");
    clients.set(cid, res);
    req.on("close", () => clients.delete(cid));
    return;
  }

  if (u.pathname === "/run" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      try {
        const { step, cid } = JSON.parse(body);
        if (!step || !cid) { res.writeHead(400); res.end("missing step/cid"); return; }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        spawnTest(step, cid);
      } catch { res.writeHead(400); res.end("bad json"); }
    });
    return;
  }

  if (u.pathname === "/shutdown" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("已关闭");
    server.close(() => { console.log("已关闭"); process.exit(0); });
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

function send(cid, event, data) {
  const c = clients.get(cid);
  if (!c) return;
  c.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function spawnTest(step, cid) {
  const script = path.join(__dirname, `${step}.js`);

  if (!fs.existsSync(script)) {
    send(cid, "out", { t: `找不到测试脚本: ${script}`, s: "err" });
    send(cid, "done", { step, code: 1 });
    return;
  }

  const child = spawn(process.execPath, [script], {
    cwd: __dirname,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", d => send(cid, "out", { t: d.toString("utf8"), s: "stdout" }));
  child.stderr.on("data", d => send(cid, "out", { t: d.toString("utf8"), s: "err" }));
  child.on("close", code => send(cid, "done", { step, code: code || 0 }));
  child.on("error", err => {
    send(cid, "out", { t: `进程启动失败: ${err.message}`, s: "err" });
    send(cid, "done", { step, code: 1 });
  });
}

server.listen(PORT, () => {
  console.log(`测试面板已启动: http://localhost:${PORT}`);
});
