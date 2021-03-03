const urlParams = new URLSearchParams(window.location.search);
let sketchName = urlParams.get("id");

let sketchFile = `./${sketchName}.js`


import(sketchFile).then(Sketch => {
    Sketch.init();
    Sketch.animate();
});

