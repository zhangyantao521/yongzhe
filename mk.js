// 生成带确定性驱动脚本的测试页 _shot.html
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const out = html.replace('</body>', '<script src="_shot.js"></script></body>');
fs.writeFileSync(path.join(dir, '_shot.html'), out, 'utf8');
console.log('WROTE _shot.html');
