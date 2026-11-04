// Ton-Aufnahme für das Highlight-Video – läuft NUR im Browser des Operators.
// Der Ton bleibt auf seinem PC (IndexedDB) und wird nie hochgeladen. An den Server geht nur,
// WANN es laut wurde (meist Gelächter), damit die Highlights dort gesucht werden.
// Aufgenommen wird in 30-Sekunden-Stücken, damit später kurze Ausschnitte schnell zu haben sind.
import { now, op } from './lib.js';

const DB = 'spieleabend-audio';
const SEGMENT_MS = 30000;

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('seg', { keyPath: 'id', autoIncrement: true }).createIndex('room', 'room');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction('seg', mode);
    const out = fn(t.objectStore('seg'));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}

const putSeg = (seg) => tx('readwrite', (s) => s.add(seg)).catch((err) => console.error('[Aufnahme] Speichern fehlgeschlagen', err));
const segsOf = (room) => tx('readonly', (s) => s.index('room').getAll(room)).catch(() => []);

/** Wie viele Minuten Ton liegen für diesen Raum auf diesem PC? */
export async function audioMinutes(room) {
  const segs = await segsOf(room);
  return Math.round(segs.reduce((n, s) => n + (s.end - s.start), 0) / 60000);
}

export async function clearAudio(room) {
  const segs = await segsOf(room);
  await tx('readwrite', (s) => segs.forEach((x) => s.delete(x.id)));
}

function pickMime() {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

let decodeCtx = null;
const clipCache = new Map();

/**
 * Ton-Ausschnitt [from, to] (Serverzeit in ms) als AudioBuffer – oder null, wenn es dafür
 * keine Aufnahme gibt. Sanft ein- und ausgeblendet.
 */
export async function getClip(room, from, to) {
  const key = `${room}|${from}|${to}`;
  if (clipCache.has(key)) return clipCache.get(key);
  const segs = (await segsOf(room)).filter((s) => s.start < to && s.end + 2000 > from).sort((a, b) => a.start - b.start);
  if (!segs.length) return null;
  decodeCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  const sr = decodeCtx.sampleRate;
  const out = decodeCtx.createBuffer(2, Math.max(1, Math.ceil(((to - from) / 1000) * sr)), sr);
  let filled = false;
  for (const seg of segs) {
    let buf;
    try { buf = await decodeCtx.decodeAudioData(await seg.blob.arrayBuffer()); } catch { continue; }
    const offset = Math.round(((seg.start - from) / 1000) * sr);
    for (let ch = 0; ch < 2; ch++) {
      const src = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
      const dst = out.getChannelData(ch);
      const i0 = Math.max(0, -offset);
      const i1 = Math.min(src.length, dst.length - offset);
      for (let i = i0; i < i1; i++) dst[offset + i] = src[i];
      if (i1 > i0) filled = true;
    }
  }
  if (!filled) { clipCache.set(key, null); return null; }
  const fade = Math.min(Math.round(sr * 0.35), Math.floor(out.length / 4));
  for (let ch = 0; ch < 2; ch++) {
    const d = out.getChannelData(ch);
    for (let i = 0; i < fade; i++) { d[i] *= i / fade; d[d.length - 1 - i] *= i / fade; }
  }
  clipCache.set(key, out);
  return out;
}

/** Die laufende Aufnahme (es gibt nur eine pro Browser-Tab) */
export const recorder = {
  active: false,
  room: null,
  level: 0,
  subs: new Set(),
  notify() { this.subs.forEach((f) => f()); },

  /**
   * system: PC-Ton per „Bildschirm teilen“ (so kommen die Stimmen aus Discord mit)
   * mic: eigenes Mikrofon (Discord gibt die eigene Stimme nicht an den PC-Ton zurück)
   */
  async start(room, { system = true, mic = true } = {}) {
    if (this.active) return;
    if (!window.MediaRecorder) throw new Error('Dieser Browser kann keinen Ton aufnehmen – bitte Chrome oder Edge nehmen.');
    const streams = [];
    try {
      if (system) {
        const s = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          systemAudio: 'include',
        });
        if (!s.getAudioTracks().length) {
          s.getTracks().forEach((t) => t.stop());
          throw new Error('Es wurde kein Ton geteilt. Beim Teilen „Gesamter Bildschirm“ wählen und „Systemaudio teilen“ anhaken.');
        }
        // Das Bild brauchen wir nicht – Track nur stummschalten (Stoppen würde bei manchen Browsern alles beenden)
        s.getVideoTracks().forEach((t) => { t.enabled = false; });
        streams.push(s);
      }
      if (mic) streams.push(await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }));
    } catch (err) {
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      if (err?.name === 'NotAllowedError') throw new Error('Freigabe abgelehnt – ohne Freigabe keine Aufnahme.');
      throw err;
    }
    if (!streams.length) throw new Error('Nichts zum Aufnehmen ausgewählt.');

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = ctx.createMediaStreamDestination();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    for (const s of streams) {
      const src = ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));
      src.connect(dest);
      src.connect(analyser);
      s.getAudioTracks().forEach((t) => t.addEventListener('ended', () => this.stop()));
    }
    const mime = pickMime();
    const segment = () => {
      const mr = new MediaRecorder(dest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
      const chunks = [];
      let start = now();
      mr.onstart = () => { start = now(); };
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => { if (chunks.length) putSeg({ room, start, end: now(), blob: new Blob(chunks, { type: mr.mimeType }) }); };
      mr.start();
      return mr;
    };
    this.ctx = ctx;
    this.streams = streams;
    this.mr = segment();
    // Neues Stück beginnen, bevor das alte endet – so entsteht keine Lücke
    this.rotateTimer = setInterval(() => { const old = this.mr; this.mr = segment(); old.stop(); }, SEGMENT_MS);

    // Lacher erkennen: deutlich lauter als der übliche Pegel, mindestens ~0,8 s lang
    const data = new Float32Array(analyser.fftSize);
    let base = 0, hot = 0, lastLoud = 0;
    this.levelTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      this.level = rms;
      const loud = base > 0 && rms > Math.max(0.035, base * 2.2);
      if (!loud) base = base ? base * 0.99 + rms * 0.01 : rms;
      hot = loud ? hot + 1 : 0;
      if (hot >= 4 && now() - lastLoud > 6000) {
        lastLoud = now();
        op('loud', { t: now() - 800, level: Math.min(3, rms / Math.max(base, 0.005) / 2.2) });
      }
      this.notify();
    }, 200);

    this.active = true;
    this.room = room;
    op('recording', { on: true });
    this.notify();
  },

  stop() {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.rotateTimer);
    clearInterval(this.levelTimer);
    try { this.mr?.stop(); } catch { /* schon gestoppt */ }
    this.streams?.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    setTimeout(() => this.ctx?.close(), 500);
    this.level = 0;
    op('recording', { on: false });
    this.notify();
  },
};

window.addEventListener('beforeunload', () => { if (recorder.active) recorder.stop(); });
