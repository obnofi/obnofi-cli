const fs = require('fs');

const chalk = require('chalk');
const ora = require('ora');

const config = require('../config');

function diffLines(localSql, remoteSql) {
  const localLines = localSql.split('\n');
  const remoteLines = remoteSql.split('\n');
  const table = Array.from({ length: localLines.length + 1 }, () => Array(remoteLines.length + 1).fill(0));
  const result = [];

  for (let i = localLines.length - 1; i >= 0; i -= 1) {
    for (let j = remoteLines.length - 1; j >= 0; j -= 1) {
      table[i][j] = localLines[i] === remoteLines[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < localLines.length && j < remoteLines.length) {
    if (localLines[i] === remoteLines[j]) {
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      result.push(chalk.red(`- ${localLines[i]}`));
      i += 1;
    } else {
      result.push(chalk.green(`+ ${remoteLines[j]}`));
      j += 1;
    }
  }

  while (i < localLines.length) {
    result.push(chalk.red(`- ${localLines[i]}`));
    i += 1;
  }

  while (j < remoteLines.length) {
    result.push(chalk.green(`+ ${remoteLines[j]}`));
    j += 1;
  }

  return result;
}

function registerDbCommands(program) {
  const db = program.command('db').description('Database diagram commands');

  db.command('ls').action(async () => {
    const spinner = ora('DB 다이어그램 목록 불러오는 중...').start();
    try {
      const client = config.createApiClient();
      const { data } = await client.get('/blocks/db-diagram');
      spinner.succeed('완료');
      const rows = Array.isArray(data) ? data : data.items || [];
      rows.forEach((item, idx) => {
        console.log(`${chalk.dim(idx + 1)} ${chalk.bold(item.name || item.title || item.id)} ${chalk.dim(item.pageId || '')}`);
      });
    } catch (error) {
      spinner.fail('실패');
      console.error(chalk.red('✗'), error.response?.data?.message || error.message);
      process.exit(1);
    }
  });

  db
    .command('push <file> <pageId>')
    .option('--merge', 'Merge with existing schema')
    .action(async (file, pageId, options) => {
      const spinner = ora('스키마 업로드 중...').start();
      try {
        const sql = fs.readFileSync(file, 'utf8');
        const client = config.createApiClient();
        const { data } = await client.post(`/blocks/db-diagram/${pageId}/sql`, {
          sql,
          merge: Boolean(options.merge)
        });
        spinner.succeed('업로드 완료');
        console.log(chalk.green('✓'), `tables: ${chalk.dim(data.tables || 0)}, columns: ${chalk.dim(data.columns || 0)}`);
      } catch (error) {
        spinner.fail('업로드 실패');
        console.error(chalk.red('✗'), error.response?.data?.message || error.message);
        process.exit(1);
      }
    });

  db
    .command('pull <pageId>')
    .option('-o, --output <file>', 'Write sql to file')
    .action(async (pageId, options) => {
      const spinner = ora('원격 스키마 가져오는 중...').start();
      try {
        const client = config.createApiClient();
        const { data } = await client.get(`/blocks/db-diagram/${pageId}/sql`);
        spinner.succeed('완료');
        const sql = typeof data === 'string' ? data : data.sql;
        if (options.output) {
          fs.writeFileSync(options.output, sql, 'utf8');
          console.log(chalk.green('✓'), `${options.output} 저장 완료`);
        } else {
          console.log(sql);
        }
      } catch (error) {
        spinner.fail('실패');
        console.error(chalk.red('✗'), error.response?.data?.message || error.message);
        process.exit(1);
      }
    });

  db.command('diff <file> <pageId>').action(async (file, pageId) => {
    const spinner = ora('차이 계산 중...').start();
    try {
      const localSql = fs.readFileSync(file, 'utf8');
      const client = config.createApiClient();
      const { data } = await client.get(`/blocks/db-diagram/${pageId}/sql`);
      const remoteSql = typeof data === 'string' ? data : data.sql;
      spinner.succeed('완료');
      const lines = diffLines(localSql, remoteSql);
      if (!lines.length) {
        console.log(chalk.green('✓'), '차이가 없습니다.');
        return;
      }
      lines.forEach((line) => console.log(line));
    } catch (error) {
      spinner.fail('실패');
      console.error(chalk.red('✗'), error.response?.data?.message || error.message);
      process.exit(1);
    }
  });
}

module.exports = { registerDbCommands };
