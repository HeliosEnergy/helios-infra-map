export const AUTH_EXPIRED_EVENT = 'helios-auth-expired';

export const authenticatedFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const response = await fetch(input, {
    ...init,
    credentials: init?.credentials || 'same-origin',
  });

  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }

  return response;
};
