import * as Sketch from "./sketches/moving_plane_shaded.js";
import * as twgl from "./twgl-full.js";

console.log("twgl import test", twgl.createFramebufferInfo);

Sketch.init();
Sketch.animate();
