#ifndef _VN_ENGINE_H
#define _VN_ENGINE_H

#include <snes.h>

/* ---- Stop flags ---- */
#define STOP_MUSIC  (1)
#define STOP_SOUND  (2)

/* ---- Flush flags ---- */
#define FLUSH_NOWAIT (1)

/* ---- Layer flags ---- */
#define LAYER_FOREGROUND (1)
#define LAYER_BACKGROUND (2)
#define LAYER_WINDOW     (4)

/* ---- Sound driver flags ---- */
#define SOUND_IT   (1)   /* IT/module music via snesmod  */
#define SOUND_BRR  (2)   /* BRR sample sound effect      */

/* ---- VRAM layout (pvsneslib BG_MODE1) ----
   BG0 = background images        tiles @ 0x0000 / map @ 0x7000
   BG1 = foreground images        tiles @ 0x2000 / map @ 0x7800
   BG2 = text window              tiles @ 0x3000 / map @ 0x6800  (console layer)
   Palettes 0-1  : background
   Palettes 2-3  : foreground / image overlay
   Palette  4    : text (consoleInitText)
*/
#define VN_BG_TILE_ADDR   0x0000
#define VN_FG_TILE_ADDR   0x2000
#define VN_TXT_TILE_ADDR  0x3000
#define VN_BG_MAP_ADDR    0x7000
#define VN_FG_MAP_ADDR    0x7800
#define VN_TXT_MAP_ADDR   0x6800

#define VN_BG_PAL   0
#define VN_FG_PAL   2
#define VN_TXT_PAL  4

#define TEXT_BUFFER_LEN  1024
#define CHOICE_MAX       8

/* -----------------------------------------------------------------
   Public API
   ----------------------------------------------------------------- */
void VN_init(void);

void VN_background(const u8 *tiles, const u8 *map, const u8 *palette,
                   u16 tileSize, u16 mapSize, u16 palSize);

void VN_image(const u8 *tiles, const u8 *map, const u8 *palette,
              u16 tileSize, u16 mapSize, u16 palSize, u8 flags);

void VN_imageAt(u16 x, u16 y);

void VN_font(const u8 *tiles, const u8 *palette, u16 tileSize, u16 palSize);

void VN_music(u16 moduleIndex);
void VN_sound(u8 sfxIndex);
void VN_stop(u8 flags);

void VN_textStart(void);
void VN_textString(const char *text);
void VN_textInt(int number);
void VN_text(const char *text);
void VN_flushText(void);
void VN_flush(u8 flags);
void VN_clear(u8 flags);
void VN_wait(u16 seconds);

void VN_windowDefault(void);
void VN_windowFrom(u16 x, u16 y);
void VN_windowTo(u16 x, u16 y);
void VN_windowSize(u16 w, u16 h);

void VN_option(u8 number, const char *text);
u8   VN_choice(void);

typedef void *(*scriptFunction)(void);

#endif /* _VN_ENGINE_H */
