export interface ExtractedTransaction {
  amount: number;
  currency: string;
  symbol: string;
  merchant: string;
  date: string;
  cardType?: string;
  bank: string;
  rawText: string;
}

export interface CategoryClassificationInput {
  userReply: string;
  categories: Array<{ id: string; name: string; slug: string }>;
}

export interface MessageGenerationInput {
  kind: "ask_category" | "confirmation";
  amount?: number;
  currency?: string;
  merchant?: string;
  categoryName?: string;
}

export interface AiPort {
  extractTransaction(input: string): Promise<ExtractedTransaction | null>;
  classifyCategory(input: CategoryClassificationInput): Promise<{ categoryId: string | null; confidence: number }>;
  generateMessage(input: MessageGenerationInput): Promise<string>;
}
