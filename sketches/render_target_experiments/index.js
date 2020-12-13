const urlParams = new URLSearchParams(window.location.search);
let sketchId = urlParams.get("id");

let sketchFile = './sketch.js'
if(sketchId == '2') sketchFile = './sketch2.js';
if(sketchId == '3') sketchFile = './sketch3.js';

import(sketchFile).then(Sketch => {
    Sketch.init();
    Sketch.animate();
});

