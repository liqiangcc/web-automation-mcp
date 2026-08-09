export interface AnswerFileWriteRequest {
  readonly outputPath: string;
  readonly content: string;
  readonly overwrite: boolean;
}

export interface AnswerFileWriteResult {
  readonly filePath: string;
  readonly bytesWritten: number;
  readonly sha256: string;
}

export interface AnswerFilePort {
  write(request: AnswerFileWriteRequest): Promise<AnswerFileWriteResult>;
}
