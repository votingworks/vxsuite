import ExportCVRButton from './components/ExportCVRButton.js'
import LiveStatus from './components/LiveStatus.js'
import ManualScan from './components/ManualScan.js'
import SheetList from './components/SheetList.js'

const App = () =>
  h(React.Fragment, {}, [
    h('h1', { key: 'header' }, 'Test Page for Scan'),
    h('h2', { key: 'header-status' }, 'Status'),
    h(LiveStatus, { key: 'live-status' }),
    h('h2', { key: 'header-scan' }, 'Scan'),
    h(ManualScan, { key: 'manual-scan' }),
    h('h2', { key: 'header-export' }, 'Export'),
    h(ExportCVRButton, { key: 'export-cvr-button' }),
    h('h2', { key: 'header-sheet-list' }, 'Sheets'),
    h(SheetList, { key: 'sheet-list' }),
  ])

export default App
