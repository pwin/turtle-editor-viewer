import type { RDFQuad, RDFTerm, GraphOptions } from '@/types'
import { RDFParser } from './rdf-parser'
import { buildLabelDisplayMap } from '@/utils/label-utils'

export interface DotGenerationResult {
  dotText: string
  error?: string
}

export class GraphGenerator {
  private prefixes: Record<string, string> = {}
  private declared: Map<any, string> = new Map()
  private nodeDeclarations: string[] = []
  /** Node key -> text to render in the box, when a label should stand in for the IRI. */
  private nodeLabels: Map<string, string> = new Map()
  /**
   * Node ids already given a declaration line. `declared` is keyed on the term
   * object and the parser hands us a fresh object per occurrence, so without
   * this the same node is re-declared once per mention.
   */
  private declaredRefs: Set<string> = new Set()
  /** Predicate key -> text to render on the edge, when a label stands in for the IRI. */
  private predicateLabels: Map<string, string> = new Map()
  /** Raw labels from the parser, for naming the terms inside a triple term. */
  private labels: Record<string, string> = {}
  /** Every node id this diagram draws, so triple-term links only target nodes that exist. */
  private nodesInDiagram: Set<string> = new Set()
  /** Triple terms drawn as nodes, by id, for the optional link-back pass. */
  private tripleTerms: Map<string, RDFTerm> = new Map()

  /**
   * Generate DOT graph from RDF quads
   */
  generateDotFromRDF(
    quads: RDFQuad[],
    selectedSubjects: string[],
    options: GraphOptions,
    prefixes: Record<string, string> = {},
    labels: Record<string, string> = {}
  ): DotGenerationResult {
    try {
      this.prefixes = prefixes
      this.labels = labels
      this.declared.clear()
      this.nodeDeclarations = []
      this.nodeLabels.clear()
      this.declaredRefs.clear()
      this.predicateLabels.clear()
      this.nodesInDiagram.clear()
      this.tripleTerms.clear()

      if (selectedSubjects.length === 0) {
        return {
          dotText: this.generateEmptyGraph(options),
          error: undefined,
        }
      }

      // Filter quads to only include selected subjects and recursively included blank nodes
      const relevantQuads = this.collectRelevantQuads(quads, selectedSubjects, options)

      // Resolve display labels up front, so ambiguity is judged across exactly
      // the nodes this diagram will contain.
      if (options.showNodeLabels) {
        this.nodeLabels = this.resolveNodeLabels(relevantQuads, labels)
      }
      if (options.showPredicateLabels) {
        this.predicateLabels = this.resolvePredicateLabels(relevantQuads, labels)
      }

      // Generate DOT content
      let graphContent = this.generateGraphContent(relevantQuads, options)

      // Runs after the content pass so every node the diagram contains is
      // known, which is what decides whether a link has somewhere to go.
      if (options.linkTripleTerms) {
        graphContent += this.linkTripleTerms()
      }

      // Create legend if needed
      const legend = options.showPrefixes ? this.createLegend() : ''

      // Combine into final DOT
      const dotText = `digraph {
  node [shape="box", style="rounded"];
  rankdir="${options.layoutDirection}";
  ratio="auto";

  subgraph RDF {
    ${this.nodeDeclarations.join('\n')}
    ${graphContent}
  }

  ${legend}
}`

      return {
        dotText,
        error: undefined,
      }
    } catch (error) {
      return {
        dotText: '',
        error: `Graph generation error: ${error}`,
      }
    }
  }

  /**
   * Generate empty graph placeholder
   */
  private generateEmptyGraph(options: GraphOptions): string {
    return `digraph {
  node [shape="box", style="rounded"];
  rankdir="${options.layoutDirection}";

  empty [label="No subjects selected\\nParse RDF and select subjects to visualize" style="dashed" color="gray"];
}`
  }

  /**
   * Collect quads recursively including blank nodes
   */
  // private collectRelevantQuads(
  //   allQuads: RDFQuad[],
  //   selectedSubjects: string[],
  //   options: GraphOptions
  // ): RDFQuad[] {
  //   const expandedSubjects = selectedSubjects.map((subject) =>
  //     RDFParser.expandIRI(subject, this.prefixes)
  //   )

  //   const relevantQuads: RDFQuad[] = []
  //   const seenSubjects = new Set<string>()
  //   const queue: string[] = [...expandedSubjects, ...selectedSubjects] // Handle both expanded and raw

