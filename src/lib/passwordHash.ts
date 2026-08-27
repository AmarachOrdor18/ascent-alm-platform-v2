// Unsalted SHA-256 — sufficient to avoid storing plaintext, not production-grade auth.
export async function hashPassword(plain: string): Promise<string> {
  const bytes = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
