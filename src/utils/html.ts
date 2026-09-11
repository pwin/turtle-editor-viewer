/**
 * Escape text for interpolation into an HTML string. Anything that came from
 * the data (labels, IRIs, Graphviz output, error messages that quote the
 * input) must go through this before it meets innerHTML, or a literal such as
 * `<img src=x onerror=...>` in someone's RDF becomes script running in the
 * app. Where a DOM node is to hand, prefer setting textContent instead.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
