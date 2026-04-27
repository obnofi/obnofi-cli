const chalk = require('chalk');
const ora = require('ora');

const config = require('../config');

function registerFeedCommands(program) {
  const feed = program.command('feed').description('Feed commands');

  function unsupported() {
    console.error(chalk.red('✗'), 'APIDOCS.md 기준 현재 feed 관련 HTTP API는 문서화되어 있지 않아요.');
    process.exit(1);
  }

  feed.command('ls').action(async () => {
    unsupported();
  });

  feed
    .command('read')
    .option('--source <source>', 'Filter by source name')
    .option('-n, --limit <number>', 'Number of feed items', '10')
    .action(async () => {
      unsupported();
    });

  feed
    .command('add <url>')
    .description('새 피드 소스 추가')
    .action(async () => {
      unsupported();
    });

  feed
    .command('remove <source>')
    .description('피드 소스 제거')
    .action(async () => {
      unsupported();
    });
}

module.exports = { registerFeedCommands };
