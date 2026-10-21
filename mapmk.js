// 生成 _mapdemo.html：自动开局 + 布设各类敌人，展示小地图标记效果
// node mapmk.js
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
  'try{' +
  '  var S=window.__SR;' +
  '  S.manual=true;' +
  '  S.start();' +
  '  S.clearField();' +
  '  var layout=[' +
  '    ["slime",-9,7],["slime",-4,-8],["slime",6,-10],' +
  '    ["stone",10,4],["stone",13,-3],' +
  '    ["archer",-12,-11],["elite",15,12]' +
  '  ];' +
  '  for(var i=0;i<layout.length;i++){' +
  '    var e=S.spawn(layout[i][0],layout[i][1],layout[i][2],{hpMul:1,dmgMul:1,spdMul:1});' +
  '    e.pos.set(layout[i][1],0,layout[i][2]);e.state="idle";e.stateT=0;' +
  '  }' +
  '  S.hero.pos.set(0,0,0);S.hero.facing=0;S.hero.state="idle";' +
  '  S.hud(0.016);' +
  '  var t=["map-demo blips="+S.mmBlips().length];' +
  '  t.push("errors="+(window.__errs.join(" | ")||"none"));' +
  '  var x=new XMLHttpRequest();x.open("POST","/report",true);x.send(t.join("\\n"));' +
  '}catch(e){' +
  '  var x2=new XMLHttpRequest();x2.open("POST","/report",true);x2.send("map-demo ERROR "+e.message);' +
  '}' +
  '},300);});</script></body>');
fs.writeFileSync(path.join(dir, '_mapdemo.html'), html, 'utf8');
console.log('WROTE _mapdemo.html');
