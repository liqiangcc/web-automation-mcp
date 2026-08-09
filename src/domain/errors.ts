export type ExecutionErrorCode =
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_PROVIDER'
  | 'AUTH_REQUIRED'
  | 'PROFILE_BUSY'
  | 'NAVIGATION_FAILED'
  | 'TARGET_NOT_FOUND'
  | 'RESPONSE_START_TIMEOUT'
  | 'GENERATION_STALLED'
  | 'GENERATION_TIMEOUT'
  | 'EXTRACTION_FAILED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_CHANGED'
  | 'INPUT_PATH_NOT_ALLOWED'
  | 'INPUT_FILE_NOT_FOUND'
  | 'INPUT_FILE_TOO_LARGE'
  | 'FILE_UPLOAD_FAILED'
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
