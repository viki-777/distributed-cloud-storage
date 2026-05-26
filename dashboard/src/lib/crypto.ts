/**
 * E2EE Cryptographic Utilities
 *
 * Implements AES-256-GCM encryption/decryption entirely inside the browser
 * using the native Web Crypto API (window.crypto.subtle).
 *
 * Zero-Knowledge Design:
 *  - The encryption key never leaves the browser.
 *  - The server and storage nodes only ever store the encrypted ciphertext.
 *  - A 12-byte random IV is generated per file and prepended to the ciphertext
 *    so it travels with the data without needing a separate database column.
 *
 * Wire format of encrypted blob:
 *   [ 12 bytes IV ][ N bytes AES-GCM ciphertext (includes 16-byte auth tag) ]
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256; // bits
const IV_LENGTH = 12;   // bytes (96-bit IV is recommended for AES-GCM)

// ─── Key Generation ───────────────────────────────────────────────────────────

/**
 * Generates a fresh AES-256-GCM key and returns it as a Base64 string.
 * The user MUST save this string — it is the only way to decrypt the file.
 */
export async function generateKey(): Promise<string> {
  const key = await window.crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,         // extractable — we need to export it for the user
    ["encrypt", "decrypt"]
  );

  // Export raw key bytes and convert to Base64 for display / storage
  const rawKey = await window.crypto.subtle.exportKey("raw", key);
  return bufferToBase64(rawKey);
}

// ─── Encryption ───────────────────────────────────────────────────────────────

/**
 * Encrypts an ArrayBuffer with the supplied Base64 key.
 *
 * @param plaintext  Raw file bytes (ArrayBuffer)
 * @param base64Key  Base64-encoded AES-256 key string provided by generateKey()
 * @returns          Encrypted blob: [ 12-byte IV | ciphertext ]
 */
export async function encryptBuffer(
  plaintext: ArrayBuffer,
  base64Key: string
): Promise<ArrayBuffer> {
  const cryptoKey = await importKey(base64Key, ["encrypt"]);

  // Fresh random IV for every encryption operation
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    cryptoKey,
    plaintext
  );

  // Prepend IV to ciphertext so the decryptor can read it back
  return concatBuffers(iv.buffer, ciphertext);
}

// ─── Decryption ───────────────────────────────────────────────────────────────

/**
 * Decrypts an encrypted blob produced by encryptBuffer().
 *
 * @param encryptedBlob  Raw bytes: [ 12-byte IV | ciphertext ]
 * @param base64Key      The same Base64 key used during encryption
 * @returns              Decrypted plaintext as ArrayBuffer
 * @throws               DOMException if the key is wrong or data is corrupted
 */
export async function decryptBuffer(
  encryptedBlob: ArrayBuffer,
  base64Key: string
): Promise<ArrayBuffer> {
  const cryptoKey = await importKey(base64Key, ["decrypt"]);

  // Split the prepended IV from the actual ciphertext
  const iv = encryptedBlob.slice(0, IV_LENGTH);
  const ciphertext = encryptedBlob.slice(IV_LENGTH);

  return window.crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    cryptoKey,
    ciphertext
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Import a raw Base64 key string into a CryptoKey object. */
async function importKey(
  base64Key: string,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const rawKey = base64ToBuffer(base64Key);
  return window.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: ALGORITHM },
    false,   // not extractable on import — the key stays in the browser
    usages
  );
}

/** Concatenate two ArrayBuffers into one. */
function concatBuffers(a: ArrayBuffer, b: ArrayBuffer): ArrayBuffer {
  const result = new Uint8Array(a.byteLength + b.byteLength);
  result.set(new Uint8Array(a), 0);
  result.set(new Uint8Array(b), a.byteLength);
  return result.buffer;
}

/** Encode an ArrayBuffer as a Base64 string. */
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Decode a Base64 string back into an ArrayBuffer. */
export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
