import { useEffect, useRef, useState } from 'react';

interface Props {
  // Called whenever the drawing changes. Passes a PNG data URL, or null when the
  // pad is empty (so callers can gate a "must sign" requirement).
  onChange?: (dataUrl: string | null) => void;
  label?: string;
}

// A lightweight, dependency-free drawable signature pad backed by a <canvas>.
// Supports mouse and touch. Exposes a Clear button and reports whether anything
// has been drawn via onChange.
export function SignaturePad({ onChange, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  // Size the canvas backing store to its displayed size (accounting for DPR) so
  // strokes stay crisp and aren't stretched.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  const pos = (e: PointerEvent | React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext('2d')!;
    const { x, y } = pos(e);
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk.current) {
      hasInk.current = true;
      setEmpty(false);
    }
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) {
      onChange?.(canvasRef.current!.toDataURL('image/png'));
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setEmpty(true);
    onChange?.(null);
  };

  return (
    <div>
      {label && <p className="mb-1 text-sm font-medium">{label}</p>}
      <div className="relative rounded-lg border border-slate-300 bg-white dark:border-slate-700">
        <canvas
          ref={canvasRef}
          className="h-40 w-full touch-none rounded-lg"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">
            Sign here
          </span>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={clear}>
          Clear signature
        </button>
      </div>
    </div>
  );
}
