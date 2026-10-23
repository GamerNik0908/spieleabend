import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchAnswer, matchAmong, extractNumbers, normalize, parseNumberWord, koelner } from '../server/matcher.js';

const ok = (input, spec) => assert.ok(matchAnswer(input, spec), `${input} sollte zu ${JSON.stringify(spec)} passen`);
const no = (input, spec) => assert.ok(!matchAnswer(input, spec), `${input} sollte NICHT zu ${JSON.stringify(spec)} passen`);

test('Zahlwörter', () => {
  assert.equal(parseNumberWord('zweitausendsechs'), 2006);
  assert.equal(parseNumberWord('zweiunddreissig'), 32);
  assert.equal(parseNumberWord('neunzehnhundertneunzig'), 1990);
  assert.equal(parseNumberWord('dreihundertsechsundsechzig'), 366);
  assert.deepEqual(extractNumbers(normalize('20 Milliarden')), [20e9]);
  assert.deepEqual(extractNumbers(normalize('2,5 Mio')), [2.5e6]);
  assert.deepEqual(extractNumbers(normalize('1.000')), [1000]);
});

test('Tippfehler & Füllwörter', () => {
  ok('Helsinky', { a: 'Helsinki' });
  ok('im Rom', { a: 'Rom' });
  ok('ich glaube es ist Nikotin', { a: 'Nikotin' });
  ok('leonardo davinci', { a: 'Leonardo da Vinci', alt: ['da Vinci'] });
  ok('Filipinen', { a: 'Philippinen' });
  ok('Kühe', { a: 'Kuh' });
  ok('Strasse', { a: 'Straße' });
  ok('Löwe', { a: 'Löwe' });
  ok('Lowe', { a: 'Löwe' });
  no('Paris', { a: 'Rom' });
  no('Hund', { a: 'Hai' });
  no('Kanada', { a: 'Kenia' });
});

test('Zahlen-Antworten', () => {
  ok('366', { a: '366', num: 366 });
  ok('dreihundertsechsundsechzig', { a: '366', num: 366 });
  ok('sechs', { a: '6', num: 6 });
  no('11 oder 12', { a: '10', num: 10 });
  no('7', { a: '6', num: 6 });
  ok('1000 ml', { a: '1000', num: 1000 });
});

test('Schlüsselwort-Modus', () => {
  ok('Was ist die Hauptstadt von Deutschland?', { a: 'Was ist die Hauptstadt von Deutschland?', kw: [['hauptstadt'], ['deutschland']] });
  ok('hauptstadt deutschlands', { a: 'x', kw: [['hauptstadt'], ['deutschland']] });
  no('größte Stadt Deutschlands', { a: 'x', kw: [['hauptstadt'], ['deutschland']] });
});

test('Familien-Duell Auswahl', () => {
  const opts = [{ t: 'Pinguin' }, { t: 'Elefant' }, { t: 'Affe', alt: ['Affen', 'Gorilla'] }, { t: 'Löwe' }];
  assert.equal(matchAmong('pingu', opts), 0);
  assert.equal(matchAmong('Elephant', opts), 1);
  assert.equal(matchAmong('gorilla', opts), 2);
  assert.equal(matchAmong('Tiger', opts), -1);
});

test('Kölner Phonetik', () => {
  assert.equal(koelner('philippinen'), koelner('filipinen'));
});
