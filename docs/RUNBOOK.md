# Runbook Operativo

## 1) Provisioning de Cloudflare

### D1

```bash
wrangler d1 create misgastos
wrangler d1 execute misgastos --file db/migrations/001_init.sql
wrangler d1 execute misgastos --file db/migrations/002_customers.sql
wrangler d1 execute misgastos --file db/migrations/003_channels_3_layers.sql
wrangler d1 execute misgastos --file db/migrations/004_subscriptions.sql
wrangler d1 execute misgastos --file db/migrations/005_email_routes.sql
```

### KV namespaces

Crear namespaces:
- `PROMPTS_KV`
- `CONVERSATION_STATE_KV`
- `ENTITLEMENTS_KV` (opcional, recomendado)

Actualizar `wrangler.jsonc` con IDs reales.

## 2) Configuración de secretos

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put EMAIL_WORKER_SECRET
wrangler secret put KAPSO_API_KEY
wrangler secret put KAPSO_WEBHOOK_SECRET
wrangler secret put SENTRY_DSN
wrangler secret put SENTRY_RELEASE
```

## 3) Configuración de vars

Definir en `wrangler.jsonc` (o por ambiente):
- `CLOUDFLARE_AI_MODEL`
- `KAPSO_API_BASE_URL`
- `DEFAULT_CUSTOMER_ID` (solo bootstrap/dev)
- `STRICT_POLICY_MODE=true`
- `ENVIRONMENT`

## 4) Despliegue

```bash
pnpm deploy
```

Con sourcemaps:

```bash
pnpm deploy:release
```

## 5) Healthcheck y webhooks

### Health

```bash
curl -i https://<tu-worker>/health
```

### Webhook WhatsApp

Endpoint:
- `POST https://<tu-worker>/webhooks/whatsapp`

Recomendación:
- Configura `x-kapso-signature` en Kapso y alinea con `KAPSO_WEBHOOK_SECRET`.

## 6) Operación diaria

### Ver logs

```bash
wrangler tail misgastosapp
```

### Señales esperadas

- `expense.pending_category_created`
- `expense.flow_completed`
- `whatsapp.webhook_unauthorized` (si firma incorrecta)

## 7) Troubleshooting

### 401 en webhook WhatsApp

- Verifica `KAPSO_WEBHOOK_SECRET`.
- Verifica header `x-kapso-signature`.

### Gasto no se categoriza

- Revisa respuesta del usuario y `confidence` de clasificación.
- Verifica categorías existentes en tabla `categories`.

### No se guarda estado de conversación

- Verifica binding `CONVERSATION_STATE_KV`.
- Confirma que el namespace ID en `wrangler.jsonc` es correcto.

### Error al guardar en D1

- Reaplica migración `db/migrations/001_init.sql`.
- Verifica binding `DB` en environment activo.
