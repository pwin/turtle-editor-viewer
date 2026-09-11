import { useAppContext } from '@/store/AppProvider'
import './EditorTabs.css'

/**
 * Tab strip for the documents open in the editor pane. Hidden while only one
 * document is open, so the pane looks as it always did until a query result
 * opens alongside the source. Any tab can be closed except the last one.
 */
function EditorTabs() {
  const { state, dispatch } = useAppContext()
  const { tabs, activeTabId } = state.editor

  if (tabs.length < 2) return null

  return (
    <div className="editor-tabs" role="tablist" aria-label="Open documents">
      {tabs.map(tab => {
        const active = tab.id === activeTabId
        return (
          <div key={tab.id} className={`editor-tab${active ? ' active' : ''}`}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="editor-tab-select"
              title={tab.title}
              onClick={() => dispatch({ type: 'ACTIVATE_EDITOR_TAB', payload: tab.id })}
            >
              {tab.title}
            </button>
            <button
              type="button"
              className="editor-tab-close"
              aria-label={`Close ${tab.title}`}
              title="Close tab"
              onClick={() => dispatch({ type: 'CLOSE_EDITOR_TAB', payload: tab.id })}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default EditorTabs
