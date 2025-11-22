import React, { useRef, useEffect } from 'react'
import { useAppContext } from '@/store/AppProvider'
import './GraphVisualization.css'

// Declare global functions
declare global {
  interface Window {
    Viz: {
      (src: string, options: { engine: string; format: string }): string
      svgXmlToPngImageElement?: (svg: string) => HTMLImageElement
    }
    svgPanZoom: (svg: SVGElement, options?: any) => any
    findTriplesForObject: (objectValue: string) => void
  }
}

import { RDFParser } from '@/services/rdf-parser'

function GraphVisualization() {
  const containerRef = useRef<HTMLDivElement>(null)
  const panZoomInstanceRef = useRef<any>(null)
  const { state } = useAppContext()
  const { graph } = state

  // Drag scrolling refs
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const scrollLeft = useRef(0)
  const scrollTop = useRef(0)

  useEffect(() => {
    const renderGraph = async () => {
      // Cleanup previous pan-zoom instance
      if (panZoomInstanceRef.current) {
        try {
          panZoomInstanceRef.current.destroy()
        } catch (e) {
          console.warn('Error destroying pan-zoom instance:', e)
        }
        panZoomInstanceRef.current = null
      }

      if (!graph.dotText || !containerRef.current) {
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <div class="graph-placeholder">
              <p>No graph data to display</p>
              <p>Parse some RDF content or load a DOT file to generate a visualization</p>
            </div>
          `
        }
        return
      }

      try {
        let result: string
        
        // Check for Viz.js availability
        const vizFunction = window.Viz
        
        if (vizFunction) {
          try {
            // Force SVG format for rendering, we'll handle PNG conversion separately
            // or if raw output is requested we might use the requested format (if supported)
            // But generally Viz.js returns SVG best.
            const renderFormat = graph.options.format === 'png' ? 'svg' : graph.options.format;
            
            result = vizFunction(graph.dotText, {
              engine: graph.options.engine,
              format: renderFormat,
            })
          } catch (vizError) {
            console.error('Viz.js rendering error:', vizError)
            throw new Error(`Viz.js error: ${vizError}`)
          }
        } else {
          // Fallback: Display the DOT text with a message
          if (containerRef.current) {
            containerRef.current.innerHTML = `
              <div class="graph-placeholder">
                <p><strong>Viz.js not loaded</strong></p>
                <p>Ensure the viz.js script is included in index.html</p>
                <p>DOT Content:</p>
                <pre style="text-align: left; max-height: 300px; overflow: auto; background: #f8f9fa; padding: 10px; border-radius: 4px;">${graph.dotText}</pre>
              </div>
            `
          }
          return
        }

        if (containerRef.current && result) {
          if (graph.options.format === 'svg' && !graph.options.rawOutput) {
            // Parse SVG and add pan-zoom functionality (following original pattern)
            const parser = new DOMParser()
            const svgDoc = parser.parseFromString(result, 'image/svg+xml')
            const svgElement = svgDoc.documentElement.cloneNode(true) as SVGElement
            
            if (svgElement && svgElement.tagName === 'svg') {
              svgElement.id = 'svg_output'
              
              // Clear container and add SVG
              containerRef.current.innerHTML = ''
              containerRef.current.appendChild(svgElement)
              

              // Initialize svg-pan-zoom (exactly like original code)
              if (window.svgPanZoom) {
                try {
                  panZoomInstanceRef.current = window.svgPanZoom(svgElement, {
                    zoomEnabled: true,
                    controlIconsEnabled: true,
                    fit: true,
                    center: true,
                    minZoom: 0.01,
                    maxZoom: 500
                  })

                  // Add resize handler (following original pattern)
                  // const resizeEvent = new Event("paneresize")
                  
                  svgElement.addEventListener('paneresize', function() {
                    if (panZoomInstanceRef.current && panZoomInstanceRef.current.resize) {
                      panZoomInstanceRef.current.resize()
                    }
                  })

                  window.addEventListener('resize', function() {
                    if (panZoomInstanceRef.current && panZoomInstanceRef.current.resize) {
                      panZoomInstanceRef.current.resize()
                    }
                  })

                  console.log('svg-pan-zoom initialized successfully')

                } catch (panZoomError) {
                  console.warn('svg-pan-zoom initialization failed:', panZoomError)
                  svgElement.style.cursor = 'grab'
                }
              } else {
                console.warn('svg-pan-zoom library not available - check if script is loaded')
                svgElement.style.cursor = 'move'
                
                // Add basic fallback interaction
                let isZoomed = false
                svgElement.addEventListener('dblclick', () => {
                  if (isZoomed) {
                    svgElement.style.transform = ''
                    isZoomed = false
                  } else {
                    svgElement.style.transform = 'scale(1.5)'
                    svgElement.style.transformOrigin = 'center'
                    isZoomed = true
                  }
                })
              }
            }
          } else if (graph.options.format === 'svg' && graph.options.rawOutput) {
            // Raw SVG output - displayed as text
            containerRef.current.innerHTML = ''
            const pre = document.createElement('pre')
            pre.style.cssText = "text-align: left; overflow: auto; height: 100%; width: 100%; background: #f8f9fa; padding: 10px; box-sizing: border-box; white-space: pre-wrap;"
            pre.textContent = result
            containerRef.current.appendChild(pre)
          } else if (graph.options.format === 'png') {
            // PNG output - First get SVG, then convert
            try {
              // Get SVG first
              const svgResult = vizFunction(graph.dotText, {
                engine: graph.options.engine,
                format: 'svg',
              })
              // Try to convert to PNG using Viz method
              if ((window.Viz as any).svgXmlToPngImageElement) {
                // Use callback pattern to ensure image is loaded
                (window.Viz as any).svgXmlToPngImageElement(svgResult, 1, (err: any, image: HTMLImageElement) => {
                  if (err) {
                    console.error('PNG conversion error:', err);
                    // Fallback or error display
                    if (containerRef.current) {
                       containerRef.current.innerHTML = `<div class="graph-error"><p>PNG Conversion Error: ${err}</p></div>`;
                    }
                    return;
                  }
                  
                  if (containerRef.current && image) {
                    containerRef.current.innerHTML = ''
                    // Allow image to take full natural size to enable scrolling
                    image.style.maxWidth = 'none'
                    image.style.maxHeight = 'none'
                    image.style.display = 'block'
                    image.style.margin = '0'
                    containerRef.current.appendChild(image)
                  }
                });
              } else {
                // Fallback: create canvas and convert SVG manually
                containerRef.current.innerHTML = `
                  <div class="graph-placeholder">
                    <p><strong>PNG conversion not available</strong></p>
                    <p>Showing SVG instead:</p>
                    <div style="max-width: 100%; max-height: 400px; overflow: auto;">${svgResult}</div>
                  </div>
                `
              }
            } catch (error) {
              console.error('PNG rendering error:', error)
              containerRef.current.innerHTML = `
                <div class="graph-error">
                  <p><strong>PNG Rendering Failed</strong></p>
                  <pre>${String(error)}</pre>
                  <p>Try switching to SVG format instead.</p>
                </div>
              `
            }
          } else {
            // For other formats, display as text
            containerRef.current.innerHTML = `
              <div class="graph-placeholder">
                <p>Format: ${graph.options.format.toUpperCase()}</p>
                <pre style="max-height: 400px; overflow: auto; text-align: left; background: #f8f9fa; padding: 10px; border-radius: 4px;">${result}</pre>
              </div>
            `
          }
        }
      } catch (error) {
        console.error('Error rendering graph:', error)
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <div class="graph-error">
              <p><strong>Graph Rendering Error</strong></p>
              <pre>${String(error)}</pre>
              <details>
                <summary>DOT Content (click to expand)</summary>
                <pre style="text-align: left; background: #f8f9fa; padding: 10px; border-radius: 4px;">${graph.dotText}</pre>
              </details>
            </div>
          `
        }
      }
    }

    // Add a delay to ensure libraries are loaded
    const timeout = setTimeout(renderGraph, 200)
    
    return () => {
      clearTimeout(timeout)
      // Cleanup pan-zoom instance when component unmounts or graph changes
      if (panZoomInstanceRef.current) {
        try {
          panZoomInstanceRef.current.destroy()
        } catch (e) {
          console.warn('Error destroying pan-zoom instance:', e)
        }
        panZoomInstanceRef.current = null
      }
    }
  }, [graph.dotText, graph.options])

  // Mouse handlers for drag scrolling
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only enable for PNG or non-interactive SVG formats
    if (graph.options.format === 'svg' && !graph.options.rawOutput) return
    
    isDragging.current = true
    if (containerRef.current) {
      startX.current = e.pageX - containerRef.current.offsetLeft
      startY.current = e.pageY - containerRef.current.offsetTop
      scrollLeft.current = containerRef.current.scrollLeft
      scrollTop.current = containerRef.current.scrollTop
      containerRef.current.style.cursor = 'grabbing'
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    // Only for SVG format
    if (graph.options.format !== 'svg' || graph.options.rawOutput) return

    e.preventDefault()
    
    let target = e.target as Element
    // Traverse up to find g.node
    while (target && target !== containerRef.current) {
      if (target.tagName === 'g' && target.classList.contains('node')) {
        // Found a node
        const title = target.querySelector('title')
        if (title) {
          let value = title.textContent || ''
          
          // Unwrap literals that might have been wrapped with newlines
          if (value.includes('\n')) {
            value = value.replace(/\n/g, ' ')
          }

          // Attempt to expand if it's a prefixed IRI
          if (value.includes(':') && !value.includes(' ') && !value.startsWith('_:')) {
             value = RDFParser.expandIRI(value, state.rdf.prefixes)
          }
          
          if (window.findTriplesForObject) {
            window.findTriplesForObject(value)
          }
        }
        break
      }
      target = target.parentElement as Element
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return
    e.preventDefault()
    const x = e.pageX - containerRef.current.offsetLeft
    const y = e.pageY - containerRef.current.offsetTop
    const walkX = (x - startX.current)
    const walkY = (y - startY.current)
    containerRef.current.scrollLeft = scrollLeft.current - walkX
    containerRef.current.scrollTop = scrollTop.current - walkY
  }

  const handleMouseUpOrLeave = () => {
    isDragging.current = false
    if (containerRef.current && graph.options.format !== 'svg') {
      containerRef.current.style.cursor = 'grab'
    }
  }

  // Set cursor style based on format
  useEffect(() => {
    if (containerRef.current) {
      if (graph.options.format === 'svg' && !graph.options.rawOutput) {
        containerRef.current.style.cursor = 'default' // svg-pan-zoom handles its own cursor
      } else {
        containerRef.current.style.cursor = 'grab'
      }
    }
  }, [graph.options.format, graph.options.rawOutput])

  // Register global function for graph interaction
  useEffect(() => {
    window.findTriplesForObject = (objectValue: string) => {
      const quads = state.rdf.quads
      const prefixes = state.rdf.prefixes
      const subjects: string[] = []

      quads.forEach(quad => {
        if (quad.object.value === objectValue) {
          subjects.push(RDFParser.shrinkIRI(quad.subject.value, prefixes))
        }
      })

      if (subjects.length > 0) {
        alert("Matching Subjects:\n" + subjects.join('\n'))
      } else {
        alert("No matching subjects found for object: " + objectValue)
      }
    }

    return () => {
      // Cleanup if needed, though usually safe to leave on window
      // (window as any).findTriplesForObject = undefined
    }
  }, [state.rdf.quads, state.rdf.prefixes])

  return (
    <div className="graph-visualization-container">
      <div
        ref={containerRef}
        className="graph-content-area"
        style={{ overflow: 'auto', height: '100%', width: '100%' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onContextMenu={handleContextMenu}
      />
    </div>
  )
}

export default GraphVisualization