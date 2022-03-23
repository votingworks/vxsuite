export interface VxFile {
  name: string;
  path?: string;
}

export interface VxFiles {
  inputFiles: VxFile[];
  outputFiles: VxFile[];
}

export interface ConverterClient {
  /**
   * Gets the name of this converter for display purposes.
   */
  getDisplayName(): string;

  /**
   * Stores a file in the converter for later processing.
   */
  setInputFile(name: string, content: File): Promise<void>;

  /**
   * Processes the files that have been stored, generating output files.
   */
  process(): Promise<void>;

  /**
   * Gets the output file with the given name.
   */
  getOutputFile(name: string): Promise<Blob>;

  /**
   * Gets the lists of input and output files.
   */
  getFiles(): Promise<VxFiles>;

  /**
   * Resets the converter, discarding all files.
   */
  reset(): Promise<void>;
}
