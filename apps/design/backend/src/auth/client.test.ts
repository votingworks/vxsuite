import { beforeEach, expect, test, vi } from 'vitest';
import {
  Connection,
  ApiResponse,
  ConnectionsManager,
  OrganizationsManager,
  Database,
  UsersManager,
  UsersByEmailManager,
  PostOrganizations201Response,
  GetOrganizations200ResponseOneOfInner,
  GetUsers200ResponseOneOfInner,
  UserCreate,
  ChangePasswordRequest,
} from 'auth0';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { AuthClient, ConnectionType } from './client';
import { sliOrgId, votingWorksOrgId } from '../globals';

vi.mock(import('auth0'));
vi.mock(import('node:crypto'));
vi.mock(import('../globals.js'));

const SLI_ORG_ID = 'sli';
const VX_ORG_ID = 'vx';

const mockConnections = vi.mocked(ConnectionsManager.prototype);
const mockDatabase = vi.mocked(Database.prototype);
const mockOrganizations = vi.mocked(OrganizationsManager.prototype);
const mockUsers = vi.mocked(UsersManager.prototype);
const mockUsersByEmail = vi.mocked(UsersByEmailManager.prototype);

const mockRandomBytes = vi.mocked(crypto.randomBytes);

function mockConnection(kind: ConnectionType): Connection {
  return { id: `id-${kind}`, name: kind } as unknown as Connection;
}

const CONNECTION_GOOGLE_AUTH = mockConnection('google-oauth2');
const CONNECTION_USERNAME_PASSWORD = mockConnection(
  'Username-Password-Authentication'
);

function mockApiResponse<T>(data: Partial<T>): ApiResponse<T> {
  return { data: data as unknown as T } as unknown as ApiResponse<T>;
}

function mockApiResponseRepeated<T>(data: Array<Partial<T>>): ApiResponse<T[]> {
  return { data: data as unknown as T[] } as unknown as ApiResponse<T[]>;
}

function mockApiResponseVoid(): ApiResponse<void> {
  return {} as unknown as ApiResponse<void>;
}

function newClient() {
  return new AuthClient(
    mockConnections,
    mockDatabase,
    mockOrganizations,
    mockUsers,
    mockUsersByEmail
  );
}

beforeEach(() => {
  vi.mocked(sliOrgId).mockReturnValue(SLI_ORG_ID);
  vi.mocked(votingWorksOrgId).mockReturnValue(VX_ORG_ID);

  mockConnections.getAll.mockResolvedValue(
    mockApiResponse([CONNECTION_USERNAME_PASSWORD, CONNECTION_GOOGLE_AUTH])
  );
});

test('createOrg', async () => {
  mockOrganizations.create.mockResolvedValueOnce(
    mockApiResponse<PostOrganizations201Response>({
      display_name: 'City of Vx',
      id: 'new-org',
      name: 'city-of-vx',
    })
  );

  const result = await newClient().createOrg({
    displayName: 'City of Vx',
    logoUrl: 'https://example.com/logo.png',
  });

  expect(result).toEqual({
    displayName: 'City of Vx',
    id: 'new-org',
    name: 'city-of-vx',
  });

  expect(mockOrganizations.create).toHaveBeenCalledWith({
    branding: expect.objectContaining({
      logo_url: 'https://example.com/logo.png',
    }),
    display_name: 'City of Vx',
    enabled_connections: [{ connection_id: CONNECTION_USERNAME_PASSWORD.id }],
    name: 'city-of-vx',
  });
});

test('createUser', async () => {
  mockOrganizations.get.mockResolvedValueOnce(
    mockApiResponse<GetOrganizations200ResponseOneOfInner>({
      display_name: 'VotingWorks',
      id: VX_ORG_ID,
      name: 'votingworks',
    })
  );

  mockUsers.create.mockResolvedValueOnce(
    mockApiResponse<GetUsers200ResponseOneOfInner>({ user_id: 'new-user' })
  );

  mockOrganizations.addMembers.mockResolvedValueOnce(mockApiResponseVoid());

  mockRandomBytes.mockImplementation(() => Buffer.from('top-secret'));

  const result = await newClient().createUser({
    orgId: 'vx',
    userEmail: 'alice@example.com',
    connectionType: 'Username-Password-Authentication',
  });

  expect(result).toEqual({
    orgName: 'VotingWorks',
    isSliUser: false,
    isVotingWorksUser: true,
    orgId: 'vx',
  });

  expect(mockOrganizations.get).toHaveBeenCalledWith({ id: 'vx' });

  expect(mockUsers.create).toHaveBeenCalledWith<[UserCreate]>({
    connection: CONNECTION_USERNAME_PASSWORD.name,
    email: 'alice@example.com',
    password: Buffer.from('top-secret').toString('base64'),
  });

  expect(mockOrganizations.addMembers).toHaveBeenCalledWith(
    { id: 'vx' },
    { members: ['new-user'] }
  );
});

