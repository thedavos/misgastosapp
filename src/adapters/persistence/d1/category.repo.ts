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
    async listAll(): Promise<Category[]> {
      const rows = await env.DB.prepare(`SELECT id, name, slug FROM categories ORDER BY name ASC`).all<CategoryRow>();
      if (!rows.results.length) return DEFAULT_CATEGORIES;
      return rows.results;
    },

    async getByName(name: string): Promise<Category | null> {
      const normalized = normalizeName(name);
      const row = await env.DB.prepare(`SELECT id, name, slug FROM categories WHERE lower(name) = ? LIMIT 1`)
        .bind(normalized)
        .first<CategoryRow>();

      if (row) return row;
      return DEFAULT_CATEGORIES.find((category) => normalizeName(category.name) === normalized) ?? null;
    },

    async getById(id: string): Promise<Category | null> {
      const row = await env.DB.prepare(`SELECT id, name, slug FROM categories WHERE id = ? LIMIT 1`)
        .bind(id)
        .first<CategoryRow>();

      if (row) return row;
      return DEFAULT_CATEGORIES.find((category) => category.id === id) ?? null;
    },
  };
}
