//const { RdfXmlParser } = require("../js/rdfjs/rdf-ext-1.0.0");

//const { xmlScribe } = require("../js/rdfjs/rdf-ext-1.7.1");
var debug = false;
var beforeUnloadMessage = null;
var startupRDF = `
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix contact: <http://www.w3.org/2000/10/swap/pim/contact#>.
@prefix rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
@prefix dc:      <http://purl.org/dc/elements/1.1/#>.
@prefix exterms: <http://www.example.org/terms/>.

<http://www.w3.org/People/EM/contact#me>
    rdf:type contact:Person;
    contact:fullName "Eric Miller";
    contact:mailbox <mailto:em@w3.org>;
    contact:personalTitle "Dr." ;
    contact:eg <http://www.w3.org/TR/rdf-syntax-grammar> .

<http://www.w3.org/TR/rdf-syntax-grammar>
    dc:title "RDF/XML Syntax Specification (Revised)";
    exterms:editor [
        exterms:fullName "Dave Beckett";
        exterms:homePage <http://purl.org/net/dajobe/>
    ].
####### INSTRUCTIONS ###############################################
## To view in the graph pane:
## 1: click the "Go" button - this will populate the select box with the
##    identifiers of the subjects and the blank nodes in the Turtle
## 2: click on any subject or blank node identifier and wait a second or so

## To view your Turtle RDF or to edit a new file just delete what is in
## this pane and proceed as above to review.
## To upload a local file use the "Choose File" button at the top left of
## the graphic window

## On the SVG image, if you mouse over the model there are hyperlinks in
## the nodes.  Clicking on a node will identify the subject node/s for which
## the clicked node is an object

## Select the 'raw' checkbox to get the raw SVG code

## PNG is the selection for PNG images and these can be copied or saved using
## the right mouse click context menu


## The editor also recognises graphviz 'dot' files if they start with "digraph".
## This is a good mode to quickly diagram RDF

## QUERYSTRINGS
## if a URL is connected to the editor with ?dot= then the content is brought into
## the editor - this is useful for bringing dot and turtle files into the editor
##
## If the URL is connected with ?rdfa= then the document at the URL is parsed and the
## RDFa triples are extracted and added to the editor as ntriples.
##

    `
var editor = ace.edit("editor");
editor.setOptions({
  maxLines: Infinity,  // this is going to be very slow on large documents
  useWrapMode: true,   // wrap text to view
  indentedSoftWrap: false, 
  behavioursEnabled: true, // enable autopairing of brackets and tags
  showLineNumbers: true, // show the gutter
  mode: "ace/mode/dot",
  theme: "ace/theme/cobalt",
  resize: true
});
editor.setValue(startupRDF);
/*editor.getSession().setMode("ace/mode/dot");
editor.setTheme("ace/theme/cobalt");
editor.setValue(startupRDF);
editor.setAutoScrollEditorIntoView(true);
editor.resize(true);
editor.renderer.updateFull();
editor.setWrapBehavioursEnabled(true);
editor.$blockScrolling = Infinity;
*/
var editorAvailable = true;

var parser = new DOMParser();
var worker;
var result;
var stream;
var result1;
var prefixes;

//var graphStore =  new rdf.dataset();
var graphStore = new rdfdi();
//var parserN3 = new N3Parser();
var parserN3 //= new N3Parser();
//var rdfParser = new RdfXmlParser.RdfXmlParser();
var rdfParser //= new RdfXmlStreamingParser.RdfXmlParser();
var subjectsList = [];
var subjectSet;
var dotText = '';
var myprefixes = {};
//const element = document.querySelector('#subs');
//const choices = new Choices(element);

var beforeUnloadMessage = null;

