import { RiskCategory } from "../analysis/risk_classifier";

export interface Article {
  id: string;
  dedupe_hash?: string;
  source_id: string;
  title: string;
  summary: string;
  published_at: string;
  region: string;
  topic: string;
  raw_content: string;
  risk_labels?: RiskCategory[];
}
