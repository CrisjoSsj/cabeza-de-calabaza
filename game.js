(() => {
  'use strict';

  // ---------- Config ----------
  const GAME_TIME = 45;          // segundos de partida
  const MAX_GAME_TIME = 60;      // tope duro (con bonus de tiempo)
  const MISS_PENALTY = 2;        // segundos que resta un fallo
  const PERFECT_BONUS = 0.5;     // segundos que suma una perfecta
  const RECORD_KEY = 'cabezaDeCalabaza.record';
  const SOUND_KEY = 'cabezaDeCalabaza.sound';

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    hud: $('hud'), score: $('hud-score'), time: $('hud-time'), combo: $('hud-combo'),
    timebar: $('timebar'), timefill: $('timebar-fill'),
    feedback: $('feedback'), flash: $('flash'), film: $('film'), toast: $('toast'),
    start: $('screen-start'), end: $('screen-end'),
    startRecord: $('start-record'), endRecord: $('end-record'),
    endTitle: $('end-title'), endScore: $('end-score'), endNew: $('end-new'),
    endPerfect: $('end-perfect'), endGood: $('end-good'), endMaxCombo: $('end-maxcombo'),
    endPhotos: $('end-photos'),
    btnPlay: $('btn-play'), btnRestart: $('btn-restart'), btnShare: $('btn-share'), btnSound: $('btn-sound'),
  };

  // ---------- Storage seguro ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch { /* modo privado */ } },
  };
  let record = parseInt(store.get(RECORD_KEY, '0'), 10) || 0;
  let soundOn = store.get(SOUND_KEY, '1') === '1';

  // ---------- Audio (sintetizado, sin archivos) ----------
  let actx = null;
  function audio() {
    if (!soundOn) return null;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch { return null; }
  }
  function tone(freq, dur, type = 'square', vol = 0.08, when = 0, slide = 0) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + when;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function shutter() {
    const a = audio(); if (!a) return;
    const len = Math.floor(a.sampleRate * 0.06);
    const buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = a.createBufferSource(), g = a.createGain();
    g.gain.value = 0.18; s.buffer = buf; s.connect(g).connect(a.destination); s.start();
  }
  const sfx = {
    perfect() { shutter(); [660, 880, 1320].forEach((f, i) => tone(f, 0.12, 'triangle', 0.09, 0.04 + i * 0.06)); },
    good() { shutter(); tone(520, 0.12, 'triangle', 0.08, 0.03); },
    miss() { shutter(); tone(220, 0.25, 'sawtooth', 0.06, 0.02, -120); },
    tick() { tone(440, 0.08, 'square', 0.05); },
    go() { tone(880, 0.18, 'square', 0.06); },
    end() { [523, 392, 330, 262].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, i * 0.12)); },
  };
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

  // ---------- Layout ----------
  let W = 0, H = 0, DPR = 1, S = 1, groundY = 0, headBaseY = 0;
  let bg = null;
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    S = Math.min(W / 390, H / 760);
    groundY = H * 0.86;
    headBaseY = groundY - 268 * S;
    buildBackground();
    if (state) { state.dancer.x = clamp(state.dancer.x, margin(), W - margin()); }
  }
  const margin = () => 60 * S;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // ---------- Fondo: huerto de calabazas al atardecer ----------
  function buildBackground() {
    bg = document.createElement('canvas');
    bg.width = canvas.width; bg.height = canvas.height;
    const b = bg.getContext('2d');
    b.scale(DPR, DPR);
    const sky = b.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#2a1446'); sky.addColorStop(0.45, '#7a2a6b'); sky.addColorStop(0.8, '#ff7b39'); sky.addColorStop(1, '#ffc46b');
    b.fillStyle = sky; b.fillRect(0, 0, W, groundY);
    // estrellas
    b.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 40; i++) { const x = (i * 97.3) % W, y = (i * 53.7) % (groundY * 0.35); b.fillRect(x, y, 1.5, 1.5); }
    // sol
    const sunY = groundY - 120 * S;
    const sg = b.createRadialGradient(W * 0.72, sunY, 5, W * 0.72, sunY, 150 * S);
    sg.addColorStop(0, 'rgba(255,240,180,1)'); sg.addColorStop(0.25, 'rgba(255,200,110,.9)'); sg.addColorStop(1, 'rgba(255,150,60,0)');
    b.fillStyle = sg; b.beginPath(); b.arc(W * 0.72, sunY, 150 * S, 0, Math.PI * 2); b.fill();
    // colinas
    b.fillStyle = '#5b2a5c';
    b.beginPath(); b.moveTo(0, groundY - 60 * S);
    for (let x = 0; x <= W; x += 10) b.lineTo(x, groundY - 60 * S - Math.sin(x / (90 * S)) * 22 * S - Math.sin(x / (37 * S)) * 6 * S);
    b.lineTo(W, groundY); b.lineTo(0, groundY); b.fill();
    b.fillStyle = '#3d1c45';
    b.beginPath(); b.moveTo(0, groundY - 25 * S);
    for (let x = 0; x <= W; x += 10) b.lineTo(x, groundY - 25 * S - Math.sin(x / (60 * S) + 2) * 12 * S);
    b.lineTo(W, groundY); b.lineTo(0, groundY); b.fill();
    // valla
    b.strokeStyle = '#2a1430'; b.lineWidth = 4 * S;
    for (let x = 10; x < W; x += 34 * S) { b.beginPath(); b.moveTo(x, groundY - 40 * S); b.lineTo(x, groundY); b.stroke(); }
    b.beginPath(); b.moveTo(0, groundY - 32 * S); b.lineTo(W, groundY - 32 * S); b.moveTo(0, groundY - 16 * S); b.lineTo(W, groundY - 16 * S); b.stroke();
    // suelo
    const gg = b.createLinearGradient(0, groundY, 0, H);
    gg.addColorStop(0, '#4a2d1a'); gg.addColorStop(1, '#24140c');
    b.fillStyle = gg; b.fillRect(0, groundY, W, H - groundY);
    // calabacitas del huerto
    const seeds = [0.08, 0.22, 0.86, 0.95, 0.15, 0.78, 0.5];
    seeds.forEach((sx, i) => {
      const y = groundY + (i % 3) * 18 * S + 14 * S;
      drawPumpkin(b, sx * W, y, (14 + (i % 3) * 5) * S, { face: false, glow: false, shade: 0.7 });
    });
  }

  // ---------- Dibujo de calabaza ----------
  function drawPumpkin(c, x, y, r, o = {}) {
    const golden = !!o.golden;
    c.save(); c.translate(x, y);
    if (o.rot) c.rotate(o.rot);
    if (o.glow) {
      const g = c.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2);
      g.addColorStop(0, golden ? 'rgba(255,230,90,.55)' : 'rgba(255,140,30,.4)'); g.addColorStop(1, 'rgba(255,140,30,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 2, 0, Math.PI * 2); c.fill();
    }
    const base = golden ? ['#ffe066', '#f5b700', '#c98a00'] : ['#ffa63d', '#f07b12', '#b84f00'];
    const shade = o.shade || 1;
    c.globalAlpha = shade < 1 ? 1 : 1;
    const lobes = [[-0.55, 0.62], [0.55, 0.62], [-0.25, 0.78], [0.25, 0.78], [0, 0.82]];
    lobes.forEach(([lx, lw], i) => {
      const gr = c.createLinearGradient(lx * r - lw * r, 0, lx * r + lw * r, 0);
      gr.addColorStop(0, base[2]); gr.addColorStop(0.5, i === 4 ? base[0] : base[1]); gr.addColorStop(1, base[2]);
      c.fillStyle = gr;
      c.beginPath(); c.ellipse(lx * r, 0, lw * r, r * 0.88, 0, 0, Math.PI * 2); c.fill();
    });
    if (shade < 1) { c.fillStyle = `rgba(30,10,20,${1 - shade})`; c.beginPath(); c.ellipse(0, 0, r * 1.15, r * 0.88, 0, 0, Math.PI * 2); c.fill(); }
    // tallo
    c.fillStyle = '#3f6b2a';
    c.beginPath(); c.moveTo(-r * 0.1, -r * 0.8); c.quadraticCurveTo(-r * 0.05, -r * 1.2, r * 0.2, -r * 1.25); c.lineTo(r * 0.14, -r * 0.8); c.fill();
    if (o.face) {
      c.fillStyle = golden ? '#7a3b00' : '#3a1200';
      const lit = o.lit ? (golden ? '#fff6b0' : '#ffd23f') : null;
      if (lit) { c.shadowColor = lit; c.shadowBlur = r * 0.4; c.fillStyle = lit; }
      // ojos
      c.beginPath(); c.moveTo(-r * 0.5, -r * 0.05); c.lineTo(-r * 0.3, -r * 0.42); c.lineTo(-r * 0.1, -r * 0.05); c.fill();
      c.beginPath(); c.moveTo(r * 0.1, -r * 0.05); c.lineTo(r * 0.3, -r * 0.42); c.lineTo(r * 0.5, -r * 0.05); c.fill();
      // boca
      c.beginPath(); c.moveTo(-r * 0.6, r * 0.2);
      c.quadraticCurveTo(0, r * 0.75, r * 0.6, r * 0.2);
      c.lineTo(r * 0.38, r * 0.32); c.lineTo(r * 0.25, r * 0.2); c.lineTo(r * 0.1, r * 0.36); c.lineTo(-r * 0.05, r * 0.22);
      c.lineTo(-r * 0.2, r * 0.36); c.lineTo(-r * 0.35, r * 0.22); c.closePath(); c.fill();
      c.shadowBlur = 0;
    }
    c.restore();
  }

  // ---------- Bailarín ----------
  const OUTFITS = [
    { shirt: '#c0392b', check: '#7b1e14', pants: '#2c3e70', skin: '#c68642', hair: '#2b1a10' },
    { shirt: '#2e86de', check: '#1b4f8a', pants: '#3b2f2f', skin: '#8d5524', hair: '#111' },
    { shirt: '#27ae60', check: '#145c33', pants: '#34495e', skin: '#e0ac69', hair: '#5a3214' },
    { shirt: '#8e44ad', check: '#4d2160', pants: '#1e272e', skin: '#f1c27d', hair: '#a0522d' },
  ];
  const MOVES = ['brazos', 'molino', 'robot', 'saltos', 'macarena'];

  function dancerPose(d, t) {
    // devuelve puntos del esqueleto
    const s = S, m = d.move, k = d.energy;
    let bob = Math.abs(Math.sin(t * 7)) * 8 * s * k;
    let lean = Math.sin(t * 3.5) * 10 * s * k;
    let jump = 0;
    if (m === 'saltos') jump = Math.max(0, Math.sin(t * 9)) * 26 * s * k;
    const hipY = groundY - 120 * s - jump + bob * 0.5;
    const hip = { x: d.x, y: hipY };
    const sh = { x: d.x + lean, y: hipY - 105 * s + bob * 0.3 };
    const sway = Math.sin(t * 5.2) * 9 * s * k;
    const head = { x: sh.x + sway, y: sh.y - 46 * s };
    let aL, aR, fL, fR;
    const w = t * 8;
    switch (m) {
      case 'brazos': aL = -2.4 + Math.sin(w) * 0.6; aR = -0.7 - Math.sin(w) * 0.6; fL = -0.4; fR = 0.4; break;
      case 'molino': aL = w * 0.9; aR = w * 0.9 + Math.PI; fL = 0.2; fR = 0.2; break;
      case 'robot': { const st = Math.floor(t * 4) % 4; aL = [-3.14, -2.2, -1.6, -2.6][st]; aR = [-0.0, -0.9, -1.5, -0.5][st]; fL = st % 2 ? -1.5 : 0; fR = st % 2 ? 0 : 1.5; break; }
      case 'macarena': { const st = Math.floor(t * 3) % 4; aL = -2.0 - (st > 1 ? 0.9 : 0); aR = -1.1 + (st > 1 ? -0.9 : 0); fL = st % 2 ? -1.2 : 0.6; fR = st % 2 ? 1.2 : -0.6; break; }
      default: aL = -2.8 + Math.sin(w) * 0.3; aR = -0.3 - Math.sin(w) * 0.3; fL = 0.3; fR = -0.3;
    }
    const arm = 46 * s, fore = 40 * s;
    const elbow = (a) => ({ x: sh.x + Math.cos(a) * arm, y: sh.y + 6 * s + Math.sin(a) * arm });
    const hand = (e, a, f) => ({ x: e.x + Math.cos(a + f) * fore, y: e.y + Math.sin(a + f) * fore });
    const eL = elbow(Math.PI - (Math.PI + aL) ), eR = elbow(aR);
    // brazo izquierdo reflejado
    const eL2 = { x: sh.x - Math.cos(aL + Math.PI) * arm, y: sh.y + 6 * s + Math.sin(aL + Math.PI) * arm };
    const hL = { x: eL2.x - Math.cos(aL + Math.PI + fL) * fore, y: eL2.y + Math.sin(aL + Math.PI + fL) * fore };
    const hR = hand(eR, aR, fR);
    void eL;
    const step = Math.sin(t * 7) * 18 * s * k;
    const kneeL = { x: hip.x - 16 * s - step * 0.5, y: hip.y + 60 * s - Math.max(0, step) * 0.4 };
    const kneeR = { x: hip.x + 16 * s - step * 0.5, y: hip.y + 60 * s - Math.max(0, -step) * 0.4 };
    const footL = { x: hip.x - 24 * s - step, y: Math.min(groundY, hip.y + 120 * s) };
    const footR = { x: hip.x + 24 * s + step * 0.3, y: Math.min(groundY, hip.y + 120 * s) };
    return { hip, sh, head, eL: eL2, hL, eR, hR, kneeL, kneeR, footL, footR, jump };
  }

  function drawDancer(c, d, t, covered) {
    const p = dancerPose(d, t), o = d.outfit, s = S;
    const R = 32 * s;
    // sombra
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.beginPath(); c.ellipse(d.x, groundY + 4 * s, (50 - p.jump * 0.4 / s) * s, 9 * s, 0, 0, Math.PI * 2); c.fill();
    c.lineCap = 'round'; c.lineJoin = 'round';
    const limb = (a, b, col, wd) => { c.strokeStyle = col; c.lineWidth = wd; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); };
    const limb3 = (a, b, e, col, wd) => { c.strokeStyle = col; c.lineWidth = wd; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(e.x, e.y); c.stroke(); };
    // piernas
    limb3(p.hip, p.kneeL, p.footL, o.pants, 20 * s);
    limb3(p.hip, p.kneeR, p.footR, o.pants, 20 * s);
    c.fillStyle = '#1b1b1b';
    c.beginPath(); c.ellipse(p.footL.x - 6 * s, p.footL.y, 14 * s, 7 * s, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(p.footR.x + 6 * s, p.footR.y, 14 * s, 7 * s, 0, 0, Math.PI * 2); c.fill();
    // brazo trasero
    limb3(p.sh, p.eR, p.hR, o.shirt, 15 * s);
    // torso (camisa de cuadros)
    c.save();
    c.beginPath();
    c.moveTo(p.sh.x - 30 * s, p.sh.y); c.lineTo(p.sh.x + 30 * s, p.sh.y);
    c.lineTo(p.hip.x + 26 * s, p.hip.y + 8 * s); c.lineTo(p.hip.x - 26 * s, p.hip.y + 8 * s); c.closePath();
    c.fillStyle = o.shirt; c.fill(); c.clip();
    c.strokeStyle = o.check; c.lineWidth = 5 * s; c.globalAlpha = 0.6;
    for (let i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(p.sh.x + i * 14 * s, p.sh.y - 10); c.lineTo(p.hip.x + i * 14 * s, p.hip.y + 20); c.stroke(); }
    for (let j = 0; j < 8; j++) { const y = p.sh.y + j * 15 * s; c.beginPath(); c.moveTo(p.sh.x - 60 * s, y); c.lineTo(p.sh.x + 60 * s, y); c.stroke(); }
    c.restore();
    // brazo delantero
    limb3(p.sh, p.eL, p.hL, o.shirt, 15 * s);
    c.fillStyle = o.skin;
    [p.hL, p.hR].forEach((h) => { c.beginPath(); c.arc(h.x, h.y, 8 * s, 0, Math.PI * 2); c.fill(); });
    // cuello
    limb(p.sh, { x: p.head.x, y: p.head.y + R * 0.6 }, o.skin, 14 * s);
    if (!covered) {
      // cabeza
      c.fillStyle = o.skin; c.beginPath(); c.arc(p.head.x, p.head.y, R, 0, Math.PI * 2); c.fill();
      c.fillStyle = o.hair; c.beginPath(); c.arc(p.head.x, p.head.y - 4 * s, R, Math.PI * 1.05, Math.PI * 1.95); c.fill();
      c.fillStyle = '#1a1a1a';
      const look = d.mood === 'risa' ? 0 : Math.sin(t * 2) * 3 * s;
      if (d.mood === 'risa') {
        c.lineWidth = 3 * s; c.strokeStyle = '#1a1a1a';
        c.beginPath(); c.arc(p.head.x - 11 * s, p.head.y - 2 * s, 5 * s, Math.PI, 0); c.stroke();
        c.beginPath(); c.arc(p.head.x + 11 * s, p.head.y - 2 * s, 5 * s, Math.PI, 0); c.stroke();
        c.fillStyle = '#7a1f1f'; c.beginPath(); c.arc(p.head.x, p.head.y + 10 * s, 11 * s, 0, Math.PI); c.fill();
      } else {
        c.beginPath(); c.arc(p.head.x - 11 * s + look, p.head.y, 3.5 * s, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(p.head.x + 11 * s + look, p.head.y, 3.5 * s, 0, Math.PI * 2); c.fill();
        c.lineWidth = 3 * s; c.strokeStyle = '#1a1a1a';
        c.beginPath(); c.arc(p.head.x, p.head.y + 8 * s, 9 * s, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
      }
      c.fillStyle = 'rgba(255,90,90,.35)';
      c.beginPath(); c.arc(p.head.x - 18 * s, p.head.y + 8 * s, 5 * s, 0, Math.PI * 2); c.arc(p.head.x + 18 * s, p.head.y + 8 * s, 5 * s, 0, Math.PI * 2); c.fill();
    }
    return p;
  }

  // ---------- Estado ----------
  let state = null;
  function newState(phase) {
    return {
      phase,            // 'attract' | 'countdown' | 'play' | 'end'
      t: 0, elapsed: 0, timeLeft: GAME_TIME,
      score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0,
      shots: [],
      dancer: { x: W / 2, target: W / 2, speed: 80, retarget: 1, move: 'brazos', moveT: 2.5, energy: 1, outfit: pick(OUTFITS), mood: '' },
      pk: { x: margin(), dir: 1, speed: 210, golden: false, status: 'moving', vy: 0, y: 0, hold: 0, rot: 0 },
      countdown: 0, cdStep: -1,
      lastTap: 0,
    };
  }

  function difficulty() {
    // 0 → 1 a lo largo de la partida, ajustado por puntos
    const byTime = clamp(state.elapsed / 40, 0, 1);
    const byScore = clamp(state.score / 120, 0, 1);
    return clamp(byTime * 0.7 + byScore * 0.4, 0, 1);
  }

  function spawnPumpkin() {
    const pk = state.pk, df = difficulty();
    pk.dir = Math.random() < 0.5 ? 1 : -1;
    pk.x = pk.dir === 1 ? margin() * 0.6 : W - margin() * 0.6;
    pk.speed = (210 + df * 330 + rand(-20, 40)) * S;
    pk.golden = state.elapsed > 5 && Math.random() < 0.14;
    pk.status = 'moving'; pk.vy = 0; pk.y = 0; pk.rot = 0; pk.hold = 0;
    pk.wobble = df > 0.35 && Math.random() < 0.45; // cambios bruscos de dirección
    pk.nextFlip = rand(0.5, 1.4);
  }

  function headPos(t) { return dancerPose(state.dancer, t).head; }

  // ---------- Bucle ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt); render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const st = state; st.t += dt;
    const d = st.dancer;
    // baile
    d.moveT -= dt;
    if (d.moveT <= 0) { d.move = pick(MOVES.filter((m) => m !== d.move)); d.moveT = rand(1.8, 3.2); }
    const playing = st.phase === 'play';
    const df = playing ? difficulty() : 0.15;
    d.energy = 0.9 + df * 0.7;
    d.retarget -= dt;
    if (d.retarget <= 0) { d.target = rand(margin() * 1.3, W - margin() * 1.3); d.retarget = rand(0.7, 1.8) - df * 0.4; d.speed = (60 + df * 160) * S; }
    const dx = d.target - d.x;
    d.x += clamp(dx, -d.speed * dt, d.speed * dt);
    if (d.moodT > 0) { d.moodT -= dt; if (d.moodT <= 0) d.mood = ''; }

    if (st.phase === 'attract') {
      const h = headPos(st.t);
      st.pk.x = h.x; st.pk.status = 'attract';
      return;
    }
    if (st.phase === 'countdown') {
      st.countdown -= dt;
      const step = Math.ceil(st.countdown / 0.6);
      if (step !== st.cdStep && step > 0) { st.cdStep = step; showFeedback(String(step), 'good'); sfx.tick(); }
      if (st.countdown <= 0) { st.phase = 'play'; showFeedback('¡YA!', 'perfect'); sfx.go(); spawnPumpkin(); }
      return;
    }
    if (!playing) return;

    st.elapsed += dt;
    st.timeLeft -= dt;
    if (st.timeLeft <= 0 || st.elapsed >= MAX_GAME_TIME) { st.timeLeft = 0; endGame(); return; }

    const pk = st.pk;
    if (pk.status === 'moving') {
      pk.x += pk.dir * pk.speed * dt;
      if (pk.wobble) { pk.nextFlip -= dt; if (pk.nextFlip <= 0) { pk.dir *= -1; pk.nextFlip = rand(0.5, 1.3); } }
      const m = margin() * 0.6;
      if (pk.x < m) { pk.x = m; pk.dir = 1; }
      if (pk.x > W - m) { pk.x = W - m; pk.dir = -1; }
    } else if (pk.status === 'hit') {
      const h = headPos(st.t); pk.x = h.x; // la ilusión: la calabaza "se pega" a la cabeza
      pk.hold -= dt; if (pk.hold <= 0) spawnPumpkin();
    } else if (pk.status === 'miss') {
      pk.vy += 1600 * S * dt; pk.y += pk.vy * dt; pk.rot += pk.dir * 6 * dt;
      pk.hold -= dt; if (pk.hold <= 0) spawnPumpkin();
    }
    updateHud();
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (bg) ctx.drawImage(bg, 0, 0); else { ctx.fillStyle = '#2a1446'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const st = state, pk = st.pk;
    const covered = pk.status === 'hit' || pk.status === 'attract';
    const p = drawDancer(ctx, st.dancer, st.t, covered);
    const R = 44 * S;
    let py = (covered ? p.head.y : headBaseY) + pk.y;
    if (st.phase !== 'countdown' || covered) {
      // guía: sombra de "objetivo" sobre la cabeza
      if (pk.status === 'moving') {
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([6 * S, 6 * S]); ctx.lineWidth = 2 * S;
        ctx.beginPath(); ctx.moveTo(p.head.x, p.head.y - 74 * S); ctx.lineTo(p.head.x, p.head.y - 50 * S); ctx.stroke(); ctx.setLineDash([]);
        py = p.head.y + Math.sin(st.t * 6) * 3 * S; // la calabaza va a la altura de la cabeza
      }
      drawPumpkin(ctx, pk.x, py, R, { face: true, glow: true, golden: pk.golden, lit: covered, rot: pk.rot });
      // mano que sostiene la calabaza por el tallo
      if (pk.status !== 'miss') {
        ctx.fillStyle = '#f1c27d'; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5 * S;
        ctx.beginPath(); ctx.ellipse(pk.x + 6 * S, py - R * 1.25, 13 * S, 9 * S, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // brazo con manga de suéter (quien sostiene la calabaza frente a la cámara)
        ctx.fillStyle = '#f1c27d';
        ctx.fillRect(pk.x + 1 * S, py - R * 1.25 - 40 * S, 12 * S, 34 * S);
        ctx.fillStyle = '#4b2a6b';
        ctx.fillRect(pk.x - 3 * S, py - R * 1.25 - 160 * S, 20 * S, 122 * S);
        ctx.fillStyle = '#6d3d99';
        ctx.fillRect(pk.x - 3 * S, py - R * 1.25 - 44 * S, 20 * S, 8 * S);
      }
    }
    st.lastPose = p;
  }

  // ---------- Disparo (tap) ----------
  function onTap(e) {
    if (e) e.preventDefault();
    const st = state;
    if (st.phase !== 'play') return;
    const now = performance.now();
    if (now - st.lastTap < 180) return;
    st.lastTap = now;
    const pk = st.pk;
    if (pk.status !== 'moving') return;
    const head = headPos(st.t);
    const dist = Math.abs(pk.x - head.x) / S;
    let res;
    if (dist <= 13) res = 'perfect'; else if (dist <= 34) res = 'good'; else res = 'miss';

    flash();
    const mult = () => Math.min(5, 1 + Math.floor(st.combo / 4));
    if (res === 'miss') {
      st.combo = 0; st.miss++;
      st.timeLeft = Math.max(0, st.timeLeft - MISS_PENALTY);
      pk.status = 'miss'; pk.vy = -300 * S; pk.hold = 0.55;
      st.dancer.mood = 'risa'; st.dancer.moodT = 0.8;
      showFeedback('¡Fallaste!', 'miss', `−${MISS_PENALTY} s`);
      sfx.miss(); vibrate([40, 40, 40]);
    } else {
      st.combo++; st.maxCombo = Math.max(st.maxCombo, st.combo);
      const base = res === 'perfect' ? 3 : 1;
      const gold = pk.golden ? 2 : 1;
      const pts = base * mult() * gold;
      st.score += pts;
      if (res === 'perfect') { st.perfect++; st.timeLeft = Math.min(GAME_TIME, st.timeLeft + PERFECT_BONUS); }
      else st.good++;
      pk.status = 'hit'; pk.hold = 0.5; pk.x = head.x;
      const label = res === 'perfect' ? (pk.golden ? '¡DORADA!' : pick(['¡PERFECTA!', '¡ILUSIÓN TOTAL!', '¡CALABAZÓN!'])) : pick(['¡Bien!', '¡Casi!', '¡Buena!']);
      showFeedback(label, res === 'perfect' ? 'perfect' : 'good', `+${pts}${mult() > 1 ? '  ·  combo x' + mult() : ''}`);
      res === 'perfect' ? (sfx.perfect(), vibrate(30)) : (sfx.good(), vibrate(15));
    }
    // foto polaroid
    requestAnimationFrame(() => { render(); addPhoto(res, pk.golden); });
    updateHud();
  }

  function addPhoto(res, golden) {
    try {
      const p = state.lastPose; if (!p) return;
      const size = 150 * S;
      const sx = clamp(p.head.x - size / 2, 0, W - size), sy = clamp(p.head.y - size * 0.45, 0, H - size);
      const c = document.createElement('canvas'); c.width = 96; c.height = 96;
      c.getContext('2d').drawImage(canvas, sx * DPR, sy * DPR, size * DPR, size * DPR, 0, 0, 96, 96);
      const src = c.toDataURL('image/jpeg', 0.7);
      const shot = { res, golden, src, score: res === 'perfect' ? 3 : res === 'good' ? 1 : 0 };
      state.shots.push(shot);
      const el = polaroid(shot);
      ui.film.appendChild(el);
      while (ui.film.children.length > 6) ui.film.removeChild(ui.film.firstChild);
    } catch { /* sin fotos si el canvas falla */ }
  }
  function polaroid(shot) {
    const el = document.createElement('div');
    el.className = 'polaroid ' + (shot.res === 'perfect' ? 'p' : shot.res === 'miss' ? 'm' : '');
    const img = new Image(); img.alt = shot.res === 'miss' ? 'Foto fallida' : 'Foto de la ilusión'; img.src = shot.src;
    el.appendChild(img); return el;
  }

  // ---------- UI ----------
  let fbTimer = 0;
  function showFeedback(text, cls, small) {
    const f = ui.feedback;
    f.className = ''; void f.offsetWidth;
    f.innerHTML = '';
    f.appendChild(document.createTextNode(text));
    if (small) { const s = document.createElement('small'); s.textContent = small; f.appendChild(s); }
    f.className = 'show ' + cls;
    clearTimeout(fbTimer); fbTimer = setTimeout(() => { f.className = ''; }, 750);
  }
  function flash() { const f = ui.flash; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  function toast(msg) {
    ui.toast.textContent = msg; ui.toast.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => ui.toast.classList.remove('show'), 2200);
  }
  function updateHud() {
    const st = state;
    ui.score.textContent = st.score;
    ui.time.textContent = Math.ceil(st.timeLeft);
    ui.combo.textContent = 'x' + Math.min(5, 1 + Math.floor(st.combo / 4)) + (st.combo ? ` (${st.combo})` : '');
    ui.timefill.style.transform = `scaleX(${clamp(st.timeLeft / GAME_TIME, 0, 1)})`;
  }
  function showRecord() { ui.startRecord.textContent = record; ui.endRecord.textContent = record; }

  function rankTitle(score) {
    if (score >= 90) return 'Leyenda de Halloween 👑';
    if (score >= 50) return 'Maestro de la ilusión 🎃';
    if (score >= 20) return 'Fotógrafo de calabazas 📸';
    return 'Aprendiz del huerto 🌱';
  }

  // ---------- Flujo ----------
  function startGame() {
    audio();
    state = newState('countdown');
    state.countdown = 1.8;
    state.pk.status = 'hidden';
    ui.start.classList.add('hidden'); ui.end.classList.add('hidden');
    ui.hud.classList.remove('hidden'); ui.timebar.classList.remove('hidden'); ui.film.classList.remove('hidden');
    ui.film.innerHTML = '';
    updateHud();
  }

  function endGame() {
    const st = state; if (st.phase === 'end') return;
    st.phase = 'end'; st.pk.status = 'hidden';
    updateHud(); sfx.end();
    const isNew = st.score > record && st.score > 0;
    if (isNew) { record = st.score; store.set(RECORD_KEY, record); }
    showFeedback('¡TIEMPO!', 'miss');
    setTimeout(() => {
      ui.endTitle.textContent = rankTitle(st.score);
      ui.endScore.textContent = st.score;
      ui.endNew.classList.toggle('hidden', !isNew);
      ui.endPerfect.textContent = st.perfect; ui.endGood.textContent = st.good; ui.endMaxCombo.textContent = st.maxCombo;
      ui.endPhotos.innerHTML = '';
      st.shots.filter((s) => s.res !== 'miss').sort((a, b) => b.score - a.score).slice(0, 6).forEach((s) => ui.endPhotos.appendChild(polaroid(s)));
      showRecord();
      ui.hud.classList.add('hidden'); ui.timebar.classList.add('hidden'); ui.film.classList.add('hidden');
      ui.end.classList.remove('hidden');
      // el bailarín sigue bailando de fondo con su calabaza
      const keep = state; keep.phase = 'attract';
    }, 900);
  }

  async function share() {
    const st = state;
    const url = location.href.split('#')[0];
    const text = `🎃 ¡Hice ${st ? st.score : 0} puntos en "Cabeza de Calabaza", el juego del reto Pumpkin Head Illusion! ¿Me ganas?`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Cabeza de Calabaza 🎃', text, url }); return; }
      catch (err) { if (err && err.name === 'AbortError') return; }
    }
    const full = `${text} ${url}`;
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(full); toast('✅ ¡Enlace copiado!'); return; }
      throw new Error('sin clipboard');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = full; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch {}
      ta.remove();
      toast(ok ? '✅ ¡Enlace copiado!' : '📋 Copia este enlace: ' + url);
    }
  }

  function setSound(on) {
    soundOn = on; store.set(SOUND_KEY, on ? '1' : '0');
    ui.btnSound.textContent = on ? '🔊 Sonido: sí' : '🔇 Sonido: no';
    ui.btnSound.setAttribute('aria-pressed', String(on));
  }

  // ---------- Eventos ----------
  canvas.addEventListener('pointerdown', onTap, { passive: false });
  ui.film.addEventListener('pointerdown', onTap, { passive: false });
  ui.feedback.addEventListener('pointerdown', onTap, { passive: false });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      if (state.phase === 'play') { onTap(e); }
      else if (!ui.start.classList.contains('hidden')) { e.preventDefault(); startGame(); }
      else if (!ui.end.classList.contains('hidden')) { e.preventDefault(); startGame(); }
    }
  });
  ui.btnPlay.addEventListener('click', startGame);
  ui.btnRestart.addEventListener('click', startGame);
  ui.btnShare.addEventListener('click', share);
  ui.btnSound.addEventListener('click', () => setSound(!soundOn));
  window.addEventListener('resize', resize);
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // Gancho de solo lectura para pruebas automatizadas
  Object.defineProperty(window, '__juego', {
    value: Object.freeze({
      get estado() {
        const st = state, h = headPos(st.t);
        return { fase: st.phase, puntos: st.score, tiempo: +st.timeLeft.toFixed(2), combo: st.combo, perfectas: st.perfect, bien: st.good, fallos: st.miss, calabazaX: st.pk.x, cabezaX: h.x, calabaza: st.pk.status, S, record };
      },
    }),
  });

  // ---------- Inicio ----------
  state = newState('attract');
  resize();
  state.dancer.x = W / 2;
  setSound(soundOn);
  showRecord();
  requestAnimationFrame((t) => { last = t; loop(t); });
})();
