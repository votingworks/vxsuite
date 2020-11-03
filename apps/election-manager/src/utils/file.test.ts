import { copyFile } from './file'

test('copy file works', async () => {
  const file = new File(['12345'], 'foo.txt')
  const newFile = await copyFile(file)

  expect(newFile.name).toEqual('foo.txt')
  expect(newFile.size).toEqual(file.size)

  const reader = new FileReader()
  await new Promise((resolve, reject) => {
    reader.onload = () => {
      try {
        expect(reader.result).toEqual('12345')
        resolve()
      } catch (error) {
        reject(error)
      }
    }
    reader.readAsText(newFile)
  })
})
