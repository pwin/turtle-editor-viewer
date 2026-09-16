declare module '@rdfjs/parser-jsonld';
declare module '@rdfjs/serializer-jsonld-ext';

// The wasm-bindgen glue behind `shacl-wasm`. The package's entry module imports
// its .wasm as an ES module, which Vite does not do, so services/shacl-engine.ts
// instantiates the binary itself and hands it to this module's __wbg_set_wasm.
declare module 'shacl-wasm/shacl_wasm_bg.js' {
  export function __wbg_set_wasm(exports: WebAssembly.Exports): void;
  export const Validator: typeof import('shacl-wasm').Validator;
  export const Report: typeof import('shacl-wasm').Report;
}
