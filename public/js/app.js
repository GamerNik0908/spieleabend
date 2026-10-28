// Einstieg: Verbindung, Startseite, Raum-Rahmen und globale Overlays.
import {
  html, render, useState, useEffect, useStore, stateStore, typingStore, toastStore, announceStore, connStore,
  socket, session, emit, toast, play, confetti, syncClock, sound, pref, setPref, op,
} from './lib.js';
import { Lobby } from './lobby.js';
import { Results } from './results.js';
import { OpBar } from './opbar.js';
import { QuizDuellView } from './games/quizduell.js';
import { FamilienDuellView } from './games/familienduell.js';
import { DuemmsteView } from './games/duemmste.js';

// ---------- Socket-Verdrahtung ----------
socket.on('connect', async () => {
  connStore.set(true);
  syncClock();
  const s = session.get();
  if (s?.token) {
    const r = await emit('resume', s);
    if (r.error) {
      session.clear();
      stateStore.set(null);
    }
  }
});
socket.on('disconnect', () => connStore.set(false));
socket.on('state', (st) => stateStore.set(st));
socket.on('typing', (t) => typingStore.set(t));
socket.on('announce', (a) => {
  announceStore.set((list) => [...list, { ...a, at: Date.now() }].slice(-5));
  play('announce');
});
// Große Stempel quer über den Bildschirm (RICHTIG / FALSCH / ✕)
let stampId = 0;
const stampStore = { v: null, subs: new Set(), set(x) { this.v = x; this.subs.forEach((f) => f(x)); } };
function showStamp(kind) {
  const id = ++stampId;
  stampStore.set({ id, kind });
  setTimeout(() => stampId === id && stampStore.set(null), 1250);
}
socket.on('fx', (f) => {
  play(f.kind);
  if (f.kind === 'win') confetti();
  const game = stateStore.get()?.game?.type;
  if (f.kind === 'correct') showStamp('ok');
  if (f.kind === 'wrong') showStamp(game === 'familienduell' ? 'x' : 'bad');
});
socket.on('kicked', () => {
  session.clear();
  stateStore.set(null);
  toast('Du wurdest aus dem Raum entfernt.', 'error');
});
socket.on('toast', (t) => toast(t.text, t.kind));

// ---------- Startseite ----------
function Home() {
  const params = new URLSearchParams(location.search);
  const [name, setName] = useState(pref('name', ''));
  const [code, setCode] = useState((params.get('raum') || '').toUpperCase());
  const [busy, setBusy] = useState(false);
  const connected = useStore(connStore);

  const go = async (kind) => {
    if (!name.trim()) return toast('Bitte zuerst deinen Namen eingeben.', 'error');
    if (kind === 'join' && code.trim().length < 4) return toast('Bitte den 4-stelligen Raumcode eingeben.', 'error');
    setBusy(true);
    setPref('name', name.trim());
    const r = await emit(kind, { name: name.trim(), code: code.trim() });
    setBusy(false);
    if (r.error) return toast(r.error, 'error');
    session.set({ code: r.code, token: r.token });
    history.replaceState(null, '', `/?raum=${r.code}`);
  };

  return html`<div class="home">
    <div class="hero rise">
      <h1><span class="w1">Spiele</span><span class="w2">abend!</span></h1>
      <p>Drei Gameshows, ein Raum, alle von überall. 🎤</p>
    </div>
    <div class="card name-card rise">
      <label class="field">Wie heißt du?
        <input class="input big" value=${name} maxlength="20" placeholder="Dein Name …"
          onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && go(code ? 'join' : 'create')} />
      </label>
    </div>
    <div class="home-grid">
      <div class="card c-create rise">
        <h3>🎬 Neuen Abend starten</h3>
        <p>Du wirst <b>Operator</b>: Du wählst die Spiele, pausierst, korrigierst und verteilst Bilder – und spielst trotzdem mit.</p>
        <div class="spacer"></div>
        <button class="btn primary lg block go" disabled=${busy || !connected} onClick=${() => go('create')}>Raum erstellen</button>
      </div>
      <div class="card c-join rise">
        <h3>🚪 Mitspielen</h3>
        <input class="input code" value=${code} maxlength="4" placeholder="CODE"
          onInput=${(e) => setCode(e.target.value.toUpperCase())} onKeyDown=${(e) => e.key === 'Enter' && go('join')} />
        <button class="btn lg block" disabled=${busy || !connected} onClick=${() => go('join')}>Beitreten</button>
      </div>
    </div>
    <div class="game-strip">
      <div class="card tight" style="background:linear-gradient(160deg,#5b8dff,#2f6bff)"><span class="emoji">⚡</span><b>Quiz Duell</b><div class="small">Brett, Kategorien, Buzzer</div></div>
      <div class="card tight" style="background:linear-gradient(160deg,#ff77a6,#ff3d7f)"><span class="emoji">📊</span><b>Familien-Duell</b><div class="small">Errate die Top-Antworten</div></div>
      <div class="card tight" style="background:linear-gradient(160deg,#ffe066,#f2b705);color:#2a1300"><span class="emoji">🧠</span><b>Der Dümmste fliegt</b><div class="small">Schnellfragen & Abstimmung</div></div>
    </div>
    ${!connected && html`<p class="center muted" style="margin-top:18px">Verbinde mit dem Server …</p>`}
  </div>`;
}

