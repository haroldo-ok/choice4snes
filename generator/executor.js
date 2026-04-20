'use strict';

const { spawn } = require('child_process');

/**
 * Execute an external process, streaming stdout/stderr to the console.
 * Resolves with {} on success, or { errors: [...] } on non-zero exit.
 */
const execute = (execName, parameters, { appName, cwd, env } = {}) =>
    new Promise((resolve, reject) => {
        const proc = spawn(execName, parameters, { cwd, env: env || process.env });
        proc.stdout.on('data', data => process.stdout.write(data));
        proc.stderr.on('data', data => process.stderr.write(data));
        proc.on('error', err => resolve({
            errors: [{ message: `Failed to start "${appName}": ${err.message}` }]
        }));
        proc.on('close', code => {
            if (!code) {
                resolve({});
            } else {
                console.error(`${appName} exited with code ${code}`);
                resolve({ errors: [{ message: `${appName} returned an error (exit code ${code}).` }] });
            }
        });
    });

module.exports = { execute };
