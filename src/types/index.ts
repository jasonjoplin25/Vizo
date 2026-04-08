export interface NoteEvent {
  midiNote: number;
  velocity: number;
  frequency: number;
  color: string;
  colorHSL: [number, number, number];
  timestamp: number;
  duration?: number;
}

export type AppMode = 'keyboard' | 'playback';
export type VisualizationMode = 'particles' | 'cymatics';
export type TuningHz = 440 | 432;
export type InstrumentType = 'piano' | 'synth' | 'organ' | 'strings';
export type PlateShape = 'square' | 'circle' | 'triangle' | 'pentagon' | 'hexagon' | 'octagon';

export interface KeyInfo {
  midi: number;
  noteName: string;
  noteNameFull: string;
  isBlack: boolean;
  /** x center in white-key units (0 = leftmost white key) */
  xPos: number;
  /** white key index, or -1 for black keys */
  whiteIndex: number;
  octave: number;
  semitone: number;
}

export interface AppState {
  appMode: AppMode;
  vizMode: VisualizationMode;
  tuning: TuningHz;
  instrument: InstrumentType;
  plateShape: PlateShape;
  activeNotes: Set<number>;
  volume: number;
}
