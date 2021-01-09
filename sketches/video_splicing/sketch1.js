import * as THREE from "../../three.module.js";
import Stats from "../../stats.module.js";
import header_code from "../../header_frag.js";
import { htmlToElement } from "../../utilities/utilityFunctions.js"

//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];

const quant = (v, q) => Math.floor(v/q) * q;

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

const newTarget = () => new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

let pCam, oCam, feedbackScene, passthruScene, renderer, stats;
let feedbackUniforms, passthruUniforms;
let videoPlacementScene, videoPlacementUniforms;

let feedackDisplacementScene, feedbackDisplacementUniforms;
let feedbackDisplacementTarget = newTarget();

let feedbackTargets = [0,1].map(newTarget);
let fdbkInd = 0;

let videoPlacementTarget = newTarget();
videoPlacementTarget.depthTexture = new THREE.DepthTexture();
videoPlacementTarget.depthTexture.format = THREE.DepthFormat;
videoPlacementTarget.depthTexture.type = THREE.UnsignedIntType;

let time;
let startTime = performance.now()/1000;

function createVideoPlacementScene() {
    let plane = new THREE.CircleBufferGeometry(0.25, 30);

    window.vidPlane = plane;

    videoPlacementUniforms = {
        passthru: {value: videoTexture},
        time :    {value: 0}
    }

    let videoPlacementMaterial = new THREE.ShaderMaterial({
        uniforms: videoPlacementUniforms,
        vertexShader: header_code + vidVertWarp,
        fragmentShader: header_code + vidCutShader
    });
    videoPlacementMaterial.side = THREE.DoubleSide;

    let videoPlacementMesh = new THREE.Mesh(plane, videoPlacementMaterial);

    videoPlacementMesh.onBeforeRender = function(renderer, scene, camera, geometry, material, group) {
        this.position.x = (time*1%1)*2 - 1; Math.sin(quant(time,0.2) *.95) * 0.5;
        this.position.y = Math.sin(quant(time,0.2) *.95*2) * 0.5;
    }

    videoPlacementScene = new THREE.Scene();

    videoPlacementScene.add(videoPlacementMesh);
}

function createFeedbackDisplacementScene() {
    let plane = new THREE.PlaneBufferGeometry(2, 2);

    feedbackDisplacementUniforms = {
        time: {value: 0}
    }

    let material = new THREE.ShaderMaterial({
        uniforms: feedbackDisplacementUniforms,
        vertexShader: vertexShader,
        fragmentShader: header_code + feedbackDisplacementShader
    });

    let mesh = new THREE.Mesh(plane, material);

    feedackDisplacementScene = new THREE.Scene();

    feedackDisplacementScene.add(mesh);
}

function createFeedbackScene(){
    let plane = new THREE.PlaneBufferGeometry(2, 2);

    feedbackUniforms = {
        backbuffer: { value: feedbackTargets[0].texture},
        scene:      { value: videoPlacementTarget.texture},
        depth:      { value: videoPlacementTarget.depthTexture},
        displacement: {value: feedbackDisplacementTarget.texture},
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
    createFeedbackDisplacementScene();
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
    [feedbackTargets, feedbackDisplacementTarget, videoPlacementTarget].flat().map(t => t.setSize(window.innerWidth, window.innerHeight));
}

function animate() {
    requestAnimationFrame(animate);

    time = performance.now() / 1000 - startTime;

    feedbackDisplacementUniforms.time.value = time;
    renderer.setRenderTarget(feedbackDisplacementTarget);
    renderer.render(feedackDisplacementScene, oCam);

    videoPlacementUniforms.time.value = time;
    renderer.setRenderTarget(videoPlacementTarget);
    renderer.render(videoPlacementScene, oCam);

    feedbackUniforms.backbuffer.value = feedbackTargets[fdbkInd%2].texture;
    feedbackUniforms.time.value = time;
    renderer.setRenderTarget(feedbackTargets[(fdbkInd+1)%2]);
    renderer.render(feedbackScene, oCam);

    renderer.setRenderTarget(null);

    passthruUniforms.passthru.value = feedbackTargets[(fdbkInd+1)%2].texture;
    renderer.render(passthruScene, oCam);

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

let vidVertWarp = glsl`
varying vec2 vUv;

uniform float time;

void main()	{

  vUv = uv;

  vec3 p = position;
  float posR = rand(p.x*1000. + p.y*905.);
  float t = time + 10000.;
  float ydev = sin(t * (1.+.3*posR))*0.04;
//   p.y = p.y + mix(0., ydev, sinN(time+p.x*PI));
  gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );

}`;

let vidCutShader = glsl`
varying vec2 vUv;
uniform sampler2D passthru;
uniform float time;

void main()	{
    vec2 uv = vUv;
    float dir = vUv.y < 0.5 ? -1. : 1.;
    uv.y = mod(time * dir + vUv.y, 1.);
    uv.x = mod(time * dir + vUv.x, 1.);
    uv = mix(uv, vec2(0.5), 0.3+sinN(time*0.3)*0.5);
    gl_FragColor = texture(passthru, uv);
}`;

let passthruShader = glsl`
varying vec2 vUv;
uniform sampler2D passthru;

void main()	{
    gl_FragColor = texture(passthru, vUv);
}`;

let feedbackDisplacementShader = glsl`
varying vec2 vUv;
uniform float time;

vec4 xySignSplit(vec2 xy){
    return vec4(max(xy.x, 0.), abs(min(xy.x, 0.)), max(xy.y, 0.), abs(min(xy.y, 0.)));
}

void main()	{
    vec2 dir = sin(time) < 0. ? vec2(sign(vUv.y-0.5), 0.) : vec2(0., sign(vUv.x-0.5));
    gl_FragColor = xySignSplit(dir*0.003);
}`;

let feedbackShader = glsl`
varying vec2 vUv;

uniform float time;
uniform sampler2D scene;
uniform sampler2D backbuffer;
uniform sampler2D depth;
uniform sampler2D displacement;

vec2 xySignCompose(vec4 xy){
    float x = xy.x + (-1.*xy.y);
    float y = xy.z + (-1.*xy.w);
    return vec2(x, y);
}

void main()	{
    float PI = 3.14159;

    vec2 bbN = mix(vUv, coordWarp(vUv, time).xy, 0.01);

    
    vec4 bb2 = texture(backbuffer, bbN);
    vec4 samp = texture(scene, vUv);
    vec4 dep = texture(depth, vUv);

    vec4 disp4 = texture(displacement, vUv);
    vec2 disp = xySignCompose(disp4);

    vec2 hashN = (hash(vec3(vUv, time))-0.5).xy * 0.001;
    vec4 bb = texture(backbuffer, vUv+hashN + disp);

    float decay = 0.005;
    bool draw = dep.r < 1.;
    float last_fdbk = bb2.a;
    float fdbk = draw ? 1. : last_fdbk - decay;
    fdbk = max(0., fdbk);


    vec3 col = mix(bb.rgb, samp.rgb, fdbk == 1. ? 1. : 0.);
    col = mix(black, col, fdbk < 0.05 ? 0. : 1.);
    // col = mix(bb.rgb, samp.rgb, 0.04);
    // if(draw) col = samp.rgb;

    gl_FragColor = vec4(col, fdbk);
}
`;