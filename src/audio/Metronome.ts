import * as Tone from 'tone';

export class Metronome {
  private _bpm = 120;
  private _isRunning = false;
  private _sequence: Tone.Sequence<number> | null = null;
  private _beatCallback: ((beat: number) => void) | null = null;

  private accentSynth: Tone.Synth;
  private clickSynth: Tone.Synth;

  constructor() {
    this.accentSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 },
      volume: -6,
    }).toDestination();

    this.clickSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.04 },
      volume: -12,
    }).toDestination();
  }

  get bpm(): number {
    return this._bpm;
  }

  set bpm(v: number) {
    this._bpm = v;
    Tone.getTransport().bpm.value = v;
  }

  onBeat(cb: (beat: number) => void): void {
    this._beatCallback = cb;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  async start(): Promise<void> {
    await Tone.start();
    Tone.getTransport().bpm.value = this._bpm;

    this._sequence = new Tone.Sequence<number>(
      (time, beat) => {
        if (beat === 0) {
          this.accentSynth.triggerAttackRelease('C6', '32n', time);
        } else {
          this.clickSynth.triggerAttackRelease('G5', '32n', time);
        }
        // Schedule visual callback after audio context time
        const delayMs = (time - Tone.getContext().currentTime) * 1000;
        setTimeout(() => {
          this._beatCallback?.(beat);
        }, Math.max(0, delayMs));
      },
      [0, 1, 2, 3],
      '4n',
    );

    this._sequence.start(0);
    Tone.getTransport().start();
    this._isRunning = true;
  }

  stop(): void {
    if (this._sequence) {
      this._sequence.stop();
      this._sequence.dispose();
      this._sequence = null;
    }
    this._isRunning = false;
  }

  dispose(): void {
    this.stop();
    this.accentSynth.dispose();
    this.clickSynth.dispose();
  }
}
