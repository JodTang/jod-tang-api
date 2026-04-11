import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const passwordHashAlgorithm = 'scrypt'
const passwordKeyLength = 64

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = (await scrypt(password, salt, passwordKeyLength)) as Buffer
  return `${passwordHashAlgorithm}:${salt}:${derivedKey.toString('hex')}`
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, storedHashHex] = passwordHash.split(':')
  if (algorithm !== passwordHashAlgorithm || !salt || !storedHashHex) {
    return false
  }

  const storedHash = Buffer.from(storedHashHex, 'hex')
  if (storedHash.length === 0) {
    return false
  }

  const derivedKey = (await scrypt(password, salt, storedHash.length)) as Buffer
  return timingSafeEqual(derivedKey, storedHash)
}
