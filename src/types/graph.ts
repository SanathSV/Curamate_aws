export interface GraphHandle {
  fit: () => void;
  center: () => void;
  reset: () => void;
  zoom: (factor: number) => void;
  focus: (symptom: string) => void;
}
