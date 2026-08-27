/**
 * Demo-grade credential hashing — SHA-256 via the Web Crypto API.
 *
 * This is not production authentication (there's no server, no salt-per-
 * install rotation, no rate limiting), but it means a password isn't sitting
 * in IndexedDB as plain text either. Real auth (MFA, Azure AD SSO) is out of
 * scope here — see Login.tsx's header comment.
 */
export async function hashPassword(plain: string): Promise<string> {
  const bytes = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
