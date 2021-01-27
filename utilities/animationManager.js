


class GestureManager {
    constructor(){
        //store all gestures? could get shitty for long running things with programatiaclly generated gestures
        this.gestures = []; 

        this.numGestures = 0;
        this.keyMap = {};

        this.playingGestures = new Set();
    }
    

    add(key, gesture, storeById=false) {
        if(storeById) this.gestures.push(gesture);
        gesture.id = this.numGestures++; 
        this.keyMap[key] = gesture;
    }

    //need to call this every frame to run the gestures defined
    tick() {
        this.playingGestures.forEach(g => g.step());
    }
}

let gestureManager = new GestureManager();

/*
    TODO - composable - figure out how to make this composable like generator gesture interface from old projects
*/

/*
    TODO- coordination - implement an interface for "choke groups" like in ableton?
 */

/*
   setting up gestures as generators allows set up to be a bit more elegant - the setup happens once in 
   the beinning of the function, while the "action" happens in the loop of the generator
 */

class Gesture {
    /**
     * timeFunc is called to get the time 
     *      - is a function so you can grab time values coming in over OSC from another application
     * gestureFunc has arguments (currentTime, delta, phase, this_Gesture)
    */
    constructor(key, gestureFunc, duration, timeFunc, numLoop, setupFunc){
        this.key = key;
        this.gestureFunc = gestureFunc;
        this.duration = duration ? duration : 1;
        this.timeFunc = timeFunc ? timeFunc : () => Date.now()/1000;
        this.numLoop = numLoop ? numLoop : Number.POSITIVE_INFINITY;
        this.setupFunc = setupFunc ? setupFunc : a => a; 
        this.state = {};

        this.lastTime = 0;
        this.time = 0;
        this.startTime = 0;
        this.isPlaying = false;
        this.id = null; //set by the gesture manager
        this.scale = 1;

        gestureManager.add(key, this);

        /*
            TODO - resumable: have a fields that represents a timeline that only progresses when the animation is
            "live" - e.g so it can be smoothly paused and restarted without causing a jump
        */ 
        this.accumulatedPhase = 0; 
        this.accumulatedTime = 0;
    }

    //TODO - resumable - clean up semantics of start/stop/pause/resume wrt various instance variables and resetting
    start(scale = 1) {
        this.scale = scale;
        this.startTime = this.timeFunc();
        this.time = this.timeFunc(); //this might enable the note in TODO - resumable?
        this.isPlaying = true;
        this.reset();
        gestureManager.playingGestures.add(this);
        this.setupFunc(this.state);
    }
    
    pause() {
        this.isPlaying = false;
        gestureManager.playingGestures.delete(this);
    }

    resume() {
        this.isPlaying = true;
        gestureManager.playingGestures.add(this);
    }

    reset() {
        this.accumulatedPhase = 0; 
        this.accumulatedTime = 0;
    }

    step() {
        if(this.isPlaying) {
            this.lastTime = this.time;
            this.time = this.timeFunc();
            let delta = (this.time - this.lastTime) * this.scale;
            let deltaPhase = delta/this.duration;
            let phase = ((this.time - this.startTime) / this.duration) % 1;

            this.accumulatedTime += delta;
            this.accumulatedPhase += deltaPhase; //mod it manually in the animation

            this.gestureFunc(this.accumulatedTime, this.accumulatedPhase, delta, deltaPhase, this);
        }
        if(this.accumulatedTime > this.duration * this.numLoop) {
            this.isPlaying = false;
            gestureManager.playingGestures.delete(this);
        }
    }
}

export {
    Gesture,
    gestureManager
}
