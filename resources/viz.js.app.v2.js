// requires underscore
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
    editor.setTheme("ace/theme/cobalt");
    editor.session.setMode("ace/mode/turtle");
    editor.setValue(startupRDF);
    var graphStore =  new rdf.dataset();
    var parserN3 = new N3Parser();
    var rdfParser = new RdfXmlParser.RdfXmlParser();
    var subjectsList = [];
    var subjectSet;
    var dotText = '';
    //import * as RdfXmlParser from '../js/rdfjs/rdfxml-streaming-parser.js'
    

    //observe the subjectsList array and update the dropdown
   // _.observe(subjectsList, function() {
   //     alert('something happened');
  //  });


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
                editor.session.setMode("ace/mode/javascript");
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

function getRDF(){
    graphStore =  new rdf.dataset();
    let inputText = editor.getValue()
    if(inputText.toLowerCase().startsWith('digraph')) {
        alert("this is a dot file");
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


function getSubjects(){

let subjects = new Set();
    for(let _q of graphStore._quads){subjects.add(_q.subject.value)}
    if(debug){console.log("Subjects:  ", subjects)}
   subjectsList = Array.from(subjects);
   if(debug){console.log(subjectsList)}
   document.querySelector("#subjectsSel select").innerHTML=""
   for(let i of subjectsList){document.querySelector("#subjectsSel select").add(new Option(i))}
   //createDot()
}


function createDot(selectedSubjects){
    let value1 = '';
    for ( let ss of selectedSubjects) {
    let nn = graphStore.match(rdf.namedNode(ss)).toArray()
    for(let g_quad of nn ) {
       value1 += '  "' + ss + '" -> "' + g_quad.object.value + '"  [label="' + g_quad.predicate.value + '"];\n '
    }
    let nb = graphStore.match(rdf.blankNode(ss)).toArray()
    for(let g_quad of nb ) {
       value1 += '  "' + ss + '" -> "' + g_quad.object.value + '"  [label="' + g_quad.predicate.value + '"];\n '
    }  
    }
    if(debug){console.log("value1",value1)}
    dotText = 'digraph { node [style="rounded"]; rankdir="LR"; ratio="auto"; ' + value1 + ' }';
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
  alert("go");
  graphStore =  new rdf.dataset();
  let inputText = editor.getValue()
  if(inputText.trim().toLowerCase().startsWith('digraph')) {
      alert("this is a dot file");
      document.querySelector("#lang select").value = "dot";
      dotText=inputText; 
      updateGraph(); 
      return
  }
  else if(inputText.trim().startsWith('<')) {
    alert("this is an XML file dot file");
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
      alert("there was an error in parsing but no further detail.")
    });

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
  alert("there was an error in parsing but no further detail.")
});
}
}




/*****************************/



function updateGraph(dotText){

let viz = new Viz({ workerURL: '/turtle-editor-viewer/js/viz.js/lite.render.js' });
let params = {
      engine: document.querySelector("#engine select").value,
      format: document.querySelector("#format select").value
  };

let result = viz.renderSVGElement(dotText, params)    
//var result = viz.postMessage(params)
.then(function(result) {
    updateOutput(result);
})
.catch(error => {
  // Create a new Viz instance (@see Caveats page for more info)
  //viz = new Viz();

  // Possibly display the error
  console.error(error);
  });

}



function updateOutput(result) {

    var myParser = new DOMParser();
    var myGraph = document.querySelector("#output");

    var svg = myGraph.querySelector("svg");
    if (svg) {
        myGraph.removeChild(svg);
    }

    var text = myGraph.querySelector("#text");
    if (text) {
        myGraph.removeChild(text);
    }

    var img = myGraph.querySelector("img");
    if (img) {
        myGraph.removeChild(img);
    }

    if (!result) {
      return;
    }

    if (document.querySelector("#format select").value == "svg" && !document.querySelector("#raw input").checked) {

      result.id = "svg_output";
      if(debug){console.log(result)}
      myGraph.appendChild(result);

      
      panZoom = svgPanZoom(result, {
        zoomEnabled: true,
        controlIconsEnabled: true,
        fit: true,
        center: true,
        minZoom: 0.1
      });

      result.addEventListener('paneresize', function(e) {
        panZoom.resize();
      }, false);
      window.addEventListener('resize', function(e) {
        panZoom.resize();
      });
      
    } else if (document.querySelector("#format select").value == "png-image-element") {
      var image = Viz.svgXmlToPngImageElement(result);
      myGraph.appendChild(image);
    } else {
      var text = document.createElement("div");
      text.id = "text";
      text.appendChild(document.createTextNode(result));
      myGraph.appendChild(text);
    }
  
  }



/****
    var parser = new DOMParser();
    var worker;
    var result;

    function updateGraph() {
      if (worker) {
        worker.terminate();
      }

      document.querySelector("#output").classList.add("working");
      document.querySelector("#output").classList.remove("error");

      //worker = new Worker("/js/viz.js/full.render.js");
      const workerURL = '/js/viz.js/lite.render.js';
      worker = new Worker(workerURL);

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
        console.log(result)
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
      updateGraph();
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
*****/

