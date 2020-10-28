const ExportCVRButton = () => {
  return h(
    'form',
    { method: 'post', action: '/scan/export' },
    h('input', { type: 'submit', value: 'CVR' })
  )
}

export default ExportCVRButton
