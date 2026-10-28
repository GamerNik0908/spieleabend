// Lobby: Spieler, Spielauswahl, Einstellungen, Teams – plus Operator-Bereiche
// für Bilder, All-Time-Score und Daten.
import { html, useState, useEffect, useRef, op, session, toast, Avatar, teamStyle, playerMap } from './lib.js';

export const GAME_INFO = {
  quizduell: {
    emoji: '⚡', title: 'Quiz Duell', desc: 'Jeopardy-Brett mit 6 Kategorien. Falsch? Die anderen buzzern und klauen.',
    rules: [
      'Die Teams wählen nacheinander ein Feld – reihum tippt ein anderes Teammitglied die Antwort (absprechen per Voice ist erlaubt).',
      'Richtig = Punkte. Falsch oder Zeit um = halbe Punkte Abzug, und die anderen Teams dürfen buzzern und abstauben.',
      'Runde 2 zählt doppelt – das Team mit den wenigsten Punkten fängt an.',
    ],
  },
  familienduell: {
    emoji: '📊', title: 'Familien-Duell', desc: '„Wir haben 100 Leute gefragt …“ – findet die Top-Antworten.',
    rules: [
      'Zwei Spieler am Buzzer: Wer schneller ist, antwortet. Die bessere Antwort holt die Runde fürs Team.',
      'Das Team rät reihum weiter. Drei Fehler – dann darf das andere Team mit einer Antwort klauen.',
      'Im Finale antwortet aus jedem Team eine Person geheim – Punkte = Prozent.',
    ],
  },
  duemmste: {
    emoji: '🧠', title: 'Der Dümmste fliegt', desc: 'Schnellfragen reihum, danach wählt ihr den Dümmsten. Leben weg!',
    rules: [
      'Reihum bekommt jeder blitzschnell eine Frage. Nach Ablauf der Rundenzeit wird abgestimmt.',
      'Es geht nicht darum, wer am meisten falsch hat – sondern wer am dümmsten war. Meiste Stimmen = ein Leben weg.',
      'Gleichstand? Stechen mit Fragen, bis einer patzt. Die letzten zwei spielen das Finale.',
    ],
  },
};

const OPTION_DEFS = {
  quizduell: [
    ['rounds', 'Runden', 1], ['cols', 'Kategorien', 1], ['rows', 'Felder pro Kategorie', 1],
    ['answerSeconds', 'Antwortzeit (Sek.)', 5], ['buzzSeconds', 'Buzzer-Fenster (Sek.)', 1],
    ['stealSeconds', 'Klau-Antwortzeit (Sek.)', 5], ['pickSeconds', 'Feld-Wahl-Zeit (Sek.)', 5],
    ['wrongPenalty', 'Falsch = halbe Punkte Minus', 'bool'],
  ],
  familienduell: [
    ['rounds', 'Runden', 1], ['finalQuestions', 'Finalfragen', 1], ['answerSeconds', 'Antwortzeit (Sek.)', 5],
    ['stealSeconds', 'Klau-Zeit (Sek.)', 5], ['buzzSeconds', 'Buzzer-Zeit (Sek.)', 1], ['finalSeconds', 'Finale-Zeit (Sek.)', 5],
    ['lastRoundDouble', 'Letzte Runde doppelt', 'bool'],
  ],
  duemmste: [
    ['lives', 'Leben', 1], ['roundSeconds', 'Rundenzeit (Sek.)', 30], ['answerSeconds', 'Antwortzeit (Sek.)', 1],
    ['voteSeconds', 'Abstimmzeit (Sek.)', 5],
  ],
};

// ---------- Spieler ----------
function PlayerList({ st, onPickImage }) {
  const isOp = st.me.isOperator;
  return html`<div class="player-list">
    ${st.players.map((p, i) => html`<div class=${`player-tile ${p.id === st.me.id ? 'me' : ''}`} key=${p.id} style=${`animation-delay:${i * 40}ms`}>
      ${p.isOperator && html`<span class="crown" title="Operator">👑</span>`}
      <${Avatar} p=${p} size=${64} />
      <div class="name">${p.name}</div>
      <div class="tiny muted">${p.connected ? `${p.allTime} Pkt.` : 'offline'}</div>
      ${isOp && html`<div class="row" style="gap:4px;justify-content:center">
        <button class="btn xs ghost" title="Bild zuweisen" onClick=${() => onPickImage(p.id)}>🖼️</button>
        ${!p.isOperator && html`<button class="btn xs ghost" title="Zum Operator machen" onClick=${() => confirm(`${p.name} zum Operator machen? Du verlierst die Steuerung.`) && op('makeOperator', { pid: p.id })}>👑</button>`}
        ${p.id !== st.me.id && html`<button class="btn xs ghost" title="Entfernen" onClick=${() => confirm(`${p.name} aus dem Raum entfernen?`) && op('kick', { pid: p.id })}>✕</button>`}
      </div>`}
    </div>`)}
  </div>`;
}

