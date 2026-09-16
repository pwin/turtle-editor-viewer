import { useEffect, useRef, Suspense, lazy } from 'react'
import EditorToolbar from './EditorToolbar'
import EditorTabs from './EditorTabs'
import { useAppContext } from '@/store/AppProvider'
import { SOURCE_TAB_ID } from '@/store/editor-tabs'
import { RDFParser } from '@/services/rdf-parser'
import { GraphGenerator } from '@/services/graph-generator'
import { FileHandler } from '@/services/file-handler'
import { SHACL_INFERENCE_MODES, type ShaclInference } from '@/types'
import './EditorPane.css'

const MonacoEditorComponent = lazy(() => import('./MonacoEditorComponent'))

function EditorPane() {
  const { state, dispatch } = useAppContext()

  // Check for URL parameters on mount
  useEffect(() => {
    const checkURLParams = async () => {
      const dotUrl = FileHandler.getURLParameter('dot')
      const rdfaUrl = FileHandler.getURLParameter('rdfa')
      const shapesUrl = FileHandler.getURLParameter('shapes')
      const inference = FileHandler.getURLParameter('inference')
      const fileName = (url: string) => decodeURIComponent(url.split('?')[0].split('/').pop() || '')

      if (dotUrl) {
        dispatch({ type: 'SET_EDITOR_LOADING', payload: true })
        try {
          const result = await FileHandler.loadWithCORS(dotUrl)
          if (!result.error) {
            dispatch({ type: 'SET_EDITOR_CONTENT', payload: result.content })
            if (fileName(dotUrl)) dispatch({ type: 'RENAME_EDITOR_TAB', payload: fileName(dotUrl) })
            // Auto-detect language will happen in the next effect
          } else {
            console.error('Failed to load DOT URL:', result.error)
            dispatch({ type: 'SET_EDITOR_CONTENT', payload: `# Error loading DOT from URL:\n# ${result.error}` })
          }
        } catch (e) {
            console.error('Exception loading DOT URL:', e)
        } finally {
            dispatch({ type: 'SET_EDITOR_LOADING', payload: false })
        }
      } else if (rdfaUrl) {
        dispatch({ type: 'SET_EDITOR_LOADING', payload: true })
        try {
           const result = await FileHandler.extractRDFa(rdfaUrl)
           if (!result.error) {
             dispatch({ type: 'SET_EDITOR_CONTENT', payload: result.content })
           } else {
             console.error('Failed to load RDFa URL:', result.error)
             dispatch({ type: 'SET_EDITOR_CONTENT', payload: `# Error loading RDFa from URL:\n# ${result.error}` })
           }
        } catch (e) {
            console.error('Exception loading RDFa URL:', e)
        } finally {
            dispatch({ type: 'SET_EDITOR_LOADING', payload: false })
        }
      }

      // ?shapes=<url> opens a SHACL shapes graph in its own tab and selects it
      // for validation, leaving the data tab in front.
      if (shapesUrl) {
        try {
          const result = await FileHandler.loadWithCORS(shapesUrl)
          if (!result.error) {
            dispatch({
              type: 'OPEN_EDITOR_TAB',
              payload: { id: 'shapes', title: fileName(shapesUrl) || 'Shapes', content: result.content, language: 'turtle' },
            })
            dispatch({ type: 'SET_SHACL_SHAPES_TAB', payload: 'shapes' })
            dispatch({ type: 'ACTIVATE_EDITOR_TAB', payload: SOURCE_TAB_ID })
          } else {
            console.error('Failed to load shapes URL:', result.error)
          }
        } catch (e) {
          console.error('Exception loading shapes URL:', e)
        }
      }

      // ?inference=rules (or rdfs, rules-iterated) presets the Inference
      // dropdown, so a link can carry a shapes graph whose rules are meant to
      // run. Anything unrecognised is ignored rather than guessed at.
      if (inference && (SHACL_INFERENCE_MODES as readonly string[]).includes(inference)) {
        dispatch({ type: 'SET_SHACL_INFERENCE', payload: inference as ShaclInference })
      } else if (inference) {
        console.warn(`Ignoring ?inference=${inference}: expected one of ${SHACL_INFERENCE_MODES.join(', ')}`)
      }
    }

    checkURLParams()
  }, []) // Run once on mount

  // Debounce typing, but not a tab switch: the other tab's document is
  // complete, so its diagram should come straight back.
  const lastTabId = useRef(state.editor.activeTabId)

  // Auto-detect language and refresh graph/data on content change
  useEffect(() => {
    const content = state.editor.content
    const trimmed = content.trim()
    const tabSwitched = state.editor.activeTabId !== lastTabId.current
    lastTabId.current = state.editor.activeTabId

    // 1. Auto-detect language
    let newLang = state.editor.language
    if (trimmed.toLowerCase().startsWith('digraph')) {
      newLang = 'dot'
    } else if (trimmed.startsWith('<') && trimmed.includes('rdf:RDF')) {
      // Same test as RDFParser.detectFormat. A bare '<' is not enough: Turtle
      // with no prefix declarations starts with an IRI.
      newLang = 'xml'
    } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      newLang = 'javascript'
    } else {
      newLang = 'turtle'
    }
    
    if (newLang !== state.editor.language) {
      dispatch({ type: 'SET_EDITOR_LANGUAGE', payload: newLang })
    }

    // 2. Automate diagramming and data population (debounced)
    const timer = setTimeout(async () => {
      if (newLang === 'dot') {
        dispatch({ type: 'SET_GRAPH_DOT_TEXT', payload: content })
        // Clear RDF subjects if it's DOT? Or keep?
        // dispatch({ type: 'SET_RDF_SUBJECTS', payload: [] })
      } else if (newLang === 'turtle' || newLang === 'xml' || newLang === 'javascript') {
        // Parse RDF
        const parser = new RDFParser()
        const result = await parser.parseRDF(content, newLang)
        
        if (!result.error) {
          // Update store (subjects/prefixes)
          dispatch({ type: 'SET_RDF_QUADS', payload: result.quads })
          dispatch({ type: 'SET_RDF_SUBJECTS', payload: result.subjects })
          dispatch({ type: 'SET_RDF_LABELS', payload: result.labels ?? {} })
          dispatch({ type: 'SET_RDF_PREFIXES', payload: result.prefixes })
          
          // Refresh graph if we have selected subjects
          if (state.rdf.selectedSubjects.length > 0 && result.quads.length > 0) {
             dispatch({ type: 'SET_GRAPH_GENERATING', payload: true })
             try {
                const generator = new GraphGenerator()
                const graphResult = generator.generateDotFromRDF(
                  result.quads,
                  state.rdf.selectedSubjects,
                  state.graph.options,
                  result.prefixes,
                  result.labels ?? {}
                )
                
                if (!graphResult.error) {
                  dispatch({ type: 'SET_GRAPH_DOT_TEXT', payload: graphResult.dotText })
                  dispatch({ type: 'SET_GRAPH_ERROR', payload: null })
                }
             } catch (e) {
               // ignore generation errors during typing
             } finally {
               dispatch({ type: 'SET_GRAPH_GENERATING', payload: false })
             }
          }
        }
      }
    }, tabSwitched ? 0 : 1000) // 1 second debounce while typing

    return () => clearTimeout(timer)
  }, [state.editor.content, state.editor.activeTabId]) // Not options: they are applied by their own handlers

  const handleContentChange = (content: string) => {
    dispatch({ type: 'SET_EDITOR_CONTENT', payload: content })
  }

  // Auto-select first 10 subjects when RDF data is loaded
  useEffect(() => {
    if (state.rdf.subjects.length > 0 && state.rdf.selectedSubjects.length === 0 && state.editor.language !== 'dot') {
      dispatch({ type: 'SET_SELECTED_SUBJECTS', payload: state.rdf.subjects.slice(0, 10) })
    }
  }, [state.rdf.subjects, state.editor.language])

  return (
    <div className="editor-pane-container">
      <EditorTabs />
      <EditorToolbar />
      <div className="editor-content">
        <Suspense fallback={<div className="editor-loading">Loading Editor...</div>}>
          <MonacoEditorComponent
            // One Monaco model per tab, so each keeps its own undo history,
            // cursor and scroll position across switches.
            path={state.editor.activeTabId}
            value={state.editor.content}
            onChange={handleContentChange}
            language={state.editor.language}
            theme={state.editor.theme}
            fontSize={state.editor.fontSize}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default EditorPane