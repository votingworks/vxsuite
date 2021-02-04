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

export interface Size {
  width: number
  height: number
}

export function distance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.pow(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2), 0.5)
}

export function angle(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1)
}

export function approximatelyEqual(
  a: number,
  b: number,
  {
    relativeErrorFactor = 100,
  }: { relativeErrorFactor?: number } | undefined = {}
): boolean {
  const max = Math.max(a, b)
  const diff = Math.abs(a - b)
  return diff / max <= Number.EPSILON * relativeErrorFactor
}
