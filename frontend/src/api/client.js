/* =====================================================================
   HTTP-клиент. Единственное место с адресом API и обработкой ошибок.
   По умолчанию Nginx перенаправляет /api в контейнер FastAPI.
   ===================================================================== */

const API_BASE = import.meta.env.VITE_API_BASE || '';

export async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  const isUpload = body instanceof FormData;

  if (body && !isUpload) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: body ? (isUpload ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error('Нет связи с баром. Проверьте подключение и попробуйте снова.');
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : 'Проверьте заполненные поля';
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return data;
}

// Поддерживает исходные фото сайта и фотографии, сохранённые через API.
export function imageSource(path) {
  if (!path) return '';
  if (path.startsWith('/uploads/')) return `${API_BASE}${path}`;
  return path.startsWith('assets/') ? `/${path}` : path;
}
