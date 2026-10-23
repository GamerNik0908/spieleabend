// Operator-Leiste während des Spiels + Korrektur-Schublade.
import { html, useState, op, gameOp } from './lib.js';
import { QuizDuellOps } from './games/quizduell.js';
import { FamilienDuellOps } from './games/familienduell.js';
import { DuemmsteOps } from './games/duemmste.js';

const GAME_OPS = { quizduell: QuizDuellOps, familienduell: FamilienDuellOps, duemmste: DuemmsteOps };

function ScoreAdjust({ g }) {
  if (!g.teams) return null;
  const adj = (t) => {
    const v = prompt(`Punkte für ${t.name} ändern um (z. B. 100 oder -50):`, '');
    if (v == null || v.trim() === '' || Number.isNaN(Number(v))) return;
    op('score', { unitId: t.id, delta: Number(v) });
  };
  return html`<div class="card tight" style="margin-bottom:14px">
    <div class="section-title">Punkte anpassen</div>
    ${g.teams.map((t) => html`<div class="row" style="margin-bottom:6px" key=${t.id}>
      <b style=${`color:${t.color};flex:1`}>${t.name}</b><span class="lb-pts">${t.score}</span>
      <button class="btn xs" onClick=${() => op('score', { unitId: t.id, delta: -100 })}>−100</button>
      <button class="btn xs" onClick=${() => op('score', { unitId: t.id, delta: 100 })}>+100</button>
      <button class="btn xs ghost" onClick=${() => adj(t)}>±</button>
    </div>`)}
  </div>`;
}

function AvatarQuick({ st }) {
  const [pid, setPid] = useState(null);
  if (!st.images?.length) return null;
  const sel = st.players.find((p) => p.id === pid);
  return html`<div class="card tight">
    <div class="section-title">Bild zuweisen</div>
    <div class="row wrap" style="margin-bottom:8px">
      ${st.players.map((p) => html`<button key=${p.id} class=${`btn xs ${pid === p.id ? 'primary' : ''}`} onClick=${() => setPid(p.id)}>${p.name}</button>`)}
    </div>
    ${sel && html`<div class="image-grid" style="grid-template-columns:repeat(auto-fill,minmax(64px,1fr))">
      ${st.images.map((img) => html`<div key=${img.id} class=${`image-tile ${sel.avatar === img.url ? 'sel' : ''}`} onClick=${() => op('avatar', { pid: sel.id, imageId: img.id })}>
        <img src=${img.url} alt="" loading="lazy" /></div>`)}
    </div>`}
  </div>`;
}

export function OpBar({ st }) {
  const [drawer, setDrawer] = useState(false);
  const [endMenu, setEndMenu] = useState(false);
  const g = st.game;
  const Ops = GAME_OPS[g.type];
  const say = () => {
    const t = prompt('Durchsage an alle (wird groß eingeblendet):', '');
    if (t && t.trim()) op('announce', { text: t.trim() });
  };
  return html`
    <div class="opbar">
      <span class="label">👑 Operator</span>
      ${st.paused
        ? html`<button class="btn sm primary" onClick=${() => op('resume')}>▶ Weiter</button>`
        : html`<button class="btn sm" onClick=${() => op('pause')}>⏸ Pause</button>`}
      <button class="btn sm" title="Überspringen / nächster Schritt" onClick=${() => gameOp({ type: 'skip' })}>⏭ Weiter</button>
      <button class="btn sm" title="10 Sekunden mehr" onClick=${() => gameOp({ type: 'addTime' })}>⏱ +10s</button>
      <button class="btn sm" onClick=${() => setDrawer(true)}>✏️ Korrigieren</button>
      <button class="btn sm" onClick=${say}>📣</button>
      <button class="btn sm bad" onClick=${() => setEndMenu(!endMenu)}>🏁 Ende</button>
    </div>
    ${endMenu && html`<div class="opbar" style="bottom:78px">
      <button class="btn sm primary" onClick=${() => { setEndMenu(false); op('finish'); }}>Jetzt beenden (mit Wertung)</button>
      <button class="btn sm bad" onClick=${() => { setEndMenu(false); if (confirm('Spiel abbrechen? Es gibt keine Punkte.')) op('abort'); }}>Abbrechen (ohne Wertung)</button>
      <button class="btn sm ghost" onClick=${() => setEndMenu(false)}>✕</button>
    </div>`}
    ${drawer && html`<div class="drawer-back" onClick=${() => setDrawer(false)}></div>
      <div class="drawer">
        <div class="row" style="margin-bottom:12px"><h2 style="margin:0">✏️ Korrigieren</h2><div class="spacer"></div>
          <button class="btn sm ghost" onClick=${() => setDrawer(false)}>Schließen</button></div>
        <p class="tiny muted" style="margin-top:0">Jede Korrektur wird bei allen groß eingeblendet.</p>
        ${Ops && html`<${Ops} st=${st} g=${g} />`}
        <${ScoreAdjust} g=${g} />
        <${AvatarQuick} st=${st} />
      </div>`}
  `;
}
