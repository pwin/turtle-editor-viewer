import { useEffect, Suspense, lazy } from 'react'
import EditorToolbar from './EditorToolbar'
import { useAppContext } from '@/store/AppProvider'
import { RDFParser } from '@/services/rdf-parser'
import { GraphGenerator } from '@/services/graph-generator'
import { FileHandler } from '@/services/file-handler'
import './EditorPane.css'

const MonacoEditorComponent = lazy(() => import('./MonacoEditorComponent'))

function EditorPane() {
  const { state, dispatch } = useAppContext()

  // Check for URL parameters on mount
  useEffect(() => {
    const checkURLParams = async () => {
      const dotUrl = FileHandler.getURLParameter('dot')
      const rdfaUrl = FileHandler.getURLParameter('rdfa')

      if (dotUrl) {
        dispatch({ type: 'SET_EDITOR_LOADING', payload: true })
        try {
          const result = await FileHandler.loadWithCORS(dotUrl)
          if (!result.error) {
            dispatch({ type: 'SET_EDITOR_CONTENT', payload: result.content })
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
    }

    checkURLParams()
  }, []) // Run once on mount

  // Auto-detect language and refresh graph/data on content change
  useEffect(() => {
    const content = state.editor.content
    const trimmed = content.trim()
    
    // 1. Auto-detect language
    let newLang = state.editor.language
    if (trimmed.toLowerCase().startsWith('digraph')) {
      newLang = 'dot'
    } else if (trimmed.startsWith('<')) {
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
                  result.prefixes
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
    }, 1000) // 1 second debounce

    return () => clearTimeout(timer)
  }, [state.editor.content]) // Dependency only on content (and potentially options if we want to react to them, but they change separately)

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
      <EditorToolbar />
      <div className="editor-content">
        <Suspense fallback={<div className="editor-loading">Loading Editor...</div>}>
          <MonacoEditorComponent
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