const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const chalk = require('chalk');
const inquirer = require('inquirer');
const open = require('open').default;
const ora = require('ora');

const config = require('../config');

function formatContent(content) {
  if (typeof content === 'string') return content;
  if (content === null || typeof content === 'undefined') return '';
  return JSON.stringify(content, null, 2);
}

function parseEditedContent(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

function registerNoteCommands(program) {
  const note = program.command('note').description('Note commands');

  note
    .command('ls')
    .option('--search <query>', 'Search title keyword')
    .option('-n, --limit <number>', 'Number of notes', '20')
    .action(async (options) => {
      const spinner = ora('노트 목록 불러오는 중...').start();
      try {
        const client = config.createApiClient();
        const { data } = await client.get('/pages');
        spinner.succeed('불러오기 완료');
        const rows = (Array.isArray(data) ? data : data.items || [])
          .filter((item) => item.type === 'document')
          .filter((item) => {
            if (!options.search) return true;
            return String(item.title || '').toLowerCase().includes(String(options.search).toLowerCase());
          })
          .slice(0, Number(options.limit));

        if (rows.length === 0) {
          console.log(chalk.dim('표시할 문서가 없습니다.'));
          return;
        }

        rows.forEach((item, idx) => {
          console.log(
            `${chalk.dim(String(idx + 1).padStart(2, ' '))} ${chalk.bold(item.title || '(untitled)')} ${chalk.dim(item.updatedAt || '')} ${chalk.dim(item.id || '')}`
          );
        });
      } catch (error) {
        spinner.fail('실패');
        console.error(chalk.red('✗'), error.response?.data?.message || error.message);
        process.exit(1);
      }
    });

  note
    .command('new <title>')
    .option('--open', 'Open in browser after creation')
    .action(async (title, options) => {
      const spinner = ora('노트 생성 중...').start();
      try {
        const client = config.createApiClient();
        const { data } = await client.post('/pages', {
          title,
          type: 'document'
        });
        spinner.succeed('생성 완료');
        console.log(chalk.green('✓'), `id: ${chalk.dim(data.id)}`);
        if (options.open) {
          const url = `${config.getBaseUrl().replace(/\/$/, '')}/pages/${data.id}`;
          await open(url);
        }
      } catch (error) {
        spinner.fail('생성 실패');
        console.error(chalk.red('✗'), error.response?.data?.message || error.message);
        process.exit(1);
      }
    });

  note.command('cat <id>').action(async (id) => {
    const spinner = ora('노트 불러오는 중...').start();
    try {
      const client = config.createApiClient();
      const { data } = await client.get(`/pages/${id}`);
      spinner.stop();
      console.log(`# ${data.title || ''}\n`);
      console.log(formatContent(data.content));
    } catch (error) {
      spinner.fail('조회 실패');
      console.error(chalk.red('✗'), error.response?.data?.message || error.message);
      process.exit(1);
    }
  });

  note.command('edit <id>').action(async (id) => {
    const spinner = ora('노트 가져오는 중...').start();
    const tmpPath = path.join(os.tmpdir(), `obnofi-${id}.json`);
    try {
      const client = config.createApiClient();
      const { data } = await client.get(`/pages/${id}`);
      fs.writeFileSync(tmpPath, JSON.stringify({
        title: data.title || '',
        content: data.content || {}
      }, null, 2));
      spinner.succeed('에디터를 엽니다');

      const editor = process.env.EDITOR || 'vi';
      execSync(`${editor} ${tmpPath}`, { stdio: 'inherit' });

      const saved = JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
      const title = String(saved.title || '').trim();
      const content = parseEditedContent(JSON.stringify(saved.content ?? {}));

      const saveSpinner = ora('저장 중...').start();
      await client.patch(`/pages/${id}`, { title, content });
      saveSpinner.succeed('저장 완료');
      fs.unlinkSync(tmpPath);
      console.log(chalk.green('✓'), '수정 완료');
    } catch (error) {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      spinner.fail('수정 실패');
      console.error(chalk.red('✗'), error.response?.data?.message || error.message);
      process.exit(1);
    }
  });

  note
    .command('delete <id>')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (id, options) => {
      if (!options.yes) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `정말로 '${id}' 노트를 삭제하시겠습니까?`,
            default: false
          }
        ]);
        if (!confirm) {
          console.log('취소되었습니다.');
          return;
        }
      }

      const spinner = ora('노트 삭제 중...').start();
      try {
        const client = config.createApiClient();
        await client.delete(`/pages/${id}`);
        spinner.succeed('삭제 완료');
        console.log(chalk.green('✓'), '노트를 삭제했습니다.');
      } catch (error) {
        spinner.fail('삭제 실패');
        console.error(chalk.red('✗'), error.response?.data?.message || error.message);
        process.exit(1);
      }
    });
}

module.exports = { registerNoteCommands };
