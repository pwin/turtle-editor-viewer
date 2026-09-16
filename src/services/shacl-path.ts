/**
 * Renders a SHACL property path as a SPARQL property-path expression.
 *
 * A `sh:path` is only sometimes a plain IRI. SHACL also allows path
 * expressions encoded as blank-node structures: `[ sh:inversePath ex:p ]`,
 * `[ sh:oneOrMorePath rdfs:subClassOf ]`, an RDF list for a sequence,
 * `sh:alternativePath` for `|`. Reading such a node's value gives a blank
 * node label, which tells the reader nothing, so the structure is walked and
 * written out as `^ex:p`, `(rdfs:subClassOf)+`, `ex:a/ex:b` and so on.
 *
 * Ported from consolidated_ontology_suite_webapp/src/checks/pathExpression.ts.
 * Falls back to the raw value for anything unrecognised, so an unexpected
 * structure degrades the output rather than throwing.
 */

export interface PathTerm {
  termType: string
  value: string
}

export interface PathQuad {
  predicate: { value: string }
  object: PathTerm
}

const SH = 'http://www.w3.org/ns/shacl#'
const RDF_FIRST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'
const RDF_REST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'
const RDF_NIL = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'

/** `sh:<op>Path <inner>` and the SPARQL suffix that means the same. */
const PATH_SUFFIXES: [string, string][] = [
  [`${SH}zeroOrMorePath`, '*'],
  [`${SH}oneOrMorePath`, '+'],
  [`${SH}zeroOrOnePath`, '?'],
]

export function renderPathExpression<Q extends PathQuad>(
  node: PathTerm,
  bySubject: Map<string, Q[]>,
  depth = 0,
): string {
  // IRIs are written in angle brackets, as SPARQL does, so a display layer
  // can find and abbreviate them inside the expression.
  if (node.termType === 'NamedNode') return `<${node.value}>`
  if (node.termType !== 'BlankNode' || depth > 10) return node.value
  const quads = bySubject.get(node.value) ?? []
  const objectOf = (predicate: string): PathTerm | undefined =>
    quads.find(q => q.predicate.value === predicate)?.object

  for (const [operator, suffix] of PATH_SUFFIXES) {
    const inner = objectOf(operator)
    if (inner) return `(${renderPathExpression(inner, bySubject, depth + 1)})${suffix}`
  }
  const inverse = objectOf(`${SH}inversePath`)
  if (inverse) return `^(${renderPathExpression(inverse, bySubject, depth + 1)})`

  const alternative = objectOf(`${SH}alternativePath`)
  if (alternative) {
    return rdfList(alternative, bySubject, depth)
      .map(member => renderPathExpression(member, bySubject, depth + 1))
      .join('|')
  }

  // A sequence path is a bare RDF list.
  if (objectOf(RDF_FIRST)) {
    return rdfList(node, bySubject, depth)
      .map(member => renderPathExpression(member, bySubject, depth + 1))
      .join('/')
  }

  return node.value
}

/** Walks an RDF list into its members, bounded so a malformed or cyclic list cannot spin. */
function rdfList<Q extends PathQuad>(head: PathTerm, bySubject: Map<string, Q[]>, depth: number): PathTerm[] {
  const out: PathTerm[] = []
  let cursor: PathTerm | undefined = head
  for (let i = 0; cursor && cursor.value !== RDF_NIL && i < 100 && depth <= 10; i++) {
    const quads: Q[] = bySubject.get(cursor.value) ?? []
    const first = quads.find(q => q.predicate.value === RDF_FIRST)?.object
    if (!first) break
    out.push(first)
    cursor = quads.find(q => q.predicate.value === RDF_REST)?.object
  }
  return out
}
