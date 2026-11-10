// Executa a busca por regex fora da thread principal (permite interromper expressões lentas).
import { parentPort, workerData } from 'node:worker_threads';
import { VALIDATORS, normalizeValue } from './forensic.js';

const { corpus, source, flags, validate, normalize, limit } = workerData;

const re = new RegExp(source, flags.includes('g') ? flags : flags + 'g');
const check = validate ? VALIDATORS[validate] : null;

const results = [];
const uniques = new Map(); // valorNormalizado -> {value, count, chats:Set}
let totalMatches = 0;
let totalMessages = 0;
const chats = new Set();

for (const [c, i, text] of corpus) {
  re.lastIndex = 0;
  let m;
  const marks = [];
  while ((m = re.exec(text))) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    if (check && !check(m[0])) continue;
    marks.push([m.index, m[0].length, m[0]]);
  }
  if (!marks.length) continue;
  totalMessages++;
  totalMatches += marks.length;
  chats.add(c);
  for (const mk of marks) {
    const v = mk[2];
    const key = normalizeValue(v.trim(), normalize);
    mk.push(key);
    const u = uniques.get(key) || { value: v.trim(), count: 0, chats: new Set(), first: [c, i] };
    u.count++;
    u.chats.add(c);
    uniques.set(key, u);
  }
  if (results.length < limit) results.push({ c, i, text, marks });
}

parentPort.postMessage({
  results,
  totalMatches,
  totalMessages,
  chatCount: chats.size,
  uniques: [...uniques.entries()]
    .map(([key, u]) => ({ key, value: u.value, count: u.count, chats: u.chats.size, first: u.first }))
    .sort((a, b) => b.count - a.count),
});
