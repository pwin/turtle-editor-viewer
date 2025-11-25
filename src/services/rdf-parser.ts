// import type { RDFQuad, RDFPrefix, NamedNode, BlankNode, Literal } from '@/types'
import type { RDFQuad} from '@/types'

export interface RDFParseResult {
  quads: RDFQuad[]
  prefixes: Record<string, string>
  subjects: string[]
  error?: string
}

export class RDFParser {
  private prefixes: Record<string, string> = {}
  private quads: RDFQuad[] = []

  /**
   * Parse RDF content and detect format automatically
   */
  async parseRDF(content: string, language?: string, sortSubjects: boolean = false): Promise<RDFParseResult> {
    try {
      this.reset()
      
      const detectedFormat = language || this.detectFormat(content.trim())
      
      switch (detectedFormat) {
        case 'turtle':
          return await this.parseTurtle(content, sortSubjects)
        case 'xml':
          return await this.parseRDFXML(content)
        case 'javascript':
          return await this.parseJSONLD(content)
        case 'dot':
          return this.parseDOT()
        default:
          return await this.parseTurtle(content, sortSubjects) // Default fallback
      }
    } catch (error) {
      return {
        quads: [],
        prefixes: {},
        subjects: [],
        error: `Parse error: ${error}`
      }
    }
  }

  /**
   * Parse Turtle format
   */
  private async parseTurtle(content: string, sortSubjects: boolean = false): Promise<RDFParseResult> {
    try {
      // This is a simplified parser - in a real implementation you'd use n3.js
      // Dynamic import for N3.js when available
      const { Parser, Store } = await import('n3')
      
      const parser = new Parser({ baseIRI: 'http://example.org/' })
      const store = new Store()
      
      return new Promise((resolve, reject) => {
        parser.parse(content, (error, quad, prefixes) => {
          if (error) {
            reject(error)
            return
          }
          
          if (quad) {
            store.addQuad(quad)
            this.quads.push(this.convertQuad(quad))
          }
          
          if (prefixes) {
            Object.assign(this.prefixes, prefixes)
          }
          
          // When parsing is complete (quad is null)
          if (!quad) {
            const subjects = this.extractSubjects(this.quads, sortSubjects)
            resolve({
              quads: this.quads,
              prefixes: this.prefixes,
              subjects
            })
          }
        })
      })
    } catch (error) {
      // Fallback to basic parsing if N3.js is not available
      return this.parseBasicTurtle(content)
    }
  }

  /**
   * Parse RDF/XML format
   */
  private async parseRDFXML(content: string): Promise<RDFParseResult> {
    try {
      // Dynamic import for streaming parser
      const rdfXmlModule = await import('rdfxml-streaming-parser')
      const RdfXmlParser = rdfXmlModule.RdfXmlParser || rdfXmlModule.default
      const { Readable } = await import('readable-stream')
      
      const parser = new RdfXmlParser()
      const input = new Readable()
      input.push(content)
      input.push(null)
      
      const output = parser.import(input)
      
      return new Promise((resolve, reject) => {
        output.on('data', (quad: any) => {
          this.quads.push(this.convertQuad(quad))
        })
        
        output.on('prefix', (prefix: string, namespace: any) => {
          this.prefixes[prefix] = namespace.value
        })
        
        output.on('end', () => {
          const subjects = this.extractSubjects(this.quads)
          resolve({
            quads: this.quads,
            prefixes: this.prefixes,
            subjects
          })
        })
        
        output.on('error', (error: any) => {
          reject(error)
        })
      })
    } catch (error) {
      throw new Error(`RDF/XML parse error: ${error}`)
    }
  }

  /**
   * Parse JSON-LD format
   */
  private async parseJSONLD(content: string): Promise<RDFParseResult> {
    try {
      const JsonLdParser = (await import('@rdfjs/parser-jsonld')).default
      const { Readable } = await import('readable-stream')
      
      const parser = new JsonLdParser()
      const input = new Readable()
      input.push(content)
      input.push(null)
      
      const output = parser.import(input)
      
      return new Promise((resolve, reject) => {
        output.on('data', (quad: any) => {
          this.quads.push(this.convertQuad(quad))
        })
        
        output.on('prefix', (prefix: string, namespace: any) => {
          this.prefixes[prefix] = namespace.value
        })
        
        output.on('end', () => {
          const subjects = this.extractSubjects(this.quads)
          resolve({
            quads: this.quads,
            prefixes: this.prefixes,
            subjects
          })
        })
        
        output.on('error', (error: any) => {
          reject(error)
        })
      })
    } catch (error) {
      throw new Error(`JSON-LD parse error: ${error}`)
    }
  }

  /**
   * Parse DOT format (Graphviz)
   */
  private parseDOT(): RDFParseResult {
    // DOT files are already graph descriptions, so we just return them as is
    return {
      quads: [],
      prefixes: {},
      subjects: [],
      error: undefined
    }
  }

  /**
   * Detect RDF format from content
   */
  private detectFormat(content: string): string {
    if (content.toLowerCase().startsWith('digraph')) {
      return 'dot'
    }
    if (content.startsWith('<') && content.includes('rdf:RDF')) {
      return 'xml'
    }
    if (content.startsWith('{') || content.startsWith('[')) {
      return 'javascript'
    }
    return 'turtle' // Default assumption
  }

