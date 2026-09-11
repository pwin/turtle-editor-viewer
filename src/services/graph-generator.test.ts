import { describe, expect, it } from 'vitest'
import { Parser } from 'n3'
import type { GraphOptions, RDFQuad } from '@/types'
import { extractLabels } from '@/utils/label-utils'
import { GraphGenerator } from './graph-generator'
import { RDFParser } from './rdf-parser'

const PREFIXES: Record<string, string> = {
  ex: 'http://www.example.com/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
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
  linkTripleTerms: false,
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

describe('RDF 1.2 triple terms in the diagram', () => {
  const DISPUTE = `
    ex:register ex:disputes <<( ex:shop ex:founded "1921" )>> .
  `

  it('draws a triple term as a dark green node', () => {
    const { dotText, error } = render(DISPUTE)
    expect(error).toBeUndefined()
    const line = dotText.split('\n').find(l => l.includes('<<(') && l.includes('['))
    expect(line).toBeDefined()
    expect(line).toContain('color="darkgreen"')
    expect(line).toContain('fontcolor="darkgreen"')
  })

  it('names the node with the statement in RDF 1.2 Turtle syntax', () => {
    const { dotText } = render(DISPUTE)
    expect(dotText).toContain('<<( ex:shop ex:founded \\"1921\\" )>>')
  })

  it('points the edge at the triple term node', () => {
    const { dotText } = render(DISPUTE)
    expect(dotText).toContain(
      '"ex:register" -> "<<( ex:shop ex:founded \\"1921\\" )>>" [label="ex:disputes"]',
    )
  })

  it('shows labels for the terms inside the triple term', () => {
    const { dotText } = render(`
      ex:shop rdfs:label "The Shop" .
      ex:founded rdfs:label "founded" .
      ${DISPUTE}
    `)
    expect(dotText).toContain('label="<<( The Shop founded \\"1921\\" )>>"')
  })

  it('keeps the node id free of labels so it is stable', () => {
    const labelled = render(`ex:shop rdfs:label "The Shop" . ${DISPUTE}`)
    const plain = render(DISPUTE)
    const id = '"<<( ex:shop ex:founded \\"1921\\" )>>"'
    expect(labelled.dotText).toContain(id)
    expect(plain.dotText).toContain(id)
  })

  it('renders the same statement used twice as one node', () => {
    const { dotText } = render(`
      ex:register ex:disputes <<( ex:shop ex:founded "1921" )>> .
      ex:gazette  ex:confirms <<( ex:shop ex:founded "1921" )>> .
    `)
    const declarations = dotText
      .split('\n')
      .filter(l => l.includes('<<(') && l.includes('darkgreen'))
    expect(declarations).toHaveLength(1)
    // ...with both edges arriving at it
    expect(dotText).toContain('"ex:register" -> "<<(')
    expect(dotText).toContain('"ex:gazette" -> "<<(')
  })

  it('keeps two different triple terms from one subject and predicate', () => {
    // A triple term's .value is "", so a dedup key built on .value would
    // collapse these into one and silently drop the second.
    const { dotText } = render(`
      ex:register ex:disputes <<( ex:shopA ex:founded "1921" )>> .
      ex:register ex:disputes <<( ex:shopB ex:founded "1928" )>> .
    `)
    expect(dotText).toContain('ex:shopA ex:founded')
    expect(dotText).toContain('ex:shopB ex:founded')
  })

  it('handles the annotation syntax, linking reifier to statement', () => {
    const { dotText } = render(`
      ex:shop ex:founded "1921" {| ex:confidence 0.9 |} .
    `)
    // the base statement is still drawn...
    expect(dotText).toContain('"ex:shop" -> "1921" [label="ex:founded"]')
    // ...and a blank node reifier points at the green triple term
    expect(dotText).toMatch(/"[^"]+" -> "<<\( ex:shop ex:founded \\"1921\\" \)>>" \[label="rdf:reifies"\]/)
  })

  it('renders a nested triple term', () => {
    const { dotText } = render(`
      ex:a ex:p <<( ex:b ex:q <<( ex:c ex:r "v" )>> )>> .
    `)
    expect(dotText).toContain('<<( ex:b ex:q <<( ex:c ex:r \\"v\\" )>> )>>')
  })

  it('gives a triple term no click handler, which needs an IRI', () => {
    const { dotText } = render(DISPUTE, { showSubjects: true })
    const line = dotText.split('\n').find(l => l.includes('<<(') && l.includes('darkgreen'))
    expect(line).not.toContain('URL=')
  })
})

describe('linking triple terms back to what they mention', () => {
  // The annotation form gives the base statement (so subject and object are
  // nodes) plus a reifier pointing at the triple term.
  const ANNOTATED = `ex:shop ex:founded "1921" {| ex:confidence 0.9 |} .`
  const GREEN = '"<<( ex:shop ex:founded \\"1921\\" )>>"'
  const dashed = (dot: string) => dot.split('\n').filter(l => l.includes('style="dashed"'))

  it('draws nothing extra when the option is off', () => {
    const { dotText } = render(ANNOTATED)
    expect(dashed(dotText)).toHaveLength(0)
  })

  it('links the triple term to its subject and object when on', () => {
    const { dotText } = render(ANNOTATED, { linkTripleTerms: true })
    expect(dotText).toContain(`${GREEN} -> "ex:shop" [label="subject"`)
    expect(dotText).toContain(`${GREEN} -> "1921" [label="object"`)
  })

  it('styles the links as dashed green commentary', () => {
    const { dotText } = render(ANNOTATED, { linkTripleTerms: true })
    for (const line of dashed(dotText)) {
      expect(line).toContain('color="darkgreen"')
      expect(line).toContain('fontcolor="darkgreen"')
    }
    expect(dashed(dotText)).toHaveLength(2)
  })

  it('does not let the links steer the layout', () => {
    const { dotText } = render(ANNOTATED, { linkTripleTerms: true })
    for (const line of dashed(dotText)) expect(line).toContain('constraint=false')
  })

  it('leaves the real statement edge untouched', () => {
    const { dotText } = render(ANNOTATED, { linkTripleTerms: true })
    expect(dotText).toContain('"ex:shop" -> "1921" [label="ex:founded"]')
  })

  it('only links to parts that are drawn in this diagram', () => {
    // Only the disputing source is selected: the shop and its founding
    // date are mentioned inside the triple term but drawn nowhere.
    const ttl = `ex:register ex:disputes <<( ex:shop ex:founded "1921" )>> .`
    const { dotText } = render(ttl, { linkTripleTerms: true })
    expect(dashed(dotText)).toHaveLength(0)
    // ...and it must not have conjured a node just to point at it
    expect(dotText).not.toContain('"ex:shop" [')
  })

  it('links to whichever parts happen to be present', () => {
    const ttl = `
      ex:register ex:disputes <<( ex:shop ex:founded "1921" )>> .
      ex:register ex:mentions ex:shop .
    `
    const { dotText } = render(ttl, { linkTripleTerms: true })
    expect(dashed(dotText)).toHaveLength(1)
    expect(dotText).toContain(`${GREEN} -> "ex:shop" [label="subject"`)
  })

  it('emits each link once even when the triple term is used twice', () => {
    const ttl = `
      ${ANNOTATED}
      ex:register ex:disputes <<( ex:shop ex:founded "1921" )>> .
    `
    const { dotText } = render(ttl, { linkTripleTerms: true })
    expect(dashed(dotText)).toHaveLength(2)
  })

  it('links to a blank node subject', () => {
    const ttl = `[] ex:founded "1921" {| ex:confidence 0.9 |} .`
    const { dotText } = render(ttl, { linkTripleTerms: true })
    const subjectLink = dashed(dotText).find(l => l.includes('[label="subject"'))
    expect(subjectLink).toBeDefined()
    // the blank node itself is still orange, not green
    expect(dotText.split('\n').filter(l => l.includes('color="orange"'))).toHaveLength(2)
  })

  it('does not link a triple term to itself', () => {
    const ttl = `ex:a ex:p ex:a {| ex:note "self" |} .`
    const { dotText } = render(ttl, { linkTripleTerms: true })
    const links = dashed(dotText)
    for (const l of links) expect(l).not.toMatch(/"(<<[^"]+)" -> "\1"/)
    // subject and object are the same node, so exactly one link to it
    expect(links).toHaveLength(1)
  })
})

