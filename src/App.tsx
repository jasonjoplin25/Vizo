import { useState, useCallback, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import { Keyboard } from './components/Keyboard';
import { VisualizerCanvas } from './components/VisualizerCanvas';
import { CymaticsCanvas } from './components/CymaticsCanvas';
import { Controls } from './components/Controls';
import { FilePlayerPanel } from './components/FilePlayer';
import { VisualParams } from './components/VisualParams';
import { RecorderPanel } from './components/RecorderPanel';
import { DrumMachine } from './components/DrumMachine';
import { useNoteEvents } from './hooks/useNoteEvents';
import { SoundEngine } from './audio/SoundEngine';
import { MidiAccess } from './audio/MidiAccess';
import { Metronome } from './audio/Metronome';
import { Recorder } from './audio/Recorder';
import type { DrumSynth } from './audio/DrumSynth';
import type { ParticleSystem } from './visualization/ParticleSystem';
import type { CymaticsEngine } from './visualization/CymaticsEngine';
import type { AppMode, VisualizationMode, TuningHz, InstrumentType, PlateShape } from './types';

export default function App() {
  // --- App State ---
  const [appMode, setAppMode] = useState<AppMode>('keyboard');
  const [vizMode, setVizMode] = useState<VisualizationMode>('particles');
  const [tuning, setTuning] = useState<TuningHz>(440);
  const [instrument, setInstrument] = useState<InstrumentType>('piano');
  const [plateShape, setPlateShape] = useState<PlateShape>('square');
  const [volume, setVolume] = useState(0.8);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [midiDevices, setMidiDevices] = useState<string[]>([]);
  const [keyPositions, setKeyPositions] = useState<Map<number, number>>(new Map());

  // --- New feature state ---
  const [bpm, setBpm] = useState(120);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [metronomeBeat, setMetronomeBeat] = useState(-1);
  const [isRecording, setIsRecording] = useState(false);
  const [drumMachineOpen, setDrumMachineOpen] = useState(false);
  const [drumSynth, setDrumSynth] = useState<DrumSynth | null>(null);

  // --- Engine refs for VisualParams sliders ---
  const [particleSystem, setParticleSystem] = useState<ParticleSystem | null>(null);
  const [cymaticsEngine, setCymaticsEngine] = useState<CymaticsEngine | null>(null);

  // --- Audio systems ---
  const engineRef = useRef<SoundEngine | null>(null);
  const midiRef = useRef<MidiAccess | null>(null);
  const metronomeRef = useRef<Metronome | null>(null);
  // Recorder lives here so handleNoteOn/Off can feed it directly
  const [recorder] = useState(() => new Recorder());

  // --- Note event bus ---
  const { subscribeNoteOn, subscribeNoteOff, emitNoteOn, emitNoteOff } = useNoteEvents(tuning);

  // Initialize sound engine
  useEffect(() => {
    const engine = new SoundEngine();
    engineRef.current = engine;
    return () => engine.dispose();
  }, []);

  // Initialize metronome
  useEffect(() => {
    const metro = new Metronome();
    metronomeRef.current = metro;
    metro.onBeat(beat => setMetronomeBeat(beat));
    return () => metro.dispose();
  }, []);

  // Keep engine in sync with settings
  useEffect(() => {
    engineRef.current?.setInstrument(instrument);
  }, [instrument]);

  useEffect(() => {
    engineRef.current?.setTuning(tuning);
  }, [tuning]);

  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume]);

  // Sync BPM to transport
  useEffect(() => {
    Tone.getTransport().bpm.value = bpm;
    if (metronomeRef.current) {
      metronomeRef.current.bpm = bpm;
    }
  }, [bpm]);

  // --- Note handlers ---
  const handleNoteOn = useCallback(async (midi: number, velocity = 80) => {
    await engineRef.current?.ensureStarted();
    engineRef.current?.noteOn(midi, velocity);
    emitNoteOn(midi, velocity);
    recorder.noteOn(midi, velocity);   // captured only when recorder.isRecording
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.add(midi);
      return next;
    });
  }, [emitNoteOn, recorder]);

  const handleNoteOff = useCallback((midi: number) => {
    engineRef.current?.noteOff(midi);
    emitNoteOff(midi);
    recorder.noteOff(midi);
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
  }, [emitNoteOff, recorder]);

  const handleFileNote = useCallback(async (midi: number, velocity = 80, duration?: number) => {
    await engineRef.current?.ensureStarted();
    emitNoteOn(midi, velocity);
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.add(midi);
      return next;
    });
    if (duration) {
      const offMs = duration * 1000;
      setTimeout(() => {
        emitNoteOff(midi);
        setActiveNotes(prev => {
          const next = new Set(prev);
          next.delete(midi);
          return next;
        });
      }, offMs);
    }
  }, [emitNoteOn, emitNoteOff]);

  // --- MIDI keyboard ---
  const handleConnectMidi = useCallback(async () => {
    try {
      if (!midiRef.current) {
        midiRef.current = new MidiAccess(handleNoteOn, handleNoteOff);
      }
      const devices = await midiRef.current.connect();
      setMidiDevices(devices);
    } catch (err) {
      alert(`MIDI Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [handleNoteOn, handleNoteOff]);

  // --- Metronome toggle ---
  const handleMetronome = useCallback(async () => {
    const metro = metronomeRef.current;
    if (!metro) return;
    if (metro.isRunning) {
      metro.stop();
      setMetronomeOn(false);
      setMetronomeBeat(-1);
    } else {
      await metro.start();
      setMetronomeOn(true);
    }
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      background: '#06060f',
      overflow: 'hidden',
      fontFamily: 'system-ui, sans-serif',
      color: '#ccc',
    }}>
      {/* Header */}
      <div style={{
        padding: '6px 16px',
        background: '#08081a',
        borderBottom: '1px solid #1a1a2a',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#6af', letterSpacing: 2 }}>
          VIZO
        </span>
        <span style={{ fontSize: 11, color: '#444' }}>Music Visualizer</span>
      </div>

      {/* Controls */}
      <Controls
        appMode={appMode}
        vizMode={vizMode}
        tuning={tuning}
        instrument={instrument}
        plateShape={plateShape}
        volume={volume}
        midiDevices={midiDevices}
        bpm={bpm}
        metronomeOn={metronomeOn}
        metronomeBeat={metronomeBeat}
        onAppMode={setAppMode}
        onVizMode={setVizMode}
        onTuning={t => {
          setTuning(t);
          engineRef.current?.setTuning(t);
        }}
        onInstrument={i => {
          setInstrument(i);
          engineRef.current?.setInstrument(i);
        }}
        onPlateShape={setPlateShape}
        onVolume={v => {
          setVolume(v);
          engineRef.current?.setVolume(v);
        }}
        onConnectMidi={handleConnectMidi}
        onBpm={setBpm}
        onMetronome={handleMetronome}
        onDrumMachine={() => setDrumMachineOpen(o => !o)}
      />

      {/* Recorder Panel */}
      <RecorderPanel
        recorder={recorder}
        onNoteOn={handleNoteOn}
        onNoteOff={handleNoteOff}
        onRecord={setIsRecording}
      />

      {/* File player controls (playback mode only) */}
      {appMode === 'playback' && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #1a1a2a', background: '#080812', flexShrink: 0 }}>
          <FilePlayerPanel tuning={tuning} onNote={handleFileNote} />
        </div>
      )}

      {/* Visualization area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {vizMode === 'particles' ? (
          <>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center bottom, #0a0a20 0%, #06060f 70%)' }} />
            <VisualizerCanvas
              subscribeNoteOn={subscribeNoteOn}
              subscribeNoteOff={subscribeNoteOff}
              keyPositions={keyPositions}
              onReady={setParticleSystem}
            />
          </>
        ) : (
          <CymaticsCanvas
            subscribeNoteOn={subscribeNoteOn}
            subscribeNoteOff={subscribeNoteOff}
            plateShape={plateShape}
            onReady={setCymaticsEngine}
          />
        )}

        {/* Parameter sliders */}
        <VisualParams
          vizMode={vizMode}
          particleSystem={particleSystem}
          cymaticsEngine={cymaticsEngine}
        />

        {activeNotes.size === 0 && !isRecording && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
            opacity: 0.3,
          }}>
            <div style={{ fontSize: 13, color: '#6af', marginBottom: 4 }}>
              {appMode === 'keyboard'
                ? 'Click keys or press A–; on your keyboard'
                : 'Load a MIDI or audio file to begin'}
            </div>
            {appMode === 'keyboard' && (
              <div style={{ fontSize: 11, color: '#446' }}>Connect a MIDI keyboard for full 88-key input</div>
            )}
          </div>
        )}
      </div>

      {/* Drum Machine (collapsible, above keyboard) */}
      {drumMachineOpen && (
        <div style={{ flexShrink: 0 }}>
          <DrumMachine
            drumSynth={drumSynth}
            onDrumSynthReady={setDrumSynth}
          />
        </div>
      )}

      {/* Piano keyboard */}
      <div style={{ flexShrink: 0 }}>
        <Keyboard
          activeNotes={activeNotes}
          onNoteOn={handleNoteOn}
          onNoteOff={handleNoteOff}
          onLayoutChange={setKeyPositions}
        />
      </div>
    </div>
  );
}
