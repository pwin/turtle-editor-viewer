import { useEffect, useRef } from 'react'
import EditorPane from '@/components/editor/EditorPane'
import GraphPane from '@/components/graph/GraphPane'
import './MainLayout.css'

function MainLayout() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Initialize Split.js for resizable panes
    let splitInstance: any = null

    const initSplit = async () => {
      try {
        // Dynamic import to handle Split.js
        const Split = (await import('split.js')).default
        
        if (containerRef.current) {
          splitInstance = Split(['.editor-pane', '.graph-pane'], {
            sizes: [30, 70],
            minSize: [300, 400],
            gutterSize: 8,
            cursor: 'col-resize',
            direction: 'horizontal',
          })
        }
      } catch (error) {
        console.warn('Split.js not available, using flex layout')
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
    <div className="main-layout" ref={containerRef}>
      <div className="editor-pane">
        <EditorPane />
      </div>
      <div className="graph-pane">
        <GraphPane />
      </div>
    </div>
  )
}

export default MainLayout