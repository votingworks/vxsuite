# Scripts

## Cancel Background Task

If the worker is stuck while processing a background task, you can cancel it
with:

```sh
pnpm cancel-background-task
```

This will mark the currently running background task as canceled in the
database. Then, restart the worker. It won't pick up the canceled task again.

## User/Jurisdiction Management

Until we build out our support tooling, auth scripts for user and jurisdiction
management have been added for common operations.

To ensure these scripts have access to the correct environment variables, run
them in Heroku for the appropriate app (`vxdesign-staging` or
`vxdesign-production`):

```sh
heroku run bash -a <app-name>
/vx/code/vxsuite $ cd apps/design/backend/
/vx/code/vxsuite/apps/design/backend $ pnpm <script-name>
```

### List Organizations

```sh
pnpm list-organizations
```

```sh
# Output:

✅ Organizations: [
  { id: 'nfpn8pkbhr46', name: 'VotingWorks' },
]
```

### Create New Jurisdiction

This will create a new jurisdiction and print out the new jurisdiction ID and
name to the console:

```sh
pnpm create-jurisdiction --organizationId="nfpn8pkbhr46" --stateCode="DEMO" "City of Vx"
```

```sh
# Output:

✅ Jurisdiction created: {
  id: 'TUPNZLFFyBgzxdeH',
  name: 'City of Vx',
  stateCode: 'DEMO',
  organization: { id: 'nfpn8pkbhr46', name: 'VotingWorks' },
}
```

### List Jurisdictions

```sh
pnpm list-jurisdictions
```

```sh
# Output:

✅ Jurisdictions: [
  {
    id: 'TUPNZLFFyBgzxdeH',
    name: 'City of Vx',
    stateCode: 'DEMO',
    organization: { id: 'nfpn8pkbhr46', name: 'VotingWorks' },
  },
  {
    id: 'Ug9eDziiLfqKelKi',
    name: 'VotingWorks',
    stateCode: 'DEMO',
    organization: { id: 'nfpn8pkbhr46', name: 'VotingWorks' },
  },
]
```

### Create User

This will create a new user and add to the jurisdiction. If a user already
exists with the same email address, they will just get added to the specified
jurisdiction, which will also be idempotent.

**NOTE:** This doesn't send out an email to the user - see next section.

```sh
pnpm create-user --jurisdictionId="TUPNZLFFyBgzxdeH" "someone@example.com"
```

```sh
# Output:

✅ User created and added to jurisdiction 'City of Vx'
```

### List User Jurisdictions

```sh
pnpm list-user-jurisdictions "someone@example.com"
```

```sh
# Output:

✅ Jurisdiction memberships for someone@example.com: [
  {
    id: 'TUPNZLFFyBgzxdeH',
    name: 'City of Vx',
    stateCode: 'DEMO',
    organization: { id: 'nfpn8pkbhr46', name: 'VotingWorks' },
  }
]
```

### Send Welcome Email

This sends out a repurposed "change password" email as a "welcome" email,
allowing the user to set their password and log in to VxDesign.

**NOTE:** There's currently no check for whether or not an existing user has
already set their password and logged in, so this is best used new users (or for
users we know haven't logged in since their initial "welcome" email was sent).

```sh
pnpm send-welcome-email "someone@example.com"
```

```sh
# Output:

✅ Welcome email sent to someone@example.com
```
