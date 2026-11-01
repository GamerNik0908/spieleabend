// Tutorial-Folien je Spiel. Der Operator blättert, alle sehen dieselbe Folie.
import { html, op, useEffect, AssetImg } from './lib.js';

export const TUTORIALS = {
  quizduell: [
    { icon: '⚡', title: 'Quiz Duell', text: 'Ein Spielbrett mit 6 Kategorien und Feldern von 100 bis 400 Punkten. Ihr spielt in Teams.' },
    { icon: '👆', title: 'Feld wählen', text: 'Die Teams sind nacheinander dran. Reihum wählt ein Teammitglied ein Feld – je höher der Wert, desto schwerer die Frage.' },
    { icon: '⌨️', title: 'Antwort tippen', text: 'Wer dran ist, tippt die Antwort ein. Absprechen per Voice ist erlaubt! Tippfehler sind kein Problem.' },
    { icon: '🚨', title: 'Falsch? Buzzern!', text: 'Falsche Antwort = halbe Punkte Abzug. Dann dürfen die anderen Teams buzzern und die Punkte abstauben (Leertaste oder BUZZ-Knopf).' },
    { icon: '✖️2', title: 'Runde 2', text: 'Im zweiten Brett zählen alle Felder doppelt. Das Team mit den wenigsten Punkten fängt an. Viel Glück!' },
  ],
  familienduell: [
    { icon: '📊', title: 'Familien-Duell', text: '„Wir haben 100 Leute gefragt …“ – auf der Tafel stehen die häufigsten Antworten. Zwei Teams treten gegeneinander an.' },
    { icon: '🔴', title: 'Buzzer-Duell', text: 'Aus jedem Team steht einer am Buzzer. Wer zuerst drückt, antwortet. Die bessere Antwort holt die Runde fürs Team.' },
    { icon: '🔄', title: 'Raten im Team', text: 'Das Team mit der Kontrolle rät reihum weiter. Jede richtige Antwort bringt Punkte in den Topf.' },
    { icon: '✖️', title: 'Drei Fehler', text: 'Nach drei Fehlern darf das andere Team mit EINER Antwort klauen. Trifft es, bekommt es den ganzen Topf!' },
    { icon: '🔥', title: 'Finale', text: 'Im Finale antwortet aus jedem Team eine Person geheim auf dieselbe Frage. Punkte = Prozent der Antwort.' },
  ],
  duemmste: [
    { icon: '🧠', title: 'Der Dümmste fliegt', text: 'Jeder hat Leben ❤️. Reihum bekommt jeder blitzschnell eine Frage – ihr habt nur wenige Sekunden.' },
    { icon: '⏱️', title: 'Die Fragerunde', text: 'Die Uhr läuft. Bis sie abgelaufen ist, gehen die Fragen immer weiter reihum. Alle sehen, was ihr tippt!' },
    { icon: '🗳️', title: 'Abstimmung', text: 'Dann wählt jeder den Dümmsten. Es geht nicht darum, wer am meisten falsch hatte – sondern wer am dümmsten war.' },
    { icon: '💔', title: 'Leben weg', text: 'Wer die meisten Stimmen hat, verliert ein Leben. Bei Gleichstand gibt es ein Stechen mit Fragen. Keine Leben mehr = raus!' },
    { icon: '🔥', title: 'Finale', text: 'Die letzten zwei spielen das Finale: Wer falsch liegt, während der andere richtig liegt, verliert ein Leben.' },
  ],
  montagsmaler: [
    { icon: '🎨', title: 'Montagsmaler', text: 'Reihum malt jeder einen Begriff – alle anderen raten durch Tippen.' },
    { icon: '🃏', title: 'Begriff wählen', text: 'Der Zeichner bekommt drei Begriffe zur Wahl: ★ leicht, ★★ mittel, ★★★ schwer. Nur er sieht das Wort.' },
    { icon: '✏️', title: 'Zeichnen', text: 'Mit Maus oder Finger malen, Farben und Stiftgrößen wechseln, rückgängig machen. Buchstaben und Zahlen malen ist verboten!' },
    { icon: '💬', title: 'Raten', text: 'Tippt eure Tipps ins Feld. Je schneller ihr richtig liegt, desto mehr Punkte. Bei „knapp daneben“ sagt es dir das Spiel.' },
    { icon: '🏆', title: 'Punkte', text: 'Der Zeichner bekommt Punkte für jeden, der es errät. Mit der Zeit werden Buchstaben als Tipp aufgedeckt.' },
  ],
  luegenbaron: [
    { icon: '🤥', title: 'Lügenbaron', text: 'Jede Runde kommt eine echte, absurde Tatsache – mit einer Lücke.' },
    { icon: '✍️', title: 'Lügen erfinden', text: 'Jeder schreibt eine Lüge für die Lücke, die möglichst echt klingt. Schreibst du aus Versehen die Wahrheit, sagt dir das Spiel Bescheid.' },
    { icon: '🔍', title: 'Wahrheit finden', text: 'Dann werden alle Lügen und die Wahrheit gemischt. Jeder tippt auf die Antwort, die er für wahr hält.' },
    { icon: '💰', title: 'Punkte', text: 'Wahrheit gefunden: +500. Für jeden, der auf DEINE Lüge reinfällt: +250. Die letzte Runde zählt doppelt!' },
  ],
  spion: [
    { icon: '🕵️', title: 'Der Spion', text: 'Alle bekommen dasselbe geheime Wort – nur einer nicht: der Spion. Er kennt bloß die Kategorie.' },
    { icon: '💬', title: 'Hinweise', text: 'Reihum gibt jeder ein Hinweiswort. Zu deutlich → der Spion errät das Wort. Zu vage → du wirkst selbst verdächtig.' },
    { icon: '🎭', title: 'Als Spion', text: 'Hör gut zu und bluffe! Du siehst eine Liste möglicher Wörter. Gib Hinweise, die zu allen passen könnten.' },
    { icon: '🗳️', title: 'Abstimmung', text: 'Diskutiert und stimmt ab, wer der Spion ist. Wird er enttarnt, darf er noch das Wort raten – trifft er, gewinnt er trotzdem!' },
  ],
  witzbold: [
    { icon: '😂', title: 'Witzbold', text: 'Jeder bekommt zwei lustige Satzanfänge und schreibt die witzigste Antwort, die ihm einfällt.' },
    { icon: '⚔️', title: 'Duelle', text: 'Zwei Spieler hatten denselben Satzanfang. Beide Antworten werden anonym gezeigt – alle anderen stimmen ab.' },
    { icon: '🏆', title: 'Witzbold-Bonus', text: 'Pro Stimme gibt es Punkte. Bekommt eine Antwort ALLE Stimmen, gibt es den Witzbold-Bonus obendrauf.' },
    { icon: '🔥', title: 'Finale', text: 'Zum Schluss beantworten alle denselben Satzanfang. Jeder stimmt für die beste fremde Antwort – Punkte ×3!' },
  ],
  gleichdenker: [
    { icon: '🧩', title: 'Gleichdenker', text: 'Ihr spielt in Teams. Jede Runde kommt eine offene Frage, z. B. „Nenne ein Obst – außer Apfel oder Banane“.' },
    { icon: '🤫', title: 'Geheim antworten', text: 'Jeder tippt seine Antwort geheim ein. Absprechen ist verboten – ihr müsst erraten, was eure Teamkollegen schreiben!' },
    { icon: '🎯', title: 'Punkte', text: 'Alle im Team gleich: 3 Punkte. Zwei gleich (bei drei): 1 Punkt. Alle verschieden: 0. Bei größeren Teams wird anteilig gestaffelt.' },
    { icon: '🧠', title: 'Taktik', text: 'Nehmt ihr die offensichtliche Standardantwort – oder setzt ihr auf euren Insider? Kleine Schreibfehler zählen trotzdem als gleich.' },
  ],
  schaetzen: [
    { icon: '🎯', title: 'Schätzmeister', text: 'Jede Runde eine Frage mit einer Zahl als Antwort – Höhen, Jahre, Mengen, Kurioses.' },
    { icon: '🤔', title: 'Schätzen', text: 'Tippt eure Schätzung ein, z. B. „1500“, „2,5 Mio“ oder „zweitausend“. Bis zum Ende der Zeit darfst du sie ändern.' },
    { icon: '📏', title: 'Auflösung', text: 'Auf dem Zahlenstrahl seht ihr, wo alle liegen. Am nächsten dran: +500, Zweiter +300, Dritter +200.' },
    { icon: '🎯', title: 'Volltreffer', text: 'Ein Volltreffer gibt +300 Bonus. Die letzte Frage zählt doppelt!' },
  ],
};

