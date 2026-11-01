// Bearbeiten-Bereich für den Operator während der Pause: Punkte, Timer, Einstellungen,
// Spieldetails (Leben, Strikes, Zug, Teams) und Korrekturen – alles an einem Ort.
import { html, useState, op, gameOp, remaining, Avatar, playerMap } from './lib.js';
import { OPTION_DEFS, RoomSwitches } from './lobby.js';
import { QuizDuellOps } from './games/quizduell.js';
import { FamilienDuellOps } from './games/familienduell.js';
import { DuemmsteOps } from './games/duemmste.js';
import { MontagsmalerOps } from './games/montagsmaler.js';

const GAME_OPS = { quizduell: QuizDuellOps, familienduell: FamilienDuellOps, duemmste: DuemmsteOps, montagsmaler: MontagsmalerOps };
const TIMER_NAMES = { answer: 'Antwortzeit', vote: 'Abstimmung', round: 'Rundenzeit', phase: 'Nächster Schritt', buzz: 'Buzzer', pick: 'Feldwahl', draw: 'Zeichenzeit', choose: 'Begriffswahl', hint: 'Bis zum Tipp', lastChance: 'Letzte Chance', reveal: 'Nächstes Aufdecken' };

const edit = (e) => op('edit', { edit: e });

/** Zahlenfeld, das beim Bestätigen (Enter/Verlassen) speichert */
function NumField({ value, onSave, min = -99999, max = 999999, width = 90 }) {
  const [v, setV] = useState(String(value));
  const [dirty, setDirty] = useState(false);
  const shown = dirty ? v : String(value);
  const save = () => {
    if (!dirty) return;
    setDirty(false);
    const n = Number(v);
    if (Number.isFinite(n) && n !== value) onSave(Math.max(min, Math.min(max, n)));
  };
  return html`<input class="input ed-num" style=${`width:${width}px`} type="number" value=${shown}
    onInput=${(e) => { setV(e.target.value); setDirty(true); }} onBlur=${save} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />`;
}

function Section({ title, children }) {
  return html`<div class="card tight ed-sec"><div class="section-title">${title}</div>${children}</div>`;
}

function Scores({ st, g, pm }) {
  if (g.teams) {
    return html`<${Section} title="🏅 Punkte">${g.teams.map((t) => html`<div class="ed-row" key=${t.id}>
      <b style=${`color:${t.color};flex:1`}>${t.name}</b>
      <${NumField} value=${t.score} onSave=${(v) => edit({ kind: 'score', unitId: t.id, value: v })} />
    </div>`)}</${Section}>`;
  }
  if (g.scores) {
    return html`<${Section} title="🏅 Punkte">${g.scores.map((s) => pm[s.pid] && html`<div class="ed-row" key=${s.pid}>
      <${Avatar} p=${pm[s.pid]} size=${26} /><b style="flex:1">${pm[s.pid].name}</b>
      <${NumField} value=${s.score} onSave=${(v) => edit({ kind: 'score', unitId: s.pid, value: v })} />
    </div>`)}</${Section}>`;
  }
  return null;
}

function Timers({ g }) {
  const active = Object.entries(g.timers || {}).filter(([, t]) => t);
  if (!active.length) return null;
  return html`<${Section} title="⏱ Laufende Uhren">${active.map(([key, t]) => html`<div class="ed-row" key=${key}>
    <span style="flex:1">${TIMER_NAMES[key] || key}</span>
    <${NumField} value=${Math.ceil(remaining(t) / 1000)} min=${1} max=${3600} width=${80}
      onSave=${(v) => edit({ kind: 'timer', key, seconds: v })} /><span class="small muted">Sek.</span>
  </div>`)}</${Section}>`;
}

function Settings({ st, g }) {
  const defs = OPTION_DEFS[g.type] || [];
  if (!defs.length || !g.opts) return null;
  return html`<${Section} title="⚙️ Einstellungen (gelten ab sofort)">${defs.map(([key, label, step]) => html`<div class="ed-row" key=${key}>
    <span style="flex:1">${label}</span>
    ${step === 'bool'
      ? html`<input type="checkbox" checked=${!!g.opts[key]} onChange=${(e) => edit({ kind: 'option', key, value: e.target.checked })} />`
      : html`<${NumField} value=${g.opts[key]} min=${0} onSave=${(v) => edit({ kind: 'option', key, value: v })} width=${80} />`}
  </div>`)}</${Section}>`;
}

