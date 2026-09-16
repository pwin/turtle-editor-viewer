import * as glue from 'shacl-wasm/shacl_wasm_bg.js'
import wasmUrl from 'shacl-wasm/shacl_wasm_bg.wasm?url'

/**
 * Loads the SHACL engine: `shacl-wasm`, the WebAssembly build of the Rust
 * validator at https://github.com/pwin/SHACL_Engine. SHACL Core and
 * SHACL-SPARQL, RDF 1.2 data, no server.
 *
 * Self-contained by construction. The .wasm is a Vite asset served from the
 * app's own origin (the `?url` import), fetched once, on first use, and never
 * from a CDN. The glue module's imports are TextDecoder, Error, getRandomValues
 * and the like; it has no network code, and the engine rejects SERVICE inside
 * sh:sparql constraints, so a shapes file cannot send data anywhere.
 *
 * Instantiated by hand rather than through the package's entry module, which
 * does `import * as wasm from "./shacl_wasm_bg.wasm"`; Vite has no native
 * support for that and would need two plugins. The binary imports a single
 * module, "./shacl_wasm_bg.js", and every function it wants is exported by
 * the glue, so the glue itself serves as the import object.
 */

export interface ShaclEngine {
  Validator: typeof glue.Validator
}

/** Where the bytes come from; tests run outside a browser and read the file. */
export type WasmSource = () => Promise<BufferSource>

let source: WasmSource = async () => {
  const response = await fetch(wasmUrl)
  if (!response.ok) throw new Error(`Could not load the SHACL engine (HTTP ${response.status})`)
  return response.arrayBuffer()
}

let engine: Promise<ShaclEngine> | undefined

export function useShaclWasmSource(fn: WasmSource): void {
  source = fn
  engine = undefined
}

export function loadShaclEngine(): Promise<ShaclEngine> {
  engine ??= (async () => {
    const bytes = await source()
    const { instance } = await WebAssembly.instantiate(bytes, { './shacl_wasm_bg.js': glue })
    glue.__wbg_set_wasm(instance.exports)
    const start = instance.exports.__wbindgen_start
    if (typeof start === 'function') start()
    return { Validator: glue.Validator }
  })().catch((error: unknown) => {
    // Leave the next call free to retry rather than caching the failure.
    engine = undefined
    throw error
  })
  return engine
}
