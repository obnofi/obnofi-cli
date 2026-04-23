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

async function renderImage(imgPath, targetCols, scale = 0.5) {
    const meta = await sharp(imgPath).metadata();
    const origW = meta.width;
    const origH = meta.height;

    // 터미널 폰트는 높이:너비 = 2:1 비율
    // ▀ 1개 = 터미널 1col = 픽셀 1개 (가로)
    // ▀ 1개 = 터미널 1row = 픽셀 2개 (세로, 위아래 합침)
    // 따라서 터미널 col = 픽셀 col (1:1)
    const maxCols = targetCols;
    const scaledCols = Math.floor(origW * scale);
    const finalCols = Math.min(scaledCols, maxCols); // 터미널 col 단위

    // 터미널 폰트 비율 보정: 폰트 높이가 너비의 2배라 세로로 찌그러짐
    // ▀ 1row = 픽셀 2개지만, 실제 표시는 폰트 높이(2x)만큼 늘어남
    // → 픽셀 높이를 0.5배로 줄여서 보정
    const finalPixelW = finalCols;
    const finalPixelH = Math.round((origH * scale) * (finalCols / scaledCols) * 0.5) * 2;

    const { data, info } = await sharp(imgPath)
        .resize(finalPixelW, finalPixelH, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const h = height % 2 === 0 ? height : height - 1;
    const cols = width; // 픽셀 너비 = 터미널 col 수 (1:1)

    const lines = [];
    for (let y = 0; y < h; y += 2) {
        let line = '';
        for (let x = 0; x < width; x++) {
            const i1 = (y * width + x) * channels;
            const i2 = ((y + 1) * width + x) * channels;
            const [r1, g1, b1] = [data[i1], data[i1+1], data[i1+2]];
            const [r2, g2, b2] = [data[i2], data[i2+1], data[i2+2]];
            line += `\x1b[38;2;${r1};${g1};${b1}m\x1b[48;2;${r2};${g2};${b2}m▀`;
        }
        line += '\x1b[0m';
        lines.push({ text: line, cols });
    }
    return lines;
}

// visible length (ANSI 제거)
function visLen(s) {
    return s.replace(/\x1B\[[0-9;]*m/g, '').length;
}

// 검정 배경으로 패딩
function padLine(line, lineCols, totalCols) {
    const pad = totalCols - lineCols;
    if (pad <= 0) return line;
    // 검정 bg로 남은 공간 채우기
    return line + `\x1b[40m` + ' '.repeat(pad) + '\x1b[0m';
}

const WW  = chalk.hex('#c8c5be');
const MU  = chalk.hex('#000000');
const W   = chalk.hex('#f0ede6');
const TAG = chalk.hex('#2E7D45').bold;
const DIM = chalk.hex('#33B458');
const BG  = '\x1b[40m'; // black bg
const RST = '\x1b[0m';

async function showSplash(scale = 0.5) {
    const imgPath = findImage();
    const termW = process.stdout.columns || 100;
    const innerW = Math.min(termW - 2, 110); // 박스 내부 너비

    const border = DIM('─'.repeat(innerW));

    if (!imgPath) {
        console.log(DIM(`┌${border}┐`));
        console.log(DIM('│') + BG + ' '.repeat(innerW) + RST + DIM('│'));
        console.log(DIM('│') + BG + '  ' + WW('obnofi') + ' '.repeat(innerW - 8) + RST + DIM('│'));
        console.log(DIM('│') + BG + ' '.repeat(innerW) + RST + DIM('│'));
        console.log(DIM(`└${border}┘`));
        return;
    }

    try {
        const imgLines = await renderImage(imgPath, innerW, scale);
        const imgCols = imgLines[0]?.cols ?? innerW;

        // 박스 상단
        console.log(DIM(`┌${border}┐`));

        // 이미지 행들 — 오른쪽 나머지는 검정
        for (const { text, cols } of imgLines) {
            const rightPad = innerW - cols;
            const right = rightPad > 0 ? `\x1b[40m` + ' '.repeat(rightPad) + RST : '';
            process.stdout.write(DIM('│') + text + right + DIM('│') + '\n');
        }

        // 빈 줄
        console.log(DIM('│') + BG + ' '.repeat(innerW) + RST + DIM('│'));

        // 텍스트 라인들
        const textLines = [
            '  ' + WW('Obsidian + Notion + FigJam  —  all in one'),
            '  ' + MU('v0.1.0  ·  2026 graduation project'),
            '',
            '  ' + TAG(' ❯') + W(' obnofi start  ') + MU('Launch the workspace'),
            '  ' + TAG(' ❯') + W(' obnofi new    ') + MU('Create a new page'),
            '  ' + TAG(' ❯') + W(' obnofi --help ') + MU('Show all commands'),
        ];

        for (const line of textLines) {
            const vl = visLen(line);
            const pad = Math.max(0, innerW - vl);
            console.log(DIM('│') + BG + line + ' '.repeat(pad) + RST + DIM('│'));
        }

        // 빈 줄 + 하단
        console.log(DIM('│') + BG + ' '.repeat(innerW) + RST + DIM('│'));
        console.log(DIM(`└${border}┘`));
        console.log('');
        console.log('  ' + WW('Ready.'));

    } catch (e) {
        console.error('splash error:', e.message);
    }
}

module.exports = { showSplash };