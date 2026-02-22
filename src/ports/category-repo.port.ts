import type { Category } from "@/domain/category/entity";

export interface CategoryRepoPort {
  listAll(input: { customerId: string }): Promise<Category[]>;
  getByName(input: { customerId: string; name: string }): Promise<Category | null>;
  getById(input: { customerId: string; id: string }): Promise<Category | null>;
}
