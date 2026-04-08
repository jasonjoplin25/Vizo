import { useEffect, useRef, useCallback } from 'react';
import { CymaticsEngine } from '../visualization/CymaticsEngine';
import type { NoteEvent, PlateShape } from '../types';

interface Props {
  subscribeNoteOn:  (handler: (evt: NoteEvent) => void) => () => void;
  subscribeNoteOff: (handler: (midi: number) => void)   => () => void;
  plateShape: PlateShape;
  onReady?: (engine: CymaticsEngine) => void;
}

export function CymaticsCanvas({ subscribeNoteOn, subscribeNoteOff, plateShape, onReady }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const engineRef    = useRef<CymaticsEngine | null>(null);
  const rafRef       = useRef<number>(0);
  const lastTimeRef  = useRef<number>(0);
  const onReadyRef   = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new CymaticsEngine(canvas, 256);
    engineRef.current = engine;
    onReadyRef.current?.(engine);

    const resize = () => {
      const w = canvas.parentElement?.clientWidth  ?? window.innerWidth;
      const h = canvas.parentElement?.clientHeight ?? window.innerHeight;
      engine.resize(w, h);
    };
    resize();

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const loop = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = timestamp;
      engine.update(dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(t => {
      lastTimeRef.current = t;
      rafRef.current = requestAnimationFrame(loop);
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setPlateShape(plateShape);
  }, [plateShape]);

  const handleNoteOn = useCallback((evt: NoteEvent) => {
    engineRef.current?.addNote(evt.midiNote, evt.velocity);
  }, []);

  const handleNoteOff = useCallback((midi: number) => {
    engineRef.current?.releaseNote(midi);
  }, []);

  useEffect(() => subscribeNoteOn(handleNoteOn),   [subscribeNoteOn,  handleNoteOn]);
  useEffect(() => subscribeNoteOff(handleNoteOff), [subscribeNoteOff, handleNoteOff]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
