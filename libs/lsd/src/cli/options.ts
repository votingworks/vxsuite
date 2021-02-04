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

import { Size } from '../util/geometry'

export type LengthThreshold = number | { width: number } | { height: number }

export interface Options {
  help: boolean
  imagePaths: readonly string[]
  minLength?: LengthThreshold
  scale: number
  size?: Size
}

export function parseOptions(args: readonly string[]): Options {
  const imagePaths: string[] = []
  let help = false
  let scale = 1
  let size: Size | undefined
  let minLength: LengthThreshold | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--min-length') {
      const value = args[++i]
      if (/^\d+$/.test(value)) {
        minLength = parseInt(value, 10)
      } else {
        const match = /^(\d+)%([wh])$/.exec(value)
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
        throw new Error(`invalid format for ${arg}: ${value}`)
      }
    } else if (arg === '--size') {
      const value = args[++i]
      const match = /^(\d+)x(\d+)$/.exec(value)
      if (match) {
        size = { width: parseInt(match[1], 10), height: parseInt(match[2], 10) }
      } else {
        throw new Error(`invalid size '${value}', expected 'WxH'`)
      }
    } else if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg.startsWith('-')) {
      throw new Error(`unexpected option '${arg}'`)
    } else {
      imagePaths.push(arg)
    }
  }

  return { imagePaths, help, minLength, scale, size }
}
