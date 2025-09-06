export interface ExtractedFrame {
  timestamp: number;
  dataUrl: string;
}

export interface EnhancedImage {
  id: string;
  originalTimestamp: number;
  url: string;
}

export type Gender = 'Male' | 'Female' | 'All';

export type ProcessingState = 'idle' | 'processing' | 'done';

export interface ProgressUpdate {
  message: string;
  current: number;
  total: number;
}

export interface VideoQueueItem {
  id: string;
  file: File;
  status: 'queued' | 'processing' | 'done' | 'error';
  progressMessage: string;
  progressCurrent: number;
  progressTotal: number;
  error?: string;
  resultCount: number;
  thumbnailDataUrl?: string;
  startTime?: number;
  endTime?: number;
}