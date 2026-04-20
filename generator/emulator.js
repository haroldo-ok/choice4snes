'use strict';

/**
 * choice4snes – emulator.js
 *
 * Launches the compiled .sfc ROM in a SNES emulator.
 * Supports snes9x, bsnes, and Mesen-S (any emulator that accepts a ROM path
 * as its first argument).
 */

const { existsSync, readdirSync } = require('fs');
const { normalize }               = require('path');
const { execute }                 = require('./executor');

/**
 * Find the compiled ROM file in the project folder.
 * pvsneslib places the ROM at <projectFolder>/<ROMNAME>.sfc
 */
const findRom = projectFolder => {
    try {
        const files = readdirSync(projectFolder);
        const rom   = files.find(f => f.endsWith('.sfc') || f.endsWith('.smc'));
        return rom ? normalize(`${projectFolder}/${rom}`) : null;
    } catch (_) {
        return null;
    }
};

const emulate = async commandLine =>
    new Promise((resolve, reject) => {
        const projectFolder = normalize(`${commandLine.projectDir}/${commandLine.project}/`);
        if (!existsSync(projectFolder)) {
            return resolve({ errors: [{ message: `Project folder not found: ${projectFolder}` }] });
        }

        const romFile = findRom(projectFolder);
        if (!romFile || !existsSync(romFile)) {
            return resolve({ errors: [{ message: `No .sfc ROM found in ${projectFolder}; run "compile" first.` }] });
        }

        const emulatorExe = normalize(commandLine.emulatorExe);
        if (!existsSync(emulatorExe)) {
            return resolve({ errors: [{
                message: `Emulator not found at "${emulatorExe}". ` +
                         `Set --emulator-exe or the SNES_EMULATOR environment variable.`
            }] });
        }

        execute(emulatorExe, [romFile], {
            appName: 'SNES emulator',
            cwd:     projectFolder
        }).then(resolve).catch(reject);
    });

module.exports = { emulate };
