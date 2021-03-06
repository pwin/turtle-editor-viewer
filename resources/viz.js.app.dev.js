//const { RdfXmlParser } = require("../js/rdfjs/rdf-ext-1.0.0");

//const { rdfparserjsonld } = require("../js/rdfjs/rdf-ext-1.6.0");

var debug = true;
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
    editor.getSession().setMode("ace/mode/dot");
    editor.setTheme("ace/theme/cobalt");
    editor.setValue(startupRDF);
    var editorAvailable = true;

    var parser = new DOMParser();
    var worker;
    var result;
    var stream;
    var result1;
    var prefixes;

    
    //var graphStore =  new rdf.dataset();
    var graphStore =  new rdfdi();
    //var parserN3 = new N3Parser();
    var parserN3 = new N3Parser();
    //var rdfParser = new RdfXmlParser.RdfXmlParser();
    var rdfParser = new RdfXmlParser.RdfXmlParser();
    var subjectsList = [];
    var subjectSet;
    var dotText = '';
    var myprefixes = {} ;
    //const element = document.querySelector('#subs');
    //const choices = new Choices(element);    
    
    var beforeUnloadMessage = null;

    var patt = /&(?!(?:#[0-9]+|[a-z]+);)/gi  // Useed for matching ampersands that are not already part of anXML entity

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


    //const ct = rdfparse.RdfParser.CONTENT_MAPPINGS



    function shrink(iri) {
        const found = Array.from(Object.entries(myprefixes)).find(([, baseIRI]) => iri.startsWith(baseIRI))
        if (found) {
          return iri.replace(new RegExp(`^${found[1]}`), `${found[0]}:`)
        }
        return iri
      }



    function editorLang(lang){
      switch(lang){
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

  function editorTheme(theme){
      switch(theme){
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
  function streamToString (stream) {
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
      const myParser = new RdfaParser.RdfaParser({ baseIRI: 'http://dummy.base.uri/', contentType: 'text/html' });
      let output = myParser.import(input);
      subjectSet = new Set();
      output.on('data', quad => {
        if(quad.subject.termType === "BlankNode"  && count===false) {quad.subject.constructor.nextId = 0 ; count=true;}
        if(quad.object.termType === "BlankNode"  && count===false) {quad.object.constructor.nextId = 0 ; count=true;}
      graphStore.add(quad)
      subjectSet.add(quad.subject.value)
       if(debug){console.log("Quad: ", `quad: ${quad.subject.value} - ${quad.predicate.value} - ${quad.object.value}`)}
       if(debug){console.log("Canonical:  ", graphStore.toCanonical())}
      });
      
      output.on('prefix', (prefix, namespace) => {handleprefixes(prefix, namespace)
      });
      
      
      output.on('end', () => {
      graphStore.forEach((quad) => {subjectSet.add(quad.subject.value)})
      if(debug){console.log(subjectSet)}
      if(debug){console.log([...subjectSet])}
      
      if(debug){console.log("Subjects:  ", subjectSet)}
       subjectsList = Array.from(subjectSet);
       if(debug){console.log(subjectsList)}
       document.querySelector("#subjectsSel select").innerHTML=""
       for(let i of subjectsList){document.querySelector("#subjectsSel select").add(new Option(i))}
      });
      
      output.on('error', () => {
        //
      });

    var result1 = ''
     const serializerNtriples = new SerializerNtriples()
     const inputStream = graphStore.toStream()
     const outputStream = serializerNtriples.import(inputStream)
     
     outputStream.on('data', ntriples => {
       if(ntriples != "undefined"){
       result1 += ntriples.toString()
       }
     })
     
     outputStream.on('end', () => {
      editor.setValue(result1)
    })     
  }

  function convertTo(what){
    let myParser ;
    let serialiser;
    let inputText  = editor.getValue();
    let input = new Readable({
      read: () => {
        input.push(inputText)
        input.push(null)
      }
    });

    if(inputText.trim().startsWith('<')){
      myParser = new RdfXmlParser.RdfXmlParser({baseIRI: 'http://dummy.base.uri/'});
    }
    else if(inputText.trim().startsWith('{') || inputText.trim().startsWith('[') )
    {
      //myParser = new JsonLdParser();
      myParser = new jsonldStreamingParser.JsonLdParser({ baseIRI: 'http://dummy.base.uri/'})
    }
    else if(document.querySelector("#lang select").value === "turtle")
    {
      myParser = new N3Parser();
  }
  
  let output = myParser.import(input);
  editorAvailable = false;
  switch(what){
    case "turtle":
      result1='';
      serialiser = new NTriplesSerializer()
      stream = serialiser.import(output);
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
      result1 ='';
      serialiser = new XMLSerializer();
      stream = serialiser.import(output);
      stream.on('data', (data) => {
      result1 += JSON.stringify(data, undefined, 2)
      })

      rdf.waitFor(stream).then(() => {
        editor.setValue('')
        editor.setValue(result1)
        editorAvailable = true;
      })
      break;
    case "jsonld":
      result1 ='';
      //serialiser = new JsonLdSerializer({output: "string"});
      serialiser = new SerializerJsonld({output: "string"});
      stream = serialiser.import(output);
      stream.on('data', (data) => {
      result1 += JSON.stringify(data, undefined, 2)
      })

      rdf.waitFor(stream).then(() => {
        editor.setValue('')
        editor.setValue(result1)
        editorAvailable = true;
      })

      //stream.on('end', () => {
      //editor.setValue('')
      //editor.setValue('Hello ' + result1)
      //editorAvailable = true;
      //});
      break;
    default:
      editor.setValue(inputText)
      editorAvailable = true;
  }
  editorAvailable = true;
  return 
  }


  function addData(data){
    editor.setValue(data)
  }


function getSubjects(){

let subjects = new Set();
  graphStore.forEach((g_quad) => {subjects.add(g_quad.subject.value)});
  if(debug){console.log("Subjects:  ", subjects)}
 subjectsList = Array.from(subjects);
 if(debug){console.log(subjectsList)}
 document.querySelector("#subjectsSel select").innerHTML=""
 for(let i of subjectsList){document.querySelector("#subjectsSel select").add(new Option(i))}

}


function findTriplesForObject(objectNodeValue){
  let onvs = objectNodeValue.toString()
  subjectNodes = []
  let nn0 = graphStore.match(rdf.namedNode(onvs)).toArray()
  let nn = nn0.concat(graphStore.match(rdf.blankNode(onvs)).toArray())

  graphStore.forEach((g_quad) => {

    if(g_quad.object.value.toString() == onvs) {

      subjectNodes.push(g_quad.subject.value)

    }
});
alert("Matching Subjects:\n" +  subjectNodes.join('\r\n'))
}

function createLegend(){
    var legend = ''
    legend += 'subgraph legend {rankdir="TD" rank="min" LABEL_1 [shape="box" style="dashed" margin=0   label="'
    Object.keys(myprefixes).forEach(function(item){legend += item + ":   " + myprefixes[item] + " \\l" })
    legend += "\" ];}"
return legend
}


function createDot(selectedSubjects){
  let value1 = '';
  for ( let ss of selectedSubjects) {
    value1 += '   "' + shrink(ss) +   '"  [URL="javascript:findTriplesForObject([\'' + ss  + '\'])" ];\n ';
  let nn = graphStore.match(rdf.namedNode(ss)).toArray()
  for(let g_quad of nn ) {
    if(g_quad.object.termType === "Literal") {
      value1 += '  "' + shrink(ss) + '" -> "' + g_quad.object.value + '"  [label="' + shrink(g_quad.predicate.value) + '"];\n '
      value1 += '   "' + shrink(g_quad.object.value) + '"  [color="blue" ];\n '
      value1 += '   "' + shrink(g_quad.object.value) +   '"  [URL="javascript:findTriplesForObject([\'' + g_quad.object.value.replace(patt,"&amp;")  + '\'])" ];\n ';  
     } else 
     if(g_quad.object.termType === "BlankNode") {
      value1 += '  "' + shrink(ss) + '" -> "' + g_quad.object.value + '"  [label="' + shrink(g_quad.predicate.value) + '"];\n '
      value1 += '   "' + shrink(g_quad.object.value) + '"  [color="orange" ];\n '
      value1 += '   "' + shrink(g_quad.object.value) +   '"  [URL="javascript:findTriplesForObject([\'' + g_quad.object.value.replace(patt,"&amp;")   + '\'])" ];\n '; 
     } else
     if(document.querySelector("#type input").checked)
     {if(g_quad.predicate.value === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type") { }
     else {
     value1 += '  "' + shrink(ss) + '" -> "' + shrink(g_quad.object.value) + '"  [label="' + shrink(g_quad.predicate.value) + '"];\n '
     value1 += '   "' + shrink(g_quad.object.value) +   '"  [URL="javascript:findTriplesForObject([\'' + g_quad.object.value.replace(patt,"&amp;")   + '\'])" ];\n '; 
    }
  }
    else
    {
      value1 += '  "' + shrink(ss) + '" -> "' + shrink(g_quad.object.value) + '"  [label="' + shrink(g_quad.predicate.value) + '"];\n '
      value1 += '   "' + shrink(g_quad.object.value) +   '"  [URL="javascript:findTriplesForObject([\'' + g_quad.object.value.replace(patt,"&amp;")   + '\'])" ];\n '; 
     }
  }
  let nb = graphStore.match(rdf.blankNode(ss)).toArray()
  for(let g_quad of nb ) {
    if(g_quad.object.termType === "Literal") {
     value1 += '  "' + shrink(ss) + '" -> "' + shrink(g_quad.object.value) + '"  [label="' + shrink(g_quad.predicate.value) + '"];\n '
     value1 += '   "' + shrink(g_quad.object.value) + '"  [color="blue" ];\n '
     value1 += '   "' + shrink(ss) + '"  [color="orange" ];\n '
     value1 += '   "' + shrink(g_quad.object.value) +   '"  [URL="javascript:findTriplesForObject([\'' + g_quad.object.value.replace(patt,"&amp;")   + '\'])" ];\n '; 
    } else
    if(document.querySelector("#type input").checked)
    {if(g_quad.predicate.value === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type") { }
    else {
      value1 += '  "' + shrink(ss) + '" -> "' + shrink(g_quad.object.value) + '"  [label="' + shrink(g_quad.predicate.value) + '"];\n ';
      value1 += '   "' + shrink(ss) + '"  [color="orange" ];\n ';
      value1 += '   "' + shrink(g_quad.object.value) +   '"  [URL="javascript:findTriplesForObject([\'' + g_quad.object.value.replace(patt,"&amp;")   + '\'])" ];\n '; 
    }
  }
else  
    {
    value1 += '  "' + shrink(ss) + '" -> "' + shrink(g_quad.object.value) + '"  [label="' + shrink(g_quad.predicate.value) + '"];\n ';
    value1 += '   "' + shrink(ss) + '"  [color="orange" ];\n ';
    value1 += '   "' + shrink(g_quad.object.value) +   '"  [URL="javascript:findTriplesForObject([\'' + g_quad.object.value.replace(patt,"&amp;")   + '\'])" ];\n '; 
  }
     
  }
}

  if(debug){console.log("value1",value1)}
  if(document.querySelector("#prefix input").checked){
  dotText = 'digraph { node [shape="box", style="rounded"]; rankdir="LR"; ratio="auto";  subgraph RDF {' + value1 + '} ' + createLegend() + ' }';
  }
  else{
    dotText = 'digraph { node [shape="box", style="rounded"]; rankdir="LR"; ratio="auto";  subgraph RDF {' + value1 + '}  }';
    }

  if(debug){console.log("dotText",dotText)}
  value1='';
  updateGraph(dotText)
}


function clearNode(id){
{
const myNode = document.getElementById(id);
while (myNode.firstChild) {
  myNode.removeChild(myNode.lastChild);
}
}
}

function handleprefixes(prefix, namespace) {
  myprefixes[prefix] = namespace.value ;
  //if(debug){console.log(myprefixes)}
}

var go = function(){
let count = false;
if(debug){console.log("go")}
//graphStore =  new rdf.dataset();
graphStore =  new rdfdi();
let inputText = editor.getValue()
if(inputText.trim().toLowerCase().startsWith('digraph')) {
    document.querySelector("#lang select").value = "dot";
    dotText=inputText; 
    updateGraph(); 
    return
}
else if(inputText.trim().startsWith('<') && document.querySelector("#lang select").value != "turtle" && document.querySelector("#lang select").value != "javascript") {
  document.querySelector("#error").innerHTML="this is an XML file";
  document.querySelector("#lang select").value = "xml";
  let input = new Readable({
    read: () => {
      input.push(inputText)
      input.push(null)
    }
  });
  //RdfXmlParser()
  //const myParser = new RdfXmlParser.RdfXmlParser({baseIRI: 'http://dummy.base.uri/'});
  //const myParser = rdfparse
  //const myParser = new rdfparse.RdfParser({contentType: "application/rdf+xml", baseURI: "http://my.dummy.uri"})
  let output = formats.parsers.import('application/rdf+xml', input, {baseIRI: `http://base.iri.org`} )
  subjectSet = new Set();
  output.on('data', quad => {
    if(quad.subject.termType === "BlankNode"  && count===false) {quad.subject.constructor.nextId = 0 ; count=true;}
    if(quad.object.termType === "BlankNode"  && count===false) {quad.object.constructor.nextId = 0 ; count=true;}
  graphStore.add(quad)
  subjectSet.add(quad.subject.value)
    
     if(debug){console.log("Quad: ", `quad: ${quad.subject.value} - ${quad.predicate.value} - ${quad.object.value}`)}
     if(debug){console.log("Canonical:  ", graphStore.toCanonical())}
  });
  
  output.on('prefix', (prefix, namespace) => {handleprefixes(prefix, namespace)
  });

  output.on('end', () => {
  //for(let _q of graphStore._quads){subjectSet.add(_q.subject.value);}
  graphStore.forEach((quad) => {subjectSet.add(quad.subject.value)})
  if(debug){console.log(subjectSet)}
  if(debug){console.log([...subjectSet])}
    if(debug){console.log("Subjects:  ", subjectSet)}
     subjectsList = Array.from(subjectSet);
     if(debug){console.log(subjectsList)}
     document.querySelector("#subjectsSel select").innerHTML=""
     for(let i of subjectsList){document.querySelector("#subjectsSel select").add(new Option(i))}
  });
  
  output.on('error', () => {
    document.querySelector("#error").innerHTML="#1: There was an error in parsing but no further detail.";
  });

  return
}

else if(inputText.trim().startsWith('{') || inputText.trim().startsWith('[') ) {
  document.querySelector("#error").innerHTML="this is an JSON-LD file";
  document.querySelector("#lang select").value = "javascript";
  let input = new Readable({
    read: () => {
      input.push(inputText)
      input.push(null)
    }
  });
 //JsonLdParser()r
  //const myParser = new jsonld();
  //const myParser = new rdfparse.RdfParser({contentType: "application/ld+json", baseURI: "http://my.dummy.uri"})
  if(debug){console.log(typeof(input))}
  let output = formats.parsers.import('application/ld+json', input, {baseIRI: `http://base.iri.org`} )
 // output.on('data', quad => {    console.log(quad)  }) 
 if(debug){console.log(typeof(output))}
  
  subjectSet = new Set();
  output.on('data', quad => {
    if(debug){console.log("HEYHEY")}
    if(debug){console.log(quad)}
    if(debug){console.log(quad.subject.termType)}
    if(debug){console.log(quad.object.termType)}
    if(quad.subject.termType === "BlankNode"  && count===false) {quad.subject.constructor.nextId = 0 ; count=true;}
    if(quad.object.termType === "BlankNode"  && count===false) {quad.object.constructor.nextId = 0 ; count=true;}
  graphStore.add(quad)
  subjectSet.add(quad.subject.value)
    
     if(debug){console.log("Quad: ", `quad: ${quad.subject.value} - ${quad.predicate.value} - ${quad.object.value}`)}
     if(debug){console.log("Canonical:  ", graphStore.toCanonical())}
  });
  
  output.on('prefix', (prefix, namespace) => {handleprefixes(prefix, namespace)
  });

  output.on('end', () => {
  //for(let _q of graphStore._quads){subjectSet.add(_q.subject.value);}
  graphStore.forEach((quad) => {subjectSet.add(quad.subject.value)})
  if(debug){console.log(subjectSet)}
  if(debug){console.log([...subjectSet])}
    if(debug){console.log("Subjects:  ", subjectSet)}
     subjectsList = Array.from(subjectSet);
     if(debug){console.log(subjectsList)}
     document.querySelector("#subjectsSel select").innerHTML=""
     for(let i of subjectsList){document.querySelector("#subjectsSel select").add(new Option(i))}
  });
  
  output.on('error', () => {
    document.querySelector("#error").innerHTML="#1: There was an error in parsing but no further detail.";
  });

  return
}

else {
  document.querySelector("#error").innerHTML="this is assumed to be a turtle file";
  document.querySelector("#lang select").value = "turtle";
let input = new Readable({
read: () => {
  input.push(inputText)
  input.push(null)
}
});

//parserN3

//let output = parserN3.import(input);  
//const myParser = new rdfparse.RdfParser.default
//let output = myParser.parse(input, {contentType: "text/turtle"})
if(debug){console.log(typeof(input))}
let output = formats.parsers.import('text/turtle', input, {baseIRI: `http://base.iri.org`} )

subjectSet = new Set();
output.on('data', quad => {
  if(debug){console.log("HOHO")}
  if(debug){console.log(quad)}
  if(quad.subject.termType === "BlankNode"  && count===false) {quad.subject.constructor.nextId = 0 ; count=true;}
  if(quad.object.termType === "BlankNode"  && count===false) {quad.object.constructor.nextId = 0 ; count=true;}
graphStore.add(quad)
subjectSet.add(quad.subject.value)
 if(debug){console.log("Quad: ", `quad: ${quad.subject.value} - ${quad.predicate.value} - ${quad.object.value}`)}
 if(debug){console.log("Canonical:  ", graphStore.toString())}
});

output.on('prefix', (prefix, namespace) => {handleprefixes(prefix, namespace)
});


output.on('end', () => {
graphStore.forEach((quad) => {subjectSet.add(quad.subject.value)})
if(debug){console.log(subjectSet)}
if(debug){console.log([...subjectSet])}

if(debug){console.log("Subjects:  ", subjectSet)}
 subjectsList = Array.from(subjectSet);
 if(debug){console.log(subjectsList)}
 document.querySelector("#subjectsSel select").innerHTML=""
 for(let i of subjectsList){document.querySelector("#subjectsSel select").add(new Option(i))}
});

output.on('error', () => {
  document.querySelector("#error").innerHTML="#2: There was an error in parsing but no further detail.";
});
}
}




/*****************************/

    function updateGraph() {
      if(debug){console.log(dotText)};
      if(dotText===''){
        dotText=editor.getSession().getDocument().getValue()
      }
      else{dotText = dotText}
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
      if(editorAvailable === false){return}
      //updateGraph();
      if(editor.getValue().trim().toLowerCase().startsWith('digraph')) { go();}
      else {
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

    document.querySelector("#type input").addEventListener("change", function() {
      createDot([...document.querySelector("#subs").options].filter(option => option.selected).map(option => option.value));
    });
    updateGraph();

