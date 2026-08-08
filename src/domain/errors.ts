export type ExecutionErrorCode =
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_PROVIDER'
  | 'AUTH_REQUIRED'
  | 'PROFILE_BUSY'
  | 'NAVIGATION_FAILED'
  | 'TARGET_NOT_FOUND'
  | 'GENERATION_TIMEOUT'
  | 'EXTRACTION_FAILED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_CHANGED';

export class WebAutomationError extends Error {
  public constructor(
    public readonly code: ExecutionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'WebAutomationError';
  }
}
