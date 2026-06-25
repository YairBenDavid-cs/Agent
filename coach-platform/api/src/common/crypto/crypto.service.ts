import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

/**
 * Authenticated symmetric encryption for credentials at rest (AES-256-GCM).
 *
 * The key is sourced from config (CREDENTIALS_ENCRYPTION_KEY) which in
 * production must come from a secrets manager/KMS — never from the database.
 * If the DB leaks, ciphertext is useless without the key.
 *
 * Output format: "v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>".
 */
@Injectable()
export class CryptoService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_BYTES = 12; // GCM standard nonce size
  private static readonly VERSION = 'v1';

  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(
      config.getOrThrow<string>('CREDENTIALS_ENCRYPTION_KEY'),
      'hex',
    );
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(CryptoService.IV_BYTES);
    const cipher = createCipheriv(CryptoService.ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      CryptoService.VERSION,
      iv.toString('hex'),
      authTag.toString('hex'),
      ciphertext.toString('hex'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [version, ivHex, tagHex, dataHex] = payload.split(':');
    if (version !== CryptoService.VERSION || !ivHex || !tagHex || !dataHex) {
      throw new Error('Malformed ciphertext payload.');
    }
    const decipher = createDecipheriv(
      CryptoService.ALGORITHM,
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
}
