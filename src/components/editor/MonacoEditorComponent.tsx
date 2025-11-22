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
      case 'javascript': return 'json'
      case 'xml': return 'xml'
      case 'turtle': return 'turtle'
      case 'sparql': return 'sparql' // Could implement SPARQL too
      case 'dot': return 'dot'
      default: return 'plaintext'
    }
  }

  useEffect(() => {
    if (monaco) {
      // Register DOT Language if not exists
      if (!monaco.languages.getLanguages().some(l => l.id === 'dot')) {
        monaco.languages.register({ id: 'dot' });
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
        });
      }

      // Register Turtle Language if not exists
      if (!monaco.languages.getLanguages().some(l => l.id === 'turtle')) {
        monaco.languages.register({ id: 'turtle' })
        
        // Simple Turtle Syntax Highlighting
        monaco.languages.setMonarchTokensProvider('turtle', {
          tokenizer: {
            root: [
              // Use non-capturing group to avoid starting regex with @ which triggers Monarch macro
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

        // Turtle Autocompletion
        monaco.languages.registerCompletionItemProvider('turtle', {
          provideCompletionItems: (model, position) => {
            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn
            };

            // Common prefixes
            const suggestions = [
              {
                label: 'rdf',
                kind: monaco.languages.CompletionItemKind.Module,
                insertText: 'rdf:',
                detail: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
                range: range
              },
              {
                label: 'rdfs',
                kind: monaco.languages.CompletionItemKind.Module,
                insertText: 'rdfs:',
                detail: 'http://www.w3.org/2000/01/rdf-schema#',
                range: range
              },
              {
                label: 'owl',
                kind: monaco.languages.CompletionItemKind.Module,
                insertText: 'owl:',
                detail: 'http://www.w3.org/2002/07/owl#',
                range: range
              },
              {
                label: 'xsd',
                kind: monaco.languages.CompletionItemKind.Module,
                insertText: 'xsd:',
                detail: 'http://www.w3.org/2001/XMLSchema#',
                range: range
              },
              {
                label: '@prefix',
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: '@prefix ${1:prefix}: <${2:uri}> .',
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range: range
              },
              {
                label: 'a',
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: 'a ',
                detail: 'rdf:type',
                range: range
              }
            ];

            // Extract defined prefixes from content
            const content = model.getValue();
            const prefixRegex = /@prefix\s+([^:]+):\s*<([^>]+)>/g;
            let match;
            const definedPrefixes = new Set(['rdf', 'rdfs', 'owl', 'xsd']);
            
            while ((match = prefixRegex.exec(content)) !== null) {
              const prefix = match[1];
              if (!definedPrefixes.has(prefix)) {
                suggestions.push({
                  label: prefix,
                  kind: monaco.languages.CompletionItemKind.Module,
                  insertText: `${prefix}:`,
                  detail: match[2],
                  range: range
                });
                definedPrefixes.add(prefix);
              }
            }

            return { suggestions };
          }
        })
      }
    }
  }, [monaco])

  // Map internal themes to Monaco themes
  const getMonacoTheme = (theme: EditorTheme): string => {
    switch (theme) {
      case 'dark':
        return 'vs-dark'
      case 'high-contrast':
        return 'hc-black'
      case 'light':
        return 'light'
      default:
        return 'light'
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