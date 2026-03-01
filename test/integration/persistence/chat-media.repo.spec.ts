import { describe, expect, it } from "vitest";
import { createD1ChatMediaRepo } from "@/adapters/persistence/d1/chat-media.repo";
import { createTestEnv } from "test/helpers/fakes";

describe("d1 chat media repo integration", () => {
  it("creates media, links expense and lists by expense id", async () => {
    const env = createTestEnv();
    const repo = createD1ChatMediaRepo(env);
    const data = new TextEncoder().encode("fake-image-bytes");

    const created = await repo.create({
      customerId: "cust_default",
      channel: "whatsapp",
      externalUserId: "51999999999",
      providerEventId: "evt_media_1",
      expenseId: null,
      r2Key: "receipts/cust_default/whatsapp/2026/02/evt_media_1.jpg",
      mimeType: "image/jpeg",
      sizeBytes: data.byteLength,
      sha256: "abc123",
      ocrText: "S/ 50 TAMBO",
      createdAt: "2026-02-20T10:00:00.000Z",
      expiresAt: "2026-05-21T10:00:00.000Z",
      data,
    });

    expect(created.id).toBeTruthy();

    await repo.linkExpense({
      id: created.id,
      expenseId: "exp_1",
    });

    const list = await repo.listByExpenseId({
      customerId: "cust_default",
      expenseId: "exp_1",
    });

    expect(list).toHaveLength(1);
    expect(list[0]?.r2Key).toContain("receipts/cust_default/whatsapp");
  });

  it("deletes expired media rows and objects from R2", async () => {
    const env = createTestEnv();
    const repo = createD1ChatMediaRepo(env);
    const data = new TextEncoder().encode("old-image");

    await repo.create({
      customerId: "cust_default",
      channel: "whatsapp",
      externalUserId: "51999999999",
      providerEventId: "evt_media_old",
      expenseId: null,
      r2Key: "receipts/cust_default/whatsapp/2024/01/evt_media_old.jpg",
      mimeType: "image/jpeg",
      sizeBytes: data.byteLength,
      sha256: "old",
      ocrText: null,
      createdAt: "2024-01-01T00:00:00.000Z",
      expiresAt: "2024-02-01T00:00:00.000Z",
      data,
    });

    const deleted = await repo.deleteExpired({
      nowIso: "2026-02-28T00:00:00.000Z",
      limit: 200,
    });

    expect(deleted).toBe(1);
  });
});
