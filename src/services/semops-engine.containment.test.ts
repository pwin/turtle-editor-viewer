/**
 * The engine stays inside the browser tab: no network, no telemetry.
 *
 * `semops-wasm` comes from SemOps System, which also builds a server that exports
 * OpenTelemetry over OTLP/HTTP. That export lives in `holos-server` and nothing in the
 * WebAssembly build depends on it -- but "nothing depends on it" is a fact about one release
 * of someone else's dependency graph, so this file checks it again on every upgrade rather
 * than trusting it.
 *
 * A WebAssembly module can do nothing the page does not hand it: its import list is the
 * whole of its reach. So the checks are, in order of strength:
 *
 * 1. every import comes from the package's own glue, and is one of a reviewed set;
 * 2. the glue behind those imports names no network or telemetry API;
 * 3. the binary carries none of the server's HTTP or telemetry crates;
 * 4. the engine, asked to reach out every way a query or a shapes graph can, does not.
 *
 * A failure here is not necessarily a vulnerability. It means the engine can now do
 * something it could not before, and someone has to read what before the upgrade ships.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as semops from 'semops-wasm-node'

const pkg = (name: string, file: string) => join(process.cwd(), 'node_modules', name, file)
const BROWSER_WASM = pkg('semops-wasm', 'semops_wasm_bg.wasm')
const BROWSER_GLUE = pkg('semops-wasm', 'semops_wasm_bg.js')
const NODE_WASM = pkg('semops-wasm-node', 'semops_wasm_bg.wasm')

/**
 * What the module may ask the page for, by the name wasm-bindgen gives it with the hash
 * taken off. Reviewed against semops-wasm 0.31.0's glue:
 *
 * - `Error`, `String`, `new`, `push`, `set`, `stack`: building errors, strings, objects
 *   and arrays to return results in, and reading a stack for a panic message.
 * - `error`: `console.error`, for a panic.
 * - `getRandomValues`: `crypto.getRandomValues`, for blank node ids and `UUID()`.
 * - `now`: `Date.now`, for SPARQL's `NOW()`.
 * - `__wbindgen_throw`, `__wbindgen_init_externref_table`, `__wbindgen_generic`:
 *   wasm-bindgen's own plumbing.
 */
const REVIEWED_IMPORTS = new Set([
  'Error',
  'String',
  'new',
  'push',
  'set',
  'stack',
  'error',
  'getRandomValues',
  'now',
  '__wbindgen_throw',
  '__wbindgen_init_externref_table',
  '__wbindgen_generic',
])

/** `__wbg_now_aa4ccb83129e9e55` to `now`; `__wbindgen_generic_0000000000000001` to `__wbindgen_generic`. */
const importKind = (name: string) => name.replace(/^__wbg_/, '').replace(/_[0-9a-f]{16}$/, '')

/**
 * Every way a script in a page can send something somewhere: requests, sockets, beacons,
 * workers that could do either, and the DOM (an `<img>` with a crafted `src` is a request).
 */
