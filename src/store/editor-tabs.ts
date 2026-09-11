import type { AppState, EditorLanguage, EditorTab } from '@/types'

/**
 * Tab bookkeeping for the editor pane, as pure state transitions so the
 * reducer stays a thin switch and the rules can be tested without React.
 *
 * Every tab owns its document; `editor.content`, `editor.language` and
 * `rdf.selectedSubjects` are mirrors of the active tab that `mirror()`
 * refreshes after each transition. Closing a tab removes that one record and
 * nothing else, so the remaining tabs are untouched by construction.
 */

export const SOURCE_TAB_ID = 'source'

export interface OpenTabPayload {
  content: string
  language: EditorLanguage
  /** Defaults to "Result N". */
  title?: string
  /** Diagram selection to start with; empty means the usual auto-pick. */
  selectedSubjects?: string[]
}

export function createSourceTab(content: string, language: EditorLanguage): EditorTab {
  return { id: SOURCE_TAB_ID, title: 'Source', content, language, selectedSubjects: [] }
}

export function activeTab(state: AppState): EditorTab {
  const { tabs, activeTabId } = state.editor
  return tabs.find(tab => tab.id === activeTabId) ?? tabs[0]
}

/** Copy the active tab's document into the fields the rest of the app reads. */
function mirror(state: AppState): AppState {
  const tab = activeTab(state)
  return {
    ...state,
    editor: { ...state.editor, content: tab.content, language: tab.language },
    rdf: { ...state.rdf, selectedSubjects: tab.selectedSubjects },
  }
}

/** Patch the active tab, then refresh the mirrors. */
export function updateActiveTab(
  state: AppState,
  patch: Partial<Pick<EditorTab, 'title' | 'content' | 'language' | 'selectedSubjects'>>,
): AppState {
  const { activeTabId } = state.editor
  const tabs = state.editor.tabs.map(tab => (tab.id === activeTabId ? { ...tab, ...patch } : tab))
  return mirror({ ...state, editor: { ...state.editor, tabs } })
}

/** Add a tab after the others and make it active. */
export function openTab(state: AppState, payload: OpenTabPayload): AppState {
  const resultCount = state.editor.resultCount + 1
  const tab: EditorTab = {
    id: `result-${resultCount}`,
    title: payload.title ?? `Result ${resultCount}`,
    content: payload.content,
    language: payload.language,
    selectedSubjects: payload.selectedSubjects ?? [],
  }
  return mirror({
    ...state,
    editor: {
      ...state.editor,
      tabs: [...state.editor.tabs, tab],
      activeTabId: tab.id,
      resultCount,
    },
  })
}

export function activateTab(state: AppState, id: string): AppState {
  if (id === state.editor.activeTabId) return state
  if (!state.editor.tabs.some(tab => tab.id === id)) return state
  return mirror({ ...state, editor: { ...state.editor, activeTabId: id } })
}

/**
 * Remove a tab. The last remaining tab cannot be closed. Closing the active
 * tab moves to its right-hand neighbour, or the left-hand one at the end of
 * the row; closing any other tab leaves the active document as it is.
 */
export function closeTab(state: AppState, id: string): AppState {
  const { tabs, activeTabId } = state.editor
  const index = tabs.findIndex(tab => tab.id === id)
  if (index === -1 || tabs.length === 1) return state

  const remaining = tabs.filter(tab => tab.id !== id)
  const nextActiveId =
    id === activeTabId ? (remaining[index] ?? remaining[index - 1]).id : activeTabId
  return mirror({ ...state, editor: { ...state.editor, tabs: remaining, activeTabId: nextActiveId } })
}
