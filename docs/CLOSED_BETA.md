# Closed Beta Operating Guide

Technical preparation for DAV-71. Real beta-user validation remains open until feedback exists.

## Enable a beta user

1. Ensure the WhatsApp number can reach Kapso and the Worker webhook.
2. First message upserts the user with `PEN` and `America/Lima`.
3. To pre-provision or re-enable:

```sql
UPDATE users SET status = 'ACTIVE', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?;
```

4. Confirm `user_channel_settings` has `whatsapp` enabled for that user.
5. Confirm free-plan feature `channels.whatsapp` is enabled.

## Suspend or disable a user

```sql
UPDATE users SET status = 'INACTIVE', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?;
```

Inactive WhatsApp users receive `403` and emit `whatsapp.user_inactive_skip`. No queue work runs.

## Inspect failures

Useful structured log events:

| Event                                            | Meaning                                     |
| ------------------------------------------------ | ------------------------------------------- |
| `whatsapp.webhook_signature_invalid`             | Auth failure at ingress                     |
| `whatsapp.user_inactive_skip`                    | Inactive account blocked                    |
| `whatsapp.webhook_duplicate_ignored`             | Idempotent retry                            |
| `whatsapp.webhook_job_enqueued`                  | Accepted for async processing               |
| `intent.shadow_parsed`                           | Parser output summary (no raw message body) |
| `chat.onboarding_sent`                           | First-contact onboarding delivered          |
| `category.fallback_otros`                        | Unknown category mapped to Otros            |
| `expense.created_from_intent`                    | Expense persisted after authorization       |
| `IntentParseError` / `IntentContextResolveError` | Distinct from conversation KV errors        |

Filter by `requestId` / `cf-ray` for correlation.

## Reproduce a message flow

1. Send a signed Kapso webhook fixture to `/webhooks/whatsapp` (see `test/integration/handlers/http/whatsapp-webhook.handler.spec.ts`).
2. Confirm enqueue in Durable Object / agent logs.
3. Confirm D1 `transactions` row and WhatsApp confirmation text.

Local:

```bash
pnpm test --run
pnpm dev
```

## Approximate cost signals

Per message, expect roughly:

- 1 Workers AI intent/parse call (and optionally OCR for images)
- 1 D1 write path for expense create/update
- 1 Kapso outbound send for confirmation/report

Track in analytics or log counts:

- AI calls ≈ count of `intent.shadow_parsed` + OCR events
- Outbound messages ≈ channel send successes
- Cost/user ≈ (AI calls + outbound) / distinct `userId` in period

Exact provider pricing must be filled from Cloudflare AI and Kapso invoices. Do not invent unit prices here.

## Metrics that decide copy/parser tuning

| Metric                                                             | Signal                                   |
| ------------------------------------------------------------------ | ---------------------------------------- |
| Parse success vs `IntentParseError`                                | Prompt/contract quality                  |
| Clarification rate (pending conversation state)                    | Missing-field UX                         |
| Correction rate (`update_last_expense`)                            | Confirmation clarity / amount extraction |
| Duplicate rate (`webhook_duplicate_ignored`)                       | Provider retry health                    |
| Category fallback rate (`category.fallback_otros`)                 | Catalog / classifier quality             |
| Onboarding completion (`chat.onboarding_sent` then later activity) | First-contact usefulness                 |
| Report usage (`report.generated_from_intent`)                      | Retention beyond capture                 |
| Processing latency (enqueue → expense.created)                     | Reliability                              |

## Beta feedback template

```
Usuario:
Canal: WhatsApp
Fecha:
Mensaje enviado:
Respuesta recibida:
¿Entendió el gasto? (sí/no/parcial)
¿La confirmación fue clara?
¿Pidió aclaración innecesaria?
Categoría esperada vs usada:
¿Usó resumen/corrección?
Comentario libre:
```

## Go / no-go checklist

- [ ] DAV-81/82/83/84 security gates green in CI
- [ ] Kapso webhook signature mode `strict` in production
- [ ] `MOBILE_API_TOKENS` configured if mobile API is exposed
- [ ] Migration `018_onboarding_and_otros_category.sql` applied
- [ ] At least N beta users active in Peru (product sets N)
- [ ] Parsing success and correction rates reviewed after first week
- [ ] No unresolved P0 security findings
- [ ] Real-user feedback logged (blocks full DAV-71 Done)

External validation still required before marking DAV-71 complete.
