import { useState, useEffect, useRef } from 'react';
import { saveAs } from 'file-saver';
import { useAppContext } from '@/store/AppProvider';
import { RDFParser } from '@/services/rdf-parser';
import { useSparqlEngine } from './useSparqlEngine';
import MonacoEditorComponent from '@/components/editor/MonacoEditorComponent';

import { SparqlUtils } from '@/utils/sparql-utils';
import { formatResultTerm, resultTermLexical } from '@/utils/sparql-results';
import './SPARQLPanel.css';




function SPARQLPanel() {
  const { state, dispatch } = useAppContext()
  const { sparql } = state
  const [showResults, setShowResults] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  // Set when the last graph result was opened as an editor tab, so the
  // results pane can point at the tab instead of repeating the Turtle.
  const [resultTab, setResultTab] = useState<{ title: string; triples: number } | null>(null)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const splitInstanceRef = useRef<any>(null)

  const handleQueryChange = (value: string) => {
    dispatch({ type: 'SET_SPARQL_QUERY', payload: value })
  }

  useEffect(() => {
    const initSplit = async () => {
      if (showResults && splitContainerRef.current) {
        try {
          const Split = (await import('split.js')).default
          
          // Clean up previous instance if exists
          if (splitInstanceRef.current) {
            splitInstanceRef.current.destroy()
          }

          // Ensure elements exist
          const editorEl = splitContainerRef.current.querySelector('.sparql-editor-container')
          const resultsEl = splitContainerRef.current.querySelector('.sparql-results-container')

          if (editorEl && resultsEl) {
            splitInstanceRef.current = Split(['.sparql-editor-container', '.sparql-results-container'], {
              sizes: [40, 60],
              minSize: [100, 100],
              gutterSize: 8,
              cursor: 'row-resize',
              direction: 'vertical',
            })
          }
        } catch (error) {
          console.warn('Split.js not available for SPARQLPanel', error)
        }
      } else if (!showResults && splitInstanceRef.current) {
        splitInstanceRef.current.destroy()
        splitInstanceRef.current = null
      }
    }

    // Small timeout to allow DOM to update
    const timer = setTimeout(initSplit, 100)
    return () => clearTimeout(timer)
  }, [showResults])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (splitInstanceRef.current) {
        splitInstanceRef.current.destroy()
      }
    }
  }, [])

  const { executeQuery } = useSparqlEngine();

  /**
   * Open a CONSTRUCT / DESCRIBE result as a new editor tab, pre-selecting all
   * its subjects so the diagram pane draws it at once. The Turtle is parsed
   * again here, rather than reusing the engine's quads, so the subject keys
   * are exactly the ones EditorPane will compute when it parses the tab.
   */
  const openResultTab = async (turtle: string) => {
    const graph = await new RDFParser().parseRDF(turtle, 'turtle')
    if (graph.error || graph.quads.length === 0) return
    const title = `Result ${state.editor.resultCount + 1}`
    dispatch({
      type: 'OPEN_EDITOR_TAB',
      payload: { title, content: turtle, language: 'turtle', selectedSubjects: graph.subjects },
    })
    setResultTab({ title, triples: graph.quads.length })
  }

  const handleExecuteQuery = async () => {
    if (!sparql.query.trim()) return

    try {
      dispatch({ type: 'SET_SPARQL_EXECUTING', payload: true })
      dispatch({ type: 'SET_SPARQL_ERROR', payload: undefined })
      setResultTab(null)
      
      // First parse the RDF content from editor
      const parser = new RDFParser()
      const editorContent = state.editor.content
      
      if (!editorContent.trim()) {
        throw new Error('No RDF content in editor to query')
      }
      
      // Parse RDF content
      const parseResult = await parser.parseRDF(editorContent, state.editor.language)
      if (parseResult.error) {
        throw new Error(`RDF parsing error: ${parseResult.error}`)
      }
      
      if (parseResult.quads.length === 0) {
        throw new Error('No RDF quads found in editor content')
      }
      
      console.log('0$$ SPARQL Panel: Parsing complete, quads found:', parseResult.quads.length);

      // The parser already yields RDF/JS quads (n3 term objects), so they go to
      // the engine untouched. An earlier version rebuilt each term here through
      // DataFactory, which silently discarded RDF 1.2 term kinds: triple terms
      // (termType 'Quad') fell into the blank-node branch and became anonymous
      // nodes, and directional literals lost their direction and datatype.
      const n3Quads = parseResult.quads

      // Execute SPARQL query
      const queryResult = await executeQuery(sparql.query, n3Quads, parseResult.prefixes) as any;
      
      if (queryResult) {
        // Handle ASK queries special behavior
        if (queryResult.booleanResult !== undefined) {
            console.log(queryResult.booleanResult)
            alert(queryResult.booleanResult)
            
            // Wrap in table structure for display if not already
            if (!queryResult.head) {
                const askResult = {
                    head: { vars: ['Result'] },
                    results: {
                        bindings: [{
                            Result: { type: 'literal' as const, value: queryResult.booleanResult.toString() }
                        }]
                    },
                    booleanResult: queryResult.booleanResult
                }
                dispatch({ type: 'SET_SPARQL_RESULTS', payload: askResult })
            } else {
                dispatch({ type: 'SET_SPARQL_RESULTS', payload: queryResult })
            }
        } else {
            // Handle SELECT (results) and CONSTRUCT (rdfResult)
            dispatch({ type: 'SET_SPARQL_RESULTS', payload: queryResult })
            if (queryResult.rdfResult && sparql.openResultsInTab) {
                await openResultTab(queryResult.rdfResult)
            }
        }
        
        setShowResults(true)
      }
      
    } catch (error: any) {
      console.error('SPARQL query error:', error)
      dispatch({ type: 'SET_SPARQL_ERROR', payload: error.message || String(error) })
    } finally {
      dispatch({ type: 'SET_SPARQL_EXECUTING', payload: false })
    }
  }

  const handleAddPrefixes = () => {
    // Use prefixes from the current RDF content if available
    const customPrefixes = state.rdf.prefixes
    const prefixQuery = SparqlUtils.generateCommonPrefixes(customPrefixes) + sparql.query

    dispatch({ type: 'SET_SPARQL_QUERY', payload: prefixQuery })
  }

  const handleClearResults = () => {
    setShowResults(false)
    setResultTab(null)
    dispatch({ type: 'SET_SPARQL_RESULTS', payload: undefined })
    dispatch({ type: 'SET_SPARQL_ERROR', payload: undefined })
  }

  const handleExportQuery = () => {
    if (!sparql.query.trim()) return;
    const blob = new Blob([sparql.query], { type: 'application/sparql-query' });
    saveAs(blob, 'query.sparql');
  };

  const handleExportResultsClick = () => {
    if (!sparql.results) return;
    
    // If RDF result (CONSTRUCT/DESCRIBE), export as Turtle immediately
    if (sparql.results.rdfResult) {
        const blob = new Blob([sparql.results.rdfResult], { type: 'text/turtle' });
        saveAs(blob, 'results.ttl');
        return;
    }

    // For SELECT/ASK, show dialog
    setShowExportDialog(true);
  };

  const handleExportConfirm = (format: 'json' | 'csv') => {
    if (!sparql.results) return;
    
    const { head, results, booleanResult } = sparql.results;

    if (format === 'json') {
        // Export as SPARQL JSON Results
        const jsonStr = JSON.stringify(sparql.results, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        saveAs(blob, 'results.json');
    } else if (format === 'csv') {
        if (booleanResult !== undefined) {
            // ASK result in CSV?
            const csv = `result\n${booleanResult}`;
            const blob = new Blob([csv], { type: 'text/csv' });
            saveAs(blob, 'results.csv');
        } else if (head && results) {
            // SELECT result
            const vars = head.vars || [];
            const headerRow = vars.join(',');
            const dataRows = results.bindings.map((binding: any) => {
                return vars.map((v: string) => {
                    const val = binding[v];
                    if (!val) return '';
                    // Escape quotes if needed, simple implementation
                    let strVal = resultTermLexical(val);
                    if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                        strVal = `"${strVal.replace(/"/g, '""')}"`;
                    }
                    return strVal;
                }).join(',');
            });
            
            const csv = [headerRow, ...dataRows].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            saveAs(blob, 'results.csv');
        }
    }
    setShowExportDialog(false);
  };

  const renderExportDialog = () => {
    if (!showExportDialog) return null;

    return (
        <div className="export-dialog-overlay">
            <div className="export-dialog">
                <h4>Export Results</h4>
                <p>Select format:</p>
                <div className="export-options">
                    <button onClick={() => handleExportConfirm('csv')}>CSV</button>
                    <button onClick={() => handleExportConfirm('json')}>JSON</button>
                </div>
                <button className="cancel-btn" onClick={() => setShowExportDialog(false)}>Cancel</button>
            </div>
        </div>
    );
  };

  const renderResults = () => {
    console.log('**** SPARQL Results:', sparql.results);
    if (!sparql.results || !showResults) return null

    // Handle serialized RDF result (CONSTRUCT/DESCRIBE)
    if (sparql.results.rdfResult !== undefined) {
        const { rdfResult } = sparql.results
        return (
            <div className="sparql-results-container">
              <div className="sparql-results">
                  <div className="results-header">
                      <h4>Query Results (RDF Graph)</h4>
                      <button onClick={handleClearResults} className="clear-btn">Clear</button>
                  </div>
                  <div className="results-table-container">
                      {resultTab ? (
                          <p className="results-note">
                              Graph of {resultTab.triples} triples opened in editor tab
                              {' '}<strong>{resultTab.title}</strong>; its subjects are selected in the diagram.
                          </p>
                      ) : rdfResult === '' ? (
                          <p className="results-note">Empty graph: the query matched nothing.</p>
                      ) : (
                          <pre style={{ padding: '10px', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                              {rdfResult}
                          </pre>
                      )}
                  </div>
              </div>
            </div>
        )
    }

    const { head, results } = sparql.results
    
    if (!results || !results.bindings) {
        return <div className="sparql-results-container"><div className="sparql-results"><div className="sparql-error">Invalid result format</div></div></div>
    }

    const vars = head?.vars || []
    
    return (
      <div className="sparql-results-container">
        <div className="sparql-results">
          <div className="results-header">
            <h4>Query Results ({results.bindings.length} rows)</h4>
            <button onClick={handleClearResults} className="clear-btn">Clear</button>
          </div>
          
          <div className="results-table-container">
            <table className="results-table">
              <thead>
                <tr>
                  {vars.map((variable: string) => (
                    <th key={variable}>{variable}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.bindings.map((binding: any, index: number) => (
                  <tr key={index}>
                    {vars.map((variable: string) => {
                      // keys are normalized in useSparqlEngine to match vars
                      const value = binding[variable];
                      
                      return (
                        <td key={variable} className={`cell-${value?.type || 'empty'}`}>
                          {formatResultTerm(value)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sparql-panel">
      <div className="sparql-header">
        <h3>SPARQL Panel</h3>
        <div className="sparql-controls">
          <button onClick={handleAddPrefixes} disabled={sparql.isExecuting}>
            Add Prefixes
          </button>
          <button
            onClick={handleExecuteQuery}
            disabled={sparql.isExecuting || !sparql.query.trim()}
            className="execute-btn"
          >
            {sparql.isExecuting ? 'Executing...' : 'Execute Query'}
          </button>
          <button onClick={handleClearResults}>
            Clear Results
          </button>
          <button onClick={handleExportQuery} disabled={!sparql.query.trim()}>
            Export Query
          </button>
          <button onClick={handleExportResultsClick} disabled={!sparql.results}>
            Export Results
          </button>
          <label
            className="sparql-option"
            title="When a CONSTRUCT or DESCRIBE query returns a graph, open it in a new editor tab where it can be edited, queried and diagrammed"
          >
            <input
              type="checkbox"
              checked={sparql.openResultsInTab}
              onChange={e => dispatch({ type: 'SET_SPARQL_OPEN_RESULTS_IN_TAB', payload: e.target.checked })}
            />
            Graph results to tab
          </label>
        </div>
      </div>
      
      <div className="sparql-content" ref={splitContainerRef}>
        {renderExportDialog()}
        <div className={`sparql-editor-container ${showResults ? 'split-view' : ''}`}>
          <MonacoEditorComponent
            value={sparql.query}
            onChange={handleQueryChange}
            language="sparql"
            theme={state.editor.theme}
            fontSize={state.editor.fontSize}
          />
        </div>
        
        {sparql.error && (
          <div className="sparql-error">
            <strong>Error:</strong> {sparql.error}
          </div>
        )}
        
        {renderResults()}
      </div>
    </div>
  )
}

export default SPARQLPanel
