import * as THREE from "../../node_modules/three/build/three.module.js";
import { SimplexNoise } from "../../node_modules/three/examples/jsm/math/SimplexNoise.js"
import Stats from "../../node_modules/three/examples/jsm/libs/stats.module.js";
import header_code from "../../header_frag.js";

import * as dat from '../../node_modules/dat.gui/build/dat.gui.module.js';
import {Gesture, gestureManager} from '../../utilities/animationManager.js'; // eslint-disable-line no-unused-vars
import {oscV, oscH} from '../../utilities/oscManager.js'; // eslint-disable-line no-unused-vars
import {DrawLoop, RecordingManager, saveLoops} from '../../utilities/drawLoop.js';

//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];

const SCALE = 1; //how much to downscale resolution for prototyping

/**
 * Goal - brush-heads of the 4 different gesture-types/recording-slots are rendered in their own composite-scene with feedback.
 * These scenes are then composited together with a shader stage (which could have its own feedback loop)
 * for the final output
 */

let recordingManager = new RecordingManager('xyPad', 'recordSelector');
let runningLoops = [];
let v3 = ({x, y}) => new THREE.Vector3(x, y, 0);
[1, 2, 3, 4].forEach(i => {
    oscH.on(`/playbackTrigger/${i}/1`, ([onOff]) => {
        if(onOff){
            console.log("playLoop", i)
            let loop = new DrawLoop(v3(recordingManager.lastTouch[1]));
            loop.deltas = recordingManager.loops[i].map(d => v3(d));
            let mesh = createDrawLoopMesh(gestureScenes[i-1].loopUniforms);

            gestureScenes[i-1].loopScene.add(mesh);
            runningLoops.push({loop, mesh})
        }
    }, 10);
});

let datGuiProps = {
    saveLoops: () => {saveLoops(recordingManager)},
    loopSetName: "default_name",
    warpAmt: 0.05,
    decay2: 0.997
};
const gui = new dat.GUI();
gui.add(datGuiProps, "saveLoops");
gui.add(datGuiProps, "loopSetName");
gui.add(datGuiProps, "warpAmt");
gui.add(datGuiProps, "decay2");

let simplex = new SimplexNoise();
function timeNoise2d(xRand, yRand, time){
    return {x: simplex.noise(xRand, time), y: simplex.noise(yRand, time)};
}

function createDebugCircle(uniforms, i){ // eslint-disable-line no-unused-vars
    // let circle = new THREE.CircleBufferGeometry(0.04, 30, 30);
    // let material = new THREE.MeshBasicMaterial({color: '#FFFFFF'});
    // let mesh = new THREE.Mesh(circle, material);
    let mesh = createDrawLoopMesh(uniforms);
    setInterval(() => {
        let pos = timeNoise2d(i+1, 10*(i+1), Date.now()/1000 * 0.3);
        mesh.position.x = pos.x;
        mesh.position.y = pos.y;
    }, 20)
    return mesh;
}

// eslint-disable-next-line no-unused-vars
let randColor = () => '#'+(Math.random() * 0xFFFFFF << 0).toString(16).padStart(6, '0');

function runLoops(){
    runningLoops.forEach(lm =>{
        lm.loop.step();
        lm.mesh.position.copy(lm.loop.pos);
    })
}

//this annoying pattern is necessary to allow me to define all of my shaders at the end of the file
//and also have the sketch have a "single point of entry" for reading in the init() function
let drawLoopMaterial;
function instantiateDrawLoopMaterial() {
    return new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        uniforms: {
            time: {value: 0},
            gestureInd: {value: 0}
        },
        fragmentShader: header_code + drawLoopShader
    });
}


function createDrawLoopMesh(uniforms) {
    let circle = new THREE.CircleBufferGeometry(0.1, 30, 30);
    let material = drawLoopMaterial.clone();
    Object.assign(material.uniforms, uniforms);
    let mesh = new THREE.Mesh(circle, material);
    return mesh;
}

let camera, renderer, stats, time, fdbkInd = 0;
let passthruSceneInfo;
const startTime = Date.now()/1000;
let gestureScenes; //Todo need a better word for a "composite-scene" like is created with createGestureScene()
let compositingScene;

