import type { RDFQuad, GraphOptions } from '@/types'
import { RDFParser } from './rdf-parser'

export interface DotGenerationResult {
  dotText: string
  error?: string
}

export class GraphGenerator {
  private prefixes: Record<string, string> = {}
  private declared: Map<any, string> = new Map()
  private nodeDeclarations: string[] = []

  /**
   * Generate DOT graph from RDF quads
   */
  generateDotFromRDF(
    quads: RDFQuad[],
    selectedSubjects: string[],
    options: GraphOptions,
    prefixes: Record<string, string> = {}
  ): DotGenerationResult {
    try {
      this.prefixes = prefixes
      this.declared.clear()
      this.nodeDeclarations = []

      if (selectedSubjects.length === 0) {
        return {
          dotText: this.generateEmptyGraph(options),
          error: undefined
        }
      }

      // Filter quads to only include selected subjects and recursively included blank nodes
      const relevantQuads = this.collectRelevantQuads(quads, selectedSubjects, options)
      
      // Generate DOT content
      const graphContent = this.generateGraphContent(relevantQuads, options)
      
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
        error: undefined
      }
    } catch (error) {
      return {
        dotText: '',
        error: `Graph generation error: ${error}`
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
  private collectRelevantQuads(allQuads: RDFQuad[], selectedSubjects: string[], options: GraphOptions): RDFQuad[] {
    const expandedSubjects = selectedSubjects.map(subject =>
      RDFParser.expandIRI(subject, this.prefixes)
    )
    
    const relevantQuads: RDFQuad[] = []
    const seenSubjects = new Set<string>()
    const queue: string[] = [...expandedSubjects, ...selectedSubjects] // Handle both expanded and raw

    while (queue.length > 0) {
      const subjectVal = queue.shift()!
      if (seenSubjects.has(subjectVal)) continue
      seenSubjects.add(subjectVal)

      // Find matching quads
      const subjectQuads = allQuads.filter(q => q.subject.value === subjectVal)
      
      subjectQuads.forEach(q => {
        // Skip rdf:type if hideTypes is enabled
        if (options.hideTypes && q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
          return
        }

        // Skip annotations if hideAnnotations is enabled
        if (options.hideAnnotations && this.isAnnotationProperty(q.predicate.value)) {
          return
        }

        relevantQuads.push(q)
        
        // If object is BlankNode, add to queue for recursion
        if (q.object.termType === 'BlankNode') {
           if (!seenSubjects.has(q.object.value)) {
             queue.push(q.object.value)
           }
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
    quads.forEach(q => {
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
             listResult.processedQuads.forEach(q => seenSubjects.add(q.subject.value))
        } else {
             subjectQuads.forEach(q => {
                 // Skip rdf:type if hideTypes is enabled
                 if (options.hideTypes &&
                     q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
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
    const predicateLabel = this.shrinkIRI(quad.predicate.value)

    return `  "${this.escapeDot(subjectRef)}" -> "${this.escapeDot(objectRef)}" [label="${predicateLabel}"];\n`
  }

  /**
   * Declare a term and return its reference
   */
  private declareTerm(term: any, options: GraphOptions): string {
    if (this.declared.has(term)) {
      return this.declared.get(term)!
    }

    let ref = term.value
    let attributes: string[] = []

    if (term.termType === 'Literal') {
      ref = this.wordWrap(term.value)
      attributes.push('color="blue"')
      attributes.push('fontcolor="blue"')
    } else if (term.termType === 'BlankNode') {
      attributes.push('color="orange"')
    } else if (term.termType === 'NamedNode') {
      ref = this.shrinkIRI(term.value)
    }

    this.declared.set(term, ref)

    // Add click handler for subjects if enabled
    if (options.showSubjects) {
      attributes.push(`URL="javascript:findTriplesForObject('${term.value}')"`)
    }

    if (attributes.length > 0) {
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
      'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'
    ])
    
    return quads.length === 2 && 
           quads.every(quad => listPredicates.has(quad.predicate.value))
  }

  /**
   * Render RDF list structure
   */
  private renderList(allQuads: RDFQuad[], head: any, options: GraphOptions): {
    content: string
    processedQuads: RDFQuad[]
  } {
    const listMembers: any[] = []
    const processedQuads: RDFQuad[] = []
    let current = head

    // Traverse the list
    while (current) {
      const statements = allQuads.filter(q => 
        q.subject.value === current.value
      )

      if (statements.length === 0) break

      const firstQuad = statements.find(q => 
        q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'
      )
      const restQuad = statements.find(q => 
        q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest'
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
    const memberRefs = listMembers.map(member => this.declareTerm(member, options))
    
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
      dotText = dotText.replace(
        /rankdir\s*=\s*"[^"]*"/g, 
        `rankdir="${options.layoutDirection}"`
      )
    }
    
    return {
      dotText,
      error: undefined
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
      'http://www.w3.org/2004/02/skos/core#scopeNote'
    ]
    return annotationProperties.includes(predicate)
  }
}