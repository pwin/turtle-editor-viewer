import { DataFactory, Writer } from 'n3'
import type { Validator } from 'shacl-wasm'
import type { RDFQuad, ShaclInference, ShaclReport, ShaclResult, ShaclSeverity } from '@/types'
import { loadShaclEngine } from './shacl-engine'
import { renderPathExpression } from './shacl-path'

/**
 * Validates a data graph against a shapes graph with the SHACL engine and
 * turns the engine's report into something a table can show: severities as
 * words, message templates filled in, property paths written out, and nested
 * property shapes named after the shape they belong to.
 *
 * Everything runs in the page. The data and the shapes are the quads the
 * editor already parsed, handed over as N-Triples text; nothing is fetched
 * and nothing is sent.
 *
 * `inference` is passed straight to the engine: `none` validates the data as
 * it stands, `rdfs` the RDFS closure of it, and `rules` / `rules-iterated`
 * run the shapes graph's SHACL-AF rules first, so a result can depend on a
 * triple that was inferred rather than asserted. The data in the tab is never
 * changed; the expanded graph lives only for the run.
 */

const SH = 'http://www.w3.org/ns/shacl#'
const SH_PROPERTY = `${SH}property`
const SH_PATH = `${SH}path`

const SEVERITY: Record<string, ShaclSeverity> = {
  [`${SH}Violation`]: 'Violation',
  [`${SH}Warning`]: 'Warning',
  [`${SH}Info`]: 'Info',
}
const SEVERITY_RANK: Record<ShaclSeverity, number> = { Violation: 0, Warning: 1, Info: 2 }

/** Matches the base RDFParser gives n3, so relative IRIs mean the same thing in both. */
const BASE = 'http://example.org/'

/** Where nested property shapes get their names. Never shown; the label map is. */
const SHAPE_BASE = 'urn:turtle-editor-viewer:shape:'

/** One result as the engine hands it back; the optional fields are absent rather than null. */
interface EngineResult {
  focusNode: string
  path?: string | null
  value?: string | null
  severity: string
  sourceShape?: string | null
  component: string
  message?: string
}

interface CompiledShapes {
  validator: Validator
  shapeCount: number
  /** Skolem IRI minted for a nested property shape -> "<parent> › property N". */
  labelByShape: Map<string, string>
  /** Shape IRI -> its sh:path rendered as an expression, for paths that are not plain IRIs. */
  pathByShape: Map<string, string>
}

// Compiling the shapes is the expensive half and they rarely change between
// runs, so the last few compilations are kept, keyed by their N-Triples text.
const compiled = new Map<string, CompiledShapes>()
const KEEP = 3

export async function validateWithShapes(
  data: RDFQuad[],
  shapes: RDFQuad[],
  prefixes: Record<string, string> = {},
  inference: ShaclInference = 'none',
): Promise<ShaclReport> {
  const shapesGraph = await compileShapes(shapes)
  const report = shapesGraph.validator.validateTurtle(toNTriples(data), BASE, inference)
  try {
    const results = (report.results as EngineResult[]).map(r => toResult(r, shapesGraph))
    results.sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        a.focusNode.localeCompare(b.focusNode) ||
        (a.path ?? '').localeCompare(b.path ?? '') ||
        a.message.localeCompare(b.message),
    )
    const counts: Record<ShaclSeverity, number> = { Violation: 0, Warning: 0, Info: 0 }
    for (const r of results) counts[r.severity]++
    return {
      conforms: report.conforms,
      inference,
      results,
      counts,
      shapeCount: shapesGraph.shapeCount,
      turtle: report.toTurtle(),
      prefixes,
    }
  } finally {
    report.free()
  }
}

async function compileShapes(shapes: RDFQuad[]): Promise<CompiledShapes> {
  const named = nameNestedShapes(shapes)
  const text = toNTriples(named.quads)
  const cached = compiled.get(text)
  if (cached) return cached

  const { Validator } = await loadShaclEngine()
  const validator = Validator.fromTurtle(text, BASE)
  const entry: CompiledShapes = {
    validator,
    shapeCount: validator.shapeCount,
    labelByShape: named.labelByShape,
    pathByShape: named.pathByShape,
  }
  compiled.set(text, entry)
  while (compiled.size > KEEP) {
    const [oldestKey, oldest] = compiled.entries().next().value as [string, CompiledShapes]
    oldest.validator.free()
    compiled.delete(oldestKey)
  }
  return entry
}

function toResult(r: EngineResult, shapesGraph: CompiledShapes): ShaclResult {
  const rawPath = r.path ?? null
  const value = r.value ?? null
  const source = r.sourceShape ?? null
  // A path that is an expression rather than an IRI comes back as the engine's
  // own blank node label; the rendering made while compiling replaces it.
  const path =
    rawPath !== null && rawPath.startsWith('_:') && source
      ? (shapesGraph.pathByShape.get(source) ?? rawPath)
      : rawPath
  const sourceShape = source ? (shapesGraph.labelByShape.get(source) ?? source) : null
  return {
    severity: SEVERITY[r.severity] ?? 'Info',
    focusNode: r.focusNode,
    path,
    value,
    message: fillMessageTemplate(r.message ?? '', r.focusNode, path, value) || defaultMessage(r.component),
    sourceShape,
    component: r.component,
  }
}

