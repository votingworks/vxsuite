# res-to-ts

Converts a resource file to a TypeScript file. If you need to include a non-code
resource such as an image, CSV, or XML file with your package then you can use
`res-to-ts` to do so.

## Usage

Add it as a dependency in `package.json`:

```json5
  "devDependencies": {
    // …
    "@votingworks/res-to-ts": "workspace:*",
    // …
  }
```

Run `pnpm install` to link to your package. Configure scripts in `package.json`:

```json5
  "scripts": {
    // …
    "build:resources": "res-to-ts 'src/data/**/*.{csv,png,jpeg}'",
    // …
    "test:ci": "… && pnpm build:resources -- --check",
    // …
  }
```

Run `pnpm build:resources` to build the `.ts` files for your resources. Check
the `.ts` files into git alongside the resource files themselves. With the
`test:ci` script as configured above, if the `.ts` files get of out date the
build will fail. Import/export your resources as needed in your package:

```ts
export { asImageData as getMyImageData } from './my_image.png';
export { asText as getReadme } from './readme.md';
```

And use them outside the package if desired:

```ts
import { getMyImageData, getReadme } from '@votingworks/my-package';
```

You'll need to install the `buffer` package as the generated files will depend
on it. If you're using it with image files, make sure you include the `canvas`
package as a dependency.
