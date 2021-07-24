import { Voronoi } from "../../libs/rhill-voronoi-core.js"

import { SimplexNoise } from "../../node_modules/three/examples/jsm/math/SimplexNoise.js"
import * as dat from '../../node_modules/dat.gui/build/dat.gui.module.js';
import * as THREE from "../../node_modules/three/build/three.module.js";
import { Earcut } from "../../node_modules/three/src/extras/Earcut.js";
import Stats from "../../node_modules/three/examples/jsm/libs/stats.module.js";

import { getCellPoints } from "../../utilities/voronoi_manager.js";
import { htmlToElement } from "../../utilities/utilityFunctions.js"

import header_code from "../../header_frag.js";
//template literal function for use with https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
//backup fork at https://github.com/AvneeshSarwate/vscode-glsl-literal
const glsl = a => a[0];

function range(size, startAt = 0) {
    return [...Array(size).keys()].map(i => i + startAt);
}

let randColor = () =>  '#'+Math.floor(Math.random()*16777215).toString(16);

const gui = new dat.GUI();
const guiParams = {pause: false, liveMouse: true, colorSelection: true};
gui.add(guiParams, 'pause');
gui.add(guiParams, 'liveMouse');
gui.add(guiParams, 'colorSelection');

let simplex = new SimplexNoise();
let numSites = 3**2;
//each polygon buffer will have to have enough verts to account for each other polygon and the bounding box sides
//todo - get this number right wrt number of sites - currently a guess
let numVert = numSites + 8*2; 
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

let videos = {
    vidKey:  {
        uri: '../../media_assets/eye_movement_short_small2.mp4',
        texture: null
    }
};

//todo - per site, have a dropdown that lets you select the video texture that fills it
// handler updates uniform in voronoiSceneComponents.uniforms[i]

Object.keys(videos).forEach(vidKey => {
    let video = htmlToElement(`<video id="video" style="display:none" loop autoplay playsinline></video>`)
    videos[vidKey].texture = new THREE.VideoTexture(video);
    window.vid = video;

    fetch(videos[vidKey].uri).then(async (res) => {
        let videoBlob = await res.blob();
        video.src = URL.createObjectURL(videoBlob);
        document.body.append(video);
        video.muted = true;
        video.play()
    })
});


let cam, time, renderer, stats, diagram;
let startTime = Date.now()/1000;

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
            ind:  {value: 0},
            video: {value: Object.values(videos)[0].texture},
            isSelected: {value: false},
        },
        side: THREE.DoubleSide
    })
    vsc.materials = range(numSites).map((i) => {
        let mat = baseMaterial.clone();
        mat.uniforms = { 
            time: {value: Math.PI/2},
            ind:  {value: i},
            video: {value: Object.values(videos)[0].texture},
            isSelected: {value: false}
        };
        return mat
    });
    vsc.meshes = range(numSites).map(i => new THREE.Mesh(vsc.geometries[i], vsc.materials[i]));
    
    var nth = 0;
    vsc.meshes.forEach((mesh, i) => {
        mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
            material.uniforms.time.value = time/0.08*2;
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

let pf = (i, time) =>  timeNoise2d(51.32, 21.32, time*2-i*0.07);
let pf2 = (i, time) => vec2(Math.cos(time-i),  Math.sin(time-i));
let pf3 = (i, time) => {
    let rowSize = numSites**0.5;
    let row = Math.floor(i/rowSize) / rowSize + (0.5 / rowSize);
    let col = (i % rowSize) / rowSize + (0.5 / rowSize);
    return vec2(lerp1(-1,1,col), lerp1(-1,1,row))
}
let pf4 = (i, time) => {
    let rad = i%2 == 0 ? 1 : 0.5;
    return vec2(Math.cos(time-i)*rad,  Math.sin(time-i)*rad)
}

function updateVoronoiScene(t) {
    let vsc = voronoiSceneComponents;
    vsc.sites.forEach((s, i) => Object.assign( s,  pf2(i, t*(1+i*0.4)*4)));
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

let rangeMap = (n, min, range) => (n-min)/range;

function boxClipUVs(pts) {
    let bbox = getCellBBox(pts);
    let normalize = ([x, y]) => [rangeMap(x, bbox.minX, bbox.xRange), rangeMap(y, bbox.minY, bbox.yRange)];
    let normedPts = pts.map(normalize);
    return normedPts;
}

function updateGeometryFromVoronoiCell(cell, bufferGeom, ind, initialCreation=false) {
    let vsc = voronoiSceneComponents;
    let cellBuffers = vsc.buffers[ind];
    let cellPts = getCellPoints(cell, cellBuffers.cellPts, true);

    let triangulatedPts = Earcut.triangulate(cellPts.flat(), [], 2);
    let uvs = boxClipUVs(cellPts).flat();

    triangulatedPts.forEach((ind, i) => {

        cellBuffers.uvPts[i*2]   = uvs[ind*2];
        cellBuffers.uvPts[i*2+1] = uvs[ind*2+1];
    
        cellBuffers.cell3d[i*3]   = cellBuffers.cellPts[ind*2];
        cellBuffers.cell3d[i*3+1] = cellBuffers.cellPts[ind*2+1];
        cellBuffers.cell3d[i*3+2] = 0;
    });

    bufferGeom.setDrawRange(0, triangulatedPts.length)

    if(initialCreation) {
        bufferGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(numVert * 3), 3));
        bufferGeom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(numVert * 2), 2));
        // bufferGeom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(numVert * 3), 3));
        //todo - create normals to allow ray-intersection to work on a buffer geometry
    } else {
        bufferGeom.getAttribute('position').copyArray(cellBuffers.cell3d);
        bufferGeom.getAttribute('uv').copyArray(cellBuffers.uvPts);
        bufferGeom.attributes.position.needsUpdate = true;
        bufferGeom.attributes.uv.needsUpdate = true;

        //todo - why does this need to be calculated when it looks like it's calculated internally if it doesnt 
        //exist by raycaster.intersectObject?
        bufferGeom.computeBoundingSphere(); 
    }
}

