import Axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

const client = Axios.create({ timeout: 10000 });

function shouldRetry(error: unknown): boolean {
  if (Axios.isCancel(error)) return false;
  if (!Axios.isAxiosError(error)) return true;
  const status = error.response?.status;
  return !status || status === 408 || status === 429 || status >= 500;
}

export async function getWithRetry<T = unknown>(
  url: string,
  config: AxiosRequestConfig = {},
  retries = 1
): Promise<AxiosResponse<T>> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await client.get<T>(url, config);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function isCanceledRequest(error: unknown): boolean {
  return Axios.isCancel(error) || (Axios.isAxiosError(error) && error.code === 'ERR_CANCELED');
}
