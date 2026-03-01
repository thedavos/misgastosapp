export async function safePostThreadMessage(thread: unknown, text: string): Promise<void> {
  const post = (thread as { post?: (content: string) => Promise<void> }).post;
  if (typeof post === "function") {
    await post(text);
  }
}
