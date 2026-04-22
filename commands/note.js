const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const chalk = require('chalk');
const inquirer = require('inquirer');
const open = require('open').default;
const ora = require('ora');

const config = require('../config');

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
        const { data } = await client.get('/notes', {
          params: { search: options.search, limit: Number(options.limit) }
        });
        spinner.succeed('불러오기 완료');
        const rows = Array.isArray(data) ? data : data.items || [];
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
        const { data } = await client.post('/notes', { title });
        spinner.succeed('생성 완료');
        console.log(chalk.green('✓'), `id: ${chalk.dim(data.id)}`);
        if (options.open) {
          const url = `${config.getBaseUrl().replace('api.', '').replace(/\/$/, '')}/notes/${data.id}`;
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
      const { data } = await client.get(`/notes/${id}`);
      spinner.stop();
      console.log(`# ${data.title || ''}\n`);
      console.log(data.content || '');
    } catch (error) {
      spinner.fail('조회 실패');
      console.error(chalk.red('✗'), error.response?.data?.message || error.message);
      process.exit(1);
    }
  });

  note.command('edit <id>').action(async (id) => {
    const spinner = ora('노트 가져오는 중...').start();
    const tmpPath = path.join(os.tmpdir(), `obnofi-${id}.md`);
    try {
      const client = config.createApiClient();
      const { data } = await client.get(`/notes/${id}`);
      fs.writeFileSync(tmpPath, `# ${data.title || ''}\n\n${data.content || ''}`);
      spinner.succeed('에디터를 엽니다');

      const editor = process.env.EDITOR || 'vi';
      execSync(`${editor} ${tmpPath}`, { stdio: 'inherit' });

      const saved = fs.readFileSync(tmpPath, 'utf8');
      const lines = saved.split('\n');
      const first = lines[0] || '';
      const title = first.replace(/^#\s*/, '').trim();
      const content = lines.slice(2).join('\n').trim();

      const saveSpinner = ora('저장 중...').start();
      await client.patch(`/notes/${id}`, { title, content });
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
    .option('-y, --yes', 'Delete without confirmation')
    .action(async (id, options) => {
      if (!options.yes) {
        const answer = await inquirer.prompt([
          { type: 'confirm', name: 'ok', message: `노트 ${id} 를 삭제할까요?`, default: false }
        ]);
        if (!answer.ok) return;
      }

      const spinner = ora('삭제 중...').start();
      try {
        const client = config.createApiClient();
        await client.delete(`/notes/${id}`);
        spinner.succeed('삭제 완료');
      } catch (error) {
        spinner.fail('삭제 실패');
        console.error(chalk.red('✗'), error.response?.data?.message || error.message);
        process.exit(1);
      }
    });
}

module.exports = { registerNoteCommands };