describe('blank nodes are unaffected by triple term support', () => {
  it('still colours a blank node orange', () => {
    const { dotText } = render(`ex:a ex:p [ ex:q "v" ] .`)
    const line = dotText.split('\n').find(l => l.includes('color="orange"'))
    expect(line).toBeDefined()
    expect(line).not.toContain('darkgreen')
  })

  it('still follows a blank node into its own triples', () => {
    const { dotText } = render(`ex:a ex:p [ ex:q "inner" ] .`)
    expect(dotText).toContain('inner')
    expect(dotText).toMatch(/"[^"]+" -> "inner" \[label="ex:q"\]/)
  })

  it('still renders an RDF list through its blank nodes', () => {
    const { dotText } = render(`ex:a ex:items ( ex:x ex:y ) .`)
    expect(dotText).toContain('ex:x')
    expect(dotText).toContain('ex:y')
  })

  it('never colours a blank node green, even next to a triple term', () => {
    const { dotText } = render(`
      ex:shop ex:founded "1921" {| ex:confidence 0.9 |} .
    `)
    const orange = dotText.split('\n').filter(l => l.includes('color="orange"'))
    const green = dotText.split('\n').filter(l => l.includes('color="darkgreen"'))
    expect(orange).toHaveLength(1)
    expect(green).toHaveLength(1)
    expect(orange[0]).not.toContain('<<(')
    expect(green[0]).toContain('<<(')
  })
})

