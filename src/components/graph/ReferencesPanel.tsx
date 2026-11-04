import { useAppContext } from '@/store/AppProvider'
import { buildLabelDisplayMap } from '@/utils/label-utils'
import { toggleSubject } from '@/utils/references'
import { useGraphRegeneration } from './useGraphRegeneration'
import './ReferencesPanel.css'

export interface References {
  /** The term that was clicked, as the diagram labelled it. */
  object: string
  /** Subject keys of everything that refers to it. */
  subjects: string[]
}

interface ReferencesPanelProps {
  references: References
  onClose: () => void
}

/**
 * What refers to the node that was clicked, with a checkbox each.
 *
 * Ticking one adds that subject to the diagram and untick removes it, so a
 * graph can be explored outwards from whatever is on screen rather than by
 * hunting through the subject list for a name that is often opaque. This
 * replaces an `alert()` of the same list, which could say what referred to a
 * node but gave no way to act on it.
 */
function ReferencesPanel({ references, onClose }: ReferencesPanelProps) {
  const { state, dispatch } = useAppContext()
  const { rdf, editor, graph } = state
  const regenerate = useGraphRegeneration()

  // The same names the subject picker shows, disambiguated the same way, so a
  // row here and a row there read alike.
  const display = buildLabelDisplayMap(
    references.subjects,
    graph.options.showLabels ? rdf.labels : {},
  )

  const toggle = async (subject: string, present: boolean) => {
    const next = toggleSubject(rdf.selectedSubjects, subject, present)
    dispatch({ type: 'SET_SELECTED_SUBJECTS', payload: next })
    await regenerate(editor.content, next, graph.options)
  }

  const inDiagram = references.subjects.filter(s => rdf.selectedSubjects.includes(s)).length

  return (
    <div className="references-panel" role="dialog" aria-label="What refers to this">
      <div className="references-header">
        <div>
          <strong>Refers to</strong> <span className="references-object">{references.object}</span>
        </div>
        <button type="button" className="references-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      {references.subjects.length === 0 ? (
        <p className="references-empty">Nothing in the data refers to this.</p>
      ) : (
        <>
          <p className="references-count">
            {references.subjects.length} {references.subjects.length === 1 ? 'subject' : 'subjects'},
            {' '}{inDiagram} in the diagram. Tick to add, untick to remove.
          </p>
          <ul className="references-list">
            {references.subjects.map(subject => {
              const present = rdf.selectedSubjects.includes(subject)
              return (
                <li key={subject}>
                  <label title={subject}>
                    <input
                      type="checkbox"
                      checked={present}
                      onChange={event => void toggle(subject, event.target.checked)}
                    />
                    <span>{display.get(subject) ?? subject}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

export default ReferencesPanel
