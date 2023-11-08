# VxDesign (Backend)

Backend server for VxDesign.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,

You generally should not need to run the backend directly. Instead, run the
frontend, which will automatically run the backend.

```sh
cd apps/design/frontend
pnpm start
```

### Google Cloud Authentication

Follow the instructions
[here](./src/language_and_audio/README.md#google-cloud-authentication) to
authenticate with Google Cloud for language and audio file generation.

## Configuration

There are a few environment variables that can be set to configure the backend.

### `WORKSPACE`

By default a `design-backend.db` file will be created in a `dev-workspace`
folder inside `apps/design/backend` when running the app. To choose another
location, set `WORKSPACE` to the path to another folder:

```sh
WORKSPACE=/path/to/workspace pnpm start
```

## Testing

```sh
pnpm test
```
