import { TEST_API_URL } from './fixtures';
import { SIGNING_KEYS } from './keys';

// Runs before any test imports getWebEnv, which parses the variables once per module graph.
process.env.API_URL = TEST_API_URL;
process.env.JWT_PUBLIC_KEY = SIGNING_KEYS.publicPem;
