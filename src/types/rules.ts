export interface Rule {
  then: string;
  confidence: number;
  support: number;
  lift: number;
  occurrences: number;
  antecedent_occurrences: number;
  consequent_occurrences: number;
}
export interface SymptomFrequency { count: number; probability: number }
export interface ContextFrequency extends SymptomFrequency {
  type?: 'gender' | 'history';
  value?: string;
}
export interface RulesMetadata {
  transactions: number;
  unique_symptoms: number;
  unique_context_features?: number;
  antecedent_keys: number;
  rules_saved: number;
  source_bucket?: string;
  source_file?: string;
  rules_generated?: number;
  minimum_occurrence_count?: number;
  configuration: {
    max_antecedent_size: number;
    max_context_features?: number;
    min_support?: number;
    min_confidence?: number;
    min_lift?: number;
    min_occurrences?: number;
    top_k_per_antecedent?: number;
  };
}
export interface RulesOutput {
  metadata: RulesMetadata;
  symptom_frequency: Record<string, SymptomFrequency>;
  context_frequency?: Record<string, ContextFrequency>;
  male_symptoms?: string[];
  female_symptoms?: string[];
  rules: Record<string, Rule[]>;
}
export type RulesCatalog = Omit<RulesOutput, 'rules'>;
