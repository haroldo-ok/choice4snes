'use strict';

/**
 * generator.js  —  choice4snes code generator
 *
 * Takes an AST produced by the parser (identical syntax to choice4genesis)
 * and emits pvsneslib-compatible C code instead of SGDK-compatible code.
 *
 * Key differences from the Genesis generator:
 *   - Images are referenced as separate tiles/map/palette arrays (gfx2snes output)
 *   - Audio uses snesmod indices (spcLoad/spcEffect) rather than XGM pointers
 *   - No SpriteDefinition cursor; cursor is a text character instead
 *   - Resource declarations use pvsneslib's .pic / .map / .pal conventions
 */

const { compact } = require('lodash');
const { parse } = require('../parser/syntax-full');
const { createNamespace } = require('./namespace');
const { generateExpression } = require('./expression');

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const buildEntityError = ({ line }, message) => ({ line, message });

const getStringConstant = (entity, parameter, context, name) => {
    if (!parameter) { context.errors.push(buildEntityError(entity, name + ' was not informed.')); return null; }
    if (parameter[0] !== 'StringConstant') context.errors.push(buildEntityError(entity, name + ' must be a string constant.'));
    return parameter[1];
};

const getFileNameConstant = (entity, parameter, context, name) => {
    const fileName = getStringConstant(entity, parameter, context, name);
    if (!fileName) return null;
    if (!context.fileSystem.fileExistsInProjectDir(fileName)) {
        context.errors.push(buildEntityError(entity, `${name} points to a missing file: "${fileName}".`));
    }
    return fileName;
};

const getNumber = (entity, parameter, context, name) => {
    if (!parameter) { context.errors.push(buildEntityError(entity, name + ' was not informed.')); return null; }
    if (parameter[0] !== 'NumberConstant') context.errors.push(buildEntityError(entity, name + ' must be a number.'));
    return parameter[1];
};

const getIdentifier = (entity, parameter, context, name) => {
    if (!parameter) { context.errors.push(buildEntityError(entity, name + ' was not informed.')); return null; }
    if (parameter[0] !== 'Identifier') context.errors.push(buildEntityError(entity, name + ' must be an identifier.'));
    return parameter[1];
};

const getConstant = (entity, parameter, context, name) => {
    if (!parameter) { context.errors.push(buildEntityError(entity, name + ' was not informed.')); return null; }
    const type = parameter[0] === 'NumberConstant' ? 'int' : parameter[0] === 'BoolConstant' ? 'bool' : null;
    if (!type) context.errors.push(buildEntityError(entity, name + ' must be an integer or boolean constant.'));
    const value = parameter[1];
    const code  = type === 'bool' ? value.toString().toUpperCase() : value.toString();
    return { type, value, code };
};

const getExpression = (entity, parameter, context, name) => {
    if (!parameter) { context.errors.push(buildEntityError(entity, name + ' was not informed.')); return null; }
    return generateExpression(entity, parameter, context);
};

const indent = (...params) =>
    params
        .map(o => !o ? '' : o.split ? o.split('\n') : o.flat ? o.flat() : `// Unknown: ${o}`)
        .flat().map(o => o.split ? o.split('\n') : o).flat()
        .map(s => '\t' + s).join('\n');

/* ------------------------------------------------------------------ */
/* Resource tracking                                                    */
/* ------------------------------------------------------------------ */

/**
 * Each image resource becomes extern declarations for the arrays produced by
 * gfx2snes / gfxconv:
 *   <var>Tiles[] / <var>Tiles_end  – tile graphics
 *   <var>Map[]   / <var>Map_end    – tilemap
 *   <var>Pal[]   / <var>Pal_end    – palette (BGR555 words)
 *
 * pvsneslib convention: size = &<var>Tiles_end - &<var>Tiles
 */
