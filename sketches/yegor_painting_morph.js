import * as THREE from "../three.module.js";
import Stats from "../stats.module.js";

let camera, scene, renderer, stats, texture;

let uniforms, mesh;

function init() {
  const container = document.getElementById("container");

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  scene = new THREE.Scene();

  const geometry = new THREE.PlaneBufferGeometry(0.8, 0.8);

  const painting_texture = new THREE.TextureLoader().load( "./sketches/yegor_painting.jpg" );

  uniforms = {
    time: { value: 1.0 },
    painting: {value: painting_texture}
  };

  const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader
  });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio / 2);
  container.appendChild(renderer.domElement);

  onWindowResize();

  stats = new Stats();
  container.appendChild(stats.dom);

  window.addEventListener("resize", onWindowResize, false);
}

function onWindowResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
}

//

function animate() {
  requestAnimationFrame(animate);

  let time = performance.now() / 1000;

  uniforms["time"].value = time;

  mesh.position.x = Math.sin(time) * 0.1;

  renderer.render(scene, camera);
  stats.update();
}

export { init, animate };

let vertexShader = `
varying vec2 vUv;

void main()	{

  vUv = uv;

  vec3 p = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

}`;

let fragmentShader = `
varying vec2 vUv;

uniform float time;
uniform sampler2D painting;

void main()	{

  gl_FragColor = texture(painting, vUv);

}
`;

/*
Tile the painting onto a bunch of rects, and then have those rects swap places with each other
- alternate row and column "rotation" of a randomly selected row/column
- tile and end flies backwards over its row/column, while simultaneously the rest move one step fwd

*/