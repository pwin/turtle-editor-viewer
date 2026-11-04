import { describe, expect, it } from 'vitest'
import { Parser } from 'n3'
import type { RDFQuad } from '@/types'
import { referencingSubjects, subjectKey, toggleSubject } from './references'

const PREFIXES = { ex: 'http://ex/', bt: 'https://example.org/bookshop-trail/' }

const parse = (turtle: string): RDFQuad[] =>
  new Parser({ baseIRI: 'http://example.org/', blankNodePrefix: '' }).parse(
    `@prefix ex: <http://ex/> .\n@prefix bt: <https://example.org/bookshop-trail/> .\n${turtle}`,
  ) as unknown as RDFQuad[]

describe('referencingSubjects', () => {
  const DATA = parse(`
    ex:shop-a ex:inTown ex:wigtown ; ex:name "A" .
    ex:shop-b ex:inTown ex:wigtown .
    ex:guide  ex:covers  ex:wigtown .
    ex:elsewhere ex:inTown ex:edinburgh .
  `)

  it('lists every subject pointing at the clicked thing, sorted and once each', () => {
    expect(referencingSubjects(DATA, 'http://ex/wigtown', PREFIXES)).toEqual([
      'ex:guide',
      'ex:shop-a',
      'ex:shop-b',
    ])
  })

  it('keys subjects as the picker does, so a checkbox can match the selection', () => {
    // Prefixed, not full IRIs: these keys are what rdf.selectedSubjects holds.
    const keys = referencingSubjects(DATA, 'http://ex/wigtown', PREFIXES)
    expect(keys.every(k => k.startsWith('ex:'))).toBe(true)
    // With no prefixes to shrink against, the full IRI is the key.
    expect(referencingSubjects(DATA, 'http://ex/wigtown', {})).toContain('http://ex/shop-a')
  })

  it('returns nothing for a thing nothing refers to', () => {
    expect(referencingSubjects(DATA, 'http://ex/shop-a', PREFIXES)).toEqual([])
  })

  it('finds what refers to a literal, which is a node in the diagram too', () => {
    expect(referencingSubjects(DATA, 'A', PREFIXES)).toEqual(['ex:shop-a'])
  })

  it('finds what refers to a blank node, keyed by its label', () => {
    const quads = parse('_:g_00 ex:p "x" . ex:a ex:points _:g_00 .')
    expect(referencingSubjects(quads, 'g_00', PREFIXES)).toEqual(['ex:a'])
  })

  it('keeps a blank-node subject under its bare label, not shrunk as an IRI', () => {
    const quads = parse('_:g_00 ex:points ex:target .')
    expect(referencingSubjects(quads, 'http://ex/target', PREFIXES)).toEqual(['g_00'])
  })

  it('leaves out a subject that refers to itself, already drawn where it was clicked', () => {
    const quads = parse('ex:a ex:sameAs ex:a ; ex:p ex:b .')
    expect(referencingSubjects(quads, 'http://ex/a', PREFIXES)).toEqual([])
  })

  it('ignores triple terms, whose value is empty and would match everything', () => {
    const quads = parse('ex:src ex:disputes <<( ex:a ex:p "1" )>> . ex:other ex:p ex:a .')
    // The empty string is not a node anyone can click.
    expect(referencingSubjects(quads, '', PREFIXES)).toEqual([])
    // And the ordinary reference is still found.
    expect(referencingSubjects(quads, 'http://ex/a', PREFIXES)).toEqual(['ex:other'])
  })
})

describe('subjectKey', () => {
  it('shrinks a named node and leaves a blank node alone', () => {
    const [named] = parse('ex:a ex:p "x" .')
    expect(subjectKey(named.subject, PREFIXES)).toBe('ex:a')
    const [blank] = parse('_:g_00 ex:p "x" .')
    expect(subjectKey(blank.subject, PREFIXES)).toBe('g_00')
  })
})

describe('toggleSubject', () => {
  it('adds one that is not there', () => {
    expect(toggleSubject(['ex:a'], 'ex:b', true)).toEqual(['ex:a', 'ex:b'])
  })

  it('removes one that is', () => {
    expect(toggleSubject(['ex:a', 'ex:b'], 'ex:a', false)).toEqual(['ex:b'])
  })

  it('adding twice is not a duplicate, which would draw the subject twice', () => {
    expect(toggleSubject(['ex:a'], 'ex:a', true)).toEqual(['ex:a'])
  })

  it('removing one that is absent changes nothing', () => {
    expect(toggleSubject(['ex:a'], 'ex:b', false)).toEqual(['ex:a'])
  })

  it('does not mutate the array it was given', () => {
    const before = ['ex:a']
    toggleSubject(before, 'ex:b', true)
    expect(before).toEqual(['ex:a'])
  })
})
