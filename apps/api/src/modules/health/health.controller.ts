import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { livenessResponseSchema, readinessResponseSchema } from '@clientry/shared/health';
import type { LivenessResponse, ReadinessResponse } from '@clientry/shared/health';

import { HealthService } from './health.service.js';
import { ResponseSchema } from '../../common/http/response-schema.decorator.js';

// Probes are infrastructure: the proxy does not forward /health, so they stay out of Swagger.
@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ResponseSchema(HttpStatus.OK, livenessResponseSchema)
  getLiveness(): LivenessResponse {
    return this.health.getLiveness();
  }

  @Get('ready')
  @ResponseSchema(HttpStatus.OK, readinessResponseSchema)
  getReadiness(): Promise<ReadinessResponse> {
    return this.health.getReadiness();
  }
}
