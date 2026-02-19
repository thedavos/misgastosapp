export interface ParsedTransaction {
  amount: number;
  currency: string;
  merchant: string;
  date: string;
  cardType?: string;
  bank: string;
  rawText: string;
}
