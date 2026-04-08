import type { AppMode, VisualizationMode, TuningHz, InstrumentType, PlateShape } from '../types';

interface Props {
  appMode: AppMode;
  vizMode: VisualizationMode;
  tuning: TuningHz;
  instrument: InstrumentType;
  plateShape: PlateShape;
  volume: number;
  midiDevices: string[];
  bpm: number;
  metronomeOn: boolean;
  metronomeBeat: number;
  onAppMode: (m: AppMode) => void;
  onVizMode: (m: VisualizationMode) => void;
  onTuning: (t: TuningHz) => void;
  onInstrument: (i: InstrumentType) => void;
  onPlateShape: (s: PlateShape) => void;
  onVolume: (v: number) => void;
  onConnectMidi: () => void;
  onBpm: (v: number) => void;
  onMetronome: () => void;
  onDrumMachine: () => void;
}

export function Controls({
  appMode, vizMode, tuning, instrument, plateShape, volume,
  midiDevices,
  bpm, metronomeOn, metronomeBeat,
  onAppMode, onVizMode, onTuning, onInstrument, onPlateShape, onVolume,
  onConnectMidi,
  onBpm, onMetronome, onDrumMachine,
}: Props) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 10,
      padding: '8px 12px',
      background: '#0d0d1a',
      borderTop: '1px solid #222',
      borderBottom: '1px solid #222',
      alignItems: 'center',
    }}>

      {/* App mode */}
      <SegmentControl
        label="Mode"
        options={[
          { value: 'keyboard', label: '⌨ Keyboard' },
          { value: 'playback', label: '▶ Playback' },
        ]}
        value={appMode}
        onChange={onAppMode}
      />

      <Divider />

      {/* Visualization mode */}
      <SegmentControl
        label="Visual"
        options={[
          { value: 'particles', label: '✦ Particles' },
          { value: 'cymatics', label: '◎ Cymatics' },
        ]}
        value={vizMode}
        onChange={onVizMode}
      />

      <Divider />

      {/* Tuning */}
      <SegmentControl
        label="Tuning"
        options={[
          { value: 440, label: '440 Hz' },
          { value: 432, label: '432 Hz' },
        ]}
        value={tuning}
        onChange={onTuning}
      />

      <Divider />

      {/* Instrument */}
      <Select
        label="Instrument"
        options={[
          { value: 'piano', label: 'Piano' },
          { value: 'synth', label: 'Synth' },
          { value: 'organ', label: 'Organ' },
          { value: 'strings', label: 'Strings' },
        ]}
        value={instrument}
        onChange={onInstrument}
      />

      {/* Plate shape (only relevant in cymatics) */}
      {vizMode === 'cymatics' && (
        <>
          <Divider />
          <Select
            label="Plate"
            options={[
              { value: 'square',   label: '▢ Square'   },
              { value: 'circle',   label: '◯ Circle'   },
              { value: 'triangle', label: '△ Triangle' },
              { value: 'pentagon', label: '⬠ Pentagon' },
              { value: 'hexagon',  label: '⬡ Hexagon'  },
              { value: 'octagon',  label: '⯃ Octagon'  },
            ]}
            value={plateShape}
            onChange={onPlateShape}
          />
        </>
      )}

      <Divider />

      {/* Volume */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={e => onVolume(parseFloat(e.target.value))}
          style={{ width: 80, accentColor: '#6af' }}
        />
      </label>

      <Divider />

      {/* BPM */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>BPM</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number"
            min={40}
            max={240}
            value={bpm}
            onChange={e => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 40 && v <= 240) onBpm(v);
            }}
            style={{
              width: 44,
              padding: '3px 4px',
              background: '#1a1a2a',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#9af',
              fontSize: 11,
              textAlign: 'center',
            }}
          />
          <input
            type="range"
            min={40}
            max={240}
            step={1}
            value={bpm}
            onChange={e => onBpm(parseInt(e.target.value, 10))}
            style={{ width: 70, accentColor: '#9af' }}
          />
        </div>
      </div>

      <Divider />

      {/* Metronome */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Metronome</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <button
            onClick={onMetronome}
            style={{
              padding: '4px 8px',
              background: metronomeOn ? '#1a2a3a' : '#1a1a2a',
              border: `1px solid ${metronomeOn ? '#48a' : '#333'}`,
              borderRadius: 4,
              color: metronomeOn ? '#6af' : '#666',
              cursor: 'pointer',
              fontSize: 13,
            }}
            title={metronomeOn ? 'Stop metronome' : 'Start metronome'}
          >
            ♩
          </button>
          {/* Beat dots */}
          <div style={{ display: 'flex', gap: 3 }}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: metronomeOn && metronomeBeat === i
                    ? (i === 0 ? '#f93' : '#6af')
                    : '#222',
                  border: `1px solid ${metronomeOn ? '#334' : '#222'}`,
                  transition: 'background 0.05s',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <Divider />

      {/* Drum Machine toggle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Drums</span>
        <button
          onClick={onDrumMachine}
          style={{
            padding: '4px 8px',
            background: '#1a1a2a',
            border: '1px solid #334',
            borderRadius: 4,
            color: '#9af',
            cursor: 'pointer',
            fontSize: 13,
          }}
          title="Toggle drum machine"
        >
          🥁
        </button>
      </div>

      <Divider />

      {/* MIDI device */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>MIDI</span>
        <button onClick={onConnectMidi} style={smallBtnStyle}>
          {midiDevices.length > 0 ? `🎹 ${midiDevices[0].slice(0, 16)}` : 'Connect Keyboard'}
        </button>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 28, background: '#222', flexShrink: 0 }} />;
}

interface Option<T> { value: T; label: string }

function SegmentControl<T extends string | number>({
  label, options, value, onChange,
}: { label: string; options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      <div style={{ display: 'flex', border: '1px solid #333', borderRadius: 4, overflow: 'hidden' }}>
        {options.map(opt => (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '4px 10px',
              background: value === opt.value ? '#1e3a6a' : '#0d0d1a',
              color: value === opt.value ? '#6af' : '#666',
              border: 'none',
              borderRight: '1px solid #333',
              cursor: 'pointer',
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Select<T extends string>({
  label, options, value, onChange,
}: { label: string; options: Option<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        style={{
          padding: '4px 8px',
          background: '#1a1a2a',
          border: '1px solid #333',
          borderRadius: 4,
          color: '#9af',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: '#1a1a2a',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#9af',
  cursor: 'pointer',
  fontSize: 11,
};
