import * as THREE from "../../three.module.js";
import Stats from "../../stats.module.js";
import header_code from "../../header_frag.js";
import { htmlToElement } from "../../utilities/utilityFunctions.js"
import * as dat from '../../node_modules/dat.gui/build/dat.gui.module.js';

const gui = new dat.GUI();
let eyePos = { xEye: 0.3, yEye: 0.3, zoom: 0.5, simplifyEye: false, vidScrub: false, vidPos: 0, vidTexPos: 98, useVidTex: true, eyeRotation: 1.5, yLook: 0, zLook: 0, rotRad: 0, rotAng: 0};
gui.add(eyePos, 'xEye', 0, 1, 0.01);
gui.add(eyePos, 'yEye', 0, 1, 0.01);
gui.add(eyePos, 'zoom', 0, 1, 0.01);
gui.add(eyePos, 'simplifyEye');
gui.add(eyePos, 'vidScrub').onChange(v => v ? video.pause() : video.play());
gui.add(eyePos, 'vidPos', 0, 1, 0.001).onChange(v => {video.currentTime = video.duration * v});
gui.add(eyePos, 'vidTexPos', 0, 200);
gui.add(eyePos, 'useVidTex');
gui.add(eyePos, 'eyeRotation', 0, 2, .001);
gui.add(eyePos, 'yLook', -1, 1, .001);
gui.add(eyePos, 'zLook', -1, 1, .001);
gui.add(eyePos, 'rotRad', 0, 1, .001);
gui.add(eyePos, 'rotAng', 0, 2*Math.PI, .001);


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

fetch("/media_assets/eye_raw.rgb").then(async (res) => {
    console.log("eye_raw loaded");
    // return
    const  width = 384, height = 216, numFrames = 200;
    let rgbBlob = await res.blob();
    let blobArray = await rgbBlob.arrayBuffer();
    let rgbData = new Uint8Array(blobArray, 0, width * height * 3 * numFrames);
    videoTextureArray.dispose();
    videoTextureArray = createTextureArray(rgbData, width, height, numFrames);
    videoPlacementUniforms.vidFrames.value = videoTextureArray;
});

const newTarget = () => new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

let pCam, oCam, feedbackScene, passthruScene, renderer, stats;
let feedbackUniforms, passthruUniforms;

let videoPlacementScene, videoPlacementUniforms, videoPlacementMesh;
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


let time;
let startTime = performance.now()/1000;

function createTextureArray(data, width, height, depth) {
    const texture = new THREE.DataTexture2DArray( data, width, height, depth );
    texture.format = THREE.RGBFormat;
    texture.type = THREE.UnsignedByteType;
    texture.anistropy = 4;
    return texture;
}

