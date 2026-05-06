const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const chalk = require('chalk');
const inquirer = require('inquirer');
const open = require('open').default;
const ora = require('ora');

const config = require('../config');

function extractText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (!Array.isArray(node.content)) return '';
  return node.content.map(extractText).join('');
}

function createTextNode(text) {
  return {
    type: 'text',
    text
  };
}

function createParagraphNode(text) {
  return {
    type: 'paragraph',
    content: text ? [createTextNode(text)] : []
  };
}

function createHeadingNode(level, text) {
  return {
    type: 'heading',
    attrs: { level },
    content: text ? [createTextNode(text)] : []
  };
}

function createListNode(kind) {
  return {
    type: kind,
    content: []
  };
}

function createListItemNode(text) {
  return {
    type: 'listItem',
    content: [createParagraphNode(text)]
  };
}

function renderNodeLines(node, depth = 0) {
  if (!node) return [];

  if (Array.isArray(node)) {
    return node.flatMap((item) => renderNodeLines(item, depth));
  }

  if (node.type === 'doc') {
    return renderNodeLines(node.content || [], depth);
  }

  if (node.type === 'paragraph') {
    const text = extractText(node).trim();
    return text ? [`${'  '.repeat(depth)}${text}`] : [];
  }

  if (node.type === 'heading') {
    const level = Number(node.attrs && node.attrs.level) || 1;
    const prefix = `${'  '.repeat(depth)}${'#'.repeat(Math.max(1, Math.min(level, 6)))}`;
    return [`${prefix} ${extractText(node).trim()}`];
  }

  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return (node.content || []).flatMap((item, index) => renderListItemLines(item, depth, node.type, index));
  }

  if (node.type === 'listItem') {
    return renderListItemLines(node, depth, 'bulletList', 0);
  }

  return [];
}

function renderListItemLines(node, depth, listType, index) {
  const children = Array.isArray(node.content) ? node.content : [];
  const textParts = [];
  const nestedLines = [];

  children.forEach((child) => {
    if (child.type === 'bulletList' || child.type === 'orderedList') {
      nestedLines.push(...renderNodeLines(child, depth + 1));
      return;
    }

    const rendered = renderNodeLines(child, 0);
    if (rendered.length > 0) {
      textParts.push(rendered.join(' ').trim());
    }
  });

  const marker = listType === 'orderedList' ? `${index + 1}.` : '-';
  const head = `${'  '.repeat(depth)}${marker} ${textParts.join(' ').trim()}`.trimEnd();
  return [head, ...nestedLines].filter(Boolean);
}

function formatContent(content) {
  if (typeof content === 'string') return content;
  if (content === null || typeof content === 'undefined') return '';

  const lines = renderNodeLines(content);
  if (lines.length > 0) {
    return lines.join('\n');
  }

  return JSON.stringify(content, null, 2);
}

