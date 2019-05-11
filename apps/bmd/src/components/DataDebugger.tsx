// Usage:
// <DataDebugger hide data={{ props, etc }} />

import React from 'react'

interface Props {
  data: any // eslint-disable-line @typescript-eslint/no-explicit-any
  hide?: boolean
}

const DataDebugger = ({ data, hide }: Props) => {
  if (hide) {
    return <React.Fragment />
  }
  return <pre>{JSON.stringify(data, undefined, 2)}</pre>
}

export default DataDebugger
