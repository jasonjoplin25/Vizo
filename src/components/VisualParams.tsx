import { useState, useCallback, useEffect, useRef } from 'react';
import type { ParticleSystem } from '../visualization/ParticleSystem';
import { EFFECT_LABELS } from '../visualization/ParticleSystem';
import type { ParticleEffect } from '../visualization/ParticleSystem';
import type { CymaticsEngine } from '../visualization/CymaticsEngine';
import type { VisualizationMode } from '../types';

// ─── Persisted param shapes ───────────────────────────────────────────────────

interface ParticleParams {
  // Shared
  pointSize:  number;
  emitRate:   number;
  burstCount: number;
  riseSpeed:  number;
  spread:     number;
  lifetime:   number;
  effect:     ParticleEffect;
  // Fireworks
  fireworksExplosionSpeed: number;
  // Dance
  danceTargetY:   number;
  danceSpeed:     number;
  danceAmplitude: number;
  danceVertical:  number;
  // Spiral
  spiralRotSpeed:  number;
  spiralExpand:    number;
  spiralMaxRadius: number;
  // Fountain
  fountainGravity: number;
  fountainSpread:  number;
  // Comet
  cometSpeed:    number;
  cometLifetime: number;
  // Confetti
  confettiDrift:    number;
  confettiGravity:  number;
  confettiLifetime: number;
  // Orbit
  orbitRadius:  number;
  orbitSpeed:   number;
  orbitEllipse: number;
  orbitTargetY: number;
}

interface CymaticsParams {
  pointSize:        number;
  force:            number;
  friction:         number;
  noise:            number;
  spreadNoise:      number;
  edgeRepulsion:    number;
  releaseDecayRate: number;
}

const DEFAULTS_P: ParticleParams = {
  pointSize: 3, emitRate: 4, burstCount: 20,
  riseSpeed: 2.0, spread: 0.018, lifetime: 220,
  effect: 'default',
  fireworksExplosionSpeed: 5.0,
  danceTargetY: 0.45, danceSpeed: 0.055, danceAmplitude: 1.6, danceVertical: 28,
  spiralRotSpeed: 0.05, spiralExpand: 0.22, spiralMaxRadius: 58,
  fountainGravity: 0.065, fountainSpread: 5.0,
  cometSpeed: 1.0, cometLifetime: 65,
  confettiDrift: 1.4, confettiGravity: 0.012, confettiLifetime: 380,
  orbitRadius: 22, orbitSpeed: 0.022, orbitEllipse: 0.42, orbitTargetY: 0.38,
};

const DEFAULTS_C: CymaticsParams = {
  pointSize: 2.5, force: 0.9, friction: 0.965, noise: 0.0012,
  spreadNoise: 0.006, edgeRepulsion: 0.04, releaseDecayRate: 0.008,
};

const KEY_P = 'vizo_particle_params';
const KEY_C = 'vizo_cymatics_params';

function load<T>(key: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch { return defaults; }
}

function persist(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  vizMode:        VisualizationMode;
  particleSystem: ParticleSystem | null;
  cymaticsEngine: CymaticsEngine | null;
}

