import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createConversationModel } from '../models/convo';
import { createMessageModel } from '../models/message';
import { createTransactionModel } from '../models/transaction';
import { createUserModel } from '../models/user';
import { createSuperAdminMethods } from './superadmin';

let mongoServer: MongoMemoryServer;
const methods = createSuperAdminMethods(mongoose);

const NOW = new Date('2026-06-15T12:00:00.000Z');
const FROM = new Date('2026-06-14T12:00:00.000Z');

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  const models = [
    createConversationModel(mongoose),
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
}: {
  conversationId: string;
  userId: string;
  title: string;
  model?: string;
  isTemporary?: boolean;
  subagentThread?: Record<string, unknown>;
  isArchived?: boolean;
}) {
  await mongoose.models.Conversation.collection.insertOne({
    conversationId,
    user: userId,
    title,
    model,
    isTemporary,
    isArchived,
    ...(subagentThread != null ? { subagentThread } : {}),
    createdAt: NOW,
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
}: {
  conversationId: string;
  userId: string;
  messageId: string;
  isCreatedByUser: boolean;
  text?: string;
  content?: Array<Record<string, unknown>>;
  tokenCount: number;
  model?: string;
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
    createdAt: NOW,
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
