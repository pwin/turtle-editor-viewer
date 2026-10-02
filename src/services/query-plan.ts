import type { PlanNode, QueryPlan } from '@/types'

/**
 * Reads the query plan holosdb returns from `Store.explain`, and draws it.
 *
 * The plan is a tree of operators carrying the statistics from a real run --
 * `explain` drains the results to collect them -- so each node says how many
 * rows it produced and how long it took. Read from the leaves upward, that is
 * the query's funnel: where rows came from, where they multiplied, and where
 * they ran out. The last is the reason to have this at all, because an empty
 * result tells you nothing about which line of the query emptied it.
 */

/** The engine's JSON, whose keys are sentences. */
interface RawPlanNode {
  name?: unknown
  'number of results'?: unknown
  'duration in seconds'?: unknown
  children?: unknown
}

const asNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

/**
 * The operator's kind: the name up to its first bracket. `QuadPattern(?s ?p ?o)`
 * is a `QuadPattern`, and the arguments are the detail beside it.
 */
export function operatorKind(name: string): string {
  const bracket = name.indexOf('(')
  return (bracket === -1 ? name : name.slice(0, bracket)).trim() || 'Operator'
}

/** The arguments inside the outermost brackets, or '' when there are none. */
export function operatorDetail(name: string): string {
  const open = name.indexOf('(')
  return open === -1 || !name.endsWith(')') ? '' : name.slice(open + 1, -1).trim()
}

function toNode(raw: RawPlanNode, path: string): PlanNode {
  const name = typeof raw.name === 'string' ? raw.name : 'Operator'
  const children = Array.isArray(raw.children)
    ? raw.children.map((child, index) => toNode((child ?? {}) as RawPlanNode, `${path}.${index}`))
    : []
  return {
    id: path,
    name,
    kind: operatorKind(name),
    detail: operatorDetail(name),
    rows: asNumber(raw['number of results']),
    seconds: asNumber(raw['duration in seconds']),
    children,
  }
}

/**
 * Parse the JSON `explain` returns. Throws only when it is not a plan at all;
 * a node missing a count is read as zero rather than rejected, so a future
 * field rename costs a statistic and not the whole view.
 */
export function parseQueryPlan(json: string): QueryPlan {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('The engine did not return a query plan (the explanation was not JSON).')
  }
  const top = (raw ?? {}) as { plan?: unknown; 'planning duration in seconds'?: unknown }
  if (typeof top.plan !== 'object' || top.plan === null) {
    throw new Error('The engine did not return a query plan (no plan in the explanation).')
  }
  const root = toNode(top.plan as RawPlanNode, 'n0')
  return {
    planningSeconds: asNumber(top['planning duration in seconds']),
    runSeconds: root.seconds,
    rows: root.rows,
    root,
    nodeCount: countNodes(root),
  }
}

function countNodes(node: PlanNode): number {
  return 1 + node.children.reduce((total, child) => total + countNodes(child), 0)
}

/** Every node, parents before children, for a table that reads like the tree. */
export function flattenPlan(node: PlanNode, depth = 0): { node: PlanNode; depth: number }[] {
  return [{ node, depth }, ...node.children.flatMap(child => flattenPlan(child, depth + 1))]
}

/**
 * A node that produced nothing while its children produced something: the
 * point where the query stopped having an answer. Marking it is the whole
 * point of the view -- it is the line to go and look at.
 */
export function isCollapsePoint(node: PlanNode): boolean {
  return node.rows === 0 && node.children.some(child => child.rows > 0)
}

/** Readable duration: sub-millisecond timings are noise, not information. */
export function formatSeconds(seconds: number): string {
  if (seconds <= 0) return '0 ms'
  const ms = seconds * 1000
  if (ms < 1) return '<1 ms'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${seconds.toFixed(2)} s`
}

export function formatRows(rows: number): string {
  return `${rows.toLocaleString('en-GB')} row${rows === 1 ? '' : 's'}`
}

const escapeDot = (text: string) => text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

/**
 * Wrap long text into lines, so an operator's arguments stay a readable box.
 *
 * Returns the lines rather than joining them, because the escaping has to
 * happen per line: DOT's own line break inside a label is the two characters
 * `\n`, and running the joined string through escapeDot would turn that
 * backslash into `\\` -- a literal backslash-n in the rendered box.
 */
function wrapLines(text: string, width = 44): string[] {
  if (text.length <= width) return [text]
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line === '') line = word
    else if (`${line} ${word}`.length <= width) line += ` ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  if (line !== '') lines.push(line)
  // A single unbreakable token (a long IRI) is cut rather than left to stretch.
  return lines.flatMap(l => (l.length <= width ? [l] : (l.match(new RegExp(`.{1,${width}}`, 'g')) ?? [l])))
}

/** A DOT label from parts: each line escaped, then joined by DOT's line break. */
function dotLabel(parts: string[]): string {
  return parts
    .filter(Boolean)
    .flatMap(part => wrapLines(part))
    .map(escapeDot)
    .join('\\n')
}

/**
 * The plan as a Graphviz digraph: operators as boxes, rows flowing upward
 * from the leaves the way they do when the query runs. Edges are labelled
 * with the child's row count, because the number that matters at a join is
 * what arrived, not what the node is called.
 *
 * Colour carries one thing only: a node that emptied the query is red, and
 * everything else is quiet. Nodes are shaded by how many rows they produced
 * relative to the busiest, so a step that multiplied rows is visible without
 * reading any number.
 */
export function generatePlanDot(plan: QueryPlan, layoutDirection = 'BT'): string {
  const nodes = flattenPlan(plan.root)
  const busiest = Math.max(...nodes.map(({ node }) => node.rows), 1)
  const lines: string[] = [
    'digraph QueryPlan {',
    `  rankdir="${layoutDirection}";`,
    '  node [shape="box", style="rounded,filled", fontname="Helvetica", fontsize=10];',
    '  edge [fontname="Helvetica", fontsize=9, color="#6c757d"];',
    '',
  ]

  for (const { node } of nodes) {
    const collapsed = isCollapsePoint(node)
    // Shade by share of the busiest operator: pale for few rows, deeper for many.
    const share = node.rows / busiest
    const fill = collapsed ? '#f8d7da' : share > 0.66 ? '#cfe2ff' : share > 0.2 ? '#e7f1ff' : '#f8f9fa'
    const border = collapsed ? '#dc3545' : node.kind === 'QuadPattern' ? '#0d6efd' : '#adb5bd'
    const label = dotLabel([
      node.kind,
      node.detail,
      `${formatRows(node.rows)} · ${formatSeconds(node.seconds)}`,
      collapsed ? 'nothing came out of here' : '',
    ])
    lines.push(
      `  "${node.id}" [label="${label}",fillcolor="${fill}",color="${border}"` +
        `${collapsed ? ',penwidth=2' : ''}];`,
    )
  }

  lines.push('')
  for (const { node } of nodes) {
    for (const child of node.children) {
      lines.push(`  "${child.id}" -> "${node.id}" [label="${escapeDot(formatRows(child.rows))}"];`)
    }
  }

  lines.push('}')
  return lines.join('\n')
}
