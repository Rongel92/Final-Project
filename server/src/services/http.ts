import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';

// Node's global fetch rejects a dispatcher from the userland undici package
// (UND_ERR_INVALID_ARG), so use undici's OWN fetch with the proxy agent applied.
// The agent honors HTTPS_PROXY / HTTP_PROXY / NO_PROXY (direct if unset) so
// outbound calls to Microsoft (Graph sendMail + the token endpoint) reach the
// internet through the corporate egress proxy on the cluster.
const proxyAgent = new EnvHttpProxyAgent();

export function proxyFetch(
  ...args: Parameters<typeof undiciFetch>
): ReturnType<typeof undiciFetch> {
  const [input, init] = args;
  return undiciFetch(input, { ...init, dispatcher: proxyAgent });
}

