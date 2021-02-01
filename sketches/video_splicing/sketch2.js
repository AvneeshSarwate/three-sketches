import * as THREE from "../../three.module.js";
import Stats from "../../stats.module.js";
import header_code from "../../header_frag.js";
import { htmlToElement } from "../../utilities/utilityFunctions.js"
import * as dat from '../../node_modules/dat.gui/build/dat.gui.module.js';
import {Gesture, gestureManager} from '../../utilities/animationManager.js';
import {oscV, oscH} from '../../utilities/oscManager.js';


let eyeTransforms = {
    eye1rot: 0,
    eye2rot: 0,
};

let lerp = (n1, n2, a) => (1-a)*n1 + a*n2;
let upDown = a => (0.5 - Math.abs(a-0.5))*2

let eye1rot_gest = new Gesture('rotate_1', (gTime, gPhase) => {
    eyeTransforms.eye1rot = gPhase * Math.PI *2;
}, null, null, 1);
oscH.setHandler('/rotate_1', ([vel]) =>  vel > 0 ? eye1rot_gest.start(vel/127 * 4) : 0 );

let eye2rot_gest = new Gesture('rotate_2', (gTime, gPhase) => {
    eyeTransforms.eye2rot = gPhase * Math.PI *2;
}, null, null, 1);
oscH.setHandler('/rotate_2', ([vel]) =>  vel > 0 ? eye2rot_gest.start(vel/127 * 4) : 0 );

let eye1blink_gest = new Gesture('blink_1', (gTime, gPhase) => {
    eyeballUniforms_1.frameInd.value = gPhase;
}, null, null, 1);
oscH.setHandler('/blink_1', ([vel]) =>  vel > 0 ? eye1blink_gest.start(vel/127 * 4) : 0 );

let eye2blink_gest = new Gesture('blink_2', (gTime, gPhase) => {
    eyeballUniforms_2.frameInd.value = gPhase;
}, null, null, 1);
oscH.setHandler('/blink_2', ([vel]) =>  vel > 0 ? eye2blink_gest.start(vel/127 * 4) : 0 );


const gui = new dat.GUI();
let eyePos = { xEye: 0.37, yEye: 0.34, zoom: 0.33, simplifyEye: false, vidScrub: false, vidPos: 0, vidTexPos: 0, useVidTex: true, eyeRotation: 1.5, yLook: 0, zLook: 0, rotRad: 0, rotAng: 0, blinkRoll: 0.1};
let setColorRing = false;
eyePos.colorBlast = () => {setColorRing = true;}
gui.add(eyePos, 'xEye', 0, 1, 0.01);
gui.add(eyePos, 'yEye', 0, 1, 0.01);
gui.add(eyePos, 'zoom', 0, 1, 0.01);
gui.add(eyePos, 'simplifyEye');
gui.add(eyePos, 'vidScrub').onChange(v => v ? video.pause() : video.play());
gui.add(eyePos, 'vidPos', 0, 1, 0.001).onChange(v => {video.currentTime = video.duration * v});
gui.add(eyePos, 'vidTexPos', 0, 1, 0.001);
gui.add(eyePos, 'useVidTex');
gui.add(eyePos, 'eyeRotation', 0, 2, .001);
gui.add(eyePos, 'yLook', -1, 1, .001);
gui.add(eyePos, 'zLook', -1, 1, .001);
gui.add(eyePos, 'rotRad', 0, 1, .001);
gui.add(eyePos, 'rotAng', 0, 2*Math.PI, .001);
gui.add(eyePos, 'colorBlast');
gui.add(eyePos, 'blinkRoll', 0, 1, 0.01);


//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];

const quant = (v, q) => Math.floor(v/q) * q;
const sinN = n => (Math.sin(n)+1)/2;

let video = htmlToElement(`<video id="video" style="display:none" loop autoplay playsinline></video>`)
let videoTexture = new THREE.VideoTexture(video);
window.vid = video;

fetch("/media_assets/eye_movement_short_small2.mp4").then(async (res) => {
    let videoBlob = await res.blob();
    video.src = URL.createObjectURL(videoBlob);
    document.body.append(video);
    video.muted = true;
    video.play()
})

window.onbeforeunload = function(){
    videoTextureArray.dispose();
}

fetch("/media_assets/blink1.rgb").then(async (res) => {
    console.log("blink1 loaded");
    // return
    const  width = 960, height = 540, numFrames = 133;
    let rgbBlob = await res.blob();
    let blobArray = await rgbBlob.arrayBuffer();
    let rgbData = new Uint8Array(blobArray, 0, width * height * 3 * numFrames);
    videoTextureArray.dispose();
    videoTextureArray = createTextureArray(rgbData, width, height, numFrames);
    eyeballUniforms_1.vidFrames.value = videoTextureArray;
    eyeballUniforms_2.vidFrames.value = videoTextureArray;
    simplifyUniforms.vidFrames.value = videoTextureArray;
});

