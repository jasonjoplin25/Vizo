import { useState, useEffect, useRef, useCallback } from 'react';
import { DrumSynth } from '../audio/DrumSynth';
import { DRUM_TRACKS, DRUM_PRESETS, type DrumTrackName, type Pattern } from '../audio/drumPresets';

interface Props {
  drumSynth: DrumSynth | null;
  onDrumSynthReady: (d: DrumSynth) => void;
}

const TRACK_COLORS: Record<DrumTrackName, string> = {
  Kick:    '#f80',
  Snare:   '#fc0',
  CHH:     '#0df',
  OHH:     '#0af',
  Clap:    '#f0f',
  'Tom H': '#4f8',
  'Tom L': '#2c6',
  Crash:   '#f44',
};

function emptyPattern(): Pattern {
  const p = {} as Pattern;
  for (const t of DRUM_TRACKS) {
    p[t] = new Array(16).fill(0) as number[];
  }
  return p;
}

export function DrumMachine({ drumSynth, onDrumSynthReady }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [pattern, setPattern] = useState<Pattern>(emptyPattern);
  const [preset, setPreset] = useState('Basic Rock');
  const [muted, setMuted] = useState<Set<DrumTrackName>>(new Set());
  const synthRef = useRef<DrumSynth | null>(null);

  // Create synth on mount
  useEffect(() => {
    const synth = new DrumSynth();
    synthRef.current = synth;
    onDrumSynthReady(synth);

    // Load default preset
    const defaultPattern = DRUM_PRESETS['Basic Rock'];
    synth.setPattern(defaultPattern);
    setPattern({ ...defaultPattern });

    synth.onStep(step => {
      setCurrentStep(step);
    });

    return () => {
      synth.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external drumSynth ref step callback when it changes
  useEffect(() => {
    if (drumSynth) {
      drumSynth.onStep(step => setCurrentStep(step));
    }
  }, [drumSynth]);

  const activeSynth = drumSynth ?? synthRef.current;

  const handleToggleStep = useCallback((track: DrumTrackName, step: number) => {
    if (!activeSynth) return;
    activeSynth.toggleStep(track, step);
    setPattern(prev => {
      const next = { ...prev };
      const row = [...next[track]];
      row[step] = row[step] ? 0 : 1;
      next[track] = row;
      return next;
    });
  }, [activeSynth]);

  const handlePreset = useCallback((name: string) => {
    if (!activeSynth) return;
    const p = DRUM_PRESETS[name];
    if (!p) return;
    activeSynth.setPattern(p);
    setPattern({ ...p });
    setPreset(name);
  }, [activeSynth]);

  const handleClear = useCallback(() => {
    if (!activeSynth) return;
    const p = emptyPattern();
    activeSynth.setPattern(p);
    setPattern(p);
  }, [activeSynth]);

  const handlePlay = useCallback(async () => {
    await activeSynth?.play();
  }, [activeSynth]);

  const handleStop = useCallback(() => {
    activeSynth?.stop();
    setCurrentStep(-1);
  }, [activeSynth]);

  const handleMute = useCallback((track: DrumTrackName) => {
    setMuted(prev => {
      const next = new Set(prev);
      if (next.has(track)) {
        next.delete(track);
        activeSynth?.setMuted(track, false);
      } else {
        next.add(track);
        activeSynth?.setMuted(track, true);
      }
      return next;
    });
  }, [activeSynth]);

  const isPlaying = activeSynth?.isPlaying ?? false;

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Toggle button row */}
      <div style={{
        padding: '4px 12px',
        background: '#0a0a15',
        borderBottom: isOpen ? '1px solid #1a1a2e' : 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <button
          onClick={() => setIsOpen(o => !o)}
          style={{
            padding: '3px 10px',
            background: isOpen ? '#1a1a3a' : '#0d0d20',
            border: `1px solid ${isOpen ? '#446' : '#224'}`,
            borderRadius: 4,
            color: isOpen ? '#9af' : '#668',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          🥁 Drum Machine {isOpen ? '▲' : '▼'}
        </button>
      </div>

      {isOpen && (
        <div style={{
          background: '#070712',
          borderBottom: '1px solid #1a1a2e',
          padding: '8px 12px',
          overflowX: 'auto',
        }}>
          {/* Transport row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <button
              onClick={isPlaying ? handleStop : handlePlay}
              style={{
                padding: '4px 12px',
                background: isPlaying ? '#1a2a1a' : '#1a1a2a',
                border: `1px solid ${isPlaying ? '#4a8' : '#446'}`,
                borderRadius: 4,
                color: isPlaying ? '#6c8' : '#9af',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {isPlaying ? '■ Stop' : '▶ Play'}
            </button>

            <span style={{ fontSize: 11, color: '#556', minWidth: 72 }}>
              Step: {currentStep >= 0 ? `${currentStep + 1}/16` : '-/16'}
            </span>

            <select
              value={preset}
              onChange={e => handlePreset(e.target.value)}
              style={{
                padding: '3px 6px',
                background: '#111124',
                border: '1px solid #334',
                borderRadius: 4,
                color: '#aab',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {Object.keys(DRUM_PRESETS).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>

            <button
              onClick={handleClear}
              style={{
                padding: '3px 8px',
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: 4,
                color: '#778',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              Clear
            </button>
          </div>

          {/* Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {DRUM_TRACKS.map(track => (
              <div key={track} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* Mute button */}
                <button
                  onClick={() => handleMute(track)}
                  title={muted.has(track) ? 'Unmute' : 'Mute'}
                  style={{
                    width: 20,
                    height: 20,
                    padding: 0,
                    background: muted.has(track) ? '#2a1a1a' : '#111122',
                    border: `1px solid ${muted.has(track) ? '#633' : '#334'}`,
                    borderRadius: 3,
                    color: muted.has(track) ? '#744' : '#668',
                    cursor: 'pointer',
                    fontSize: 9,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {muted.has(track) ? 'M' : 'M'}
                </button>

                {/* Track name */}
                <span style={{
                  width: 42,
                  fontSize: 10,
                  color: muted.has(track) ? '#444' : TRACK_COLORS[track],
                  textAlign: 'right',
                  flexShrink: 0,
                  userSelect: 'none',
                }}>
                  {track}
                </span>

                {/* Steps */}
                <div style={{ display: 'flex', gap: 2 }}>
                  {Array.from({ length: 16 }, (_, i) => {
                    const isOn = pattern[track][i] === 1;
                    const isCursor = currentStep === i && isPlaying;
                    const groupBorder = i % 4 === 0 && i > 0;
                    return (
                      <button
                        key={i}
                        onClick={() => handleToggleStep(track, i)}
                        style={{
                          width: 22,
                          height: 22,
                          padding: 0,
                          marginLeft: groupBorder ? 4 : 0,
                          background: isOn
                            ? (muted.has(track) ? '#2a2a2a' : TRACK_COLORS[track] + '55')
                            : (isCursor ? '#1e1e30' : '#111122'),
                          border: isCursor
                            ? `2px solid ${TRACK_COLORS[track]}`
                            : isOn
                            ? `1px solid ${TRACK_COLORS[track]}`
                            : '1px solid #223',
                          borderRadius: 3,
                          cursor: 'pointer',
                          transition: 'background 0.05s',
                        }}
                        aria-pressed={isOn}
                        title={`${track} step ${i + 1}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
