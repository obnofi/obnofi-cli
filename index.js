#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');

const config = require('./config');
const { showSplash } = require('./splash');
const { registerAuthCommands, runLogin } = require('./commands/auth');
const { registerNoteCommands } = require('./commands/note');
const { registerDbCommands } = require('./commands/db');
const { registerFeedCommands } = require('./commands/feed');
const pkg = require('./package.json');

program
  .name('obnofi')
  .description('Obnofi workspace CLI')
  .version(pkg.version);

registerAuthCommands(program);
registerNoteCommands(program);
registerDbCommands(program);
registerFeedCommands(program);

program.hook('preAction', async (thisCommand, actionCommand) => {
  const parentName = actionCommand.parent?.name();
  if (parentName === 'auth') return;

  if (!config.getToken()) {
    console.log(chalk.dim('토큰이 없어서 로그인부터 진행합니다.'));
    await runLogin();
  }
});

if (process.argv.length === 2) {
  showSplash().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  program.parse(process.argv);
}
