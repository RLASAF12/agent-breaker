const EventEmitter = require('events');

class CircuitBreaker extends EventEmitter {
    constructor(opts = {}) {
        super();
        this.windowSize = opts.windowSize || 20;
        this.threshold = opts.threshold || 3;
        this.costPerCall = opts.costPerCall || 0.02; // Cost per call in dollars

        this.history = []; // Stores { fingerprint, agentId, timestamp }
        this.status = "CLOSED"; // "CLOSED" or "OPEN"
        this.tripEvent = null; // Stores details of the last trip
    }

    record(event) {
        const { agentId, toolName, input, output, timestamp } = event;

        // Compute fingerprint
        const inputString = JSON.stringify(input);
        const fingerprint = `${toolName}:${inputString.slice(0, 80)}`;

        // Add to history
        this.history.push({ fingerprint, agentId, timestamp: timestamp || new Date().toISOString() });

        // Maintain sliding window
        if (this.history.length > this.windowSize) {
            this.history.shift();
        }

        // Only check for tripping if the circuit is currently CLOSED
        if (this.status === "CLOSED") {
            let loopPattern = null;

            // 1. Check for repeated fingerprint pattern
            const fingerprintCounts = new Map();
            for (const item of this.history) {
                fingerprintCounts.set(item.fingerprint, (fingerprintCounts.get(item.fingerprint) || 0) + 1);
            }

            for (const count of fingerprintCounts.values()) {
                if (count >= this.threshold) {
                    loopPattern = "repeated_fingerprint";
                    break;
                }
            }

            // 2. Check for alternating pair pattern (if not already tripped by fingerprint)
            if (!loopPattern && this.history.length >= 6) {
                const lastSix = this.history.slice(-6);
                const agentIds = lastSix.map(item => item.agentId);

                // Check for A, B, A, B, A, B pattern
                if (agentIds[0] === agentIds[2] && agentIds[2] === agentIds[4] &&
                    agentIds[1] === agentIds[3] && agentIds[3] === agentIds[5] &&
                    agentIds[0] !== agentIds[1]) {

                    // Ensure only two distinct agent IDs are involved
                    const distinctAgents = new Set(agentIds);
                    if (distinctAgents.size === 2) {
                        loopPattern = "alternating_agents";
                    }
                }
            }

            // If a loop pattern is detected, trip the circuit
            if (loopPattern) {
                this.status = "OPEN";
                this.tripEvent = {
                    type: "CIRCUIT_OPEN",
                    loopPattern: loopPattern,
                    callCount: this.history.length,
                    // estimatedCostSaved: history.length * costPerCall * 100 (converts dollars to cents)
                    estimatedCostSaved: Math.round(this.history.length * this.costPerCall * 100),
                    timestamp: new Date().toISOString()
                };
                this.emit("trip", this.tripEvent);
            }
        }
    }

    getState() {
        return {
            status: this.status,
            tripEvent: this.tripEvent || null,
            history: [...this.history] // Return a copy to prevent external modification
        };
    }

    reset() {
        this.status = "CLOSED";
        this.history = [];
        this.tripEvent = null;
    }
}

module.exports = CircuitBreaker;
