import { applyDecorators, HttpCode, SerializeOptions } from '@nestjs/common';
import type { StandardSchemaSerializerContextOptions } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

type ResponseStandardSchema = NonNullable<StandardSchemaSerializerContextOptions['schema']>;

// One declaration for the status the handler answers with, the schema the serializer parses the
// result through, and the Swagger response, so the three cannot drift apart.
export function ResponseSchema(status: number, schema: ResponseStandardSchema): MethodDecorator {
  return applyDecorators(
    HttpCode(status),
    SerializeOptions({ schema }),
    ApiResponse({ status, standardSchema: schema }),
  );
}