const newTarget = () => new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

let pCam, oCam, feedbackScene, passthruScene, renderer, stats;
let feedbackUniforms, passthruUniforms;

let eyeballScene, eyeballUniforms_1, eyeball_1, eyeballUniforms_2, eyeball_2, simplifyUniforms;
let simpleEyeScene;
let videoPlacementTarget = newTarget();
videoPlacementTarget.depthTexture = new THREE.DepthTexture();
videoPlacementTarget.depthTexture.format = THREE.DepthFormat;
videoPlacementTarget.depthTexture.type = THREE.UnsignedIntType;
let videoTextureArray;

let feedackDisplacementScene, feedbackDisplacementUniforms;
let feedbackDisplacementTarget = newTarget();

let feedbackTargets = [0,1].map(newTarget);
let fdbkInd = 0;

let initalCamPos = new THREE.Vector3(0, 0, 1);


let time;
let startTime = performance.now()/1000;

window.eye1 = eyeball_1;

function createTextureArray(data, width, height, depth) {
    const texture = new THREE.DataTexture3D( data, width, height, depth );
    texture.format = THREE.RGBFormat;
    texture.type = THREE.UnsignedByteType;
    texture.anistropy = 4;
    return texture;
}

function createEyeMaterial(videoTexture, videoTextureArray, vertShader){
    let uniforms = {
        passthru:  {value: videoTexture},
        time :     {value: 0},
        eyePos:    {value: new THREE.Vector3(.5, .5, .5)},
        vidFrames: {value: videoTextureArray},
        useVidTex: {value: true},
        frameInd:  {value: 1},
        blinkRoll: {value: 0}
    };

    let material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: header_code + vertShader,
        fragmentShader: header_code + vidCutShader
    });
    material.side = THREE.DoubleSide;

    return {material, uniforms};
}

function createEyeMesh(videoTexture, videoTextureArray) {
    let sphere = new THREE.SphereBufferGeometry(0.25, 130, 130);

    let {material, uniforms} = createEyeMaterial(videoTexture, videoTextureArray, vidVertWarp);

    let mesh = new THREE.Mesh(sphere, material);

    return [mesh, uniforms];
}

function createEyeballScene() {
    
    let data = new Uint8Array(256*256*3*10);
    let exp2 = i => (i / (256**2 * 3) % 1);
    data = data.map((e, i) => Math.floor(exp2(i)*256))
    videoTextureArray = createTextureArray(data, 256, 256, 10);

    let eyes_and_uniforms = [0, 1].map(() => createEyeMesh(videoTexture, videoTextureArray));
    eyeball_1 = eyes_and_uniforms[0][0];
    eyeball_2 = eyes_and_uniforms[1][0];
    eyeballUniforms_1 = eyes_and_uniforms[0][1];
    eyeballUniforms_2 = eyes_and_uniforms[1][1];

    eyeball_1.position.x = -0.5;
    eyeball_2.position.x = 0.5;

    eyeballScene = new THREE.Scene();
    eyeballScene.add(eyeball_1);
    eyeballScene.add(eyeball_2);

    let {material, uniforms} = createEyeMaterial(videoTexture, videoTextureArray, vertexShader);
    simplifyUniforms = uniforms;
    let plane = new THREE.PlaneBufferGeometry(2, 2);
    let simpleEyeMesh = new THREE.Mesh(plane, material);
    simpleEyeScene = new THREE.Scene();
    simpleEyeScene.add(simpleEyeMesh);
}

