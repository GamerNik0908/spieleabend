// Lädt und vereint alle Fragenkataloge. Eigene Fragen einfach in den Dateien ergänzen.
import { normalize } from '../matcher.js';

async function load(file) {
  try {
    return (await import(new URL(file, import.meta.url))).default || [];
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      console.warn(`[Fragen] ${file} fehlt – wird übersprungen`);
      return [];
    }
    console.error(`[Fragen] ${file} ist fehlerhaft und wird übersprungen: ${err.message}`);
    return [];
  }
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((q) => {
    const k = normalize(q.q);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const DUEMMSTE = dedupe([...(await load('./duemmste-a.js')), ...(await load('./duemmste-b.js'))]);

export const QUIZ_CATEGORIES = [...(await load('./quizduell-a.js')), ...(await load('./quizduell-b.js'))]
  .filter((c) => c.questions?.length);

export const FAMILIENDUELL = await load('./familienduell.js');

export const MONTAGSMALER = await load('./montagsmaler.js');
export const LUEGENBARON = await load('./luegenbaron.js');
export const SPION = (await load('./spion.js')).filter((c) => c.words?.length);
export const WITZBOLD = await load('./witzbold.js');
export const SCHAETZEN = await load('./schaetzen.js');

export const catalogStats = () => ({
  montagsmaler: MONTAGSMALER.length,
  luegenbaron: LUEGENBARON.length,
  spion: SPION.reduce((n, c) => n + c.words.length, 0),
  witzbold: WITZBOLD.length,
  schaetzen: SCHAETZEN.length,
  duemmste: DUEMMSTE.length,
  quizduell: QUIZ_CATEGORIES.reduce((n, c) => n + c.questions.length, 0),
  quizKategorien: QUIZ_CATEGORIES.length,
  familienduell: FAMILIENDUELL.length,
});
