import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

// One line per variable with literal \n, which .env files and hosting panels both accept.
function toEnvLine(name: string, pem: string): string {
  return `${name}=${pem.trim().replaceAll('\n', String.raw`\n`)}`;
}

process.stdout.write(
  `${toEnvLine('JWT_PRIVATE_KEY', privateKey)}\n${toEnvLine('JWT_PUBLIC_KEY', publicKey)}\n`,
);