function createFeedbackDisplacementScene() {
    let plane = new THREE.PlaneBufferGeometry(2, 2);

    feedbackDisplacementUniforms = {
        time:   {value: 0},
        param1: {value: 0},
        param2: {value: 0}
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
        time :      { value: 0},
        eyePos1:    { value: new THREE.Vector2()},
        eyePos2:    { value: new THREE.Vector2()},
        setColorRing: {value : false},
        param1:     { value: 0.5},
        param2:     { value: 0.5},
        fdbkAmount:   { value: 0},
        fdbkStyle:   { value: 0 }
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
    pCam.position.z = 1;
    pCam.updateMatrixWorld();
    oCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    window.pCam = pCam;

    createEyeballScene();
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

function setBaseEyeRotations() {
    const meshPos = eyeball_1.position;
    const s = Math.sin, pi = Math.PI;
    const camAnim = new THREE.Vector3();
    camAnim.setFromSphericalCoords(2, s(time*0.32)*pi, s(time*0.52)*pi)
    let newPos = camAnim.lerp(meshPos, sinN(time*.28)*0.5);

    let camPos = new THREE.Vector3().lerpVectors(initalCamPos, newPos, oscV.camMove.v);
    pCam.position.set(camPos.x, camPos.y, camPos.z);
    pCam.lookAt(new THREE.Vector3(0, 0, 0));

    eyeball_1.lookAt(pCam.position);
    eyeball_1.rotateY(eyePos.eyeRotation * Math.PI);
    eyeball_2.lookAt(pCam.position);
    eyeball_2.rotateY(eyePos.eyeRotation * Math.PI);

    // eyeball_1.rotateY(eyePos.yLook * Math.PI + Math.sin(eyePos.rotAng)*eyePos.rotRad * Math.PI);
    // eyeball_1.rotateZ(eyePos.zLook * Math.PI + Math.cos(eyePos.rotAng)*eyePos.rotRad * Math.PI);
}

function setEyeAnimationTransforms(){
    eyeball_1.rotateY(eyeTransforms.eye1rot);
    eyeball_2.rotateY(eyeTransforms.eye2rot);
}

function setVideoPlacementUniforms(eyeUniforms, eyeInd) {
    eyeUniforms.eyePos.value.set(eyePos.xEye, eyePos.yEye, eyePos.zoom)
    eyeUniforms.time.value = time;
    eyeUniforms.useVidTex.value = eyePos.useVidTex;
    eyeUniforms.blinkRoll.value = eyePos.blinkRoll;
    eyeUniforms.frameInd.value = eyePos.vidTexPos;
}

function setFeedbackDisplacementUniforms(){
    feedbackDisplacementUniforms.time.value = time;
}

function setFeedbackUniforms() {
    feedbackUniforms.backbuffer.value = feedbackTargets[fdbkInd%2].texture;
    feedbackUniforms.time.value = time;
    feedbackUniforms.setColorRing.value = setColorRing;

    feedbackUniforms.param1.value = oscV.fdbk_dsp1.v;
    feedbackUniforms.param2.value = oscV.fdbk_dsp2.v;

    feedbackUniforms.fdbkAmount.value = oscV.fdbkAmount.v;
    feedbackUniforms.fdbkStyle.value = oscV.fdbkStyle.v;
    
    pCam.updateMatrixWorld();

    let eyeScreen1 = eyeball_1.position.clone();
    eyeScreen1.project(pCam);
    feedbackUniforms.eyePos1.value = eyeScreen1;

    let eyeScreen2 = eyeball_2.position.clone();
    eyeScreen2.project(pCam);
    feedbackUniforms.eyePos2.value = eyeScreen2;

    setColorRing = false;
}

function animate() {
    requestAnimationFrame(animate);

    time = performance.now() / 1000 - startTime;

    if(eyePos.simplifyEye){
        pCam.position.set(0, 0, -1);
        pCam.lookAt(new THREE.Vector3(0, 0, 0));
        setVideoPlacementUniforms(simplifyUniforms);
        renderer.setRenderTarget(null);
        renderer.render(simpleEyeScene, pCam);
    }

    else {
        setFeedbackDisplacementUniforms();
        renderer.setRenderTarget(feedbackDisplacementTarget);
        renderer.render(feedackDisplacementScene, oCam);

        setBaseEyeRotations();
        setVideoPlacementUniforms(eyeballUniforms_1, 1);
        setVideoPlacementUniforms(eyeballUniforms_2, 2);
        gestureManager.tick();
        setEyeAnimationTransforms();
        renderer.setRenderTarget(videoPlacementTarget);
        renderer.render(eyeballScene, pCam);

        setFeedbackUniforms();
        renderer.setRenderTarget(feedbackTargets[(fdbkInd+1)%2]);
        renderer.render(feedbackScene, oCam);

        renderer.setRenderTarget(null);

        passthruUniforms.passthru.value = feedbackTargets[(fdbkInd+1)%2].texture;
        renderer.render(passthruScene, oCam);
    }

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
uniform float eyeSquish;

void main()	{

  vUv = uv;

  vec3 p = position;
  float posR = p.x*3.14 + p.y*3.15;
  float t = time + 10000.;
  float ydev = sin(t + posR*3.)*0.07;
  p.y = p.y + mix(0., ydev, 1.);
  p = mix(position, p, eyeSquish);
  gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );

}`;

let vidCutShader = glsl`
precision highp sampler3D;

varying vec2 vUv;
uniform sampler2D passthru;
uniform float time;
uniform vec3 eyePos;
uniform sampler3D vidFrames;
uniform float frameInd;
uniform bool useVidTex;
uniform float blinkRoll;

vec2 flipY(vec2 v){
    return vec2(v.x, 1.-v.y);
}

float blinkRange(float a){
    return mix(132., 49., (0.5 - abs(a-0.5))*2.)/132.;
}

void main()	{
    vec2 uv = mix(vUv, eyePos.xy, eyePos.z);
    float vidPos = blinkRange(clamp(frameInd*(1.+blinkRoll) - vUv.x*blinkRoll, 0., 1.));

    vec4 samp = texture(passthru, uv);
    vec4 sampTex = texture(vidFrames, vec3(flipY(uv), vidPos));
    if(useVidTex) samp = sampTex;
    float edgeW = 0.001;
    vec4 rightEdge = texture(vidFrames, vec3(1.-edgeW, 1.-uv.y, vidPos));
    vec4 leftEdge = texture(vidFrames, vec3(edgeW, 1.-uv.y, vidPos));
    vec4 seamColor = mix(leftEdge, rightEdge, 0.5);
    float blendDist = 0.05;
    vec4 blendVal = mix(seamColor, samp, clamp(vUv.x, 0., blendDist)/blendDist);
    blendVal = mix(seamColor, blendVal, clamp(1.-vUv.x, 0., blendDist)/blendDist);

    gl_FragColor = blendVal;
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
uniform float param1;
uniform float param2;

vec4 xySignSplit(vec2 xy){
    return vec4(max(xy.x, 0.), abs(min(xy.x, 0.)), max(xy.y, 0.), abs(min(xy.y, 0.)));
}

vec2 xyHalves(){
    return mix(vec2(sign(vUv.y-0.5), 0.), vec2(0., sign(vUv.x-0.5)), sinN(time*0.3)) * 0.003;
}

vec2 randomSink() {
    vec2 sink = vec2(0.5, 0.5);
    return mix(vUv, sink, 0.1);
}

vec2 spiral() {
    return rotate(vUv, vec2(0.5), (distance(vUv, vec2(0.5)) * 0.1));
}

void main()	{
    vec2 dir = vUv - randomSink();
    gl_FragColor = xySignSplit(dir);
}`;

let feedbackShader = glsl`
varying vec2 vUv;

uniform float time;
uniform sampler2D scene;
uniform sampler2D backbuffer;
uniform sampler2D depth;
uniform sampler2D displacement;
uniform bool setColorRing;
uniform vec3 eyePos1;//eye positions are -1, 1
uniform vec3 eyePos2;
uniform float param1;
uniform float param2;
uniform float fdbkStyle;
uniform float fdbkAmount;

vec2 xySignCompose(vec4 xy){
    float x = xy.x + (-1.*xy.y);
    float y = xy.z + (-1.*xy.w);
    return vec2(x, y);
}


vec2 sink(){
    // return mix(vUv, vec2(param1, param2), -0.01);
    vec2 dev = normalize(vUv - vec2(param1, param2))*0.001;
    return vUv + dev;
}

vec2 outPush(){
    vec2 eye1 = (eyePos1.xy + 1.)/2.; //eye positions are -1, 1
    vec2 eye2 = (eyePos2.xy + 1.)/2.;
    vec2 root = distance(vUv, eye1) <= distance(vUv, eye2) ? eye1 : eye2;
    vec2 dev = normalize(root-vUv)*0.001;
    // return mix(root, vUv, 1.01);
    return vUv + dev;
}

vec2 displaceFunc() {
    return mix(sink(), outPush(), fdbkStyle);
}


void main()	{
    vec2 eye1 = (eyePos1.xy + 1.)/2.; //eye positions are -1, 1
    vec2 eye2 = (eyePos2.xy + 1.)/2.;

    float PI = 3.14159;

    // vec2 bbN = mix(vUv, coordWarp(vUv, time).xy, 0.005);
    // vec4 bb2 = texture(backbuffer, bbN);

    vec4 samp = texture(scene, vUv);
    vec4 dep = texture(depth, vUv);

    // vec4 disp4 = texture(displacement, vUv);
    // vec2 disp = xySignCompose(disp4)*0.1;
    vec2 disp = displaceFunc();

    vec2 hashN = (hash(vec3(vUv, time))-0.5).xy * 0.0005;
    
    vec4 bb = texture(backbuffer, disp + hashN);

    float decay = fdbkAmount * 0.1;
    bool draw = dep.r < 1.;
    float last_fdbk = bb.a;
    float fdbk = draw ? 1. : last_fdbk - decay;
    fdbk = max(0., fdbk);


    vec3 col = mix(bb.rgb, samp.rgb, fdbk == 1. ? 1. : 0.);
    col = mix(black, col, fdbk < 0.01 ? 0. : 1.);
    // col = mix(bb.rgb, samp.rgb, 0.04);
    // if(draw) col = samp.rgb;

    float eyeDist1 = distance(eye1, vUv);
    float eyeDist2 = distance(eye2, vUv);
    float eyeRad = 0.2;
    bool inEyeBorder = abs(eyeDist1 - eyeRad) < .03 || abs(eyeDist2 - eyeRad) < .03;
    if(inEyeBorder && !draw && setColorRing) col = red;

    gl_FragColor = vec4(col, fdbk);
}
`;