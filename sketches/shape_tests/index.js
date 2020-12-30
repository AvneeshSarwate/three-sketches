const urlParams = new URLSearchParams(window.location.search);
let sketchId = urlParams.get("id");

let sketchFile = `./sketch${sketchId}.js`


import(sketchFile).then(Sketch => {
    Sketch.init();
    Sketch.animate();
});

