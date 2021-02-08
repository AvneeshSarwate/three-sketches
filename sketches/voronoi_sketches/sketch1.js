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
    meshes:  [],
    buffers: [
        {
           cellPts:[],
           uvPts: [],
           cell3d: [] 
        }
    ]
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
    vsc.meshes = range(numSites).map(i => new THREE.Mesh(vsc.geometries[i], vsc.materials[i]));

    vsc.buffers = range(numSites).map(i => {
        return {
            cellPts: new Float32Array(numSites * 2),
            uvPts: new Float32Array(numSites * 2),
            cell3d: new Float32Array(numSites * 3)
        }
    })

    diagram = recomputeVoronoi();

    vsc.scene = new THREE.Scene();

    range(numSites).forEach(i => {
        updateGeometryFromVoronoiCell(diagram.cells[i], vsc.geometries[i], i, true);
        vsc.scene.add(vsc.meshes[i]);
    });
}

function updateVoronoiScene(time) {
    let vsc = voronoiSceneComponents;
    let pointFunc = i =>  timeNoise2d(51.32, 21.32, time-i);
    let pointFunc2 = i => ({x: Math.cos(time-i), y: Math.sin(time-i)});
    vsc.sites.forEach((s, i) => Object.assign(s, pointFunc(i) ))
    // Object.assign(vsc.sites[0], {x: 0, y: 0});

    voronoi.recycle(diagram);
    diagram = recomputeVoronoi();

    /* Important - cell order does not reflect input site order - the the voronoiID, 
       which the voronoi library adds onto the site objects,
       maps the site => its corresponding cell */
    vsc.sites.forEach((site, i) => {
        updateGeometryFromVoronoiCell(diagram.cells[site.voronoiId], vsc.geometries[i], i); 
    });
}

function simpleConvexTriangulation(numSides) {
    let vertexInds = [];
    for(let i = 0; i < numSides-2; i++) {
        vertexInds.push(0);
        vertexInds.push(i+1);
        vertexInds.push(i+2);
    }
    return vertexInds;
}

function updateGeometryFromVoronoiCell(cell, bufferGeom, ind, initialCreation=false) {
    let vsc = voronoiSceneComponents;
    let cellBuffers = vsc.buffers[ind];
    let cellPts = getCellPoints(cell, cellBuffers.cellPts, true);

    let circle = n => range(n).map(i => [Math.cos(-i/n*2*Math.PI), Math.sin(-i/n*2*Math.PI)]).flat()
    let triangulatedPts = Earcut.triangulate(cellPts.flat());
    let triangulatedPts2 = simpleConvexTriangulation(cell.halfedges.length);
    if(cell.halfedges.length > 5) {
        let fsfs = 5;
    }

    for(let i = 0; i < cell.halfedges.length; i++) {
        cellBuffers.uvPts[i*2]   = (cellBuffers.cellPts[i*2]   + 1)/2;
        cellBuffers.uvPts[i*2+1] = (cellBuffers.cellPts[i*2+1] +1 )/2

        cellBuffers.cell3d[i*3]   = cellBuffers.cellPts[i*2];
        cellBuffers.cell3d[i*3+1] = cellBuffers.cellPts[i*2+1];
        cellBuffers.cell3d[i*3+2] = 0;
    }

    bufferGeom.setIndex(triangulatedPts2);
    if(initialCreation) {
        bufferGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(numSites * 3), 3));
        bufferGeom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(numSites * 2), 2));
    } else {
        bufferGeom.getAttribute('position').set(cellBuffers.cell3d);
        bufferGeom.getAttribute('uv').set(cellBuffers.uvPts);
        bufferGeom.attributes.position.needsUpdate = true;
        bufferGeom.attributes.uv.needsUpdate = true;
    }
}

function updateGeometryFromVoronoiCell_old(cell, bufferGeom, ind, initialCreation=false) {
    let vsc = voronoiSceneComponents;
    let cellPts = getCellPoints(cell, vsc.buffers[ind].cellPts, true);
    let triangulatedPts = Earcut.triangulate(cellPts.flat());
    let uvPts = cellPts.map(([x, y]) => [(x+1)/2, (y+1)/2]).flat();
    let cell3d = cellPts.map(([x, y]) => [x, y, 0]).flat();

    bufferGeom.setIndex(triangulatedPts);
    if(initialCreation) {
        bufferGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(300), 3));
        bufferGeom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(200), 2));
    } else {
        bufferGeom.getAttribute('position').set(cell3d);
        bufferGeom.getAttribute('uv').set(uvPts);
        bufferGeom.attributes.position.needsUpdate = true;
        bufferGeom.attributes.uv.needsUpdate = true;
    }
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

    renderer.render(voronoiSceneComponents.scene, cam);

    time = Date.now() / 1000 * 0.08;
   
    updateVoronoiScene(time);

    stats.update();
}

export {
    init,
    animate
}