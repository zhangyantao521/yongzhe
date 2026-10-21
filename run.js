// 本地 HTTP 服务 + 无头 Chrome：把页面自检报告回传到 _report.txt
// node run.js <page.html> "<query>" [out.png] [budgetMs]
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFileSync } = require('child_process');
const dir = __dirname;
const page = process.argv[2] || '_shot.html';
const query = process.argv[3] || '';
const outPng = process.argv[4] || '';
const budget = parseInt(process.argv[5] || '0', 10);
const winSize = process.argv[6] || '1024,576';
const PORT = 8899;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css' };

let report = null;
const server = http.createServer(function (req, res) {
  if (req.method === 'POST' && req.url === '/report') {
    let body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      report = body;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
    return;
  }
  const p = req.url.split('?')[0];
  const file = path.join(dir, p === '/' ? page : p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('nf'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', function () {
  const url = 'http://127.0.0.1:' + PORT + '/' + page + query + (query ? '&' : '?') + 'post=1';
  const args = [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--no-first-run', '--disable-extensions',
    '--disable-background-networking',
    '--user-data-dir=' + path.join(os.tmpdir(), 'sr-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
    '--hide-scrollbars', '--window-size=' + winSize,
    url
  ];
  if (outPng) args.push('--screenshot=' + path.join(dir, outPng));
  if (budget > 0) args.push('--virtual-time-budget=' + budget);

  let done = false;
  const finish = function (why) {
    if (done) return;
    done = true;
    try { fs.writeFileSync(path.join(dir, '_report.txt'), (report || '(no report: ' + why + ')'), 'utf8'); } catch (e) { }
    console.log(why + ' report=' + (report ? 'yes' : 'no') + (outPng ? ' png=' + outPng : ''));
    server.close();
    process.exit(0);
  };

  const ch = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args, { stdio: 'ignore' });
  const poll = setInterval(function () {
    if (report) {
      clearInterval(poll);
      // 有截图需求时多等一会儿，让 --screenshot 落盘
      setTimeout(function () { try { ch.kill(); } catch (e) { } finish('got-report'); }, outPng ? 2500 : 400);
    }
  }, 200);
  setTimeout(function () { clearInterval(poll); try { ch.kill(); } catch (e) { } finish('timeout'); }, budget > 0 ? budget + 12000 : 25000);
});
