/**
 * Stands in for `@jeswr/prefixcc` (vite.config.ts aliases the package here).
 *
 * The real module looks prefixes up at https://prefix.cc over the network. It
 * arrives through Comunica's SHACL Compact serialiser (`shaclc-write`), which
 * this app never invokes, so the lookup could never run; the alias makes that
 * a guarantee rather than an observation. The fetch code is not in the bundle
 * at all, and a call, should one ever appear, fails with a clear message
 * instead of reaching out.
 */

const DISABLED = 'prefix.cc lookups are disabled: this app makes no network requests of its own.'

export function uriToPrefix(): Promise<never> {
  return Promise.reject(new Error(DISABLED))
}

export function prefixToUri(): Promise<never> {
  return Promise.reject(new Error(DISABLED))
}

export function lookupAllPrefixes(): Promise<never> {
  return Promise.reject(new Error(DISABLED))
}
