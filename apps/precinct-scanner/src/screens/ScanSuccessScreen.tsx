/* istanbul ignore file */
import React from 'react'
import { Prose } from '@votingworks/ui'
import { Absolute } from '../components/Absolute'
import { PlaceholderGraphic } from '../components/Graphics'
import { Bar } from '../components/Bar'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'

const ScanSuccessScreen: React.FC = () => (
  <CenteredScreen>
    <PlaceholderGraphic />
    <CenteredLargeProse>
      <h1>Successful Scan!</h1>
      <p>Ready to scan next ballot sheet.</p>
    </CenteredLargeProse>
    <Absolute top left>
      <Bar>
        <Prose>
          <p>
            Ballots Scanned: <strong>0</strong>
          </p>
        </Prose>
      </Bar>
    </Absolute>
  </CenteredScreen>
)

export default ScanSuccessScreen
