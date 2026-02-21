# MisGastosApp 💰

Bot personal que automatiza la categorización de gastos bancarios usando Cloudflare Workers, Claude AI y Telegram.

## ¿Qué es MisGastos?

MisGastos es un bot personal que:

✅ **Intercepta** notificaciones de transacciones de tus bancos
✅ **Parsea automáticamente** los emails con el Worker
✅ **Categoriza** gastos inteligentemente con Claude AI
✅ **Aprende** de tus gastos frecuentes para auto-categorizar
✅ **Confirma** cambios por Telegram de forma natural
✅ **Genera reportes** mensuales en PDF con análisis

## Problema que resuelve

Recibir notificaciones de gastos es fácil, pero registrarlos es tedioso:

❌ Los comercios tienen nombres extraños (ej: "Vespucio Apoquindo 123")
❌ Es fácil olvidar qué era cada transacción
❌ No hay visibilidad de dónde va tu dinero
❌ Los apps de finanzas son complicados

**MisGastos lo automatiza todo.**

## Flujo de funcionamiento

```
1. Realizas una compra con tu tarjeta
   ↓
2. Tu banco envía email a tu Gmail
   ↓
3. Gmail Filter reenvía automáticamente a gastos@misgastos.app
   ↓
4. Cloudflare Worker intercepta, parsea y categoriza con Claude AI
   ↓
5. Se guarda en D1 y te pregunta por Telegram
   ↓
6. Confirmas con ✓ o agregas nota con /nota
   ↓
7. A fin de mes: /reporte genera PDF con análisis
```

## Stack Tecnológico

| Componente         | Tecnología               | Por qué                               |
| ------------------ | ------------------------ | ------------------------------------- |
| **Runtime**        | Cloudflare Workers       | Serverless, rápido, escalable         |
| **Base de Datos**  | Cloudflare D1            | SQL nativo, integrado con Workers     |
| **Almacenamiento** | Cloudflare R2            | Object storage para reportes          |
| **IA**             | Claude API (Anthropic)   | Mejor comprensión de contexto natural |
| **Interfaz**       | Telegram Bot API         | Accesible, natural, gratuito          |
| **Email**          | Cloudflare Email Routing | Intercepta emails sin intermediarios  |

## Características

### Categorización inteligente

- Auto-categoriza gastos según el comercio
- Aprende de patrones recurrentes
- Permite override manual por Telegram

### Comandos Telegram

```
✓              → Confirmar último gasto
✗              → Rechazar gasto
/nota [texto]  → Agregar nota contextual
/hoy           → Ver gastos de hoy
/mes           → Ver gastos del mes actual
/reporte       → Generar reporte PDF mensual
/categorias    → Listar categorías disponibles
/help          → Mostrar ayuda
```

### Reportes mensuales

- Total de gastos por mes
- Desglose por categoría
- Gasto promedio diario
- Top comercios por categoría
- Exportable como PDF

### Bancos soportados

- ✅ BCP
- ✅ Interbank
- 🔜 Otros bancos (agregar parsers)

## Setup

### Requisitos previos

- Dominio propio (ej: `misgastos.app`)
- Cuenta en Cloudflare
- Cuenta en Telegram
- API Key de Claude (Anthropic)

### 1. Clonar repositorio

```bash
git clone https://github.com/tu-usuario/misgastosapp.git
cd misgastosapp
```

### 2. Instalar dependencias

```bash
pnpm install
```

### 3. Setup Cloudflare

```bash
# Login en Cloudflare
wrangler login

# Crear D1 database
wrangler d1 create misgastos

# Ejecutar schema
wrangler d1 execute misgastos --file db/schema.sql
```

### 4. Crear Telegram Bot

1. Abre Telegram
2. Busca `@BotFather`
3. Envía `/newbot`
4. Sigue los pasos y guarda el TOKEN

### 5. Obtener tu Chat ID

1. Busca `@userinfobot` en Telegram
2. Envía cualquier mensaje
3. Guarda tu `User ID`

### 6. Configurar secrets

```bash
# Worker
wrangler secret put CLAUDE_API_KEY
# (pegar tu key de Claude)

wrangler secret put TELEGRAM_BOT_TOKEN
# (pegar token del bot)

wrangler secret put TELEGRAM_CHAT_ID
# (pegar tu ID de chat)
```

