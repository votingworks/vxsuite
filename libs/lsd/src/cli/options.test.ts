/**
 * Copyright (C) 2021 VotingWorks
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { parseOptions } from './options'

test('returns defaults given no arguments', () => {
  expect(parseOptions([])).toEqual({
    imagePaths: [],
    scale: 1,
    help: false,
    format: 'svg',
    background: 'none',
  })
})

test('--min-length N', () => {
  expect(parseOptions(['--min-length', '100'])).toEqual(
    expect.objectContaining({ minLength: 100 })
  )
})

test('--min-length N%w', () => {
  expect(parseOptions(['--min-length', '10%w'])).toEqual(
    expect.objectContaining({ minLength: { width: 10 } })
  )
})

test('--min-length N%h', () => {
  expect(parseOptions(['--min-length', '10%h'])).toEqual(
    expect.objectContaining({ minLength: { height: 10 } })
  )
})

test('--min-length error', () => {
  expect(() => parseOptions(['--min-length', 'gibberish'])).toThrowError(
    'invalid format for --min-length: gibberish'
  )
})

test('--scale N', () => {
  expect(parseOptions(['--scale', '0.8'])).toEqual(
    expect.objectContaining({ scale: 0.8 })
  )
})

test('--scale N%', () => {
  expect(parseOptions(['--scale', '80%'])).toEqual(
    expect.objectContaining({ scale: 0.8 })
  )
})

test('--scale error', () => {
  expect(() => parseOptions(['--scale', 'gibberish'])).toThrowError(
    'invalid format for --scale: gibberish'
  )
})

test('--size WxH', () => {
  expect(parseOptions(['--size', '100x200'])).toEqual(
    expect.objectContaining({ size: { width: 100, height: 200 } })
  )
})

test('--size error', () => {
  expect(() => parseOptions(['--size', 'gibberish'])).toThrowError(
    `invalid size 'gibberish', expected 'WxH'`
  )
})

test('--bad-option', () => {
  expect(() => parseOptions(['--bad-option'])).toThrowError(
    `unexpected option '--bad-option'`
  )
})

test('collects non-options as image paths', () => {
  expect(parseOptions(['a', 'b', 'c'])).toEqual(
    expect.objectContaining({
      imagePaths: ['a', 'b', 'c'],
    })
  )
})

test('--help', () => {
  expect(parseOptions(['--help'])).toEqual(
    expect.objectContaining({ help: true })
  )
  expect(parseOptions(['-h'])).toEqual(expect.objectContaining({ help: true }))
})

test('--format', () => {
  expect(parseOptions(['--format', 'svg'])).toEqual(
    expect.objectContaining({ format: 'svg' })
  )
  expect(parseOptions(['--format', 'png'])).toEqual(
    expect.objectContaining({ format: 'png' })
  )
  expect(() => parseOptions(['--format', 'nope'])).toThrowError(
    `invalid format 'nope', expected 'svg' or 'png'`
  )
})

test('--background', () => {
  expect(parseOptions(['--background', 'original'])).toEqual(
    expect.objectContaining({ background: 'original' })
  )
  expect(parseOptions(['--background', 'none'])).toEqual(
    expect.objectContaining({ background: 'none' })
  )
  expect(parseOptions(['--background', 'white'])).toEqual(
    expect.objectContaining({ background: 'white' })
  )
  expect(() => parseOptions(['--background', 'WAT'])).toThrowError(
    `invalid background 'WAT', expected 'none', 'white', or 'original'`
  )
})
