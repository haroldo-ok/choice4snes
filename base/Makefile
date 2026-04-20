ifeq ($(strip $(PVSNESLIB_HOME)),)
$(error "Please set PVSNESLIB_HOME. See https://github.com/alekmaul/pvsneslib/wiki/Installation")
endif

# ---- Audio files (list your .it files here) ----
# AUDIOFILES := res/music.it res/effects.it
export SOUNDBANK := res/soundbank

include ${PVSNESLIB_HOME}/devkitsnes/snes_rules

.PHONY: bitmaps all clean

export ROMNAME := $(VN_TITLE)

# Music conversion flags
SMCONVFLAGS := -s -o $(SOUNDBANK) -V -b 5

musics: $(SOUNDBANK).obj

bitmaps: $(patsubst %.png,%.pic, $(wildcard res/*.png))

all: musics bitmaps $(ROMNAME).sfc

clean: cleanBuildRes cleanRom cleanGfx cleanAudio
