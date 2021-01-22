var osc = require("osc"),
    express = require("express"),
    WebSocket = require("ws");


// draft of serving basic page from node also
const app2 = express();
const SERVING_PORT = 9000;

app2.use(express.static('.'));

app2.get('/', (req, res) => {
    res.send('Hello World!')
});

app2.listen(SERVING_PORT, () => {
    console.log(`serving app listening at http://localhost:${SERVING_PORT}`)
});


const WEB_SOCKET_PORT = 8081;
const OSC_PORT = 57121;

var getIPAddresses = function () {
    var os = require("os"),
        interfaces = os.networkInterfaces(),
        ipAddresses = [];

    for (var deviceName in interfaces) {
        var addresses = interfaces[deviceName];
        for (var i = 0; i < addresses.length; i++) {
            var addressInfo = addresses[i];
            if (addressInfo.family === "IPv4" && !addressInfo.internal) {
                ipAddresses.push(addressInfo.address);
            }
        }
    }

    return ipAddresses;
};

// Bind to a UDP socket to listen for incoming OSC events.
var udpPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: OSC_PORT
});

udpPort.on("ready", function () {
    var ipAddresses = getIPAddresses();
    console.log("Listening for OSC over UDP.");
    ipAddresses.forEach(function (address) {
        console.log(" Host:", address + ", Port:", udpPort.options.localPort);
    });
    console.log("To start the demo, go to http://localhost:8081 in your web browser.");
});

udpPort.open();

// Create an Express-based Web Socket server to which OSC messages will be relayed.
var appResources = __dirname + "/web",
    app = express(),
    server = app.listen(WEB_SOCKET_PORT),
    wss = new WebSocket.Server({
        server: server
    });

app.use("/", express.static(appResources));
wss.on("connection", function (socket) {
    console.log("A Web Socket connection has been established!");
    var socketPort = new osc.WebSocketPort({
        socket: socket
    });

    var relay = new osc.Relay(udpPort, socketPort, {
        raw: true
    });
});