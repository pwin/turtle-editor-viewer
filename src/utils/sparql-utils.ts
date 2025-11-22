export class SparqlUtils {
  /**
   * Generate common prefixes for SPARQL queries
   */
  static generateCommonPrefixes(customPrefixes: Record<string, string> = {}): string {
    const defaultPrefixes = {
      'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
      'owl': 'http://www.w3.org/2002/07/owl#',
      'xsd': 'http://www.w3.org/2001/XMLSchema#',
      'foaf': 'http://xmlns.com/foaf/0.1/',
      'dc': 'http://purl.org/dc/elements/1.1/',
      'dcterms': 'http://purl.org/dc/terms/',
      'skos': 'http://www.w3.org/2004/02/skos/core#',
      ...customPrefixes
    }
    
    return Object.entries(defaultPrefixes)
      .map(([prefix, namespace]) => `PREFIX ${prefix}: <${namespace}>`)
      .join('\n') + '\n\n'
  }

  /**
   * Validate SPARQL query syntax (basic validation)
   */
  static validateQuery(query: string): { isValid: boolean; error?: string } {
    const trimmed = query.trim().toLowerCase()
    
    if (trimmed.length === 0) {
      return { isValid: false, error: 'Empty query' }
    }
    
    const validStarters = ['select', 'construct', 'describe', 'ask', 'prefix']
    const startsValid = validStarters.some(starter => 
      trimmed.startsWith(starter) || 
      trimmed.includes(starter) // Allow for prefixes before main query
    )
    
    if (!startsValid) {
      return { 
        isValid: false, 
        error: 'Query must start with SELECT, CONSTRUCT, DESCRIBE, ASK, or PREFIX' 
      }
    }
    
    // Check for balanced braces
    const openBraces = (query.match(/{/g) || []).length
    const closeBraces = (query.match(/}/g) || []).length
    
    if (openBraces !== closeBraces) {
      return { isValid: false, error: 'Unbalanced braces in query' }
    }
    
    return { isValid: true }
  }
}