import { SUPER_ADMIN_MESSAGE_MAX_CHARS } from 'librechat-data-provider';
import type { FilterQuery, Model } from 'mongoose';
import type {
  TSuperAdminConversation,
  TSuperAdminDailyPoint,
  TSuperAdminMessage,
  TSuperAdminModelUsage,
  TSuperAdminUser,
} from 'librechat-data-provider';
import type {
  SuperAdminConversationsParams,
  SuperAdminConversationsResult,
  SuperAdminMessagesParams,
  SuperAdminMessagesResult,
  SuperAdminOverviewResult,
  SuperAdminScope,
  SuperAdminUsersParams,
  SuperAdminUsersResult,
} from '~/types';
import type { ITransaction } from '~/schema/transaction';
import type { IConversation, IMessage, IUser } from '~/types';

type TokenSource = 'transactions' | 'messages';

type CountRow = { total: number };
type DayCountRow = { _id: string; count: number };
type DayMessageRow = {
  _id: string;
  messages: number;
  promptTokens: number;
  completionTokens: number;
};
type DayTokenRow = { _id: { date: string; tokenType: string }; tokens: number };
type ModelTokenRow = { _id: { model: string; tokenType: string }; tokens: number };
type ModelMessageRow = {
  _id: string;
  messages: number;
  promptTokens: number;
  completionTokens: number;
};
type UserConversationRow = { _id: string; conversations: number; lastAt?: Date };
type UserMessageRow = {
  _id: string;
  messages: number;
  lastAt?: Date;
  promptTokens: number;
  completionTokens: number;
};
type UserTokenRow = { _id: string; promptTokens: number; completionTokens: number };
type ConversationMessageRow = {
  _id: string;
  messages: number;
  promptTokens: number;
  completionTokens: number;
};
type ConversationTokenRow = { _id: string; promptTokens: number; completionTokens: number };