export function VisualParams({ vizMode, particleSystem, cymaticsEngine }: Props) {
  const [open, setOpen]           = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [p, setP] = useState<ParticleParams>(() => load(KEY_P, DEFAULTS_P));
  const [c, setC] = useState<CymaticsParams>(() => load(KEY_C, DEFAULTS_C));

  // ── Apply loaded params to engines on mount ────────────────────────────
  useEffect(() => {
    if (!particleSystem) return;
    applyAllParticleParams(particleSystem, p);
  }, [particleSystem]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cymaticsEngine) return;
    cymaticsEngine.setPointSize(c.pointSize);
    cymaticsEngine.setForce(c.force);
    cymaticsEngine.setFriction(c.friction);
    cymaticsEngine.setNoise(c.noise);
    cymaticsEngine.setSpreadNoise(c.spreadNoise);
    cymaticsEngine.setEdgeRepulsion(c.edgeRepulsion);
    cymaticsEngine.setReleaseDecayRate(c.releaseDecayRate);
  }, [cymaticsEngine]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────
  const showFlash = useCallback(() => {
    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 1500);
  }, []);

  const updateP = useCallback(<K extends keyof ParticleParams>(key: K, val: ParticleParams[K]) => {
    setP(prev => ({ ...prev, [key]: val }));
    if (particleSystem) (particleSystem as unknown as Record<string, unknown>)[key] = val;
  }, [particleSystem]);

  const updateC = useCallback(<K extends keyof CymaticsParams>(key: K, val: CymaticsParams[K]) => {
    setC(prev => ({ ...prev, [key]: val }));
    if (cymaticsEngine) {
      const v = val as number;
      if (key === 'pointSize')        cymaticsEngine.setPointSize(v);
      if (key === 'force')            cymaticsEngine.setForce(v);
      if (key === 'friction')         cymaticsEngine.setFriction(v);
      if (key === 'noise')            cymaticsEngine.setNoise(v);
      if (key === 'spreadNoise')      cymaticsEngine.setSpreadNoise(v);
      if (key === 'edgeRepulsion')    cymaticsEngine.setEdgeRepulsion(v);
      if (key === 'releaseDecayRate') cymaticsEngine.setReleaseDecayRate(v);
    }
  }, [cymaticsEngine]);

  const handleSave = useCallback(() => {
    persist(KEY_P, p);
    persist(KEY_C, c);
    showFlash();
  }, [p, c, showFlash]);

  const handleResetP = useCallback(() => {
    setP(DEFAULTS_P);
    if (particleSystem) applyAllParticleParams(particleSystem, DEFAULTS_P);
  }, [particleSystem]);

  const handleResetC = useCallback(() => {
    setC(DEFAULTS_C);
    if (cymaticsEngine) {
      cymaticsEngine.setPointSize(DEFAULTS_C.pointSize);
      cymaticsEngine.setForce(DEFAULTS_C.force);
      cymaticsEngine.setFriction(DEFAULTS_C.friction);
      cymaticsEngine.setNoise(DEFAULTS_C.noise);
      cymaticsEngine.setSpreadNoise(DEFAULTS_C.spreadNoise);
      cymaticsEngine.setEdgeRepulsion(DEFAULTS_C.edgeRepulsion);
      cymaticsEngine.setReleaseDecayRate(DEFAULTS_C.releaseDecayRate);
    }
  }, [cymaticsEngine]);

  // ── Render ────────────────────────────────────────────────────────────
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={floatBtn} title="Adjust visualization parameters">
        ⚙
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#9af', fontWeight: 600 }}>
          {vizMode === 'particles' ? 'Particle Parameters' : 'Cymatics Parameters'}
        </span>
        <button onClick={() => setOpen(false)} style={closeBtn}>✕</button>
      </div>

      {/* ── Particle mode ──────────────────────────────────────────────── */}
      {vizMode === 'particles' && (
        <>
          {/* Effect selector */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Effect</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {(Object.keys(EFFECT_LABELS) as ParticleEffect[]).map(fx => (
                <button
                  key={fx}
                  onClick={() => updateP('effect', fx)}
                  style={{
                    padding: '3px 8px',
                    background: p.effect === fx ? '#1e3a6a' : '#0d0d1a',
                    border: `1px solid ${p.effect === fx ? '#6af' : '#334'}`,
                    borderRadius: 3,
                    color: p.effect === fx ? '#6af' : '#556',
                    cursor: 'pointer',
                    fontSize: 10,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {EFFECT_LABELS[fx]}
                </button>
              ))}
            </div>
          </div>

          {/* Shared sliders (all effects) */}
          <SectionLabel>Shared</SectionLabel>
          <Slider label="Point Size" min={1} max={12} step={0.5} value={p.pointSize}
            onChange={v => updateP('pointSize', v)} />
          <Slider label="Emit Rate (particles/frame)" min={1} max={20} step={1} value={p.emitRate}
            onChange={v => updateP('emitRate', v)} />
          <Slider label="Burst Count (on note-on)" min={5} max={80} step={5} value={p.burstCount}
            onChange={v => updateP('burstCount', v)} />
          <Slider label="Rise / Launch Speed" min={0.5} max={6} step={0.25} value={p.riseSpeed}
            onChange={v => updateP('riseSpeed', v)} />
          <Slider label="Spread (fraction of width)" min={0.002} max={0.08} step={0.002} value={p.spread}
            onChange={v => updateP('spread', v)} fmt={v => v.toFixed(3)} />
          <Slider label="Lifetime (frames)" min={60} max={600} step={20} value={p.lifetime}
            onChange={v => updateP('lifetime', v)} />

          {/* ── Effect-specific sliders ─────────────────────────────────── */}

          {p.effect === 'fireworks' && (
            <>
              <SectionLabel>Fireworks</SectionLabel>
              <Slider label="Explosion Speed (px/frame)" min={1} max={15} step={0.5}
                value={p.fireworksExplosionSpeed}
                onChange={v => updateP('fireworksExplosionSpeed', v)} />
            </>
          )}

          {p.effect === 'dance' && (
            <>
              <SectionLabel>Dance</SectionLabel>
              <Slider label="Target Height (0=top, 1=bottom)" min={0.1} max={0.9} step={0.05}
                value={p.danceTargetY}
                onChange={v => updateP('danceTargetY', v)} fmt={v => v.toFixed(2)} />
              <Slider label="Dance Speed (phase/frame)" min={0.01} max={0.2} step={0.005}
                value={p.danceSpeed}
                onChange={v => updateP('danceSpeed', v)} fmt={v => v.toFixed(3)} />
              <Slider label="Horizontal Amplitude (px)" min={0.2} max={6} step={0.2}
                value={p.danceAmplitude}
                onChange={v => updateP('danceAmplitude', v)} fmt={v => v.toFixed(1)} />
              <Slider label="Vertical Range (px)" min={4} max={80} step={2}
                value={p.danceVertical}
                onChange={v => updateP('danceVertical', v)} />
            </>
          )}

          {p.effect === 'spiral' && (
            <>
              <SectionLabel>Spiral</SectionLabel>
              <Slider label="Rotation Speed (rad/frame)" min={0.01} max={0.2} step={0.005}
                value={p.spiralRotSpeed}
                onChange={v => updateP('spiralRotSpeed', v)} fmt={v => v.toFixed(3)} />
              <Slider label="Radius Expansion (px/frame)" min={0.02} max={1.5} step={0.02}
                value={p.spiralExpand}
                onChange={v => updateP('spiralExpand', v)} fmt={v => v.toFixed(2)} />
              <Slider label="Max Radius (px)" min={10} max={150} step={5}
                value={p.spiralMaxRadius}
                onChange={v => updateP('spiralMaxRadius', v)} />
            </>
          )}

          {p.effect === 'fountain' && (
            <>
              <SectionLabel>Fountain</SectionLabel>
              <Slider label="Gravity (px/frame²)" min={0.01} max={0.3} step={0.005}
                value={p.fountainGravity}
                onChange={v => updateP('fountainGravity', v)} fmt={v => v.toFixed(3)} />
              <Slider label="Horizontal Spread (px/frame)" min={0.5} max={15} step={0.5}
                value={p.fountainSpread}
                onChange={v => updateP('fountainSpread', v)} fmt={v => v.toFixed(1)} />
            </>
          )}

          {p.effect === 'comet' && (
            <>
              <SectionLabel>Comet</SectionLabel>
              <Slider label="Speed Multiplier" min={0.2} max={3} step={0.1}
                value={p.cometSpeed}
                onChange={v => updateP('cometSpeed', v)} fmt={v => v.toFixed(1)} />
              <Slider label="Lifetime (frames)" min={20} max={150} step={5}
                value={p.cometLifetime}
                onChange={v => updateP('cometLifetime', v)} />
            </>
          )}

          {p.effect === 'confetti' && (
            <>
              <SectionLabel>Confetti</SectionLabel>
              <Slider label="Horizontal Drift (px)" min={0.1} max={4} step={0.1}
                value={p.confettiDrift}
                onChange={v => updateP('confettiDrift', v)} fmt={v => v.toFixed(1)} />
              <Slider label="Gravity (px/frame²)" min={0} max={0.08} step={0.002}
                value={p.confettiGravity}
                onChange={v => updateP('confettiGravity', v)} fmt={v => v.toFixed(3)} />
              <Slider label="Lifetime (frames)" min={100} max={800} step={20}
                value={p.confettiLifetime}
                onChange={v => updateP('confettiLifetime', v)} />
            </>
          )}

          {p.effect === 'orbit' && (
            <>
              <SectionLabel>Orbit</SectionLabel>
              <Slider label="Base Radius (px)" min={5} max={100} step={2}
                value={p.orbitRadius}
                onChange={v => updateP('orbitRadius', v)} />
              <Slider label="Angular Speed (rad/frame)" min={0.005} max={0.1} step={0.002}
                value={p.orbitSpeed}
                onChange={v => updateP('orbitSpeed', v)} fmt={v => v.toFixed(3)} />
              <Slider label="Ellipse Compression (1=circle)" min={0.1} max={1.0} step={0.05}
                value={p.orbitEllipse}
                onChange={v => updateP('orbitEllipse', v)} fmt={v => v.toFixed(2)} />
              <Slider label="Orbit Height (0=top, 1=bottom)" min={0.1} max={0.9} step={0.05}
                value={p.orbitTargetY}
                onChange={v => updateP('orbitTargetY', v)} fmt={v => v.toFixed(2)} />
            </>
          )}
        </>
      )}

      {/* ── Cymatics mode ──────────────────────────────────────────────── */}
      {vizMode === 'cymatics' && (
        <>
          <Slider label="Point Size (px)" min={0.5} max={8} step={0.5} value={c.pointSize}
            onChange={v => updateC('pointSize', v)} />
          <Slider label="Force Strength" min={0.1} max={5} step={0.1} value={c.force}
            onChange={v => updateC('force', v)} />
          <Slider label="Friction (closer to 1 = less damping)" min={0.85} max={0.999} step={0.005} value={c.friction}
            onChange={v => updateC('friction', v)} fmt={v => v.toFixed(3)} />
          <Slider label="Thermal Noise" min={0} max={0.01} step={0.0002} value={c.noise}
            onChange={v => updateC('noise', v)} fmt={v => v.toFixed(4)} />
          <Slider label="Spread-back Noise (when quiet)" min={0} max={0.03} step={0.001} value={c.spreadNoise}
            onChange={v => updateC('spreadNoise', v)} fmt={v => v.toFixed(3)} />
          <Slider label="Edge Repulsion" min={0} max={0.15} step={0.005} value={c.edgeRepulsion}
            onChange={v => updateC('edgeRepulsion', v)} fmt={v => v.toFixed(3)} />
          <Slider label="Release Decay Rate" min={0.001} max={0.05} step={0.001} value={c.releaseDecayRate}
            onChange={v => updateC('releaseDecayRate', v)} fmt={v => v.toFixed(3)} />
        </>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
        <button onClick={handleSave} style={saveBtn}>💾 Save</button>
        <button
          onClick={vizMode === 'particles' ? handleResetP : handleResetC}
          style={resetBtn}
        >
          Reset
        </button>
        {savedFlash && <span style={{ fontSize: 10, color: '#4c8', marginLeft: 4 }}>✓ Saved</span>}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyAllParticleParams(ps: ParticleSystem, p: ParticleParams) {
  ps.pointSize  = p.pointSize;
  ps.emitRate   = p.emitRate;
  ps.burstCount = p.burstCount;
  ps.riseSpeed  = p.riseSpeed;
  ps.spread     = p.spread;
  ps.lifetime   = p.lifetime;
  ps.effect     = p.effect;
  ps.fireworksExplosionSpeed = p.fireworksExplosionSpeed;
  ps.danceTargetY   = p.danceTargetY;
  ps.danceSpeed     = p.danceSpeed;
  ps.danceAmplitude = p.danceAmplitude;
  ps.danceVertical  = p.danceVertical;
  ps.spiralRotSpeed  = p.spiralRotSpeed;
  ps.spiralExpand    = p.spiralExpand;
  ps.spiralMaxRadius = p.spiralMaxRadius;
  ps.fountainGravity = p.fountainGravity;
  ps.fountainSpread  = p.fountainSpread;
  ps.cometSpeed    = p.cometSpeed;
  ps.cometLifetime = p.cometLifetime;
  ps.confettiDrift    = p.confettiDrift;
  ps.confettiGravity  = p.confettiGravity;
  ps.confettiLifetime = p.confettiLifetime;
  ps.orbitRadius  = p.orbitRadius;
  ps.orbitSpeed   = p.orbitSpeed;
  ps.orbitEllipse = p.orbitEllipse;
  ps.orbitTargetY = p.orbitTargetY;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: '#6af', fontWeight: 600, marginTop: 6, marginBottom: 4, letterSpacing: 1 }}>
      {children}
    </div>
  );
}

function Slider({
  label, min, max, step, value, onChange, fmt,
}: {
  label: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: '#888' }}>{label}</span>
        <span style={{ fontSize: 10, color: '#6af', fontFamily: 'monospace' }}>
          {fmt ? fmt(value) : value}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: '#6af' }}
      />
    </label>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const floatBtn: React.CSSProperties = {
  position: 'absolute', bottom: 12, right: 12,
  width: 34, height: 34,
  background: 'rgba(10,10,30,0.85)',
  border: '1px solid #334',
  borderRadius: '50%',
  color: '#6af', cursor: 'pointer', fontSize: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 10,
};

const panelStyle: React.CSSProperties = {
  position: 'absolute', bottom: 12, right: 12,
  width: 300,
  maxHeight: 'calc(100% - 24px)',
  overflowY: 'auto',
  background: 'rgba(8,8,20,0.97)',
  border: '1px solid #334',
  borderRadius: 8,
  padding: '12px 14px',
  zIndex: 10,
  backdropFilter: 'blur(6px)',
};

const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none',
  color: '#556', cursor: 'pointer', fontSize: 14, padding: '0 4px',
};

const saveBtn: React.CSSProperties = {
  flex: 1,
  padding: '5px 0',
  background: '#1a3a2a',
  border: '1px solid #2a6a4a',
  borderRadius: 4,
  color: '#4c8',
  cursor: 'pointer',
  fontSize: 11,
};

const resetBtn: React.CSSProperties = {
  padding: '5px 10px',
  background: '#1a1a2a',
  border: '1px solid #334',
  borderRadius: 4,
  color: '#666',
  cursor: 'pointer',
  fontSize: 11,
};
