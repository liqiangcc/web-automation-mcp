import type { ExecutionStage } from '../domain/execution.js';

export interface DiagnosticEvent {
  readonly requestId: string;
  readonly stage: ExecutionStage;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface DiagnosticsSink {
  record(event: DiagnosticEvent): Promise<void>;
}