const tenantMatch = (tenantId?: string) => (tenantId ? { tenantId } : {});

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function toIso(value?: Date | string | null): string | null {
  if (value == null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dayBucket(field = '$createdAt') {
  return { $dateToString: { format: '%Y-%m-%d', date: field } };
}

function messageTokenSums() {
  return {
    promptTokens: {
      $sum: { $cond: [{ $eq: ['$isCreatedByUser', true] }, { $ifNull: ['$tokenCount', 0] }, 0] },
    },
    completionTokens: {
      $sum: {
        $cond: [{ $ne: ['$isCreatedByUser', true] }, { $ifNull: ['$tokenCount', 0] }, 0],
      },
    },
  };
}

/** Structured prompt usage stores cache input/write/read counts in their own
 *  fields instead of `rawAmount`, so count those when `rawAmount` is absent. */
function promptTokenExpression() {
  const raw = { $abs: { $ifNull: ['$rawAmount', 0] } };
  const structured = {
    $add: [
      { $abs: { $ifNull: ['$inputTokens', 0] } },
      { $abs: { $ifNull: ['$writeTokens', 0] } },
      { $abs: { $ifNull: ['$readTokens', 0] } },
    ],
  };
  return {
    $cond: [{ $gt: [{ $abs: { $ifNull: ['$rawAmount', 0] } }, 0] }, raw, structured],
  };
}

function completionTokenExpression() {
  return { $abs: { $ifNull: ['$rawAmount', 0] } };
}

function transactionTokenSum() {
  return {
    $sum: {
      $cond: [
        { $eq: ['$tokenType', 'prompt'] },
        promptTokenExpression(),
        completionTokenExpression(),
      ],
    },
  };
}

function extractContentText(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }
  const chunks: string[] = [];
  for (const part of content) {
    if (part == null || typeof part !== 'object') {
      continue;
    }
    const text = (part as Record<string, unknown>).text;
    if (typeof text === 'string' && text.trim() !== '') {
      chunks.push(text);
      continue;
    }
    if (text != null && typeof text === 'object') {
      const value = (text as Record<string, unknown>).value;
      if (typeof value === 'string' && value.trim() !== '') {
        chunks.push(value);
      }
    }
  }
  return chunks.join('\n\n');
}

function messageText(message: Pick<IMessage, 'text' | 'content'>): {
  text: string;
  truncated: boolean;
} {
  const raw =
    typeof message.text === 'string' && message.text.trim() !== ''
      ? message.text
      : extractContentText(message.content);
  if (raw.length <= SUPER_ADMIN_MESSAGE_MAX_CHARS) {
    return { text: raw, truncated: false };
  }
  return { text: raw.slice(0, SUPER_ADMIN_MESSAGE_MAX_CHARS), truncated: true };
}

export interface SuperAdminMethods {
  getSuperAdminOverview: (scope: SuperAdminScope) => Promise<SuperAdminOverviewResult>;
  getSuperAdminUsers: (params: SuperAdminUsersParams) => Promise<SuperAdminUsersResult>;
  getSuperAdminConversations: (
    params: SuperAdminConversationsParams,
  ) => Promise<SuperAdminConversationsResult>;
  getSuperAdminMessages: (params: SuperAdminMessagesParams) => Promise<SuperAdminMessagesResult>;
}

export function createSuperAdminMethods(mongoose: typeof import('mongoose')): SuperAdminMethods {
  async function getSuperAdminOverview(scope: SuperAdminScope): Promise<SuperAdminOverviewResult> {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const Message = mongoose.models.Message as Model<IMessage>;
    const Transaction = mongoose.models.Transaction as Model<ITransaction>;
    const User = mongoose.models.User as Model<IUser>;

    const base = tenantMatch(scope.tenantId);
    const convoMatch = {
      ...base,
      isTemporary: { $ne: true },
      subagentThread: { $exists: false },
      user: { $nin: [null, ''] },
      createdAt: { $gte: scope.from, $lte: scope.to },
    };
    const messageMatch = {
      ...base,
      isTemporary: { $ne: true },
      user: { $nin: [null, ''] },
      createdAt: { $gte: scope.from, $lte: scope.to },
    };
    const transactionMatch = {
      ...base,
      createdAt: { $gte: scope.from, $lte: scope.to },
    };

    const [
      userCount,
      activeUserRows,
      conversationCount,
      messageCount,
      conversationDays,
      messageDays,
      transactionDays,
      transactionModels,
      messageModels,
      transactionCount,
    ] = await Promise.all([
      User.countDocuments(base),
      Message.aggregate<CountRow>([
        { $match: messageMatch },
        { $group: { _id: '$user' } },
        { $count: 'total' },
      ]),
      Conversation.countDocuments(convoMatch),
      Message.countDocuments(messageMatch),
      Conversation.aggregate<DayCountRow>([
        { $match: convoMatch },
        { $group: { _id: dayBucket(), count: { $sum: 1 } } },
      ]),
      Message.aggregate<DayMessageRow>([
        { $match: messageMatch },
        {
          $group: {
            _id: dayBucket(),
            messages: { $sum: 1 },
            ...messageTokenSums(),
          },
        },
      ]),
      Transaction.aggregate<DayTokenRow>([
        { $match: { ...transactionMatch, tokenType: { $in: ['prompt', 'completion'] } } },
        {
          $group: {
            _id: { date: dayBucket(), tokenType: '$tokenType' },
            tokens: transactionTokenSum(),
          },
        },
      ]),
      Transaction.aggregate<ModelTokenRow>([
        { $match: { ...transactionMatch, tokenType: { $in: ['prompt', 'completion'] } } },
        {
          $group: {
            _id: { model: { $ifNull: ['$model', ''] }, tokenType: '$tokenType' },
            tokens: transactionTokenSum(),
          },
        },
      ]),
      Message.aggregate<ModelMessageRow>([
        { $match: messageMatch },
        {
          $group: {
            _id: { $ifNull: ['$model', ''] },
            messages: { $sum: 1 },
            ...messageTokenSums(),
          },
        },
      ]),
      Transaction.countDocuments({
        ...transactionMatch,
        tokenType: { $in: ['prompt', 'completion'] },
      }),
    ]);

    const tokenSource: TokenSource = transactionCount > 0 ? 'transactions' : 'messages';
    const conversationByDay = new Map(conversationDays.map((row) => [row._id, row.count]));
    const messageByDay = new Map(messageDays.map((row) => [row._id, row]));
    const transactionByDay = new Map<string, { prompt: number; completion: number }>();
    for (const row of transactionDays) {
      const current = transactionByDay.get(row._id.date) ?? { prompt: 0, completion: 0 };
      if (row._id.tokenType === 'prompt') {
        current.prompt += row.tokens;
      } else if (row._id.tokenType === 'completion') {
        current.completion += row.tokens;
      }
      transactionByDay.set(row._id.date, current);
    }

    const dates = [
      ...new Set([...conversationByDay.keys(), ...messageByDay.keys(), ...transactionByDay.keys()]),
    ].sort();
    const daily: TSuperAdminDailyPoint[] = dates.map((date) => {
      const messages = messageByDay.get(date);
      const tokens =
        tokenSource === 'transactions'
          ? transactionByDay.get(date)
          : { prompt: messages?.promptTokens ?? 0, completion: messages?.completionTokens ?? 0 };
      const promptTokens = tokens?.prompt ?? 0;
      const completionTokens = tokens?.completion ?? 0;
      return {
        date,
        conversations: conversationByDay.get(date) ?? 0,
        messages: messages?.messages ?? 0,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      };
    });

    const modelTokens = new Map<string, { prompt: number; completion: number }>();
    for (const row of transactionModels) {
      const current = modelTokens.get(row._id.model) ?? { prompt: 0, completion: 0 };
      if (row._id.tokenType === 'prompt') {
        current.prompt += row.tokens;
      } else if (row._id.tokenType === 'completion') {
        current.completion += row.tokens;
      }
      modelTokens.set(row._id.model, current);
    }
    const messageByModel = new Map(messageModels.map((row) => [row._id, row]));
    const models: TSuperAdminModelUsage[] = [
      ...new Set([...messageByModel.keys(), ...modelTokens.keys()]),
    ]
      .sort((left, right) => left.localeCompare(right))
      .map((model) => {
        const messages = messageByModel.get(model);
        const tokens =
          tokenSource === 'transactions'
            ? modelTokens.get(model)
            : {
                prompt: messages?.promptTokens ?? 0,
                completion: messages?.completionTokens ?? 0,
              };
        const promptTokens = tokens?.prompt ?? 0;
        const completionTokens = tokens?.completion ?? 0;
        return {
          model,
          messages: messages?.messages ?? 0,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        };
      });

    const promptTokens = daily.reduce((total, row) => total + row.promptTokens, 0);
    const completionTokens = daily.reduce((total, row) => total + row.completionTokens, 0);

    return {
      totals: {
        users: userCount,
        activeUsers: activeUserRows[0]?.total ?? 0,
        conversations: conversationCount,
        messages: messageCount,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        tokenSource,
      },
      daily,
      models,
    };
  }

  async function getSuperAdminUsers(params: SuperAdminUsersParams): Promise<SuperAdminUsersResult> {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const Message = mongoose.models.Message as Model<IMessage>;
    const Transaction = mongoose.models.Transaction as Model<ITransaction>;
    const User = mongoose.models.User as Model<IUser>;

    const base = tenantMatch(params.tenantId);
    const query: FilterQuery<IUser> = { ...base };
    if (params.search) {
      const regex = new RegExp(escapeRegex(params.search), 'i');
      query.$or = [{ name: regex }, { username: regex }, { email: regex }];
    }

    const sort: Record<string, 1 | -1> =
      params.sort === 'name' ? { name: 1, email: 1 } : { createdAt: -1 };
    const [total, userDocs] = await Promise.all([
      User.countDocuments(query),
      User.find(query)
        .sort(sort)
        .skip((params.page - 1) * params.pageSize)
        .limit(params.pageSize)
        .select('_id name username email role createdAt updatedAt')
        .lean<IUser[]>(),
    ]);

    const ids = userDocs.map((user) => user._id.toString());
    if (ids.length === 0) {
      return { users: [], total };
    }

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    const conversationMatch = {
      ...base,
      isTemporary: { $ne: true },
      subagentThread: { $exists: false },
      user: { $in: ids },
    };
    const messageMatch = {
      ...base,
      isTemporary: { $ne: true },
      user: { $in: ids },
    };
    const transactionMatch = { ...base, user: { $in: objectIds } };

    const [conversationRows, messageRows, transactionRows, transactionCount] = await Promise.all([
      Conversation.aggregate<UserConversationRow>([
        { $match: conversationMatch },
        { $group: { _id: '$user', conversations: { $sum: 1 }, lastAt: { $max: '$updatedAt' } } },
      ]),
      Message.aggregate<UserMessageRow>([
        { $match: messageMatch },
        {
          $group: {
            _id: '$user',
            messages: { $sum: 1 },
            lastAt: { $max: '$createdAt' },
            ...messageTokenSums(),
          },
        },
      ]),
      Transaction.aggregate<UserTokenRow>([
        {
          $match: { ...transactionMatch, tokenType: { $in: ['prompt', 'completion'] } },
        },
        {
          $group: {
            _id: '$user',
            promptTokens: {
              $sum: {
                $cond: [{ $eq: ['$tokenType', 'prompt'] }, promptTokenExpression(), 0],
              },
            },
            completionTokens: {
              $sum: {
                $cond: [{ $eq: ['$tokenType', 'completion'] }, completionTokenExpression(), 0],
              },
            },
          },
        },
      ]),
      Transaction.countDocuments({
        ...base,
        user: { $in: objectIds },
        tokenType: { $in: ['prompt', 'completion'] },
      }),
    ]);

    const tokenSource: TokenSource = transactionCount > 0 ? 'transactions' : 'messages';
    const conversationByUser = new Map(conversationRows.map((row) => [row._id, row]));
    const messageByUser = new Map(messageRows.map((row) => [row._id, row]));
    const tokensByUser = new Map(transactionRows.map((row) => [row._id.toString(), row]));

    const users: TSuperAdminUser[] = userDocs.map((user) => {
      const id = user._id.toString();
      const conversations = conversationByUser.get(id);
      const messages = messageByUser.get(id);
      const tokens =
        tokenSource === 'transactions'
          ? tokensByUser.get(id)
          : {
              promptTokens: messages?.promptTokens ?? 0,
              completionTokens: messages?.completionTokens ?? 0,
            };
      const promptTokens = tokens?.promptTokens ?? 0;
      const completionTokens = tokens?.completionTokens ?? 0;
      const lastCandidates = [conversations?.lastAt, messages?.lastAt, user.updatedAt].filter(
        (value): value is Date => value instanceof Date,
      );
      const lastActiveAt =
        lastCandidates.length > 0
          ? new Date(Math.max(...lastCandidates.map((value) => value.getTime()))).toISOString()
          : null;
      return {
        userId: id,
        name: user.name ?? '',
        username: user.username ?? '',
        email: user.email ?? '',
        role: user.role ?? '',
        createdAt: toIso(user.createdAt) ?? new Date(0).toISOString(),
        lastActiveAt,
        conversations: conversations?.conversations ?? 0,
        messages: messages?.messages ?? 0,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      };
    });

    return { users, total };
  }

  async function getSuperAdminConversations(
    params: SuperAdminConversationsParams,
  ): Promise<SuperAdminConversationsResult> {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const Message = mongoose.models.Message as Model<IMessage>;
    const Transaction = mongoose.models.Transaction as Model<ITransaction>;

    const base = tenantMatch(params.tenantId);
    const query: FilterQuery<IConversation> = {
      ...base,
      user: params.userId,
      isTemporary: { $ne: true },
      subagentThread: { $exists: false },
    };
    if (params.search) {
      query.title = new RegExp(escapeRegex(params.search), 'i');
    }

    const [total, docs] = await Promise.all([
      Conversation.countDocuments(query),
      Conversation.find(query)
        .sort({ updatedAt: -1 as const })
        .skip((params.page - 1) * params.pageSize)
        .limit(params.pageSize)
        .select('conversationId title model createdAt updatedAt isArchived')
        .lean<IConversation[]>(),
    ]);

    const conversationIds = docs
      .map((conversation) => conversation.conversationId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (conversationIds.length === 0) {
      return { conversations: [], total };
    }

    const [messageRows, transactionRows, transactionCount] = await Promise.all([
      Message.aggregate<ConversationMessageRow>([
        { $match: { ...base, conversationId: { $in: conversationIds } } },
        {
          $group: {
            _id: '$conversationId',
            messages: { $sum: 1 },
            ...messageTokenSums(),
          },
        },
      ]),
      Transaction.aggregate<ConversationTokenRow>([
        {
          $match: {
            ...base,
            conversationId: { $in: conversationIds },
            tokenType: { $in: ['prompt', 'completion'] },
          },
        },
        {
          $group: {
            _id: '$conversationId',
            promptTokens: {
              $sum: {
                $cond: [{ $eq: ['$tokenType', 'prompt'] }, promptTokenExpression(), 0],
              },
            },
            completionTokens: {
              $sum: {
                $cond: [{ $eq: ['$tokenType', 'completion'] }, completionTokenExpression(), 0],
              },
            },
          },
        },
      ]),
      Transaction.countDocuments({
        ...base,
        conversationId: { $in: conversationIds },
        tokenType: { $in: ['prompt', 'completion'] },
      }),
    ]);

    const tokenSource: TokenSource = transactionCount > 0 ? 'transactions' : 'messages';
    const messageByConversation = new Map(messageRows.map((row) => [row._id, row]));
    const tokensByConversation = new Map(transactionRows.map((row) => [row._id, row]));

    const conversations: TSuperAdminConversation[] = docs.map((conversation) => {
      const conversationId = conversation.conversationId;
      const messages = messageByConversation.get(conversationId);
      const tokens =
        tokenSource === 'transactions'
          ? tokensByConversation.get(conversationId)
          : {
              promptTokens: messages?.promptTokens ?? 0,
              completionTokens: messages?.completionTokens ?? 0,
            };
      return {
        conversationId,
        title: conversation.title ?? '',
        model: conversation.model ?? '',
        createdAt: toIso(conversation.createdAt) ?? new Date(0).toISOString(),
        updatedAt: toIso(conversation.updatedAt) ?? new Date(0).toISOString(),
        messages: messages?.messages ?? 0,
        totalTokens: (tokens?.promptTokens ?? 0) + (tokens?.completionTokens ?? 0),
        archived: conversation.isArchived === true,
      };
    });

    return { conversations, total };
  }

  async function getSuperAdminMessages(
    params: SuperAdminMessagesParams,
  ): Promise<SuperAdminMessagesResult> {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const Message = mongoose.models.Message as Model<IMessage>;

    const base = tenantMatch(params.tenantId);
    const conversation = await Conversation.findOne({
      ...base,
      conversationId: params.conversationId,
      user: params.userId,
    })
      .select('conversationId')
      .lean<IConversation>();

    if (conversation == null) {
      return null;
    }

    const query = {
      ...base,
      conversationId: params.conversationId,
      user: params.userId,
      isTemporary: { $ne: true },
    };

    const [total, docs] = await Promise.all([
      Message.countDocuments(query),
      Message.find(query)
        .sort({ createdAt: 1 as const, _id: 1 as const })
        .skip((params.page - 1) * params.pageSize)
        .limit(params.pageSize)
        .select('messageId isCreatedByUser sender model text content tokenCount createdAt')
        .lean<IMessage[]>(),
    ]);

    const messages: TSuperAdminMessage[] = docs.map((message) => {
      const { text, truncated } = messageText(message);
      return {
        messageId: message.messageId,
        isCreatedByUser: message.isCreatedByUser === true,
        sender: message.sender ?? '',
        model: message.model ?? '',
        text,
        truncated,
        tokenCount: typeof message.tokenCount === 'number' ? message.tokenCount : 0,
        createdAt: toIso(message.createdAt) ?? new Date(0).toISOString(),
      };
    });

    return { messages, total };
  }

  const methods: SuperAdminMethods = {
    getSuperAdminOverview,
    getSuperAdminUsers,
    getSuperAdminConversations,
    getSuperAdminMessages,
  };
  return methods;
}
