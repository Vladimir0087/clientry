import { randomBytes } from 'node:crypto';

// RFC 9562: 48 bits of Unix milliseconds, the version, then random bits under the variant.
export function uuidV7At(time: Date): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(time.getTime(), 0, 6);
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x70, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
