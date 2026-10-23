// Prüft eine Fragenkatalog-Datei auf Struktur und Erkennbarkeit der Antworten.
// Aufruf: node scripts/check-catalog.js <duemmste|quizduell|familienduell> <datei.js>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { matchAnswer, matchAmong, extractNumbers, normalize } from '../server/matcher.js';

const [type, file] = process.argv.slice(2);
if (!type || !file) {
  console.error('Aufruf: node scripts/check-catalog.js <duemmste|quizduell|familienduell> <datei.js>');
  process.exit(2);
}

const mod = await import(pathToFileURL(path.resolve(file)).href);
const data = mod.default;
const errors = [];
const warn = [];
const ids = new Set();
const texts = new Set();

const err = (id, msg) => errors.push(`${id}: ${msg}`);

function checkQuestion(x, where) {
  const id = x.id || where;
  if (!x.id || typeof x.id !== 'string') err(where, 'fehlende id');
  if (ids.has(x.id)) err(id, 'doppelte id');
  ids.add(x.id);
  if (!x.q || typeof x.q !== 'string') err(id, 'fehlende Frage q');
  if (x.a == null || typeof x.a !== 'string' || !x.a.trim()) err(id, 'fehlende Antwort a (String)');
  const qn = normalize(x.q);
  if (texts.has(qn)) err(id, 'doppelte Frage');
  texts.add(qn);
  if (x.alt && !Array.isArray(x.alt)) err(id, 'alt muss ein Array sein');
  if (x.num != null) {
    if (typeof x.num !== 'number') err(id, 'num muss eine Zahl sein');
    const nums = extractNumbers(normalize(x.a));
    if (!nums.includes(x.num)) warn.push(`${id}: Anzeige-Antwort "${x.a}" enthält num ${x.num} nicht`);
    if (!matchAnswer(String(x.num), x)) err(id, `Zahl ${x.num} wird nicht erkannt`);
  } else {
    if (!matchAnswer(x.a, x)) err(id, `Antwort "${x.a}" wird nicht als richtig erkannt`);
    for (const al of x.alt || []) if (!matchAnswer(al, x)) err(id, `Alternative "${al}" wird nicht erkannt`);
  }
  if (x.kw) {
    if (!Array.isArray(x.kw) || !x.kw.every((g) => Array.isArray(g) && g.length)) err(id, 'kw muss string[][] sein');
  }
  if (matchAnswer('keine ahnung', x) || matchAnswer('ja', x) || matchAnswer('nein', x)) warn.push(`${id}: akzeptiert Allerweltsantwort`);
}

if (type === 'duemmste') {
  if (!Array.isArray(data)) throw new Error('default export muss ein Array sein');
  data.forEach((x, i) => checkQuestion(x, `#${i}`));
  console.log(`${data.length} Fragen`);
} else if (type === 'quizduell') {
  if (!Array.isArray(data)) throw new Error('default export muss ein Array von Kategorien sein');
  for (const c of data) {
    if (!c.id || !c.name || !Array.isArray(c.questions)) { err(c.id || '?', 'Kategorie braucht id, name, questions'); continue; }
    const perLvl = {};
    c.questions.forEach((x, i) => {
      checkQuestion(x, `${c.id}#${i}`);
      if (![1, 2, 3, 4, 5].includes(x.lvl)) err(x.id, 'lvl muss 1–5 sein');
      perLvl[x.lvl] = (perLvl[x.lvl] || 0) + 1;
    });
    for (const l of [1, 2, 3, 4]) if ((perLvl[l] || 0) < 3) err(c.id, `zu wenige Fragen für Stufe ${l} (${perLvl[l] || 0})`);
    console.log(`${c.id.padEnd(16)} ${c.name.padEnd(28)} ${c.questions.length} Fragen  ${JSON.stringify(perLvl)}`);
  }
} else if (type === 'familienduell') {
  if (!Array.isArray(data)) throw new Error('default export muss ein Array sein');
  data.forEach((x, i) => {
    const id = x.id || `#${i}`;
    if (!x.id) err(id, 'fehlende id');
    if (ids.has(x.id)) err(id, 'doppelte id');
    ids.add(x.id);
    if (!x.q) err(id, 'fehlende Frage');
    const qn = normalize(x.q);
    if (texts.has(qn)) err(id, 'doppelte Frage');
    texts.add(qn);
    if (!Array.isArray(x.a) || x.a.length < 5 || x.a.length > 8) { err(id, 'a muss 5–8 Antworten haben'); return; }
    let sum = 0, last = Infinity;
    x.a.forEach((ans, j) => {
      if (!ans.t || typeof ans.p !== 'number') err(id, `Antwort ${j} braucht t und p`);
      if (ans.p > last) err(id, 'Antworten müssen absteigend nach p sortiert sein');
      last = ans.p;
      sum += ans.p;
      for (const variant of [ans.t, ...(ans.alt || [])]) {
        const hit = matchAmong(variant, x.a);
        if (hit !== j) err(id, `"${variant}" wird als Antwort ${hit} statt ${j} erkannt`);
      }
    });
    if (sum > 100 || sum < 60) err(id, `Summe der Prozente ist ${sum} (erlaubt 60–100)`);
  });
  console.log(`${data.length} Umfragen`);
}

for (const w of warn) console.log('WARNUNG', w);
if (errors.length) {
  for (const e of errors) console.log('FEHLER', e);
  console.log(`\n${errors.length} Fehler`);
  process.exit(1);
}
console.log('OK – keine Fehler');
