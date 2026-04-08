import { useCallback, useRef } from 'react';
import type { NoteEvent } from '../types';
import { noteToColor, noteToHSL } from '../visualization/colorMapping';
import { noteToFrequency } from '../audio/frequency';
import type { TuningHz } from '../types';

export type NoteOnHandler = (event: NoteEvent) => void;
export type NoteOffHandler = (midiNote: number) => void;

/**
 * Central note event bus. Components subscribe to note events via callbacks.
 * Returns a stable emitNoteOn / emitNoteOff that other systems call.
 */
export function useNoteEvents(tuning: TuningHz) {
  const onNoteOnHandlers = useRef<NoteOnHandler[]>([]);
  const onNoteOffHandlers = useRef<NoteOffHandler[]>([]);

  const subscribeNoteOn = useCallback((handler: NoteOnHandler) => {
    onNoteOnHandlers.current.push(handler);
    return () => {
      onNoteOnHandlers.current = onNoteOnHandlers.current.filter(h => h !== handler);
    };
  }, []);

  const subscribeNoteOff = useCallback((handler: NoteOffHandler) => {
    onNoteOffHandlers.current.push(handler);
    return () => {
      onNoteOffHandlers.current = onNoteOffHandlers.current.filter(h => h !== handler);
    };
  }, []);

  const emitNoteOn = useCallback((midiNote: number, velocity = 80) => {
    const event: NoteEvent = {
      midiNote,
      velocity,
      frequency: noteToFrequency(midiNote, tuning),
      color: noteToColor(midiNote),
      colorHSL: noteToHSL(midiNote),
      timestamp: Date.now(),
    };
    onNoteOnHandlers.current.forEach(h => h(event));
  }, [tuning]);

  const emitNoteOff = useCallback((midiNote: number) => {
    onNoteOffHandlers.current.forEach(h => h(midiNote));
  }, []);

  return { subscribeNoteOn, subscribeNoteOff, emitNoteOn, emitNoteOff };
}
