// Highlight-Video des Abends: Ein Knopf beim Operator – die KI sucht die besten Momente aus,
// roastet alle Beteiligten, und der Browser schneidet daraus ein fertiges Video (MP4/WebM).
import { html, useState, useEffect, op, emit, toast, stateStore, GAME_EMOJI } from './lib.js';
import { recorder, getClip, audioMinutes, clearAudio } from './recorder.js';

const W = 1280, H = 720;
const TAG = {
  lustig: ['😂 LUSTIG', '#ff5fa2'], schlau: ['🧠 SCHLAU', '#3ad08a'], cool: ['😎 COOL', '#5aa9ff'], drama: ['🎭 DRAMA', '#f5c451'],
};
const FUN = "700 {s}px Sora, 'Segoe UI', system-ui, sans-serif";
const BODY = "{w} {s}px Inter, 'Segoe UI', system-ui, sans-serif";
const font = (tpl, s, w = 500) => tpl.replace('{s}', s).replace('{w}', w);
const ease = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

// ---------- Zeichnen ----------
const imgCache = new Map();
function img(url) {
  if (!url) return null;
  if (!imgCache.has(url)) {
    const i = new Image();
    i.src = url;
    imgCache.set(url, i);
  }
  const i = imgCache.get(url);
  return i.complete && i.naturalWidth ? i : null;
}
export function preloadImages(people) {
  return Promise.all(people.map((p) => p.avatar && new Promise((res) => {
    const i = img(p.avatar) ? null : imgCache.get(p.avatar);
    if (!i) return res();
    i.onload = res; i.onerror = res;
    setTimeout(res, 3000);
  })));
}

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = `${cut[maxLines - 1].replace(/\s+\S*$/, '')} …`;
    return cut;
  }
  return lines;
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function background(ctx, color) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#120c22'); g.addColorStop(1, '#07050e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const r = ctx.createRadialGradient(W * 0.5, -80, 40, W * 0.5, 0, 900);
  r.addColorStop(0, `${color}55`); r.addColorStop(1, 'transparent');
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
}

function avatar(ctx, person, x, y, size) {
  const i = img(person.avatar);
  ctx.save();
  ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
  if (i) ctx.drawImage(i, x, y, size, size);
  else {
    ctx.fillStyle = '#f5c451'; ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#1a1205'; ctx.font = font(FUN, size * 0.4); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((person.name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(), x + size / 2, y + size / 2 + 1);
  }
  ctx.restore();
}

function drawDrawing(ctx, strokes, x, y, size, p) {
  ctx.save();
  rrect(ctx, x, y, size, size, 22); ctx.fillStyle = '#fbf8f1'; ctx.fill(); ctx.clip();
  const total = strokes.reduce((n, s) => n + s.p.length, 0);
  let budget = Math.floor(total * Math.min(1, p));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of strokes) {
    if (budget <= 0) break;
    const pts = s.p.slice(0, budget);
    budget -= s.p.length;
    ctx.strokeStyle = s.c || '#1d0b45';
    ctx.lineWidth = Math.max(2, (s.w || 6) * (size / 600));
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * size, y + py * size) : ctx.moveTo(x + px * size, y + py * size)));
    if (pts.length === 1) ctx.lineTo(x + pts[0][0] * size + 0.1, y + pts[0][1] * size);
    ctx.stroke();
  }
  ctx.restore();
}

const clock = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Eine Folie zeichnen. p = Fortschritt der Folie (0 … 1) für Animationen */
export function drawSlide(ctx, slide, p) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  if (slide.type === 'intro') drawIntro(ctx, slide, p);
  else if (slide.type === 'awards') drawAwards(ctx, slide, p);
  else if (slide.type === 'roasts') drawRoasts(ctx, slide, p);
  else drawItem(ctx, slide, p);
  ctx.restore();
}

