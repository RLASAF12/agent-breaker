# 🔌 agent-breaker

**Runtime loop circuit breaker for multi-agent systems.**  
Detects runaway tool-call patterns in real time — and kills them before they burn $47,000.

[![Node.js](https://img.shields.io/badge/Node.js-≥18-green?logo=node.js)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)
[![Live Demo](https://img.shields.io/badge/Demo-Live-brightgreen)](https://rlasaf12.github.io/agent-breaker/)

---

## What It Is

`agent-breaker` is a lightweight HTTP + WebSocket server your agents POST tool-call events to. It watches for repeating patterns using a sliding window — and when a loop is detected, it opens the circuit and pushes a real-time alert to a dashboard.

**It is not a budget cap.** Budget caps let your agent spend $0.02 × 2,350 calls before they hit the ceiling. `agent-breaker` trips at the 3rd repeat — before call #4.

---

## Why It Exists

Every major agent framework ships with `max_iterations` and `max_tokens`. None of them ship with pattern-based loop detection.

Real incidents:
- $47K bill from an AutoGen agent that ping-ponged between two tools for 6 hours
- OpenAI's own safety team documented agents stuck in tool loops despite max_tokens being set
- LangSmith forums: "logging didn't catch it, monitoring didn't catch it, the loop just ran"

The gap: existing tools are financial guardrails. `agent-breaker` is a behavioral one.

---

## How It Works

```
Agent calls tool → POST /event → sliding window analysis
                                       ↓
                              fingerprint: "tool_name:input_prefix"
                                       ↓
                         count occurrences in last N calls
                                       ↓
                    ≥ threshold repeats? → circuit OPEN → WebSocket push
                                       ↓
                              dashboard shows trip event
```

Pattern detection:
1. **Repeat pattern** — same `toolName:inputPrefix` appears ≥ 3× in last 20 calls
2. **Alternating pair** — A → B → A → B alternation (two tools arguing)

---

## Quick Start

```bash
# clone and install
git clone https://github.com/RLASAF12/agent-breaker.git
cd agent-breaker
npm install

# start the server
npm start
# → listening on :3000

# open the dashboard
open http://localhost:3000
```

---

## Integration

### LangGraph (Python)

```python
import requests

def report_tool_call(tool_name: str, inputs: dict, outputs: dict, agent_id: str = "my-agent"):
    try:
        r = requests.post("http://localhost:3000/event", json={
            "agentId": agent_id,
            "toolName": tool_name,
            "input": inputs,
            "output": outputs
        }, timeout=0.5)
        if r.json().get("tripped"):
            raise RuntimeError(f"[agent-breaker] Loop detected on {tool_name} — circuit OPEN")
    except requests.exceptions.Timeout:
        pass  # non-blocking: agent continues if breaker is down

# wrap your tool executor
def execute_tool(tool_name, inputs):
    result = your_tool_registry[tool_name](inputs)
    report_tool_call(tool_name, inputs, result)
    return result
```

### AutoGen (Python)

```python
from autogen import ConversableAgent
import requests

original_generate = ConversableAgent.generate_reply

def patched_generate(self, messages=None, sender=None, **kwargs):
    if messages:
        last = messages[-1]
        requests.post("http://localhost:3000/event", json={
            "agentId": self.name,
            "toolName": last.get("role", "message"),
            "input": last.get("content", "")[:200],
            "output": ""
        }, timeout=0.5)
    return original_generate(self, messages=messages, sender=sender, **kwargs)

ConversableAgent.generate_reply = patched_generate
```

### Plain Node.js / JS Agent

```javascript
const fetch = require('node-fetch');

async function reportEvent(agentId, toolName, input, output) {
  const res = await fetch('http://localhost:3000/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, toolName, input, output })
  });
  const data = await res.json();
  if (data.tripped) {
    throw new Error(`[agent-breaker] Loop detected: ${toolName}`);
  }
  return data;
}
```

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/event` | POST | Record a tool call. Returns `{ status, tripped, history_length }` |
| `/status` | GET | Current circuit state + full history |
| `/reset` | POST | Reset to CLOSED state |
| `/` | GET | Live dashboard (WebSocket) |
| `/demo` | GET | Self-contained simulation |

**POST /event body:**
```json
{
  "agentId": "Analyzer",
  "toolName": "tool_summarize",
  "input": { "doc": "..." },
  "output": { "summary": "..." }
}
```

**Response:**
```json
{
  "status": "OPEN",
  "tripped": true,
  "history_length": 7
}
```

---

## Configuration

```javascript
const CircuitBreaker = require('./circuit');

const circuit = new CircuitBreaker({
  windowSize: 20,    // calls to keep in sliding window (default: 20)
  threshold: 3,      // repeats before trip (default: 3)
  costPerCall: 0.02  // $ per tool call for cost estimate (default: 0.02)
});
```

---

## File Structure

```
agent-breaker/
├── circuit.js        # Loop detection engine (EventEmitter)
├── server.js         # Express + WebSocket server
├── dashboard.html    # Real-time monitoring dashboard
├── demo/
│   └── index.html   # Self-contained simulation (GitHub Pages)
└── package.json
```

---

## Live Demo

[▶ Watch a $47K loop get killed in real time →](https://rlasaf12.github.io/agent-breaker/)

No server needed. Opens in your browser. Press **Run Demo**.

---

## What's Next

- [ ] Webhook outbound (Slack/Teams alert on trip)
- [ ] Multi-agent namespace isolation (`agentId` scoping)
- [ ] Prometheus `/metrics` endpoint
- [ ] Python SDK wrapper

---

Built by [Harel Asaf](https://harelasaf.com) · AI Systems Specialist at Elementor
