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
    contact:personalTitle "Dr.".

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
## this pane and proceed as above to review
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

    var graphStore =  new rdf.dataset();
    var parserN3 = new N3Parser();
    var rdfParser = new RdfXmlParser.RdfXmlParser();
    var subjectsList = [];
    var subjectSet;
    var dotText = '';
    //const element = document.querySelector('#subs');
    //const choices = new Choices(element);    
    
    var beforeUnloadMessage = null;

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
      myParser = new RdfXmlParser.RdfXmlParser();
    }
    else if(inputText.trim().startsWith('{') || inputText.trim().startsWith('[') )
    {
      myParser = new JsonLdParser();
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
      serialiser = new JsonLdSerializer({output: "string"});
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


/*
function getRDF(){
  graphStore =  new rdf.dataset();
  let inputText = editor.getValue()
  if(inputText.toLowerCase().startsWith('digraph')) {
      if(debug){alert("this is a dot file")}
      document.querySelector("#lang select").value = "dot";
      dotText=inputText; 
      updateGraph(); 
      return
  }
  else{
  let input = new Readable({
  read: () => {
    input.push(inputText)
    input.push(null)
  }
});
 let output = parserN3.import(input);

 output.on('data', quad => {
  graphStore.add(quad)
   if(debug){console.log("Quad: ", `quad: ${quad.subject.value} - ${quad.predicate.value} - ${quad.object.value}`)}
   if(debug){console.log("Canonical:  ", graphStore.toCanonical())}
});
}
}
*/

function getSubjects(){

let subjects = new Set();
  for(let _q of graphStore._quads){subjects.add(_q.subject.value)}
  if(debug){console.log("Subjects:  ", subjects)}
 subjectsList = Array.from(subjects);
 if(debug){console.log(subjectsList)}
 document.querySelector("#subjectsSel select").innerHTML=""
 for(let i of subjectsList){document.querySelector("#subjectsSel select").add(new Option(i))}

}


function createDot(selectedSubjects){
  let value1 = '';
  for ( let ss of selectedSubjects) {
  let nn = graphStore.match(rdf.namedNode(ss)).toArray()
  for(let g_quad of nn ) {
    if(g_quad.object.termType === "Literal") {
      value1 += '  "' + ss + '" -> "' + g_quad.object.value + '"  [label="' + g_quad.predicate.value + '"];\n '
      value1 += '   "' + g_quad.object.value + '"  [color="blue" ];\n '
     } else
     {value1 += '  "' + ss + '" -> "' + g_quad.object.value + '"  [label="' + g_quad.predicate.value + '"];\n '}
  }
  let nb = graphStore.match(rdf.blankNode(ss)).toArray()
  for(let g_quad of nb ) {
    if(g_quad.object.termType === "Literal") {
     value1 += '  "' + ss + '" -> "' + g_quad.object.value + '"  [label="' + g_quad.predicate.value + '"];\n '
     value1 += '   "' + g_quad.object.value + '"  [color="blue" ];\n '
    } else
    {value1 += '  "' + ss + '" -> "' + g_quad.object.value + '"  [label="' + g_quad.predicate.value + '"];\n '}
     
  }
}
  if(debug){console.log("value1",value1)}
  dotText = 'digraph { node [shape="box", style="rounded"]; rankdir="LR"; ratio="auto"; ' + value1 + ' }';
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



var go = function(){
if(debug){console.log("go")}
graphStore =  new rdf.dataset();
let inputText = editor.getValue()
if(inputText.trim().toLowerCase().startsWith('digraph')) {
    document.querySelector("#lang select").value = "dot";
    dotText=inputText; 
    updateGraph(); 
    return
}
else if(inputText.trim().startsWith('<') && document.querySelector("#lang select").value != "turtle" && document.querySelector("#lang select").value != "javascript") {
  document.querySelector("#error").innerHTML="this is an XML file dot file";
  document.querySelector("#lang select").value = "xml";
  let input = new Readable({
    read: () => {
      input.push(inputText)
      input.push(null)
    }
  });
  const myParser = new RdfXmlParser.RdfXmlParser();

  let output = myParser.import(input);
  subjectSet = new Set();
  output.on('data', quad => {
  graphStore.add(quad)
  subjectSet.add(quad.subject.value)
    
     if(debug){console.log("Quad: ", `quad: ${quad.subject.value} - ${quad.predicate.value} - ${quad.object.value}`)}
     if(debug){console.log("Canonical:  ", graphStore.toCanonical())}
  });
  
  output.on('end', () => {
  for(let _q of graphStore._quads){subjectSet.add(_q.subject.value);}
  if(debug){console.log(subjectSet)}
  if(debug){console.log([...subjectSet])}
      //for(let _q of graphStore._quads){subjectSet.add(_q.subject.value); console.log(_q.subject.value)}
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
  const myParser = new JsonLdParser();

  let output = myParser.import(input);

  subjectSet = new Set();
  output.on('data', quad => {
    if(debug){console.log(quad)}
  graphStore.add(quad)
  subjectSet.add(quad.subject.value)
    
     if(debug){console.log("Quad: ", `quad: ${quad.subject.value} - ${quad.predicate.value} - ${quad.object.value}`)}
     if(debug){console.log("Canonical:  ", graphStore.toCanonical())}
  });
  
  output.on('end', () => {
  //graphStore.addQuads(output);
  for(let _q of graphStore._quads){subjectSet.add(_q.subject.value);}
  if(debug){console.log(subjectSet)}
  if(debug){console.log([...subjectSet])}
      //for(let _q of graphStore._quads){subjectSet.add(_q.subject.value); console.log(_q.subject.value)}
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

//parserN3._resetBlankNodeIds();
let output = parserN3.import(input);
prefixes = {};

subjectSet = new Set();
output.on('data', quad => {
graphStore.add(quad)
subjectSet.add(quad.subject.value)

 if(debug){console.log("Quad: ", `quad: ${quad.subject.value} - ${quad.predicate.value} - ${quad.object.value}`)}
 if(debug){console.log("Canonical:  ", graphStore.toCanonical())}
});

output.on('end', () => {
//graphStore.addQuads(output);
for(let _q of graphStore._quads){subjectSet.add(_q.subject.value);}
if(debug){console.log(subjectSet)}
if(debug){console.log([...subjectSet])}
  //for(let _q of graphStore._quads){subjectSet.add(_q.subject.value); console.log(_q.subject.value)}
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

      if (params.options.format == "png-image-element") {
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
      } else if (document.querySelector("#format select").value == "png-image-element") {
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

    updateGraph();

