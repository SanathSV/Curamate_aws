import type { ElementDefinition } from 'cytoscape';
import type { Candidate } from '../../types/inference';
import { displaySymptom } from '../../inference/canonicalize';
import { percent } from '../../utils/format';

export const symptomId = (symptom: string): string => 'symptom:' + symptom;
export function buildGraph(observed: string[], candidates: Candidate[], maxDepth: number, minScore: number): ElementDefinition[] {
  const visible = candidates.filter(candidate => candidate.depth <= maxDepth && candidate.inferenceScore >= minScore);
  const names = new Set([...observed, ...visible.map(candidate => candidate.symptom)]);
  const layers = new Map<number, string[]>([[0, observed]]);
  visible.forEach(candidate => layers.set(candidate.depth, [...(layers.get(candidate.depth) ?? []), candidate.symptom]));
  const positions = new Map<string, { x: number; y: number }>();
  layers.forEach((symptoms, depth) => symptoms.forEach((symptom, index) => {
    positions.set(symptom, { x: 85 + depth * 270, y: 235 + (index - (symptoms.length - 1) / 2) * 175 });
  }));
  const elements: ElementDefinition[] = observed.map(symptom => ({
    data: { id: symptomId(symptom), symptom, kind: 'symptom', label: displaySymptom(symptom) + '\nObserved · depth 0', depth: 0 },
    classes: 'symptom observed', position: positions.get(symptom),
  }));
  visible.forEach(candidate => {
    elements.push({
      data: { id: symptomId(candidate.symptom), symptom: candidate.symptom, kind: 'symptom',
        label: displaySymptom(candidate.symptom) + '\n' + percent(candidate.inferenceScore) + ' · depth ' + candidate.depth, depth: candidate.depth },
      classes: 'symptom latent depth-' + Math.min(candidate.depth, 3), position: positions.get(candidate.symptom),
    });
    const paths = candidate.evidence.filter(path => path.depth <= maxDepth && path.antecedents.every(name => names.has(name)));
    paths.forEach((path, index) => {
      const target = positions.get(candidate.symptom)!;
      const id = 'rule:' + path.id;
      // A single antecedent is an ordinary directed link. Joint rules still need their shared diamond.
      if (path.antecedents.length === 1) {
        elements.push({
          data: { id, source: symptomId(path.antecedents[0]), target: symptomId(candidate.symptom),
            symptom: candidate.symptom, evidenceId: path.id, label: percent(path.rule.confidence) },
          classes: 'evidence-edge consequent pairwise' + (path.id === candidate.bestEvidence.id ? '' : ' secondary'),
        });
        return;
      }
      elements.push({
        data: { id, kind: 'rule', symptom: candidate.symptom, label: percent(path.rule.confidence), evidenceId: path.id },
        classes: 'rule' + (path.id === candidate.bestEvidence.id ? ' strongest' : ' secondary'),
        position: { x: target.x - 113 - (index % 2) * 20, y: target.y + (index - (paths.length - 1) / 2) * 42 },
      });
      path.antecedents.forEach((antecedent, i) => elements.push({
        data: { id: id + ':in:' + i, source: symptomId(antecedent), target: id },
        classes: path.id === candidate.bestEvidence.id ? 'evidence-edge' : 'evidence-edge secondary',
      }));
      elements.push({ data: { id: id + ':out', source: id, target: symptomId(candidate.symptom) },
        classes: 'evidence-edge consequent' + (path.id === candidate.bestEvidence.id ? '' : ' secondary') });
    });
  });
  return elements;
}
