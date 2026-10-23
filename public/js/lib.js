// Gemeinsame Client-Bausteine: Preact/htm, Socket, kleine Stores, Uhr, Sounds, Konfetti, UI-Teile.
import { h, render, Fragment } from 'preact';
import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';
import htm from 'htm';

export const html = htm.bind(h);
export { h, render, Fragment, useState, useEffect, useRef, useMemo, useCallback };

// ---------- Socket ----------
export const socket = window.io({ transports: ['websocket', 'polling'] });

export function emit(event, data) {
  return new Promise((resolve) => {
    socket.timeout(10000).emit(event, data, (err, res) => {
      if (err) return resolve({ error: 'Keine Antwort vom Server – Verbindung prüfen.' });
      resolve(res || {});
    });
  });
}

export async function act(a) {
  const r = await emit('act', a);
  if (r.error) toast(r.error, 'error');
  return r;
}

export async function op(type, payload = {}) {
  const r = await emit('op', { type, ...payload });
  if (r.error) toast(r.error, 'error');
  return r;
}

export const gameOp = (action) => op('game', { action });

// ---------- Stores ----------
function createStore(initial) {
  let value = initial;
  const subs = new Set();
  return {
    get: () => value,
    set: (v) => {
      value = typeof v === 'function' ? v(value) : v;
      subs.forEach((f) => f(value));
    },
    sub: (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

export const stateStore = createStore(null);
export const typingStore = createStore(null);
export const toastStore = createStore([]);
export const announceStore = createStore([]);
export const connStore = createStore(false);

export function useStore(store) {
  const [v, setV] = useState(store.get());
  useEffect(() => {
    setV(store.get());
    return store.sub((x) => setV(() => x));
  }, [store]);
  return v;
}

let toastId = 0;
export function toast(text, kind = 'info') {
  const id = ++toastId;
  toastStore.set((list) => [...list, { id, text, kind }]);
  setTimeout(() => toastStore.set((list) => list.filter((t) => t.id !== id)), 4200);
}

// ---------- Sitzung ----------
const SESSION_KEY = 'spieleabend.session';
export const session = {
  get() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  },
  set(v) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(v)); } catch { /* privat */ }
  },
  clear() {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* privat */ }
  },
};

export function pref(key, fallback) {
  try {
    const v = localStorage.getItem(`spieleabend.${key}`);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
export function setPref(key, v) {
  try { localStorage.setItem(`spieleabend.${key}`, JSON.stringify(v)); } catch { /* privat */ }
}

// ---------- Uhr (Server-Zeit) ----------
const clock = { offset: 0, best: Infinity };
export const now = () => Date.now() + clock.offset;

export async function syncClock() {
  for (let i = 0; i < 4; i++) {
    const t0 = Date.now();
    const server = await new Promise((res) => socket.timeout(3000).emit('ping-time', null, (err, t) => res(err ? null : t)));
    const t1 = Date.now();
    if (server == null) continue;
    const rtt = t1 - t0;
    if (rtt < clock.best) {
      clock.best = rtt;
      clock.offset = server - (t0 + rtt / 2);
    }
  }
}

export function remaining(t) {
  if (!t) return 0;
  return t.paused || !t.endsAt ? t.remaining : Math.max(0, t.endsAt - now());
}

export function useTick(active = true, ms = 100) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

// ---------- Sounds (WebAudio, kein Download nötig) ----------
let ctx = null;
export const sound = {
  muted: pref('muted', false),
  toggle() {
    this.muted = !this.muted;
    setPref('muted', this.muted);
  },
};

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
window.addEventListener('pointerdown', () => audio(), { once: true });

function tone(freq, start, dur, type = 'sine', vol = 0.18, slideTo = null) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const SFX = {
  correct: () => { tone(660, 0, 0.14, 'triangle'); tone(990, 0.1, 0.28, 'triangle'); },
  wrong: () => { tone(180, 0, 0.32, 'sawtooth', 0.12, 110); tone(140, 0.05, 0.3, 'square', 0.06, 90); },
  buzz: () => { tone(880, 0, 0.09, 'square', 0.12); tone(1320, 0.07, 0.16, 'square', 0.1); },
  reveal: () => { tone(523, 0, 0.12, 'triangle'); tone(784, 0.08, 0.22, 'triangle'); },
  open: () => tone(392, 0, 0.18, 'triangle', 0.12, 784),
  gong: () => { tone(196, 0, 1.1, 'sine', 0.22); tone(294, 0, 0.9, 'sine', 0.1); },
  lose: () => { tone(440, 0, 0.18, 'triangle'); tone(349, 0.16, 0.18, 'triangle'); tone(262, 0.32, 0.4, 'triangle'); },
  out: () => { tone(300, 0, 0.7, 'sawtooth', 0.12, 60); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, 'triangle', 0.16)),
  'win-round': () => [659, 784, 988].forEach((f, i) => tone(f, i * 0.1, 0.25, 'triangle', 0.14)),
  announce: () => tone(740, 0, 0.12, 'sine', 0.08),
  tick: () => tone(1200, 0, 0.04, 'square', 0.04),
};
export function play(name) {
  if (sound.muted) return;
  try { SFX[name]?.(); } catch { /* Audio nicht verfügbar */ }
}

// ---------- Konfetti ----------
export function confetti(ms = 3500) {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  document.body.appendChild(c);
  const g = c.getContext('2d');
  const resize = () => { c.width = innerWidth; c.height = innerHeight; };
  resize();
  const colors = ['#ffcc4d', '#ff4d6d', '#4d9bff', '#3ddc84', '#8b6cff', '#ff9f43'];
  const parts = Array.from({ length: 180 }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5,
    vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, r: 4 + Math.random() * 6,
    a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3, col: colors[Math.floor(Math.random() * colors.length)],
  }));
  const end = performance.now() + ms;
  (function frame(t) {
    g.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.a += p.va;
      g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.col;
      g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); g.restore();
    }
    if (t < end) requestAnimationFrame(frame);
    else c.remove();
  })(performance.now());
}

