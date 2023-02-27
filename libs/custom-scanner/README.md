# custom-scanner

## Usage

```ts
import { openScanner, ReleaseType } from '@votingworks/custom-scanner';

const scanner = (await openScanner()).assertOk(
  'Failed to open scanner. Is the device plugged in?'
);

const deviceModel = scanner
  .getReleaseVersion(ReleaseType.Model)
  .assertOk('Failed to get device model.');

console.log('Detected device:', deviceModel);

await scanner.disconnect();
```

## License

AGPL-3.0
