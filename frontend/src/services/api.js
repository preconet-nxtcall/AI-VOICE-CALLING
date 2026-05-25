import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

/** Attach Bearer token to every request if one exists and is structurally valid. */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && token.split('.').length === 3) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (token) {
    // Malformed token — remove it so the user is forced to re-login
    localStorage.removeItem('token');
  }
  return config;
});

/** Global response interceptor — handle 401/422 with silent refresh attempt. */
let _isRefreshing = false;
let _refreshSubscribers = [];

function _onRefreshed(newToken) {
  _refreshSubscribers.forEach((cb) => cb(newToken));
  _refreshSubscribers = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const originalRequest = error.config;

    // Attempt silent token refresh on 401 (expired token)
    if (status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('refresh_token');

      if (refreshToken && refreshToken.split('.').length === 3) {
        originalRequest._retry = true;

        if (_isRefreshing) {
          // Queue the request until refresh completes
          return new Promise((resolve) => {
            _refreshSubscribers.push((token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            });
          });
        }

        _isRefreshing = true;
        try {
          const res = await axios.post('/api/v1/auth/refresh', null, {
            headers: { Authorization: `Bearer ${refreshToken}` },
          });
          const newToken = res.data?.access_token;
          if (newToken) {
            localStorage.setItem('token', newToken);
            api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
            _onRefreshed(newToken);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        } catch (_) {
          // Refresh failed — clear tokens and redirect to login
        } finally {
          _isRefreshing = false;
        }
      }

      // No refresh token or refresh failed — force logout
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // 422 = invalid/malformed token — always force logout
    if (status === 422) {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
