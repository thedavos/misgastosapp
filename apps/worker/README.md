# MisGastosApp

Worker en Cloudflare para procesar gastos con WhatsApp como canal principal, email como canal soportado y Telegram conservado para una segunda iteración del producto.

Estado actual:

- Canal principal implementado: WhatsApp (Kapso).
- Canal secundario conservado: Telegram (Chat SDK, DM-only, segunda iteración).
- Canal soportado para creación de gastos: email.
- IA principal: Cloudflare Workers AI.

## Flujo actual (implementado)

1. Llega un email de consumo al trigger `email` del Worker.
2. Se valida inbox destino (`EMAIL_WORKER_INBOX`) y se resuelve el usuario por remitente desde `user_sources`.
3. Se parsea el correo (`postal-mime`) y se extrae transacción con AI.
4. Se guarda transacción en D1 (`transactions`) con estado `needs_clarification`.
5. Se guarda estado conversacional en KV (`conv:{userId}:{channel}:{externalUserId}`).
6. Se envía mensaje por WhatsApp pidiendo categoría.
7. Webhook de WhatsApp recibe respuesta del usuario.
8. Se clasifica categoría con AI + reglas heurísticas sobre `categories_v2`.
9. Se actualiza la transacción a `confirmed`, se limpia KV y se confirma por WhatsApp.

## Endpoints HTTP

- `GET /health`
- `POST /webhooks/whatsapp`
- `POST /webhooks/telegram`
- `POST /api/mobile/intents/preview` (preview del parser para mobile)
- `POST /api/mobile/intents/execute` (base de ejecución real para mobile)

## Seguridad webhook WhatsApp

Headers esperados:

- `x-kapso-signature`: firma hex (`v1=<hex>` preferido)
- `x-kapso-timestamp`: epoch en segundos

Validación:

- Se calcula `HMAC-SHA256(secret, "<timestamp>.<rawBody>")`.
- Se rechaza si la firma no coincide o si el timestamp cae fuera de la ventana configurada.
- `KAPSO_WEBHOOK_SIGNATURE_MODE=strict` exige HMAC+timestamp.
- Después de `016_retire_legacy_support_tables.sql`, el runtime deja de depender de tablas legacy de soporte (`customer_channels`, `customer_channel_settings`, `customer_email_routes`, `customer_email_senders`, `customer_subscriptions`).
- El runtime actual persiste gastos sobre `transactions`, `transaction_revisions` y `categories_v2`.
- `017_retire_legacy_expense_tables.sql` reconstruye `chat_media` sobre `users`/`transactions` y retira `categories`, `expenses`, `expense_events`, `subscription_events` y `customers` del esquema final.

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
- `TELEGRAM_WEBHOOK_SECRET` (recomendado)
- `KAPSO_API_KEY`
- `KAPSO_WEBHOOK_SECRET`
- `MOBILE_API_TOKENS` (JSON map: bearer token → user id)
- `VERCEL_AI_API_KEY` (requerido solo con `AI_PROVIDER=vercel`)
- `OPENROUTER_API_KEY` (requerido solo con `AI_PROVIDER=openrouter`)
- `USER_AI_GATEWAY_ENC_KEY` (base64 AES-256; habilita BYOK y modelo gestionado por usuario, ver abajo)
- `PLATFORM_MANAGED_MODELS` (allowlist de modelos elegibles en modo managed, coma-separada)
- `SENTRY_DSN`
- `SENTRY_RELEASE`

### Vars

