const getApiBase = () => {
  const { hostname } = window.location;
  const localBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
  const tunnelBase = import.meta.env.VITE_API_TUNNEL_URL;

  // If we are on a public tunnel URL and we have a backend tunnel defined, use it.
  if (hostname.includes('trycloudflare.com') && tunnelBase) {
    return tunnelBase;
  }

  // Default to localhost for local dev.
  return localBase;
};

const API_BASE = getApiBase();

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

export function chatWithAssistant(message, language) {
  return apiPost('/api/v1/chat', { message, language });
}

export function getDemoSuggestion(alertLevel, language) {
  return apiPost('/api/v1/demo/suggestion', { alertLevel, language });
}

export function triggerWarningAlert(language) {
  return apiPost('/api/v1/demo/warning-alert', { language });
}

export function triggerHighAlert(language) {
  return apiPost('/api/v1/demo/high-alert', { language });
}
