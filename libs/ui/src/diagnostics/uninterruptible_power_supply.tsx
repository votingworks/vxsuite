import { H2, P } from '../typography';
import { Button } from '../button';
import { ButtonBar } from '../modal';
import { Main } from '../main';
import { Screen } from '../screen';

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
            UPS is Fully Charged
          </Button>
          <Button icon="Delete" onPress={failTest}>
            UPS is not Fully Charged
          </Button>
        </ButtonBar>
      </Main>
    </Screen>
  );
}
