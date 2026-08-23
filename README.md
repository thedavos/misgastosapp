# MisGastos.app

Monorepo pnpm. Registra gastos automáticamente desde WhatsApp y email, con API para la app mobile e IA configurable (Cloudflare Workers AI, Vercel AI Gateway u OpenRouter).

## Estructura

```txt
apps/
  worker/   Cloudflare Worker: ingesta WhatsApp/email, HTTP API, agente Durable Object, D1
  mobile/   App Expo / React Native (SDK 57)
docs/       Runbook, guía de beta cerrada, diseño MVP
```

## Desarrollo

```bash
pnpm install
pnpm dev          # worker local (Wrangler)
pnpm test         # tests del worker
pnpm check        # tsc + lint + formato del worker
pnpm mobile:start # dev server de Expo
```

Los scripts de raíz delegan por paquete (`pnpm --filter`). Detalles de operación del worker: `apps/worker/README.md`. Variables, secrets y gateways de IA: `apps/worker/README.md` ("Variables y bindings").

## Deploy

```bash
pnpm deploy
```
