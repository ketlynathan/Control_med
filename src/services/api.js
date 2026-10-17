export async function apiRequest(path, token, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  let body = null;
  try { body = await response.json(); } catch { /* Algumas respostas não têm JSON. */ }
  if (!response.ok) {
    const error = new Error(body?.error || 'Falha ao comunicar com o servidor.');
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}