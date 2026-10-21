/* =========================================================
   碎境勇者 · SHATTERED REALM  —  可玩原型 (Prototype)
   低分辨率 3D 渲染 + 硬边体素角色 = 三维像素画风
   ========================================================= */
(function () {
  'use strict';

  /* ------------------------- 常量 ------------------------- */
  const SIZE = 46, HALF = SIZE / 2;
  const INNER_W = 384;
  const CAM_OFF = new THREE.Vector3(0, 8.7, 11.6);

  /* ------------------------- 关卡进度 ------------------------- */
  const REGION_NAMES = ['苔原裂片', '风蚀裂片', '黯晶裂片', '熔核裂片', '虚空裂片'];
  const ENEMY_LABEL = { slime: '苔原史莱姆', stone: '裂境守卫', archer: '裂境弩手', elite: '裂境统领', boss: '碎境魔将' };
  let level = 1;
  let score = 0;
  let levelKills = 0;
  let levelTime = 0;
  let totalKills = 0;
  let deaths = 0;
  let waveTotal = 0;
  let attackTokens = 2;   // 同时允许攻击的敌人上限（群体协同）
  let shots = [];         // 弩手弹道
  let orbs = [];          // 掉落物

  /* ------------------------- 缓动 ------------------------- */
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function seg(p, a, b) { return clamp01((p - a) / (b - a)); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIn(t) { return t * t * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  /* ------------------------- 渲染 ------------------------- */
  const stage = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1220);
  scene.fog = new THREE.Fog(0x0a1220, 15, 38);

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 220);

  function resize() {
    const w = window.innerWidth || 1, h = window.innerHeight || 1;
    const innerH = Math.max(200, Math.round(INNER_W * h / w));
    renderer.setSize(INNER_W, innerH, false);
    camera.aspect = INNER_W / innerH;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 150); });
  resize();

  /* ------------------------- 灯光 ------------------------- */
  scene.add(new THREE.HemisphereLight(0x8fb0e0, 0x161426, 0.5));
  const sun = new THREE.DirectionalLight(0xffcb92, 1.35);
  sun.position.set(16, 23, 13);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 1024;
  sun.shadow.mapSize.height = 1024;
  sun.shadow.camera.left = -27; sun.shadow.camera.right = 27;
  sun.shadow.camera.top = 27; sun.shadow.camera.bottom = -27;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0012;
  scene.add(sun, sun.target);

  /* ------------------------- 地形噪声 ------------------------- */
  function hash2(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi);
    const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function noise2(x, y) {
    return vnoise(x, y) * 0.66 + vnoise(x * 2.1, y * 2.1) * 0.34;
  }

  const heights = new Float32Array(SIZE * SIZE);
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const n = noise2(x * 0.11, z * 0.11);
      let h = Math.max(0, (n - 0.44) * 4.4);
      const dx = (x + 0.5 - HALF) / HALF, dz = (z + 0.5 - HALF) / HALF;
      const d = Math.sqrt(dx * dx + dz * dz);
      const flat = Math.min(1, Math.max(0, (d - 0.22) / 0.42));
      heights[z * SIZE + x] = Math.round(h * flat * 2) / 2;
    }
  }
  function groundH(x, z) {
    const tx = Math.floor(x + HALF), tz = Math.floor(z + HALF);
    if (tx < 0 || tz < 0 || tx >= SIZE || tz >= SIZE) return 0;
    return heights[tz * SIZE + tx];
  }

  /* ------------------------- 地表实例化 ------------------------- */
  const grassPal = [0x2f5745, 0x325b47, 0x39654a, 0x44704a];
  const dirtPal = [0x63543d, 0x6c5d44];
  const buckets = {};
  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const h = heights[z * SIZE + x];
      const patch = noise2(x * 0.09 + 31, z * 0.09 + 17);
      let key;
      if (patch > 0.63) key = dirtPal[hash2(x, z) > 0.5 ? 0 : 1];
      else key = grassPal[h < 0.5 ? (hash2(x, z) > 0.62 ? 1 : 0) : (h < 1.5 ? 2 : 3)];
      (buckets[key] = buckets[key] || []).push({ x: x - HALF + 0.5, z: z - HALF + 0.5, h: h });
    }
  }
  const tileGeo = new THREE.BoxGeometry(1.02, 1, 1.02);
  const dummy = new THREE.Object3D();
  Object.keys(buckets).forEach(function (key) {
    const list = buckets[key];
    const mat = new THREE.MeshLambertMaterial({ color: parseInt(key, 10) });
    const mesh = new THREE.InstancedMesh(tileGeo, mat, list.length);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    list.forEach(function (t, i) {
      const depth = t.h + 0.9;
      dummy.position.set(t.x, t.h - depth / 2, t.z);
      dummy.scale.set(1, depth, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  });

  /* ------------------------- 场景道具 ------------------------- */
  const colliders = [];
  const trunkGeo = new THREE.BoxGeometry(0.32, 1.3, 0.32);
  const leafGeoA = new THREE.BoxGeometry(1.55, 0.85, 1.55);
  const leafGeoB = new THREE.BoxGeometry(1.1, 0.75, 1.1);
  const leafGeoC = new THREE.BoxGeometry(0.68, 0.6, 0.68);
  const rockGeo = new THREE.BoxGeometry(1.15, 0.85, 0.95);
  const matTrunk = new THREE.MeshLambertMaterial({ color: 0x6a4a30 });
  const matLeafA = new THREE.MeshLambertMaterial({ color: 0x2c6b47 });
  const matLeafB = new THREE.MeshLambertMaterial({ color: 0x3a7d4f });
  const matRock = new THREE.MeshLambertMaterial({ color: 0x757f92 });

  function addTree(x, z) {
    const y = groundH(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = hash2(x, z) * 3.14;
    const t = new THREE.Mesh(trunkGeo, matTrunk); t.position.y = 0.65;
    const la = new THREE.Mesh(leafGeoA, matLeafA); la.position.y = 1.55;
    const lb = new THREE.Mesh(leafGeoB, matLeafB); lb.position.y = 2.1;
    const lc = new THREE.Mesh(leafGeoC, matLeafA); lc.position.y = 2.55;
    [t, la, lb, lc].forEach(function (m) { m.castShadow = true; m.receiveShadow = true; });
    g.add(t, la, lb, lc);
    scene.add(g);
    colliders.push({ x: x, z: z, r: 0.55 });
  }
  function addRock(x, z) {
    const y = groundH(x, z);
    const m = new THREE.Mesh(rockGeo, matRock);
    m.position.set(x, y + 0.32, z);
    m.rotation.y = hash2(x + 7, z + 3) * 3.14;
    m.scale.set(1, 0.7 + hash2(x, z) * 0.9, 1);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    colliders.push({ x: x, z: z, r: 0.7 });
  }

  for (let z = 3; z < SIZE - 3; z += 3) {
    for (let x = 3; x < SIZE - 3; x += 3) {
      const jx = x + Math.floor(hash2(x, z) * 3) - 1 - HALF + 0.5;
      const jz = z + Math.floor(hash2(z, x) * 3) - 1 - HALF + 0.5;
      const d = Math.hypot(jx, jz);
      if (d < 4.5) continue;
      const r = hash2(x * 3.1, z * 1.7);
      if (r > 0.62) addTree(jx, jz);
      else if (r > 0.45) addRock(jx, jz);
    }
  }

  // 碎晶簇：冷暖对比色点缀
  const crystalGeo = new THREE.BoxGeometry(0.22, 1, 0.22);
  const crystalMat = new THREE.MeshLambertMaterial({ color: 0x2a7f96, emissive: 0x37d9ff, emissiveIntensity: 0.75 });
  const crystalMat2 = new THREE.MeshLambertMaterial({ color: 0x6b3f8f, emissive: 0xa06bff, emissiveIntensity: 0.6 });
  for (let i = 0; i < 12; i++) {
    const a = hash2(i * 4.3, 2.1) * Math.PI * 2;
    const r = 8 + hash2(i, 8.7) * 12;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const g = new THREE.Group();
    g.position.set(cx, groundH(cx, cz), cz);
    g.rotation.y = hash2(cx, cz) * 3.14;
    const n = 2 + Math.floor(hash2(cz, cx) * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(crystalGeo, hash2(cx + k, cz) > 0.72 ? crystalMat2 : crystalMat);
      const ch = 0.5 + hash2(cx + k * 2, cz + k) * 0.8;
      m.scale.y = ch;
      m.position.set((hash2(k, cx) - 0.5) * 0.7, ch / 2, (hash2(k, cz) - 0.5) * 0.7);
      m.rotation.z = (hash2(k, 1) - 0.5) * 0.5;
      m.castShadow = true;
      g.add(m);
    }
    scene.add(g);
  }

  // 锚点（治疗石）
  const shrines = [];
  const shrineMat = new THREE.MeshLambertMaterial({ color: 0x2b6b7a, emissive: 0x39d6ff, emissiveIntensity: 0.55 });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x6ff0ff, transparent: true, opacity: 0.55 });
  [[-11, -8], [12, 6], [2, -15]].forEach(function (p) {
    const y = groundH(p[0], p[1]);
    const g = new THREE.Group();
    g.position.set(p[0], y, p[1]);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.3, 0.55), shrineMat);
    pillar.position.y = 1.15; pillar.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.9), shrineMat);
    cap.position.y = 2.38;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 5, 18), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.12;
    g.add(pillar, cap, ring);
    scene.add(g);
    shrines.push({ x: p[0], z: p[1], ring: ring, y: y });
    colliders.push({ x: p[0], z: p[1], r: 0.8 });
  });

  /* ------------------------- 粒子池 ------------------------- */
  const particleGeo = new THREE.BoxGeometry(1, 1, 1);
  const particles = [];
  for (let i = 0; i < 90; i++) {
    const m = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.visible = false;
    scene.add(m);
    particles.push({ mesh: m, life: 0, max: 1, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
  }
  let pCursor = 0;
  function spawnParticles(pos, count, color, power, size) {
    for (let i = 0; i < count; i++) {
      const p = particles[pCursor];
      pCursor = (pCursor + 1) % particles.length;
      p.mesh.position.copy(pos);
      p.mesh.material.color.setHex(color);
      const s = (size || 0.16) * (0.6 + Math.random() * 0.9);
      p.mesh.scale.set(s, s, s);
      p.mesh.visible = true;
      p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      p.vel.set((Math.random() - 0.5) * power, Math.random() * power * 0.9 + 1.2, (Math.random() - 0.5) * power);
      p.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      p.life = 0; p.max = 0.5 + Math.random() * 0.45;
    }
  }
  function updateParticles(dt) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.life >= p.max) { p.mesh.visible = false; continue; }
      p.life += dt;
      p.vel.y -= 16 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      const k = 1 - p.life / p.max;
      p.mesh.scale.setScalar(Math.max(0.001, p.mesh.scale.x * (0.94 + 0.06 * k)));
      if (p.life >= p.max) p.mesh.visible = false;
    }
  }

  /* ------------------------- 大招特效：冲击波环 / 剑阵 ------------------------- */
  const ringPool = [];
  const ringGeo = new THREE.RingGeometry(0.72, 1, 28);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffe0a0, transparent: true, opacity: 0, side: THREE.DoubleSide
    }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    scene.add(m);
    ringPool.push({ mesh: m, t: 0, dur: 1, maxR: 1, active: false });
  }
  function spawnRing(x, y, z, maxR, color, dur) {
    for (let i = 0; i < ringPool.length; i++) {
      const r = ringPool[i];
      if (r.active) continue;
      r.active = true; r.t = 0; r.dur = dur || 0.45; r.maxR = maxR;
      r.mesh.position.set(x, y + 0.07, z);
      r.mesh.material.color.setHex(color);
      r.mesh.material.opacity = 0.8;
      r.mesh.scale.set(0.4, 0.4, 1);
      r.mesh.visible = true;
      return;
    }
  }
  function updateRings(dt) {
    for (let i = 0; i < ringPool.length; i++) {
      const r = ringPool[i];
      if (!r.active) continue;
      r.t += dt;
      const p = r.t / r.dur;
      if (p >= 1) { r.active = false; r.mesh.visible = false; continue; }
      const s = 0.4 + (r.maxR - 0.4) * easeOut(p);
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = 0.8 * (1 - p);
    }
  }

  const bladePool = [];
  const bladeGeo = new THREE.BoxGeometry(0.09, 0.09, 1.7);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(bladeGeo, new THREE.MeshBasicMaterial({
      color: 0xbfe9ff, transparent: true, opacity: 0.95
    }));
    m.visible = false;
    scene.add(m);
    bladePool.push({ mesh: m, active: false, t: 0, dur: 0.8, ox: 0, oy: 0, oz: 0, ang: 0 });
  }
  function castBlades(x, y, z, count) {
    for (let i = 0; i < bladePool.length; i++) {
      const b = bladePool[i];
      if (i >= count) { b.active = false; b.mesh.visible = false; continue; }
      b.active = true; b.t = 0; b.dur = 0.8;
      b.ox = x; b.oy = y + 1.15; b.oz = z;
      b.ang = (i / count) * Math.PI * 2;
      b.mesh.visible = true;
      b.mesh.material.opacity = 1;
      b.mesh.position.set(x + Math.cos(b.ang) * 1.15, b.oy, z + Math.sin(b.ang) * 1.15);
      b.mesh.rotation.set(0, Math.atan2(Math.cos(b.ang), Math.sin(b.ang)), 0);
    }
  }
  function updateBlades(dt) {
    for (let i = 0; i < bladePool.length; i++) {
      const b = bladePool[i];
      if (!b.active) continue;
      b.t += dt;
      const p = b.t / b.dur;
      if (p >= 1) { b.active = false; b.mesh.visible = false; continue; }
      const dist = 1.15 + 5.6 * easeOut(p);
      b.mesh.position.set(b.ox + Math.cos(b.ang) * dist, b.oy + Math.sin(p * 6.2) * 0.12, b.oz + Math.sin(b.ang) * dist);
      b.mesh.rotation.z += dt * 14;
      b.mesh.material.opacity = 0.95 * (1 - p * p);
    }
  }

  /* ------------------------- 挥砍拖影 ------------------------- */
  // 沿武器方向铺一片短命高光，连续生成即可连成弧线，让快速挥击在低分辨率下也能看清轨迹
  const TRAIL_LEN = [1.55, 1.34, 2.45];
  const TRAIL_COLOR = [0xd8f2ff, 0xffd9a0, 0xd6fff0];
  const trailPool = [];
  const trailGeo = new THREE.BoxGeometry(0.08, 0.08, 1);
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({
      color: 0xd8f2ff, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    m.visible = false;
    scene.add(m);
    trailPool.push({ mesh: m, t: 0, max: 0.15, active: false });
  }
  const _tv = new THREE.Vector3(), _tq = new THREE.Quaternion();
  function spawnTrail(color) {
    for (let i = 0; i < trailPool.length; i++) {
      const s = trailPool[i];
      if (s.active) continue;
      const wm = weaponMeshes[hero.weapon];
      const L = TRAIL_LEN[hero.weapon];
      _tv.set(0, 0, L * 0.55);
      wm.localToWorld(_tv);
      wm.getWorldQuaternion(_tq);
      s.mesh.position.copy(_tv);
      s.mesh.quaternion.copy(_tq);
      s.mesh.scale.set(1, 1, L * 0.95);
      s.mesh.material.color.setHex(color);
      s.mesh.material.opacity = 0.34;
      s.mesh.visible = true;
      s.active = true; s.t = 0;
      return;
    }
  }
  function updateTrail(dt) {
    for (let i = 0; i < trailPool.length; i++) {
      const s = trailPool[i];
      if (!s.active) continue;
      s.t += dt;
      const k = 1 - s.t / s.max;
      if (k <= 0) { s.active = false; s.mesh.visible = false; continue; }
      s.mesh.material.opacity = 0.34 * k * k;
    }
  }

  /* ------------------------- 技能特效 ------------------------- */
  // 飞行剑气波：一面发光薄片沿朝向飞出，用于突进技与上挑技
  const wavePool = [];
  const waveGeo = new THREE.BoxGeometry(1.5, 0.9, 0.06);
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({
      color: 0xbfe9ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    m.visible = false;
    scene.add(m);
    wavePool.push({ mesh: m, active: false, t: 0, dur: 0.42, vx: 0, vz: 0, life: 0 });
  }
  function spawnWave(x, y, z, ang, color, spd, len, dur) {
    for (let i = 0; i < wavePool.length; i++) {
      const w = wavePool[i];
      if (w.active) continue;
      w.active = true; w.t = 0; w.dur = dur || 0.42;
      w.vx = Math.sin(ang) * (spd || 13); w.vz = Math.cos(ang) * (spd || 13);
      w.mesh.position.set(x, y, z);
      w.mesh.rotation.set(0, ang, 0);
      w.mesh.scale.set(len || 1, 1, 1);
      w.mesh.material.color.setHex(color);
      w.mesh.material.opacity = 0.9;
      w.mesh.visible = true;
      return;
    }
  }
  function updateWaves(dt) {
    for (let i = 0; i < wavePool.length; i++) {
      const w = wavePool[i];
      if (!w.active) continue;
      w.t += dt;
      const p = w.t / w.dur;
      if (p >= 1) { w.active = false; w.mesh.visible = false; continue; }
      w.mesh.position.x += w.vx * dt;
      w.mesh.position.z += w.vz * dt;
      w.mesh.material.opacity = 0.9 * (1 - p) * (1 - p);
      const s = (1 + p * 0.5);
      w.mesh.scale.x = w.mesh.scale.x;
      w.mesh.scale.y = s;
    }
  }

  // 推进冲击环：落地后沿固定方向推进的环，冲击波视觉主体
  const mringPool = [];
  const mringGeo = new THREE.PlaneGeometry(1, 1.6);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(mringGeo, new THREE.MeshBasicMaterial({
      color: 0xffc46b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    m.visible = false;
    scene.add(m);
    mringPool.push({ mesh: m, active: false, t: 0, dur: 0.6, vx: 0, vz: 0, maxR: 3 });
  }
  function spawnMovingRing(x, y, z, ang, maxR, color, spd, dur) {
    for (let i = 0; i < mringPool.length; i++) {
      const r = mringPool[i];
      if (r.active) continue;
      r.active = true; r.t = 0; r.dur = dur || 0.55; r.maxR = maxR;
      r.vx = Math.sin(ang) * (spd || 8); r.vz = Math.cos(ang) * (spd || 8);
      r.mesh.position.set(x, y + 0.09, z);
      r.mesh.rotation.set(-Math.PI / 2, 0, -ang);
      r.mesh.material.color.setHex(color);
      r.mesh.material.opacity = 0.85;
      r.mesh.scale.set(0.5, 0.5, 1);
      r.mesh.visible = true;
      return;
    }
  }
  function updateMovingRings(dt) {
    for (let i = 0; i < mringPool.length; i++) {
      const r = mringPool[i];
      if (!r.active) continue;
      r.t += dt;
      const p = r.t / r.dur;
      if (p >= 1) { r.active = false; r.mesh.visible = false; continue; }
      r.mesh.position.x += r.vx * dt;
      r.mesh.position.z += r.vz * dt;
      const s = 0.5 + (r.maxR - 0.5) * easeOut(p);
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = 0.85 * (1 - p);
    }
  }

  // 地裂列：一排裂痕石板沿地面推进，砸地类技能的地表痕迹
  const crackPool = [];
  const crackGeo = new THREE.BoxGeometry(1, 0.05, 0.5);
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(crackGeo, new THREE.MeshBasicMaterial({
      color: 0xff9a3c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    m.visible = false;
    scene.add(m);
    crackPool.push({ mesh: m, active: false, t: 0, dur: 0.5, ox: 0, oz: 0, ang: 0, off: 0 });
  }
  function spawnCrack(x, z, ang, count, color) {
    for (let i = 0; i < crackPool.length; i++) {
      const c = crackPool[i];
      if (i >= count) { c.active = false; c.mesh.visible = false; continue; }
      c.active = true; c.t = -i * 0.045; c.dur = 0.5;
      c.ox = x; c.oz = z; c.ang = ang; c.off = 0.8 + i * 1.15;
      c.mesh.rotation.set(0, ang, 0);
      c.mesh.material.color.setHex(color || 0xff9a3c);
      c.mesh.material.opacity = 0.9;
      c.mesh.scale.set(0.1, 1, 1);
      c.mesh.visible = true;
    }
  }
  function updateCracks(dt) {
    for (let i = 0; i < crackPool.length; i++) {
      const c = crackPool[i];
      if (!c.active) continue;
      c.t += dt;
      if (c.t < 0) continue;
      const p = c.t / c.dur;
      if (p >= 1) { c.active = false; c.mesh.visible = false; continue; }
      c.mesh.position.set(c.ox + Math.sin(c.ang) * c.off, 0, c.oz + Math.cos(c.ang) * c.off);
      const s = 0.1 + 1.0 * easeOut(Math.min(1, p * 3));
      c.mesh.scale.set(s, 1, 1);
      c.mesh.material.opacity = 0.9 * (1 - p);
    }
  }

  // 风压残影柱：原地旋身类技能绕身的吸扯流
  const gustPool = [];
  const gustGeo = new THREE.BoxGeometry(0.14, 1.5, 0.14);
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(gustGeo, new THREE.MeshBasicMaterial({
      color: 0xbfe9ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    m.visible = false;
    scene.add(m);
    gustPool.push({ mesh: m, active: false, t: 0, dur: 0.6, a: 0, r: 0, h: 0 });
  }
  function spawnGust(x, y, z, color) {
    for (let i = 0; i < gustPool.length; i++) {
      const g = gustPool[i];
      if (g.active) continue;
      g.active = true; g.t = 0; g.dur = 0.55;
      g.a = Math.random() * Math.PI * 2; g.r = 1.1 + Math.random() * 1.6; g.h = 0.3 + Math.random() * 1.4;
      g.px = x; g.py0 = y; g.pz = z;
      g.mesh.material.color.setHex(color || 0xbfe9ff);
      g.mesh.material.opacity = 0.7;
      g.mesh.position.set(x, y + g.h, z);
      g.mesh.visible = true;
      return;
    }
  }
  function updateGusts(dt) {
    for (let i = 0; i < gustPool.length; i++) {
      const g = gustPool[i];
      if (!g.active) continue;
      g.t += dt;
      const p = g.t / g.dur;
      if (p >= 1) { g.active = false; g.mesh.visible = false; continue; }
      g.a += dt * 15;
      g.r -= dt * 2.6;
      g.h += dt * 2.2;
      g.mesh.position.set(g.px + Math.cos(g.a) * g.r, g.py0 + g.h, g.pz + Math.sin(g.a) * g.r);
      g.mesh.material.opacity = 0.7 * (1 - p);
    }
  }

  /* ------------------------- 弹道（弩手） ------------------------- */
  const shotGeo = new THREE.BoxGeometry(0.16, 0.16, 0.52);
  function spawnShot(x, y, z, dx, dz, dmg) {
    const m = new THREE.Mesh(shotGeo, new THREE.MeshBasicMaterial({ color: 0xffb45e }));
    m.position.set(x, y, z);
    m.lookAt(x + dx, y, z + dz);
    scene.add(m);
    shots.push({ mesh: m, vx: dx * 9.5, vz: dz * 9.5, dmg: dmg, life: 3 });
  }
  function updateShots(dt) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life -= dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.z += s.vz * dt;
      s.mesh.rotation.x += dt * 9;
      const dx = hero.pos.x - s.mesh.position.x, dz = hero.pos.z - s.mesh.position.z;
      const hit = !hero.dead && Math.hypot(dx, dz) < 0.6 &&
        Math.abs((hero.pos.y + 0.9) - s.mesh.position.y) < 1.25;
      if (hit || s.life <= 0) {
        if (hit) {
          damageHero(s.dmg, s.mesh.position);
          spawnParticles(new THREE.Vector3(s.mesh.position.x, s.mesh.position.y, s.mesh.position.z), 6, 0xffb45e, 3, 0.12);
        }
        scene.remove(s.mesh);
        s.mesh.material.dispose();
        shots.splice(i, 1);
      }
    }
  }

  /* ------------------------- 掉落物 ------------------------- */
  const orbGeo = new THREE.BoxGeometry(0.26, 0.26, 0.26);
  function spawnOrb(x, y, z, kind) {
    const m = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({
      color: kind === 'stam' ? 0x8fd8ff : 0x7dffb2
    }));
    m.position.set(x, y + 0.55, z);
    scene.add(m);
    orbs.push({ mesh: m, t: Math.random() * 6, life: 15, kind: kind || 'heal' });
  }
  function updateOrbs(dt) {
    for (let i = orbs.length - 1; i >= 0; i--) {
      const o = orbs[i];
      o.t += dt; o.life -= dt;
      o.mesh.rotation.y += dt * 3.2;
      o.mesh.position.y += Math.sin(o.t * 4) * dt * 0.5;
      const d = Math.hypot(hero.pos.x - o.mesh.position.x, hero.pos.z - o.mesh.position.z);
      if (d < 1.15 && !hero.dead) {
        if (o.kind === 'stam') {
          hero.st = Math.min(hero.maxSt, hero.st + 40);
          hero.stDelay = 0.1;
          toast('拾取真气 · 体力 +40', 1.1);
        } else if (hero.hp < hero.maxHp) {
          hero.hp = Math.min(hero.maxHp, hero.hp + 24);
          toast('拾取露珠 · 生命 +24', 1.1);
        } else {
          hero.st = Math.min(hero.maxSt, hero.st + 20);
          hero.stDelay = 0.1;
          toast('露珠化为真气 · 体力 +20', 1.1);
        }
        sfx('heal');
        spawnParticles(o.mesh.position, 8, o.kind === 'stam' ? 0x8fd8ff : 0x7dffb2, 2.5, 0.1);
        scene.remove(o.mesh); o.mesh.material.dispose();
        orbs.splice(i, 1);
        continue;
      }
      if (o.life <= 0) { scene.remove(o.mesh); o.mesh.material.dispose(); orbs.splice(i, 1); }
    }
  }

  /* ------------------------- 勇者 ------------------------- */
  const heroGroup = new THREE.Group();
  const mats = {};
  function mat(c) {
    if (!mats[c]) mats[c] = new THREE.MeshLambertMaterial({ color: c });
    return mats[c];
  }
  function box(w, h, d, c) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // 腿：以髋关节为枢轴，摆动才不像整块方块在晃
  function makeLeg(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.13, 0.52, 0);
    const thigh = box(0.2, 0.34, 0.22, 0x2a3350); thigh.position.y = -0.17;
    const boot = box(0.22, 0.2, 0.28, 0x1d2338); boot.position.set(0, -0.42, 0.03);
    g.add(thigh, boot);
    return g;
  }
  const legL = makeLeg(-1), legR = makeLeg(1);

  // 上半身：以腰为枢轴的独立组，可做扭腰（rotation.y）与俯身（rotation.x）
  const HIP_Y = 0.52;
  const upperBody = new THREE.Group();
  upperBody.position.y = HIP_Y;
  upperBody.rotation.order = 'YXZ';

  const torso = box(0.58, 0.55, 0.36, 0x3c5aa0); torso.position.y = 0.28;
  const belt = box(0.62, 0.14, 0.4, 0xd9b96a); belt.position.y = 0.03;
  const chest = box(0.44, 0.16, 0.4, 0xe4cf8e); chest.position.set(0, 0.4, 0.02);
  const head = box(0.46, 0.42, 0.44, 0xeec49b); head.position.y = 0.74;
  const helm = box(0.5, 0.16, 0.48, 0xbfcbdd); helm.position.y = 0.96;
  const plume = box(0.1, 0.26, 0.34, 0xd94f5c); plume.position.set(0, 1.08, -0.08);
  const cape = box(0.5, 0.66, 0.08, 0x8d2f47); cape.position.set(0, 0.36, -0.24);
  upperBody.add(torso, belt, chest, head, helm, plume, cape);

  heroGroup.add(legL, legR, upperBody);

  function makeArm(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.37, 0.45, 0);
    g.rotation.order = 'YXZ';
    const upper = box(0.16, 0.42, 0.18, 0x3c5aa0); upper.position.y = -0.2;
    const hand = box(0.17, 0.13, 0.17, 0xeec49b); hand.position.y = -0.43;
    g.add(upper, hand);
    return g;
  }
  const ARM_BASE = new THREE.Vector3(0.37, 0.45, 0);
  const armL = makeArm(-1), armR = makeArm(1);
  upperBody.add(armL, armR);

  // 三种武器形态（沿 +Z 朝向）
  function mkSword() {
    const g = new THREE.Group();
    const guard = box(0.42, 0.1, 0.12, 0xd9b96a); guard.position.z = 0.14;
    const blade = box(0.1, 0.13, 1.25, 0xbfe3ff); blade.position.z = 0.82;
    const tip = box(0.08, 0.1, 0.16, 0xeaf6ff); tip.position.z = 1.5;
    g.add(guard, blade, tip);
    return g;
  }
  function mkAxe() {
    const g = new THREE.Group();
    const shaft = box(0.09, 0.09, 1.0, 0x6a4a30); shaft.position.z = 0.5;
    const headA = box(0.16, 0.5, 0.5, 0xc9ced9); headA.position.set(0, 0.12, 0.95);
    const headB = box(0.16, 0.42, 0.42, 0x9aa3b5); headB.position.set(0, 0.12, 1.28);
    g.add(shaft, headA, headB);
    return g;
  }
  function mkSpear() {
    const g = new THREE.Group();
    const shaft = box(0.07, 0.07, 2.0, 0x7d5c3a); shaft.position.z = 1.0;
    const tipA = box(0.15, 0.15, 0.42, 0x9effc9); tipA.position.z = 2.15;
    const tipB = box(0.07, 0.07, 0.2, 0xdbffe9); tipB.position.z = 2.4;
    g.add(shaft, tipA, tipB);
    return g;
  }
  const weaponMeshes = [mkSword(), mkAxe(), mkSpear()];
  weaponMeshes.forEach(function (w, i) { w.visible = i === 0; w.position.set(0, -0.44, 0.06); armR.add(w); });

  scene.add(heroGroup);
  heroGroup.rotation.order = 'YXZ';
  heroGroup.scale.setScalar(1.18);
  const HERO_SCALE = 1.18;

  /* ------------------------- 武器数据 ------------------------- */
  // lunge：攻击时前冲的位移区间（相对动作时长）与距离
  // hitAt：命中判定发生的动作进度（0~1），与动画关键帧对齐
  const WEAPONS = [
    {
      name: '裂空剑', cost: 11, time: 0.36, range: 2.05, arc: Math.PI * 0.46,
      dmg: [9, 9, 17], breakMul: 0.55, hitAt: 0.42,
      lungeLight: { a: 0.30, b: 0.62, dist: 0.55 },
      heavy: { dmg: 26, brk: 26, time: 0.64, cost: 20, hitAt: 0.46, lunge: { a: 0.34, b: 0.62, dist: 1.05 } },
      ult: {
        name: '万剑归宗', kind: 'rain', dur: 1.85, radius: 6.6,
        dmg: 58, brk: 55, hitAt: 0.52, kb: 0.75
      }
    },
    {
      name: '碎岩斧', cost: 16, time: 0.52, range: 1.85, arc: Math.PI * 0.56,
      dmg: [14, 14, 24], breakMul: 1.0, hitAt: 0.46,
      lungeLight: { a: 0.38, b: 0.66, dist: 0.32 },
      heavy: { dmg: 38, brk: 42, time: 0.86, cost: 26, hitAt: 0.54, lunge: { a: 0.44, b: 0.60, dist: 0.55 } },
      ult: {
        name: '崩岩重砸', kind: 'leap', dur: 1.72, radius: 4.8,
        dmg: 82, brk: 78, hitAt: 0.64, kb: 1.0
      }
    },
    {
      name: '逐风枪', cost: 9, time: 0.30, range: 2.95, arc: Math.PI * 0.22,
      dmg: [8, 8, 13], breakMul: 0.35, hitAt: 0.30,
      lungeLight: { a: 0.22, b: 0.46, dist: 0.95 },
      heavy: { dmg: 22, brk: 18, time: 0.68, cost: 18, hitAt: 0.44, lunge: { a: 0.42, b: 0.58, dist: 1.75 } },
      ult: {
        name: '横扫千军', kind: 'spin', dur: 1.62, radius: 5.0,
        dmg: 26, brk: 22, hitAt: 0, kb: 0.06, ticks: [0.20, 0.36, 0.52, 0.68, 0.84]
      }
    }
  ];

  /* ------------------------- 指令技 ------------------------- */
  // 指令编码：u=↑(W) d=↓(S) l=←(A) r=→(D)，k=空格；攻击键决定轻/重分支
  // kind：combo 多段前冲 / spin 原地旋身 / upper 上挑砸地 / rush 突进贯穿 /
  //       slam 跳劈 / back 后撤反刺 / sweep 大范围横扫 / rain·leap·spinU 终极
  // hits.at 为动作进度(0~1)；moves 为位移段；cost 为体力
  const SKILLS = [
    /* ---- 裂空剑：灵动多段，剑气贯穿 ---- */
    [
      { name: '破空三连斩', cmd: 'uu', btn: 'light', kind: 'combo', pose: 'combo', dur: 0.92, cost: 12,
        moves: [{ a: 0.10, b: 0.86, dist: 4.0 }],
        hits: [
          { at: 0.26, range: 2.8, arc: 1.15, dmg: 12, brk: 12, kb: 0.25 },
          { at: 0.54, range: 2.8, arc: 1.15, dmg: 12, brk: 12, kb: 0.25 },
          { at: 0.86, range: 3.1, arc: 1.3, dmg: 19, brk: 18, kb: 0.5 }
        ] },
      { name: '回燕斩', cmd: 'ud', btn: 'light', kind: 'spin', pose: 'spin', dur: 0.88, cost: 14,
        spin: { from: 0.14, to: 0.86, turns: 2 },
        hits: [
          { at: 0.30, range: 3.0, arc: 6.28, dmg: 15, brk: 16, kb: 0.3 },
          { at: 0.72, range: 3.0, arc: 6.28, dmg: 15, brk: 16, kb: 0.3 }
        ] },
      { name: '升龙剑', cmd: 'du', btn: 'light', kind: 'upper', pose: 'upper', dur: 0.72, cost: 12,
        hits: [{ at: 0.42, range: 2.7, arc: 1.9, dmg: 20, brk: 22, kb: 1.4, vfx: 'wave' }] },
      { name: '惊雷刺', cmd: 'uu', btn: 'heavy', kind: 'rush', pose: 'rush', dur: 0.86, cost: 24,
        moves: [{ a: 0.14, b: 0.58, dist: 5.4 }],
        hits: [{ at: 0.40, range: 3.6, arc: 0.55, dmg: 34, brk: 30, kb: 0.9, vfx: 'wave' }] },
      { name: '劈山剑', cmd: 'dd', btn: 'heavy', kind: 'slam', pose: 'slam', dur: 1.06, cost: 26,
        hits: [{ at: 0.62, range: 3.7, arc: 3.14, dmg: 40, brk: 38, kb: 1.2, vfx: 'crack' }] },
      { name: '瞬影斩', cmd: 'ku', btn: 'light', kind: 'rush', pose: 'rush', dur: 0.6, cost: 10,
        moves: [{ a: 0.10, b: 0.5, dist: 2.6 }],
        hits: [{ at: 0.36, range: 2.9, arc: 0.8, dmg: 16, brk: 14, kb: 0.3, vfx: 'wave' }] },
      { name: '十字燕返', cmd: 'lr', btn: 'light', kind: 'combo', pose: 'side', dur: 0.92, cost: 12,
        moves: [{ a: 0.10, b: 0.86, dist: 3.2 }],
        hits: [
          { at: 0.32, range: 2.9, arc: 2.0, dmg: 13, brk: 12, kb: 0.3 },
          { at: 0.74, range: 3.0, arc: 2.2, dmg: 17, brk: 16, kb: 0.45 }
        ] },
      { name: '回风斩', cmd: 'rl', btn: 'light', kind: 'back', pose: 'back', dur: 0.84, cost: 12,
        moves: [{ a: 0.08, b: 0.40, dist: -1.8 }, { a: 0.48, b: 0.66, dist: 3.0 }],
        hits: [{ at: 0.60, range: 2.9, arc: 2.4, dmg: 20, brk: 18, kb: 0.4, vfx: 'wave' }] },
      { name: '断流横断', cmd: 'll', btn: 'heavy', kind: 'sweep', pose: 'side', dur: 1.02, cost: 24,
        hits: [
          { at: 0.36, range: 3.4, arc: 4.6, dmg: 22, brk: 22, kb: 0.35 },
          { at: 0.78, range: 3.6, arc: 4.8, dmg: 22, brk: 22, kb: 0.45 }
        ] },
      { name: '万剑归宗', cmd: 'kdd', btn: 'heavy', kind: 'rain', dur: 1.85, cost: 35, ult: true,
        hits: [{ at: 0.52, range: 6.8, arc: 6.28, dmg: 60, brk: 55, kb: 0.75 }] }
    ],
    /* ---- 碎岩斧：沉重威猛，震荡范围 ---- */
    [
      { name: '狂蛮冲撞', cmd: 'uu', btn: 'light', kind: 'combo', pose: 'combo', dur: 0.98, cost: 16,
        moves: [{ a: 0.12, b: 0.9, dist: 3.6 }],
        hits: [
          { at: 0.30, range: 2.5, arc: 1.45, dmg: 16, brk: 16, kb: 0.3 },
          { at: 0.66, range: 2.6, arc: 1.45, dmg: 22, brk: 22, kb: 0.55 }
        ] },
      { name: '旋风斧舞', cmd: 'ud', btn: 'light', kind: 'spin', pose: 'spin', dur: 0.94, cost: 18,
        spin: { from: 0.12, to: 0.88, turns: 2 },
        hits: [
          { at: 0.28, range: 3.1, arc: 6.28, dmg: 20, brk: 20, kb: 0.35 },
          { at: 0.70, range: 3.1, arc: 6.28, dmg: 20, brk: 20, kb: 0.35 }
        ] },
      { name: '裂地波', cmd: 'du', btn: 'light', kind: 'upper', pose: 'upper', dur: 0.78, cost: 14,
        hits: [{ at: 0.46, range: 3.3, arc: 2.4, dmg: 22, brk: 24, kb: 0.7, vfx: 'mring' }] },
      { name: '崩山冲锋', cmd: 'uu', btn: 'heavy', kind: 'rush', pose: 'rush', dur: 1.08, cost: 28,
        moves: [{ a: 0.14, b: 0.72, dist: 6.4 }],
        hits: [
          { at: 0.32, range: 2.9, arc: 1.3, dmg: 24, brk: 24, kb: 0.5 },
          { at: 0.68, range: 2.9, arc: 1.3, dmg: 24, brk: 24, kb: 0.7 }
        ] },
      { name: '天崩地裂', cmd: 'dd', btn: 'heavy', kind: 'slam', pose: 'slam', dur: 1.16, cost: 30,
        hits: [{ at: 0.62, range: 4.2, arc: 6.28, dmg: 46, brk: 44, kb: 1.4, vfx: 'crack' }] },
      { name: '瞬影砸', cmd: 'ku', btn: 'light', kind: 'slam', pose: 'slam', dur: 0.74, cost: 12,
        moves: [{ a: 0.10, b: 0.5, dist: 2.2 }],
        hits: [{ at: 0.6, range: 3.0, arc: 3.14, dmg: 20, brk: 20, kb: 0.6, vfx: 'crack' }] },
      { name: '横断双挥', cmd: 'lr', btn: 'light', kind: 'combo', pose: 'side', dur: 0.98, cost: 16,
        moves: [{ a: 0.12, b: 0.90, dist: 2.8 }],
        hits: [
          { at: 0.34, range: 2.7, arc: 2.2, dmg: 17, brk: 17, kb: 0.35 },
          { at: 0.70, range: 2.8, arc: 2.4, dmg: 23, brk: 23, kb: 0.6 }
        ] },
      { name: '拖斧反斩', cmd: 'rl', btn: 'light', kind: 'back', pose: 'back', dur: 0.92, cost: 16,
        moves: [{ a: 0.10, b: 0.44, dist: -2.0 }, { a: 0.52, b: 0.70, dist: 3.2 }],
        hits: [{ at: 0.64, range: 3.1, arc: 2.6, dmg: 26, brk: 26, kb: 0.6, vfx: 'wave' }] },
      { name: '横断山岳', cmd: 'll', btn: 'heavy', kind: 'sweep', pose: 'side', dur: 1.14, cost: 28,
        hits: [
          { at: 0.38, range: 3.8, arc: 5.2, dmg: 23, brk: 24, kb: 0.4 },
          { at: 0.80, range: 3.9, arc: 5.4, dmg: 23, brk: 24, kb: 0.55 }
        ] },
      { name: '陨石天降', cmd: 'kdd', btn: 'heavy', kind: 'leap', dur: 1.75, cost: 35, ult: true,
        hits: [{ at: 0.64, range: 5.2, arc: 6.28, dmg: 88, brk: 80, kb: 1.0 }] }
    ],
    /* ---- 逐风枪：极速穿透，距离压制 ---- */
    [
      { name: '疾风三刺', cmd: 'uu', btn: 'light', kind: 'combo', pose: 'combo', dur: 0.88, cost: 10,
        moves: [{ a: 0.10, b: 0.84, dist: 4.6 }],
        hits: [
          { at: 0.26, range: 3.4, arc: 0.5, dmg: 10, brk: 9, kb: 0.2 },
          { at: 0.54, range: 3.4, arc: 0.5, dmg: 10, brk: 9, kb: 0.2 },
          { at: 0.84, range: 3.6, arc: 0.55, dmg: 15, brk: 14, kb: 0.45 }
        ] },
      { name: '回马枪', cmd: 'ud', btn: 'light', kind: 'back', pose: 'back', dur: 0.82, cost: 12,
        moves: [{ a: 0.10, b: 0.42, dist: -1.8 }, { a: 0.46, b: 0.64, dist: 3.0 }],
        hits: [{ at: 0.56, range: 3.7, arc: 0.55, dmg: 22, brk: 16, kb: 0.4, vfx: 'wave' }] },
      { name: '出海蛟龙', cmd: 'du', btn: 'light', kind: 'upper', pose: 'upper', dur: 0.74, cost: 12,
        hits: [{ at: 0.44, range: 2.9, arc: 1.3, dmg: 18, brk: 20, kb: 0.8, vfx: 'wave' }] },
      { name: '惊雷贯穿', cmd: 'uu', btn: 'heavy', kind: 'rush', pose: 'rush', dur: 0.82, cost: 22,
        moves: [{ a: 0.12, b: 0.56, dist: 8.0 }],
        hits: [{ at: 0.36, range: 4.0, arc: 0.42, dmg: 30, brk: 26, kb: 0.8, vfx: 'wave' }] },
      { name: '破军扫', cmd: 'dd', btn: 'heavy', kind: 'sweep', pose: 'sweep', dur: 0.98, cost: 24,
        hits: [
          { at: 0.34, range: 3.9, arc: 6.28, dmg: 22, brk: 20, kb: 0.3 },
          { at: 0.76, range: 3.9, arc: 6.28, dmg: 22, brk: 20, kb: 0.4 }
        ] },
      { name: '瞬影刺', cmd: 'ku', btn: 'light', kind: 'rush', pose: 'rush', dur: 0.58, cost: 10,
        moves: [{ a: 0.10, b: 0.5, dist: 3.0 }],
        hits: [{ at: 0.34, range: 3.3, arc: 0.55, dmg: 14, brk: 12, kb: 0.25, vfx: 'wave' }] },
      { name: '双横抹月', cmd: 'lr', btn: 'light', kind: 'combo', pose: 'side', dur: 0.88, cost: 10,
        moves: [{ a: 0.10, b: 0.84, dist: 3.0 }],
        hits: [
          { at: 0.32, range: 3.2, arc: 1.8, dmg: 11, brk: 10, kb: 0.25 },
          { at: 0.72, range: 3.3, arc: 2.0, dmg: 15, brk: 14, kb: 0.45 }
        ] },
      { name: '侧返枪', cmd: 'rl', btn: 'light', kind: 'back', pose: 'back', dur: 0.82, cost: 12,
        moves: [{ a: 0.08, b: 0.42, dist: -2.2 }, { a: 0.48, b: 0.64, dist: 3.4 }],
        hits: [{ at: 0.58, range: 3.5, arc: 2.0, dmg: 22, brk: 16, kb: 0.4, vfx: 'wave' }] },
      { name: '横断江', cmd: 'll', btn: 'heavy', kind: 'sweep', pose: 'side', dur: 0.98, cost: 24,
        hits: [
          { at: 0.36, range: 3.7, arc: 4.8, dmg: 22, brk: 20, kb: 0.3 },
          { at: 0.78, range: 3.8, arc: 5.0, dmg: 22, brk: 20, kb: 0.45 }
        ] },
      { name: '横扫千军', cmd: 'kdd', btn: 'heavy', kind: 'spinU', dur: 1.65, cost: 35, ult: true,
        hits: [
          { at: 0.20, range: 5.2, arc: 6.28, dmg: 28, brk: 24, kb: 0.06 },
          { at: 0.36, range: 5.2, arc: 6.28, dmg: 28, brk: 24, kb: 0.06 },
          { at: 0.52, range: 5.2, arc: 6.28, dmg: 28, brk: 24, kb: 0.06 },
          { at: 0.68, range: 5.2, arc: 6.28, dmg: 28, brk: 24, kb: 0.06 },
          { at: 0.84, range: 5.2, arc: 6.28, dmg: 28, brk: 24, kb: 0.06 }
        ] }
    ]
  ];

  /* ------------------------- 动作关键帧 ------------------------- */
  // 关节字段（全部以弧度计，0 为默认站姿）
  //   arx/ary/arz 右臂俯仰/偏摆/横滚     alx/aly/alz 左臂
  //   bx/by       上身俯仰/扭腰          rx/rz       整体前倾/侧倾
  //   pz/py       右臂前后/上下位移      wz          武器前后位移（枪的戳刺）
  //   hy          离地高度（跳跃）
  const RIG_FIELDS = ['arx', 'ary', 'arz', 'alx', 'aly', 'alz', 'bx', 'by', 'rx', 'rz', 'pz', 'py', 'wz', 'hy'];

  // 关键帧做「继承填充」：没写的字段沿上一帧，保证插值时不会跳回 0
  function bakePose(keys) {
    const out = [];
    const prev = { ary: 0.15 };
    RIG_FIELDS.forEach(function (f) { if (prev[f] === undefined) prev[f] = 0; });
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], o = { t: k.t };
      for (let j = 0; j < RIG_FIELDS.length; j++) {
        const f = RIG_FIELDS[j];
        o[f] = k[f] === undefined ? prev[f] : k[f];
      }
      out.push(o);
      for (let j = 0; j < RIG_FIELDS.length; j++) prev[RIG_FIELDS[j]] = o[RIG_FIELDS[j]];
    }
    return out;
  }

  function samplePose(keys, p, dir) {
    const last = keys[keys.length - 1];
    let a = keys[0], b = keys[0];
    if (p >= last.t) { a = b = last; }
    else if (p > keys[0].t) {
      for (let i = 1; i < keys.length; i++) {
        if (p <= keys[i].t) { a = keys[i - 1]; b = keys[i]; break; }
      }
    }
    const u = smooth(clamp01((p - a.t) / Math.max(0.0001, b.t - a.t)));
    const o = {};
    for (let i = 0; i < RIG_FIELDS.length; i++) {
      const f = RIG_FIELDS[i];
      o[f] = a[f] + (b[f] - a[f]) * u;
    }
    if (dir === -1) { o.ary = -o.ary; o.by = -o.by; o.aly = -o.aly; o.rz = -o.rz; }
    return o;
  }

  /* —— 剑：左右横扫 —— */
  const P_SWORD_SWEEP = bakePose([
    { t: 0.00, ary: 0.15, arx: -0.12 },
    { t: 0.16, ary: 1.60, arx: -0.30, by: -0.56, rx: -0.04 },
    { t: 0.29, ary: 1.84, arx: -0.34, by: -0.66, rx: -0.05 },
    { t: 0.42, ary: -1.16, arx: 0.02, by: 0.50, rx: 0.10 },
    { t: 0.58, ary: -1.54, arx: 0.08, by: 0.60, rx: 0.06 },
    { t: 1.00, ary: 0.15, arx: -0.12, by: 0, rx: 0 }
  ]);
  // 第三段：上撩后斜劈
  const P_SWORD_FIN = bakePose([
    { t: 0.00, ary: 0.15, arx: -0.12 },
    { t: 0.18, ary: 0.95, arx: -1.70, by: -0.34, rx: -0.10, py: 0.05 },
    { t: 0.31, ary: 1.08, arx: -2.00, by: -0.40, rx: -0.14, py: 0.07 },
    { t: 0.44, ary: -0.62, arx: 0.72, by: 0.42, rx: 0.22, py: -0.04, pz: 0.30 },
    { t: 0.60, ary: -0.82, arx: 0.88, by: 0.48, rx: 0.14, pz: 0.20 },
    { t: 1.00, ary: 0.15, arx: -0.12, by: 0, rx: 0, pz: 0 }
  ]);
  const P_SWORD_HEAVY = bakePose([
    { t: 0.00, ary: 0.15, arx: -0.12 },
    { t: 0.26, ary: 1.92, arx: -0.42, by: -0.72, rx: -0.10, pz: -0.16 },
    { t: 0.38, ary: 2.10, arx: -0.56, by: -0.84, rx: -0.14, pz: -0.22 },
    { t: 0.46, ary: -1.44, arx: 0.06, by: 0.62, rx: 0.18, pz: 0.26 },
    { t: 0.62, ary: -1.78, arx: 0.12, by: 0.74, rx: 0.10, pz: 0.16 },
    { t: 1.00, ary: 0.15, arx: -0.12, by: 0, rx: 0, pz: 0 }
  ]);
  const P_SWORD_ULT = bakePose([
    { t: 0.00, ary: 0.15, arx: -0.12 },
    { t: 0.20, arx: -0.55, ary: 0.10, bx: -0.08, rx: -0.06, py: -0.10 },
    { t: 0.34, arx: -2.85, ary: 0.00, bx: -0.24, rx: -0.14, py: 0.10 },
    { t: 0.52, arx: -2.98, ary: 0.00, bx: -0.28, rx: -0.16, py: 0.12 },
    { t: 0.64, arx: 0.86, ary: 0.00, bx: 0.36, rx: 0.20, py: -0.06 },
    { t: 0.78, arx: 0.92, bx: 0.30, rx: 0.12 },
    { t: 1.00, arx: -0.12, ary: 0.15, bx: 0, rx: 0, py: 0 }
  ]);

  /* —— 斧：上下劈砍 —— */
  const P_AXE_CHOP = bakePose([
    { t: 0.00, ary: 0.10, arx: -0.20 },
    { t: 0.24, ary: 0.06, arx: -2.20, bx: -0.24, alx: -2.00, rx: -0.06 },
    { t: 0.38, arx: -2.44, bx: -0.30, alx: -2.24, rx: -0.10 },
    { t: 0.46, arx: 0.46, bx: 0.40, alx: -0.30, rx: 0.18, pz: 0.10 },
    { t: 0.62, arx: 0.56, bx: 0.46, alx: -0.12, rx: 0.10, pz: 0.06 },
    { t: 1.00, ary: 0.10, arx: -0.12, bx: 0, alx: 0, rx: 0, pz: 0 }
  ]);
  // 第三段：斜向压劈
  const P_AXE_FIN = bakePose([
    { t: 0.00, ary: 0.10, arx: -0.20 },
    { t: 0.22, ary: -0.45, arx: -2.30, bx: -0.26, by: -0.22, alx: -2.10, rx: -0.08 },
    { t: 0.36, ary: -0.60, arx: -2.52, bx: -0.32, by: -0.28, alx: -2.30, rx: -0.12 },
    { t: 0.46, ary: 0.30, arx: 0.54, bx: 0.46, by: 0.26, alx: -0.26, rx: 0.22, pz: 0.16 },
    { t: 0.64, ary: 0.36, arx: 0.64, bx: 0.40, by: 0.18, rx: 0.12, pz: 0.10 },
    { t: 1.00, ary: 0.10, arx: -0.12, bx: 0, by: 0, alx: 0, rx: 0, pz: 0 }
  ]);
  const P_AXE_HEAVY = bakePose([
    { t: 0.00, ary: 0.10, arx: -0.20 },
    { t: 0.30, arx: -2.50, bx: -0.34, alx: -2.20, rx: -0.12, py: 0.06 },
    { t: 0.44, arx: -2.66, bx: -0.40, alx: -2.34, rx: -0.16, py: 0.08 },
    { t: 0.56, arx: 0.58, bx: 0.50, alx: -0.24, rx: 0.26, py: -0.08, pz: 0.18 },
    { t: 0.72, arx: 0.66, bx: 0.44, alx: -0.12, rx: 0.14, pz: 0.10 },
    { t: 1.00, ary: 0.10, arx: -0.12, bx: 0, alx: 0, rx: 0, py: 0, pz: 0 }
  ]);
  const P_AXE_ULT = bakePose([
    { t: 0.00, ary: 0.10, arx: -0.20 },
    { t: 0.16, arx: -0.50, bx: 0.16, hy: 0, alx: -0.30 },
    { t: 0.30, arx: -2.55, bx: -0.24, hy: 1.05, alx: -2.20 },
    { t: 0.46, arx: -2.88, bx: -0.32, hy: 1.55, alx: -2.42 },
    { t: 0.56, arx: -2.40, bx: -0.12, hy: 0.85, alx: -2.10 },
    { t: 0.64, arx: 0.58, bx: 0.52, hy: 0, rx: 0.28, alx: -0.20 },
    { t: 0.76, arx: 0.64, bx: 0.44, hy: 0, rx: 0.16, alx: -0.10 },
    { t: 1.00, ary: 0.10, arx: -0.12, bx: 0, hy: 0, rx: 0, alx: 0 }
  ]);

  /* —— 枪：直线突刺 —— */
  const P_SPEAR_THRUST = bakePose([
    { t: 0.00, arx: -0.10, ary: 0.10, pz: 0, wz: 0 },
    { t: 0.14, arx: -0.04, ary: 0.06, pz: -0.28, wz: -0.52, by: -0.28, rx: -0.04 },
    { t: 0.22, arx: -0.04, ary: 0.04, pz: -0.36, wz: -0.66, by: -0.36 },
    { t: 0.30, arx: -0.18, ary: 0.02, pz: 0.44, wz: 0.78, by: 0.14, rx: 0.12 },
    { t: 0.44, arx: -0.16, ary: 0.02, pz: 0.38, wz: 0.68, by: 0.16, rx: 0.10 },
    { t: 1.00, arx: 0, ary: 0.15, pz: 0, wz: 0, by: 0, rx: 0 }
  ]);
  // 第三段：上步突刺，刺得更远更沉
  const P_SPEAR_FIN = bakePose([
    { t: 0.00, arx: -0.10, ary: 0.10, pz: 0, wz: 0 },
    { t: 0.16, arx: 0.02, ary: 0.08, pz: -0.40, wz: -0.80, by: -0.40, rx: -0.08 },
    { t: 0.26, arx: 0.02, ary: 0.06, pz: -0.46, wz: -0.92, by: -0.46, rx: -0.10 },
    { t: 0.34, arx: -0.24, ary: 0.02, pz: 0.56, wz: 1.00, by: 0.20, rx: 0.20 },
    { t: 0.50, arx: -0.22, ary: 0.02, pz: 0.50, wz: 0.90, by: 0.22, rx: 0.16 },
    { t: 1.00, arx: 0, ary: 0.15, pz: 0, wz: 0, by: 0, rx: 0 }
  ]);
  const P_SPEAR_HEAVY = bakePose([
    { t: 0.00, arx: -0.10, ary: 0.10, pz: 0, wz: 0 },
    { t: 0.30, arx: 0.06, ary: 0.06, pz: -0.46, wz: -0.90, by: -0.44, rx: -0.10 },
    { t: 0.40, arx: 0.06, ary: 0.04, pz: -0.54, wz: -1.02, by: -0.50, rx: -0.12 },
    { t: 0.44, arx: -0.16, ary: 0.02, pz: 0.62, wz: 1.12, by: 0.22, rx: 0.22 },
    { t: 0.60, arx: -0.14, ary: 0.02, pz: 0.56, wz: 1.02, by: 0.24, rx: 0.18 },
    { t: 1.00, arx: 0, ary: 0.15, pz: 0, wz: 0, by: 0, rx: 0 }
  ]);
  const P_SPEAR_ULT = bakePose([
    { t: 0.00, arx: -0.12, ary: 0.15 },
    { t: 0.10, arx: -0.42, ary: 1.55, by: -0.52, pz: -0.10 },
    { t: 0.22, arx: -0.30, ary: -1.30, by: 0.50, pz: 0.10 },
    { t: 0.88, arx: -0.30, ary: -1.35, by: 0.48, pz: 0.12 },
    { t: 1.00, arx: -0.12, ary: 0.15, by: 0, pz: 0 }
  ]);

  /* ================= 指令技姿态 ================= */
  /* —— 剑 —— */
  // 破空三连斩：前冲三段横斩，一段比一段沉
  const P_SK_SWORD_COMBO = bakePose([
    { t: 0.00, ary: 0.15, arx: -0.12 },
    { t: 0.13, ary: 1.30, arx: -0.30, by: -0.40, rx: -0.04 },
    { t: 0.26, ary: -1.30, arx: 0.05, by: 0.42, rx: 0.10 },
    { t: 0.40, ary: -1.70, arx: 0.10, by: 0.50, rx: 0.12 },
    { t: 0.54, ary: 1.50, arx: -0.35, by: -0.44, rx: -0.05 },
    { t: 0.66, ary: -1.55, arx: 0.06, by: 0.46, rx: 0.10 },
    { t: 0.80, ary: 1.90, arx: -0.55, by: -0.58, rx: -0.08 },
    { t: 0.92, ary: -1.85, arx: 0.15, by: 0.60, rx: 0.16 },
    { t: 1.00, ary: 0.15, arx: -0.12 }
  ]);
  // 回燕斩：旋身中保持挥砍展开（旋转由 hero.spin 驱动）
  const P_SK_SWORD_SPIN = bakePose([
    { t: 0.00, ary: 0.15, arx: -0.12 },
    { t: 0.10, ary: 1.55, arx: -0.30, by: -0.30, rx: -0.05 },
    { t: 0.30, ary: 1.85, arx: -0.35, by: -0.36, rx: -0.06 },
    { t: 0.55, ary: -1.45, arx: 0.10, by: 0.44, rx: 0.14 },
    { t: 0.75, ary: -1.70, arx: 0.12, by: 0.50, rx: 0.16 },
    { t: 1.00, ary: 0.15, arx: -0.12 }
  ]);
  // 升龙剑：下沉收力后向上撩起
  const P_SK_SWORD_UPPER = bakePose([
    { t: 0.00, ary: 0.15, arx: -0.12 },
    { t: 0.16, ary: 0.70, arx: 0.55, by: 0.30, rx: 0.12 },
    { t: 0.30, ary: 0.95, arx: -2.05, by: -0.42, rx: -0.16, py: 0.10, hy: 0.10 },
    { t: 0.44, ary: 1.10, arx: -2.30, by: -0.48, rx: -0.20, py: 0.14, hy: 0.16 },
    { t: 0.62, ary: 0.60, arx: 0.70, by: 0.34, rx: 0.14, hy: 0 },
    { t: 1.00, ary: 0.15, arx: -0.12, hy: 0 }
  ]);
  // 惊雷刺：侧身收剑后剑尖贯穿
  const P_SK_SWORD_RUSH = bakePose([
    { t: 0.00, ary: 0.15, arx: -0.12 },
    { t: 0.20, ary: 0.05, arx: -0.30, pz: -0.30, by: -0.30, rx: -0.06 },
    { t: 0.34, ary: 0.00, arx: -0.10, pz: 0.20, by: 0.10, rx: 0.06 },
    { t: 0.46, ary: 0.00, arx: -0.05, pz: 0.55, by: 0.14, rx: 0.14 },
    { t: 0.62, ary: 0.10, arx: -0.10, pz: 0.40, by: 0.08, rx: 0.08 },
    { t: 1.00, ary: 0.15, arx: -0.12, pz: 0 }
  ]);
  // 劈山剑：起跳举剑过顶，全力下劈
  const P_SK_SWORD_SLAM = bakePose([
    { t: 0.00, ary: 0.15, arx: -0.12 },
    { t: 0.18, arx: -0.45, ary: 0.05, bx: -0.10, hy: 0.35 },
    { t: 0.34, arx: -2.60, ary: 0.00, bx: -0.26, hy: 1.35 },
    { t: 0.50, arx: -2.80, bx: -0.30, hy: 1.55 },
    { t: 0.60, arx: 0.85, ary: 0.00, bx: 0.44, rx: 0.26, hy: 0.15 },
    { t: 0.72, arx: 0.95, bx: 0.50, rx: 0.30, hy: 0 },
    { t: 1.00, ary: 0.15, arx: -0.12, hy: 0 }
  ]);

  /* —— 斧 —— */
  // 狂蛮冲撞：两段过顶劈砍，肩胯大幅开合
  const P_SK_AXE_COMBO = bakePose([
    { t: 0.00, ary: 0.10, arx: -0.20 },
    { t: 0.16, ary: 0.05, arx: -2.05, bx: -0.22, alx: -1.90, rx: -0.06 },
    { t: 0.30, arx: 0.50, bx: 0.42, alx: -0.30, rx: 0.18, pz: 0.10 },
    { t: 0.50, arx: -2.20, bx: -0.26, alx: -2.05, rx: -0.08 },
    { t: 0.66, arx: 0.58, bx: 0.48, alx: -0.26, rx: 0.22, pz: 0.14 },
    { t: 1.00, ary: 0.10, arx: -0.12, bx: 0, alx: 0, rx: 0, pz: 0 }
  ]);
  // 旋风斧舞：双臂展开，斧刃划出直径
  const P_SK_AXE_SPIN = bakePose([
    { t: 0.00, ary: 0.10, arx: -0.20 },
    { t: 0.12, arx: -0.85, ary: 1.35, alx: -0.80, aly: -0.55, by: -0.30, rx: -0.06 },
    { t: 0.32, arx: -0.90, ary: 1.50, alx: -0.85, aly: -0.60, by: -0.34 },
    { t: 0.56, arx: 0.30, ary: -1.35, alx: 0.25, aly: 0.50, by: 0.44, rx: 0.14 },
    { t: 0.78, arx: 0.35, ary: -1.50, alx: 0.30, aly: 0.55, by: 0.48, rx: 0.16 },
    { t: 1.00, ary: 0.10, arx: -0.12, bx: 0, alx: 0, aly: 0, rx: 0 }
  ]);
  // 裂地波：跳起下砸，冲击波沿地面推进
  const P_SK_AXE_UPPER = bakePose([
    { t: 0.00, ary: 0.10, arx: -0.20 },
    { t: 0.18, arx: -2.35, bx: -0.28, alx: -2.15, rx: -0.10, hy: 0.50 },
    { t: 0.34, arx: -2.55, bx: -0.32, alx: -2.35, hy: 0.85 },
    { t: 0.46, arx: 0.60, bx: 0.52, alx: -0.24, rx: 0.24, hy: 0 },
    { t: 0.66, arx: 0.68, bx: 0.46, rx: 0.14, hy: 0 },
    { t: 1.00, ary: 0.10, arx: -0.12, hy: 0 }
  ]);
  // 崩山冲锋：连续两次沉猛劈砍
  const P_SK_AXE_RUSH = bakePose([
    { t: 0.00, ary: 0.10, arx: -0.20 },
    { t: 0.14, arx: -2.10, bx: -0.24, alx: -1.95, rx: -0.08 },
    { t: 0.30, arx: 0.52, bx: 0.44, alx: -0.28, rx: 0.20, pz: 0.08 },
    { t: 0.48, arx: -2.25, bx: -0.28, alx: -2.10, rx: -0.10 },
    { t: 0.64, arx: 0.60, bx: 0.50, alx: -0.24, rx: 0.24, pz: 0.12 },
    { t: 0.80, arx: 0.66, bx: 0.44, rx: 0.14 },
    { t: 1.00, ary: 0.10, arx: -0.12, bx: 0, alx: 0, rx: 0, pz: 0 }
  ]);
  // 天崩地裂：高高跃起，双倍冲击
  const P_SK_AXE_SLAM = bakePose([
    { t: 0.00, ary: 0.10, arx: -0.20 },
    { t: 0.16, arx: -0.50, bx: 0.14, hy: 0 },
    { t: 0.30, arx: -2.55, bx: -0.24, hy: 1.15 },
    { t: 0.46, arx: -2.90, bx: -0.32, hy: 1.70 },
    { t: 0.58, arx: 0.60, bx: 0.52, rx: 0.26, hy: 0.20 },
    { t: 0.70, arx: 0.68, bx: 0.46, rx: 0.16, hy: 0 },
    { t: 1.00, ary: 0.10, arx: -0.12, hy: 0 }
  ]);

  /* —— 枪 —— */
  // 疾风三刺：三连突刺，一刺深过一刺
  const P_SK_SPEAR_COMBO = bakePose([
    { t: 0.00, arx: -0.10, ary: 0.10, pz: 0, wz: 0 },
    { t: 0.12, arx: -0.02, ary: 0.06, pz: -0.34, wz: -0.60, by: -0.30, rx: -0.05 },
    { t: 0.26, arx: -0.18, ary: 0.02, pz: 0.42, wz: 0.72, by: 0.14, rx: 0.12 },
    { t: 0.42, arx: -0.02, ary: 0.06, pz: -0.38, wz: -0.66, by: -0.32, rx: -0.06 },
    { t: 0.56, arx: -0.20, ary: 0.02, pz: 0.46, wz: 0.80, by: 0.16, rx: 0.14 },
    { t: 0.72, arx: -0.02, ary: 0.06, pz: -0.42, wz: -0.74, by: -0.36, rx: -0.08 },
    { t: 0.86, arx: -0.24, ary: 0.02, pz: 0.56, wz: 1.00, by: 0.20, rx: 0.20 },
    { t: 1.00, arx: 0, ary: 0.15, pz: 0, wz: 0, by: 0, rx: 0 }
  ]);
  // 回马枪：收势后撤，反手突刺
  const P_SK_SPEAR_BACK = bakePose([
    { t: 0.00, arx: -0.10, ary: 0.10, pz: 0, wz: 0 },
    { t: 0.18, arx: -0.05, ary: 0.30, pz: -0.30, wz: -0.50, by: -0.20, rx: -0.08 },
    { t: 0.34, arx: -0.05, ary: 0.35, pz: -0.34, wz: -0.56, by: -0.24 },
    { t: 0.52, arx: -0.20, ary: 0.02, pz: 0.50, wz: 0.92, by: 0.18, rx: 0.18 },
    { t: 0.70, arx: -0.16, ary: 0.02, pz: 0.42, wz: 0.76, by: 0.14, rx: 0.10 },
    { t: 1.00, arx: 0, ary: 0.15, pz: 0, wz: 0, by: 0, rx: 0 }
  ]);
  // 出海蛟龙：压枪上挑，枪锋带起风刃
  const P_SK_SPEAR_UPPER = bakePose([
    { t: 0.00, arx: -0.10, ary: 0.10 },
    { t: 0.16, arx: 0.30, ary: 0.20, pz: -0.20, wz: -0.36, by: 0.24, rx: 0.10 },
    { t: 0.32, arx: -1.90, ary: 0.05, pz: 0.10, wz: 0.30, by: -0.40, rx: -0.18, hy: 0.12 },
    { t: 0.46, arx: -2.15, ary: 0.02, by: -0.46, rx: -0.22, hy: 0.16 },
    { t: 0.64, arx: -0.10, ary: 0.15, by: 0.06, rx: 0.04, hy: 0 },
    { t: 1.00, arx: 0, ary: 0.15 }
  ]);
  // 惊雷贯穿：超距突刺，枪身完全送出
  const P_SK_SPEAR_RUSH = bakePose([
    { t: 0.00, arx: -0.10, ary: 0.10 },
    { t: 0.16, arx: -0.02, ary: 0.05, pz: -0.42, wz: -0.80, by: -0.38, rx: -0.08 },
    { t: 0.28, arx: -0.16, ary: 0.02, pz: 0.62, wz: 1.15, by: 0.20, rx: 0.22 },
    { t: 0.48, arx: -0.14, ary: 0.02, pz: 0.56, wz: 1.02, by: 0.22, rx: 0.18 },
    { t: 1.00, arx: 0, ary: 0.15, pz: 0, wz: 0, by: 0, rx: 0 }
  ]);
  // 破军扫：大范围横扫，枪锋划出满月
  const P_SK_SPEAR_SWEEP = bakePose([
    { t: 0.00, arx: -0.10, ary: 0.10 },
    { t: 0.14, arx: -0.35, ary: 1.45, by: -0.44, rx: -0.08 },
    { t: 0.28, arx: -0.40, ary: 1.75, by: -0.52, rx: -0.10 },
    { t: 0.50, arx: -0.25, ary: -1.50, by: 0.50, rx: 0.18 },
    { t: 0.70, arx: -0.28, ary: -1.70, by: 0.56, rx: 0.20 },
    { t: 1.00, arx: 0, ary: 0.15, by: 0, rx: 0 }
  ]);

  /* —— 横向连招姿态（←→ 系指令技）—— */
  // 剑·十字燕返（→←轻）：两段交叉横斩，腰马带动剑身水平掠过
  const P_SK_SWORD_SIDE = bakePose([
    { t: 0.00, ary: 0.15, arx: -0.12 },
    { t: 0.14, ary: 1.55, arx: -0.35, by: -0.42, rx: -0.06 },
    { t: 0.32, ary: -1.45, arx: 0.08, by: 0.44, rx: 0.12, pz: 0.10 },
    { t: 0.48, ary: 1.35, arx: -0.30, by: -0.38, rx: -0.05 },
    { t: 0.62, ary: -1.60, arx: 0.10, by: 0.48, rx: 0.14, pz: 0.12 },
    { t: 0.74, ary: -1.95, arx: 0.18, by: 0.58, rx: 0.16, pz: 0.14 },
    { t: 1.00, ary: 0.15, arx: -0.12, by: 0, rx: 0, pz: 0 }
  ]);
  // 剑·回风斩（←→轻）：收势后沉，反手横割
  const P_SK_SWORD_BACK = bakePose([
    { t: 0.00, ary: 0.15, arx: -0.12 },
    { t: 0.14, pz: -0.35, ary: 0.90, arx: -0.20, by: -0.25, rx: -0.08 },
    { t: 0.30, pz: -0.40, ary: 1.20, arx: -0.25, by: -0.35 },
    { t: 0.50, ary: -1.50, arx: 0.05, by: 0.45, rx: 0.12, pz: 0.30, rz: 0.10 },
    { t: 0.72, ary: -1.80, arx: 0.12, by: 0.52, pz: 0.35 },
    { t: 1.00, ary: 0.15, arx: -0.12, by: 0, rx: 0, rz: 0, pz: 0 }
  ]);
  // 斧·横断双挥（→←轻）：双臂开合，斧刃水平横扫两段
  const P_SK_AXE_SIDE = bakePose([
    { t: 0.00, ary: 0.10, arx: -0.20 },
    { t: 0.14, ary: 1.70, arx: -0.55, alx: -1.45, aly: 0.45, by: -0.48, rx: -0.10 },
    { t: 0.34, ary: -1.50, arx: 0.15, alx: -0.25, aly: -0.40, by: 0.50, rx: 0.16, pz: 0.12 },
    { t: 0.50, ary: 1.45, arx: -0.50, alx: -1.35, aly: 0.40, by: -0.42, rx: -0.08 },
    { t: 0.70, ary: -1.85, arx: 0.20, alx: -0.30, aly: -0.45, by: 0.58, rx: 0.20, pz: 0.16 },
    { t: 1.00, ary: 0.10, arx: -0.12, alx: 0, aly: 0, by: 0, rx: 0, pz: 0 }
  ]);
  // 斧·拖斧反斩（←→轻）：拖步后撤，反手撩斩
  const P_SK_AXE_BACK = bakePose([
    { t: 0.00, ary: 0.10, arx: -0.20 },
    { t: 0.14, pz: -0.40, ary: 1.00, arx: -0.35, alx: -0.90, by: -0.32, rx: -0.12 },
    { t: 0.32, pz: -0.45, ary: 1.30, arx: -0.40, alx: -1.05, by: -0.40 },
    { t: 0.54, ary: -1.55, arx: 0.25, alx: -0.35, by: 0.52, rx: 0.18, pz: 0.32, rz: 0.12 },
    { t: 0.76, ary: -1.85, arx: 0.30, by: 0.60, pz: 0.38 },
    { t: 1.00, ary: 0.10, arx: -0.12, alx: 0, by: 0, rx: 0, rz: 0, pz: 0 }
  ]);
  // 枪·双横抹（→←轻）：枪身水平抹过，两段交叉
  const P_SK_SPEAR_SIDE = bakePose([
    { t: 0.00, arx: -0.10, ary: 0.10, pz: 0, wz: 0 },
    { t: 0.14, arx: -0.05, ary: 1.50, pz: 0.30, wz: 0.55, by: -0.46, rx: -0.08 },
    { t: 0.32, arx: -0.15, ary: -1.45, pz: 0.38, wz: 0.68, by: 0.48, rx: 0.14 },
    { t: 0.50, arx: -0.05, ary: 1.35, pz: 0.32, wz: 0.58, by: -0.42, rx: -0.06 },
    { t: 0.72, arx: -0.20, ary: -1.75, pz: 0.46, wz: 0.82, by: 0.56, rx: 0.18 },
    { t: 1.00, arx: 0, ary: 0.15, pz: 0, wz: 0, by: 0, rx: 0 }
  ]);

  const SKILL_POSES = [
    { combo: P_SK_SWORD_COMBO, spin: P_SK_SWORD_SPIN, upper: P_SK_SWORD_UPPER, rush: P_SK_SWORD_RUSH, slam: P_SK_SWORD_SLAM, side: P_SK_SWORD_SIDE, back: P_SK_SWORD_BACK, ult: P_SWORD_ULT },
    { combo: P_SK_AXE_COMBO, spin: P_SK_AXE_SPIN, upper: P_SK_AXE_UPPER, rush: P_SK_AXE_RUSH, slam: P_SK_AXE_SLAM, side: P_SK_AXE_SIDE, back: P_SK_AXE_BACK, ult: P_AXE_ULT },
    { combo: P_SK_SPEAR_COMBO, back: P_SK_SPEAR_BACK, upper: P_SK_SPEAR_UPPER, rush: P_SK_SPEAR_RUSH, sweep: P_SK_SPEAR_SWEEP, side: P_SK_SPEAR_SIDE, ult: P_SPEAR_ULT }
  ];

  // 静态姿态
  const P_IDLE = bakePose([{ t: 0, ary: 0.15, arx: -0.12 }, { t: 1, ary: 0.15, arx: -0.12 }]);
  const P_GUARD = bakePose([
    { t: 0, arx: -0.55, ary: -1.10, by: 0.14, pz: 0.20, py: -0.04 },
    { t: 1, arx: -0.55, ary: -1.10, by: 0.14, pz: 0.20, py: -0.04 }
  ]);
  const P_STAGGER = bakePose([
    { t: 0, arx: 0.40, ary: 0.20, bx: 0.26, rx: 0.20 },
    { t: 1, arx: 0.40, ary: 0.20, bx: 0.26, rx: 0.20 }
  ]);
  // 翻滚：团身
  const P_ROLL_TUCK = bakePose([
    { t: 0, arx: 1.15, ary: -0.40, alx: 1.30, aly: 0.20, bx: 0.70 },
    { t: 1, arx: 1.15, ary: -0.40, alx: 1.30, aly: 0.20, bx: 0.70 }
  ]);
  // 后撤步：重心后坐、上身微仰
  const P_BACKSTEP = bakePose([
    { t: 0, arx: -0.30, ary: 0.55, alx: -0.25, bx: -0.20, pz: 0.10 },
    { t: 1, arx: -0.30, ary: 0.55, alx: -0.25, bx: -0.20, pz: 0.10 }
  ]);

  const POSE_SETS = [
    { light: [P_SWORD_SWEEP, P_SWORD_SWEEP, P_SWORD_FIN], heavy: P_SWORD_HEAVY, ult: P_SWORD_ULT },
    { light: [P_AXE_CHOP, P_AXE_CHOP, P_AXE_FIN], heavy: P_AXE_HEAVY, ult: P_AXE_ULT },
    { light: [P_SPEAR_THRUST, P_SPEAR_THRUST, P_SPEAR_FIN], heavy: P_SPEAR_HEAVY, ult: P_SPEAR_ULT }
  ];

  const rig = { arx: -0.12, ary: 0.15, arz: 0, alx: 0, aly: 0, alz: 0, bx: 0, by: 0, rx: 0, rz: 0, pz: 0, py: 0, wz: 0, hy: 0 };

  // 平滑跟随目标姿态：既有软过渡，又不会把关键帧磨钝
  function applyPose(target, dt, instant) {
    const k = instant ? 1 : 1 - Math.exp(-38 * dt);
    for (let i = 0; i < RIG_FIELDS.length; i++) {
      const f = RIG_FIELDS[i];
      rig[f] += (target[f] - rig[f]) * k;
    }
    armR.rotation.set(rig.arx, rig.ary, rig.arz);
    armL.rotation.set(rig.alx, rig.aly, rig.alz);
    upperBody.rotation.set(rig.bx, rig.by, 0);
    heroGroup.rotation.x = rig.rx;
    heroGroup.rotation.z = rig.rz;
    armR.position.set(ARM_BASE.x, ARM_BASE.y + rig.py, ARM_BASE.z + rig.pz);
    weaponMeshes[hero.weapon].position.set(0, -0.44, 0.06 + rig.wz);
    heroGroup.position.set(hero.pos.x, hero.pos.y + rig.hy, hero.pos.z);
  }

  /* ------------------------- 勇者状态 ------------------------- */
  const SKILL_COLOR = [0xbfe9ff, 0xffc46b, 0xd6fff0];   // 剑青 / 斧橙 / 枪碧
  const hero = {
    pos: new THREE.Vector3(0, 0, 2),
    facing: Math.PI,
    hp: 100, maxHp: 100, st: 100, maxSt: 100,
    state: 'idle', stateT: 0, comboStep: 0, comboExpire: 0,
    iframe: 0, stDelay: 0, hitDone: false, weapon: 0,
    walkPhase: 0, moving: false, dead: false, deadT: 0, swingDir: 1,
    skill: null, skillHits: 0, skillFrom: new THREE.Vector3(), spin: 0,
    dodgeDir: new THREE.Vector3(0, 0, 1), dodgeDur: 0.5, dodgeSpeed: 12, roll: true,
    dodgeId: 0, dodgeFresh: 0, counterT: 0, whiffT: 0
  };

  /* ------------------------- 敌人 ------------------------- */
  const ENEMY_BASE = {
    slime: { hp: 42, spd: 2.2, reach: 1.55, windup: 0.46, dmg: 9, r: 0.6, size: 0.85, brk: 60, color: 0x63c9a0, eye: 0x11212b, barH: 1.5 },
    stone: { hp: 160, spd: 1.5, reach: 2.0, windup: 0.62, dmg: 18, r: 0.72, size: 1.0, brk: 120, color: 0x8b8fa0, eye: 0xff7a4a, barH: 2.55 },
    archer: { hp: 34, spd: 2.7, reach: 1.2, windup: 0.55, dmg: 11, r: 0.55, size: 0.8, brk: 45, color: 0xc9a05e, eye: 0x2a1a0a, barH: 1.5 },
    elite: { hp: 300, spd: 1.75, reach: 2.7, windup: 0.72, dmg: 24, r: 1.15, size: 1.55, brk: 170, color: 0x7a4a8f, eye: 0xffd166, barH: 3.2 },
    boss: { hp: 900, spd: 1.35, reach: 3.2, windup: 0.82, dmg: 26, r: 1.6, size: 2.25, brk: 320, color: 0x9b1f2e, eye: 0xffe066, barH: 4.4 }
  };

  const enemies = [];
  function spawnEnemy(type, x, z, cfg) {
    cfg = cfg || { hpMul: 1, dmgMul: 1, spdMul: 1 };
    const B = ENEMY_BASE[type];
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: B.color, emissive: 0x000000 });
    const size = B.size;
    const body = new THREE.Mesh(new THREE.BoxGeometry(size, size * (type === 'stone' || type === 'elite' || type === 'boss' ? 1.5 : 0.85), size), bodyMat);
    body.castShadow = true; body.receiveShadow = true;
    body.position.y = (type === 'stone' || type === 'elite' || type === 'boss') ? size * 0.75 : size * 0.42;
    g.add(body);

    // 眼睛
    const eyeMat = new THREE.MeshBasicMaterial({ color: B.eye });
    for (let i = 0; i < 2; i++) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(size * 0.13, size * 0.13, 0.06), eyeMat);
      eye.position.set((i ? 1 : -1) * size * 0.18, body.position.y + size * 0.08, size * 0.5);
      g.add(eye);
    }
    if (type === 'stone' || type === 'elite' || type === 'boss') {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(size * 1.25, 0.22, size * 1.25), bodyMat);
      sh.position.y = size * 1.55;
      sh.castShadow = true;
      g.add(sh);
    }
    if (type === 'elite' || type === 'boss') {
      // 双角：一眼认出这是统领 / 魔将
      const hk = type === 'boss' ? 1.7 : 1;
      for (let i = 0; i < 2; i++) {
        const horn = new THREE.Mesh(new THREE.BoxGeometry(0.16 * hk, 0.5 * hk, 0.16 * hk), bodyMat);
        horn.position.set((i ? 1 : -1) * size * 0.3 * hk, size * 1.62, 0);
        horn.rotation.z = (i ? 1 : -1) * 0.35;
        g.add(horn);
      }
      if (type === 'boss') {
        // 魔将王冠：顶部横脊，强化压迫感
        const cr = new THREE.Mesh(new THREE.BoxGeometry(size * 1.5, 0.18, size * 0.3),
          new THREE.MeshLambertMaterial({ color: 0xffe066, emissive: 0x332200 }));
        cr.position.set(0, size * 2.0, 0);
        g.add(cr);
      }
    }
    if (type === 'archer') {
      // 持弩：标明远程身份
      const bow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.3),
        new THREE.MeshLambertMaterial({ color: 0x4a3520 }));
      bow.position.set(size * 0.42, body.position.y + 0.1, 0.12);
      g.add(bow);
    }

    const e = {
      group: g, body: body, bodyMat: bodyMat, type: type,
      pos: new THREE.Vector3(x, 0, z),
      bodyY: body.position.y,
      hp: Math.round(B.hp * cfg.hpMul), maxHp: Math.round(B.hp * cfg.hpMul),
      breakv: 0, maxBreak: B.brk,
      state: 'idle', stateT: 0, hitFlash: 0, dead: false,
      speed: B.spd * cfg.spdMul,       aggro: type === 'archer' ? 13 : 7.5 + ((type === 'elite' || type === 'boss') ? 2 : 0),
      reach: B.reach, windup: B.windup,
      dmg: Math.round(B.dmg * cfg.dmgMul), radius: B.r, bob: Math.random() * 6.28,
      knock: new THREE.Vector3(),
      circleDir: Math.random() < 0.5 ? 1 : -1, strafeT: 1 + Math.random(),
      summonT: (type === 'elite' || type === 'boss') ? 6 : 0, shootCd: 1.5, dashedId: -1
    };

    // 头顶血条（独立于已旋转的模型，避免被父级旋转带歪）
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.14), new THREE.MeshBasicMaterial({ color: 0x12161f }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.1), new THREE.MeshBasicMaterial({ color: 0xff5f6d }));
    fill.position.z = 0.02;
    bar.add(bg, fill);
    scene.add(bar);
    e.bar = bar; e.barFill = fill; e.barH = B.barH;

    scene.add(g);
    enemies.push(e);
    return e;
  }

  /* ------------------------- 关卡配置与波次 ------------------------- */
  function levelCfg(lv) {
    const region = REGION_NAMES[Math.min(REGION_NAMES.length - 1, Math.floor((lv - 1) / 2))];
    const deep = lv - REGION_NAMES.length * 2;
    return {
      name: region + (deep > 0 ? ' · 深处' + deep : ''),
      slime: 5 + Math.min(12, lv * 2),
      stone: lv >= 2 ? Math.min(4, Math.floor((lv + 1) / 2)) : 0,
      archer: lv >= 3 ? Math.min(5, lv - 2) : 0,
      elite: lv >= 4 && lv % 2 === 0 ? 1 + Math.floor((lv - 4) / 6) : 0,
      boss: lv % 5 === 0 ? 1 : 0,
      hpMul: 1 + (lv - 1) * 0.20,
      dmgMul: 1 + (lv - 1) * 0.10,
      spdMul: Math.min(1.5, 1 + (lv - 1) * 0.045)
    };
  }

  function enemiesLeft() {
    let n = 0;
    for (let i = 0; i < enemies.length; i++) if (!enemies[i].dead) n++;
    return n;
  }

  function clearField() {
    for (let i = 0; i < enemies.length; i++) {
      scene.remove(enemies[i].group);
      scene.remove(enemies[i].bar);
    }
    enemies.length = 0;
    for (let i = 0; i < shots.length; i++) { scene.remove(shots[i].mesh); shots[i].mesh.material.dispose(); }
    shots.length = 0;
    for (let i = 0; i < orbs.length; i++) { scene.remove(orbs[i].mesh); orbs[i].mesh.material.dispose(); }
    orbs.length = 0;
  }

  function spawnWave(cfg) {
    let guard = 0;
    const put = function (type, n) {
      let placed = 0;
      while (placed < n && guard++ < 1200) {
        const a = Math.random() * Math.PI * 2;
        const r = 7 + Math.random() * 14;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) continue;
        if (Math.hypot(x - hero.pos.x, z - hero.pos.z) < 6) continue;
        spawnEnemy(type, x, z, cfg);
        placed++;
      }
    };
    put('slime', cfg.slime);
    put('stone', cfg.stone);
    put('archer', cfg.archer);
    put('elite', cfg.elite);
    if (cfg.boss) put('boss', cfg.boss);
    waveTotal = enemies.length;
    attackTokens = 1 + Math.min(3, Math.floor(level / 2));
  }

  spawnWave(levelCfg(1));

  /* ------------------------- 音效 ------------------------- */
  let actx = null;
  function initAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    // iOS：AudioContext 需在用户手势中创建并显式恢复
    if (actx && actx.state === 'suspended' && actx.resume) actx.resume();
  }
  function sfx(kind) {
    if (!actx) return;
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.connect(g); g.connect(actx.destination);
    let f0 = 440, f1 = 220, type = 'square', dur = 0.09, vol = 0.06;
    if (kind === 'swing') { f0 = 300; f1 = 120; type = 'triangle'; dur = 0.08; vol = 0.04; }
    else if (kind === 'hit') { f0 = 180; f1 = 60; type = 'square'; dur = 0.11; vol = 0.07; }
    else if (kind === 'heavy') { f0 = 120; f1 = 40; type = 'sawtooth'; dur = 0.2; vol = 0.08; }
    else if (kind === 'skill') { f0 = 520; f1 = 180; type = 'sawtooth'; dur = 0.22; vol = 0.07; }
    else if (kind === 'ult') { f0 = 90; f1 = 320; type = 'sawtooth'; dur = 0.5; vol = 0.1; }
    else if (kind === 'parry') { f0 = 1200; f1 = 1800; type = 'square'; dur = 0.16; vol = 0.07; }
    else if (kind === 'hurt') { f0 = 220; f1 = 80; type = 'sawtooth'; dur = 0.18; vol = 0.08; }
    else if (kind === 'heal') { f0 = 520; f1 = 980; type = 'sine'; dur = 0.35; vol = 0.06; }
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* ===================== 背景音乐 + 语音呼喊 ===================== */
  // 程序化生成（Web Audio），无外部音频文件，可离线运行。
  // 两套主题：adventure（史诗冒险·中速） / boss（激昂紧凑·快节奏）。
  // 主循环每帧调用 Music.update(dt) 推进 sequencer；boss 存活时自动切到 boss 主题。
  const Music = (function () {
    let bus = null, playing = false, muted = false, mode = 'adventure';
    let nextTime = 0, step16 = 0, barCount = 0, scheduled = 0;

    // A 小调和弦进行（4 小节循环）：Am - F - C - G
    const ROOT = [110.00, 87.31, 130.81, 98.00];            // A2 F2 C3 G2
    const TRIAD = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]]; // 小三 / 大三
    const semi = function (r, n) { return r * Math.pow(2, n / 12); };

    function kick(t, v) {
      if (!actx) return;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.2);
    }
    function noise(t, dur, v, hp, type) {
      if (!actx) return;
      const n = Math.max(1, Math.floor(actx.sampleRate * dur));
      const buf = actx.createBuffer(1, n, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = actx.createBufferSource(); src.buffer = buf;
      const f = actx.createBiquadFilter(); f.type = type || 'highpass'; f.frequency.value = hp || 6000;
      const g = actx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(bus); src.start(t); src.stop(t + dur + 0.02);
    }
    function tone(t, freq, dur, v, type, lp) {
      if (!actx) return;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sawtooth'; o.frequency.setValueAtTime(freq, t);
      const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp || 2200;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
    }
    function tempo() { return mode === 'boss' ? 152 : 108; }

    function scheduleStep(s, t) {
      scheduled++;
      const bar = barCount % 4, root = ROOT[bar], tri = TRIAD[bar];
      if (mode === 'adventure') {
        if (s === 0 || s === 8) kick(t, 0.5);
        if (s === 4 || s === 12) noise(t, 0.18, 0.22, 1800, 'bandpass');
        if (s % 2 === 0) noise(t, 0.04, 0.05, 7000, 'highpass');
        if (s === 0) tone(t, root, 0.9, 0.16, 'triangle', 600);
        if (s === 8) tone(t, root * 1.5, 0.4, 0.12, 'triangle', 600);
        if (s % 2 === 0) tone(t, semi(root * 2, tri[(s / 2) % 3]), 0.22, 0.07, 'square', 1800);
        if (s === 0) tri.forEach(function (o) { tone(t, semi(root * 2, o), 1.6, 0.035, 'sawtooth', 1400); });
      } else { // boss：更快更密、压迫感
        if (s === 0 || s === 4 || s === 8 || s === 12) kick(t, 0.55);
        if (s === 4 || s === 12) noise(t, 0.18, 0.26, 1800, 'bandpass');
        noise(t, 0.04, 0.06, 7000, 'highpass');
        if (s % 2 === 0) tone(t, root, 0.18, 0.17, 'sawtooth', 700);
        else tone(t, root * 1.5, 0.1, 0.10, 'square', 900);
        tone(t, semi(root * 2, tri[s % 3]), 0.12, 0.06, 'square', 2200);
        if (s === 0) tri.forEach(function (o) { tone(t, semi(root * 2, o), 1.2, 0.045, 'sawtooth', 1600); });
      }
    }

    function update(dt) {
      if (!playing || !actx || muted) return;
      const s16 = (60 / tempo()) / 4;
      if (nextTime < actx.currentTime) nextTime = actx.currentTime + 0.05;
      let guard = 0;
      while (nextTime < actx.currentTime + 0.12 && guard++ < 64) {
        scheduleStep(step16, nextTime);
        nextTime += s16;
        step16++; if (step16 >= 16) { step16 = 0; barCount++; }
      }
    }
    function start(m) {
      if (!actx) return;
      if (!bus) { bus = actx.createGain(); bus.gain.value = 0.0001; bus.connect(actx.destination); }
      mode = m || 'adventure'; playing = true; step16 = 0; barCount = 0;
      nextTime = actx.currentTime + 0.06;
      bus.gain.cancelScheduledValues(actx.currentTime);
      bus.gain.setValueAtTime(bus.gain.value, actx.currentTime);
      bus.gain.linearRampToValueAtTime(0.42, actx.currentTime + 0.6);
    }
    function setMode(m) {
      if (mode === m) return;
      mode = m;
      if (bus && actx) {
        bus.gain.cancelScheduledValues(actx.currentTime);
        bus.gain.setValueAtTime(bus.gain.value, actx.currentTime);
        bus.gain.linearRampToValueAtTime(m === 'boss' ? 0.52 : 0.42, actx.currentTime + 0.3);
      }
      if (m === 'boss' && actx) { // 入场上扫 stinger
        const t = actx.currentTime + 0.02;
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.5);
        const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        o.connect(f); f.connect(g); g.connect(bus || actx.destination); o.start(t); o.stop(t + 0.65);
      }
    }
    function setMuted(v) {
      muted = v;
      if (bus && actx) {
        bus.gain.cancelScheduledValues(actx.currentTime);
        bus.gain.setValueAtTime(bus.gain.value, actx.currentTime);
        bus.gain.linearRampToValueAtTime(muted ? 0.0001 : 0.42, actx.currentTime + 0.15);
      }
    }
    return {
      update: update, start: start, setMode: setMode, setMuted: setMuted,
      toggle: function () { setMuted(!muted); return muted; },
      isMuted: function () { return muted; },
      getMode: function () { return mode; },
      isPlaying: function () { return playing; },
      scheduled: function () { return scheduled; }
    };
  })();

  // 语音呼喊：技能释放时的"嘿/哈"战吼 +（可选）技能名呼喊
  let shoutCount = 0, voxFired = 0;
  function shout(kind) {
    shoutCount++;
    if (!actx) return;
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sawtooth';
    const f0 = kind === 'ha' ? 220 : 260, f1 = kind === 'ha' ? 130 : 200;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.16);
    const bp1 = actx.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = kind === 'ha' ? 800 : 700; bp1.Q.value = 6;
    const bp2 = actx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = kind === 'ha' ? 1200 : 1100; bp2.Q.value = 4;
    const ng = actx.createGain(); ng.gain.setValueAtTime(0.06, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    const nb = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.2), actx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
    const ns = actx.createBufferSource(); ns.buffer = nb;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(bp1); o.connect(bp2); bp1.connect(g); bp2.connect(g);
    ns.connect(ng); ng.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + 0.24); ns.start(t); ns.stop(t + 0.2);
  }
  // ★ 离线中文语音合成：不依赖任何系统 TTS / 语音包 / 网络，
  // 用 Web Audio 共振峰声道合成，把技能名逐音节"念"出来（机器人腔，但必定出声且离线可用）。
  // 每个技能名手工标注拼音（含声调数字 1-4，5=轻声），由 MandarinSynth 解析合成。
  const NAME_PINYIN = {
    '裂空剑': 'lie4 kong1 jian4', '碎岩斧': 'sui4 yan2 fu3', '逐风枪': 'zhu2 feng1 qiang1',
    '破空三连斩': 'po4 kong1 san1 lian2 zhan3', '回燕斩': 'hui2 yan4 zhan3', '升龙剑': 'sheng1 long2 jian4',
    '惊雷刺': 'jing1 lei2 ci4', '劈山剑': 'pi1 shan1 jian4', '瞬影斩': 'shun4 ying3 zhan3',
    '十字燕返': 'shi2 zi4 yan4 fan3', '回风斩': 'hui2 feng1 zhan3', '断流横断': 'duan4 liu2 heng2 duan4',
    '万剑归宗': 'wan4 jian4 gui1 zong1',
    '狂蛮冲撞': 'kuang2 man2 chong1 zhuang4', '旋风斧舞': 'xuan4 feng1 fu3 wu3', '裂地波': 'lie4 di4 bo1',
    '崩山冲锋': 'beng1 shan1 chong1 feng1', '天崩地裂': 'tian1 beng1 di4 lie4', '瞬影砸': 'shun4 ying3 za2',
    '横断双挥': 'heng2 duan4 shuang1 hui1', '拖斧反斩': 'tuo1 fu3 fan3 zhan3', '横断山岳': 'heng2 duan4 shan1 yue4',
    '陨石天降': 'yun3 shi2 tian1 jiang4',
    '疾风三刺': 'ji2 feng1 san1 ci4', '回马枪': 'hui2 ma3 qiang1', '出海蛟龙': 'chu1 hai3 jiao1 long2',
    '惊雷贯穿': 'jing1 lei2 guan4 chuan1', '破军扫': 'po4 jun1 sao3', '瞬影刺': 'shun4 ying3 ci4',
    '双横抹月': 'shuang1 heng2 mo3 yue4', '侧返枪': 'ce4 fan3 qiang1', '横断江': 'heng2 duan4 jiang1',
    '横扫千军': 'heng2 sao3 qian1 jun1',
    '碎境魔将': 'sui4 jing4 mo2 jiang1'
  };
  // 单元音共振峰（F1,F2,F3）Hz —— 声道形状决定音色
  const MVOW = {
    a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], u: [300, 870, 2240],
    v: [250, 1700, 2600], o: [490, 900, 2410], er: [490, 1350, 1690]
  };
  // 韵母 → 元音轨迹（p，可多段滑音）+ 鼻韵尾（c: 'n'|'ng'|null）
  const MFIN = {
    a: { p: ['a'] }, o: { p: ['o'] }, e: { p: ['e'] }, i: { p: ['i'] }, u: { p: ['u'] }, v: { p: ['v'] }, er: { p: ['er'] },
    ai: { p: ['a', 'i'] }, ei: { p: ['e', 'i'] }, ao: { p: ['a', 'u'] }, ou: { p: ['o', 'u'] },
    an: { p: ['a'], c: 'n' }, en: { p: ['e'], c: 'n' }, ang: { p: ['a'], c: 'ng' }, eng: { p: ['e'], c: 'ng' }, ong: { p: ['o'], c: 'ng' },
    ia: { p: ['i', 'a'] }, ie: { p: ['i', 'e'] }, ua: { p: ['u', 'a'] }, uo: { p: ['u', 'o'] }, ve: { p: ['v', 'e'] },
    iao: { p: ['i', 'a', 'u'] }, iu: { p: ['i', 'u'] }, uai: { p: ['u', 'a', 'i'] }, ui: { p: ['u', 'e', 'i'] },
    ian: { p: ['i', 'a'], c: 'n' }, uan: { p: ['u', 'a'], c: 'n' }, uang: { p: ['u', 'a'], c: 'ng' }, van: { p: ['v', 'a'], c: 'n' },
    in: { p: ['i'], c: 'n' }, un: { p: ['u'], c: 'n' }, ing: { p: ['i'], c: 'ng' }, iang: { p: ['i', 'a'], c: 'ng' }, iong: { p: ['i', 'o'], c: 'ng' }
  };
  // 声母发音方式：stop 塞音 / aff 塞擦 / fric 擦音 / nasal 鼻 / liq 边闪；第二位 1=送气
  const MINIT = {
    b: ['stop', 0], p: ['stop', 1], m: ['nasal', 0], f: ['fric', 0],
    d: ['stop', 0], t: ['stop', 1], n: ['nasal', 0], l: ['liq', 0],
    g: ['stop', 0], k: ['stop', 1], h: ['fric', 0],
    j: ['aff', 0], q: ['aff', 1], x: ['fric', 0],
    zh: ['aff', 0, 1], ch: ['aff', 1, 1], sh: ['fric', 0, 1], r: ['liq', 0, 1],
    z: ['aff', 0], c: ['aff', 1], s: ['fric', 0]
  };
  const MPLACE = { b: 700, p: 700, m: 700, f: 900, d: 2300, t: 2300, n: 2300, l: 2300, z: 2600, c: 2600, s: 2600,
    g: 1500, k: 1500, h: 1500, j: 3200, q: 3200, x: 3200, zh: 2200, ch: 2200, sh: 2200, r: 2200 };
  function splitSyllable(s) {
    if (s[0] === 'y') {
      if (s === 'yu') return { onset: '', fin: 'v' };
      if (s === 'yue') return { onset: '', fin: 've' };
      if (s === 'yun') return { onset: '', fin: 'van' };
      if (s === 'yuan') return { onset: '', fin: 'van' };
      if (s === 'ying') return { onset: '', fin: 'ing' };
      if (s === 'yong') return { onset: '', fin: 'iong' };
      const ym = { ya: 'ia', ye: 'ie', yao: 'iao', you: 'iu', yan: 'ian', yang: 'iang' };
      if (ym[s]) return { onset: '', fin: ym[s] };
      return { onset: '', fin: s.slice(1) };
    }
    if (s[0] === 'w') {
      const wm = { wu: 'u', wa: 'ua', wo: 'uo', wai: 'uai', wei: 'ui', wan: 'uan', wen: 'en', weng: 'eng', wang: 'uang' };
      if (wm[s]) return { onset: '', fin: wm[s] };
      return { onset: '', fin: s.slice(1) };
    }
    if (s.length >= 2 && MINIT[s.slice(0, 2)]) return { onset: s.slice(0, 2), fin: s.slice(2) };
    if (s[0] && MINIT[s[0]]) return { onset: s[0], fin: s.slice(1) };
    return { onset: '', fin: s };
  }
  function f0At(tone, x) {
    switch (tone) {
      case 1: return 0.95;
      case 2: return 0.74 + 0.34 * x;
      case 3: return x < 0.5 ? 0.74 - 0.18 * (x / 0.5) : 0.56 + 0.46 * ((x - 0.5) / 0.5);
      case 4: return 1.06 - 0.40 * x;
      default: return 0.86;
    }
  }
  // ---- 离线中文语音合成（重写：加性共振峰 + 缓冲渲染，清晰度大幅提升）----
  // 旧版用高 Q 窄带通直接滤锯齿波，元音能量被压成极窄几条线、又尖又糊、且相对 BGM 偏小。
  // 新版：在 AudioBuffer 里用「多次谐波 × 共振峰包络」逐采样合成（元音饱满自然），
  // 叠加按成阻部位着色的辅音噪声与 F2 过渡（区分 b/d/g 的关键），再经
  // 去齿音 + 2.5kHz 存在感提升 + 限幅主链输出，保证听清且不爆音。
  const VOX_GAP = 0.02;       // 音节间停顿，避免糊在一起
  const VOX_BASE = 178;       // 基频（少年英雄腔，比旧 150 更亮更清晰）
  let voxChain = null;
  function getVoxChain(ctx) {
    if (voxChain && voxChain.ctx === ctx) return voxChain;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85;     // 去低频隆隆
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;     // 去高频刺耳
    const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 2500; pres.Q.value = 1.1; pres.gain.value = 7; // 抬辅音清晰度
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -9; comp.knee.value = 14; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.16;
    const g = ctx.createGain(); g.gain.value = 1.0;
    hp.connect(lp); lp.connect(pres); pres.connect(comp); comp.connect(g); g.connect(ctx.destination);
    voxChain = { ctx: ctx, out: hp };
    return voxChain;
  }
  function voxSq(x) { return x * x; }
  function formantsFor(v) { return MVOW[v] || MVOW.a; }
  // 声母 → 成阻部位（决定过渡音 F2，是分清 b/d/g 的关键）
  const VOX_PLACE = {
    b: 'labial', p: 'labial', m: 'labial', f: 'labiodental',
    d: 'alveolar', t: 'alveolar', n: 'alveolar', l: 'alveolar',
    z: 'dental', c: 'dental', s: 'dental',
    zh: 'retroflex', ch: 'retroflex', sh: 'retroflex', r: 'retroflex',
    j: 'palatal', q: 'palatal', x: 'palatal',
    g: 'velar', k: 'velar', h: 'glottal'
  };
  const VOX_NOISE = { labial: 1100, labiodental: 1900, dental: 5200, alveolar: 4200, retroflex: 3000, palatal: 3400, velar: 1800, glottal: 1200 };
  // 成阻段（辅音向元音过渡的起点）共振峰
  const VOX_CLS = {
    labial: [320, 900, 2500], labiodental: [320, 1000, 2500], dental: [320, 1800, 2500],
    alveolar: [320, 1700, 2500], retroflex: [320, 1400, 2500], palatal: [320, 2200, 2600],
    velar: [320, 1200, 2500], glottal: [400, 1500, 2500]
  };
  // 浊鼻/边音自身的共振峰
  const VOX_NAS = { labial: [250, 800, 2500], alveolar: [250, 1000, 2500], dental: [250, 1700, 2500] };
  // 加性共振峰：按当前 F1/F2/F3 与基频合成单帧（返回约 [-1.5,1.5]）
  function vowelFrame(ph, f0, F1, F2, F3) {
    const Nh = Math.max(8, Math.min(26, Math.floor(3400 / f0)));
    let s = 0;
    for (let h = 1; h <= Nh; h++) {
      const hf = h * f0;
      let w = 1.0;
      w += 1.0 / (1 + voxSq((hf - F1) / 60));   // F1
      w += 0.62 / (1 + voxSq((hf - F2) / 95));  // F2
      w += 0.34 / (1 + voxSq((hf - F3) / 130)); // F3
      w *= 1 / (1 + h * 0.018);                 // 声门谱斜率，去刺
      s += w * Math.sin(ph * h);
    }
    return s * 0.42;
  }
  // 把单个音节写入共享缓冲 out（从 off 起），返回写入采样数
  function writeSyllable(out, off, sr, plan, BASE) {
    const N = plan.N;
    const ons = plan.ons, tone = plan.tone, fps = plan.fps, onset = plan.onset, clsF = plan.clsF;
    const onDur = plan.onDur, vDur = plan.vDur, coDur = plan.coDur;
    const place = onset ? VOX_PLACE[onset] : null;
    const onS = Math.floor(onDur * sr), vS = Math.floor(vDur * sr), coS = Math.floor(coDur * sr);
    const aS = Math.floor(sr * 0.012), rS = Math.floor(sr * 0.03);   // 元音起/落
    const trans = Math.min(vS, Math.floor(sr * 0.05));              // 成阻→元音过渡
    const nCenter = ons ? (VOX_NOISE[place] || 2000) : 2000;
    const nAlpha = Math.min(0.92, nCenter / sr * 2.2);
    const voicedOns = ons && (ons[0] === 'nasal' || ons[0] === 'liq' || (ons[0] === 'fric' && onset === 'r'));
    let z1 = 0;
    for (let i = 0; i < N; i++) {
      const t = (off + i) / sr;
      let phase, prog = 0;
      if (i < onS) phase = 'c';
      else if (i < onS + vS) { phase = 'v'; prog = (i - onS) / vS; }
      else { phase = 'co'; prog = coS > 0 ? (i - onS - vS) / coS : 1; }
      let f0 = 0;
      if (phase === 'v') f0 = BASE * f0At(tone, prog);
      else if (phase === 'co') f0 = BASE * f0At(tone, 1);
      else f0 = voicedOns ? BASE * f0At(tone, 0) : 0;
      let F1, F2, F3;
      if (phase === 'c') { F1 = clsF[0]; F2 = clsF[1]; F3 = clsF[2]; }
      else if (phase === 'v') {
        const tp = trans > 0 ? Math.min(1, (i - onS) / trans) : 1;
        const vf = formantsFor(fps[0]);
        F1 = clsF[0] + (vf[0] - clsF[0]) * tp;
        F2 = clsF[1] + (vf[1] - clsF[1]) * tp;
        F3 = clsF[2] + (vf[2] - clsF[2]) * tp;
      } else {
        const nf = VOX_NAS[place] || [250, 1000, 2500];
        const vf = formantsFor(fps[fps.length - 1]);
        F1 = vf[0] * 0.35 + nf[0] * 0.65; F2 = vf[1] * 0.3 + nf[1] * 0.7; F3 = 2500;
      }
      let samp = 0;
      if (f0 > 0) samp += vowelFrame((t * f0) * 2 * Math.PI, f0, F1, F2, F3);
      if (phase === 'c' && ons) {
        const white = Math.random() * 2 - 1;
        z1 += (white - z1) * nAlpha;
        const hp = white - z1;
        const nv = z1 * 0.5 + hp * 0.9;
        const cp = onS > 0 ? i / onS : 0;
        let env;
        if (ons[0] === 'stop') env = cp < 0.4 ? 0.55 : (ons[1] ? 0.25 * (1 - cp) : 0.0);  // 塞音爆破+送气
        else if (ons[0] === 'fric' || ons[0] === 'aff') env = 0.32;                         // 擦/塞擦持续
        else env = 0.30;
        samp += nv * env;
        if (voicedOns) {
          const nf = ons[0] === 'nasal' ? (VOX_NAS[place] || [250, 900, 2500]) : [300, 1100, 2500];
          samp += vowelFrame((t * f0) * 2 * Math.PI, f0, nf[0], nf[1], nf[2]) * 0.45;
        }
      }
      if (phase === 'v') {
        let vEnv = 1.0;
        if (i - onS < aS) vEnv = (i - onS) / aS;
        else if (onS + vS - i < rS) vEnv = (onS + vS - i) / rS;
        vEnv = Math.max(0.3, vEnv);
        samp *= (0.5 + 0.5 * vEnv);
      } else if (phase === 'co') {
        samp *= 0.6 * (1 - prog) + 0.15;
      } else {
        samp *= 0.85;
      }
      out[off + i] += samp;
    }
    return N;
  }
  function synthName(ctx, pinyin) {
    if (!ctx) return;
    const sr = ctx.sampleRate || 44100;
    const toks = pinyin.trim().split(/\s+/);
    const plans = [];
    let totalN = Math.ceil(sr * 0.03);
    for (let ti = 0; ti < toks.length; ti++) {
      const tok = toks[ti];
      const tone = parseInt(tok[tok.length - 1], 10) || 5;
      const body = tok.slice(0, tok.length - 1);
      const syl = splitSyllable(body);
      const fin = MFIN[syl.fin] || { p: ['a'] };
      const ons = syl.onset ? (MINIT[syl.onset] || ['stop', 0]) : null;
      const onDur = ons ? (ons[0] === 'fric' || ons[0] === 'aff' ? 0.09 : 0.05) : 0.0;
      const vDur = 0.20 + (fin.p.length - 1) * 0.06;
      const coDur = fin.c ? 0.08 : 0.0;
      const place = syl.onset ? VOX_PLACE[syl.onset] : null;
      let clsF = [320, 1500, 2500];
      if (ons) {
        if (ons[0] === 'nasal' || ons[0] === 'liq') clsF = (VOX_NAS[place] || [250, 1000, 2500]).slice();
        else if (place) clsF = VOX_CLS[place].slice();
      } else { clsF = formantsFor(fin.p[0]).slice(); }   // 零声母直接以元音共振峰起音
      const N = Math.ceil(sr * (onDur + vDur + coDur));
      plans.push({ onset: syl.onset, ons: ons, tone: tone, fps: fin.p, coda: fin.c, onDur: onDur, vDur: vDur, coDur: coDur, clsF: clsF, N: N });
      totalN += N + Math.ceil(sr * VOX_GAP);
    }
    const buf = ctx.createBuffer(1, totalN + Math.ceil(sr * 0.05), sr);
    const out = buf.getChannelData(0);
    let off = Math.ceil(sr * 0.02);
    for (let i = 0; i < plans.length; i++) {
      off += writeSyllable(out, off, sr, plans[i], VOX_BASE);
      off += Math.ceil(sr * VOX_GAP);
    }
    // 归一化防爆音（保留峰值约 0.92）
    let mx = 0;
    for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > mx) mx = a; }
    if (mx > 0.001) { const g = 0.92 / mx; for (let i = 0; i < out.length; i++) out[i] *= g; }
    const chain = getVoxChain(ctx);
    const src = ctx.createBufferSource(); src.buffer = buf;
    src.connect(chain.out);
    src.start(ctx.currentTime + 0.01);
  }
  function vox(text) {
    if (!text) return;
    try {
      voxFired++;
      if (NAME_PINYIN[text]) synthName(actx, NAME_PINYIN[text]);
    } catch (e) { /* 合成失败静默，不影响战吼与游戏 */ }
  }

  // boss 存活检测 → 自动切换激昂主题
  let bossNotified = false;
  function anyBossAlive() {
    for (let i = 0; i < enemies.length; i++) if (enemies[i].type === 'boss' && !enemies[i].dead) return true;
    return false;
  }
  function recomputeMusic() {
    if (!Music.isPlaying()) return;
    const want = anyBossAlive() ? 'boss' : 'adventure';
    if (Music.getMode() === want) return;
    Music.setMode(want);
    if (ui.musicModeEl) {
      ui.musicModeEl.textContent = want === 'boss' ? 'BOSS 战' : '冒险';
      ui.musicModeEl.classList.toggle('boss', want === 'boss');
    }
    if (want === 'boss' && !bossNotified) { bossNotified = true; toast('⚠ BOSS 降临', 2.2); }
    if (want === 'adventure') bossNotified = false;
  }

  /* ------------------------- HUD ------------------------- */
  const ui = {
    hpFill: document.getElementById('hpFill'),
    stFill: document.getElementById('stFill'),
    cmdSeq: document.getElementById('cmdSeq'),
    cmdName: document.getElementById('cmdName'),
    ultName: document.getElementById('ultName'),
    ultCmd: document.getElementById('ultCmd'),
    hpText: document.getElementById('hpText'),
    stText: document.getElementById('stText'),
    weaponName: document.getElementById('weaponName'),
    comboNum: document.getElementById('comboNum'),
    killCount: document.getElementById('killCount'),
    levelNum: document.getElementById('levelNum'),
    scoreNum: document.getElementById('scoreNum'),
    region: document.getElementById('region'),
    againBtn: document.getElementById('againBtn'),
    winLogo: document.querySelector('#winScreen .logo'),
    targetFrame: document.getElementById('targetFrame'),
    targetLabel: document.getElementById('targetLabel'),
    targetHp: document.getElementById('targetHp'),
    targetFill: document.getElementById('targetFill'),
    minimap: document.getElementById('minimapCanvas'),
    toast: document.getElementById('toast'),
    startScreen: document.getElementById('startScreen'),
    winScreen: document.getElementById('winScreen'),
    winText: document.getElementById('winText'),
    musicBtn: document.getElementById('musicBtn'),
    musicModeEl: document.getElementById('musicMode')
  };
  ui.killCount.textContent = enemiesLeft();
  ui.scoreNum.textContent = '0';

  // 音乐开关：点击静音/恢复，并切换按钮与主题标签
  if (ui.musicBtn) {
    ui.musicBtn.addEventListener('click', function () {
      const m = Music.toggle();
      ui.musicBtn.classList.toggle('off', m);
      ui.musicBtn.textContent = m ? '♪ 音乐 关' : '♪ 音乐 开';
    });
  }

  let toastTimer = 0;
  function toast(msg, dur) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('on');
    toastTimer = dur || 1.6;
  }

  /* ------------------------- 输入 ------------------------- */
  const keys = {};
  const input = { light: false, heavy: false, guardDown: false };

  // 指令缓冲：方向输入序列（带时间戳）+ 空格标记，用于搓招
  const cmdSeq = [];
  let dashT = -1;
  const CMD_WINDOW = 0.8;

  function pushDir(d) {
    const now = performance.now() / 1000;
    cmdSeq.push({ d: d, t: now });
    if (cmdSeq.length > 6) cmdSeq.shift();
  }
  const DIR_KEYS = { w: 'u', arrowup: 'u', s: 'd', arrowdown: 'd', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' };

  window.addEventListener('keydown', function (e) {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === ' ') e.preventDefault();
    if (k === ' ' && !e.repeat) dashT = performance.now() / 1000;
    if (DIR_KEYS[k] && !e.repeat) pushDir(DIR_KEYS[k]);
    if (!running) return;
    if (k === ' ') doDodge();
    if (k === 'shift') { input.guardDown = true; startGuard(); }
    if (k === 'q') swapWeapon();
    if (k === 'e') tryHeal();
  });
  window.addEventListener('keyup', function (e) {
    const k = e.key.toLowerCase();
    keys[k] = false;
    if (k === 'shift') endGuard();
  });
  window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; input.guardDown = false; stickEnd(); });

  renderer.domElement.addEventListener('mousedown', function (e) {
    if (!running) return;
    e.preventDefault();
    if (e.button === 0) { input.light = true; tryAttack('light'); }
    if (e.button === 2) { input.heavy = true; tryAttack('heavy'); }
  });  renderer.domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ------------------------- 触屏输入 ------------------------- */
  const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
    new URLSearchParams(location.search).has('touch');
  if (IS_TOUCH) document.body.classList.add('touch');

  // 阻止移动端手势缩放 / 下拉刷新 / 双击放大
  document.addEventListener('touchmove', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });

  function endGuard() {
    input.guardDown = false;
    if (hero.state === 'guard') { hero.state = 'idle'; hero.stateT = 0; }
  }

  // 通用按压绑定：触摸 + 鼠标双通道；每个元素只跟踪一个触点，支持多指同按
  function bindPress(el, onDown, onUp) {
    if (!el) return;
    let id = null;
    el.addEventListener('touchstart', function (e) {
      e.preventDefault();
      if (id !== null) return;
      id = e.changedTouches[0].identifier;
      el.classList.add('press');
      if (onDown) onDown();
    }, { passive: false });
    const end = function (e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === id) {
          id = null; el.classList.remove('press');
          if (onUp) onUp();
          break;
        }
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('mousedown', function (e) {
      e.preventDefault();
      if (id !== null) return;
      id = 'm'; el.classList.add('press');
      if (onDown) onDown();
    });
    const mup = function () {
      if (id === 'm') { id = null; el.classList.remove('press'); if (onUp) onUp(); }
    };
    el.addEventListener('mouseup', mup);
    el.addEventListener('mouseleave', mup);
  }

  // 合成触点事件（自动化联调用；环境不支持 Touch 构造时退化为鼠标事件）
  function firePress(el, type) {
    try {
      const t = new Touch({ identifier: 7, target: el, clientX: 0, clientY: 0 });
      el.dispatchEvent(new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t],
        changedTouches: [t], bubbles: true, cancelable: true
      }));
    } catch (e) {
      el.dispatchEvent(new MouseEvent(type === 'touchend' ? 'mouseup' : 'mousedown', { bubbles: true, cancelable: true }));
    }
  }

  // 合成摇杆触点（带 clientX/clientY；不支持 Touch 时退化鼠标三件套）
  function fireStick(type, x, y) {
    if (!stickEl) return;
    try {
      const t = new Touch({ identifier: 7, target: stickEl, clientX: x, clientY: y });
      stickEl.dispatchEvent(new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t],
        changedTouches: [t], bubbles: true, cancelable: true
      }));
    } catch (e) {
      stickEl.dispatchEvent(new MouseEvent(type === 'touchend' ? 'mouseup' : 'mousedown',
        { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }
  }

  /* ------------------------- 虚拟摇杆（触屏） ------------------------- */
  // 模拟量输入：kx/ky 为归一化分量（-1~1，屏幕 y 向下为正），mag 为倾斜量；
  // 移动走模拟量（倾斜越满跑得越快），搓招走四象限量化——越过死区时按主方向
  // 入队指令缓冲（与键盘 pushDir 同一条链路），回中再拨即可搓出 ↑↑/↑↓/↓↑/↓↓
  const STICK_DEAD = 0.30;    // 死区（占环半径比例）
  const STICK_MAX_R = 75;     // 摇杆头最大行程 px（= 环半径）
  const stick = { active: false, id: null, kx: 0, ky: 0, mag: 0, sector: null };
  const stickEl = document.getElementById('stick');
  const stickKnob = document.getElementById('stickKnob');
  const stickTicks = {};
  document.querySelectorAll('#stick .tick').forEach(function (el) {
    stickTicks[el.getAttribute('data-dir')] = el;
  });

  function stickCenter() {
    const r = stickEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  // 四象限量化：取主轴方向；斜拨也归到上下左右（与键盘四键一致）
  function stickSector() {
    if (stick.mag < STICK_DEAD) return null;
    if (Math.abs(stick.kx) > Math.abs(stick.ky)) return stick.kx > 0 ? 'r' : 'l';
    return stick.ky > 0 ? 'd' : 'u';
  }
  function stickSet(kx, ky) {
    stick.kx = kx; stick.ky = ky;
    stick.mag = Math.min(1, Math.hypot(kx, ky));
    if (stickKnob) {
      stickKnob.style.transform = 'translate(' + (kx * STICK_MAX_R).toFixed(1) + 'px,' + (ky * STICK_MAX_R).toFixed(1) + 'px)';
    }
    // 象限切换才入队：连续同向不重复计数，回中再拨才算第二次输入
    const sec = stickSector();
    if (sec !== stick.sector) {
      if (sec) pushDir(sec);
      stick.sector = sec;
      for (const k in stickTicks) if (stickTicks[k]) stickTicks[k].classList.toggle('on', k === sec);
    }
  }
  function stickApply(x, y) {   // 屏幕坐标 → 归一化分量
    const c = stickCenter();
    let dx = x - c.x, dy = y - c.y;
    const d = Math.hypot(dx, dy);
    if (d > STICK_MAX_R) { dx = dx / d * STICK_MAX_R; dy = dy / d * STICK_MAX_R; }
    stickSet(dx / STICK_MAX_R, dy / STICK_MAX_R);
  }
  function stickStart(id, x, y) {
    stick.active = true; stick.id = id;
    if (stickEl) stickEl.classList.add('on');
    stickApply(x, y);
  }
  function stickEnd() {
    stick.active = false; stick.id = null; stick.sector = null;
    stick.kx = 0; stick.ky = 0; stick.mag = 0;
    if (stickEl) stickEl.classList.remove('on');
    if (stickKnob) stickKnob.style.transform = '';
    for (const k in stickTicks) if (stickTicks[k]) stickTicks[k].classList.remove('on');
  }

  if (stickEl) {
    stickEl.addEventListener('touchstart', function (e) {
      e.preventDefault();
      if (stick.active) return;
      const t = e.changedTouches[0];
      stickStart(t.identifier, t.clientX, t.clientY);
    }, { passive: false });
    stickEl.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (!stick.active) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === stick.id) { stickApply(t.clientX, t.clientY); break; }
      }
    }, { passive: false });
    const stickTouchEnd = function (e) {
      if (!stick.active) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === stick.id) { stickEnd(); break; }
      }
    };
    stickEl.addEventListener('touchend', stickTouchEnd);
    stickEl.addEventListener('touchcancel', stickTouchEnd);
    // 鼠标通道（桌面 ?touch=1 联调）
    stickEl.addEventListener('mousedown', function (e) {
      e.preventDefault();
      if (stick.active) return;
      stickStart('m', e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function (e) {
      if (stick.active && stick.id === 'm') stickApply(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', function () {
      if (stick.active && stick.id === 'm') stickEnd();
    });
  }

  // 动作键：与键盘/鼠标动作逐一对应
  bindPress(document.getElementById('bLight'),
    function () { if (running) { input.light = true; tryAttack('light'); } },
    function () { input.light = false; });
  bindPress(document.getElementById('bHeavy'),
    function () { if (running) { input.heavy = true; tryAttack('heavy'); } },
    function () { input.heavy = false; });
  bindPress(document.getElementById('bDodge'),
    function () { if (running) { dashT = performance.now() / 1000; doDodge(); } });
  bindPress(document.getElementById('bGuard'),
    function () { if (running) { input.guardDown = true; startGuard(); } }, endGuard);
  bindPress(document.getElementById('bSwap'),
    function () { if (running) swapWeapon(); });
  bindPress(document.getElementById('bHeal'),
    function () { if (running) tryHeal(); });

  // 全屏（移动端沉浸模式）
  const fsBtn = document.getElementById('fsBtn');
  if (fsBtn) fsBtn.addEventListener('click', function () {
    const doc = document, el = doc.documentElement;
    const fsEl = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (!fsEl) {
      (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
    } else {
      (doc.exitFullscreen || doc.webkitExitFullscreen || function () {}).call(doc);
    }
  });

  /* ------------------------- 时间控制 ------------------------- */
  let running = false;
  let timeScale = 1;
  let slowT = 0;
  let hitStopT = 0;
  let shake = 0;

  /* ------------------------- 战斗逻辑 ------------------------- */
  function canAct() {
    if (hero.dead) return false;
    const s = hero.state;
    if (s === 'light' || s === 'heavy' || s === 'dodge' || s === 'hurt' || s === 'stagger' || s === 'skill') return false;
    return true;
  }

  function tryAttack(kind) {
    if (!canAct()) return;
    // 先尝试指令技：方向序列命中则放技能，否则走普通攻击
    const sk = matchSkill(kind);
    if (sk) {
      if (hero.st < sk.cost) { toast('体力不足'); return; }
      castSkill(sk);
      return;
    }
    const W = WEAPONS[hero.weapon];
    const now = performance.now() / 1000;

    if (kind === 'light') {
      if (hero.st < W.cost) { toast('体力不足'); return; }
      hero.st -= W.cost;
      hero.stDelay = 0.55;
      hero.comboStep = (now < hero.comboExpire) ? (hero.comboStep + 1) % 3 : 0;
      hero.comboExpire = now + W.time + 0.55;
      hero.state = 'light'; hero.stateT = 0; hero.hitDone = false;
      hero.swingDir = hero.comboStep % 2 === 0 ? 1 : -1;
      sfx('swing');
    } else {
      const H = W.heavy;
      if (hero.st < H.cost) { toast('体力不足'); return; }
      hero.st -= H.cost;
      hero.stDelay = 0.8;
      hero.state = 'heavy'; hero.stateT = 0; hero.hitDone = false;
      hero.comboStep = 2; hero.comboExpire = 0;
      sfx('swing');
    }
  }

  /* ------------------------- 指令技 ------------------------- */
  // 自动锁怪范围：搓招时方向键会带动角色转身，技能可能放空；
  // 释放瞬间强制朝向范围内最近的存活敌人（无目标则保持当前朝向）
  const LOCK_RANGE = 15;
  function nearestEnemy(x, z, maxR) {
    let best = null, bd = maxR * maxR;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const dx = e.pos.x - x, dz = e.pos.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }
  // 取窗口内有效的方向序列；返回匹配到的技能（优先匹配指令更长的）
  function matchSkill(btn) {
    const now = performance.now() / 1000;
    let seq = '';
    for (let i = cmdSeq.length - 1; i >= 0; i--) {
      if (now - cmdSeq[i].t > CMD_WINDOW) break;
      seq = cmdSeq[i].d + seq;
    }
    let best = null;
    const list = SKILLS[hero.weapon];
    for (let i = 0; i < list.length; i++) {
      const sk = list[i];
      if (sk.btn !== btn) continue;
      const dirs = sk.cmd.charAt(0) === 'k' ? sk.cmd.slice(1) : sk.cmd;
      if (!seq.endsWith(dirs)) continue;
      if (sk.cmd.charAt(0) === 'k') {
        if (dashT < 0 || now - dashT > 1.6) continue;
      }
      if (!best || sk.cmd.length > best.cmd.length) best = sk;
    }
    return best;
  }

  function castSkill(sk) {
    hero.st -= sk.cost;
    hero.stDelay = sk.ult ? 1.4 : 0.9;
    hero.state = 'skill'; hero.stateT = 0;
    hero.skill = sk; hero.skillHits = 0;
    hero.skillFrom = hero.pos.clone();   // 突进技的胶囊判定起点
    hero.comboStep = 0; hero.comboExpire = 0;
    hero.whiffT = 0;   // 反击窗口保留，技能可享用
    hero.iframe = Math.max(hero.iframe, sk.ult ? sk.dur * 0.92 : 0.2);
    hero.spin = 0;
    // 自动锁怪：搓招的方向输入可能让角色背对/偏离目标，释放瞬间矫正朝向，
    // 方向技不再因转向而 miss；同时给锁定目标脚下一个金环作为反馈
    const lockTgt = nearestEnemy(hero.pos.x, hero.pos.z, LOCK_RANGE);
    if (lockTgt) {
      hero.facing = Math.atan2(lockTgt.pos.x - hero.pos.x, lockTgt.pos.z - hero.pos.z);
      spawnRing(lockTgt.pos.x, groundH(lockTgt.pos.x, lockTgt.pos.z), lockTgt.pos.z, 1.1, 0xffe0a0, 0.42);
    }
    cmdSeq.length = 0; dashT = -1;
    shake = sk.ult ? 0.5 : 0.2;
    toast('「' + sk.name + '」', 1.5);
    sfx(sk.ult ? 'ult' : 'skill');
    // 释放瞬间的战吼："嘿/哈"，终极技喊"哈"并呼喊技能名
    shout(sk.ult ? 'ha' : (Math.random() < 0.5 ? 'hei' : 'ha'));
    if (sk.name) vox(sk.name);
    const col = SKILL_COLOR[hero.weapon];
    spawnParticles(new THREE.Vector3(hero.pos.x, hero.pos.y + 0.9, hero.pos.z), sk.ult ? 22 : 12, col, sk.ult ? 4.5 : 3, 0.16);
    if (sk.ult) { slowT = 0.22; timeScale = 0.35; }
  }

  // 单段技能命中：扇形/全周扫描，破防条、硬直、击退、特效一套走完
  // 突进类技能（有前冲位移段）改用「起点→当前位置」的胶囊判定，
  // 这样冲过敌人也不会 miss，符合突进技"一路上全都扫到"的手感
  function skillHit(h, sk) {
    const W = WEAPONS[hero.weapon];
    const lv = 1 + (level - 1) * 0.12;
    const counter = hero.counterT > 0;
    const dmg = h.dmg * lv * (counter ? 1.6 : 1);
    const brk = h.brk * lv * (counter ? 1.5 : 1);
    const full = h.arc >= 6.28;
    const dash = !!(sk && sk.moves && sk.moves.some(function (m) { return Math.abs(m.dist) > 1.5; }));
    let hitAny = false;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const dx = e.pos.x - hero.pos.x, dz = e.pos.z - hero.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dash) {
        // 胶囊：起点到当前点的线段距离
        const ax = hero.skillFrom.x, az = hero.skillFrom.z;
        const abx = hero.pos.x - ax, abz = hero.pos.z - az;
        const ab2 = abx * abx + abz * abz;
        let t = ab2 > 0.0001 ? ((e.pos.x - ax) * abx + (e.pos.z - az) * abz) / ab2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cdx = e.pos.x - (ax + abx * t), cdz = e.pos.z - (az + abz * t);
        if (Math.hypot(cdx, cdz) > h.range + e.radius) continue;
      } else {
        if (dist > h.range + e.radius) continue;
        if (!full && dist > 0.4) {
          const fwd = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
          const dot = (dx / dist) * fwd.x + (dz / dist) * fwd.z;
          if (dot < Math.cos(h.arc / 2) - 0.12) continue;
        }
      }
      hitAny = true;
      e.hp -= dmg;
      e.breakv = Math.min(e.maxBreak, e.breakv + brk);
      e.hitFlash = 0.22;
      const kb = new THREE.Vector3(dx, 0, dz);
      if (kb.lengthSq() < 0.001) kb.set(0, 0, 1);
      e.knock.add(kb.normalize().multiplyScalar(h.kb === undefined ? 0.6 : h.kb));
      if (e.breakv >= e.maxBreak && e.state !== 'stagger') {
        e.state = 'stagger'; e.stateT = 0; e.breakv = e.maxBreak;
        spawnParticles(new THREE.Vector3(e.pos.x, groundH(e.pos.x, e.pos.z) + 0.9, e.pos.z), 10, 0xffd166, 3.4, 0.16);
      }
      if (e.hp <= 0) killEnemy(e);
    }

    // 命中特效
    const gy = groundH(hero.pos.x, hero.pos.z);
    const ang = hero.facing;
    if (h.vfx === 'wave') {
      spawnWave(hero.pos.x + Math.sin(ang) * 0.8, gy + 1.0, hero.pos.z + Math.cos(ang) * 0.8, ang, SKILL_COLOR[hero.weapon], 14, 1.4, 0.4);
    } else if (h.vfx === 'crack') {
      spawnCrack(hero.pos.x, hero.pos.z, ang, 8, hero.weapon === 1 ? 0xff9a3c : 0x9fd8ff);
      spawnRing(hero.pos.x, gy, hero.pos.z, h.range, hero.weapon === 1 ? 0xffc46b : 0xbfe9ff, 0.5);
    } else if (h.vfx === 'mring') {
      spawnMovingRing(hero.pos.x, gy, hero.pos.z, ang, 3.4, 0xffc46b, 9, 0.55);
      spawnCrack(hero.pos.x, hero.pos.z, ang, 8, 0xff9a3c);
    }
    if (sk && sk.kind === 'spin') {
      for (let i = 0; i < 3; i++) spawnGust(hero.pos.x, gy, hero.pos.z, SKILL_COLOR[hero.weapon]);
    }
    if (sk && sk.kind === 'sweep') {
      spawnRing(hero.pos.x, gy, hero.pos.z, h.range, 0xd6fff0, 0.4);
      spawnWave(hero.pos.x, gy + 0.9, hero.pos.z, ang, 0xd6fff0, 12, 1.8, 0.42);
    }

    if (hitAny) {
      shake = Math.max(shake, sk && sk.ult ? 0.75 : (h.dmg >= 30 ? 0.5 : 0.28));
      hitStopT = Math.max(hitStopT, sk && sk.ult ? 0.1 : (h.dmg >= 30 ? 0.075 : 0.05));
      sfx(sk && sk.ult ? 'heavy' : (h.dmg >= 30 ? 'heavy' : 'hit'));
    }
  }

  // 终极技的场地级特效（rain 剑雨 / leap 跳砸 / spinU 旋风）
  function ultVfx(sk) {
    const gy = groundH(hero.pos.x, hero.pos.z);
    const h = sk.hits[0];
    if (sk.kind === 'rain') {
      castBlades(hero.pos.x, hero.pos.y, hero.pos.z, 14);
      spawnRing(hero.pos.x, gy, hero.pos.z, h.range, 0xbfe9ff, 0.55);
      spawnRing(hero.pos.x, gy, hero.pos.z, h.range * 0.6, 0xffffff, 0.4);
      shake = 0.6; hitStopT = 0.07; slowT = 0.25; timeScale = 0.35;
    } else if (sk.kind === 'leap') {
      spawnRing(hero.pos.x, gy, hero.pos.z, h.range, 0xffc46b, 0.6);
      spawnRing(hero.pos.x, gy, hero.pos.z, h.range * 0.55, 0xfff0c0, 0.42);
      spawnParticles(new THREE.Vector3(hero.pos.x, gy + 0.3, hero.pos.z), 20, 0xd8b070, 6, 0.22);
      spawnCrack(hero.pos.x, hero.pos.z, hero.facing, 8, 0xff9a3c);
      shake = 0.9; hitStopT = 0.1;
    } else {
      spawnRing(hero.pos.x, gy, hero.pos.z, h.range * 0.72, 0x9fe8ff, 0.32);
      for (let i = 0; i < 4; i++) spawnGust(hero.pos.x, gy, hero.pos.z, 0x9fe8ff);
      shake = 0.35; hitStopT = 0.04;
    }
    sfx('heavy');
  }

  function doDodge() {
    if (hero.dead) return;
    // 攻击后半段允许翻滚取消，手感更跟手
    const s = hero.state;
    const cancel = (s === 'light' && hero.stateT > 0.18 * WEAPONS[hero.weapon].time / 0.36) ||
      (s === 'heavy' && hero.stateT > 0.42);
    if (!cancel && !canAct()) return;
    if (hero.st < 16) { toast('体力不足'); return; }
    hero.st -= 16; hero.stDelay = 0.5;
    hero.state = 'dodge'; hero.stateT = 0;
    hero.comboStep = 0; hero.comboExpire = 0;

    const d = moveDir();
    if (d.lengthSq() < 0.01) {
      // 无方向输入：后撤步
      hero.roll = false;
      hero.dodgeDir.set(-Math.sin(hero.facing), 0, -Math.cos(hero.facing));
      hero.dodgeDur = 0.34; hero.dodgeSpeed = 11;
      hero.iframe = 0.24;
      hero.dodgeFresh = 0;
    } else {
      // 有方向输入：朝输入方向翻滚，并转身
      hero.roll = true;
      hero.dodgeDir.copy(d).normalize();
      hero.facing = Math.atan2(hero.dodgeDir.x, hero.dodgeDir.z);
      hero.dodgeDur = 0.50; hero.dodgeSpeed = 12;
      hero.iframe = 0.34;
      hero.dodgeFresh = 0.16;   // 起手瞬间的闪避才算"完美"
    }
    hero.dodgeId++;
    spawnParticles(new THREE.Vector3(hero.pos.x, groundH(hero.pos.x, hero.pos.z) + 0.16, hero.pos.z), 8, 0xb9c8dd, 2.6, 0.14);
    sfx('swing');
  }

  function startGuard() {
    if (!canAct() || hero.st < 6) return;
    hero.state = 'guard'; hero.stateT = 0; hero.parryTimer = 0.22;
  }

  function swapWeapon() {
    if (!canAct()) return;
    hero.weapon = (hero.weapon + 1) % 3;
    WEAPONS.forEach(function (w, i) { weaponMeshes[i].visible = i === hero.weapon; });
    ui.weaponName.textContent = WEAPONS[hero.weapon].name;
    spawnParticles(new THREE.Vector3(hero.pos.x, hero.pos.y + 1.1, hero.pos.z), 8, 0xffd88a, 2.2, 0.12);
    toast('切换：' + WEAPONS[hero.weapon].name, 1.1);
  }

  function tryHeal() {
    for (let i = 0; i < shrines.length; i++) {
      const s = shrines[i];
      if (Math.hypot(hero.pos.x - s.x, hero.pos.z - s.z) < 2.4) {
        if (hero.hp >= hero.maxHp) { toast('生命已满'); return; }
        hero.hp = hero.maxHp; hero.st = hero.maxSt;
        spawnParticles(new THREE.Vector3(s.x, s.y + 1.2, s.z), 16, 0x6ff0ff, 3, 0.14);
        sfx('heal');
        toast('锚点共鸣 · 生命恢复');
        return;
      }
    }
    toast('附近没有锚点', 1.0);
  }

  function moveDir() {
    const v = new THREE.Vector3();
    if (stick.active && stick.mag >= STICK_DEAD) {
      v.x = stick.kx; v.z = stick.ky;          // 摇杆：360° 模拟量
    } else {
      if (keys['w'] || keys['arrowup']) v.z -= 1;
      if (keys['s'] || keys['arrowdown']) v.z += 1;
      if (keys['a'] || keys['arrowleft']) v.x -= 1;
      if (keys['d'] || keys['arrowright']) v.x += 1;
    }
    if (v.lengthSq() > 0) v.normalize();
    return v;
  }
  // 移动速度缩放：摇杆倾斜越满跑得越快（最小约半速，避免蠕动）；键盘恒为全速
  function moveScale() {
    if (stick.active && stick.mag >= STICK_DEAD) {
      const t = (stick.mag - STICK_DEAD) / (1 - STICK_DEAD);
      return 0.45 + 0.55 * t;
    }
    return 1;
  }

  function resolveHit(isHeavy) {
    const W = WEAPONS[hero.weapon];
    const fwd = new THREE.Vector3(Math.sin(hero.facing), 0, Math.cos(hero.facing));
    const range = isHeavy ? W.range + 0.15 : W.range;
    const arc = isHeavy ? W.arc * 1.12 : W.arc;
    const counter = hero.counterT > 0;   // 完美闪避后的反击窗口
    let dmg = isHeavy ? W.heavy.dmg : W.dmg[hero.comboStep];
    let brk = isHeavy ? W.heavy.brk : 10 * W.breakMul * (hero.comboStep === 2 ? 1.6 : 1);
    if (counter) { dmg *= 1.6; brk *= 1.5; }
    let hitAny = false;

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const dx = e.pos.x - hero.pos.x, dz = e.pos.z - hero.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + e.radius) continue;
      if (dist > 0.7) {
        const dot = (dx / dist) * fwd.x + (dz / dist) * fwd.z;
        if (dot < Math.cos(arc / 2)) continue;
      }
      hitAny = true;
      hero.st = Math.min(hero.maxSt, hero.st + (isHeavy ? 6 : 3));   // 命中回体力
      const staggered = e.state === 'stagger';
      const mult = staggered ? 2.0 : 1.0;
      e.hp -= dmg * mult;
      e.breakv = Math.min(e.maxBreak, e.breakv + brk * (staggered ? 0 : 1));
      e.hitFlash = 0.16;
      const kb = new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(isHeavy ? 0.55 : 0.25);
      e.knock.add(kb);
      spawnParticles(new THREE.Vector3(e.pos.x, groundH(e.pos.x, e.pos.z) + 0.7, e.pos.z),
        isHeavy ? 9 : 5, e.type === 'stone' ? 0xbfc6d6 : 0x8ef0c2, isHeavy ? 4.5 : 3, 0.14);
      if (e.breakv >= e.maxBreak && e.state !== 'stagger') {
        e.state = 'stagger'; e.stateT = 0; e.breakv = e.maxBreak;
        toast('破 防 ！', 1.0);
        sfx('parry');
        spawnParticles(new THREE.Vector3(e.pos.x, groundH(e.pos.x, e.pos.z) + 0.9, e.pos.z), 14, 0xffd166, 3.6, 0.16);
      }
      if (e.hp <= 0) killEnemy(e);
    }

    if (hitAny) {
      if (counter) { hero.counterT = 0; toast('反击命中！', 1.0); }
      shake = isHeavy ? 0.42 : 0.22;
      hitStopT = isHeavy ? 0.075 : 0.045;
      sfx(isHeavy ? 'heavy' : 'hit');
    } else {
      hero.whiffT = 0.7;   // 挥空：给敌人惩罚窗口
    }
  }

  let killCount = 0;
  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    e.group.visible = false;
    e.bar.visible = false;
    spawnParticles(new THREE.Vector3(e.pos.x, groundH(e.pos.x, e.pos.z) + 0.6, e.pos.z), 16,
      e.type === 'stone' || e.type === 'elite' ? 0x9aa3b5 : 0x63c9a0, 5, 0.2);
    killCount++;
    levelKills++;
    totalKills++;
    const base = e.type === 'elite' ? 150 : e.type === 'stone' ? 40 : e.type === 'archer' ? 30 : 15;
    score += base;
    hero.st = Math.min(hero.maxSt, hero.st + 10);
    ui.killCount.textContent = enemiesLeft();
    ui.scoreNum.textContent = score;
    shake = 0.3;
    // 掉落：统领必掉，其他按概率
    const dropRate = e.type === 'elite' ? 1 : e.type === 'stone' ? 0.4 : 0.16;
    if (Math.random() < dropRate) {
      spawnOrb(e.pos.x, e.pos.y, e.pos.z, (e.type === 'elite' || Math.random() < 0.3) ? 'stam' : 'heal');
    }
    if (!hero.dead && enemiesLeft() === 0) levelClear();
  }

  // 完美闪避：无敌帧起始瞬间被攻击锁定
  function perfectDodge() {
    hero.dodgeFresh = 0;
    hero.counterT = 1.5;
    hero.st = Math.min(hero.maxSt, hero.st + 25);
    slowT = 0.3; timeScale = 0.3;
    shake = 0.35;
    sfx('parry');
    toast('完美闪避 · 反击窗口', 1.3);
    const gy = groundH(hero.pos.x, hero.pos.z);
    spawnRing(hero.pos.x, gy, hero.pos.z, 2.2, 0x9fe8ff, 0.4);
    spawnParticles(new THREE.Vector3(hero.pos.x, hero.pos.y + 1.0, hero.pos.z), 12, 0xbff4ff, 3.5, 0.13);
  }

  function damageHero(amount, fromPos) {
    if (hero.dead) return;
    if (hero.iframe > 0) {
      if (hero.dodgeFresh > 0) perfectDodge();
      return;
    }

    const away = new THREE.Vector3(hero.pos.x - fromPos.x, 0, hero.pos.z - fromPos.z);
    if (away.lengthSq() < 0.001) away.set(1, 0, 0);
    away.normalize();

    if (hero.state === 'guard') {
      if (hero.parryTimer > 0) {
        // 完美弹反
        hero.parryTimer = 0;
        shake = 0.5;
        slowT = 0.45; timeScale = 0.28;
        spawnParticles(new THREE.Vector3(hero.pos.x + away.x * -0.6, hero.pos.y + 1.1, hero.pos.z + away.z * -0.6), 18, 0xbff4ff, 4.5, 0.15);
        sfx('parry');
        toast('完美弹反 · 破防反制', 1.4);
        hero.st = Math.min(hero.maxSt, hero.st + 30);
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (e.dead) continue;
          if (Math.hypot(e.pos.x - hero.pos.x, e.pos.z - hero.pos.z) < 4.2) {
            e.state = 'stagger'; e.stateT = 0; e.breakv = e.maxBreak; e.hitFlash = 0.2;
            e.hp -= 12;
            if (e.hp <= 0) killEnemy(e);
          }
        }
        return;
      }
      amount *= 0.14;
      hero.st -= 16;
      sfx('hit');
      if (hero.st <= 0) {
        hero.st = 0;
        hero.state = 'stagger'; hero.stateT = 0; hero.staggerDur = 1.1;
        toast('格挡被击溃！', 1.2);
      }
    } else {
      sfx('hurt');
    }

    hero.hp -= amount;
    hero.iframe = 0.6;
    hero.pos.x += away.x * 0.35;
    hero.pos.z += away.z * 0.35;
    shake = 0.45;
    spawnParticles(new THREE.Vector3(hero.pos.x, hero.pos.y + 1.0, hero.pos.z), 7, 0xff6b6b, 3, 0.13);

    if (hero.hp <= 0) {
      hero.hp = 0;
      hero.dead = true;
      hero.deadT = 0;
      deaths++;
      toast('你被击倒了…', 2.0);
    }
  }

  function doEnemyHit(e) {
    if (e.type === 'archer') {
      const dx = hero.pos.x - e.pos.x, dz = hero.pos.z - e.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 13) {
        spawnShot(e.pos.x, e.pos.y + 0.75, e.pos.z, dx / d, dz / d, e.dmg);
        sfx('swing');
      }
      return;
    }
    if (e.type === 'elite') {
      // 统领震击：范围冲击波
      const dx = hero.pos.x - e.pos.x, dz = hero.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      spawnRing(e.pos.x, e.pos.y, e.pos.z, e.reach + 1.6, 0xd8a0ff, 0.45);
      spawnParticles(new THREE.Vector3(e.pos.x, e.pos.y + 0.4, e.pos.z), 14, 0xb06bff, 5, 0.2);
      if (dist <= e.reach + 1.2) damageHero(e.dmg, e.pos);
      shake = Math.max(shake, 0.3);
      sfx('heavy');
      return;
    }
    const dx = hero.pos.x - e.pos.x, dz = hero.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > e.reach + 0.75) return;
    const fx = Math.sin(e.group.rotation.y), fz = Math.cos(e.group.rotation.y);
    const dot = dist < 0.4 ? 1 : ((dx / dist) * fx + (dz / dist) * fz);
    if (dot < -0.1) return;
    damageHero(e.dmg, e.pos);
  }

  /* ------------------------- 更新 ------------------------- */
  function updateHero(dt) {
    hero.iframe = Math.max(0, hero.iframe - dt);
    hero.stateT += dt;
    hero.dodgeFresh = Math.max(0, hero.dodgeFresh - dt);
    hero.counterT = Math.max(0, hero.counterT - dt);
    hero.whiffT = Math.max(0, hero.whiffT - dt);

    if (hero.dead) {
      hero.deadT += dt;
      heroGroup.rotation.z = Math.min(1.45, hero.deadT * 3.4);
      heroGroup.position.y = hero.pos.y + Math.min(0.12, hero.deadT * 0.3);
      if (hero.deadT > 1.8) {
        hero.dead = false;
        hero.hp = hero.maxHp; hero.st = hero.maxSt;
        hero.pos.set(0, groundH(0, 2), 2);
        hero.state = 'idle';
        hero.spin = 0;
        heroGroup.rotation.z = 0;
        toast('裂片将你拉回…', 1.4);
      }
      return;
    }

    // 体力回复
    hero.stDelay = Math.max(0, hero.stDelay - dt);
    if (hero.stDelay <= 0 && hero.state !== 'guard') {
      hero.st = Math.min(hero.maxSt, hero.st + 26 * dt);
    }

    // 状态机
    const W = WEAPONS[hero.weapon];
    let pose = null, poseP = 0, poseDir = 1;

    if (hero.state === 'light') {
      const dur = W.time;
      if (!hero.hitDone && hero.stateT >= dur * W.hitAt) { hero.hitDone = true; resolveHit(false); }
      poseP = clamp01(hero.stateT / dur);
      const L = W.lungeLight;
      if (poseP > L.a && poseP < L.b) {
        const step = L.dist * dt / Math.max(0.05, (L.b - L.a) * dur);
        hero.pos.x += Math.sin(hero.facing) * step;
        hero.pos.z += Math.cos(hero.facing) * step;
      }
      const set = POSE_SETS[hero.weapon];
      pose = set.light[hero.comboStep] || set.light[0];
      poseDir = hero.weapon === 0 ? (hero.comboStep === 2 ? 1 : hero.swingDir) : 1;
      if (hero.stateT >= dur) { hero.state = 'idle'; hero.stateT = 0; }
    } else if (hero.state === 'heavy') {
      const H = W.heavy;
      const dur = H.time;
      if (!hero.hitDone && hero.stateT >= dur * H.hitAt) { hero.hitDone = true; resolveHit(true); }
      poseP = clamp01(hero.stateT / dur);
      const L = H.lunge;
      if (poseP > L.a && poseP < L.b) {
        const step = L.dist * dt / Math.max(0.05, (L.b - L.a) * dur);
        hero.pos.x += Math.sin(hero.facing) * step;
        hero.pos.z += Math.cos(hero.facing) * step;
      }
      pose = POSE_SETS[hero.weapon].heavy;
      if (hero.stateT >= dur) { hero.state = 'idle'; hero.stateT = 0; }
    } else if (hero.state === 'skill') {
      const sk = hero.skill;
      poseP = clamp01(hero.stateT / sk.dur);
      pose = SKILL_POSES[hero.weapon][sk.pose] || SKILL_POSES[hero.weapon].ult;
      // 位移段（支持后退 dist 为负）
      if (sk.moves) {
        for (let i = 0; i < sk.moves.length; i++) {
          const L = sk.moves[i];
          if (poseP > L.a && poseP < L.b) {
            const step = L.dist * dt / Math.max(0.05, (L.b - L.a) * sk.dur);
            hero.pos.x += Math.sin(hero.facing) * step;
            hero.pos.z += Math.cos(hero.facing) * step;
          }
        }
      }
      // 旋身类：整体绕自身旋转
      if (sk.kind === 'spin' && sk.spin) {
        hero.spin = smooth(clamp01((poseP - sk.spin.from) / (sk.spin.to - sk.spin.from))) * Math.PI * 2 * sk.spin.turns;
      } else if (sk.kind === 'spinU') {
        hero.spin = smooth(clamp01((poseP - 0.12) / 0.78)) * Math.PI * 4;
      }
      // 斧终极：起跳前冲
      if (sk.kind === 'leap' && poseP < 0.6) {
        hero.pos.x += Math.sin(hero.facing) * 2.6 * dt;
        hero.pos.z += Math.cos(hero.facing) * 2.6 * dt;
      }
      // 逐段命中
      while (hero.skillHits < sk.hits.length && poseP >= sk.hits[hero.skillHits].at) {
        const h = sk.hits[hero.skillHits];
        hero.skillHits++;
        if (sk.ult && hero.skillHits === 1) { skillHit(h, sk); ultVfx(sk); }
        else skillHit(h, sk);
      }
      // 旋身类持续残影
      if ((sk.kind === 'spin' || sk.kind === 'spinU') && poseP > 0.1 && poseP < 0.9 && Math.random() < 0.5) {
        const gy = groundH(hero.pos.x, hero.pos.z);
        spawnGust(hero.pos.x, gy, hero.pos.z, SKILL_COLOR[hero.weapon]);
      }
      if (hero.stateT >= sk.dur) { hero.state = 'idle'; hero.stateT = 0; hero.spin = 0; hero.skill = null; }
    } else if (hero.state === 'dodge') {
      const p = clamp01(hero.stateT / hero.dodgeDur);
      const spd = hero.dodgeSpeed * (1 - smooth(seg(p, 0.35, 1)));
      hero.pos.x += hero.dodgeDir.x * spd * dt;
      hero.pos.z += hero.dodgeDir.z * spd * dt;
      // 穿袭：翻滚途中切过敌人造成伤害并回体力——闪避从此是进攻选择
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.dead || e.dashedId === hero.dodgeId) continue;
        if (Math.hypot(e.pos.x - hero.pos.x, e.pos.z - hero.pos.z) < 1.25 + e.radius) {
          e.dashedId = hero.dodgeId;
          const dmg = 10 + level * 2;
          e.hp -= dmg;
          e.hitFlash = 0.16;
          e.breakv = Math.min(e.maxBreak, e.breakv + 8);
          hero.st = Math.min(hero.maxSt, hero.st + 8);
          spawnParticles(new THREE.Vector3(e.pos.x, e.pos.y + 0.7, e.pos.z), 8, 0xbff4ff, 3.5, 0.13);
          if (e.hp <= 0) killEnemy(e);
          else if (e.state !== 'stagger') { e.state = 'stagger'; e.stateT = 0; }
          toast('穿袭 +' + dmg, 0.9);
          sfx('hit');
        }
      }
      if (hero.stateT >= hero.dodgeDur) { hero.state = 'idle'; hero.stateT = 0; }
    } else if (hero.state === 'stagger') {
      if (hero.stateT >= (hero.staggerDur || 0.9)) { hero.state = 'idle'; hero.stateT = 0; }
    } else if (hero.state === 'guard') {
      hero.parryTimer = Math.max(0, (hero.parryTimer || 0) - dt);
      hero.stDelay = 0.25;
    } else {
      // 移动
      const d = moveDir();
      const speed = 4.6 * moveScale();
      if (d.lengthSq() > 0.001) {
        hero.pos.x += d.x * speed * dt;
        hero.pos.z += d.z * speed * dt;
        hero.facing = Math.atan2(d.x, d.z);
        hero.walkPhase += dt * 9;
      } else {
        hero.walkPhase += dt * 2;
      }
    }

    // 碰撞与边界
    const lim = HALF - 3;
    hero.pos.x = Math.max(-lim, Math.min(lim, hero.pos.x));
    hero.pos.z = Math.max(-lim, Math.min(lim, hero.pos.z));
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const dx = hero.pos.x - c.x, dz = hero.pos.z - c.z;
      const dd = Math.hypot(dx, dz);
      const minD = c.r + 0.32;
      if (dd < minD && dd > 0.0001) {
        hero.pos.x = c.x + (dx / dd) * minD;
        hero.pos.z = c.z + (dz / dd) * minD;
      }
    }
    hero.pos.y = groundH(hero.pos.x, hero.pos.z);

    /* ---- 姿态 ---- */
    heroGroup.rotation.y = hero.facing + hero.spin;

    const md = moveDir();
    const moving = hero.state === 'idle' && md.lengthSq() > 0.001;
    const legSwing = moving ? Math.sin(hero.walkPhase) * 0.68 : Math.sin(hero.walkPhase) * 0.05;
    legL.rotation.x = legSwing;
    legR.rotation.x = -legSwing;

    let target;
    if (hero.state === 'light' || hero.state === 'heavy' || hero.state === 'skill') {
      target = samplePose(pose, poseP, poseDir);
    } else if (hero.state === 'dodge') {
      target = samplePose(hero.roll ? P_ROLL_TUCK : P_BACKSTEP, 1, 1);
    } else if (hero.state === 'guard') {
      target = samplePose(P_GUARD, 1, 1);
    } else if (hero.state === 'stagger') {
      target = samplePose(P_STAGGER, 1, 1);
    } else {
      target = samplePose(P_IDLE, 1, 1);
    }
    // 攻击/技能由关键帧本身保证顺滑，直接跟帧；其余状态做软过渡避免突变
    applyPose(target, dt, hero.state === 'light' || hero.state === 'heavy' || hero.state === 'skill');

    // 走动时手臂自然摆动，叠在基础站姿上
    if (hero.state === 'idle') {
      armL.rotation.x += -legSwing * 0.6;
      armR.rotation.x += legSwing * 0.4;
    }

    // 挥击窗口内持续生成拖影，连成挥砍轨迹
    if (hero.state === 'light' || hero.state === 'heavy') {
      let dur2, hitAt2, win;
      if (hero.state === 'light') { dur2 = W.time; hitAt2 = W.hitAt; win = 0.16; }
      else { dur2 = W.heavy.time; hitAt2 = W.heavy.hitAt; win = 0.18; }
      const hp2 = hero.stateT / dur2;
      if (hp2 > hitAt2 - win && hp2 < hitAt2 + win * 0.7) spawnTrail(TRAIL_COLOR[hero.weapon]);
    } else if (hero.state === 'skill') {
      // 技能挥砍窗口：每个命中段前后各铺拖影
      const sk2 = hero.skill;
      if (sk2 && sk2.kind !== 'rain' && sk2.kind !== 'leap' && sk2.kind !== 'spinU') {
        for (let i = 0; i < sk2.hits.length; i++) {
          const at = sk2.hits[i].at;
          if (poseP > at - 0.09 && poseP < at + 0.06) spawnTrail(SKILL_COLOR[hero.weapon]);
        }
      }
    }

    // 闪避：朝输入方向做前滚翻，无输入则后撤步
    if (hero.state === 'dodge') {
      const p = clamp01(hero.stateT / hero.dodgeDur);
      if (hero.roll) {
        const th = p * Math.PI * 2;
        heroGroup.rotation.x = th;
        // 绕髋部旋转时的位置补偿，让身体绕自身中心翻而不是绕着脚底转
        heroGroup.position.y = hero.pos.y + 0.5 * (1 - Math.cos(th)) + Math.sin(th) * 0.06;
        const back = -0.5 * Math.sin(th);
        heroGroup.position.x += Math.sin(hero.facing) * back;
        heroGroup.position.z += Math.cos(hero.facing) * back;
        heroGroup.position.y += Math.max(0, Math.sin(th)) * 0.30;
        legL.rotation.x = -1.55;
        legR.rotation.x = -1.45;
      } else {
        heroGroup.rotation.x = -Math.sin(p * Math.PI) * 0.5;
        heroGroup.position.y += Math.sin(p * Math.PI) * 0.12;
      }
    }

    // 斧终极滞空时收腿
    if (hero.state === 'skill' && hero.skill && hero.skill.kind === 'leap' && rig.hy > 0.2) {
      legL.rotation.x = -0.95;
      legR.rotation.x = 0.55;
    }

    if (hero.dead) heroGroup.rotation.z = 1.45;
  }

  function updateEnemies(dt) {
    // 本帧正在攻击的敌人数量（攻击令牌：限制同时出手，形成包围而非一拥而上）
    let attacking = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      if (e.state === 'windup' || e.state === 'strike') attacking++;
    }

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;

      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.bob += dt * 3.2;
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.circleDir *= -1; e.strafeT = 1.1 + Math.random() * 1.4; }

      // 击退位移
      e.pos.x += e.knock.x; e.pos.z += e.knock.z;
      e.knock.multiplyScalar(0.82);

      const dx = hero.pos.x - e.pos.x, dz = hero.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz) || 0.0001;
      const nx = dx / dist, nz = dz / dist;

      if (e.state === 'stagger') {
        e.stateT += dt;
        if (e.stateT > 2.2) { e.state = 'idle'; e.stateT = 0; e.breakv = 0; }
      } else if (e.state === 'windup') {
        e.stateT += dt;
        // 前摇期间微幅贴近，压迫感
        e.pos.x += nx * e.speed * 0.22 * dt;
        e.pos.z += nz * e.speed * 0.22 * dt;
        if (e.stateT >= e.windup) { e.state = 'strike'; e.stateT = 0; doEnemyHit(e); }
      } else if (e.state === 'strike') {
        e.stateT += dt;
        if (e.stateT > 0.2) { e.state = 'recover'; e.stateT = 0; }
      } else if (e.state === 'recover') {
        e.stateT += dt;
        if (e.stateT > (e.type === 'stone' ? 0.75 : e.type === 'elite' ? 0.85 : 0.55)) {
          e.state = 'chase'; e.stateT = 0;
        }
      } else {
        /* ---- 追击 / 游走 / 伺机 ---- */
        if (e.type === 'archer') {
          // 弩手：保持 6.5–10.5 米射击带，太近后撤，太远接近
          if (dist > 10.5) {
            e.pos.x += nx * e.speed * dt;
            e.pos.z += nz * e.speed * dt;
          } else if (dist < 5.5) {
            e.pos.x -= nx * e.speed * 0.9 * dt;
            e.pos.z -= nz * e.speed * 0.9 * dt;
          } else {
            e.pos.x += -nz * e.circleDir * e.speed * 0.42 * dt;
            e.pos.z += nx * e.circleDir * e.speed * 0.42 * dt;
          }
          e.shootCd -= dt;
          if (dist < 12 && e.shootCd <= 0 && attacking <= attackTokens + 1) {
            e.state = 'windup'; e.stateT = 0; e.shootCd = 1.6 + Math.random() * 0.8;
          }
        } else {
          // 近战：进入攻击距离且有令牌才出手，否则绕圈包抄
          if (dist < e.aggro) {
            e.state = 'chase';
            // 玩家收招（挥空/大后摇）时全队压上——惩罚乱出手
            const punish = hero.whiffT > 0 || (hero.state === 'heavy' && hero.stateT > 0.35);
            const spd = e.speed * (punish ? 1.65 : 1);
            if (dist <= e.reach && attacking <= attackTokens) {
              e.state = 'windup'; e.stateT = 0;
            } else if (dist <= e.reach * 1.75 && attacking > attackTokens && !punish) {
              // 绕圈：等前排出手后再补位
              const orbit = e.reach * 1.45;
              const tx = hero.pos.x - nx * orbit, tz = hero.pos.z - nz * orbit;
              const mx = tx - e.pos.x, mz = tz - e.pos.z;
              const ml = Math.hypot(mx, mz) || 1;
              e.pos.x += (mx / ml) * e.speed * 0.7 * dt + -nz * e.circleDir * e.speed * 0.5 * dt;
              e.pos.z += (mz / ml) * e.speed * 0.7 * dt + nx * e.circleDir * e.speed * 0.5 * dt;
            } else {
              e.pos.x += nx * spd * dt;
              e.pos.z += nz * spd * dt;
            }
          }
        }

        // 统领：周期性唤来侵蚀体
        if (e.type === 'elite') {
          e.summonT -= dt;
          if (e.summonT <= 0 && enemiesLeft() < 22) {
            e.summonT = 8.5;
            for (let k = 0; k < 2; k++) {
              const a = Math.random() * Math.PI * 2;
              const sx = e.pos.x + Math.cos(a) * 2.6, sz = e.pos.z + Math.sin(a) * 2.6;
              if (Math.abs(sx) < HALF - 3 && Math.abs(sz) < HALF - 3) spawnEnemy('slime', sx, sz, {
                hpMul: 1 + (level - 1) * 0.2, dmgMul: 1 + (level - 1) * 0.1, spdMul: 1
              });
            }
            spawnRing(e.pos.x, e.pos.y, e.pos.z, 2.6, 0xc98bff, 0.5);
            spawnParticles(new THREE.Vector3(e.pos.x, e.pos.y + 1.4, e.pos.z), 12, 0xb06bff, 3, 0.18);
            toast('统领唤来了侵蚀体', 1.2);
            sfx('parry');
          }
        }
      }

      // 敌人互相分离
      for (let j = i + 1; j < enemies.length; j++) {
        const o = enemies[j];
        if (o.dead) continue;
        const ox = o.pos.x - e.pos.x, oz = o.pos.z - e.pos.z;
        const od = Math.hypot(ox, oz);
        const minD = e.radius + o.radius + 0.1;
        if (od < minD && od > 0.0001) {
          const push = (minD - od) * 0.5;
          e.pos.x -= (ox / od) * push; e.pos.z -= (oz / od) * push;
          o.pos.x += (ox / od) * push; o.pos.z += (oz / od) * push;
        }
      }

      // 边界
      const lim = HALF - 3;
      e.pos.x = Math.max(-lim, Math.min(lim, e.pos.x));
      e.pos.z = Math.max(-lim, Math.min(lim, e.pos.z));
      e.pos.y = groundH(e.pos.x, e.pos.z);

      // 朝向（弩手只在射击时快速转身，游走时侧身）
      if (dist > 0.1) {
        const target = Math.atan2(dx, dz);
        let diff = target - e.group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const rate = (e.state === 'windup' || e.state === 'strike') ? 14 : 5;
        e.group.rotation.y += diff * Math.min(1, dt * rate);
      }

      // 表现
      const hopBase = (e.type === 'slime' || e.type === 'archer') ? Math.abs(Math.sin(e.bob)) * 0.12 : 0;
      e.group.position.set(e.pos.x, e.pos.y, e.pos.z);
      e.body.position.y = e.bodyY + hopBase;
      if (e.type === 'elite') {
        const pulse = e.state === 'windup' ? 1 + Math.sin(e.stateT * 30) * 0.05 : 1;
        e.group.scale.setScalar(pulse);
      }

      const flash = e.hitFlash > 0;
      const wind = e.state === 'windup';
      e.bodyMat.emissive.setHex(flash ? 0xffffff : (wind ? 0x6a1f12 : (e.state === 'stagger' ? 0x4a3a00 : 0x000000)));
      if (flash) e.bodyMat.emissiveIntensity = 0.9;

      e.bar.visible = dist < 13;
      e.bar.position.set(e.pos.x, e.pos.y + e.barH, e.pos.z);
      e.bar.quaternion.copy(camera.quaternion);
      const ratio = Math.max(0, e.hp / e.maxHp);
      e.barFill.scale.x = ratio;
      e.barFill.position.x = -(1 - ratio) / 2;
      e.barFill.material.color.setHex(e.breakv > 0 ? 0xffb347 : 0xff5f6d);
    }
  }

  function updateCamera(dt) {
    // 跳跃/滞空时镜头跟一部分高度，避免角色冲出画面
    const lift = rig.hy * 0.6;
    const goalX = hero.pos.x;
    const goalY = hero.pos.y + rig.hy * 0.5 + CAM_OFF.y;
    const goalZ = hero.pos.z + CAM_OFF.z;
    const k = 1 - Math.pow(0.0015, dt);
    camera.position.x += (goalX - camera.position.x) * k;
    camera.position.y += (goalY - camera.position.y) * k;
    camera.position.z += (goalZ - camera.position.z) * k;

    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.pow(0.02, dt);
    }
    camera.lookAt(hero.pos.x, hero.pos.y + lift + 0.95, hero.pos.z);
  }

  /* ------------------------- 小地图 ------------------------- */
  // 世界坐标 → 小地图像素（全图映射：SIZE×SIZE 场地 → 方形画布，圆形裁剪）
  const MAP_COLOR = { slime: '#ff6b6b', stone: '#ff9f43', archer: '#ffd166', elite: '#c084fc', boss: '#ff3b3b' };
  const MAP_DOT = { slime: 3, stone: 4, archer: 3, elite: 5, boss: 8 };
  function mmSize() {
    const cv = ui.minimap;
    if (!cv) return 0;
    const s = Math.max(64, Math.round(cv.clientWidth) || 132);
    if (cv.width !== s) { cv.width = s; cv.height = s; }
    return s;
  }
  function mmW2P(v, s) { return (v + HALF) / SIZE * s; }

  // 当前锁定目标（与 HUD 目标框同一套逻辑：9 米内最近存活敌人）
  function lockTarget() {
    let target = null, best = 9;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - hero.pos.x, e.pos.z - hero.pos.z);
      if (d < best) { best = d; target = e; }
    }
    return target;
  }

  function drawMinimap() {
    const cv = ui.minimap;
    if (!cv) return;
    const s = mmSize();
    const ctx = cv.getContext('2d');
    const k = s / 132;   // 元素尺寸随画布缩放（桌面 132 / 手机 104）
    ctx.clearRect(0, 0, s, s);

    // 圆形裁剪
    ctx.save();
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    ctx.clip();

    // 半透明底盘：不挡视野的"透明"小地图
    const bg = ctx.createRadialGradient(s / 2, s / 2, s * 0.08, s / 2, s / 2, s * 0.5);
    bg.addColorStop(0, 'rgba(10,16,28,0.60)');
    bg.addColorStop(1, 'rgba(6,10,18,0.80)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, s, s);

    // 中心十字：方位参照
    ctx.strokeStyle = 'rgba(120,160,220,0.16)';
    ctx.lineWidth = Math.max(1, k);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s);
    ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
    ctx.stroke();

    // 锚点（治疗点）：青色小点
    for (let i = 0; i < shrines.length; i++) {
      const sx = mmW2P(shrines[i].x, s), sz = mmW2P(shrines[i].z, s);
      ctx.fillStyle = 'rgba(111,216,255,0.85)';
      ctx.fillRect(sx - 1.5 * k, sz - 1.5 * k, 3 * k, 3 * k);
    }

    // 怪物彩点：按类型分色，一眼分辨威胁构成；当前目标加脉冲光环
    const tgt = lockTarget();
    const now = performance.now() / 1000;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const px = mmW2P(e.pos.x, s), pz = mmW2P(e.pos.z, s);
      const col = MAP_COLOR[e.type] || '#ff6b6b';
      const r = (MAP_DOT[e.type] || 3) * k;
      if (e === tgt) {
        ctx.strokeStyle = 'rgba(255,216,138,0.9)';
        ctx.lineWidth = 1.5 * k;
        ctx.beginPath();
        ctx.arc(px, pz, r + 3 * k + Math.sin(now * 6) * 1.2 * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 4 * k;
      ctx.beginPath();
      ctx.arc(px, pz, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 玩家：金色三角，指向当前朝向（世界 +Z 在画布上是"下"）
    ctx.save();
    ctx.translate(mmW2P(hero.pos.x, s), mmW2P(hero.pos.z, s));
    ctx.rotate(Math.PI / 2 - hero.facing);
    ctx.fillStyle = '#ffd88a';
    ctx.strokeStyle = 'rgba(20,16,8,0.9)';
    ctx.lineWidth = Math.max(1, k);
    ctx.beginPath();
    ctx.moveTo(5.5 * k, 0); ctx.lineTo(-3.5 * k, 3.4 * k); ctx.lineTo(-3.5 * k, -3.4 * k);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // 解除圆形裁剪

    // 外圈边框
    ctx.strokeStyle = 'rgba(140,170,220,0.5)';
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - k, 0, Math.PI * 2);
    ctx.stroke();
  }

  function updateHUD(dt) {
    const hpRatio = Math.max(0, hero.hp / hero.maxHp);
    const stRatio = Math.max(0, hero.st / hero.maxSt);
    ui.hpFill.style.transform = 'scaleX(' + hpRatio + ')';
    ui.stFill.style.transform = 'scaleX(' + stRatio + ')';
    ui.hpText.textContent = Math.ceil(hero.hp) + '/' + hero.maxHp;
    ui.stText.textContent = Math.ceil(hero.st);

    // 指令显示：窗口内的输入序列 + 预匹配技能名
    const now = performance.now() / 1000;
    let seq = '';
    for (let i = cmdSeq.length - 1; i >= 0; i--) {
      if (now - cmdSeq[i].t > CMD_WINDOW) break;
      seq = cmdSeq[i].d + seq;
    }
    const arrow = { u: '↑', d: '↓', l: '←', r: '→' };
    let shown = '';
    for (let i = 0; i < seq.length; i++) shown += arrow[seq.charAt(i)] || seq.charAt(i);
    if (dashT >= 0 && now - dashT < 1.6) shown = '␣' + shown;
    ui.cmdSeq.textContent = shown || '—';
    const pending = matchSkill('light') || matchSkill('heavy');
    ui.cmdName.textContent = pending ? '「' + pending.name + '」' : '';
    ui.cmdName.classList.toggle('on', !!pending);

    // 当前武器终极技提示
    const ult = SKILLS[hero.weapon][SKILLS[hero.weapon].length - 1];
    ui.ultName.textContent = ult.name;
    ui.ultCmd.textContent = IS_TOUCH ? '␣↓↓ + 重击' : '␣↓↓ + 右键';

    ui.comboNum.textContent = now < hero.comboExpire ? hero.comboStep + 1 : 0;

    // 锁定最近敌人
    let target = null, best = 9;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - hero.pos.x, e.pos.z - hero.pos.z);
      if (d < best) { best = d; target = e; }
    }
    if (target) {
      ui.targetFrame.classList.add('on');
      ui.targetLabel.textContent = ENEMY_LABEL[target.type] || '侵蚀体';
      ui.targetHp.textContent = Math.max(0, Math.ceil(target.hp));
      const r = Math.max(0, target.breakv / target.maxBreak);
      ui.targetFill.style.transform = 'scaleX(' + r + ')';
    } else {
      ui.targetFrame.classList.remove('on');
    }

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.classList.remove('on');
    }

    drawMinimap();
  }

  function updateShrines(dt) {
    const t = performance.now() / 1000;
    for (let i = 0; i < shrines.length; i++) {
      shrines[i].ring.rotation.z = t * 0.9 + i;
      shrines[i].ring.scale.setScalar(1 + Math.sin(t * 2 + i) * 0.05);
    }
  }

  /* ------------------------- 主循环 ------------------------- */
  const clock = new THREE.Clock();
  let started = false;

  function loop() {
    requestAnimationFrame(loop);
    let dt = Math.min(0.05, clock.getDelta());

    if (!running) {
      Music.update(dt || 0.016);
      updateCamera(dt || 0.016);
      renderer.render(scene, camera);
      return;
    }
    // 调试模式：由外部脚本逐帧驱动，便于确定性截图
    if (window.__SR && window.__SR.manual) {
      renderer.render(scene, camera);
      return;
    }

    if (slowT > 0) { slowT -= dt; if (slowT <= 0) timeScale = 1; }
    let sdt = dt * timeScale;
    if (hitStopT > 0) { hitStopT -= dt; sdt = 0; }

    updateHero(sdt);
    updateEnemies(sdt);
    recomputeMusic();
    Music.update(dt);
    updateParticles(sdt);
    updateRings(sdt);
    updateBlades(sdt);
    updateTrail(sdt);
    updateWaves(sdt);
    updateMovingRings(sdt);
    updateCracks(sdt);
    updateGusts(sdt);
    updateShots(sdt);
    updateOrbs(sdt);
    updateShrines(dt);
    if (!hero.dead) levelTime += dt;
    updateCamera(dt);
    updateHUD(dt);

    renderer.render(scene, camera);
  }

  /* ------------------------- 流程控制 ------------------------- */
  let winAction = resetGame;

  function levelClear() {
    running = false;
    const cfg = levelCfg(level);
    ui.winScreen.classList.remove('hide');
    ui.winLogo.innerHTML = '第 ' + level + ' 裂片已净化<small>' + cfg.name + ' · SHARD PURIFIED</small>';
    ui.winText.innerHTML =
      '本关击杀 <b style="color:#8ee6c0">' + levelKills + '</b> · 用时 <b style="color:#8ee6c0">' + levelTime.toFixed(1) + 's</b><br>' +
      '累计分数 <b style="color:#ffd88a">' + score + '</b> · 累计击杀 <b style="color:#ffd88a">' + totalKills + '</b> · 倒下 <b style="color:#ff8a8a">' + deaths + '</b> 次<br>' +
      '下一块裂片正在下沉——侵蚀体会更多、更凶。';
    ui.againBtn.textContent = '前 往 下 一 裂 片';
    winAction = nextLevel;
    sfx('heal');
  }

  function nextLevel() {
    level++;
    const cfg = levelCfg(level);
    clearField();
    spawnWave(cfg);
    levelKills = 0; levelTime = 0;
    ui.region.textContent = '碎境大陆 · ' + cfg.name;
    ui.levelNum.textContent = level;
    ui.killCount.textContent = enemiesLeft();
    // 过关补给：部分回血 + 满体力
    hero.hp = Math.min(hero.maxHp, hero.hp + 45);
    hero.st = hero.maxSt;
    hero.pos.set(0, groundH(0, 2), 2);
    hero.state = 'idle'; hero.stateT = 0; hero.dead = false; hero.deadT = 0;
    hero.iframe = 1.2; hero.comboStep = 0; hero.comboExpire = 0;
    applyPose(samplePose(P_IDLE, 1, 1), 0, true);
    ui.winScreen.classList.add('hide');
    running = true;
    clock.getDelta();
    toast('第 ' + level + ' 裂片 · ' + cfg.name + ' · 剩余 ' + enemiesLeft(), 2.6);
    spawnRing(hero.pos.x, hero.pos.y, hero.pos.z, 3.4, 0x8ee6c0, 0.6);
    sfx('parry');
  }

  function startGame() {
    ui.startScreen.classList.add('hide');
    ui.winScreen.classList.add('hide');
    initAudio();
    Music.start('adventure');
    if (!started) {
      started = true;
      hero.pos.set(0, groundH(0, 2), 2);
      camera.position.set(hero.pos.x, hero.pos.y + CAM_OFF.y, hero.pos.z + CAM_OFF.z);
      loop();
    }
    running = true;
    clock.getDelta();
    toast('第 1 裂片 · 击败全部侵蚀体', 2.4);
  }

  function resetGame() {
    // 重打当前裂片
    const cfg = levelCfg(level);
    clearField();
    spawnWave(cfg);
    levelKills = 0; levelTime = 0;
    ui.region.textContent = '碎境大陆 · ' + cfg.name;
    ui.levelNum.textContent = level;
    ui.killCount.textContent = enemiesLeft();
    hero.hp = hero.maxHp; hero.st = hero.maxSt;
    hero.pos.set(0, groundH(0, 2), 2);
    hero.state = 'idle'; hero.stateT = 0; hero.comboStep = 0; hero.dead = false; hero.deadT = 0;
    hero.spin = 0; hero.iframe = 1.0;
    hero.counterT = 0; hero.whiffT = 0; hero.dodgeFresh = 0;
    applyPose(samplePose(P_IDLE, 1, 1), 0, true);
    ui.winScreen.classList.add('hide');
    running = true;
    clock.getDelta();
    toast('重整旗鼓 · 第 ' + level + ' 裂片', 1.8);
  }

  ui.againBtn.addEventListener('click', function () { winAction(); });

  document.getElementById('startBtn').addEventListener('click', startGame);

  // 调试入口：?auto 直接进入（便于截图/录屏检查）
  if (new URLSearchParams(location.search).has('auto')) {
    setTimeout(startGame, 60);
  }

  // 首帧渲染（开场画面背后也看到世界）
  heroGroup.position.copy(hero.pos);
  camera.position.set(hero.pos.x, hero.pos.y + CAM_OFF.y, hero.pos.z + CAM_OFF.z);
  camera.lookAt(hero.pos.x, hero.pos.y + 0.95, hero.pos.z);
  renderer.render(scene, camera);

  /* ------------------------- 调试接口 ------------------------- */
  // 仅供自动化联调/截图使用，不影响正常玩法
  window.__SR = {
    hero: hero, enemies: enemies, WEAPONS: WEAPONS, manual: false,
    start: startGame, reset: resetGame, next: nextLevel, clear: levelClear,
    spawnWave: spawnWave, levelCfg: levelCfg, clearField: clearField,
    enemiesLeft: enemiesLeft,
    spawn: spawnEnemy, shots: shots, orbs: orbs, levelCfg: levelCfg,
    state: function () { return hero.state; },
    level: function () { return level; },
    score: function () { return score; },
    equip: function (i) {
      hero.weapon = i;
      weaponMeshes.forEach(function (m, k) { m.visible = k === i; });
      ui.weaponName.textContent = WEAPONS[i].name;
    },
    setCombo: function (n) { hero.comboStep = n; },
    // 直接向指令缓冲注入序列并触发攻击，用于指令技联调
    cast: function (cmd, btn) {
      const dash = cmd.charAt(0) === 'k';
      const now = performance.now() / 1000;
      cmdSeq.length = 0;
      for (let i = 0; i < cmd.length; i++) if (cmd.charAt(i) !== 'k') cmdSeq.push({ d: cmd.charAt(i), t: now });
      dashT = dash ? now : -1;
      tryAttack(btn);
    },
    // 只注入指令缓冲（不触发攻击），用于 HUD 预匹配显示验证
    inject: function (cmd) {
      const dash = cmd.charAt(0) === 'k';
      const now = performance.now() / 1000;
      cmdSeq.length = 0;
      for (let i = 0; i < cmd.length; i++) if (cmd.charAt(i) !== 'k') cmdSeq.push({ d: cmd.charAt(i), t: now });
      dashT = dash ? now : -1;
    },
    // 清空指令缓冲（测试隔离用）
    cmdReset: function () { cmdSeq.length = 0; dashT = -1; },
    // 小地图联调：世界坐标 → 画布像素取色 [r,g,b,a]；返回当前绘制的怪物点清单
    mmPixel: function (wx, wz) {
      const s = mmSize();
      if (!s) return null;
      const d = ui.minimap.getContext('2d')
        .getImageData(Math.round(mmW2P(wx, s)), Math.round(mmW2P(wz, s)), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    },
    mmBlips: function () {
      const out = [];
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.dead) continue;
        out.push({ x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2), type: e.type });
      }
      return out;
    },
    mmShrines: function () {
      return shrines.map(function (r) { return { x: +r.x.toFixed(2), z: +r.z.toFixed(2) }; });
    },
    skills: function () { return SKILLS[hero.weapon].map(function (s) { return s.name; }); },
    // 音频联调钩子
    audioOn: function () { initAudio(); if (actx) Music.start('adventure'); return !!actx; },
    musicMode: function () { return Music.getMode(); },
    musicPlaying: function () { return Music.isPlaying(); },
    musicScheduled: function () { return Music.scheduled(); },
    musicMuted: function () { return Music.isMuted(); },
    setMusicMode: function (m) { Music.setMode(m); },
    musicTick: function (dt) { Music.update(dt || 1 / 60); },
    toggleMusic: function () { return Music.toggle(); },
    shoutCount: function () { return shoutCount; },
    voxFired: function () { return voxFired; },
    synthName: function (n) { if (NAME_PINYIN[n]) synthName(actx, NAME_PINYIN[n]); },
    namePinyin: function (n) { return NAME_PINYIN[n] || null; },
    nameKeys: function () { return Object.keys(NAME_PINYIN); },
    bossActive: function () { return anyBossAlive(); },
    recomputeMusic: recomputeMusic,
    attack: tryAttack, dodge: doDodge, hud: updateHUD,
    // 触屏联调：合成触点驱动摇杆 / 动作键（与真实手指同链路）
    // dpadDown/dpadUp/dpad 保留旧语义：合成一次"拨向某象限 → 回中/松开"
    stickPoint: function (dir, mag) {
      const c = stickCenter();
      const r = STICK_MAX_R * (mag === undefined ? 0.8 : mag);
      const off = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] }[dir] || [0, 0];
      return { x: c.x + off[0] * r, y: c.y + off[1] * r };
    },
    dpadDown: function (dir) {
      if (!stickEl || !dir) return;
      const p = this.stickPoint(dir);
      fireStick('touchstart', p.x, p.y);
    },
    dpadUp: function () {
      if (stickEl) fireStick('touchend', 0, 0);
    },
    dpad: function (dir) {
      this.dpadDown(dir);
      this.dpadUp();
    },
    // 模拟量直控（测试用，绕过元素几何）：归一化分量 (-1~1)
    stickAt: function (kx, ky) {
      if (!stick.active) {
        stick.active = true; stick.id = 'dbg';
        if (stickEl) stickEl.classList.add('on');
      }
      stickSet(kx, ky);
    },
    stickOff: function () { stickEnd(); },
    stickState: function () {
      return { active: stick.active, kx: +stick.kx.toFixed(3), ky: +stick.ky.toFixed(3),
        mag: +stick.mag.toFixed(3), sector: stick.sector };
    },
    tap: function (name) {
      const el = document.getElementById('b' + name);
      if (el) { firePress(el, 'touchstart'); firePress(el, 'touchend'); }
    },
    press: function (name, down) {
      const el = document.getElementById('b' + name);
      if (el) firePress(el, down ? 'touchstart' : 'touchend');
    },
    check: function () {
      const vs = [heroGroup.position, heroGroup.rotation, armR.rotation, armR.position,
        upperBody.rotation, armL.rotation, weaponMeshes[hero.weapon].position];
      for (let i = 0; i < vs.length; i++) {
        if (!isFinite(vs[i].x) || !isFinite(vs[i].y) || !isFinite(vs[i].z)) return 'NAN';
      }
      return 'ok';
    },
    pose: function () {
      return {
        st: hero.state, t: +hero.stateT.toFixed(3), p: +(hero.stateT / (WEAPONS[hero.weapon].time)).toFixed(2),
        arx: +armR.rotation.x.toFixed(2), ary: +armR.rotation.y.toFixed(2),
        by: +upperBody.rotation.y.toFixed(2), bx: +upperBody.rotation.x.toFixed(2),
        wz: +weaponMeshes[hero.weapon].position.z.toFixed(2),
        vis: weaponMeshes.map(function (m) { return m.visible ? 1 : 0; }).join(''),
        combo: hero.comboStep, skill: hero.skill ? hero.skill.name : ''
      };
    },
    step: function (dt) {
      updateHero(dt);
      updateEnemies(dt);
      recomputeMusic();
      updateParticles(dt);
      updateRings(dt);
      updateBlades(dt);
      updateTrail(dt);
      updateWaves(dt);
      updateMovingRings(dt);
      updateCracks(dt);
      updateGusts(dt);
      updateShots(dt);
      updateOrbs(dt);
      updateShrines(dt);
      updateCamera(dt);
      updateHUD(dt);
      renderer.render(scene, camera);
    },
    stepN: function (n, dt) { for (let i = 0; i < n; i++) this.step(dt || 1 / 60); },
    cam: function (y, z) {
      CAM_OFF.set(0, y, z);
      camera.position.set(hero.pos.x, hero.pos.y + y, hero.pos.z + z);
      camera.lookAt(hero.pos.x, hero.pos.y + 0.95, hero.pos.z);
    },
    // 把最近的敌人挪到身前，方便验证命中与受击表现
    targetFront: function (dist) {
      let best = null, bd = 1e9;
      for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].dead) continue;
        const d = Math.hypot(enemies[i].pos.x - hero.pos.x, enemies[i].pos.z - hero.pos.z);
        if (d < bd) { bd = d; best = enemies[i]; }
      }
      if (!best) return null;
      const d = dist || 2.2;
      best.pos.set(hero.pos.x + Math.sin(hero.facing) * d, 0, hero.pos.z + Math.cos(hero.facing) * d);
      best.state = 'idle'; best.hp = best.maxHp; best.breakv = 0;
      return best;
    },
    report: function () {
      return {
        state: hero.state, hp: hero.hp, weapon: hero.weapon,
        kills: killCount, enemies: enemies.filter(function (e) { return !e.dead; }).length,
        alive: enemies.map(function (e) { return Math.round(e.hp); })
      };
    }
  };
})();
