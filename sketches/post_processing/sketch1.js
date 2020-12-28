import * as THREE from "../../three.module.js";
import Stats from "../../stats.module.js";
import header_code from "../../header_frag.js";
import { OrbitControls } from "../../examples/jsm/controls/OrbitControls.js"

let camera, paintingScene, warpScene, feedbackScene, passthruScene, renderer, stats;

let startTime = performance.now()/1000;
let paintingUniforms, warpUniforms, feedbackUniforms, passthruUniforms, time;

let backgroundTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
let feedbackTargets = [0,1].map(() => new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight));
let fdbkInd = 0;

let warpSceneTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
warpSceneTarget.depthTexture = new THREE.DepthTexture();
warpSceneTarget.depthTexture.format = THREE.DepthFormat;
warpSceneTarget.depthTexture.type = THREE.UnsignedIntType;



//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];

let gridSize = 5;

let lerp = (v1, v2, a) => (1 - a) * v1 + a * v2;
let sinN = n => (Math.sin(n)+1)/2;

function createTile(i, j, gridSize, referenceMaterial, painting_texture) {
    let tileSize = 1 / gridSize * 2;
    let gridInd = i * gridSize + j;
    const geometry = new THREE.CircleBufferGeometry(tileSize/4, 50, 50);
    const newMaterial = new THREE.MeshBasicMaterial();

    newMaterial.color.set("#276294");

    let tileMesh = new THREE.Mesh(geometry, newMaterial);

    let xRoot = tileMesh.position.x = lerp(-1, 1, i / gridSize) + 1/gridSize;
    let yRoot = tileMesh.position.y = lerp(-1, 1, j / gridSize) + 1/gridSize;
    tileMesh.position.z = 0;

    let cellPhase = Math.random()*Math.PI*2;
    let dev = (1 + Math.random()) * 1;
    let rands = [0,1,2].map(i => Math.random());
    let normColor = n => {
        let int256 = Math.floor(n*256);
        let leadZero = int256  < 16 ? "0" : "";
        return leadZero + int256.toString(16);
    };
    let colorCycle = () => {
        let colors = rands.map(r => normColor( sinN(time*(.7+r*0.3)) ));
        let colorString = '#'+colors.join("");
        return colorString;
    };

    tileMesh.onBeforeRender = function(renderer, scene, camera, geometry, material, group){
        // material.uniforms.time.value = time;
        material.color.set(colorCycle());
        tileMesh.position.x = xRoot + Math.cos(time + cellPhase)*(1/gridSize/2) * dev;
        tileMesh.position.y = yRoot + Math.sin(time + cellPhase)*(1/gridSize/2) * dev;
        tileMesh.scale.x = tileMesh.scale.y =  1; 0.6 + sinN(time * dev)*0.5;
    }

    return tileMesh;
}

function createPaintingSamplerScene() {
    paintingScene = new THREE.Scene();

    const painting_texture = new THREE.TextureLoader().load("../../yegor_painting.jpg");

    paintingUniforms = {
        time: { value: 1.0 },
        xInd: { value: 0 },
        yInd: { value: 0 },
        gridSize: { value: 1 },
        painting: { value: painting_texture },
        webcam: { value: webcamTexture }
    };

    const material = new THREE.ShaderMaterial({
        uniforms: paintingUniforms,
        vertexShader: vertexShader,
        fragmentShader: header_code + paintingSamplingShader
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

// let planeMesh;
function createSphereScene(){
    warpScene = new THREE.Scene();
    const planeGeometry = new THREE.SphereBufferGeometry(0.5, 100, 100);
    warpUniforms = {
        time: {value : 0},
        scene: {value: backgroundTarget.texture}
    }
    let samplingMaterial = new THREE.ShaderMaterial({
        uniforms: warpUniforms,
        vertexShader: sphereWarpShader,
        fragmentShader: header_code + textureWarpShader
    });
    samplingMaterial.side = THREE.DoubleSide;
    let numSpheres = 3;
    for(let i = 0; i < numSpheres; i++) {
        let planeMesh = new THREE.Mesh(planeGeometry, samplingMaterial);
        planeMesh.position.z = -1.;
        let randTimes = [1.5 - Math.random(), 1.5 - Math.random()];
        planeMesh.onBeforeRender = function(renderer, scene, camera, geometry, material, group){
            let quat1 = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), time * randTimes[0] );
            let quat2 = new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 1, 0, 0 ), time * randTimes[1] );
            // quat2.slerp(quat1, 0.5);
            if(i%2 == 0) planeMesh.rotation.setFromQuaternion(quat1);
            else planeMesh.rotation.setFromQuaternion(quat2)
        }
        planeMesh.position.x = -1 + (i+0.5)/numSpheres * 2;
        warpScene.add(planeMesh);
    }

}

