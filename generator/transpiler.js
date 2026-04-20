'use strict';

/**
 * choice4snes – transpiler.js
 *
 * Full pipeline:
 *   1. generate()        → C sources + resource lists
 *   2. convertImages()   → PNG → 4bpp indexed (ImageMagick)
 *   3. write files       → src/, res/, Makefile
 */

const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { copySync, existsSync: fseExists } = require('fs-extra');
const { normalize, basename } = require('path');
const { generate }     = require('./generator');
const { convertImages }= require('./image');

/* -------------------------------------------------------------------------
   Makefile generator
   pvsneslib uses GNU Make + $PVSNESLIB_HOME/devkitsnes/snes_rules.
   We generate one rule per image (gfx2snes / gfxconv call) and list all
   .it audio files for smconv.
   ------------------------------------------------------------------------- */
const generateMakefile = ({ header, romName, imageFiles, musicFiles, soundFiles }) => {
    const title  = (header.title  || 'Unnamed Story') .substring(0, 21).toUpperCase().padEnd(21);
    const author = (header.author || 'Unnamed Author').substring(0, 16).toUpperCase().padEnd(16);

    // Effects must come before music tracks in smconv
    const allAudio = [...soundFiles, ...musicFiles];
    const audioLine = allAudio.length
        ? 'AUDIOFILES\t:= ' + allAudio.map(f => `res/${basename(f)}`).join(' \\\n\t\t\t\t')
        : '# No audio files';

    // One gfxconv rule per image
    const gfxRules = imageFiles.map(f => {
        const base = basename(f).replace(/\.[^.]+$/, '');
        return [
            `# ${f}`,
            `res/${base}.pic: project/${basename(f)}`,
            `\t@echo "  GFX     $(notdir $<)"`,
            `\t$(GFXCONV) -s 8 -o 4 -u 16 -p -e 1 -t png -i $<`,
            `\t@mv ${base}.pic res/ 2>/dev/null || true`,
            `\t@mv ${base}.pal res/ 2>/dev/null || true`,
            `\t@mv ${base}.map res/ 2>/dev/null || true`,
            ``
        ].join('\n');
    }).join('\n');

    const picTargets = imageFiles
        .map(f => `res/${basename(f).replace(/\.[^.]+$/, '')}.pic`)
        .join(' \\\n\t\t ');

    return `# ------------------------------------------------------------
# choice4snes – generated Makefile  (do not edit by hand)
# ------------------------------------------------------------
ifeq ($(strip $(PVSNESLIB_HOME)),)
$(error "Set PVSNESLIB_HOME: see https://github.com/alekmaul/pvsneslib/wiki/Installation")
endif

${audioLine}
export SOUNDBANK\t:= res/soundbank

include ${PVSNESLIB_HOME}/devkitsnes/snes_rules

.PHONY: all bitmaps musics clean

export ROMNAME\t:= ${romName}
export ROMTITLE\t:= ${title}

SMCONVFLAGS\t:= -s -o $(SOUNDBANK) -V -b 5 -f

musics: $(SOUNDBANK).obj

# ---- Graphics conversion rules ----
${gfxRules}
bitmaps: ${picTargets || '# (none)'}

all: musics bitmaps $(ROMNAME).sfc

clean: cleanBuildRes cleanRom cleanGfx cleanAudio
`;
};

/* -------------------------------------------------------------------------
   transpile()
   ------------------------------------------------------------------------- */
const transpile = async commandLine => {
    const projectFolder = normalize(`${commandLine.projectDir}/${commandLine.project}/`);
    if (!existsSync(projectFolder)) {
        return { errors: [{ message: `Project folder not found: ${projectFolder}` }] };
    }

    const baseFolder = normalize(`${__dirname}/../base/`);
    if (!existsSync(baseFolder)) {
        return { errors: [{ message: `Base folder not found: ${baseFolder}` }] };
    }

    /* Virtual filesystem for the generator */
    const fileSystem = {
        readSource: name => {
            const fn = normalize(`${projectFolder}project/${name}.choice`);
            return readFileSync(fn, { encoding: 'utf8' });
        },
        fileExistsInProjectDir: fn =>
            existsSync(normalize(`${projectFolder}project/${fn}`))
    };

    /* --- 1. Code generation ------------------------------------------ */
    const result = generate(fileSystem);
    if (result.errors && result.errors.length) return result;

    /* --- 2. Ensure output directories ---------------------------------- */
    ['src/', 'res/'].forEach(d =>
        mkdirSync(normalize(`${projectFolder}${d}`), { recursive: true }));

    /* --- 3. Copy base runtime files (vn_engine.c/h, main.c) ------------ */
    copySync(normalize(`${baseFolder}src/`), normalize(`${projectFolder}src/`));

    /* --- 4. Copy any author-supplied extras from project/src & project/res */
    ['src/', 'res/'].forEach(d => {
        const extra = normalize(`${projectFolder}project/${d}`);
        if (existsSync(extra)) {
            copySync(extra, normalize(`${projectFolder}${d}`));
        }
    });

    /* --- 5. Write generated C sources ---------------------------------- */
    Object.entries(result.sources).forEach(([relPath, content]) => {
        // sources keys are already relative paths like 'src/generated_scripts.c'
        // hdr.asm goes to res/ (it's not a C file)
        const outPath = relPath === 'hdr.asm'
            ? normalize(`${projectFolder}res/${relPath}`)
            : normalize(`${projectFolder}${relPath}`);
        mkdirSync(normalize(outPath + '/..'), { recursive: true });
        writeFileSync(outPath, content, { encoding: 'utf8' });
    });

    /* --- 6. Image conversion ------------------------------------------- */
    const imgResult = await convertImages(result, projectFolder, commandLine);
    if (imgResult && imgResult.errors && imgResult.errors.length) return imgResult;

    /* --- 7. Generate Makefile ------------------------------------------ */
    const romName = (commandLine.project || 'mygame')
        .toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const makefile = generateMakefile({
        header:     result.header,
        romName,
        imageFiles: Object.keys(result.images  || {}),
        musicFiles: Object.keys(result.music   || {}),
        soundFiles: Object.keys(result.sound   || {})
    });
    writeFileSync(normalize(`${projectFolder}Makefile`), makefile, { encoding: 'utf8' });

    /* --- 8. Report ----------------------------------------------------- */
    const { log } = console;
    log('');
    log('  choice4snes transpile complete');
    log('  ─────────────────────────────────────────');
    log(`  Title   : ${result.header.title}`);
    log(`  Author  : ${result.header.author}`);
    log(`  ROM     : ${romName}.sfc`);
    log(`  Scenes  : ${Object.keys(result.sources).filter(k => k.endsWith('.c')).length}`);
    log(`  Images  : ${Object.keys(result.images  || {}).length}`);
    log(`  Music   : ${Object.keys(result.music   || {}).length}`);
    log(`  Sounds  : ${Object.keys(result.sound   || {}).length}`);
    if (result.warnings && result.warnings.length) {
        result.warnings.forEach(w => log(`  WARN    : ${w.message}`));
    }
    log('');
    log(`  Next: cd ${projectFolder} && make`);
    log('');

    return result;
};

module.exports = { transpile };
