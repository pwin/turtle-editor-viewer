// RDF Types (based on RDF/JS specifications)
export interface NamedNode {
  termType: 'NamedNode'
  value: string
}

export interface BlankNode {
  termType: 'BlankNode'
  value: string
}

export interface Literal {
  termType: 'Literal'
  value: string
  datatype?: NamedNode
  language?: string
}

export type RDFTerm = NamedNode | BlankNode | Literal

export interface RDFQuad {
  subject: NamedNode | BlankNode
  predicate: NamedNode
  object: RDFTerm
  graph?: NamedNode | BlankNode
}

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

export interface EditorState {
  content: string
  language: EditorLanguage
  theme: EditorTheme
  fontSize: number
  isLoading: boolean
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
}

// SPARQL Types
export interface SPARQLQuery {
  query: string
  results?: any
  isExecuting: boolean
  error?: string
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