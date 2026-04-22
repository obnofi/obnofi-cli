const chalk = require('chalk');
const ora = require('ora');

const config = require('../config');

function registerFeedCommands(program) {
  const feed = program.command('feed').description('Feed commands');

  feed.command('ls').action(async () => {
    const spinner = ora('피드 소스 조회 중...').start();
    try {
      const client = config.createApiClient();
      const { data } = await client.get('/feeds/sources');
      spinner.succeed('완료');
      const rows = Array.isArray(data) ? data : data.items || [];
      rows.forEach((item) => {
        console.log(`${chalk.bold(item.name || item.source)} ${chalk.dim(item.url || '')}`);
      });
    } catch (error) {
      spinner.fail('실패');
      console.error(chalk.red('✗'), error.response?.data?.message || error.message);
      process.exit(1);
    }
  });

  feed
    .command('read')
    .option('--source <source>', 'Filter by source name')
    .option('-n, --limit <number>', 'Number of feed items', '10')
    .action(async (options) => {
      const spinner = ora('피드 읽는 중...').start();
      try {
        const client = config.createApiClient();
        const { data } = await client.get('/feeds/items', {
          params: { source: options.source, limit: Number(options.limit) }
        });
        spinner.succeed('완료');
        const rows = Array.isArray(data) ? data : data.items || [];
        rows.forEach((item) => {
          console.log(`[${item.source || 'Feed'}] ${chalk.bold(item.title || '')}`);
          console.log(`        ${chalk.dim(item.url || '')} · ${chalk.dim(item.relativeTime || item.publishedAt || '')}`);
        });
      } catch (error) {
        spinner.fail('실패');
        console.error(chalk.red('✗'), error.response?.data?.message || error.message);
        process.exit(1);
      }
    });
}

module.exports = { registerFeedCommands };

