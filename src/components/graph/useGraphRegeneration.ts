import { useCallback } from 'react'
import { useAppContext } from '@/store/AppProvider'
import { GraphGenerator } from '@/services/graph-generator'
import { RDFParser } from '@/services/rdf-parser'
import type { GraphOptions } from '@/types'

/**
 * Redraws the diagram from a document and a choice of subjects.
 *
 * Nothing redraws on a selection change by itself: each place that changes the
 * selection or an option asks for the redraw. That was a verbatim copy of this
 * function in both toolbars, which had already drifted by one argument, and a
 * third copy would have been needed for the references panel's checkboxes.
 */
export function useGraphRegeneration() {
  const { state, dispatch } = useAppContext()
  const { language } = state.editor
  const { sortSubjects } = state.graph.options

  return useCallback(
    async (content: string, selectedSubjects: string[], options: GraphOptions) => {
      if (selectedSubjects.length === 0) {
        // Nothing chosen is an empty diagram, not a stale one.
        dispatch({ type: 'SET_GRAPH_DOT_TEXT', payload: '' })
        return
      }

      try {
        dispatch({ type: 'SET_GRAPH_GENERATING', payload: true })

        if (content.trim().toLowerCase().startsWith('digraph')) {
          // A DOT document is already a diagram; the generator only applies the
          // layout options to it.
          const generator = new GraphGenerator()
          const graphResult = generator.generateDotFromDot(content, options)
          if (graphResult.error) {
            dispatch({ type: 'SET_GRAPH_ERROR', payload: graphResult.error })
          } else {
            dispatch({ type: 'SET_GRAPH_DOT_TEXT', payload: graphResult.dotText })
            dispatch({ type: 'SET_GRAPH_ERROR', payload: null })
          }
          return
        }

        const parser = new RDFParser()
        const result = await parser.parseRDF(content, language, sortSubjects)
        if (result.error || result.quads.length === 0) return

        const generator = new GraphGenerator()
        const graphResult = generator.generateDotFromRDF(
          result.quads,
          selectedSubjects,
          options,
          result.prefixes,
          result.labels ?? {},
        )
        if (graphResult.error) {
          dispatch({ type: 'SET_GRAPH_ERROR', payload: graphResult.error })
        } else {
          dispatch({ type: 'SET_GRAPH_DOT_TEXT', payload: graphResult.dotText })
          dispatch({ type: 'SET_GRAPH_ERROR', payload: null })
        }
      } catch (error) {
        dispatch({ type: 'SET_GRAPH_ERROR', payload: `Error generating graph: ${error}` })
      } finally {
        dispatch({ type: 'SET_GRAPH_GENERATING', payload: false })
      }
    },
    [dispatch, language, sortSubjects],
  )
}
