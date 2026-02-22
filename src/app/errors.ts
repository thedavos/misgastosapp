import { Data } from "effect";

export class MissingDefaultUserError extends Data.TaggedError("MissingDefaultUserError")<{
  requestId?: string;
  message: string;
}> {}

export class EmailParseFailedError extends Data.TaggedError("EmailParseFailedError")<{
  requestId?: string;
  cause: unknown;
}> {}

export class AiExtractFailedError extends Data.TaggedError("AiExtractFailedError")<{
  requestId?: string;
  cause: unknown;
}> {}

export class AiMessageGenerationError extends Data.TaggedError("AiMessageGenerationError")<{
  requestId?: string;
  cause: unknown;
}> {}

export class CategoryClassificationError extends Data.TaggedError("CategoryClassificationError")<{
  requestId?: string;
  cause: unknown;
}> {}

export class ExpensePersistenceError extends Data.TaggedError("ExpensePersistenceError")<{
  requestId?: string;
  operation: "createPending" | "getById" | "markCategorized";
  cause: unknown;
}> {}

export class CategoryLookupError extends Data.TaggedError("CategoryLookupError")<{
  requestId?: string;
  operation: "listAll" | "getById";
  cause: unknown;
}> {}

export class ConversationStateError extends Data.TaggedError("ConversationStateError")<{
  requestId?: string;
  operation: "put" | "get" | "delete";
  cause: unknown;
}> {}

export class ChannelSendError extends Data.TaggedError("ChannelSendError")<{
  requestId?: string;
  cause: unknown;
}> {}

export class ChannelPolicyError extends Data.TaggedError("ChannelPolicyError")<{
  requestId?: string;
  operation: "isEnabled";
  cause: unknown;
}> {}

export class ChannelDisabledError extends Data.TaggedError("ChannelDisabledError")<{
  requestId?: string;
  customerId: string;
  channelId: string;
}> {}

export class WebhookVerificationError extends Data.TaggedError("WebhookVerificationError")<{
  requestId?: string;
  cause: unknown;
}> {}

export class WebhookParseError extends Data.TaggedError("WebhookParseError")<{
  requestId?: string;
  cause: unknown;
}> {}

export class InvalidTransactionError extends Data.TaggedError("InvalidTransactionError")<{
  requestId?: string;
}> {}

export type AppError =
  | MissingDefaultUserError
  | EmailParseFailedError
  | AiExtractFailedError
  | AiMessageGenerationError
  | CategoryClassificationError
  | ExpensePersistenceError
  | CategoryLookupError
  | ConversationStateError
  | ChannelSendError
  | ChannelPolicyError
  | ChannelDisabledError
  | WebhookVerificationError
  | WebhookParseError
  | InvalidTransactionError;