function Specific({ st, g, pm }) {
  const parts = [];
  if (g.type === 'duemmste') {
    parts.push(html`<${Section} title="❤️ Leben">${g.players.map((pid) => pm[pid] && html`<div class="ed-row" key=${pid}>
      <${Avatar} p=${pm[pid]} size=${26} /><b style="flex:1">${pm[pid].name}</b>
      <${NumField} value=${g.lives[pid] || 0} min=${0} max=${9} width=${70} onSave=${(v) => edit({ kind: 'game', field: 'lives', pid, value: v })} />
    </div>`)}</${Section}>`);
  }
  if (g.type === 'familienduell' && !g.phase.startsWith('final')) {
    parts.push(html`<${Section} title="📊 Runde">
      <div class="ed-row"><span style="flex:1">Strikes (0–3)</span><${NumField} value=${g.strikes} min=${0} max=${3} width=${70} onSave=${(v) => edit({ kind: 'game', field: 'strikes', value: v })} /></div>
      <div class="ed-row"><span style="flex:1">Punkte im Topf</span><${NumField} value=${g.pot} min=${0} width=${80} onSave=${(v) => edit({ kind: 'game', field: 'pot', value: v })} /></div>
      <div class="ed-row"><span style="flex:1">Kontrolle</span>${g.teams.map((t) => html`<button key=${t.id} class=${`btn xs ${g.control === t.id ? 'primary' : ''}`} onClick=${() => gameOp({ type: 'setControl', teamId: t.id })}>${t.name}</button>`)}</div>
    </${Section}>`);
  }
  if (g.type === 'quizduell' && g.phase === 'pick') {
    parts.push(html`<${Section} title="👆 Wer ist dran?"><div class="row wrap">${g.teams.map((t) => html`<button key=${t.id} class=${`btn sm ${g.turn === t.id ? 'primary' : ''}`} onClick=${() => edit({ kind: 'game', field: 'turn', teamId: t.id })}>${t.name}</button>`)}</div></${Section}>`);
  }
  if (g.teams) {
    parts.push(html`<${Section} title="👥 Teams umsetzen">${g.teams.flatMap((t) => t.members.map((pid) => pm[pid] && html`<div class="ed-row" key=${pid}>
      <${Avatar} p=${pm[pid]} size=${26} /><b style="flex:1">${pm[pid].name}</b>
      <select class="input" style="width:auto;padding:5px 8px" value=${t.id} onChange=${(e) => edit({ kind: 'team', pid, teamId: e.target.value })}>
        ${g.teams.map((x) => html`<option value=${x.id}>${x.name}</option>`)}
      </select>
    </div>`))}</${Section}>`);
  }
  return parts;
}

export function EditPanel({ st }) {
  const g = st.game;
  const pm = playerMap(st);
  if (!g) return null;
  const Ops = GAME_OPS[g.type];
  return html`<div class="ed-panel">
    <div class="ed-head"><h2 class="fun">✏️ Spiel bearbeiten</h2><span class="muted small">Alle Änderungen sehen die anderen groß eingeblendet.</span></div>
    <div class="ed-actions row wrap">
      <button class="btn sm" onClick=${() => gameOp({ type: 'skip' })}>⏭ Überspringen / weiter</button>
      <button class="btn sm" onClick=${() => gameOp({ type: 'addTime' })}>⏱ Mehr Zeit</button>
      <button class="btn sm" onClick=${() => op('tutorial', { game: g.type, step: 0 })}>📖 Tutorial zeigen</button>
    </div>
    <div class="ed-grid">
      <${Scores} st=${st} g=${g} pm=${pm} />
      <${Timers} g=${g} />
      ${Specific({ st, g, pm })}
      <${Section} title="🎛️ Ablauf & KI"><${RoomSwitches} st=${st} /></${Section}>
      <${Settings} st=${st} g=${g} />
      ${Ops && html`<div class="ed-ops"><${Ops} st=${st} g=${g} /></div>`}
    </div>
  </div>`;
}
