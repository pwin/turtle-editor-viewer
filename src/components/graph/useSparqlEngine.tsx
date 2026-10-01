import { useState, useCallback, useRef } from 'react';
import { Parser, Writer } from 'n3';
import type { RDFQuad } from '@/types';
import { quadsToTurtle, termToResult, type ResultRow } from '@/utils/sparql-results';
import { loadHolosEngine } from '@/services/holos-engine';

export interface SparqlResult {
  head?: { vars: string[] };
  results?: { bindings: ResultRow[] };
  rdfResult?: string;
  booleanResult?: boolean;
}

/** As much of holos-wasm as this hook uses. */
interface HolosStore {
  load(text: string, format: string, base?: string): number;
  /** A boolean for ASK, N-Triples strings for CONSTRUCT/DESCRIBE, term rows for SELECT. */
  query(query: string, base?: string): unknown;
  readonly size: number;
  free?: () => void;
}

/** A SELECT row: variable name to a term in rdf-js shape, with unbound variables absent. */
type HolosTerm = { termType: string; value: string; language?: string; datatype?: { value: string } };
type HolosRow = Record<string, HolosTerm>;

/**
 * Runs a query against the open document, in holosdb.
 *
 * # Why holosdb and not Comunica
 *
 * Measured over the whole SPARQL_Course corpus -- 135 queries, 31,049 quads -- by
 * `scripts/engine-comparison.mjs`, which is runnable and should be rerun rather than trusted:
 *
 * | | Comunica | holosdb |
 * |---|---|---|
 * | the 121 queries both answered | 17,790 ms | 367 ms |
 * | answered, of 135 | 126 | 131 |
 *
 * Speed is the least of it. The engine is also more nearly right, and each difference was
 * adjudicated against that query's own documented expected answer rather than by preferring
 * one engine:
 *
 *   * **GeoSPARQL exists.** All four of chapter 10 answer here; Comunica fails every one with
 *     "Creation of function evaluator failed". That chapter was unusable in this editor.
 *   * **CONSTRUCT deduplicates.** SPARQL 1.1 16.2 returns *a graph*, and a graph is a set, so
 *     duplicate instantiations collapse. Comunica emits one triple per solution: 75 where the
 *     course documents 15, 210 where it should be 136, 560 where it should be 412. Five
 *     queries, and deduplicating Comunica's output matches holosdb exactly in all five.
 *   * **SERVICE SILENT is silent.** The course already says so: "Fuseki honours it. The
 *     browser editor raises anyway."
 *   * **FROM NAMED works**, where Comunica errors on it.
 *
 * And it is one wasm module with no transitive dependencies, where Comunica brought a tree
 * that could not load at all on Node 20 (`undici@8` requires Node >= 22.19).
 *
 * # What it cannot do
 *
 * `SERVICE`. A wasm build has no HTTP client, so the three DBpedia queries in chapter 08
 * cannot run. Routing SERVICE through the host's `fetch` is how that gets fixed, and it is
 * not done yet.
 */
