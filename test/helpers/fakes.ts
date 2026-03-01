import type { WorkerEnv } from "types/env";

type ExpenseRow = {
  id: string;
  customer_id: string;
  amount: number;
  currency: string;
  merchant: string;
  occurred_at: string;
  bank: string;
  raw_text: string;
  status: string;
  category_id: string | null;
  created_at: string;
  updated_at: string;
};

type CategoryRow = { id: string; customer_id: string | null; name: string; slug: string };

type CustomerRow = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  default_currency: string;
  timezone: string;
  locale: string;
  confidence_threshold: number;
};

type CustomerChannelRow = {
  id: string;
  customer_id: string;
  channel: string;
  external_user_id: string;
  is_primary: number;
};

type ChannelRow = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

type CustomerChannelSettingRow = {
  id: string;
  customer_id: string;
  channel_id: string;
  enabled: number;
  is_primary: number;
  config_json: string | null;
};

type CustomerEmailRouteRow = {
  id: string;
  customer_id: string;
  recipient_email: string;
  enabled: number;
};

type PlanRow = {
  id: string;
  name: string;
  price_amount: number;
  price_currency: string;
  billing_interval: "monthly" | "yearly" | "none";
  status: "ACTIVE" | "INACTIVE";
  version: number;
};

type PlanFeatureRow = {
  id: string;
  plan_id: string;
  feature_key: string;
  feature_type: "boolean" | "limit";
  bool_value: number | null;
  limit_value: number | null;
};

type CustomerSubscriptionRow = {
  id: string;
  customer_id: string;
  plan_id: string;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  start_at: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: number;
  provider: string;
  provider_subscription_id: string | null;
  plan_version_at_start: number;
  metadata_json: string | null;
};

type InboundWebhookEventRow = {
  id: string;
  provider: string;
  event_id: string;
  status: "PROCESSING" | "PROCESSED" | "FAILED";
  payload_hash: string;
  request_id: string | null;
  attempt_count: number;
  first_seen_at: string;
  last_seen_at: string;
  processed_at: string | null;
  last_error: string | null;
};

type ChatMediaRow = {
  id: string;
  customer_id: string;
  channel: string;
  external_user_id: string;
  provider_event_id: string;
  expense_id: string | null;
  r2_key: string;
  mime_type: string | null;
  size_bytes: number;
  sha256: string;
  ocr_text: string | null;
  created_at: string;
  expires_at: string;
};

function createMemoryKvNamespace() {
  const store = new Map<string, string>();

  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

function createMemoryR2Bucket() {
  const objects = new Map<
    string,
    {
      body: Uint8Array;
      httpMetadata?: Record<string, unknown>;
    }
  >();

  return {
    async put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string, options?: object) {
      let body: Uint8Array;
      if (typeof value === "string") {
        body = new TextEncoder().encode(value);
      } else if (value instanceof ArrayBuffer) {
        body = new Uint8Array(value);
      } else if (ArrayBuffer.isView(value)) {
        body = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      } else {
        body = new Uint8Array();
      }

      objects.set(key, {
        body,
        httpMetadata: options as Record<string, unknown> | undefined,
      });
    },
    async get(key: string) {
      return objects.get(key) ?? null;
    },
    async delete(key: string) {
      objects.delete(key);
    },
    __state: {
      objects,
    },
  } as unknown as R2Bucket & {
    __state: {
      objects: Map<string, { body: Uint8Array; httpMetadata?: Record<string, unknown> }>;
    };
  };
}

