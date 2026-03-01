import { Data } from "effect";

export class MissingDefaultUserError extends Data.TaggedError("MissingDefaultUserError")<{
  requestId?: string;
  message: string;
}> {}

export class CustomerUnresolvedError extends Data.TaggedError("CustomerUnresolvedError")<{
  requestId?: string;
  recipientEmail: string;
}> {}

export class CustomerRouteNotFoundError extends Data.TaggedError("CustomerRouteNotFoundError")<{
  requestId?: string;
  recipientEmail: string;
}> {}

export class CustomerRouteLookupError extends Data.TaggedError("CustomerRouteLookupError")<{
  requestId?: string;
  recipientEmail: string;
  cause: unknown;
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

export class ChannelSettingMissingError extends Data.TaggedError("ChannelSettingMissingError")<{
  requestId?: string;
  customerId: string;
  channelId: string;
}> {}

export class FeaturePolicyError extends Data.TaggedError("FeaturePolicyError")<{
  requestId?: string;
  featureKey: string;
  cause: unknown;
}> {}

export class SubscriptionFeatureBlockedError extends Data.TaggedError("SubscriptionFeatureBlockedError")<{
  requestId?: string;
  customerId: string;
  featureKey: string;
}> {}

export class WebhookVerificationError extends Data.TaggedError("WebhookVerificationError")<{
  requestId?: string;
  cause: unknown;
}> {}

export class WebhookParseError extends Data.TaggedError("WebhookParseError")<{
  requestId?: string;
  cause: unknown;
}> {}

export class WebhookIdempotencyError extends Data.TaggedError("WebhookIdempotencyError")<{
  requestId?: string;
  operation: "tryStartProcessing" | "markProcessed" | "markFailed" | "cleanupOld";
  cause: unknown;
}> {}

export class OcrExtractionError extends Data.TaggedError("OcrExtractionError")<{
  requestId?: string;
  cause: unknown;
}> {}

export class ChatMediaPersistenceError extends Data.TaggedError("ChatMediaPersistenceError")<{
  requestId?: string;
  operation: "create" | "linkExpense" | "listByExpenseId" | "deleteExpired";
  cause: unknown;
}> {}

export class InvalidTransactionError extends Data.TaggedError("InvalidTransactionError")<{
  requestId?: string;
}> {}

export type AppError =
  | MissingDefaultUserError
  | CustomerUnresolvedError
  | CustomerRouteNotFoundError
  | CustomerRouteLookupError
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
  | ChannelSettingMissingError
  | FeaturePolicyError
  | SubscriptionFeatureBlockedError
  | WebhookVerificationError
  | WebhookParseError
  | WebhookIdempotencyError
  | OcrExtractionError
  | ChatMediaPersistenceError
  | InvalidTransactionError;
