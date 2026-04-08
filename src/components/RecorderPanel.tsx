import { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { type Recorder, type Recording, type RecordedEvent } from '../audio/Recorder';

interface Props {
  recorder: Recorder;
  onNoteOn:  (midi: number, vel: number) => void;
  onNoteOff: (midi: number) => void;
  onRecord:  (active: boolean) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RecorderPanel({ recorder, onNoteOn, onNoteOff, onRecord }: Props) {
  const [isRecording, setIsRecording]     = useState(false);
  const [elapsedSecs, setElapsedSecs]     = useState(0);
  const [pendingEvents, setPendingEvents] = useState<RecordedEvent[] | null>(null);
  const [saveName, setSaveName]           = useState('');
  const [recordings, setRecordings]       = useState<Recording[]>([]);
  const [playingId, setPlayingId]         = useState<string | null>(null);
  const cancelPlayRef = useRef<(() => void) | null>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load saved recordings on mount
  useEffect(() => {
    setRecordings(recorder.loadAllRecordings());
  }, [recorder]);

  // Elapsed-time ticker
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000);
    } else {
      if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current !== null) clearInterval(timerRef.current); };
  }, [isRecording]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleStartRecording() {
    recorder.startRecording();
    setIsRecording(true);
    setElapsedSecs(0);
    setPendingEvents(null);
    onRecord(true);
  }

  function handleStopRecording() {
    const events = recorder.stopRecording();
    setIsRecording(false);
    setPendingEvents(events);
    setSaveName(`Recording ${recordings.length + 1}`);
    onRecord(false);
  }

  function handleSave() {
    if (!pendingEvents) return;
    const rec = recorder.saveRecording(saveName.trim() || 'Untitled', pendingEvents);
    setRecordings(r => [...r, rec]);
    setPendingEvents(null);
    setSaveName('');
  }

  function handleDiscard() {
    setPendingEvents(null);
    setSaveName('');
  }

  function handleDelete(id: string) {
    recorder.deleteRecording(id);
    setRecordings(r => r.filter(x => x.id !== id));
    if (playingId === id) handleStopPlay();
  }

  async function handlePlay(rec: Recording) {
    // Stop any currently playing recording
    if (playingId) {
      cancelPlayRef.current?.();
      cancelPlayRef.current = null;
    }

    // Unlock AudioContext from this user-gesture before setTimeout callbacks fire
    await Tone.start();
    await engineEnsure();

    setPlayingId(rec.id);

    const cancel = recorder.playbackRecording(rec, onNoteOn, onNoteOff);
    cancelPlayRef.current = cancel;

    // Auto-clear state after the recording finishes
    const endTimer = setTimeout(() => {
      setPlayingId(id => (id === rec.id ? null : id));
    }, rec.duration * 1000 + 300);

    // Wrap cancel to also clear the end-timer
    cancelPlayRef.current = () => { cancel(); clearTimeout(endTimer); };
  }

  function handleStopPlay() {
    cancelPlayRef.current?.();
    cancelPlayRef.current = null;
    setPlayingId(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      padding: '6px 12px',
      background: '#0a0a18',
      borderBottom: '1px solid #1a1a2a',
      alignItems: 'center',
      fontSize: 11,
      flexShrink: 0,
    }}>
      {/* Record / Stop button */}
      <button
        onClick={isRecording ? handleStopRecording : handleStartRecording}
        style={{
          padding: '4px 10px',
          background: isRecording ? '#3a0a0a' : '#1a0a0a',
          border: `1px solid ${isRecording ? '#f44' : '#633'}`,
          borderRadius: 4,
          color: isRecording ? '#f66' : '#c44',
          cursor: 'pointer',
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {isRecording
          ? <><span style={{ color: '#f44' }}>■</span> Stop</>
          : <><span style={{ color: '#f44' }}>●</span> Record</>}
      </button>

      {/* Recording timer */}
      {isRecording && (
        <span style={{ color: '#f66', minWidth: 80 }}>
          ● Recording {formatTime(elapsedSecs)}
        </span>
      )}

      {/* Save / Discard prompt */}
      {pendingEvents && !isRecording && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {pendingEvents.length === 0
            ? <span style={{ color: '#666', fontSize: 10 }}>Nothing recorded</span>
            : <>
                <input
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                  placeholder="Name this recording"
                  autoFocus
                  style={{
                    padding: '3px 7px',
                    background: '#111122',
                    border: '1px solid #334',
                    borderRadius: 4,
                    color: '#aaf',
                    fontSize: 11,
                    width: 150,
                  }}
                />
                <button onClick={handleSave} style={smallBtn('#1a3a1a', '#4a8', '#6ca')}>Save</button>
              </>
          }
          <button onClick={handleDiscard} style={smallBtn('#1a1a2a', '#444', '#888')}>Discard</button>
        </div>
      )}

      {/* Saved recordings list */}
      {recordings.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ color: '#334' }}>|</span>
          {recordings.map(rec => (
            <div key={rec.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: '#111122',
              border: `1px solid ${playingId === rec.id ? '#446' : '#224'}`,
              borderRadius: 4,
              padding: '2px 6px',
            }}>
              <span style={{ color: '#99c', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {rec.name}
              </span>
              <span style={{ color: '#446', fontSize: 10 }}>{formatTime(rec.duration)}</span>
              {playingId === rec.id
                ? <button onClick={handleStopPlay}          style={iconBtn('#f93')}>■</button>
                : <button onClick={() => void handlePlay(rec)} style={iconBtn('#6af')}>▶</button>
              }
              <button onClick={() => handleDelete(rec.id)} style={iconBtn('#f66')}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function smallBtn(bg: string, border: string, color: string): React.CSSProperties {
  return { padding: '3px 8px', background: bg, border: `1px solid ${border}`, borderRadius: 4, color, cursor: 'pointer', fontSize: 11 };
}
function iconBtn(color: string): React.CSSProperties {
  return { padding: '1px 5px', background: 'transparent', border: 'none', color, cursor: 'pointer', fontSize: 11 };
}

// Thin shim so RecorderPanel doesn't need to import SoundEngine
async function engineEnsure() {
  // AudioContext is unlocked by Tone.start() above; this is a no-op safety call
  try { if (Tone.getContext().state !== 'running') await Tone.start(); } catch { /* ignore */ }
}
