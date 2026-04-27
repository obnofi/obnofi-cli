const crypto = require('crypto');
const http = require('http');
const os = require('os');
const { URL } = require('url');

const chalk = require('chalk');
const open = require('open').default;
const ora = require('ora');

const config = require('../config');

const CALLBACK_TIMEOUT_MS = 120000;
const CALLBACK_SUCCESS_TEXT = 'CLI authentication complete. You can return to the terminal.';

function getDeviceName() {
  const hostname = os.hostname().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return hostname || 'obnofi-cli';
}

function getCliAuthBaseUrl() {
  const webBase = config.getWebBaseUrl().replace(/\/$/, '');
  const url = new URL(webBase);

  if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '3001') {
    url.port = '3000';
  }

  return url.toString().replace(/\/$/, '');
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 32 * 1024) {
        reject(new Error('Callback payload too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (_error) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function createCallbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

function waitForCallback(server, expectedState) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      server.removeListener('request', onRequest);
      server.removeListener('error', onError);
      process.removeListener('SIGINT', onSigint);
      server.close(() => {
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      });
    };

    const onError = (error) => {
      finish(error);
    };

    const onSigint = () => {
      finish(new Error('로그인이 중단됐어요. 다시 시도해 주세요.'));
    };

    const onRequest = async (req, res) => {
      if (settled) {
        res.writeHead(409, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Authentication already completed');
        return;
      }

      if (req.method !== 'POST' || req.url !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      try {
        const body = await readJsonBody(req);

        if (body.state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid state');
          finish(new Error('콜백 state 검증에 실패했어요. 로그인 창을 다시 열어 주세요.'));
          return;
        }

        if (!body.token) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Missing token');
          finish(new Error('콜백에 토큰이 없어요. 브라우저에서 승인이 정상 완료됐는지 확인해 주세요.'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(CALLBACK_SUCCESS_TEXT);
        finish(null, body.token);
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(error.message || 'Invalid callback payload');
        finish(new Error('콜백 JSON 파싱에 실패했어요. 브라우저 승인 흐름을 다시 시도해 주세요.'));
      }
    };

    timeoutId = setTimeout(() => {
      finish(new Error('승인 시간이 초과됐어요. 120초 안에 브라우저에서 로그인을 완료해 주세요.'));
    }, CALLBACK_TIMEOUT_MS);

    server.on('request', onRequest);
    server.on('error', onError);
    process.once('SIGINT', onSigint);
  });
}

async function runLogin(options = {}) {
  const previousBaseUrl = config.getBaseUrl();
  const baseUrl = options.url ? config.normalizeBaseUrl(options.url) : config.getBaseUrl();

  if (options.url) {
    config.setBaseUrl(options.url);
  }

  let token = options.token;

  if (!token) {
    const authBase = getCliAuthBaseUrl();
    const state = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex');
    const callbackServer = await createCallbackServer();
    const port = callbackServer.address().port;
    const callbackUrl = `http://127.0.0.1:${port}/callback`;
    const authUrl = new URL('/cli-auth', authBase);
    authUrl.searchParams.set('callbackUrl', callbackUrl);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('name', getDeviceName());

    console.log(chalk.dim('브라우저를 엽니다:'), chalk.cyan(authUrl.toString()));
    const spinner = ora('브라우저에서 로그인/승인 중...').start();

    try {
      await open(authUrl.toString());
    } catch (error) {
      spinner.fail('브라우저를 열지 못했어요.');
      callbackServer.close();
      config.setBaseUrl(previousBaseUrl);
      console.error(chalk.red('✗'), error.message);
      process.exit(1);
    }

    try {
      token = await waitForCallback(callbackServer, state);
      spinner.succeed('브라우저 승인 완료');
    } catch (error) {
      spinner.fail('로그인 승인 실패');
      config.setBaseUrl(previousBaseUrl);
      console.error(chalk.red('✗'), error.message);
      process.exit(1);
    }
  }

  if (!token) {
    console.error(chalk.red('✗'), '토큰이 없어서 로그인할 수 없어요.');
    process.exit(1);
  }

  const spinner = ora('CLI 설정 저장 중...').start();
  try {
    config.setAuth({
      token
    });
    spinner.succeed('설정 완료');
    console.log(chalk.green('✓'), '로그인 완료');
    console.log(chalk.dim(`api: ${baseUrl}`));
  } catch (error) {
    config.setBaseUrl(previousBaseUrl);
    spinner.fail('로그인 실패');
    console.error(chalk.red('✗'), error.response?.data?.message || error.message);
    process.exit(1);
  }
}

function registerAuthCommands(program) {
  const auth = program.command('auth').description('Authentication commands');

  auth
    .command('login')
    .option('--token <token>', 'Access token')
    .option('--url <url>', 'Web or API base URL')
    .action(async (options) => runLogin(options));

  auth.command('logout').action(() => {
    config.clearAuth();
    console.log(chalk.green('✓'), '로그아웃 완료');
  });

  auth.command('whoami').action(async () => {
    const profile = config.getProfile();
    console.log(chalk.bold('Local CLI config'));
    console.log(chalk.dim(`api: ${config.getBaseUrl()}`));
    console.log(chalk.dim(`token: ${config.getToken() ? 'configured' : 'not set'}`));
    if (profile.email) console.log(chalk.dim(`email: ${profile.email}`));
    if (profile.userId) console.log(chalk.dim(`userId: ${profile.userId}`));
  });
}

module.exports = { registerAuthCommands, runLogin };
