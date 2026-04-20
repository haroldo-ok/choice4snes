# choice4snes

A ChoiceScript-inspired scripting engine that generates **SNES ROMs** from
plain-text `.choice` scripts, using [pvsneslib](https://github.com/alekmaul/pvsneslib).

Inspired by [choice4genesis](https://github.com/haroldo-ok/choice4genesis)
by Haroldo de Oliveira Pinheiro.

---

## What it does

Write `.choice` scripts like this:

```
* title "My Visual Novel"
* author "Me"

* background "scene1.png"

Hello and welcome to my SNES visual novel!

* choice
    # Option A
        You chose A!
    # Option B
        You chose B!
        * goto_scene scene2
```

Run `node . transpile myproject` and choice4snes will:

1. Parse your `.choice` scripts
2. Convert PNG images to 4bpp indexed format (via ImageMagick)
3. Generate `src/generated_scripts.c` (pvsneslib C code)
4. Generate a `Makefile` that wires `gfxconv` + `smconv` + the 65816 compiler
5. (Optionally) run `make` and launch the ROM in your SNES emulator

---

## Requirements

| Tool | Notes |
|------|-------|
| **Node.js** ≥ 16 | https://nodejs.org |
| **pvsneslib** | Set `PVSNESLIB_HOME`; see https://github.com/alekmaul/pvsneslib/wiki/Installation |
| **ImageMagick** | For automatic palette conversion |
| **SNES emulator** | snes9x, bsnes, or Mesen-S |

---

## Installation

```bash
git clone https://github.com/yourname/choice4snes.git
cd choice4snes
npm install
```

---

## Usage

```bash
# Transpile only (generate C source + Makefile)
node . transpile myproject

# Transpile + compile
node . transpile myproject -- compile

# Full pipeline
node . transpile myproject -- compile emulate

# Interactive project menu
node . menu

# Web-based scene editor (Monaco)
node . edit
```

### Options

| Option              | Alias | Default              | Description |
|---------------------|-------|----------------------|-------------|
| `--project-dir`     | `-pd` | `./examples`         | Projects folder |
| `--pvsneslib-home`  | `-ph` | `$PVSNESLIB_HOME`    | pvsneslib root |
| `--imagemagick-dir` | `-kd` | `../ImageMagick-…`   | ImageMagick location |
| `--emulator-exe`    | `-ee` | `$SNES_EMULATOR`     | SNES emulator executable |
| `--watch`           | `-w`  | `false`              | Re-transpile on file changes |

---

## Project structure

```
myproject/
  project/
    startup.choice      ← Entry-point scene (required)
    scene2.choice
    background.png      ← 256×224, will be auto-converted to 16 colours
    overlay.png
    font.png            ← Optional custom font sheet
    music.it            ← IT module for background music
    sfx.it              ← IT module for sound effects
```

After `transpile`, the project folder gains:

```
myproject/
  src/
    main.c
    vn_engine.c / vn_engine.h
    generated_scripts.c
  res/
    soundbank.h / soundbank.obj
    *.pic / *.pal / *.map
  Makefile
  mygame.sfc            ← After `make`
```

---

## Commands reference

### Graphics

| Command | Description |
|---------|-------------|
| `* background "file.png"` | Full-screen background (256×224, 16 colours) |
| `* image "file.png"[, at(x,y)][, foreground]` | Overlay image on BG2 |
| `* font "file.png"` | Custom 8×8 font sheet |
| `* clear [background] [foreground] [window]` | Clear layers |

### Audio

| Command | Description |
|---------|-------------|
| `* music "file.it"` | Start background music (SPC700 / snesmod) |
| `* sound "file.it"` | Play a sound effect |
| `* stop [music] [sound]` | Stop music / SFX (no flags = stop both) |

### Text & flow

| Command | Description |
|---------|-------------|
| `* flush [nowait]` | Display text buffer; wait for button unless `nowait` |
| `* wait N` | Wait N seconds |
| `* window from(x,y), to(x,y)` | Configure text window |
| `* window default` | Reset to default window |
| `* choice` | Present a menu (nested `#` lines are options) |
| `* if` / `* elseif` / `* else` | Conditional blocks |
| `* while condition` | Loop |
| `* goto_scene name` | Jump to `name.choice` |

### Variables

| Command | Description |
|---------|-------------|
| `* create var, value` | Global variable (`int` or `bool`) |
| `* temp var, value` | Scene-local variable |
| `* set var, expression` | Update a variable |

### Meta

| Command | Description |
|---------|-------------|
| `* title "Name"` | ROM title (≤ 21 chars) |
| `* author "Name"` | ROM author (≤ 16 chars) |
| `* import "file.h"` | Include a C header |
| `* native func, arg1, arg2, into(result)` | Call a C function |

### Expressions

```
Arithmetic:   +  -  *  /
Comparison:   =  !=  >  <  >=  <=
Logic:        and  or  !(...)
Constants:    123  true  false  "string"
Interpolation in text:  Your score is ${score}.
```

---

## SNES hardware notes

| Resource | Hardware constraint |
|----------|---------------------|
| Background | 256×224 px, 16 colours (Mode 1, BG1) |
| Overlay | Any tile-aligned size, 16 colours (Mode 1, BG2) |
| Font | 2bpp 8×8 tiles (BG3) |
| Palettes | 8 palettes × 16 colours |
| Music/SFX | IT modules → SPC700 via snesmod (smconv) |
| Text window | Default: cols 1–30, rows 20–26 |

---

## License

MIT — see LICENSE
