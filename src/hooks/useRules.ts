import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfigurationError, fetchRules, reloadRules } from '../api/rulesApi';
import type { RulesOutput } from '../types/rules';
import { createSymptomTrie } from '../trie/symptomTrie';
export function useRules() {
  const [data, setData] = useState<RulesOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configurationMissing, setConfigurationMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    const request = attempt ? reloadRules() : fetchRules();
    request.then(result => { if (active) { setData(result); setLoadedAt(new Date()); setLoading(false); setConfigurationMissing(false); } })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Unable to load the dataset.');
          setConfigurationMissing(reason instanceof ConfigurationError); setLoading(false);
        }
      });
    return () => { active = false; };
  }, [attempt]);
  const trie = useMemo(() => data ? createSymptomTrie(data.symptom_frequency) : null, [data]);
  const reload = useCallback(() => { setLoading(true); setAttempt(value => value + 1); }, []);
  return { data, trie, loading, error, configurationMissing, retry: reload, reload, loadedAt };
}
