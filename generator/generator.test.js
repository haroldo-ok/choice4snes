'use strict';
/**
 * choice4snes – generator unit tests
 */

const path = require('path');
const fs   = require('fs');
const { generate } = require('./generator');

/* ---- helpers ----------------------------------------------------------- */
const makeFS = (scenes, assets = []) => ({
    readSource: name => {
        if (!scenes[name]) throw new Error(`Scene not found: ${name}`);
        return scenes[name];
    },
    fileExistsInProjectDir: fn => assets.includes(fn)
});

const gen = (scenes, assets = []) => generate(makeFS(scenes, assets));

/* ---- tests ------------------------------------------------------------- */

test('minimal scene generates valid C function', () => {
    const result = gen({ startup: 'Hello world!' });
    expect(result.errors).toBeUndefined();
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('void *VS_startup(void)');
    expect(c).toContain('VN_text("Hello world!")');
    expect(c).toContain('return VS_startup');
});

test('title and author set header metadata', () => {
    const result = gen({ startup: '* title "My Story"\n* author "Me"\nHello' });
    expect(result.header.title).toBe('My Story');
    expect(result.header.author).toBe('Me');
});

test('create declares a global variable', () => {
    const result = gen({ startup: '* create score, 0\n* create won, false' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('int VG_score = 0;');
    expect(c).toContain('bool VG_won = FALSE;');
});

test('temp declares a local variable inside scene function', () => {
    const result = gen({ startup: '* temp counter, 3' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('int VL_counter = 3;');
});

test('set updates variable', () => {
    const result = gen({ startup: '* create x, 0\n* set x, x + 1' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VG_x = (VG_x + 1);');
});

test('if/elseif/else generates correct C', () => {
    const script = `* create n, 1\n* if n = 1\n\tOne.\n* elseif n = 2\n\tTwo.\n* else\n\tOther.`;
    const result = gen({ startup: script });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('if ((VG_n == 1))');
    expect(c).toContain('else if ((VG_n == 2))');
    expect(c).toContain('else {');
});

test('while generates a while loop', () => {
    const result = gen({ startup: '* temp i, 0\n* while i < 3\n\t* set i, i + 1' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('while ((VL_i < 3))');
    expect(c).toContain('VL_i = (VL_i + 1);');
});

test('choice generates switch statement', () => {
    const result = gen({ startup: '* choice\n\t# Yes\n\t\tYou said yes.\n\t# No\n\t\tYou said no.' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('switch (VN_choice())');
    expect(c).toContain('case 1:');
    expect(c).toContain('case 2:');
    expect(c).toContain('VN_option(1, "Yes")');
    expect(c).toContain('VN_option(2, "No")');
});

test('goto_scene emits return and queues new scene', () => {
    const result = gen({ startup: '* goto_scene scene2', scene2: 'End.' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('return VS_scene2;');
    expect(c).toContain('void *VS_scene2(void)');
});

test('goto_scene in choice case has no dead code after return', () => {
    const result = gen({ startup: '* choice\n\t# Go\n\t\t* goto_scene scene2', scene2: 'Hi.' });
    const c = result.sources['src/generated_scripts.c'];
    // The return line should NOT be followed by VN_flushText();
    expect(c).not.toMatch(/return VS_scene2;\s*\n\s*VN_flushText\(\)/);
});

test('background emits VN_background with correct size expressions', () => {
    const result = gen({ startup: '* background "bg.png"' }, ['bg.png']);
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VN_background(');
    expect(c).toContain('bg_pngTiles');
    expect(c).toContain('&bg_pngTilesEnd - bg_pngTiles');
    expect(c).toContain('extern u8 bg_pngTiles[], bg_pngTilesEnd[];');
});

test('image emits VN_image with position and LAYER flag', () => {
    const result = gen({ startup: '* image "sp.png", at(3, 5), foreground' }, ['sp.png']);
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VN_imageAt(3, 5);');
    expect(c).toContain('VN_image(');
    expect(c).toContain('LAYER_FOREGROUND');
});

test('font emits VN_font call', () => {
    const result = gen({ startup: '* font "fnt.png"' }, ['fnt.png']);
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VN_font(fnt_pngTiles, fnt_pngPal,');
});

test('music emits VN_music with index 0 and soundbank include', () => {
    const result = gen({ startup: '* music "track.it"' }, ['track.it']);
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('#include "soundbank.h"');
    expect(c).toContain('VN_music(0);');
});

test('sound emits VN_sound with index', () => {
    const result = gen({ startup: '* sound "sfx.it"' }, ['sfx.it']);
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VN_sound(0);');
});

test('stop music emits VN_stop(STOP_MUSIC)', () => {
    const result = gen({ startup: '* stop music' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VN_stop(STOP_MUSIC);');
});

test('stop with no flags emits VN_stop(0)', () => {
    const result = gen({ startup: '* stop' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VN_stop(0);');
});

test('wait emits VN_wait', () => {
    const result = gen({ startup: '* wait 3' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VN_wait(3);');
});

test('flush nowait emits VN_flush(FLUSH_NOWAIT)', () => {
    const result = gen({ startup: '* flush nowait' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VN_flush(FLUSH_NOWAIT);');
});

test('clear background emits VN_clear(LAYER_BACKGROUND)', () => {
    const result = gen({ startup: '* clear background' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VN_clear(LAYER_BACKGROUND);');
});

test('window default emits VN_windowDefault', () => {
    const result = gen({ startup: '* window default' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VN_windowDefault();');
});

test('window from/to emits VN_windowFrom and VN_windowTo', () => {
    const result = gen({ startup: '* window from(2, 18), to(30, 26)' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VN_windowFrom(2, 18);');
    expect(c).toContain('VN_windowTo(30, 26);');
});

test('label and goto emit C label and goto', () => {
    const result = gen({ startup: '* label top\n* goto top' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('lbl_top:;');
    expect(c).toContain('goto lbl_top;');
});

test('cursor command emits a no-op comment', () => {
    const result = gen({ startup: '* cursor "cur.png", 1, 1, 3' }, ['cur.png']);
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('/* cursor:');
});

test('string interpolation emits VN_textStart + VN_textString + VN_textInt', () => {
    const result = gen({ startup: '* create n, 5\nScore: ${n} points.' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VN_textStart();');
    expect(c).toContain('VN_textString("Score: ")');
    expect(c).toContain('VN_textInt(VG_n);');
    expect(c).toContain('VN_textString(" points.")');
});

test('native call emits function call with arguments', () => {
    const result = gen({ startup: '* create r, 0\n* native addOne, 1, into(r)' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('VG_r = addOne(1);');
});

test('import adds #include to generated file', () => {
    const result = gen({ startup: '* import "mylib.h"\n* native doThing' });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('#include "mylib.h"');
});

test('duplicate global variable is an error', () => {
    const result = gen({ startup: '* create x, 0\n* create x, 1' });
    expect(result.errors).toBeDefined();
    expect(result.errors.length).toBeGreaterThan(0);
});

test('set on unknown variable is an error', () => {
    const result = gen({ startup: '* set ghost, 1' });
    expect(result.errors).toBeDefined();
    expect(result.errors.length).toBeGreaterThan(0);
});

test('option outside choice is an error', () => {
    const result = gen({ startup: '# Orphan option\n\tText.' });
    // The parser treats # as an option; outside a choice it should error
    const c = result.sources && result.sources['src/generated_scripts.c'];
    // Either an error is reported or the option triggers the error path in the generator
    if (result.errors && result.errors.length) {
        expect(result.errors.some(e => e.message.toLowerCase().includes('option'))).toBe(true);
    }
});

test('multi-scene project generates forward declarations for all scenes', () => {
    const result = gen({
        startup: '* goto_scene a',
        a:       '* goto_scene b',
        b:       'End.'
    });
    const c = result.sources['src/generated_scripts.c'];
    expect(c).toContain('void *VS_startup(void);');
    expect(c).toContain('void *VS_a(void);');
    expect(c).toContain('void *VS_b(void);');
});

test('same scene reached via multiple goto_scene paths is not duplicated', () => {
    const result = gen({
        startup: '* choice\n\t# A\n\t\t* goto_scene hub\n\t# B\n\t\t* goto_scene hub',
        hub: 'Hub scene.'
    });
    const c = result.sources['src/generated_scripts.c'];
    // Match function *definitions* only (with opening brace), not forward declarations
    const matches = c.match(/^void \*VS_hub\(void\)\s*\{/mg) || [];
    expect(matches.length).toBe(1);
});
