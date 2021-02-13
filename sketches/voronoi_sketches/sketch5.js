import { Voronoi } from "../../libs/rhill-voronoi-core.js"
import { SimplexNoise } from "../../node_modules/three/examples/jsm/math/SimplexNoise.js"
import * as THREE from "../../node_modules/three/build/three.module.js";
import { getCellPoints } from "../../utilities/voronoi_manager.js";
import { Earcut } from "../../node_modules/three/src/extras/Earcut.js";
import Stats from "../../node_modules/three/examples/jsm/libs/stats.module.js";
import header_code from "../../header_frag.js";
//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];

function range(size, startAt = 0) {
    return [...Array(size).keys()].map(i => i + startAt);
}

let randColor = () =>  '#'+Math.floor(Math.random()*16777215).toString(16);

let simplex = new SimplexNoise();
let numSites = 4;
let numVert = numSites + 8; //each polygon buffer will have to have enough verts to account for each other polygon and the bounding box sides
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
    let baseMaterial = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: header_code + radialShader,
        uniforms: { 
            time: {value: 0},
            ind:  {value: 0}
        }
    })
    vsc.materials = range(numSites).map((i) => {
        let mat = baseMaterial.clone();
        mat.uniforms = { 
            time: {value: Math.PI/2},
            ind:  {value: i}
        };
        return mat
    });
    vsc.meshes = range(numSites).map(i => new THREE.Mesh(vsc.geometries[i], vsc.materials[i]));
    
    var nth = 0;
    vsc.meshes.forEach((mesh, i) => {
        mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
            material.uniforms.time.value = time/0.08*2;
            if(i == 0 && nth++%15 == 0) {
                material.uniforms.ind.value = nth;
                console.log(material.uniforms.time.value)
            }
         }
    })

    vsc.buffers = range(numSites).map(i => {
        return {
            cellPts: new Float32Array(numVert * 2),
            uvPts: new Float32Array(numVert * 2),
            cell3d: new Float32Array(numVert * 3)
        }
    })

    diagram = recomputeVoronoi();

    vsc.scene = new THREE.Scene();

    range(numSites).forEach(i => {
        updateGeometryFromVoronoiCell(diagram.cells[i], vsc.geometries[i], i, true);
        vsc.scene.add(vsc.meshes[i]);
    });
}

let vec2 = (x,y) => new THREE.Vector2(x, y);
let sinN = n => (Math.sin(n)+1)/2;
let lerp1 = (n1, n2, a) => n1*(1-a) + a*n2;

let pf = i =>  timeNoise2d(51.32, 21.32, time*2-i*0.07);
let pf2 = i => vec2(Math.cos(time-i),  Math.sin(time-i));
let pf3 = i => {
    let rowSize = numSites**0.5;
    let row = Math.floor(i/rowSize) / rowSize + (0.5 / rowSize);
    let col = (i % rowSize) / rowSize + (0.5 / rowSize);
    return vec2(lerp1(-1,1,col), lerp1(-1,1,row))
}
let pf4 = i => {
    let rad = i%2 == 0 ? 1 : 0.5;
    return vec2(Math.cos(time-i)*rad,  Math.sin(time-i)*rad)
}

function updateVoronoiScene(time) {
    let vsc = voronoiSceneComponents;
    vsc.sites.forEach((s, i) => Object.assign( s, pf3(i).lerp( pf4(i).lerp(pf(i), sinN(time*6,28)), 0.2) ))
    // Object.assign(vsc.sites[0], {x: 0, y: 0});
    
    try {
        voronoi.recycle(diagram);
        diagram = recomputeVoronoi();
    } catch {
        voronoi = new Voronoi();
        diagram = null;
        return
    }

    /* Important - cell order does not reflect input site order - the the voronoiID, 
       which the voronoi library adds onto the site objects,
       maps the site => its corresponding cell */
    vsc.sites.forEach((site, i) => {
        updateGeometryFromVoronoiCell(diagram.cells[site.voronoiId], vsc.geometries[i], i); 
    });
}


let mod = (v, n) => ((v%n)+n)%n;

let getCellBBox = pts => {
    let maxX = -Infinity, maxY = -Infinity, minX = Infinity, minY = Infinity;
    for(let i = 0; i < pts.length; i++) {
        let [x, y] = pts[i]
        if(x > maxX) maxX = x;
        if(x < minX) minX = x;
        if(y > maxY) maxY = y;
        if(y < minY) minY = y;
    }
    return {maxX, maxY, minX, minY, xRange: maxX-minX, yRange: maxY-minY};
}

function updateGeometryFromVoronoiCell(cell, bufferGeom, ind, initialCreation=false) {
    let vsc = voronoiSceneComponents;
    let cellBuffers = vsc.buffers[ind];
    let cellPts = getCellPoints(cell, cellBuffers.cellPts, true);
    let cellBBox = getCellBBox(cellPts);

    let triangulatedPts = Earcut.triangulate(cellPts.flat(), [], 2);

    triangulatedPts.forEach((ind, i) => {
        // uv of whole quad
        // cellBuffers.uvPts[i*2]   = (cellBuffers.cellPts[ind*2]   + 1)/2;
        // cellBuffers.uvPts[i*2+1] = (cellBuffers.cellPts[ind*2+1] +1 )/2

        cellBuffers.uvPts[i*2]   = (cellBuffers.cellPts[ind*2]   - cellBBox.minX)/cellBBox.xRange;
        cellBuffers.uvPts[i*2+1] = (cellBuffers.cellPts[ind*2+1] - cellBBox.minY)/cellBBox.yRange;
    
        cellBuffers.cell3d[i*3]   = cellBuffers.cellPts[ind*2];
        cellBuffers.cell3d[i*3+1] = cellBuffers.cellPts[ind*2+1];
        cellBuffers.cell3d[i*3+2] = 0;
    });
    []
    bufferGeom.setDrawRange(0, triangulatedPts.length)

    if(initialCreation) {
        bufferGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(numVert * 3), 3));
        bufferGeom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(numVert * 2), 2));
    } else {
        bufferGeom.getAttribute('position').copyArray(cellBuffers.cell3d);
        bufferGeom.getAttribute('uv').copyArray(cellBuffers.uvPts);
        bufferGeom.attributes.position.needsUpdate = true;
        bufferGeom.attributes.uv.needsUpdate = true;
    }
}

window.onkeypress = e => {
    animate();
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
    return  vec2(simplex.noise(xRand, time),  simplex.noise(yRand, time));
}

function animate() {
    // requestAnimationFrame(animate);

    renderer.render(voronoiSceneComponents.scene, cam);

    time = Date.now() / 1000 * 0.08;
   
    updateVoronoiScene(time);

    stats.update();
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

void main()	{
    gl_FragColor = vec4(vUv, 0., 1.);
}`;

let radialShader = glsl`
varying vec2 vUv;

uniform float time;
uniform float ind;

void main()	{
    float t = time*3.;
    float col = pow(1. - abs(distance(vUv, vec2(0.5)) - sinN(t)/2.)*4., 4.);
    float col2 = pow(1. - distance(vec2(sinN(t), cosN(t)), vUv), 4.);
    gl_FragColor = vec4(vec3(hash(vec3(ind, 4., 3.))), 1.);
}`;

