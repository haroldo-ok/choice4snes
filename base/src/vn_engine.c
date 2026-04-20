/*
 * vn_engine.c  —  choice4snes SNES runtime engine
 *
 * Targets pvsneslib (https://github.com/alekmaul/pvsneslib).
 * Mirrors the choice4genesis vn_engine API so the JS generator
 * can produce nearly identical C output for both platforms.
 */

#include <snes.h>
#include <string.h>
#include "vn_engine.h"

/* ------------------------------------------------------------------ */
/* Internal state                                                       */
/* ------------------------------------------------------------------ */

static char textBuffer[TEXT_BUFFER_LEN];

static struct {
    u16 x, y, w, h;
} window;

static struct {
    u16 x, y;
} imagePos;

static struct {
    bool up, down, next;
} input;

/* Line-buffer used for word-wrap rendering */
#define MSG_MAX_LINES 8
#define MSG_MAX_COLS  32
static char  msgLines[MSG_MAX_LINES][MSG_MAX_COLS + 1];
static u16   msgLineCount;

/* ------------------------------------------------------------------ */
/* Input helpers                                                        */
/* ------------------------------------------------------------------ */

static void VN_readInput(void) {
    u16 keys = padsCurrent(0);
    input.up   = !!(keys & KEY_UP);
    input.down = !!(keys & KEY_DOWN);
    input.next = !!(keys & (KEY_A | KEY_B | KEY_START));
}

static void VN_doVBlank(void) {
    spcProcess();
    WaitForVBlank();
    VN_readInput();
}

static void VN_waitJoyRelease(void) {
    do { VN_doVBlank(); } while (input.up || input.down || input.next);
}

static void VN_waitPressNext(void) {
    do { VN_doVBlank(); } while (!input.next);
    VN_waitJoyRelease();
}

/* ------------------------------------------------------------------ */
/* Word-wrap                                                            */
/* ------------------------------------------------------------------ */

static const char *wrapLine(const char *src, u16 lineIdx, u16 w) {
    char *dst = msgLines[lineIdx];
    u16   col = 0;
    /* skip leading spaces */
    while (*src == ' ' && col < w) { dst[col++] = ' '; src++; }
    if (!*src || col >= w) { dst[col] = 0; return NULL; }

    /* find break point */
    const char *scan = src;
    const char *brk  = src;
    u16 curr = col;
    while (*scan && *scan != '\n' && curr < w) {
        if (*scan == ' ') brk = scan;
        curr++; scan++;
    }
    /* last word / short line */
    if (curr < w || brk == src) brk = scan;

    while (src < brk) {
        if (*src && *src != '\n') dst[col++] = *src;
        src++;
    }
    dst[col] = 0;
    /* skip trailing spaces and single newline */
    while (*src == ' ') src++;
    if (*src == '\n') src++;
    return *src ? src : NULL;
}

static void wrapText(const char *src, u16 w, u16 h) {
    msgLineCount = 0;
    for (u16 row = 0; row < h && src; row++) {
        src = wrapLine(src, row, w);
        msgLineCount++;
    }
}

/* ------------------------------------------------------------------ */
/* VN_init                                                              */
/* ------------------------------------------------------------------ */

void VN_init(void) {
    consoleInit();
    spcBoot();

    memset(textBuffer, 0, TEXT_BUFFER_LEN);

    VN_windowDefault();
    imagePos.x = 0;
    imagePos.y = 0;

    /* Set up BG_MODE1: BG0=16col bg, BG1=16col fg, BG2=4col text */
    setMode(BG_MODE1, 0);

    /* Background layer */
    bgSetGfxPtr(0, VN_BG_TILE_ADDR);
    bgSetMapPtr(0, VN_BG_MAP_ADDR, SC_32x32);
    bgSetEnable(0);

    /* Foreground / image overlay layer */
    bgSetGfxPtr(1, VN_FG_TILE_ADDR);
    bgSetMapPtr(1, VN_FG_MAP_ADDR, SC_32x32);
    bgSetEnable(1);

    /* Text layer — managed by pvsneslib console */
    consoleSetTextGfxPtr(VN_TXT_TILE_ADDR);
    consoleSetTextMapPtr(VN_TXT_MAP_ADDR);
    consoleSetTextOffset(0x0100);
    /* Font is loaded later by VN_font(); use a built-in default meanwhile */

    setScreenOn();
    VN_readInput();
}