const addImageResource = (map, fileName) => {
    if (map[fileName]) return map[fileName].variable;
    const suffix = fileName.trim().replace(/\W+/g, '_');
    let variable = /^[^A-Za-z_]/.test(suffix) ? '_' + suffix : suffix;
    // deduplicate
    let n = 1;
    const existing = Object.values(map).map(o => o.variable);
    while (existing.includes(variable)) variable = (suffix) + '_' + n++;
    map[fileName] = { variable };
    return variable;
};

/**
 * Audio resources are IT module files converted by smconv.
 * smconv generates a soundbank and a header with MOD_xxx / SFX_xxx defines.
 * We track the logical index for each file in the order they were declared.
 */
const addMusicResource = (map, fileName) => {
    if (map[fileName] !== undefined) return map[fileName];
    const index = Object.keys(map).length;
    map[fileName] = index;
    return index;
};

const addSoundResource = (map, fileName) => {
    if (map[fileName] !== undefined) return map[fileName];
    const index = Object.keys(map).length;
    map[fileName] = index;
    return index;
};

/* ------------------------------------------------------------------ */
/* Variable declarations                                               */
/* ------------------------------------------------------------------ */

const generateVariableDeclarations = namespace =>
    namespace.list().map(({ value }) => value.code).join('\n');

/* ------------------------------------------------------------------ */
/* Image command helper                                                 */
/* ------------------------------------------------------------------ */

const generateImageCommand = (functionName, entity, context, generatedFlags = '') => {
    const imageFileName = getFileNameConstant(entity, entity.params.positional.fileName, context, 'Image filename');
    if (!imageFileName) return null;

    const v = addImageResource(context.res.gfx, imageFileName);
    if (!context.images[imageFileName]) {
        context.images[imageFileName] = { entity, imageFileName, variable: v };
    }

    const position = entity.params.named && entity.params.named.at;
    const positionSrc = position ? `VN_imageAt(${position.x[1]}, ${position.y[1]});\n` : '';

    /* pvsneslib gfxconv produces label pairs for each converted image:
         <var>Tiles / <var>TilesEnd   – tile graphics (u8[])
         <var>Map   / <var>MapEnd     – BG tilemap    (u8[])
         <var>Pal   / <var>PalEnd     – BGR555 palette(u8[])
       Byte size = (EndLabel - StartLabel).

       Engine signatures (vn_engine.h):
         VN_background(tiles, map, pal, tileSize, mapSize, palSize)
         VN_image     (tiles, map, pal, tileSize, mapSize, palSize, flags)
    */
    const tSz = `(u16)(&${v}TilesEnd - ${v}Tiles)`;
    const mSz = `(u16)(&${v}MapEnd   - ${v}Map)`;
    const pSz = `(u16)(&${v}PalEnd   - ${v}Pal)`;

    if (functionName === 'VN_background') {
        return `${positionSrc}VN_background(${v}Tiles, ${v}Map, ${v}Pal, ${tSz}, ${mSz}, ${pSz});`;
    }
    const flags = generatedFlags || 'LAYER_BACKGROUND';
    return `${positionSrc}VN_image(${v}Tiles, ${v}Map, ${v}Pal, ${tSz}, ${mSz}, ${pSz}, ${flags});`;
};

const generateFlags = (entity, prefix) =>
    Object.entries(entity.params.flags || {})
        .filter(([, v]) => v)
        .map(([k]) => `${prefix}_${k.toUpperCase()}`)
        .join('|');

/* ------------------------------------------------------------------ */
/* Command generators                                                   */
/* ------------------------------------------------------------------ */

let generateFromBody;

