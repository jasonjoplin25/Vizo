import { useCallback, useEffect, useRef, useState } from 'react';
import { KEY_LAYOUT, WHITE_KEY_COUNT } from '../audio/constants';
import type { KeyInfo } from '../types';
import { noteToColor } from '../visualization/colorMapping';

interface Props {
  activeNotes: Set<number>;
  onNoteOn: (midi: number, velocity?: number) => void;
  onNoteOff: (midi: number) => void;
  /** Called when layout changes so the visualizer can sync particle spawn positions */
  onLayoutChange?: (positions: Map<number, number>) => void;
}

export function Keyboard({ activeNotes, onNoteOn, onNoteOff, onLayoutChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pressedRef = useRef<Set<number>>(new Set());
  const [containerWidth, setContainerWidth] = useState(0);

  const WHITE_KEY_W = containerWidth / WHITE_KEY_COUNT;
  const WHITE_KEY_H = Math.min(160, WHITE_KEY_W * 6);
  const BLACK_KEY_W = WHITE_KEY_W * 0.6;
  const BLACK_KEY_H = WHITE_KEY_H * 0.62;

  // Emit normalized x-positions map to parent on resize
  useEffect(() => {
    if (!containerWidth || !onLayoutChange) return;
    const map = new Map<number, number>();
    KEY_LAYOUT.forEach(key => {
      // Center of key in normalized [0..1] coords
      const xCenter = key.isBlack
        ? (key.xPos * WHITE_KEY_W + BLACK_KEY_W / 2) / containerWidth
        : (key.xPos * WHITE_KEY_W + WHITE_KEY_W / 2) / containerWidth;
      map.set(key.midi, xCenter);
    });
    onLayoutChange(map);
  }, [containerWidth, onLayoutChange, WHITE_KEY_W, BLACK_KEY_W]);

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(w);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Computer keyboard → MIDI note mapping (middle C area)
  useEffect(() => {
    const PC_KEYS: Record<string, number> = {
      'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64, 'f': 65,
      't': 66, 'g': 67, 'y': 68, 'h': 69, 'u': 70, 'j': 71,
      'k': 72, 'o': 73, 'l': 74, 'p': 75, ';': 76,
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const midi = PC_KEYS[e.key];
      if (midi !== undefined && !pressedRef.current.has(midi)) {
        pressedRef.current.add(midi);
        onNoteOn(midi, 90);
      }
    };
    const up = (e: KeyboardEvent) => {
      const midi = PC_KEYS[e.key];
      if (midi !== undefined) {
        pressedRef.current.delete(midi);
        onNoteOff(midi);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [onNoteOn, onNoteOff]);

  const startNote = useCallback((key: KeyInfo) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onNoteOn(key.midi, 90);
  }, [onNoteOn]);

  const endNote = useCallback((key: KeyInfo) => (e: React.PointerEvent) => {
    e.preventDefault();
    onNoteOff(key.midi);
  }, [onNoteOff]);

  if (!containerWidth) {
    return <div ref={containerRef} style={{ width: '100%', height: 160 }} />;
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: WHITE_KEY_H,
        userSelect: 'none',
        touchAction: 'none',
        background: '#111',
        borderTop: '2px solid #333',
      }}
    >
      {/* White keys */}
      {KEY_LAYOUT.filter(k => !k.isBlack).map(key => {
        const isActive = activeNotes.has(key.midi);
        const color = isActive ? noteToColor(key.midi) : undefined;
        return (
          <div
            key={key.midi}
            style={{
              position: 'absolute',
              left: key.xPos * WHITE_KEY_W,
              top: 0,
              width: WHITE_KEY_W - 1,
              height: WHITE_KEY_H,
              background: isActive
                ? color
                : 'linear-gradient(to bottom, #e8e8e8, #fff)',
              border: '1px solid #555',
              borderRadius: '0 0 4px 4px',
              boxSizing: 'border-box',
              cursor: 'pointer',
              zIndex: 1,
              boxShadow: isActive
                ? `0 0 12px ${color}, inset 0 -4px 8px rgba(0,0,0,0.3)`
                : 'inset 0 -4px 6px rgba(0,0,0,0.15)',
              transition: 'box-shadow 0.05s',
            }}
            onPointerDown={startNote(key)}
            onPointerUp={endNote(key)}
            onPointerLeave={endNote(key)}
          >
            {/* Note label on lower keys */}
            {key.noteName === 'C' && (
              <span style={{
                position: 'absolute',
                bottom: 6,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontSize: Math.max(8, WHITE_KEY_W * 0.3),
                color: '#888',
                pointerEvents: 'none',
                fontFamily: 'monospace',
              }}>
                {key.noteNameFull}
              </span>
            )}
          </div>
        );
      })}

      {/* Black keys */}
      {KEY_LAYOUT.filter(k => k.isBlack).map(key => {
        const isActive = activeNotes.has(key.midi);
        const color = isActive ? noteToColor(key.midi) : undefined;
        return (
          <div
            key={key.midi}
            style={{
              position: 'absolute',
              left: key.xPos * WHITE_KEY_W - BLACK_KEY_W / 2,
              top: 0,
              width: BLACK_KEY_W,
              height: BLACK_KEY_H,
              background: isActive
                ? color
                : 'linear-gradient(to bottom, #222, #000)',
              borderRadius: '0 0 4px 4px',
              boxSizing: 'border-box',
              cursor: 'pointer',
              zIndex: 2,
              boxShadow: isActive
                ? `0 0 14px ${color}, 0 4px 8px rgba(0,0,0,0.8)`
                : '0 4px 8px rgba(0,0,0,0.8)',
              transition: 'box-shadow 0.05s',
            }}
            onPointerDown={startNote(key)}
            onPointerUp={endNote(key)}
            onPointerLeave={endNote(key)}
          />
        );
      })}
    </div>
  );
}
