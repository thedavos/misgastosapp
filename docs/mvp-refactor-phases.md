# MVP refactor phases

## Decisiones activas

- WhatsApp es el canal principal del producto.
- Email se mantiene como canal real de creación de gastos.
- Telegram se conserva, pero como segunda iteración y fuera de la ruta crítica del MVP.
- Instagram se elimina del repo y de la configuración activa.
- La app mobile entrará como API propia, no como clon del modelo de canal de chat.

## Objetivo del refactor

Reorientar el proyecto actual para que el núcleo del producto quede centrado en este loop:

1. llega gasto desde WhatsApp, mobile o email
2. se clasifica la intención
3. se validan campos faltantes
4. se persiste la transacción
5. se responde con confirmación o aclaración

## Fase 1. Limpieza segura de archivos a borrar

### Hecho en esta fase

- remover Instagram del router HTTP
- borrar handler y adapter de Instagram
- limpiar referencias de Instagram en schema snapshot, migraciones base y tests

### Pendiente cercano dentro de la fase

- borrar código muerto no usado por runtime actual
- revisar adapters y repos sin uso real antes de eliminarlos
- dejar README y RUNBOOK alineados al nuevo foco del producto

## Fase 2. Nuevo modelo DB MVP

### Objetivo

Definir un modelo más simple para el MVP, compatible con WhatsApp principal, email soportado y mobile API.

### Dirección propuesta

- `users`
- `user_channels` o `message_sources`
- `messages`
- `transactions`
- `transaction_revisions`
- `webhook_events`
- `report_requests` (si el reporte queda asincrónico)
- `chat_media` solo si imagen/OCR sigue dentro del MVP cercano

### Decisiones a cerrar

- migrar de `amount REAL` a `amount_minor`
- reemplazar `customers` por `users` o dejar compatibilidad transicional
- decidir si `conversation_state` sigue en KV o pasa parcialmente a D1

## Fase 3. Nuevo core de intents

### Objetivo

Reemplazar el flujo centrado en `PENDING_CATEGORY` por uno centrado en intención de usuario.

### Intents base

- `create_expense`
- `update_last_expense`
- `delete_last_expense`
- `get_report`
- `help`
- `unknown`

### Nuevos casos de uso esperados

- `parse-user-intent`
- `create-expense`
- `correct-last-expense`
- `delete-last-expense`
- `get-report`

## Fase 4. Adaptación de WhatsApp + email al nuevo core

### Objetivo

Hacer que WhatsApp y email converjan al mismo núcleo de negocio.

### Dirección

- WhatsApp sigue siendo la entrada principal y la experiencia principal
- email deja de tener un flow especial y pasa a alimentar el mismo core
- las aclaraciones y confirmaciones se modelan desde el nuevo sistema de intents

## Fase 5. Base para mobile API

### Objetivo

Abrir una API propia para la app mobile sin copiar la lógica de chat.

### Dirección

- endpoints HTTP propios para creación y consulta
- autenticación separada del modelo de canales
- reutilización del mismo core de intents y transacciones cuando tenga sentido

## Orden recomendado de ejecución

1. terminar limpieza segura
2. cerrar nuevo modelo DB
3. implementar parser/core de intents
4. adaptar WhatsApp
5. adaptar email
6. abrir base para mobile API
7. dejar Telegram explícitamente estacionado para iteración 2
