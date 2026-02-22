export function buildExtractTransactionPrompt(schemaJson: string, input: string): string {
  return `Analiza el siguiente texto de un correo electrónico bancario de Perú.
Extrae la información de la transacción y genera un JSON que cumpla estrictamente con este esquema: ${schemaJson}.

REQUERIMIENTOS ADICIONALES:
- Si es un Yape o Plin, el 'merchant' es la persona o negocio que recibió el dinero.
- Si el banco es Interbank, busca el 'Número de Operación' para el 'rawText' si es posible.
- Si la moneda es 'S/' o 'Soles', usa 'PEN'. Si es '$' o 'Dólares', usa 'USD'.
- Si el texto contiene múltiples transacciones, extrae solo la más reciente o principal.
- Si el campo 'cardType' no es explícito pero es Yape/Plin, pon 'Billetera Digital'.

TEXTO DEL CORREO:
"""
${input}
"""`;
}
