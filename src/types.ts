export interface SpeedTestResult {
  ping: number | null;
  download: number | null;
  upload: number | null;
  status: 'idle' | 'running' | 'completed' | 'error';
  errorDetails?: string;
}

export interface CustomTargetResult {
  ping: number | null;
  downloadTimeMs: number | null;
  downloadSpeedMbps: number | null;
  sizeBytes: number | null;
  statusCode: number | null;
  status: 'idle' | 'running' | 'completed' | 'error';
  errorDetails?: string;
}

export interface SecurityTestResult {
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | null;
  reasons: string[];
  estimatedMonthlyVisits?: string;
  trackersCount?: number;
  thirdPartyCookies?: boolean;
  isPremium?: boolean;
  status: 'idle' | 'running' | 'completed' | 'error';
  errorDetails?: string;
}
