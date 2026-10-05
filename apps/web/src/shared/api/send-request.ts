import type { ApiPath } from './api-path';
import { NetworkError } from './network-error';

export async function sendRequest(
  url: string,
  path: ApiPath,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    // An abort through the caller's signal is not a network failure.
    if (init.signal?.aborted === true) {
      throw error;
    }
    throw new NetworkError(path, error);
  }
}
