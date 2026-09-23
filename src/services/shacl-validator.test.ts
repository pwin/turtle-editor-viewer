import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { RDFParser } from './rdf-parser'
import { useShaclWasmSource } from './shacl-engine'
import { fillMessageTemplate, validateWithShapes } from './shacl-validator'

// Outside a browser there is no asset URL to fetch; read the binary from the package.
beforeAll(() => {
  useShaclWasmSource(() => readFile(join(process.cwd(), 'node_modules/shacl-wasm/shacl_wasm_bg.wasm')))
})

const parse = async (text: string) => {
  const result = await new RDFParser().parseRDF(text, 'turtle')
  expect(result.error).toBeUndefined()
  return result
}

const SHAPES = `
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://ex/> .

ex:PersonShape a sh:NodeShape ;
  sh:targetClass ex:Person ;
  sh:property [
    sh:path ex:name ;
    sh:minCount 1 ;
    sh:message "{$this} needs a name." ;
  ] ;
  sh:property [
    sh:path ex:age ;
    sh:datatype xsd:integer ;
  ] ;
  sh:property [
    sh:path [ sh:inversePath ex:employs ] ;
    sh:maxCount 1 ;
    sh:message "{$this} is employed more than once." ;
  ] .

ex:BigShop a sh:NodeShape ;
  sh:targetClass ex:Shop ;
  sh:sparql [
    sh:severity sh:Warning ;
    sh:message "A shop with more than 20 staff is unusual: {$this}." ;
    sh:select """
      PREFIX ex: <http://ex/>
      SELECT $this WHERE { $this ex:staff ?n . FILTER(?n > 20) }
    """ ;
  ] .
`

const GOOD = `
@prefix ex: <http://ex/> .
ex:alice a ex:Person ; ex:name "Alice" ; ex:age 40 .
ex:acme a ex:Shop ; ex:staff 5 ; ex:employs ex:alice .
`

const BAD = `
@prefix ex: <http://ex/> .
ex:bob a ex:Person ; ex:age "forty" .
ex:acme a ex:Shop ; ex:staff 50 ; ex:employs ex:bob .
ex:globex a ex:Shop ; ex:staff 3 ; ex:employs ex:bob .
`

describe('validateWithShapes', () => {
  it('reports conformance for clean data', async () => {
    const data = await parse(GOOD)
    const shapes = await parse(SHAPES)
    const report = await validateWithShapes(data.quads, shapes.quads)
    expect(report.conforms).toBe(true)
    expect(report.results).toEqual([])
    expect(report.shapeCount).toBeGreaterThan(0)
  })

  it('reports each problem with severity, filled-in message, named shape and rendered path', async () => {
    const data = await parse(BAD)
    const shapes = await parse(SHAPES)
    const report = await validateWithShapes(data.quads, shapes.quads, data.prefixes)
    expect(report.conforms).toBe(false)
    expect(report.prefixes).toEqual(data.prefixes)

    const messages = report.results.map(r => `${r.severity}: ${r.message}`)
    expect(messages).toContain('Violation: http://ex/bob needs a name.')
    expect(messages).toContain('Violation: http://ex/bob is employed more than once.')
    expect(messages).toContain('Warning: A shop with more than 20 staff is unusual: http://ex/acme.')

    const datatype = report.results.find(r => r.path === 'http://ex/age')!
    expect(datatype.severity).toBe('Violation')
    expect(datatype.value).toContain('forty')
    // No sh:message on that shape, so the component supplies one.
    expect(datatype.message).toBe('Does not satisfy sh:datatype')

    // Nested property shapes are named after the shape they sit in.
    const shapesNamed = report.results.map(r => r.sourceShape)
    expect(shapesNamed).toContain('http://ex/PersonShape › property 1')
    expect(shapesNamed).toContain('http://ex/PersonShape › property 2')

    // A path expression is written out, not left as a blank node label.
    const inverse = report.results.find(r => r.message.includes('employed'))!
    expect(inverse.path).toBe('^(<http://ex/employs>)')

    expect(report.counts).toEqual({ Violation: 3, Warning: 1, Info: 0 })
    // Violations sort before warnings.
    expect(report.results[0].severity).toBe('Violation')
    expect(report.results[report.results.length - 1].severity).toBe('Warning')
  })

  // Engine 0.3.0 moved to the rule the SHACL specification defines: a result
  // of severity sh:Violation, sh:Warning or sh:Info breaks conformance unless
  // the report declares sh:conformanceDisallows. Before that this engine
  // counted violations alone, which is pySHACL's --allow-warnings behaviour
  // rather than its default. A caller wanting the older, laxer reading can
  // judge `counts` instead, which still reports every severity separately.
  it('a warning alone breaks conformance, and is still reported', async () => {
    const data = await parse(`@prefix ex: <http://ex/> . ex:acme a ex:Shop ; ex:staff 50 .`)
    const shapes = await parse(SHAPES)
    const report = await validateWithShapes(data.quads, shapes.quads)
    expect(report.conforms).toBe(false)
    expect(report.counts).toEqual({ Violation: 0, Warning: 1, Info: 0 })
  })

  it('returns the report graph as Turtle', async () => {
    const data = await parse(BAD)
    const shapes = await parse(SHAPES)
    const report = await validateWithShapes(data.quads, shapes.quads)
    expect(report.turtle).toContain('@prefix sh: <http://www.w3.org/ns/shacl#>')
    expect(report.turtle).toContain('a sh:ValidationReport')
    expect(report.turtle).toContain('sh:conforms false')
    expect(report.turtle).toContain('sh:focusNode <http://ex/bob>')
    // Round-trips through the app's own parser, so it can open as a tab.
    const parsed = await parse(report.turtle)
    expect(parsed.quads.length).toBeGreaterThan(0)
  })

  it('runs SHACL-AF rules before validating when asked, and not otherwise', async () => {
    const shapes = await parse(`
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      @prefix ex: <http://ex/> .
      ex:PersonShape a sh:NodeShape ; sh:targetClass ex:Person ;
        sh:rule [ a sh:TripleRule ; sh:subject sh:this ; sh:predicate rdf:type ; sh:object ex:Agent ] .
      ex:AgentShape a sh:NodeShape ; sh:targetClass ex:Agent ;
        sh:property [ sh:path ex:name ; sh:minCount 1 ; sh:message "{$this} needs a name." ] .
    `)
    const data = await parse(`@prefix ex: <http://ex/> . ex:bob a ex:Person .`)

    const asIs = await validateWithShapes(data.quads, shapes.quads, {}, 'none')
    expect(asIs.conforms).toBe(true)
    expect(asIs.inference).toBe('none')

    const withRules = await validateWithShapes(data.quads, shapes.quads, {}, 'rules')
    expect(withRules.conforms).toBe(false)
    expect(withRules.inference).toBe('rules')
    expect(withRules.results.map(r => r.message)).toEqual(['http://ex/bob needs a name.'])
  })

  it('validates the RDFS closure when asked', async () => {
    const shapes = await parse(`
      @prefix sh: <http://www.w3.org/ns/shacl#> .
      @prefix ex: <http://ex/> .
      ex:ParentShape a sh:NodeShape ; sh:targetSubjectsOf ex:parent ;
        sh:property [ sh:path ex:name ; sh:minCount 1 ] .
    `)
    const data = await parse(`
      @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      @prefix ex: <http://ex/> .
      ex:father rdfs:subPropertyOf ex:parent .
      ex:bob ex:father ex:jim .
    `)
    // SHACL follows rdfs:subClassOf for targets and nothing else, so without
    // inference bob is not a subject of ex:parent and nothing is checked.
    expect((await validateWithShapes(data.quads, shapes.quads, {}, 'none')).results).toHaveLength(0)
    expect((await validateWithShapes(data.quads, shapes.quads, {}, 'rdfs')).results).toHaveLength(1)
  })

  it('accepts RDF 1.2 data', async () => {
    const data = await parse(`@prefix ex: <http://ex/> .
      ex:alice a ex:Person ; ex:name "Alice" {| ex:source ex:census |} ; ex:age 40 .
      ex:note ex:about <<( ex:alice ex:age 40 )>> ; ex:text "مرحبا"@ar--rtl .`)
    const shapes = await parse(SHAPES)
    const report = await validateWithShapes(data.quads, shapes.quads)
    expect(report.conforms).toBe(true)
  })
})

