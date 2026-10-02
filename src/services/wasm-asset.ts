/**
 * Fetches a WebAssembly binary that ships with the app, and explains itself
 * when it cannot.
 *
 * Both engines -- the SPARQL store and the SHACL validator -- are Vite assets
 * served from the app's own origin and fetched on first use. The one way that
 * fails without the server being at fault is a page opened straight from the
 * filesystem: `file://` is an opaque origin, so `fetch` of a relative URL is
 * refused before a request is made, and the Content Security Policy's
 * `default-src 'self'` cannot match a file origin either. The browser reports
 * that as `TypeError: Failed to fetch`, which told the user nothing and was
 * the whole of a red banner over the query panel.
 *
 * So the protocol is checked first, and a rejected fetch says what it means.
 */
export async function fetchWasm(url: string, engineName: string): Promise<ArrayBuffer> {
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    throw new Error(
      `${engineName} cannot load from a page opened as a file. Browsers refuse ` +
        'every request from a file:// page, including this app asking for its own ' +
        'files. Serve the folder over HTTP instead -- any static web server will ' +
        'do, or `npm run preview` from a checkout -- and it will work.',
    )
  }
  let response: Response
  try {
    response = await fetch(url)
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new Error(
      `${engineName} could not be downloaded (${detail}). It is served from this ` +
        'app\'s own address, so the usual causes are a deployment missing its ' +
        '"assets" folder, an extension or proxy blocking the request, or a ' +
        'Content Security Policy from the web server. The browser console names ' +
        'the reason.',
    )
  }
  if (!response.ok) {
    throw new Error(
      `${engineName} could not be downloaded (HTTP ${response.status} for ${url}). ` +
        'Check that the deployment includes the whole "assets" folder.',
    )
  }
  return response.arrayBuffer()
}
