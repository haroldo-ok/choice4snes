'use strict';

/**
 * choice4snes – compiler.js
 *
 * Invokes `make` inside the project folder to build the SNES ROM.
 * pvsneslib projects use a standard GNU Makefile that includes
 * $PVSNESLIB_HOME/devkitsnes/snes_rules — so we just run make
 * with PVSNESLIB_HOME set in the environment.
 */

const { existsSync } = require('fs');
const { normalize }  = require('path');
const chalk          = require('chalk');
const { execute }    = require('./executor');

const compile = async commandLine =>
    new Promise((resolve, reject) => {
        console.log(chalk.blue('Building SNES ROM with make...'));

        const projectFolder = normalize(`${commandLine.projectDir}/${commandLine.project}/`);
        if (!existsSync(projectFolder)) {
            return resolve({ errors: [{ message: `Project folder not found: ${projectFolder}` }] });
        }

        const makefileExists = existsSync(normalize(`${projectFolder}/Makefile`));
        if (!makefileExists) {
            return resolve({ errors: [{ message: `Makefile not found in ${projectFolder}; run "transpile" first.` }] });
        }

        // Resolve the pvsneslib home from CLI arg or environment
        const pvsnesHome = commandLine.pvsnesLibHome ||
                           commandLine.pvsneslib_home ||
                           process.env.PVSNESLIB_HOME;

        if (!pvsnesHome || !existsSync(pvsnesHome)) {
            return resolve({ errors: [{
                message: 'pvsneslib not found at "' + pvsnesHome + '". ' +
                         'Set --pvsneslib-home or the PVSNESLIB_HOME environment variable.'
            }] });
        }

        // Determine the make executable (devkitsnes ships its own make on Windows)
        const makeExe = process.platform === 'win32'
            ? normalize(pvsnesHome + '/devkitsnes/bin/make.exe')
            : 'make';

        const env = {
            ...process.env,
            PVSNESLIB_HOME: pvsnesHome
        };

        execute(makeExe, ['all'], {
            appName: 'pvsneslib make',
            cwd:     projectFolder,
            env
        }).then(resolve).catch(reject);
    });

module.exports = { compile };