function toMarkdown(node, depth = 0) {
  if (!node) return '';

  if (Array.isArray(node)) {
    return node.map((item) => toMarkdown(item, depth)).filter(Boolean).join('\n\n');
  }

  if (node.type === 'doc') {
    return toMarkdown(node.content || [], depth);
  }

  if (node.type === 'paragraph') {
    return `${'  '.repeat(depth)}${extractText(node).trim()}`.trimEnd();
  }

  if (node.type === 'heading') {
    const level = Number(node.attrs && node.attrs.level) || 1;
    return `${'#'.repeat(Math.max(1, Math.min(level, 6)))} ${extractText(node).trim()}`.trimEnd();
  }

  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return (node.content || [])
      .map((item, index) => listItemToMarkdown(item, depth, node.type, index))
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function listItemToMarkdown(node, depth, listType, index) {
  const children = Array.isArray(node.content) ? node.content : [];
  const marker = listType === 'orderedList' ? `${index + 1}.` : '-';
  const blocks = [];
  let headText = '';

  children.forEach((child) => {
    if ((child.type === 'paragraph' || child.type === 'heading') && !headText) {
      headText = extractText(child).trim();
      return;
    }

    const nested = toMarkdown(child, depth + 1);
    if (nested) {
      blocks.push(nested);
    }
  });

  const firstLine = `${'  '.repeat(depth)}${marker} ${headText}`.trimEnd();
  return [firstLine, ...blocks].filter(Boolean).join('\n');
}

function markdownFromDocument(title, content) {
  const body = toMarkdown(content);
  return [`# ${title || ''}`, body].filter(Boolean).join('\n\n').trimEnd() + '\n';
}

function finalizeParagraph(doc, paragraphLines) {
  if (paragraphLines.length === 0) return;
  doc.content.push(createParagraphNode(paragraphLines.join(' ')));
  paragraphLines.length = 0;
}

function closeListStack(doc, stack, minDepth) {
  while (stack.length > minDepth) {
    const item = stack.pop();
    const node = item.node;
    if (stack.length > 0) {
      const parentItem = stack[stack.length - 1].lastItem;
      if (parentItem) {
        parentItem.content.push(node);
      }
    } else {
      doc.content.push(node);
    }
  }
}

function parseMarkdownDocument(raw, fallbackTitle) {
  const source = String(raw || '').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  let title = String(fallbackTitle || '').trim();

  while (lines.length > 0 && !lines[0].trim()) {
    lines.shift();
  }

  if (lines[0] && /^#\s+/.test(lines[0])) {
    title = lines.shift().replace(/^#\s+/, '').trim();
  }

  while (lines.length > 0 && !lines[0].trim()) {
    lines.shift();
  }

  const doc = { type: 'doc', content: [] };
  const paragraphLines = [];
  const listStack = [];

  lines.forEach((line) => {
    const bulletMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    const headingMatch = line.match(/^(#{2,6})\s+(.*)$/);

    if (!line.trim()) {
      finalizeParagraph(doc, paragraphLines);
      closeListStack(doc, listStack, 0);
      return;
    }

    if (headingMatch) {
      finalizeParagraph(doc, paragraphLines);
      closeListStack(doc, listStack, 0);
      doc.content.push(createHeadingNode(headingMatch[1].length, headingMatch[2].trim()));
      return;
    }

    if (bulletMatch) {
      finalizeParagraph(doc, paragraphLines);
      const indent = bulletMatch[1].replace(/\t/g, '  ').length;
      const depth = Math.floor(indent / 2);
      const kind = /\d+\./.test(bulletMatch[2]) ? 'orderedList' : 'bulletList';
      const text = bulletMatch[3].trim();

      closeListStack(doc, listStack, depth);

      let frame = listStack[depth];
      if (!frame || frame.kind !== kind) {
        closeListStack(doc, listStack, depth);
        frame = { depth, kind, node: createListNode(kind), lastItem: null };
        listStack.push(frame);
      }

      const item = createListItemNode(text);
      frame.node.content.push(item);
      frame.lastItem = item;
      return;
    }

    closeListStack(doc, listStack, 0);
    paragraphLines.push(line.trim());
  });

  finalizeParagraph(doc, paragraphLines);
  closeListStack(doc, listStack, 0);

  return {
    title,
    content: doc
  };
}

function buildNoteTree(items) {
  const nodes = items.map((item, index) => ({
    ...item,
    _index: index,
    children: []
  }));
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const roots = [];

  nodes.forEach((item) => {
    const parentId = item.parentId || null;
    const parent = parentId ? byId.get(parentId) : null;
    if (parent) {
      parent.children.push(item);
      return;
    }
    roots.push(item);
  });

  const sortNodes = (list) => {
    list.sort((a, b) => {
      const timeA = Date.parse(a.updatedAt || '') || 0;
      const timeB = Date.parse(b.updatedAt || '') || 0;
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return a._index - b._index;
    });
    list.forEach((item) => sortNodes(item.children));
  };

  sortNodes(roots);
  return roots;
}

function flattenNoteTree(nodes, depth = 0, output = []) {
  nodes.forEach((item) => {
    output.push({ item, depth });
    flattenNoteTree(item.children || [], depth + 1, output);
  });
  return output;
}

async function resolveNoteSelector(client, selector) {
  const raw = String(selector || '').trim();
  if (!raw) {
    throw new Error('노트 id 또는 제목을 입력해 주세요.');
  }

  try {
    const { data } = await client.get(`/pages/${raw}`);
    if (data && data.type === 'document') {
      return data;
    }
  } catch (error) {
    if (error.response?.status !== 404) {
      throw error;
    }
  }

  const { data } = await client.get('/pages');
  const rows = (Array.isArray(data) ? data : data.items || [])
    .filter((item) => item.type === 'document');
  const exactMatches = rows.filter((item) => String(item.title || '').trim() === raw);

  if (exactMatches.length === 1) {
    const { data: page } = await client.get(`/pages/${exactMatches[0].id}`);
    return page;
  }

  if (exactMatches.length > 1) {
    const ids = exactMatches.map((item) => item.id).join(', ');
    throw new Error(`같은 제목의 노트가 여러 개 있어요. id로 지정해 주세요: ${ids}`);
  }

  throw new Error(`노트를 찾을 수 없어요: ${raw}`);
}

function registerNoteCommands(program) {
  const note = program.command('note').description('Note commands');

  note
    .command('ls')
    .option('--search <query>', 'Search title keyword')
    .option('-n, --limit <number>', 'Number of notes', '20')
    .action(async (options) => {
      const spinner = ora('노트 목록 불러오는 중...').start();
      try {
        const client = config.createApiClient();
        const { data } = await client.get('/pages');
        spinner.succeed('불러오기 완료');
        const rows = (Array.isArray(data) ? data : data.items || [])
          .filter((item) => item.type === 'document')
          .filter((item) => {
            if (!options.search) return true;
            return String(item.title || '').toLowerCase().includes(String(options.search).toLowerCase());
          })
          .slice(0, Number(options.limit));

        if (rows.length === 0) {
          console.log(chalk.dim('표시할 문서가 없습니다.'));
          return;
        }

        const tree = buildNoteTree(rows);
        const flattened = flattenNoteTree(tree);

        flattened.forEach(({ item, depth }, idx) => {
          const branch = depth > 0 ? `${'  '.repeat(depth)}└ ` : '';
          console.log(
            `${chalk.dim(String(idx + 1).padStart(2, ' '))} ${branch}${chalk.bold(item.title || '(untitled)')} ${chalk.dim(item.updatedAt || '')} ${chalk.dim(item.id || '')}`
          );
        });
      } catch (error) {
        spinner.fail('실패');
        console.error(chalk.red('✗'), error.response?.data?.message || error.message);
        process.exit(1);
      }
    });

  note
    .command('new <title>')
    .option('--open', 'Open in browser after creation')
    .action(async (title, options) => {
      const spinner = ora('노트 생성 중...').start();
      try {
        const client = config.createApiClient();
        const { data } = await client.post('/pages', {
          title,
          type: 'document'
        });
        spinner.succeed('생성 완료');
        console.log(chalk.green('✓'), `id: ${chalk.dim(data.id)}`);
        if (options.open) {
          const url = `${config.getBaseUrl().replace(/\/$/, '')}/pages/${data.id}`;
          await open(url);
        }
      } catch (error) {
        spinner.fail('생성 실패');
        console.error(chalk.red('✗'), error.response?.data?.message || error.message);
        process.exit(1);
      }
    });

  note.command('cat <selector>').action(async (selector) => {
    const spinner = ora('노트 불러오는 중...').start();
    try {
      const client = config.createApiClient();
      const data = await resolveNoteSelector(client, selector);
      spinner.stop();
      console.log(`# ${data.title || ''}\n`);
      console.log(formatContent(data.content));
    } catch (error) {
      spinner.fail('조회 실패');
      console.error(chalk.red('✗'), error.response?.data?.message || error.message);
      process.exit(1);
    }
  });

  note.command('edit <selector>').action(async (selector) => {
    const spinner = ora('노트 가져오는 중...').start();
    let tmpPath = '';
    try {
      const client = config.createApiClient();
      const data = await resolveNoteSelector(client, selector);
      tmpPath = path.join(os.tmpdir(), `obnofi-${data.id}.md`);
      fs.writeFileSync(tmpPath, markdownFromDocument(data.title || '', data.content || {}));
      spinner.succeed('에디터를 엽니다');

      const editor = process.env.EDITOR || 'vi';
      execSync(`${editor} ${tmpPath}`, { stdio: 'inherit' });

      const saved = fs.readFileSync(tmpPath, 'utf8');
      const parsed = parseMarkdownDocument(saved, data.title || '');
      const title = String(parsed.title || '').trim();
      const content = parsed.content;

      const saveSpinner = ora('저장 중...').start();
      await client.patch(`/pages/${data.id}`, { title, content });
      saveSpinner.succeed('저장 완료');
      fs.unlinkSync(tmpPath);
      console.log(chalk.green('✓'), '수정 완료');
    } catch (error) {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      spinner.fail('수정 실패');
      console.error(chalk.red('✗'), error.response?.data?.message || error.message);
      process.exit(1);
    }
  });

  note
    .command('delete <selector>')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (selector, options) => {
      let page;
      try {
        const client = config.createApiClient();
        page = await resolveNoteSelector(client, selector);
      } catch (error) {
        console.error(chalk.red('✗'), error.response?.data?.message || error.message);
        process.exit(1);
      }

      if (!options.yes) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `정말로 '${page.title || page.id}' 노트를 삭제하시겠습니까?`,
            default: false
          }
        ]);
        if (!confirm) {
          console.log('취소되었습니다.');
          return;
        }
      }

      const spinner = ora('노트 삭제 중...').start();
      try {
        const client = config.createApiClient();
        await client.delete(`/pages/${page.id}`);
        spinner.succeed('삭제 완료');
        console.log(chalk.green('✓'), '노트를 삭제했습니다.');
      } catch (error) {
        spinner.fail('삭제 실패');
        console.error(chalk.red('✗'), error.response?.data?.message || error.message);
        process.exit(1);
      }
    });
}

module.exports = { registerNoteCommands };
