// 教養モードの問題（js/quiz.js）：ルールの形・問題の選び方・読みこみ・マスごとの問題・入力の答え合わせ
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { loadScripts } = require("./load.js");

// questions/ を手元のファイルから読む fetch。files で中身を差しかえられる
function setup(files) {
  const warnings = [];
  const fetch = (url) => {
    const name = url.replace(/^questions\//, "");
    const text = files && name in files ? files[name] : (() => {
      try { return fs.readFileSync(path.join(__dirname, "..", "questions", name), "utf8"); } catch (e) { return null; }
    })();
    return Promise.resolve({
      ok: text !== null,
      status: text === null ? 404 : 200,
      json: () => Promise.resolve(typeof text === "string" ? JSON.parse(text) : text)
    });
  };
  const w = loadScripts(["js/game.js", "js/quiz.js"], { fetch, console: { warn: (...a) => warnings.push(a.join(" ")), log() {} } });
  return { Quiz: w.OthelloQuiz, Game: w.OthelloGame, warnings };
}

test("ルールの形：足りない・変な値は決まった値に。前の形 { genre, level } も読む", () => {
  const { Quiz } = setup();
  assert.deepEqual(JSON.parse(JSON.stringify(Quiz.normalizeRules(null))),
    { mode: "normal", size: 8, picks: [], lives: 3, answerMode: "choice", timeLimit: 0, seed: 1 });
  const r = Quiz.normalizeRules({ mode: "quiz", size: 6, genre: "math", level: "j", lives: 99, timeLimit: "20", answerMode: "input", seed: 5 });
  assert.equal(r.size, 6);
  assert.equal(r.lives, 3);
  assert.equal(r.timeLimit, 20);
  assert.equal(r.answerMode, "input");
  assert.deepEqual(JSON.parse(JSON.stringify(r.picks)), [{ genre: "math", level: "j" }]);
  // ない問題は外す。ないレベルはそのジャンルの最初。同じものは1つ
  const picks = Quiz.normalizeRules({ picks: [{ genre: "nope", level: "e" }, { genre: "math", level: "zz" }, { genre: "math", level: "e" }, null] }).picks;
  assert.deepEqual(JSON.parse(JSON.stringify(picks)), [{ genre: "math", level: "e" }]);
});

test("問題を選ぶ・外す。教養モードは問題を選ぶまで始められない", () => {
  const { Quiz } = setup();
  let rules = Quiz.normalizeRules({ mode: "quiz" });
  assert.equal(Quiz.isReady(rules), false);
  assert.equal(Quiz.describe(rules), "問題を選んでいません");
  rules.picks = Quiz.togglePick(rules, "math:j");
  assert.equal(Quiz.hasPick(rules, "math:j"), true);
  assert.equal(Quiz.isReady(rules), true);
  assert.equal(Quiz.describe(rules), "数学（中学）");
  rules.picks = Quiz.togglePick(rules, "math:e");
  assert.equal(Quiz.describe(rules), "ミックス（2種類）");
  rules.picks = Quiz.togglePick(rules, "math:j");
  assert.equal(Quiz.hasPick(rules, "math:j"), false);
  assert.equal(Quiz.isReady({ mode: "normal" }), true);
});

test("入力の答え合わせ：ひらがな・カタカナ、全角・半角、空白のちがいは同じとみなす", () => {
  const { Quiz } = setup();
  const q = { choices: ["ゆうき", "x"], answer: 0 };
  assert.equal(Quiz.checkInput(q, "ユウキ"), true);
  assert.equal(Quiz.checkInput(q, " ゆう き "), true);
  assert.equal(Quiz.checkInput(q, "ゆうぎ"), false);
  assert.equal(Quiz.checkInput(q, ""), false);
  const n = { choices: ["-12", "3"], answer: 0 };
  assert.equal(Quiz.checkInput(n, "−１２"), true);
});

test("マスの問題は、種とマスで決まる（両方の端末で同じ）。4択で、正解は選択肢の中", () => {
  const { Quiz } = setup();
  const rules = { mode: "quiz", picks: [{ genre: "math", level: "e" }], seed: 42 };
  const a = Quiz.questionFor(rules, 0, 0, 0);
  const b = Quiz.questionFor(rules, 0, 0, 0);
  assert.equal(a.text, b.text);
  assert.deepEqual(a.choices, b.choices);
  assert.equal(a.choices.length, 4);
  assert.equal(new Set(a.choices).size, 4);
  assert.ok(a.answer >= 0 && a.answer < 4);
  assert.equal(a.pickLabel, "数学（小学）");
  assert.equal(a.canInput, true);
  // 不正解のあとは別の問題
  assert.notEqual(Quiz.questionFor(rules, 0, 0, 1).text, a.text);
  // 問題を選んでいなければ空の問題（落ちない）
  assert.equal(Quiz.questionFor({ mode: "quiz", picks: [] }, 0, 0, 0).choices.length, 0);
});

test("8×8 の空きマスどうしで、同じ問題は出ない", () => {
  const { Quiz } = setup();
  const rules = { mode: "quiz", size: 8, picks: [{ genre: "math", level: "u" }], seed: 7 };
  const seen = new Set();
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if ((row === 3 || row === 4) && (col === 3 || col === 4)) continue;
      seen.add(Quiz.questionFor(rules, row, col, 0).text);
    }
  }
  assert.equal(seen.size, 60);
});

