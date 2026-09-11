import { describe, expect, it } from 'vitest'
import { DataFactory, Parser } from 'n3'
import { formatResultTerm, quadsToTurtle, resultTermLexical, termToResult } from './sparql-results'

const { namedNode, blankNode, literal, quad } = DataFactory

describe('termToResult', () => {
  it('encodes a named node as uri', () => {
    expect(termToResult(namedNode('http://ex/a'))).toEqual({ type: 'uri', value: 'http://ex/a' })
  })

  it('encodes a blank node as bnode', () => {
    expect(termToResult(blankNode('b0'))).toEqual({ type: 'bnode', value: 'b0' })
  })

  it('omits xsd:string as a datatype', () => {
    expect(termToResult(literal('plain'))).toEqual({ type: 'literal', value: 'plain' })
  })

  it('keeps a non-string datatype', () => {
    const t = literal('42', namedNode('http://www.w3.org/2001/XMLSchema#integer'))
    expect(termToResult(t)).toEqual({
      type: 'literal',
      value: '42',
      datatype: 'http://www.w3.org/2001/XMLSchema#integer',
    })
  })

  it('carries a language tag as xml:lang', () => {
    expect(termToResult(literal('hello', 'en'))).toEqual({
      type: 'literal',
      value: 'hello',
      'xml:lang': 'en',
      datatype: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString',
    })
  })

  it('carries an RDF 1.2 text direction as its:dir', () => {
    const [q] = new Parser().parse('<http://s> <http://p> "البحر"@ar--rtl .')
    expect(termToResult(q.object)).toMatchObject({
      type: 'literal',
      value: 'البحر',
      'xml:lang': 'ar',
      'its:dir': 'rtl',
      datatype: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString',
    })
  })

  it('encodes a triple term as type triple with nested terms', () => {
    const [q] = new Parser().parse(
      '<http://src> <http://disputes> <<( <http://shop> <http://founded> "1921" )>> .',
    )
    expect(termToResult(q.object)).toEqual({
      type: 'triple',
      value: {
        subject: { type: 'uri', value: 'http://shop' },
        predicate: { type: 'uri', value: 'http://founded' },
        object: { type: 'literal', value: '1921' },
      },
    })
  })
})

describe('formatResultTerm', () => {
  it('renders an empty cell for an unbound variable', () => {
    expect(formatResultTerm(undefined)).toBe('')
  })

  it('shows a language tag', () => {
    expect(formatResultTerm({ type: 'literal', value: 'hello', 'xml:lang': 'en' })).toBe('hello@en')
  })

  it('shows a direction after the language tag', () => {
    expect(
      formatResultTerm({ type: 'literal', value: 'x', 'xml:lang': 'ar', 'its:dir': 'rtl' }),
    ).toBe('x@ar--rtl')
  })

  it('renders a triple term in RDF 1.2 Turtle syntax', () => {
    expect(
      formatResultTerm({
        type: 'triple',
        value: {
          subject: { type: 'uri', value: 'http://shop' },
          predicate: { type: 'uri', value: 'http://founded' },
          object: { type: 'literal', value: '1921' },
        },
      }),
    ).toBe('<<( http://shop http://founded 1921 )>>')
  })
})

describe('resultTermLexical', () => {
  it('drops the language tag for CSV', () => {
    expect(resultTermLexical({ type: 'literal', value: 'hello', 'xml:lang': 'en' })).toBe('hello')
  })

  it('still renders a triple term, which has no lexical form', () => {
    const t = {
      type: 'triple' as const,
      value: {
        subject: { type: 'uri' as const, value: 's' },
        predicate: { type: 'uri' as const, value: 'p' },
        object: { type: 'uri' as const, value: 'o' },
      },
    }
    expect(resultTermLexical(t)).toBe('<<( s p o )>>')
  })
})

