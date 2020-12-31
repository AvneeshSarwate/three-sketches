import * as THREE from "../../three.module.js";
import Stats from "../../stats.module.js";
import header_code from "../../header_frag.js";
//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];

function range(size, startAt = 0) {
    return [...Array(size).keys()].map(i => i + startAt);
}

const orig = new THREE.Vector2(0, 0);

let scene, polygonGeometry, camera, renderer, stats;


const numSides = 4;

function init() {

    //setting up scene =================================

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    let points = range(numSides).map (i => {
        let angle = Math.PI * 2 * i / numSides + Math.PI/4;
        let pt = new THREE.Vector2(0.5 + Math.random()*0., 0);
        pt.rotateAround(orig, angle);
        return pt;
    });

    polygonGeometry = new THREE.ShapeGeometry(new THREE.Shape(points, 1));
    const material = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: header_code + uvColorShader
    });
    const mesh = new THREE.Mesh( polygonGeometry, material );
    scene.add( mesh );

    let circle = new THREE.PlaneBufferGeometry(0.2, .2);
    let circleMesh = new THREE.Mesh(circle, material);
    scene.add(circleMesh);

    //setting up rendering ==============================    

    const container = document.getElementById("container");

    renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    stats = new Stats();
    container.appendChild(stats.dom);

    onWindowResize();
    window.addEventListener("resize", onWindowResize, false);
}

function onWindowResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    polygonGeometry.vertices[0].x = Math.sin(Date.now()/1000);
    polygonGeometry.verticesNeedUpdate = true;
    // polygonGeometry.elementsNeedUpdate = true;
    // polygonGeometry.uvsNeedUpdate = true;

    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    stats.update();
}

export { init, animate };

let vertexShader = glsl`
varying vec2 vUv;

void main()	{

  vUv = uv;

  vec3 p = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

}`;

let uvColorShader = glsl`
varying vec2 vUv;

void main()	{
  gl_FragColor = vec4(vUv, 1., 1.);
}`;