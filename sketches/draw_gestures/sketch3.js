import * as THREE from "../../node_modules/three/build/three.module.js";
import Stats from "../../node_modules/three/examples/jsm/libs/stats.module.js";
import header_code from "../../header_frag.js";

import * as dat from '../../node_modules/dat.gui/build/dat.gui.module.js';
import {Gesture, gestureManager} from '../../utilities/animationManager.js';
import {oscV, oscH} from '../../utilities/oscManager.js';
import {DrawLoop, RecordingManager, saveLoops} from '../../utilities/drawLoop.js';

//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];


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
            let mesh = createDrawLoopMesh(i-1);

            gestureScenes[i-1].loopScene.add(mesh);
            runningLoops.push({loop, mesh})
        }
    }, 10);
});

let datGuiProps = {
    saveLoops: () => {saveLoops(recordingManager)},
    loopSetName: "default_name"
};
const gui = new dat.GUI();
gui.add(datGuiProps, "saveLoops");
gui.add(datGuiProps, "loopSetName");



let randColor = () => '#'+(Math.random() * 0xFFFFFF << 0).toString(16).padStart(6, '0');

function runLoops(){
    runningLoops.forEach(lm =>{
        lm.loop.step();
        lm.mesh.position.copy(lm.loop.pos);
    })
}

let drawLoopMaterial = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    uniforms: {
        time: {value: 0},
        gestureInd: {value: 0}
    },
    fragmentShader: header_code + drawLoopShader
});

function createDrawLoopMesh(gestureInd) {
    let circle = new THREE.CircleBufferGeometry(0.04, 30, 30);
    let material = drawLoopMaterial.clone();
    material.uniforms.gestureInd = {value: gestureInd}
    let mesh = new THREE.Mesh(circle, material);
    return mesh;
}

let camera, renderer, stats, time, fdbkInd = 0;
let passthruSceneInfo;
const startTime = Date.now()/1000;
let gestureScenes; //Todo need a better word for a "composite-scene" like is created with createGestureScene()

const newTarget = () => new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

function createGestureScene(gestureInd) {
    let loopUniforms = {
        time: {value: 0},
        gestureInd: {value: gestureInd}
    };

    let loopScene = new THREE.Scene();

    let feedbackTargets = [0,1].map(newTarget);
    let loopTarget = newTarget();

    let feedbackSceneInfo = createFeedbackScene(gestureInd, loopTarget, feedbackTargets);

    function renderGesture() {
        loopUniforms.time.value = time;
        renderer.setRenderTarget(loopTarget);
        renderer.render(loopScene, camera);

        feedbackSceneInfo.uniforms.backbuffer.value = feedbackTargets[fdbkInd%2].texture;
        feedbackSceneInfo.uniforms.time.value = time;
        renderer.setRenderTarget(feedbackTargets[(fdbkInd+1)%2]);
        renderer.render(feedbackSceneInfo.scene, camera);
    }

    function getOutputTexture(fdbkInd){
        return feedbackTargets[(fdbkInd+1)%2].texture;
    }

    return {loopScene, renderGesture, getOutputTexture};
}


function createFeedbackScene(gestureInd, loopTarget, fdbkTargets){
    let plane = new THREE.PlaneBufferGeometry(2, 2);

    let uniforms = {
        backbuffer: { value: fdbkTargets[0].texture},
        scene:      { value: loopTarget.texture},
        time :      { value : 0},
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

function createPassthroughScene() {
    let plane = new THREE.PlaneBufferGeometry(2, 2);

    let uniforms = {
        passthru: { value: feedbackTargets[(fdbkInd+1)%2].texture}
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

function createCompositingScene() {

}


function init() {
    gestureScenes =[0, 1, 2, 3].map(i => createGestureScene(i));
    passthruSceneInfo = createPassthroughScene();

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
    window.sceneInfo = gestureSceneInfo;
}

function onWindowResize() {
    const scale = 2;
    renderer.setSize(window.innerWidth/scale, window.innerHeight/scale);
}

function animate() {
    requestAnimationFrame(animate);

    runLoops();

    time = Date.now()/1000 - startTime;

    gestureSceneInfo.uniforms.time.value = time;
    renderer.setRenderTarget(gestureSceneTarget);
    renderer.render(gestureSceneInfo.scene, camera);

    feedbackSceneInfo.uniforms.backbuffer.value = feedbackTargets[fdbkInd%2].texture;
    feedbackSceneInfo.uniforms.time.value = time;
    renderer.setRenderTarget(feedbackTargets[(fdbkInd+1)%2]);
    renderer.render(feedbackSceneInfo.scene, camera);

    passthruSceneInfo.uniforms.passthru.value = feedbackTargets[(fdbkInd+1)%2].texture;
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

void main() {
    vec4 sceneCol = texture(scene, vUv);
    vec4 bb = texture(backbuffer, vUv);
    gl_FragColor = mix(sceneCol, bb, 0.8);
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
    gl_FragColor = vec4(vec3(sinN(time*gestureInd)), sinN(time*gestureInd*0.2));
}`;