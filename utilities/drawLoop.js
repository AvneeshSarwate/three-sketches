import {oscV, oscH} from '../../utilities/oscManager.js';
import * as THREE from "../node_modules/three/build/three.module.js";

let mod = function(t, n) {
    return ((t % n) + n) % n;
};

let rangeWrap = (num, min, max) => {
    let range = max - min;
    let distFromMin = num - min;
    return min + mod(distFromMin, range)
}

class DrawLoop {
    constructor(pos) {
        this.deltas = [];
        this.deltaHistory = [];
        this.ind = 0;
        this.pos = pos;
        this.transform = a => a.clone();
        this.wrapBox = {
            x: {min: -1, max: 1},
            y: {min: -1, max: 1},
        }
        this.deltaScale = new THREE.Vector3(1, 1, 0);
    }

    update(deltaTransform) {
        this.ind %= this.deltas.length;

        let newDelta = deltaTransform(this.deltas[this.ind]).multiply(this.deltaScale);
        this.pos.add(newDelta);

        let newX = rangeWrap(this.pos.x, this.wrapBox.x.min, this.wrapBox.x.max);
        let newY = rangeWrap(this.pos.y, this.wrapBox.y.min, this.wrapBox.y.max);
        if(isNaN(newX) || isNaN(newY)) {
            debugger;
        }
        this.pos.x = newX;
        this.pos. y = newY;
        this.ind++;
    }

    step(transform) {
        let deltaTransform = transform ?? this.transform;
        this.update(deltaTransform);
    }
}

//recording and playback of loops based on https://www.dropbox.com/s/y8a4357hjjjg94j/gesture_vis.touchosc?dl=0
class RecordingManager {
    constructor(xyAddr, recordAddr) {
        this.lastTouch = {};
        this.isRecording = {}
        this.resetDrawStart = {};
        this.drawStart = {}
        this.loops = {};
        this.recordingIndex = 0;
        [1, 2, 3, 4].forEach(i => {

            oscH.on(`/${recordAddr}/${i}/1`, ([onOff]) => {
                if(onOff){
                    this.isRecording[i] = true;
                    this.loops[i] = [];
                    this.resetDrawStart[i] = true;
                    this.recordingIndex = i;
                }
            }, 10)

            oscH.on(`/${xyAddr}/${i}/z`, ([onOff]) => {
                if(!onOff) {
                    this.isRecording[this.recordingIndex] = false;
                }
            }, 10);

            oscH.on(`/${xyAddr}/${i}`, ([x_in, y_in]) => {
                let {x, y} = touchOSCRemap(x_in, y_in);
                let rind = this.recordingIndex;
                if(this.isRecording[rind]) {
                    if(this.resetDrawStart[rind]) {
                        this.resetDrawStart[rind] = false;
                        this.drawStart[rind] = {x, y};
                    } else {
                        let lt = this.lastTouch[i];
                        this.loops[rind].push({x: x - lt.x, y: y - lt.y});
                    }
                }
                this.lastTouch[i] = {x, y}; //scaling touch starts from [0,1] to [-1,1]
                //TODO: clean up touchOSC to three.js coordinate mapping (just make touchOSC template [-1, 1] with correct up/down?)
            }, 10);            
        })
    }
}

function touchOSCRemap(x, y) {
    y = -1 + (-y)*2;
    x = -1 + x*2;
    return {x, y};
}

function saveLoops(recordingManager, loopSetName='default_name') {
    let sketchPath = window.location.pathname;
    let sketchId = (new URLSearchParams(window.location.search)).get('id');
    let bodyData = {
        sketchPath, 
        loopSetName, 
        loopsAndMetaData: {
            sketchPath,
            loopSetName,
            sketchId,
            loops: recordingManager.loops
        }
    }
    fetch('/saveGestureLoops', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyData)
    }).then(res => {
        console.log("save attempted", res, bodyData);
    })
}


export {
    DrawLoop,
    RecordingManager,
    saveLoops
}