window.onkeypress = e => {
    animate();
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
window.setMouse = (a, b) => {
    mouse.x = a;
    mouse.y = b;
}
window.mouse = mouse;

function onMouseMove( event ) {

	// calculate mouse position in normalized device coordinates
	// (-1 to +1) for both components

    if(guiParams.liveMouse) {
    	mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	    mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
    }
}

function init() {

    createVoronoiScene();

    // cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cam = new THREE.PerspectiveCamera( 90, 1, 0.1, 1000 );
    cam.position.z = 1;
    window.camera = cam;

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
    window.addEventListener( 'mousemove', onMouseMove, false );
}

function onWindowResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function timeNoise2d(xRand, yRand, time){
    return  vec2(simplex.noise(xRand, time),  simplex.noise(yRand, time));
}

function colorMouseOverObject() {
    // update the picking ray with the camera and mouse position
	raycaster.setFromCamera( mouse, cam );

    // calculate objects intersecting the picking ray
    voronoiSceneComponents.meshes.forEach(mesh => {
        mesh.material.uniforms.isSelected.value = false;
    })

    if(guiParams.colorSelection) {
        const intersects = raycaster.intersectObjects( voronoiSceneComponents.meshes );
        console.log("num intersects", intersects.length)
        intersects.forEach(intsec => {
            intsec.object.material.uniforms.isSelected.value = true;
        })
    }
}

function animate() {
    requestAnimationFrame(animate);

    colorMouseOverObject();

    renderer.render(voronoiSceneComponents.scene, cam);

    if(!guiParams.pause) time = Date.now() / 1000 - startTime;
   
    updateVoronoiScene(time * 0.08);

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
uniform sampler2D video;
uniform bool isSelected;

void main()	{
    float t = time*.03; //todo - why does commenting this line out stop "time" uniform value from being bound?
    float col = pow(1. - abs(distance(vUv, vec2(0.5)) - sinN(t+ind)/2.)*4., 4.);
    float col2 = pow(1. - distance(vec2(sinN(t), cosN(t)), vUv), 4.);
    vec4 vid = texture(video, mix(vUv, vec2(0.5), 0.4));
    gl_FragColor = isSelected ? vec4(red, 1.) : vid; //vec4(vec3(col), 1.);
}`;

