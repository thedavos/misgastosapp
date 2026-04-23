import type { WorkerEnv } from "types/env";
import type { Category } from "@/domain/category/entity";
import type { CategoryRepoPort } from "@/ports/category-repo.port";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
};

const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat_food", name: "Comida", slug: "comida" },
  { id: "cat_transport", name: "Transporte", slug: "transporte" },
  { id: "cat_shopping", name: "Compras", slug: "compras" },
  { id: "cat_services", name: "Servicios", slug: "servicios" },
];

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function createD1CategoryRepo(env: WorkerEnv): CategoryRepoPort {
  return {
    async listAll(input: { userId: string }): Promise<Category[]> {
      const rows = await env.DB.prepare(
        `SELECT id, name, slug FROM categories_v2
         WHERE user_id = ? OR user_id IS NULL
         ORDER BY name ASC`,
      )
        .bind(input.userId)
        .all<CategoryRow>();

      if (!rows.results.length) return DEFAULT_CATEGORIES;
      return rows.results;
    },

    async getByName(input: { userId: string; name: string }): Promise<Category | null> {
      const normalized = normalizeName(input.name);
      const row = await env.DB.prepare(
        `SELECT id, name, slug FROM categories_v2
         WHERE lower(name) = ? AND (user_id = ? OR user_id IS NULL)
         ORDER BY user_id IS NULL ASC
         LIMIT 1`,
      )
        .bind(normalized, input.userId)
        .first<CategoryRow>();

      if (row) return row;
      return (
        DEFAULT_CATEGORIES.find((category) => normalizeName(category.name) === normalized) ?? null
      );
    },

    async getById(input: { userId: string; id: string }): Promise<Category | null> {
      const row = await env.DB.prepare(
        `SELECT id, name, slug FROM categories_v2
         WHERE id = ? AND (user_id = ? OR user_id IS NULL)
         ORDER BY user_id IS NULL ASC
         LIMIT 1`,
      )
        .bind(input.id, input.userId)
        .first<CategoryRow>();

      if (row) return row;
      return DEFAULT_CATEGORIES.find((category) => category.id === input.id) ?? null;
    },
  };
}
