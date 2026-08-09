export interface ResolvedInputFile {
  readonly requestedPath: string;
  readonly filePath: string;
  readonly bytes: number;
}

export interface InputFilePort {
  resolve(inputPaths: readonly string[]): Promise<readonly ResolvedInputFile[]>;
}
