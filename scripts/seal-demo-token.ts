// One-off (now idempotent): seal the known demo portal token into its link row
// so the "one persistent page" re-send returns the SAME token customers
// already have. Safe to re-run after an AUTH_SECRET rotation: re-seals with
// the CURRENT key, un-revokes the demo row, and revokes any other active
// PORTAL link for that customer so exactly one active link remains.
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { Database } from 'bun:sqlite'

const ENC_KEY = createHash('sha256')
  .update(process.env.AUTH_SECRET ?? 'sunpower-demo-signing-secret')
  .digest()

function sealToken(token: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const enc = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return [iv.toString('base64url'), enc.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.')
}

const db = new Database('db/custom.db')

// 1) seal the well-known demo token into its link row (re-openable with the
//    current key, even if the row was revoked by a rotation-era re-issue)
const token = '0oKmo4M2yx-AuOy8-MIQWg'
const hash = createHash('sha256').update(token).digest('hex')
const row: any = db.query('SELECT id, customerId, revokedAt FROM CustomerAccessLink WHERE tokenHash = ?').get(hash)
if (!row) {
  console.log('no link row for the demo token — nothing to do')
  process.exit(0)
}
db.query('UPDATE CustomerAccessLink SET tokenEnc = ?, revokedAt = NULL, lockedUntil = NULL, failedAttempts = 0 WHERE id = ?')
  .run(sealToken(token), row.id)
console.log('sealed known token into link', row.id, '(revokedAt cleared:', !!row.revokedAt, ')')

// 2) keep the single-active-link invariant: revoke any OTHER still-active
//    portal link for this customer (e.g. one minted after a key rotation)
const dups: any[] = db.query(
  "SELECT id FROM CustomerAccessLink WHERE customerId = ? AND scope='PORTAL' AND revokedAt IS NULL AND id != ?"
).all(row.customerId, row.id)
for (const d of dups) {
  db.query('UPDATE CustomerAccessLink SET revokedAt = ? WHERE id = ?').run(Date.now(), d.id)
  console.log('revoked duplicate active link', d.id)
}

// sanity: verify the seal opens with the current key
const sealed: any = db.query('SELECT tokenEnc FROM CustomerAccessLink WHERE id = ?').get(row.id)
const [ivB64, dataB64, tagB64] = (sealed.tokenEnc as string).split('.')
const dec = createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivB64, 'base64url'))
dec.setAuthTag(Buffer.from(tagB64, 'base64url'))
const opened = Buffer.concat([dec.update(Buffer.from(dataB64, 'base64url')), dec.final()]).toString('utf8')
console.log('seal round-trip ok:', opened === token)
db.close()