  //   while (queue.length > 0) {
  //     const subjectVal = queue.shift()!
  //     if (seenSubjects.has(subjectVal)) continue
  //     seenSubjects.add(subjectVal)

  //     // Find matching quads
  //     const subjectQuads = allQuads.filter((q) => q.subject.value === subjectVal)

  //     subjectQuads.forEach((q) => {
  //       // Skip rdf:type if hideTypes is enabled
  //       if (
  //         options.hideTypes &&
  //         q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
  //       ) {
  //         return
  //       }

  //       // Skip annotations if hideAnnotations is enabled
  //       if (options.hideAnnotations && this.isAnnotationProperty(q.predicate.value)) {
  //         return
  //       }

  //       relevantQuads.push(q)

  //       // If object is BlankNode, add to queue for recursion
  //       if (q.object.termType === 'BlankNode') {
  //         if (!seenSubjects.has(q.object.value)) {
  //           queue.push(q.object.value)
  //         }
  //       }
  //     })
  //   }

  //   return relevantQuads
  // }

  /**
   * Collect quads recursively including blank nodes, with deduplication and safety checks
   */
  private collectRelevantQuads(
    allQuads: RDFQuad[] = [],
    selectedSubjects: string[],
    options: GraphOptions
  ): RDFQuad[] {
    // Defensive: ensure we always have an array
    if (!Array.isArray(allQuads)) {
      throw new Error('collectRelevantQuads called with non-array allQuads')
    }

    const expandedSubjects = selectedSubjects.map((subject) =>
      RDFParser.expandIRI(subject, this.prefixes)
    )

    const relevantQuads: RDFQuad[] = []
    const seenSubjects = new Set<string>()
    const seenQuads = new Set<string>() // Track unique quads
    const queue: string[] = [...expandedSubjects, ...selectedSubjects]

    while (queue.length > 0) {
      const subjectVal = queue.shift()!
      if (seenSubjects.has(subjectVal)) continue
      seenSubjects.add(subjectVal)

      const subjectQuads = allQuads.filter((q) => q.subject.value === subjectVal)

      subjectQuads.forEach((q) => {
        // Skip rdf:type if hideTypes is enabled
        if (
          options.hideTypes &&
          q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
        ) {
          return
        }

        // Skip annotations if hideAnnotations is enabled
        if (options.hideAnnotations && this.isAnnotationProperty(q.predicate.value)) {
          return
        }

        // Build a unique key for deduplication. The object goes through
        // termKey rather than .value: a triple term's .value is the empty
        // string, so keying on it would collapse every triple term that
        // shares a subject and predicate into one.
        const quadKey = `${q.subject.value}|${q.predicate.value}|${this.termKey(q.object)}|${q.graph?.value ?? ''}`

        if (!seenQuads.has(quadKey)) {
          seenQuads.add(quadKey)
          relevantQuads.push(q)
        }

        // If object is BlankNode, add to queue for recursion
        if (q.object.termType === 'BlankNode' && !seenSubjects.has(q.object.value)) {
          queue.push(q.object.value)
        }
      })
    }

    return relevantQuads
  }

  /**
   * Generate the main graph content
   */
  private generateGraphContent(quads: RDFQuad[], options: GraphOptions): string {
    let content = ''
    const seenSubjects = new Set<string>()

    // Group quads by subject
    const quadsBySubject = new Map<string, RDFQuad[]>()
    quads.forEach((q) => {
      if (!quadsBySubject.has(q.subject.value)) {
        quadsBySubject.set(q.subject.value, [])
      }
      quadsBySubject.get(q.subject.value)!.push(q)
    })

    // Iterate over subjects
    for (const [subject, subjectQuads] of quadsBySubject) {
      if (seenSubjects.has(subject)) continue
      seenSubjects.add(subject)

      if (this.isListNode(subjectQuads)) {
        const listResult = this.renderList(quads, subjectQuads[0].subject, options)
        content += listResult.content

        // Mark list nodes as seen to avoid double rendering
        listResult.processedQuads.forEach((q) => seenSubjects.add(q.subject.value))
      } else {
        subjectQuads.forEach((q) => {
          // Skip rdf:type if hideTypes is enabled
          if (
            options.hideTypes &&
            q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
          ) {
            return
          }
          // Skip annotations if hideAnnotations is enabled
          if (options.hideAnnotations && this.isAnnotationProperty(q.predicate.value)) {
            return
          }
          content += this.generateQuadStatement(q, options)
        })
      }
    }

    return content
  }

