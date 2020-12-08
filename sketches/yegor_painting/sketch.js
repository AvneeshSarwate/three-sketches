import * as THREE from "../../three.module.js";
import Stats from "../../stats.module.js";

let camera, scene, renderer, stats;

let startTime = performance.now()/1000;
let uniforms, time;

let gridSize = Math.floor(4 + (1- Math.random()**2)*36);

let lerp = (v1, v2, a) => (1 - a) * v1 + a * v2;
let sinN = n => (Math.sin(n)+1/2);

function createTile(i, j, gridSize, referenceMaterial, painting_texture) {
    let tileSize = 2 / gridSize * 0.9;
    const geometry = new THREE.CircleBufferGeometry(tileSize, 32);
    const newMaterial = referenceMaterial.clone();

    newMaterial.uniforms.xInd = { value: i };
    newMaterial.uniforms.yInd = { value: j };
    newMaterial.uniforms.gridSize = { value: gridSize };
    newMaterial.uniforms.painting = { value: painting_texture };

    let tileMesh = new THREE.Mesh(geometry, newMaterial);
    let xRoot = tileMesh.position.x = lerp(-1, 1, i / gridSize) + tileSize / 2;
    let yRoot = tileMesh.position.y = lerp(-1, 1, j / gridSize) + tileSize / 2;
    tileMesh.position.z = 0;

    let cellPhase = Math.random()*Math.PI*2;
    let dev = Math.random() * 5;

    tileMesh.onBeforeRender = function(renderer, scene, camera, geometry, material, group){
        tileMesh.position.x = xRoot + Math.cos(time + cellPhase)*(1/gridSize/2) * dev;
        tileMesh.position.y = yRoot + Math.cos(time + cellPhase)*(1/gridSize/2) * dev;
        tileMesh.scale.x = tileMesh.scale.y = 0.5 + sinN(time * dev);
    }

    return tileMesh;
}

function init() {
    const container = document.getElementById("container");

    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    scene = new THREE.Scene();

    const painting_texture = new THREE.TextureLoader().load("./yegor_painting.jpg");

    uniforms = {
        time: { value: 1.0 },
        xInd: { value: 0 },
        yInd: { value: 0 },
        gridSize: { value: 1 },
        painting: { value: painting_texture }
    };

    const material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    });

    let meshes = [];

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            meshes.push(createTile(i, j, gridSize, material, painting_texture));
        }
    }


    meshes.forEach(mesh => {
        mesh.renderOrder = Math.random();
        scene.add(mesh);
    });

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

    time = performance.now() / 1000 - startTime;

    uniforms.time.value = time;
    uniforms2.time.value = time;

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
uniform float xInd;
uniform float yInd;
uniform float gridSize;

float sinN(float n){
    return (sin(n)+1.)/2.;
}

void main()	{

  vec2 cellCoord = vec2(xInd/gridSize + vUv.x/gridSize, yInd/gridSize + vUv.y/gridSize);
  vec4 paintCell = texture(painting, cellCoord);

  gl_FragColor = paintCell;

}
`;

/*
Tile the painting onto a bunch of rects, and then have those rects swap places with each other
- alternate row and column "rotation" of a randomly selected row/column
- tile and end flies backwards over its row/column, while simultaneously the rest move one step fwd

*/