/* ------------------------------------------------------------------ */
/* Graphics                                                             */
/* ------------------------------------------------------------------ */

void VN_background(const u8 *tiles, const u8 *map, const u8 *palette,
                   u16 tileSize, u16 mapSize, u16 palSize) {
    bgInitTileSet(0, (u8*)tiles, (u8*)palette, VN_BG_PAL,
                  tileSize, palSize, BG_16COLORS, VN_BG_TILE_ADDR);
    bgInitMapSet(0, (u8*)map, mapSize, SC_32x32, VN_BG_MAP_ADDR);
}

void VN_image(const u8 *tiles, const u8 *map, const u8 *palette,
              u16 tileSize, u16 mapSize, u16 palSize, u8 flags) {
    u16 addr = (flags & LAYER_FOREGROUND) ? VN_FG_TILE_ADDR : VN_BG_TILE_ADDR;
    u16 mapAddr = (flags & LAYER_FOREGROUND) ? VN_FG_MAP_ADDR : VN_BG_MAP_ADDR;
    u8  bgNum   = (flags & LAYER_FOREGROUND) ? 1 : 0;

    bgInitTileSet(bgNum, (u8*)tiles, (u8*)palette, VN_FG_PAL,
                  tileSize, palSize, BG_16COLORS, addr);
    bgInitMapSet(bgNum, (u8*)map, mapSize, SC_32x32, mapAddr);
    /* Note: bgInitMapSet always fills from 0,0; for positioned small images
       the generator will need to blit individual tiles — see VN_imageAt. */
}

void VN_imageAt(u16 x, u16 y) {
    imagePos.x = x;
    imagePos.y = y;
}

void VN_font(const u8 *tiles, const u8 *palette, u16 tileSize, u16 palSize) {
    consoleInitText(VN_TXT_PAL, palSize, (u8*)tiles, (u8*)palette);
}

/* ------------------------------------------------------------------ */
/* Audio                                                                */
/* ------------------------------------------------------------------ */

void VN_music(u16 moduleIndex) {
    spcStop();
    spcLoad(moduleIndex);
    spcPlay(0);
}

void VN_sound(u8 sfxIndex) {
    spcEffect(4, sfxIndex, 15 * 16 + 8); /* pitch=4(16kHz), full vol, center pan */
}

void VN_stop(u8 flags) {
    if (!flags || (flags & STOP_MUSIC)) spcStop();
    /* BRR sounds stop automatically; no explicit API needed for single-shot sfx */
}

/* ------------------------------------------------------------------ */
/* Text                                                                 */
/* ------------------------------------------------------------------ */

void VN_textStart(void) {
    if (textBuffer[0]) {
        u16 len = strlen(textBuffer);
        if (len + 1 < TEXT_BUFFER_LEN) {
            textBuffer[len]     = '\n';
            textBuffer[len + 1] = 0;
        }
    }
}

void VN_textString(const char *text) {
    u16 free = TEXT_BUFFER_LEN - strlen(textBuffer) - 1;
    strncat(textBuffer, text, free);
}

void VN_textInt(int number) {
    char buf[12];
    sprintf(buf, "%d", number);
    VN_textString(buf);
}

void VN_text(const char *text) {
    VN_textStart();
    VN_textString(text);
}

static void VN_clearWindow(void) {
    for (u16 row = 0; row < window.h; row++) {
        for (u16 col = 0; col < window.w; col++) {
            consoleDrawText(window.x + col, window.y + row, " ");
        }
    }
}

void VN_flushText(void) {
    VN_flush(0);
}

void VN_flush(u8 flags) {
    if (!textBuffer[0]) return;

    bool shouldWait = !(flags & FLUSH_NOWAIT);

    const char *remaining = textBuffer;
    while (remaining) {
        if (shouldWait) VN_waitJoyRelease();

        wrapText(remaining, window.w, window.h);

        /* advance pointer past what we just consumed */
        {
            const char *scan = remaining;
            for (u16 l = 0; l < msgLineCount && scan; l++) {
                scan = wrapLine(scan, l, window.w); /* re-run to advance */
            }
            remaining = scan;
        }

        VN_clearWindow();
        for (u16 row = 0; row < msgLineCount; row++) {
            consoleDrawText(window.x, window.y + row, msgLines[row]);
        }
        consoleUpdate();

        if (shouldWait) VN_waitPressNext();
    }

    memset(textBuffer, 0, TEXT_BUFFER_LEN);
}

