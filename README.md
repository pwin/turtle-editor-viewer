# Turtle Editor Viewer (React + TypeScript)

A modern, React-based RDF/Turtle editor and graph visualizer built with TypeScript, featuring real-time graph visualization, SPARQL querying, and format conversion.

## 🚀 Features

- **RDF/Turtle Editing**: Syntax-highlighted editor with support for Turtle, RDF/XML, JSON-LD, and DOT formats, in tabs
- **RDF 1.2**: Triple terms `<<( s p o )>>`, annotations `{| |}` and directional literals are parsed, queried, drawn and serialised in Turtle (see [USER_GUIDE.md](USER_GUIDE.md) §5 for what RDF/XML and JSON-LD don't yet cover)
- **Graph Visualization**: Real-time graph rendering using Graphviz with interactive pan/zoom; triple terms drawn in dark green with optional links to what they mention
- **Human-readable Labels**: `rdfs:label` / `skos:prefLabel` in the subject list and on diagram nodes and edges, with collisions disambiguated
- **SPARQL 1.2 Queries**: Execute SELECT, CONSTRUCT, DESCRIBE and ASK queries with Comunica; results in the SPARQL 1.2 JSON format
- **Graph Results as Documents**: CONSTRUCT / DESCRIBE output opens in a new editor tab, deduplicated and using the source's prefixes, and is drawn straight away
- **Format Conversion**: Convert between RDF formats (Turtle ↔ RDF/XML ↔ JSON-LD)
- **File Operations**: Load/save files locally and from URLs with CORS handling
- **Modern UI**: Responsive, dark-themed interface built with React
- **Type Safety**: Full TypeScript coverage for better development experience

## 🛠️ Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **State Management**: React Context API with useReducer
- **Editor**: Ace Editor with syntax highlighting
- **Visualization**: Viz.js/Graphviz for graph rendering
- **RDF Processing**: RDF-Ext + N3.js for parsing
- **Styling**: Modern CSS with CSS Modules
- **Development**: ESLint + Prettier + TypeScript

## 🏗️ Architecture

### Component Structure
```
src/
├── components/
│   ├── layout/           # Layout components (Header, MainLayout)
│   ├── editor/           # Editor components (EditorPane, Toolbar, AceEditor)
│   └── graph/            # Graph components (GraphPane, Visualization, SPARQL)
├── services/             # Business logic
│   ├── rdf-parser.ts     # RDF parsing and format detection
│   ├── graph-generator.ts # DOT graph generation from RDF
│   ├── sparql-engine.ts  # SPARQL query execution
│   └── file-handler.ts   # File I/O and URL operations
├── store/               # State management
│   └── AppProvider.tsx  # React Context + useReducer
├── types/               # TypeScript type definitions
└── utils/               # Utility functions
```

### State Management
The application uses React Context with useReducer for predictable state management:

- **Editor State**: Content, language, theme, loading status
- **Graph State**: DOT text, SVG output, visualization options
- **RDF State**: Parsed quads, subjects, prefixes, selections
- **SPARQL State**: Query text, results, execution status

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm/yarn
- Modern browser with ES2020 support

### Installation
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Development
```bash
# Type check
npm run type-check

# Lint code
npm run lint

# Format code
npx prettier --write .
```

## 📖 Usage

### Basic Workflow

1. **Load RDF Data**:
   - Paste Turtle/RDF content into the editor
   - Upload a local RDF file
   - Load from URL (CORS permitting)

2. **Parse and Visualize**:
   - Click "Get All" to extract subjects
   - Select subjects from the dropdown
   - View the generated graph visualization

3. **Query with SPARQL**:
   - Write SPARQL queries in the bottom panel
   - Execute queries against the active editor tab
   - View SELECT results as a table; CONSTRUCT / DESCRIBE results open as a new tab (toggle with "Graph results to tab")

4. **Export Results**:
   - Download the edited RDF content
   - Save graph visualizations as SVG/PNG
   - Export SPARQL results

### URL Parameters

Load content directly via URL parameters:
- `?dot=<url>` - Load DOT or Turtle file from URL
- `?rdfa=<url>` - Load a web page and extract the RDFa it contains

Example:
```
https://yoursite.com/turtle-editor-viewer/?dot=https://example.com/data.ttl
```

### Supported Formats

| Format | Extension | MIME Type | Description |
|--------|-----------|-----------|-------------|
| Turtle | `.ttl` | `text/turtle` | Terse RDF Triple Language |
| RDF/XML | `.rdf`, `.xml` | `application/rdf+xml` | RDF XML serialization |
| JSON-LD | `.json`, `.jsonld` | `application/ld+json` | JSON for Linked Data |
| DOT | `.dot` | `text/plain` | Graphviz DOT language |

## 🔧 Configuration

### Visualization Options

- **Engine**: Choose Graphviz layout engine (dot, circo, fdp, neato, osage, twopi)
- **Format**: Output format (SVG, PNG, JSON, XDOT, plain, PS)
- **Layout Direction**: Graph orientation (LR, RL, TB, BT)
- **Display Options**: Show/hide prefixes, types, subjects

### Editor Settings

- **Language**: Syntax highlighting mode (turtle, xml, javascript, dot)
- **Theme**: Color scheme (cobalt, dawn, eclipse, github)
- **Features**: Line numbers, code folding, auto-completion

## 🏛️ Migration from JavaScript

This React/TypeScript version replaces the original vanilla JavaScript implementation with:

### Key Improvements

- **Type Safety**: Full TypeScript coverage prevents runtime errors
- **Component Architecture**: Modular, reusable React components
- **Modern Tooling**: Vite for fast development and optimized builds
- **State Management**: Predictable state with React Context
- **Error Handling**: Proper error boundaries and user feedback
- **Performance**: Code splitting and optimizations
- **Developer Experience**: Hot reload, linting, and debugging tools

### Migration Benefits

- ✅ Maintainable codebase with clear separation of concerns
- ✅ Type-safe RDF operations and graph generation
- ✅ Modern development workflow with hot reload
- ✅ Responsive UI that works on all devices
- ✅ Extensible architecture for future features
- ✅ Comprehensive error handling and loading states

## 🛠️ Development

### Project Structure

The codebase follows modern React patterns:

```typescript
// Type-safe RDF operations
const parser = new RDFParser()
const result = await parser.parseRDF(content, 'turtle')

// Component with proper typing
interface EditorProps {
  value: string
  onChange: (value: string) => void
  language: EditorLanguage
}

// State management with context
const { state, dispatch } = useAppContext()
dispatch({ type: 'SET_EDITOR_CONTENT', payload: content })
```

### Custom Hooks

The application uses custom hooks for complex operations:
- `useAppContext()` - Access global application state
- `useRDFParser()` - RDF parsing with caching
- `useGraphGenerator()` - DOT generation from RDF data

### Service Layer

Business logic is separated into services:
- **RDFParser**: Handles all RDF format parsing
- **GraphGenerator**: Creates DOT graphs from RDF data  
- **SPARQLEngine**: Executes SPARQL queries
- **FileHandler**: Manages file operations and URL loading

## 🔍 Troubleshooting

### Common Issues

**CORS Errors**: When loading from URLs, ensure the server supports CORS or use a proxy.

**Large Files**: For files >10MB, consider streaming or chunked processing.

**Memory Usage**: Large RDF datasets may require pagination or virtualization.

### Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run `npm run lint` and `npm run type-check`
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- [GitHub Repository](https://github.com/pwin/turtle-editor-viewer)
- [Original Demo](http://semantechs.co.uk/turtle-editor-viewer)
- [RDF 1.1 Turtle Specification](https://www.w3.org/TR/turtle/)
- [SPARQL 1.1 Query Language](https://www.w3.org/TR/sparql11-query/)

---

**Note**: This is a modernized React/TypeScript version of the original turtle-editor-viewer. The core functionality remains the same while providing a much improved developer and user experience.