const NETWORK_APIS =
  /\b(fetch|XMLHttpRequest|WebSocket|WebTransport|EventSource|sendBeacon|RTCPeerConnection|importScripts|navigator|Worker|SharedWorker|serviceWorker|document|location|Image|open|postMessage|BroadcastChannel)\b|\bimport\s*\(|\brequire\s*\(/

/** What SemOps System's server links for telemetry and HTTP, and must never reach the browser. */
const SERVER_ONLY = ['opentelemetry', 'otlp', 'otel_exporter', 'x-protobuf', 'reqwest', 'ureq', 'tiny_http', 'hyper', 'object_store', 'azure']

/** The glue's code with its doc comments gone: those mention `fetch` in an example. */
const code = (js: string) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('semops-wasm stays in the browser tab', () => {
  it('ships the same binary to the browser as the Node package the tests run', () => {
    // So every engine test in this suite exercises the bytes the browser loads.
    const digest = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex')
    expect(digest(NODE_WASM)).toBe(digest(BROWSER_WASM))
  })

  it('imports only from its own glue, and only what has been reviewed', () => {
    const imports = WebAssembly.Module.imports(new WebAssembly.Module(readFileSync(BROWSER_WASM)))
    expect(imports.length).toBeGreaterThan(0)
    // A module of its own (an inline-JS snippet, say) would be code this file has not read.
    expect([...new Set(imports.map((i) => i.module))]).toEqual(['./semops_wasm_bg.js'])
    const unreviewed = [...new Set(imports.map((i) => importKind(i.name)))].filter((k) => !REVIEWED_IMPORTS.has(k))
    expect(unreviewed, 'new capabilities the engine asks the page for; read their glue before upgrading').toEqual([])
    expect(existsSync(pkg('semops-wasm', 'snippets'))).toBe(false)
  })

  it('has glue that names no network API', () => {
    const glue = code(readFileSync(BROWSER_GLUE, 'utf8'))
    expect(glue).toContain('globalThis.crypto.getRandomValues')
    expect(glue.match(NETWORK_APIS)?.[0]).toBeUndefined()
  })

  it('carries none of the server telemetry or HTTP crates', () => {
    const binary = readFileSync(BROWSER_WASM).toString('latin1').toLowerCase()
    expect(SERVER_ONLY.filter((name) => binary.includes(name))).toEqual([])
  })

  it('runs no install-time scripts', () => {
    for (const name of ['semops-wasm', 'semops-wasm-node']) {
      const manifest = JSON.parse(readFileSync(pkg(name, 'package.json'), 'utf8')) as { scripts?: object }
      expect(manifest.scripts ?? {}, name).toEqual({})
    }
  })
})

describe('semops-wasm does not reach out when asked to', () => {
  const ELSEWHERE = 'https://elsewhere.example/sparql'
  const DATA = '@prefix ex: <http://ex/> . ex:a a ex:T ; ex:p 1 .'
  const fetchSpy = vi.fn(() => Promise.reject(new Error('the engine called fetch')))

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchSpy.mockClear()
  })

  const store = () => {
    vi.stubGlobal('fetch', fetchSpy)
    const s = new semops.Store()
    s.loadTurtle(DATA)
    return s
  }

  it('refuses SERVICE in an ordinary query', () => {
    const s = store()
    try {
      expect(() => s.query(`SELECT * WHERE { SERVICE <${ELSEWHERE}> { ?s ?p ?o } }`)).toThrow(/not supported/)
    } finally {
      s.free()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('hands a federated query back to the host rather than fetching it', () => {
    const s = store()
    try {
      const { pending } = s.queryFederated(`SELECT * WHERE { SERVICE <${ELSEWHERE}> { ?s ?p ?o } }`) as {
        pending: { endpoint: string }[]
      }
      // federation.ts decides whether to call it, against its allow-list.
      expect(pending.map((p) => p.endpoint)).toEqual([ELSEWHERE])
    } finally {
      s.free()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses LOAD of a remote document', () => {
    const s = store()
    try {
      expect(() => s.update('LOAD <https://elsewhere.example/data.ttl>')).toThrow(/remote fetch is not enabled/)
    } finally {
      s.free()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // A shapes graph is content someone else may have written, and under the rules modes it is
  // a program the engine runs. Each place it can carry a query is checked.
  const SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ex: <http://ex/> .\n`
  const REMOTE = `SERVICE <${ELSEWHERE}> { $this ?p ?o }`

  it.each([
    ['a constraint', `ex:S a sh:NodeShape ; sh:targetClass ex:T ;
       sh:sparql [ sh:select "SELECT $this WHERE { ${REMOTE} }" ] .`, 'none'],
    ['a SPARQL target', `ex:S a sh:NodeShape ;
       sh:target [ a sh:SPARQLTarget ; sh:select "SELECT ?this WHERE { ${REMOTE.replace(/\$this/g, '?this')} }" ] ;
       sh:property [ sh:path ex:p ; sh:minCount 1 ] .`, 'none'],
    ['a rule, run once', `ex:S a sh:NodeShape ; sh:targetClass ex:T ;
       sh:rule [ a sh:SPARQLRule ; sh:construct "CONSTRUCT { $this <http://ex/q> ?o } WHERE { ${REMOTE} }" ] .`, 'rules'],
    ['a rule, iterated', `ex:S a sh:NodeShape ; sh:targetClass ex:T ;
       sh:rule [ a sh:SPARQLRule ; sh:construct "CONSTRUCT { $this <http://ex/q> ?o } WHERE { ${REMOTE} }" ] .`, 'rules-iterated'],
  ])('refuses SERVICE in %s of a shapes graph', (_where, shapes, inference) => {
    vi.stubGlobal('fetch', fetchSpy)
    expect(() => semops.Validator.fromTurtle(SHAPES + shapes).validateTurtle(DATA, undefined, inference)).toThrow(
      /SERVICE cannot be combined/,
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