export function Leaderboard({ st, limit = 10, editable = false }) {
  const rows = st.leaderboard.slice(0, limit);
  if (!rows.length) return html`<p class="muted small" style="margin:0">Noch keine Spiele gewertet. Sieg = +10, Platz 2 = +5, Platz 3 = +2, Teilnahme = +1.</p>`;
  const adjust = (r) => {
    const v = prompt(`All-Time-Punkte für ${r.name} ändern um (z. B. 5 oder -3):`, '');
    if (v == null || v.trim() === '' || Number.isNaN(Number(v))) return;
    op('allTime', { profileId: r.id, delta: Number(v) });
  };
  return html`<div>
    ${rows.map((r, i) => html`<div class="lb-row" key=${r.id}>
      <div class=${`lb-rank r${i + 1}`}>${i + 1}</div>
      <${Avatar} p=${r} size=${32} />
      <div style="min-width:0"><b>${r.name}</b><div class="tiny muted">${r.wins} Siege · ${r.games} Spiele</div></div>
      <div class="row" style="gap:6px"><span class="lb-pts">${r.points}</span>
        ${editable && html`<button class="btn xs ghost" onClick=${() => adjust(r)}>±</button>`}</div>
    </div>`)}
  </div>`;
}

// ---------- Spiel-Setup ----------
function Stepper({ value, step, onChange, disabled }) {
  return html`<span class="stepper">
    <button class="btn xs ghost" disabled=${disabled} onClick=${() => onChange(value - step)}>−</button>
    <b>${value}</b>
    <button class="btn xs ghost" disabled=${disabled} onClick=${() => onChange(value + step)}>+</button>
  </span>`;
}

function Options({ st }) {
  const isOp = st.me.isOperator;
  const opts = st.options[st.gameType];
  const set = (key, value) => op('setOption', { key, value });
  return html`<div class="opts">
    ${OPTION_DEFS[st.gameType].map(([key, label, step]) => html`<div class="opt" key=${key}>
      <span>${label}</span>
      ${step === 'bool'
        ? html`<input type="checkbox" checked=${!!opts[key]} disabled=${!isOp} onChange=${(e) => set(key, e.target.checked)} />`
        : html`<${Stepper} value=${opts[key]} step=${step} disabled=${!isOp} onChange=${(v) => set(key, v)} />`}
    </div>`)}
  </div>`;
}

function Teams({ st }) {
  const isOp = st.me.isOperator;
  const pm = playerMap(st);
  if (!st.teams) return null;
  const move = (pid, ti) => {
    const next = st.teams[(ti + 1) % st.teams.length];
    op('movePlayer', { pid, teamId: next.id });
  };
  const count = st.teams.length;
  return html`<div class="card">
    <div class="row wrap" style="margin-bottom:12px">
      <h3 style="margin:0">Teams</h3>
      <div class="spacer"></div>
      ${isOp && st.gameType === 'quizduell' && html`<span class="small muted">Anzahl</span>
        <${Stepper} value=${count} step=${1} onChange=${(v) => op('teams', { count: Math.max(1, Math.min(4, v)) })} />`}
      ${isOp && html`<button class="btn sm" onClick=${() => op('teams', { mode: 'random' })}>🎲 Neu mischen</button>
        <button class="btn sm" title="Verteilt nach All-Time-Punkten, damit die Teams ausgeglichen sind" onClick=${() => op('teams', { mode: 'fair' })}>⚖️ Fair mischen</button>`}
    </div>
    <div class="teams-grid">
      ${st.teams.map((t, ti) => html`<div class="team-box" style=${teamStyle(t.color)} key=${t.id}>
        <h4>${t.name} <span class="faint small">(${t.members.length})</span></h4>
        ${t.members.map((pid) => pm[pid] && html`<div class=${`member-chip ${isOp && count > 1 ? 'clickable' : ''}`} key=${pid}
          title=${isOp ? 'Klicken: ins nächste Team schieben' : ''} onClick=${() => isOp && count > 1 && move(pid, ti)}>
          <${Avatar} p=${pm[pid]} size=${26} /> ${pm[pid].name}
        </div>`)}
        ${!t.members.length && html`<div class="faint small">leer</div>`}
      </div>`)}
    </div>
    ${isOp && count > 1 && html`<p class="tiny muted" style="margin:10px 0 0">Tipp: Auf einen Namen klicken schiebt ihn ins nächste Team.</p>`}
  </div>`;
}