const targets = {};
const newTarget = (key) => {
    targets[key] = new THREE.WebGLRenderTarget(window.innerWidth/SCALE, window.innerHeight/SCALE);
    return targets[key];
}
function createTargetSelector() {
    datGuiProps['target'] = 'composite';
    gui.add(datGuiProps, 'target', Object.keys(targets));
}

let debugCircles = false;
function createGestureScene(gestureInd) {
    let loopUniforms = {
        time: {value: 0},
        gestureInd: {value: gestureInd}
    };

    let loopScene = new THREE.Scene();

    if(debugCircles) {
        let debugMesh = createDebugCircle(loopUniforms, gestureInd);
        loopScene.add(debugMesh);
    }

    let loopTarget = newTarget(`loopTarget_${gestureInd}`);
    let feedbackTargets = [0,1].map(i => newTarget(`fdbk_${gestureInd}_${i}`));

    let feedbackSceneInfo = createFeedbackScene(gestureInd, loopTarget, feedbackTargets);

    function renderGesture() {
        loopUniforms.time.value = time;
        renderer.setRenderTarget(loopTarget);
        renderer.render(loopScene, camera);

        feedbackSceneInfo.uniforms.backbuffer.value = feedbackTargets[fdbkInd%2].texture;
        feedbackSceneInfo.uniforms.time.value = time;
        feedbackSceneInfo.uniforms.warpAmt.value = datGuiProps.warpAmt;
        feedbackSceneInfo.uniforms.decay2.value = datGuiProps.decay2; //todo: need a better way to map uniforms to sliders/OSC
        renderer.setRenderTarget(feedbackTargets[(fdbkInd+1)%2]);
        renderer.render(feedbackSceneInfo.scene, camera);
    }

    function getOutputTexture(fdbkInd){
        return feedbackTargets[(fdbkInd+1)%2].texture;
    }

    return {loopScene, renderGesture, getOutputTexture, loopUniforms};
}


function createFeedbackScene(gestureInd, loopTarget, fdbkTargets){
    let plane = new THREE.PlaneBufferGeometry(2, 2);

    let uniforms = {
        backbuffer: { value: fdbkTargets[0].texture},
        scene:      { value: loopTarget.texture},
        time :      { value : 0},
        decay2:     { value : 0.997},
        warpAmt:   { value: 0.01},
        gestureInd: {value: gestureInd}
    } 

    let feedbackMaterial = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: header_code + feedbackShader

    });

    let feedbackMesh = new THREE.Mesh(plane, feedbackMaterial);

    let scene = new THREE.Scene();

    scene.add(feedbackMesh);

    return {scene, uniforms}
}

function createCompositingScene(gestureScenes) {
    let plane = new THREE.PlaneBufferGeometry(2, 2);

    let uniforms = {
        time: {value: 0},
    };
    [0, 1, 2, 3].forEach(i => {
        uniforms['scene'+i] = {value: gestureScenes[i].getOutputTexture(fdbkInd)}
    });

    let material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader: compositingShader
    });

    let mesh = new THREE.Mesh(plane, material);

    let scene = new THREE.Scene();

    scene.add(mesh);

    let target = newTarget('composite');

    function renderCompositingScene() {
        [0, 1, 2, 3].forEach(i => {
            uniforms['scene'+i].value = gestureScenes[i].getOutputTexture(fdbkInd);
        });
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
    }

    return {renderCompositingScene, target}
}

function createPassthroughScene(compositingScene) {
    let plane = new THREE.PlaneBufferGeometry(2, 2);

    let uniforms = {
        passthru: { value: compositingScene.target.texture}
    }

    let passthruMaterial = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: vertexShader,
        fragmentShader: passthruShader
    });

    let passthruMesh = new THREE.Mesh(plane, passthruMaterial);

    let scene = new THREE.Scene();

    scene.add(passthruMesh);

    return {scene, uniforms};
}


