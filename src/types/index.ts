// RDF Types
//
// These alias the RDF/JS community types rather than redeclaring a subset.
// The hand-rolled versions they replace predated RDF 1.2 and silently excluded
// two term kinds the parser already produces: triple terms (termType 'Quad',
// valid only as an object) and literals with an initial text direction. The
// parser hands n3 term objects straight through, so this is what the values
// really are at runtime.
import type * as RDF from '@rdfjs/types'

export type NamedNode = RDF.NamedNode
export type BlankNode = RDF.BlankNode
export type Literal = RDF.Literal
/** RDF 1.2 triple term. Only ever appears in the object position. */
export type TripleTerm = RDF.Quad

export type RDFTerm = RDF.Term

export type RDFQuad = RDF.Quad

export interface RDFNode {
  termType: 'NamedNode' | 'BlankNode' | 'Literal'
  value: string
  datatype?: NamedNode
  language?: string
}

export interface RDFPrefix {
  prefix: string
  namespace: string
}

// Editor Types
export type EditorLanguage = 'turtle' | 'xml' | 'javascript' | 'dot' | 'sparql'
export type EditorTheme = 'light' | 'dark' | 'high-contrast'

/**
 * One document open in the editor pane. The first tab holds whatever the user
 * loaded or typed; further tabs hold graphs returned by CONSTRUCT / DESCRIBE
 * queries. Each tab owns its text, its language and the subjects picked for
 * the diagram, so switching or closing tabs never touches another tab's data.
 */
export interface EditorTab {
  id: string
  title: string
  content: string
  language: EditorLanguage
  /** Diagram selection while this tab is active; restored when it is again. */
  selectedSubjects: string[]
}

export interface EditorState {
  /**
   * Text and language of the active tab. The reducer keeps these in step
   * with `tabs`, so the many readers of `editor.content` need not know about
   * tabs at all.
   */
  content: string
  language: EditorLanguage
  theme: EditorTheme
  fontSize: number
  isLoading: boolean
  tabs: EditorTab[]
  activeTabId: string
  /** How many result tabs have been opened, for naming the next one. */
  resultCount: number
}

// Graph Types
export type GraphEngine = 'circo' | 'dot' | 'fdp' | 'neato' | 'osage' | 'twopi'
export type GraphFormat = 'svg' | 'png' | 'json' | 'xdot' | 'plain' | 'ps'
export type LayoutDirection = 'LR' | 'RL' | 'TB' | 'BT'

export interface GraphOptions {
  engine: GraphEngine
  format: GraphFormat
  layoutDirection: LayoutDirection
  showPrefixes: boolean
  hideTypes: boolean
  hideAnnotations: boolean
  showSubjects: boolean
  rawOutput: boolean
  sortSubjects: boolean
  /** Show rdfs:label / skos:prefLabel instead of the raw IRI in the subject picker. */
  showLabels: boolean
  /** Same, for the node boxes in the rendered diagram. */
  showNodeLabels: boolean
  /** Same, for the property names on the diagram's edges. */
  showPredicateLabels: boolean
  /** Draw dashed links from each triple-term node to the subject and object it mentions. */
  linkTripleTerms: boolean
}

export interface GraphState {
  dotText: string
  svgOutput: string
  options: GraphOptions
  isGenerating: boolean
  error: string | null
}

// RDF Store Types
export interface RDFStore {
  quads: RDFQuad[]
  subjects: string[]
  prefixes: Record<string, string>
  selectedSubjects: string[]
  /** Subject key -> human-readable label, for subjects that have one. */
  labels: Record<string, string>
}

// SPARQL Types
export interface SPARQLQuery {
  query: string
  results?: any
  isExecuting: boolean
  error?: string
  /** Open the graph a CONSTRUCT / DESCRIBE returns in a new editor tab. */
  openResultsInTab: boolean
}

// File Types
export interface FileOperation {
  type: 'load' | 'save' | 'url-load'
  filename?: string
  url?: string
  content?: string
}

// App State
export interface AppState {
  editor: EditorState
  graph: GraphState
  rdf: RDFStore
  sparql: SPARQLQuery
}

// Component Props
export interface ComponentProps {
  className?: string
  children?: React.ReactNode
}

// Utility Types
export interface ErrorState {
  message: string
  details?: string
}

export interface LoadingState {
  isLoading: boolean
  message?: string
}

// Viz.js Types
export interface VizOptions {
  engine: string
  format: string
}

export interface VizResult {
  data: string
  errors?: string[]
}

// URL Parameter Types
export interface URLParams {
  dot?: string
  rdfa?: string
}