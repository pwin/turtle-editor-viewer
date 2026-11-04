import { RDFParser } from '@/services/rdf-parser'
import type { RDFQuad } from '@/types'

/**
 * Who points at a thing.
 *
 * Clicking a node in the diagram asks "what refers to this?", and the answer
 * is every subject of a triple whose object is the clicked term. Each is
 * returned keyed the way the subject picker keys it -- a prefixed IRI for a
 * named node, the bare label for a blank node -- because those keys are what
 * `rdf.selectedSubjects` holds and what `generateDotFromRDF` is given. A key
 * that did not match would leave a checkbox that could never look ticked.
 */

/** The key a subject is known by, matching RDFParser's own subject list. */
export function subjectKey(term: RDFQuad['subject'], prefixes: Record<string, string>): string {
  return term.termType === 'NamedNode' ? RDFParser.shrinkIRI(term.value, prefixes) : term.value
}

/**
 * The subjects of every triple whose object is `objectValue`, sorted, without
 * repeats, and without the clicked thing itself: a subject that refers to
 * itself is already in the diagram wherever it was clicked.
 *
 * Matching is on the term's value, which is what the diagram puts in a node's
 * title, so an IRI, a literal's text and a blank node's label all work.
 * Triple terms are skipped: their value is the empty string, which would
 * otherwise match every node whose own value is empty.
 */
export function referencingSubjects(
  quads: RDFQuad[],
  objectValue: string,
  prefixes: Record<string, string> = {},
): string[] {
  if (objectValue === '') return []
  const found = new Set<string>()
  for (const quad of quads) {
    if (quad.object.termType === 'Quad') continue
    if (quad.object.value !== objectValue) continue
    // Compared before keying: the key is a prefixed name and objectValue is a
    // full IRI, so testing the key against it would never match.
    if (quad.subject.value === objectValue) continue
    found.add(subjectKey(quad.subject, prefixes))
  }
  return [...found].sort((a, b) => a.localeCompare(b))
}

/** The selection with `subject` added or removed, left sorted as it was given. */
export function toggleSubject(selected: string[], subject: string, present: boolean): string[] {
  if (present) return selected.includes(subject) ? selected : [...selected, subject]
  return selected.filter(s => s !== subject)
}