function drawIntro(ctx, { data }, p) {
  background(ctx, '#f5c451');
  const a = ease(p * 3);
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5c451'; ctx.font = font(BODY, 26, 700);
  ctx.fillText('S P I E L E A B E N D', W / 2, 190);
  ctx.fillStyle = '#fff'; ctx.font = font(FUN, 96);
  ctx.fillText('Die Highlights', W / 2, 190 + 110 * a);
  ctx.fillStyle = '#b9b3cc'; ctx.font = font(BODY, 28);
  ctx.fillText(new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), W / 2, 360);
  ctx.globalAlpha = ease(p * 3 - 0.6);
  ctx.font = font(BODY, 24);
  const games = (data.games || []).join(' · ');
  if (games) wrap(ctx, `Gespielt: ${games}`, 1000, 2).forEach((l, i) => ctx.fillText(l, W / 2, 450 + i * 34));
  ctx.fillStyle = '#f5c451';
  wrap(ctx, (data.players || []).join(' · '), 1000, 2).forEach((l, i) => ctx.fillText(l, W / 2, 540 + i * 34));
  ctx.fillStyle = '#8a83a3'; ctx.font = font(BODY, 20);
  ctx.fillText(`${data.count ?? data.items?.length ?? 0} Highlights`, W / 2, 640);
}

function drawAwards(ctx, { awards }, p) {
  background(ctx, '#f5c451');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.font = font(FUN, 64);
  ctx.globalAlpha = ease(p * 4);
  ctx.fillText('🏆 Auszeichnungen', W / 2, 130);
  const list = awards?.length ? awards : [{ icon: '🎉', title: 'Danke fürs Mitspielen!', name: 'Alle', why: 'Bis zum nächsten Spieleabend' }];
  list.slice(0, 5).forEach((aw, i) => {
    const a = ease(p * 4 - 0.4 - i * 0.35);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    const y = 190 + i * 98 + (1 - a) * 30;
    rrect(ctx, 190, y, 900, 82, 20); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = font(FUN, 44); ctx.fillStyle = '#fff'; ctx.fillText(aw.icon, 215, y + 57);
    ctx.font = font(FUN, 30); ctx.fillStyle = '#f5c451'; ctx.fillText(aw.title, 290, y + 38);
    ctx.font = font(BODY, 20); ctx.fillStyle = '#b9b3cc'; ctx.fillText(aw.why || '', 290, y + 66);
    ctx.textAlign = 'right'; ctx.font = font(FUN, 34); ctx.fillStyle = '#fff'; ctx.fillText(aw.name, 1065, y + 54);
  });
}

function drawRoasts(ctx, { roasts }, p) {
  background(ctx, '#ff5fa2');
  ctx.textAlign = 'center';
  ctx.globalAlpha = ease(p * 6);
  ctx.fillStyle = '#fff'; ctx.font = font(FUN, 60);
  ctx.fillText('🔥 Das Urteil', W / 2, 105);
  const list = roasts.slice(0, 6);
  const rowH = Math.min(96, 560 / list.length);
  list.forEach((r, i) => {
    // Eine Person nach der anderen erscheint
    const a = ease((p * (list.length + 1) - i - 0.6) * 2);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    const y = 140 + i * rowH + (1 - a) * 24;
    rrect(ctx, 70, y, W - 140, rowH - 12, 18); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    const size = Math.min(60, rowH - 30);
    avatar(ctx, r, 92, y + (rowH - 12 - size) / 2, size);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff9cc7'; ctx.font = font(FUN, 24); ctx.fillText(r.name, 110 + size, y + 32);
    ctx.fillStyle = '#fff'; ctx.font = font(BODY, rowH > 80 ? 22 : 19, 500);
    wrap(ctx, r.line, W - 260 - size, 2).forEach((l, k) => ctx.fillText(l, 110 + size, y + 60 + k * 26));
  });
}

