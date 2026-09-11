import { describe, expect, it } from 'vitest'
import { escapeHtml } from './html'

describe('escapeHtml', () => {
  it('neutralises markup and attribute delimiters', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    )
  })

  it('escapes the ampersand first so entities are not double-decoded', () => {
    expect(escapeHtml('&lt;b&gt;')).toBe('&amp;lt;b&amp;gt;')
  })

  it('escapes single quotes for attribute contexts', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s')
  })

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('bt:shop-ex-libris bs:founded "1919"^^xsd:gYear')).toBe(
      'bt:shop-ex-libris bs:founded &quot;1919&quot;^^xsd:gYear',
    )
  })
})
