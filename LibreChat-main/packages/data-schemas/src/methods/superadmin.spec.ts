import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createDocumentVersionModel } from '../models/documentVersion';
import { createTransactionModel } from '../models/transaction';
import { createConversationModel } from '../models/convo';
import { createDocumentModel } from '../models/document';
import { createMessageModel } from '../models/message';
import { createSuperAdminMethods } from './superadmin';
import { createUserModel } from '../models/user';

let mongoServer: MongoMemoryServer;
const methods = createSuperAdminMethods(mongoose);

const NOW = new Date('2026-06-15T12:00:00.000Z');
const FROM = new Date('2026-06-14T12:00:00.000Z');

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  const models = [
    createConversationModel(mongoose),
    createDocumentModel(mongoose),
    createDocumentVersionModel(mongoose),
    createMessageModel(mongoose),
    createTransactionModel(mongoose),
    createUserModel(mongoose),
  ];
  await Promise.all(models.map((model) => model.init()));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    mongoose.models.Conversation.deleteMany({}),
    mongoose.models.Document.deleteMany({}),
    mongoose.models.DocumentVersion.deleteMany({}),
    mongoose.models.Message.deleteMany({}),
    mongoose.models.Transaction.deleteMany({}),
    mongoose.models.User.deleteMany({}),
  ]);
});

function objectId() {
  return new mongoose.Types.ObjectId();
}