  /**
   * Generate a single quad statement in DOT format
   */
  private generateQuadStatement(quad: RDFQuad, options: GraphOptions): string {
    const subjectRef = this.declareTerm(quad.subject, options)
    const objectRef = this.declareTerm(quad.object, options)
    const predicateRef = this.shrinkIRI(quad.predicate.value)
    const predicateLabel = this.predicateLabels.get(predicateRef) ?? predicateRef

    return `  "${this.escapeDot(subjectRef)}" -> "${this.escapeDot(objectRef)}" [label="${this.escapeDot(predicateLabel)}"];\n`
  }

  /**
   * Work out the display text for every named/blank node in this diagram.
   *
   * Literals are excluded: they are values, not resources, so they have no IRI
   * for a label to stand in for. The disambiguator puts the IRI on its own line
   * so a box stays readable when two resources share a label.
   */
  private resolveNodeLabels(
    quads: RDFQuad[],
    labels: Record<string, string>
  ): Map<string, string> {
    const keys = new Set<string>()
    const collect = (term: RDFTerm) => {
      if (term.termType === 'NamedNode') keys.add(this.shrinkIRI(term.value))
      else if (term.termType === 'BlankNode') keys.add(term.value)
      // A triple term's own terms are shown inside its node, so they need
      // labels too.
      else if (term.termType === 'Quad') {
        collect(term.subject)
        collect(term.object)
      }
    }
    for (const quad of quads) {
      collect(quad.subject)
      collect(quad.object)
    }
    return buildLabelDisplayMap(
      Array.from(keys),
      labels,
      (label, key) => `${label}\\n〈${key}〉`
    )
  }

  /**
   * Work out the display text for every property used in this diagram.
   *
   * A property only has a label when the data describes it as a subject in its
   * own right (e.g. `ff:hasElementPart rdfs:label "has element part"`), which is
   * common in ontologies. Ambiguity is judged across predicates alone, since
   * edge labels and node boxes are separate visual channels.
   */
  private resolvePredicateLabels(
    quads: RDFQuad[],
    labels: Record<string, string>
  ): Map<string, string> {
    const keys = new Set<string>()
    const collect = (term: RDFTerm) => {
      if (term.termType === 'Quad') {
        keys.add(this.shrinkIRI(term.predicate.value))
        collect(term.object)
      }
    }
    for (const quad of quads) {
      keys.add(this.shrinkIRI(quad.predicate.value))
      collect(quad.object)
    }
    return buildLabelDisplayMap(
      Array.from(keys),
      labels,
      (label, key) => `${label}\\n〈${key}〉`
    )
  }

  /**
   * A stable identity for a term, by content. Plain terms are identified by
   * kind and value; a triple term (RDF 1.2, termType 'Quad') by the terms it
   * contains, recursively, since its own .value is always the empty string.
   */
  private termKey(term: RDFTerm): string {
    if (term.termType === 'Quad') {
      return `<<(${this.termKey(term.subject)} ${this.termKey(term.predicate)} ${this.termKey(term.object)})>>`
    }
    if (term.termType === 'Literal') {
      return `Literal:${term.value}@${term.language}${term.direction ?? ''}^^${term.datatype.value}`
    }
    return `${term.termType}:${term.value}`
  }

  /**
   * The short form of a term for use inside a triple term's node text:
   * prefixed IRIs, `_:` blank nodes, quoted literals, and nested triple terms
   * in RDF 1.2 Turtle syntax. With `useLabels`, resources that have one show
   * their label instead, kept on one line.
   */
  private describeTerm(term: RDFTerm, useLabels: boolean): string {
    switch (term.termType) {
      case 'NamedNode': {
        const ref = this.shrinkIRI(term.value)
        return useLabels ? this.inlineLabel(ref) : ref
      }
      case 'BlankNode':
        return useLabels ? this.inlineLabel(term.value, `_:${term.value}`) : `_:${term.value}`
      case 'Literal':
        return `"${term.value}"`
      case 'Quad':
        return (
          `<<( ${this.describeTerm(term.subject, useLabels)} ` +
          `${this.describePredicate(term.predicate, useLabels)} ` +
          `${this.describeTerm(term.object, useLabels)} )>>`
        )
      default:
        return term.value
    }
  }

  private describePredicate(term: RDFTerm, useLabels: boolean): string {
    const ref = this.shrinkIRI(term.value)
    if (!useLabels) return ref
    const label = this.labels[ref]
    if (!label) return ref
    const display = this.predicateLabels.get(ref)
    return display && display !== label ? `${label} 〈${ref}〉` : label
  }