export function TutorialOverlay({ st }) {
  const t = st.tutorial;
  const slides = t && TUTORIALS[t.game];
  const isOp = st.me.isOperator;
  const step = t ? Math.min(t.step, (slides?.length || 1) - 1) : 0;
  const go = (s) => op('tutorial', { game: t.game, step: s });
  useEffect(() => {
    if (!t || !isOp) return undefined;
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'ArrowRight' && step < slides.length - 1) go(step + 1);
      if (e.key === 'ArrowLeft' && step > 0) go(step - 1);
      if (e.key === 'Escape') op('tutorialClose');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [t?.game, step, isOp]);
  if (!slides) return null;
  const s = slides[step];
  const last = step === slides.length - 1;
  return html`<div class="tut-back">
    <div class="tut-card" key=${`${t.game}-${step}`}>
      <div class="tut-head"><span class="pill accent">So geht's</span><span class="tiny muted">${step + 1} / ${slides.length}</span></div>
      <div class="tut-icon">${step === 0 ? html`<${AssetImg} src=${`/assets/games/${t.game}.png`} fallback=${s.icon} />` : s.icon}</div>
      <h2 class="tut-title">${s.title}</h2>
      <p class="tut-text">${s.text}</p>
      <div class="tut-dots">${slides.map((_, i) => html`<i key=${i} class=${i === step ? 'on' : ''}></i>`)}</div>
      ${isOp ? html`<div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap">
          <button class="btn" disabled=${step === 0} onClick=${() => go(step - 1)}>← Zurück</button>
          ${last ? html`<button class="btn primary" onClick=${() => op('tutorialClose')}>Verstanden ✓</button>`
            : html`<button class="btn primary" onClick=${() => go(step + 1)}>Weiter →</button>`}
          ${last && !st.game && st.gameType === t.game && html`<button class="btn pink go" onClick=${async () => { await op('tutorialClose'); op('start'); }}>▶ Spiel starten</button>`}
          ${!last && html`<button class="btn ghost sm" onClick=${() => op('tutorialClose')}>Schließen</button>`}
        </div>
        <div class="tiny muted" style="margin-top:8px">Pfeiltasten ← → zum Blättern</div>`
        : html`<div class="muted small">Der Operator blättert weiter …</div>`}
    </div>
  </div>`;
}
