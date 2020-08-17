import { Lines, StreamLines } from './Lines'
import { EventEmitter } from 'events'
import { Readable } from 'stream'

test('emits nothing with no input', () => {
  const onLine = jest.fn()
  new Lines().on('line', onLine)
  expect(onLine).not.toHaveBeenCalled()
})

test('emits nothing with a partial line with no end', () => {
  const onLine = jest.fn()
  const lines = new Lines().on('line', onLine)
  lines.add('abc')
  expect(onLine).not.toHaveBeenCalled()
})

test('emits a line terminated by a newline', () => {
  const onLine = jest.fn()
  const lines = new Lines().on('line', onLine)
  lines.add('abc\n')
  expect(onLine).toHaveBeenNthCalledWith(1, 'abc\n')
})

test('emits multiple times given multiple lines', () => {
  const onLine = jest.fn()
  const lines = new Lines().on('line', onLine)
  lines.add('abc\ndef\n')
  expect(onLine).toHaveBeenNthCalledWith(1, 'abc\n')
  expect(onLine).toHaveBeenNthCalledWith(2, 'def\n')
})

test('joins previous chunks with a later newline', () => {
  const onLine = jest.fn()
  const lines = new Lines().on('line', onLine)
  lines.add('abc')
  lines.add('def')
  lines.add('g\nh')
  expect(onLine).toHaveBeenNthCalledWith(1, 'abcdefg\n')
})

test('emits whatever remains on end', () => {
  const onLine = jest.fn()
  const lines = new Lines().on('line', onLine)
  lines.add('abc')
  lines.end()
  expect(onLine).toHaveBeenNthCalledWith(1, 'abc')
})

test('emits on end only when there is something to emit', () => {
  const onLine = jest.fn()
  const lines = new Lines().on('line', onLine)
  lines.add('abc')
  expect(onLine).not.toHaveBeenCalled()
  lines.end()
  expect(onLine).toHaveBeenCalledTimes(1)
  lines.end()
  expect(onLine).toHaveBeenCalledTimes(1)
})

test('streams lines from an input stream', async () => {
  const onLine = jest.fn()
  const read = jest.fn()
  const input = new EventEmitter() as Readable
  input.read = read

  new StreamLines(input).on('line', onLine)
  expect(onLine).not.toHaveBeenCalled()

  read.mockReturnValueOnce('abc')
  input.emit('readable')
  expect(onLine).not.toHaveBeenCalled()

  read.mockReturnValueOnce('def\n')
  input.emit('readable')
  expect(onLine).toHaveBeenNthCalledWith(1, 'abcdef\n')

  read.mockReturnValueOnce('Hello World!\nWelcome')
  input.emit('readable')
  expect(onLine).toHaveBeenNthCalledWith(2, 'Hello World!\n')

  input.emit('close')
  expect(onLine).toHaveBeenNthCalledWith(3, 'Welcome')
})
