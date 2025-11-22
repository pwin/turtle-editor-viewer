import React from 'react'
import { useAppContext } from '@/store/AppProvider'
import { RDFParser } from '@/services/rdf-parser'
import { GraphGenerator } from '@/services/graph-generator'
import { FileHandler } from '@/services/file-handler'
import { HylarReasoner } from '@/services/hylar-reasoner'
import type { GraphEngine, GraphFormat, LayoutDirection } from '@/types'
import './GraphToolbar.css'

function GraphToolbar() {
  const { state, dispatch } = useAppContext()
  const { graph, rdf } = state

  const isDotMode = state.editor.language === 'dot'

  const generateGraph = async (content: string, selectedSubjects: string[], options: any) => {
    if (selectedSubjects.length === 0) {
      dispatch({ type: 'SET_GRAPH_DOT_TEXT', payload: '' })
      return
    }

    try {
      dispatch({ type: 'SET_GRAPH_GENERATING', payload: true })
      
      // Check if we have RDF data or DOT content
      if (content.trim().toLowerCase().startsWith('digraph')) {
        // For DOT files, use generator to apply layout options
        const generator = new GraphGenerator()
        const graphResult = generator.generateDotFromDot(content, options)
        
        if (graphResult.error) {
          dispatch({ type: 'SET_GRAPH_ERROR', payload: graphResult.error })
        } else {
          dispatch({ type: 'SET_GRAPH_DOT_TEXT', payload: graphResult.dotText })
          dispatch({ type: 'SET_GRAPH_ERROR', payload: null })
        }
      } else {
        // For RDF content, generate filtered graph
        const parser = new RDFParser()
        const result = await parser.parseRDF(content, state.editor.language)
        
        if (!result.error && result.quads.length > 0) {
          const generator = new GraphGenerator()
          const graphResult = generator.generateDotFromRDF(
            result.quads,
            selectedSubjects,
            options,
            result.prefixes
          )
          
          if (graphResult.error) {
            dispatch({ type: 'SET_GRAPH_ERROR', payload: graphResult.error })
          } else {
            dispatch({ type: 'SET_GRAPH_DOT_TEXT', payload: graphResult.dotText })
            dispatch({ type: 'SET_GRAPH_ERROR', payload: null })
          }
        }
      }
    } catch (error) {
      dispatch({ type: 'SET_GRAPH_ERROR', payload: `Error generating graph: ${error}` })
    } finally {
      dispatch({ type: 'SET_GRAPH_GENERATING', payload: false })
    }
  }

  const handleEngineChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const engine = event.target.value as GraphEngine
    dispatch({ type: 'SET_GRAPH_OPTIONS', payload: { engine } })
    // Don't regenerate for engine change as Viz.js handles it dynamically via options usually?
    // But GraphVisualization uses graph.options.engine. So it updates on render.
  }

  const handleFormatChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const format = event.target.value as GraphFormat
    dispatch({ type: 'SET_GRAPH_OPTIONS', payload: { format } })
  }

  const handleLayoutChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const layoutDirection = event.target.value as LayoutDirection
    dispatch({ type: 'SET_GRAPH_OPTIONS', payload: { layoutDirection } })
    // Re-generate to update rankdir in DOT
    generateGraph(state.editor.content, rdf.selectedSubjects, { ...graph.options, layoutDirection })
  }

  const handleCheckboxChange = (option: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = event.target.checked
    dispatch({
      type: 'SET_GRAPH_OPTIONS',
      payload: { [option]: isChecked }
    })

    // Re-generate graph with new option
    if (rdf.selectedSubjects.length > 0) {
      generateGraph(state.editor.content, rdf.selectedSubjects, { ...graph.options, [option]: isChecked })
    }
  }

  const handleURLLoad = async () => {
    const urlInput = document.getElementById('url-input') as HTMLInputElement
    const url = urlInput?.value
    if (url) {
      try {
        dispatch({ type: 'SET_EDITOR_LOADING', payload: true })
        const result = await FileHandler.loadFromURL(url)
        if (result.error) {
          alert(`Error loading URL: ${result.error}`)
        } else {
          dispatch({ type: 'SET_EDITOR_CONTENT', payload: result.content })
          // Auto-detect and set language
          if (result.content.toLowerCase().startsWith('digraph')) {
            dispatch({ type: 'SET_EDITOR_LANGUAGE', payload: 'dot' })
          } else if (result.content.startsWith('<')) {
            dispatch({ type: 'SET_EDITOR_LANGUAGE', payload: 'xml' })
          } else if (result.content.startsWith('{')) {
            dispatch({ type: 'SET_EDITOR_LANGUAGE', payload: 'javascript' })
          } else {
            dispatch({ type: 'SET_EDITOR_LANGUAGE', payload: 'turtle' })
          }
        }
      } catch (error) {
        alert(`Error: ${error}`)
      } finally {
        dispatch({ type: 'SET_EDITOR_LOADING', payload: false })
      }
    }
  }

  const handleGetAllSubjects = async () => {
    try {
      dispatch({ type: 'SET_GRAPH_GENERATING', payload: true })
      const parser = new RDFParser()
      const content = state.editor.content
      
      if (content.trim().toLowerCase().startsWith('digraph')) {
        // Handle DOT files directly
        dispatch({ type: 'SET_GRAPH_DOT_TEXT', payload: content })
        dispatch({ type: 'SET_RDF_SUBJECTS', payload: ['DOT_GRAPH'] })
        dispatch({ type: 'SET_SELECTED_SUBJECTS', payload: ['DOT_GRAPH'] })
      } else {
        // Parse RDF content
        const result = await parser.parseRDF(content, state.editor.language)
        if (result.error) {
          dispatch({ type: 'SET_GRAPH_ERROR', payload: result.error })
        } else {
          dispatch({ type: 'SET_RDF_SUBJECTS', payload: result.subjects })
          dispatch({ type: 'SET_RDF_PREFIXES', payload: result.prefixes })
          dispatch({ type: 'SET_GRAPH_ERROR', payload: null })
          
          // Auto-select all subjects for visualization
          if (result.subjects.length > 0) {
            dispatch({ type: 'SET_SELECTED_SUBJECTS', payload: result.subjects.slice(0, 10) }) // Limit to first 10
            
            // Generate graph
            const generator = new GraphGenerator()
            const graphResult = generator.generateDotFromRDF(
              result.quads,
              result.subjects.slice(0, 10),
              graph.options,
              result.prefixes
            )
            
            if (graphResult.error) {
              dispatch({ type: 'SET_GRAPH_ERROR', payload: graphResult.error })
            } else {
              dispatch({ type: 'SET_GRAPH_DOT_TEXT', payload: graphResult.dotText })
            }
          }
        }
      }
    } catch (error) {
      dispatch({ type: 'SET_GRAPH_ERROR', payload: `Error processing content: ${error}` })
    } finally {
      dispatch({ type: 'SET_GRAPH_GENERATING', payload: false })
    }
  }

  const handleConvertFormat = async (format: string) => {
    try {
      dispatch({ type: 'SET_EDITOR_LOADING', payload: true })
      
      // 1. Parse current content
      const parser = new RDFParser()
      const parseResult = await parser.parseRDF(state.editor.content, state.editor.language)
      
      if (parseResult.error) {
        alert(`Error parsing content: ${parseResult.error}`)
        return
      }
      
      if (parseResult.quads.length === 0) {
        alert('No RDF data found to convert')
        return
      }

      // 2. Serialize to target format
      // Check if format is supported
      let targetFormat = format
      let editorLang = format
      
      if (format === 'jsonld') {
        targetFormat = 'jsonld'
        editorLang = 'javascript'
      } else if (format === 'turtle') {
        targetFormat = 'turtle'
        editorLang = 'turtle'
      }
      
      const serialized = await parser.serialize(parseResult.quads, targetFormat as any)
      
      // 3. Update editor
      dispatch({ type: 'SET_EDITOR_CONTENT', payload: serialized })
      dispatch({ type: 'SET_EDITOR_LANGUAGE', payload: editorLang as any })
      
    } catch (error) {
      console.error('Conversion error:', error)
      alert(`Error converting format: ${error}`)
    } finally {
      dispatch({ type: 'SET_EDITOR_LOADING', payload: false })
    }
  }

  const handleShowFacts = async () => {
    try {
      // Parse RDF content first
      const parser = new RDFParser()
      const parseResult = await parser.parseRDF(state.editor.content, state.editor.language)
      
      if (parseResult.error) {
        alert(`Error parsing RDF: ${parseResult.error}`)
        return
      }
      
      if (parseResult.quads.length === 0) {
        alert('No RDF triples found to reason over. Please load some RDF content first.')
        return
      }

      // Perform reasoning
      const reasoningResult = await HylarReasoner.performReasoning(parseResult.quads)
      
      if (reasoningResult.error) {
        alert(`Reasoning error: ${reasoningResult.error}`)
        return
      }

      // Display results in new window
      HylarReasoner.displayReasoningResults(reasoningResult)
      
    } catch (error) {
      console.error('Show facts error:', error)
      alert(`Error: ${error}`)
    }
  }

  return (
    <div className="graph-toolbar">
      <div className="toolbar-section">
        <div className="toolbar-group">
          <label>
            URL:
            <input 
              id="url-input"
              type="text" 
              defaultValue="https://raw.githubusercontent.com/pwin/model-viewer/master/dot_files/DCAT_v2_summary.dot"
              className="url-input"
            />
          </label>
          <button onClick={handleURLLoad}>Load URL</button>
        </div>

        <div className="toolbar-group">
          <button onClick={handleGetAllSubjects}>Get All</button>
          {!isDotMode && (
            <>
              <button onClick={() => handleConvertFormat('turtle')}>To Turtle</button>
              <button onClick={() => handleConvertFormat('jsonld')}>To JSON-LD</button>
              <button onClick={handleShowFacts} className="show-facts-btn">Show Facts</button>
            </>
          )}
        </div>
      </div>

      <div className="toolbar-section">
        <div className="toolbar-group">
          <label>
            Engine:
            <select value={graph.options.engine} onChange={handleEngineChange}>
              <option value="circo">Circo</option>
              <option value="dot">Dot</option>
              <option value="fdp">FDP</option>
              <option value="neato">Neato</option>
              <option value="osage">Osage</option>
              <option value="twopi">Twopi</option>
            </select>
          </label>

          <label>
            Format:
            <select value={graph.options.format} onChange={handleFormatChange}>
              <option value="svg">SVG</option>
              <option value="png">PNG</option>
              <option value="json">JSON</option>
              <option value="xdot">XDOT</option>
              <option value="plain">Plain</option>
              <option value="ps">PS</option>
            </select>
          </label>

          <label>
            Layout:
            <select value={graph.options.layoutDirection} onChange={handleLayoutChange}>
              <option value="LR">Left → Right</option>
              <option value="RL">Right → Left</option>
              <option value="TB">Top → Bottom</option>
              <option value="BT">Bottom → Top</option>
            </select>
          </label>
        </div>

        <div className="toolbar-group">
          {!isDotMode && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={graph.options.showPrefixes}
                  onChange={handleCheckboxChange('showPrefixes')}
                />
                Prefixes
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={graph.options.hideTypes}
                  onChange={handleCheckboxChange('hideTypes')}
                />
                Hide Types
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={graph.options.hideAnnotations}
                  onChange={handleCheckboxChange('hideAnnotations')}
                />
                Hide Annotations
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={graph.options.showSubjects}
                  onChange={handleCheckboxChange('showSubjects')}
                />
                Subjects
              </label>
            </>
          )}

          <label>
            <input
              type="checkbox"
              checked={graph.options.rawOutput}
              onChange={handleCheckboxChange('rawOutput')}
              disabled={graph.options.format !== 'svg'}
            />
            Raw
          </label>
        </div>
      </div>

    </div>
  )
}

export default GraphToolbar