import {oscV, oscH} from './oscManager.js';
import * as THREE from "../node_modules/three/build/three.module.js";

let mod = function(t, n) {
    return ((t % n) + n) % n;
};

let rangeWrap = (num, min, max) => {
    let range = max - min;
    let distFromMin = num - min;
    return min + mod(distFromMin, range)
}


let BPM = 120;

let msToBeats = ms => BPM/(ms*0.001);
let lerp = (v1, v2, a) => ({x: v2.x*a + v1.x*(1-a), y: v2.y*a + v1.y*(1-a)});

class DrawLoop {
    constructor(pos, startTime, endTime, positions) {
        this.positions = this.cleanGesture(startTime, endTime, positions);
        this.ind = 0;
        this.pos = pos;
        this.transform = a => a.clone();
        this.wrapBox = {
            x: {min: -1, max: 1},
            y: {min: -1, max: 1},
        }
        this.deltaScale = new THREE.Vector3(1, 1, 0);

        this.startTime = startTime;

        this.msDuration = 0;

        this.isAlive = true;
        this.aliveTime = 0;
        this.lastUpdateTime = 0;
        this.lastUpdateBeat = 0;
    }

    cleanGesture(startTime, endTime, positions, makeLoop=false) {
        let start = positions[0];
        let len = positions.length;
        let end = positions[len];

        //todo: modify positions to have net-delta be 0 if trying to create perfect loops
        let netDelta = {x: end.x - start.x, y: end.y - start.y};
        let marginalDelta = {x: netDelta.x / (len-1), y: netDelta.y/(len-1)};
        let loopFactor = makeLoop ? 1 : 0;

        let timeNormedPos = positions.map(({x, y, ts}, i) => {
            return {
                x: x - start.x + loopFactor * i * marginalDelta.x, 
                y: y - start.y + loopFactor * i * marginalDelta.y, 
                beat: msToBeats(ts-startTime)
            }
        });

        //todo: add entries before/after to pad duration to full-beats if necessary

        return timeNormedPos;
    }

    getPositionAtBeat(posL, beat, loopDur) {
        let fl = Math.floor;
    
        let i = fl(posL.length/2);
        let stepSize = posL.length/4;
    
        if(loopDur) beat %= loopDur;
    
        //todo - if beat val outisde range of list, just return first/last point if lower/greater than range
    
        let loopCondition = () => {
            let bounded = 0 <= i && i < posL.length;
            let found = posL[i-1].beat <= beat && beat < posL[i].beat
            return bounded && !found;
        }
    
        while(loopCondition()) {
            if(beat === posL[i].beat) break;
    
            if(beat < posL[i].beat) {
                i -= fl(stepSize)
            } else {
                i += fl(stepSize)
            }
            stepSize = Math.max(1, stepSize/2);
        }
    
        if(i % 1 === 0) return posL[i]
    
        let interHitTime = posL[i].beat - posL[i-1].beat;
        let hitProgressTime = beat - posL[i-1].beat;
        let hitLerpFactor = hitProgressTime / interHitTime;
    
        return lerp(posL[i-1], posL[i], hitLerpFactor);
    }

    getDelta(beat1, beat2) {
        let p1 = this.getPositionAtBeat(beat1);
        let p2 = this.getPositionAtBeat(beat2);

        return {x: p2.x - p1.x, y: p2.y - p1.y};
    }

    update(deltaTransform) {
        let updateTime = performance.now();
        let udpateBeat = msToBeats(updateTime-this.startTime);
        //todo - check isAlive (singeton loop, out-of-frame, etc)

        //todo replace with different delta update
        // this.ind %= this.deltas.length;
        // let newDelta = deltaTransform(this.deltas[this.ind]).multiply(this.deltaScale);

        //todo - check if it's a naive loop - if so just delta back to the start point + marginal time
        //something like - getDelta(0, aliveTime % loopDuration)

        let newDelta = this.getDelta(this.lastUpdateBeat, udpateBeat)


        this.pos.add(newDelta);

        let newX = rangeWrap(this.pos.x, this.wrapBox.x.min, this.wrapBox.x.max);
        let newY = rangeWrap(this.pos.y, this.wrapBox.y.min, this.wrapBox.y.max);
        if(isNaN(newX) || isNaN(newY)) {
            debugger;
        }
        this.pos.x = newX;
        this.pos. y = newY;
        this.ind++;

        this.lastUpdateTime = updateTime;
        this.lastUpdateBeat = msToBeats(updateTime);
        this.aliveTime = updateTime - this.startTime;
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
        this.drawStartPos = {};
        this.drawStartTime = {};
        this.loops = {};
        this.recordingIndex = 0;
        [1, 2, 3, 4].forEach(i => {

            //TODO: refactor index and addresses to new touchOSC

            oscH.on(`/${recordAddr}/${i}/1`, ([onOff]) => {
                if(onOff){
                    this.startRecording(i);
                }
            }, 10)

            oscH.on(`/${xyAddr}/${i}/z`, ([onOff]) => {
                if(!onOff) {
                    this.stopRecording();
                }
            }, 10);

            oscH.on(`/${xyAddr}/${i}`, ([x_in, y_in]) => {
                let {x, y} = touchOSCRemap(x_in, y_in);
                let rind = this.recordingIndex;
                if(this.isRecording[rind]) {
                    if(this.resetDrawStart[rind]) {
                        this.resetDrawStart[rind] = false;
                        this.drawStartPos[rind] = {x, y};
                        this.drawStartTime[rind] = performance.now()
                    } else {
                        this.loops[rind].push({x: x, y: y, ts: performance.now()});
                    }
                }
                this.lastTouch[i] = {x, y, ts: performance.now()}; //scaling touch starts from [0,1] to [-1,1]
                //TODO: clean up touchOSC to three.js coordinate mapping (just make touchOSC template [-1, 1] with correct up/down?)
            }, 10);            
        });
    }

    startRecording(i) {
        this.isRecording[i] = true;
        this.loops[i] = [];
        this.resetDrawStart[i] = true;
        this.recordingIndex = i;
    }

    stopRecording() {
        this.isRecording[this.recordingIndex] = false;
        this.loops[this.recordingIndex] = fixNewTouchOSCBug(this.loops[this.recordingIndex]);
    }
}

/**
 * fix touchOSC but where XY pad sends extra message preceding the "true" first message on first touch.
 * Extra message has the correct x value but y value from the last touch
 */
function fixNewTouchOSCBug(loopDeltas) {
    if(loopDeltas[0].dt < 10 && loopDeltas[0].y == 0) {
        return loopDeltas.slice(1);
    } else {
        return loopDeltas;
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