import { Logger } from '@nestjs/common';

// Test apps log through a silent pino; anything constructed outside an app stays quiet too.
Logger.overrideLogger(false);
