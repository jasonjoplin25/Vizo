/**
 * LaserBridge — browser-side WebSocket client that talks to the
 * laser-bridge Node.js server, which forwards UDP packets to LaserCube.
 */

export interface LaserPoint {
  x: number; // 0..1  (mapped to 0..4095 by bridge)
  y: number; // 0..1
  r: number; // 0..1
  g: number; // 0..1
  b: number; // 0..1
}

export type LaserStatus = 'idle' | 'connecting' | 'connected' | 'error';

export type StatusCallback = (status: LaserStatus, ip: string) => void;

export class LaserBridge {
  private ws: WebSocket | null = null;
  private status: LaserStatus = 'idle';
  private laserIp = '';
  private bridgeUrl: string;
  private onStatus: StatusCallback;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    bridgeUrl = 'ws://localhost:8765',
    onStatus: StatusCallback = () => {},
  ) {
    this.bridgeUrl = bridgeUrl;
    this.onStatus  = onStatus;
  }

  // ─── Bridge connection ────────────────────────────────────────────────────

  connectBridge(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.setStatus('connecting');
      const ws = new WebSocket(this.bridgeUrl);
      this.ws = ws;

      ws.onopen = () => { resolve(); };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'status') {
            this.laserIp = msg.ip ?? this.laserIp;
            this.setStatus(msg.connected ? 'connected' : 'idle');
          }
        } catch { /* ignore malformed */ }
      };

      ws.onerror = () => {
        this.setStatus('error');
        reject(new Error('WebSocket connection to bridge failed'));
      };

      ws.onclose = () => {
        if (this.status !== 'idle') this.setStatus('error');
        this.ws = null;
        // attempt auto-reconnect after 3 s
        this.reconnectTimer = setTimeout(() => this.connectBridge().catch(() => {}), 3000);
      };
    });
  }

  disconnectBridge() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.setStatus('idle');
  }

  // ─── Laser hardware connect/disconnect ───────────────────────────────────

  async connectLaser(ip: string): Promise<void> {
    if (!this.isWsOpen()) await this.connectBridge();
    this.laserIp = ip;
    this.send({ type: 'connect', ip });
  }

  disconnectLaser() {
    this.send({ type: 'disconnect' });
  }

  // ─── Point streaming ──────────────────────────────────────────────────────

  /** Send a frame of points to the LaserCube. Call at ~60 fps. */
  sendPoints(points: LaserPoint[]) {
    if (!this.isWsOpen() || points.length === 0) return;
    this.send({ type: 'points', points });
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  get currentStatus(): LaserStatus { return this.status; }
  get currentIp(): string          { return this.laserIp; }

  // ─── Private ──────────────────────────────────────────────────────────────

  private isWsOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private send(msg: object) {
    if (!this.isWsOpen()) return;
    this.ws!.send(JSON.stringify(msg));
  }

  private setStatus(s: LaserStatus) {
    this.status = s;
    this.onStatus(s, this.laserIp);
  }
}
