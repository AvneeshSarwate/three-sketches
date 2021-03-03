import * as THREE from "../../node_modules/three/build/three.module.js";
import Stats from "../../node_modules/three/examples/jsm/libs/stats.module.js";
import header_code from "../../header_frag.js";
//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];

let camera, renderer, stats, sceneInfo, time;
const startTime = Date.now()/1000;

function createScene() {
    let circle = new THREE.CircleBufferGeometry(0.2, 10, 10);

    let uniforms = {
        time: {value: 0}
    };

    let material = new THREE.ShaderMaterial({
        vertexShader: header_code + vertexShader,
        fragmentShader: header_code + uvShader,
        uniforms
    });

    let mesh = new THREE.Mesh(circle, material);

    let scene = new THREE.Scene();

    scene.add(mesh);

    return {scene, uniforms};
}

function init() {
    sceneInfo = createScene();

    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    const container = document.getElementById("container");

    stats = new Stats();
    container.appendChild(stats.dom);

    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
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

    time = Date.now()/1000 - startTime;
    sceneInfo.uniforms.time.value = time;
    renderer.render(sceneInfo.scene, camera);

    stats.update();
}

export {
    init,
    animate
}

let vertexShader = glsl`
varying vec2 vUv;

void main()	{

  vUv = uv;

  vec3 p = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

}`;

let uvShader = glsl`
varying vec2 vUv;

uniform float time;

void main()	{
    gl_FragColor = vec4(vUv, sinN(time), 1.);
}`;