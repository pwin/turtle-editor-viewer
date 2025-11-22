import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { AppState, EditorLanguage, EditorTheme } from '@/types'
// import type { AppState, EditorLanguage, EditorTheme, GraphEngine, GraphFormat, LayoutDirection } from '@/types'

interface AppStore extends AppState {
  // Editor actions
  setEditorContent: (content: string) => void
  setEditorLanguage: (language: EditorLanguage) => void
  setEditorTheme: (theme: EditorTheme) => void
  setEditorFontSize: (fontSize: number) => void
  setEditorLoading: (loading: boolean) => void

  // Graph actions
  setGraphOptions: (options: Partial<AppState['graph']['options']>) => void
  setGraphDotText: (dotText: string) => void
  setGraphSvgOutput: (svgOutput: string) => void
  setGraphGenerating: (generating: boolean) => void
  setGraphError: (error: string | null) => void

  // RDF actions
  setRDFQuads: (quads: AppState['rdf']['quads']) => void
  setRDFSubjects: (subjects: string[]) => void
  setRDFPrefixes: (prefixes: Record<string, string>) => void
  setSelectedSubjects: (subjects: string[]) => void
  addRDFQuad: (quad: AppState['rdf']['quads'][0]) => void
  clearRDFStore: () => void

  // SPARQL actions
  setSPARQLQuery: (query: string) => void
  setSPARQLResults: (results: any) => void
  setSPARQLExecuting: (executing: boolean) => void
  setSPARQLError: (error: string | undefined) => void

  // File actions
  loadFile: (content: string, filename?: string) => void
  resetApp: () => void
}

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

export const useAppStore = create<AppStore>()(
  devtools(
    (set) => ({
      ...initialState,

      // Editor actions
      setEditorContent: (content) =>
        set((state) => ({
          editor: { ...state.editor, content },
        }), false, 'setEditorContent'),

      setEditorLanguage: (language) =>
        set((state) => ({
          editor: { ...state.editor, language },
        }), false, 'setEditorLanguage'),

      setEditorTheme: (theme) =>
        set((state) => ({
          editor: { ...state.editor, theme },
        }), false, 'setEditorTheme'),

      setEditorFontSize: (fontSize) =>
        set((state) => ({
          editor: { ...state.editor, fontSize },
        }), false, 'setEditorFontSize'),

      setEditorLoading: (isLoading) =>
        set((state) => ({
          editor: { ...state.editor, isLoading },
        }), false, 'setEditorLoading'),

      // Graph actions
      setGraphOptions: (options) =>
        set((state) => ({
          graph: {
            ...state.graph,
            options: { ...state.graph.options, ...options },
          },
        }), false, 'setGraphOptions'),

      setGraphDotText: (dotText) =>
        set((state) => ({
          graph: { ...state.graph, dotText },
        }), false, 'setGraphDotText'),

      setGraphSvgOutput: (svgOutput) =>
        set((state) => ({
          graph: { ...state.graph, svgOutput },
        }), false, 'setGraphSvgOutput'),

      setGraphGenerating: (isGenerating) =>
        set((state) => ({
          graph: { ...state.graph, isGenerating },
        }), false, 'setGraphGenerating'),

      setGraphError: (error) =>
        set((state) => ({
          graph: { ...state.graph, error },
        }), false, 'setGraphError'),

      // RDF actions
      setRDFQuads: (quads) =>
        set((state) => ({
          rdf: { ...state.rdf, quads },
        }), false, 'setRDFQuads'),

      setRDFSubjects: (subjects) =>
        set((state) => ({
          rdf: { ...state.rdf, subjects },
        }), false, 'setRDFSubjects'),

      setRDFPrefixes: (prefixes) =>
        set((state) => ({
          rdf: { ...state.rdf, prefixes },
        }), false, 'setRDFPrefixes'),

      setSelectedSubjects: (selectedSubjects) =>
        set((state) => ({
          rdf: { ...state.rdf, selectedSubjects },
        }), false, 'setSelectedSubjects'),

      addRDFQuad: (quad) =>
        set((state) => ({
          rdf: { ...state.rdf, quads: [...state.rdf.quads, quad] },
        }), false, 'addRDFQuad'),

      clearRDFStore: () =>
        set((state) => ({
          rdf: { ...state.rdf, quads: [], subjects: [], selectedSubjects: [] },
        }), false, 'clearRDFStore'),

      // SPARQL actions
      setSPARQLQuery: (query) =>
        set((state) => ({
          sparql: { ...state.sparql, query },
        }), false, 'setSPARQLQuery'),

      setSPARQLResults: (results) =>
        set((state) => ({
          sparql: { ...state.sparql, results },
        }), false, 'setSPARQLResults'),

      setSPARQLExecuting: (isExecuting) =>
        set((state) => ({
          sparql: { ...state.sparql, isExecuting },
        }), false, 'setSPARQLExecuting'),

      setSPARQLError: (error) =>
        set((state) => ({
          sparql: { ...state.sparql, error },
        }), false, 'setSPARQLError'),

      // File actions
      loadFile: (content) => {
        set((state) => ({
          editor: { ...state.editor, content },
        }), false, 'loadFile')
      },

      resetApp: () => set(initialState, false, 'resetApp'),
    }),
    {
      name: 'turtle-editor-store',
    }
  )
)