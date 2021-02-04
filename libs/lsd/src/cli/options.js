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

// @ts-check
exports.__esModule = true

/** @typedef {import('../util/geometry').Size} Size */

/**
 * @typedef {number | { width: number } | { height: number }} LengthThreshold
 */

/**
 * @typedef {object} Options
 * @property {readonly string[]} imagePaths
 * @property {number} scale
 * @property {Size | undefined} size
 * @property {LengthThreshold=} minLength
 */

/**
 * @param {readonly string[]} args
 * @returns {Options}
 */
function parseOptions(args) {
  /** @type {string[]} */
  const imagePaths = []
  let scale = 1
  /** @type {Size | undefined} */
  let size
  /** @type {LengthThreshold | undefined} */
  let minLength

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--min-length') {
      const value = args[++i]
      if (/^\d+$/.test(value)) {
        minLength = parseInt(value, 10)
      } else {
        const match = value.match(/^(\d+)%([wh])$/)
        if (match) {
          const percent = parseInt(match[1], 10)
          minLength =
            match[2] === 'w' ? { width: percent } : { height: percent }
        } else {
          throw new Error(`invalid format for ${arg}: ${value}`)
        }
      }
    } else if (arg === '--scale') {
      const value = args[++i]
      if (value.endsWith('%')) {
        scale = parseFloat(value.slice(0, -1)) / 100
      } else {
        scale = parseFloat(value)
      }

      if (isNaN(scale)) {
        throw new Error('invalid scale')
      }
    } else if (arg === '--size') {
      const value = args[++i]
      const match = value.match(/^(\d+)x(\d+)$/)
      if (match) {
        size = { width: parseInt(match[1], 10), height: parseInt(match[2], 10) }
      } else {
        throw new Error(`invalid size '${value}', expected 'WxH'`)
      }
    } else if (arg.startsWith('-')) {
      throw new Error(`unexpected option ${arg}`)
    } else {
      imagePaths.push(arg)
    }
  }

  return { imagePaths, minLength, scale, size }
}
exports.parseOptions = parseOptions
