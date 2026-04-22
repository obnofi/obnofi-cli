const os = require('os');
const path = require('path');

const axios = require('axios');
const chalk = require('chalk');
const Conf = require('conf').default;

const store = new Conf({
  projectName: 'obnofi-cli',
  cwd: process.env.OBNOFI_CONFIG_DIR || path.join(os.homedir(), '.config', 'obnofi-cli'),
  defaults: {
    baseUrl: 'https://api.obnofi.app'
  }
});

function getToken() {
  return store.get('token');
}

function getBaseUrl() {
  return store.get('baseUrl') || 'https://api.obnofi.app';
}

function setBaseUrl(url) {
  store.set('baseUrl', url);
}

function setAuth(payload) {
  store.set('token', payload.token);
  store.set('email', payload.email || '');
  store.set('userId', payload.userId || '');
}

function clearAuth() {
  store.delete('token');
  store.delete('email');
  store.delete('userId');
}

function getProfile() {
  return {
    email: store.get('email') || '',
    userId: store.get('userId') || ''
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
