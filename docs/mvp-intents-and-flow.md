# MVP intents and flow

## Objetivo

Definir el núcleo de intención que reemplazará el flujo actual centrado en `PENDING_CATEGORY`.

## Intents del MVP

### `create_expense`

Se activa cuando el usuario intenta registrar un gasto desde:

- WhatsApp
- mobile app
- email

Output esperado:

- draft estructurado del gasto
- campos faltantes
- confidence

### `update_last_expense`

Se activa cuando el usuario corrige el último gasto registrado.

Ejemplos:

- "No fueron 20, fueron 25"
- "Cámbialo a comida"
- "Fue ayer, no hoy"

### `delete_last_expense`

Se activa cuando el usuario quiere eliminar el último gasto elegible.

Ejemplos:

- "borra eso"
- "elimina el último gasto"

### `get_report`

Se activa para reportes on-demand.

Ejemplos:

- "resumen de hoy"
- "resumen de la semana"
- "resumen del mes"
- "en qué gasté más"

### `help`

Se activa para onboarding ligero o ayuda contextual.

### `unknown`

Fallback cuando el input no es suficientemente claro.

## Flujo canónico por entrada

### WhatsApp

1. entra webhook
2. se valida firma
3. se persiste input bruto
4. se parsea intención
5. se ejecuta caso de uso
6. se responde al usuario

### Email

1. entra email trigger
2. se resuelve usuario por remitente permitido
3. se genera input normalizado
4. se parsea intención con el mismo core
5. se ejecuta caso de uso
6. se notifica solo si aplica

### Mobile API

1. entra request autenticado
2. se normaliza payload
3. se parsea o valida intención según endpoint
4. se ejecuta caso de uso
5. se devuelve respuesta estructurada

## Regla de diseño clave

El parser de intención no debe depender de un canal concreto.

Debe recibir:

- texto o payload normalizado
- contexto del usuario
- source type
- defaults (`PEN`, `America/Lima`)

## Campos mínimos de `create_expense`

- monto
- moneda
- comercio o descripción corta útil
- fecha u ocurrencia asumible

Si falta algo crítico:

- no se crea transacción final
- se responde con aclaración específica

## Diferencia principal con el diseño actual

Antes:

- extraer transacción
- crear gasto pendiente
- pedir categoría
- confirmar al final

Ahora:

- clasificar intención
- crear, corregir, borrar o reportar
- confirmar directo cuando la información alcance
- pedir aclaración solo por campos críticos faltantes

## Contrato sugerido de implementación

Archivo de referencia de tipos:

- `src/domain/intent/entity.ts`
