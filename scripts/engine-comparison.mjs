#!/usr/bin/env node
//
// Comunica against holosdb, over the whole SPARQL_Course corpus.
//
//   node scripts/engine-comparison.mjs            every chapter
//   node scripts/engine-comparison.mjs 10         just chapter 10
//   SPARQL_COURSE=/path/to/course node scripts/engine-comparison.mjs
//
// Answers two questions in one pass, because they are the same measurement:
//
//   * **Is holosdb fast enough to replace Comunica in the editor?** The app runs a query on
//     an explicit user action, so what matters is the time from pressing Run to seeing rows.
//     For holosdb that includes getting the graph across the wasm boundary, a cost Comunica
//     does not pay because it queries an n3 Store in place -- so it is timed separately
//     rather than folded into the per-query numbers.
//   * **Do the course queries still mean the same thing?** A course whose answers change
//     under a new engine is a course that needs rewriting, so row counts are compared per
//     query rather than assumed to match.
//
// Not a micro-benchmark: each query runs once, which is what a user does. Repeating it would
// measure a warm engine answering a question nobody asked twice. The numbers are wall-clock
// in a Node process, a proxy for the browser's CPU time, and say nothing about download size
// -- that is a separate measurement (Comunica 0.61 MB gzipped, holosdb 1.43 MB).
//
// **Comunica is optional, and not as a nicety.** `@comunica/actor-http-fetch` pulls
// `undici ^8`, which declares `engines: node >=22.19.0` and calls
// `worker_threads.markAsUncloneable`, absent before Node 22. On an older Node the import
// throws before any query runs -- which is also why the app's own `sparql-1-2.test.ts` does
// not load. So the comparison arm runs where it can, and the holosdb numbers stand alone
// where it cannot, instead of the whole measurement being unavailable.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Parser, Store, Writer } from 'n3';

const COURSE = process.env.SPARQL_COURSE ?? 'C:/repos/SPARQL_Course';
const DATA_DIR = join(COURSE, 'data');
const Q_DIR = join(COURSE, 'queries');
const only = process.argv[2];

if (!existsSync(DATA_DIR)) {
  console.error(`no course at ${COURSE}; set SPARQL_COURSE to its path`);
  process.exit(2);
}

/**
 * The whole course dataset: the Turtle files in the default graph, and the TriG file with its
 * named graphs intact.
 *
 * The TriG is not optional. Chapters 08 and 12 are *about* named graphs -- `FROM NAMED`,
 * `GRAPH ?g`, provenance -- and loading only `.ttl` leaves the store with no named graph to
 * find. A first run did exactly that and made `q125-keeping-the-graphs-apart` look like an
 * engine disagreement when both engines were being asked about data that was not there.
 */
function courseQuads() {
  const quads = [];
  for (const file of readdirSync(DATA_DIR)) {
    const text = readFileSync(join(DATA_DIR, file), 'utf8');
    if (file.endsWith('.ttl')) quads.push(...new Parser().parse(text));
    // A fresh parser per file either way: n3 keeps prefix state across parse calls, and the
    // course files redefine prefixes.
    else if (file.endsWith('.trig')) quads.push(...new Parser({ format: 'TriG' }).parse(text));
  }
  return quads;
}

function chapters() {
  return readdirSync(Q_DIR)
    .filter((d) => !only || d.startsWith(only) || d.includes(only))
    .map((d) => ({
      name: d,
      queries: readdirSync(join(Q_DIR, d))
        .filter((f) => f.endsWith('.rq'))
        .map((f) => ({ name: f, text: readFileSync(join(Q_DIR, d, f), 'utf8') })),
    }))
    .filter((c) => c.queries.length > 0);
}

/** One comparable number per query: how many rows or triples, or which boolean. */
const shape = (kind, n) => `${kind}:${n}`;

