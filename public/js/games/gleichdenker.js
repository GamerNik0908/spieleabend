// Ansicht „Gleichdenker“: geheim antworten, dann Spieler für Spieler aufdecken (schwächstes Team
// zuerst). Der Operator legt per Buchstaben fest, welche Antworten als gleich zählen.
import { html, useState, act, gameOp, ByTag, Judging, Avatar, TimerBar, AnswerInput, GameHead, DoneRow, teamStyle, playerMap, revealState, RevealHint } from '../lib.js';

const LETTERS = 'ABCDEFGHIJKL';

function TeamScores({ g, pm, hold = {} }) {
  return html`<div class="scorebar">${g.teams.map((t) => html`<div key=${t.id} class="team-score" style=${teamStyle(t.color)}>
    <div class="avatars">${t.members.map((pid) => pm[pid] && html`<${Avatar} key=${pid} p=${pm[pid]} size=${30} />`)}</div>
    <div><div class="tname">${t.name}</div><div class="tpts">${t.score - (hold[t.id] || 0)}</div></div>
  </div>`)}</div>`;
}

/** Antworten eines Teams in Spielerreihenfolge: [{ pid, text }] */
function answersOf(t, r) {
  const text = {};
  r.groups.forEach((grp) => grp.pids.forEach((p, i) => { text[p] = grp.texts[i]; }));
  return t.members.filter((p) => p in text).map((pid) => ({ pid, text: text[pid] }));
}

/** Operator: gleicher Buchstabe = zählt als gleiche Antwort */
function GroupEditor({ t, r, pm, onClose }) {
  const rows = answersOf(t, r);
  const [assign, setAssign] = useState(() => {
    const a = {};
    r.groups.forEach((grp, gi) => grp.pids.forEach((p) => { a[p] = gi; }));
    return a;
  });
  const save = () => {
    const groups = {};
    for (const { pid } of rows) (groups[assign[pid]] ||= []).push(pid);
    gameOp({ type: 'regroup', teamId: t.id, groups: Object.values(groups) });
    onClose();
  };
  return html`<div class="gd-editor">
    <div class="small muted">Gleicher Buchstabe = zählt als gleiche Antwort.</div>
    ${rows.map(({ pid, text }) => html`<div class="gd-edit-row" key=${pid}>
      <${Avatar} p=${pm[pid]} size=${26} /><b class="gd-edit-text">${text || '—'}</b>
      <div class="gd-letters">${rows.map((_, gi) => html`<button key=${gi} class=${`gd-letter ${assign[pid] === gi ? 'on' : ''}`} onClick=${() => setAssign({ ...assign, [pid]: gi })}>${LETTERS[gi]}</button>`)}</div>
    </div>`)}
    <div class="row wrap" style="justify-content:flex-end;gap:8px">
      <button class="btn sm ghost" onClick=${onClose}>Abbrechen</button>
      <button class="btn sm bad" onClick=${() => setAssign(Object.fromEntries(rows.map(({ pid }, i) => [pid, i])))}>Alle verschieden</button>
      <button class="btn sm" onClick=${() => setAssign(Object.fromEntries(rows.map(({ pid }) => [pid, 0])))}>Alle gleich</button>
      <button class="btn sm primary" onClick=${save}>Speichern</button>
    </div>
  </div>`;
}

