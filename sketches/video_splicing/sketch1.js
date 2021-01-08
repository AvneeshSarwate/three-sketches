import * as THREE from "../../three.module.js";
import Stats from "../../stats.module.js";
import header_code from "../../header_frag.js";
import { htmlToElement } from "../../utilities/utilityFunctions.js"

//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];

let video = htmlToElement(`<video id="video" style="display:none" loop autoplay playsinline></video>`)
let videoTexture = new THREE.VideoTexture(video);
window.vid = video;

fetch("/media_assets/test_vid.mp4").then(async (res) => {
    let videoBlob = await res.blob();
    video.src = URL.createObjectURL(videoBlob);
    document.body.append(video);
    video.muted = true;
    video.play()
})

let pCam, oCam, feedbackScene, passthruScene, renderer, stats;
let feedbackUniforms, passthruUniforms;
let videoPlacementScene;

let feedbackTargets = [0,1].map(() => new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight));
let videoPlacementTarget =  new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
let fdbkInd = 0;

let time;
let startTime = performance.now()/1000;

function createVideoPlacementScene() {
    let plane = new THREE.PlaneBufferGeometry(.5, .5);

    window.vidPlane = plane;

    let videoPlacementUniforms = {
        passthru: {value: videoTexture}
    }

    let videoPlacementMaterial = new THREE.ShaderMaterial({
        uniforms: videoPlacementUniforms,
        vertexShader: vertexShader,
        fragmentShader: passthruShader
    });

    let videoPlacementMesh = new THREE.Mesh(plane, videoPlacementMaterial);

    // videoPlacementMesh.onBeforeRender = function(renderer, scene, camera, geometry, material, group) {
    //     this.position.x = Math.sin(time) * 0.1;
    // }

    videoPlacementScene = new THREE.Scene();

    videoPlacementScene.add(videoPlacementMesh);
}

function createFeedbackScene(){
    let plane = new THREE.PlaneBufferGeometry(2, 2);

    feedbackUniforms = {
        backbuffer: { value: feedbackTargets[0].texture},
        scene:      { value: videoPlacementTarget.texture},
        depth:      { value: videoPlacementTarget.depthTexture},
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

    window.pCam = pCam;

    createVideoPlacementScene();
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
    [feedbackTargets, videoPlacementTarget].flat().map(t => t.setSize(window.innerWidth, window.innerHeight));
}

function animate() {
    requestAnimationFrame(animate);

    time = performance.now() / 1000 - startTime;

    renderer.setRenderTarget(videoPlacementTarget);
    renderer.render(videoPlacementScene, oCam);

    feedbackUniforms.backbuffer.value = feedbackTargets[fdbkInd%2].texture;
    feedbackUniforms.time.value = time;
    renderer.setRenderTarget(null);
    renderer.render(feedbackScene, oCam);

    // renderer.setRenderTarget(null);

    // passthruUniforms.passthru.value = feedbackTargets[(fdbkInd+1)%2].texture;
    // renderer.render(passthruScene, pCam);

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
    vec4 bb = texture(backbuffer, vUv);
    vec4 samp = texture(scene, vUv);
    vec4 dep = texture(depth, vUv);
    gl_FragColor = mix(samp, bb, sinN(time));
}
`;