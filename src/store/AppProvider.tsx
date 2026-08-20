import React, { createContext, useContext, useReducer, ReactNode } from 'react'
import type { AppState, EditorLanguage, EditorTheme } from '@/types'

// Initial state
const initialState: AppState = {
  editor: {
    content: `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix contact: <http://www.w3.org/2000/10/swap/pim/contact#>.
@prefix dc: <http://purl.org/dc/elements/1.1/#>.
@prefix exterms: <http://www.example.org/terms/>.

<http://www.w3.org/People/EM/contact#me>
    rdf:type contact:Person;
    contact:fullName "Eric Miller";
    contact:mailbox <mailto:em@w3.org>;
    contact:personalTitle "Dr." ;
    contact:eg <http://www.w3.org/TR/rdf-syntax-grammar> .

<http://www.w3.org/TR/rdf-syntax-grammar>
    dc:title "RDF/XML Syntax Specification (Revised)";
    exterms:editor [
        exterms:fullName "Dave Beckett";
        exterms:homePage <http://purl.org/net/dajobe/>
    ].`,
    language: 'turtle',
    theme: 'dark',
    fontSize: 12,
    isLoading: false,
  },
  graph: {
    dotText: '',
    svgOutput: '',
    options: {
      engine: 'dot',
      format: 'svg',
      layoutDirection: 'LR',
      showPrefixes: false,
      hideTypes: false,
      hideAnnotations: false,
      showSubjects: false,
      rawOutput: false,
      sortSubjects: false,
    },
    isGenerating: false,
    error: null,
  },
  rdf: {
    quads: [],
    subjects: [],
    prefixes: {},
    selectedSubjects: [],
  },
  sparql: {
    query: 'select * {?s ?p ?o}',
    results: undefined,
    isExecuting: false,
    error: undefined,
  },
}

// Action types
type AppAction =
  | { type: 'SET_EDITOR_CONTENT'; payload: string }
  | { type: 'SET_EDITOR_LANGUAGE'; payload: EditorLanguage }
  | { type: 'SET_EDITOR_THEME'; payload: EditorTheme }
  | { type: 'SET_EDITOR_FONT_SIZE'; payload: number }
  | { type: 'SET_EDITOR_LOADING'; payload: boolean }
  | { type: 'SET_GRAPH_DOT_TEXT'; payload: string }
  | { type: 'SET_GRAPH_SVG_OUTPUT'; payload: string }
  | { type: 'SET_GRAPH_GENERATING'; payload: boolean }
  | { type: 'SET_GRAPH_ERROR'; payload: string | null }
  | { type: 'SET_GRAPH_OPTIONS'; payload: Partial<AppState['graph']['options']> }
  | { type: 'SET_RDF_QUADS'; payload: AppState['rdf']['quads'] }
  | { type: 'SET_RDF_SUBJECTS'; payload: string[] }
  | { type: 'SET_RDF_PREFIXES'; payload: Record<string, string> }
  | { type: 'SET_SELECTED_SUBJECTS'; payload: string[] }
  | { type: 'SET_SPARQL_QUERY'; payload: string }
  | { type: 'SET_SPARQL_RESULTS'; payload: any }
  | { type: 'SET_SPARQL_EXECUTING'; payload: boolean }
  | { type: 'SET_SPARQL_ERROR'; payload: string | undefined }
  | { type: 'RESET_APP' }

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_EDITOR_CONTENT':
      return { ...state, editor: { ...state.editor, content: action.payload } }
    case 'SET_EDITOR_LANGUAGE':
      return { ...state, editor: { ...state.editor, language: action.payload } }
    case 'SET_EDITOR_THEME':
      return { ...state, editor: { ...state.editor, theme: action.payload } }
    case 'SET_EDITOR_FONT_SIZE':
      return { ...state, editor: { ...state.editor, fontSize: action.payload } }
    case 'SET_EDITOR_LOADING':
      return { ...state, editor: { ...state.editor, isLoading: action.payload } }
    case 'SET_GRAPH_DOT_TEXT':
      return { ...state, graph: { ...state.graph, dotText: action.payload } }
    case 'SET_GRAPH_SVG_OUTPUT':
      return { ...state, graph: { ...state.graph, svgOutput: action.payload } }
    case 'SET_GRAPH_GENERATING':
      return { ...state, graph: { ...state.graph, isGenerating: action.payload } }
    case 'SET_GRAPH_ERROR':
      return { ...state, graph: { ...state.graph, error: action.payload } }
    case 'SET_GRAPH_OPTIONS':
      return {
        ...state,
        graph: {
          ...state.graph,
          options: { ...state.graph.options, ...action.payload }
        }
      }
    case 'SET_RDF_QUADS':
      return { ...state, rdf: { ...state.rdf, quads: action.payload } }
    case 'SET_RDF_SUBJECTS':
      return { ...state, rdf: { ...state.rdf, subjects: action.payload } }
    case 'SET_RDF_PREFIXES':
      return { ...state, rdf: { ...state.rdf, prefixes: action.payload } }
    case 'SET_SELECTED_SUBJECTS':
      return { ...state, rdf: { ...state.rdf, selectedSubjects: action.payload } }
    case 'SET_SPARQL_QUERY':
      return { ...state, sparql: { ...state.sparql, query: action.payload } }
    case 'SET_SPARQL_RESULTS':
      return { ...state, sparql: { ...state.sparql, results: action.payload } }
    case 'SET_SPARQL_EXECUTING':
      return { ...state, sparql: { ...state.sparql, isExecuting: action.payload } }
    case 'SET_SPARQL_ERROR':
      return { ...state, sparql: { ...state.sparql, error: action.payload } }
    case 'RESET_APP':
      return initialState
    default:
      return state
  }
}

// Context
interface AppContextType {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const AppContext = createContext<AppContextType | null>(null)

// Provider component
interface AppProviderProps {
  children: ReactNode
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

// Hook to use the context
export function useAppContext() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider')
  }
  return context
}