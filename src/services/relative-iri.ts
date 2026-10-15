import type { RDFQuad, RDFTerm } from '@/types'

/**
 * Explains the one graph the engines refuse outright.
 *
 * Both the SPARQL store and the SHACL validator reject a whole document that
 * contains an IRI with no scheme, with a parse error naming a line in text the
 * user never wrote -- the N-Quads this app generated. n3, meanwhile, accepts a
 * relative IRI without complaint. So a single `<hasChild>` could cost every
 * query over the document, and the message said only "RDF parse error".
 *
 * `RDFParser` resolves relative IRIs against `BASE_IRI` in every syntax, which
 * is where this is actually prevented. This is the net under that: it costs a
 * scan only when a load has already failed, and it names the terms, so a path
 * that gets one through produces a sentence a reader can act on instead of a
 * line number.
 */

/** An absolute IRI begins with a scheme; a blank node and a literal are not IRIs. */
const hasScheme = (value: string) => /^[a-z][a-z0-9+.-]*:/i.test(value)

function relativeInTerm(term: RDFTerm, found: Set<string>): void {
  switch (term.termType) {
    case 'NamedNode':
      if (!hasScheme(term.value)) found.add(term.value)
      return
    case 'Quad':
      // An RDF 1.2 triple term: its own three terms are IRIs too.
      relativeInTerm(term.subject, found)
      relativeInTerm(term.predicate, found)
      relativeInTerm(term.object, found)
      return
    case 'Literal':
      // A literal's datatype is an IRI; its lexical form is not.
      if (term.datatype) relativeInTerm(term.datatype, found)
      return
    default:
      return
  }
}

/** Every relative IRI in the graph, in the order first met, at most `limit`. */
export function findRelativeIris(quads: RDFQuad[], limit = 5): string[] {
  const found = new Set<string>()
  for (const quad of quads) {
    for (const term of [quad.subject, quad.predicate, quad.object, quad.graph]) {
      if (term) relativeInTerm(term as RDFTerm, found)
    }
    if (found.size >= limit) break
  }
  return [...found].slice(0, limit)
}

/**
 * Re-describe a failure to load a graph, naming the relative IRIs in it when
 * that is what the engine was objecting to. Returns the original message
 * otherwise, since every other cause is already its own explanation.
 */
export function describeLoadFailure(error: unknown, quads: RDFQuad[]): string {
  const message = error instanceof Error ? error.message : String(error)
  const relative = findRelativeIris(quads)
  if (relative.length === 0) return message
  const listed = relative.map(iri => `<${iri}>`).join(', ')
  return (
    `The data could not be loaded because it contains ${relative.length === 1 ? 'an IRI' : 'IRIs'} ` +
    `with no scheme: ${listed}. The engines reject a whole graph that contains one. ` +
    'Give it a scheme, or add a @base or @prefix the document can resolve it against. ' +
    `(The engine said: ${message})`
  )
}