/**
 * sh:message is a template: SHACL says `{$this}`, `{$path}` and `{$value}`
 * (or the `{?name}` spelling) stand for the result's focus node, path and
 * value. The engine returns the text as written, so they are filled here.
 * Constraint parameters such as `{$maxCount}` are not in the result and are
 * left as they are rather than replaced with something wrong.
 */
export function fillMessageTemplate(
  message: string,
  focusNode: string,
  path: string | null,
  value: string | null,
): string {
  if (!message.includes('{')) return message
  let out = message.replace(/\{[$?]this\}/g, () => focusNode)
  if (path !== null) out = out.replace(/\{[$?]path\}/g, () => path)
  if (value !== null) out = out.replace(/\{[$?]value\}/g, () => value)
  return out
}

/** For a shape with no sh:message: "Does not satisfy sh:minCount" and the like. */
function defaultMessage(component: string): string {
  const local = component.slice(component.lastIndexOf('#') + 1).replace(/ConstraintComponent$/, '')
  return local ? `Does not satisfy sh:${local.charAt(0).toLowerCase()}${local.slice(1)}` : 'Does not conform'
}

interface NamedShapes {
  quads: RDFQuad[]
  labelByShape: Map<string, string>
  pathByShape: Map<string, string>
}

/**
 * Gives every nested `sh:property [ ... ]` shape a real IRI before compiling.
 *
 * A property-constraint result names the *nested* property shape as its
 * source, and a blank node has no name a reader could use; worse, the engine's
 * label for it (`_:0_b6`) has nothing to do with the label from our own parse,
 * so nothing could be looked up afterwards. Naming the shapes first sidesteps
 * that: the engine reports the IRI minted here, which keys a map to a label
 * of the form "ex:ShopShape › property 2". The same pass renders any sh:path
 * that is an expression, keyed the same way.
 */
function nameNestedShapes(shapes: RDFQuad[]): NamedShapes {
  const parentOf = new Map<string, string>()
  const bySubject = new Map<string, RDFQuad[]>()
  for (const q of shapes) {
    if (q.predicate.value === SH_PROPERTY && q.object.termType === 'BlankNode') {
      parentOf.set(q.object.value, q.subject.value)
    }
    const list = bySubject.get(q.subject.value)
    if (list) list.push(q)
    else bySubject.set(q.subject.value, [q])
  }

  const pathOf = new Map<string, string>()
  for (const q of shapes) {
    if (q.predicate.value === SH_PATH && q.object.termType === 'BlankNode') {
      pathOf.set(q.subject.value, renderPathExpression(q.object, bySubject))
    }
  }

  // The nearest named ancestor is what the label mentions; a blank node shape
  // nested in a blank node shape reports under the named shape above both.
  const namedAncestor = (node: string): string => {
    let current: string | undefined = node
    for (let i = 0; current !== undefined && i < 20; i++) {
      if (!parentOf.has(current)) return current
      current = parentOf.get(current)
    }
    return node
  }

  const skolemFor = new Map<string, string>()
  const labelByShape = new Map<string, string>()
  const pathByShape = new Map<string, string>()
  const countByParent = new Map<string, number>()
  for (const blank of parentOf.keys()) {
    const parent = namedAncestor(blank)
    const n = (countByParent.get(parent) ?? 0) + 1
    countByParent.set(parent, n)
    const iri = `${SHAPE_BASE}${skolemFor.size + 1}`
    skolemFor.set(blank, iri)
    labelByShape.set(iri, `${parent} › property ${n}`)
    const expression = pathOf.get(blank)
    if (expression !== undefined) pathByShape.set(iri, expression)
  }
  for (const [node, expression] of pathOf) {
    if (!skolemFor.has(node)) pathByShape.set(node, expression)
  }
  if (skolemFor.size === 0) return { quads: shapes, labelByShape, pathByShape }

  const rename = <T extends RDFQuad['subject'] | RDFQuad['object']>(term: T): T =>
    term.termType === 'BlankNode' && skolemFor.has(term.value)
      ? (DataFactory.namedNode(skolemFor.get(term.value) as string) as unknown as T)
      : term
  const quads = shapes.map(q => DataFactory.quad(rename(q.subject), q.predicate, rename(q.object), q.graph))
  return { quads, labelByShape, pathByShape }
}

/**
 * N-Triples is what crosses into the engine: every term written in full, so
 * the prefixes a document happened to use play no part, and n3 writes RDF 1.2
 * triple terms and text directions in this mode too. The in-memory writer
 * completes synchronously.
 */
function toNTriples(quads: RDFQuad[]): string {
  const writer = new Writer({ format: 'N-Triples' })
  writer.addQuads(quads)
  let out = ''
  let failure: Error | undefined
  writer.end((error, result) => {
    if (error) failure = error
    else out = result
  })
  if (failure) throw failure
  return out
}
