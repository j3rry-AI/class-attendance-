export function prepareRequestBody(body, headers = {}) {
  if (body === undefined || body === null) {
    return { body, headers };
  }

  const hasFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const hasBlob = typeof Blob !== 'undefined' && body instanceof Blob;
  const hasArrayBuffer = typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer;
  const hasUrlSearchParams = typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams;

  const hasContentType = !!(headers['Content-Type'] || headers['content-type']);
  const shouldJsonify = !hasFormData && !hasBlob && !hasArrayBuffer && !hasUrlSearchParams && typeof body === 'object';

  if (shouldJsonify) {
    if (!hasContentType) {
      headers['Content-Type'] = 'application/json';
    }
    return { body: JSON.stringify(body), headers };
  }

  return { body, headers };
}

export async function apiFetch(url, options) {
  options = options || {};
  options.headers = options.headers || {};

  const prepared = prepareRequestBody(options.body, options.headers);
  options.body = prepared.body;
  options.headers = prepared.headers;

  let token = null;
  try {
    token = window.localStorage.getItem('token') || window.localStorage.getItem('authToken');
    if (token && !options.headers.Authorization && !options.headers.authorization) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
    if (import.meta.env.DEV) {
      const normalizedUrl = new URL(url, window.location.origin).pathname;
      console.debug('apiFetch', normalizedUrl, { hasToken: !!token, authHeader: options.headers.Authorization || options.headers.authorization });
      if (!token && normalizedUrl.startsWith('/api/')) {
        console.warn('apiFetch called without a token for protected endpoint:', normalizedUrl);
      }
    }
  } catch (e) {
    // ignore (e.g., server-side or tests without window)
  }

  // If body is a plain object and no content-type set, set JSON
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !options.headers['Content-Type'] && !options.headers['content-type']) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  if (res.status === 401) {
    try {
      window.localStorage.removeItem('token');
      window.localStorage.removeItem('authToken');
    } catch (e) {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
    return { ok: false, status: 401, error: { message: 'Unauthorized' } };
  }

  if (res.ok) {
    if (contentType.includes('application/json')) {
      const data = await res.json();
      return { ok: true, data };
    }
    const text = await res.text();
    return { ok: true, data: text };
  }

  // Non-2xx: try parse JSON, else text
  try {
    if (contentType.includes('application/json')) {
      const err = await res.json();
      return { ok: false, status: res.status, error: err };
    }
  } catch (e) {
    // fallthrough
  }

  const text = await res.text();
  return { ok: false, status: res.status, error: text };
}

export default apiFetch;