async function insertUser(userId: mongoose.Types.ObjectId, name: string, email: string) {
  await mongoose.models.User.collection.insertOne({
    _id: userId,
    name,
    email,
    role: 'USER',
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function insertConversation({
  conversationId,
  userId,
  title,
  model = 'deepseek-v4.1-flash',
  isTemporary = false,
  subagentThread,
  isArchived = false,
  createdAt = NOW,
}: {
  conversationId: string;
  userId: string;
  title: string;
  model?: string;
  isTemporary?: boolean;
  subagentThread?: Record<string, unknown>;
  isArchived?: boolean;
  createdAt?: Date;
}) {
  await mongoose.models.Conversation.collection.insertOne({
    conversationId,
    user: userId,
    title,
    model,
    isTemporary,
    isArchived,
    ...(subagentThread != null ? { subagentThread } : {}),
    createdAt,
    updatedAt: NOW,
  });
}

async function insertMessage({
  conversationId,
  userId,
  messageId,
  isCreatedByUser,
  text,
  content,
  tokenCount,
  model = 'deepseek-v4.1-flash',
  createdAt = NOW,
}: {
  conversationId: string;
  userId: string;
  messageId: string;
  isCreatedByUser: boolean;
  text?: string;
  content?: Array<Record<string, unknown>>;
  tokenCount: number;
  model?: string;
  createdAt?: Date;
}) {
  await mongoose.models.Message.collection.insertOne({
    conversationId,
    user: userId,
    messageId,
    isCreatedByUser,
    sender: isCreatedByUser ? 'User' : 'Assistant',
    model,
    text,
    ...(content != null ? { content } : {}),
    tokenCount,
    createdAt,
  });
}

async function insertDocument({
  userId,
  conversationId,
  artifactId,
  title,
  content,
  versions = [],
  tenantId,
}: {
  userId: mongoose.Types.ObjectId;
  conversationId: string;
  artifactId: string;
  title: string;
  content: string;
  versions?: Array<{
    id: string;
    title: string;
    content: string;
    createdAt: number;
    source: string;
  }>;
  tenantId?: string;
}) {
  await mongoose.models.Document.collection.insertOne({
    user: userId,
    conversationId,
    artifactId,
    title,
    content,
    versions,
    ...(tenantId != null ? { tenantId } : {}),
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function insertTransaction({
  userId,
  conversationId,
  tokenType,
  rawAmount,
  inputTokens,
  writeTokens,
  readTokens,
  model = 'deepseek-v4.1-flash',
}: {
  userId: mongoose.Types.ObjectId;
  conversationId: string;
  tokenType: 'prompt' | 'completion';
  rawAmount?: number;
  inputTokens?: number;
  writeTokens?: number;
  readTokens?: number;
  model?: string;
}) {
  await mongoose.models.Transaction.collection.insertOne({
    user: userId,
    conversationId,
    tokenType,
    model,
    rawAmount,
    inputTokens,
    writeTokens,
    readTokens,
    createdAt: NOW,
  });
}

describe('Superadmin methods', () => {
  it('reports request-level token totals and activity for the selected range', async () => {
    const alice = objectId();
    const bob = objectId();
    await insertUser(alice, 'Alice', 'alice@example.com');
    await insertUser(bob, 'Bob', 'bob@example.com');
    await insertConversation({
      conversationId: 'c-alice-1',
      userId: alice.toString(),
      title: 'Alpha',
    });
    await insertConversation({ conversationId: 'c-bob-1', userId: bob.toString(), title: 'Beta' });
    await insertMessage({
      conversationId: 'c-alice-1',
      userId: alice.toString(),
      messageId: 'm-alice-1',
      isCreatedByUser: true,
      text: 'Hello',
      tokenCount: 10,
    });
    await insertMessage({
      conversationId: 'c-alice-1',
      userId: alice.toString(),
      messageId: 'm-alice-2',
      isCreatedByUser: false,
      text: 'Hi Alice',
      tokenCount: 20,
    });
    await insertMessage({
      conversationId: 'c-bob-1',
      userId: bob.toString(),
      messageId: 'm-bob-1',
      isCreatedByUser: true,
      text: 'Hey',
      tokenCount: 5,
    });
    await insertTransaction({
      userId: alice,
      conversationId: 'c-alice-1',
      tokenType: 'prompt',
      rawAmount: -100,
    });
    await insertTransaction({
      userId: alice,
      conversationId: 'c-alice-1',
      tokenType: 'completion',
      rawAmount: -50,
    });
    await insertTransaction({
      userId: bob,
      conversationId: 'c-bob-1',
      tokenType: 'prompt',
      rawAmount: -10,
    });
    await insertTransaction({
      userId: bob,
      conversationId: 'c-bob-1',
      tokenType: 'completion',
      rawAmount: -5,
    });

    const overview = await methods.getSuperAdminOverview({ from: FROM, to: NOW });

    expect(overview.totals).toMatchObject({
      users: 2,
      activeUsers: 2,
      conversations: 2,
      messages: 3,
      promptTokens: 110,
      completionTokens: 55,
      totalTokens: 165,
      tokenSource: 'transactions',
    });
    expect(overview.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: 'deepseek-v4.1-flash',
          messages: 3,
          promptTokens: 110,
          completionTokens: 55,
        }),
      ]),
    );
    expect(overview.daily.length).toBeGreaterThan(0);
  });

  it('falls back to saved message token counts when no request usage exists', async () => {
    const alice = objectId();
    await insertUser(alice, 'Alice', 'alice@example.com');
    await insertConversation({ conversationId: 'c-1', userId: alice.toString(), title: 'Alpha' });
    await insertMessage({
      conversationId: 'c-1',
      userId: alice.toString(),
      messageId: 'm-1',
      isCreatedByUser: true,
      text: 'Hello',
      tokenCount: 12,
    });
    await insertMessage({
      conversationId: 'c-1',
      userId: alice.toString(),
      messageId: 'm-2',
      isCreatedByUser: false,
      text: 'Hi',
      tokenCount: 8,
    });

    const overview = await methods.getSuperAdminOverview({ from: FROM, to: NOW });

    expect(overview.totals).toMatchObject({
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
      tokenSource: 'messages',
    });
  });

  it('counts structured cache input as prompt tokens', async () => {
    const alice = objectId();
    await insertUser(alice, 'Alice', 'alice@example.com');
    await insertConversation({ conversationId: 'c-1', userId: alice.toString(), title: 'Alpha' });
    await insertTransaction({
      userId: alice,
      conversationId: 'c-1',
      tokenType: 'prompt',
      inputTokens: -10,
      writeTokens: -20,
      readTokens: -30,
    });
    await insertTransaction({
      userId: alice,
      conversationId: 'c-1',
      tokenType: 'completion',
      rawAmount: -5,
    });

    const overview = await methods.getSuperAdminOverview({ from: FROM, to: NOW });

    expect(overview.totals).toMatchObject({
      promptTokens: 60,
      completionTokens: 5,
      totalTokens: 65,
      tokenSource: 'transactions',
    });
  });

  it('searches users and reports per-user conversation, message, and token totals', async () => {
    const alice = objectId();
    const bob = objectId();
    await insertUser(alice, 'Alice Wonder', 'alice@example.com');
    await insertUser(bob, 'Bob Builder', 'bob@example.com');
    await insertConversation({
      conversationId: 'c-alice',
      userId: alice.toString(),
      title: 'Alpha',
    });
    await insertConversation({
      conversationId: 'c-alice-2',
      userId: alice.toString(),
      title: 'Alpha 2',
    });
    await insertConversation({ conversationId: 'c-bob', userId: bob.toString(), title: 'Beta' });
    await insertMessage({
      conversationId: 'c-alice',
      userId: alice.toString(),
      messageId: 'm-a1',
      isCreatedByUser: true,
      tokenCount: 4,
    });
    await insertMessage({
      conversationId: 'c-alice-2',
      userId: alice.toString(),
      messageId: 'm-a2',
      isCreatedByUser: false,
      tokenCount: 6,
    });
    await insertTransaction({
      userId: alice,
      conversationId: 'c-alice',
      tokenType: 'prompt',
      rawAmount: -40,
    });
    await insertTransaction({
      userId: alice,
      conversationId: 'c-alice',
      tokenType: 'completion',
      rawAmount: -60,
    });

    const result = await methods.getSuperAdminUsers({
      from: FROM,
      to: NOW,
      page: 1,
      pageSize: 10,
      search: 'alice',
    });

    expect(result.total).toBe(1);
    expect(result.users[0]).toMatchObject({
      userId: alice.toString(),
      name: 'Alice Wonder',
      email: 'alice@example.com',
      conversations: 2,
      messages: 2,
      promptTokens: 40,
      completionTokens: 60,
      totalTokens: 100,
    });
  });

  it('narrows per-user totals to the selected range', async () => {
    const alice = objectId();
    await insertUser(alice, 'Alice', 'alice@example.com');
    await insertConversation({ conversationId: 'c-now', userId: alice.toString(), title: 'Now' });
    await insertConversation({
      conversationId: 'c-old',
      userId: alice.toString(),
      title: 'Old',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });
    await insertMessage({
      conversationId: 'c-now',
      userId: alice.toString(),
      messageId: 'm-now',
      isCreatedByUser: true,
      tokenCount: 4,
    });
    await insertMessage({
      conversationId: 'c-old',
      userId: alice.toString(),
      messageId: 'm-old',
      isCreatedByUser: true,
      tokenCount: 9,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    const result = await methods.getSuperAdminUsers({
      from: FROM,
      to: NOW,
      page: 1,
      pageSize: 10,
    });

    expect(result.users[0]).toMatchObject({ conversations: 1, messages: 1 });
  });

  it('lists deployment documents with owners and returns full document content', async () => {
    const alice = objectId();
    const bob = objectId();
    await insertUser(alice, 'Alice', 'alice@example.com');
    await insertUser(bob, 'Bob', 'bob@example.com');
    await insertDocument({
      userId: alice,
      conversationId: 'c-alice',
      artifactId: 'artifact-1',
      title: 'Alice handbook',
      content: '# Handbook\n\nHello',
      versions: [
        { id: 'v1', title: 'Alice handbook', content: '# Handbook', createdAt: 1, source: 'user' },
      ],
    });
    await insertDocument({
      userId: bob,
      conversationId: 'c-bob',
      artifactId: 'artifact-2',
      title: 'Bob notes',
      content: 'Bob content',
    });

    const list = await methods.getSuperAdminDocuments({ page: 1, pageSize: 10 });
    expect(list.total).toBe(2);
    expect(list.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: alice.toString(),
          userName: 'Alice',
          title: 'Alice handbook',
          versionCount: 1,
        }),
        expect.objectContaining({ userId: bob.toString(), userName: 'Bob', title: 'Bob notes' }),
      ]),
    );

    const searched = await methods.getSuperAdminDocuments({
      page: 1,
      pageSize: 10,
      search: 'handbook',
    });
    expect(searched.total).toBe(1);
    expect(searched.documents[0]?.title).toBe('Alice handbook');

    const detail = await methods.getSuperAdminDocument({
      userId: alice.toString(),
      conversationId: 'c-alice',
      artifactId: 'artifact-1',
    });
    expect(detail).toMatchObject({
      title: 'Alice handbook',
      content: '# Handbook\n\nHello',
      versionCount: 1,
      userName: 'Alice',
    });

    const wrongOwner = await methods.getSuperAdminDocument({
      userId: bob.toString(),
      conversationId: 'c-alice',
      artifactId: 'artifact-1',
    });
    expect(wrongOwner).toBeNull();
  });

  it('scopes document reads to the tenant when the admin has one', async () => {
    const alice = objectId();
    const bob = objectId();
    await insertUser(alice, 'Alice', 'alice@example.com');
    await insertUser(bob, 'Bob', 'bob@example.com');
    await insertDocument({
      userId: alice,
      conversationId: 'c-alice',
      artifactId: 'artifact-a',
      title: 'Tenant A note',
      content: 'A',
      tenantId: 'tenant-a',
    });
    await insertDocument({
      userId: bob,
      conversationId: 'c-bob',
      artifactId: 'artifact-b',
      title: 'Tenant B note',
      content: 'B',
      tenantId: 'tenant-b',
    });

    const list = await methods.getSuperAdminDocuments({
      page: 1,
      pageSize: 10,
      tenantId: 'tenant-a',
    });
    expect(list.total).toBe(1);
    expect(list.documents[0]).toMatchObject({ artifactId: 'artifact-a', title: 'Tenant A note' });

    const crossTenant = await methods.getSuperAdminDocument({
      userId: bob.toString(),
      conversationId: 'c-bob',
      artifactId: 'artifact-b',
      tenantId: 'tenant-a',
    });
    expect(crossTenant).toBeNull();
  });

  it('reports snapshot metadata from the versions collection', async () => {
    const alice = objectId();
    await insertUser(alice, 'Alice', 'alice@example.com');
    await mongoose.models.Document.collection.insertOne({
      user: alice,
      conversationId: 'c-split',
      artifactId: 'artifact-split',
      title: 'Split document',
      content: 'current',
      versionCount: 2,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await mongoose.models.DocumentVersion.collection.insertMany([
      {
        user: alice,
        conversationId: 'c-split',
        artifactId: 'artifact-split',
        id: 'v1',
        title: 'Split document',
        content: 'first',
        createdAt: 1,
        source: 'user',
      },
      {
        user: alice,
        conversationId: 'c-split',
        artifactId: 'artifact-split',
        id: 'v2',
        title: 'Split document',
        content: 'second',
        createdAt: 2,
        source: 'user',
      },
    ]);

    const list = await methods.getSuperAdminDocuments({ page: 1, pageSize: 10 });
    expect(list.documents[0]).toMatchObject({
      artifactId: 'artifact-split',
      versionCount: 2,
    });

    const detail = await methods.getSuperAdminDocument({
      userId: alice.toString(),
      conversationId: 'c-split',
      artifactId: 'artifact-split',
    });
    expect(detail?.versionCount).toBe(2);
    expect(detail?.versions.map((version) => version.id)).toEqual(['v1', 'v2']);
  });

  it('lists a user conversation and returns its transcript, excluding temporary chats', async () => {
    const alice = objectId();
    const bob = objectId();
    await insertUser(alice, 'Alice', 'alice@example.com');
    await insertUser(bob, 'Bob', 'bob@example.com');
    await insertConversation({ conversationId: 'c-live', userId: alice.toString(), title: 'Live' });
    await insertConversation({
      conversationId: 'c-temp',
      userId: alice.toString(),
      title: 'Temporary',
      isTemporary: true,
    });
    await insertConversation({
      conversationId: 'c-bob',
      userId: bob.toString(),
      title: 'Bob chat',
    });
    await insertMessage({
      conversationId: 'c-live',
      userId: alice.toString(),
      messageId: 'm-1',
      isCreatedByUser: true,
      text: '',
      content: [{ type: 'text', text: 'From content parts' }],
      tokenCount: 3,
    });
    await insertMessage({
      conversationId: 'c-live',
      userId: alice.toString(),
      messageId: 'm-2',
      isCreatedByUser: false,
      text: 'Assistant reply',
      tokenCount: 7,
    });

    const conversations = await methods.getSuperAdminConversations({
      userId: alice.toString(),
      page: 1,
      pageSize: 10,
    });
    expect(conversations.total).toBe(1);
    expect(conversations.conversations[0]).toMatchObject({
      conversationId: 'c-live',
      messages: 2,
      totalTokens: 10,
    });

    const transcript = await methods.getSuperAdminMessages({
      conversationId: 'c-live',
      userId: alice.toString(),
      page: 1,
      pageSize: 10,
    });
    expect(transcript?.total).toBe(2);
    expect(transcript?.messages[0]).toMatchObject({
      messageId: 'm-1',
      text: 'From content parts',
      tokenCount: 3,
    });

    const wrongOwner = await methods.getSuperAdminMessages({
      conversationId: 'c-live',
      userId: bob.toString(),
      page: 1,
      pageSize: 10,
    });
    expect(wrongOwner).toBeNull();
  });
});
