/**
 * A one-time reference for a "Pay" tap. If the request is retried (bad network, double tap),
 * the server sees the same reference and never charges twice. Not a secret, just unique.
 */
export function newClientReference(): string {
  const random = () => Math.random().toString(36).slice(2, 10);
  return `m-${Date.now().toString(36)}-${random()}${random()}`;
}
