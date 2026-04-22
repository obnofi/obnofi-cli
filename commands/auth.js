const chalk = require('chalk');
const inquirer = require('inquirer');
const open = require('open').default;
const ora = require('ora');

const config = require('../config');

function registerAuthCommands(program) {
  const auth = program.command('auth').description('Authentication commands');

  auth
    .command('login')
    .option('--token <token>', 'Access token')
    .option('--url <url>', 'Self-hosted API URL')
    .action(async (options) => {
      const previousBaseUrl = config.getBaseUrl();
      const previousToken = config.store.get('token');
      const baseUrl = options.url || config.getBaseUrl();
      if (options.url) config.setBaseUrl(options.url);

      let token = options.token;
      if (!token) {
        const authUrl = `${baseUrl.replace(/\/$/, '')}/cli-auth`;
        console.log(chalk.dim('브라우저를 엽니다:'), chalk.cyan(authUrl));
        await open(authUrl);
        const answer = await inquirer.prompt([
          {
            type: 'password',
            name: 'token',
            message: '발급받은 CLI 토큰을 입력하세요:',
            mask: '*'
          }
        ]);
        token = answer.token;
      }

      if (!token) {
        console.error(chalk.red('✗'), '토큰이 비어 있어요.');
        process.exit(1);
      }

      const spinner = ora('토큰 검증 중...').start();
      try {
        config.store.set('token', token);
        const client = config.createApiClient();
        const { data } = await client.get('/auth/me');
        config.setAuth({
          token,
          email: data.email,
          userId: data.userId || data.id
        });
        spinner.succeed('로그인 완료');
        console.log(chalk.green('✓'), `${data.email || 'unknown'} 계정으로 로그인됨`);
      } catch (error) {
        if (previousToken) {
          config.store.set('token', previousToken);
        } else {
          config.clearAuth();
        }
        config.setBaseUrl(previousBaseUrl);
        spinner.fail('로그인 실패');
        console.error(chalk.red('✗'), error.response?.data?.message || error.message);
        process.exit(1);
      }
    });

  auth.command('logout').action(() => {
    config.clearAuth();
    console.log(chalk.green('✓'), '로그아웃 완료');
  });

  auth.command('whoami').action(async () => {
    const spinner = ora('계정 정보 확인 중...').start();
    try {
      const client = config.createApiClient();
      const { data } = await client.get('/auth/me');
      spinner.succeed('확인 완료');
      console.log(chalk.bold(data.email || config.getProfile().email || 'unknown'));
      if (data.plan) console.log(chalk.dim(`plan: ${data.plan}`));
      if (data.id || data.userId) console.log(chalk.dim(`userId: ${data.id || data.userId}`));
    } catch (error) {
      spinner.fail('조회 실패');
      console.error(chalk.red('✗'), error.response?.data?.message || error.message);
      process.exit(1);
    }
  });
}

module.exports = { registerAuthCommands };
