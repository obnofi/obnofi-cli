const os = require('os');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
const Conf = require('conf').default;

let storeInstance;

function normalizeBaseUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return 'http://localhost:3000/api';

  let normalized = raw;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }

  const parsed = new URL(normalized.replace(/\/$/, ''));

  // In local development the HTTP API lives on the Next.js web app, not the ws server.
  if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && parsed.port === '3001') {
    parsed.port = '3000';
  }

  const base = parsed.toString().replace(/\/$/, '');
  if (/\/api$/i.test(base)) {
    return base;
  }

  return `${base}/api`;
}

function getStore() {
  if (!storeInstance) {
    storeInstance = new Conf({
      projectName: 'obnofi-cli',
      cwd: process.env.OBNOFI_CONFIG_DIR || path.join(os.homedir(), '.config', 'obnofi-cli'),
      defaults: {
        baseUrl: 'http://localhost:3000/api'
      }
    });
  }
  return storeInstance;
}

const store = new Proxy({}, {
  get(_target, prop) {
    const value = getStore()[prop];
    return typeof value === 'function' ? value.bind(getStore()) : value;
  }
});

function getToken() {
  return getStore().get('token');
}

function getBaseUrl() {
  return normalizeBaseUrl(getStore().get('baseUrl') || 'http://localhost:3000/api');
}

function getWebBaseUrl() {
  return getBaseUrl().replace(/\/api$/i, '');
}

function setBaseUrl(url) {
  getStore().set('baseUrl', normalizeBaseUrl(url));
}

function setAuth(payload) {
  getStore().set('token', payload.token || '');
  getStore().set('email', payload.email || '');
  getStore().set('userId', payload.userId || '');
}

function clearAuth() {
  getStore().delete('token');
  getStore().delete('email');
  getStore().delete('userId');
}

function getProfile() {
  return {
    email: getStore().get('email') || '',
    userId: getStore().get('userId') || ''
  };
}

function createApiClient() {
  const client = axios.create({
    baseURL: getBaseUrl()
  });

  client.interceptors.request.use((request) => {
    const token = getToken();
    if (token) {
      request.headers = request.headers || {};
      request.headers.Authorization = `Bearer ${token}`;
    }
    return request;
  });

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error && error.response && error.response.status === 401) {
        console.error(chalk.red('✗'), '인증이 필요하거나 세션이 만료됐어요. obnofi auth login');
        process.exit(1);
      }
      return Promise.reject(error);
    }
  );

  return client;
}

module.exports = {
  store,
  getToken,
  getBaseUrl,
  getWebBaseUrl,
  setBaseUrl,
  setAuth,
  clearAuth,
  getProfile,
  createApiClient,
  normalizeBaseUrl
};
