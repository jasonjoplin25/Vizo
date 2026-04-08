<div align="center">

<svg width="600" height="120" viewBox="0 0 600 120" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="vg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#f97316;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#a855f7;stop-opacity:1" />
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="600" height="120" rx="12" fill="#09090b"/>
  <text x="300" y="78" text-anchor="middle"
    font-family="'Segoe UI', Arial, sans-serif"
    font-size="68" font-weight="800" letter-spacing="8"
    fill="url(#vg)" filter="url(#glow)">VIZO</text>
</svg>

**Audio Visualisation & Cymatics Studio**

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-black?style=flat-square&logo=three.js&logoColor=white)
![Tone.js](https://img.shields.io/badge/Tone.js-audio-orange?style=flat-square)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)

</div>

---

Vizo is a browser-based audio visualisation and cymatics studio. It combines real-time 3D waveform rendering with a full audio workstation — MIDI input, a drum machine, pitch detection, audio recording, and a cymatics engine that translates sound frequencies into visual interference patterns.

## Features

- **Cymatics Engine** — frequency-to-geometry mapping that generates real-time Chladni-style interference patterns
- **3D Visualiser** — Three.js canvas rendering audio waveforms and particle systems in real time
- **Particle System** — reactive particles driven by audio amplitude and frequency data
- **Drum Machine** — step sequencer with synthesised drum sounds and preset patterns
- **Keyboard** — on-screen MIDI keyboard with polyphonic playback
- **MIDI** — Web MIDI API integration for hardware controller input
- **File Player** — load and visualise audio files
- **Pitch Detector** — real-time pitch detection from microphone input
- **Recorder** — capture audio output directly in the browser
- **Metronome** — sync-aware BPM control

## Tech Stack

| | |
|---|---|
| Framework | React 18 + TypeScript |
| 3D / WebGL | Three.js |
| Audio | Tone.js, Web Audio API, Web MIDI API |
| MIDI parsing | @tonejs/midi |
| Build | Vite |

## Getting Started

```bash
npm install
npm run dev     # http://localhost:5173
npm run build
```

## Structure

```
src/
├── visualization/    # Three.js scene, CymaticsEngine, ParticleSystem, colour mapping
├── components/       # CymaticsCanvas, VisualizerCanvas, DrumMachine, Keyboard,
│                     # FilePlayer, RecorderPanel, Controls, VisualParams
├── audio/            # SoundEngine, DrumSynth, MidiAccess, PitchDetector,
│                     # Recorder, FilePlayer, Metronome, frequency utils
├── hooks/            # Custom React audio hooks
└── types/            # Shared TypeScript types
```
