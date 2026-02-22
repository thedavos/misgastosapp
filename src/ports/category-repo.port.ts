import type { Category } from "@/domain/category/entity";

export interface CategoryRepoPort {
  listAll(): Promise<Category[]>;
  getByName(name: string): Promise<Category | null>;
  getById(id: string): Promise<Category | null>;
}
