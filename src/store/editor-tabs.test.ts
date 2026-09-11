import { describe, expect, it } from 'vitest'
import type { AppState } from '@/types'
import {
  SOURCE_TAB_ID,
  activateTab,
  activeTab,
  closeTab,
  createSourceTab,
  openTab,
  updateActiveTab,
} from './editor-tabs'

const SOURCE = '@prefix ex: <http://ex/> . ex:a ex:p ex:b .'
const RESULT = '<http://ex/a> <http://ex/p> <http://ex/b> .'

/** The slice of AppState the tab logic touches, with the rest stubbed. */
function baseState(): AppState {
  return {
    editor: {
      content: SOURCE,
      language: 'turtle',
      theme: 'light',
      fontSize: 12,
      isLoading: false,
      tabs: [createSourceTab(SOURCE, 'turtle')],
      activeTabId: SOURCE_TAB_ID,
      resultCount: 0,
    },
    rdf: { quads: [], subjects: [], prefixes: {}, selectedSubjects: ['ex:a'], labels: {} },
    graph: {} as AppState['graph'],
    sparql: {} as AppState['sparql'],
  }
}

/** Source tab with a picked subject, plus one result tab that is active. */
function withResult(): AppState {
  const withSelection = updateActiveTab(baseState(), { selectedSubjects: ['ex:a'] })
  return openTab(withSelection, { content: RESULT, language: 'turtle', selectedSubjects: ['<http://ex/a>'] })
}

describe('openTab', () => {
  it('appends the tab, activates it and mirrors its document', () => {
    const s = withResult()
    expect(s.editor.tabs.map(t => t.id)).toEqual([SOURCE_TAB_ID, 'result-1'])
    expect(s.editor.activeTabId).toBe('result-1')
    expect(s.editor.content).toBe(RESULT)
    expect(s.editor.language).toBe('turtle')
    expect(s.rdf.selectedSubjects).toEqual(['<http://ex/a>'])
  })

  it('names result tabs by a running count that survives closes', () => {
    let s = withResult()
    s = closeTab(s, 'result-1')
    s = openTab(s, { content: RESULT, language: 'turtle' })
    expect(activeTab(s).title).toBe('Result 2')
    expect(activeTab(s).id).toBe('result-2')
  })

  it('accepts an explicit title', () => {
    const s = openTab(baseState(), { content: RESULT, language: 'turtle', title: 'DESCRIBE 1' })
    expect(activeTab(s).title).toBe('DESCRIBE 1')
  })

  it('leaves the previous tab exactly as it was', () => {
    const before = baseState()
    const s = openTab(before, { content: RESULT, language: 'turtle' })
    expect(s.editor.tabs[0]).toEqual(before.editor.tabs[0])
  })
})

describe('updateActiveTab', () => {
  it('writes through to the active tab only', () => {
    const s = updateActiveTab(withResult(), { content: 'edited', language: 'xml' })
    expect(s.editor.content).toBe('edited')
    expect(s.editor.language).toBe('xml')
    expect(s.editor.tabs[1].content).toBe('edited')
    expect(s.editor.tabs[0].content).toBe(SOURCE)
    expect(s.editor.tabs[0].language).toBe('turtle')
  })

  it('records the diagram selection on the active tab', () => {
    const s = updateActiveTab(withResult(), { selectedSubjects: ['x', 'y'] })
    expect(s.rdf.selectedSubjects).toEqual(['x', 'y'])
    expect(s.editor.tabs[1].selectedSubjects).toEqual(['x', 'y'])
    expect(s.editor.tabs[0].selectedSubjects).toEqual(['ex:a'])
  })
})

describe('activateTab', () => {
  it('restores the other tab\'s content, language and selection', () => {
    const s = activateTab(withResult(), SOURCE_TAB_ID)
    expect(s.editor.activeTabId).toBe(SOURCE_TAB_ID)
    expect(s.editor.content).toBe(SOURCE)
    expect(s.rdf.selectedSubjects).toEqual(['ex:a'])
  })

  it('round-trips edits made in each tab', () => {
    let s = updateActiveTab(withResult(), { content: 'result edited' })
    s = activateTab(s, SOURCE_TAB_ID)
    s = updateActiveTab(s, { content: 'source edited' })
    s = activateTab(s, 'result-1')
    expect(s.editor.content).toBe('result edited')
    s = activateTab(s, SOURCE_TAB_ID)
    expect(s.editor.content).toBe('source edited')
  })

  it('ignores an unknown id and a re-activation', () => {
    const s = withResult()
    expect(activateTab(s, 'nope')).toBe(s)
    expect(activateTab(s, 'result-1')).toBe(s)
  })
})

describe('closeTab', () => {
  it('closing the child keeps the parent\'s document intact', () => {
    let s = withResult()
    s = activateTab(s, SOURCE_TAB_ID)
    s = updateActiveTab(s, { content: 'source edited', selectedSubjects: ['ex:z'] })
    s = activateTab(s, 'result-1')

    s = closeTab(s, 'result-1')

    expect(s.editor.tabs.map(t => t.id)).toEqual([SOURCE_TAB_ID])
    expect(s.editor.activeTabId).toBe(SOURCE_TAB_ID)
    expect(s.editor.content).toBe('source edited')
    expect(s.rdf.selectedSubjects).toEqual(['ex:z'])
  })

  it('closing the parent keeps the child\'s document intact', () => {
    let s = withResult()
    s = updateActiveTab(s, { content: 'result edited' })
    s = activateTab(s, SOURCE_TAB_ID)

    s = closeTab(s, SOURCE_TAB_ID)

    expect(s.editor.tabs.map(t => t.id)).toEqual(['result-1'])
    expect(s.editor.activeTabId).toBe('result-1')
    expect(s.editor.content).toBe('result edited')
    expect(s.rdf.selectedSubjects).toEqual(['<http://ex/a>'])
  })

  it('closing a background tab does not disturb the active one', () => {
    const s = withResult()
    const closed = closeTab(s, SOURCE_TAB_ID)
    expect(closed.editor.activeTabId).toBe('result-1')
    expect(closed.editor.content).toBe(RESULT)
    expect(closed.editor.tabs).toEqual([s.editor.tabs[1]])
  })

  it('moves to the right-hand neighbour, or the left-hand one at the end', () => {
    let s = openTab(withResult(), { content: 'r2', language: 'turtle' })
    s = openTab(s, { content: 'r3', language: 'turtle' })
    // tabs: source, result-1, result-2, result-3 (active)

    s = activateTab(s, 'result-2')
    s = closeTab(s, 'result-2')
    expect(s.editor.activeTabId).toBe('result-3')
    expect(s.editor.content).toBe('r3')

    s = closeTab(s, 'result-3')
    expect(s.editor.activeTabId).toBe('result-1')
    expect(s.editor.content).toBe(RESULT)
  })

  it('refuses to close the last remaining tab', () => {
    const s = baseState()
    expect(closeTab(s, SOURCE_TAB_ID)).toBe(s)
  })

  it('ignores an unknown id', () => {
    const s = withResult()
    expect(closeTab(s, 'nope')).toBe(s)
  })
})
