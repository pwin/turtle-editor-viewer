# <img src="public/images/semantechsLogo.jpeg" height="50" alt="Semantechs Logo" style="vertical-align: middle; margin-right: 10px;" /> User Guide

Welcome to the **Turtle Editor Viewer**. It's a place to write or load RDF, see it drawn as a diagram, and ask it questions with SPARQL. Everything runs in your browser, so nothing you paste in leaves your machine. It understands RDF 1.2 and SPARQL 1.2, with a few gaps listed in [section 6](#6-rdf-12-and-sparql-12), and it can check your data against SHACL shapes ([section 5](#5-validating-with-shacl)). This guide walks through what's on the screen and what each part does.

**Where your data goes: nowhere.** Parsing, drawing, querying, reasoning and validation all run inside the page. The only times the browser talks to another server are the ones you ask for: a URL you load, or a `SERVICE` clause in a query you run. [Section 8](#8-security-and-privacy) spells this out, including what the browser itself enforces.

## 1. Getting Started

### What you're looking at
The window is split into two panes, and you can drag the bar between them to change their widths:

- **Editor pane** (left): where your data lives. There's a code editor, a toolbar above it, and a list of the subjects found in your data so you can pick which ones to draw.
- **Graph and SPARQL pane** (right): the diagram at the top, the SPARQL & SHACL panel underneath. Drag the bar between those two to give one more room.

The editor pane has a row of tabs along the top: the document you start with, plus any query results or extra files you open. More on that in a moment.

## 2. Working with Data (Editor Pane)

### Getting data in
Three ways, take your pick:

1. **Type or paste** straight into the editor.
2. **Open File** in the toolbar opens a file from your computer. Turtle (`.ttl`), RDF/XML (`.rdf`, `.xml`), JSON-LD (`.json`, `.jsonld`) and Graphviz DOT (`.dot`) all work, and the tab takes the file's name.
3. **Load URL** in the Graph toolbar (right pane) fetches a file from the web. The server hosting it has to allow cross-origin requests (CORS), which most public data servers and GitHub raw links do.

You can also put the URL straight into the page address so a link opens ready-loaded; see [URL parameters](#url-parameters) at the end.

The editor works out the format from the content as you type, so you don't usually need to tell it. If it guesses wrong, the **Language** dropdown sets it by hand.

### Tabs
The editor can hold several documents at once, each in its own tab:

- **Source** is the tab you start in. It holds whatever you typed, opened or loaded.
- **Result 1**, **Result 2** and so on appear when a `CONSTRUCT` or `DESCRIBE` query returns a graph (see [Graph results](#graph-results-construct-and-describe)). They're ordinary documents: edit them, save them, query them, draw them.
- **+** at the end of the strip opens an empty tab. That's how you bring a second file in alongside the first, for instance the SHACL shapes you want to validate against: click **+**, then **Open File** or **Load URL** into it, and the tab takes the file's name.

Each tab remembers its own text, its own language and its own choice of subjects for the diagram, so flicking between tabs brings each diagram straight back. Close a tab with its **×**; you can close any tab, including Source, except the last one standing. Closing a tab never touches what's in the others.

Two things to keep in mind:

- The subject list, the diagram, the query panel and the validator all work on **whichever tab is in front**. Run a query while a Result tab is showing and you're querying that result.
- Undo history is per tab too, so Ctrl+Z in one tab won't unpick edits in another.

### Editor settings
The toolbar above the editor has:

- **Language**: Turtle, RDF/XML, JSON-LD or DOT. Normally picked for you.
- **Theme**: Light, Dark or High Contrast.
- **Font Size**: 8 to 16 px.

### Saving
**Save File** downloads the current tab's text (as `turtle-file.ttl`, so rename it once it lands).

## 3. Visualizing Graphs

The diagram is drawn with Graphviz from the subjects you pick.

### Choosing what to draw
1. As you type, the app reads your data and lists every **subject** it finds (anything that has properties) in the box on the right of the editor toolbar.
2. Click subjects in that list to draw them; Ctrl-click or Shift-click to pick several. The diagram follows the selection.
3. Type in the **Filter subjects** box to narrow the list. It matches on the label as well as the IRI, so either will find it.
4. **Get All** in the Graph toolbar draws the first ten subjects. When you load a new file the first ten are picked for you as well, so there's something to look at straight away.

**Show labels**, next to the filter box, swaps IRIs for names. If a subject has an `rdfs:label` or `skos:prefLabel`, the list shows that instead of `ex:shop-0042`. Where two subjects share a name the IRI is added after it so you can still tell them apart, and hovering over any entry shows its full IRI.

Blank nodes show up too, when they're the top of a structure rather than nested inside another subject. Ones with a label in the file (`_:g_00`) are listed under that label; anonymous ones (`[] a owl:AllDisjointClasses`) are numbered `anon-0`, `anon-1`… in the order they appear. Those names stay put while you edit, so a blank node you've picked stays drawn.

### Options
The Graph toolbar lets you change how the diagram is laid out and drawn:

- **Engine**: which Graphviz layout to use. `Dot` gives tidy hierarchies, `Neato` and `FDP` are force-directed, `Circo` and `Twopi` are circular, `Osage` clusters.
- **Format**: `SVG` is the one to use day to day; it's what you can pan and zoom. `PNG` gives a picture, and `JSON`, `XDOT`, `Plain` and `PS` are the raw Graphviz outputs.
- **Layout**: the direction the diagram flows: Left → Right, Top → Bottom, and their reverses.
- **Prefixes**: show shortened names like `rdf:type` instead of full IRIs.
- **Hide Types**: leave out `rdf:type` arrows to cut the clutter.
- **Hide Annotations**: leave out labels, comments and the like, so you see structure rather than description.
- **Subjects**: makes the nodes clickable. Click one and a pop-up lists every subject that points at it. On by default; untick it if the pop-ups get in the way while you pan.
- **Sort Subjects**: list subjects alphabetically rather than in the order they appear in the file.
- **Node Labels** and **Property Labels**: use `rdfs:label`/`skos:prefLabel` names in the diagram, for the boxes and for the arrows respectively, the same way **Show labels** does for the subject list. Both are on by default. Turn them off to see the raw IRIs.
- **Link Triple Terms**: see the next section.
- **Raw**: for SVG, show the SVG text itself rather than the picture. Useful if you want to copy it somewhere.

### RDF 1.2: triple terms and annotations
RDF 1.2 lets a triple be talked *about*. In Turtle that looks like `<<( :shop :founded "1921" )>>` when you refer to the triple directly, or `:shop :founded "1921" {| :claimedBy :source |}` when you attach notes to it as you write it. Under the hood both use `rdf:reifies` and a triple term.

The diagram draws each triple term as its own node, in **dark green**, showing the triple it stands for. Blank nodes look just as they always have.

Tick **Link Triple Terms** and each green node also gets dashed dark-green arrows to the subject and the object it mentions, labelled `subject` and `object`, wherever those happen to be in the diagram. They don't affect the layout, so switching them on won't rearrange anything.

### Getting around
- **Pan and zoom**: scroll to zoom, drag to pan (SVG only).
- **Click a node** and a pop-up lists every subject that points at it, which is a quick way to find who refers to a value. (That's the **Subjects** option; untick it to turn the pop-ups off.)

## 4. Querying with SPARQL

The **SPARQL & SHACL** panel at the bottom right runs SPARQL against the tab that's in front. (Its other job, validation, is [section 5](#5-validating-with-shacl).)

### Running a query
1. Write your query in the box. It has syntax colouring, and the tab-switching rules above apply: the data being queried is whatever's in the active tab.
2. **Add Prefixes** pastes in `PREFIX` lines for every prefix declared in your data, so you needn't type them.
3. **Execute Query** runs it. **Clear Results** tidies up afterwards.
4. **Export Query** saves the query text as `query.sparql`.

### What you can ask
The engine (Comunica) speaks SPARQL 1.2, so everything from 1.1 plus the newer additions:

- `SELECT`: a table of answers.
- `ASK`: yes or no.
- `CONSTRUCT` and `DESCRIBE`: a graph, which can go straight into a new tab.
- RDF 1.2 in queries: annotation blocks `{| |}` in patterns, triple terms `<<( )>>`, and `rdf:reifies`, all match what's in your data. Literals with a text direction (`"مرحبا"@ar--rtl`) keep it.

### Reading the results
`SELECT` answers appear as a table. Language-tagged text shows its tag (`hello@en`, or `مرحبا@ar--rtl` when it has a direction) and a triple term is written out as `<<( s p o )>>`.

**Export Results** offers CSV or JSON for a table. The JSON follows the SPARQL 1.2 results format, so other 1.2-aware tools can read it, triple terms and all. For a graph result it saves Turtle as `results.ttl`.

### Graph results (`CONSTRUCT` and `DESCRIBE`)
A graph result comes back as Turtle, written with the prefixes from your data, duplicates removed, and only the prefixes it actually uses declared at the top.

Where it goes depends on the **Graph results to tab** box among the SPARQL buttons:

- **Ticked** (the default): the graph opens as a new **Result** tab in the editor, every subject in it is selected, and the diagram draws it straight away. The results panel just notes where it went and how many triples there were. From there you can tidy it, save it with **Save File**, or query it again.
- **Unticked**: the Turtle appears in the results panel as before, and nothing else changes.

Either way **Export Results** still saves it.

### Things that catch people out
- **`HAVING` can't see your `AS` names.** In `SELECT ?shop (COUNT(?x) AS ?n) … HAVING (?n > 1)`, `?n` isn't bound yet when `HAVING` runs, so nothing comes back. Repeat the aggregate instead: `HAVING (COUNT(?x) > 1)`. That's how SPARQL is specified, not a quirk of this engine.
- **A `CONSTRUCT` template holds triples only.** Sub-selects, `OPTIONAL`, `FILTER` and other `{ }` blocks belong in the `WHERE` part. Put one in the template and the parser will complain that it expected `}` and found `{`.
- **You're querying the active tab.** If a query that worked a minute ago suddenly returns nothing, check which tab is in front.

## 5. Validating with SHACL

SHACL is the other way to ask a question of your data: instead of a query that returns rows, a set of **shapes** that say what well-formed data looks like, and a report of everywhere the data falls short. The editor runs a full SHACL engine in the browser (the same one behind [`holos`](https://github.com/pwin/SHACL_Engine), compiled to WebAssembly): SHACL Core and SHACL-SPARQL, so `sh:sparql` constraints and SPARQL-based targets work too, and it reads RDF 1.2 data.

### Running a validation
1. Have the data in one tab and the shapes in another. Click **+** in the tab strip for a new tab, then **Open File** or **Load URL** into it. Or open the page with both in the address: `?dot=<data url>&shapes=<shapes url>` loads the shapes into their own tab and picks it for you.
2. Switch to the **data** tab. Validation always checks the tab in front.
3. In the **Shapes** dropdown at the right of the panel's buttons, choose the tab holding the shapes. It gets a small *shapes* badge in the tab strip so you can see which is which.
4. Click **Validate**. The first click also loads the engine, about a megabyte; after that it's instant.

### Reading the report
The headline says **Conforms** or **Does not conform**, with the number of violations, warnings and infos and how many shapes were checked. Under it, one row per result:

- **Severity**: `Violation` counts against conformance; `Warning` and `Info` don't, they're advice.
- **Focus node**: the thing that was checked.
- **Path**: the property the constraint is about, blank for constraints on the node as a whole. A path expression is written out (`^ex:employs`, `(rdfs:subClassOf)+`) rather than left as a blank node.
- **Value**: the offending value, where there is one.
- **Message**: the shape's `sh:message`, with `{$this}`, `{$path}` and `{$value}` filled in, or a description of the constraint if the shape has no message.
- **Shape**: which shape said so. A property shape nested inside a node shape shows as `ex:ShopShape › property 2`.

**Report as tab** opens the report itself as a new tab. It's an RDF graph (`sh:ValidationReport`, `sh:ValidationResult`), so you can draw it, query it (`SELECT ?focus WHERE { ?r sh:focusNode ?focus }`) or save it. **Export report** saves it straight to `validation-report.ttl`. **Clear** puts the panel back.

### Trying it
The SPARQL course ships `shapes.ttl` and `shapes-advanced.ttl`. Load `bookshop-trail-1.1.ttl` as data and `shapes.ttl` as shapes, validate, then change a shop's `bs:staffCount` to `0` and validate again: one new violation, *"Staff count must be a positive integer"*, pointing at that shop.

### Things that catch people out
- **A warning doesn't fail conformance.** A report can say *Conforms* and still list warnings and infos. Only violations count.
- **`sh:lessThan` between two `xsd:gYear` values** (`bs:born` before `bs:died`, say) is reported as a violation by this engine, even when the years are in the right order. SPARQL's `<` isn't defined for `gYear`, and SHACL treats a comparison it can't make as a failure; some other validators compare the years anyway. So `shapes.ttl` reports eight of these on the untouched data, all from the one shape. Any other findings are real.
- **`SERVICE` is not allowed inside shapes.** A `sh:sparql` constraint that tries to reach a remote endpoint is rejected by the engine. Queries in the SPARQL editor can still use `SERVICE`.

## 6. RDF 1.2 and SPARQL 1.2

The parser (n3.js 2.2) and the query engine (Comunica 5.3) both speak the 1.2 versions of the standards, and the app has been checked against each feature below. Here's what you can rely on, and what to watch for.

### What works
- **Turtle 1.2 input**: the `VERSION "1.2"` line; triple terms `<<( s p o )>>`, nested ones included; annotations `{| … |}`; reifiers, whether written `~ :r`, `<< s p o >>` or `<< s p o ~ :r >>`; literals with a text direction such as `"مرحبا"@ar--rtl`; and `rdf:JSON` literals.
- **JSON-LD input**: `@direction` on a value is read and kept.
- **SPARQL 1.2**: all of the above in `WHERE` patterns and in `CONSTRUCT` templates; the `VERSION` line; `TRIPLE`, `SUBJECT`, `PREDICATE`, `OBJECT` and `isTRIPLE`; `LANGDIR`, `hasLANG`, `hasLANGDIR` and `STRLANGDIR`.
- **Results**: the table shows triple terms as `<<( s p o )>>` and directions as `@ar--rtl`; the JSON export uses the SPARQL 1.2 results format (`"type": "triple"`, `"its:dir"`).
- **Turtle output**, whether from a query, **To Turtle** or **Save File**: triple terms and directions come out as they went in.
- **Diagram**: triple terms as dark-green nodes, reifier blank nodes, and the optional dashed links.
- **Reasoner**: runs over 1.2 data. A triple term is treated as a single value to reason *about*, not something to reason *inside*, and **Show Facts** prints triple terms and directions properly.
- **SHACL validation** reads 1.2 data, triple terms and all, and shapes can target and constrain it.

### What doesn't, yet
- **RDF/XML input** predates 1.2: a triple term written as `rdf:parseType="Triple"` is dropped without a word, and an `its:dir` direction is ignored (the language tag survives).
- **To JSON-LD** has no way to write a triple term, so it fails if your data has any. A literal's text direction is dropped too, as JSON-LD `@direction` isn't written out.
- **The diagram shows a literal's text only**: no language tag, direction or datatype, so `"مرحبا"@ar--rtl` looks like any other string. That's true of ordinary `@en` tags as well.
- **Inferred triples** that copy a literal with a direction (say, through `rdfs:subPropertyOf`) come back from the reasoner without the direction.
- **CSV export** is plain values: a triple term becomes the text `<<( s p o )>>`, and language tags and directions are left off.
- **SPARQL Update** (`INSERT`, `DELETE`, whether 1.1 or 1.2) isn't run. The panel only asks questions; change data in the editor.

## 7. Advanced Features

### Reasoning (Hylar)
There's a built-in OWL 2 RL reasoner. Click **Show Facts** in the Graph toolbar and a new window lists the **explicit** triples (the ones in your data) and the **implicit** ones the reasoner worked out from them.

### Format conversion
**To Turtle** and **To JSON-LD** in the Graph toolbar rewrite the active tab's data in that format, in place.

### URL parameters
Add these to the page address to open it with data already loaded:

- `?dot=<url>`: fetch a Turtle or DOT file from that address.
- `?rdfa=<url>`: fetch that address too. If it returns RDF it's loaded as normal; pulling RDFa out of an HTML page isn't implemented yet, so a web page just gets a note saying so.
- `?shapes=<url>`: fetch a SHACL shapes file into its own tab and select it for validation, leaving the data tab in front. Combine with `?dot=` to hand someone data and shapes in one link.

Remember to URL-encode the address you pass in.

## 8. Security and privacy

This tool is built so that it can be used with data you'd rather not send anywhere. Here is exactly what that means, in plain terms, so you can decide for yourself.

### Everything runs in the page
The Turtle parser, the Graphviz renderer, the SPARQL engine (Comunica), the reasoner (Hylar) and the SHACL engine (a WebAssembly build of `holos`) all run inside your browser tab. They're served from the same place as the page itself, never from a content-delivery network, and none of them phones home. There's no analytics, no telemetry, no crash reporting, and no "look up this prefix online" convenience. The one such lookup a library used to carry (prefix.cc, inside a serialiser this app never calls) has been cut out of the build altogether.

### The only things that leave the browser, and only when you ask
- **A URL you load.** *Load URL* in the Graph toolbar, and `?dot=`, `?rdfa=` and `?shapes=` in the page address, fetch the address you give. The server at that address sees the request, as any web fetch does. Nothing from your editor goes with it.
- **A `SERVICE` clause in a query you run.** Federation is part of SPARQL, and the course uses it. When your query names an endpoint, the part of the query inside the `SERVICE` block, along with the bindings needed to answer it, goes to that endpoint. That's the one way anything from the tab reaches another server, and it happens only because the query you wrote says so. If you've pasted something sensitive into the editor, don't then run a `SERVICE` query that joins it against a public endpoint.

That's the whole list. In particular:

- **JSON-LD contexts are not fetched.** A JSON-LD document whose `@context` is a URL would normally make the parser go and get it; here it's refused with a message asking you to paste the context into the document. That request would have been made by the document, not by you.
- **Shapes can't reach out.** The SHACL engine rejects `SERVICE` inside `sh:sparql` constraints outright.
- **Nothing is stored.** No cookies, no local storage, no account. Close the tab and it's gone.

### The browser enforces it
The page carries a Content Security Policy, so the rules above aren't just good intentions. Scripts run only from the page's own origin: no inline scripts, no `javascript:` links, no `eval`. The page may connect only to its own origin and to HTTP(S) addresses, which is what *Load URL* and `SERVICE` need. If a future change, or a bug, tried to load a script from elsewhere or run code smuggled in through a data file, the browser would refuse and say so in the console.

Data can't run code, either. Everything that comes from a file, IRIs, labels, literal text, is drawn, listed and printed as text. A literal containing `<script>` or `<img onerror=…>` is just an ugly string.

### If you're deploying this inside an organisation
- The policy allows connections to any `http:` or `https:` address, because that's what `SERVICE` needs. To restrict it to approved endpoints, send a `Content-Security-Policy` header from your web server with a tighter `connect-src` (say, `connect-src 'self' https://sparql.example.internal`); the browser applies both, and the stricter one wins. Drop `http:` if all your endpoints are HTTPS.
- Everything the page needs is in the deployed folder: no outbound access is required to run it, so it works on a network with no route to the internet.
- The dependency tree is audited (`npm audit`) and pruned to what the app actually imports. The one remaining advisory is DOMPurify inside the Monaco editor's own bundle; the affected APIs aren't ones Monaco calls, and the only markdown it sanitises is the app's own static text.

### Things worth knowing
- **A link can carry a URL.** `?dot=https://…` fetches whatever address the link names. That's the point of it, and it's also why you should treat such a link like any other link: it will load that file into your editor.
- **The reasoner is old.** Hylar uses `eval` internally for rules with arithmetic in them. The OWL 2 RL rules it ships with have none, so that path is never taken here, and the policy above would refuse it if it were. Adding custom rules on top of Hylar would need a different reasoner.
- **Nothing here is a substitute for your own review.** The source is public; the checks described are the ones that have been done, and the [SECURITY.md](SECURITY.md) file in the repository says how to repeat them.

---
*Turtle Editor Viewer v2.0.0*
