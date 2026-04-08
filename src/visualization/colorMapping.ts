/**
 * Maps MIDI note numbers to colors.
 *
 * The 12 chromatic pitch classes map to evenly-spaced hues around the color wheel.
 * Octave affects lightness — lower octaves are darker, upper octaves brighter.
 * Returns both CSS hsl string and [h, s, l] tuple for shader use.
 */

/** Hue (0-360) for each semitone 0=C … 11=B */
const SEMITONE_HUE: Record<number, number> = {
  0:  0,    // C   → Red
  1:  30,   // C#  → Red-Orange
  2:  60,   // D   → Orange
  3:  90,   // D#  → Yellow-Orange
  4:  120,  // E   → Yellow
  5:  150,  // F   → Yellow-Green
  6:  180,  // F#  → Cyan
  7:  210,  // G   → Sky-Blue
  8:  240,  // G#  → Blue
  9:  270,  // A   → Blue-Violet
  10: 300,  // A#  → Violet
  11: 330,  // B   → Pink
};

export function noteToHSL(midiNote: number): [number, number, number] {
  const semitone = midiNote % 12;
  const octave = Math.floor(midiNote / 12) - 1; // C-based octave (-1 … 8)

  const hue = SEMITONE_HUE[semitone];
  const saturation = 85;
  // Octaves 0-8 mapped to lightness 35-70%
  const lightness = 35 + Math.min(7, Math.max(0, octave - 1)) * 5;

  return [hue, saturation, lightness];
}

export function noteToColor(midiNote: number): string {
  const [h, s, l] = noteToHSL(midiNote);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/** Returns an RGB array [0-1, 0-1, 0-1] for use in WebGL shaders */
export function noteToRGB(midiNote: number): [number, number, number] {
  const [h, s, l] = noteToHSL(midiNote);
  return hslToRgb(h / 360, s / 100, l / 100);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [r, g, b];
}
