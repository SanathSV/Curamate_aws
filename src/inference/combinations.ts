import { canonicalKey } from './canonicalize';

/** Each combination contains a new/changed symptom; unchanged combinations aren't regenerated. */
export function* combinations(symptoms: string[], maxSize: number, frontier?: ReadonlySet<string>): Generator<string> {
  const canonical = canonicalKey(symptoms);
  if (!canonical) return;
  const items = canonical.split('|');
  const changed = frontier ?? new Set(items);
  // Partition by the first frontier member to emit each key exactly once.
  for (let pivot = 0; pivot < items.length; pivot++) {
    if (!changed.has(items[pivot])) continue;
    const remaining = items.filter((name, index) => index !== pivot && !(index < pivot && changed.has(name)));
    function* visit(start: number, selected: string[]): Generator<string> {
      yield canonicalKey(selected);
      if (selected.length >= maxSize) return;
      for (let i = start; i < remaining.length; i++) yield* visit(i + 1, [...selected, remaining[i]]);
    }
    if (maxSize > 0) yield* visit(0, [items[pivot]]);
  }
}
