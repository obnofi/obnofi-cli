const os = require('os');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
const Conf = require('conf').default;

let storeInstance;

function getStore() {
  if (!storeInstance) {
    storeInstance = new Conf({
      projectName: 'obnofi-cli',
      cwd: process.env.OBNOFI_CONFIG_DIR || path.join(os.homedir(), '.config', 'obnofi-cli'),
      defaults: {
        baseUrl: 'https://api.obnofi.app'
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
  return getStore().get('baseUrl') || 'https://api.obnofi.app';
}

function setBaseUrl(url) {
  getStore().set('baseUrl', url);
}

function setAuth(payload) {
  getStore().set('token', payload.token);
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
        console.error(chalk.red('✗'), '토큰이 만료됐어요. obnofi auth login');
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
  setBaseUrl,
  setAuth,
  clearAuth,
  getProfile,
  createApiClient
};