### 7. Configurar Email Routing en Cloudflare

1. Dashboard Cloudflare → misgastos.app → Email Routing
2. Habilitar Email Routing
3. Crear dirección: `gastos@misgastos.app`
4. Acción: Send to Worker → `misgastosapp`

### 8. Configurar Gmail Filters

1. Gmail → Configuración → Reenvíos y direcciones POP/IMAP
2. Agregar: `gastos@misgastos.app`
3. Confirmar
4. Crear filtro automático:
   - **De:** `(alertas@bancoeestado.cl OR notificaciones@scotiabank.cl OR transacciones@bci.cl OR alertas@itau.cl)`
   - **Acción:** Reenviar a `gastos@misgastos.app`
   - Marcar como leído, Omitir bandeja

### 9. Deploy

```bash
# Desde la raíz del proyecto
pnpm deploy
```

### 9.1. Sentry source maps (recomendado para stack traces legibles)

Define estas variables en CI (o tu shell):

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_RELEASE` (recomendado: SHA del commit)

También define `SENTRY_RELEASE` como variable del Worker para que el runtime reporte el mismo release en Sentry:

```bash
wrangler secret put SENTRY_DSN
wrangler secret put SENTRY_RELEASE
```

Luego despliega y sube sourcemaps:

```bash
pnpm deploy:release
```

### 10. Verificar que funciona

```bash
# Ver logs en vivo
wrangler tail misgastosapp

# Envía email de prueba a gastos@misgastos.app desde tu Gmail
```

## Estructura del proyecto

```
misgastosapp/
├── src/
│   ├── index.ts
│   ├── parsers/               # Parsers por banco
│   └── types.ts
├── test/
│   ├── env.d.ts
│   └── index.spec.ts
├── wrangler.jsonc
├── tsconfig.worker.json
├── db/
│   └── schema.sql             # Schema de D1
│
├── package.json
├── README.md
└── .env.example
```

## Costos

| Servicio           | Costo             |
| ------------------ | ----------------- |
| Cloudflare Workers | $0 (gratuito)     |
| Cloudflare D1      | $0 (gratuito)     |
| Cloudflare R2      | $0 (gratuito)     |
| Claude API         | ~$0.10-0.30/mes\* |
| Telegram           | $0 (gratuito)     |
| Dominio            | $12-15/año        |
| **TOTAL**          | **~$1-5 USD/año** |

\*Estimado para ~100 transacciones mensuales

## Roadmap

- [x] Email routing y parsing
- [x] Categorización con IA
- [x] Telegram Bot básico
- [x] Auto-categorización de frecuentes
- [x] D1 Database
- [ ] Reportes en PDF
- [ ] Dashboard web
- [ ] Análisis de tendencias
- [ ] Alertas de gastos inusuales
- [ ] Presupuestos y límites
- [ ] Exportar a CSV/Google Sheets
- [ ] Soporte multi-usuario
- [ ] Integración YNAB

## Contribuir

Las contribuciones son bienvenidas. Para cambios grandes:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/amazing-feature`)
3. Commit tus cambios (`git commit -m 'Add amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

## Troubleshooting

### Los emails no llegan a Cloudflare

- Verificar que Email Routing esté habilitado
- Revisar que el dominio DNS está en Cloudflare
- Revisar logs de Email Routing

### Claude API devuelve error

- Verificar que `CLAUDE_API_KEY` sea válido
- Revisar límites de rate en console de Claude
- Revisar logs del Worker

### Telegram no recibe mensajes

- Verificar que `TELEGRAM_BOT_TOKEN` es correcto
- Verificar que `TELEGRAM_CHAT_ID` es correcto
- Revisar logs del Worker

Ver documentación técnica en `TECHNICAL_DOCS.md` para más detalles.

## Licencia

MIT License - ver archivo `LICENSE`

## Autor

Creado como proyecto personal para automatizar la gestión de gastos.

## Agradecimientos

- Cloudflare Workers por la infraestructura
- Claude API por la IA
- Telegram por la interfaz accesible

---

**¿Preguntas? Abre un issue o contacta en Telegram**

Powered by ☁️ Cloudflare Workers + 🤖 Claude AI + 💬 Telegram
