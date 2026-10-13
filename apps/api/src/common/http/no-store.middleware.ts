import type { NextFunction, Request, Response } from 'express';

// Middleware runs before guards, so rejected and throttled answers are not stored either.
export function noStore(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Cache-Control', 'no-store');
  next();
}
