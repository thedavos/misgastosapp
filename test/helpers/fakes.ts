import type { WorkerEnv } from "types/env";

type ExpenseRow = {
  id: string;
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

type CategoryRow = { id: string; name: string; slug: string };

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

function createMemoryD1Database(seedCategories: CategoryRow[] = []) {
  const expenses = new Map<string, ExpenseRow>();
  const categories = new Map<string, CategoryRow>();
  const expenseEvents: Array<{ id: string; expense_id: string; type: string; payload_json: string; created_at: string }> = [];

  for (const category of seedCategories) {
    categories.set(category.id, category);
  }

  function bindQuery(sql: string, values: unknown[]) {
    const query = sql.replace(/\s+/g, " ").trim().toLowerCase();

    return {
      async run() {
        if (query.startsWith("insert into expenses")) {
          const [id, amount, currency, merchant, occurredAt, bank, rawText, status, createdAt, updatedAt] =
            values as [string, number, string, string, string, string, string, string, string, string];
          expenses.set(id, {
            id,
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
          const [status, categoryId, updatedAt, id] = values as [string, string, string, string];
          const current = expenses.get(id);
          if (!current) return { success: false };
          expenses.set(id, {
            ...current,
            status,
            category_id: categoryId,
            updated_at: updatedAt,
          });
          return { success: true };
        }

        if (query.startsWith("insert into expense_events")) {
          const [id, expenseId, type, payloadJson, createdAt] = values as [string, string, string, string, string];
          expenseEvents.push({
            id,
            expense_id: expenseId,
            type,
            payload_json: payloadJson,
            created_at: createdAt,
          });
          return { success: true };
        }

        return { success: true };
      },

      async first<T>() {
        if (query.includes("from expenses where id = ?")) {
          const [id] = values as [string];
          return (expenses.get(id) as T | undefined) ?? null;
        }

        if (query.includes("from categories where lower(name) = ?")) {
          const [name] = values as [string];
          const found = Array.from(categories.values()).find((category) => category.name.toLowerCase() === name);
          return (found as T | undefined) ?? null;
        }

        if (query.includes("from categories where id = ?")) {
          const [id] = values as [string];
          return (categories.get(id) as T | undefined) ?? null;
        }

        return null;
      },

      async all<T>() {
        if (query.includes("from categories")) {
          return { results: Array.from(categories.values()) as T[] };
        }

        return { results: [] as T[] };
      },
    };
  }

  return {
    __state: {
      expenses,
      categories,
      expenseEvents,
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
      expenseEvents: Array<{ id: string; expense_id: string; type: string; payload_json: string; created_at: string }>;
    };
  };
}

export function createTestEnv(options?: {
  aiRun?: (model: string, params: Record<string, unknown>) => Promise<unknown>;
  categories?: CategoryRow[];
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

  const db = createMemoryD1Database(options?.categories ?? [
    { id: "cat_food", name: "Comida", slug: "comida" },
    { id: "cat_transport", name: "Transporte", slug: "transporte" },
  ]);

  return {
    TELEGRAM_BOT_TOKEN: "token",
    TELEGRAM_CHAT_ID: "51999999999",
    EMAIL_WORKER_SECRET: "secret",
    CLOUDFLARE_AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    DB: db,
    REPORTS: {} as R2Bucket,
    AI: {
      run: options?.aiRun ?? defaultAiRun,
    } as unknown as Ai,
    PROMPTS_KV: promptsKv,
    CONVERSATION_STATE_KV: createMemoryKvNamespace(),
    ENVIRONMENT: "test",
    SENTRY_DSN: "https://test@sentry.io/123",
    KAPSO_API_BASE_URL: undefined,
    KAPSO_API_KEY: undefined,
    DEFAULT_EXPENSE_USER_ID: "51999999999",
  } as unknown as WorkerEnv;
}
