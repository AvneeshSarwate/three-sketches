const urlParams = new URLSearchParams(window.location.search);
let sketchId = urlParams.get("id");

let sketchFile = './sketch.js'
if(sketchId == '2') sketchFile = './sketch2.js';
if(sketchId == '3') sketchFile = './sketch3.js';
if(sketchId == '4') sketchFile = './sketch4.js';
if(sketchId == '5') sketchFile = './sketch5.js';
if(sketchId == '6') sketchFile = './sketch6.js';
if(sketchId == '7') sketchFile = './sketch7.js';

import(sketchFile).then(Sketch => {
    Sketch.init();
    Sketch.animate();
});

