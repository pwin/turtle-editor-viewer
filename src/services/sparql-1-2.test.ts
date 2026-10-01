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
import { Writer } from 'n3'
import type { RDFQuad } from '@/types'
import { RDFParser } from './rdf-parser'

const COURSE = 'C:/repos/SPARQL_Course'
const DATA = join(COURSE, 'data/bookshop-trail-1.2.ttl')
const QDIR = join(COURSE, 'queries/11-sparql-1-2')
const available = existsSync(DATA) && existsSync(QDIR)

// Each test parses the 6,000-line course file, which can take well over Vitest's
// 5 s default when the suite runs alongside the other files. Not a correctness
// signal, so give it room. The engine itself is no longer the slow part: the whole
// course corpus answers in under half a second (scripts/engine-comparison.mjs).
const TIMEOUT = 30_000

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

// holosdb, the engine the app itself runs -- so this file tests the shipped pipeline
// rather than a second engine that happens to be installed. It also means the file
// loads at all: it previously imported Comunica, whose `undici@8` needs Node >= 22.19
// and throws on import below that, so on Node 20 this entire suite was silently absent
// rather than passing.
async function rows(quads: RDFQuad[], query: string): Promise<number> {
  const holos = await import('holos-wasm-node')
  const store = new holos.Store()
  try {
    const writer = new Writer({ format: 'N-Quads' })
    for (const q of quads) writer.addQuad(q as never)
    let text = ''
    writer.end((err: Error | null, result: string) => {
      if (err) throw err
      text = result
    })
    store.load(text, 'nquads', undefined)
    const out = store.query(query, undefined) as unknown
    if (!Array.isArray(out)) throw new Error(`expected SELECT rows, got ${typeof out}`)
    return out.length
  } finally {
    ;(store as { free?: () => void }).free?.()
  }
}

describe.skipIf(!available)('RDF 1.2 terms survive the app parser', () => {
  it('keeps triple terms as Quad-typed objects', async () => {
    const quads = await parse()
    const tripleTerms = quads.filter(q => q.object.termType === 'Quad')
    expect(tripleTerms.length).toBeGreaterThan(0)
  }, TIMEOUT)

  it('keeps base direction on literals', async () => {
    const quads = await parse()
    const directional = quads.flatMap(q =>
      q.object.termType === 'Literal' && q.object.direction === 'rtl' ? [q.object] : [],
    )
    expect(directional.length).toBeGreaterThan(0)
    expect(directional[0].datatype.value).toBe(
      'http://www.w3.org/1999/02/22-rdf-syntax-ns#dirLangString',
    )
  }, TIMEOUT)
})

describe.skipIf(!available)('SPARQL 1.2 course queries via the app pipeline', () => {
  for (const { name, text } of queries) {
    it(`answers ${name}`, async () => {
      const quads = await parse()
      expect(await rows(quads, text)).toBeGreaterThan(0)
    }, TIMEOUT)
  }
})
