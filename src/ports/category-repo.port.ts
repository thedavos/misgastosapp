import type { Category } from "@/domain/category/entity";

export interface CategoryRepoPort {
  listAll(input: { userId: string }): Promise<Category[]>;
  getByName(input: { userId: string; name: string }): Promise<Category | null>;
  getById(input: { userId: string; id: string }): Promise<Category | null>;
}
