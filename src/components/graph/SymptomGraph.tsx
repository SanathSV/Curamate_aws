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
    shape: 'ellipse', width: 64, height: 64, 'background-color': dark ? '#253654' : '#e8efff',
    'border-width': 1.7, 'border-color': dark ? '#809bc7' : '#607fbc', label: 'data(label)', color: dark ? '#e1ebff' : '#244579',
    'font-family': 'DM Sans Variable, sans-serif', 'font-size': 14, 'font-weight': 500,
    'text-wrap': 'wrap', 'text-max-width': '168px', 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 12,
    'line-height': 1.6, 'overlay-opacity': 0,
  } },
  { selector: 'node.observed', style: { width: 76, height: 76, 'background-color': dark ? '#285dc0' : '#285dc0', 'border-color': dark ? '#8eb7ff' : '#285dc0', color: dark ? '#e4edff' : '#234d8e', 'font-weight': 600 } },
  { selector: 'node.depth-2', style: { 'background-color': dark ? '#293746' : '#edf4ff', 'border-color': dark ? '#7fa5d8' : '#678cbb', color: dark ? '#e0edff' : '#365c90' } },
  { selector: 'node.depth-3', style: { 'background-color': dark ? '#373045' : '#f3f0fa', 'border-color': dark ? '#b19ad0' : '#9580b3', color: dark ? '#efe4ff' : '#675596' } },
  { selector: 'node.rule', style: {
    shape: 'diamond', width: 17, height: 17, 'background-color': dark ? '#25292c' : '#fff', 'border-color': dark ? '#b0bfba' : '#648377',
    'border-width': 1.8, label: 'data(label)', color: dark ? '#d1dbd6' : '#456456', 'font-family': 'DM Sans Variable, sans-serif',
    'font-size': 12, 'text-valign': 'top', 'text-margin-y': -6, 'overlay-opacity': 0, 'text-wrap': 'wrap', 'text-max-width': '200px',
    'text-background-color': dark ? '#141f31' : '#f8faff', 'text-background-opacity': 1, 'text-background-padding': '3px',
  } },
  { selector: 'edge', style: {
    width: 1.8, 'line-color': dark ? '#869a91' : '#718a80', 'target-arrow-color': dark ? '#869a91' : '#718a80', 'curve-style': 'bezier',
    'control-point-step-size': 35, 'arrow-scale': .7, 'overlay-opacity': 0,
  } },
  { selector: 'edge.consequent', style: { 'target-arrow-shape': 'triangle' } },
  { selector: 'edge.pairwise', style: {
    label: 'data(label)', color: dark ? '#d1dbd6' : '#456456', 'font-size': 12, 'text-wrap': 'wrap', 'text-max-width': '200px',
    'font-family': 'DM Sans Variable, sans-serif', 'text-background-color': dark ? '#141f31' : '#f8faff',
    'text-background-opacity': 1, 'text-background-padding': '4px', 'text-margin-y': -10,
  } },
  { selector: 'edge.secondary', style: { 'line-style': 'dashed', 'line-opacity': 1, width: 1.6 } },
  { selector: 'edge.highlighted', style: { 'line-color': dark ? '#8eb7ff' : '#285dc0', 'target-arrow-color': dark ? '#8eb7ff' : '#285dc0', width: 3, 'line-opacity': 1 } },
  { selector: 'node.highlighted', style: { 'border-color': dark ? '#8eb7ff' : '#285dc0', 'border-width': 2.5 } },
  { selector: 'node.focused', style: { 'border-color': dark ? '#b1ceff' : '#285dc0', 'border-width': 3, 'underlay-color': dark ? '#5382ca' : '#b8cef2', 'underlay-opacity': .25, 'underlay-padding': 7 } },
  { selector: 'node.hovered', style: { 'overlay-color': '#7a9fcf', 'overlay-opacity': .1, 'overlay-padding': 7 } },
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
    cy.on('tap', 'edge.pairwise', event => selectRef.current(event.target.data('symptom') as string));
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
  return <div className="cytoscape-container" ref={container} role="img" aria-label="Interactive symptom node graph. Labeled arrows show single-symptom rule confidence. Diamonds combine multiple antecedents into a joint rule. Use the candidate list for keyboard-accessible evidence inspection." />;
});
