# demo — choice4snes example project

This is the demo project for choice4snes.

## Project structure

```
demo/
└── project/           ← your source files go here
    ├── startup.choice  ← entry point (always named startup.choice)
    ├── forest.choice
    ├── forest_deep.choice
    ├── town.choice
    ├── ending.choice
    ├── font.png        ← 8×8 font tileset (4-color, 128×128 px recommended)
    ├── title_bg.png    ← background image (256×224 px, max 16 colors)
    └── forest_bg.png   ← another background
```

## Adding your own assets

### Background images
- Size: **256×224 pixels** (standard SNES resolution)
- Colors: **up to 16 colors** (Mode 1, BG0)
- Format: PNG or BMP
- `gfx4snes` will auto-convert them during transpilation

### Font
- An 8×8 pixel font sheet
- 4-color (the text palette)
- Arranged as a standard ASCII tileset

### Music
- Convert your tracker music to `.it` format
- Place in `project/` and reference with `* music "song.it"`
- `smconv` handles the conversion during compilation

## Running

```bash
# Step 1 — Generate C source files
node path/to/choice4snes transpile demo

# Step 2 — Compile to .sfc ROM (requires PVSNESLIB_HOME)
node path/to/choice4snes compile demo

# Step 3 — Run in emulator (requires SNES_EMULATOR or --emulator-exe)
node path/to/choice4snes emulate demo

# Or all at once:
node path/to/choice4snes transpile demo -- compile emulate
```
