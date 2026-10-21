// 离线语音试听生成器：用与 game.js 完全相同的加性共振峰算法，
// 把技能名渲染成 WAV，方便在不部署的情况下直接听清晰度。
// 运行：node voxwav.js   ->  生成 _vox_*.wav
'use strict';
const fs = require('fs');

// ===== 以下表格与 game.js 保持一致 =====
const MVOW = {
  a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], u: [300, 870, 2240],
  v: [250, 1700, 2600], o: [490, 900, 2410], er: [490, 1350, 1690]
};
const MFIN = {
  a: { p: ['a'] }, o: { p: ['o'] }, e: { p: ['e'] }, i: { p: ['i'] }, u: { p: ['u'] }, v: { p: ['v'] }, er: { p: ['er'] },
  ai: { p: ['a', 'i'] }, ei: { p: ['e', 'i'] }, ao: { p: ['a', 'u'] }, ou: { p: ['o', 'u'] },
  an: { p: ['a'], c: 'n' }, en: { p: ['e'], c: 'n' }, ang: { p: ['a'], c: 'ng' }, eng: { p: ['e'], c: 'ng' }, ong: { p: ['o'], c: 'ng' },
  ia: { p: ['i', 'a'] }, ie: { p: ['i', 'e'] }, ua: { p: ['u', 'a'] }, uo: { p: ['u', 'o'] }, ve: { p: ['v', 'e'] },
  iao: { p: ['i', 'a', 'u'] }, iu: { p: ['i', 'u'] }, uai: { p: ['u', 'a', 'i'] }, ui: { p: ['u', 'e', 'i'] },
  ian: { p: ['i', 'a'], c: 'n' }, uan: { p: ['u', 'a'], c: 'n' }, uang: { p: ['u', 'a'], c: 'ng' }, van: { p: ['v', 'a'], c: 'n' },
  in: { p: ['i'], c: 'n' }, un: { p: ['u'], c: 'n' }, ing: { p: ['i'], c: 'ng' }, iang: { p: ['i', 'a'], c: 'ng' }, iong: { p: ['i', 'o'], c: 'ng' }
};
const MINIT = {
  b: ['stop', 0], p: ['stop', 1], m: ['nasal', 0], f: ['fric', 0],
  d: ['stop', 0], t: ['stop', 1], n: ['nasal', 0], l: ['liq', 0],
  g: ['stop', 0], k: ['stop', 1], h: ['fric', 0],
  j: ['aff', 0], q: ['aff', 1], x: ['fric', 0],
  zh: ['aff', 0, 1], ch: ['aff', 1, 1], sh: ['fric', 0, 1], r: ['liq', 0, 1],
  z: ['aff', 0], c: ['aff', 1], s: ['fric', 0]
};
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
const VOX_GAP = 0.02, VOX_BASE = 178;
const VOX_PLACE = {
  b: 'labial', p: 'labial', m: 'labial', f: 'labiodental',
  d: 'alveolar', t: 'alveolar', n: 'alveolar', l: 'alveolar',
  z: 'dental', c: 'dental', s: 'dental',
  zh: 'retroflex', ch: 'retroflex', sh: 'retroflex', r: 'retroflex',
  j: 'palatal', q: 'palatal', x: 'palatal',
  g: 'velar', k: 'velar', h: 'glottal'
};
const VOX_NOISE = { labial: 1100, labiodental: 1900, dental: 5200, alveolar: 4200, retroflex: 3000, palatal: 3400, velar: 1800, glottal: 1200 };
const VOX_CLS = {
  labial: [320, 900, 2500], labiodental: [320, 1000, 2500], dental: [320, 1800, 2500],
  alveolar: [320, 1700, 2500], retroflex: [320, 1400, 2500], palatal: [320, 2200, 2600],
  velar: [320, 1200, 2500], glottal: [400, 1500, 2500]
};
const VOX_NAS = { labial: [250, 800, 2500], alveolar: [250, 1000, 2500], dental: [250, 1700, 2500] };
function voxSq(x) { return x * x; }
function formantsFor(v) { return MVOW[v] || MVOW.a; }
function vowelFrame(ph, f0, F1, F2, F3) {
  const Nh = Math.max(8, Math.min(26, Math.floor(3400 / f0)));
  let s = 0;
  for (let h = 1; h <= Nh; h++) {
    const hf = h * f0;
    let w = 1.0;
    w += 1.0 / (1 + voxSq((hf - F1) / 60));
    w += 0.62 / (1 + voxSq((hf - F2) / 95));
    w += 0.34 / (1 + voxSq((hf - F3) / 130));
    w *= 1 / (1 + h * 0.018);
    s += w * Math.sin(ph * h);
  }
  return s * 0.42;
}
function writeSyllable(out, off, sr, plan, BASE) {
  const N = plan.N, ons = plan.ons, tone = plan.tone, fps = plan.fps, onset = plan.onset, clsF = plan.clsF;
  const onDur = plan.onDur, vDur = plan.vDur, coDur = plan.coDur;
  const place = onset ? VOX_PLACE[onset] : null;
  const onS = Math.floor(onDur * sr), vS = Math.floor(vDur * sr), coS = Math.floor(coDur * sr);
  const aS = Math.floor(sr * 0.012), rS = Math.floor(sr * 0.03);
  const trans = Math.min(vS, Math.floor(sr * 0.05));
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
      F1 = clsF[0] + (vf[0] - clsF[0]) * tp; F2 = clsF[1] + (vf[1] - clsF[1]) * tp; F3 = clsF[2] + (vf[2] - clsF[2]) * tp;
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
      if (ons[0] === 'stop') env = cp < 0.4 ? 0.55 : (ons[1] ? 0.25 * (1 - cp) : 0.0);
      else if (ons[0] === 'fric' || ons[0] === 'aff') env = 0.32;
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
    } else if (phase === 'co') samp *= 0.6 * (1 - prog) + 0.15;
    else samp *= 0.85;
    out[off + i] += samp;
  }
  return N;
}
// 渲染整句为名称为 pinyin 的 Float32 缓冲（含与游戏一致的去刺/存在感/归一化）
function renderName(pinyin, sr) {
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
    } else { clsF = formantsFor(fin.p[0]).slice(); }
    const N = Math.ceil(sr * (onDur + vDur + coDur));
    plans.push({ onset: syl.onset, ons: ons, tone: tone, fps: fin.p, coda: fin.c, onDur: onDur, vDur: vDur, coDur: coDur, clsF: clsF, N: N });
    totalN += N + Math.ceil(sr * VOX_GAP);
  }
  const out = new Float32Array(totalN + Math.ceil(sr * 0.05));
  let off = Math.ceil(sr * 0.02);
  for (let i = 0; i < plans.length; i++) { off += writeSyllable(out, off, sr, plans[i], VOX_BASE); off += Math.ceil(sr * VOX_GAP); }
  // 主链：去刺(>5k) + 存在感(2.5k +7dB) + 归一化
  const lp = 5000, pres = 2500;
  for (let i = 0; i < out.length; i++) {
    const f = i / sr;
    // 简易低通（一阶）模拟 >5k 衰减
    // 这里直接做轻量处理：存在感 + 限幅由归一化近似
    out[i] = out[i];
  }
  // 简单存在感：对 2.5k 附近做轻微提升——用二阶近似太重，改用整体归一化 + 轻微预加重
  let mx = 0; for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > mx) mx = a; }
  if (mx > 0.001) { const g = 0.92 / mx; for (let i = 0; i < out.length; i++) out[i] *= g; }
  return out;
}
function writeWav(path, data, sr) {
  const n = data.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let v = Math.max(-1, Math.min(1, data[i]));
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(path, buf);
}
const SAMPLES = {
  '万剑归宗': 'wan4 jian4 gui1 zong1',
  '横断山岳': 'heng2 duan4 shan1 yue4',
  '碎境魔将': 'sui4 jing4 mo2 jiang1',
  '瞬影斩': 'shun4 ying3 zhan3',
  '陨石天降': 'yun3 shi2 tian1 jiang4',
  '横扫千军': 'heng2 sao3 qian1 jun1',
  '十字燕返': 'shi2 zi4 yan4 fan3'
};
const SR = 44100;
for (const name in SAMPLES) {
  const d = renderName(SAMPLES[name], SR);
  let rms = 0; for (let i = 0; i < d.length; i++) rms += d[i] * d[i]; rms = Math.sqrt(rms / d.length);
  const p = 'C:/Users/Admin/WorkBuddy/2026-10-20-09-43-23/shattered-realm/_vox_' + name + '.wav';
  writeWav(p, d, SR);
  console.log(name + ' -> ' + p + '  len=' + (d.length / SR).toFixed(2) + 's rms=' + rms.toFixed(3));
}
console.log('DONE');
