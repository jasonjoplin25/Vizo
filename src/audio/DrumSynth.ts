import * as Tone from 'tone';
import { DRUM_TRACKS, type DrumTrackName, type Pattern, DRUM_PRESETS } from './drumPresets';

type TrackSynth = Tone.MembraneSynth | Tone.NoiseSynth | Tone.MetalSynth;

interface TrackInfo {
  synth: TrackSynth;
  gain: Tone.Gain;
  note?: string; // for MembraneSynth
  isMembrane?: boolean;
  isNoise?: boolean;
  isMetal?: boolean;
}

function emptyPattern(): Pattern {
  const p = {} as Pattern;
  for (const t of DRUM_TRACKS) {
    p[t] = new Array(16).fill(0) as number[];
  }
  return p;
}

export class DrumSynth {
  private tracks: Record<DrumTrackName, TrackInfo>;
  private masterGain: Tone.Gain;
  private sequences: Tone.Sequence<number>[] = [];
  private _steps: Pattern;
  private _currentStep = 0;
  private _isPlaying = false;
  private _stepCallback: ((step: number) => void) | null = null;
  private mutedTracks: Set<DrumTrackName> = new Set();

  constructor() {
    this.masterGain = new Tone.Gain(0.8).toDestination();
    this._steps = emptyPattern();

    // Build instruments
    const kickSynth = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 8,
      envelope: { sustain: 0, release: 0.1 },
    });
    const snareSynth = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0 },
    });
    const chhSynth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.04, release: 0.01 },
      volume: -12,
    });
    chhSynth.frequency.value = 400;
    const ohhSynth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.3, release: 0.1 },
      volume: -14,
    });
    ohhSynth.frequency.value = 400;
    const clapSynth = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.005, decay: 0.08, sustain: 0 },
      volume: -10,
    });
    const tomHSynth = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 4,
      envelope: { sustain: 0, release: 0.1 },
      volume: -8,
    });
    const tomLSynth = new Tone.MembraneSynth({
      pitchDecay: 0.07,
      octaves: 6,
      envelope: { sustain: 0, release: 0.15 },
      volume: -8,
    });
    const crashSynth = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 1.0, release: 0.3 },
      volume: -16,
    });
    crashSynth.frequency.value = 300;

    const makeGain = (synth: TrackSynth) => {
      const g = new Tone.Gain(1);
      synth.connect(g);
      g.connect(this.masterGain);
      return g;
    };

    this.tracks = {
      Kick:    { synth: kickSynth,  gain: makeGain(kickSynth),  isMembrane: true, note: 'C1' },
      Snare:   { synth: snareSynth, gain: makeGain(snareSynth), isNoise: true },
      CHH:     { synth: chhSynth,   gain: makeGain(chhSynth),   isMetal: true },
      OHH:     { synth: ohhSynth,   gain: makeGain(ohhSynth),   isMetal: true },
      Clap:    { synth: clapSynth,  gain: makeGain(clapSynth),  isNoise: true },
      'Tom H': { synth: tomHSynth,  gain: makeGain(tomHSynth),  isMembrane: true, note: 'G2' },
      'Tom L': { synth: tomLSynth,  gain: makeGain(tomLSynth),  isMembrane: true, note: 'D2' },
      Crash:   { synth: crashSynth, gain: makeGain(crashSynth), isMetal: true },
    };
  }

  get steps(): Pattern {
    return this._steps;
  }

  get currentStep(): number {
    return this._currentStep;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  setPattern(p: Pattern): void {
    this._steps = p;
  }

  toggleStep(track: DrumTrackName, step: number): void {
    this._steps[track][step] = this._steps[track][step] ? 0 : 1;
  }

  setVolume(track: DrumTrackName, vol: number): void {
    // vol in -30..0 dB, convert to gain
    const gainVal = Math.pow(10, vol / 20);
    this.tracks[track].gain.gain.value = gainVal;
  }

  setMuted(track: DrumTrackName, muted: boolean): void {
    if (muted) {
      this.mutedTracks.add(track);
    } else {
      this.mutedTracks.delete(track);
    }
  }

  onStep(cb: (step: number) => void): void {
    this._stepCallback = cb;
  }

  private triggerTrack(track: DrumTrackName, time: number): void {
    if (this.mutedTracks.has(track)) return;
    const info = this.tracks[track];
    if (info.isMembrane) {
      (info.synth as Tone.MembraneSynth).triggerAttackRelease(info.note ?? 'C1', '8n', time);
    } else if (info.isNoise) {
      (info.synth as Tone.NoiseSynth).triggerAttackRelease('8n', time);
    } else if (info.isMetal) {
      (info.synth as Tone.MetalSynth).triggerAttackRelease('8n', time);
    }
  }

  async play(): Promise<void> {
    await Tone.start();

    // Dispose old sequences
    this.stopSequences();

    const stepValues: number[] = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];

    // One sequence per track
    for (const trackName of DRUM_TRACKS) {
      const track = trackName;
      const seq = new Tone.Sequence<number>(
        (time, step) => {
          // Visual callback (only once, from kick track)
          if (track === 'Kick') {
            this._currentStep = step;
            const delayMs = (time - Tone.getContext().currentTime) * 1000;
            setTimeout(() => {
              this._stepCallback?.(step);
            }, Math.max(0, delayMs));
          }
          if (this._steps[track][step]) {
            this.triggerTrack(track, time);
          }
        },
        stepValues,
        '16n',
      );
      seq.start(0);
      this.sequences.push(seq);
    }

    Tone.getTransport().start();
    this._isPlaying = true;
  }

  private stopSequences(): void {
    for (const seq of this.sequences) {
      seq.stop();
      seq.dispose();
    }
    this.sequences = [];
  }

  stop(): void {
    this.stopSequences();
    Tone.getTransport().stop();
    this._isPlaying = false;
    this._currentStep = 0;
    this._stepCallback?.(-1);
  }

  dispose(): void {
    this.stop();
    for (const t of DRUM_TRACKS) {
      this.tracks[t].synth.dispose();
      this.tracks[t].gain.dispose();
    }
    this.masterGain.dispose();
  }
}

// Re-export for convenience
export { DRUM_PRESETS };
