// Shared by the Google and Microsoft connections.

export class AuthError extends Error {
  constructor(message, { silent = false } = {}) {
    super(message);
    this.silent = silent; // nothing for the user to see, e.g. a sign-in that was simply restarted
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs fn over items, a few at a time, to stay within the mail service's rate limits. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        if (err instanceof AuthError) throw err;
        results[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
