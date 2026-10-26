// 小さな HTML パーサー。Apps Script には DOM が無いため自前で木を作る。
// クラブサポートシステムのページを読むのに必要な範囲だけを実装している。

var HTML_VOID_TAGS = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
var HTML_RAW_TEXT_TAGS = { script: 1, style: 1 };
// 開始タグが来たとき、閉じタグ省略のために暗黙に閉じる要素
var HTML_IMPLIED_END = {
  tr: ['td', 'th', 'tr'],
  td: ['td', 'th'],
  th: ['td', 'th'],
  tbody: ['td', 'th', 'tr', 'tbody', 'thead', 'tfoot'],
  thead: ['td', 'th', 'tr', 'tbody', 'thead', 'tfoot'],
  tfoot: ['td', 'th', 'tr', 'tbody', 'thead', 'tfoot'],
  option: ['option'],
  optgroup: ['option', 'optgroup'],
  li: ['li'],
  p: ['p']
};
var HTML_BLOCK_TAGS = { div: 1, p: 1, tr: 1, table: 1, li: 1, ul: 1, ol: 1, h1: 1, h2: 1, h3: 1, h4: 1, form: 1 };

function htmlDecodeEntities(s) {
  var named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
    if (e[0] === '#') {
      var code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return isNaN(code) ? m : String.fromCodePoint(code);
    }
    var v = named[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function htmlParseAttrs(s) {
  var attrs = {};
  var re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  var m;
  while ((m = re.exec(s)) !== null) {
    var v = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    attrs[m[1].toLowerCase()] = htmlDecodeEntities(v);
  }
  return attrs;
}

// 引用符の中の '>' を無視してタグの終わりを探す
function htmlFindTagEnd(html, i) {
  var quote = null;
  for (; i < html.length; i++) {
    var c = html[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

function parseHtml(html) {
  var root = { tag: '#root', attrs: {}, children: [], parent: null };
  var stack = [root];
  var top = function () { return stack[stack.length - 1]; };
  var i = 0;
  var textStart = 0;

  function flushText(end) {
    if (end > textStart) {
      top().children.push({ text: htmlDecodeEntities(html.slice(textStart, end)) });
    }
  }

  while (i < html.length) {
    var lt = html.indexOf('<', i);
    if (lt === -1) break;
    i = lt;
    if (html.startsWith('<!--', i)) {
      flushText(i);
      var endComment = html.indexOf('-->', i + 4);
      i = textStart = endComment === -1 ? html.length : endComment + 3;
      continue;
    }
    var m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(html.slice(i, i + 40));
    if (!m) {
      if (html[i + 1] === '!' || html[i + 1] === '?') {
        flushText(i);
        var endDecl = html.indexOf('>', i);
        i = textStart = endDecl === -1 ? html.length : endDecl + 1;
      } else {
        i++; // ただの '<' 文字
      }
      continue;
    }
    var end = htmlFindTagEnd(html, i + m[0].length);
    if (end === -1) break;
    flushText(i);
    var tag = m[2].toLowerCase();
    if (m[1]) {
      // 終了タグ：対応する開始タグまで閉じる。無ければ無視。
      // ブラウザと同じく table の境界は越えない（<th>…</td> のような誤記で外側の表を閉じないため）
      for (var k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === tag) {
          stack.length = k;
          break;
        }
        if (stack[k].tag === 'table') break;
      }
      i = textStart = end + 1;
      continue;
    }
    var implied = HTML_IMPLIED_END[tag];
    if (implied) {
      while (stack.length > 1 && implied.indexOf(top().tag) !== -1) stack.pop();
    }
    var attrText = html.slice(i + m[0].length, end);
    var node = { tag: tag, attrs: htmlParseAttrs(attrText), children: [], parent: top() };
    top().children.push(node);
    i = textStart = end + 1;
    if (HTML_RAW_TEXT_TAGS[tag]) {
      var close = html.toLowerCase().indexOf('</' + tag, i);
      i = textStart = close === -1 ? html.length : close;
      continue;
    }
    if (!HTML_VOID_TAGS[tag] && !/\/\s*$/.test(attrText)) stack.push(node);
  }
  flushText(html.length);
  return root;
}

function htmlFindAll(node, pred, out) {
  out = out || [];
  var kids = node.children || [];
  for (var i = 0; i < kids.length; i++) {
    var c = kids[i];
    if (c.tag) {
      if (pred(c)) out.push(c);
      htmlFindAll(c, pred, out);
    }
  }
  return out;
}

function htmlByTag(node, tag) {
  return htmlFindAll(node, function (n) { return n.tag === tag; });
}

function htmlHasClass(node, cls) {
  return (' ' + (node.attrs['class'] || '') + ' ').indexOf(' ' + cls + ' ') !== -1;
}

function htmlByClass(node, tag, cls) {
  return htmlFindAll(node, function (n) { return n.tag === tag && htmlHasClass(n, cls); });
}

// table 直下（tbody 等を含む）の行。入れ子の table の行は含めない
function htmlRows(table) {
  var rows = [];
  (table.children || []).forEach(function (c) {
    if (c.tag === 'tr') rows.push(c);
    else if (c.tag === 'tbody' || c.tag === 'thead' || c.tag === 'tfoot') {
      c.children.forEach(function (r) { if (r.tag === 'tr') rows.push(r); });
    }
  });
  return rows;
}

function htmlCells(row) {
  return (row.children || []).filter(function (c) { return c.tag === 'td' || c.tag === 'th'; });
}

// ブラウザの innerText に近い文字列。<br> とブロック要素の境目を改行にする
function htmlInnerText(node, skipTags) {
  var parts = [];
  (function walk(n) {
    if (n.text !== undefined) {
      parts.push(n.text.replace(/[ \t\n\r\f]+/g, ' '));
      return;
    }
    if (n.tag === 'br') { parts.push('\n'); return; }
    if (HTML_RAW_TEXT_TAGS[n.tag] || (skipTags && skipTags[n.tag])) return;
    var block = HTML_BLOCK_TAGS[n.tag];
    if (block) parts.push('\n');
    (n.children || []).forEach(walk);
    if (block) parts.push('\n');
  })(node);
  return parts.join('');
}
