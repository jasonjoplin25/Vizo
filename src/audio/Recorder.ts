export interface RecordedEvent {
  type: 'noteOn' | 'noteOff';
  midiNote: number;
  velocity: number;
  time: number;
}

export interface Recording {
  id: string;
  name: string;
  events: RecordedEvent[];
  duration: number;
  createdAt: number;
}

const STORAGE_KEY = 'vizo_recordings';

export class Recorder {
  private _isRecording = false;
  private _startTime = 0;
  private _events: RecordedEvent[] = [];

  get isRecording(): boolean {
    return this._isRecording;
  }

  startRecording(): void {
    this._isRecording = true;
    this._startTime = performance.now();
    this._events = [];
  }

  stopRecording(): RecordedEvent[] {
    this._isRecording = false;
    return [...this._events];
  }

  noteOn(midi: number, vel: number): void {
    if (!this._isRecording) return;
    this._events.push({
      type: 'noteOn',
      midiNote: midi,
      velocity: vel,
      time: (performance.now() - this._startTime) / 1000,
    });
  }

  noteOff(midi: number): void {
    if (!this._isRecording) return;
    this._events.push({
      type: 'noteOff',
      midiNote: midi,
      velocity: 0,
      time: (performance.now() - this._startTime) / 1000,
    });
  }

  saveRecording(name: string, events: RecordedEvent[]): Recording {
    const duration = events.length > 0 ? events[events.length - 1].time : 0;
    const recording: Recording = {
      id: `rec_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name,
      events,
      duration,
      createdAt: Date.now(),
    };
    const all = this.loadAllRecordings();
    all.push(recording);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return recording;
  }

  loadAllRecordings(): Recording[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as Recording[];
    } catch {
      return [];
    }
  }

  deleteRecording(id: string): void {
    const all = this.loadAllRecordings().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  playbackRecording(
    recording: Recording,
    onNoteOn: (midi: number, vel: number) => void,
    onNoteOff: (midi: number) => void,
  ): () => void {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const event of recording.events) {
      const delay = event.time * 1000;
      if (event.type === 'noteOn') {
        timers.push(setTimeout(() => onNoteOn(event.midiNote, event.velocity), delay));
      } else {
        timers.push(setTimeout(() => onNoteOff(event.midiNote), delay));
      }
    }
    return () => timers.forEach(t => clearTimeout(t));
  }
}
