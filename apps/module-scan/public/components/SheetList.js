import { BINARY_COLORS, map } from '../utils/colors.js'
import SheetPageCell from './SheetPageCell.js'

const { useState, useEffect } = React

/**
 * @typedef {object} Sheet
 * @property {string} id
 * @property {string} batchId
 * @property {PageInterpretation} frontInterpretation
 * @property {PageInterpretation} backInterpretation
 */

/**
 * @typedef {import('../../src/interpreter').PageInterpretation} PageInterpretation
 */

const lookupBatchColor = /** @type {(value: string) => string} */ (map(
  BINARY_COLORS
))

const SheetList = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [sheets, setSheets] = useState(/** @type {Sheet[]} */ ([]))

  useEffect(() => {
    ;(async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/scan/sheets')
        const sheets = await response.json()
        setSheets(sheets)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  return isLoading
    ? h('p', {}, 'Loading…')
    : h('table', { className: 'sheet-list' }, [
        h(
          'thead',
          { key: 'thead' },
          h('tr', {}, [
            h('th', { key: 'header-id' }, 'ID'),
            h('th', { key: 'header-front' }, 'Front'),
            h('th', { key: 'header-back' }, 'Back'),
          ])
        ),
        h(
          'tbody',
          { key: 'tbody' },
          sheets.map((sheet) =>
            h(
              'tr',
              {
                key: sheet.id,
                style: {
                  borderLeftColor: lookupBatchColor(sheet.batchId),
                  borderLeftStyle: 'solid',
                },
              },
              [
                h('td', { key: 'id' }, sheet.id),
                h(SheetPageCell, {
                  key: 'front',
                  interpretation: sheet.frontInterpretation,
                }),
                h(SheetPageCell, {
                  key: 'back',
                  interpretation: sheet.backInterpretation,
                }),
              ]
            )
          )
        ),
      ])
}

export default SheetList
