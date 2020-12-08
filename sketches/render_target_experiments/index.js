const urlParams = new URLSearchParams(window.location.search);
let sketchId = urlParams.get("id");

let sketchFile = './sketch.js'

import(sketchFile).then(Sketch => {
    Sketch.init();
    Sketch.animate();
});

