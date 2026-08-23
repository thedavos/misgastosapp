export interface ParsedTransaction {
  amount: number;
  currency: string;
  symbol?: string;
  merchant: string;
  date: string;
  cardType?: string;
  bank: string;
  rawText: string;
}
