import { useEffect, useRef, useState } from 'react';

/** Presentation only: waiting fill is estimated; completion requires a response. */
export function useAnimatedProgress(target: number, complete: boolean, reset: boolean, waiting = false) {
  const [value, setValue] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const current = useRef(0);
  useEffect(() => {
    setRevealed(false);
    if (reset) { current.current = 0; setValue(0); return; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      current.current = target; setValue(target); setRevealed(complete); return;
    }
    const from = current.current;
    const started = performance.now();
    const duration = complete ? 900 : 450;
    let frame = 0;
    let hold: ReturnType<typeof setTimeout> | undefined;
    function tick() {
      if (waiting && !complete) {
        const floor = Math.max(from, Math.min(target, 99));
        const ceiling = Math.max(floor, 90);
        current.current = floor + (ceiling - floor) * (1 - Math.exp(-(performance.now() - started) / 16000));
        setValue(current.current);
        frame = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, Math.max(0, (performance.now() - started) / duration));
      const eased = t * t * (3 - 2 * t);
      current.current = from + (target - from) * eased;
      setValue(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
      else if (complete) hold = setTimeout(() => setRevealed(true), 180);
    }
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); clearTimeout(hold); };
  }, [target, complete, reset, waiting]);
  return { value, revealed: complete && revealed };
}