const COMMAND_GENERATORS = {
    /* ------ Graphics ------ */
    'background': (entity, context) =>
        generateImageCommand('VN_background', entity, context),

    'image': (entity, context) =>
        generateImageCommand('VN_image', entity, context,
            generateFlags(entity, 'LAYER') || 'LAYER_BACKGROUND'),

    'font': (entity, context) => {
        const imageFileName = getFileNameConstant(entity, entity.params.positional.fileName, context, 'Image filename');
        if (!imageFileName) return null;
        const v = addImageResource(context.res.gfx, imageFileName);
        if (!context.images[imageFileName]) {
            context.images[imageFileName] = { entity, imageFileName, variable: v };
        }
        // VN_font(tiles, palette, tileSize, palSize)
        return `VN_font(${v}Tiles, ${v}Pal, (u16)(&${v}TilesEnd - ${v}Tiles), (u16)(&${v}PalEnd - ${v}Pal));`;
    },

    /* ------ Audio ------ */
    'music': (entity, context) => {
        const musicFileName = getFileNameConstant(entity, entity.params.positional.fileName, context, 'Music filename');
        if (!musicFileName) return null;
        const index = addMusicResource(context.res.music, musicFileName);
        return `VN_music(${index}); /* ${musicFileName} */`;
    },

    'sound': (entity, context) => {
        const soundFileName = getFileNameConstant(entity, entity.params.positional.fileName, context, 'Sound filename');
        if (!soundFileName) return null;
        const index = addSoundResource(context.res.sound, soundFileName);
        // VN_sound(sfxIndex) — engine applies default pitch/volume internally
        return `VN_sound(${index}); /* ${soundFileName} */`;
    },

    'stop': (entity, context) => {
        const flags = entity.params.flags || {};
        const flagExpr = Object.entries(flags).filter(([, v]) => v)
            .map(([name]) => `STOP_${name.toUpperCase()}`).join('|');
        return `VN_stop(${flagExpr || 0});`;
    },

    /* ------ Timing ------ */
    'wait': (entity, context) => {
        const duration = getNumber(entity, entity.params.positional.duration, context, 'Wait duration');
        return `VN_wait(${duration});`;
    },

    /* ------ Choice ------ */
    'choice': (entity, context) => {
        context.choices.push([]);
        const generated      = generateFromBody(entity.body, context);
        const optionsContent = context.choices.pop();

        return [
            '{',
            indent(
                'VN_flushText();',
                generated,
                'switch (VN_choice()) {',
                optionsContent.map((content, index) => {
                    // If this case already ends with a return statement, don't
                    // emit an unreachable VN_flushText()+break after it.
                    const hasReturn = /return\s+\w+\s*;[\s]*$/.test((content || '').trimEnd());
                    return [
                        `case ${index + 1}:`,
                        indent(content),
                        ...(hasReturn ? [] : ['\tVN_flushText();', '\tbreak;'])
                    ];
                }),
                '}',
                'VN_flushText();'
            ),
            '}'
        ].join('\n');
    },

    /* ------ Variables ------ */
    'create': (entity, context) => {
        const varName      = getIdentifier(entity, entity.params.positional.variable, context, 'Variable name');
        const initialValue = getConstant(entity, entity.params.positional.initialValue, context, 'Initial value') || {};
        if (context.globals.get(varName)) {
            context.errors.push(buildEntityError(entity,
                `There's already a global variable named "${varName}".`));
            return null;
        }
        const internalVar = 'VG_' + varName;
        context.globals.put(varName, {
            line: entity.line, type: initialValue.type, internalVar,
            code: `${initialValue.type} ${internalVar} = ${initialValue.code};`
        });
        return null;
    },

    'temp': (entity, context) => {
        const varName      = getIdentifier(entity, entity.params.positional.variable, context, 'Variable name');
        const initialValue = getConstant(entity, entity.params.positional.initialValue, context, 'Initial value') || {};
        if (context.locals.get(varName)) {
            context.errors.push(buildEntityError(entity,
                `There's already a local variable named "${varName}".`));
            return null;
        }
        const internalVar = 'VL_' + varName;
        context.locals.put(varName, {
            line: entity.line, internalVar,
            code: `${initialValue.type} ${internalVar} = ${initialValue.code};`
        });
        return null;
    },

    'set': (entity, context) => {
        const varName  = getIdentifier(entity, entity.params.positional.variable, context, 'Variable name');
        const newValue = getExpression(entity, entity.params.positional.newValue, context, 'New value') || {};
        const existing = context.locals.get(varName) || context.globals.get(varName);
        if (!existing) {
            context.errors.push(buildEntityError(entity, `Couldn't find a variable named "${varName}".`));
            return null;
        }
        return `${existing.value.internalVar} = ${newValue.code};`;
    },

    /* ------ Control flow ------ */
    'if': (entity, context) => {
        const condition = getExpression(entity, entity.params.positional.condition, context, 'Condition') || {};
        return [`if (${condition.code}) {`, indent(generateFromBody(entity.body, context)), '}'].join('\n');
    },

    'elseif': (entity, context) => {
        const condition = getExpression(entity, entity.params.positional.condition, context, 'Condition') || {};
        return [`else if (${condition.code}) {`, indent(generateFromBody(entity.body, context)), '}'].join('\n');
    },

    'else': (entity, context) =>
        ['else {', indent(generateFromBody(entity.body, context)), '}'].join('\n'),

    'while': (entity, context) => {
        const condition = getExpression(entity, entity.params.positional.condition, context, 'Condition') || {};
        return [`while (${condition.code}) {`, indent(generateFromBody(entity.body, context)), '}'].join('\n');
    },

    'goto_scene': (entity, context) => {
        const sceneName = getIdentifier(entity, entity.params.positional.target, context, 'Target scene name');
        if (sceneName && !context.knownScenes.has(sceneName)) {
            context.knownScenes.add(sceneName);
            context.scenesToProcess.push(sceneName);
        }
        return `VN_flushText();\nreturn VS_${sceneName};`;
    },

    /* ------ label / goto (within-scene jumps) ------ */
    'label': (entity, context) => {
        const name = getIdentifier(entity, entity.params.positional.name, context, 'Label name');
        if (!name) return null;
        // C label: sanitize name to avoid collisions with keywords
        return `lbl_${name}:;  /* label */`;
    },

    'goto': (entity, context) => {
        const name = getIdentifier(entity, entity.params.positional.target, context, 'Target label name');
        if (!name) return null;
        return `goto lbl_${name};`;
    },

    /* ------ finish (jump to next scene in list — treated as goto_scene startup) ------ */
    'finish': (entity, context) => {
        return `VN_flushText();\nreturn VS_startup;`;
    },

    /* ------ Window ------ */
    'window': (entity, context) => {
        const out  = ['VN_flushText();'];
        const flags = entity.params.flags || {};
        if (flags.default) out.push('VN_windowDefault();');
        const named = entity.params.named || {};
        if (named.from) {
            const x = getExpression(entity, named.from.x, context, 'Window X') || {};
            const y = getExpression(entity, named.from.y, context, 'Window Y') || {};
            out.push(`VN_windowFrom(${x.code}, ${y.code});`);
        }
        if (named.to) {
            const x = getExpression(entity, named.to.x, context, 'Window X dest') || {};
            const y = getExpression(entity, named.to.y, context, 'Window Y dest') || {};
            out.push(`VN_windowTo(${x.code}, ${y.code});`);
        }
        if (named.size) {
            const w = getExpression(entity, named.size.w, context, 'Window W') || {};
            const h = getExpression(entity, named.size.h, context, 'Window H') || {};
            out.push(`VN_windowSize(${w.code}, ${h.code});`);
        }
        return out.join('\n');
    },

    /* ------ Cursor (SNES: text glyph only, no sprite) ------ */
    'cursor': (entity, context) => {
        // On SNES we use a simple ">" text cursor drawn by VN_choice().
        // The cursor command is accepted but silently maps to a no-op for
        // sprite-based cursors. A font-based cursor would be supported
        // automatically by VN_choice()'s ">" character.
        context.warnings = context.warnings || [];
        context.warnings.push({
            line: entity.line,
            message: 'cursor: SNES uses a text cursor (">"): sprite cursor image is ignored.'
        });
        return '/* cursor: SNES uses built-in text cursor */';
    },

    /* ------ Text display ------ */
    'flush': (entity, context) => {
        const generatedFlags = generateFlags(entity, 'FLUSH');
        return `VN_flush(${generatedFlags || 0});`;
    },

    'clear': (entity, context) => {
        const generatedFlags = generateFlags(entity, 'LAYER');
        return `VN_clear(${generatedFlags || 'LAYER_BACKGROUND|LAYER_FOREGROUND'});`;
    },

    /* ------ Metadata ------ */
    'title': (entity, context) => {
        const name = getStringConstant(entity, entity.params.positional.name, context, 'Story name');
        context.header.title = name;
        return null;
    },

    'author': (entity, context) => {
        const name = getStringConstant(entity, entity.params.positional.name, context, 'Author name');
        context.header.author = name;
        return null;
    },

    /* ------ Native C interop ------ */
    'import': (entity, context) => {
        const fileName = getStringConstant(entity, entity.params.positional.fileName, context, 'File name');
        context.imports.push(fileName);
        return null;
    },

    'native': (entity, context) => {
        const functionName = getIdentifier(entity, entity.params.positional.functionName, context, 'Function name');
        let assignment = '';
        const named = entity.params.named || {};
        if (named.into) {
            const varName  = getIdentifier(entity, named.into.variable, context, 'Variable name');
            const existing = context.locals.get(varName) || context.globals.get(varName);
            if (existing) assignment = `${existing.value.internalVar} = `;
            else context.errors.push(buildEntityError(entity, `Couldn't find variable "${varName}".`));
        }
        const params = (entity.params.variadic || [])
            .map((p, i) => getExpression(entity, p, context, `Parameter ${i + 1}`) || {});
        return `${assignment}${functionName}(${params.map(e => e.code).join(', ')});`;
    }
};