function initWebcam() {
    if ( navigator.mediaDevices && navigator.mediaDevices.getUserMedia ) {

        const constraints = { video: { width: 1280, height: 720, facingMode: 'user' } };

        navigator.mediaDevices.getUserMedia( constraints ).then( function ( stream ) {

            // apply the stream to the video element used in the texture

            video.srcObject = stream;
            video.play();

        } ).catch( function ( error ) {

            console.error( 'Unable to access the camera/webcam.', error );

        } );

    } else {

        console.error( 'MediaDevices interface not available.' );

    }
}

let video;
let webcamTexture;
let sphereCam;
function init() {
    const container = document.getElementById("container");

    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    sphereCam = new THREE.OrthographicCamera(-2, 2, 2, -2, 0, 100);
    let usePerspectiveCam = true;
    if(usePerspectiveCam){
        sphereCam = new THREE.PerspectiveCamera( 90, 1, 0.1, 1000 );
        // sphereCam.position.z = 0.5;
        sphereCam.position.set(1, 0.04, -1.09);

    }
    let helper = new THREE.CameraHelper(sphereCam);
    
    window.camera = camera;
    window.sphereCam = sphereCam;

    video = document.getElementById( 'video' );
    webcamTexture = new THREE.VideoTexture( video );
    
    initWebcam();

    createPaintingSamplerScene();
    createSphereScene();
    createFeedbackScene();
    createPassthroughScene();
    // warpScene.add(helper);

    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls( sphereCam, renderer.domElement );

    onWindowResize();

    stats = new Stats();
    container.appendChild(stats.dom);

    window.addEventListener("resize", onWindowResize, false);
}

function onWindowResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    [backgroundTarget, feedbackTargets, warpSceneTarget].flat().map(t => t.setSize(window.innerWidth, window.innerHeight));
}

//

function animate() {
    requestAnimationFrame(animate);

    time = performance.now() / 1000 - startTime;

    let s = Math.sin;
    sphereCam.position.set(s(time*0.3+100), s(time*0.33+5), s(time*0.36 + 20));
    sphereCam.lookAt(0, 0, -1); //center of middle sphere

    paintingUniforms.time.value = time;
    warpUniforms.time.value = time;
    feedbackUniforms.time.value = time;

    renderer.setRenderTarget(backgroundTarget);
    renderer.render(paintingScene, camera);

    renderer.setRenderTarget(warpSceneTarget);
    renderer.render(warpScene, sphereCam);

    feedbackUniforms.backbuffer.value = feedbackTargets[fdbkInd%2].texture;
    renderer.setRenderTarget(feedbackTargets[(fdbkInd+1)%2]);
    renderer.render(feedbackScene, camera);

    renderer.setRenderTarget(null);

    let usePassthru = true;
    if(usePassthru){
        passthruUniforms.passthru.value = feedbackTargets[(fdbkInd+1)%2].texture;
        renderer.render(passthruScene, camera);
    } else {
        renderer.render(feedbackScene, camera);
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

let passthruShader = glsl`
varying vec2 vUv;
uniform sampler2D passthru;

void main()	{
  gl_FragColor = texture(passthru, vUv);
}`;

let sphereWarpShader = glsl`
varying vec2 vUv;
uniform float time;

void main()	{

  vUv = uv;

  vec3 p = position*3.*3.14;
  vec3 dev = vec3(sin(time*.81+p.x), sin(time*1.22+p.y), sin(time+p.z))*0.1;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position+dev, 1.0 );

}`;

let paintingSamplingShader = glsl`
varying vec2 vUv;

uniform float time;
uniform sampler2D painting;
uniform sampler2D webcam;
uniform float xInd;
uniform float yInd;
uniform float gridSize;
uniform float tileSize;
uniform float textureSelector;

void main()	{

    vec2 uv = vUv;
    float gridShift = -1./gridSize/2.;
    vec2 cellCoord = vec2(xInd/gridSize + gridShift + uv.x*tileSize, yInd/gridSize + gridShift + uv.y*tileSize);
    vec4 paintCell = texture(painting, cellCoord);
    vec4 webcamCell = texture(webcam, cellCoord);

    float mixVal = textureSelector;pow(sinN(time+cellCoord.x*PI), 30.);


    gl_FragColor = mix(paintCell, webcamCell, mixVal);
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
    vec3 samp = texture(scene, vUv).rgb * colorTint;
    gl_FragColor = vec4(samp, 1);

}
`;

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

/*
Tile the painting onto a bunch of rects, and then have those rects swap places with each other
- alternate row and column "rotation" of a randomly selected row/column
- tile and end flies backwards over its row/column, while simultaneously the rest move one step fwd

*/