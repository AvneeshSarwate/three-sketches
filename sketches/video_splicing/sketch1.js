import * as THREE from "../../three.module.js";
import Stats from "../../stats.module.js";
import header_code from "../../header_frag.js";

//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];


let pCam, oCam, feedbackScene, passthruScene, renderer, stats;
let feedbackUniforms, passthruUniforms;

let feedbackTargets = [0,1].map(() => new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight));
let fdbkInd = 0;

let time;
let startTime = performance.now()/1000;

function createFeedbackScene(){
    let plane = new THREE.PlaneBufferGeometry(2, 2);

    feedbackUniforms = {
        backbuffer: { value: feedbackTargets[0].texture},
        scene:      { value: warpSceneTarget.texture},
        depth:      { value: warpSceneTarget.depthTexture},
        time :      { value : 0}
    } 

    let feedbackMaterial = new THREE.ShaderMaterial({
        uniforms: feedbackUniforms,
        vertexShader: vertexShader,
        fragmentShader: header_code + feedbackShader
    });

    let feedbackMesh = new THREE.Mesh(plane, feedbackMaterial);

    feedbackScene = new THREE.Scene();

    feedbackScene.add(feedbackMesh);
}

function createPassthroughScene() {
    let plane = new THREE.PlaneBufferGeometry(2, 2);

    passthruUniforms = {
        passthru: { value: feedbackTargets[(fdbkInd+1)%2].texture}
    }

    let passthruMaterial = new THREE.ShaderMaterial({
        uniforms: passthruUniforms,
        vertexShader: vertexShader,
        fragmentShader: passthruShader
    });

    let passthruMesh = new THREE.Mesh(plane, passthruMaterial);

    passthruScene = new THREE.Scene();

    passthruScene.add(passthruMesh);
}

function init() {
    const container = document.getElementById("container");

    pCam = new THREE.PerspectiveCamera( 90, 1, 0.1, 1000 );
    oCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    createFeedbackScene();
    createPassthroughScene();

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
    [feedbackTargets].flat().map(t => t.setSize(window.innerWidth, window.innerHeight));
}

function animate() {
    requestAnimationFrame(animate);

    time = performance.now() / 1000 - startTime;

    feedbackUniforms.backbuffer.value = feedbackTargets[fdbkInd%2].texture;
    feedbackUniforms.time.value = time;
    renderer.setRenderTarget(feedbackTargets[(fdbkInd+1)%2]);
    renderer.render(feedbackScene, oCam);

    renderer.setRenderTarget(null);

    passthruUniforms.passthru.value = feedbackTargets[(fdbkInd+1)%2].texture;
    renderer.render(passthruScene, pCam);

    stats.update();
    fdbkInd++;
}

export { init, animate };


let vertexShader = glsl`
varying vec2 vUv;

void main()	{

  vUv = uv;

  vec3 p = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

}`;

let passthruShader = glsl`
varying vec2 vUv;
uniform sampler2D passthru;

void main()	{
  gl_FragColor = texture(passthru, vUv);
}`;

let feedbackShader = glsl`
varying vec2 vUv;

uniform float time;
uniform sampler2D scene;
uniform sampler2D backbuffer;
uniform sampler2D depth;

void main()	{
    float PI = 3.14159;
    vec2 dev = vec2(cos(time+vUv.y*PI*2.), sin(time+vUv.x*PI*2.))*0.001;
    float rowDev = (hash(vec3(quant(vUv.y, 10.), 10., 10.)).x - 0.5) * 0.015;
    vec2 rowSplitUV = vec2(mod(vUv.x+ rowDev, 1.), vUv.y);
    vec4 bb = texture(backbuffer, rowSplitUV);
    vec4 samp = texture(scene, vUv);
    vec4 dep = texture(depth, vUv);
    gl_FragColor = mix(samp, bb, dep.r < 1. ? .5 + pow(sinN(time), 1.)*0.5 : 1.);
}
`;