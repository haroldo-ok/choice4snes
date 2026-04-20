'use strict';

/**
 * image.js  —  choice4snes image converter
 *
 * Wraps gfx4snes (the pvsneslib tool, previously called gfx2snes) to convert
 * PNG/BMP images into the .pic (tiles), .map and .pal (palette) files that
 * pvsneslib's data.asm includes via .incbin.
 *
 * gfx4snes flags used:
 *   -s 8        tile size = 8x8
 *   -o 16       output 16-color palette
 *   -u 16       limit to 16 unique colors
 *   -e 0        palette entry (0)
 *   -p          generate .pal file
 *   -m          generate .map file
 *   -i <file>   input file
 *
 * For backgrounds we also pass -t png (or -t bmp).
 */

const { existsSync } = require('fs');
const { normalize, extname, basename } = require('path');
const { copy, exists, stat } = require('fs-extra');
const { spawn } = require('child_process');

const runGfx4snes = (gfxToolPath, args) =>
    new Promise((resolve, reject) => {
        const proc = spawn(gfxToolPath, args);
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d; });
        proc.on('error', reject);
        proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`gfx4snes exited with code ${code}: ${stderr}`));
        });
    });

/**
 * Convert all images referenced by the generator result.
 *
 * @param {object} result       - Output of generator.generate()
 * @param {string} projectFolder - Absolute path to the project folder
 * @param {object} commandLine  - Parsed CLI args (needs .pvsneslib or .gfxToolPath)
 */
const convertImages = async (result, projectFolder, commandLine) => {
    const gfxToolPath = commandLine.gfxToolPath ||
        normalize((commandLine.pvsneslibHome || process.env.PVSNESLIB_HOME || '') +
                  '/devkitsnes/tools/gfx4snes');

    if (!existsSync(gfxToolPath)) {
        return {
            errors: [{
                message:
                    `gfx4snes not found at: ${gfxToolPath}\n` +
                    `Set PVSNESLIB_HOME or pass --gfx-tool-path to the CLI.`
            }]
        };
    }

    const errors = [];

    await Promise.all(
        Object.entries(result.images).map(async ([imageFile, { entity, variable }]) => {
            try {
                const ext = extname(imageFile).toLowerCase().replace('.', '');
                const sourceFile = normalize(`${projectFolder}/project/${imageFile}`);
                const destPic    = normalize(`${projectFolder}/${variable}.pic`);
                const destMap    = normalize(`${projectFolder}/${variable}.map`);
                const destPal    = normalize(`${projectFolder}/${variable}.pal`);

                // Skip conversion if all outputs exist and are newer than source
                if (await exists(destPic) && await exists(destMap) && await exists(destPal)) {
                    const srcStat = await stat(sourceFile);
                    const picStat = await stat(destPic);
                    if (srcStat.mtimeMs <= picStat.mtimeMs) {
                        console.log(`  Skipping (up-to-date): ${imageFile}`);
                        return;
                    }
                }

                console.log(`  Converting: ${imageFile} → ${variable}.pic/.map/.pal`);

                // Determine -t flag (bmp / png)
                const tFlag = (ext === 'bmp') ? 'bmp' : 'png';

                // For backgrounds the output basename must match variable name,
                // so we run gfx4snes with cwd = projectFolder
                const args = [
                    '-s', '8',
                    '-o', '16',
                    '-u', '16',
                    '-e', '0',
                    '-p',       // generate .pal
                    '-m',       // generate .map
                    '-t', tFlag,
                    '-i', sourceFile,
                    '-o', normalize(`${projectFolder}/${variable}`)
                ];

                await runGfx4snes(gfxToolPath, args);
            } catch (e) {
                const message = `Error converting image "${imageFile}": ${e.message}`;
                console.error(message);
                errors.push({ message });
            }
        })
    );

    return errors.length ? { errors } : result;
};

module.exports = { convertImages };