describe('shrinkIRI', () => {
  it('prefers the longest matching namespace', () => {
    const prefixes = {
      bt: 'https://example.org/bookshop-trail/',
      bs: 'https://example.org/bookshop-trail/schema#',
    }
    // declared-first would give the misleading "bt:schema#founded"
    expect(RDFParser.shrinkIRI('https://example.org/bookshop-trail/schema#founded', prefixes))
      .toBe('bs:founded')
    expect(RDFParser.shrinkIRI('https://example.org/bookshop-trail/shop-1', prefixes))
      .toBe('bt:shop-1')
  })

  it('leaves an IRI alone when nothing matches', () => {
    expect(RDFParser.shrinkIRI('http://other/x', { ex: 'http://ex/' })).toBe('http://other/x')
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

describe('no script can reach the diagram from the data', () => {
  // These are the payloads that used to work against the javascript: URL
  // the generator once attached to every node while Subjects was on: a
  // percent-encoded quote (browsers decode javascript: URLs before running
  // them), a quote-closing sequence, and a double quote that broke out of
  // the DOT attribute altogether.
  const HOSTILE = `
    <http://x/a%27);alert(document.domain);//> ex:p "plain" .
    ex:b ex:q "x'); alert(1); //" .
    ex:c ex:r "y\\", fontcolor=red, URL=\\"javascript:alert(2)" .
  `

  // DOT structure with every quoted string blanked out, so anything that is
  // left is syntax the generator itself wrote rather than data.
  const structure = (dot: string) => dot.replace(/"(?:[^"\\]|\\.)*"/g, '""')

  it('emits no URL or href attribute, whatever the Subjects option says', () => {
    for (const showSubjects of [true, false]) {
      const { dotText, error } = render(HOSTILE, { showSubjects })
      expect(error).toBeUndefined()
      expect(structure(dotText)).not.toMatch(/\b(URL|href)\s*=/i)
      expect(structure(dotText)).not.toContain('javascript:')
    }
  })

  it('keeps hostile values inside their quoted DOT strings', () => {
    const { dotText } = render(HOSTILE, { showSubjects: true })
    // Nothing from the data escapes into an attribute list.
    expect(structure(dotText)).not.toContain('fontcolor=red')
    expect(structure(dotText)).not.toContain('alert(')
    // The literal is still drawn, quotes escaped, as a single node id.
    expect(dotText).toContain('"y\\", fontcolor=red, URL=\\"javascript:alert(2)"')
  })
})