function drawItem(ctx, { item, n, total }, p) {
  const [tagLabel, color] = TAG[item.tag] || TAG.lustig;
  background(ctx, color);
  // Kopfzeile
  ctx.globalAlpha = ease(p * 5);
  ctx.textAlign = 'left'; ctx.fillStyle = '#b9b3cc'; ctx.font = font(BODY, 24, 600);
  ctx.fillText(`${GAME_EMOJI[item.game] || '🎲'}  ${item.gameTitle}  ·  ${clock(item.t)}`, 60, 70);
  ctx.textAlign = 'right'; ctx.fillStyle = color; ctx.font = font(BODY, 22, 800);
  ctx.fillText(tagLabel, W - 60, 70);
  ctx.fillStyle = '#6f6888'; ctx.font = font(BODY, 18, 600);
  ctx.fillText(`${n} / ${total}`, W - 60, 98);
  // Kommentar der KI (groß)
  const a = ease(p * 4 - 0.2);
  ctx.globalAlpha = a;
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = font(FUN, 46);
  const cap = wrap(ctx, item.caption, W - 120, 2);
  cap.forEach((l, i) => ctx.fillText(l, 60 + (1 - a) * 40, 160 + i * 56));
  const top = 160 + cap.length * 56 + 10;
  // Inhalt
  const b = ease(p * 4 - 0.6);
  ctx.globalAlpha = b;
  rrect(ctx, 60, top, W - 120, 600 - top, 26); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
  ctx.strokeStyle = `${color}66`; ctx.lineWidth = 2; ctx.stroke();
  let x = 100, y = top + 50;
  const maxW = W - 200;
  if (item.drawing?.length) {
    const size = Math.min(600 - top - 40, 380);
    drawDrawing(ctx, item.drawing, 90, top + 20, size, (p - 0.1) * 1.6);
    x = 90 + size + 40;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#b9b3cc'; ctx.font = font(BODY, 22, 600); ctx.fillText(item.q || '', x, top + 60);
    ctx.fillStyle = '#f5c451'; ctx.font = font(FUN, 54);
    ctx.globalAlpha = b * ease(p * 3 - 1.4);
    ctx.fillText(item.text || '', x, top + 140);
    ctx.globalAlpha = b;
    ctx.fillStyle = '#d8d3e8'; ctx.font = font(BODY, 22);
    wrap(ctx, item.note || '', W - x - 90, 4).forEach((l, i) => ctx.fillText(l, x, top + 200 + i * 32));
  } else {
    ctx.textAlign = 'left';
    if (item.q) {
      ctx.fillStyle = '#b9b3cc'; ctx.font = font(BODY, 24, 600);
      wrap(ctx, item.q, maxW, 2).forEach((l) => { ctx.fillText(l, x, y); y += 34; });
      y += 18;
    }
    if (item.text) {
      ctx.fillStyle = '#fff'; ctx.font = font(FUN, 44);
      const quote = ['answer', 'survey', 'lie', 'joke', 'secret', 'auction'].includes(item.kind) ? `„${item.text}“` : item.text;
      wrap(ctx, quote, maxW, 3).forEach((l) => { ctx.fillText(l, x, y + 20); y += 56; });
      y += 14;
    }
    ctx.font = font(BODY, 22, 600);
    const solution = item.kind === 'lie' && item.text !== item.a ? 'Die Wahrheit' : item.kind === 'emoji' ? 'Lösung' : item.kind === 'estimate' ? 'Richtig' : item.ok === false ? 'Richtig wäre' : null;
    if (item.a && solution) { ctx.fillStyle = '#3ad08a'; ctx.fillText(`${solution}: ${item.a}`, x, y + 10); y += 36; }
    if (item.note) { ctx.fillStyle = '#d8d3e8'; ctx.font = font(BODY, 22); wrap(ctx, item.note, maxW, 2).forEach((l) => { ctx.fillText(l, x, y + 10); y += 32; }); }
  }
  // Personen
  ctx.globalAlpha = ease(p * 4 - 1);
  let px = 60;
  for (const person of (item.people || []).slice(0, 6)) {
    avatar(ctx, person, px, 625, 56);
    ctx.fillStyle = '#fff'; ctx.font = font(BODY, 22, 700); ctx.textAlign = 'left';
    ctx.fillText(person.name, px + 68, 662);
    px += 68 + ctx.measureText(person.name).width + 34;
  }
  // Fortschrittsbalken
  ctx.globalAlpha = 1;
  ctx.fillStyle = `${color}aa`; ctx.fillRect(0, H - 6, W * Math.min(1, p), 6);
}

// ---------- Folienfolge ----------
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export function slidesOf(data) {
  const items = data.items || [];
  return [
    { type: 'intro', data, dur: 5000 },
    ...items.map((item, i) => ({ type: 'item', item, n: i + 1, total: items.length })),
    ...(data.awards?.length ? [{ type: 'awards', awards: data.awards, dur: 8000 }] : []),
    ...chunk(data.roasts || [], 6).map((roasts) => ({ type: 'roasts', roasts, dur: 3000 + roasts.length * 3500 })),
  ];
}

