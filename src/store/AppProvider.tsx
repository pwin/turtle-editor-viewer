import React, { createContext, useContext, useReducer, ReactNode } from 'react'
import type { AppState, EditorLanguage, EditorTheme } from '@/types'
import {
  SOURCE_TAB_ID,
  activateTab,
  closeTab,
  createSourceTab,
  openTab,
  updateActiveTab,
  type OpenTabPayload,
} from './editor-tabs'

const SAMPLE_CONTENT = `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
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
    ].`

// Initial state
const initialState: AppState = {
  editor: {
    content: SAMPLE_CONTENT,
    language: 'turtle',
    theme: 'dark',
    fontSize: 12,
    isLoading: false,
    tabs: [createSourceTab(SAMPLE_CONTENT, 'turtle')],
    activeTabId: SOURCE_TAB_ID,
    resultCount: 0,
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
      showLabels: true,
      showNodeLabels: true,
      showPredicateLabels: true,
      linkTripleTerms: false,
    },
    isGenerating: false,
    error: null,
  },
  rdf: {
    quads: [],
    subjects: [],
    prefixes: {},
    selectedSubjects: [],
    labels: {},
  },
  sparql: {
    query: 'select * {?s ?p ?o}',
    results: undefined,
    isExecuting: false,
    error: undefined,
    openResultsInTab: true,
  },
}

// Action types
type AppAction =
  | { type: 'SET_EDITOR_CONTENT'; payload: string }
  | { type: 'SET_EDITOR_LANGUAGE'; payload: EditorLanguage }
  | { type: 'OPEN_EDITOR_TAB'; payload: OpenTabPayload }
  | { type: 'ACTIVATE_EDITOR_TAB'; payload: string }
  | { type: 'CLOSE_EDITOR_TAB'; payload: string }
  | { type: 'RENAME_EDITOR_TAB'; payload: string }
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
  | { type: 'SET_RDF_LABELS'; payload: Record<string, string> }
  | { type: 'SET_SELECTED_SUBJECTS'; payload: string[] }
  | { type: 'SET_SPARQL_QUERY'; payload: string }
  | { type: 'SET_SPARQL_RESULTS'; payload: any }
  | { type: 'SET_SPARQL_EXECUTING'; payload: boolean }
  | { type: 'SET_SPARQL_ERROR'; payload: string | undefined }
  | { type: 'SET_SPARQL_OPEN_RESULTS_IN_TAB'; payload: boolean }
  | { type: 'RESET_APP' }

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // The document lives on the active tab; these write through to it and
    // the tab helpers refresh editor.content / editor.language to match.
    case 'SET_EDITOR_CONTENT':
      return updateActiveTab(state, { content: action.payload })
    case 'SET_EDITOR_LANGUAGE':
      return updateActiveTab(state, { language: action.payload })
    case 'RENAME_EDITOR_TAB':
      return updateActiveTab(state, { title: action.payload })
    case 'OPEN_EDITOR_TAB':
      return openTab(state, action.payload)
    case 'ACTIVATE_EDITOR_TAB':
      return activateTab(state, action.payload)
    case 'CLOSE_EDITOR_TAB':
      return closeTab(state, action.payload)
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
    case 'SET_RDF_LABELS':
      return { ...state, rdf: { ...state.rdf, labels: action.payload } }
    case 'SET_SELECTED_SUBJECTS':
      // Per tab as well, so a tab's diagram comes back when the tab does.
      return updateActiveTab(state, { selectedSubjects: action.payload })
    case 'SET_SPARQL_QUERY':
      return { ...state, sparql: { ...state.sparql, query: action.payload } }
    case 'SET_SPARQL_RESULTS':
      return { ...state, sparql: { ...state.sparql, results: action.payload } }
    case 'SET_SPARQL_EXECUTING':
      return { ...state, sparql: { ...state.sparql, isExecuting: action.payload } }
    case 'SET_SPARQL_ERROR':
      return { ...state, sparql: { ...state.sparql, error: action.payload } }
    case 'SET_SPARQL_OPEN_RESULTS_IN_TAB':
      return { ...state, sparql: { ...state.sparql, openResultsInTab: action.payload } }
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