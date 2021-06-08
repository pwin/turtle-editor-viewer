# turtle-editor-viewer
ace.js and viz.js editor/viewer for both dot files and turtle RDF files.

## Purpose
To be able to edit an RDF file and to see the subjects and the blank nodes drawn out using dot and graphviz.  The images can be saved as SVG or as PNG

The editor is able to work with RDF in either Turtle or in RDF/XML.  There is some conversion functionality, but this needs to be improved.

Sources can be brought in either by copy and paste into the left-hand code editing window, or by opening a local file using the button at the top of the graphics pane, or by using a querystring argument (see below)

Edited text in the left hand pane can be downloaded to the local system using the button at the top of the menu bar

## Some tips
-	you can get the raw SVG of the image and embed that in an HTML page - there is a "raw" tickbox
-	by changing the image to a PNG using the "Fmt:" dropdown you have a format that can be copied or saved to file usi shortcut menus
-	using the “?dot=” you can bring in a turtle or a graphviz dot file from any server that is cors compliant.  For example, this link loads a graphviz dot file - [http://semantechs.co.uk/turtle-editor-viewer/?dot=https://raw.githubusercontent.com/pwin/model-viewer/master/dot_files/DCAT_v2_summary.dot](http://semantechs.co.uk/turtle-editor-viewer/?dot=https://raw.githubusercontent.com/pwin/model-viewer/master/dot_files/DCAT_v2_summary.dot) and this link loads an RDF turtle file - [http://semantechs.co.uk/turtle-editor-viewer/?dot=https://raw.githubusercontent.com/w3c/dxwg/gh-pages/dcat/rdf/dcat3.ttl](http://semantechs.co.uk/turtle-editor-viewer/?dot=https://raw.githubusercontent.com/w3c/dxwg/gh-pages/dcat/rdf/dcat3.ttl)


## Try it
[Try it out here](http://semantechs.co.uk/turtle-editor-viewer)