- `CLOUDFLARE_AI_MODEL`
- `CLOUDFLARE_OCR_MODEL`
- `AI_PROVIDER` (`cloudflare` default | `vercel` | `openrouter`, vía Vercel AI SDK)
- `VERCEL_AI_BASE_URL` (default `https://ai-gateway.vercel.sh/v1`)
- `VERCEL_AI_MODEL` (default `openai/gpt-4o-mini`)
- `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`)
- `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`)
- `KAPSO_API_BASE_URL`
- `KAPSO_WEBHOOK_SIGNATURE_MODE` (`strict` recomendado en producción)
- `KAPSO_WEBHOOK_MAX_SKEW_SECONDS` (default `300`)
- `CHAT_MEDIA_RETENTION_DAYS` (default `90`)
- `EMAIL_WORKER_INBOX` (default `recibos@misgastos.app`)
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
wrangler d1 execute misgastos --file db/migrations/006_webhook_events.sql
wrangler d1 execute misgastos --file db/migrations/007_chat_media.sql
wrangler d1 execute misgastos --file db/migrations/008_activate_telegram_channel.sql
wrangler d1 execute misgastos --file db/migrations/009_default_email_route_recibos.sql
wrangler d1 execute misgastos --file db/migrations/010_customer_email_senders.sql
wrangler d1 execute misgastos --file db/migrations/011_mvp_core_schema.sql
wrangler d1 execute misgastos --file db/migrations/012_backfill_mvp_core_from_legacy.sql
wrangler d1 execute misgastos --file db/migrations/013_normalize_expense_statuses.sql
wrangler d1 execute misgastos --file db/migrations/014_user_support_tables.sql
wrangler d1 execute misgastos --file db/migrations/015_backfill_user_support_tables.sql
wrangler d1 execute misgastos --file db/migrations/016_retire_legacy_support_tables.sql
wrangler d1 execute misgastos --file db/migrations/017_retire_legacy_expense_tables.sql
wrangler d1 execute misgastos --file db/migrations/018_onboarding_and_otros_category.sql
wrangler d1 execute misgastos --file db/migrations/019_mobile_channel.sql
wrangler d1 execute misgastos --file db/migrations/020_user_ai_gateways.sql
```

3. Crear KV para estado conversacional y actualizar `wrangler.jsonc`.

4. Cargar prompts en `PROMPTS_KV` (ej. `SYSTEM_PROMPT`).

5. Configurar secrets:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put KAPSO_API_KEY
wrangler secret put KAPSO_WEBHOOK_SECRET
wrangler secret put MOBILE_API_TOKENS
wrangler secret put SENTRY_DSN
wrangler secret put SENTRY_RELEASE
```

`MOBILE_API_TOKENS` is a JSON map of opaque Bearer tokens to user ids, for example `{"tok_abc":"user_uuid"}`.

6. Deploy:

```bash
pnpm deploy
```

## Gateway de IA por usuario (BYOK o modelo gestionado)

Además del proveedor global (`AI_PROVIDER`), un usuario puede tener su propia preferencia de IA en `user_ai_gateways`. Dos modos:

- **`byok`** (bring your own key): el usuario trae cuenta propia (`provider`: `vercel` u `openrouter` + API key). El uso se factura a su cuenta. `base_url` y `model` opcionales.
- **`managed`**: el usuario solo elige un `model`; la ejecución corre por las credenciales del gateway de la app (cualquier `AI_PROVIDER`, incluido Cloudflare). El uso lo paga la app y está restringido al allowlist `PLATFORM_MANAGED_MODELS` (o defaults por proveedor si no se define).

Reglas comunes:

- La API key BYO se guarda cifrada con AES-256-GCM usando `USER_AI_GATEWAY_ENC_KEY`; sin ese secret, ambas opciones por usuario quedan deshabilitadas.
- Modelos fuera del allowlist en modo managed se rechazan en runtime y caen al default.
- Si no hay config para el usuario, o está `enabled = 0`, se usa el default de la plataforma.

Provisionar:

```bash
# 1. Clave de cifrado (una vez):
openssl rand -base64 32
wrangler secret put USER_AI_GATEWAY_ENC_KEY
```

Cifra la key del usuario con `encryptSecret` de `src/utils/crypto/aesGcm.ts` (formato `v1.<iv_b64>.<ct_b64>`) e inserta:

```sql
-- BYOK: cuenta propia del usuario
INSERT INTO user_ai_gateways (user_id, mode, provider, api_key_encrypted, base_url, model, enabled, created_at, updated_at)
VALUES ('<user_uuid>', 'byok', 'openrouter', 'v1.<iv>.<ct>', NULL, 'anthropic/claude-3.5-haiku', 1,
        strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Managed: usuario solo elige modelo, la app paga
INSERT INTO user_ai_gateways (user_id, mode, provider, api_key_encrypted, base_url, model, enabled, created_at, updated_at)
VALUES ('<user_uuid>', 'managed', NULL, NULL, NULL, '@cf/meta/llama-3.1-8b-instruct-fast', 1,
        strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
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

- Runbook: `../../docs/RUNBOOK.md`
