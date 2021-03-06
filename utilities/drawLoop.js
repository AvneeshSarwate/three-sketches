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

        this.pos.x = rangeWrap(this.pos.x, this.wrapBox.x.min, this.wrapBox.x.max);
        this.pos.y = rangeWrap(this.pos.y, this.wrapBox.y.min, this.wrapBox.y.max);
        this.ind++;
    }

    step(transform) {
        let deltaTransform = transform ?? this.transform;
        this.update(deltaTransform);
    }
}

class RecordingManager {
    constructor(xyAddr, recordAddr) {
        this.lastTouch = {};
        this.isRecording = {}
        this.resetDrawStart = {};
        this.drawStart = {}
        this.loops = {};
        [1, 2, 3, 4].forEach(i => {

            oscH.on2(`/${recordAddr}/${i}/1`, ([onOff]) => {
                if(onOff){
                    this.isRecording[i] = !!onOff;
                    this.loops[i] = [];
                    this.resetDrawStart[i] = true;
                }
            }, 10)

            oscH.on2(`/${xyAddr}/${i}/z`, ([onOff]) => {
                if(!onOff) {
                    this.isRecording[i] = !!onOff;
                }
            }, 10);

            oscH.on2(`/${xyAddr}/${i}`, ([x, y]) => {
                if(this.isRecording[i]) {
                    if(this.resetDrawStart[i]) {
                        this.resetDrawStart[i] = false;
                        this.drawStart[i] = {x, y};
                    } else {
                        let lt = this.lastTouch[i];
                        this.loops[i].push({x: x - lt.x, y: y - lt.y});
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