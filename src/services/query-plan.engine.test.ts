/**
 * The plan the engine actually produces, put through the parser that receives it.
 *
 * `query-plan.test.ts` works from a fixture, which tests this module's own logic
 * and cannot catch the engine and the parser disagreeing about the shape. The
 * keys here are sentences -- `"number of results"`, `"duration in seconds"` --
 * so a rename upstream would leave every statistic reading zero with nothing
 * failing. This is the contract test for that boundary, run against the same
 * WebAssembly binary the browser loads, with Node glue instead of browser glue.
 */
import { describe, expect, it } from 'vitest'
import { Store } from 'holos-wasm-node'
import { flattenPlan, generatePlanDot, isCollapsePoint, parseQueryPlan } from './query-plan'

const TURTLE = `@prefix ex: <http://ex/> .
ex:a a ex:Shop ; ex:label "A" ; ex:town ex:t1 .
ex:b a ex:Shop ; ex:label "B" ; ex:town ex:t1 .
ex:c a ex:Shop ; ex:label "C" .
ex:t1 ex:label "Town" .
`

function planFor(query: string) {
  const store = new Store()
  try {
    store.loadTurtle(TURTLE, 'http://ex/')
    return parseQueryPlan(store.explain(query, 'http://ex/'))
  } finally {
    ;(store as { free?: () => void }).free?.()
  }
}

describe('a plan from the engine', () => {
  const plan = planFor(`PREFIX ex: <http://ex/>
    SELECT ?s ?town WHERE { ?s a ex:Shop ; ex:town ?t . ?t ex:label ?town }`)

  it('arrives with a tree of named operators', () => {
    expect(plan.nodeCount).toBeGreaterThan(1)
    const kinds = flattenPlan(plan.root).map(({ node }) => node.kind)
    expect(kinds).toContain('Project')
    expect(kinds).toContain('QuadPattern')
  })

  it('carries statistics, not zeroes: the keys still match', () => {
    const leaves = flattenPlan(plan.root).filter(({ node }) => node.children.length === 0)
    expect(leaves.length).toBeGreaterThan(0)
    // If the engine renamed "number of results" this would be all zeroes.
    expect(leaves.some(({ node }) => node.rows > 0)).toBe(true)
    expect(plan.rows).toBe(2)
  })

  it('names the projected variables in the root operator', () => {
    expect(plan.root.name).toContain('?s')
    expect(plan.root.name).toContain('?town')
  })

  it('draws without producing malformed DOT', () => {
    const dot = generatePlanDot(plan)
    expect(dot).toMatch(/^digraph QueryPlan \{/)
    expect((dot.match(/(?<!\\)"/g) ?? []).length % 2).toBe(0)
    // One node declaration per operator, and an edge per parent/child link.
    expect(dot.match(/^\s+"n0[.\d]*" \[label=/gm)).toHaveLength(plan.nodeCount)
    expect(dot.match(/ -> /g)).toHaveLength(plan.nodeCount - 1)
  })
})

describe('a plan for a query that returns nothing', () => {
  // ex:nosuch matches no triple, so rows run out at the join above it: the case
  // the whole view exists for.
  const plan = planFor(`PREFIX ex: <http://ex/>
    SELECT ?s WHERE { ?s a ex:Shop ; ex:nosuch ?x }`)

  it('returns no rows at the root', () => {
    expect(plan.rows).toBe(0)
  })

  it('still shows the step that did match, so the funnel is readable', () => {
    const matched = flattenPlan(plan.root).filter(({ node }) => node.rows > 0)
    expect(matched.length).toBeGreaterThan(0)
  })

  it('has exactly one collapse point, and the drawing marks it', () => {
    const collapses = flattenPlan(plan.root).filter(({ node }) => isCollapsePoint(node))
    expect(collapses).toHaveLength(1)
    expect(generatePlanDot(plan)).toContain('nothing came out of here')
  })
})

describe('explain and query agree', () => {
  it('reports the row count the same query returns', () => {
    const store = new Store()
    try {
      store.loadTurtle(TURTLE, 'http://ex/')
      const query = 'PREFIX ex: <http://ex/> SELECT ?s WHERE { ?s a ex:Shop }'
      const rows = store.query(query, 'http://ex/') as unknown[]
      const plan = parseQueryPlan(store.explain(query, 'http://ex/'))
      expect(plan.rows).toBe(rows.length)
      expect(rows).toHaveLength(3)
    } finally {
      ;(store as { free?: () => void }).free?.()
    }
  })
})
