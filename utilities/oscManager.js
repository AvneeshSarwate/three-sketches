//requires node_modules/osc/dist/osc-browser.js to be imported via script tag

let oscValueStorage = {};

class OscHandler {
    constructor(){
        this.handlers = {}
        this.dedupHandlers = {};
        this.dedupTracker = {};
    }

    //handler functions take a single array of args and should use destructuring assignment
    on(addr, msgHandler){
        this.handlers[addr] = msgHandler
    }

    //method to handle issue of OSC apps sending duplicate messages to windows.
    //only triggers if no message has come in for this address {waitTime} miliseconds before
    //WILL NOT WORK IF MESSAGES ARE **NOT** BEING DOUBLE SENT
    on2(addr, msgHandler, waitTime){
        this.dedupHandlers[addr] = {msgHandler, waitTime, lastEvt: Date.now()};
    }
}

let oscHandler = new OscHandler();

let oscPort = new osc.WebSocketPort({
    url: `ws://${location.hostname}:8081`
});

oscPort.open();

oscPort.on("message", (message) => {
    try {
        let {address, args} = message;
        let addrKey = address.slice(1);

        if(!oscValueStorage[addrKey]) oscValueStorage[addrKey] = {};

        oscValueStorage[addrKey].v = args;
        oscValueStorage[addrKey].unread = true;
        oscValueStorage[addrKey].seen = true;

        let msgHandler = oscHandler.handlers[address];
        if(msgHandler) msgHandler(args); 

        //message handling for the handlers set with the on2() method (for windows message duplication bug)
        let dedupHandler = oscHandler.dedupHandlers[address];
        if(dedupHandler) {
            // console.log("osc", message);

            let nowTime = Date.now();
            if(nowTime - dedupHandler.lastEvt < dedupHandler.waitTime){
                dedupHandler.msgHandler(args)
            }
            dedupHandler.lastEvt = nowTime;
        }

    } catch(e) {
        console.error(e)
    }
})


let proxyHandler = {
    get: (target, prop, reciever) => {
        let retVal = target[prop] ?
            { v: target[prop].v, unread: target[prop].unread, seen: true}
        :   { v: 0, unread: true, seen: false }
        if(target[prop]) target[prop].unread = false;
        return retVal;
    }
}

let oscProxy = new Proxy(oscValueStorage, proxyHandler);

export {
    oscProxy as oscV,
    oscHandler as oscH
};