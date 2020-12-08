import * as THREE from "../../three.module.js";
import Stats from "../../stats.module.js";

//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];

let camera, scene, renderer, stats;

let startTime = performance.now()/1000;
let uniforms, time;

let gridSize = 20; Math.floor(4 + (1- Math.random()**2)*36);


function init() {
    const container = document.getElementById("container");

    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene = new THREE.Scene();

    const tileSize = 1 / gridSize * 0.98;

    let geometry = new THREE.CircleGeometry(tileSize, 32);
    // let geometry = new THREE.PlaneBufferGeometry(2/gridSize, 2/gridSize);
    // let geometry = new THREE.SphereBufferGeometry(tileSize, 10, 10);

    window.geometry = geometry;

    const geometryInstanced = new THREE.InstancedBufferGeometry();

    const painting_texture = new THREE.TextureLoader().load("../../yegor_painting.jpg");

    uniforms = {
        time: { value: 1.0 },
        gridSize: { value: gridSize },
        painting: { value: painting_texture }
    };

    const material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    });

    // let positions = geometry.attributes.position.array;
    let xIndices = [];
    let yIndices = [];

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            xIndices.push(i);
            yIndices.push(j);
        }
    }

    geometryInstanced.fromGeometry(geometry);
    // geometryInstanced.setAttribute('position', geometry.attributes.position);
    // geometryInstanced.setAttribute('normal', geometry.attributes.normal);
    // geometryInstanced.setAttribute('uv', geometry.attributes.uv);
    geometryInstanced.setAttribute('xInd', new THREE.InstancedBufferAttribute(new Float32Array(xIndices), 1))
    geometryInstanced.setAttribute('yInd', new THREE.InstancedBufferAttribute(new Float32Array(yIndices), 1))

    const mesh = new THREE.Mesh(geometryInstanced, material);
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

function animate() {
    requestAnimationFrame(animate);

    time = performance.now() / 1000 - startTime;
    uniforms.time.value = time;

    renderer.render(scene, camera);
    stats.update();
}

export { init, animate };

let vertexShader = glsl`
varying vec2 vUv;
varying float xInd_v;
varying float yInd_v;

attribute float xInd;
attribute float yInd;

uniform float gridSize;
uniform float time;

//convert grid index of circle geometry to normalized circle position
float ind2pos(float i){
    return mix(-1., 1., i/gridSize) + 1./gridSize;
}

float sinN(float n){ return (sin(n)+1.)/2.;}

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

void main()	{
    float scale = 1. + sinN(time);
    vUv = uv*scale - (scale - 1.)/2.;

    float indN = (xInd*gridSize + yInd)/(gridSize*gridSize);
    float randN = rand(vec2(xInd, yInd));

    vec3 dev = vec3(ind2pos(xInd), ind2pos(yInd), 0.);
    vec3 dev_debug = vec3(mix(-.1, .1, xInd/gridSize), mix(-.1, .1, yInd/gridSize), 0.);
    vec3 dev_debug2 =  vec3(sin(time+indN*3.1415), cos(time+indN*3.1415), 0)*0.1;

    vec3 motion = vec3(sin(time*(1.+randN*1.)), cos(time*(1.+randN*1.)), 0)*3./gridSize*0.;

    vec3 p = position*scale + dev + mix(motion, vec3(0), pow(sinN(time+yInd/gridSize*3.1415), 6.));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0 );

    xInd_v = xInd;
    yInd_v = yInd;
}`;

let fragmentShader = glsl`
varying vec2 vUv;
varying float xInd_v;
varying float yInd_v;

uniform float time;
uniform sampler2D painting;
uniform float gridSize;

float sinN(float n){
    return (sin(n)+1.)/2.;
}

void main()	{

    vec2 uv = mix(vUv, (vUv-.5) * 1., sinN(time)*0.);
    vec2 cellCoord = vec2(xInd_v/gridSize + uv.x/gridSize, yInd_v/gridSize + uv.y/gridSize);
    vec4 paintCell = texture(painting, cellCoord);
    vec4 debugColor = vec4(xInd_v/gridSize, yInd_v/gridSize, 0.5, 1);
    vec4 debugColor2 = vec4(cellCoord.x, cellCoord.y, 0.5, 1);

    gl_FragColor = paintCell;

}
`;

/*
Tile the painting onto a bunch of rects, and then have those rects swap places with each other
- alternate row and column "rotation" of a randomly selected row/column
- tile and end flies backwards over its row/column, while simultaneously the rest move one step fwd

*/