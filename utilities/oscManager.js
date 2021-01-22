//requires node_modules/osc/dist/osc-browser.js to be imported via script tag

let oscValueStorage = {};

let oscPort = new osc.WebSocketPort({
    url: "ws://localhost:8081"
});

oscPort.open();

oscPort.on("message", (message) => {
    let {address, args} = message;
    let addrKey = address.slice(1);
    console.log("osc", message);

    if(!oscValueStorage[addrKey]) oscValueStorage[addrKey] = {};

    oscValueStorage[addrKey].v = args;
    oscValueStorage[addrKey].unread = true;
})


let proxyHandler = {
    get: (target, prop, reciever) => {
        let retVal = {
            v: target[prop].v,
            unread: target[prop].unread
        }
        target[prop].unread = false;
        return retVal;
    }
}

let oscProxy = new Proxy(oscValueStorage, proxyHandler);

export {oscProxy as oscV};