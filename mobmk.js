// 生成 _mob.html：强制触屏 UI + 自动开局，用于移动端视口截图
// node mobmk.js
const fs = require('fs');
const path = require('path');
const dir = __dirname;
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
html = html.replace('<script src="game.js"></script>',
  '<script>window.__errs=[];window.onerror=function(m,s,l,c){window.__errs.push(m+" @ "+String(s).split("/").pop()+":"+l);return false;};</script>\n' +
  '<script src="game.js"></script>');
html = html.replace('</body>',
  '<script>window.addEventListener("load",function(){' +
  'setTimeout(function(){' +
  'try{window.__SR.start();}catch(e){}' +
  'setTimeout(function(){' +
  'var t=["mob-ui touch="+(document.body.classList.contains("touch")?"on":"off")];' +
  't.push("errors="+(window.__errs.join(" | ")||"none"));' +
  'var x=new XMLHttpRequest();x.open("POST","/report",true);x.send(t.join("\\n"));' +
  '},1500);},300);});</script></body>');
fs.writeFileSync(path.join(dir, '_mob.html'), html, 'utf8');
console.log('WROTE _mob.html');
