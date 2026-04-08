import { Midi } from '@tonejs/midi';
import * as Tone from 'tone';
import type { TuningHz } from '../types';
import { noteToFrequency } from './frequency';

export type FileNoteCallback = (midiNote: number, velocity: number, duration: number) => void;

export class FilePlayer {
  private tuning: TuningHz = 440;
  private onNote: FileNoteCallback;
  private scheduledIds: ReturnType<typeof setTimeout>[] = [];
  private isPlaying = false;
  private midiData: Midi | null = null;

  constructor(onNote: FileNoteCallback) {
    this.onNote = onNote;
  }

  setTuning(hz: TuningHz) {
    this.tuning = hz;
  }

  async loadMidi(arrayBuffer: ArrayBuffer): Promise<{ duration: number; trackCount: number }> {
    this.midiData = new Midi(arrayBuffer);
    return {
      duration: this.midiData.duration,
      trackCount: this.midiData.tracks.length,
    };
  }

  playMidi() {
    if (!this.midiData) return;
    this.stop();
    this.isPlaying = true;

    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 1.5 },
      volume: -6,
    }).toDestination();

    this.midiData.tracks.forEach(track => {
      track.notes.forEach(note => {
        const delayMs = note.time * 1000;
        const id = setTimeout(() => {
          if (!this.isPlaying) return;
          const freq = noteToFrequency(note.midi, this.tuning);
          synth.triggerAttackRelease(freq, note.duration, Tone.now(), note.velocity);
          this.onNote(note.midi, Math.round(note.velocity * 127), note.duration);
        }, delayMs);
        this.scheduledIds.push(id);
      });
    });

    // Auto-stop
    const totalMs = this.midiData.duration * 1000 + 500;
    const stopId = setTimeout(() => {
      synth.dispose();
      this.isPlaying = false;
    }, totalMs);
    this.scheduledIds.push(stopId);
  }

  stop() {
    this.isPlaying = false;
    this.scheduledIds.forEach(id => clearTimeout(id));
    this.scheduledIds = [];
  }

  get playing() {
    return this.isPlaying;
  }
}
