import { Crosshair, Maximize, Minus, Plus, RotateCcw } from 'lucide-react';
import type { GraphHandle } from '../../types/graph';
interface Props { graph: React.RefObject<GraphHandle | null>; disabled: boolean; zoom: number }
export function GraphControls({ graph, disabled, zoom }: Props) {
  return <div className="graph-controls" aria-label="Network view controls">
    <button className="icon-button" disabled={disabled} title="Zoom in" aria-label="Zoom in" onClick={() => graph.current?.zoom(1.2)}><Plus size={16} /></button>
    <span className="zoom-level">{Math.round(zoom * 100)}%</span>
    <button className="icon-button" disabled={disabled} title="Zoom out" aria-label="Zoom out" onClick={() => graph.current?.zoom(1 / 1.2)}><Minus size={16} /></button>
    <span className="control-divider" />
    <button className="icon-button" disabled={disabled} title="Fit graph" aria-label="Fit graph" onClick={() => graph.current?.fit()}><Maximize size={16} /></button>
    <button className="icon-button" disabled={disabled} title="Center graph" aria-label="Center graph" onClick={() => graph.current?.center()}><Crosshair size={16} /></button>
    <button className="icon-button" disabled={disabled} title="Reset view" aria-label="Reset view" onClick={() => graph.current?.reset()}><RotateCcw size={15} /></button>
  </div>;
}
