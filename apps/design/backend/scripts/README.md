# Scripts

## User/Org Management

Until we build out our support tooling, auth scripts for user and org management
have been added for common operations.

To run:

- Add relevant env vars to `.env.local`:

```sh
# Details in the 'vxdesign' tenant in the Auth0 dashboard
AUTH_ENABLED=TRUE
AUTH0_CLIENT_ID='xxxxx'
AUTH0_CLIENT_DOMAIN='vxdesign.us.auth0.com'
AUTH0_SECRET='xxxxx
```

Once that's done, the following scripts can bbe run from `apps/design/backend`.

### Create new org

This will create a new org and print out the new org ID and short name to the
console:

```sh
pnpm create-org "City of Vx"
```

```sh
# Output:

✅ Org created: {
  displayName: 'City of Vx',
  id: 'org_TUPNZLFFyBgzxdeH',
  name: 'city-of-vx'
}
```

### List All Existing Orgs

```sh
pnpm list-orgs
```

```sh
# Output:

✅ Orgs: [
  {
    displayName: 'City of Vx',
    id: 'org_TUPNZLFFyBgzxdeH',
    name: 'city-of-vx'
  },
  {
    displayName: 'VotingWorks',
    id: 'org_Ug9eDziiLfqKelKi',
    name: 'votingworks'
  },
]
```

### Create User

This will create a new user and add to the organization. If a user already
exists with the same email address, they will just get added to the specified
org, which will also be idempotent.

**NOTE:** This doesn't send out an email to the user - see next section.

```sh
pnpm create-user --orgId="org_TUPNZLFFyBgzxdeH" "someone@example.com"
```

```sh
# Output:

✅ User created and added to org 'City of Vx'
```

### List User Orgs

```sh
pnpm list-user-orgs "someone@example.com"
```

```sh
# Output:

✅ Org memberships for someone@example.com: [
  {
    displayName: 'City of Vx',
    id: 'org_TUPNZLFFyBgzxdeH',
    name: 'city-of-vx'
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
pnpm send-welcome-email --orgId="org_TUPNZLFFyBgzxdeH" "someone@example.com"
```

```sh
# Output:

✅ Welcome email sent to someone@example.com
```
