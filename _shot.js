// 确定性逐帧驱动 + 自检报告（挂到 _shot.html 上运行）
(function () {
  var q = new URLSearchParams(location.search);
  var mode = q.get('m') || 'sim';
  var keep = parseFloat(q.get('keep') || '0');
  var z = parseFloat(q.get('z') || '0');
  var f = parseFloat(q.get('f') || '0');   // 动作进度停留帧
  var s = parseFloat(q.get('s') || '0');   // 起始帧数
  var S = window.__SR;
  var out = document.getElementById('errBox');
  var lines = [];
  var errs = [];
  window.addEventListener('error', function (e) { errs.push(e.message + ' @' + e.lineno); });

  function L(s) { lines.push(s); }
  var decoyOn = false;
  function clear() {
    S.clearField();
    S.hero.pos.set(0, 0, 0);
    S.hero.facing = 0;          // 朝 +Z
    S.hero.hp = 100; S.hero.st = 100;
    S.hero.state = 'idle'; S.hero.stateT = 0; S.hero.skill = null;
    S.hero.dead = false; S.hero.deadT = 0;
    S.hero.counterT = 0; S.hero.whiffT = 0;
    cmdSeqReset();
    if (decoyOn) {
      // 触屏联调专用：留一个远处冰封木桩占位——击杀最后一个敌人会触发过关（running=false），
      // 而动作键回调与键盘一样受 running 保护，后续用例将全部失效
      frozen('slime', 22);
      document.getElementById('winScreen').classList.add('hide');
    }
  }
  // 冰封木桩：aggro=0 永不主动出手，用于指令技数值的确定性验证
  function frozen(type, dist) {
    var e = dummy(type, dist);
    e.speed = 0; e.aggro = 0; e.shootCd = 99;
    e.state = 'idle'; e.stateT = 0;
    return e;
  }
  function cmdSeqReset() { if (S.cmdReset) S.cmdReset(); }
  // 在角色正前方放一个木桩
  function dummy(type, dist) {
    var e = S.spawn(type || 'slime', 0, dist, { hpMul: 1, dmgMul: 1, spdMul: 1 });
    e.pos.set(0, 0, dist);
    e.knock.set(0, 0, 0);
    e.state = 'idle'; e.stateT = 0;
    e.hp = e.maxHp; e.breakv = 0;
    return e;
  }
  function step(n) { for (var i = 0; i < n; i++) S.step(1 / 60); }
  // 释放指令技并跑到指定进度
  function castTo(cmd, btn, progress) {
    S.cast(cmd, btn);
    var dur = 0;
    var sk = S.hero.skill;
    if (sk) dur = sk.dur;
    var frames = Math.round((progress === undefined ? 1.05 : progress) * dur * 60);
    step(Math.max(1, frames));
    return sk;
  }

  try {
    S.manual = true;
    S.start();
    L('level=' + S.level() + ' enemies=' + S.enemiesLeft());

    if (mode === 'sim') {
      /* ============ 指令技数值自检 ============ */
      // 0. 无指令时走普通攻击
      clear(); var e0 = dummy('slime', 1.6);
      S.equip(0); S.attack('light');
      step(3);
      L('plain-attack state=' + S.hero.state + ' (期望 light)');

      // 1. 剑：破空三连斩 ↑↑轻
      clear(); var e1 = dummy('slime', 2.0);
      S.equip(0);
      castTo('uu', 'light', 1.05);
      L('sword uu-light dmg=' + (e1.maxHp - e1.hp).toFixed(1) + ' (cfg 12+12+19=43)');

      // 2. 剑：回燕斩 ↑↓轻（全周两段）
      clear(); var e2 = dummy('slime', 1.8);
      castTo('ud', 'light', 1.05);
      L('sword ud-light dmg=' + (e2.maxHp - e2.hp).toFixed(1) + ' (cfg 15+15=30)');

      // 3. 剑：升龙剑 ↓↑轻
      clear(); var e3 = dummy('slime', 1.6);
      castTo('du', 'light', 1.05);
      L('sword du-light dmg=' + (e3.maxHp - e3.hp).toFixed(1) + ' (cfg 20)');

      // 4. 剑：惊雷刺 ↑↑重
      clear(); var e4 = dummy('slime', 2.2);
      castTo('uu', 'heavy', 1.05);
      L('sword uu-heavy dmg=' + (e4.maxHp - e4.hp).toFixed(1) + ' (cfg 34)');

      // 5. 剑：劈山剑 ↓↓重
      clear(); var e5 = dummy('slime', 1.8);
      castTo('dd', 'heavy', 1.05);
      L('sword dd-heavy dmg=' + (e5.maxHp - e5.hp).toFixed(1) + ' (cfg 40)');

      // 6. 剑：瞬影斩 空格↑轻
      clear(); var e6 = dummy('slime', 1.8);
      castTo('ku', 'light', 1.05);
      L('sword ku-light dmg=' + (e6.maxHp - e6.hp).toFixed(1) + ' (cfg 16)');

      // 7. 剑：万剑归宗 空格↓↓重（终极）
      clear(); var e7 = S.spawn('stone', 0, 3.2, { hpMul: 1, dmgMul: 1, spdMul: 1 });
      e7.pos.set(0, 0, 3.2); e7.state = 'idle';
      castTo('kdd', 'heavy', 1.05);
      L('sword ULT dmg=' + (e7.maxHp - e7.hp).toFixed(1) + ' (cfg 60)');

      // 8. 斧：狂蛮冲撞 ↑↑轻
      clear(); var e8 = dummy('slime', 2.0);
      S.equip(1);
      castTo('uu', 'light', 1.05);
      L('axe uu-light dmg=' + (e8.maxHp - e8.hp).toFixed(1) + ' (cfg 16+22=38)');

      // 9. 斧：裂地波 ↓↑轻
      clear(); var e9 = dummy('slime', 1.8);
      castTo('du', 'light', 1.05);
      L('axe du-light dmg=' + (e9.maxHp - e9.hp).toFixed(1) + ' (cfg 22)');

      // 10. 斧：崩山冲锋 ↑↑重
      clear(); var e10 = dummy('slime', 2.2);
      castTo('uu', 'heavy', 1.05);
      L('axe uu-heavy dmg=' + (e10.maxHp - e10.hp).toFixed(1) + ' (cfg 24+24=48)');

      // 11. 斧：天崩地裂 ↓↓重
      clear(); var e11 = dummy('slime', 1.8);
      castTo('dd', 'heavy', 1.05);
      L('axe dd-heavy dmg=' + (e11.maxHp - e11.hp).toFixed(1) + ' (cfg 46)');

      // 12. 斧：陨石天降 空格↓↓重（终极）
      clear(); var e12 = S.spawn('stone', 0, 3.0, { hpMul: 1, dmgMul: 1, spdMul: 1 });
      e12.pos.set(0, 0, 3.0); e12.state = 'idle';
      castTo('kdd', 'heavy', 1.05);
      L('axe ULT dmg=' + (e12.maxHp - e12.hp).toFixed(1) + ' (cfg 88)');

      // 13. 枪：疾风三刺 ↑↑轻
      clear(); var e13 = dummy('slime', 2.4);
      S.equip(2);
      castTo('uu', 'light', 1.05);
      L('spear uu-light dmg=' + (e13.maxHp - e13.hp).toFixed(1) + ' (cfg 10+10+15=35)');

      // 14. 枪：回马枪 ↑↓轻
      clear(); var e14 = dummy('slime', 1.8);
      castTo('ud', 'light', 1.05);
      L('spear ud-light dmg=' + (e14.maxHp - e14.hp).toFixed(1) + ' (cfg 22)');

      // 15. 枪：惊雷贯穿 ↑↑重
      clear(); var e15 = dummy('slime', 2.6);
      castTo('uu', 'heavy', 1.05);
      L('spear uu-heavy dmg=' + (e15.maxHp - e15.hp).toFixed(1) + ' (cfg 30)');

      // 16. 枪：破军扫 ↓↓重
      clear(); var e16 = dummy('slime', 2.0);
      castTo('dd', 'heavy', 1.05);
      L('spear dd-heavy dmg=' + (e16.maxHp - e16.hp).toFixed(1) + ' (cfg 22+22=44)');

      // 17. 枪：横扫千军 空格↓↓重（终极）
      clear(); var e17 = S.spawn('stone', 0, 3.4, { hpMul: 1, dmgMul: 1, spdMul: 1 });
      e17.pos.set(0, 0, 3.4); e17.state = 'idle';
      castTo('kdd', 'heavy', 1.05);
      L('spear ULT dmg=' + (e17.maxHp - e17.hp).toFixed(1) + ' (cfg 28x5=140)');

      /* —— v1.6 左右横断系：→← / ←→ / ←← —— */
      // R1. 剑：十字燕返 →←轻（交叉横斩两段）
      clear(); var r1 = dummy('slime', 2.0); S.equip(0);
      var s1 = castTo('lr', 'light', 1.05);
      L('sword lr-light name=' + (s1 ? s1.name : '-') + ' dmg=' + (r1.maxHp - r1.hp).toFixed(1) + ' (期望 十字燕返 / 13+17=30)');

      // R2. 剑：回风斩 ←→轻（后撤反手横割）
      clear(); var r2 = dummy('slime', 1.6);
      var s2 = castTo('rl', 'light', 1.05);
      L('sword rl-light name=' + (s2 ? s2.name : '-') + ' dmg=' + (r2.maxHp - r2.hp).toFixed(1) + ' (期望 回风斩 / 20)');

      // R3. 剑：断流横断 ←←重（大横断两击）
      clear(); var r3 = dummy('slime', 1.8);
      var s3 = castTo('ll', 'heavy', 1.05);
      L('sword ll-heavy name=' + (s3 ? s3.name : '-') + ' dmg=' + (r3.maxHp - r3.hp).toFixed(1) + ' (期望 断流横断 / 22+22=44)');

      // R4. 斧：横断双挥 →←轻
      clear(); var r4 = dummy('slime', 1.6); S.equip(1);
      var s4 = castTo('lr', 'light', 1.05);
      L('axe lr-light name=' + (s4 ? s4.name : '-') + ' dmg=' + (r4.maxHp - r4.hp).toFixed(1) + ' (期望 横断双挥 / 17+23=40)');

      // R5. 斧：拖斧反斩 ←→轻
      clear(); var r5 = dummy('slime', 1.6);
      var s5 = castTo('rl', 'light', 1.05);
      L('axe rl-light name=' + (s5 ? s5.name : '-') + ' dmg=' + (r5.maxHp - r5.hp).toFixed(1) + ' (期望 拖斧反斩 / 26)');

      // R6. 斧：横断山岳 ←←重
      clear(); var r6 = dummy('slime', 1.8);
      var s6 = castTo('ll', 'heavy', 1.05);
      L('axe ll-heavy name=' + (s6 ? s6.name : '-') + ' dmg=' + (r6.maxHp - r6.hp).toFixed(1) + ' (期望 横断山岳 / 23+23=46)');

      // R7. 枪：双横抹月 →←轻
      clear(); var r7 = dummy('slime', 2.0); S.equip(2);
      var s7 = castTo('lr', 'light', 1.05);
      L('spear lr-light name=' + (s7 ? s7.name : '-') + ' dmg=' + (r7.maxHp - r7.hp).toFixed(1) + ' (期望 双横抹月 / 11+15=26)');

      // R8. 枪：侧返枪 ←→轻
      clear(); var r8 = dummy('slime', 1.6);
      var s8 = castTo('rl', 'light', 1.05);
      L('spear rl-light name=' + (s8 ? s8.name : '-') + ' dmg=' + (r8.maxHp - r8.hp).toFixed(1) + ' (期望 侧返枪 / 22)');

      // R9. 枪：横断江 ←←重
      clear(); var r9 = dummy('slime', 2.0);
      var s9 = castTo('ll', 'heavy', 1.05);
      L('spear ll-heavy name=' + (s9 ? s9.name : '-') + ' dmg=' + (r9.maxHp - r9.hp).toFixed(1) + ' (期望 横断江 / 22+22=44)');

      // R10. 左右指令不串扰上下系：↑↓轻仍为回燕斩，←→轻不误触
      clear(); var r10 = dummy('slime', 1.8); S.equip(0);
      var s10 = castTo('ud', 'light', 1.05);
      L('cross-check ud-light name=' + (s10 ? s10.name : '-') + ' (期望 回燕斩)');

      // 18. 技能被普通攻击区隔：不匹配指令时仍是 light
      clear(); dummy('slime', 5.0); S.equip(0);
      S.attack('light');
      step(3);
      L('no-cmd attack state=' + S.hero.state + ' (期望 light)');

      // 19. 技能释放后进入 skill 状态且占用体力
      clear(); dummy('slime', 2.0); S.equip(0);
      var st0 = S.hero.st;
      S.cast('uu', 'light');
      step(2);
      L('cast state=' + S.hero.state + ' skill=' + (S.hero.skill ? S.hero.skill.name : '-') +
        ' st=' + st0.toFixed(0) + '->' + S.hero.st.toFixed(0));

      // 20. 完美闪避仍可用
      clear(); var e20 = dummy('slime', 1.9);
      e20.radius = 0.15; e20.state = 'windup'; e20.stateT = 0.4; e20.windup = 0.5;
      S.hero.hp = 100; S.hero.counterT = 0;
      S.hero.state = 'dodge'; S.hero.stateT = 0; S.hero.iframe = 0.3; S.hero.dodgeFresh = 0.16;
      S.hero.dodgeDir.set(0, 0, 1); S.hero.dodgeDur = 0.5; S.hero.dodgeSpeed = 0;
      var hpB = S.hero.hp;
      step(12);
      L('perfect-dodge hp=' + (S.hero.hp - hpB).toFixed(1) + ' counter=' + S.hero.counterT.toFixed(2) + ' (期望 0 / >0)');

      // 21. 关卡推进与掉落
      var lv = S.level();
      S.clearField();
      S.enemies.forEach(function (x) { x.dead = true; });
      S.next();
      L('after-next level=' + S.level() + ' enemies=' + S.enemiesLeft());
      S.clearField();
      var d1 = S.spawn('slime', 0, 3, { hpMul: 1, dmgMul: 1, spdMul: 1 });
      d1.hp = 1; d1.pos.set(0, 0, 1.4);
      S.hero.pos.set(0, 0, 0); S.hero.facing = 0;
      S.cast('uu', 'light');
      step(60);
      L('orbs=' + S.orbs.length + ' score=' + S.score());
    }

    if (mode === 'lock') {
      /* ============ 自动锁怪自检 ============ */
      decoyOn = true;   // 占位木桩防过关（击杀最后一个敌人会置 running=false，屏蔽按钮链路）
      function at(type, x, z) {
        var e = S.spawn(type, x, z, { hpMul: 1, dmgMul: 1, spdMul: 1 });
        e.pos.set(x, 0, z);
        e.speed = 0; e.aggro = 0; e.shootCd = 99;
        e.state = 'idle'; e.stateT = 0;
        e.hp = e.maxHp; e.breakv = 0;
        e.knock.set(0, 0, 0);
        return e;
      }

      // 1. 背对怪物搓招：面向 -Z 的敌人在背后，释放升龙剑应自动转身命中
      clear(); var k1 = at('slime', 0, -2.0); S.equip(0);
      S.hero.facing = 0;   // 朝 +Z，敌人在正背后
      S.cast('du', 'light');
      var f1 = S.hero.facing;
      step(50);
      L('lock back-turn facing=' + f1.toFixed(2) + ' (期望≈3.14) dmg=' + (k1.maxHp - k1.hp).toFixed(1) + ' (期望 20，未锁定则为 0)');

      // 2. 侧对怪物放突进技：面向 +X，敌人在 +Z 侧，惊雷刺应转向冲锋命中
      clear(); var k2 = at('slime', 0, 2.2); S.equip(0);
      S.hero.facing = Math.PI / 2;   // 朝 +X，与敌人垂直
      S.cast('uu', 'heavy');
      var f2 = S.hero.facing;
      step(60);
      L('lock side-turn facing=' + f2.toFixed(2) + ' (期望≈0) dmg=' + (k2.maxHp - k2.hp).toFixed(1) + ' (期望 34)');

      // 3. 多目标时锁定最近者：近敌在背后、远敌在正面，劈山剑应打近敌
      clear(); S.equip(0);
      var kFar = at('slime', 0, 2.6);    // 正面 2.6m
      var kNear = at('slime', 0, -1.5);  // 背后 1.5m（更近）
      S.hero.facing = 0;
      S.cast('dd', 'heavy');
      var f3 = S.hero.facing;
      step(70);
      L('lock nearest facing=' + f3.toFixed(2) + ' (期望≈3.14) nearDmg=' + (kNear.maxHp - kNear.hp).toFixed(1) +
        ' (期望 40) farDmg=' + (kFar.maxHp - kFar.hp).toFixed(1) + ' (期望 0)');

      // 4. 锁怪范围内无目标时不转向（远处占位木桩在 22m，超出 15m 锁怪范围）
      clear(); S.equip(0);
      S.hero.facing = 1.2;
      S.cast('uu', 'light');
      var f4 = S.hero.facing;
      step(3);
      L('lock no-target facing=' + f4.toFixed(2) + ' (期望 1.20) state=' + S.state());

      // 5. 超出锁怪范围（>15m）不锁
      clear(); var k5 = at('slime', 0, -18); S.equip(0);
      S.hero.facing = 0;
      S.cast('du', 'light');
      var f5 = S.hero.facing;
      step(50);
      L('lock out-of-range facing=' + f5.toFixed(2) + ' (期望 0) dmg=' + (k5.maxHp - k5.hp).toFixed(1) + ' (期望 0)');

      // 6. 普通攻击不受锁怪影响（保持原有转向手感）
      clear(); var k6 = at('slime', 0, -2.0); S.equip(0);
      S.hero.facing = 0;   // 敌人在背后
      S.attack('light');
      var f6 = S.hero.facing;
      step(30);
      L('lock plain-attack facing=' + f6.toFixed(2) + ' (期望 0) dmg=' + (k6.maxHp - k6.hp).toFixed(1) + ' (期望 0，普攻不锁)');

      // 7. 触屏链路同效：先按住 ↑ 把角色转身背怪，再 ↓↓+重击 应锁到近敌
      clear(); var k7 = at('slime', 0, 2.0); S.equip(0);
      S.dpadDown('u'); step(12); S.dpadUp('u'); step(2);   // 走向 -Z 并转身背对敌人
      var away = S.hero.facing;
      S.inject('dd');
      S.tap('Heavy');
      var f7 = S.hero.facing;
      step(70);
      L('lock touch-chain awayFacing=' + away.toFixed(2) + ' lockFacing=' + f7.toFixed(2) +
        ' (期望≈0) dmg=' + (k7.maxHp - k7.hp).toFixed(1) + ' (期望 40)');

      // 8. 左右系指令同样自动锁怪：背对怪物搓 →←轻（十字燕返）应转向命中
      clear(); var k8 = at('slime', 0, -2.0); S.equip(0);
      S.hero.facing = 0;   // 朝 +Z，敌人在正背后
      S.cast('lr', 'light');
      var f8 = S.hero.facing;
      step(70);
      L('lock lr-cmd facing=' + f8.toFixed(2) + ' (期望≈3.14) dmg=' + (k8.maxHp - k8.hp).toFixed(1) + ' (期望 30)');
    }

    if (mode === 'map') {
      /* ============ 小地图自检（画布像素级） ============ */
      // 0. 画布就位
      var cv = document.getElementById('minimapCanvas');
      L('map-ui canvas=' + (cv ? 1 : 0) + ' cssW=' + (cv ? cv.clientWidth : 0) +
        ' bufW=' + (cv ? cv.width : 0));

      function px(wx, wz) { return S.mmPixel(wx, wz); }
      function near(pxv, rgb, tol) {
        return Math.abs(pxv[0] - rgb[0]) <= tol && Math.abs(pxv[1] - rgb[1]) <= tol &&
               Math.abs(pxv[2] - rgb[2]) <= tol && pxv[3] > 200;
      }

      // 1. 空场底盘：圆内远离英雄/锚点处应为半透明深色（不挡视野也不全透明）
      clear(); S.hud(0.016);
      var bgPx = px(-15, -15);
      L('map empty-bg rgba=' + bgPx.join(',') + ' (期望 alpha 120~210 的半透明深色)');

      // 2. 玩家金三角：出现在英雄所在世界坐标
      clear(); S.hero.pos.set(4, 0, -6); S.hero.facing = 0; S.hud(0.016);
      var heroPx = px(4, -6);
      L('map hero-dot rgba=' + heroPx.join(',') + ' (期望金色 255,216,138)');

      // 3. 四类怪物按类型分色，且画在正确世界坐标上
      clear();
      var m1 = dummy('slime', 0); m1.pos.set(-9, 0, 7);
      var m2 = dummy('stone', 0); m2.pos.set(11, 0, -3);
      var m3 = dummy('archer', 0); m3.pos.set(-14, 0, -12);
      var m4 = dummy('elite', 0); m4.pos.set(16, 0, 14);
      S.hud(0.016);
      L('map blips=' + S.mmBlips().length + ' (期望 4)');
      L('map slime  rgba=' + px(-9, 7).join(',') + ' (期望红 255,107,107)');
      L('map stone  rgba=' + px(11, -3).join(',') + ' (期望橙 255,159,67)');
      L('map archer rgba=' + px(-14, -12).join(',') + ' (期望黄 255,209,102)');
      L('map elite  rgba=' + px(16, 14).join(',') + ' (期望紫 192,132,252)');

      // 4. 映射精度：任意世界坐标 → 彩点必须落在对应像素（容差 ±0.7 世界单位）
      clear();
      var m5 = dummy('slime', 0); m5.pos.set(2.4, 0, -8.6);
      S.hud(0.016);
      var found = false;
      for (var ox = -2; ox <= 2 && !found; ox++) {
        for (var oz = -2; oz <= 2 && !found; oz++) {
          if (near(px(2.4 + ox * 0.35, -8.6 + oz * 0.35), [255, 107, 107], 60)) found = true;
        }
      }
      L('map mapping acc=' + (found ? 'ok' : 'MISS') + ' (2.4,-8.6 应落在像素内)');

      // 5. 死亡敌人不画点
      clear();
      var m6 = dummy('slime', 0); m6.pos.set(-6, 0, 6); m6.dead = true;
      S.hud(0.016);
      var deadPx = px(-6, 6);
      L('map dead-hidden alpha=' + deadPx[3] + ' (期望 < 200，仅剩底盘)');

      // 6. 当前目标（9m 内最近）有脉冲光环：目标点外围应能找到金色环像素
      clear();
      var m7 = dummy('slime', 0); m7.pos.set(0, 0, 3);
      dummy('slime', 0).pos.set(0, 0, 7);      // 更远，非目标
      S.hud(0.016);
      var ringFound = false;
      for (var rad = 1.6; rad <= 2.6 && !ringFound; rad += 0.2) {
        for (var a = 0; a < 24 && !ringFound; a++) {
          var ang = a / 24 * Math.PI * 2;
          var rp = px(Math.sin(ang) * rad, 3 + Math.cos(ang) * rad);
          if (rp[0] > 200 && rp[1] > 150 && rp[2] < 190 && rp[3] > 120) ringFound = true;
        }
      }
      L('map target-ring=' + (ringFound ? 'ok' : 'MISS') + ' (期望 3 米处目标有金环)');

      // 7. 锚点（治疗点）青点：每个锚点坐标上应能找到青色像素
      clear(); S.hud(0.016);
      var shrines = S.mmShrines();
      var shrineOk = 0;
      for (var i = 0; i < shrines.length; i++) {
        var sp = px(shrines[i].x, shrines[i].z);
        if (sp[2] > 180 && sp[1] > 150 && sp[3] > 150 && sp[0] < 200) shrineOk++;
      }
      L('map shrines=' + shrineOk + '/' + shrines.length + ' (期望全部画出青点)');

      // 8. 圆形裁剪：画布角落在圆外，必须全透明
      var cd = cv.getContext('2d').getImageData(0, 0, 1, 1).data;
      L('map outside-clip alpha=' + cd[3] + ' (期望 0，圆形裁剪生效)');
    }

    if (mode === 'stick') {
      /* ============ 虚拟摇杆自检 ============ */
      decoyOn = true;
      // 0. 摇杆 UI 就位
      L('stick-ui el=' + (document.getElementById('stick') ? 1 : 0) +
        ' knob=' + (document.getElementById('stickKnob') ? 1 : 0) +
        ' ticks=' + document.querySelectorAll('#stick .tick').length);

      // 1. 全推 ↑ → 全速向 -Z 移动
      clear();
      var z1 = S.hero.pos.z;
      S.stickAt(0, -1); step(30);
      var dzFull = S.hero.pos.z - z1;
      S.stickOff(); step(2);
      L('stick full-tilt dz=' + dzFull.toFixed(2) + ' (期望≈-2.30) state=' + JSON.stringify(S.stickState()));

      // 2. 半推 ↑ → 模拟量减速
      clear();
      var z2 = S.hero.pos.z;
      S.stickAt(0, -0.6); step(30);
      var dzHalf = S.hero.pos.z - z2;
      S.stickOff(); step(2);
      L('stick half-tilt dz=' + dzHalf.toFixed(2) + ' (期望≈-1.58) 速比=' + (dzHalf / dzFull).toFixed(2) + ' (期望≈0.69)');

      // 3. 死区内轻推 → 不动、不入队
      clear();
      var z3 = S.hero.pos.z;
      S.stickAt(0, -0.2); step(20);
      var dzDead = S.hero.pos.z - z3;
      S.stickOff(); step(2);
      L('stick deadzone dz=' + dzDead.toFixed(2) + ' (期望 0) sector=' + S.stickState().sector);

      // 4. 斜推 → 斜向移动 + 朝向=斜向
      clear();
      var p4 = { x: S.hero.pos.x, z: S.hero.pos.z };
      S.stickAt(0.7, -0.7); step(30);
      var dx4 = S.hero.pos.x - p4.x, dz4 = S.hero.pos.z - p4.z;
      var f4 = S.hero.facing;
      S.stickOff(); step(2);
      L('stick diagonal dx=' + dx4.toFixed(2) + ' dz=' + dz4.toFixed(2) + ' (期望均≈1.6) facing=' + f4.toFixed(2) + ' (期望≈2.36)');

      // 5. 斜拨按主轴量化：右上前者 → r
      clear();
      S.stickAt(0.8, -0.6);
      L('stick quantize(0.8,-0.6) sector=' + S.stickState().sector + ' (期望 r)');
      S.stickOff();

      // 6. 摇杆搓招 ↑↑ + 轻击 = 破空三连斩（合成触点真实链路）
      clear(); var s6 = dummy('slime', 2.0); S.equip(0);
      S.dpad('u'); S.dpad('u');
      S.tap('Light');
      var n6 = S.hero.skill ? S.hero.skill.name : '-';
      step(65);
      L('stick cmd uu-light=' + n6 + ' dmg=' + (s6.maxHp - s6.hp).toFixed(1) + ' (期望 破空三连斩 / 43)');

      // 7. 摇杆搓招 ↑↓ + 轻击 = 回燕斩
      clear(); var s7 = dummy('slime', 1.8);
      S.dpad('u'); S.dpad('d');
      S.tap('Light');
      var n7 = S.hero.skill ? S.hero.skill.name : '-';
      step(60);
      L('stick cmd ud-light=' + n7 + ' dmg=' + (s7.maxHp - s7.hp).toFixed(1) + ' (期望 回燕斩 / 30)');

      // 8. 摇杆搓招 ↓↑ + 轻击 = 升龙剑
      clear(); var s8 = dummy('slime', 1.6);
      S.dpad('d'); S.dpad('u');
      S.tap('Light');
      var n8 = S.hero.skill ? S.hero.skill.name : '-';
      step(50);
      L('stick cmd du-light=' + n8 + ' dmg=' + (s8.maxHp - s8.hp).toFixed(1) + ' (期望 升龙剑 / 20)');

      // 9. 摇杆搓招 ↓↓ + 重击 = 劈山剑
      clear(); var s9 = dummy('slime', 1.8);
      S.dpad('d'); S.dpad('d');
      S.tap('Heavy');
      var n9 = S.hero.skill ? S.hero.skill.name : '-';
      step(70);
      L('stick cmd dd-heavy=' + n9 + ' dmg=' + (s9.maxHp - s9.hp).toFixed(1) + ' (期望 劈山剑 / 40)');

      // 10. 松手后停止移动
      clear();
      S.stickAt(0, -1); step(20);
      var z10 = S.hero.pos.z;   // 松手瞬间位置
      S.stickOff(); step(30);   // 松手后继续跑 30 帧
      L('stick release-stop dz=' + (S.hero.pos.z - z10).toFixed(3) + ' (期望 0)');

      // 11. 单拨一次 + 轻击 = 普通攻击（不误触技能）
      clear(); dummy('slime', 1.6); S.equip(0);
      S.dpad('u');
      S.tap('Light'); step(3);
      L('stick single-flick state=' + S.state() + ' (期望 light)');
    }

    if (mode === 'touch') {
      /* ============ 触屏输入全链路自检（合成 TouchEvent） ============ */
      decoyOn = true;   // 占位木桩防过关（见 clear()）
      // 0. 触屏 UI 就位（?touch=1 强制启用）
      S.hud(0.016);
      L('touch-ui body=' + (document.body.classList.contains('touch') ? 'on' : 'off') +
        ' stick=' + (document.getElementById('stick') ? 1 : 0) +
        ' ticks=' + document.querySelectorAll('#stick .tick').length +
        ' knob=' + (document.getElementById('stickKnob') ? 1 : 0) +
        ' abtns=' + document.querySelectorAll('#abtns .abtn').length +
        ' ultCmd="' + document.getElementById('ultCmd').textContent + '"');

      // 通过十字键 + 动作键释放指令技（与真实手指同一链路）
      function castByTouch(cmd, btn) {
        for (var i = 0; i < cmd.length; i++) {
          if (cmd.charAt(i) === 'k') S.tap('Dodge');
          else S.dpad(cmd.charAt(i));
        }
        step(25);   // 闪避后回到可行动状态
        if (cmd.charAt(0) === 'k') { S.hero.pos.set(0, 0, 1.6); S.hero.facing = 0; }  // 后撤步归位
        var pre = 'pre[hp=' + S.hero.hp.toFixed(0) + ' st=' + S.hero.st.toFixed(0) +
          ' dead=' + S.hero.dead + ' state=' + S.state() + ']';
        S.tap(btn === 'light' ? 'Light' : 'Heavy');
        step(2);
        return pre;
      }

      // 1. 十字键按住 → 角色向屏幕上方（-Z）移动
      clear();
      var z0 = S.hero.pos.z;
      S.dpadDown('u'); step(30); S.dpadUp('u'); step(2);
      L('dpad-hold dz=' + (S.hero.pos.z - z0).toFixed(2) + ' (期望 < -1.5)');

      // 2. 剑：↑↑ + 轻击 → 破空三连斩
      clear(); var t1 = frozen('slime', 2.0); S.equip(0);
      var p1 = castByTouch('uu', 'light');
      var n1 = S.hero.skill ? S.hero.skill.name : '-';
      step(65);
      L('touch sword uu-light=' + n1 + ' dmg=' + (t1.maxHp - t1.hp).toFixed(1) + ' (期望 破空三连斩 / 43) ' + p1);

      // 3. 剑：↑↓ + 轻击 → 回燕斩
      clear(); var t2 = frozen('slime', 1.8);
      var p2 = castByTouch('ud', 'light');
      var n2 = S.hero.skill ? S.hero.skill.name : '-';
      step(60);
      L('touch sword ud-light=' + n2 + ' dmg=' + (t2.maxHp - t2.hp).toFixed(1) + ' (期望 回燕斩 / 30) ' + p2);

      // 4. 剑：↓↑ + 轻击 → 升龙剑
      clear(); var t3 = frozen('slime', 1.6);
      var p3 = castByTouch('du', 'light');
      var n3 = S.hero.skill ? S.hero.skill.name : '-';
      step(50);
      L('touch sword du-light=' + n3 + ' dmg=' + (t3.maxHp - t3.hp).toFixed(1) + ' (期望 升龙剑 / 20) ' + p3);

      // 5. 剑：↑↑ + 重击 → 惊雷刺
      clear(); var t4 = frozen('slime', 2.2);
      var p4 = castByTouch('uu', 'heavy');
      var n4 = S.hero.skill ? S.hero.skill.name : '-';
      step(60);
      L('touch sword uu-heavy=' + n4 + ' dmg=' + (t4.maxHp - t4.hp).toFixed(1) + ' (期望 惊雷刺 / 34) ' + p4);

      // 6. 剑：闪避键(=␣) + ↓↓ + 重击 → 万剑归宗（终极）
      clear(); var t5 = frozen('stone', 3.2);
      var p5 = castByTouch('kdd', 'heavy');
      var n5 = S.hero.skill ? S.hero.skill.name : '-';
      step(120);
      L('touch sword ULT=' + n5 + ' dmg=' + (t5.maxHp - t5.hp).toFixed(1) + ' (期望 万剑归宗 / 60) ' + p5);

      // 7. 斧：↑↑ + 重击 → 崩山冲锋
      clear(); var t6 = frozen('slime', 2.2); S.equip(1);
      var p6 = castByTouch('uu', 'heavy');
      var n6 = S.hero.skill ? S.hero.skill.name : '-';
      step(75);
      L('touch axe uu-heavy=' + n6 + ' dmg=' + (t6.maxHp - t6.hp).toFixed(1) + ' (期望 崩山冲锋 / 48) ' + p6);

      // 8. 斧：␣↓↓ + 重击 → 陨石天降
      clear(); var t7 = frozen('stone', 3.0);
      var p7 = castByTouch('kdd', 'heavy');
      var n7 = S.hero.skill ? S.hero.skill.name : '-';
      step(125);
      L('touch axe ULT=' + n7 + ' dmg=' + (t7.maxHp - t7.hp).toFixed(1) + ' (期望 陨石天降 / 88) ' + p7);

      // 9. 枪：↓↓ + 重击 → 破军扫
      clear(); var t8 = frozen('slime', 2.0); S.equip(2);
      var p8 = castByTouch('dd', 'heavy');
      var n8 = S.hero.skill ? S.hero.skill.name : '-';
      step(70);
      L('touch spear dd-heavy=' + n8 + ' dmg=' + (t8.maxHp - t8.hp).toFixed(1) + ' (期望 破军扫 / 44) ' + p8);

      // 10. 枪：␣↓↓ + 重击 → 横扫千军
      clear(); var t9 = frozen('stone', 3.4);
      var p9 = castByTouch('kdd', 'heavy');
      var n9 = S.hero.skill ? S.hero.skill.name : '-';
      step(120);
      L('touch spear ULT=' + n9 + ' dmg=' + (t9.maxHp - t9.hp).toFixed(1) + ' (期望 横扫千军 / 140) ' + p9);

      // 11. 闪避键 → dodge 状态
      clear();
      S.tap('Dodge'); step(2);
      L('touch dodge-btn state=' + S.state() + ' (期望 dodge)');
      step(30);

      // 12. 格挡键按住 → guard，松开 → idle
      clear();
      S.press('Guard', true); step(2);
      var g1 = S.state();
      S.press('Guard', false); step(2);
      L('touch guard-btn hold=' + g1 + ' release=' + S.state() + ' (期望 guard / idle)');

      // 13. 换武器键
      clear(); S.equip(0);
      var w0 = S.hero.weapon;
      S.tap('Swap');
      L('touch swap-btn ' + w0 + '->' + S.hero.weapon + ' (期望 0->1)');

      // 14. 治疗键（无锚点时应仅提示，不报错）
      clear();
      S.tap('Heal'); step(2);
      L('touch heal-btn state=' + S.state() + ' hp=' + Math.round(S.hero.hp) + ' (期望 idle)');

      // 15. 无指令时轻击 = 普通攻击
      clear(); frozen('slime', 1.6); S.equip(0);
      S.tap('Light'); step(3);
      L('touch plain-light state=' + S.state() + ' (期望 light)');
    }

    /* ============ 截图模式 ============ */
    if (mode === 'sk') {
      // sk=weapon-cmd-progress
      var cmd = q.get('cmd') || 'uu';
      var btn = q.get('btn') || 'light';
      var w = parseInt(q.get('w') || '0', 10);
      clear();
      dummy(q.get('type') || 'slime', 2.1);
      S.equip(w);
      if (q.get('r')) S.hero.facing = parseFloat(q.get('r'));
      S.cast(cmd, btn);
      if (s) step(s);
      if (z) S.cam(9.4, z);
      var dur = S.hero.skill ? S.hero.skill.dur : 1;
      step(Math.round(f * dur * 60));
      L('sk w=' + w + ' cmd=' + cmd + ' btn=' + btn + ' name=' + (S.hero.skill ? S.hero.skill.name : '-') +
        ' t=' + S.hero.stateT.toFixed(2) + '/' + dur.toFixed(2) + ' check=' + S.check());
    }

    if (mode === 'hud') {
      clear();
      dummy('slime', 2.1);
      S.equip(0);
      // 注入指令但不触发：HUD 应显示序列与预匹配技能名
      S.inject(q.get('cmd') || 'uu');
      if (keep) S.cam(8.7, keep);
      step(2);
      L('hud cmd=' + (q.get('cmd') || 'uu') + ' check=' + S.check());
    }

    if (mode === 'ai') {
      S.clearField();
      for (var i = 0; i < 5; i++) {
        var a = (i / 5) * Math.PI * 2;
        S.spawn('slime', Math.cos(a) * 9, Math.sin(a) * 9, { hpMul: 1, dmgMul: 1, spdMul: 1 });
      }
      S.hero.pos.set(0, 0, 0);
      S.hero.hp = 100;
      var hpMin = 100;
      for (var fr = 0; fr < 600; fr++) {
        var best = null, bd = 1e9;
        for (var k = 0; k < S.enemies.length; k++) {
          var en = S.enemies[k];
          if (en.dead) continue;
          var d = Math.hypot(en.pos.x - S.hero.pos.x, en.pos.z - S.hero.pos.z);
          if (d < bd) { bd = d; best = en; }
        }
        if (best && bd > 1.3) {
          S.hero.pos.x += (best.pos.x - S.hero.pos.x) / bd * 0.06;
          S.hero.pos.z += (best.pos.z - S.hero.pos.z) / bd * 0.06;
        }
        S.step(1 / 60);
        if (S.hero.hp < hpMin) hpMin = S.hero.hp;
      }
      var st = {};
      for (var i2 = 0; i2 < S.enemies.length; i2++) {
        var e3 = S.enemies[i2];
        if (!e3.dead) st[e3.state] = (st[e3.state] || 0) + 1;
      }
      L('ai: states=' + JSON.stringify(st) + ' hpMin=' + Math.round(hpMin));
    }

    if (mode === 'audio') {
      /* ============ 背景音乐 + 语音自检 ============ */
      L('--- audio / music / voice self-check ---');
      var aok = S.audioOn();
      L('audioOn=' + aok + ' playing=' + S.musicPlaying() + ' mode=' + S.musicMode());
      for (var mi = 0; mi < 8; mi++) S.musicTick(1 / 60);
      L('scheduled=' + S.musicScheduled() + ' (>=1)');
      L('mode=' + S.musicMode() + ' (expect adventure)');
      L('muted=' + S.musicMuted() + ' (expect false)');

      // 接口切换 boss 主题
      S.setMusicMode('boss');
      L('setMusicMode(boss) -> mode=' + S.musicMode() + ' (expect boss)');
      S.setMusicMode('adventure');

      // 关卡配置：第 5 裂片出 boss、第 4 不出
      L('levelCfg(5).boss=' + S.levelCfg(5).boss + ' (expect 1)');
      L('levelCfg(4).boss=' + S.levelCfg(4).boss + ' (expect 0)');

      // 生成 boss -> 自动切激昂
      var b = S.spawn('boss', 0, 8);
      L('boss type=' + b.type + ' alive=' + (!b.dead));
      S.stepN(2, 1 / 60);
      L('bossActive=' + S.bossActive() + ' mode=' + S.musicMode() + ' (expect true/boss)');

      // boss 倒下 -> 切回冒险
      b.dead = true;
      S.stepN(2, 1 / 60);
      L('after boss dead mode=' + S.musicMode() + ' (expect adventure)');

      // 释放技能 -> 战吼计数 + 语音呼喊
      var sc0 = S.shoutCount(), vf0 = S.voxFired();
      S.cast('kdd', 'heavy');   // 万剑归宗（终极）
      S.stepN(3, 1 / 60);
      L('shoutCount=' + S.shoutCount() + ' (>' + sc0 + ')');
      L('voxFired=' + S.voxFired() + ' (>' + vf0 + ')');

      // 离线合成器：每个技能名都有拼音、且能无异常合成（不依赖系统 TTS）
      var keys = S.nameKeys(), missing = [], threw = [];
      for (var nk = 0; nk < keys.length; nk++) {
        var nm = keys[nk];
        if (!S.namePinyin(nm)) missing.push(nm);
        try { S.synthName(nm); } catch (ev) { threw.push(nm + ':' + ev.message); }
      }
      L('nameCount=' + keys.length + ' missing=' + missing.length + ' synthThrew=' + threw.length +
        (threw.length ? ' (' + threw.join(',') + ')' : ''));

      // 静音切换
      var mm = S.toggleMusic();
      L('toggleMusic -> muted=' + mm);
      S.setMusicMode('adventure');
      L('AUDIO-OK');
    }

    if (mode === 'boss') {
      /* ============ boss 外观截图 ============ */
      S.clearField();
      S.hero.pos.set(0, 0, 0); S.hero.facing = 0; S.hero.hp = 100;
      var bz = S.spawn('boss', 0, 7);
      bz.speed = 0; bz.aggro = 0; bz.state = 'idle'; bz.stateT = 0; bz.pos.set(0, 0, 7);
      S.cam(2.0, -6.5);
      for (var bi = 0; bi < 5; bi++) S.step(1 / 60);
      L('boss rendered type=' + bz.type + ' alive=' + (!bz.dead) + ' hp=' + bz.hp);
    }
  } catch (err) {
    lines.push('EXCEPTION ' + err.message);
  }

  try {
    L('check=' + (window.__SR ? S.check() : 'no-SR'));
  } catch (e3) { L('check=EXC ' + e3.message); }
  L('errors=' + (errs.length ? errs.join(' | ') : 'none'));
  out.textContent = lines.join('\n');
  out.style.display = 'block';
  if (q.get('post')) {
    try {
      var x = new XMLHttpRequest();
      x.open('POST', '/report', true);
      x.send(lines.join('\n'));
    } catch (e2) { }
  }
})();
