# MVP DB model draft

## Objetivo

Definir un modelo de datos más simple para el MVP, manteniendo compatibilidad conceptual con:

- WhatsApp como canal principal
- email como canal soportado
- mobile app como API propia
- Telegram conservado para iteración 2

## Principios

- una sola identidad principal por usuario
- múltiples fuentes de ingreso por usuario
- una sola tabla canónica de transacciones
- revisiones explícitas para correcciones y eliminaciones
- mensajes y eventos persistidos para trazabilidad e idempotencia
- montos en unidades menores (`amount_minor`)

## Tablas propuestas

### 1. users

Representa a la persona dueña de sus gastos.

Campos base:

- `id`
- `display_name`
- `default_currency` (`PEN`)
- `timezone` (`America/Lima`)
- `locale` (`es-PE`)
- `created_at`
- `updated_at`

## 2. user_sources

Relaciona al usuario con sus entradas externas.

Ejemplos:

- WhatsApp phone/user id
- email sender autorizado
- mobile account id
- Telegram identity futura

Campos base:

- `id`
- `user_id`
- `source_type` (`whatsapp`, `email`, `mobile`, `telegram`)
- `external_id`
- `is_primary`
- `status`
- `metadata_json`
- `created_at`
- `updated_at`

Constraint sugerido:

- unique (`source_type`, `external_id`)

## 3. inbound_messages

Persistencia canónica del input recibido antes o junto con el procesamiento.

Campos base:

- `id`
- `user_id`
- `source_type`
- `source_ref_id`
- `provider_message_id`
- `raw_text`
- `normalized_text`
- `payload_json`
- `received_at`
- `processed_at`
- `created_at`

Constraint sugerido:

- unique (`source_type`, `provider_message_id`) where not null

## 4. categories

Se puede conservar muy cerca del modelo actual.

Campos base:

- `id`
- `user_id` nullable para categorías globales
- `name`
- `slug`
- `created_at`

## 5. transactions

Tabla canónica del MVP.

Campos base:

- `id`
- `user_id`
- `source_message_id`
- `amount_minor`
- `currency`
- `merchant`
- `description`
- `category_id`
- `occurred_at`
- `status` (`confirmed`, `needs_clarification`, `deleted`)
- `created_via` (`whatsapp`, `email`, `mobile`)
- `created_at`
- `updated_at`

Notas:

- reemplaza a `expenses`
- `amount_minor` elimina problemas de floats
- `source_message_id` ayuda a trazabilidad

## 6. transaction_revisions

Historial explícito para correcciones y borrado lógico.

Campos base:

- `id`
- `transaction_id`
- `user_id`
- `revision_type` (`update`, `delete`)
- `before_json`
- `after_json`
- `reason`
- `created_at`

## 7. report_requests

Útil si reportes quedan cacheables o asincrónicos.

Campos base:

- `id`
- `user_id`
- `source_type`
- `period_kind` (`day`, `week`, `month`, `top_spend`)
- `request_message_id`
- `status`
- `result_json`
- `created_at`
- `completed_at`

## 8. inbound_webhook_events

Se puede conservar casi como está.

Campos base actuales ya útiles:

- `provider`
- `event_id`
- `status`
- `payload_hash`
- `request_id`
- `attempt_count`
- `first_seen_at`
- `last_seen_at`
- `processed_at`
- `last_error`

## 9. chat_media (opcional)

Mantener solo si imagen/OCR sigue en el MVP cercano.

## Mapeo desde el modelo actual

### Mantener como base conceptual

- `customers` -> `users`
- `customer_channels` + `customer_email_senders` -> `user_sources`
- `expenses` -> `transactions`
- `expense_events` -> parte en `transaction_revisions` o eventos internos
- `inbound_webhook_events` -> se conserva
- `categories` -> se conserva casi igual

### Candidatos a salida del MVP

- `customer_email_routes`
- `plans`
- `plan_features`
- `customer_subscriptions`
- `subscription_events`

## Estrategia de transición sugerida

### Opción recomendada

1. crear nuevas tablas MVP en migraciones nuevas
2. adaptar repos y casos de uso al nuevo modelo
3. migrar lectura/escritura del runtime al nuevo core
4. dejar tablas viejas solo durante transición
5. remover tablas viejas cuando WhatsApp y email ya operen sobre el nuevo modelo

## Decisiones abiertas

- si `telegram` entra en `user_sources` desde ya o solo se reserva el enum
- si `mobile` tendrá auth propia con tabla adicional (`mobile_sessions`, `mobile_devices`)
- si `inbound_messages` será obligatoria para email y mobile también, o solo para canales tipo webhook
