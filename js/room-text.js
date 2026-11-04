// ルームと対局の様子から、画面に出す文を決める（OthelloRoomText）：カードの見出し・名前・様子、ルームの欄、START・結果のひとこと。
// 状態（app）を読むだけで、画面にも状態にも触らない。ui.js が使う。node のテストでも動く（test/room-text.test.js）
(function (window) {
  var Game = window.OthelloGame;

  // スマホのせまい画面か
  function isCompactMobile() {
    return window.innerWidth <= 640;
  }

  // 友だちとつながっていて、まだ対局を始めていないか
  function isHumanP2PSetup(app) {
    return app.opponentMode === "human" &&
      app.transportMode === "p2p" &&
      !app.matchConfigured &&
      !app.game.lastMove &&
      !app.game.winner;
  }

  // 1台で2人：カードは「黒の人（先手）」「白の人（後手）」として見せる
  function localName(color) {
    return color === Game.WHITE ? "白の人" : "黒の人";
  }

  // 自分のカードの見出し（せまい画面では短く）
  function getMyLabel(app) {
    if (app.localTwoPlayer) {
      return "先手 (黒)";
    }
    var label = isCompactMobile() ? "私" : "あなた (You)";
    if (app.myColor) {
      return label + " (" + Game.colorName(app.myColor) + ")";
    }
    return label;
  }

  // 相手のカードの見出し
  function getOpponentLabel(app) {
    if (app.localTwoPlayer) {
      return "後手 (白)";
    }
    var label = app.opponentMode === "com" ? "COM" : (isCompactMobile() ? "相手" : "対戦相手");
    if (app.myColor) {
      return label + " (" + Game.colorName(Game.getOpponent(app.myColor)) + ")";
    }
    return label;
  }

  // 相手の名前（まだいなければ「参加待ち」）
  function getOpponentName(app) {
    if (app.staleGuest) {
      return "参加待ち";
    }
    if (app.localTwoPlayer) {
      return localName(Game.WHITE);
    }
    if (app.opponentDisplayName) {
      return app.opponentDisplayName;
    }
    if (app.opponentMode === "com") {
      return "COM";
    }
    if (app.roomData && ((app.role === "host" && app.roomData.guestUserId) || (app.role === "guest" && app.roomData.hostUserId))) {
      return "対戦相手";
    }
    return "参加待ち";
  }

  // 自分のカードの下の様子（手番・START 待ち・結果など）
  function getMyStatusText(app) {
    var outcome;
    var isMyTurn;

    if (app.spectatorMode) {
      return "観戦中";
    }
    if (app.resumePending) {
      return "再開方法を選択中";
    }
    if (isHumanP2PSetup(app) || isHostWaiting(app)) {
      return app.localStartReady ? "準備OK" : "START 待ち";
    }
    if (app.opponentMode === "com" && !app.matchConfigured && !app.game.lastMove && !app.game.winner) {
      return "START 待ち";
    }
    if (app.game.winner && app.myColor) {
      outcome = Game.outcomeForColor(app.game.winner, app.myColor);
      if (outcome === "win") {
        return "勝ちました";
      }
      if (outcome === "lose") {
        return "負けました";
      }
      return "引き分け";
    }
    if (app.matchConfigured && app.myColor && app.game.currentTurn) {
      isMyTurn = app.game.currentTurn === app.myColor;
      if (app.localTwoPlayer) {
        return isMyTurn ? "打つ番です" : "待っています";
      }
      return isMyTurn ? "あなたの手番" : "相手の手番";
    }
    return app.role ? "準備中" : "待機中";
  }

  // 自分のつながりの様子（オンライン・再接続中など）
  function getMyPresenceText(app) {
    if (app.reconnecting) {
      return "再接続中";
    }
    if (app.spectatorMode) {
      return "観戦中";
    }
    if (app.localTwoPlayer) {
      return "この端末";
    }
    if (app.role) {
      return window.AppPeer.isConnected() || app.opponentMode === "com" ? "オンライン" : "待機中";
    }
    return "接続前";
  }

  // 相手のつながりの様子
  function getOpponentPresenceText(app) {
    if (app.localTwoPlayer) {
      return "この端末";
    }
    if (app.opponentMode === "com") {
      return "COM";
    }
    if (app.resumePending) {
      return "復帰済み";
    }
    if (app.spectatorMode) {
      return "オンライン";
    }
    if (app.reconnecting) {
      return "再接続中";
    }
    if (window.AppPeer.isConnected()) {
      return "オンライン";
    }
    if (app.staleGuest) {
      return "オフライン";
    }
    if (app.role === "host") {
      if (app.roomData && app.roomData.guestUserId) {
        return "オフライン";
      }
      return "未参加";
    }
    if (app.role === "guest") {
      if (app.roomData && app.roomData.hostPeerId) {
        return "接続待ち";
      }
      if (app.roomData && app.roomData.hostUserId) {
        return "オフライン";
      }
      return "未参加";
    }
    return "未参加";
  }

  // 相手のカードの下の様子
  function getOpponentStatusText(app) {
    var opponentColor;
    var opponentWon;

    if (app.spectatorMode) {
      return "選択待ち";
    }
    if (app.resumePending) {
      return "返答待ち";
    }
    if (isHumanP2PSetup(app)) {
      return app.remoteStartReady ? "準備OK" : "START 待ち";
    }
    if (app.game.winner && app.myColor) {
      opponentColor = Game.getOpponent(app.myColor);
      opponentWon = Game.outcomeForColor(app.game.winner, opponentColor);
      if (opponentWon === "draw") {
        return "引き分け";
      }
      return opponentWon === "win" ? "勝ちました" : "負けました";
    }
    if (app.matchConfigured && app.myColor && app.game.currentTurn) {
      if (app.localTwoPlayer) {
        return app.game.currentTurn === app.myColor ? "待っています" : "打つ番です";
      }
      if (app.opponentQuiz && app.game.currentTurn !== app.myColor) {
        return "問題に回答中";
      }
      return app.game.currentTurn === app.myColor ? "あなたを待っています" : "手を選んでいます";
    }
    if (app.opponentMode === "com") {
      return "START 待ち";
    }
    if (app.staleGuest) {
      return "切断済み";
    }
    if (app.role === "host") {
      if (app.roomData && app.roomData.guestUserId) {
        return "接続待ち";
      }
      return "参加待ち";
    }
    if (app.role === "guest") {
      return "接続待ち";
    }
    return app.status.opponent;
  }

  // 再接続の帯の文（あと何秒）
  function getReconnectText(app) {
    var remainingMs = Math.max(0, app.reconnectDeadline - Date.now());
    var remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    return app.reconnectReason + " 相手との接続を戻しています。[あと" +
      remainingSeconds + "秒待ち] 戻れなければ COM に切り替わります。";
  }

  // 知らせの箱を出すか（再接続中や、ほかの場所で見せているときは出さない）
  function shouldShowMessageBox(app) {
    if (!app.status.message || app.reconnecting) {
      return false;
    }

    if (app.rematch.incoming || app.rematch.outgoing) {
      return true;
    }

    // ほかの知らせは、盤面やルームの欄に出ているので出さない
    return /エラー|失敗|満室|見つかりません|コピー|送信|送り|送る|届け|つなが|できませんでした|うまく|終了|結果を閉じ|再戦|再接続|復帰|引き継|引継|観戦|置ける場所がありません/.test(app.status.message);
  }

  // ルームに友だちが入っているか
  function hasJoinedOpponent(app) {
    return app.opponentMode === "human" &&
      !!app.roomData &&
      !!app.roomData.guestUserId &&
      !app.staleGuest;
  }

  // ルームに入ったあとの欄の決まった中身（別のルームに参加・別の対局を作る、ルームIDを出す、招待は出さない）
  function inRoom(flow) {
    return Object.assign({
      toolsSummary: "別のルームに参加 / 新しい対局",
      joinLabel: "別のルームに参加",
      newRoomLabel: "別の対局を作る",
      showCurrentRoom: true,
      showShare: false
    }, flow);
  }

  // ルームの様子の欄に出すもの（状態の札・見出し・案内・招待のボタンを出すか）
  function getRoomFlow(app) {
    var joinedOpponent = hasJoinedOpponent(app);
    var isPlaying = app.matchConfigured || !!app.game.lastMove;
    var connected;

    if (!app.roomId) {
      return {
        label: "はじめる",
        title: "だれと遊びますか？",
        hint: "遊び方を選ぶと、次に盤面とルール（ふつう / 📚 教養）を決めて START します。",
        toolsSummary: "ルームIDで参加",
        joinLabel: "参加する",
        newRoomLabel: "新しい対局を作る",
        showCurrentRoom: false,
        showShare: false
      };
    }

    if (app.practiceWhileWaiting) {
      return inRoom({
        label: "練習中",
        title: app.game.winner ? "COM との練習が終わりました。" : "友だちを待つ間、COM と練習中です。",
        hint: "友だちが参加したらお知らせします。そのあと、友だちと最初から対戦するか、今の盤面を続けるか選べます。",
        // 練習中も招待は続けられるようにする
        showShare: true
      });
    }

    if (app.localTwoPlayer) {
      return inRoom({
        label: "1台で2人",
        title: isPlaying && !app.game.winner ? "1台で2人で対局中です。" : "1台で2人で遊びます。",
        hint: isPlaying && !app.game.winner ?
          "手番の人が盤面をタップします。終わったら端末を相手に渡します。" :
          "下の「対局の準備」で盤面とルールを選んで START を押します。黒の人から交代で打ちます。",
        showCurrentRoom: false
      });
    }

    if (app.opponentMode === "com") {
      return inRoom({
        label: app.hostTransferred ? "引継ぎ中" : "ひとりで",
        title: isPlaying && !app.game.winner ? "COM と対局中です。" : "COM と練習します。",
        hint: app.hostTransferred && (app.matchConfigured || app.game.lastMove) && !app.game.winner ?
          "このルームを引き継ぎました。相手が戻ると、今の盤面から再開するか選べます。" :
          (isPlaying && !app.game.winner ?
            "このまま続けられます。別の対局に移るときだけ「別のルームに参加 / 新しい対局」を使います。" :
            app.game.winner ?
              (app.resultOverlayDismissed ? "下の「対局の準備」でルールを押すと、次の準備に移ります。" : "盤面の「もう一戦する」で続けられます。") :
              "下の「対局の準備」で盤面とルールを選んで START を押します。"),
        // ひとりで遊ぶときはルームID・招待の欄を出さず、盤面の START を主役にする
        showCurrentRoom: false
      });
    }

    if (app.role === "host" && !joinedOpponent && !isPlaying && !app.game.winner) {
      return inRoom({
        label: app.hostTransferred ? "引継ぎ済み" : "招待中",
        title: app.hostTransferred ? "このルームを引き継ぎました。" : "友だちの参加を待っています。",
        hint: app.hostTransferred ?
          "友だちの参加を待つか、COM に切り替えて続けられます。" :
          "招待を送ると、このルームに参加できます。",
        showShare: true
      });
    }

    // 2人そろうところ（ゲストは参加したあと、ホストは友だちが入ったあと）
    if ((app.role === "guest" || (app.role === "host" && joinedOpponent)) && !isPlaying && !app.game.winner) {
      connected = window.AppPeer.isConnected();
      return inRoom({
        label: app.role === "guest" ? "参加中" : "START前",
        title: connected ? "2人そろいました。" : "相手の接続を待っています。",
        hint: connected ?
          "色を確認して、2人とも START を押します。" :
          "つながると、色を確認して2人とも START を押します。"
      });
    }

    return inRoom({
      label: app.game.winner ? "対局終了" : "対局中",
      title: app.game.winner ?
        "対局が終わりました。" :
        "いま対局中です。",
      hint: app.game.winner ?
        (!app.resultOverlayDismissed ? "盤面の「もう一戦する」で続けられます。" :
          app.role === "host" ? "下の「対局の準備」でルールを押すと、次の準備に移ります。" :
          "ホストが次の対局を準備すると、ここで続けられます。") :
        "手番と置ける場所は盤面に表示しています。"
    });
  }

  // 結果の下のひとこと（再戦のお願い・返事待ち・もう一戦しますか）
  function getResultCaption(app) {
    if (app.rematch.incoming) {
      return "相手がもう一戦したいそうです。";
    }
    if (app.rematch.outgoing) {
      return "再戦をお願いしました。返事を待っています。";
    }
    if (app.localTwoPlayer) {
      return "1台でもう一戦しますか？";
    }
    if (app.opponentMode === "com") {
      return "COM と続けてもう一戦しますか？";
    }
    return "このルームで続けてもう一戦しますか？";
  }

  // ホストが友だちの参加を待っている（まだつながっていない）開始前
  function isHostWaiting(app) {
    return app.role === "host" && app.opponentMode === "human" && app.transportMode === "matchmaking" &&
      !window.AppPeer.isConnected() && !app.matchConfigured && !app.game.lastMove && !app.game.winner && !app.reconnecting;
  }

  // 盤の上に START を出すか
  function shouldShowStartOverlay(app) {
    if (app.game.winner || app.matchConfigured || app.reconnecting || app.resumePending || app.spectatorMode) {
      return false;
    }
    if (isHostWaiting(app)) {
      return true;
    }
    if (app.opponentMode === "com") {
      return app.role === "host";
    }
    return app.transportMode === "p2p" && (app.role === "host" || app.role === "guest");
  }

  // START の下の案内
  function getStartCaption(app) {
    if (isHostWaiting(app)) {
      return "友だちが参加したらお知らせします。待つ間は COM と練習できます（練習はあとで友だちとの対戦に切り替えられます）。";
    }
    if (app.localTwoPlayer) {
      return "黒の人から交代で打ちます。STARTで始めます。";
    }
    if (app.opponentMode === "com") {
      return app.desiredHostColor === Game.BLACK ?
        "あなたが黒で始めます。STARTで練習を始めます。" :
        "COMが黒で始めます。STARTで練習を始めます。";
    }
    return app.desiredHostColor === Game.BLACK ?
      "あなたが黒です。2人とも START を押すと対局が始まります。" :
      "相手が黒です。2人とも START を押すと対局が始まります。";
  }

  window.OthelloRoomText = {
    isCompactMobile: isCompactMobile,
    isHumanP2PSetup: isHumanP2PSetup,
    localName: localName,
    getMyLabel: getMyLabel,
    getOpponentLabel: getOpponentLabel,
    getOpponentName: getOpponentName,
    getMyStatusText: getMyStatusText,
    getMyPresenceText: getMyPresenceText,
    getOpponentPresenceText: getOpponentPresenceText,
    getOpponentStatusText: getOpponentStatusText,
    getReconnectText: getReconnectText,
    shouldShowMessageBox: shouldShowMessageBox,
    getRoomFlow: getRoomFlow,
    getResultCaption: getResultCaption,
    isHostWaiting: isHostWaiting,
    shouldShowStartOverlay: shouldShowStartOverlay,
    getStartCaption: getStartCaption
  };
}(window));