function slideDuration(slide, clip) {
  if (slide.dur) return slide.dur;
  const base = slide.item.drawing ? 9000 : 7000;
  return clip ? Math.min(16000, Math.max(base, clip.duration * 1000 + 1200)) : base;
}

// ---------- Video-Export (beim Operator) ----------
function pickVideoMime() {
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Rendert alle Folien in Echtzeit auf ein Canvas und nimmt sie samt Ton auf */
export async function exportVideo(code, onProgress) {
  const data = await emit('recap:get');
  if (!data?.items) throw new Error('Kein Rückblick vorhanden.');
  const slides = slidesOf(data);
  onProgress({ step: 'Bilder und Ton werden vorbereitet …', p: 0 });
  await preloadImages([...data.items.flatMap((it) => it.people || []), ...(data.roasts || [])]);
  const clips = [];
  for (const s of slides) clips.push(s.item?.clip ? await getClip(code, s.item.clip.from, s.item.clip.to).catch(() => null) : null);
  const durs = slides.map((s, i) => slideDuration(s, clips[i]));
  const total = durs.reduce((a, b) => a + b, 0);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawSlide(ctx, slides[0], 0);
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  await ac.resume();
  const dest = ac.createMediaStreamDestination();
  // Leiser Dauerton (unhörbar), damit die Tonspur nie abreißt
  const keep = ac.createConstantSource(); const g = ac.createGain(); g.gain.value = 0; keep.connect(g).connect(dest); keep.start();
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = pickVideoMime();
  const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128000 });
  const chunks = [];
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => { mr.onstop = res; });
  mr.start(1000);
  let elapsed = 0;
  for (let i = 0; i < slides.length; i++) {
    if (clips[i]) { const src = ac.createBufferSource(); src.buffer = clips[i]; src.connect(dest); src.start(); }
    const t0 = performance.now();
    while (performance.now() - t0 < durs[i]) {
      const t = performance.now() - t0;
      drawSlide(ctx, slides[i], t / durs[i]);
      onProgress({ step: `Folie ${i + 1} von ${slides.length}`, p: (elapsed + t) / total });
      await sleep(1000 / 30);
    }
    elapsed += durs[i];
  }
  mr.stop();
  await done;
  keep.stop();
  ac.close();
  const type = mr.mimeType || 'video/webm';
  const blob = new Blob(chunks, { type });
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Spieleabend-Highlights-${new Date().toISOString().slice(0, 10)}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return { ext, mb: Math.round(blob.size / 1e5) / 10, seconds: Math.round(total / 1000) };
}

// ---------- Bedienfeld für den Operator (Lobby & Ergebnis) ----------
function useRecorder() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    recorder.subs.add(f);
    return () => recorder.subs.delete(f);
  }, []);
  return recorder;
}