function createMemoryD1Database(options?: {
  customers?: CustomerRow[];
  categories?: CategoryRow[];
  channels?: ChannelRow[];
  channelSettings?: CustomerChannelSettingRow[];
  plans?: PlanRow[];
  planFeatures?: PlanFeatureRow[];
  subscriptions?: CustomerSubscriptionRow[];
  emailRoutes?: CustomerEmailRouteRow[];
}) {
  const expenses = new Map<string, ExpenseRow>();
  const categories = new Map<string, CategoryRow>();
  const customers = new Map<string, CustomerRow>();
  const customerChannels = new Map<string, CustomerChannelRow>();
  const channels = new Map<string, ChannelRow>();
  const channelSettings = new Map<string, CustomerChannelSettingRow>();
  const plans = new Map<string, PlanRow>();
  const planFeatures = new Map<string, PlanFeatureRow>();
  const subscriptions = new Map<string, CustomerSubscriptionRow>();
  const emailRoutes = new Map<string, CustomerEmailRouteRow>();
  const inboundWebhookEvents = new Map<string, InboundWebhookEventRow>();
  const chatMedia = new Map<string, ChatMediaRow>();
  const expenseEvents: Array<{
    id: string;
    customer_id: string | null;
    expense_id: string;
    type: string;
    payload_json: string;
    created_at: string;
  }> = [];

  const defaultCustomers: CustomerRow[] = [
    {
      id: "cust_default",
      name: "Default Customer",
      status: "ACTIVE",
      default_currency: "PEN",
      timezone: "America/Lima",
      locale: "es-PE",
      confidence_threshold: 0.75,
    },
  ];
  for (const customer of options?.customers ?? defaultCustomers) {
    customers.set(customer.id, customer);
  }

  customerChannels.set("whatsapp:51999999999", {
    id: "custch_default_whatsapp",
    customer_id: "cust_default",
    channel: "whatsapp",
    external_user_id: "51999999999",
    is_primary: 1,
  });

  const defaultEmailRoutes: CustomerEmailRouteRow[] = [
    {
      id: "cer_default_email",
      customer_id: "cust_default",
      recipient_email: "davidvargas.d45@gmail.com",
      enabled: 1,
    },
  ];

  for (const route of options?.emailRoutes ?? defaultEmailRoutes) {
    emailRoutes.set(route.recipient_email, route);
  }

  const defaultChannels: ChannelRow[] = [
    { id: "whatsapp", name: "WhatsApp", status: "ACTIVE" },
    { id: "telegram", name: "Telegram", status: "ACTIVE" },
    { id: "instagram", name: "Instagram", status: "INACTIVE" },
  ];

  for (const channel of options?.channels ?? defaultChannels) {
    channels.set(channel.id, channel);
  }

  const defaultSettings: CustomerChannelSettingRow[] = [
    {
      id: "ccs_cust_default_whatsapp",
      customer_id: "cust_default",
      channel_id: "whatsapp",
      enabled: 1,
      is_primary: 1,
      config_json: null,
    },
  ];

  for (const setting of options?.channelSettings ?? defaultSettings) {
    channelSettings.set(`${setting.customer_id}:${setting.channel_id}`, setting);
  }

  const defaultCategories: CategoryRow[] = [
    { id: "cat_food", customer_id: null, name: "Comida", slug: "comida" },
    { id: "cat_transport", customer_id: null, name: "Transporte", slug: "transporte" },
  ];

  for (const category of options?.categories ?? defaultCategories) {
    categories.set(category.id, category);
  }

  const defaultPlans: PlanRow[] = [
    {
      id: "free",
      name: "Free",
      price_amount: 0,
      price_currency: "PEN",
      billing_interval: "none",
      status: "ACTIVE",
      version: 1,
    },
    {
      id: "pro",
      name: "Pro",
      price_amount: 1990,
      price_currency: "PEN",
      billing_interval: "monthly",
      status: "ACTIVE",
      version: 1,
    },
  ];

  for (const plan of options?.plans ?? defaultPlans) {
    plans.set(plan.id, plan);
  }

  const defaultPlanFeatures: PlanFeatureRow[] = [
    {
      id: "pf_free_whatsapp",
      plan_id: "free",
      feature_key: "channels.whatsapp",
      feature_type: "boolean",
      bool_value: 1,
      limit_value: null,
    },
    {
      id: "pf_free_telegram",
      plan_id: "free",
      feature_key: "channels.telegram",
      feature_type: "boolean",
      bool_value: 0,
      limit_value: null,
    },
    {
      id: "pf_free_instagram",
      plan_id: "free",
      feature_key: "channels.instagram",
      feature_type: "boolean",
      bool_value: 0,
      limit_value: null,
    },
    {
      id: "pf_pro_whatsapp",
      plan_id: "pro",
      feature_key: "channels.whatsapp",
      feature_type: "boolean",
      bool_value: 1,
      limit_value: null,
    },
    {
      id: "pf_pro_telegram",
      plan_id: "pro",
      feature_key: "channels.telegram",
      feature_type: "boolean",
      bool_value: 1,
      limit_value: null,
    },
    {
      id: "pf_pro_instagram",
      plan_id: "pro",
      feature_key: "channels.instagram",
      feature_type: "boolean",
      bool_value: 1,
      limit_value: null,
    },
  ];

  for (const feature of options?.planFeatures ?? defaultPlanFeatures) {
    planFeatures.set(`${feature.plan_id}:${feature.feature_key}`, feature);
  }

  const defaultSubscriptions: CustomerSubscriptionRow[] = [
    {
      id: "sub_cust_default_free",
      customer_id: "cust_default",
      plan_id: "free",
      status: "ACTIVE",
      start_at: "2026-01-01T00:00:00.000Z",
      current_period_start: "2026-01-01T00:00:00.000Z",
      current_period_end: "9999-12-31T23:59:59.000Z",
      cancel_at_period_end: 0,
      provider: "manual",
      provider_subscription_id: null,
      plan_version_at_start: 1,
      metadata_json: null,
    },
  ];

  for (const subscription of options?.subscriptions ?? defaultSubscriptions) {
    subscriptions.set(subscription.id, subscription);
  }

  function bindQuery(sql: string, values: unknown[]) {
    const query = sql.replace(/\s+/g, " ").trim().toLowerCase();

    return {
      async run() {
        if (query.startsWith("insert into expenses")) {
          const [id, customerId, amount, currency, merchant, occurredAt, bank, rawText, status, createdAt, updatedAt] =
            values as [string, string, number, string, string, string, string, string, string, string, string];
          expenses.set(id, {
            id,
            customer_id: customerId,
            amount,
            currency,
            merchant,
            occurred_at: occurredAt,
            bank,
            raw_text: rawText,
            status,
            category_id: null,
            created_at: createdAt,
            updated_at: updatedAt,
          });
          return { success: true };
        }

        if (query.startsWith("update expenses set status = ?")) {
          const [status, categoryId, updatedAt, id, customerId] = values as [string, string, string, string, string];
          const current = expenses.get(id);
          if (!current || current.customer_id !== customerId) return { success: false };
          expenses.set(id, {
            ...current,
            status,
            category_id: categoryId,
            updated_at: updatedAt,
          });
          return { success: true };
        }

        if (query.startsWith("insert into expense_events")) {
          const [id, customerId, expenseId, type, payloadJson, createdAt] = values as [
            string,
            string,
            string,
            string,
            string,
            string,
          ];
          expenseEvents.push({
            id,
            customer_id: customerId,
            expense_id: expenseId,
            type,
            payload_json: payloadJson,
            created_at: createdAt,
          });
          return { success: true };
        }

        if (query.startsWith("insert into inbound_webhook_events")) {
          const [id, provider, eventId, payloadHash, requestId, firstSeenAt, lastSeenAt] = values as [
            string,
            string,
            string,
            string,
            string | null,
            string,
            string,
          ];

          const key = `${provider}:${eventId}`;
          if (inboundWebhookEvents.has(key)) {
            throw new Error("UNIQUE constraint failed: inbound_webhook_events.provider, inbound_webhook_events.event_id");
          }

          inboundWebhookEvents.set(key, {
            id,
            provider,
            event_id: eventId,
            status: "PROCESSING",
            payload_hash: payloadHash,
            request_id: requestId,
            attempt_count: 1,
            first_seen_at: firstSeenAt,
            last_seen_at: lastSeenAt,
            processed_at: null,
            last_error: null,
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (query.startsWith("insert into chat_media")) {
          const [
            id,
            customerId,
            channel,
            externalUserId,
            providerEventId,
            expenseId,
            r2Key,
            mimeType,
            sizeBytes,
            sha256,
            ocrText,
            createdAt,
            expiresAt,
          ] = values as [
            string,
            string,
            string,
            string,
            string,
            string | null,
            string,
            string | null,
            number,
            string,
            string | null,
            string,
            string,
          ];

          chatMedia.set(id, {
            id,
            customer_id: customerId,
            channel,
            external_user_id: externalUserId,
            provider_event_id: providerEventId,
            expense_id: expenseId,
            r2_key: r2Key,
            mime_type: mimeType,
            size_bytes: sizeBytes,
            sha256,
            ocr_text: ocrText,
            created_at: createdAt,
            expires_at: expiresAt,
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (query.startsWith("insert or replace into customer_channels")) {
          const [id, customerId, channel, externalUserId, isPrimary] = values as [
            string,
            string,
            string,
            string,
            number,
            string,
            string,
          ];
          customerChannels.set(`${channel}:${externalUserId}`, {
            id,
            customer_id: customerId,
            channel,
            external_user_id: externalUserId,
            is_primary: isPrimary,
          });
          return { success: true };
        }

        if (query.startsWith("update inbound_webhook_events set last_seen_at = ?")) {
          const [lastSeenAt, requestId, provider, eventId] = values as [string, string | null, string, string];
          const key = `${provider}:${eventId}`;
          const current = inboundWebhookEvents.get(key);
          if (!current) return { success: true, meta: { changes: 0 } };
          inboundWebhookEvents.set(key, {
            ...current,
            last_seen_at: lastSeenAt,
            request_id: requestId,
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (query.startsWith("update inbound_webhook_events set status = 'processing'")) {
          const [payloadHash, requestId, lastSeenAt, provider, eventId] = values as [
            string,
            string | null,
            string,
            string,
            string,
          ];
          const key = `${provider}:${eventId}`;
          const current = inboundWebhookEvents.get(key);
          if (!current || current.status !== "FAILED") return { success: true, meta: { changes: 0 } };
          inboundWebhookEvents.set(key, {
            ...current,
            status: "PROCESSING",
            payload_hash: payloadHash,
            request_id: requestId,
            attempt_count: current.attempt_count + 1,
            last_seen_at: lastSeenAt,
            last_error: null,
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (query.startsWith("update inbound_webhook_events set status = 'processed'")) {
          const [lastSeenAt, processedAt, provider, eventId] = values as [string, string, string, string];
          const key = `${provider}:${eventId}`;
          const current = inboundWebhookEvents.get(key);
          if (!current) return { success: true, meta: { changes: 0 } };
          inboundWebhookEvents.set(key, {
            ...current,
            status: "PROCESSED",
            last_seen_at: lastSeenAt,
            processed_at: processedAt,
            last_error: null,
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (query.startsWith("update inbound_webhook_events set status = 'failed'")) {
          const [lastSeenAt, lastError, provider, eventId] = values as [string, string, string, string];
          const key = `${provider}:${eventId}`;
          const current = inboundWebhookEvents.get(key);
          if (!current) return { success: true, meta: { changes: 0 } };
          inboundWebhookEvents.set(key, {
            ...current,
            status: "FAILED",
            last_seen_at: lastSeenAt,
            last_error: lastError,
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (query.startsWith("delete from inbound_webhook_events")) {
          const [provider, threshold] = values as [string, string];
          let changes = 0;
          for (const [key, row] of inboundWebhookEvents.entries()) {
            if (row.provider === provider && row.last_seen_at < threshold) {
              inboundWebhookEvents.delete(key);
              changes++;
            }
          }
          return { success: true, meta: { changes } };
        }

        if (query.startsWith("update chat_media set expense_id = ?")) {
          const [expenseId, mediaId] = values as [string, string];
          const current = chatMedia.get(mediaId);
          if (!current) return { success: true, meta: { changes: 0 } };
          chatMedia.set(mediaId, {
            ...current,
            expense_id: expenseId,
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (query.startsWith("delete from chat_media")) {
          const [nowIso, limit] = values as [string, number];
          const candidates = Array.from(chatMedia.values())
            .filter((row) => row.expires_at < nowIso)
            .slice(0, limit);
          for (const row of candidates) {
            chatMedia.delete(row.id);
          }
          return { success: true, meta: { changes: candidates.length } };
        }

        return { success: true };
      },

      async first<T>() {
        if (query.includes("from expenses where id = ? and customer_id = ?")) {
          const [id, customerId] = values as [string, string];
          const row = expenses.get(id);
          if (!row || row.customer_id !== customerId) return null;
          return row as T;
        }

        if (query.includes("from categories where lower(name) = ?")) {
          const [name, customerId] = values as [string, string];
          const found = Array.from(categories.values()).find(
            (category) =>
              category.name.toLowerCase() === name && (category.customer_id === customerId || category.customer_id === null),
          );
          return (found as T | undefined) ?? null;
        }

        if (query.includes("from categories where id = ? and (customer_id = ? or customer_id is null)")) {
          const [id, customerId] = values as [string, string];
          const category = categories.get(id);
          if (!category) return null;
          if (category.customer_id !== customerId && category.customer_id !== null) return null;
          return category as T;
        }

        if (query.includes("from customers where id = ?")) {
          const [id] = values as [string];
          return (customers.get(id) as T | undefined) ?? null;
        }

        if (query.includes("from customer_channels cc join customers c")) {
          const [channel, externalUserId] = values as [string, string];
          const channelRow = customerChannels.get(`${channel}:${externalUserId}`);
          if (!channelRow) return null;
          const customer = customers.get(channelRow.customer_id);
          return (customer as T | undefined) ?? null;
        }

        if (query.includes("from customer_channels where channel = ? and external_user_id = ?")) {
          const [channel, externalUserId] = values as [string, string];
          return (customerChannels.get(`${channel}:${externalUserId}`) as T | undefined) ?? null;
        }

        if (query.includes("from customer_channels") && query.includes("where customer_id = ? and channel = ? and is_primary = 1")) {
          const [customerId, channel] = values as [string, string];
          const match = Array.from(customerChannels.values()).find(
            (row) => row.customer_id === customerId && row.channel === channel && row.is_primary === 1,
          );
          if (!match) return null;
          return { external_user_id: match.external_user_id } as T;
        }

        if (query.includes("from channels") && query.includes("where id = ?")) {
          const [channelId] = values as [string];
          return (channels.get(channelId) as T | undefined) ?? null;
        }

        if (query.includes("from customer_channel_settings") && query.includes("where customer_id = ? and channel_id = ?")) {
          const [customerId, channelId] = values as [string, string];
          return (channelSettings.get(`${customerId}:${channelId}`) as T | undefined) ?? null;
        }

        if (query.includes("from customer_email_routes") && query.includes("where recipient_email = ? and enabled = 1")) {
          const [recipientEmail] = values as [string];
          const route = emailRoutes.get(recipientEmail);
          if (!route || route.enabled !== 1) return null;
          return { customer_id: route.customer_id } as T;
        }

        if (query.includes("from customer_subscriptions") && query.includes("where customer_id = ?") && query.includes("status in")) {
          const [customerId] = values as [string];
          const validStatuses = new Set(["TRIALING", "ACTIVE", "PAST_DUE"]);
          const candidate = Array.from(subscriptions.values())
            .filter((subscription) => subscription.customer_id === customerId && validStatuses.has(subscription.status))
            .sort((a, b) => {
              const rank = (s: string) => (s === "ACTIVE" ? 0 : s === "TRIALING" ? 1 : 2);
              const rankDiff = rank(a.status) - rank(b.status);
              if (rankDiff !== 0) return rankDiff;
              return b.current_period_end.localeCompare(a.current_period_end);
            })[0];
          return (candidate as T | undefined) ?? null;
        }

        if (query.includes("from plans") && query.includes("where id = ?")) {
          const [planId] = values as [string];
          return (plans.get(planId) as T | undefined) ?? null;
        }

        if (query.includes("from plan_features") && query.includes("where plan_id = ? and feature_key = ?")) {
          const [planId, featureKey] = values as [string, string];
          return (planFeatures.get(`${planId}:${featureKey}`) as T | undefined) ?? null;
        }

        if (query.includes("from inbound_webhook_events") && query.includes("where provider = ? and event_id = ?")) {
          const [provider, eventId] = values as [string, string];
          return (inboundWebhookEvents.get(`${provider}:${eventId}`) as T | undefined) ?? null;
        }

        return null;
      },

      async all<T>() {
        if (query.includes("from categories")) {
          if (values.length === 1) {
            const [customerId] = values as [string];
            return {
              results: Array.from(categories.values()).filter(
                (category) => category.customer_id === customerId || category.customer_id === null,
              ) as T[],
            };
          }

          return { results: Array.from(categories.values()) as T[] };
        }

        if (query.includes("from chat_media") && query.includes("where customer_id = ? and expense_id = ?")) {
          const [customerId, expenseId] = values as [string, string];
          return {
            results: Array.from(chatMedia.values()).filter(
              (row) => row.customer_id === customerId && row.expense_id === expenseId,
            ) as T[],
          };
        }

        if (query.includes("from chat_media") && query.includes("where expires_at < ?")) {
          const [nowIso, limit] = values as [string, number];
          return {
            results: Array.from(chatMedia.values())
              .filter((row) => row.expires_at < nowIso)
              .slice(0, limit)
              .map((row) => ({ id: row.id, r2_key: row.r2_key })) as T[],
          };
        }

        return { results: [] as T[] };
      },
    };
  }

  return {
    __state: {
      expenses,
      categories,
      customers,
      customerChannels,
      channels,
      channelSettings,
      plans,
      planFeatures,
      subscriptions,
      emailRoutes,
      expenseEvents,
      inboundWebhookEvents,
      chatMedia,
    },
    prepare(sql: string) {
      const query = sql.replace(/\s+/g, " ").trim().toLowerCase();

      return {
        async all<T>() {
          if (query.includes("from categories")) {
            return { results: Array.from(categories.values()) as T[] };
          }
          return { results: [] as T[] };
        },
        async first<T>() {
          return bindQuery(sql, []).first<T>();
        },
        bind(...values: unknown[]) {
          return bindQuery(sql, values);
        },
      };
    },
  } as unknown as D1Database & {
    __state: {
      expenses: Map<string, ExpenseRow>;
      categories: Map<string, CategoryRow>;
      customers: Map<string, CustomerRow>;
      customerChannels: Map<string, CustomerChannelRow>;
      channels: Map<string, ChannelRow>;
      channelSettings: Map<string, CustomerChannelSettingRow>;
      plans: Map<string, PlanRow>;
      planFeatures: Map<string, PlanFeatureRow>;
      subscriptions: Map<string, CustomerSubscriptionRow>;
      emailRoutes: Map<string, CustomerEmailRouteRow>;
      expenseEvents: Array<{
        id: string;
        customer_id: string | null;
        expense_id: string;
        type: string;
        payload_json: string;
        created_at: string;
      }>;
      inboundWebhookEvents: Map<string, InboundWebhookEventRow>;
      chatMedia: Map<string, ChatMediaRow>;
    };
  };
}

export function createTestEnv(options?: {
  aiRun?: (model: string, params: Record<string, unknown>) => Promise<unknown>;
  customers?: CustomerRow[];
  categories?: CategoryRow[];
  channels?: ChannelRow[];
  channelSettings?: CustomerChannelSettingRow[];
  plans?: PlanRow[];
  planFeatures?: PlanFeatureRow[];
  subscriptions?: CustomerSubscriptionRow[];
  emailRoutes?: CustomerEmailRouteRow[];
  strictPolicyMode?: "true" | "false";
  kapsoWebhookSecret?: string;
  kapsoWebhookSignatureMode?: "dual" | "strict";
  kapsoWebhookMaxSkewSeconds?: string;
  chatMediaRetentionDays?: string;
}): WorkerEnv {
  const promptsKv = createMemoryKvNamespace();
  void promptsKv.put("SYSTEM_PROMPT", "Extrae transacciones con precision");

  const defaultAiRun = async (_model: string, params: Record<string, unknown>) => {
    const messages = Array.isArray(params.messages)
      ? (params.messages as Array<{ role?: string; content?: string }>)
      : [];
    const userPrompt = messages.map((m) => m.content ?? "").join("\n");

    if (userPrompt.includes("Extrae la información de la transacción")) {
      return {
        response: {
          amount: 50,
          currency: "PEN",
          merchant: "Tambo",
          date: "2026-02-20T10:00:00.000Z",
          bank: "BCP",
          rawText: "consumo en tambo",
        },
      };
    }

    if (userPrompt.includes("Clasifica la respuesta del usuario")) {
      return {
        response: {
          categoryId: "cat_food",
          confidence: 0.9,
        },
      };
    }

    return { response: "Listo" };
  };

  const db = createMemoryD1Database({
    customers: options?.customers,
    categories: options?.categories,
    channels: options?.channels,
    channelSettings: options?.channelSettings,
    plans: options?.plans,
    planFeatures: options?.planFeatures,
    subscriptions: options?.subscriptions,
    emailRoutes: options?.emailRoutes,
  });
  const reports = createMemoryR2Bucket();

  return {
    TELEGRAM_BOT_TOKEN: "token",
    TELEGRAM_CHAT_ID: "51999999999",
    TELEGRAM_WEBHOOK_SECRET: "tg-secret",
    CLOUDFLARE_AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    CLOUDFLARE_OCR_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    DB: db,
    REPORTS: reports,
    AI: {
      run: options?.aiRun ?? defaultAiRun,
    } as unknown as Ai,
    PROMPTS_KV: promptsKv,
    CONVERSATION_STATE_KV: createMemoryKvNamespace(),
    ENTITLEMENTS_KV: createMemoryKvNamespace(),
    ENVIRONMENT: "test",
    SENTRY_DSN: "https://test@sentry.io/123",
    KAPSO_API_BASE_URL: undefined,
    KAPSO_API_KEY: undefined,
    KAPSO_WEBHOOK_SECRET: options?.kapsoWebhookSecret,
    KAPSO_WEBHOOK_SIGNATURE_MODE: options?.kapsoWebhookSignatureMode ?? "dual",
    KAPSO_WEBHOOK_MAX_SKEW_SECONDS: options?.kapsoWebhookMaxSkewSeconds ?? "300",
    CHAT_MEDIA_RETENTION_DAYS: options?.chatMediaRetentionDays ?? "90",
    DEFAULT_CUSTOMER_ID: "cust_default",
    STRICT_POLICY_MODE: options?.strictPolicyMode ?? "true",
  } as unknown as WorkerEnv;
}
