// 生成 _live.html：真实页面 + 真实事件链路联调
// 注意：无头 Chrome 会把 RAF 限流到近乎为 0（实测 3s 仅 2 帧），逐帧移动由
// _shot.js 的 m=stick（manual 逐帧驱动）确定性覆盖；这里验证真实事件链路：
// 合成 TouchEvent → 摇杆监听器 → 几何换算 → stickState / 摇杆头位移 / 多指共存
const fs = require('fs');
const path = require('path');
const dir = __dirname;
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
html = html.replace('<script src="game.js"></script>',
  '<script>window.__errs=[];window.onerror=function(m,s,l,c){window.__errs.push(m+" @ "+String(s).split("/").pop()+":"+l);' +
  'try{var x=new XMLHttpRequest();x.open("POST","/report",true);x.send("PAGE-ERROR "+m+" @ "+String(s).split("/").pop()+":"+l);}catch(e){}return false;};</script>\n' +
  '<script src="game.js"></script>');
html = html.replace('</body>',
  '<script>\n' +
  'window.addEventListener("load", function () {\n' +
  '  setTimeout(function () {\n' +
  '    var t = ["live-test"];\n' +
  '    function post() {\n' +
  '      var x = new XMLHttpRequest();\n' +
  '      x.open("POST", "/report", true);\n' +
  '      x.send(t.join("\\n"));\n' +
  '    }\n' +
  '    function stickTouch(type, x, y) {\n' +
  '      var el = document.getElementById("stick");\n' +
  '      var tc = new Touch({ identifier: 9, target: el, clientX: x, clientY: y });\n' +
  '      el.dispatchEvent(new TouchEvent(type, {\n' +
  '        touches: type === "touchend" ? [] : [tc],\n' +
  '        targetTouches: type === "touchend" ? [] : [tc],\n' +
  '        changedTouches: [tc], bubbles: true, cancelable: true\n' +
  '      }));\n' +
  '    }\n' +
  '    try {\n' +
  '      var S = window.__SR;\n' +
  '      S.start();\n' +
  '      setTimeout(function () {\n' +
  '        S.dpad("u"); S.dpad("u"); S.tap("Light");\n' +             // 摇杆搓招：↑↑ + 轻击
  '        setTimeout(function () {\n' +
  '          var st = {};\n' +
  '          for (var i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; if (!e.dead) st[e.state] = (st[e.state] || 0) + 1; }\n' +
  '          t.push("state=" + S.state() + " skill=" + (S.hero.skill ? S.hero.skill.name : "-") + " alive=" + S.enemiesLeft() + " hp=" + Math.round(S.hero.hp) + " st=" + Math.round(S.hero.st));\n' +
  '          t.push("enemyStates=" + JSON.stringify(st));\n' +
  '          t.push("touch=" + (document.body.classList.contains("touch") ? "on" : "off"));\n' +
  '          /* ---- 真实触点驱动摇杆（几何换算全链路） ---- */\n' +
  '          var el = document.getElementById("stick");\n' +
  '          var r = el.getBoundingClientRect();\n' +
  '          var cx = r.left + r.width / 2, cy = r.top + r.height / 2;\n' +
  '          var knob = document.getElementById("stickKnob");\n' +
  '          stickTouch("touchstart", cx, cy - 60);\n' +              // 手指按在环上方 60px
  '          var s1 = S.stickState();\n' +
  '          t.push("stickTouch-up active=" + s1.active + " mag=" + s1.mag.toFixed(2) + " sector=" + s1.sector + " (期望 true / 0.80 / u)");\n' +
  '          t.push("stickKnob transform=" + (knob.style.transform ? "set" : "empty") + " (" + knob.style.transform + ")");\n' +
  '          stickTouch("touchmove", cx + 60, cy);\n' +               // 手指水平滑到右侧
  '          var s2 = S.stickState();\n' +
  '          t.push("stickTouch-right sector=" + s2.sector + " (期望 r)");\n' +
  '          /* ---- 多指共存：摇杆按住 + 动作键点击 ---- */\n' +
  '          S.tap("Light");\n' +
  '          t.push("multi-touch stickStillActive=" + S.stickState().active + " (期望 true)");\n' +
  '          stickTouch("touchend", cx, cy);\n' +
  '          var s3 = S.stickState();\n' +
  '          t.push("stickTouch-end active=" + s3.active + " mag=" + s3.mag.toFixed(2) + " (期望 false / 0)");\n' +
  '          t.push("check=" + S.check());\n' +
  '          t.push("errors=" + (window.__errs.join(" | ") || "none"));\n' +
  '          post();\n' +
  '        }, 2500);\n' +
  '      }, 2500);\n' +
  '    } catch (e) { t.push("EXC " + e.message); post(); }\n' +
  '  }, 200);\n' +
  '});\n' +
  '</script></body>');
fs.writeFileSync(path.join(dir, '_live.html'), html, 'utf8');
console.log('WROTE _live.html');
