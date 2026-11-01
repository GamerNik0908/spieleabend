// Ansicht „Schätzmeister“: Zahl schätzen, Auflösung auf dem Zahlenstrahl.
import { html, act, Avatar, TimerBar, AnswerInput, ScoreStrip, GameHead, DoneRow, playerMap, useStagger } from '../lib.js';

const fmt = (n) => (Math.abs(n) >= 1e4 || !Number.isInteger(n) ? n.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : String(n));

function NumberLine({ r, pm, list }) {
  const vals = [r.a, ...r.list.map((e) => e.value)];
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.08;
  min -= pad; max += pad;
  const x = (v) => ((v - min) / (max - min)) * 100;
  return html`<div class="nl">
    <div class="nl-line"></div>
    <div class="nl-answer" style=${`left:${x(r.a)}%`}><div class="nl-flag fun">${fmt(r.a)}</div></div>
    ${list.map((e, i) => pm[e.pid] && html`<div key=${e.pid} class=${`nl-guess ${e.rank === 1 ? 'best' : ''}`} style=${`left:${x(e.value)}%;--d:0ms;top:${i % 2 ? 66 : 4}px`}>
      <${Avatar} p=${pm[e.pid]} size=${38} />
    </div>`)}
  </div>`;
}

export function SchaetzenView({ st, g }) {
  const pm = playerMap(st);
  const r = g.result;
  // Vom schlechtesten zum besten aufdecken
  const worstFirst = r ? [...r.list].reverse() : [];
  const shown = useStagger(g.phase === 'reveal' ? g.timers.phase : null, worstFirst.length, 1400, 1800);
  const visible = worstFirst.slice(0, shown);
  const hold = Object.fromEntries(worstFirst.slice(shown).map((e) => [e.pid, e.pts]));
  return html`<div class="stage">
    <${GameHead} icon="🎯" title="Schätzmeister" sub=${g.round ? `Frage ${g.round}/${g.rounds}${g.mult > 1 ? ' · ×2' : ''}` : null} timer=${g.phase === 'guess' ? g.timers.answer : null} warn=${5} />
    <${ScoreStrip} st=${st} g=${g} hold=${hold} />
    ${g.phase === 'intro' && html`<div class="card center"><div class="fun" style="font-size:34px">🎯 Schätzmeister</div><p class="muted">Niemand weiß es genau – also schätzt! Am nächsten dran: +500, Zweiter +300, Dritter +200, Volltreffer +300 Bonus.</p></div>`}
    ${g.q && g.phase !== 'intro' && html`<div class="card center rise es-q"><div class="fun es-qtext">${g.q}</div>${g.unit && html`<span class="pill accent">in ${g.unit}</span>`}</div>`}
    ${g.phase === 'guess' && html`<div class="card">
      <div style="margin-bottom:12px"><${TimerBar} timer=${g.timers.answer} /></div>
      ${g.myGuess != null && html`<div class="banner" style="margin-bottom:10px">Deine Schätzung: <span class="big">${fmt(g.myGuess)}</span> – du kannst sie noch ändern.</div>`}
      <${AnswerInput} key=${`e-${g.round}`} live=${false} placeholder="Deine Schätzung (z. B. 1500 oder 2,5 Mio)" button=${g.myGuess != null ? 'Ändern' : 'Schätzen'} onSubmit=${(text) => act({ type: 'answer', text })} />
    </div>
    <${DoneRow} st=${st} ids=${g.scores.map((s) => s.pid)} done=${g.guessed} />`}
    ${g.phase === 'reveal' && r && html`<div class="card">
      <div class="center"><span class="muted">Richtig ist:</span> <span class="big-answer" style="display:inline-block">${fmt(r.a)} ${r.unit || ''}</span></div>
      ${r.info && html`<p class="center muted" style="margin:6px 0 0">💡 ${r.info}</p>`}
      <${NumberLine} r=${r} pm=${pm} list=${visible} />
      ${shown < worstFirst.length && html`<div class="banner" style="margin-bottom:8px">Wer lag am nächsten? …</div>`}
      <div class="col" style="gap:8px">${[...visible].reverse().map((e) => html`<div key=${e.pid} class=${`result-line ${e.rank <= 3 ? 'ok' : 'bad'}`}>
        <span class="lb-rank">${e.rank}.</span><${Avatar} p=${pm[e.pid]} size=${28} /><b>${pm[e.pid]?.name}</b>
        <span class="muted">${fmt(e.value)} <span class="tiny">(${e.diff === 0 ? 'exakt!' : `${fmt(Math.round(e.diff * 100) / 100)} daneben`})</span></span>
        <div class="spacer"></div>${e.bullseye && html`<span class="pill accent">🎯 Volltreffer</span>`}<span class=${`pill ${e.pts ? 'ok' : ''}`}>+${e.pts}</span>
      </div>`)}</div>
    </div>`}
  </div>`;
}
