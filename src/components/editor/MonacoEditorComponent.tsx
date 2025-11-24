import { useEffect } from 'react'
import Editor, { useMonaco, OnChange, OnMount } from '@monaco-editor/react'
import type { EditorLanguage, EditorTheme } from '@/types'

interface MonacoEditorComponentProps {
  value: string
  onChange: (value: string) => void
  language: EditorLanguage
  theme: EditorTheme
  fontSize: number
}

function MonacoEditorComponent({ value, onChange, language, theme, fontSize }: MonacoEditorComponentProps) {
  const monaco = useMonaco()
  
  // Map internal languages to Monaco languages
  const getMonacoLanguage = (lang: EditorLanguage): string => {
    switch (lang) {
      case 'javascript': return 'jsonc'
      case 'xml': return 'xml'
      case 'turtle': return 'turtle'
      case 'sparql': return 'sparql'
      case 'dot': return 'dot'
      default: return 'plaintext'
    }
  }

  useEffect(() => {
    if (monaco) {
      // DOT
      if (!monaco.languages.getLanguages().some(l => l.id === 'dot')) {
        monaco.languages.register({ id: 'dot' })
        monaco.languages.setMonarchTokensProvider('dot', {
          tokenizer: {
            root: [
              [/\b(strict|graph|digraph|subgraph|node|edge)\b/, 'keyword'],
              [/[a-zA-Z_]\w*/, 'identifier'],
              [/\[/, 'delimiter.bracket'],
              [/\]/, 'delimiter.bracket'],
              [/\{/, 'delimiter.brace'],
              [/\}/, 'delimiter.brace'],
              [/=/, 'delimiter'],
              [/;/, 'delimiter'],
              [/->|--/, 'operator'],
              [/"([^"\\]|\\.)*"/, 'string'],
              [/\d+/, 'number'],
              [/\/\/.*/, 'comment'],
              [/#.*/, 'comment'],
              [/\/\*[\s\S]*?\*\//, 'comment'],
            ]
          }
        })
        monaco.languages.setLanguageConfiguration('dot', {
          comments: {
            lineComment: '//',
            blockComment: ['/*', '*/']
          }
        })
      }

      // Turtle
      if (!monaco.languages.getLanguages().some(l => l.id === 'turtle')) {
        monaco.languages.register({ id: 'turtle' })
        monaco.languages.setLanguageConfiguration('turtle', {
          comments: { lineComment: '#' }
        })
        monaco.languages.setMonarchTokensProvider('turtle', {
          tokenizer: {
            root: [
              [/(?:@)prefix/, 'keyword'],
              [/(?:@)base/, 'keyword'],
              [/PREFIX/i, 'keyword'],
              [/BASE/i, 'keyword'],
              [/true|false/, 'keyword'],
              [/\sa\s/, 'keyword'],
              [/<[^>]*>/, 'string.link'],
              [/"([^"\\]|\\.)*$/, 'string.invalid'],
              [/"([^"\\]|\\.)*"/, 'string'],
              [/'([^'\\]|\\.)*$/, 'string.invalid'],
              [/'([^'\\]|\\.)*'/, 'string'],
              [/\d+/, 'number'],
              [/[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]*/, 'type.identifier'],
              [/#.*$/, 'comment'],
            ]
          }
        })
        monaco.languages.setLanguageConfiguration('turtle', {
          comments: { lineComment: '#' }
        })

        // Autocompletion (unchanged)
        monaco.languages.registerCompletionItemProvider('turtle', {
          provideCompletionItems: (model, position) => {
            const word = model.getWordUntilPosition(position)
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn
            }
            const suggestions = [
              { label: 'rdf', kind: monaco.languages.CompletionItemKind.Module, insertText: 'rdf:', detail: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', range },
              { label: 'rdfs', kind: monaco.languages.CompletionItemKind.Module, insertText: 'rdfs:', detail: 'http://www.w3.org/2000/01/rdf-schema#', range },
              { label: 'owl', kind: monaco.languages.CompletionItemKind.Module, insertText: 'owl:', detail: 'http://www.w3.org/2002/07/owl#', range },
              { label: 'xsd', kind: monaco.languages.CompletionItemKind.Module, insertText: 'xsd:', detail: 'http://www.w3.org/2001/XMLSchema#', range },
              { label: '@prefix', kind: monaco.languages.CompletionItemKind.Keyword, insertText: '@prefix ${1:prefix}: <${2:uri}> .', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range },
              { label: 'a', kind: monaco.languages.CompletionItemKind.Keyword, insertText: 'a ', detail: 'rdf:type', range }
            ]
            const content = model.getValue()
            const prefixRegex = /@prefix\s+([^:]+):\s*<([^>]+)>/g
            let match
            const definedPrefixes = new Set(['rdf', 'rdfs', 'owl', 'xsd'])
            while ((match = prefixRegex.exec(content)) !== null) {
              const prefix = match[1]
              if (!definedPrefixes.has(prefix)) {
                suggestions.push({
                  label: prefix,
                  kind: monaco.languages.CompletionItemKind.Module,
                  insertText: `${prefix}:`,
                  detail: match[2],
                  range
                })
                definedPrefixes.add(prefix)
              }
            }
            return { suggestions }
          }
        })
      }

      // RDF/XML
      if (!monaco.languages.getLanguages().some(l => l.id === 'xml')) {
        monaco.languages.register({ id: 'xml' })
        monaco.languages.setLanguageConfiguration('xml', {
          comments: { blockComment: ['<!--', '-->'] }
        })
      }

      // JSON-LD
      if (!monaco.languages.getLanguages().some(l => l.id === 'jsonld')) {
        monaco.languages.register({ id: 'jsonld' })
        monaco.languages.setLanguageConfiguration('jsonld', {
          comments: {
            lineComment: '//',
            blockComment: ['/*', '*/']
          }
        })
      }

      // SPARQL
      if (!monaco.languages.getLanguages().some(l => l.id === 'sparql')) {
        monaco.languages.register({ id: 'sparql' })
        monaco.languages.setLanguageConfiguration('sparql', {
          comments: { lineComment: '#' }
        })
        monaco.languages.setMonarchTokensProvider('sparql', {
          tokenizer: {
            root: [
              [/[?|$][\w]+/, 'variable'],
              [/(?:@)prefix|PREFIX|BASE|SELECT|DISTINCT|REDUCED|CONSTRUCT|DESCRIBE|ASK|FROM|NAMED|WHERE|ORDER|BY|ASC|DESC|LIMIT|OFFSET|VALUES|BIND|UNION|OPTIONAL|FILTER|GRAPH|MINUS|SERVICE|LOAD|CLEAR|DROP|CREATE|ADD|MOVE|COPY|INSERT|DELETE|DATA|WITH|TO|USING/, 'keyword'],
              [/a/, 'keyword'],
              [/true|false/, 'keyword'],
              [/<[^>]*>/, 'string.link'],
              [/"([^"\\]|\\.)*$/, 'string.invalid'],
              [/"([^"\\]|\\.)*"/, 'string'],
              [/'([^'\\]|\\.)*$/, 'string.invalid'],
              [/'([^'\\]|\\.)*'/, 'string'],
              [/\d+/, 'number'],
              [/[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]*/, 'type.identifier'],
              [/#.*$/, 'comment'],
            ]
          }
        })
      }
    }
  }, [monaco])

  const getMonacoTheme = (theme: EditorTheme): string => {
    switch (theme) {
      case 'dark': return 'vs-dark'
      case 'high-contrast': return 'hc-black'
      case 'light': return 'light'
      default: return 'light'
    }
  }

  const handleEditorChange: OnChange = (value) => {
    onChange(value || '')
  }

  const handleEditorDidMount: OnMount = () => {
    // Optional: Configure custom languages here if needed later
  }

  return (
    <div className="ace-editor-wrapper">
      <Editor
        height="100%"
        width="100%"
        language={getMonacoLanguage(language)}
        theme={getMonacoTheme(theme)}
        value={value}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: fontSize,
          wordWrap: 'off',
          automaticLayout: true,
        }}
      />
    </div>
  )
}

export default MonacoEditorComponent