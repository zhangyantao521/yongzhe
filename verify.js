// 无头 Chrome 截图：node verify.js <page.html> <out.png> <budgetMs> "<query>"
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const dir = __dirname;
const page = process.argv[2] || 'index.html';
const out = path.join(dir, process.argv[3] || 'shot.png');
const budget = process.argv[4] || '4000';
const query = process.argv[5] || '';
const url = 'file:///' + path.join(dir, page).replace(/\\/g, '/') + query;
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const args = [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
  '--no-sandbox', '--no-first-run', '--disable-extensions',
  '--disable-background-networking',
  '--user-data-dir=' + path.join(os.tmpdir(), 'sr-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
  '--hide-scrollbars', '--window-size=1024,576',
  '--virtual-time-budget=' + budget,
  '--screenshot=' + out,
  url
];
try {
  execFileSync(chrome, args, { encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
  const ok = require('fs').statSync(out).size > 1000;
  console.log(ok ? 'PNG_OK ' + out : 'PNG_TOO_SMALL');
} catch (e) {
  console.log('FAIL ' + String(e.message).slice(0, 160));
}
