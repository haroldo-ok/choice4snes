'use strict';

/**
 * choice4snes – commandline.js
 *
 * CLI argument parsing.  Replaces --sgdk-dir with --pvsneslib-home and
 * changes the emulator default to a SNES emulator (snes9x / bsnes).
 */

const yargs    = require('yargs');
const { normalize } = require('path');

const readCommandLine = () => yargs
    .command('transpile <project>', 'Generate pvsneslib-compatible C source from .choice scripts', yargs => {
        yargs.positional('project', { describe: 'Project name to transpile', type: 'string' });
    })
    .command('compile <project>', 'Build the SNES ROM from transpiled source (runs make)', yargs => {
        yargs.positional('project', { describe: 'Project name to compile', type: 'string' });
    })
    .command('emulate <project>', 'Launch the compiled ROM in a SNES emulator', yargs => {
        yargs.positional('project', { describe: 'Project name to emulate', type: 'string' });
    })
    .command('menu', 'Show an interactive project selection menu')
    .command('edit', 'Open the web-based scene editor')
    .options({
        'project-dir': {
            alias:     'pd',
            default:   normalize(__dirname + '/../examples'),
            normalize: true,
            describe:  'Directory where projects are located',
            type:      'string'
        },
        'imagemagick-dir': {
            alias:     'kd',
            default:   normalize(__dirname + '/../../ImageMagick-7.0.10-53-portable-Q16-x86'),
            normalize: true,
            describe:  'Directory where ImageMagick is located',
            type:      'string'
        },
        'pvsneslib-home': {
            alias:     'ph',
            default:   process.env.PVSNESLIB_HOME || normalize(__dirname + '/../../pvsneslib'),
            normalize: true,
            describe:  'Path to pvsneslib root (same as PVSNESLIB_HOME env var)',
            type:      'string'
        },
        'emulator-exe': {
            alias:     'ee',
            default:   process.env.SNES_EMULATOR ||
                       normalize(__dirname + '/../../snes9x/snes9x.exe'),
            normalize: true,
            describe:  'SNES emulator executable (snes9x, bsnes, mesen-s, ...)',
            type:      'string'
        },
        'watch': {
            alias:   'w',
            default: false,
            boolean: true,
            describe: 'Watch the project for changes and re-transpile automatically'
        },
        'hot-reload-frontend': {
            alias:   'hf',
            default: false,
            boolean: true,
            describe: 'Serve the editor frontend via Parcel dev server (live reload)'
        },
        'open-browser': {
            alias:   'ob',
            default: true,
            boolean: true,
            describe: 'Automatically open the editor in the default browser'
        }
    })
    .demandCommand(1, 'Please specify a command (transpile / compile / emulate / menu / edit)')
    .example([
        ['$0 transpile test',                     'Transpile the project called "test"'],
        ['$0 compile   test',                     'Compile (make) without re-transpiling'],
        ['$0 emulate   test',                     'Run the existing ROM in the emulator'],
        ['$0 transpile test -- compile',          'Transpile then compile'],
        ['$0 transpile test -- compile emulate',  'Transpile, compile and run'],
        ['$0 menu',                               'Interactive project selection menu'],
        ['$0 edit',                               'Open the web-based scene editor']
    ])
    .strict()
    .help()
    .alias('transpile', 't')
    .alias('compile',   'c')
    .alias('emulate',   'e')
    .argv;

module.exports = { readCommandLine };
