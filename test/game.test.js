// 盤のゲームの決まり（js/game.js）：はじめの盤・置けるマス・ひっくり返す・手番・終わりと勝ち負け
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { loadScripts } = require("./load.js");

const Game = loadScripts(["js/game.js"]).OthelloGame;
const { BLACK: B, WHITE: W } = Game;

// 文字の並び（"..BW...."）から盤を作る
const board = (rows) => Game.deserializeBoard(rows);

test("はじめの盤：まん中に白黒2つずつ。6 と 8 のほかは 8", () => {
  assert.deepEqual(Game.serializeBoard(Game.createInitialBoard(6)), ["......", "......", "..WB..", "..BW..", "......", "......"]);
  assert.equal(Game.createInitialBoard(7).length, 8);
  assert.equal(Game.createInitialBoard("6").length, 6);
  const fresh = Game.createFreshGame(8);
  assert.equal(fresh.currentTurn, B);
  assert.equal(fresh.winner, "");
  assert.equal(fresh.lastMove, null);
});

test("黒のはじめの置けるマスは4つ", () => {
  const moves = Game.getValidMoves(Game.createInitialBoard(8), B).map((m) => m.row + "-" + m.col).sort();
  assert.deepEqual(moves, ["2-3", "3-2", "4-5", "5-4"]);
  assert.deepEqual(Game.getValidMoves(Game.createInitialBoard(8), ""), []);
});

test("置くと、はさんだ石が全部の向きでひっくり返る。置けないマス・石のあるマスは変えない", () => {
  const b = board(["B.......", "W.......", "........", "........", "........", "........", "........", "........"]);
  assert.equal(Game.applyMove(b, 2, 0, B), true);
  assert.equal(b[1][0], B);
  // ななめと横を一度に
  const c = board(["B.B.....", ".WW.....", "BW......", "........", "........", "........", "........", "........"]);
  assert.equal(Game.applyMove(c, 2, 2, B), true);
  assert.deepEqual([c[1][1], c[1][2], c[2][1]], [B, B, B]);
  const before = Game.serializeBoard(c);
  assert.equal(Game.applyMove(c, 7, 7, B), false);
  assert.equal(Game.applyMove(c, 0, 0, W), false);
  assert.deepEqual(Game.serializeBoard(c), before);
});

test("盤の外へはつながない（端で止まる）", () => {
  const b = board(["WWWWWWW.", "........", "........", "........", "........", "........", "........", "........"]);
  assert.equal(Game.applyMove(b, 0, 7, B), false);
});

test("相手が置けなければ、もう一度同じ色の番", () => {
  // 白は (0,2) に置けるが、黒はどこにも置けない形
  const game = { board: board(["WB......", "........", "........", "........", "........", "........", "........", "........"]), currentTurn: B, winner: "" };
  const text = Game.resolveTurnAfterMove(game, W);
  assert.equal(game.currentTurn, W);
  assert.equal(game.winner, "");
  assert.match(text, /黒は置ける場所がありません。もう一度白の手番です/);
});

test("どちらも置けなければ終わり。石の多いほうの勝ち・同じなら引き分け", () => {
  const win = { board: board(["BBB.....", "........", "........", "........", "........", "........", "........", "W......."]), currentTurn: W, winner: "" };
  assert.match(Game.resolveTurnAfterMove(win, B), /黒の勝ちです。スコアは 3対1/);
  assert.equal(win.currentTurn, "");
  assert.equal(win.winner, "黒");
  assert.equal(Game.outcomeForColor(win.winner, B), "win");
  assert.equal(Game.outcomeForColor(win.winner, W), "lose");

  const draw = { board: board(["B.......", "........", "........", "........", "........", "........", "........", "W......."]), currentTurn: B, winner: "" };
  assert.match(Game.resolveTurnAfterMove(draw, B), /1対1で引き分け/);
  assert.equal(Game.outcomeForColor(draw.winner, B), "draw");
  assert.equal(Game.outcomeForColor("", B), "");
});

test("教養モードで答えられなかったら、石は置かずに相手の番（相手が置けなければ自分）", () => {
  const game = { board: Game.createInitialBoard(8), currentTurn: B };
  assert.match(Game.passTurnAfterMiss(game, B), /白の手番です/);
  assert.equal(game.currentTurn, W);
  const stuck = { board: board(["WB......", "........", "........", "........", "........", "........", "........", "........"]), currentTurn: W };
  // 黒は置けない形：白が答えられなくても、もう一度白
  assert.match(Game.passTurnAfterMiss(stuck, W), /黒は置ける場所がないので、もう一度白の手番です/);
  assert.equal(stuck.currentTurn, W);
});

test("盤は文字の並びにして送り、同じ盤に戻せる。変な文字の並びでも決まった大きさになる", () => {
  const b = Game.createInitialBoard(6);
  Game.applyMove(b, 1, 2, B);
  assert.deepEqual(Game.deserializeBoard(Game.serializeBoard(b)), b);
  assert.equal(Game.deserializeBoard(null).length, 8);
  assert.equal(Game.deserializeBoard(["B"]).length, 8);
  assert.deepEqual(Game.countDiscs(b), { black: 4, white: 1 });
});

test("COM の手：すみ > へり > ひっくり返る数。置けなければ null", () => {
  // へり (0,1) だけに置ける形
  const edge = board(["..WB....", ".W......", "B.......", "........", "........", "........", "........", "........"]);
  assert.deepEqual(JSON.parse(JSON.stringify(Game.pickComMove(edge, B))), { row: 0, col: 1, score: 11 });
  // すみ (0,0) にも置ける形
  const corner = board([".WB.....", "W.......", "B.......", "........", "........", "........", "........", "........"]);
  assert.deepEqual(JSON.parse(JSON.stringify(Game.pickComMove(corner, B))), { row: 0, col: 0, score: 102 });
  // はじめの盤：どれも1つ返る。同じなら先に見つけたマス
  assert.deepEqual(JSON.parse(JSON.stringify(Game.pickComMove(Game.createInitialBoard(8), B))), { row: 2, col: 3, score: 1 });
  assert.equal(Game.pickComMove(board(["B......."]), W), null);
});
