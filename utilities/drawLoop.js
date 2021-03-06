import {oscV, oscH} from '../../utilities/oscManager.js';

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
        this.transform = a => a;
        this.wrapBox = {
            x: {min: -1, max: 1},
            y: {min: -1, max: 1},
        }
    }

    update(deltaTransform) {
        this.ind %= this.deltas.length;

        if (!deltaTransform) deltaTransform = a => a;
        let newDelta = deltaTransform(this.deltas[this.ind]);
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

            oscH.on2(`/${recordAddr}/${i}/1`, ([onOff]) => {
                if(onOff){
                    this.isRecording[i] = true;
                    this.loops[i] = [];
                    this.resetDrawStart[i] = true;
                    this.recordingIndex = i;
                }
            }, 10)

            oscH.on2(`/${xyAddr}/${i}/z`, ([onOff]) => {
                if(!onOff) {
                    this.isRecording[i] = false;
                }
            }, 10);

            oscH.on2(`/${xyAddr}/${i}`, ([x, y]) => {
                let rind = this.recordingIndex;
                if(this.isRecording[rind]) {
                    console.log("rec", rind)
                    if(this.resetDrawStart[rind]) {
                        this.resetDrawStart[rind] = false;
                        this.drawStart[rind] = {x, y};
                        console.log("dstart", rind)
                    } else {
                        let lt = this.lastTouch[i];
                        this.loops[rind].push({x: x - lt.x, y: y - lt.y});
                        console.log("ddelt", rind)
                    }
                }
                this.lastTouch[i] = {x, y};
            }, 10);            
        })
    }
}


export {
    DrawLoop,
    RecordingManager
}