export function useSparqlEngine() {
  const [results, setResults] = useState<SparqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // One store per graph, rebuilt only when the quads change.
  //
  // The graph crosses into holosdb as text, which is the cost Comunica did not pay -- it read
  // an n3 Store in place. Measured at 123 ms for the course corpus: nothing once, everything
  // if it happens per keystroke in a workbench that re-runs as you type. Keyed on the array's
  // identity, because the caller holds one array across runs and a new graph is a new array.
  // The old store is freed first, because WASM linear memory never shrinks -- an abandoned
  // store is heap the tab holds until it closes.
  const cached = useRef<{ key: RDFQuad[]; store: HolosStore } | null>(null);

  const storeFor = useCallback(async (quads: RDFQuad[]): Promise<HolosStore> => {
    if (cached.current && cached.current.key === quads) return cached.current.store;
    cached.current?.store.free?.();
    cached.current = null;

    // Loaded through services/holos-engine, which instantiates the binary by hand -- the
    // package's own entry module uses the ESM-integration proposal for Wasm, which Vite
    // cannot build. Same arrangement as the SHACL engine next to it.
    const { Store } = await loadHolosEngine();
    const store = new Store() as unknown as HolosStore;
    if (quads.length > 0) {
      const writer = new Writer({ format: 'N-Quads' });
      for (const q of quads) writer.addQuad(q);
      let text = '';
      let failure: Error | undefined;
      // n3's Writer.end is callback-style but synchronous for an in-memory sink, so the
      // result is available by the time it returns.
      writer.end((err: Error | null, result: string) => {
        if (err) failure = err;
        else text = result;
      });
      if (failure) throw failure;
      store.load(text, 'nquads', undefined);
    }
    cached.current = { key: quads, store };
    return store;
  }, []);

  const executeQuery = useCallback(async (query: string, quads: RDFQuad[], prefixes: Record<string, string> = {}) => {
    setIsExecuting(true);
    setError(null);
    try {
      const store = await storeFor(quads);
      // No DESCRIBE rewriting: holosdb answers DESCRIBE itself. The previous engine did not,
      // so this hook turned `DESCRIBE <uri>` into a CONSTRUCT with a regex, which got the
      // common shapes right and quietly mangled the rest.
      const out = store.query(query, undefined);

      if (typeof out === 'boolean') {
        const resultObj = { booleanResult: out };
        setResults(resultObj as SparqlResult);
        return resultObj;
      }

      if (!Array.isArray(out)) {
        throw new Error('Unsupported query type');
      }

      // CONSTRUCT and DESCRIBE come back as N-Triples strings, one per triple with no trailing
      // separator; SELECT comes back as term rows.
      if (out.length > 0 && typeof out[0] === 'string') {
        const nt = (out as string[]).map((line) => `${line} .`).join('\n');
        const constructed = new Parser({ format: 'N-Triples' }).parse(nt) as RDFQuad[];
        // Serialised here rather than by the engine's own `queryRdf`, because this applies the
        // open document's prefixes, which is what a reader of the result pane expects.
        const resultObj = { rdfResult: await quadsToTurtle(constructed, prefixes) };
        setResults(resultObj as SparqlResult);
        return resultObj;
      }

      const rows = out as HolosRow[];
      const vars = projectedVars(rows, query);
      const bindings: ResultRow[] = rows.map((row) => {
        const encoded: ResultRow = {};
        for (const v of vars) {
          const term = row[v];
          // termToResult takes rdf-js terms, which is what the binding returns, so every term
          // kind it knows -- a literal's language, its datatype -- is encoded without this
          // hook deciding what a term is.
          if (term) encoded[v] = termToResult(term as never);
        }
        return encoded;
      });

      const resultObj = { head: { vars }, results: { bindings } };
      setResults(resultObj);
      return resultObj;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      throw e;
    } finally {
      setIsExecuting(false);
    }
  }, [storeFor]);

  return { executeQuery, results, error, isExecuting };
}

/**
 * The variables a SELECT projected, in projection order.
 *
 * The binding returns one object per row with unbound variables *absent*, which is right for a
 * row and not enough for a header: `head.vars` in the SPARQL results JSON format lists every
 * projected variable, including one that is unbound in every row, and a result with no rows at
 * all still has columns.
 *
 * So the rows answer where they can -- holosdb builds each row in the query's own variable
 * order, so first-appearance order is projection order -- and the query text answers what the
 * rows cannot show. A `variables` field on the binding's SELECT result would remove the
 * fallback entirely; that belongs in the engine rather than here, and is not there yet.
 */
export function projectedVars(rows: HolosRow[], query: string): string[] {
  const seen: string[] = [];
  for (const row of rows) {
    for (const v of Object.keys(row)) if (!seen.includes(v)) seen.push(v);
  }

  const projection = /select\s+(?:distinct\s+|reduced\s+)?(.+?)\s+where/is.exec(query)?.[1]?.trim();
  if (!projection || projection === '*') return seen;

  // `(COUNT(*) AS ?n)` and friends bind the name after AS; a bare `?x` binds itself. Anything
  // else in the projection is not a column.
  const declared: string[] = [];
  for (const match of projection.matchAll(/\bas\s+\?([a-zA-Z0-9_]+)|\?([a-zA-Z0-9_]+)/gi)) {
    const name = match[1] ?? match[2];
    if (name && !declared.includes(name)) declared.push(name);
  }

  // Declared order first, then anything the rows carry that the projection did not name --
  // which should be nothing, and is appended rather than dropped if it ever happens.
  const out = [...declared];
  for (const v of seen) if (!out.includes(v)) out.push(v);
  return out.length > 0 ? out : seen;
}