function createVideoPlacementScene() {
    let plane = new THREE.PlaneBufferGeometry(2, 2);

    let sphere = new THREE.SphereBufferGeometry(0.25, 130, 130);

    let data = new Uint8Array(256*256*3*10);
    let exp2 = i => (i / (256**2 * 3) % 1);
    data = data.map((e, i) => Math.floor(exp2(i)*256))
    videoTextureArray = createTextureArray(data, 256, 256, 10);

    videoPlacementUniforms = {
        passthru:  {value: videoTexture},
        time :     {value: 0},
        eyePos:    {value: new THREE.Vector3(.5, .5, .5)},
        vidFrames: {value: videoTextureArray},
        useVidTex: {value: false},
        frameInd:  {value: 0}
    }

    let videoPlacementMaterial = new THREE.ShaderMaterial({
        uniforms: videoPlacementUniforms,
        vertexShader: header_code + vidVertWarp,
        fragmentShader: header_code + vidCutShader
    });
    videoPlacementMaterial.side = THREE.DoubleSide;

    videoPlacementMesh = new THREE.Mesh(sphere, videoPlacementMaterial);

    window.vidMesh = videoPlacementMesh;

    videoPlacementMesh.onBeforeRender = function(/*renderer, scene, camera, geometry, material, group*/) {
        if(eyePos.simplifyEye) {
            this.position.x = this.position.y = 0;
        } else {
            this.position.x = Math.sin(time *.95) * 0.5;
            this.position.y = Math.sin(time *.95*2) * 0.5;
        }
        
        // this.position.z = -1*(time%1);
    }

    videoPlacementScene = new THREE.Scene();
    videoPlacementScene.add(videoPlacementMesh);

    let simpleEyeMesh = new THREE.Mesh(plane, videoPlacementMaterial);
    simpleEyeScene = new THREE.Scene();
    simpleEyeScene.add(simpleEyeMesh);
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
    pCam.position.z = 1;
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

function animateVideoPlacement() {
    const meshPos = videoPlacementMesh.position;
    const s = Math.sin, pi = Math.PI;
    const camAnim = new THREE.Vector3();
    camAnim.setFromSphericalCoords(2, s(time*0.32)*pi, s(time*0.52)*pi)
    const newPos = camAnim.lerp(meshPos, sinN(time*.28)*0.5);

    // pCam.position.set(newPos.x, newPos.y, newPos.z);
    // pCam.lookAt(new THREE.Vector3(0, 0, 0));

    videoPlacementMesh.lookAt(pCam.position);
    videoPlacementMesh.rotateY(eyePos.eyeRotation * Math.PI);
    videoPlacementMesh.rotateY(eyePos.yLook * Math.PI + Math.sin(eyePos.rotAng)*eyePos.rotRad * Math.PI);
    videoPlacementMesh.rotateZ(eyePos.zLook * Math.PI + Math.cos(eyePos.rotAng)*eyePos.rotRad * Math.PI);
}

function setVideoPlacementUniforms() {
    videoPlacementUniforms.eyePos.value.set(eyePos.xEye, eyePos.yEye, eyePos.zoom)
    videoPlacementUniforms.time.value = time;
    videoPlacementUniforms.useVidTex.value = eyePos.useVidTex;
    videoPlacementUniforms.frameInd.value = eyePos.vidTexPos;
}

function animate() {
    requestAnimationFrame(animate);

    time = performance.now() / 1000 - startTime;

    if(eyePos.simplifyEye){
        pCam.position.set(0, 0, -1);
        pCam.lookAt(new THREE.Vector3(0, 0, 0));
        setVideoPlacementUniforms();
        renderer.setRenderTarget(null);
        renderer.render(simpleEyeScene, pCam);
    }

    else {
        feedbackDisplacementUniforms.time.value = time;
        renderer.setRenderTarget(feedbackDisplacementTarget);
        renderer.render(feedackDisplacementScene, oCam);

        animateVideoPlacement();
        setVideoPlacementUniforms();
        renderer.setRenderTarget(videoPlacementTarget);
        renderer.render(videoPlacementScene, pCam);

        feedbackUniforms.backbuffer.value = feedbackTargets[fdbkInd%2].texture;
        feedbackUniforms.time.value = time;
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

void main()	{

  vUv = uv;

  vec3 p = position;
  float posR = p.x*3.14 + p.y*3.15;
  float t = time + 10000.;
  float ydev = sin(t + posR*3.)*0.07;
  p.y = p.y + mix(0., ydev, 1.);
//   p.z = p.z + mix(0., sin(p.y*30.+time)*0.1, 1.);
  gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );

}`;

let vidCutShader = glsl`
precision highp sampler2DArray;

varying vec2 vUv;
uniform sampler2D passthru;
uniform float time;
uniform vec3 eyePos;
uniform sampler2DArray vidFrames;
uniform int frameInd;
uniform bool useVidTex;

vec2 flipY(vec2 v){
    return vec2(v.x, 1.-v.y);
}

void main()	{
    vec2 uv = mix(vUv, eyePos.xy, eyePos.z);
    // float dir = vUv.y < 0.5 ? -1. : 1.;
    // uv.y = mod(time * dir + vUv.y, 1.);
    // uv.x = mod(time * dir + vUv.x, 1.);
    // uv = mix(uv, vec2(0.5), 0.3+sinN(time*0.3)*0.5);
    // float quantDev = pow(sinN(time*0.32), 3.)*300.;
    vec4 samp = texture(passthru, uv);
    vec4 sampTex = texture(vidFrames, vec3(flipY(uv), frameInd));
    if(useVidTex) samp = sampTex;
    float edgeW = 0.001;
    vec4 rightEdge = texture(vidFrames, vec3(1.-edgeW, 1.-uv.y, frameInd));
    vec4 leftEdge = texture(vidFrames, vec3(edgeW, 1.-uv.y, frameInd));
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

vec4 xySignSplit(vec2 xy){
    return vec4(max(xy.x, 0.), abs(min(xy.x, 0.)), max(xy.y, 0.), abs(min(xy.y, 0.)));
}

void main()	{
    vec2 dir = mix(vec2(sign(vUv.y-0.5), 0.), vec2(0., sign(vUv.x-0.5)), sinN(time*0.3));
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

    vec2 bbN = mix(vUv, coordWarp(vUv, time).xy, 0.005);

    
    vec4 bb2 = texture(backbuffer, bbN);
    vec4 samp = texture(scene, vUv);
    vec4 dep = texture(depth, vUv);

    vec4 disp4 = texture(displacement, vUv);
    vec2 disp = xySignCompose(disp4)*0.1;

    vec2 hashN = (hash(vec3(vUv, time))-0.5).xy * 0.0005;
    vec4 bb3 = texture(backbuffer, mix(vUv+hashN + disp, vec2(0.5), 0.001));
    
    vec4 bb = texture(backbuffer, mix(vUv+hashN + disp, vec2(0.5), 0.001));

    float decay = 0.001;
    bool draw = dep.r < 1.;
    float last_fdbk = bb2.a;
    float fdbk = draw ? 1. : last_fdbk - decay;
    fdbk = max(0., fdbk);


    vec3 col = mix(bb.rgb, samp.rgb, fdbk == 1. ? 1. : 0.);
    col = mix(black, col, fdbk < 0.01 ? 0. : 1.);
    // col = mix(bb.rgb, samp.rgb, 0.04);
    // if(draw) col = samp.rgb;

    gl_FragColor = vec4(col, fdbk);
}
`;