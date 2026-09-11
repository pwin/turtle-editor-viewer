import { describe, expect, it } from 'vitest'
import { RDFParser } from './rdf-parser'

// The shape a CONSTRUCT over RDF 1.2 annotations produces: the reifier is a
// labelled blank node that is a subject and never an object, so it is one of
// the top-level subjects offered for the diagram.
const RESULT = `@prefix bs: <https://example.org/bookshop-trail/schema#>.
@prefix bt: <https://example.org/bookshop-trail/>.
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

bt:shop-ex-libris bs:founded "1919"^^xsd:gYear.
_:g_00 rdf:reifies <<(bt:shop-ex-libris bs:founded "1919"^^xsd:gYear)>>;
    bs:claimedBy bt:source-national-register;
    bs:confidence 0.99.
`

describe('RDFParser blank node subjects', () => {
  it('lists a top-level labelled blank node under its document label', async () => {
    const { subjects, error } = await new RDFParser().parseRDF(RESULT, 'turtle')
    expect(error).toBeUndefined()
    expect(subjects).toEqual(['bt:shop-ex-libris', 'g_00'])
  })

  it('gives the same ids when the same text is parsed again', async () => {
    // Two parses, as happens when the SPARQL panel pre-selects a result's
    // subjects and EditorPane then parses the new tab: the selection must
    // still match. n3's default b<N>_ prefix differs per parser instance.
    const first = await new RDFParser().parseRDF(RESULT, 'turtle')
    const second = await new RDFParser().parseRDF(RESULT, 'turtle')
    expect(second.subjects).toEqual(first.subjects)

    const reifier = (r: typeof first) => r.quads.find(q => q.subject.termType === 'BlankNode')!
    expect(reifier(second).subject.value).toBe(reifier(first).subject.value)
  })

  it('does not merge a labelled blank node with an anonymous one', async () => {
    const doc = '_:b0 <http://p> "labelled" . [] <http://p> "anonymous" .'
    const { quads } = await new RDFParser().parseRDF(doc, 'turtle')
    const ids = new Set(quads.map(q => q.subject.value))
    expect(ids.size).toBe(2)
    expect(ids.has('b0')).toBe(true)
    expect(ids.has('anon-0')).toBe(true)
  })

  it('numbers anonymous blank nodes per parse, in document order', async () => {
    // Two top-level [] subjects, as owl:AllDisjointClasses axioms are written,
    // plus a nested [ ... ] that is an object and so not a top-level subject.
    const doc = `
      [] a <http://A> .
      [] a <http://B> .
      <http://s> <http://p> [ <http://q> "x" ] .`
    const first = await new RDFParser().parseRDF(doc, 'turtle')
    const second = await new RDFParser().parseRDF(doc, 'turtle')
    expect(first.subjects).toEqual(['anon-0', 'anon-1', 'http://s'])
    expect(second.subjects).toEqual(first.subjects)
    const nested = first.quads.find(q => q.object.termType === 'BlankNode')!
    expect(nested.object.value).toBe('anon-2')
  })
})
