import { describe, expect, it } from 'vitest'
import { DataFactory, Parser } from 'n3'
import type { RDFQuad } from '@/types'
import { RDFParser } from './rdf-parser'
import { describeLoadFailure, findRelativeIris } from './relative-iri'

const { namedNode, literal, quad } = DataFactory

/** n3 accepts a relative IRI, which is how one reaches the engines at all. */
const parseRaw = (turtle: string): RDFQuad[] => new Parser().parse(turtle) as unknown as RDFQuad[]

describe('findRelativeIris', () => {
  it('finds none in an absolute graph', () => {
    expect(findRelativeIris(parseRaw('<http://ex/a> <http://ex/p> <http://ex/b> .'))).toEqual([])
  })

  it('finds one in any position', () => {
    expect(findRelativeIris(parseRaw('<a> <http://ex/p> <http://ex/b> .'))).toEqual(['a'])
    expect(findRelativeIris(parseRaw('<http://ex/a> <p> <http://ex/b> .'))).toEqual(['p'])
    expect(findRelativeIris(parseRaw('<http://ex/a> <http://ex/p> <b> .'))).toEqual(['b'])
  })

  it('ignores blank nodes and literal text that looks relative', () => {
    const quads = parseRaw('_:b0 <http://ex/p> "hasChild" . <http://ex/a> <http://ex/p> "_:b1" .')
    expect(findRelativeIris(quads)).toEqual([])
  })

  it("checks a literal's datatype, which is an IRI", () => {
    const quads = [quad(namedNode('http://ex/a'), namedNode('http://ex/p'), literal('1', namedNode('myType')))]
    expect(findRelativeIris(quads as unknown as RDFQuad[])).toEqual(['myType'])
  })

  it('looks inside an RDF 1.2 triple term', () => {
    const quads = parseRaw('<http://ex/s> <http://ex/p> <<( <http://ex/a> <relativePredicate> "x" )>> .')
    expect(findRelativeIris(quads)).toEqual(['relativePredicate'])
  })

  it('reports each term once and stops at the limit', () => {
    const quads = parseRaw('<a> <p> <b> . <a> <p> <c> . <a> <p> <d> .')
    expect(findRelativeIris(quads)).toEqual(['a', 'p', 'b', 'c', 'd'])
    expect(findRelativeIris(quads, 2)).toHaveLength(2)
  })
})

describe('describeLoadFailure', () => {
  const engineError = new Error('loading RDF: RDF parse error: Parser error at line 1 between columns 1 and 14')

  it('names the relative IRIs and what to do, keeping the engine text', () => {
    const message = describeLoadFailure(engineError, parseRaw('<http://ex/a> <hasChild> <http://ex/b> .'))
    expect(message).toContain('<hasChild>')
    expect(message).toContain('no scheme')
    expect(message).toContain('@base')
    expect(message).toContain('Parser error at line 1')
  })

  it('agrees with itself about singular and plural', () => {
    expect(describeLoadFailure(engineError, parseRaw('<a> <http://ex/p> <http://ex/b> .'))).toContain('an IRI with no scheme')
    expect(describeLoadFailure(engineError, parseRaw('<a> <p> <http://ex/b> .'))).toContain('IRIs with no scheme')
  })

  it('leaves a failure with another cause as it was', () => {
    const other = new Error('out of memory')
    expect(describeLoadFailure(other, parseRaw('<http://ex/a> <http://ex/p> <http://ex/b> .'))).toBe('out of memory')
  })
})

describe('the parsers resolve relative IRIs, so this net is never reached', () => {
  const absolute = async (text: string, language: 'turtle' | 'javascript') => {
    const result = await new RDFParser().parseRDF(text, language)
    expect(result.error).toBeUndefined()
    expect(result.quads.length).toBeGreaterThan(0)
    return findRelativeIris(result.quads)
  }

  it('Turtle: a relative predicate gets the base', async () => {
    expect(await absolute('<http://ex/a> <hasChild> <http://ex/b> .', 'turtle')).toEqual([])
  })

  it('Turtle: an empty @base is still resolved', async () => {
    expect(await absolute('@base <> .\n<a> <b> <c> .', 'turtle')).toEqual([])
  })

  it('JSON-LD: a relative @base and @id are resolved too', async () => {
    // Left to itself this parser resolves against a placeholder scheme and
    // strips it again, which produced terms the engines refuse.
    const doc = '{"@context":{"@base":"","p":"http://ex/p"},"@id":"a","p":{"@id":"b"}}'
    expect(await absolute(doc, 'javascript')).toEqual([])
  })
})