var patt = /&(?!(?:#[0-9]+|[a-z]+);)/gi // Useed for matching ampersands that are not already part of anXML entity

var resizeEvent = new Event("paneresize");
Split(['#editor', '#graph'], {
  sizes: [25, 75],
  onDragEnd: function() {
    var svgOutput = document.getElementById("svg_output");
    if (svgOutput != null) {
      svgOutput.dispatchEvent(resizeEvent);
    }
  }
});

function shrink(iri) {
  const found = Array.from(Object.entries(myprefixes)).find(([, baseIRI]) => iri.startsWith(baseIRI))
  if (found) {
    return iri.replace(new RegExp(`^${found[1]}`), `${found[0]}:`)
  }
  return iri
}

function expand(qname) {
  const found = Array.from(Object.entries(myprefixes)).find(([prefix, ]) => qname.startsWith(`${prefix}:`))
  if (found) {
    return qname.replace(new RegExp(`^${found[0]}:`), `${found[1]}`)
  }
  return qname
}

function wordwrap(str, width = 50, brk = "\\l", cut = false) {

  brk = brk || 'n';
  width = width || 75;
  cut = cut || false;

  if (!str) {
    return str;
  }

  var regex = '.{1,' + width + '}(\s|$)' + (cut ? '|.{' + width + '}|.+$' : '|\S+?(\s|$)');

  return str.match(RegExp(regex, 'g')).join(brk);

}


function wordWrap(str, maxWidth = 50, newLineStr = "\\l") {
  var done = false;
  res = '';
  while (str.length > maxWidth) {
    found = false;
    // Inserts new line at first whitespace of the line
    for (i = maxWidth - 1; i >= 0; i--) {
      if (testWhite(str.charAt(i))) {
        res = res + [str.slice(0, i), newLineStr].join('');
        str = str.slice(i + 1);
        found = true;
        break;
      }
    }
    // Inserts new line at maxWidth position, the word is too long to wrap
    if (!found) {
      res += [str.slice(0, maxWidth), newLineStr].join('');
      str = str.slice(maxWidth);
    }

  }

  return res + str;
}

function testWhite(x) {
  var white = new RegExp(/^\s$/);
  return white.test(x.charAt(0));
}


function editorLang(lang) {
  switch (lang) {
    case "turtle":
      editor.session.setMode("ace/mode/turtle");
      break;
    case "xml":
      editor.session.setMode("ace/mode/xml");
      break;
    case "javascript":
      editor.session.setMode("ace/mode/javascript");
      break;
    case "dot":
      editor.session.setMode("ace/mode/dot");
  }
};

function editorTheme(theme) {
  switch (theme) {
    case "cobalt":
      editor.setTheme("ace/theme/cobalt");
      break;
    case "dawn":
      editor.setTheme("ace/theme/dawn");
      break;
    case "eclipse":
      editor.setTheme("ace/theme/eclipse");
      break;
    case "github":
      editor.setTheme("ace/theme/github");
  }
};


/**************  RDFJS STUFF */
function streamToString(stream) {
  const content = []
  stream.on('data', chunk => {
    content.push(chunk)
  })
  return rdf.waitFor(stream).then(() => {
    return content.join('')
  })
}


function parseRDFa(inputText) {
  let input = new Readable({
    read: () => {
      input.push(inputText)
      input.push(null)
    }
  });
  editor.setValue('')
  const myParser = new RdfaParser.RdfaParser({
    baseIRI: 'http://dummy.base.uri/',
    contentType: 'text/html'
  });
  let output = myParser.import(input);
  subjectSet = new Set();
  output.on('data', quad => {
    if (quad.subject.termType === "BlankNode" && count === false) {
      quad.subject.constructor.nextId = 0;
      count = true;
    }
    if (quad.object.termType === "BlankNode" && count === false) {
      quad.object.constructor.nextId = 0;
      count = true;
    }
    graphStore.add(quad)
    subjectSet.add(quad.subject.value)
    if (debug) {
      console.log("Quad: ", `quad: ${quad.subject.value} - ${quad.predicate.value} - ${quad.object.value}`)
    }
    if (debug) {
      console.log("Canonical:  ", graphStore.toCanonical())
    }
  });

  output.on('prefix', (prefix, namespace) => {
    handleprefixes(prefix, namespace)
  });


  output.on('end', () => {
    getSubjects(graphStore)
  });

  output.on('error', () => {
    //
  });

  var result1 = ''
  const serializerNtriples = new SerializerNtriples()
  const inputStream = graphStore.toStream()
  const outputStream = serializerNtriples.import(inputStream)

  outputStream.on('data', ntriples => {
    if (ntriples != "undefined") {
      result1 += ntriples.toString()
    }
  })

  outputStream.on('end', () => {
    editor.setValue(result1)
  })
}

function convertTo(what) {
  let myParser;
  let inputText = editor.getValue();
  let input = new Readable({
    read: () => {
      input.push(inputText)
      input.push(null)
    }
  });

  if (isXML(inputText.trim())) {
    //myParser = new RdfXmlStreamingParser.RdfXmlParser({baseIRI: 'http://dummy.base.uri/'});
    myParser = "application/rdf+xml"
  } else if (inputText.trim().startsWith('{') || inputText.trim().startsWith('[')) {
    //myParser = new JsonLdParser();
    myParser = "application/ld+json"
  } else if (document.querySelector("#lang select").value === "turtle") {
    //myParser = new ParserN3();
    myParser = "text/turtle"
  }

  let output = formats.parsers.import(myParser, input)
  editorAvailable = false;
  switch (what) {
    case "turtle":
      result1 = '';
      stream = formats.serializers.import('text/turtle', output);
      stream.on('data', (data) => {
        result1 += data.toString()
      })

      rdf.waitFor(stream).then(() => {
        editor.setValue('')
        editor.setValue(result1)
        editorAvailable = true;
      })
      break;
    case "ttl":
      result1 = '';
      //serialiser = new XMLSerializer();
      stream = turtleScribe(output);
      stream.on('data', (data) => {
        result1 += data.toString()
      })

      rdf.waitFor(stream).then(() => {
        editor.setValue('')
        editor.setValue(result1)
        editorAvailable = true;
      })
      break;
    case "rdfxml":
      result1 = '';
      //serialiser = new XMLSerializer();
      stream = xmlScribe(output);
      stream.on('data', (data) => {
        result1 += data.toString()
      })

      rdf.waitFor(stream).then(() => {
        editor.setValue('')
        editor.setValue(result1)
        editorAvailable = true;
      })
      break;
    case "jsonld":
      result1 = '';
      stream = formats.serializers.import('application/ld+json', output);
      stream.on('data', (data) => {
        result1 += data.toString()
      })

      rdf.waitFor(stream).then(() => {
        editor.setValue('')
        editor.setValue(JSON.stringify(JSON.parse(result1), undefined, 2))
        editorAvailable = true;
      })

      break;
    default:
      editor.setValue(inputText)
      editorAvailable = true;
  }
  editorAvailable = true;
  return
}


function addData(data) {
  editor.setValue(data)
}


function getSubjects(graphStore) {

  let quads = Array.from(graphStore);
  let blankObjects = new Set(
    quads.map(quad => quad.object)
         .filter(object => object.termType === "BlankNode")
  );
  let subjects = new Set(
    quads.map(quad => quad.subject)
         .filter(subject => !blankObjects.has(subject))
         .map(subject => shrink(subject.value))
  );
  subjectsList = Array.from(subjects);
  if (debug) {
    console.log(subjectsList)
  }
  document.querySelector("#subjectsSel select").innerHTML = ""
  for (let i of subjectsList) {
    document.querySelector("#subjectsSel select").add(new Option(i))
  }

}


function findTriplesForObject(objectNodeValue) {
  let onvs = objectNodeValue.toString()
  subjectNodes = []
  let nn0 = graphStore.match(rdf.namedNode(onvs)).toArray()
  let nn = nn0.concat(graphStore.match(rdf.blankNode(onvs)).toArray())

  graphStore.forEach((g_quad) => {
    if (g_quad.object.value.toString() == onvs) {
      subjectNodes.push(shrink(g_quad.subject.value))
    }
  });
  alert("Matching Subjects:\n" + subjectNodes.join('\r\n'))
}

function createLegend() {
  var legend = ''
  legend += 'subgraph legend {rankdir="TD" rank="min" LABEL_1 [shape="box" style="dashed" margin=0   label="'
  Object.keys(myprefixes).forEach(function(item) {
    legend += item + ":   " + myprefixes[item] + " \\l"
  })
  legend += "\" ];}"
  return legend
}


function isListNode(statements) {
  let listPredicates = new Set([
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#first",
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest"
  ]);
  return statements.length === 2 && statements.every(quad =>
    listPredicates.has(quad.predicate.value)
  );
}


function renderList(graphStore, declared, head, statements, includeSubjects) {
  let listMembers = [];
  do {
    let headNode = statements.find(quad => quad.predicate.value === "http://www.w3.org/1999/02/22-rdf-syntax-ns#first").object;
    listMembers.push(headNode);
    let nextNode = statements.find(quad => quad.predicate.value === "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest").object;
    if (nextNode === "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil") {
      statements = []
    } else {
      statements = graphStore.match(nextNode).toArray();
    }
  } while (statements.length)

  [dotText, listRef] = declareTerm(declared, head, includeSubjects);
  let memberRefs = [];
  listMembers.forEach(member => {
    [memberText, memberRef] = declareTerm(declared, member, includeSubjects);
    dotText += memberText;
    memberRefs.push(memberRef);
  });

  let attributes = [
    'shape=record',
    'label="'+Array(memberRefs.length).fill().map((_, i) => `<p${i}>`).join('|')+'"'
  ];
  dotText += '   "' + listRef + '" [' + attributes.join(',') + '];\n ';
  dotText += memberRefs.map((member, i) => `   "${listRef}":p${i} -> "${member}" ; `).join('\n');

  return [dotText, listMembers];
}

function createDot(selectedSubjects) {
  let subjectsToAdd =
    selectedSubjects.map(expand)
                    .flatMap(subject => [rdf.namedNode(subject),
                                         rdf.blankNode(subject)]);
  let includeSubjects = document.querySelector("#subjects input").checked;
  let excludeTypes = document.querySelector("#type input").checked;
  let declared = new Map();
  let allStatements = [];
  let seen = new Set();
  let rdfGraph = '';
  while (subjectsToAdd.length) {
    let ss = subjectsToAdd.shift();
    seen.add(ss);
    let statements = graphStore.match(ss).toArray();
    if (isListNode(statements)) {
      [text, listMembers] = renderList(graphStore, declared, ss, statements, includeSubjects);
      rdfGraph += text;
      subjectsToAdd.push(...listMembers.filter(term => term.termType === "BlankNode")
                                       .filter(value => !seen.has(value)))
    } else {
      allStatements.push(...statements);
      subjectsToAdd.push(...statements
                              .map(s => s.object)
                              .filter(term => term.termType === "BlankNode")
                              .filter(value => !seen.has(value)))
    }
  }
  for (let quad of allStatements) {
    let subjectRef, objectRef, text;
    [text, subjectRef] = declareTerm(declared, quad.subject, includeSubjects);
    rdfGraph += text;
    if (!(excludeTypes && quad.predicate.value === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type")) {
      [text, objectRef] = declareTerm(declared, quad.object, includeSubjects);
      rdfGraph += text;
      rdfGraph += '  "' + subjectRef + '" -> "' + objectRef + '"  [label="' + shrink(quad.predicate.value) + '"];\n '
    }
  }

  if (debug) {
    console.log("rdfGraph", rdfGraph)
  }
  let legend = '';
  if (document.querySelector("#prefix input").checked) {
    legend = createLegend();
  }
  dotText = `digraph {
    node [shape="box", style="rounded"];
    rankdir="LR"; ratio="auto";
    subgraph RDF {
      ${rdfGraph}
    }
    ${legend}
  }`;

  if (debug) {
    console.log("dotText", dotText)
  }
  updateGraph(dotText)
}

function declareTerm(declared, term, includeSubjects) {
  if (declared.has(term)) {
    return ['', declared[term]];
  }
  let declaration = '';
  let ref = term.value, attributes = [];
  if (term.termType === "Literal") {
    ref = wordWrap(term.value);
    attributes.push('color="blue"');
  } else
  if (term.termType === "BlankNode") {
    attributes.push('color="orange"');
  } else {
    ref = shrink(term.value);
  }
  declared[term] = ref;

  if (includeSubjects) {
    attributes.push(`URL="javascript:findTriplesForObject(['${term.value}'])"`)
  }
  declaration = '   "' + ref + '" [' + attributes.join(',') + '];\n ';

  return [declaration, ref];
}


function clearNode(id) {
  {
    const myNode = document.getElementById(id);
    while (myNode.firstChild) {
      myNode.removeChild(myNode.lastChild);
    }
  }
}

function handleprefixes(prefix, namespace) {
  myprefixes[prefix] = namespace.value;
  if (debug) {
    console.log(myprefixes)
  }
}

function isXML(xmlStr) {
  var parseXml;

  if (typeof window.DOMParser != "undefined") {
    parseXml = function(xmlStr) {
      return (new window.DOMParser()).parseFromString(xmlStr, "text/xml");
    };
  } else if (typeof window.ActiveXObject != "undefined" && new window.ActiveXObject("Microsoft.XMLDOM")) {
    parseXml = function(xmlStr) {
      var xmlDoc = new window.ActiveXObject("Microsoft.XMLDOM");
      xmlDoc.async = "false";
      xmlDoc.loadXML(xmlStr);
      return xmlDoc;
    };
  } else {
    return false;
  }

  try {
    var myXMLDoc = parseXml(xmlStr);
    if (myXMLDoc.getElementsByTagName("parsererror").length > 0) {
      return false
    }
  } catch (e) {
    alert(e)
    return false;
  }
  return true;
}



var go = function() {
  let count = false;
  if (debug) {
    console.log("go")
  }
  //graphStore =  new rdf.dataset();
  graphStore = new rdfdi();
  let inputText = editor.getValue()
  if (inputText.trim().toLowerCase().startsWith('digraph')) {
    document.querySelector("#lang select").value = "dot";
    dotText = inputText;
    updateGraph();
    return
  }
  //else if(inputText.trim().startsWith('<') && document.querySelector("#lang select").value != "turtle" && document.querySelector("#lang select").value != "javascript") {
  else if (isXML(inputText.trim())) {
    document.querySelector("#error").innerHTML = "this is an XML file";
    document.querySelector("#lang select").value = "xml";
    let input = new Readable({
      read: () => {
        input.push(inputText)
        input.push(null)
      }
    });
    //RdfXmlParser()
    //const myParser = new RdfXmlStreamingParser.RdfXmlParser({baseIRI: 'http://dummy.base.uri/'});

    let output = formats.parsers.import('application/rdf+xml', input)
    subjectSet = new Set();
    output.on('data', quad => {
      if (quad.subject.termType === "BlankNode" && count === false) {
        quad.subject.constructor.nextId = 0;
        count = true;
      }
      if (quad.object.termType === "BlankNode" && count === false) {
        quad.object.constructor.nextId = 0;
        count = true;
      }
      graphStore.add(quad)
      subjectSet.add(quad.subject.value)

      if (debug) {
        console.log("Quad: ", `quad: ${quad.subject.value} - ${quad.predicate.value} - ${quad.object.value}`)
      }
      if (debug) {
        console.log("Canonical:  ", graphStore.toCanonical())
      }
    });

    output.on('prefix', (prefix, namespace) => {
      handleprefixes(prefix, namespace)
    });

    output.on('end', () => {
      getSubjects(graphStore)
    });

    output.on('error', () => {
      document.querySelector("#error").innerHTML = "#1: There was an error in parsing but no further detail.";
    });

    return
  } else if (inputText.trim().startsWith('{') || inputText.trim().startsWith('[')) {
    document.querySelector("#error").innerHTML = "this is an JSON-LD file";
    document.querySelector("#lang select").value = "javascript";
    let input = new Readable({
      read: () => {
        input.push(inputText)
        input.push(null)
      }
    });
    //JsonLdParser()
    //const myParser = new rdfparserjsonld();

    let output = formats.parsers.import('application/ld+json', input)

    subjectSet = new Set();
    output.on('data', quad => {
      if (debug) {
        console.log(quad)
      }
      if (quad.subject.termType === "BlankNode" && count === false) {
        quad.subject.constructor.nextId = 0;
        count = true;
      }
      if (quad.object.termType === "BlankNode" && count === false) {
        quad.object.constructor.nextId = 0;
        count = true;
      }
      graphStore.add(quad)
      subjectSet.add(quad.subject.value)

      if (debug) {
        console.log("Quad: ", `quad: ${quad.subject.value} - ${quad.predicate.value} - ${quad.object.value}`)
      }
      if (debug) {
        console.log("Canonical:  ", graphStore.toCanonical())
      }
    });

    output.on('prefix', (prefix, namespace) => {
      handleprefixes(prefix, namespace)
    });

    output.on('end', () => {
      getSubjects(graphStore)
    });

    output.on('error', () => {
      document.querySelector("#error").innerHTML = "#1: There was an error in parsing but no further detail.";
    });

    return
  } else {
    document.querySelector("#error").innerHTML = "this is assumed to be a turtle file";
    document.querySelector("#lang select").value = "turtle";
    let input = new Readable({
      read: () => {
        input.push(inputText)
        input.push(null)
      }
    });

    //parserN3
    let output = formats.parsers.import('text/turtle', input)

    subjectSet = new Set();
    output.on('data', quad => {
      if (quad.subject.termType === "BlankNode" && count === false) {
        quad.subject.constructor.nextId = 0;
        count = true;
      }
      if (quad.object.termType === "BlankNode" && count === false) {
        quad.object.constructor.nextId = 0;
        count = true;
      }
      graphStore.add(quad)
      subjectSet.add(quad.subject.value)
      if (debug) {
        console.log("Quad: ", `quad: ${quad.subject.value} - ${quad.predicate.value} - ${quad.object.value}`)
      }
      if (debug) {
        console.log("Canonical:  ", graphStore.toString())
      }
    });

    output.on('prefix', (prefix, namespace) => {
      handleprefixes(prefix, namespace)
    });


    output.on('end', () => {
      getSubjects(graphStore)
    });

    output.on('error', () => {
      document.querySelector("#error").innerHTML = "#2: There was an error in parsing but no further detail.";
    });
  }
}




/*****************************/

function updateGraph() {
  if (debug) {
    console.log(dotText)
  };
  if (dotText === '') {
    dotText = editor.getSession().getDocument().getValue()
  } else {
    dotText = dotText
  }
  if (worker) {
    worker.terminate();
  }

  document.querySelector("#output").classList.add("working");
  document.querySelector("#output").classList.remove("error");

  worker = new Worker("./worker.js");

  worker.onmessage = function(e) {
    document.querySelector("#output").classList.remove("working");
    document.querySelector("#output").classList.remove("error");

    result = e.data;

    updateOutput();
  }

  worker.onerror = function(e) {
    document.querySelector("#output").classList.remove("working");
    document.querySelector("#output").classList.add("error");

    var message = e.message === undefined ? "An error occurred while processing the graph input." : e.message;

    var error = document.querySelector("#error");
    while (error.firstChild) {
      error.removeChild(error.firstChild);
    }

    document.querySelector("#error").appendChild(document.createTextNode(message));

    console.error(e);
    e.preventDefault();
  }




  var params = {
    src: dotText,
    options: {
      engine: document.querySelector("#engine select").value,
      format: document.querySelector("#format select").value
    }
  };




  // Instead of asking for png-image-element directly, which we can't do in a worker,
  // ask for SVG and convert when updating the output.

  if (params.options.format == "png") {
    params.options.format = "svg";
  }

  worker.postMessage(params);
}

function updateOutput() {
  var graph = document.querySelector("#output");

  var svg = graph.querySelector("svg");
  if (svg) {
    graph.removeChild(svg);
  }

  var text = graph.querySelector("#text");
  if (text) {
    graph.removeChild(text);
  }

  var img = graph.querySelector("img");
  if (img) {
    graph.removeChild(img);
  }

  if (!result) {
    return;
  }

  if (document.querySelector("#format select").value == "svg" && !document.querySelector("#raw input").checked) {
    var svg = parser.parseFromString(result, "image/svg+xml").documentElement;
    svg.id = "svg_output";
    graph.appendChild(svg);

    panZoom = svgPanZoom(svg, {
      zoomEnabled: true,
      controlIconsEnabled: true,
      fit: true,
      center: true,
      minZoom: 0.1
    });

    svg.addEventListener('paneresize', function(e) {
      panZoom.resize();
    }, false);
    window.addEventListener('resize', function(e) {
      panZoom.resize();
    });
  } else if (document.querySelector("#format select").value == "png") {
    var image = Viz.svgXmlToPngImageElement(result);
    graph.appendChild(image);
  } else {
    var text = document.createElement("div");
    text.id = "text";
    text.appendChild(document.createTextNode(result));
    graph.appendChild(text);
  }
}

editor.on("change", function() {
  if (editorAvailable === false) {
    return
  }
  //updateGraph();
  if (editor.getValue().trim().toLowerCase().startsWith('digraph')) {
    go();
  } else {
    go();
    createDot([...document.querySelector("#subs").options].filter(option => option.selected).map(option => option.value))
  }
  beforeUnloadMessage = "Your changes will not be saved.";
});

window.addEventListener("beforeunload", function(e) {
  return beforeUnloadMessage;
});

document.querySelector("#engine select").addEventListener("change", function() {
  updateGraph();
});

document.querySelector("#format select").addEventListener("change", function() {
  if (document.querySelector("#format select").value === "svg") {
    document.querySelector("#raw").classList.remove("disabled");
    document.querySelector("#raw input").disabled = false;
  } else {
    document.querySelector("#raw").classList.add("disabled");
    document.querySelector("#raw input").disabled = true;
  }

  updateGraph();
});

document.querySelector("#raw input").addEventListener("change", function() {
  updateOutput();
});

document.querySelector("#prefix input").addEventListener("change", function() {
  createDot([...document.querySelector("#subs").options].filter(option => option.selected).map(option => option.value));
});
document.querySelector("#subjects input").addEventListener("change", function() {
  createDot([...document.querySelector("#subs").options].filter(option => option.selected).map(option => option.value));
});
document.querySelector("#type input").addEventListener("change", function() {
  createDot([...document.querySelector("#subs").options].filter(option => option.selected).map(option => option.value));
});
updateGraph();
