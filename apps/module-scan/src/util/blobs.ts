import { promises as fs } from 'fs'
import { join } from 'path'

export interface Blobs {
  get(key: string): Promise<Buffer | undefined>
  set(name: string, data: Buffer): Promise<void>
  delete(name: string): Promise<void>
}

export class FileSystemBlobs implements Blobs {
  public constructor(private root: string) {}

  public async get(name: string): Promise<Buffer | undefined> {
    try {
      return await fs.readFile(join(this.root, name))
    } catch (error) {
      if (error.code === 'ENOENT') {
        return undefined
      } else {
        throw error
      }
    }
  }

  public async set(name: string, data: Buffer): Promise<void> {
    await fs.writeFile(join(this.root, name), data)
  }

  public async delete(name: string): Promise<void> {
    await fs.unlink(join(this.root, name))
  }
}

export class MemoryBlobs implements Blobs {
  private readonly data = new Map<string, Buffer>()

  public async get(name: string): Promise<Buffer | undefined> {
    return this.data.get(name)
  }

  public async set(name: string, data: Buffer): Promise<void> {
    this.data.set(name, data)
  }

  public async delete(name: string): Promise<void> {
    this.data.delete(name)
  }
}
