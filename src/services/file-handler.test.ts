import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileHandler, describeFetchFailure } from './file-handler'

const URL_UNDER_TEST = 'https://raw.githubusercontent.com/pwin/SPARQL_Course/main/data/bookshop-trail-full.ttl'

afterEach(() => {
  vi.unstubAllGlobals()
})

const stubFetch = (fn: (url: string) => Promise<Response> | Response) =>
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve(fn(String(input)))))

describe('describeFetchFailure', () => {
  it('names the possibilities for an opaque network failure instead of asserting CORS', () => {
    const text = describeFetchFailure(new TypeError('Failed to fetch'))
    expect(text).toContain('Failed to fetch')
    expect(text).toContain("console")
    expect(text).toContain('Access-Control-Allow-Origin')
    expect(text).toContain('extension, proxy or content blocker')
  })

  it('passes a known error through as itself', () => {
    expect(describeFetchFailure(new Error('HTTP 404: Not Found'))).toBe('HTTP 404: Not Found')
  })
})

describe('FileHandler.loadWithCORS', () => {
  it('returns the content when the fetch succeeds', async () => {
    stubFetch(() => new Response('<http://s> <http://p> "o" .', { headers: { 'content-type': 'text/turtle' } }))
    const result = await FileHandler.loadWithCORS(URL_UNDER_TEST)
    expect(result.error).toBeUndefined()
    expect(result.content).toContain('http://s')
    expect(result.contentType).toContain('text/turtle')
  })

  it('reports an HTTP status as itself, not as a CORS problem', async () => {
    stubFetch(() => new Response('Not Found', { status: 404, statusText: 'Not Found' }))
    const result = await FileHandler.loadWithCORS(URL_UNDER_TEST)
    expect(result.error).toContain('404')
    expect(result.error).not.toMatch(/CORS error/)
  })

  it('reports a rate-limited response as itself', async () => {
    stubFetch(() => new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }))
    const result = await FileHandler.loadWithCORS(URL_UNDER_TEST)
    expect(result.error).toContain('429')
  })

  it('names the url and the possibilities when the fetch is blocked outright', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    const result = await FileHandler.loadWithCORS(URL_UNDER_TEST)
    expect(result.error).toContain(URL_UNDER_TEST)
    expect(result.error).toContain('Access-Control-Allow-Origin')
    // The old message asserted the server was at fault; this one does not.
    expect(result.error).not.toMatch(/The server doesn't allow/)
  })

  it('rejects a malformed address before fetching', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await FileHandler.loadWithCORS('not a url')
    expect(result.error).toContain('Invalid URL')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
