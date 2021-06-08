# turtle-editor-viewer
ace.js and viz.js editor/viewer for both dot files and turtle RDF files.

## Purpose
To be able to edit an RDF file and to see the subjects and the blank nodes drawn out using dot and graphviz.  The images can be saved as SVG or as PNG

## Some tips
-	you can get the raw SVG of the image and embed that in an HTML page - there is a "raw" tickbox
-	by changing the image to a PNG using the "Fmt:" dropdown you have a format that can be copied or saved to file usi shortcut menus
-	using the “?dot=” you can bring in a turtle or a graphviz dot file from any server that is cors compliant.  For example, this link loads a graphviz dot file - [http://semantechs.co.uk/turtle-editor-viewer/?dot=https://raw.githubusercontent.com/pwin/model-viewer/master/dot_files/DCAT_v2_summary.dot](http://semantechs.co.uk/turtle-editor-viewer/?dot=https://raw.githubusercontent.com/pwin/model-viewer/master/dot_files/DCAT_v2_summary.dot) and this link loads an RDF turtle file - [http://semantechs.co.uk/turtle-editor-viewer/?dot=https://raw.githubusercontent.com/w3c/dxwg/gh-pages/dcat/rdf/dcat3.ttl](http://semantechs.co.uk/turtle-editor-viewer/?dot=https://raw.githubusercontent.com/w3c/dxwg/gh-pages/dcat/rdf/dcat3.ttl)


## Try it
[Try it out here](http://semantechs.co.uk/turtle-editor-viewer)
