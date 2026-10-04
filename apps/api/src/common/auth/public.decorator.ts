import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const IS_PUBLIC_KEY = 'auth:isPublic';

// setupSwagger turns the extension into an empty security requirement for the operation.
export const PUBLIC_OPERATION_EXTENSION = 'x-public';

export function Public(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(IS_PUBLIC_KEY, true),
    ApiExtension(PUBLIC_OPERATION_EXTENSION, true),
  );
}