// ---------- UI-Bausteine ----------
const AV_COLORS = ['#ff4d6d', '#4d9bff', '#3ddc84', '#ffc93c', '#8b6cff', '#ff9f43', '#2ec4b6', '#e76fff'];
function hash(s) {
  let x = 0;
  for (const ch of s || '') x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return x;
}
export const initials = (name) => (name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function Avatar({ p, size = 44, sq = false, cls = '' }) {
  if (!p) return null;
  const style = `--size:${size}px;${p.avatar ? '' : `background:${AV_COLORS[hash(p.name) % AV_COLORS.length]}`}`;
  return html`<div class=${`avatar ${sq ? 'sq' : ''} ${p.connected === false ? 'off' : ''} ${cls}`} style=${style} title=${p.name}>
    ${p.avatar ? html`<img src=${p.avatar} alt=${p.name} loading="lazy" />` : initials(p.name)}
  </div>`;
}

export function Countdown({ timer, warn = 5, cls = '' }) {
  useTick(!!timer && !timer.paused);
  if (!timer) return null;
  const ms = remaining(timer);
  const s = Math.ceil(ms / 1000);
  const text = s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}`;
  return html`<span class=${`countdown ${s <= warn && !timer.paused ? 'low' : ''} ${cls}`}>${text}</span>`;
}

export function TimerBar({ timer }) {
  useTick(!!timer && !timer.paused);
  if (!timer) return html`<div class="timerbar"></div>`;
  const pct = Math.max(0, Math.min(100, (remaining(timer) / timer.duration) * 100));
  return html`<div class=${`timerbar ${pct < 25 ? 'low' : ''}`}><i style=${`width:${pct}%`}></i></div>`;
}

export function Hearts({ n, max }) {
  return html`<div class="hearts">${Array.from({ length: max }, (_, i) => html`<span class=${i < n ? '' : 'lost'}>❤️</span>`)}</div>`;
}

export function ByTag({ by }) {
  if (by === 'ki') return html`<span class="tag ki" title="Von der KI bewertet">KI</span>`;
  if (by === 'op') return html`<span class="tag op" title="Vom Operator korrigiert">Operator</span>`;
  return html`<span class="tag" title="Automatisch erkannt">Auto</span>`;
}

/** Live-Anzeige dessen, was der aktive Spieler gerade tippt */
export function TypingView({ pid, me }) {
  const t = useStore(typingStore);
  if (pid === me) return null;
  const text = t && t.pid === pid ? t.text : '';
  return html`<div class="typing">${text}${text ? html`<span class="caret"></span>` : html`<span class="faint small">tippt …</span>`}</div>`;
}

/** Antwortfeld mit Live-Übertragung der Tippbewegung */
export function AnswerInput({ onSubmit, placeholder = 'Antwort eingeben …', disabled = false, live = true, autoFocus = true, button = 'Abschicken' }) {
  const [val, setVal] = useState('');
  const ref = useRef(null);
  const last = useRef(0);
  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, []);
  const send = (e) => {
    e.preventDefault();
    if (disabled) return;
    onSubmit(val.trim());
    setVal('');
  };
  const onInput = (e) => {
    const v = e.target.value;
    setVal(v);
    if (live && Date.now() - last.current > 120) {
      last.current = Date.now();
      socket.emit('typing', { text: v });
    }
  };
  return html`<form class="answer-form" onSubmit=${send}>
    <input ref=${ref} class="input big" value=${val} onInput=${onInput} placeholder=${placeholder}
      autocomplete="off" autocorrect="off" spellcheck="false" maxlength="140" disabled=${disabled} />
    <button class="btn primary lg" disabled=${disabled}>${button}</button>
  </form>`;
}

export function Judging() {
  return html`<div class="judging"><span class="spinner"></span> Antwort wird geprüft …</div>`;
}

export function teamStyle(color) {
  return `--tc:${color}`;
}

export function playerMap(state) {
  return Object.fromEntries((state?.players || []).map((p) => [p.id, p]));
}
