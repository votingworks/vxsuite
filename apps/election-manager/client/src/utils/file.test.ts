import { copyFile } from './file'

test('copy file works', async (done) => {
  const file = new File(['12345'], 'foo.txt')
  const newFile = await copyFile(file)

  expect(newFile.name).toEqual('foo.txt')
  expect(newFile.size).toEqual(file.size)

  const reader = new FileReader()
  reader.onload = () => {
    expect(reader.result as string).toEqual('12345')
    done()
  }
  reader.readAsText(newFile)
})
