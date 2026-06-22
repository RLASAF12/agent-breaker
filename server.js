const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs'); // Required by prompt, though not directly used for file serving with res.sendFile
const http = require('http');
const CircuitBreaker = require('./circuit');

const circuit = new CircuitBreaker();

const app = express();
app.use(express.json());

// Function to broadcast data to all connected WebSocket clients
function broadcast(data) {
    wss.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) {
            c.send(JSON.stringify(data));
        }
    });
}

// Circuit Breaker event listener
circuit.on("trip", (tripEvent) => {
    broadcast({ type: "TRIP_EVENT", ...tripEvent });
    console.log("[agent-breaker] Circuit tripped:", tripEvent);
});

// Serve dashboard.html for the root path
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Serve demo/index.html for the /demo path
app.get("/demo", (req, res) => {
    res.sendFile(path.join(__dirname, "demo", "index.html"));
});

// API endpoint to record an event
app.post("/event", (req, res) => {
    const { agentId, toolName, input, output } = req.body;
    circuit.record({ agentId, toolName, input, output, timestamp: new Date().toISOString() });
    res.json({ status: circuit.status, tripped: circuit.status === "OPEN", history_length: circuit.history.length });
});

// API endpoint to get current circuit status
app.get("/status", (req, res) => {
    res.json(circuit.getState());
});

// API endpoint to reset the circuit
app.post("/reset", (req, res) => {
    circuit.reset();
    res.json({ ok: true, status: "CLOSED" });
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
    // Send initial circuit state to new client
    ws.send(JSON.stringify({ type: "CONNECTED", state: circuit.getState() }));
    ws.on("error", console.error);
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("[agent-breaker] listening on :" + PORT));

// Export for testing purposes
module.exports = { app, server, circuit };
