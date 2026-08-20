import { describe, expect, it } from 'vitest'
import { Parser } from 'n3'
import type { GraphOptions, RDFQuad } from '@/types'
import { extractLabels } from '@/utils/label-utils'
import { GraphGenerator } from './graph-generator'

const PREFIXES: Record<string, string> = {
  ex: 'http://www.example.com/',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
}

const shrink = (iri: string) => {
  for (const [prefix, ns] of Object.entries(PREFIXES)) {
    if (iri.startsWith(ns)) return iri.replace(ns, `${prefix}:`)
  }
  return iri
}
const keyOf = (s: RDFQuad['subject']) =>
  s.termType === 'NamedNode' ? shrink(s.value) : s.value

const OPTIONS: GraphOptions = {
  engine: 'dot',
  format: 'svg',
  layoutDirection: 'LR',
  showPrefixes: false,
  hideTypes: false,
  hideAnnotations: false,
  showSubjects: false,
  rawOutput: false,
  sortSubjects: false,
  showLabels: true,
  showNodeLabels: true,
  showPredicateLabels: true,
}

function render(ttl: string, options: Partial<GraphOptions> = {}) {
  const header = `@prefix rdfs: <${PREFIXES.rdfs}> .
@prefix skos: <${PREFIXES.skos}> .
@prefix ex: <${PREFIXES.ex}> .
`
  const quads = new Parser().parse(header + ttl) as unknown as RDFQuad[]
  const subjects = [...new Set(quads.map(q => keyOf(q.subject)))]
  const labels = extractLabels(quads, keyOf)
  return new GraphGenerator().generateDotFromRDF(
    quads,
    subjects,
    { ...OPTIONS, ...options },
    PREFIXES,
    labels,
  )
}

describe('diagram node labels', () => {
  it('renders a label attribute instead of renaming the node', () => {
    const { dotText, error } = render(`ex:a rdfs:label "Alpha" ; ex:p ex:b .`)
    expect(error).toBeUndefined()
    // node id stays the IRI, display comes from label=
    expect(dotText).toContain('"ex:a" [')
    expect(dotText).toContain('label="Alpha"')
  })

  it('keeps edges pointing at IRI node ids, not labels', () => {
    const { dotText } = render(`
      ex:a rdfs:label "Alpha" ; ex:p ex:b .
      ex:b rdfs:label "Beta" .
    `)
    expect(dotText).toContain('"ex:a" -> "ex:b"')
    expect(dotText).not.toContain('"Alpha" -> "Beta"')
  })

  it('does NOT merge two resources that share a label', () => {
    const { dotText } = render(`
      ex:a rdfs:label "Same" ; ex:p ex:c .
      ex:b rdfs:label "Same" ; ex:p ex:c .
    `)
    // both must survive as separate nodes
    expect(dotText).toContain('"ex:a"')
    expect(dotText).toContain('"ex:b"')
    expect(dotText).toContain('"ex:a" -> "ex:c"')
    expect(dotText).toContain('"ex:b" -> "ex:c"')
    // and each box is distinguishable
    expect(dotText).toContain('Same\\n〈ex:a〉')
    expect(dotText).toContain('Same\\n〈ex:b〉')
  })

  it('uses a bare label when it is unique in the diagram', () => {
    const { dotText } = render(`ex:a rdfs:label "Unique" ; ex:p ex:b .`)
    expect(dotText).toContain('label="Unique"')
    expect(dotText).not.toContain('〈ex:a〉')
  })

  it('emits a DOT line break, not a raw newline, when disambiguating', () => {
    const { dotText } = render(`
      ex:a rdfs:label "Same" ; ex:p ex:c .
      ex:b rdfs:label "Same" ; ex:p ex:c .
    `)
    const line = dotText.split('\n').find(l => l.includes('〈ex:a〉'))
    expect(line).toBeDefined()
    // the escape must survive as backslash-n inside one physical line
    expect(line).toContain('\\n')
  })

  it('leaves nodes unlabelled when the option is off', () => {
    const { dotText } = render(`ex:a rdfs:label "Alpha" ; ex:p ex:b .`, {
      showNodeLabels: false,
    })
    expect(dotText).not.toContain('label="Alpha"')
    expect(dotText).toContain('"ex:a" -> "ex:b"')
  })

  it('does not label literal nodes', () => {
    const { dotText } = render(`ex:a rdfs:label "Alpha" ; ex:note "a literal value" .`)
    // the literal keeps its own text as the node, never a label= from the map
    expect(dotText).toContain('a literal value')
  })

  it('falls back to the IRI for nodes with no label', () => {
    const { dotText } = render(`ex:a ex:p ex:unlabelled .`)
    expect(dotText).toContain('"ex:unlabelled"')
  })

  it('declares each node exactly once, however often it appears', () => {
    const { dotText } = render(`
      ex:a rdfs:label "A" ; ex:p ex:shared .
      ex:b rdfs:label "B" ; ex:p ex:shared .
      ex:c rdfs:label "C" ; ex:p ex:shared .
      ex:shared rdfs:label "Shared Target" .
    `)
    const declarations = dotText
      .split('\n')
      .filter(l => l.trim().startsWith('"ex:shared" ['))
    expect(declarations).toHaveLength(1)
  })

  it('prefers skos:prefLabel on diagram nodes too', () => {
    const { dotText } = render(`
      ex:a skos:prefLabel "Preferred" ; rdfs:label "Fallback" ; ex:p ex:b .
    `)
    expect(dotText).toContain('label="Preferred"')
    expect(dotText).not.toContain('label="Fallback"')
  })
})

