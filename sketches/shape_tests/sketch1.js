import * as THREE from "../../three.module.js";
import Stats from "../../stats.module.js";
import header_code from "../../header_frag.js";

function range(size, startAt = 0) {
    return [...Array(size).keys()].map(i => i + startAt);
}

const orig = new THREE.Vector2(0, 0);

let scene, camera, renderer, stats;


const numSides = 10;

function init() {

    //setting up scene =================================

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    let points = range(numSides).map (i => {
        let angle = Math.PI * 2 * i / numSides;
        let pt = new THREE.Vector2(0.5 + Math.random()*0.5, 0);
        pt.rotateAround(orig, angle);
        return pt;
    });

    const geometry = new THREE.BufferGeometry().setFromPoints( points );
    const material = new THREE.LineBasicMaterial( { color: 0xffffff } );

    const line = new THREE.Line( geometry, material );
    scene.add( line );

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

    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    stats.update();
}

export { init, animate };