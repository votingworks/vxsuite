export type Chunk = Parameters<KioskBrowser.FileWriter['write']>[0];

export interface MockFileWriter extends KioskBrowser.FileWriter {
  chunks: readonly Chunk[];
}

export function mockFileWriter(): jest.Mocked<MockFileWriter> {
  const chunks: Chunk[] = [];

  return {
    filename: '/mock/file',
    write: jest.fn().mockImplementation((chunk) => {
      chunks.push(chunk);
    }),
    end: jest.fn().mockResolvedValue(undefined),
    chunks,
  };
}