async function drain(stream) {
  let n = 0;
  await new Promise((resolve, reject) => {
    stream.on('data', () => { n += 1; });
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return n;
}

async function comunicaRunner(quads) {
  const { QueryEngine } = await import('@comunica/query-sparql');
  const engine = new QueryEngine();
  const store = new Store();
  for (const q of quads) store.addQuad(q);
  return async (text) => {
    const result = await engine.query(text, { sources: [store] });
    if (result.resultType === 'bindings') return shape('rows', await drain(await result.execute()));
    if (result.resultType === 'quads') return shape('triples', await drain(await result.execute()));
    if (result.resultType === 'boolean') return shape('ask', await result.execute());
    return shape('other', result.resultType);
  };
}

/**
 * holosdb, with the graph crossing once as an N-Quads document.
 *
 * Once, not per query: the app can hold a store across queries exactly as the VS Code
 * extension's preview does, so charging the transfer to every query would measure a design
 * nobody has to choose.
 */
async function holosRunner(quads) {
  const holos = await import('holos-wasm-node');
  const store = new holos.Store();

  const writer = new Writer({ format: 'N-Quads' });
  for (const q of quads) writer.addQuad(q);
  let text = '';
  writer.end((err, result) => { if (err) throw err; text = result; });

  const t0 = performance.now();
  const loaded = store.load(text, 'nquads', undefined);
  const loadMs = performance.now() - t0;

  return {
    loadMs,
    loaded,
    free: () => store.free?.(),
    run: (queryText) => {
      const out = store.query(queryText, undefined);
      if (typeof out === 'boolean') return shape('ask', out);
      if (!Array.isArray(out)) return shape('other', typeof out);
      if (out.length === 0) return shape('rows', 0);
      // CONSTRUCT and DESCRIBE return N-Triples strings; SELECT returns term rows.
      return typeof out[0] === 'string'
        ? shape('triples', out.length)
        : shape('rows', out.length);
    },
  };
}

const quads = courseQuads();
const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.ttl')).length;
console.log(`corpus: ${quads.length} quads from ${files} Turtle files, node ${process.versions.node}\n`);

let comunica = null;
let cInit = 0;
let comunicaWhy = '';
try {
  const t = performance.now();
  comunica = await comunicaRunner(quads);
  cInit = performance.now() - t;
} catch (err) {
  comunicaWhy = String(err).split('\n')[0];
}

const hStart = performance.now();
const holos = await holosRunner(quads);
const hInit = performance.now() - hStart;

console.log('startup');
console.log(comunica
  ? `  comunica  ${cInit.toFixed(0).padStart(5)} ms   actor graph + n3 Store, no serialisation`
  : `  comunica  unavailable: ${comunicaWhy}`);
console.log(`  holosdb   ${hInit.toFixed(0).padStart(5)} ms   module instantiate, of which ${holos.loadMs.toFixed(0)} ms loading ${holos.loaded} quads\n`);

let agree = 0;
let differ = 0;
let errored = 0;
let total = 0;
let cTotal = 0;
// Timings for the queries *both* engines answered. A query one of them refuses says nothing
// about speed, and including it made the ratio meaningless the moment one engine had no
// GeoSPARQL.
let bothTotalC = 0;
let bothTotalH = 0;
let bothCount = 0;
let slowest = { name: '', ms: 0 };
const differences = [];
const failures = [];
let count = 0;

for (const chapter of chapters()) {
  console.log(chapter.name);
  for (const q of chapter.queries) {
    count += 1;
    let cShape = null;
    let cMs = 0;
    if (comunica) {
      try {
        const t = performance.now();
        cShape = await comunica(q.text);
        cMs = performance.now() - t;
        cTotal += cMs;
      } catch (err) {
        cShape = `error: ${String(err).split('\n')[0].slice(0, 56)}`;
      }
    }

    let hShape;
    let hMs = 0;
    try {
      const t = performance.now();
      hShape = holos.run(q.text);
      hMs = performance.now() - t;
      total += hMs;
      if (hMs > slowest.ms) slowest = { name: `${chapter.name}/${q.name}`, ms: hMs };
    } catch (err) {
      hShape = `error: ${String(err).split('\n')[0].slice(0, 56)}`;
      errored += 1;
      failures.push({ where: `${chapter.name}/${q.name}`, why: hShape });
    }

    if (cShape !== null && !cShape.startsWith('error') && !hShape.startsWith('error')) {
      bothTotalC += cMs;
      bothTotalH += hMs;
      bothCount += 1;
    }

    const same = cShape === null ? null : cShape === hShape;
    if (same === true) agree += 1;
    if (same === false) {
      differ += 1;
      differences.push({ where: `${chapter.name}/${q.name}`, comunica: cShape, holos: hShape });
    }

    const mark = same === false ? '!!' : hShape.startsWith('error') ? 'XX' : '  ';
    const against = comunica ? `comunica ${cMs.toFixed(0).padStart(5)} ms  ` : '';
    const verdict = same === false ? `${cShape} vs ${hShape}` : hShape;
    console.log(`  ${mark} ${q.name.slice(0, 54).padEnd(54)} ${against}holosdb ${hMs.toFixed(1).padStart(7)} ms  ${verdict}`);
  }
}

console.log(`\n${'='.repeat(80)}`);
console.log(`${count} queries over ${quads.length} quads`);
console.log(`holosdb: ${count - errored} answered, ${errored} errored, ${total.toFixed(0)} ms total, ${(total / count).toFixed(1)} ms mean`);
console.log(`         slowest ${slowest.ms.toFixed(0)} ms  ${slowest.name}`);
if (comunica) {
  console.log(`comunica: ${cTotal.toFixed(0)} ms total, ${(cTotal / count).toFixed(1)} ms mean`);
  console.log(`agree ${agree}   differ ${differ}`);
  if (bothCount > 0 && bothTotalH > 0) {
    const ratio = bothTotalC / bothTotalH;
    console.log(`on the ${bothCount} queries both answered: comunica ${bothTotalC.toFixed(0)} ms, holosdb ${bothTotalH.toFixed(0)} ms`);
    console.log(ratio >= 1
      ? `  holosdb is ${ratio.toFixed(2)}x faster`
      : `  holosdb is ${(1 / ratio).toFixed(2)}x slower`);
  } else {
    console.log('no query was answered by both engines, so there is nothing to compare on speed');
  }
}

if (differences.length) {
  console.log(`\ndifferences (${differences.length}) -- each one is a course answer that changed:`);
  for (const d of differences) console.log(`  ${d.where}\n      comunica ${d.comunica}\n      holosdb  ${d.holos}`);
}
if (failures.length) {
  console.log(`\nholosdb could not answer (${failures.length}):`);
  for (const f of failures) console.log(`  ${f.where}\n      ${f.why}`);
}

holos.free();
