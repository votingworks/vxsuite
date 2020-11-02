import React, { useEffect, useState } from 'react'
import { PageInterpretation } from '../config/types'
import DebugSheetPageCell from './DebugSheetPageCell'

export interface Sheet {
  id: string
  batchId: string
  frontInterpretation: PageInterpretation
  backInterpretation: PageInterpretation
}

const DebugSheetList: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false)
  const [sheets, setSheets] = useState<Sheet[]>([])

  useEffect(() => {
    ;(async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/scan/sheets')
        setSheets(await response.json())
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  return isLoading ? (
    <p>Loading…</p>
  ) : (
    <table className="sheet-list">
      <thead>
        <tr>
          <th>ID</th>
          <th>Front</th>
          <th>Back</th>
        </tr>
      </thead>
      <tbody>
        {sheets.map((sheet) => (
          <tr key={sheet.id}>
            <td>{sheet.id}</td>
            <DebugSheetPageCell
              url={`/debug/sheet/${sheet.id}/front`}
              interpretation={sheet.frontInterpretation}
            />
            <DebugSheetPageCell
              url={`/debug/sheet/${sheet.id}/back`}
              interpretation={sheet.backInterpretation}
            />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default DebugSheetList
