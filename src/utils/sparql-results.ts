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
 * The variables a SELECT result's `head.vars` must name, in projection order.
 *
 * The rows cannot answer this on their own. An unbound variable is absent from a row rather
 * than null, so a variable unbound in *every* row is invisible in the rows, and a result with
 * no rows at all still has columns -- while `head.vars` lists every projected variable either
 * way. holosdb says so directly: a SELECT result array carries `variables`, the projection as
 * the engine parsed it, which cannot disagree with how the query was evaluated the way a
 * second reading of the query text can.
 *
 * The row scan behind it is for a result that does not carry them, and gets the order right
 * for the same reason -- a row is built in the query's own variable order -- but can only name
 * variables some row bound.
 */
export function resultVars(result: readonly Record<string, unknown>[]): string[] {
  const declared = (result as { variables?: unknown }).variables
  if (Array.isArray(declared) && declared.every((v) => typeof v === 'string')) {
    return declared as string[]
  }

  const seen: string[] = []
  for (const row of result) {
    for (const name of Object.keys(row)) if (!seen.includes(name)) seen.push(name)
  }
  return seen
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
 * The result of a CONSTRUCT is a graph, so a set of triples, and holosdb
 * returns one: duplicate instantiations of the template are already
 * collapsed, which was the measured difference from Comunica on five of the
 * course's queries. Collecting into a store anyway costs a single pass and
 * keeps deduplication a property of this function rather than of whichever
 * engine is behind it. The editor's prefixes
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
