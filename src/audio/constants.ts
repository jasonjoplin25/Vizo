import type { KeyInfo } from '../types';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI semitones that are black keys */
export const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

/** Fractional x-offset within a 7-white-key octave for each semitone (in white-key units) */
const OCTAVE_X: Record<number, number> = {
  0:  0.0,   // C
  1:  0.65,  // C#
  2:  1.0,   // D
  3:  1.83,  // D#
  4:  2.0,   // E
  5:  3.0,   // F
  6:  3.65,  // F#
  7:  4.0,   // G
  8:  4.5,   // G#
  9:  5.0,   // A
  10: 5.83,  // A#
  11: 6.0,   // B
};

/**
 * Builds the full 88-key layout from A0 (MIDI 21) to C8 (MIDI 108).
 * xPos is in white-key units, normalized so A0 = 0.
 */
export function buildKeyLayout(): KeyInfo[] {
  const keys: KeyInfo[] = [];
  let whiteIndex = 0;

  // A0 = MIDI 21. Its position in a C-based octave system:
  // C0 = MIDI 12. A0 semitone=9, octave=0.
  const startOctave = Math.floor((21 - 12) / 12); // 0
  const startSemitone = (21 - 12) % 12; // 9 (A)
  const startXPos = startOctave * 7 + OCTAVE_X[startSemitone]; // 0*7 + 5 = 5

  for (let midi = 21; midi <= 108; midi++) {
    const semitone = midi % 12; // 0=C, 1=C#, ..., 11=B
    const octave = Math.floor(midi / 12) - 1; // C-based octave number
    const cOctave = Math.floor((midi - 12) / 12); // octave from C0
    const isBlack = BLACK_SEMITONES.has(semitone);
    const noteName = NOTE_NAMES[semitone];
    const noteNameFull = `${noteName}${octave}`;

    const rawX = cOctave * 7 + OCTAVE_X[semitone];
    const xPos = rawX - startXPos;

    keys.push({
      midi,
      noteName,
      noteNameFull,
      isBlack,
      xPos,
      whiteIndex: isBlack ? -1 : whiteIndex,
      octave,
      semitone,
    });

    if (!isBlack) whiteIndex++;
  }

  return keys;
}

export const KEY_LAYOUT: KeyInfo[] = buildKeyLayout();

/** Total white keys on an 88-key piano */
export const WHITE_KEY_COUNT = KEY_LAYOUT.filter(k => !k.isBlack).length; // 52

export const MIDI_MIN = 21;
export const MIDI_MAX = 108;
