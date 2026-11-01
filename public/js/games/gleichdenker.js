// Ansicht „Gleichdenker“: geheim antworten, dann teamweise Auflösung mit gleichen Antworten.
import { html, useState, act, gameOp, ByTag, Judging, Avatar, TimerBar, AnswerInput, GameHead, DoneRow, teamStyle, playerMap, useStagger } from '../lib.js';

function TeamScores({ g, pm, hold = {} }) {
  return html`<div class="scorebar">${g.teams.map((t) => html`<div key=${t.id} class="team-score" style=${teamStyle(t.color)}>
    <div class="avatars">${t.members.map((pid) => pm[pid] && html`<${Avatar} key=${pid} p=${pm[pid]} size=${30} />`)}</div>
    <div><div class="tname">${t.name}</div><div class="tpts">${t.score - (hold[t.id] || 0)}</div></div>
  </div>`)}</div>`;
}

function TeamResult({ st, g, t, pm }) {
  const r = g.result[t.id];
  const [sel, setSel] = useState([]);
  const isOp = st.me.isOperator;
  const toggle = (pid) => setSel((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]));
  const label = r.pts >= 3 ? 'Alle gleich!' : r.best >= 2 ? `${r.best} gleich` : 'Alle verschieden';
  return html`<div class=${`gd-team ${r.pts >= 3 ? 'perfect' : ''}`} style=${teamStyle(t.color)}>
    <div class="gd-team-head"><span class="gd-team-name">${t.name}</span><span class="gd-pts">+${r.pts}</span></div>
    <div class="gd-label">${label}</div>
    <div class="gd-groups">${r.groups.map((grp, gi) => html`<div key=${gi} class=${`gd-group ${grp.pids.length > 1 ? 'match' : ''}`}>
      ${grp.pids.length > 1 && grp.ki && html`<div class="gd-ki"><${ByTag} by="ki" /> als gleich erkannt</div>`}
      ${grp.pids.map((pid, i) => html`<button key=${pid} class=${`gd-answer ${sel.includes(pid) ? 'sel' : ''}`} disabled=${!isOp} onClick=${() => toggle(pid)}>
        <${Avatar} p=${pm[pid]} size=${30} /><span class="gd-name">${pm[pid]?.name}</span><b>${grp.texts[i] || '—'}</b>
      </button>`)}
    </div>`)}</div>
    ${isOp && sel.length >= 2 && html`<button class="btn sm primary" onClick=${() => { gameOp({ type: 'merge', teamId: t.id, pids: sel }); setSel([]); }}>Als gleich werten (${sel.length})</button>`}
    ${isOp && sel.length === 1 && r.groups.some((grp) => grp.pids.length > 1 && grp.pids.includes(sel[0])) && html`<button class="btn sm bad" onClick=${() => { gameOp({ type: 'split', teamId: t.id, pid: sel[0] }); setSel([]); }}>✂️ Abtrennen (zählt nicht als gleich)</button>`}
  </div>`;
}

export function GleichdenkerView({ st, g }) {
  const pm = playerMap(st);
  const myTeam = g.teams.find((t) => t.members.includes(st.me.id));
  // Teams vom schlechtesten zum besten aufdecken
  const order = g.result ? [...g.teams].filter((t) => g.result[t.id]).sort((a, b) => g.result[a.id].pts - g.result[b.id].pts) : [];
  const shown = useStagger(g.phase === 'reveal' ? g.timers.phase : null, order.length, 2800, 1000);
  return html`<div class="stage">
    <${GameHead} icon="🧩" title="Gleichdenker" sub=${g.round ? `Frage ${g.round}/${g.rounds}` : null} timer=${g.phase === 'answer' ? g.timers.answer : null} warn=${5} />
    <${TeamScores} g=${g} pm=${pm} hold=${Object.fromEntries(order.slice(shown).map((t) => [t.id, g.result[t.id].pts]))} />
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
    ${g.phase === 'reveal' && g.result && html`<div class="gd-results">${order.slice(0, shown).map((t) => html`<${TeamResult} key=${t.id} st=${st} g=${g} t=${t} pm=${pm} />`)}</div>
      ${shown < order.length && html`<div class="banner">Wer hat am meisten gleich gedacht? …</div>`}
      ${st.me.isOperator && html`<p class="tiny muted center">Operator: Antworten anklicken – mehrere „Als gleich werten“ (z. B. Sofa = Couch) oder eine einzelne „Abtrennen“.</p>`}`}
  </div>`;
}