function GameSetup({ st }) {
  const isOp = st.me.isOperator;
  const info = GAME_INFO[st.gameType];
  const opName = st.players.find((p) => p.isOperator)?.name;
  const n = st.players.length;
  const warn = st.gameType === 'familienduell' && n < 2 ? 'Familien-Duell braucht mindestens 2 Spieler.'
    : st.gameType === 'duemmste' && n < 3 ? 'Der Dümmste fliegt macht erst ab 3 Spielern richtig Spaß (zu zweit geht es direkt ins Finale).' : '';
  return html`<div class="col" style="gap:16px">
    <div class="games-pick">
      ${Object.entries(GAME_INFO).map(([key, g]) => html`<div key=${key} data-g=${key}
        class=${`game-card ${st.gameType === key ? 'active' : ''} ${isOp ? '' : 'readonly'}`}
        onClick=${() => isOp && st.gameType !== key && op('setGame', { game: key })}>
        <div class="emoji">${g.emoji}</div><h3>${g.title}</h3><p>${g.desc}</p>
      </div>`)}
    </div>
    <div class="card">
      <div class="row wrap" style="margin-bottom:12px"><h3 style="margin:0">${info.emoji} ${info.title}</h3><div class="spacer"></div>
        ${!isOp && html`<span class="pill">Einstellungen macht ${opName}</span>`}</div>
      <ul class="rules">${info.rules.map((r, i) => html`<li data-n=${i + 1}>${r}</li>`)}</ul>
      <${Options} st=${st} />
    </div>
    <${Teams} st=${st} />
    ${warn && html`<div class="pill bad" style="align-self:flex-start">${warn}</div>`}
    ${isOp
      ? html`<button class="btn primary lg go" style="font-size:26px;padding:18px" onClick=${() => op('start')}>▶ ${info.title} starten!</button>`
      : html`<div class="card center"><div class="fun" style="font-size:24px">🍿 Gleich geht's los …</div><div class="muted">${opName} startet das Spiel</div></div>`}
  </div>`;
}

// ---------- Bilder ----------
async function shrink(file) {
  if (file.type === 'image/gif' || file.size < 350 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = 720;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/webp', 0.88));
    return blob || file;
  } catch {
    return file;
  }
}

function ImagesPanel({ st, selected, setSelected }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(0);
  const fileRef = useRef(null);
  const sel = st.players.find((p) => p.id === selected) || null;
  const owners = {};
  for (const p of st.players) if (p.avatar) owners[p.avatar] = p.name;

  const upload = async (files) => {
    const s = session.get();
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setBusy(list.length);
    for (const f of list) {
      const blob = await shrink(f);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || f.type, 'X-Room': s.code, 'X-Token': s.token, 'X-Label': encodeURIComponent(f.name) },
        body: blob,
      }).then((r) => r.json()).catch(() => ({ error: 'Upload fehlgeschlagen' }));
      if (res.error) toast(`${f.name}: ${res.error}`, 'error');
      setBusy((b) => b - 1);
    }
  };

  return html`<div class="col" style="gap:16px">
    <div class="card">
      <h3>🖼️ Bilder für die Spieler</h3>
      <p class="muted small" style="margin-top:0">Lade eure lustigen KI-Bilder hoch und gib sie den Spielern. Jeder Spieler behält sein Bild auch an späteren Abenden. Ohne Bild werden Initialen gezeigt.</p>
      <div class=${`dropzone ${over ? 'over' : ''}`}
        onClick=${() => fileRef.current.click()}
        onDragOver=${(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave=${() => setOver(false)}
        onDrop=${(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}>
        ${busy ? html`<span class="judging"><span class="spinner"></span> Lade ${busy} Bild(er) hoch …</span>` : html`<b>Bilder hier ablegen</b> oder klicken zum Auswählen<div class="tiny faint">PNG, JPG, WEBP, GIF – große Bilder werden automatisch verkleinert</div>`}
      </div>
      <input ref=${fileRef} type="file" accept="image/*" multiple class="hidden" onChange=${(e) => { upload(e.target.files); e.target.value = ''; }} />
    </div>
    <div class="card">
      <div class="section-title">1. Spieler wählen</div>
      <div class="row wrap" style="margin-bottom:14px">
        ${st.players.map((p) => html`<button key=${p.id} class=${`btn sm ${selected === p.id ? 'primary' : ''}`} onClick=${() => setSelected(p.id)}>
          <${Avatar} p=${p} size=${22} /> ${p.name}</button>`)}
      </div>
      <div class="section-title">2. Bild anklicken ${sel ? html`<span class="faint">→ für ${sel.name}</span>` : ''}</div>
      ${!st.images.length && html`<p class="muted small">Noch keine Bilder hochgeladen.</p>`}
      <div class="image-grid">
        ${st.images.map((img) => html`<div key=${img.id} class=${`image-tile ${sel?.avatar === img.url ? 'sel' : ''}`}
          title=${img.label} onClick=${() => (sel ? op('avatar', { pid: sel.id, imageId: img.id }) : toast('Erst oben einen Spieler wählen.'))}>
          <img src=${img.url} alt=${img.label} loading="lazy" />
          ${owners[img.url] && html`<div class="owner">${owners[img.url]}</div>`}
          <button class="btn xs bad del" title="Bild löschen" onClick=${(e) => { e.stopPropagation(); if (confirm('Bild endgültig löschen?')) op('deleteImage', { imageId: img.id }); }}>✕</button>
        </div>`)}
      </div>
      ${sel?.avatar && html`<button class="btn sm ghost" style="margin-top:12px" onClick=${() => op('avatar', { pid: sel.id, imageId: null })}>Bild von ${sel.name} entfernen</button>`}
    </div>
  </div>`;
}

// ---------- All-Time & Daten ----------
const GAME_NAMES = { quizduell: 'Quiz Duell', familienduell: 'Familien-Duell', duemmste: 'Der Dümmste fliegt' };

function AllTimePanel({ st }) {
  return html`<div class="col" style="gap:16px">
    <div class="card">
      <div class="row" style="margin-bottom:8px"><h3 style="margin:0">🏆 All-Time-Score</h3><div class="spacer"></div>
        <button class="btn sm bad" onClick=${() => confirm('Wirklich ALLE All-Time-Punkte und den Verlauf löschen?') && confirm('Ganz sicher? Das kann man nicht rückgängig machen.') && op('resetAllTime')}>Zurücksetzen</button></div>
      <p class="muted small" style="margin-top:0">Pro Spiel: Sieg +10, Platz 2 +5 (ab 3 Teams/Spielern), Platz 3 +2 (ab 4), Teilnahme +1. Mit ± kannst du korrigieren – alle sehen die Änderung.</p>
      <${Leaderboard} st=${st} limit=${100} editable=${true} />
    </div>
    <div class="card">
      <h3>📜 Letzte Spiele</h3>
      ${!st.history?.length && html`<p class="muted small">Noch keine.</p>`}
      ${st.history?.map((h) => html`<div class="lb-row" style="grid-template-columns:1fr auto" key=${h.id}>
        <div><b>${GAME_NAMES[h.game] || h.game}</b> <span class="tiny faint">${new Date(h.date).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
          <div class="small muted">${h.results.map((r) => `${r.rank}. ${r.label}`).join(' · ')}</div></div>
      </div>`)}
    </div>
  </div>`;
}

function DataPanel({ st }) {
  const [stats, setStats] = useState(null);
  useEffect(() => { fetch('/api/health').then((r) => r.json()).then(setStats).catch(() => {}); }, []);
  const s = session.get();
  const download = async () => {
    const res = await fetch('/api/backup', { headers: { 'X-Room': s.code, 'X-Token': s.token } });
    if (!res.ok) return toast('Backup fehlgeschlagen', 'error');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `spieleabend-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const restore = async (file) => {
    if (!file || !confirm('Backup einspielen? Aktuelle Scores und Bilder werden ersetzt.')) return;
    const text = await file.text();
    const res = await fetch('/api/restore', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Room': s.code, 'X-Token': s.token }, body: text })
      .then((r) => r.json()).catch(() => ({ error: 'Fehlgeschlagen' }));
    toast(res.error || 'Backup eingespielt!', res.error ? 'error' : 'info');
  };
  return html`<div class="col" style="gap:16px">
    <div class="card">
      <h3>💾 Sicherung</h3>
      <p class="muted small" style="margin-top:0">Enthält All-Time-Score, Verlauf und alle Bilder. Praktisch, wenn der Server neu aufgesetzt wird.</p>
      <div class="row wrap">
        <button class="btn" onClick=${download}>Backup herunterladen</button>
        <label class="btn">Backup einspielen<input type="file" accept="application/json" class="hidden" onChange=${(e) => restore(e.target.files[0])} /></label>
      </div>
    </div>
    <div class="card">
      <h3>❓ Fragen</h3>
      ${stats && html`<p class="small muted" style="margin-top:0">Im Katalog: <b>${stats.quizduell}</b> Quiz-Duell-Fragen in ${stats.quizKategorien} Kategorien · <b>${stats.familienduell}</b> Umfragen · <b>${stats.duemmste}</b> Schnellfragen.</p>`}
      <p class="muted small">Bereits gespielte Fragen werden an späteren Abenden vermieden, bis der Katalog durch ist.</p>
      <button class="btn sm" onClick=${() => confirm('Alle gespielten Fragen wieder freigeben?') && op('resetQuestions')}>Gespielte Fragen freigeben</button>
    </div>
    <div class="card">
      <h3>🤖 KI-Richter</h3>
      <p class="small muted" style="margin:0">${st.ai
        ? 'Aktiv: Antworten, die die normale Erkennung nicht versteht (Synonyme, Umschreibungen), prüft Claude.'
        : 'Aus. Tippfehler, Zahlwörter und hinterlegte Varianten werden trotzdem erkannt. Für Synonyme wie „schnelles Gehen“ ≈ „rennen“ auf dem Server ANTHROPIC_API_KEY setzen (siehe Anleitung).'}</p>
    </div>
  </div>`;
}

// ---------- Lobby ----------
export function Lobby({ st }) {
  const isOp = st.me.isOperator;
  const [tab, setTab] = useState('spiel');
  const [selected, setSelected] = useState(null);
  const pickImage = (pid) => { setSelected(pid); setTab('bilder'); };
  const copyInvite = async () => {
    const link = `${location.origin}/?raum=${st.code}`;
    try { await navigator.clipboard.writeText(link); toast('Einladungslink kopiert! 🎉'); } catch { toast(link); }
  };
  const tabs = [['spiel', '🎮 Spiel'], ['bilder', '🖼️ Bilder'], ['score', '🏆 All-Time'], ['daten', '💾 Daten']];
  return html`<div class="lobby">
    <aside class="col" style="gap:16px">
      <div class="card room-code-card">
        <div class="lbl">Raumcode</div>
        <div class="code">${st.code}</div>
        <button class="btn sm pink" onClick=${copyInvite}>🔗 Einladungslink kopieren</button>
      </div>
      <div class="card">
        <div class="row" style="margin-bottom:12px"><h3 style="margin:0">Spieler</h3><span class="pill accent">${st.players.length}</span></div>
        <${PlayerList} st=${st} onPickImage=${pickImage} />
      </div>
      <div class="card">
        <h3>🏆 Bestenliste</h3>
        <${Leaderboard} st=${st} />
      </div>
    </aside>
    <section>
      ${isOp && html`<div class="tabs">${tabs.map(([k, l]) => html`<button key=${k} class=${`tab ${tab === k ? 'active' : ''}`} onClick=${() => setTab(k)}>${l}</button>`)}</div>`}
      ${(!isOp || tab === 'spiel') && html`<${GameSetup} st=${st} />`}
      ${isOp && tab === 'bilder' && html`<${ImagesPanel} st=${st} selected=${selected} setSelected=${setSelected} />`}
      ${isOp && tab === 'score' && html`<${AllTimePanel} st=${st} />`}
      ${isOp && tab === 'daten' && html`<${DataPanel} st=${st} />`}
    </section>
  </div>`;
}
