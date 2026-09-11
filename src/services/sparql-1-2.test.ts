/**
 * SPARQL 1.2 / RDF 1.2 end-to-end coverage, driven by the SPARQL_Course
 * material. Each query in queries/11-sparql-1-2 is run through the app's own
 * parse -> store -> query pipeline against data/bookshop-trail-1.2.ttl.
 *
 * The course lives outside this repo; the suite is skipped if it is absent so
 * CI elsewhere does not fail on a missing sibling checkout.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from 'n3'
import { QueryEngine } from '@comunica/query-sparql'
import type { RDFQuad } from '@/types'
import { RDFParser } from './rdf-parser'

const COURSE = 'C:/repos/SPARQL_Course'
const DATA = join(COURSE, 'data/bookshop-trail-1.2.ttl')
const QDIR = join(COURSE, 'queries/11-sparql-1-2')
const available = existsSync(DATA) && existsSync(QDIR)

const queries = available
  ? readdirSync(QDIR)
      .filter(f => f.endsWith('.rq'))
      .map(f => ({ name: f, text: readFileSync(join(QDIR, f), 'utf8') }))
  : []

async function parse(): Promise<RDFQuad[]> {
  const result = await new RDFParser().parseRDF(readFileSync(DATA, 'utf8'), 'turtle')
  expect(result.error).toBeUndefined()
  return result.quads
}

async function rows(quads: RDFQuad[], query: string): Promise<number> {
  const store = new Store()
  for (const q of quads) store.addQuad(q as never)
  const r = await new QueryEngine().queryBindings(query, { sources: [store] })
  return (await r.toArray()).length
}

describe.skipIf(!available)('RDF 1.2 terms survive the app parser', () => {
  it('keeps triple terms as Quad-typed objects', async () => {
    const quads = await parse()
    const tripleTerms = quads.filter(q => q.object.termType === 'Quad')
    expect(tripleTerms.length).toBeGreaterThan(0)
  })

  it('keeps base direction on literals', async () => {
    const quads = await parse()
    const directional = quads.flatMap(q =>
      q.object.termType === 'Literal' && q.object.direction === 'rtl' ? [q.object] : [],
    )
    expect(directional.length).toBeGreaterThan(0)
    expect(directional[0].datatype.value).toBe(
      'http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString',
    )
  })
})

describe.skipIf(!available)('SPARQL 1.2 course queries via the app pipeline', () => {
  for (const { name, text } of queries) {
    it(`answers ${name}`, async () => {
      const quads = await parse()
      expect(await rows(quads, text)).toBeGreaterThan(0)
    })
  }
})
