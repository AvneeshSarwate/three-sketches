import * as THREE from "../../three.module.js";
import Stats from "../../stats.module.js";
import header_code from "../../header_frag.js";

let camera, paintingScene, warpScene, renderer, stats;

let startTime = performance.now()/1000;
let uniforms, uniforms2, time;

let backgroundTexture = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
let alphaTexture = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];

let gridSize = 30;

let lerp = (v1, v2, a) => (1 - a) * v1 + a * v2;
let sinN = n => (Math.sin(n)+1/2);

function createTile(i, j, gridSize, referenceMaterial, painting_texture) {
    let tileSize = 1 / gridSize * 2;
    const geometry = new THREE.CircleBufferGeometry(tileSize, 32);
    const newMaterial = referenceMaterial.clone();

    newMaterial.uniforms.xInd = { value: i };
    newMaterial.uniforms.yInd = { value: j };
    newMaterial.uniforms.gridSize = { value: gridSize };
    newMaterial.uniforms.painting = { value: painting_texture };
    newMaterial.uniforms.tileSize = { value: tileSize}

    let tileMesh = new THREE.Mesh(geometry, newMaterial);
    let xRoot = tileMesh.position.x = lerp(-1, 1, i / gridSize) + 1/gridSize;
    let yRoot = tileMesh.position.y = lerp(-1, 1, j / gridSize) + 1/gridSize;
    tileMesh.position.z = 0;

    let cellPhase = Math.random()*Math.PI*2;
    let dev = (1 + Math.random()) * 1;

    tileMesh.onBeforeRender = function(renderer, scene, camera, geometry, material, group){
        tileMesh.position.x = xRoot + Math.cos(time + cellPhase)*(1/gridSize/2) * dev;
        tileMesh.position.y = yRoot + Math.sin(time + cellPhase)*(1/gridSize/2) * dev;
        tileMesh.scale.x = tileMesh.scale.y = 1; 0.6 + sinN(time * dev)*0.5;
    }

    return tileMesh;
}

function createPaintingSamplerScene() {
    paintingScene = new THREE.Scene();

    const painting_texture = new THREE.TextureLoader().load("../../yegor_painting.jpg");

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
        fragmentShader: paintingSamplingShader
    });

    let meshes = [];

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            meshes.push(createTile(i, j, gridSize, material, painting_texture));
        }
    }


    meshes.forEach(mesh => {
        // mesh.renderOrder = Math.random();
        paintingScene.add(mesh);
    });
}

function createPlaneSamplingScene(){
    warpScene = new THREE.Scene();
    const planeGeometry = new THREE.PlaneBufferGeometry(2, 2, 2);
    uniforms2 = {
        time: {value : 0},
        scene: {value: backgroundTexture.texture}
    }
    let samplingMaterial = new THREE.ShaderMaterial({
        uniforms: uniforms2,
        vertexShader: vertexShader,
        fragmentShader: header_code + textureWarpShader
    });
    let planeMesh = new THREE.Mesh(planeGeometry, samplingMaterial);
    warpScene.add(planeMesh);

}

function init() {
    const container = document.getElementById("container");

    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    createPaintingSamplerScene();
    createPlaneSamplingScene();

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
    backgroundTexture.setSize(window.innerWidth, window.innerHeight);
}

//

function animate() {
    requestAnimationFrame(animate);

    time = performance.now() / 1000 - startTime;

    uniforms.time.value = time;
    uniforms2.time.value = time;

    renderer.setRenderTarget(backgroundTexture);
    renderer.render(paintingScene, camera);

    renderer.setRenderTarget(null);
    renderer.render(warpScene, camera);

    stats.update();
}

export { init, animate };

let vertexShader = glsl`
varying vec2 vUv;

void main()	{

  vUv = uv;

  vec3 p = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

}`;

let paintingSamplingShader = glsl`
varying vec2 vUv;

uniform float time;
uniform sampler2D painting;
uniform float xInd;
uniform float yInd;
uniform float gridSize;
uniform float tileSize;

void main()	{

    vec2 uv = vUv;
    float gridShift = -1./gridSize/2.;
    vec2 cellCoord = vec2(xInd/gridSize + gridShift + uv.x*tileSize, yInd/gridSize + gridShift + uv.y*tileSize);
    vec4 paintCell = texture(painting, cellCoord);

    gl_FragColor = paintCell;

}
`;

let textureWarpShader = glsl`
varying vec2 vUv;

uniform float time;
uniform sampler2D scene;

void main()	{
    float tm = time * 0.5;
    vec2 sinT = vec2(pow(sinN(time), 5.), pow(sinN(time+PI), 5.));
    vec2 uv = vec2(quant(vUv.x, 1000.*sinT.x+20.), quant(vUv.y, 1000.*sinT.y+20.));
    vec3 colorTint = vec3(1); vec3(sinN(tm), sinN(-tm*0.39+1.+vUv.x*4.5), sinN(tm*0.95+3.));
    vec3 samp = texture(scene, uv).rgb * colorTint;
    gl_FragColor = vec4(samp, 1);

}
`;

/*
Tile the painting onto a bunch of rects, and then have those rects swap places with each other
- alternate row and column "rotation" of a randomly selected row/column
- tile and end flies backwards over its row/column, while simultaneously the rest move one step fwd

*/