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
  | 'PROVIDER_CHANGED'
  | 'OUTPUT_PATH_NOT_ALLOWED'
  | 'FILE_ALREADY_EXISTS'
  | 'FILE_WRITE_FAILED';

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
