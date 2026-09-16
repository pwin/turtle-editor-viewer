import { useAppContext } from '@/store/AppProvider'
import './EditorTabs.css'

/**
 * Tab strip for the documents open in the editor pane. Any tab can be closed
 * except the last one. The "+" opens an empty tab: the way to bring a second
 * file in alongside the first, such as a shapes graph to validate against.
 */
function EditorTabs() {
  const { state, dispatch } = useAppContext()
  const { tabs, activeTabId } = state.editor
  const { shapesTabId } = state.shacl
  const untitled = tabs.filter(tab => tab.title.startsWith('Untitled')).length + 1

  return (
    <div className="editor-tabs" role="tablist" aria-label="Open documents">
      {tabs.map(tab => {
        const active = tab.id === activeTabId
        const isShapes = tab.id === shapesTabId
        return (
          <div key={tab.id} className={`editor-tab${active ? ' active' : ''}`}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="editor-tab-select"
              title={isShapes ? `${tab.title} (shapes for validation)` : tab.title}
              onClick={() => dispatch({ type: 'ACTIVATE_EDITOR_TAB', payload: tab.id })}
            >
              {tab.title}
              {isShapes && <span className="editor-tab-badge">shapes</span>}
            </button>
            {tabs.length > 1 && (
              <button
                type="button"
                className="editor-tab-close"
                aria-label={`Close ${tab.title}`}
                title="Close tab"
                onClick={() => dispatch({ type: 'CLOSE_EDITOR_TAB', payload: tab.id })}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="editor-tab-new"
        aria-label="New tab"
        title="New empty tab"
        onClick={() =>
          dispatch({
            type: 'OPEN_EDITOR_TAB',
            payload: { id: `untitled-${untitled}`, title: `Untitled ${untitled}`, content: '', language: 'turtle' },
          })
        }
      >
        +
      </button>
    </div>
  )
}

export default EditorTabs
