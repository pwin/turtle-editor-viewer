import type { RDFQuad } from '@/types'

// Global hylar declarations
declare global {
  interface Window {
    hylarCore: {
      incremental: (facts: any[], additions: any[], deletions: any[], insertions: any[], ruleset: any) => Promise<{additions: any, deletions: any}>
      quadsToFacts: (quads: any[]) => any[]
      factsToQuads: (facts: any) => {explicit: any[], implicit: any[]}
      owl2rl: any
    }
  }
}

export interface ReasoningResult {
  explicitTriples: string[]
  implicitTriples: string[]
  error?: string
}

export class HylarReasoner {
  /**
   * Perform OWL-RL reasoning on RDF quads and return explicit/implicit triples
   */
  static async performReasoning(quads: RDFQuad[]): Promise<ReasoningResult> {
    try {
      let hylarCore = window.hylarCore
      
      if (!hylarCore) {
        try {
          // Try importing from node_modules if global is not available
          const module = await import('hylar-core')
          hylarCore = module.default || module
        } catch (e) {
          console.warn('Failed to import hylar-core:', e)
        }
      }

      if (!hylarCore) {
        throw new Error('Hylar reasoner not available. Please ensure hylar-client.js is loaded or hylar-core is installed.')
      }

      // Convert quads to facts format for hylar
      const facts = hylarCore.quadsToFacts(quads)
      
      // Perform incremental reasoning with OWL-RL rules
      const { additions } = await hylarCore.incremental(facts, [], [], [], hylarCore.owl2rl)
      
      if (!additions) {
        return {
          explicitTriples: [],
          implicitTriples: [],
          error: 'No reasoning results returned'
        }
      }

      // Convert back to quads
      const processedFacts = hylarCore.factsToQuads(additions)
      
      // Separate explicit and implicit triples
      const explicitTriples = this.quadsToNTriples(processedFacts.explicit || [])
      const implicitTriples = this.quadsToNTriples(processedFacts.implicit || [])

      return {
        explicitTriples,
        implicitTriples
      }
    } catch (error) {
      return {
        explicitTriples: [],
        implicitTriples: [],
        error: `Reasoning error: ${error}`
      }
    }
  }

  /**
   * Convert quads to N-Triples format strings
   */
  private static quadsToNTriples(quads: any[]): string[] {
    const ntriples: string[] = []
    
    for (const quad of quads) {
      try {
        const ntripleString = this.quadToNTriple(quad)
        if (ntripleString) {
          ntriples.push(ntripleString)
        }
      } catch (error) {
        console.warn('Error converting quad to N-Triple:', error, quad)
      }
    }
    
    return ntriples
  }

  /**
   * Convert a single quad to N-Triple format
   */
  private static quadToNTriple(quad: any): string {
    if (!quad || !quad.subject || !quad.predicate || !quad.object) {
      return ''
    }

    const subject = this.termToNTriple(quad.subject)
    const predicate = this.termToNTriple(quad.predicate)
    const object = this.termToNTriple(quad.object)

    return `${subject} ${predicate} ${object} .`
  }

  /**
   * Convert an RDF term to N-Triple format
   */
  private static termToNTriple(term: any): string {
    if (!term) return ''

    switch (term.termType) {
      case 'NamedNode':
        return `<${term.value}>`
      
      case 'BlankNode':
        return `_:${term.value}`
      
      case 'Literal': {
        let literal = `"${this.escapeLiteral(term.value)}"`
        
        if (term.language) {
          literal += `@${term.language}`
        } else if (term.datatype && term.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') {
          literal += `^^<${term.datatype.value}>`
        }
        
        return literal
      }
      
      default:
        return `<${term.value || term}>`
    }
  }

  /**
   * Escape special characters in literal values
   */
  private static escapeLiteral(value: string): string {
    return value
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/"/g, '\\"')    // Escape quotes
      .replace(/\n/g, '\\n')   // Escape newlines
      .replace(/\r/g, '\\r')   // Escape carriage returns
      .replace(/\t/g, '\\t')   // Escape tabs
  }

  /**
   * Open a new window to display reasoning results
   */
  static displayReasoningResults(result: ReasoningResult): void {
    const windowFeatures = 'width=1020,height=800,resizable=yes,scrollbars=yes'
    const resultWindow = window.open('', 'reasoning-results', windowFeatures)
    
    if (!resultWindow) {
      alert('Could not open results window. Please allow popups for this site.')
      return
    }

    resultWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OWL-RL Reasoning Results</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              background-color: #f5f5f5; 
            }
            h2 { 
              color: #333; 
              border-bottom: 2px solid #007acc; 
              padding-bottom: 5px; 
            }
            textarea { 
              width: 100%; 
              height: 300px; 
              font-family: 'Courier New', monospace; 
              font-size: 12px; 
              border: 1px solid #ccc; 
              border-radius: 4px; 
              padding: 10px; 
              background-color: white;
            }
            .error { 
              color: #d32f2f; 
              background-color: #ffebee; 
              padding: 10px; 
              border-radius: 4px; 
              border: 1px solid #d32f2f; 
            }
            .stats { 
              background-color: #e3f2fd; 
              padding: 10px; 
              border-radius: 4px; 
              border: 1px solid #1976d2; 
              margin-bottom: 20px; 
            }
          </style>
        </head>
        <body>
          <h1>OWL-RL Reasoning Results</h1>
          
          ${result.error ? `<div class="error"><strong>Error:</strong> ${result.error}</div>` : ''}
          
          <div class="stats">
            <strong>Statistics:</strong><br>
            Explicit Triples: ${result.explicitTriples.length}<br>
            Implicit (Inferred) Triples: ${result.implicitTriples.length}<br>
            Total: ${result.explicitTriples.length + result.implicitTriples.length}
          </div>
          
          <h2>Explicit Triples</h2>
          <textarea readonly>${result.explicitTriples.join('\n')}</textarea>
          
          <h2>Implicit (Inferred) Triples</h2>
          <textarea readonly>${result.implicitTriples.join('\n')}</textarea>
          
          <br><br>
          <button onclick="window.close()">Close Window</button>
        </body>
      </html>
    `)
    
    resultWindow.document.close()
  }
}