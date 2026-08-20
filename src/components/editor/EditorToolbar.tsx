import React, { useState } from 'react'
import { useAppContext } from '@/store/AppProvider'
import { GraphGenerator } from '@/services/graph-generator'
import { RDFParser } from '@/services/rdf-parser'
import { buildSubjectOptions } from '@/utils/label-utils'
import type { EditorLanguage, EditorTheme } from '@/types'
import './EditorToolbar.css'

function EditorToolbar() {
  const { state, dispatch } = useAppContext()
  const { graph, rdf } = state
  const [subjectFilter, setSubjectFilter] = useState('')

  const isDotMode = state.editor.language === 'dot'

  const subjectOptions = buildSubjectOptions(
    rdf.subjects,
    rdf.labels,
    graph.options.showLabels,
  )

  // Match on the displayed text as well as the IRI, so either one finds it.
  const filter = subjectFilter.toLowerCase()
  const filteredSubjects = subjectOptions.filter(
    option =>
      option.display.toLowerCase().includes(filter) ||
      option.value.toLowerCase().includes(filter),
  )

  const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch({ 
      type: 'SET_EDITOR_LANGUAGE', 
      payload: event.target.value as EditorLanguage 
    })
  }

  const handleThemeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch({
      type: 'SET_EDITOR_THEME',
      payload: event.target.value as EditorTheme
    })
  }

  const handleFontSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch({
      type: 'SET_EDITOR_FONT_SIZE',
      payload: parseInt(event.target.value, 10)
    })
  }

  const handleFileOpen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        dispatch({ type: 'SET_EDITOR_CONTENT', payload: content })
      }
      reader.readAsText(file)
    }
  }

  const handleSaveFile = () => {
    const blob = new Blob([state.editor.content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'turtle-file.ttl'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

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
            result.prefixes,
            result.labels ?? {}
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

  const handleSubjectSelectionChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedOptions = Array.from(event.target.selectedOptions).map(option => option.value)
    dispatch({ type: 'SET_SELECTED_SUBJECTS', payload: selectedOptions })
    
    // Auto-generate graph for selected subjects
    generateGraph(state.editor.content, selectedOptions, graph.options)
  }

  return (
    <div className="editor-toolbar">
      <div className="toolbar-section-main">
        <div className="toolbar-row">
          <div className="toolbar-group">
            <label>
              Open File:
              <input
                type="file"
                accept=".ttl,.rdf,.xml,.json,.dot"
                onChange={handleFileOpen}
              />
            </label>
            <button onClick={handleSaveFile}>
              Save File
            </button>
          </div>
        </div>
        
        <div className="toolbar-row">
          <div className="toolbar-group">
            <label>
              Language:
              <select value={state.editor.language} onChange={handleLanguageChange}>
                <option value="turtle">Turtle</option>
                <option value="xml">RDF/XML</option>
                <option value="javascript">JSON-LD</option>
                <option value="dot">DOT</option>
              </select>
            </label>
            
            <label>
              Theme:
              <select value={state.editor.theme} onChange={handleThemeChange}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="high-contrast">High Contrast</option>
              </select>
            </label>
    
            <label>
              Font Size:
              <select value={state.editor.fontSize} onChange={handleFontSizeChange}>
                <option value="8">8px</option>
                <option value="10">10px</option>
                <option value="12">12px</option>
                <option value="14">14px</option>
                <option value="16">16px</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {!isDotMode && (
        <div className="toolbar-section-subjects">
          <div className="subjects-container">
            <input
              type="text"
              placeholder="Filter subjects..."
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="subject-filter"
            />

            <label className="subject-label-toggle">
              <input
                type="checkbox"
                checked={graph.options.showLabels}
                onChange={e =>
                  dispatch({
                    type: 'SET_GRAPH_OPTIONS',
                    payload: { showLabels: e.target.checked },
                  })
                }
              />
              Show labels
            </label>
           
            <select
              multiple
              size={4}
              value={rdf.selectedSubjects}
              onChange={handleSubjectSelectionChange}
              className="subjects-list"
            >
              {filteredSubjects.map(option => (
                // value stays the IRI: it is what selection and graph
                // generation key off, and it is always unique.
                <option key={option.value} value={option.value} title={option.value}>
                  {option.display}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

export default EditorToolbar