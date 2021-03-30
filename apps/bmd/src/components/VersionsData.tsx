import React from 'react'
import styled from 'styled-components'
import Prose from './Prose'
import Text from './Text'

const HorizontalVersions = styled(Prose)`
  display: flex;
  justify-content: space-between;
  margin-top: 1rem;
`

const VerticalVersions = styled(Prose)`
  margin-top: 1rem;
  border-top: 1px solid #666666;
  padding-top: 0.5rem;
`

interface Props {
  machineId: string
  electionHash?: string
  softwareVersion?: string
}

const VersionsData: React.FC<Props> = ({
  machineId,
  electionHash,
  softwareVersion,
}) => {
  const electionId = electionHash?.substring(0, 10)
  const content = (
    <React.Fragment>
      {electionId && (
        <Text small noWrap>
          Election ID: <strong>{electionId}</strong>
        </Text>
      )}
      <Text small noWrap>
        Machine ID: <strong>{machineId}</strong>
      </Text>
    </React.Fragment>
  )
  if (softwareVersion) {
    return (
      <VerticalVersions compact>
        {content}
        <Text small noWrap>
          Software Version: <strong>{softwareVersion}</strong>
        </Text>
      </VerticalVersions>
    )
  }
  return <HorizontalVersions compact>{content}</HorizontalVersions>
}

export default VersionsData
