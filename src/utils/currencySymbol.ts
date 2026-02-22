export const CURRENCY_SYMBOL_MAP = {
  USD: "$",
  EUR: "€",
  PEN: "S/.",
  ARS: "$",
  BOB: "Bs",
  BRL: "R$",
  CLP: "$",
  COP: "$",
  CRC: "₡",
  DOP: "RD$",
  GTQ: "Q",
  HNL: "L",
  MXN: "$",
  NIO: "C$",
  PAB: "B/.",
  PYG: "₲",
  UYU: "$U",
  VES: "Bs.",
} as const;

export type CurrencyCode = keyof typeof CURRENCY_SYMBOL_MAP;

const CURRENCY_ALIAS_MAP: Record<string, CurrencyCode> = {
  "S/": "PEN",
  "S/.": "PEN",
  "US$": "USD",
  "U$S": "USD",
  "€": "EUR",
};

const CURRENCY_SYMBOL_SET = new Set<string>(Object.values(CURRENCY_SYMBOL_MAP));

function normalizeCurrencyCode(currency: string): CurrencyCode | null {
  const cleanCurrency = currency.trim();
  const alias = CURRENCY_ALIAS_MAP[cleanCurrency];
  if (alias) return alias;

  const upperCurrency = cleanCurrency.toUpperCase();
  if (upperCurrency in CURRENCY_SYMBOL_MAP) {
    return upperCurrency as CurrencyCode;
  }

  return null;
}

export function getCurrencySymbol(currency: string): string {
  const normalizedCurrency = normalizeCurrencyCode(currency);

  if (normalizedCurrency) {
    return CURRENCY_SYMBOL_MAP[normalizedCurrency];
  }

  const cleanCurrency = currency.trim();
  if (CURRENCY_SYMBOL_SET.has(cleanCurrency)) {
    return cleanCurrency;
  }

  return cleanCurrency;
}
