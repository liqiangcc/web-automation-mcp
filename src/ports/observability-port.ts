import type { DiagnosticsBundle, LifecycleEvent } from '../domain/observability.js';

export interface LifecycleSink {
  record(event: LifecycleEvent): Promise<void>;
}

export interface DiagnosticsBundleSink {
  write(bundle: DiagnosticsBundle): Promise<void>;
}
