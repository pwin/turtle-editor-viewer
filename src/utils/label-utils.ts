import type { Literal, RDFQuad } from '@/types'

/**
 * Annotation properties that can stand in for an opaque URI, in precedence
 * order — the first one a subject actually has wins.
 *
 * skos:prefLabel outranks rdfs:label because it is explicitly declared as *the*
 * preferred name for a resource, whereas rdfs:label is a general-purpose
 * annotation that a resource may carry several of.
 */
export const LABEL_PREDICATES: readonly string[] = [
  'http://www.w3.org/2004/02/skos/core#prefLabel',
  'http://www.w3.org/2000/01/rdf-schema#label',
]

export interface SubjectOption {
  /**
   * Stable identifier for the subject: a prefixed IRI, or a blank node id.
   * This is what selection and graph generation key off, so it is always the
   * option's value and is guaranteed unique regardless of labelling.
   */
  value: string
  /** Text to show in the picker. */
  display: string
  /** The chosen label, when the subject had one at all. */
  label?: string
}

/**
 * Rank language tags so that repeated renders always pick the same label.
 * Plain (untagged) literals win, then English, then anything else.
 */
function languageRank(language?: string): number {
  if (!language) return 0
  const lang = language.toLowerCase()
  if (lang === 'en') return 1
  if (lang.startsWith('en-')) return 2
  return 3
}

/**
 * Choose one literal from several candidates for the same property.
 * Ties break on the literal value so the result is deterministic.
 */
function preferred(candidates: Literal[]): string {
  return [...candidates].sort((a, b) => {
    const rank = languageRank(a.language) - languageRank(b.language)
    if (rank !== 0) return rank
    const lang = (a.language ?? '').localeCompare(b.language ?? '')
    if (lang !== 0) return lang
    return a.value.localeCompare(b.value)
  })[0].value
}

/**
 * Build a subject-key -> label map from the parsed quads.
 *
 * `keyOf` must produce the same key the subject list uses (prefixed IRI for
 * named nodes, raw id for blank nodes), otherwise labels will not join up.
 */
export function extractLabels(
  quads: RDFQuad[],
  keyOf: (subject: RDFQuad['subject']) => string,
): Record<string, string> {
  const candidates = new Map<string, Map<string, Literal[]>>()

  for (const quad of quads) {
    if (quad.object.termType !== 'Literal') continue
    const predicate = quad.predicate.value
    if (!LABEL_PREDICATES.includes(predicate)) continue

    const key = keyOf(quad.subject)
    let byPredicate = candidates.get(key)
    if (!byPredicate) candidates.set(key, (byPredicate = new Map()))
    const list = byPredicate.get(predicate)
    if (list) list.push(quad.object)
    else byPredicate.set(predicate, [quad.object])
  }

  const labels: Record<string, string> = {}
  for (const [key, byPredicate] of candidates) {
    for (const predicate of LABEL_PREDICATES) {
      const found = byPredicate.get(predicate)
      if (found && found.length > 0) {
        labels[key] = preferred(found)
        break
      }
    }
  }
  return labels
}

/**
 * Map each key to the text that should stand in for it.
 *
 * Labels are not unique in RDF — two resources may share an rdfs:label — so a
 * bare label can be ambiguous. A label is used on its own only when exactly one
 * key in `keys` carries it; where several do, `disambiguate` is applied to
 * distinguish them. Keys with no label are absent from the result, so callers
 * fall back to showing the key itself.
 *
 * Ambiguity is judged only across the keys passed in, so the picker and the
 * diagram each disambiguate within what they actually show.
 */
export function buildLabelDisplayMap(
  keys: string[],
  labels: Record<string, string>,
  disambiguate: (label: string, key: string) => string = (label, key) =>
    `${label}  〈${key}〉`,
): Map<string, string> {
  const timesUsed = new Map<string, number>()
  for (const key of keys) {
    const label = labels[key]
    if (label) timesUsed.set(label, (timesUsed.get(label) ?? 0) + 1)
  }

  const display = new Map<string, string>()
  for (const key of keys) {
    const label = labels[key]
    if (!label) continue
    display.set(key, (timesUsed.get(label) ?? 0) > 1 ? disambiguate(label, key) : label)
  }
  return display
}

/**
 * Pair every subject with the text to show for it in the picker.
 * Subjects with no label keep showing their IRI.
 */
export function buildSubjectOptions(
  subjects: string[],
  labels: Record<string, string>,
  useLabels: boolean,
): SubjectOption[] {
  if (!useLabels) {
    return subjects.map(value => ({ value, display: value }))
  }

  const displays = buildLabelDisplayMap(subjects, labels)
  return subjects.map(value => {
    const display = displays.get(value)
    return display ? { value, display, label: labels[value] } : { value, display: value }
  })
}
