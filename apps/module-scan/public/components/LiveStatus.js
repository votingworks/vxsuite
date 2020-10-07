import useInterval from '../utils/useInterval.js'

/**
 * @returns {Promise<object>}
 */
async function getStatus() {
  return JSON.parse(await (await fetch('/scan/status')).text())
}

const LiveStatus = () => {
  const [status, setStatus] = React.useState('')

  useInterval(() => {
    ;(async () => {
      setStatus(JSON.stringify(await getStatus(), undefined, 2))
    })()
  }, 2000)

  return h('textarea', {
    key: 'status',
    style: { fontFamily: 'monospace' },
    cols: 80,
    rows: 10,
    value: status,
    readOnly: true,
  })
}

export default LiveStatus
