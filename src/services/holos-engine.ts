import * as glue from 'holos-wasm/holos_wasm_bg.js'
import wasmUrl from 'holos-wasm/holos_wasm_bg.wasm?url'
import { fetchWasm } from './wasm-asset'

/**
 * Loads the SPARQL engine: `holos-wasm`, the WebAssembly build of the HOLOS store and
 * SPARQL 1.2 engine at https://github.com/pwin/triplestore.
 *
 * The same arrangement `shacl-engine.ts` uses for the SHACL validator, and for the same
 * reason: the package's entry module does `import * as wasm from "./holos_wasm_bg.wasm"`,
 * which is the ESM-integration proposal for Wasm. Vite has no native support for it and
 * fails the build outright, so the binary is instantiated by hand. It imports a single
 * module, `./holos_wasm_bg.js`, and every function it wants is exported by the glue, so the
 * glue serves as the import object.
 *
 * Self-contained by construction. The .wasm is a Vite asset served from the app's own origin
 * (the `?url` import), fetched once on first use, never from a CDN. The engine has no HTTP
 * client of its own either: a query cannot reach anywhere from inside this module, which is a
 * property of the build rather than a setting, and is why `SERVICE` is fetched by the host --
 * see `federation.ts`, where the decision about what may be called is readable.
 *
 * # Why this engine
 *
 * Measured against Comunica over the whole SPARQL_Course corpus by
 * `scripts/engine-comparison.mjs` -- 135 queries, 31,049 quads -- it answered the 121 queries
 * both engines could handle in 367 ms against 17,790 ms, and answered 131 of 135 against 126.
 * It also has GeoSPARQL, which Comunica does not, so chapter 10 of the course runs in this
 * editor for the first time; and its CONSTRUCT deduplicates, which Comunica's does not, so
 * five of the course's queries now return the counts the course documents. See
 * `useSparqlEngine.tsx` for the full comparison.
 */

export interface HolosEngine {
  Store: typeof glue.Store
}

/** Where the bytes come from; tests run outside a browser and read the file. */
export type WasmSource = () => Promise<BufferSource>

let source: WasmSource = () => fetchWasm(wasmUrl, 'The SPARQL engine')

let engine: Promise<HolosEngine> | undefined

export function useHolosWasmSource(fn: WasmSource): void {
  source = fn
  engine = undefined
}

export function loadHolosEngine(): Promise<HolosEngine> {
  engine ??= (async () => {
    const bytes = await source()
    const { instance } = await WebAssembly.instantiate(bytes, { './holos_wasm_bg.js': glue })
    glue.__wbg_set_wasm(instance.exports)
    const start = instance.exports.__wbindgen_start
    if (typeof start === 'function') start()
    return { Store: glue.Store }
  })().catch((error: unknown) => {
    // Leave the next call free to retry rather than caching the failure.
    engine = undefined
    throw error
  })
  return engine
}
