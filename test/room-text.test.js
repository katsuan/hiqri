// ルームと対局の様子から出す文（js/room-text.js）：ルームの欄・カードの様子・START・結果のひとこと・知らせの欄
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { loadScripts } = require("./load.js");

function setup({ connected = false, width = 1024 } = {}) {
  const peer = { connected };
  const w = loadScripts(["js/game.js", "js/room-text.js"], {
    innerWidth: width,
    AppPeer: { isConnected: () => peer.connected }
  });
  return { Text: w.OthelloRoomText, Game: w.OthelloGame, peer };
}

// 画面の状態（session.js の app）の、ここで読むところだけ
function app(over) {
  return Object.assign({
    roomId: "", role: "", opponentMode: "human", transportMode: "matchmaking",
    matchConfigured: false, localTwoPlayer: false, practiceWhileWaiting: false, hostTransferred: false,
    reconnecting: false, resumePending: false, spectatorMode: false, staleGuest: false,
    resultOverlayDismissed: false, desiredHostColor: "B", myColor: "", roomData: null,
    game: { lastMove: null, winner: "", currentTurn: "B" },
    rematch: { incoming: false, outgoing: false },
    status: { message: "", mode: "", opponent: "" }
  }, over);
}

test("ルームの欄：ルームの前は3択、招待中は招待を出す、COM と 1台で2人はルームIDを出さない", () => {
  const { Text } = setup();
  const lobby = Text.getRoomFlow(app());
  assert.equal(lobby.label, "はじめる");
  assert.equal(lobby.toolsSummary, "ルームIDで参加");
  assert.equal(lobby.showCurrentRoom, false);

  const inviting = Text.getRoomFlow(app({ roomId: "r1", role: "host" }));
  assert.equal(inviting.label, "招待中");
  assert.equal(inviting.showShare, true);
  assert.equal(inviting.showCurrentRoom, true);
  assert.equal(inviting.joinLabel, "別のルームに参加");

  const com = Text.getRoomFlow(app({ roomId: "r1", role: "host", opponentMode: "com" }));
  assert.equal(com.label, "ひとりで");
  assert.equal(com.showCurrentRoom, false);
  assert.equal(com.showShare, false);

  const local = Text.getRoomFlow(app({ roomId: "r1", role: "host", opponentMode: "local", localTwoPlayer: true }));
  assert.equal(local.label, "1台で2人");
  assert.equal(local.showCurrentRoom, false);

  const practice = Text.getRoomFlow(app({ roomId: "r1", role: "host", opponentMode: "com", practiceWhileWaiting: true }));
  assert.equal(practice.label, "練習中");
  assert.equal(practice.showShare, true);
});

test("ルームの欄：2人そろうところは、つながったかで案内を変える", () => {
  const { Text, peer } = setup();
  const joined = { roomId: "r1", role: "host", roomData: { guestUserId: "U2" } };
  assert.equal(Text.getRoomFlow(app(joined)).label, "START前");
  assert.equal(Text.getRoomFlow(app(joined)).title, "相手の接続を待っています。");
  peer.connected = true;
  assert.equal(Text.getRoomFlow(app(joined)).title, "2人そろいました。");
  const guest = Text.getRoomFlow(app({ roomId: "r1", role: "guest" }));
  assert.equal(guest.label, "参加中");
  assert.equal(guest.showShare, false);
});

test("ルームの欄：対局が終わったら、結果を閉じたかとホストかで続け方の案内を変える", () => {
  const { Text } = setup();
  const done = { roomId: "r1", role: "guest", matchConfigured: true, game: { lastMove: { row: 0, col: 0 }, winner: "黒", currentTurn: "" } };
  assert.equal(Text.getRoomFlow(app(done)).label, "対局終了");
  assert.match(Text.getRoomFlow(app(done)).hint, /盤面の「もう一戦する」/);
  assert.match(Text.getRoomFlow(app(Object.assign({}, done, { resultOverlayDismissed: true }))).hint, /ホストが次の対局を準備する/);
  assert.match(Text.getRoomFlow(app(Object.assign({}, done, { role: "host", resultOverlayDismissed: true }))).hint, /「対局の準備」でルールを押す/);
  assert.equal(Text.getRoomFlow(app({ roomId: "r1", role: "host", matchConfigured: true })).label, "対局中");
});

