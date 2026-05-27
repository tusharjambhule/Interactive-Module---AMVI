export interface FormField {
  id: string;
  label: string;
  value: string | null;
  icon: string;
  hasDropdown: boolean;
  isActive?: boolean;
  isValid?: boolean;
}

export interface TranscriptMessage {
  type: 'system' | 'user' | 'interim';
  text: string;
  time: string;
}

export interface SystemStatus {
  name: string;
  icon: string;
  status: string;
  isActive: boolean;
}

export interface ExtractedIntent {
  field: string;
  value: string;
  confidence: number;
}

export interface ValidationResult {
  valid: boolean;
  value: string;
  errorMessage?: string;
}
