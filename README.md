# MisGastosApp

Worker en Cloudflare para procesar gastos desde email y categorizarlos vía conversación en canales de mensajería.

Estado actual:
- Canal principal implementado: WhatsApp (Kapso).
- Canales en scaffold: Telegram e Instagram.
- IA principal: Cloudflare Workers AI.
- IA alterna en scaffold: Inflection API.

## Flujo actual (implementado)

1. Llega un email de consumo al trigger `email` del Worker.
2. Se parsea el correo (`postal-mime`) y se extrae transacción con AI.
3. Se guarda gasto en D1 con estado `PENDING_CATEGORY`.
4. Se guarda estado conversacional en KV (`conv:{customerId}:{channel}:{userId}`).
5. Se envía mensaje por WhatsApp pidiendo categoría.
6. Webhook de WhatsApp recibe respuesta del usuario.
7. Se clasifica categoría con AI + reglas heurísticas.
8. Se actualiza gasto a `CATEGORIZED`, se limpia KV y se confirma por WhatsApp.

## Endpoints HTTP

- `GET /health`
- `POST /webhooks/whatsapp`
- `POST /webhooks/telegram` (placeholder, `501`)
- `POST /webhooks/instagram` (placeholder, `501`)

## Arquitectura del proyecto

```txt
src/
  adapters/
    ai/
    channels/
    persistence/
    email/
    observability/
  app/
  composition/
  domain/
  handlers/
    http/
  ports/
  index.ts
```

## Variables y bindings

### Secrets

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `EMAIL_WORKER_SECRET`
- `KAPSO_API_KEY`
- `KAPSO_WEBHOOK_SECRET`
- `SENTRY_DSN`
- `SENTRY_RELEASE`

### Vars

- `CLOUDFLARE_AI_MODEL`
- `KAPSO_API_BASE_URL`
- `DEFAULT_CUSTOMER_ID` (solo bootstrap/dev)
- `STRICT_POLICY_MODE` (`true` recomendado en producción)
- `ENVIRONMENT`

### Bindings

- `AI`
- `DB` (D1)
- `PROMPTS_KV`
- `CONVERSATION_STATE_KV`
- `ENTITLEMENTS_KV` (opcional, cache de entitlements)
- `REPORTS` (R2)

Importante:
- Configura `CONVERSATION_STATE_KV` y `ENTITLEMENTS_KV` con IDs reales en `wrangler.jsonc`.

## Setup rápido

1. Instalar dependencias:

```bash
pnpm install
```

2. Crear DB D1 y aplicar schema:

```bash
wrangler d1 create misgastos
wrangler d1 execute misgastos --file db/migrations/001_init.sql
wrangler d1 execute misgastos --file db/migrations/002_customers.sql
wrangler d1 execute misgastos --file db/migrations/003_channels_3_layers.sql
wrangler d1 execute misgastos --file db/migrations/004_subscriptions.sql
wrangler d1 execute misgastos --file db/migrations/005_email_routes.sql
```

3. Crear KV para estado conversacional y actualizar `wrangler.jsonc`.

4. Cargar prompts en `PROMPTS_KV` (ej. `SYSTEM_PROMPT`).

5. Configurar secrets:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put EMAIL_WORKER_SECRET
wrangler secret put KAPSO_API_KEY
wrangler secret put KAPSO_WEBHOOK_SECRET
wrangler secret put SENTRY_DSN
wrangler secret put SENTRY_RELEASE
```

6. Deploy:

```bash
pnpm deploy
```

## Desarrollo

- `pnpm dev`
- `pnpm test`
- `pnpm tsc`
- `pnpm lint`
- `pnpm check`

## Testing

Suite actual:
- Unit tests (`test/unit`)
- Integration tests (`test/integration`)
- Contract tests (`test/contract`)

## Documentación operativa

- Runbook: `docs/RUNBOOK.md`

## Roadmap corto

- Implementar adapters reales para Telegram e Instagram.
- Completar adapter real de Inflection API.
- Endurecer webhook de WhatsApp (firma HMAC + idempotencia).
