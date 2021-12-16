# CDF Schema Builder

Builds TypeScript enums, interfaces, and
[Zod](https://github.com/colinhacks/zod) schemas for working with
[CDF voting specifications](https://www.nist.gov/itl/voting/interoperability).

## Setup

```sh
pnpm install
pnpm build
```

## Usage

Add to your package.json (and `pnpm install` after):

```json
    "@votingworks/cdf-schema-builder": "workspace:*",
```

With the CLI:

```sh
# in a package.json script:
cdf-schema-builder schema.xml > src/schema.ts

# in your terminal:
pnpx cdf-schema-builder schema.xml > src/schema.ts
```

With the API:

```ts
import { buildSchema } from '@votingworks/cdf-schema-builder';
import { readFileSync, createWriteStream } from 'fs';

buildSchema(
  readFileSync('schema.xml', 'utf-8'),
  createWriteStream('src/schema.ts')
);
```