function init() {
    drawLoopMaterial = instantiateDrawLoopMaterial();

    gestureScenes = [0, 1, 2, 3].map(i => createGestureScene(i));
    compositingScene = createCompositingScene(gestureScenes);
    passthruSceneInfo = createPassthroughScene(compositingScene);

    createTargetSelector();

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

    window.recordingManager = recordingManager;
    window.runningLoops = runningLoops;
}

function onWindowResize() {
    renderer.setSize(window.innerWidth/SCALE, window.innerHeight/SCALE);
    //todo - resize all targets
    Object.values(targets).map(target => target.setSize(window.innerWidth/SCALE, window.innerHeight/SCALE))
}

function animate() {
    requestAnimationFrame(animate);

    runLoops();

    time = Date.now()/1000 - startTime;

    gestureScenes.forEach(gs => {
        gs.renderGesture()
    });

    compositingScene.renderCompositingScene();

    passthruSceneInfo.uniforms.passthru.value = targets[datGuiProps.target].texture;
    renderer.setRenderTarget(null);
    renderer.render(passthruSceneInfo.scene, camera);

    stats.update();
    fdbkInd++;
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

// eslint-disable-next-line no-unused-vars
let uvShader = glsl`
varying vec2 vUv;

uniform float time;

void main()	{
    gl_FragColor = vec4(vUv, sinN(time), 1.);
}`;

let feedbackShader = glsl`
varying vec2 vUv;

uniform float time;
uniform sampler2D scene;
uniform sampler2D backbuffer;
uniform float gestureInd;
uniform float warpAmt;
uniform float decay2;

vec2 rowSplit(vec2 vUv, float t, float num, float amt) {
    float dir = mod(quant(vUv.y, num) * num, 2.) < 0.1 ? -amt : amt;
    return vUv + vec2(dir, 0.);
}

vec2 getWarpN() {
    if(gestureInd < 2.) {
        return mix(vUv, coordWarp(vUv, time).xy, warpAmt);
    } else {
        return rowSplit(vUv, time, 10., warpAmt * 0.2);
    }
}

void main() {
    vec4 sceneCol = texture(scene, vUv);
    vec2 warpN = getWarpN();
    vec4 bb = texture(backbuffer, warpN);
    bool draw = sceneCol.a == 1.;
    float decay = 0.002;
    float fdbk = 0.;
    float lastFdbk = bb.a;
    vec3 col;
    vec3 foreground = sceneCol.rgb;
    vec3 background = black;
    if(draw) {
        fdbk = 1.;
        col = foreground;
    } else {
        fdbk = lastFdbk - decay;
        fdbk = lastFdbk * decay2;
        fdbk = fdbk < 0.01 ? 0. : fdbk;
        col = mix(background, bb.rgb, fdbk < 0.01 ? 0.: 1.);
    }
    
    gl_FragColor = vec4(vec3(col), fdbk);
}
`;

let passthruShader = glsl`
varying vec2 vUv;
uniform sampler2D passthru;

void main()	{
    gl_FragColor = texture(passthru, vUv);
}`;

let drawLoopShader = glsl`
varying vec2 vUv;
uniform float time;
uniform float gestureInd;

void main()	{
    vec3 gestCol = hash(vec3(gestureInd*5.+5., 12, 20))*0.5 + 0.5;
    vec3 col = quant(vUv.y, 10.)  * gestCol;
    gl_FragColor = vec4(col, 1);
}`;

let compositingShader = glsl`
#pragma vscode_glsllint_stage : frag

varying vec2 vUv;
uniform float time;
uniform sampler2D scene0;
uniform sampler2D scene1;
uniform sampler2D scene2;
uniform sampler2D scene3;

void main() {
    vec4 col0 = texture(scene0, vUv);
    vec4 col1 = texture(scene1, vUv);
    vec4 col2 = texture(scene2, vUv);
    vec4 col3 = texture(scene3, vUv);

    vec4 pick1 = col0.a > col1.a ? col0 : col1;
    vec4 pick2 = col2.a > col3.a ? col2 : col3;

    vec4 pick = pick1.a > pick2.a ? pick1 : pick2;

    gl_FragColor = pick;

}

`;