function TeamResult({ st, t, r, pm, rv, complete }) {
  const [editing, setEditing] = useState(false);
  const isOp = st.me.isOperator;
  const label = r.pts >= 3 ? 'Alle gleich!' : r.best >= 2 ? `${r.best} gleich` : 'Alle verschieden';
  let body;
  if (editing) {
    body = html`<${GroupEditor} t=${t} r=${r} pm=${pm} onClose=${() => setEditing(false)} />`;
  } else if (complete) {
    body = html`<div class="gd-groups">${r.groups.map((grp, gi) => html`<div key=${gi} class=${`gd-group ${grp.pids.length > 1 ? 'match' : ''}`}>
      ${grp.pids.length > 1 && (grp.ki || grp.op) && html`<div class="gd-ki"><${ByTag} by=${grp.op ? 'op' : 'ki'} /> als gleich gewertet</div>`}
      ${grp.pids.map((pid, i) => html`<div key=${pid} class="gd-answer"><${Avatar} p=${pm[pid]} size=${30} /><span class="gd-name">${pm[pid]?.name}</span><b>${grp.texts[i] || '—'}</b></div>`)}
    </div>`)}</div>`;
  } else {
    // Alle Namen sichtbar, Antworten werden einzeln aufgedeckt; Gruppen erst wenn das Team komplett ist
    body = html`<div class="gd-groups"><div class="gd-group">${answersOf(t, r).map(({ pid, text }) => {
      const open = rv.isShown(pid);
      const click = !open && rv.canClick;
      return html`<button key=${pid} disabled=${!click} onClick=${() => click && rv.click(pid)} class=${`gd-answer ${open ? 'gd-in' : 'gd-hidden'} ${click ? 'gd-click' : ''}`}>
        <${Avatar} p=${pm[pid]} size=${30} /><span class="gd-name">${pm[pid]?.name}</span><b>${open ? text || '—' : click ? '👆 aufdecken' : '???'}</b>
      </button>`;
    })}</div></div>`;
  }
  return html`<div class=${`gd-team ${complete && r.pts >= 3 ? 'perfect' : ''}`} style=${teamStyle(t.color)}>
    <div class="gd-team-head"><span class="gd-team-name">${t.name}</span>${complete ? html`<span class="gd-pts">+${r.pts}</span>` : html`<span class="muted small">…</span>`}</div>
    ${complete && !editing && html`<div class="gd-label">${label}</div>`}
    ${body}
    ${isOp && complete && !editing && html`<button class="btn sm" onClick=${() => setEditing(true)}>✏️ Ändern – was gehört zusammen?</button>`}
  </div>`;
}

export function GleichdenkerView({ st, g }) {
  const pm = playerMap(st);
  const myTeam = g.teams.find((t) => t.members.includes(st.me.id));
  // Teams vom schwächsten zum besten; der Operator deckt Spieler für Spieler auf
  const order = g.result ? [...g.teams].filter((t) => g.result[t.id]).sort((a, b) => g.result[a.id].pts - g.result[b.id].pts) : [];
  const rv = revealState(st, `gd-${g.round}`);
  const complete = (t) => answersOf(t, g.result[t.id]).every(({ pid }) => rv.isShown(pid));
  const hold = Object.fromEntries(order.filter((t) => !complete(t)).map((t) => [t.id, g.result[t.id].pts]));
  return html`<div class="stage">
    <${GameHead} icon="🧩" title="Gleichdenker" sub=${g.round ? `Frage ${g.round}/${g.rounds}` : null} timer=${g.phase === 'answer' ? g.timers.answer : null} warn=${5} />
    <${TeamScores} g=${g} pm=${pm} hold=${hold} />
    ${g.phase === 'intro' && html`<div class="card center"><h2 style="font-size:32px">Denkt wie euer Team</h2><p class="muted">Jeder antwortet geheim. Punkte gibt es nur, wenn ihr im Team dasselbe schreibt – alle gleich: 3 Punkte, zwei gleich: 1 Punkt.</p></div>`}
    ${g.q && g.phase !== 'intro' && html`<div class="card center gd-q"><div class="gd-qtext">${g.q}</div>
      ${myTeam && html`<div class="small muted" style="margin-top:8px">Dein Team: ${myTeam.members.map((p) => pm[p]?.name).join(', ')}</div>`}</div>`}
    ${g.phase === 'answer' && html`<div class="card">
      <div style="margin-bottom:12px"><${TimerBar} timer=${g.timers.answer} /></div>
      ${g.myAnswer && html`<div class="banner" style="margin-bottom:10px">Deine Antwort: <b>${g.myAnswer}</b> – du kannst sie noch ändern.</div>`}
      <${AnswerInput} key=${`gd-${g.round}`} live=${false} placeholder="Was schreiben die anderen wohl?" button=${g.myAnswer ? 'Ändern' : 'Abgeben'} onSubmit=${(text) => act({ type: 'answer', text })} />
    </div>
    <${DoneRow} st=${st} ids=${g.teams.flatMap((t) => t.members)} done=${g.answered} />`}
    ${g.phase === 'judging' && html`<div class="card center"><${Judging} /><div class="small muted" style="margin-top:8px">Die KI vergleicht eure Antworten nach Bedeutung …</div></div>`}
    ${g.phase === 'reveal' && g.result && html`<${RevealHint} st=${st} rv=${rv} waitText="Was haben die anderen geschrieben? …" />
      <div class="gd-results">${order.map((t) => html`<${TeamResult} key=${t.id} st=${st} t=${t} r=${g.result[t.id]} pm=${pm} rv=${rv} complete=${complete(t)} />`)}</div>
      ${st.me.isOperator && !rv.running && html`<p class="tiny muted center">Operator: Mit „✏️ Ändern“ legst du selbst fest, welche Antworten als gleich zählen – auch „ist doch falsch“.</p>`}`}
  </div>`;
}
