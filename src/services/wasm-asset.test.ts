import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWasm } from './wasm-asset'

const URL_UNDER_TEST = '/assets/holos_wasm_bg-abc123.wasm'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Replace the protocol the helper checks, as a page opened from disk has. */
const atProtocol = (protocol: string) => vi.stubGlobal('location', { protocol })

/** The rejection, typed as one, so the assertions below read plainly. */
async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('expected the promise to reject, and it resolved')
}

describe('fetchWasm', () => {
  it('returns the bytes when the asset is served', async () => {
    atProtocol('https:')
    const bytes = new Uint8Array([0, 97, 115, 109]).buffer
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(bytes))))
    await expect(fetchWasm(URL_UNDER_TEST, 'The SPARQL engine')).resolves.toBeInstanceOf(ArrayBuffer)
  })

  it('explains a file:// page instead of letting fetch fail opaquely', async () => {
    atProtocol('file:')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(fetchWasm(URL_UNDER_TEST, 'The SPARQL engine')).rejects.toThrow(
      /cannot load from a page opened as a file/,
    )
    // Checked before the request, so the browser's own opaque failure never happens.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('names the engine in that message, so the banner says which one', async () => {
    atProtocol('file:')
    vi.stubGlobal('fetch', vi.fn())
    await expect(fetchWasm(URL_UNDER_TEST, 'The SHACL engine')).rejects.toThrow(/^The SHACL engine/)
  })

  it('suggests how to serve it', async () => {
    atProtocol('file:')
    vi.stubGlobal('fetch', vi.fn())
    await expect(fetchWasm(URL_UNDER_TEST, 'The SPARQL engine')).rejects.toThrow(/over HTTP/)
  })

  it('reports a missing asset as its status, pointing at the deployment', async () => {
    atProtocol('https:')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('nope', { status: 404 }))))
    const error = await caught(fetchWasm(URL_UNDER_TEST, 'The SPARQL engine'))
    expect(error.message).toContain('HTTP 404')
    expect(error.message).toContain(URL_UNDER_TEST)
    expect(error.message).toContain('assets')
  })

  it('wraps a blocked request with the possibilities rather than "Failed to fetch" alone', async () => {
    atProtocol('https:')
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    const error = await caught(fetchWasm(URL_UNDER_TEST, 'The SPARQL engine'))
    expect(error.message).toContain('Failed to fetch')
    expect(error.message).toContain('could not be downloaded')
    expect(error.message).toMatch(/extension or proxy/)
    expect(error.message).toMatch(/Content Security Policy/)
  })
})
