import { Voronoi } from "../../libs/rhill-voronoi-core.js"
import { SimplexNoise } from "../../node_modules/three/examples/jsm/math/SimplexNoise.js"
import * as THREE from "../../node_modules/three/build/three.module.js";
import { getCellPoints } from "../../utilities/voronoi_manager.js";
import { Earcut } from "../../node_modules/three/src/extras/Earcut.js";
import Stats from "../../node_modules/three/examples/jsm/libs/stats.module.js";


function range(size, startAt = 0) {
    return [...Array(size).keys()].map(i => i + startAt);
}

let randColor = () =>  '#'+Math.floor(Math.random()*16777215).toString(16);

let simplex = new SimplexNoise();
let numSites = 64;
let voronoi = new Voronoi(); 
let voronoiSceneComponents = {
    sites: [],
    scene: {},
    geometries: [],
    materials: [],
    uniforms: {},
    meshes:  []
};

let cam, time, renderer, stats, diagram;

function recomputeVoronoi() {
    return voronoi.compute(voronoiSceneComponents.sites, {xl: -1, xr: 1, yt: -1, yb: 1}) //TODO: might need to flip y
}

function createVoronoiScene() {
    let vsc = voronoiSceneComponents;
    vsc.sites = range(numSites).map(i => timeNoise2d(51.32, 21.32, 0-i));
    vsc.geometries = range(numSites).map(() => new THREE.BufferGeometry());
    vsc.materials = range(numSites).map(() => new THREE.MeshBasicMaterial({color: randColor()}));
    vsc.meshes = range(numSites).map(i => new THREE.Mesh(vsc.geometries[i], vsc.materials[i]))

    diagram = recomputeVoronoi();

    vsc.scene = new THREE.Scene();

    range(numSites).forEach(i => {
        updateGeometryFromVoronoiCell(diagram.cells[i], vsc.geometries[i]);
        vsc.scene.add(vsc.meshes[i]);
    });
}

function updateVoronoiScene(time) {
    let vsc = voronoiSceneComponents;
    vsc.sites.forEach((s, i) => Object.assign(s,  timeNoise2d(51.32, 21.32, time-i)))

    voronoi.recycle(diagram);
    diagram = recomputeVoronoi();

    /* Important - cell order does not reflect input site order - the the voronoiID, 
       which the voronoi library adds onto the site objects,
       maps the site => its corresponding cell */
    vsc.sites.forEach((site, i) => {
        updateGeometryFromVoronoiCell(diagram.cells[site.voronoiId], vsc.geometries[i]); 
    });
}

function updateGeometryFromVoronoiCell(cell, bufferGeom) {
    let cellPts = getCellPoints(cell, [], true);
    let triangulatedPts = Earcut.triangulate(cellPts.flat());
    let uvPts = Float32Array.from(cellPts.map(([x, y]) => [(x+1)/2, (y+1)/2]).flat());
    let cell3d = Float32Array.from(cellPts.map(([x, y]) => [x, y, 0]).flat());

    bufferGeom.setIndex(triangulatedPts);
    bufferGeom.setAttribute('position', new THREE.BufferAttribute(cell3d, 3));
    bufferGeom.setAttribute('uv', new THREE.BufferAttribute(uvPts, 2));
}

function init() {

    createVoronoiScene();

    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

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
}

function onWindowResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function timeNoise2d(xRand, yRand, time){
    return {x: simplex.noise(xRand, time), y: simplex.noise(yRand, time)};
}

function animate() {
    requestAnimationFrame(animate);

    time = Date.now() / 1000 * 0.08;
   
    updateVoronoiScene(time);

    renderer.render(voronoiSceneComponents.scene, cam);

    stats.update();
}

export {
    init,
    animate
}