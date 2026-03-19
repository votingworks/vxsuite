import { H2, P } from '../typography.js';
import { Button } from '../button.js';
import { ButtonBar } from '../modal.js';
import { Main } from '../main.js';
import { Screen } from '../screen.js';

export interface UpsSectionProps {
  passTest: () => void;
  failTest: () => void;
}

export function UninterruptiblePowerSupplyScreen({
  passTest,
  failTest,
}: UpsSectionProps): JSX.Element {
  return (
    <Screen>
      <Main flexColumn padded>
        <H2>Uninterruptible Power Supply Test</H2>
        <P>
          Confirm the uninterruptible power supply is connected and fully
          charged.
        </P>
        <ButtonBar style={{ marginTop: '0.5rem' }}>
          <Button icon="Done" onPress={passTest}>
            UPS Is Fully Charged
          </Button>
          <Button icon="Delete" onPress={failTest}>
            UPS Is Not Fully Charged
          </Button>
        </ButtonBar>
      </Main>
    </Screen>
  );
}
