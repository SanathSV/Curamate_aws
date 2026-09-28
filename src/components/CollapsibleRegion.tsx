import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Keep form state while animating its layout; collapsed controls leave the tab order immediately. */
export function CollapsibleRegion({ id, collapsed, children }: { id: string; collapsed: boolean; children: ReactNode }) {
  const previous = useRef(collapsed);
  const [moving, setMoving] = useState(false);
  useLayoutEffect(() => {
    if (previous.current === collapsed) return;
    previous.current = collapsed;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setMoving(false); return; }
    setMoving(true);
    const timer = window.setTimeout(() => setMoving(false), 300);
    return () => window.clearTimeout(timer);
  }, [collapsed]);
  return <div id={id} className={'motion-collapse' + (collapsed ? ' is-collapsed' : '') + (moving ? ' is-moving' : '')} aria-hidden={collapsed} inert={collapsed} onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === 'grid-template-rows') setMoving(false); }}><div className="motion-collapse-content">{children}</div></div>;
}
