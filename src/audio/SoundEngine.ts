import * as Tone from 'tone';
import type { InstrumentType, TuningHz } from '../types';
import { noteToFrequency } from './frequency';

type PolyInstrument = Tone.PolySynth<Tone.Synth> | Tone.PolySynth<Tone.AMSynth> | Tone.PolySynth<Tone.FMSynth>;

const INSTRUMENT_OPTIONS: Record<InstrumentType, () => PolyInstrument> = {
  piano: () =>
    new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 1.5 },
      volume: -6,
    }),
  synth: () =>
    new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.5 },
      volume: -8,
    }),
  organ: () =>
    new Tone.PolySynth(Tone.FMSynth, {
      modulationIndex: 3,
      envelope: { attack: 0.01, decay: 0.0, sustain: 1.0, release: 0.1 },
      volume: -10,
    }) as unknown as PolyInstrument,
  strings: () =>
    new Tone.PolySynth(Tone.AMSynth, {
      envelope: { attack: 0.2, decay: 0.1, sustain: 0.9, release: 1.0 },
      volume: -8,
    }) as unknown as PolyInstrument,
};

export class SoundEngine {
  private instrument: PolyInstrument;
  private reverb: Tone.Reverb;
  private gain: Tone.Gain;
  private tuning: TuningHz = 440;

  constructor() {
    this.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.2 });
    this.gain = new Tone.Gain(0.8);
    this.instrument = INSTRUMENT_OPTIONS.piano();
    this.instrument.connect(this.reverb);
    this.reverb.connect(this.gain);
    this.gain.toDestination();
  }

  setInstrument(type: InstrumentType) {
    this.instrument.dispose();
    this.instrument = INSTRUMENT_OPTIONS[type]();
    this.instrument.connect(this.reverb);
  }

  setTuning(hz: TuningHz) {
    this.tuning = hz;
  }

  setVolume(vol: number) {
    // vol: 0-1
    this.gain.gain.rampTo(vol * 0.8 + 0.02, 0.1);
  }

  async ensureStarted() {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  noteOn(midiNote: number, velocity = 80) {
    const freq = noteToFrequency(midiNote, this.tuning);
    const normVel = velocity / 127;
    this.instrument.triggerAttack(freq, Tone.now(), normVel);
  }

  noteOff(midiNote: number) {
    const freq = noteToFrequency(midiNote, this.tuning);
    this.instrument.triggerRelease(freq, Tone.now());
  }

  noteOnOff(midiNote: number, duration: number, velocity = 80) {
    const freq = noteToFrequency(midiNote, this.tuning);
    const normVel = velocity / 127;
    this.instrument.triggerAttackRelease(freq, duration, Tone.now(), normVel);
  }

  dispose() {
    this.instrument.dispose();
    this.reverb.dispose();
    this.gain.dispose();
  }
}