// ---------- Overlays ----------
function Announcements() {
  const list = useStore(announceStore);
  const cur = list[0];
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!cur) return undefined;
    setLeaving(false);
    const len = (cur.text?.length || 0) + (cur.sub?.length || 0);
    // Veraltete Meldungen überspringen, wenn schon neuere warten
    if (list.length > 1 && Date.now() - cur.at > 4000) {
      announceStore.set((l) => l.slice(1));
      return undefined;
    }
    let dur = Math.min(4600, 2000 + len * 20) + (cur.image ? 1500 : 0);
    if (list.length > 1) dur = Math.min(dur, 1500);
    const t1 = setTimeout(() => setLeaving(true), dur);
    const t2 = setTimeout(() => announceStore.set((l) => l.slice(1)), dur + 280);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [cur?.id]);
  if (!cur) return null;
  return html`<div class="announce-wrap">
    <div class=${`announce ${cur.operator ? 'op' : ''} ${leaving ? 'out' : ''}`} key=${cur.id}>
      ${cur.operator && html`<div class="badge pill op">👑 Operator-Aktion</div>`}
      <div class="text">${cur.text}</div>
      ${cur.sub && html`<div class="sub">${cur.sub}</div>`}
      ${cur.image && html`<img src=${cur.image} alt="" />`}
    </div>
  </div>`;
}

function Stamp() {
  const [v, setV] = useState(null);
  useEffect(() => { stampStore.subs.add(setV); return () => stampStore.subs.delete(setV); }, []);
  if (!v) return null;
  const label = v.kind === 'ok' ? 'RICHTIG!' : v.kind === 'bad' ? 'FALSCH!' : '✕';
  return html`<div class="stamp-wrap"><div class=${`stamp ${v.kind}`} key=${v.id}>${label}</div></div>`;
}

function Toasts() {
  const list = useStore(toastStore);
  return html`<div class="toasts">${list.map((t) => html`<div class=${`toast ${t.kind}`} key=${t.id}>${t.text}</div>`)}</div>`;
}

function PauseScreen({ st }) {
  if (!st.paused) return null;
  return html`<div class="pause-screen">
    <div>
      <div class="big">PAUSE</div>
      <p class="muted" style="font-size:18px">Der Operator hat das Spiel kurz angehalten.</p>
      ${st.me.isOperator && html`<button class="btn primary lg" onClick=${() => op('resume')}>▶ Weiter spielen</button>`}
    </div>
  </div>`;
}

// ---------- Raum ----------
function TopBar({ st }) {
  const connected = useStore(connStore);
  const [muted, setMuted] = useState(sound.muted);
  const copy = async () => {
    const link = `${location.origin}/?raum=${st.code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Einladungslink kopiert!');
    } catch {
      toast(link);
    }
  };
  const leave = async () => {
    if (!confirm('Raum wirklich verlassen?')) return;
    await emit('leave');
    session.clear();
    stateStore.set(null);
    history.replaceState(null, '', '/');
  };
  return html`<div class="topbar">
    <div class="logo"><span class="dice">🎲</span><span class="txt">Spieleabend</span></div>
    <span class="code-chip" title="Einladungslink kopieren" onClick=${copy}>${st.code}</span>
    <span class=${`dot ${connected ? '' : 'off'}`} title=${connected ? 'Verbunden' : 'Getrennt – verbinde neu …'}></span>
    ${st.ai && html`<span class="pill op small" title="Antworten, die die normale Erkennung nicht versteht, prüft eine KI">🤖 KI-Richter</span>`}
    <div class="spacer"></div>
    <span class="muted small nowrap">${st.me.name}${st.me.isOperator ? ' 👑' : ''}</span>
    <button class="btn icon ghost" title="Ton an/aus" onClick=${() => { sound.toggle(); setMuted(sound.muted); }}>${muted ? '🔇' : '🔊'}</button>
    <button class="btn sm ghost" onClick=${leave}>Verlassen</button>
  </div>`;
}

const GAME_VIEWS = { quizduell: QuizDuellView, familienduell: FamilienDuellView, duemmste: DuemmsteView };

function Room({ st }) {
  const G = st.game && GAME_VIEWS[st.game.type];
  const showOpBar = st.me.isOperator && st.screen === 'game';
  return html`<div class="app">
    <${TopBar} st=${st} />
    <main class=${`main ${showOpBar ? 'with-opbar' : ''}`}>
      ${st.screen === 'lobby' && html`<${Lobby} st=${st} />`}
      ${st.screen === 'results' && html`<${Results} st=${st} />`}
      ${st.screen === 'game' && G && html`<${G} st=${st} g=${st.game} />`}
    </main>
    ${showOpBar && html`<${OpBar} st=${st} />`}
    <${PauseScreen} st=${st} />
  </div>`;
}

function App() {
  const st = useStore(stateStore);
  useEffect(() => {
    if (st?.code) history.replaceState(null, '', `/?raum=${st.code}`);
  }, [st?.code]);
  // Jedes Spiel hat seine eigene Bühnenfarbe
  const theme = st?.screen === 'game' ? st.game?.type : '';
  useEffect(() => { document.body.dataset.game = theme || ''; }, [theme]);
  return html`<div>
    ${st ? html`<${Room} st=${st} />` : html`<div class="app"><main class="main"><${Home} /></main></div>`}
    <${Stamp} />
    <${Announcements} />
    <${Toasts} />
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
