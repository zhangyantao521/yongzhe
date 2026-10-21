// 生成 _mobedit.html：复现用户手机横屏操作序列
// 游戏中 → ⚙设置 → 调整位置（面板关闭、浮动条出现）→ 拖动摇杆 → 保存位置 → 关闭设置
// 校验：保存后设置面板重新打开；关闭后游戏恢复运行（running=true）
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
  'var t=[];' +
  'function L(x){t.push(x);}' +
  'try{' +
  '  var S=window.__SR;' +
  '  S.start();' +
  '  L("started="+S.isStarted()+" running="+S.isRunning());' +
  '  // 1. 游戏中点 ⚙ 设置\n' +
  '  S.openSettings();' +
  '  L("afterOpenSettings running="+S.isRunning()+" panelVisible="+!document.getElementById("settings").classList.contains("hide"));' +
  '  // 2. 点「调整位置」→ 面板关闭、浮动条出现\n' +
  '  S.enterLayoutEdit();' +
  '  var bar=document.getElementById("layoutEditBar");' +
  '  L("afterEdit running="+S.isRunning()+" panelHidden="+document.getElementById("settings").classList.contains("hide")+" barVisible="+(bar.style.display!=="none"));' +
  '  // 3. 拖动摇杆（pointer 链路）\n' +
  '  var st=document.getElementById("stick");' +
  '  var r=st.getBoundingClientRect();' +
  '  st.dispatchEvent(new PointerEvent("pointerdown",{clientX:r.left+20,clientY:r.top+20,bubbles:true}));' +
  '  window.dispatchEvent(new PointerEvent("pointermove",{clientX:r.left+90,clientY:r.top+40,bubbles:true}));' +
  '  window.dispatchEvent(new PointerEvent("pointerup",{clientX:r.left+90,clientY:r.top+40,bubbles:true}));' +
  '  L("afterDrag stickLeft="+st.style.left+" stickTop="+st.style.top);' +
  '  // 4. 点「保存位置」→ 面板应重新打开\n' +
  '  S.exitLayoutEdit(true);' +
  '  L("afterSave running="+S.isRunning()+" panelVisible="+!document.getElementById("settings").classList.contains("hide")+" barHidden="+(bar.style.display==="none"));' +
  '  L("savedLayout="+JSON.stringify(S.getLayout().layout));' +
  '  // 5. 关闭设置 → 游戏必须恢复运行（这是用户报告的卡死点）\n' +
  '  S.closeSettings();' +
  '  L("afterClose running="+S.isRunning());' +
  '  L("VERDICT="+((S.isRunning()===true)?"PASS":"FAIL"));' +
  '}catch(e){L("THREW "+e.message+" | "+e.stack);}' +
  'L("errors="+(window.__errs.join(" | ")||"none"));' +
  'var x=new XMLHttpRequest();x.open("POST","/report",true);x.send(t.join("\\n"));' +
  '},600);},300);});</script></body>');
fs.writeFileSync(path.join(dir, '_mobedit.html'), html, 'utf8');
console.log('WROTE _mobedit.html');
