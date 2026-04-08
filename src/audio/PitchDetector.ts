/**
 * Real-time pitch detection from audio using autocorrelation (YIN-inspired).
 * Used for detecting notes from MP3/WAV audio input.
 */
export class PitchDetector {
  private analyser: AnalyserNode;
  private buf: Float32Array<ArrayBuffer>;
  private context: AudioContext;
  private source: MediaElementAudioSourceNode | null = null;
  private rafId: number | null = null;
  private onNote: (midi: number, freq: number) => void;
  private lastNote = -1;
  private lastNoteTime = 0;
  private refPitch: number;

  constructor(
    context: AudioContext,
    onNote: (midi: number, freq: number) => void,
    refPitch = 440,
  ) {
    this.context = context;
    this.onNote = onNote;
    this.refPitch = refPitch;

    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.5;
    this.buf = new Float32Array(this.analyser.fftSize) as Float32Array<ArrayBuffer>;
  }

  connectElement(el: HTMLAudioElement): MediaElementAudioSourceNode {
    if (this.source) {
      this.source.disconnect();
    }
    this.source = this.context.createMediaElementSource(el);
    this.source.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    return this.source;
  }

  setRefPitch(hz: number) {
    this.refPitch = hz;
  }

  start() {
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop);
    this.analyser.getFloatTimeDomainData(this.buf);

    const freq = this.autocorrelate(this.buf, this.context.sampleRate);
    if (freq > 0) {
      const midi = Math.round(69 + 12 * Math.log2(freq / this.refPitch));
      if (
        midi !== this.lastNote &&
        midi >= 21 &&
        midi <= 108 &&
        Date.now() - this.lastNoteTime > 80
      ) {
        this.lastNote = midi;
        this.lastNoteTime = Date.now();
        this.onNote(midi, freq);
      }
    }
  };

  /**
   * YIN-based autocorrelation pitch detection.
   * Returns dominant frequency in Hz, or -1 if no clear pitch found.
   */
  private autocorrelate(buf: Float32Array, sampleRate: number): number {
    const SIZE = buf.length;
    const MAX_SAMPLES = Math.floor(SIZE / 2);
    const threshold = 0.2;

    // Check if there's enough signal
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

    let bestOffset = -1;
    let bestCorr = 0;
    let lastCorr = 1;
    let foundGoodCorr = false;

    for (let offset = 0; offset < MAX_SAMPLES; offset++) {
      let corr = 0;
      for (let i = 0; i < MAX_SAMPLES; i++) {
        corr += Math.abs(buf[i] - buf[i + offset]);
      }
      corr = 1 - corr / MAX_SAMPLES;

      if (corr > threshold && corr > lastCorr) {
        foundGoodCorr = true;
        if (corr > bestCorr) {
          bestCorr = corr;
          bestOffset = offset;
        }
      } else if (foundGoodCorr) {
        break;
      }
      lastCorr = corr;
    }

    if (bestOffset === -1 || bestCorr < threshold) return -1;

    return sampleRate / bestOffset;
  }
}
