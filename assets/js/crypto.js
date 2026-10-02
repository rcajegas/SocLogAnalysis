// Browser-side helpers that mirror tools/build_answers.py.
// Uses the Web Crypto API (SHA-256 + AES-256-GCM). Works over https:// and localhost.

export function normalize(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256(salt + normalized text) as hex — the stored answer fingerprint. */
export async function hashAnswer(text, salt) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(salt + normalize(text)));
  return toHex(digest);
}

async function deriveKey(secret, salt) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(salt + normalize(secret)));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}

/** Decrypt {iv, ct} with a key derived from `secret`. Returns null if the secret is wrong. */
export async function decrypt(payload, secret, salt) {
  try {
    const key = await deriveKey(secret, salt);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(payload.iv) },
      key,
      b64ToBytes(payload.ct)
    );
    return dec.decode(plain);
  } catch {
    return null;
  }
}
