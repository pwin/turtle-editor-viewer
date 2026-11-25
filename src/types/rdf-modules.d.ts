declare module '@rdfjs/parser-jsonld';
declare module '@rdfjs/serializer-jsonld-ext';

// The wasm-bindgen glue behind `semops-wasm`, the SPARQL store and the SHACL
// validator in one module. The package's entry module imports its .wasm as an
// ES module, which Vite does not do, so services/semops-engine.ts instantiates
// the binary itself and hands it to this module's __wbg_set_wasm.
declare module 'semops-wasm/semops_wasm_bg.js' {
  export function __wbg_set_wasm(exports: WebAssembly.Exports): void;
  export const Store: typeof import('semops-wasm').Store;
  export const Validator: typeof import('semops-wasm').Validator;
  export const Report: typeof import('semops-wasm').Report;
}
