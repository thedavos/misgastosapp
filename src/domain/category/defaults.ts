export const FALLBACK_CATEGORY = {
  id: "cat_otros",
  name: "Otros",
  slug: "otros",
} as const;

export const DEFAULT_CATEGORIES = [
  { id: "cat_food", name: "Comida", slug: "comida" },
  { id: "cat_transport", name: "Transporte", slug: "transporte" },
  { id: "cat_shopping", name: "Compras", slug: "compras" },
  { id: "cat_services", name: "Servicios", slug: "servicios" },
  FALLBACK_CATEGORY,
] as const;
