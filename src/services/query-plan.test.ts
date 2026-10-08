import { describe, expect, it } from 'vitest'
import {
  flattenPlan,
  formatRows,
  formatSeconds,
  generatePlanDot,
  isCollapsePoint,
  operatorDetail,
  operatorKind,
  parseQueryPlan,
} from './query-plan'

/** The shape holosdb returns, keys and all: a query whose rows run out partway up. */
const RAW = JSON.stringify({
  'planning duration in seconds': 0.003,
  plan: {
    name: 'Project(?shop, ?town)',
    'number of results': 0,
    'duration in seconds': 0.007,
    children: [
      {
        name: 'LeftJoin(HashBuildLeftProbeRight, keys = ?shop)',
        'number of results': 0,
        'duration in seconds': 0.007,
        children: [
          {
            name: 'QuadPattern(?shop <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/bookshop-trail/schema#Bookshop>)',
            'number of results': 33,
            'duration in seconds': 0.002,
            children: [],
          },
          {
            name: 'QuadPattern(?shop <https://example.org/bookshop-trail/schema#inSettlement> ?s)',
            'number of results': 0,
            'duration in seconds': 0,
            children: [],
          },
        ],
      },
    ],
  },
})

describe('parseQueryPlan', () => {
  it('reads the tree, the statistics and the totals', () => {
    const plan = parseQueryPlan(RAW)
    expect(plan.planningSeconds).toBeCloseTo(0.003)
    expect(plan.runSeconds).toBeCloseTo(0.007)
    expect(plan.rows).toBe(0)
    expect(plan.nodeCount).toBe(4)
    expect(plan.root.kind).toBe('Project')
    expect(plan.root.detail).toBe('?shop, ?town')
    expect(plan.root.children[0].children.map(n => n.rows)).toEqual([33, 0])
  })

  it('gives every node an id unique within the plan', () => {
    const ids = flattenPlan(parseQueryPlan(RAW).root).map(({ node }) => node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('reads a missing statistic as zero rather than failing', () => {
    const plan = parseQueryPlan('{"plan":{"name":"Project(?s)"}}')
    expect(plan.root.rows).toBe(0)
    expect(plan.root.seconds).toBe(0)
    expect(plan.root.children).toEqual([])
  })

  it('rejects something that is not a plan, with a message saying so', () => {
    expect(() => parseQueryPlan('not json')).toThrow(/not JSON/)
    expect(() => parseQueryPlan('{"planning duration in seconds":1}')).toThrow(/no plan/)
  })
})

describe('operator names', () => {
  it('splits the kind from its arguments', () => {
    expect(operatorKind('LeftJoin(HashBuildLeftProbeRight, keys = ?s)')).toBe('LeftJoin')
    expect(operatorDetail('LeftJoin(HashBuildLeftProbeRight, keys = ?s)')).toBe('HashBuildLeftProbeRight, keys = ?s')
  })

  it('copes with an operator that has no arguments', () => {
    expect(operatorKind('Distinct')).toBe('Distinct')
    expect(operatorDetail('Distinct')).toBe('')
  })

  it('keeps nested brackets with the detail', () => {
    expect(operatorDetail('Filter(("en" = LANG(?town)))')).toBe('("en" = LANG(?town))')
  })
})

describe('isCollapsePoint', () => {
  it('marks a node that produced nothing from children that produced something', () => {
    const plan = parseQueryPlan(RAW)
    const join = plan.root.children[0]
    expect(isCollapsePoint(join)).toBe(true)
  })

  it('does not mark a leaf that simply matched nothing', () => {
    const plan = parseQueryPlan(RAW)
    const emptyPattern = plan.root.children[0].children[1]
    expect(emptyPattern.rows).toBe(0)
    expect(isCollapsePoint(emptyPattern)).toBe(false)
  })

  it('does not mark a node on a query that returned rows', () => {
    const plan = parseQueryPlan(
      '{"plan":{"name":"Project(?s)","number of results":5,"duration in seconds":0.1,"children":[{"name":"QuadPattern(?s ?p ?o)","number of results":5,"duration in seconds":0.1,"children":[]}]}}',
    )
    expect(isCollapsePoint(plan.root)).toBe(false)
  })
})

describe('formatting', () => {
  it('reports durations at a readable scale', () => {
    expect(formatSeconds(0)).toBe('0 ms')
    expect(formatSeconds(0.0000004)).toBe('<1 ms')
    expect(formatSeconds(0.007)).toBe('7 ms')
    expect(formatSeconds(2.5)).toBe('2.50 s')
  })

  it('pluralises rows and groups thousands', () => {
    expect(formatRows(1)).toBe('1 row')
    expect(formatRows(0)).toBe('0 rows')
    expect(formatRows(31049)).toBe('31,049 rows')
  })
})

describe('generatePlanDot', () => {
  const dot = generatePlanDot(parseQueryPlan(RAW))

  it('is a digraph with one node per operator', () => {
    expect(dot).toMatch(/^digraph QueryPlan \{/)
    expect(dot.trimEnd().endsWith('}')).toBe(true)
    expect(dot.match(/^\s+"n0[.\d]*" \[label=/gm)).toHaveLength(4)
  })

  it('points children at their parent, so rows flow the way they ran', () => {
    expect(dot).toContain('"n0.0" -> "n0"')
    expect(dot).toContain('"n0.0.0" -> "n0.0"')
    expect(dot).toContain('[label="33 rows"]')
  })

  it('marks the collapse point and says why', () => {
    const lines = dot.split('\n').filter(l => l.includes('nothing came out of here'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('LeftJoin')
    expect(lines[0]).toContain('penwidth=2')
  })

  it('carries each operator kind, row count and duration in the label', () => {
    expect(dot).toContain('QuadPattern')
    expect(dot).toContain('33 rows · 2 ms')
  })

  it('escapes quotes from an operator argument so the DOT stays well formed', () => {
    const plan = parseQueryPlan('{"plan":{"name":"Filter((\\"en\\" = LANG(?town)))","number of results":1,"children":[]}}')
    const out = generatePlanDot(plan)
    expect(out).toContain('\\"en\\"')
    // Every quoted string closes: an odd count would mean an unescaped quote.
    expect((out.match(/(?<!\\)"/g) ?? []).length % 2).toBe(0)
  })

  it('wraps a long argument instead of letting the box stretch', () => {
    const long = 'QuadPattern(?shop <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/bookshop-trail/schema#Bookshop>)'
    const out = generatePlanDot(parseQueryPlan(`{"plan":{"name":${JSON.stringify(long)},"number of results":1,"children":[]}}`))
    const label = out.split('\n').find(l => l.includes('label='))!
    expect(label).toContain('\\n')
    for (const segment of label.split('\\n')) expect(segment.length).toBeLessThan(120)
  })

  it("writes DOT's own line break, not an escaped backslash", () => {
    // `\n` inside a label is a line break; `\\n` is a literal backslash and an
    // n, which is what escaping the joined string instead of each line gives.
    for (const line of dot.split('\n').filter(l => l.includes('label='))) {
      expect(line).not.toMatch(/\\\\n/)
    }
    expect(dot).toMatch(/label="[^"]*\\n[^"]*"/)
  })

  it('takes the layout direction it is given', () => {
    expect(generatePlanDot(parseQueryPlan(RAW), 'LR')).toContain('rankdir="LR"')
  })
})
