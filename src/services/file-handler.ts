// import type { FileOperation } from '@/types'

export interface FileLoadResult {
  content: string
  filename?: string
  error?: string
}

export interface URLLoadResult {
  content: string
  contentType?: string
  error?: string
}

export class FileHandler {
  /**
   * Load file from user's local system
   */
  static async loadFile(file: File): Promise<FileLoadResult> {
    try {
      const content = await this.readFileAsText(file)
      return {
        content,
        filename: file.name,
        error: undefined
      }
    } catch (error) {
      return {
        content: '',
        filename: file.name,
        error: `Error reading file: ${error}`
      }
    }
  }

  /**
   * Save content to file
   */
  static saveFile(content: string, filename: string = 'turtle-file.ttl'): void {
    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error saving file:', error)
      throw new Error(`Failed to save file: ${error}`)
    }
  }

  /**
   * Load content from URL with CORS handling
   */
  static async loadFromURL(url: string): Promise<URLLoadResult> {
    try {
      if (!this.isValidURL(url)) {
        throw new Error('Invalid URL format')
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain, application/rdf+xml, text/turtle, application/ld+json, */*'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const content = await response.text()
      const contentType = response.headers.get('content-type')

      return {
        content,
        contentType: contentType || undefined,
        error: undefined
      }
    } catch (error) {
      return {
        content: '',
        error: `Error loading URL: ${error}`
      }
    }
  }

  /**
   * Create CORS-compatible request
   */
  static async loadWithCORS(url: string): Promise<URLLoadResult> {
    try {
      // First try direct fetch
      const result = await this.loadFromURL(url)
      if (!result.error) {
        return result
      }

      // If CORS fails, try with proxy or show appropriate error
      throw new Error(`CORS error loading ${url}. The server doesn't allow cross-origin requests.`)
    } catch (error) {
      return {
        content: '',
        error: String(error)
      }
    }
  }

  /**
   * Auto-detect appropriate file extension based on content
   */
  static detectFileExtension(content: string, currentExt?: string): string {
    const trimmed = content.trim().toLowerCase()
    
    if (trimmed.startsWith('digraph')) {
      return 'dot'
    }
    if (trimmed.startsWith('<') && trimmed.includes('rdf:rdf')) {
      return 'rdf'
    }
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return 'json'
    }
    if (trimmed.includes('@prefix') || trimmed.includes('PREFIX')) {
      return 'ttl'
    }
    
    return currentExt || 'ttl'
  }

  /**
   * Generate appropriate filename with correct extension
   */
  static generateFilename(content: string, baseName: string = 'rdf-file'): string {
    const extension = this.detectFileExtension(content)
    return `${baseName}.${extension}`
  }

  /**
   * Get appropriate MIME type for content
   */
  static getMimeType(content: string): string {
    const extension = this.detectFileExtension(content)
    
    const mimeTypes: Record<string, string> = {
      'ttl': 'text/turtle',
      'rdf': 'application/rdf+xml',
      'json': 'application/ld+json',
      'dot': 'text/plain'
    }
    
    return mimeTypes[extension] || 'text/plain'
  }

  /**
   * Parse URL parameters
   */
  static getURLParameters(): Record<string, string> {
    const params: Record<string, string> = {}
    const searchParams = new URLSearchParams(window.location.search)
    
    for (const [key, value] of searchParams.entries()) {
      params[key] = decodeURIComponent(value)
    }
    
    return params
  }

  /**
   * Check if URL has specific parameter
   */
  static hasURLParameter(param: string): boolean {
    const searchParams = new URLSearchParams(window.location.search)
    return searchParams.has(param)
  }

  /**
   * Get specific URL parameter
   */
  static getURLParameter(param: string): string | null {
    const searchParams = new URLSearchParams(window.location.search)
    const value = searchParams.get(param)
    return value ? decodeURIComponent(value) : null
  }

  /**
   * Validate URL format
   */
  private static isValidURL(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  /**
   * Read file as text with Promise wrapper
   */
  private static readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (event) => {
        const result = event.target?.result
        if (typeof result === 'string') {
          resolve(result)
        } else {
          reject(new Error('File reading resulted in non-string content'))
        }
      }
      
      reader.onerror = () => {
        reject(new Error('Error reading file'))
      }
      
      reader.readAsText(file)
    })
  }

  /**
   * Check if file type is supported
   */
  static isSupportedFileType(file: File): boolean {
    const supportedExtensions = ['ttl', 'rdf', 'xml', 'json', 'jsonld', 'dot']
    const extension = file.name.split('.').pop()?.toLowerCase()
    
    return extension ? supportedExtensions.includes(extension) : false
  }

  /**
   * Get file size in human-readable format
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
  /**
   * Extract RDF from RDFa in HTML content
   */
  static async extractRDFa(url: string): Promise<URLLoadResult> {
    try {
      // Use a proxy service or fetch if CORS allows
      // For now, we'll try direct fetch assuming CORS is handled or same-origin
      const result = await this.loadFromURL(url);
      
      if (result.error) {
        return result;
      }
      
      // Note: Full RDFa parsing in the browser without extra libraries is complex.
      // Ideally we would use 'rdfa-streaming-parser' or similar if available.
      // For this implementation, we will try to use a simple extraction or rely on the user
      // providing a URL that returns RDF data directly if it's not HTML.
      
      // Check if the content looks like HTML
      if (result.content.trim().toLowerCase().startsWith('<!doctype html') ||
          result.content.trim().toLowerCase().startsWith('<html')) {
          
        // Since we don't have the RDFa parser integrated yet in this port,
        // we will return a message for now.
        // TODO: Integrate 'rdfa-streaming-parser' or similar.
        
        return {
           content: `# RDFa extraction not fully implemented in this version.\n# Please use a dedicated service to extract RDF from ${url}`,
           error: undefined
        }
      }
      
      return result;
    } catch (error) {
       return {
         content: '',
         error: `Error extracting RDFa: ${error}`
       }
    }
  }
}