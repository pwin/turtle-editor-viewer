import * as glue from 'semops-wasm/semops_wasm_bg.js'
import wasmUrl from 'semops-wasm/semops_wasm_bg.wasm?url'
import { fetchWasm } from './wasm-asset'

/**
 * Loads both engines: `semops-wasm`, the WebAssembly build of SemOps System at
 * https://github.com/pwin/SemopsSystem. One module holds the HOLOS store and SPARQL 1.2
 * engine (`Store`) and the SHACL engine (`Validator`), sharing one copy of the RDF model,
 * parsers and SPARQL evaluator, where `holos-wasm` and `shacl-wasm` carried two.
 *
 * One module means one instantiation. The glue keeps the instance in module state, set by
 * `__wbg_set_wasm`, so the SPARQL panel and the SHACL panel must share it: a second
 * instantiation would swap the memory out from under every `Store` and `Validator` the
 * first one made.
 *
 * Instantiated by hand rather than through the package's entry module, which does
 * `import * as wasm from "./semops_wasm_bg.wasm"`, the ESM-integration proposal for Wasm.
 * Vite has no native support for it and fails the build outright. The binary imports a
 * single module, `./semops_wasm_bg.js`, and every function it wants is exported by the
 * glue, so the glue serves as the import object.
 *
 * # Contained in the browser
 *
 * By construction, not by setting. The .wasm is a Vite asset served from the app's own
 * origin (the `?url` import), fetched once on first use, never from a CDN. The module has no
 * HTTP client and no telemetry: what it can ask the page for is its import list -- the clock,
 * `crypto.getRandomValues`, `console.error` for a panic, and object, array and error
 * constructors -- and `semops-engine.containment.test.ts` fails if that list or the glue
 * behind it ever grows a network API. SemOps System's OpenTelemetry export belongs to its
 * server (`holos-server`), which no WebAssembly crate depends on.
 *
 * So a query cannot reach anywhere from inside this module, which is why `SERVICE` is
 * fetched by the host -- see `federation.ts`, where the decision about what may be called is
 * readable. The SHACL engine rejects `SERVICE` inside `sh:sparql` constraints, targets and
 * rules, so a shapes file cannot cause a request either.
 *
 * # Why this engine
 *
 * Measured against Comunica over the whole SPARQL_Course corpus by
 * `scripts/engine-comparison.mjs` -- 135 queries, 31,049 quads -- HOLOS answered the 121
 * queries both engines could handle in 367 ms against 17,790 ms, and answered 131 of 135
 * against 126. It also has GeoSPARQL, which Comunica does not, so chapter 10 of the course
 * runs in this editor; and its CONSTRUCT deduplicates, which Comunica's does not, so five of
 * the course's queries return the counts the course documents. See `useSparqlEngine.tsx` for
 * the full comparison.
 */

export interface SemopsEngine {
  Store: typeof glue.Store
  Validator: typeof glue.Validator
}

/** Where the bytes come from; tests run outside a browser and read the file. */
export type WasmSource = () => Promise<BufferSource>

let source: WasmSource = () => fetchWasm(wasmUrl, 'The SPARQL and SHACL engine')

let engine: Promise<SemopsEngine> | undefined

export function useSemopsWasmSource(fn: WasmSource): void {
  source = fn
  engine = undefined
}

export function loadSemopsEngine(): Promise<SemopsEngine> {
  engine ??= (async () => {
    const bytes = await source()
    const { instance } = await WebAssembly.instantiate(bytes, { './semops_wasm_bg.js': glue })
    glue.__wbg_set_wasm(instance.exports)
    const start = instance.exports.__wbindgen_start
    if (typeof start === 'function') start()
    return { Store: glue.Store, Validator: glue.Validator }
  })().catch((error: unknown) => {
    // Leave the next call free to retry rather than caching the failure.
    engine = undefined
    throw error
  })
  return engine
}