test('addOrgMember', async () => {
  mockUsersByEmail.getByEmail.mockResolvedValueOnce(
    mockApiResponseRepeated<GetUsers200ResponseOneOfInner>([
      { user_id: 'existing-user' },
    ])
  );

  mockOrganizations.get.mockResolvedValue(
    mockApiResponse<GetOrganizations200ResponseOneOfInner>({
      display_name: 'VotingWorks',
      id: VX_ORG_ID,
      name: 'votingworks',
    })
  );

  mockOrganizations.addMembers.mockResolvedValueOnce(mockApiResponseVoid());

  const result = await newClient().addOrgMember({
    orgId: VX_ORG_ID,
    userEmail: 'someone@example.com',
  });

  expect(result).toEqual({
    orgName: 'VotingWorks',
    isSliUser: false,
    isVotingWorksUser: true,
    orgId: 'vx',
  });

  expect(mockOrganizations.get).toHaveBeenCalledWith({ id: 'vx' });

  expect(mockOrganizations.addMembers).toHaveBeenCalledWith(
    { id: 'vx' },
    { members: ['existing-user'] }
  );
});

test('addOrgMember - user not found', async () => {
  mockUsersByEmail.getByEmail.mockResolvedValueOnce(
    mockApiResponseRepeated<GetUsers200ResponseOneOfInner>([])
  );

  const client = newClient();
  await expect(
    async () =>
      await client.addOrgMember({
        orgId: VX_ORG_ID,
        userEmail: 'someone@example.com',
      })
  ).rejects.toThrowError(/not found/i);
});

test('userOrgs', async () => {
  mockUsersByEmail.getByEmail.mockResolvedValueOnce(
    mockApiResponseRepeated<GetUsers200ResponseOneOfInner>([
      { user_id: 'existing-user' },
    ])
  );

  mockUsers.getUserOrganizations.mockResolvedValueOnce(
    mockApiResponseRepeated<GetOrganizations200ResponseOneOfInner>([
      { display_name: 'City of Vx', id: 'vx-city', name: 'city-of-vx' },
      { display_name: 'VotingWorks', id: 'vx', name: 'votingworks' },
    ])
  );

  const client = newClient();
  const result = await client.userOrgs('alice@example.com');
  expect(result).toEqual([
    { displayName: 'City of Vx', id: 'vx-city', name: 'city-of-vx' },
    { displayName: 'VotingWorks', id: 'vx', name: 'votingworks' },
  ]);

  expect(mockUsersByEmail.getByEmail).toHaveBeenCalledWith({
    email: 'alice@example.com',
  });

  expect(mockUsers.getUserOrganizations).toHaveBeenCalledWith({
    id: 'existing-user',
  });

  mockUsersByEmail.getByEmail.mockResolvedValueOnce(
    mockApiResponseRepeated<GetUsers200ResponseOneOfInner>([])
  );

  await expect(client.userOrgs('bob@example.com')).rejects.toEqual(
    new Error('User not found')
  );
});

test('sendWelcomeEmail', async () => {
  mockDatabase.changePassword.mockResolvedValueOnce(
    mockApiResponse<string>('ok')
  );

  await newClient().sendWelcomeEmail({
    connectionType: 'Username-Password-Authentication',
    orgId: 'vx-city',
    userEmail: 'bob@example.com',
  });

  expect(mockDatabase.changePassword).toHaveBeenCalledWith<
    [ChangePasswordRequest]
  >({
    connection: 'Username-Password-Authentication',
    email: 'bob@example.com',
    organization: 'vx-city',
  });
});
