import * as Sketch from "./sketches/moving_plane_shaded.js";
import * as twgl from "./twgl-full.js";

// Write Javascript code!
const appDiv = document.getElementById("app");
appDiv.innerHTML = `<h1>JS Starterrrrr</h1>`;

console.log("twgl import test", twgl.createFramebufferInfo);

Sketch.init();
Sketch.animate();
