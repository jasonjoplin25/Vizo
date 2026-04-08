import type { TuningHz } from '../types';

/**
 * Convert MIDI note number to frequency.
 * MIDI 69 = A4.
 */
export function noteToFrequency(midiNote: number, refPitch: TuningHz = 440): number {
  return refPitch * Math.pow(2, (midiNote - 69) / 12);
}

/** Convert frequency to nearest MIDI note number */
export function frequencyToNote(freq: number, refPitch: TuningHz = 440): number {
  return Math.round(69 + 12 * Math.log2(freq / refPitch));
}

/** Convert MIDI note to Tone.js note name (e.g. 60 → "C4") */
export function midiToToneName(midiNote: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const semitone = midiNote % 12;
  const octave = Math.floor(midiNote / 12) - 1;
  return `${noteNames[semitone]}${octave}`;
}

/** Convert MIDI note to frequency string for Tone.js when using custom tuning */
export function midiToToneFreq(midiNote: number, refPitch: TuningHz): string {
  const freq = noteToFrequency(midiNote, refPitch);
  return `${freq.toFixed(3)}`;
}
