import ZipStream from 'zip-stream'

export async function addFile(
  zipStream: ZipStream,
  name: string,
  data: Buffer | string
): Promise<void> {
  return new Promise((resolve, reject) => {
    zipStream.entry(data, { name }, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

export async function zipFile(files: {
  [key: string]: Buffer | string
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const zip = new ZipStream()
    zip.on('data', (chunk) => {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk)
      }
    })
    zip.on('end', () => resolve(Buffer.concat(chunks)))
    zip.on('error', reject)

    return Object.entries(files)
      .reduce(
        (last, [name, data]) => last.then(() => addFile(zip, name, data)),
        Promise.resolve()
      )
      .then(() => {
        zip.finalize()
      })
  })
}
