/**
 * Server-side AES-256-GCM encryption for message content at rest.
 *
 * Requires MESSAGE_ENCRYPTION_KEY env var: 64-character hex string (32 bytes).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Stored format: "sse1:<12-byte IV hex>:<ciphertext+16-byte authTag hex>"
 *
 * Legacy messages (base64-encoded plaintext) are transparently decoded on read.
 * Old E2E-encrypted messages (empty encryptedContent or unreadable format) are
 * returned with a placeholder.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const PREFIX = 'sse1:'

function getKey(): Buffer {
  const raw = process.env.MESSAGE_ENCRYPTION_KEY
  if (!raw) throw new Error('MESSAGE_ENCRYPTION_KEY env var is not set')
  const buf = Buffer.from(raw, 'hex')
  if (buf.length !== 32) throw new Error('MESSAGE_ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
  return buf
}

/** Encrypt plaintext, returning a server-encrypted blob ready to store in DB. */
export function encryptText(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag() // 16 bytes
  return `${PREFIX}${iv.toString('hex')}:${Buffer.concat([encrypted, authTag]).toString('hex')}`
}

/** Decrypt a DB blob back to plaintext. Handles legacy base64 and SSE format. */
export function decryptText(stored: string): string {
  if (!stored) return ''

  // New server-side encrypted format
  if (stored.startsWith(PREFIX)) {
    try {
      const key = getKey()
      const rest = stored.slice(PREFIX.length)
      const colonIdx = rest.indexOf(':')
      if (colonIdx === -1) return '[Ошибка формата]'
      const iv = Buffer.from(rest.slice(0, colonIdx), 'hex')
      const fullBuf = Buffer.from(rest.slice(colonIdx + 1), 'hex')
      const authTag = fullBuf.subarray(fullBuf.length - 16)
      const ciphertext = fullBuf.subarray(0, fullBuf.length - 16)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(authTag)
      return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
    } catch {
      return '[Ошибка расшифровки]'
    }
  }

  // Legacy: base64-encoded plaintext (old messages before SSE)
  if (stored.length > 0 && stored !== '') {
    try {
      // Standard base64 decode with UTF-8 support
      return Buffer.from(stored, 'base64').toString('utf8')
    } catch {
      // Not base64 — probably old E2E-encrypted empty content
    }
  }

  return '[Archived]'
}
