export type Chunk = Parameters<KioskBrowser.FileWriter['write']>[0]

export default function fakeFileWriter(): jest.Mocked<
  KioskBrowser.FileWriter & { chunks: readonly Chunk[] }
> {
  const chunks: Chunk[] = []
  const fileWriter = {
    write: jest.fn().mockImplementation(chunk => {
      chunks.push(chunk)
    }),
    end: jest.fn().mockResolvedValue(undefined),
    chunks,
  }

  return fileWriter
}
