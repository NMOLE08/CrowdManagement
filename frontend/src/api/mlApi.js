const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status}`);
  }
  return res.json();
}

export function getScene() {
  return apiGet('/api/v1/scene');
}

export function getHealth() {
  return apiGet('/health');
}

export function pushModelOutput(payload) {
  return apiPost('/api/v1/model-output', payload);
}

export function pushCameraModelOutput(cameras) {
  return apiPost('/api/v1/model-output', { cameras });
}
