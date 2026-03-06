import { RiskCategory } from "../analysis/risk_classifier";

export interface DatasetEvent {
  id: string;
  dedupe_hash?: string;
  source_id: string;
  metric: string;
  value: string | number | null;
  location: string;
  timestamp: string;
  risk_labels?: RiskCategory[];
}
