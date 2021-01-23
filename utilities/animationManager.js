


class GestureManager {

}


/*
    TODO - composable - figure out how to make this composable 
*/

class Gesture {
    /**
     * timeFunc is called to get the time 
     *      - is a function so you can grab time values coming in over OSC from another application
     * gestureFunc has arguments (currentTime, delta, phase, this_Gesture)
    */
    constructor(timeFunc, gestureFunc, duration){
        this.timeFunc = timeFunc;
        this.gestureFunc = gestureFunc;
        this.lastTime = 0;
        this.time = 0;
        this.startTime = 0;
        this.duration = duration;
        this.isPlaying = false;

        /*
            TODO - resumable: have a fields that represents a timeline that only progresses when the animation is
            "live" - e.g so it can be smoothly paused and restarted without causing a jump
        */ 
        this.accumulatedPhase = 0; 
        this.accumulatedTime = 0;
    }

    start() {
        this.startTime = this.timeFunc();
        this.time = this.timeFunc(); //this might enable the note in TODO - resumable?
        this.isPlaying = true;
    }

    stop() {
        this.isPlaying = false;
    }

    step() {
        if(this.isPlaying) {
            this.lastTime = this.time;
            this.time = this.timeFunc();
            let delta = this.time - this.lastTime;
            let phase = ((this.time - this.startTime) / this.duration) % 1;

            this.accumulatedTime += delta;
            this.accumulatedPhase = (this.accumulatedPhase + delta/this.duration) % 1;

            this.gestureFunc(this.time, delta, phase, this);
        }
    }
}