test("カードの様子：手番・勝ち負け・START 待ち", () => {
  const { Text, peer } = setup();
  const playing = app({ roomId: "r1", role: "host", myColor: "B", matchConfigured: true, game: { lastMove: null, winner: "", currentTurn: "B" } });
  assert.equal(Text.getMyStatusText(playing), "あなたの手番");
  assert.equal(Text.getOpponentStatusText(playing), "あなたを待っています");
  assert.equal(Text.getOpponentStatusText(Object.assign({}, playing, { game: { currentTurn: "W" }, opponentQuiz: true })), "問題に回答中");
  const won = app({ roomId: "r1", role: "host", myColor: "W", game: { lastMove: {}, winner: "白", currentTurn: "" } });
  assert.equal(Text.getMyStatusText(won), "勝ちました");
  assert.equal(Text.getOpponentStatusText(won), "負けました");
  const local = app({ localTwoPlayer: true, myColor: "B", matchConfigured: true });
  assert.equal(Text.getMyStatusText(local), "打つ番です");
  assert.equal(Text.getMyPresenceText(local), "この端末");
  // つながる前のゲスト
  const guest = app({ roomId: "r1", role: "guest", transportMode: "p2p" });
  assert.equal(Text.getMyStatusText(guest), "START 待ち");
  peer.connected = true;
  assert.equal(Text.getOpponentPresenceText(guest), "オンライン");
});

test("カードの見出しと名前：せまい画面では短く、色が決まれば色も", () => {
  const wide = setup().Text;
  const narrow = setup({ width: 375 }).Text;
  assert.equal(wide.getMyLabel(app({ myColor: "B" })), "あなた (You) (黒)");
  assert.equal(narrow.getMyLabel(app({ myColor: "B" })), "私 (黒)");
  assert.equal(narrow.getOpponentLabel(app({ myColor: "B" })), "相手 (白)");
  assert.equal(wide.getOpponentLabel(app({ opponentMode: "com" })), "COM");
  assert.equal(wide.getOpponentName(app({ localTwoPlayer: true })), "白の人");
  assert.equal(wide.getOpponentName(app({ opponentDisplayName: "ともだち" })), "ともだち");
  assert.equal(wide.getOpponentName(app({ staleGuest: true, opponentDisplayName: "ともだち" })), "参加待ち");
});

test("START：友だちを待つホストには練習の案内、COM はどちらが黒かを出す", () => {
  const { Text, Game } = setup();
  const waiting = app({ roomId: "r1", role: "host" });
  assert.equal(Text.isHostWaiting(waiting), true);
  assert.equal(Text.shouldShowStartOverlay(waiting), true);
  assert.match(Text.getStartCaption(waiting), /待つ間は COM と練習できます/);
  const com = app({ roomId: "r1", role: "host", opponentMode: "com", desiredHostColor: Game.WHITE });
  assert.equal(Text.getStartCaption(com), "COMが黒で始めます。STARTで練習を始めます。");
  assert.equal(Text.shouldShowStartOverlay(app({ roomId: "r1", role: "guest", opponentMode: "com" })), false);
  assert.equal(Text.shouldShowStartOverlay(Object.assign({}, waiting, { matchConfigured: true })), false);
});

test("結果のひとことと、知らせの欄に出す知らせ", () => {
  const { Text } = setup();
  assert.equal(Text.getResultCaption(app({ rematch: { incoming: true } })), "相手がもう一戦したいそうです。");
  assert.equal(Text.getResultCaption(app({ opponentMode: "com" })), "COM と続けてもう一戦しますか？");
  const msg = (message, over) => Text.shouldShowMessageBox(app(Object.assign({ roomId: "r1", status: { message, mode: "対局" } }, over)));
  assert.equal(msg("ルームIDをコピーしました。"), true);
  assert.equal(msg("黒の手番です。"), false);
  assert.equal(msg(""), false);
  assert.equal(msg("接続に失敗しました。", { reconnecting: true }), false);
  assert.equal(msg("黒の手番です。", { rematch: { incoming: true } }), true);
});

test("再接続の帯：残りの秒数（1秒より少なくしない）", () => {
  const { Text } = setup();
  const text = Text.getReconnectText(app({ reconnectDeadline: Date.now() + 4200, reconnectReason: "切れました。" }));
  assert.match(text, /^切れました。 相手との接続を戻しています。\[あと5秒待ち\]/);
  assert.match(Text.getReconnectText(app({ reconnectDeadline: 0, reconnectReason: "" })), /あと1秒待ち/);
});