describe('diagram property labels', () => {
  it('labels an edge when the property describes itself', () => {
    const { dotText } = render(`
      ex:hasPart rdfs:label "has part" .
      ex:a ex:hasPart ex:b .
    `)
    expect(dotText).toContain('"ex:a" -> "ex:b" [label="has part"]')
  })

  it('keeps the property IRI when it has no label', () => {
    const { dotText } = render(`ex:a ex:hasPart ex:b .`)
    expect(dotText).toContain('[label="ex:hasPart"]')
  })

  it('still labels edges when hideAnnotations hides the label triples', () => {
    const { dotText } = render(
      `
        ex:hasPart rdfs:label "has part" .
        ex:a ex:hasPart ex:b .
      `,
      { hideAnnotations: true },
    )
    // the rdfs:label edge itself is gone, but the property is still named
    expect(dotText).toContain('[label="has part"]')
    expect(dotText).not.toContain('[label="rdfs:label"]')
  })

  it('disambiguates two properties that share a label', () => {
    const { dotText } = render(`
      ex:partOne rdfs:label "part" .
      ex:partTwo rdfs:label "part" .
      ex:a ex:partOne ex:b .
      ex:a ex:partTwo ex:c .
    `)
    expect(dotText).toContain('part\\n〈ex:partOne〉')
    expect(dotText).toContain('part\\n〈ex:partTwo〉')
  })

  it('uses a bare property label when unique', () => {
    const { dotText } = render(`
      ex:hasPart rdfs:label "has part" .
      ex:a ex:hasPart ex:b .
    `)
    expect(dotText).toContain('[label="has part"]')
    expect(dotText).not.toContain('〈ex:hasPart〉')
  })

  it('leaves edges as IRIs when the option is off', () => {
    const { dotText } = render(
      `
        ex:hasPart rdfs:label "has part" .
        ex:a ex:hasPart ex:b .
      `,
      { showPredicateLabels: false },
    )
    // the edge keeps the IRI. The node box for ex:hasPart may still be
    // labelled, since that is governed by showNodeLabels.
    expect(dotText).toContain('"ex:a" -> "ex:b" [label="ex:hasPart"]')
    expect(dotText).not.toContain('"ex:a" -> "ex:b" [label="has part"]')
  })

  it('is independent of the node label option', () => {
    const { dotText } = render(
      `
        ex:hasPart rdfs:label "has part" .
        ex:a rdfs:label "Alpha" ; ex:hasPart ex:b .
      `,
      { showNodeLabels: false },
    )
    // edges labelled, boxes not
    expect(dotText).toContain('[label="has part"]')
    expect(dotText).not.toContain('label="Alpha"')
  })

  it('escapes quotes in a property label', () => {
    const { dotText } = render(`
      ex:hasPart rdfs:label "the \\"odd\\" one" .
      ex:a ex:hasPart ex:b .
    `)
    expect(dotText).toContain('\\"odd\\"')
  })
})

describe('label precedence on nodes', () => {
  it('prefers skos:prefLabel', () => {
    const { dotText } = render(`
      ex:a skos:prefLabel "Preferred" ; rdfs:label "Fallback" ; ex:p ex:b .
    `)
    expect(dotText).toContain('label="Preferred"')
    expect(dotText).not.toContain('label="Fallback"')
  })
})
