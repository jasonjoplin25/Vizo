import { useRef, useState, useEffect } from 'react';
import { FilePlayer as Player } from '../audio/FilePlayer';
import { PitchDetector } from '../audio/PitchDetector';
import type { TuningHz } from '../types';

interface Props {
  tuning: TuningHz;
  onNote: (midiNote: number, velocity: number, duration?: number) => void;
}

export function FilePlayerPanel({ tuning, onNote }: Props) {
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState<'midi' | 'audio' | null>(null);
  const [midiInfo, setMidiInfo] = useState<{ duration: number; trackCount: number } | null>(null);

  const playerRef = useRef<Player | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const detectorRef = useRef<PitchDetector | null>(null);

  useEffect(() => {
    playerRef.current = new Player((midi, vel, dur) => {
      onNote(midi, vel, dur);
    });
    return () => {
      playerRef.current?.stop();
    };
  }, [onNote]);

  useEffect(() => {
    playerRef.current?.setTuning(tuning);
    detectorRef.current?.setRefPitch(tuning);
  }, [tuning]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStatus('idle');
    playerRef.current?.stop();
    detectorRef.current?.stop();

    const isMidi = file.name.toLowerCase().endsWith('.mid') || file.name.toLowerCase().endsWith('.midi');
    const isAudio = /\.(mp3|wav|ogg|flac)$/i.test(file.name);

    if (isMidi) {
      setFileType('midi');
      const buf = await file.arrayBuffer();
      try {
        const info = await playerRef.current?.loadMidi(buf);
        setMidiInfo(info ?? null);
      } catch (err) {
        console.error('MIDI load error', err);
      }
    } else if (isAudio) {
      setFileType('audio');
      const url = URL.createObjectURL(file);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.load();
      }
    }
  };

  const handlePlay = async () => {
    if (fileType === 'midi') {
      playerRef.current?.playMidi();
      setStatus('playing');
    } else if (fileType === 'audio' && audioRef.current) {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      if (!detectorRef.current) {
        detectorRef.current = new PitchDetector(
          audioCtxRef.current,
          (midi, _freq) => onNote(midi, 80),
          tuning,
        );
      }

      detectorRef.current.connectElement(audioRef.current);
      await audioRef.current.play();
      detectorRef.current.start();
      setStatus('playing');
    }
  };

  const handleStop = () => {
    playerRef.current?.stop();
    detectorRef.current?.stop();
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setStatus('idle');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{
          padding: '6px 12px',
          background: '#2a2a3a',
          border: '1px solid #444',
          borderRadius: 4,
          color: '#ccc',
          cursor: 'pointer',
          fontSize: 12,
          whiteSpace: 'nowrap',
        }}>
          Load File
          <input
            type="file"
            accept=".mid,.midi,.mp3,.wav,.ogg,.flac"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
        </label>

        {fileName && (
          <span style={{ fontSize: 11, color: '#888', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName}
            {midiInfo && ` (${midiInfo.trackCount} tracks, ${midiInfo.duration.toFixed(1)}s)`}
          </span>
        )}

        {fileType && (
          <>
            <button
              onClick={handlePlay}
              disabled={status === 'playing'}
              style={btnStyle(!fileName || status === 'playing')}
            >
              ▶ Play
            </button>
            <button
              onClick={handleStop}
              disabled={status === 'idle'}
              style={btnStyle(status === 'idle')}
            >
              ■ Stop
            </button>
          </>
        )}
      </div>

      {fileType === 'audio' && (
        <div style={{ fontSize: 11, color: '#666' }}>
          Audio mode uses real-time pitch detection
        </div>
      )}

      {/* Hidden audio element for playback */}
      <audio ref={audioRef} onEnded={() => setStatus('idle')} style={{ display: 'none' }} />
    </div>
  );
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    background: disabled ? '#1a1a2a' : '#2a3a5a',
    border: `1px solid ${disabled ? '#333' : '#446'}`,
    borderRadius: 4,
    color: disabled ? '#555' : '#9af',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 12,
  };
}
