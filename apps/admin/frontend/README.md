# Election Manager (VxAdmin)

This app is intended to be used on an offline computer by system administrators
and election managers.

Note: Election manager can refer to VxAdmin or a user role, depending on the
context.

## Setup

Follow the instructions in the [VxSuite README](../../../README.md) to get set
up, then run the app like so:

```sh
# in apps/admin/frontend
pnpm start
```

The server will be available at http://localhost:3000/.

### Using with MS SEMS

If you want to use this app with Mississippi SEMS files, you'll need to set
`REACT_APP_VX_CONVERTER=ms-sems`. You may set this value in `.env.local` to make
the value persistent on your machine.

## Testing

```sh
pnpm test
```

## License

GPLv3
