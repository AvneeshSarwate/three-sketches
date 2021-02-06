import { Voronoi } from "../../libs/rhill-voronoi-core.js"
import { SimplexNoise } from "../../node_modules/three/examples/jsm/math/SimplexNoise.js"
import * as THREE from "../../node_modules/three/build/three.module.js";
import { getCellPoints } from "../../utilities/voronoi_manager.js";
import { Earcut } from "../../node_modules/three/src/extras/Earcut.js"


function range(size, startAt = 0) {
    return [...Array(size).keys()].map(i => i + startAt);
}


let simplex = new SimplexNoise();
let numSites = 10;
let voronoiSceneComponents = {
    sites: [],
    scene: {},
    geometries: [],
    materials: [],
    uniforms: {}
};
let time;


function createVoronoiScene() {
    voronoiSceneComponents.sites = range(timeNoise2d(0));
    voronoiSceneComponents.geometries
}

function updateVoronoiScene(time) {
    let {sites, scene, geometries, materials, uniforms} = voronoiSceneComponents;
    let newSites = sites.map((e, i) => timeNoise2d(51.32, 21.32, time-i));

    voronoiSceneComponents.sites = newSites;
}

function updateGeometryFromVoronoiCell(cell, bufferGeom) {
    let cellPts = getCellPoints(cell);
    let triangulatedPts = Earcut.triangulate(cellPts.flat());
    let uvPts = Float32Array.from(triangulatedPts.map(([x, y]) => [(x+1)/2, (y+1)/2]).flat());
    let cell3d = Float32Array.from(triangulatedPts.map(([x, y]) => [x, y, 0]).flat());

    bufferGeom.setAttribute('position', new THREE.BufferAttribute(cell3d, 3));
    bufferGeom.setAttribute('uv', new THREE.BufferAttribute(uvPts, 3));
}

function init() {
    
}

function timeNoise2d(xRand, yRand, time){
    return [simplex.noise(xRand, time), simplex.noise(yRand, time)];
}

function animate() {
    time = Date.now() / 1000;
   


}



export {
    init,
    animate
}