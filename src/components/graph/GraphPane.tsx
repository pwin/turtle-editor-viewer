import { useEffect, useRef, Suspense, lazy } from 'react'
import GraphToolbar from './GraphToolbar'
import SPARQLPanel from './SPARQLPanel'
import { useAppContext } from '@/store/AppProvider'
import './GraphPane.css'

const GraphVisualization = lazy(() => import('./GraphVisualization'))

function GraphPane() {
  const { state } = useAppContext()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let splitInstance: any = null

    const initSplit = async () => {
      try {
        const Split = (await import('split.js')).default
        
        if (containerRef.current) {
          // Check if elements exist before splitting
          const vizArea = containerRef.current.querySelector('.graph-visualization-area')
          const sparqlArea = containerRef.current.querySelector('.sparql-panel-area')
          
          if (vizArea && sparqlArea) {
             splitInstance = Split(['.graph-visualization-area', '.sparql-panel-area'], {
              sizes: [60, 40],
              minSize: [100, 100],
              gutterSize: 8,
              cursor: 'row-resize',
              direction: 'vertical',
            })
          }
        }
      } catch (error) {
        console.warn('Split.js not available for GraphPane', error)
      }
    }

    initSplit()

    return () => {
      if (splitInstance && splitInstance.destroy) {
        splitInstance.destroy()
      }
    }
  }, [])

  return (
    <div className="graph-pane-container" ref={containerRef}>
      <GraphToolbar />
      <div className="graph-content">
        <div className="graph-visualization-area">
          <Suspense fallback={<div className="graph-loading"><p>Loading Visualization...</p></div>}>
            <GraphVisualization />
          </Suspense>
          {state.graph.error && (
            <div className="graph-error">
              <p>Error generating graph:</p>
              <pre>{state.graph.error}</pre>
            </div>
          )}
          {state.graph.isGenerating && (
            <div className="graph-loading">
              <p>Generating graph visualization...</p>
            </div>
          )}
        </div>
        <div className="sparql-panel-area">
          <SPARQLPanel />
        </div>
      </div>
    </div>
  )
}

export default GraphPane