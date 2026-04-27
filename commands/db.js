const fs = require('fs');
const path = require('path');

const chalk = require('chalk');
const ora = require('ora');

const config = require('../config');

function failUnsupportedSqlCommand(name) {
  console.error(
    chalk.red('✗'),
    `${name} 는 현재 백엔드 API에 없습니다. APIDOCS.md에는 SQL push/pull/diff 엔드포인트가 정의되어 있지 않아요.`
  );
  process.exit(1);
}

function normalizeSql(sql) {
  return String(sql || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/g, '');
}

function readSqlFile(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`파일을 찾을 수 없어요: ${file}`);
  }

  const stat = fs.statSync(file);
  if (!stat.isFile()) {
    throw new Error(`파일 경로가 아니에요: ${file}`);
  }

  return normalizeSql(fs.readFileSync(file, 'utf8'));
}

function extractSqlPayload(data) {
  if (typeof data === 'string') return normalizeSql(data);
  if (typeof data?.sql === 'string') return normalizeSql(data.sql);
  throw new Error('원격 SQL 응답 형식이 올바르지 않아요.');
}

function extractStats(data) {
  return {
    tables: data?.tables ?? data?.tableCount ?? data?.stats?.tables ?? 0,
    columns: data?.columns ?? data?.columnCount ?? data?.stats?.columns ?? 0
  };
}

function ensureParentDir(file) {
  const dir = path.dirname(path.resolve(file));
  fs.mkdirSync(dir, { recursive: true });
}

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

  db.command('ls').option('--search <query>', 'Search database title').action(async (options) => {
    const spinner = ora('DB 다이어그램 목록 불러오는 중...').start();
    try {
      const client = config.createApiClient();
      const { data } = await client.get('/databases/search', {
        params: { q: options.search }
      });
      spinner.succeed('완료');
      const rows = Array.isArray(data) ? data : data.items || [];
      if (rows.length === 0) {
        console.log(chalk.dim('데이터베이스 페이지가 없습니다.'));
        return;
      }

      rows.forEach((item, idx) => {
        const meta = [item.id, item.databaseId].filter(Boolean).join(' · ');
        console.log(
          `${chalk.dim(String(idx + 1).padStart(2, ' '))} ${chalk.bold(item.name || item.title || item.id)} ${chalk.dim(meta)}`
        );
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
    .action(async (file) => {
      readSqlFile(file);
      failUnsupportedSqlCommand('db push');
    });

  db
    .command('pull <pageId>')
    .option('-o, --output <file>', 'Write sql to file')
    .action(async (_pageId, options) => {
      if (options.output) {
        ensureParentDir(options.output);
      }
      failUnsupportedSqlCommand('db pull');
    });

  db.command('diff <file> <pageId>').action(async (file) => {
    readSqlFile(file);
    failUnsupportedSqlCommand('db diff');
  });
}

module.exports = { registerDbCommands };
