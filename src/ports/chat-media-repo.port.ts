export interface ChatMedia {
  id: string;
  customerId: string;
  channel: string;
  externalUserId: string;
  providerEventId: string;
  expenseId: string | null;
  r2Key: string;
  mimeType: string | null;
  sizeBytes: number;
  sha256: string;
  ocrText: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface ChatMediaRepoPort {
  create(input: {
    customerId: string;
    channel: string;
    externalUserId: string;
    providerEventId: string;
    expenseId: string | null;
    r2Key: string;
    mimeType: string | null;
    sizeBytes: number;
    sha256: string;
    ocrText: string | null;
    createdAt: string;
    expiresAt: string;
    data: Uint8Array;
  }): Promise<ChatMedia>;
  linkExpense(input: { id: string; expenseId: string }): Promise<void>;
  listByExpenseId(input: { customerId: string; expenseId: string }): Promise<ChatMedia[]>;
  deleteExpired(input: { nowIso: string; limit?: number }): Promise<number>;
}
