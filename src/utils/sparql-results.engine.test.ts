/**
 * The term shapes the engine actually produces, put through the encoder that receives them.
 *
 * `sparql-results.test.ts` builds terms with n3's DataFactory, which is the right way to test the
 * encoder's own logic and cannot catch the engine and the encoder disagreeing about what a term
 * looks like. That disagreement is exactly what broke the results pane on the course's q64: the
 * engine reported a triple term as `termType: 'Quad'` with no subject, predicate or object, the
 * encoder read `.subject` of `undefined`, and nothing failed until somebody ran the query.
 *
 * So this runs the real engine -- `holos-wasm-node`, the same WebAssembly binary the browser
 * loads, with Node glue instead of browser glue -- and asserts on what comes back. It is a
 * contract test, and what it protects is the boundary rather than either side of it.
 */
import { describe, expect, it } from 'vitest'
import { Store } from 'holos-wasm-node'
import { formatResultTerm, resultVars, termToResult, type ResultRow } from './sparql-results'

/** A SELECT row as the engine returns it, encoded as the results pane encodes it. */
function rowsFor(turtle: string, query: string): { vars: string[]; rows: ResultRow[] } {
  const store = new Store()
  store.load(turtle, 'turtle', 'https://example.org/')
  const out = store.query(query, undefined) as Array<Record<string, unknown>>
  const vars = resultVars(out)
  const rows = out.map(row => {
    const encoded: ResultRow = {}
    for (const v of vars) if (row[v]) encoded[v] = termToResult(row[v] as never)
    return encoded
  })
  return { vars, rows }
}

const EX = 'https://example.org/'
/** The data's prefixes do not reach the query, so each needs its own. */
const Q = `PREFIX ex: <${EX}> `
const data = (body: string) => `@prefix ex: <${EX}> .\n${body}\n`

const LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'

describe('the engine and the encoder agree on', () => {
  it('an IRI, a blank node and a plain literal', () => {
    const { rows } = rowsFor(
      data('ex:a ex:p ex:b ; ex:q "plain" ; ex:r [ ex:inner "x" ] .'),
      `${Q} SELECT ?o WHERE { ex:a ?p ?o }`,
    )
    expect(rows.map(r => r.o.type).sort()).toEqual(['bnode', 'literal', 'uri'])
  })

  it('a language-tagged literal, with its tag', () => {
    const { rows } = rowsFor(data('ex:a ex:p "hello"@en .'), `${Q} SELECT ?o WHERE { ?s ?p ?o }`)
    // `datatype` as well as `xml:lang`: redundant by the results format, and the convention this
    // encoder already had a unit test for, so the engine's own rdf:langString has to survive it.
    expect(rows[0].o).toEqual({
      type: 'literal',
      value: 'hello',
      'xml:lang': 'en',
      datatype: LANG_STRING,
    })
  })

  it('a base direction, which only arrives from holos-wasm 0.19.0', () => {
    const { rows } = rowsFor(
      data('ex:a ex:p "hallo"@de--ltr .'),
      `${Q} SELECT ?o WHERE { ?s ?p ?o }`,
    )
    expect(rows[0].o).toMatchObject({ type: 'literal', 'xml:lang': 'de', 'its:dir': 'ltr' })
    // And the table cell shows it, which is the reason the field is carried at all.
    expect(formatResultTerm(rows[0].o)).toBe('hallo@de--ltr')
  })

  it('a literal with no direction, which must not grow an empty one', () => {
    // The engine sends `direction: ""` rather than omitting it. An encoder treating that as
    // present would put `its:dir: ""` on every plain literal in every result.
    const { rows } = rowsFor(data('ex:a ex:p "plain" .'), `${Q} SELECT ?o WHERE { ?s ?p ?o }`)
    expect(rows[0].o).toEqual({ type: 'literal', value: 'plain' })
  })

  it('a typed literal, keeping the datatype and dropping xsd:string', () => {
    const { rows } = rowsFor(
      data('ex:a ex:n 42 ; ex:s "text"^^<http://www.w3.org/2001/XMLSchema#string> .'),
      `${Q} SELECT ?n ?s WHERE { ?x ex:n ?n ; ex:s ?s }`,
    )
    expect(rows[0].n).toEqual({
      type: 'literal',
      value: '42',
      datatype: 'http://www.w3.org/2001/XMLSchema#integer',
    })
    expect(rows[0].s).toEqual({ type: 'literal', value: 'text' })
  })

  // The one that was broken, and the only case here that the published engine does not yet
  // satisfy: holos-wasm 0.19.0 reports a triple term as `termType: 'Quad'` with the whole
  // `<<( ... )>>` text in `value` and no parts, so this asserts a contract that arrives with
  // 0.20.0. Unskip it with the dependency bump -- it passes against a 0.20.0 build today, and
  // against 0.19.0 it fails on the fallback shape rather than the TypeError it used to throw.
  it.skip('a triple term, decomposed into terms the encoder can read', () => {
    const { rows } = rowsFor(
      data('ex:who ex:said <<( ex:a ex:p "x" )>> .'),
      `${Q} SELECT ?statement WHERE { ?who ex:said ?statement }`,
    )
    expect(rows[0].statement).toEqual({
      type: 'triple',
      value: {
        subject: { type: 'uri', value: `${EX}a` },
        predicate: { type: 'uri', value: `${EX}p` },
        object: { type: 'literal', value: 'x' },
      },
    })
    expect(formatResultTerm(rows[0].statement)).toBe(`<<( ${EX}a ${EX}p x )>>`)
  })

  it('the projected variables, including one no row binds', () => {
    const { vars, rows } = rowsFor(
      data('ex:a ex:p "x" .'),
      `${Q} SELECT ?s ?nothing WHERE { ?s ex:p ?o }`,
    )
    expect(vars).toEqual(['s', 'nothing'])
    expect(rows).toHaveLength(1)
    expect(rows[0].nothing).toBeUndefined()
  })

  it('the columns of a result with no rows at all', () => {
    const { vars, rows } = rowsFor(
      data('ex:a ex:p "x" .'),
      `${Q} SELECT ?a ?b WHERE { ?a ex:q ?b }`,
    )
    expect(vars).toEqual(['a', 'b'])
    expect(rows).toEqual([])
  })
})
