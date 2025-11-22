import { useState } from 'react';
import { DataFactory } from 'n3' ;
import { saveAs } from 'file-saver';
import { useAppContext } from '@/store/AppProvider';
import { RDFParser } from '@/services/rdf-parser';
import { useSparqlEngine } from './useSparqlEngine';

import { SparqlUtils } from '@/utils/sparql-utils';
import './SPARQLPanel.css';

const { namedNode, literal, blankNode, quad, defaultGraph } = DataFactory;



function SPARQLPanel() {
  const { state, dispatch } = useAppContext()
  const { sparql } = state
  const [showResults, setShowResults] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)

  const handleQueryChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    dispatch({ type: 'SET_SPARQL_QUERY', payload: event.target.value })
  }

  const { executeQuery } = useSparqlEngine();

  const handleExecuteQuery = async () => {
    if (!sparql.query.trim()) return
    
    try {
      dispatch({ type: 'SET_SPARQL_EXECUTING', payload: true })
      dispatch({ type: 'SET_SPARQL_ERROR', payload: undefined })
      
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

      // Convert RDFQuad to N3 Quad
      const n3Quads = parseResult.quads.map(q => {
        const subject = q.subject.termType === 'NamedNode' ? namedNode(q.subject.value) : blankNode(q.subject.value);
        const predicate = namedNode(q.predicate.value);
        let object;
        if (q.object.termType === 'NamedNode') {
          object = namedNode(q.object.value);
        } else if (q.object.termType === 'Literal') {
          object = literal(q.object.value, q.object.language || (q.object.datatype ? namedNode(q.object.datatype.value) : undefined));
        } else {
          object = blankNode(q.object.value);
        }
        
        let graph;
        if (q.graph) {
          // Cast to any because RDFQuad definition might exclude DefaultGraph but runtime has it
          const termType = (q.graph as any).termType;
          if (termType === 'DefaultGraph') {
            graph = defaultGraph();
          } else if (termType === 'NamedNode') {
            graph = namedNode(q.graph.value);
          } else if (termType === 'BlankNode') {
            graph = blankNode(q.graph.value);
          }
        }

        return quad(subject, predicate, object, graph);
      });

      // Execute SPARQL query
      const queryResult = await executeQuery(sparql.query, n3Quads) as any;
      
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
                    let strVal = val.value;
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
    if (sparql.results.rdfResult) {
        return (
            <div className="sparql-results">
                <div className="results-header">
                    <h4>Query Results (RDF Graph)</h4>
                    <button onClick={handleClearResults} className="clear-btn">Clear</button>
                </div>
                <div className="results-table-container">
                    <pre style={{ padding: '10px', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                        {sparql.results.rdfResult}
                    </pre>
                </div>
            </div>
        )
    }

    const { head, results } = sparql.results
    
    if (!results || !results.bindings) {
        return <div className="sparql-results"><div className="sparql-error">Invalid result format</div></div>
    }

    const vars = head?.vars || []
    
    return (
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
                        {value?.value || ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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
        </div>
      </div>
      
      <div className="sparql-content">
        {renderExportDialog()}
        <div className="sparql-editor">
          <textarea
            value={sparql.query}
            onChange={handleQueryChange}
            placeholder="Enter SPARQL query here..."
            disabled={sparql.isExecuting}
            rows={6}
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
