// 数式の組版（js/tex.js）：HTML に入れる文字は無害に。KaTeX が読めるまでは、ふつうの文字で出す
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { loadScripts } = require("./load.js");

function setup(katex) {
  const added = [];
  const document = {
    head: { appendChild: (el) => added.push(el) },
    createElement: (tag) => ({ tag })
  };
  const w = loadScripts(["js/tex.js"], { document, katex });
  return { Tex: w.OthelloTex, added, w };
}

test("HTML に入れる文字は、タグとして動かない形にする", () => {
  const { Tex } = setup();
  assert.equal(Tex.escapeHtml(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  assert.equal(Tex.escapeHtml(12), "12");
});

test("KaTeX が読めるまでは、問題文をふつうの文字で出し、そのとき1回だけ読みこむ", () => {
  const { Tex, added } = setup();
  const el = {};
  Tex.setText(el, "√144 = ?", "$\\sqrt{144} = ?$", () => {});
  assert.equal(el.textContent, "√144 = ?");
  assert.equal(el.innerHTML, undefined);
  Tex.setText({}, "a", "$a$", () => {});
  // css と js を1回だけ
  assert.equal(added.length, 2);
  assert.match(added[1].src, /katex@[\d.]+\/dist\/katex\.min\.js$/);
});

test("KaTeX が読めたら、$…$ の中だけ数式にし、外の文字は無害にする。分数の選択肢は縦に", () => {
  const katex = { renderToString: (t) => "<k>" + t + "</k>" };
  const { Tex, added } = setup(katex);
  Tex.load();
  added[1].onload();
  assert.equal(Tex.isReady(), true);
  const el = {};
  Tex.setText(el, "x", "<b>$x$ のとき", null);
  assert.equal(el.innerHTML, "&lt;b&gt;<k>x</k> のとき");
  const choice = { setAttribute(k, v) { this[k] = v; } };
  Tex.setChoice(choice, "-2/5", true);
  assert.equal(choice.innerHTML, "<k>-\\frac{2}{5}</k>");
  assert.equal(choice["aria-label"], "-2/5");
  const plain = {};
  Tex.setChoice(plain, "12", true);
  assert.equal(plain.textContent, "12");
});