/* ------------------------------------------------------------------ */
/* Screen clear                                                         */
/* ------------------------------------------------------------------ */

void VN_clear(u8 flags) {
    if (flags & LAYER_BACKGROUND) {
        /* Refill BG map with blank tiles */
        static u8 blankMap[32 * 32 * 2];
        memset(blankMap, 0, sizeof(blankMap));
        bgInitMapSet(0, blankMap, sizeof(blankMap), SC_32x32, VN_BG_MAP_ADDR);
    }
    if (flags & LAYER_FOREGROUND) {
        static u8 blankMap[32 * 32 * 2];
        memset(blankMap, 0, sizeof(blankMap));
        bgInitMapSet(1, blankMap, sizeof(blankMap), SC_32x32, VN_FG_MAP_ADDR);
    }
    if (flags & LAYER_WINDOW) {
        VN_clearWindow();
        consoleUpdate();
    }
}

/* ------------------------------------------------------------------ */
/* Wait                                                                 */
/* ------------------------------------------------------------------ */

void VN_wait(u16 seconds) {
    VN_flushText();
    u16 frames = seconds * snes_fps; /* snes_fps = 50 or 60 */
    for (u16 f = 0; f < frames; f++) VN_doVBlank();
}

/* ------------------------------------------------------------------ */
/* Window                                                               */
/* ------------------------------------------------------------------ */

void VN_windowDefault(void) {
    window.x = 1;
    window.y = 20;
    window.w = 30;
    window.h = 6;
}

void VN_windowFrom(u16 x, u16 y) {
    window.x = x;
    window.y = y;
}

void VN_windowTo(u16 x, u16 y) {
    VN_windowSize(x - window.x + 1, y - window.y + 1);
}

void VN_windowSize(u16 w, u16 h) {
    window.w = w;
    window.h = h;
}

/* ------------------------------------------------------------------ */
/* Choice menu                                                          */
/* ------------------------------------------------------------------ */

void VN_option(u8 number, const char *text) {
    VN_text(text);
    u16 len = strlen(textBuffer);
    if (len + 2 < TEXT_BUFFER_LEN) {
        textBuffer[len]     = '\x01'; /* sentinel */
        textBuffer[len + 1] = number;
        textBuffer[len + 2] = 0;
    }
}

u8 VN_choice(void) {
    if (!textBuffer[0]) return 0;

    VN_clearWindow();

    u8  choiceCount = 0;
    u16 choiceRows[CHOICE_MAX];
    u8  choiceVals[CHOICE_MAX];

    char lineBuf[MSG_MAX_COLS + 1];
    const char *src = textBuffer;
    u16 row = window.y;

    while (*src) {
        char *d = lineBuf;
        while (*src && *src != '\n' && *src != '\x01') *d++ = *src++;
        *d = 0;

        if (*src == '\x01') {
            src++;
            choiceRows[choiceCount] = row;
            choiceVals[choiceCount] = (u8)*src;
            choiceCount++;
            src++;
        }
        if (*src == '\n') src++;

        consoleDrawText(window.x + 1, row, lineBuf);
        row++;
    }
    memset(textBuffer, 0, TEXT_BUFFER_LEN);
    consoleUpdate();

    VN_waitJoyRelease();

    u8 sel = 0;
    consoleDrawText(window.x, choiceRows[0], ">");

    while (!input.next) {
        VN_doVBlank();
        if (input.up || input.down) {
            consoleDrawText(window.x, choiceRows[sel], " ");
            if (input.up)  sel = sel ? sel - 1 : choiceCount - 1;
            if (input.down) { sel++; if (sel >= choiceCount) sel = 0; }
            consoleDrawText(window.x, choiceRows[sel], ">");
            consoleUpdate();
            VN_waitJoyRelease();
        }
    }
    VN_waitJoyRelease();
    return choiceVals[sel];
}
