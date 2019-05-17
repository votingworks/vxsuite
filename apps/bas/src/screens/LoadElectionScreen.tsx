import React from 'react'
import { useDropzone } from 'react-dropzone'
import { SetElection } from '../config/types'

interface Props {
  setElection: SetElection
}

const LoadElectionConfigScreen = ({ setElection }: Props) => {
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 1) {
      const file = acceptedFiles[0]
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        setElection(JSON.parse(result))
      }
      reader.readAsText(file)
    }
  }
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  return (
    <div>
      <h1>Load Election Configuration File</h1>
      <div {...getRootProps()}>
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>Drop files here…</p>
        ) : (
          <p>
            Drag and drop <code>election.json</code> file here, or click to
            browse for file.
          </p>
        )}
      </div>
    </div>
  )
}

export default LoadElectionConfigScreen