/* ------------------------------------------------------------------ */
/* Body traversal                                                       */
/* ------------------------------------------------------------------ */

generateFromBody = (body, context) =>
    compact((body || []).map(entity => {
        if (entity.type === 'text') {
            if (entity.expressions) {
                return [
                    'VN_textStart();',
                    ...entity.expressions.map(o => {
                        if (o.params && o.params.positional && o.params.positional.expression) {
                            const expr = getExpression(entity, o.params.positional.expression, context, 'Expression');
                            return `VN_textInt(${expr.code});`;
                        }
                        return `VN_textString("${o}");`;
                    })
                ].join('\n');
            }
            return `VN_text("${entity.text}");`;
        }
        if (entity.type === 'option') {
            const len = context.choices.length;
            let optionNumber = -1;
            if (len) {
                context.choices[len - 1].push(generateFromBody(entity.body, context));
                optionNumber = context.choices[len - 1].length;
            } else {
                context.errors.push(buildEntityError(entity, 'Can\'t declare an option outside a "choice" command.'));
            }
            return `VN_option(${optionNumber}, "${entity.text}");`;
        }
        if (entity.type === 'command') {
            const gen = COMMAND_GENERATORS[entity.command];
            return gen && gen(entity, context);
        }
    })).join('\n');

/* ------------------------------------------------------------------ */
/* Scene generation                                                     */
/* ------------------------------------------------------------------ */

