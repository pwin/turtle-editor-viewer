import { beforeAll, describe, expect, it } from 'vitest'
import { RDFParser } from './rdf-parser'
import { HylarReasoner } from './hylar-reasoner'

// The reasoner looks for a page-level hylarCore before importing the package.
beforeAll(() => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
})

const DATA = `PREFIX : <http://ex/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
:Shop rdfs:subClassOf :Business .
:x a :Shop .
:x :founded "1921" {| :by :src |} .
:y :label "مرحبا"@ar--rtl .`

describe('HylarReasoner with RDF 1.2 terms', () => {
  it('lists explicit triples with triple terms and text direction intact, and still infers', async () => {
    const { quads } = await new RDFParser().parseRDF(DATA, 'turtle')
    const result = await HylarReasoner.performReasoning(quads)
    expect(result.error).toBeUndefined()

    expect(result.explicitTriples).toContain(
      '_:anon-0 <http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies> <<( <http://ex/x> <http://ex/founded> "1921" )>> .',
    )
    expect(result.explicitTriples).toContain('<http://ex/y> <http://ex/label> "مرحبا"@ar--rtl .')
    expect(result.implicitTriples).toContain(
      '<http://ex/x> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://ex/Business> .',
    )
  }, 30000)
})
