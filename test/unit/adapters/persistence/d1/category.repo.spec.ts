import { describe, expect, it } from "vitest";
import { createD1CategoryRepo } from "@/adapters/persistence/d1/category.repo";
import { FALLBACK_CATEGORY } from "@/domain/category/defaults";

function createCategoryDbStub() {
  return {
    prepare(sql: string) {
      const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
      return {
        bind(..._values: unknown[]) {
          return {
            async all() {
              return { results: [] };
            },
            async first() {
              if (query.includes("from categories_v2")) return null;
              return null;
            },
          };
        },
      };
    },
  } as D1Database;
}

describe("category defaults and fallback", () => {
  it("lists default categories including Otros when DB is empty", async () => {
    const repo = createD1CategoryRepo({ DB: createCategoryDbStub() } as never);
    const categories = await repo.listAll({ userId: "cust_1" });
    expect(categories.some((category) => category.id === FALLBACK_CATEGORY.id)).toBe(true);
    expect(categories.some((category) => category.name === "Otros")).toBe(true);
  });

  it("resolves unknown category ids to Otros", async () => {
    const repo = createD1CategoryRepo({ DB: createCategoryDbStub() } as never);
    const resolved = await repo.resolveOrFallback({
      userId: "cust_1",
      categoryId: "cat_unknown_xyz",
    });
    expect(resolved).toEqual(FALLBACK_CATEGORY);
  });

  it("resolves known default category ids without falling back", async () => {
    const repo = createD1CategoryRepo({ DB: createCategoryDbStub() } as never);
    const resolved = await repo.resolveOrFallback({
      userId: "cust_1",
      categoryId: "cat_food",
    });
    expect(resolved).toEqual({ id: "cat_food", name: "Comida", slug: "comida" });
  });
});
