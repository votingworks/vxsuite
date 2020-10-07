const ManualScan = () => {
  const [isUploading, setIsUploading] = React.useState(false)

  const doScanFromScanner = React.useCallback(() => {
    fetch('/scan/scanBatch', { method: 'POST' })
  }, [])

  /**
   * @type {React.MutableRefObject<HTMLInputElement | null>}
   */
  const filePickerRef = React.useRef(null)

  const pickFiles = React.useCallback(() => {
    filePickerRef.current?.click()
  }, [])

  const doScanFromFiles = React.useCallback(async () => {
    const scanFiles = filePickerRef.current?.files

    if (!scanFiles) {
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()

      for (const file of scanFiles) {
        formData.append(
          'files',
          new Blob([await file.arrayBuffer()], { type: file.type }),
          file.name
        )
      }

      await fetch('/scan/scanFiles', {
        method: 'POST',
        body: formData,
      })
    } catch (error) {
      console.error(error)
      alert(error.message)
    } finally {
      setIsUploading(false)
    }
  }, [])

  return h('div', {}, [
    h(
      'button',
      { key: 'from-scanner', onClick: doScanFromScanner },
      'From Scanner'
    ),
    ' ',
    h(
      'button',
      { key: 'from-files', onClick: pickFiles, disabled: isUploading },
      isUploading ? 'Uploading…' : 'From Files'
    ),
    h('input', {
      key: 'file-picker',
      ref: filePickerRef,
      type: 'file',
      onChange: doScanFromFiles,
      accept: 'image/jpeg,image/png,image/tiff',
      multiple: true,
      style: { opacity: 0 },
    }),
  ])
}

export default ManualScan
