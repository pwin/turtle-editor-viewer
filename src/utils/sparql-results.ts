import { Store, Writer } from 'n3'
import type { RDFQuad, RDFTerm } from '@/types'

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string'

/**
 * One bound value, in the shape of the SPARQL 1.2 Query Results JSON Format.
 *
 * A triple term is encoded as `type: "triple"` with a nested subject/predicate/
 * object, and a literal with an initial text direction carries `its:dir`
 * alongside `xml:lang`. Both come straight from the 1.2 results spec, so the
 * JSON export of a result set is interoperable with other 1.2 tooling.
 */
export type ResultTerm =
  | { type: 'uri'; value: string }
  | { type: 'bnode'; value: string }
  | {
      type: 'literal'
      value: string
      'xml:lang'?: string
      'its:dir'?: 'ltr' | 'rtl'
      datatype?: string
    }
  | {
      type: 'triple'
      value: { subject: ResultTerm; predicate: ResultTerm; object: ResultTerm }
    }

export type ResultRow = Record<string, ResultTerm>

/** Encode an RDF/JS term as a SPARQL 1.2 results JSON value. */
export function termToResult(term: RDFTerm): ResultTerm {
  switch (term.termType) {
    case 'NamedNode':
      return { type: 'uri', value: term.value }
    case 'BlankNode':
      return { type: 'bnode', value: term.value }
    case 'Literal': {
      const out: Extract<ResultTerm, { type: 'literal' }> = {
        type: 'literal',
        value: term.value,
      }
      if (term.language) out['xml:lang'] = term.language
      if (term.direction) out['its:dir'] = term.direction
      if (term.datatype && term.datatype.value !== XSD_STRING) {
        out.datatype = term.datatype.value
      }
      return out
    }
    case 'Quad':
      return {
        type: 'triple',
        value: {
          subject: termToResult(term.subject),
          predicate: termToResult(term.predicate),
          object: termToResult(term.object),
        },
      }
    default:
      // Variables and DefaultGraph never reach a result binding.
      return { type: 'literal', value: term.value }
  }
}

/**
 * Flatten a result value to one line for a table cell. Language-tagged
 * literals show their tag, including an RDF 1.2 direction (`@ar--rtl`), so a
 * query about text direction has something visible to point at. Triple terms
 * use the RDF 1.2 Turtle syntax so they read as what they are.
 */
export function formatResultTerm(term: ResultTerm | undefined): string {
  if (!term) return ''
  switch (term.type) {
    case 'uri':
    case 'bnode':
      return term.value
    case 'literal': {
      let text = term.value
      if (term['xml:lang']) {
        text += `@${term['xml:lang']}`
        if (term['its:dir']) text += `--${term['its:dir']}`
      }
      return text
    }
    case 'triple': {
      const { subject, predicate, object } = term.value
      return `<<( ${formatResultTerm(subject)} ${formatResultTerm(predicate)} ${formatResultTerm(object)} )>>`
    }
  }
}

/**
 * The bare lexical form, as the SPARQL CSV results format wants it: no
 * language tag or datatype. Triple terms have no lexical form of their own,
 * so they fall back to the Turtle rendering.
 */
export function resultTermLexical(term: ResultTerm | undefined): string {
  if (!term) return ''
  return term.type === 'triple' ? formatResultTerm(term) : term.value
}

/**
 * Serialise a CONSTRUCT or DESCRIBE result as Turtle.
 *
 * The result of a CONSTRUCT is a graph, so a set of triples, but the engine
 * streams one instantiation of the template per matching solution: a label
 * shared by several solutions arrives once per solution. Collecting the
 * stream into a store collapses those before writing. The editor's prefixes
 * are applied so the output reads like the data it was built from, triple
 * terms included, but only the ones the result actually uses are declared.
 */
export function quadsToTurtle(
  quads: RDFQuad[],
  prefixes: Record<string, string> = {},
): Promise<string> {
  const graph = new Store()
  for (const quad of quads) graph.addQuad(quad)
  return new Promise((resolve, reject) => {
    const writer = new Writer({ format: 'Turtle', prefixes })
    writer.addQuads(graph.getQuads(null, null, null, null))
    writer.end((error, result) =>
      error ? reject(error) : resolve(pruneUnusedPrefixes(result)),
    )
  })
}

/**
 * Drop `@prefix` lines the body never refers to. The writer declares every
 * prefix it is handed, and an editor's prefix list is usually far wider than
 * one result needs. This inspects the written text rather than the terms so
 * it stays in step with the writer's own abbreviations: `rdf:` is not in use
 * when the only rdf:type was written as `a`, nor `xsd:` when the only integer
 * was written bare.
 */
function pruneUnusedPrefixes(turtle: string): string {
  const lines = turtle.split('\n')
  const body = lines.filter(line => !line.startsWith('@prefix ')).join('\n')
  const kept = lines.filter(line => {
    const declared = /^@prefix ([^\s:]*):/.exec(line)
    if (!declared) return true
    const name = declared[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // A prefixed name starts at a line start or after a delimiter; the
    // character class rules out `_:b0` blank nodes and the tail of a longer
    // prefix such as the `s:` in `rdfs:label`.
    return new RegExp(`(^|[^A-Za-z0-9_.-])${name}:`, 'm').test(body)
  })
  return kept.join('\n').replace(/^\n+/, '')
}
