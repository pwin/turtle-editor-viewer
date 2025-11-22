# <img src="public/images/semantechsLogo.jpeg" height="50" alt="Semantechs Logo" style="vertical-align: middle; margin-right: 10px;" /> User Guide

Welcome to the **Turtle Editor Viewer**, a modern tool for editing RDF data, visualizing graphs, and executing SPARQL queries. This guide covers the key features and how to use them effectively.

## 1. Getting Started

### Interface Overview
The application interface is divided into two main resizable panes:
- **Editor Pane** (Left): A robust code editor for writing and loading RDF data. This pane also includes the **Subjects** selection and filtering tools.
- **Graph & SPARQL Pane** (Right): Contains the visual graph representation of your data and the SPARQL query interface.

You can adjust the width of the panes by dragging the vertical separator between them. The Graph pane is further split horizontally between the visualization area and the SPARQL panel.

## 2. Working with Data (Editor Pane)

The Editor Pane allows you to input, modify, and manage your RDF data.

### Loading Data
There are three ways to load data into the editor:
1.  **Direct Input**: Simply type or paste your code into the editor.
2.  **Open File**: Click the `Choose File` button in the toolbar to load a local file. Supported formats include:
    *   Turtle (`.ttl`)
    *   RDF/XML (`.rdf`, `.xml`)
    *   JSON-LD (`.json`, `.jsonld`)
    *   DOT (`.dot`)
3.  **Load from URL**: In the Graph Toolbar (right pane), enter a URL and click `Load URL`. *Note: The server hosting the file must support CORS.*

### Editor Settings
The toolbar at the top of the editor provides several customization options:
-   **Language**: Manually set the syntax highlighting (Turtle, RDF/XML, JSON-LD, DOT). The editor usually auto-detects this based on content.
-   **Theme**: Choose your preferred color scheme (Cobalt, Dawn, Eclipse, GitHub).

### Saving Data
To save your current work, click the `Save File` button. This will download the current editor content as a file (defaulting to `turtle-file.ttl`) to your computer.

## 3. Visualizing Graphs

The Graph Pane automatically visualizes the relationships defined in your RDF data using Graphviz.

### Generating a Graph
1.  **Automatic Detection**: As you type, the application parses your code. If valid RDF is detected, it identifies "Subjects" (resources that have properties).
2.  **Subject Selection**:
    *   **Specific Subjects**: In the **Editor Toolbar** (top right of the left pane), use the **Subjects** dropdown to select one or more subjects to visualize.
    *   **Search Filter**: Use the filter box above the subjects dropdown to quickly find specific resources by name.
    *   **Get All**: Click the `Get All` button in the Graph Toolbar (right pane) to visualize the entire dataset (limited to the first 10 subjects by default for performance). *Note: When loading a new file, the first 10 subjects are automatically selected.*

### Customization Options
You can customize how the graph is rendered using the toolbar controls in the Graph Pane:
-   **Engine**: Change the Graphviz layout algorithm (e.g., `dot` for hierarchies, `neato` for force-directed, `circo` for circular layouts).
-   **Format**: Select the output format (`SVG` is recommended for interactivity, `PNG` for static images, `JSON`/`XDOT` for raw data).
-   **Layout**: Change the direction of the graph (e.g., Left-to-Right `LR`, Top-to-Bottom `TB`).
-   **Display Toggles**:
    *   `Prefixes`: Toggle shortened namespace prefixes (e.g., `rdf:type` vs full IRIs).
    *   `Hide Types`: Hides `rdf:type` relationships to declutter the graph.
    *   `Hide Annotations`: Hides common annotation properties (labels, comments, notes) to focus on structural relationships.
    *   `Subjects`: Toggle visibility of subject nodes.

### Interaction
-   **Pan & Zoom**: Use your mouse wheel to zoom in/out and click-and-drag to pan around the graph.
-   **Context Menu**: Right-click on a node to see more details or perform specific actions (depending on the node type).

## 4. Querying with SPARQL

The SPARQL Panel at the bottom right allows you to query the data currently loaded in the editor.

### Executing Queries
1.  **Write Query**: Enter your SPARQL query in the text area.
2.  **Add Prefixes**: Click `Add Prefixes` to automatically prepend common prefixes defined in your RDF data.
3.  **Execute**: Click `Execute Query` to run the query.

### Supported Query Types
The engine supports standard SPARQL 1.1 query forms:
-   `SELECT`: Returns a table of results.
-   `ASK`: Returns a boolean (True/False).
-   `CONSTRUCT`: Returns an RDF graph.
-   `DESCRIBE`: Returns an RDF graph describing resources.

### Viewing Results
Results are displayed in a table below the query editor. You can clear the results by clicking `Clear Results`.

## 5. Advanced Features

### Reasoning (Hylar)
The application includes a client-side reasoner (Hylar) that supports OWL 2 RL.
-   Click `Show Facts` in the Graph Toolbar to perform reasoning on your data.
-   This opens a new window showing **Explicit Triples** (asserted in your data) and **Implicit Triples** (inferred by the reasoner).

### Format Conversion
You can convert your current RDF data between formats using the buttons in the Graph Toolbar:
-   `To Turtle`: Converts current data to Turtle format.
-   `To JSON-LD`: Converts current data to JSON-LD format.

### URL Parameters
You can pre-load data when sharing a link to the application:
-   `?dot=<url>`: Loads a DOT or Turtle file from the specified URL.

---
*Documentation generated for Turtle Editor Viewer v2.0.0*