import { InvalidConfigError } from '@clientry/shared/common';

import { loadConfig } from './app-config.js';
import type { AppConfig } from './app-config.js';

// Before the logger exists, so a config error goes to stderr as plain text.
export function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof InvalidConfigError)) {
      throw error;
    }
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
