# LaserCube Bridge Server

Translates WebSocket JSON messages from the VIZO browser app into UDP packets for the LaserCube hardware.

## Quick Start

```bash
cd laser-bridge
npm install
npm start
```

The server listens on `ws://localhost:8765` by default.

## How It Works

```
VIZO (browser)  →  WebSocket  →  Bridge Server  →  UDP  →  LaserCube
```

Because browsers cannot send raw UDP, this bridge acts as a relay.

## LaserCube Protocol

- **Data port**: UDP 45458 — point stream
- **Command port**: UDP 45457 — enable/disable
- **Point format**: 10 bytes = 5× uint16 LE (X, Y, R, G, B — 0–4095)
- **Max 140 points per packet**
- **DAC rate: 30,000 pts/sec**

## Safety

The bridge sends a `disable` command when it shuts down (`Ctrl+C`).
Always keep a safety key available with the official LaserCube app.
