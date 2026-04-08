import { useEffect, useRef, useCallback } from 'react';
import { ParticleSystem } from '../visualization/ParticleSystem';
import type { NoteEvent } from '../types';

interface Props {
  subscribeNoteOn:  (handler: (evt: NoteEvent) => void) => () => void;
  subscribeNoteOff: (handler: (midi: number) => void)   => () => void;
  keyPositions: Map<number, number>;
  onReady?: (system: ParticleSystem) => void;
}

export function VisualizerCanvas({ subscribeNoteOn, subscribeNoteOff, keyPositions, onReady }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const systemRef   = useRef<ParticleSystem | null>(null);
  const rafRef      = useRef<number>(0);
  const keyPosRef   = useRef(keyPositions);

  useEffect(() => { keyPosRef.current = keyPositions; }, [keyPositions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ps = new ParticleSystem(canvas);
    systemRef.current = ps;
    onReady?.(ps);

    const resize = () => {
      const w = canvas.parentElement?.clientWidth  ?? window.innerWidth;
      const h = canvas.parentElement?.clientHeight ?? window.innerHeight;
      ps.resize(w, h);
    };
    resize();

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const loop = () => {
      ps.update();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      ps.dispose();
      systemRef.current = null;
    };
  }, [onReady]);

  const handleNoteOn = useCallback((evt: NoteEvent) => {
    const ps   = systemRef.current;
    if (!ps) return;
    const xNorm = keyPosRef.current.get(evt.midiNote) ?? 0.5;
    ps.activateNote(evt.midiNote, xNorm, evt.velocity);
  }, []);

  const handleNoteOff = useCallback((midi: number) => {
    systemRef.current?.deactivateNote(midi);
  }, []);

  useEffect(() => subscribeNoteOn(handleNoteOn),   [subscribeNoteOn,  handleNoteOn]);
  useEffect(() => subscribeNoteOff(handleNoteOff), [subscribeNoteOff, handleNoteOff]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