  /**
   * A node's label on one line, for embedding in a triple term. Uses the same
   * ambiguity decision as the standalone node, but joins the two parts with a
   * space rather than a line break.
   */
  private inlineLabel(key: string, fallback: string = key): string {
    const label = this.labels[key]
    if (!label) return fallback
    const display = this.nodeLabels.get(key)
    return display && display !== label ? `${label} 〈${key}〉` : label
  }

  /**
   * Declare a term and return its reference
   */
  /**
   * Tie each triple-term node back to the subject and object it mentions,
   * where those are drawn in this diagram too. Together with the statement's
   * own edge that makes a triangle, which is the clearest way to say "this
   * annotation is about that edge".
   *
   * The links are dashed and green to read as commentary rather than data,
   * and carry constraint=false so they never distort the layout: the real
   * edges decide where nodes sit, and these are drawn over the top. A part
   * that is not drawn as a node gets no link, so nothing is pulled into the
   * diagram just to be pointed at.
   */
  private linkTripleTerms(): string {
    let content = ''
    for (const [ref, term] of this.tripleTerms) {
      if (term.termType !== 'Quad') continue
      const seen = new Set<string>()
      for (const [role, part] of [
        ['subject', term.subject],
        ['object', term.object],
      ] as const) {
        const target = this.refOf(part)
        if (!this.nodesInDiagram.has(target) || target === ref || seen.has(target)) continue
        seen.add(target)
        content +=
          `  "${this.escapeDot(ref)}" -> "${this.escapeDot(target)}" ` +
          `[label="${role}",style="dashed",color="darkgreen",fontcolor="darkgreen",constraint=false];\n`
      }
    }
    return content
  }

  /**
   * The DOT node id a term is drawn under. Pure: safe to call to find out
   * where a term *would* be, without declaring it.
   */
  private refOf(term: RDFTerm): string {
    switch (term.termType) {
      case 'Literal':
        return this.wordWrap(term.value)
      case 'NamedNode':
        return this.shrinkIRI(term.value)
      case 'Quad':
        // Built from the plain IRIs so it is stable whatever the label
        // options are, and so the same triple term used twice is one node.
        return this.describeTerm(term, false)
      default:
        return term.value
    }
  }

