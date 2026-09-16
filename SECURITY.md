# Security

The Turtle Editor Viewer is a static, single-page web application. It is designed to be usable with data that must not leave the user's machine, and to be deployable on a network with no route to the internet. This document records the threat model, the controls in place, and how to verify them. The plain-English version for users is section 8 of [USER_GUIDE.md](USER_GUIDE.md).

## Threat model

Two things are untrusted:

1. **RDF content**: anything typed, pasted, opened from disk, or fetched from a URL, including URLs carried in a link (`?dot=`, `?rdfa=`, `?shapes=`). It may be crafted by an attacker who wants to run code in the app's origin or to exfiltrate what the user has loaded.
2. **The network**: the app must not contact any server the user has not explicitly named, and must not depend on any third-party host to function.

Out of scope: the browser itself, the web server hosting the app, and the SPARQL endpoints a user chooses to query with `SERVICE`.

## Network posture

**The app makes no network requests of its own.** Every asset it needs (JavaScript, CSS, fonts, the Monaco editor, viz.js, the SHACL WebAssembly engine) is served from the deployed folder on the same origin.

Outbound requests happen only when the user asks for them:

| Trigger | What is sent | To where |
|---|---|---|
| *Load URL*, `?dot=`, `?rdfa=`, `?shapes=` | A GET for that URL | The address given |
| `SERVICE <endpoint>` in a query the user runs | The `SERVICE` pattern and the bindings needed to evaluate it | The endpoint named |

Implicit requests that libraries would otherwise make have been removed:

- **prefix.cc lookups** (`@jeswr/prefixcc`, a dependency of Comunica's SHACL-Compact serialiser, which this app never invokes) are replaced at build time by a stub that rejects ([vite.config.ts](vite.config.ts), [src/stubs/prefixcc.ts](src/stubs/prefixcc.ts)). The fetch code is not in the bundle.
- **Remote JSON-LD contexts** are refused by a `documentLoader` that rejects ([src/services/rdf-parser.ts](src/services/rdf-parser.ts)); a document referencing one gets an error asking for the context inline.
- **Monaco** is self-hosted from `public/monaco/vs` ([scripts/setup-monaco.mjs](scripts/setup-monaco.mjs)); `@monaco-editor/react`'s default CDN path is overridden in [MonacoEditorComponent.tsx](src/components/editor/MonacoEditorComponent.tsx). The CSP would refuse the CDN script anyway.
- **The SHACL engine** rejects `SERVICE` inside `sh:sparql` constraints (engine behaviour, verified), so a shapes graph cannot cause a request.

No analytics, telemetry, error reporting, cookies or local storage.

## Content Security Policy

[index.html](index.html) carries:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
worker-src 'self' blob:;
connect-src 'self' https: http:;
object-src 'none';
base-uri 'self';
form-action 'none'
```

- `script-src 'self'`: no inline scripts, no `javascript:` URLs, no `eval`/`new Function`. `'wasm-unsafe-eval'` allows WebAssembly compilation (the SHACL engine) without allowing JavaScript eval.
- `connect-src 'self' https: http:` is what `SERVICE` and *Load URL* need. Deployments that want an allow-list should send a `Content-Security-Policy` header with a narrower `connect-src`; the browser enforces the intersection of the header and the meta policy.
- `style-src 'unsafe-inline'`, `font-src data:` and `worker-src blob:` are what Monaco needs (injected styles, an embedded icon font, blob-bootstrapped workers). None of these permits script execution.
- `frame-ancestors` cannot be set from a meta tag; add it in the server header if clickjacking is a concern.

Verified in headless Edge: the app loads, renders Monaco and a Graphviz diagram with zero policy violations; a probe page confirmed `eval` is refused and WebAssembly compiles only with `'wasm-unsafe-eval'` present.

## Data cannot execute

All rendering of data-derived text is by `textContent` or escaped interpolation:

- Graphviz node ids and labels are DOT-quoted; no `URL=`/`href=` attributes are emitted, so the SVG contains no links. Node clicks are handled from the node's `<title>` (XML-escaped by Graphviz). Regression tests in [graph-generator.test.ts](src/services/graph-generator.test.ts) feed percent-encoded, quote-closing and attribute-injecting payloads through the generator.
- The `innerHTML` templates in [GraphVisualization.tsx](src/components/graph/GraphVisualization.tsx) pass DOT text, Graphviz text output and error strings through [escapeHtml](src/utils/html.ts).
- The reasoner's results window fills data via `textContent` only ([hylar-reasoner.ts](src/services/hylar-reasoner.ts)).
- SPARQL results and the SHACL report are React-rendered.

## Dependencies

`package.json` lists only what the source imports (verified by scanning for import specifiers). `npm audit` reports two advisories, both DOMPurify as pinned inside `monaco-editor`'s own bundle; the affected APIs (`IN_PLACE`, `CUSTOM_ELEMENT_HANDLING`, `setConfig`/`clearConfig`) are not how Monaco calls it, and the only markdown Monaco sanitises here is the app's own static completion text. Only a Monaco release can move it.

Known limitation: `hylar-core` (the OWL 2 RL reasoner) evaluates rule comparison operators with `eval`. The shipped rule set contains no such operators and the app passes no rules of its own, so the path is unreachable, and the CSP would refuse it if reached. Do not add user-supplied rules on top of Hylar.

## How to verify

```sh
npm audit                                   # dependency advisories
npm run build
grep -l "prefix.cc" dist/assets/*.js        # only the stub's error message should match
grep -ohE "https?://[a-z0-9.-]+\.[a-z]{2,}" dist/assets/*.js | sort | uniq -c | sort -rn
                                            # hostnames in the bundle: identifiers and comments, not fetch targets
grep -c "Content-Security-Policy" dist/index.html
npx vitest run                              # includes the injection regression tests
```

For a runtime check, serve `dist/` (`npm run preview`) and load it in a browser with the console open: any policy violation appears as a "Refused to …" message. In headless Edge or Chrome, `--enable-logging=stderr --log-level=0 --dump-dom <url>` captures the same messages.

## Reporting

Report a security concern by opening an issue on the repository, or privately to the maintainer if it is exploitable before a fix is public.
