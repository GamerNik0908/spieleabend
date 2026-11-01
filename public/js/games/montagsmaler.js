// Ansicht „Montagsmaler“: Live-Zeichenfläche, Begriffswahl, Rate-Chat.
import {
  html, useEffect, useRef, useState, act, gameOp, socket, Avatar, TimerBar, AnswerInput, ScoreStrip, GameHead, playerMap,
} from '../lib.js';

const COLORS = ['#1d0b45', '#ff3d7f', '#ff8a3d', '#ffd23f', '#2fe08b', '#2ee6d6', '#3d8bff', '#8b5cff', '#8a5a2b', '#ffffff'];
const SIZES = [4, 10, 22];

function drawStroke(ctx, s, scale, from = 0) {
  const p = s.p;
  if (!p.length) return;
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineWidth = s.w * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (p.length === 1) {
    ctx.beginPath();
    ctx.arc(p[0][0] * W, p[0][1] * H, (s.w * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  const start = Math.max(0, from - 1);
  ctx.moveTo(p[start][0] * W, p[start][1] * H);
  for (let i = start + 1; i < p.length; i++) ctx.lineTo(p[i][0] * W, p[i][1] * H);
  ctx.stroke();
}

function Canvas({ g }) {
  const ref = useRef(null);
  const strokes = useRef([]);
  const turn = useRef(g.turnId);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const drawing = useRef(null);
  const pending = useRef([]);
  const canDraw = g.isDrawer && g.phase === 'draw';

  const scale = () => (ref.current ? ref.current.width / 800 : 1);
  const redraw = () => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    for (const s of strokes.current) drawStroke(ctx, s, scale());
  };

  // Größe an Container anpassen
  useEffect(() => {
    const c = ref.current;
    const fit = () => {
      const w = c.clientWidth * (window.devicePixelRatio || 1);
      c.width = Math.round(w);
      c.height = Math.round(w * 0.68);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  // Zeichnung vom Server laden und live empfangen
  useEffect(() => {
    turn.current = g.turnId;
    strokes.current = [];
    redraw();
    socket.emit('canvas:get', null, (full) => {
      if (full && full.turnId === turn.current) { strokes.current = full.strokes || []; redraw(); }
    });
  }, [g.turnId]);

  useEffect(() => {
    const on = (m) => {
      if (m.turnId !== turn.current) {
        if (m.turnId > turn.current) { turn.current = m.turnId; strokes.current = []; redraw(); } else return;
      }
      if (m.t === 'reset') { strokes.current = []; redraw(); }
      if (m.t === 'full') { strokes.current = m.strokes || []; redraw(); }
      if (m.t === 'seg') {
        let s = strokes.current.find((x) => x.s === m.s);
        const from = s ? s.p.length : 0;
        if (!s) { s = { s: m.s, c: m.c, w: m.w, p: [] }; strokes.current.push(s); }
        s.p.push(...m.p);
        drawStroke(ref.current.getContext('2d'), s, scale(), from);
      }
    };
    socket.on('canvas', on);
    return () => socket.off('canvas', on);
  }, []);

  // Eigene Striche sammeln und gebündelt senden
  useEffect(() => {
    if (!canDraw) return undefined;
    const id = setInterval(() => {
      if (!pending.current.length || !drawing.current) return;
      const s = drawing.current;
      socket.emit('canvas', { t: 'seg', s: s.s, c: s.c, w: s.w, p: pending.current });
      pending.current = [];
    }, 45);
    return () => clearInterval(id);
  }, [canDraw]);

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
  };
  const down = (e) => {
    if (!canDraw) return;
    e.preventDefault();
    ref.current.setPointerCapture(e.pointerId);
    const s = { s: Math.random().toString(36).slice(2, 9), c: color, w: size, p: [pos(e)] };
    strokes.current.push(s);
    drawing.current = s;
    pending.current = [s.p[0]];
    drawStroke(ref.current.getContext('2d'), s, scale());
  };
  const move = (e) => {
    const s = drawing.current;
    if (!s || !canDraw) return;
    const pt = pos(e);
    const last = s.p[s.p.length - 1];
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.002) return;
    s.p.push(pt);
    pending.current.push(pt);
    drawStroke(ref.current.getContext('2d'), s, scale(), s.p.length - 1);
  };
  const up = () => {
    const s = drawing.current;
    if (s && pending.current.length) socket.emit('canvas', { t: 'seg', s: s.s, c: s.c, w: s.w, p: pending.current });
    pending.current = [];
    drawing.current = null;
  };
  const undo = () => { strokes.current.pop(); redraw(); socket.emit('canvas', { t: 'undo' }); };
  const clear = () => { strokes.current = []; redraw(); socket.emit('canvas', { t: 'clear' }); };

  return html`<div class="mm-canvas-wrap">
    <canvas ref=${ref} class=${`mm-canvas ${canDraw ? 'can' : ''}`} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onPointerLeave=${up}></canvas>
    ${canDraw && html`<div class="mm-tools">
      <div class="row wrap" style="gap:6px">${COLORS.map((c) => html`<button key=${c} class=${`mm-color ${color === c ? 'on' : ''}`} style=${`background:${c}`} onClick=${() => setColor(c)} title=${c === '#ffffff' ? 'Radierer' : ''}>${c === '#ffffff' ? '🧽' : ''}</button>`)}</div>
      <div class="row" style="gap:6px">${SIZES.map((s) => html`<button key=${s} class=${`mm-size ${size === s ? 'on' : ''}`} onClick=${() => setSize(s)}><i style=${`width:${s * 0.9 + 4}px;height:${s * 0.9 + 4}px`}></i></button>`)}</div>
      <div class="row" style="gap:6px"><button class="btn sm" onClick=${undo}>↩️ Zurück</button><button class="btn sm bad" onClick=${clear}>🗑️ Leeren</button></div>
    </div>`}
  </div>`;
}

function Chat({ st, g }) {
  const pm = playerMap(st);
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [g.chat.length]);
  return html`<div class="mm-chat card tight">
    <div class="section-title">Rateversuche</div>
    <div class="mm-msgs" ref=${ref}>
      ${!g.chat.length && html`<div class="muted small">Noch keine Tipps …</div>`}
      ${g.chat.map((c) => c.kind === 'hit'
        ? html`<div key=${c.id} class="mm-msg hit">✅ <b>${pm[c.pid]?.name}</b> hat's erraten! <span class="pill ok">+${c.pts}</span></div>`
        : html`<div key=${c.id} class="mm-msg"><b>${pm[c.pid]?.name}:</b> ${c.text}</div>`)}
    </div>
    ${g.canGuess ? html`<${AnswerInput} key=${`g-${g.turnId}`} live=${false} placeholder="Was ist das?" button="Raten" onSubmit=${(text) => text && act({ type: 'answer', text })} />`
      : g.phase === 'draw' && !g.isDrawer ? html`<div class="banner" style="color:var(--ok)">✅ Erraten! Schau zu, wie die anderen rätseln.</div>` : null}
  </div>`;
}

export function MontagsmalerView({ st, g }) {
  const pm = playerMap(st);
  const drawer = pm[g.drawer];
  const mark = Object.fromEntries(g.guessed.map((p) => [p, 'done']));
  if (g.drawer) mark[g.drawer] = 'drawer';
  return html`<div class="stage">
    <${GameHead} icon="🎨" title="Montagsmaler" sub=${g.turn > 0 ? `Bild ${g.turn}/${g.turns}` : null} timer=${g.phase === 'draw' ? g.timers.draw : g.phase === 'choose' ? g.timers.choose : null} warn=${10} />
    <${ScoreStrip} st=${st} g=${g} mark=${mark} />
    ${g.phase === 'intro' && html`<div class="mm-word card center"><div class="fun" style="font-size:34px">🎨 Gleich wird gezeichnet!</div><p class="muted">Einer malt, alle anderen raten durch Tippen. Je schneller, desto mehr Punkte.</p></div>`}
    ${g.phase === 'choose' && (g.choices
      ? html`<div class="card center rise"><div class="fun" style="font-size:30px;margin-bottom:14px">Du malst! Wähl einen Begriff:</div>
          <div class="row wrap" style="justify-content:center;gap:14px">${g.choices.map((c, i) => html`<button key=${i} class=${`btn lg ${['cyan', 'primary', 'pink'][c.lvl - 1]}`} onClick=${() => act({ type: 'choose', idx: i })}>${c.w}<span class="tiny" style="opacity:.7;margin-left:6px">${'★'.repeat(c.lvl)}</span></button>`)}</div></div>`
      : html`<div class="card center"><div class="row" style="justify-content:center;gap:14px"><${Avatar} p=${drawer} size=${64} /><div class="fun" style="font-size:28px">${drawer?.name} sucht sich einen Begriff aus …</div></div></div>`)}
    ${['draw', 'reveal'].includes(g.phase) && html`<div class="mm-layout">
      <div class="col" style="gap:12px">
        <div class="mm-word">
          ${g.phase === 'reveal' ? html`<span class="muted">Gesucht war:</span> <span class="fun big">${g.word}</span>`
            : g.word ? html`<span class="muted">${g.isDrawer ? 'Du malst:' : 'Richtig:'}</span> <span class="fun big">${g.word}</span>`
              : html`<span class="mask fun">${g.mask.split('').map((ch, i) => html`<span key=${i} class=${ch === '_' ? 'blank' : ch === ' ' ? 'gap' : 'letter'}>${ch === '_' ? '' : ch}</span>`)}</span>`}
        </div>
        <${TimerBar} timer=${g.timers.draw} />
        <${Canvas} g=${g} />
        ${g.phase === 'draw' && html`<div class="banner"><${Avatar} p=${drawer} size=${28} /> <b>${drawer?.name}</b> zeichnet</div>`}
        ${g.phase === 'reveal' && html`<div class="card tight center"><div class="fun" style="font-size:24px">${g.reason}</div>
          <div class="row wrap" style="justify-content:center;margin-top:8px">${Object.entries(g.turnPoints || {}).map(([pid, pts]) => html`<span class="pill ok" key=${pid}>${pm[pid]?.name} +${pts}</span>`)}</div></div>`}
      </div>
      <${Chat} st=${st} g=${g} />
    </div>`}
  </div>`;
}

export function MontagsmalerOps({ st, g }) {
  const pm = playerMap(st);
  const guesses = g.chat.filter((c) => c.kind === 'guess').slice(-12).reverse();
  return html`<div class="card tight" style="margin-bottom:14px">
    <div class="section-title">Tipp gelten lassen</div>
    ${g.phase !== 'draw' ? html`<p class="muted small" style="margin:0">Nur während gezeichnet wird.</p>`
      : !guesses.length ? html`<p class="muted small" style="margin:0">Noch keine Tipps.</p>`
        : guesses.map((c) => html`<div class="op-entry" key=${c.id}><div class="row"><b>${pm[c.pid]?.name}</b><span class="muted small">„${c.text}“</span><div class="spacer"></div>
            <button class="btn xs ok" onClick=${() => gameOp({ type: 'accept', id: c.id })}>✓ Zählt</button></div></div>`)}
    ${g.word && html`<p class="tiny muted" style="margin:8px 0 0">Begriff: <b>${g.word}</b></p>`}
  </div>`;
}
