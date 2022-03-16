export type Chunk = Parameters<KioskBrowser.FileWriter['write']>[0];

export interface FakeFileWriter extends KioskBrowser.FileWriter {
  chunks: readonly Chunk[];
}

export function fakeFileWriter(): jest.Mocked<FakeFileWriter> {
  const chunks: Chunk[] = [];

  return {
    filename: '/fake/file',
    write: jest.fn().mockImplementation(async (chunk) => {
      chunks.push(chunk);
    }),
    end: jest.fn().mockResolvedValue(undefined),
    chunks,
  };
}
