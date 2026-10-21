// 生成 _mobset.html：手机横屏下实测设置弹窗几何 / 滚动能力
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
  'var t=[];function L(x){t.push(x);}' +
  'try{' +
  '  var S=window.__SR; S.start();' +
  '  S.openSettings();' +
  '  var se=document.getElementById("settings");' +
  '  var pn=se.querySelector(".setPanel");' +
  '  var ft=pn.querySelector(".setFoot");' +
  '  var cs=getComputedStyle(pn), cs2=getComputedStyle(se);' +
  '  L("win innerH="+window.innerHeight+" innerW="+window.innerWidth+" dvh="+(window.innerHeight));' +
  '  L("settings overflowY="+cs2.overflowY+" touchAction="+cs2.touchAction+" pad="+cs2.paddingTop+"/"+cs2.paddingBottom+" clientH="+se.clientHeight+" scrollH="+se.scrollHeight);' +
  '  L("panel clientH="+pn.clientHeight+" scrollH="+pn.scrollHeight+" offsetH="+pn.offsetHeight+" maxH="+cs.maxHeight+" overflowY="+cs.overflowY+" touchAction="+cs.touchAction);' +
  '  var pr=pn.getBoundingClientRect();' +
  '  L("panelRect top="+Math.round(pr.top)+" bottom="+Math.round(pr.bottom)+" h="+Math.round(pr.height));' +
  '  // 面板内滚动到底，检测底部「完成」按钮是否可达' +
  '  pn.scrollTop=pn.scrollHeight;' +
  '  var fr=ft.getBoundingClientRect();' +
  '  L("afterScroll scrollTop="+Math.round(pn.scrollTop)+" maxScroll="+(pn.scrollHeight-pn.clientHeight)+" footBottom="+Math.round(fr.bottom)+" footInView="+(fr.bottom<=window.innerHeight+1)+" footTop="+Math.round(fr.top));' +
  '  // 外层容器是否也在滚' +
  '  L("outerScrollable="+(se.scrollHeight>se.clientHeight+2)+" outerMaxScroll="+(se.scrollHeight-se.clientHeight));' +
  '  // 统计总内容高度与各区块' +
  '  var secs=pn.querySelectorAll("section");' +
  '  var hs=[];for(var i=0;i<secs.length;i++){hs.push(Math.round(secs[i].getBoundingClientRect().height));}' +
  '  L("sectionHeights="+JSON.stringify(hs)+" headH="+Math.round(pn.querySelector(".setHead").getBoundingClientRect().height)+" footH="+Math.round(ft.getBoundingClientRect().height));' +
  '  L("errors="+(window.__errs.join(" | ")||"none"));' +
  '}catch(e){L("THREW "+e.message+" | "+e.stack);}' +
  'var x=new XMLHttpRequest();x.open("POST","/report",true);x.send(t.join("\\n"));' +
  '},700);},300);});</script></body>');
fs.writeFileSync(path.join(dir, '_mobset.html'), html, 'utf8');
console.log('WROTE _mobset.html');
