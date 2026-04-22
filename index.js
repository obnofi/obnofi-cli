#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');

const config = require('./config');
const { registerAuthCommands } = require('./commands/auth');
const { registerNoteCommands } = require('./commands/note');
const { registerDbCommands } = require('./commands/db');
const { registerFeedCommands } = require('./commands/feed');

program
  .name('obnofi')
  .description('Obnofi workspace CLI')
  .version('1.0.0');

registerAuthCommands(program);
registerNoteCommands(program);
registerDbCommands(program);
registerFeedCommands(program);

program.hook('preAction', (thisCommand, actionCommand) => {
  const parentName = actionCommand.parent?.name();
  const commandName = actionCommand.name();
  if (parentName === 'auth' && ['login', 'logout'].includes(commandName)) return;

  const token = config.getToken();
  if (!token) {
    console.error(chalk.red('✗'), '로그인이 필요해요. obnofi auth login');
    process.exit(1);
  }
});

program.parse(process.argv);