const generateScene = (sourceName, context) => {
    const source = context.fileSystem.readSource(sourceName);
    const ast    = parse(source);
    if (ast.errors) return { errors: ast.errors };

    context.locals = createNamespace();
    const generated = generateFromBody(ast.body, context);
    if (context.errors && context.errors.length) return { errors: context.errors };

    const functionName = `VS_${sourceName}`;

    // Only emit the fall-through tail (flush + self-return) when the body
    // doesn't already end with an explicit return statement.
    const alreadyReturns = /return\s+\w+\s*;\s*$/.test((generated || '').trimEnd());
    const tail = alreadyReturns
        ? []
        : ['VN_flushText();', `return ${functionName};`];

    return [
        `void *${functionName}(void) {`,
        indent(
            generateVariableDeclarations(context.locals),
            generated,
            ...tail
        ),
        '}'
    ].join('\n');
};

/* ------------------------------------------------------------------ */
/* ROM header (.asm)                                                    */
/* ------------------------------------------------------------------ */

const generateRomHeader = context => {
    const title  = (context.header.title  || 'UNNAMED STORY').toUpperCase().substring(0, 21).padEnd(21, ' ');
    return `; ROM header for choice4snes
; Title: ${title}
; Author: ${context.header.author || 'Unknown'}
; Generated by choice4snes
`;
};

