const chalk = require('chalk');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

function findImage() {
    const candidates = [
        path.join(__dirname, 'assets', 'banner.png'),
        path.join(__dirname, 'assets', 'banner.jpg'),
        path.join(__dirname, 'banner.png'),
        path.join(__dirname, 'banner.jpg'),
    ];
    return candidates.find(p => fs.existsSync(p));
}

async function renderImage(imgPath, targetCols, targetRows) {
    const pixelH = targetRows * 2;
    const pixelW = targetCols;

    const { data, info } = await sharp(imgPath)
        .resize(pixelW, pixelH, {
            fit: 'fill',
            kernel: sharp.kernel.lanczos3,
        })
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const h = height % 2 === 0 ? height : height - 1;

    const lines = [];
    for (let y = 0; y < h; y += 2) {
        let line = '';
        for (let x = 0; x < width; x++) {
            const i1 = (y * width + x) * channels;
            const i2 = ((y + 1) * width + x) * channels;
            const [r1, g1, b1] = [data[i1], data[i1+1], data[i1+2]];
            const [r2, g2, b2] = [data[i2], data[i2+1], data[i2+2]];
            line += `\x1b[38;2;${r1};${g1};${b1}m\x1b[48;2;${r2};${g2};${b2}m\u2580`;
        }
        line += '\x1b[0m';
        lines.push({ text: line, cols: width });
    }
    return lines;
}

function visLen(s) {
    return s.replace(/\x1B\[[0-9;]*m/g, '').length;
}

const WW  = chalk.hex('#c8c5be');
const MU  = chalk.hex('#555555');
const W   = chalk.hex('#f0ede6');
const TAG = chalk.hex('#2E7D45').bold;
const DIM = chalk.hex('#33B458');
const WHT = chalk.hex('#ffffff').bold;
const BG  = '\x1b[48;2;0;0;0m';
const RST = '\x1b[0m';

// 직접 그린 픽셀 블록 — Obnofi
const ASCII_LINES = [
    "                                             ",
    "                                             ",
    "  ████   ██                                  ",
    " ██  ██  ██      ██ ██    ████    ███   ██  ",
    " ██  ██  █████   ██  ██  ██  ██   ██        ",
    " ██  ██  ██  ██  ██  ██  ██  ██  ████   ██  ",
    " ██  ██  ██  ██  ██  ██  ██  ██   ██    ██  ",
    "  ████   █████   ██  ██   ████    ██    ██  ",
    "                                             ",
    "                                             ",
    "                                             ",
];

const RIGHT_PAD = 4;
const ASCII_W = Math.max(...ASCII_LINES.map(l => l.length)) + 1 + RIGHT_PAD;

async function showSplash() {
    const imgPath = findImage();
    const termW = process.stdout.columns || 100;
    const innerW = Math.min(termW - 2, 110);

    const border = DIM('─'.repeat(innerW));

    const asciiColW = ASCII_W;
    const imgColW   = innerW - asciiColW;
    const ASCII_H   = ASCII_LINES.length;

    const textLines = [
        ' ' + WW('Obsidian + Notion + FigJam  —  all in one'),
        ' ' + MU('v0.1.0  ·  2026 graduation project'),
        '',
        ' ' + TAG('❯') + W(' obnofi start  ') + MU('Launch the workspace'),
        ' ' + TAG('❯') + W(' obnofi new    ') + MU('Create a new page'),
        ' ' + TAG('❯') + W(' obnofi --help ') + MU('Show all commands'),
    ];

    console.log(DIM(`┌${border}┐`));

    if (!imgPath) {
        for (const line of ASCII_LINES) {
            const padded = ' ' + line;
            const pad = Math.max(0, innerW - visLen(padded));
            console.log(DIM('│') + BG + WHT(padded) + ' '.repeat(pad) + RST + DIM('│'));
        }
    } else {
        try {
            const imgLines = await renderImage(imgPath, imgColW, ASCII_H);

            for (let i = 0; i < ASCII_H; i++) {
                const asciiText   = ASCII_LINES[i] ?? '';
                const paddedAscii = ' ' + asciiText;
                const asciiPad    = Math.max(0, asciiColW - visLen(paddedAscii));

                const imgPart  = imgLines[i]?.text ?? (' '.repeat(imgColW));
                const imgCols  = imgLines[i]?.cols ?? imgColW;
                const imgRight = imgColW - imgCols;
                const imgPad   = imgRight > 0 ? `\x1b[40m` + ' '.repeat(imgRight) + RST : '';

                process.stdout.write(
                    DIM('│') +
                    BG + WHT(paddedAscii) + ' '.repeat(asciiPad) + RST +
                    imgPart + imgPad +
                    DIM('│') + '\n'
                );
            }
        } catch (e) {
            console.error('splash error:', e.message);
        }
    }

    console.log(DIM('│') + BG + ' '.repeat(innerW) + RST + DIM('│'));

    for (const line of textLines) {
        const vl = visLen(line);
        const pad = Math.max(0, innerW - vl);
        console.log(DIM('│') + BG + line + ' '.repeat(pad) + RST + DIM('│'));
    }

    console.log(DIM('│') + BG + ' '.repeat(innerW) + RST + DIM('│'));
    console.log(DIM(`└${border}┘`));
    console.log('');
    console.log('  ' + WW('Ready.'));
}

module.exports = { showSplash };