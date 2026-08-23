export interface OcrPort {
  extractTextFromImage(input: {
    data: Uint8Array;
    mimeType?: string;
    requestId?: string;
  }): Promise<string | null>;
}