/* ------------------------------------------------------------------ */
/* Extern declarations for image resources                             */
/* ------------------------------------------------------------------ */

const generateImageExterns = images =>
    Object.values(images).map(({ variable: v }) => [
        `extern u8 ${v}Tiles[], ${v}TilesEnd[];`,
        `extern u8 ${v}Map[],   ${v}MapEnd[];`,
        `extern u8 ${v}Pal[],   ${v}PalEnd[];`,
    ].join('\n')).join('\n');

/* ------------------------------------------------------------------ */
/* Top-level entry                                                      */
/* ------------------------------------------------------------------ */

const generateFromSource = (mainSourceName, context) => {
    context.knownScenes = new Set([mainSourceName]);
    context.scenesToProcess.push(mainSourceName);

    const processedScenes = {};
    while (context.scenesToProcess.length) {
        const name = context.scenesToProcess.shift();
        if (!processedScenes[name]) {
            const generatedFunction = generateScene(name, context);
            const errors = [
                ...context.errors,
                ...(generatedFunction && generatedFunction.errors ? generatedFunction.errors : [])
            ];
            context.errors = [];
            processedScenes[name] = { name, generatedFunction, errors };
        }
    }

    const errors = Object.values(processedScenes)
        .flatMap(({ name, errors }) => errors.map(e => ({ sourceName: name, ...e })));
    if (errors.length) return { errors };

    const forwards     = Object.keys(processedScenes).map(n => `void *VS_${n}(void);`);
    const functions    = Object.values(processedScenes).map(s => s.generatedFunction);
    const imageExterns = generateImageExterns(context.images);

    // Include soundbank.h only if any audio was used
    const hasAudio = Object.keys(context.res.music).length || Object.keys(context.res.sound).length;
    const includes = [
        '#include "vn_engine.h"',
        ...(hasAudio ? ['#include "soundbank.h"'] : []),
        ...context.imports.map(f => `#include "${f}"`)
    ].join('\n');

    return {
        sources: {
            'src/generated_scripts.c': [
                includes,
                imageExterns || '/* no image resources */',
                generateVariableDeclarations(context.globals) || '/* no global variables */',
                forwards.join('\n'),
                ...functions
            ].join('\n\n'),

            'src/generated_scripts.h': [
                '#ifndef GENERATED_SCRIPTS_H',
                '#define GENERATED_SCRIPTS_H',
                '#include "vn_engine.h"',
                forwards.join('\n'),
                '#endif'
            ].join('\n'),

            'hdr.asm': generateRomHeader(context)
        },
        images:   context.images,
        music:    context.res.music,
        sound:    context.res.sound,
        header:   context.header,
        warnings: context.warnings || []
    };
};

const generate = fileSystem => {
    const context = {
        fileSystem,
        scenesToProcess:    [],
        knownScenes:        new Set(),
        errors:  [],
        res:     { gfx: {}, music: {}, sound: {} },
        choices: [],
        globals: createNamespace(),
        locals:  null,
        imports: [],
        header:  { author: 'Unnamed Author', title: 'Unnamed Story' },
        images:  {},
        warnings: []
    };
    return generateFromSource('startup', context);
};

module.exports = { generate };
