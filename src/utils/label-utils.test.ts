import { describe, expect, it } from 'vitest'
import { Parser } from 'n3'
import type { RDFQuad } from '@/types'
import { buildSubjectOptions, extractLabels } from './label-utils'

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

/** Mirrors RDFParser.subjectKey. */
const keyOf = (subject: RDFQuad['subject']) =>
  subject.termType === 'NamedNode' ? shrink(subject.value) : subject.value

function parse(ttl: string) {
  const header = `@prefix rdfs: <${PREFIXES.rdfs}> .
@prefix skos: <${PREFIXES.skos}> .
@prefix ex: <${PREFIXES.ex}> .
`
  const quads = new Parser().parse(header + ttl) as unknown as RDFQuad[]
  const subjects = [...new Set(quads.map(q => keyOf(q.subject)))].sort()
  return { quads, subjects, labels: extractLabels(quads, keyOf) }
}

describe('extractLabels', () => {
  it('reads rdfs:label', () => {
    const { labels } = parse(`ex:a rdfs:label "Alpha" .`)
    expect(labels['ex:a']).toBe('Alpha')
  })

  it('reads skos:prefLabel', () => {
    const { labels } = parse(`ex:a skos:prefLabel "Alpha" .`)
    expect(labels['ex:a']).toBe('Alpha')
  })

  it('prefers skos:prefLabel over rdfs:label', () => {
    const { labels } = parse(`ex:a skos:prefLabel "Preferred" ; rdfs:label "Fallback" .`)
    expect(labels['ex:a']).toBe('Preferred')
  })

  it('ignores non-literal label objects', () => {
    const { labels } = parse(`ex:a rdfs:label ex:not_a_literal .`)
    expect(labels['ex:a']).toBeUndefined()
  })

  it('omits subjects that have no label at all', () => {
    const { labels } = parse(`ex:a a ex:Thing .`)
    expect(labels['ex:a']).toBeUndefined()
  })

  it('picks language-tagged labels deterministically: plain, then en, then other', () => {
    const plain = parse(`ex:a rdfs:label "Zed Plain", "Alpha"@en, "Beta"@fr .`)
    expect(plain.labels['ex:a']).toBe('Zed Plain')

    const english = parse(`ex:a rdfs:label "Alpha"@en, "Beta"@fr .`)
    expect(english.labels['ex:a']).toBe('Alpha')

    const neither = parse(`ex:a rdfs:label "Zeta"@fr, "Alpha"@de .`)
    expect(neither.labels['ex:a']).toBe('Alpha') // de sorts before fr
  })

  it('is stable across repeated runs', () => {
    const ttl = `ex:a rdfs:label "One"@fr, "Two"@de, "Three"@es .`
    const runs = new Set(Array.from({ length: 20 }, () => parse(ttl).labels['ex:a']))
    expect(runs.size).toBe(1)
  })
})

describe('buildSubjectOptions', () => {
  it('shows a bare label when it is unique', () => {
    const { subjects, labels } = parse(`ex:a rdfs:label "Alpha" .`)
    expect(buildSubjectOptions(subjects, labels, true)).toEqual([
      { value: 'ex:a', display: 'Alpha', label: 'Alpha' },
    ])
  })

  it('disambiguates colliding labels with the IRI', () => {
    const { subjects, labels } = parse(`
      ex:a rdfs:label "Shared" .
      ex:b rdfs:label "Shared" .
      ex:c rdfs:label "Unique" .
    `)
    const byValue = Object.fromEntries(
      buildSubjectOptions(subjects, labels, true).map(o => [o.value, o.display]),
    )
    expect(byValue['ex:a']).toBe('Shared  〈ex:a〉')
    expect(byValue['ex:b']).toBe('Shared  〈ex:b〉')
    // the unique one stays clean
    expect(byValue['ex:c']).toBe('Unique')
  })

  it('never produces two identical display strings', () => {
    const { subjects, labels } = parse(`
      ex:a rdfs:label "Same" .
      ex:b rdfs:label "Same" .
      ex:c rdfs:label "Same" .
    `)
    const displays = buildSubjectOptions(subjects, labels, true).map(o => o.display)
    expect(new Set(displays).size).toBe(displays.length)
  })

  it('falls back to the IRI for unlabelled subjects', () => {
    const { subjects, labels } = parse(`
      ex:a rdfs:label "Alpha" .
      ex:b a ex:Thing .
    `)
    const byValue = Object.fromEntries(
      buildSubjectOptions(subjects, labels, true).map(o => [o.value, o.display]),
    )
    expect(byValue['ex:b']).toBe('ex:b')
  })

  it('keeps the IRI as the option value regardless of labelling', () => {
    const { subjects, labels } = parse(`
      ex:a rdfs:label "Shared" .
      ex:b rdfs:label "Shared" .
    `)
    const values = buildSubjectOptions(subjects, labels, true).map(o => o.value)
    expect(values).toEqual(['ex:a', 'ex:b'])
    expect(new Set(values).size).toBe(values.length)
  })

  it('returns raw IRIs when the option is off', () => {
    const { subjects, labels } = parse(`ex:a rdfs:label "Alpha" .`)
    expect(buildSubjectOptions(subjects, labels, false)).toEqual([
      { value: 'ex:a', display: 'ex:a' },
    ])
  })

  it('labels blank node subjects by their id', () => {
    const { subjects, labels } = parse(`[] rdfs:label "Anon" .`)
    const options = buildSubjectOptions(subjects, labels, true)
    expect(options).toHaveLength(1)
    expect(options[0].display).toBe('Anon')
    expect(options[0].value).toBe(subjects[0])
  })
})
