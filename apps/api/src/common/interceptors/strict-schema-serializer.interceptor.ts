import { Injectable, StandardSchemaSerializerInterceptor, StreamableFile } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { concatMap } from 'rxjs';
import type { Observable } from 'rxjs';

import { ResponseContractError } from './response-contract.error.js';

// Nest's version skips bodies without a schema, primitives and falsy values, and parses arrays per
// item; here every body is parsed whole and a missing schema is an error, so no field leaks.
@Injectable()
export class StrictSchemaSerializerInterceptor extends StandardSchemaSerializerInterceptor {
  override intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.getContextOptions(context);
    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    return next.handle().pipe(
      concatMap(async (body: unknown) => {
        if (body === undefined || body instanceof StreamableFile) {
          return body;
        }
        if (!options?.schema) {
          throw new ResponseContractError(handler, 'returned a body without @ResponseSchema');
        }
        const result = await options.schema['~standard'].validate(body, options.validateOptions);
        if (result.issues) {
          const messages = result.issues.map((issue) => issue.message).join('; ');
          throw new ResponseContractError(handler, `returned a body off its schema: ${messages}`);
        }
        return result.value;
      }),
    );
  }
}