export function RecapPanel({ st }) {
  const rec = useRecorder();
  const [minutes, setMinutes] = useState(null);
  const [ask, setAsk] = useState(false);
  const [opts, setOpts] = useState({ system: true, mic: true });
  const [job, setJob] = useState(null); // { step, p }
  useEffect(() => { audioMinutes(st.code).then(setMinutes).catch(() => {}); }, [st.code, rec.active, job]);
  // Nach einem Neuladen läuft keine Aufnahme mehr – Anzeige für alle korrigieren
  useEffect(() => { if (st.recording && !rec.active) op('recording', { on: false }); }, []);

  const startRec = async () => {
    setAsk(false);
    try { await rec.start(st.code, opts); } catch (err) { toast(err.message, 'error'); }
  };

  /** Ein Knopf: KI schneidet → Video wird gerendert → Download */
  const makeVideo = async () => {
    if (job) return;
    setJob({ step: 'Die KI sucht die besten Momente aus …', p: 0 });
    try {
      const before = stateStore.get()?.recap?.version || 0;
      const r = await op('recapBuild');
      if (r?.error) throw new Error(r.error);
      let cur = stateStore.get()?.recap;
      for (let i = 0; i < 240 && !(cur?.version > before && ['ready', 'empty', 'error'].includes(cur.status)); i++) {
        await sleep(500);
        cur = stateStore.get()?.recap;
      }
      if (cur?.status === 'empty') throw new Error('Noch keine Highlights – spielt erst ein paar Runden!');
      if (cur?.status !== 'ready') throw new Error('Die Highlights konnten nicht erstellt werden – bitte nochmal versuchen.');
      const res = await exportVideo(st.code, (p) => setJob({ step: p.step, p: p.p }));
      toast(`🎬 Dein Highlight-Video ist fertig (${Math.round(res.seconds / 6) / 10} Min., ${res.mb} MB)`);
    } catch (err) {
      toast(err.message || 'Video konnte nicht erstellt werden', 'error');
    }
    setJob(null);
  };

  const level = Math.min(1, rec.level * 8);
  return html`<div class="card recap-panel">
    <div class="row wrap" style="gap:12px;justify-content:space-between">
      <div><div class="section-title" style="margin:0">🎬 Highlight-Video</div>
        <div class="small muted">${st.moments || 0} Momente gesammelt${minutes ? ` · ${minutes} Min. Ton` : ''} · am Ende des Abends drücken</div></div>
      ${job
        ? html`<div class="recap-job"><div class="small"><b>${job.step}</b></div>
            <div class="rec-meter" style="width:220px"><i style=${`width:${Math.round(job.p * 100)}%`}></i></div>
            <div class="tiny muted">Tab bitte offen lassen – das Video entsteht in Echtzeit.</div></div>`
        : html`<button class="btn primary lg" disabled=${(st.moments || 0) < 3} onClick=${makeVideo}>🎬 Highlight-Video erstellen</button>`}
    </div>
    <div class="recap-rec">
      ${rec.active
        ? html`<span class="rec-dot"></span><b>Ton-Aufnahme läuft</b><span class="rec-meter"><i style=${`width:${Math.round(level * 100)}%`}></i></span>
            <button class="btn xs bad" onClick=${() => rec.stop()}>⏹ Stoppen</button>`
        : html`<button class="btn xs ghost" onClick=${() => setAsk(!ask)}>🎙️ Ton mit aufnehmen (optional)</button>`}
      <div class="spacer"></div>
      <a class="tiny muted" href="#" onClick=${async (e) => { e.preventDefault(); if (confirm('Neuen Abend beginnen? Alle gesammelten Momente und der aufgenommene Ton dieses Raums werden gelöscht.')) { if (rec.active) rec.stop(); await clearAudio(st.code); op('recapReset'); setMinutes(0); } }}>🗑 Neuer Abend</a>
    </div>
    ${ask && !rec.active && html`<div class="recap-ask">
      <p class="small" style="margin:0 0 8px"><b>Nur aufnehmen, wenn alle einverstanden sind.</b> Alle sehen ein 🔴, solange aufgenommen wird.
        Der Ton bleibt <b>nur auf deinem PC</b> und wird nie hochgeladen. Mit Ton findet das Video eure Lacher und spielt sie ab.</p>
      <label class="row" style="gap:8px"><input type="checkbox" checked=${opts.system} onChange=${(e) => setOpts({ ...opts, system: e.target.checked })} />
        PC-Ton (Stimmen aus Discord) – im nächsten Fenster <b>„Gesamter Bildschirm“</b> wählen und <b>„Systemaudio teilen“</b> anhaken</label>
      <label class="row" style="gap:8px"><input type="checkbox" checked=${opts.mic} onChange=${(e) => setOpts({ ...opts, mic: e.target.checked })} />
        Mein Mikrofon (deine eigene Stimme)</label>
      <div class="row" style="gap:8px;margin-top:8px"><button class="btn sm primary" onClick=${startRec}>🔴 Alle sind einverstanden – Aufnahme starten</button>
        <button class="btn sm ghost" onClick=${() => setAsk(false)}>Abbrechen</button></div>
    </div>`}
  </div>`;
}

/** Kleines Zeichen für alle, solange der Operator Ton aufnimmt */
export function RecBadge({ st }) {
  return st.recording ? html`<span class="pill bad rec-badge" title="Der Operator nimmt den Ton für das Highlight-Video auf (nur auf seinem PC)"><span class="rec-dot"></span> Ton-Aufnahme</span>` : null;
}