  private declareTerm(term: any, options: GraphOptions): string {
    if (this.declared.has(term)) {
      return this.declared.get(term)!
    }

    const ref = this.refOf(term)
    const attributes: string[] = []

    if (term.termType === 'Literal') {
      attributes.push('color="blue"')
      attributes.push('fontcolor="blue"')
    } else if (term.termType === 'BlankNode') {
      attributes.push('color="orange"')
    } else if (term.termType === 'Quad') {
      // An RDF 1.2 triple term: a statement used as a value, most often the
      // target of rdf:reifies. It is drawn as its own node, coloured apart
      // from resources (default), literals (blue) and blank nodes (orange),
      // with the statement it stands for as the text.
      attributes.push('color="darkgreen"')
      attributes.push('fontcolor="darkgreen"')
      const withLabels = this.describeTerm(term, options.showNodeLabels)
      if (withLabels !== ref) {
        attributes.push(`label="${this.escapeDot(this.wordWrap(withLabels))}"`)
      }
      this.tripleTerms.set(ref, term)
    }

    this.nodesInDiagram.add(ref)
    this.declared.set(term, ref)

    // The node id stays the IRI so edges keep pointing at the right node and
    // two resources sharing a label can never merge; only the rendered text
    // changes.
    const display = this.nodeLabels.get(ref)
    if (display) {
      attributes.push(`label="${this.escapeDot(this.wordWrap(display))}"`)
    }

    // Add click handler for subjects if enabled. A triple term has no IRI to
    // look up, so it gets none.
    if (options.showSubjects && term.termType !== 'Quad') {
      const safeValue = term.value.replace(/'/g, "\\'")
      attributes.push(`URL="javascript:findTriplesForObject('${safeValue}')"`)
    }

    if (attributes.length > 0 && !this.declaredRefs.has(ref)) {
      this.declaredRefs.add(ref)
      this.nodeDeclarations.push(`  "${this.escapeDot(ref)}" [${attributes.join(',')}];`)
    }

    return ref
  }

  /**
   * Check if quads represent a list node
   */
  private isListNode(quads: RDFQuad[]): boolean {
    const listPredicates = new Set([
      'http://www.w3.org/1999/02/22-rdf-syntax-ns#first',
      'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest',
    ])

    return quads.length === 2 && quads.every((quad) => listPredicates.has(quad.predicate.value))
  }

  /**
   * Render RDF list structure
   */
  private renderList(
    allQuads: RDFQuad[],
    head: any,
    options: GraphOptions
  ): {
    content: string
    processedQuads: RDFQuad[]
  } {
    const listMembers: any[] = []
    const processedQuads: RDFQuad[] = []
    let current = head

    // Traverse the list
    while (current) {
      const statements = allQuads.filter((q) => q.subject.value === current.value)

      if (statements.length === 0) break

      const firstQuad = statements.find(
        (q) => q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'
      )
      const restQuad = statements.find(
        (q) => q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'
      )

      if (firstQuad) {
        listMembers.push(firstQuad.object)
        processedQuads.push(firstQuad)
      }

      if (restQuad) {
        processedQuads.push(restQuad)
        if (restQuad.object.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil') {
          break
        }
        current = restQuad.object
      } else {
        break
      }
    }

    // Generate list visualization
    const listRef = this.declareTerm(head, options)
    const memberRefs = listMembers.map((member) => this.declareTerm(member, options))

    const ports = memberRefs.map((_, i) => `<p${i}>`).join('|')
    let content = `  "${listRef}" [shape=record, label="${ports}"];\n`

    memberRefs.forEach((memberRef, i) => {
      content += `  "${listRef}":p${i} -> "${memberRef}";\n`
    })

    return { content, processedQuads }
  }

  /**
   * Create legend with prefixes
   */
  private createLegend(): string {
    if (Object.keys(this.prefixes).length === 0) {
      return ''
    }

    let legend = 'subgraph legend {\n'
    legend += '  rankdir="TD" rank="min"\n'
    legend += '  LEGEND [shape="box" style="dashed" margin=0 label="'

    Object.entries(this.prefixes).forEach(([prefix, namespace]) => {
      legend += `${prefix}: ${namespace}\\l`
    })

    legend += '"];\n'
    legend += '}\n'

    return legend
  }

  /**
   * Shrink IRI using prefixes
   */
  private shrinkIRI(iri: string): string {
    return RDFParser.shrinkIRI(iri, this.prefixes)
  }

  /**
   * Escape DOT special characters
   */
  private escapeDot(text: string): string {
    return text.replace(/"/g, '\\"')
  }

  /**
   * Word wrap text for better display
   */
  private wordWrap(text: string, maxWidth: number = 50): string {
    if (text.length <= maxWidth) return text

    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    for (const word of words) {
      if ((currentLine + word).length <= maxWidth) {
        currentLine = currentLine ? `${currentLine} ${word}` : word
      } else {
        if (currentLine) lines.push(currentLine)
        currentLine = word
      }
    }

    if (currentLine) lines.push(currentLine)
    return lines.join('\\l')
  }

  /**
   * Generate DOT directly from DOT content (passthrough)
   */
  generateDotFromDot(content: string, options: GraphOptions): DotGenerationResult {
    // For DOT files, we can pass them through with minimal processing
    // Just ensure the layout direction matches options
    let dotText = content

    // Update rankdir if needed
    if (options.layoutDirection !== 'LR') {
      dotText = dotText.replace(/rankdir\s*=\s*"[^"]*"/g, `rankdir="${options.layoutDirection}"`)
    }

    return {
      dotText,
      error: undefined,
    }
  }

  /**
   * Check if a predicate is an annotation property
   */
  private isAnnotationProperty(predicate: string): boolean {
    const annotationProperties = [
      'http://www.w3.org/2000/01/rdf-schema#label',
      'http://www.w3.org/2000/01/rdf-schema#comment',
      'http://www.w3.org/2000/01/rdf-schema#seeAlso',
      'http://www.w3.org/2000/01/rdf-schema#isDefinedBy',
      'http://www.w3.org/2004/02/skos/core#prefLabel',
      'http://www.w3.org/2004/02/skos/core#altLabel',
      'http://www.w3.org/2004/02/skos/core#hiddenLabel',
      'http://www.w3.org/2004/02/skos/core#note',
      'http://www.w3.org/2004/02/skos/core#changeNote',
      'http://www.w3.org/2004/02/skos/core#definition',
      'http://www.w3.org/2004/02/skos/core#editorialNote',
      'http://www.w3.org/2004/02/skos/core#example',
      'http://www.w3.org/2004/02/skos/core#historyNote',
      'http://www.w3.org/2004/02/skos/core#scopeNote',
    ]
    return annotationProperties.includes(predicate)
  }
}
