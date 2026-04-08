/**
 * LaserCube WebSocket → UDP Bridge Server
 *
 * Accepts JSON WebSocket messages from the VIZO browser app and
 * translates them into LaserCube UDP point-stream packets.
 *
 * LaserCube UDP protocol:
 *   Port 45458 — data (point stream)
 *   Port 45457 — commands
 *   Point format: 10 bytes = 5× uint16 LE  (X, Y, R, G, B — 0..4095)
 *   Max 140 points per packet; 30,000 pts/sec DAC rate
 *
 * WebSocket message types (JSON):
 *   { type: 'connect',    ip: string }
 *   { type: 'disconnect' }
 *   { type: 'points',     points: Array<{x,y,r,g,b}> }  (all 0..1)
 *   { type: 'command',    cmd: 'enable'|'disable' }
 *
 * Run:  npx tsx server.ts   (or npm start)
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as dgram from 'dgram';

// ─── Config ────────────────────────────────────────────────────────────────
const WS_PORT      = 8765;
const LASER_DATA_PORT = 45458;
const LASER_CMD_PORT  = 45457;

// ─── Types ──────────────────────────────────────────────────────────────────
interface LaserPoint { x: number; y: number; r: number; g: number; b: number; }

type BridgeMsg =
  | { type: 'connect';    ip: string }
  | { type: 'disconnect' }
  | { type: 'points';     points: LaserPoint[] }
  | { type: 'command';    cmd: 'enable' | 'disable' };

// ─── State ──────────────────────────────────────────────────────────────────
const udp = dgram.createSocket('udp4');
let laserIp        = '';
let laserConnected = false;
const clients      = new Set<WebSocket>();

// ─── UDP helpers ─────────────────────────────────────────────────────────────
function clamp4095(v: number): number {
  return Math.max(0, Math.min(4095, Math.round(v * 4095)));
}

function encodePoint(p: LaserPoint): Buffer {
  const buf = Buffer.alloc(10);
  buf.writeUInt16LE(clamp4095(p.x),  0);  // X
  buf.writeUInt16LE(clamp4095(p.y),  2);  // Y
  buf.writeUInt16LE(clamp4095(p.r),  4);  // R
  buf.writeUInt16LE(clamp4095(p.g),  6);  // G
  buf.writeUInt16LE(clamp4095(p.b),  8);  // B
  return buf;
}

function sendPoints(points: LaserPoint[]) {
  if (!laserConnected || !laserIp || points.length === 0) return;
  // LaserCube max 140 points per UDP packet
  for (let i = 0; i < points.length; i += 140) {
    const batch   = points.slice(i, i + 140);
    const payload = Buffer.concat(batch.map(encodePoint));
    udp.send(payload, LASER_DATA_PORT, laserIp, (err) => {
      if (err) console.error('[udp] send error:', err.message);
    });
  }
}

// LaserCube enable/disable commands (4-byte magic from protocol)
const CMD_ENABLE  = Buffer.from([0x80, 0x00, 0x00, 0x00]);
const CMD_DISABLE = Buffer.from([0x80, 0x00, 0x00, 0x01]);

function sendCommand(cmd: 'enable' | 'disable') {
  if (!laserIp) return;
  const buf = cmd === 'enable' ? CMD_ENABLE : CMD_DISABLE;
  udp.send(buf, LASER_CMD_PORT, laserIp, (err) => {
    if (err) console.error('[udp] command error:', err.message);
  });
}

// ─── Broadcast status to all connected WebSocket clients ───────────────────
function broadcastStatus(status: object) {
  const msg = JSON.stringify({ type: 'status', ...status });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// ─── WebSocket server ────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[ws] client connected  (${clients.size} total)`);

  // Send current state to new client
  ws.send(JSON.stringify({
    type: 'status',
    connected: laserConnected,
    ip: laserIp,
  }));

  ws.on('message', (raw) => {
    let msg: BridgeMsg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return; }

    switch (msg.type) {
      case 'connect':
        laserIp        = msg.ip;
        laserConnected = true;
        sendCommand('enable');
        broadcastStatus({ connected: true, ip: laserIp });
        console.log(`[laser] connected → ${laserIp}`);
        break;

      case 'disconnect':
        sendCommand('disable');
        laserConnected = false;
        broadcastStatus({ connected: false, ip: laserIp });
        console.log('[laser] disconnected');
        break;

      case 'points':
        sendPoints(msg.points);
        break;

      case 'command':
        sendCommand(msg.cmd);
        break;
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[ws] client disconnected (${clients.size} total)`);
  });

  ws.on('error', (err) => console.error('[ws] error:', err.message));
});

wss.on('listening', () => {
  console.log(`\n  LaserCube Bridge  ws://localhost:${WS_PORT}`);
  console.log('  Waiting for VIZO browser connection...\n');
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────
process.on('SIGINT', () => {
  if (laserConnected && laserIp) sendCommand('disable');
  udp.close();
  wss.close(() => process.exit(0));
});