test("不正解のあとの問題は、いま空きマスに出ている問題と重ならない", () => {
  const { Quiz, Game } = setup();
  const rules = Quiz.normalizeRules({ mode: "quiz", size: 6, picks: [{ genre: "math", level: "e" }], seed: 3 });
  const board = Game.createInitialBoard(6);
  const retries = {};
  const position = Quiz.nextRetryPosition(rules, board, retries);
  // 6×6 の空きマスは 32。まだ使っていない山の位置から出す
  assert.equal(position, 32);
  retries["0-0"] = [position];
  const again = Quiz.questionAt(rules, { "0-0": 1 }, retries, 0, 0);
  const showing = new Set();
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      if ((row === 2 || row === 3) && (col === 2 || col === 3)) continue;
      if (row === 0 && col === 0) continue;
      showing.add(Quiz.questionAt(rules, {}, retries, row, col).text);
    }
  }
  assert.equal(showing.has(again.text), false);
  assert.equal(Quiz.currentPosition(rules, retries, 0, 0), 32);
});

test("問題のファイルを読む：数学はいつも最後。線アイコンの名前がなければ book-open", async () => {
  const { Quiz } = setup();
  await Quiz.load();
  const ids = Quiz.GENRES.map((g) => g.id);
  assert.deepEqual(ids, ["kanji", "english", "proverb", "general", "math"]);
  assert.deepEqual(Quiz.GENRES.map((g) => g.iconName), ["edit", "languages", "scroll", "globe", "calculator"]);
  const { Quiz: Q2 } = setup({ "index.json": '["x.json"]', "x.json": JSON.stringify({ id: "x", label: "X", levels: [{ id: "a", label: "A", type: "choices", items: [{ q: "q", a: "a", w: ["1", "2", "3"] }] }] }) });
  await Q2.load();
  assert.equal(Q2.findGenre("x").iconName, "book-open");
});

test("形のおかしい問題・レベル・ファイルは読み飛ばし、ほかは使える。一覧が読めなくても数学で遊べる", async () => {
  const good = { id: "g", label: "G", levels: [{ id: "a", label: "A", type: "pairs", items: [["1", "い"], ["2", "ろ"], ["3", "は"], ["4", "に"], ["4", "dup"], ["x"]] }] };
  const few = { id: "few", label: "F", levels: [{ id: "a", label: "A", type: "pairs", items: [["1", "い"]] }] };
  const { Quiz, warnings } = setup({
    "index.json": '["g.json", "few.json", "broken.json", "../bad.json", "math.json"]',
    "g.json": JSON.stringify(good), "few.json": JSON.stringify(few), "broken.json": JSON.stringify({ id: "" }),
    "math.json": JSON.stringify(Object.assign({}, good, { id: "math" }))
  });
  await Quiz.load();
  assert.deepEqual(Quiz.GENRES.map((g) => g.id), ["g", "math"]);
  assert.equal(Quiz.findGenre("g").levels[0].items.length, 4);
  assert.ok(warnings.length >= 3);

  const { Quiz: Q2 } = setup({ "index.json": null });
  await Q2.load();
  assert.deepEqual(Q2.GENRES.map((g) => g.id), ["math"]);
});

test("COM の正解率は、レベルが上がるほど少し下がる（いちばん下でも半分）", () => {
  const { Quiz } = setup();
  const rates = ["e", "j", "h", "u"].map((level) => Quiz.comAccuracy({ genre: "math", level }));
  assert.equal(rates[0], 0.8);
  assert.ok(rates[0] > rates[1] && rates[1] > rates[2] && rates[2] > rates[3]);
  assert.ok(rates.every((r) => r >= 0.5));
});
