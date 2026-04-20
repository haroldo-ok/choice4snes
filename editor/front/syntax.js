'use strict';

import { useEffect } from 'react';
import { useMonaco } from "@monaco-editor/react";

/**
 * choice4snes syntax highlighting for Monaco editor.
 * Adds SNES-specific commands on top of the standard choicescript set.
 */
export function prepareSyntax() {
    const monaco = useMonaco();
    useEffect(() => {
        if (!monaco) return;

        monaco.languages.register({ id: 'choicescript' });

        monaco.languages.setMonarchTokensProvider('choicescript', {
            tokenizer: {
                root: [
                    // Commands (* keyword)
                    [/^[ \t]*\*[ \t]*(background|image|font|music|sound|stop|wait|clear|flush|window|cursor)/, 'keyword.graphics'],
                    [/^[ \t]*\*[ \t]*(choice|if|elseif|else|while|goto_scene|goto|label|finish|scene_list)/, 'keyword.control'],
                    [/^[ \t]*\*[ \t]*(create|temp|set|native|import)/, 'keyword.variable'],
                    [/^[ \t]*\*[ \t]*(title|author)/, 'keyword.meta'],
                    [/^[ \t]*\*[ \t]*\w+/, 'keyword'],
                    // Choice options
                    [/^[ \t]*#/, 'keyword'],
                    // String interpolation  ${expr}
                    [/\$\{[^}]*\}/, 'variable'],
                    // Quoted strings
                    [/"((\\")|[^"])*"/, 'string'],
                    // Named params:  at(  from(  to(  size(  into(
                    [/\b(at|from|to|size|into)\s*\(/, 'type'],
                    // Flags:  foreground  background  nowait  adpcm  default  music  sound
                    [/\b(foreground|background|nowait|adpcm|default|music|sound)\b/, 'constant'],
                    // Logical keywords
                    [/\b(and|or|not|true|false|TRUE|FALSE)\b/, 'keyword.operator'],
                    // Delimiters
                    [/[(),]/, 'delimiter'],
                    // Numbers
                    [/\d+/, 'number'],
                    // Comments (lines starting with //)
                    [/\/\/.*$/, 'comment'],
                ]
            }
        });

        monaco.editor.defineTheme('choicescriptTheme', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'keyword.graphics',  foreground: '4EC9B0', fontStyle: 'bold' },
                { token: 'keyword.control',   foreground: 'C586C0', fontStyle: 'bold' },
                { token: 'keyword.variable',  foreground: '9CDCFE' },
                { token: 'keyword.meta',      foreground: '808080' },
                { token: 'keyword',           foreground: '569CD6', fontStyle: 'bold' },
                { token: 'keyword.operator',  foreground: 'D4D4D4' },
                { token: 'variable',          foreground: 'DCDCAA' },
                { token: 'string',            foreground: 'CE9178' },
                { token: 'type',              foreground: '4FC1FF' },
                { token: 'constant',          foreground: 'B5CEA8' },
                { token: 'number',            foreground: 'B5CEA8' },
                { token: 'comment',           foreground: '6A9955', fontStyle: 'italic' },
                { token: 'delimiter',         foreground: 'D4D4D4' },
            ],
            colors: {}
        });

        // Set the theme
        monaco.editor.setTheme('choicescriptTheme');

    }, [monaco]);
}
