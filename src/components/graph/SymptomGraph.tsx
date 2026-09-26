import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import cytoscape from 'cytoscape';
import type { Core, StylesheetJson } from 'cytoscape';
import type { Candidate } from '../../types/inference';
import type { GraphHandle } from '../../types/graph';
import type { Theme } from '../../hooks/useTheme';
import { buildGraph, symptomId } from './buildGraph';

function graphStyles(theme: Theme): StylesheetJson {
  const dark = theme === 'dark';
  return [
  { selector: 'node.symptom', style: {
    shape: 'round-rectangle', width: 162, height: 74, 'background-color': dark ? '#263934' : '#e8f5ef',
    'border-width': 1.7, 'border-color': dark ? '#779c88' : '#528773', label: 'data(label)', color: dark ? '#e1f5e9' : '#214d3a',
    'font-family': 'DM Sans Variable, sans-serif', 'font-size': 14, 'font-weight': 500,
    'text-wrap': 'wrap', 'text-max-width': '140px', 'text-valign': 'center', 'text-halign': 'center',
    'line-height': 1.6, 'overlay-opacity': 0,
  } },
  { selector: 'node.observed', style: { 'background-color': dark ? '#1b6554' : '#18775f', 'border-color': dark ? '#65c8a7' : '#18775f', color: '#ffffff', 'font-weight': 600 } },
  { selector: 'node.depth-2', style: { 'background-color': dark ? '#293746' : '#edf4ff', 'border-color': dark ? '#7fa5d8' : '#678cbb', color: dark ? '#e0edff' : '#365c90' } },
  { selector: 'node.depth-3', style: { 'background-color': dark ? '#373045' : '#f3f0fa', 'border-color': dark ? '#b19ad0' : '#9580b3', color: dark ? '#efe4ff' : '#675596' } },
  { selector: 'node.rule', style: {
    shape: 'diamond', width: 17, height: 17, 'background-color': dark ? '#25292c' : '#fff', 'border-color': dark ? '#b0bfba' : '#648377',
    'border-width': 1.8, label: 'data(label)', color: dark ? '#d1dbd6' : '#456456', 'font-family': 'DM Sans Variable, sans-serif',
    'font-size': 12, 'text-valign': 'top', 'text-margin-y': -6, 'overlay-opacity': 0,
    'text-background-color': dark ? '#1b1e20' : '#fbfcfd', 'text-background-opacity': 1, 'text-background-padding': '3px',
  } },
  { selector: 'edge', style: {
    width: 1.8, 'line-color': dark ? '#869a91' : '#718a80', 'target-arrow-color': dark ? '#869a91' : '#718a80', 'curve-style': 'bezier',
    'control-point-step-size': 35, 'arrow-scale': .7, 'overlay-opacity': 0,
  } },
  { selector: 'edge.consequent', style: { 'target-arrow-shape': 'triangle' } },
  { selector: 'edge.secondary', style: { 'line-style': 'dashed', 'line-opacity': 1, width: 1.6 } },
  { selector: 'edge.highlighted', style: { 'line-color': dark ? '#91e9c0' : '#138264', 'target-arrow-color': dark ? '#91e9c0' : '#138264', width: 3, 'line-opacity': 1 } },
  { selector: 'node.highlighted', style: { 'border-color': dark ? '#91e9c0' : '#138264', 'border-width': 2.5 } },
  { selector: 'node.focused', style: { 'border-color': dark ? '#a6f2d0' : '#087d6b', 'border-width': 3, 'underlay-color': dark ? '#538b73' : '#b8e1d8', 'underlay-opacity': .25, 'underlay-padding': 7 } },
  { selector: 'node.hovered', style: { 'overlay-color': '#7aafa4', 'overlay-opacity': .1, 'overlay-padding': 7 } },
  ];
}
interface Props {
  observed: string[];
  candidates: Candidate[];
  maxDepth: number;
  minScore: number;
  selected: string | null;
  onSelect: (symptom: string | null) => void;
  onZoom: (zoom: number) => void;
  theme: Theme;
}
export const SymptomGraph = forwardRef<GraphHandle, Props>(function SymptomGraph({ observed, candidates, maxDepth, minScore, selected, onSelect, onZoom, theme }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<Core | null>(null);
  const selectRef = useRef(onSelect);
  const zoomRef = useRef(onZoom);
  selectRef.current = onSelect; zoomRef.current = onZoom;
  const elements = useMemo(() => buildGraph(observed, candidates, maxDepth, minScore), [observed, candidates, maxDepth, minScore]);
  const fit = () => {
    const cy = graph.current;
    if (cy?.elements().length) { cy.fit(undefined, 40); if (cy.zoom() > 1.15) { cy.zoom(1.15); cy.center(); } }
  };
  useImperativeHandle(ref, () => ({
    fit, center: () => { graph.current?.center(); },
    reset: () => { graph.current?.elements().removeClass('highlighted focused'); selectRef.current(null); fit(); },
    zoom: factor => { const cy = graph.current; if (cy) cy.zoom({ level: cy.zoom() * factor, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); },
    focus: symptom => {
      const cy = graph.current; const node = cy?.getElementById(symptomId(symptom));
      if (cy && node?.length) cy.animate({ center: { eles: node }, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180 });
    },
  }));
  useEffect(() => {
    if (!container.current) return;
    const cy = cytoscape({
      container: container.current, elements: [], style: graphStyles(theme), layout: { name: 'preset' },
      minZoom: .12, maxZoom: 2.5, wheelSensitivity: .18, boxSelectionEnabled: false,
      autounselectify: true, autoungrabify: false,
    });
    graph.current = cy;
    cy.on('tap', 'node', event => selectRef.current(event.target.data('symptom') as string));
    cy.on('tap', event => { if (event.target === cy) selectRef.current(null); });
    cy.on('mouseover', 'node', event => { event.target.addClass('hovered'); if (container.current) container.current.style.cursor = 'pointer'; });
    cy.on('mouseout', 'node', event => { event.target.removeClass('hovered'); if (container.current) container.current.style.cursor = 'grab'; });
    cy.on('zoom', () => zoomRef.current(cy.zoom()));
    const resize = new ResizeObserver(() => { cy.resize(); fit(); });
    resize.observe(container.current);
    return () => { resize.disconnect(); cy.destroy(); graph.current = null; };
  }, []);
  useEffect(() => { graph.current?.style(graphStyles(theme)); }, [theme]);
  useEffect(() => {
    const cy = graph.current;
    if (!cy) return;
    cy.batch(() => { cy.elements().remove(); cy.add(elements); });
    cy.layout({ name: 'preset' }).run();
    fit();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cy.nodes('.latent').style('opacity', 0).animate({ style: { opacity: 1 }, duration: 180 });
    }
  }, [elements]);
  useEffect(() => {
    const cy = graph.current;
    if (!cy) return;
    cy.elements().removeClass('highlighted focused');
    if (!selected) return;
    const node = cy.getElementById(symptomId(selected));
    if (!node.length) return;
    const path = node.union(node.predecessors());
    path.addClass('highlighted'); node.addClass('focused');
  }, [selected, elements]);
  return <div className="cytoscape-container" ref={container} role="img" aria-label="Interactive symptom association network. Each diamond combines all antecedents into one rule. Use the candidate list below for keyboard-accessible evidence inspection." />;
});
