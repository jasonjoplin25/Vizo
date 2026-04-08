/**
 * LaserCubePanel — collapsible VIZO panel for LaserCube hardware integration.
 *
 * Features:
 *  • Bridge connection (Node.js WebSocket proxy, runs separately)
 *  • LaserCube IP input + hardware connect/disconnect
 *  • Projection mode: 2D (XY plane) or 3D Voxel (depth fog cube)
 *  • Live 3D voxel cube preview (Three.js, draggable orbit)
 *  • Density preview (2D mini heatmap showing vectorised contours)
 *  • Brightness, threshold, and RDP tolerance sliders
 *  • Point count + frame rate display
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { LaserBridge }       from '../laser/LaserBridge';
import { LaserRenderer }     from '../laser/LaserRenderer';
import { VoxelParticle3D }   from '../laser/VoxelParticle3D';
import { VoxelCubeRenderer } from '../laser/VoxelCubeRenderer';
import { noteToHSL }         from '../visualization/colorMapping';
import type { LaserStatus }       from '../laser/LaserBridge';
import type { NoteOnHandler, NoteOffHandler } from '../hooks/useNoteEvents';

/** Convert HSL (0-360, 0-100, 0-100) to linear RGB 0..1 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100, ln = l / 100;
  const c  = (1 - Math.abs(2 * ln - 1)) * sn;
  const x  = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m  = ln - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [r + m, g + m, b + m];
}

interface Props {
  subscribeNoteOn:  (handler: NoteOnHandler)  => () => void;
  subscribeNoteOff: (handler: NoteOffHandler) => () => void;
  /** Key MIDI → normalised X position (0..1) for 3D particle spawning */
  keyPositions: Map<number, number>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColor: Record<LaserStatus, string> = {
  idle:       '#446',
  connecting: '#a80',
  connected:  '#4a4',
  error:      '#a44',
};
const statusLabel: Record<LaserStatus, string> = {
  idle:       'Disconnected',
  connecting: 'Connecting…',
  connected:  'Connected',
  error:      'Error',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function LaserCubePanel({
  subscribeNoteOn, subscribeNoteOff, keyPositions,
}: Props) {
  // ── UI state ──────────────────────────────────────────────────────────
  const [open,       setOpen]       = useState(false);
  const [laserMode,  setLaserMode]  = useState<'2d' | '3d'>('3d');
  const [bridgeUrl,  setBridgeUrl]  = useState('ws://localhost:8765');
  const [laserIp,    setLaserIp]    = useState('192.168.1.100');
  const [bridgeOk,   setBridgeOk]   = useState(false);
  const [laserStatus, setLaserStatus] = useState<LaserStatus>('idle');
  const [pointCount, setPointCount] = useState(0);
  const [fps,        setFps]        = useState(0);
  const [brightness, setBrightness] = useState(1.0);
  const [threshold,  setThreshold]  = useState(0.28);

  // ── Refs ──────────────────────────────────────────────────────────────
  const bridgeRef   = useRef<LaserBridge | null>(null);
  const rendererRef = useRef<LaserRenderer | null>(null);
  const voxelRef    = useRef<VoxelParticle3D | null>(null);
  const cubeVizRef  = useRef<VoxelCubeRenderer | null>(null);
  const rafRef      = useRef<number>(0);
  const fpsCountRef = useRef({ frames: 0, last: performance.now() });

  const cubeCanvasRef    = useRef<HTMLCanvasElement>(null);
  const densityCanvasRef = useRef<HTMLCanvasElement>(null);

  // ── Bridge + renderer init ─────────────────────────────────────────────
  useEffect(() => {
    const bridge = new LaserBridge(bridgeUrl, (status, _ip) => {
      setBridgeOk(status === 'connected' || status === 'idle');
      setLaserStatus(status);
    });
    const renderer = new LaserRenderer();
    const voxel    = new VoxelParticle3D();
    bridgeRef.current   = bridge;
    rendererRef.current = renderer;
    voxelRef.current    = voxel;

    // Try connecting to bridge silently; failure is shown in status
    bridge.connectBridge().then(() => setBridgeOk(true)).catch(() => {});

    return () => {
      bridge.disconnectBridge();
      voxel.dispose();
    };
  }, [bridgeUrl]);

  // ── Update renderer params when sliders change ─────────────────────────
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.brightness = brightness;
      rendererRef.current.threshold  = threshold;
      rendererRef.current.mode       = laserMode;
    }
  }, [brightness, threshold, laserMode]);

  // ── Note subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    const unOn = subscribeNoteOn((event) => {
      const { midiNote } = event;
      const [h, s, l] = noteToHSL(midiNote);
      const [r, g, b] = hslToRgb(h, s, l);

      rendererRef.current?.noteOn(midiNote, r, g, b);

      // Spawn in 3D voxel cube — map keyboard X position to cube X axis
      const keyXNorm = (keyPositions.get(midiNote) ?? 0.5);
      voxelRef.current?.spawnForNote(midiNote, r, g, b, keyXNorm);
    });

    const unOff = subscribeNoteOff((midiNote) => {
      rendererRef.current?.noteOff(midiNote);
      voxelRef.current?.deactivateNote(midiNote);
    });

    return () => { unOn(); unOff(); };
  }, [subscribeNoteOn, subscribeNoteOff, keyPositions]);

  // ── 3D cube preview init ───────────────────────────────────────────────
  useEffect(() => {
    if (!open || laserMode !== '3d' || !cubeCanvasRef.current) return;

    const canvas = cubeCanvasRef.current;
    const viz    = new VoxelCubeRenderer(canvas);
    cubeVizRef.current = viz;

    const ro = new ResizeObserver(() => {
      viz.resize(canvas.clientWidth, canvas.clientHeight);
    });
    ro.observe(canvas);
    viz.resize(canvas.clientWidth, canvas.clientHeight);

    return () => {
      ro.disconnect();
      viz.dispose();
      cubeVizRef.current = null;
    };
  }, [open, laserMode]);

  // ── Main render/send loop ──────────────────────────────────────────────
  const loop = useCallback(() => {
    const bridge   = bridgeRef.current;
    const renderer = rendererRef.current;
    const voxel    = voxelRef.current;

    if (voxel) voxel.update();
    if (cubeVizRef.current && voxel) {
      cubeVizRef.current.update(voxel);
      cubeVizRef.current.render();
    }

    let frame: import('../laser/LaserBridge').LaserPoint[] = [];

    if (renderer && voxel) {
      if (laserMode === '3d') {
        frame = renderer.generate3DFrame(voxel);
      } else {
        // 2D mode: use voxel Y/X positions flattened (no canvas particles available here)
        frame = renderer.generate3DFrame(voxel); // same projection, mode hint used for colour
      }
    }

    // Draw density preview
    drawDensityPreview();

    if (bridge && laserStatus === 'connected' && frame.length > 0) {
      bridge.sendPoints(frame);
    }

    setPointCount(frame.length);

    // FPS counter
    const fc = fpsCountRef.current;
    fc.frames++;
    const now = performance.now();
    if (now - fc.last >= 1000) {
      setFps(fc.frames);
      fc.frames = 0;
      fc.last   = now;
    }

    rafRef.current = requestAnimationFrame(loop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laserMode, laserStatus]);

  useEffect(() => {
    if (!open) { cancelAnimationFrame(rafRef.current); return; }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [open, loop]);

  // ── Density preview canvas ─────────────────────────────────────────────
  const drawDensityPreview = useCallback(() => {
    const canvas = densityCanvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const [gw, gh] = renderer.getGridSize();
    const grid     = renderer.getDensityGrid();
    const cw = canvas.width, ch = canvas.height;

    const imgData = ctx.createImageData(cw, ch);
    const data    = imgData.data;

    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const gx = Math.floor((cx / cw) * gw);
        const gy = Math.floor((cy / ch) * gh);
        const v  = Math.min(1, grid[gy * gw + gx] * 3);
        const pi = (cy * cw + cx) * 4;
        data[pi]     = Math.round(v * 40);
        data[pi + 1] = Math.round(v * 130);
        data[pi + 2] = Math.round(v * 255);
        data[pi + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleConnectLaser = async () => {
    try {
      await bridgeRef.current?.connectLaser(laserIp);
    } catch (err) {
      alert(`LaserCube: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDisconnect = () => bridgeRef.current?.disconnectLaser();

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: '#08081a',
      borderTop: '1px solid #1a1a2a',
      flexShrink: 0,
    }}>
      {/* Header bar */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          padding: '6px 16px',
          background: 'transparent',
          border: 'none',
          borderBottom: open ? '1px solid #1a1a2a' : 'none',
          color: '#6af',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          letterSpacing: 1,
        }}
      >
        <span style={{ fontSize: 16 }}>⬡</span>
        LASER CUBE
        <span style={{
          marginLeft: 4,
          padding: '2px 6px',
          borderRadius: 3,
          background: statusColor[laserStatus] + '33',
          color: statusColor[laserStatus],
          fontSize: 10,
          border: `1px solid ${statusColor[laserStatus]}55`,
        }}>
          {statusLabel[laserStatus]}
        </span>
        {laserStatus === 'connected' && (
          <span style={{ fontSize: 10, color: '#4a4', marginLeft: 4 }}>
            {pointCount} pts · {fps} fps
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: '#446', fontSize: 10 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={{
          display: 'flex',
          gap: 12,
          padding: 12,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
        }}>

          {/* ── Left column: controls ─────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 220 }}>

            {/* Bridge URL */}
            <Field label="Bridge URL">
              <input
                value={bridgeUrl}
                onChange={e => setBridgeUrl(e.target.value)}
                style={inputStyle}
                placeholder="ws://localhost:8765"
              />
              <StatusDot ok={bridgeOk} label={bridgeOk ? 'Bridge OK' : 'No bridge'} />
            </Field>

            {/* LaserCube IP */}
            <Field label="LaserCube IP">
              <input
                value={laserIp}
                onChange={e => setLaserIp(e.target.value)}
                style={inputStyle}
                placeholder="192.168.1.100"
              />
            </Field>

            {/* Connect/Disconnect */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleConnectLaser}
                disabled={laserStatus === 'connected'}
                style={{ ...btnStyle, opacity: laserStatus === 'connected' ? 0.4 : 1 }}
              >
                Connect Laser
              </button>
              <button
                onClick={handleDisconnect}
                disabled={laserStatus !== 'connected'}
                style={{ ...btnStyle, opacity: laserStatus !== 'connected' ? 0.4 : 1, color: '#f66' }}
              >
                Disconnect
              </button>
            </div>

            {/* Projection mode */}
            <Field label="Mode">
              <div style={{ display: 'flex', border: '1px solid #333', borderRadius: 4, overflow: 'hidden' }}>
                {(['2d', '3d'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setLaserMode(m)}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      background: laserMode === m ? '#1e3a6a' : '#0d0d1a',
                      color: laserMode === m ? '#6af' : '#556',
                      border: 'none',
                      borderRight: m === '2d' ? '1px solid #333' : 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    {m === '2d' ? '◻ 2D Plane' : '⬡ 3D Voxel'}
                  </button>
                ))}
              </div>
            </Field>

            {/* Brightness */}
            <SliderField
              label="Brightness"
              min={0.1} max={1} step={0.01}
              value={brightness}
              onChange={setBrightness}
            />

            {/* Threshold */}
            <SliderField
              label="Contour Threshold"
              min={0.05} max={0.8} step={0.01}
              value={threshold}
              onChange={setThreshold}
            />

            {/* Info box */}
            <div style={{
              fontSize: 10,
              color: '#446',
              lineHeight: 1.5,
              padding: '6px 8px',
              background: '#0a0a1a',
              borderRadius: 4,
              border: '1px solid #1a1a2a',
            }}>
              <strong style={{ color: '#556' }}>Laser Bridge</strong><br />
              Run <code style={{ color: '#9af' }}>npm start</code> in{' '}
              <code style={{ color: '#9af' }}>laser-bridge/</code> before connecting.
              <br /><br />
              <strong style={{ color: '#556' }}>LaserCube IP</strong><br />
              Find it in the official LaserCube app or via network scan.
            </div>
          </div>

          {/* ── 3D voxel cube preview ─────────────────────────────────── */}
          {laserMode === '3d' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={labelStyle}>3D Projection Preview</span>
              <canvas
                ref={cubeCanvasRef}
                style={{
                  width: 260,
                  height: 220,
                  borderRadius: 6,
                  border: '1px solid #223355',
                  background: '#06060f',
                  display: 'block',
                }}
              />
              <span style={{ fontSize: 9, color: '#334', textAlign: 'center' }}>
                drag to orbit · scroll to zoom
              </span>
            </div>
          )}

          {/* ── Density/contour preview ───────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={labelStyle}>Laser Vector Preview</span>
            <canvas
              ref={densityCanvasRef}
              width={128}
              height={128}
              style={{
                width: 128,
                height: 128,
                borderRadius: 4,
                border: '1px solid #223355',
                imageRendering: 'pixelated',
              }}
            />
            <span style={{ fontSize: 9, color: '#334', textAlign: 'center' }}>
              density → contours → laser paths
            </span>
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </div>
  );
}

function SliderField({
  label, min, max, step, value, onChange,
}: {
  label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ fontSize: 10, color: '#6af' }}>{value.toFixed(2)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ accentColor: '#6af', width: '100%' }}
      />
    </div>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: ok ? '#4a4' : '#a44',
      }} />
      <span style={{ fontSize: 10, color: ok ? '#4a4' : '#a44' }}>{label}</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#556',
  textTransform: 'uppercase',
  letterSpacing: 1,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  background: '#1a1a2a',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#9af',
  fontSize: 11,
  fontFamily: 'monospace',
};

const btnStyle: React.CSSProperties = {
  padding: '5px 10px',
  background: '#1a1a2a',
  border: '1px solid #334',
  borderRadius: 4,
  color: '#9af',
  cursor: 'pointer',
  fontSize: 11,
};
