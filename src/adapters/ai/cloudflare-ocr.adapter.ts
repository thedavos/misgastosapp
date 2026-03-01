import type { WorkerEnv } from "types/env";
import type { OcrPort } from "@/ports/ocr.port";

function toDataUrl(data: Uint8Array, mimeType: string): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

function extractTextFromModelPayload(payload: unknown): string | null {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const directTextCandidates: Array<unknown> = [record.text, record.output_text, record.content];

  for (const candidate of directTextCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  if (Array.isArray(record.response)) {
    const joined = record.response
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0)
      .join("\n");
    return joined.length > 0 ? joined : null;
  }

  return null;
}

export function createCloudflareOcrAdapter(env: WorkerEnv): OcrPort {
  return {
    async extractTextFromImage(input): Promise<string | null> {
      const model = env.CLOUDFLARE_OCR_MODEL ?? env.CLOUDFLARE_AI_MODEL;
      const mimeType = input.mimeType ?? "image/jpeg";
      const imageDataUrl = toDataUrl(input.data, mimeType);

      const response = await (env.AI as {
        run: (modelName: string, payload: Record<string, unknown>) => Promise<unknown>;
      }).run(model, {
        messages: [
          {
            role: "system",
            content: "Extrae solo el texto visible del comprobante o captura.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Devuelve el texto OCR plano en español sin comentarios.",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
      });

      const payload = (response as { response?: unknown }).response ?? response;
      return extractTextFromModelPayload(payload);
    },
  };
}