describe('quadsToTurtle', () => {
  const a = quad(namedNode('http://ex/a'), namedNode('http://ex/p'), literal('x'))
  const b = quad(namedNode('http://ex/b'), namedNode('http://ex/p'), literal('y'))

  it('collapses duplicate triples, as a CONSTRUCT result is a graph', async () => {
    const out = await quadsToTurtle([a, b, a, quad(a.subject, a.predicate, a.object), b])
    expect(out.match(/"x"/g)).toHaveLength(1)
    expect(out.match(/"y"/g)).toHaveLength(1)
  })

  it('applies the given prefixes', async () => {
    const out = await quadsToTurtle([a], { ex: 'http://ex/' })
    expect(out).toContain('@prefix ex: <http://ex/>')
    expect(out).toContain('ex:a ex:p "x"')
    expect(out).not.toContain('<http://ex/a>')
  })

  it('writes full IRIs when no prefixes are given', async () => {
    const out = await quadsToTurtle([a])
    expect(out).toContain('<http://ex/a> <http://ex/p> "x"')
  })

  it('keeps triple terms in RDF 1.2 syntax', async () => {
    const quads = new Parser().parse(
      '_:r <http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies> <<( <http://shop> <http://founded> "1921" )>> .',
    )
    const out = await quadsToTurtle(quads, { rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' })
    expect(out).toContain('rdf:reifies <<(<http://shop> <http://founded> "1921")>>')
  })

  describe('prefix header', () => {
    const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
    const XSD = 'http://www.w3.org/2001/XMLSchema#'

    it('declares only the prefixes the body uses', async () => {
      const out = await quadsToTurtle([a], { ex: 'http://ex/', foaf: 'http://xmlns.com/foaf/0.1/' })
      expect(out).toContain('@prefix ex: <http://ex/>')
      expect(out).not.toContain('@prefix foaf:')
      expect(out.startsWith('@prefix')).toBe(true)
    })

    it('keeps a prefix used only as a datatype or inside a triple term', async () => {
      const quads = new Parser().parse(
        `_:r <${RDF}reifies> <<( <http://shop> <http://founded> "1921"^^<${XSD}gYear> )>> .`,
      )
      const out = await quadsToTurtle(quads, { rdf: RDF, xsd: XSD, ex: 'http://ex/' })
      expect(out).toContain('@prefix rdf:')
      expect(out).toContain('@prefix xsd:')
      expect(out).not.toContain('@prefix ex:')
    })

    it('does not count abbreviations the writer makes itself', async () => {
      // rdf:type is written as `a` and an xsd:integer as a bare number, so
      // neither namespace appears in the body.
      const quads = new Parser().parse('<http://ex/a> a <http://ex/T> ; <http://ex/n> 42 .')
      const out = await quadsToTurtle(quads, { rdf: RDF, xsd: XSD, ex: 'http://ex/' })
      expect(out).toContain('ex:a a ex:T')
      expect(out).toContain('ex:n 42')
      expect(out).not.toContain('@prefix rdf:')
      expect(out).not.toContain('@prefix xsd:')
    })

    it('is not fooled by a prefix that ends another prefix', async () => {
      const quads = new Parser().parse('<http://ex/a> <http://www.w3.org/2000/01/rdf-schema#label> "x" .')
      const out = await quadsToTurtle(quads, {
        rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
        s: 'http://other/',
      })
      expect(out).toContain('rdfs:label')
      expect(out).not.toContain('@prefix s:')
    })

    it('handles the empty prefix and does not mistake blank nodes for it', async () => {
      const used = await quadsToTurtle([a], { '': 'http://ex/' })
      expect(used).toContain('@prefix : <http://ex/>')
      expect(used).toContain(':a :p "x"')

      const onlyBlank = quadsToTurtle(
        [quad(blankNode('b'), namedNode('http://other/p'), literal('x'))],
        { '': 'http://ex/' },
      )
      expect(await onlyBlank).not.toContain('@prefix :')
    })

    it('leaves no header for an empty result', async () => {
      expect(await quadsToTurtle([], { ex: 'http://ex/' })).toBe('')
    })
  })
})
