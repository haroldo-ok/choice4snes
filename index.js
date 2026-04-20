'use strict';

/**
 * choice4snes – index.js
 * Main entry point.
 */

const chalk = require('chalk');
const { compact } = require('lodash');

const { transpile }        = require('./generator/transpiler');
const { compile }          = require('./generator/compiler');
const { emulate }          = require('./generator/emulator');
const { readCommandLine }  = require('./generator/commandline');
const { watchProject }     = require('./generator/watcher');
const { showMenu }         = require('./generator/ui');
const { showEditor }       = require('./editor/editor');

const commandLine = readCommandLine();

const handleErrors = result => {
    if (!result || !result.errors || !result.errors.length) return 0;
    result.errors.forEach(({ sourceName, line, message }) => {
        console.error(chalk.red(compact([
            sourceName && (sourceName + '.choice'),
            line       && ('line ' + line),
            message
        ]).join(': ')));
    });
    return -1;
};

const COMMANDS = { transpile, compile, emulate };

const executeCommands = async () => {
    const commandNames = commandLine._.filter(c => !['menu', 'edit'].includes(c));
    const toRun = compact(
        (commandNames.length ? commandNames : ['transpile', 'compile', 'emulate'])
        .map(name => COMMANDS[name])
    );

    for (const execute of toRun) {
        const result   = await execute(commandLine);
        const exitCode = handleErrors(result);
        if (exitCode) return { exitCode };
    }
};

if (commandLine._.includes('menu')) {
    showMenu(commandLine, executeCommands);
} else if (commandLine._.includes('edit')) {
    showEditor(commandLine, executeCommands);
} else if (commandLine.watch) {
    console.warn(chalk.yellow('Warning: --watch mode is experimental.'));
    watchProject(commandLine, executeCommands);
} else {
    executeCommands().then(finalResult => {
        if (finalResult && finalResult.exitCode) process.exit(-1);
    });
}