describe('fillMessageTemplate', () => {
  it('fills the three result placeholders in either spelling', () => {
    expect(fillMessageTemplate('{$this} via {?path} got {$value}', 's', 'p', 'v')).toBe('s via p got v')
  })

  it('leaves a placeholder alone when the result has no value for it', () => {
    expect(fillMessageTemplate('{$this}: {$value} of {$maxCount}', 's', null, null)).toBe('s: {$value} of {$maxCount}')
  })
})

const COURSE = 'C:/repos/SPARQL_Course/data'
const courseAvailable = existsSync(join(COURSE, 'shapes.ttl'))

describe.skipIf(!courseAvailable)('the SPARQL course shapes', () => {
  const load = (file: string) => parse(readFileSync(join(COURSE, file), 'utf8'))

  it('shapes-advanced.ttl: no violations, and the two intended warnings', async () => {
    const data = await load('bookshop-trail-1.1.ttl')
    const shapes = await load('shapes-advanced.ttl')
    const report = await validateWithShapes(data.quads, shapes.quads)
    expect(report.counts).toEqual({ Violation: 0, Warning: 2, Info: 0 })
    // Warnings break conformance from engine 0.3.0 on; the useful assertion
    // about this data is that nothing in it is a violation.
    expect(report.conforms).toBe(false)
  }, 30_000)

  it('shapes.ttl: the module 00 exercise, a shop with nobody in it, is caught', async () => {
    const text = readFileSync(join(COURSE, 'bookshop-trail-1.1.ttl'), 'utf8')
    const broken = text.replace(/bs:staffCount\s+"?(\d+)"?/, m => m.replace(/\d+/, '0'))
    expect(broken).not.toBe(text)
    const before = await validateWithShapes((await parse(text)).quads, (await load('shapes.ttl')).quads)
    const after = await validateWithShapes((await parse(broken)).quads, (await load('shapes.ttl')).quads)
    expect(after.counts.Violation).toBe(before.counts.Violation + 1)
    const staff = after.results.find(r => r.path?.endsWith('#staffCount'))!
    expect(staff.severity).toBe('Violation')
    expect(staff.message).toContain('positive integer')
  }, 30_000)

  it('validates the RDF 1.2 edition of the data', async () => {
    const data = await load('bookshop-trail-1.2.ttl')
    const shapes = await load('shapes-advanced.ttl')
    const report = await validateWithShapes(data.quads, shapes.quads)
    expect(report.counts.Violation).toBe(0)
  }, 30_000)
})
