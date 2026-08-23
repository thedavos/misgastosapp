export interface ChatMedia {
  id: string;
  userId: string;
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
    userId: string;
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
  listByExpenseId(input: { userId: string; expenseId: string }): Promise<ChatMedia[]>;
  deleteExpired(input: { nowIso: string; limit?: number }): Promise<number>;
}