  /**
   * Basic Turtle parsing fallback
   */
  private parseBasicTurtle(content: string): RDFParseResult {
    const lines = content.split('\n')
    const subjects = new Set<string>()
    
    // Extract prefixes
    lines.forEach(line => {
      const prefixMatch = line.match(/@prefix\s+([^:]+):\s*<([^>]+)>/)
      if (prefixMatch) {
        this.prefixes[prefixMatch[1]] = prefixMatch[2]
      }
      
      // Basic subject extraction
      const subjectMatch = line.match(/^<([^>]+)>|^([a-zA-Z_][a-zA-Z0-9_]*:[a-zA-Z_][a-zA-Z0-9_]*)/)
      if (subjectMatch) {
        subjects.add(subjectMatch[1] || subjectMatch[2])
      }
    })

    return {
      quads: this.quads,
      prefixes: this.prefixes,
      subjects: Array.from(subjects)
    }
  }

  /**
   * Convert N3.js quad to our format
   */
  private convertQuad(quad: any): RDFQuad {
    return {
      subject: quad.subject,
      predicate: quad.predicate,
      object: quad.object,
      graph: quad.graph
    }
  }

  /**
   * Serialize RDF quads to string
   */
  async serialize(quads: RDFQuad[], format: 'turtle' | 'jsonld' | 'xml' | 'javascript'): Promise<string> {
    try {
      // Convert internal RDFQuad to standard RDFJS Quad if needed
      // But our RDFQuad is compatible with RDFJS
      
      // Create a dataset/store from quads to pass to serializers that expect dataset
      // or stream.
      const { Readable } = await import('readable-stream')
      const input = new Readable({ objectMode: true })
      quads.forEach(q => input.push(q))
      input.push(null)

      if (format === 'turtle') {
        const { Writer } = await import('n3')
        const writer = new Writer({ format: 'Turtle' })
        return new Promise((resolve, reject) => {
          writer.addQuads(quads as any)
          writer.end((error, result) => {
            if (error) reject(error)
            else resolve(result)
          })
        })
      } else if (format === 'jsonld' || format === 'javascript') {
        const SerializerJsonld = (await import('@rdfjs/serializer-jsonld-ext')).default
        const serializer = new SerializerJsonld()
        const output = serializer.import(input)
        
        let result = ''
        output.on('data', (chunk: any) => {
          if (typeof chunk === 'string') {
            result += chunk
          } else if (typeof chunk === 'object') {
            // If it's a Buffer, toString is correct. If it's a plain object, stringify.
            if (chunk.constructor && chunk.constructor.name === 'Buffer') {
              result += chunk.toString()
            } else {
              result += JSON.stringify(chunk, null, 2)
            }
          } else {
            result += String(chunk)
          }
        })
        
        return new Promise((resolve, reject) => {
          output.on('end', () => resolve(result))
          output.on('error', (err: any) => reject(err))
        })
      } else {
        throw new Error(`Serialization format ${format} not supported yet`)
      }
    } catch (error) {
      throw new Error(`Serialization error: ${error}`)
    }
  }

  /**
   * Extract unique subjects from quads
   */
  private extractSubjects(quads: RDFQuad[], sort: boolean = false): string[] {
    // Identify blank nodes that are objects (used in other triples)
    const blankNodeObjects = new Set<string>()
    quads.forEach(quad => {
      if (quad.object.termType === 'BlankNode') {
        blankNodeObjects.add(quad.object.value)
      }
    })

    const subjects = new Set<string>()
    
    quads.forEach(quad => {
      const subject = quad.subject
      // Include NamedNodes
      if (subject.termType === 'NamedNode') {
        subjects.add(RDFParser.shrinkIRI(subject.value, this.prefixes))
      }
      // Include BlankNodes only if they are NOT objects elsewhere (top-level)
      else if (subject.termType === 'BlankNode') {
        if (!blankNodeObjects.has(subject.value)) {
          subjects.add(subject.value) // Keep blank node ID as is
        }
      }
    })
    
    const subjectList = Array.from(subjects)
    
    if (sort) {
        return subjectList.sort()
    }
    
    // Maintain order of appearance (roughly, since Set iteration is insertion order)
    return subjectList
  }

  /**
   * Reset parser state
   */
  private reset(): void {
    this.prefixes = {}
    this.quads = []
  }

  /**
   * Shrink IRI using prefixes
   */
  static shrinkIRI(iri: string, prefixes: Record<string, string>): string {
    for (const [prefix, namespace] of Object.entries(prefixes)) {
      if (iri.startsWith(namespace)) {
        return iri.replace(namespace, `${prefix}:`)
      }
    }
    return iri
  }

  /**
   * Expand prefixed name to full IRI
   */
  static expandIRI(prefixed: string, prefixes: Record<string, string>): string {
    const [prefix, localName] = prefixed.split(':')
    const namespace = prefixes[prefix]
    return namespace ? `${namespace}${localName}` : prefixed
  }
}