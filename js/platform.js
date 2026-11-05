// LINE（LIFF）とブラウザのつなぎ（OthelloPlatform）：本人・ルームの URL・招待と結果を送る・コピー・版・開きなおし。
// session.js・ui.js から使う。送るカードの中身は js/card.js
(function (window, document) {
  var identityPromise = null;
  // LIFF を起こし終えた（起こせなかった・手元で試すときも）約束。見出しの本人のアイコン（js/me.js）が待つ。LIFF を2回起こさない
  var liffDone = function () {};
  var liffSettled = false;
  var liffReadyPromise = new Promise(function (resolve) {
    liffDone = function () {
      liffSettled = true;
      resolve();
    };
  });
  // ブラウザ版で、LIFF は起きたがまだログインしていない（ゲスト）か
  var outsideGuest = false;
  // Q キットの LIFF（shared/liff.js）に、ひっくりの LIFF ID を渡す
  window.LINE_SHARE_CONFIG = Object.assign({}, window.LINE_SHARE_CONFIG, { liffId: (window.APP_CONFIG || {}).liffId });

  // このブラウザのまま LINE でログインして、今のページ（?room= 付き）に戻る（Q キットの LineShareLiff.login）
  function login() {
    if (window.LineShareLiff && typeof window.LineShareLiff.login === "function") {
      window.LineShareLiff.login();
      return;
    }
    liff.login({ redirectUri: window.location.href });
  }

  // 推測されにくい ID（ルーム ID など。英小文字と数字12文字）
  function generateId(prefix) {
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    var bytes = new Uint8Array(12);
    var text = "";
    var index;
    window.crypto.getRandomValues(bytes);
    for (index = 0; index < bytes.length; index += 1) {
      text += chars.charAt(bytes[index] % chars.length);
    }
    return prefix + "-" + text;
  }

  // ルームに書く本人の印：ユーザー ID の SHA-256 の先頭32文字（元の ID には戻せない）
  function hashUserId(userId) {
    var text = "hiqri:" + String(userId || "");
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      return Promise.resolve(sanitizeForPeer(userId));
    }
    return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buffer) {
      return "u" + Array.prototype.map.call(new Uint8Array(buffer), function (byte) {
        return ("0" + byte.toString(16)).slice(-2);
      }).join("").slice(0, 32);
    }).catch(function () {
      return sanitizeForPeer(userId);
    });
  }

  // PeerJS の ID に使える文字だけにする
  function sanitizeForPeer(value) {
    return String(value || "player").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28) || "player";
  }

  // URL のパスを「…/」で終わる形にそろえる
  function normalizePathname(pathname) {
    var value = pathname || "/";
    var lastSegment = value.split("/").pop();

    if (value.charAt(0) !== "/") {
      value = "/" + value;
    }
    if (value.charAt(value.length - 1) !== "/" && lastSegment.indexOf(".") === -1) {
      value += "/";
    }
    return value;
  }

  // このページの URL（? より前）
  function getAppBaseUrl() {
    return window.location.origin + normalizePathname(window.location.pathname);
  }

  // ひっくりのファイルが置いてある場所（js/ の1つ上）
  function getStaticRootUrl() {
    var script =
      document.querySelector('script[src*="/js/platform.js"]') ||
      document.querySelector('script[src$="js/platform.js"]') ||
      document.querySelector('script[src*="/js/card.js"]');

    if (script && script.src) {
      return String(new URL("../", script.src));
    }

    return getAppBaseUrl();
  }

  // ひっくりのファイル（画像・version.json など）の URL
  function getAssetUrl(filename) {
    return String(new URL(filename, getStaticRootUrl()));
  }

  // 手元で試しているか（file:・localhost など）
  function isLocalPreviewEnvironment() {
    var hostname = String(window.location.hostname || "").toLowerCase();
    var params = new URLSearchParams(window.location.search);

    return window.location.protocol === "file:" ||
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      params.get("vscode-livepreview") === "true";
  }

  // そのルームを LINE 版で開く URL（LIFF ID がなければ空）
  function buildLiffRoomUrl(roomId) {
    if (!window.APP_CONFIG || !window.APP_CONFIG.liffId || window.APP_CONFIG.liffId === "YOUR_LIFF_ID" || !roomId) {
      return "";
    }
    return "https://liff.line.me/" + window.APP_CONFIG.liffId + "?room=" + encodeURIComponent(roomId);
  }

  // この端末（このブラウザ）の印。同じ人が2台で開いても、ルームの席と通信の ID を分けるため（この端末に残して、毎回同じにする）
  function getDeviceId() {
    var storageKey = "hiqri-device-id";
    try {
      var existing = window.localStorage.getItem(storageKey) || "";
      if (!existing) {
        existing = generateId("d");
        window.localStorage.setItem(storageKey, existing);
      }
      return existing;
    } catch (error) {
      return generateId("d");
    }
  }

  // 手元で試すときの仮の ID（この端末に残して、毎回同じにする）
  function getStableDebugUserId() {
    var storageKey = "liff-p2p-debug-user-id";
    var existingId = "";

    try {
      existingId = window.localStorage.getItem(storageKey) || "";
      if (!existingId) {
        existingId = generateId("debug-user");
        window.localStorage.setItem(storageKey, existingId);
      }
    } catch (error) {
      existingId = generateId("debug-user");
    }

    return existingId;
  }

  // 本人（userId・名前・アイコン）を決めて返す。LINE 版なら LIFF から、ブラウザ版ならログインするか選んでもらう。1回だけ動く
  function initIdentity() {
    if (identityPromise) {
      return identityPromise;
    }

    identityPromise = new Promise(function (resolve, reject) {
      if (isLocalPreviewEnvironment() ||
          !window.liff ||
          !window.APP_CONFIG.liffId ||
          window.APP_CONFIG.liffId === "YOUR_LIFF_ID") {
        liffDone();
        resolve({
          userId: getStableDebugUserId(),
          displayName: "デバッグユーザー",
          pictureUrl: ""
        });
        return;
      }

      // LIFF を起こすのは Q キット（shared/liff.js の LineShareLiff.init。10秒で終わらなければ、起こせなかったあつかい）
      var kit = window.LineShareLiff;
      var started = kit && typeof kit.init === "function" ?
        kit.init({ login: "none" }).then(function (result) {
          if (!result.ready) {
            throw new Error(result.reason || "failed");
          }
        }) :
        liff.init({ liffId: window.APP_CONFIG.liffId });
      started.then(function () {
        liffDone();
        if (!liff.isLoggedIn()) {
          if (typeof liff.login === "function") {
            // ブラウザ版では、黙ってログイン画面へ飛ばさず、ログインするか LINE 版で開くかを選んでもらう
            if (typeof liff.isInClient === "function" && !liff.isInClient()) {
              outsideGuest = true;
              showOutsideChoice(function () {
                resolve({ userId: getStableDebugUserId(), displayName: "ゲスト", pictureUrl: "", guest: true });
              });
              return;
            }
            // ログイン後は今のページ（?room= 付き）に戻す。指定しないと LIFF の入口に戻り、招待されたルームに入れない
            login();
            return;
          }
          reject(new Error("LINE にログインできませんでした。"));
          return;
        }

        liff.getProfile().then(function (profile) {
          resolve({
            userId: profile.userId,
            displayName: profile.displayName || "LINE ユーザー",
            pictureUrl: profile.pictureUrl || ""
          });
        }).catch(function () {
          resolve({
            userId: getStableDebugUserId(),
            displayName: "LINE ユーザー",
            pictureUrl: ""
          });
        });
      }).catch(function () {
        liffDone();
        resolve({
          userId: getStableDebugUserId(),
          displayName: "デバッグユーザー",
          pictureUrl: ""
        });
      });
    });

    return identityPromise;
  }

  // 公開中の版（version.json）を読む。読めなければ空
  function loadVersionInfo() {
    return fetch(getAssetUrl("version.json") + "?t=" + Date.now(), {
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("version.json を取得できませんでした。");
      }
      return response.json();
    }).then(function (payload) {
      if (payload && payload.version) {
        return payload.version;
      }
      throw new Error("version.json の形式が不正です。");
    }).catch(function () {
      return window.APP_CONFIG && window.APP_CONFIG.appVersion ? window.APP_CONFIG.appVersion : "";
    });
  }

  // 招待に入れるルームの URL（LINE 版の URL があればそれ）
  function buildShareUrl(roomId, url) {
    var directLiffUrl = buildLiffRoomUrl(roomId);

    if (directLiffUrl) {
      return Promise.resolve(directLiffUrl);
    }

    if (!url) {
      return Promise.resolve("");
    }

    if (!window.liff || !liff.permanentLink || typeof liff.permanentLink.createUrlBy !== "function") {
      return Promise.resolve(url);
    }

    try {
      return Promise.resolve(liff.permanentLink.createUrlBy(url)).catch(function () {
        return url;
      });
    } catch (error) {
      return Promise.resolve(url);
    }
  }

  // ブラウザ版で開いたとき：「LINE 版で開く」「ログインして遊ぶ」か、ログインせずに遊ぶかを選ぶ（キロっく・おくるんと同じ考え方）。
  // ログインしなくても友だちと対戦できる（招待はリンクで送る）。LINE で遊ぶと、名前とアイコンが出て、LINE の友だちを選んで招待できる
  // LINE 版で開くときは、招待されたルーム（?room=）もそのまま持っていく
  // playAsGuest：「ログインせずに遊ぶ」を押したとき（シートは閉じる。見出しのアイコンから開いたときは閉じるだけ）
  function showOutsideChoice(playAsGuest) {
    if (!window.LineShareLiff || typeof window.LineShareLiff.outsideChoice !== "function") {
      if (playAsGuest) {
        playAsGuest(); // Q キットが読めないときは、そのままゲストで遊べるようにする
      }
      return;
    }
    // シートは Q キットのもの（shared/liff.js の outsideChoice）
    window.LineShareLiff.outsideChoice({
      icon: getAssetUrl("assets/icon.svg"),
      text: "LINE で遊ぶと、LINE の友だちを選んで招待でき、名前とアイコンも出ます。LINE がなくても、このまま友だちと対戦できます（招待はリンクで送ります）。",
      appUrl: function () { return "https://liff.line.me/" + window.APP_CONFIG.liffId + window.location.search; },
      loginLabel: "ログインして遊ぶ",
      guestLabel: "ログインせずに遊ぶ",
      onGuest: playAsGuest
    });
  }


  // LINE の送り先を選ぶ画面が使えるか（LIFF の準備前は isApiAvailable が例外を出すので、使えないあつかい）
  function canPickTarget() {
    try {
      return !!(window.liff &&
        typeof liff.isApiAvailable === "function" &&
        liff.isApiAvailable("shareTargetPicker") &&
        typeof liff.shareTargetPicker === "function");
    } catch (error) {
      return false;
    }
  }

  // コピーする（Q キットの LineShareUI.copy。できないときは、長押しで選べる文字の窓を出す）。返すもの：{ status, message }
  function copyInstead(text, copiedMessage, boxTitle) {
    if (!text || !window.LineShareUI || typeof window.LineShareUI.copy !== "function") {
      return Promise.resolve({ status: "manual", message: "" });
    }
    // 知らせは呼んだ側が出すので、キットのトーストは出さない（done に何もしない関数）
    return window.LineShareUI.copy(text, { done: function () {}, title: boxTitle }).then(function (copied) {
      return copied ? { status: "copied", message: copiedMessage } : { status: "manual", message: "" };
    });
  }

  // 季節の絵文字（Q キットの season.js。まだ読めていなければ付けない）。うれしい瞬間の短い文だけに
  function withSeason(text) {
    return window.QSeason && typeof window.QSeason.decorate === "function" ? window.QSeason.decorate(text) : text;
  }

  // LINE で送る言い方（「LINEで招待」「カードでおくるん」）にするか。LINE の友だちを選べるとき。
  // LIFF を起こし終える前は、主な入り方の LINE のほうにしておく（LINE の中で、一瞬リンクの言い方が出ないように）
  function useLineWords() {
    return !liffSettled || canPickTarget();
  }

  // 対局の結果をカードで送る。LINE の友だちを選べないときは、端末の共有で（なければコピー）。返すもの：{ status, message, line }
  function shareResult(info) {
    var text = "ひっくりの結果：" + info.myName + " " + info.mine + " - " + info.theirs + " " + info.opponentName;
    if (canPickTarget()) {
      return liff.shareTargetPicker([window.OthelloCard.result(info)]).then(function (result) {
        return { status: result ? "shared" : "cancelled", message: result ? withSeason("結果を送りました。") : "送るのをやめました。", line: true };
      }).catch(function (error) {
        if (window.console) {
          window.console.warn("[ひっくり] 結果を送れませんでした", error);
        }
        return copyInstead(text, "送れなかったので、結果をコピーしました。", "結果を長押ししてコピーしてね");
      });
    }
    return shareByDevice({ title: "ひっくり", text: text, url: getAppBaseUrl() }, withSeason("結果を送りました。"), "送るのをやめました。", function () {
      return copyInstead(text, "結果をコピーしました。メッセージやメールに貼って送れます。", "結果を長押ししてコピーしてね");
    });
  }

  // 招待をカードで送る。LINE の友だちを選べないとき（ログインしていないブラウザ版など）は、端末の共有（メッセージ・メールなど）で、
  // それもなければリンクをコピー。リンク（liff.line.me）は、LINE がない人が開いてもブラウザ版に移る。返すもの：{ status, message }
  function shareRoom(roomId, url) {
    return buildShareUrl(roomId, url).then(function (shareUrl) {
      if (canPickTarget()) {
        return liff.shareTargetPicker([
          window.OthelloCard.invite(roomId, shareUrl)
        ]).then(function (result) {
          if (result) {
            return { status: "shared", message: withSeason("招待を送りました。友だちの参加を待っています。") };
          }
          return { status: "cancelled", message: "招待を送るのをやめました。" };
        }).catch(function (error) {
          if (window.console) {
            window.console.warn("[ひっくり] 招待を送れませんでした", error);
          }
          return copyInstead(shareUrl, "送れなかったので、招待のリンクをコピーしました。", "招待のリンクを長押ししてコピーしてね");
        });
      }

      return shareByDevice({ title: "ひっくり", text: "ひっくりで対戦しよう", url: shareUrl },
        withSeason("招待を送りました。友だちの参加を待っています。"), "招待を送るのをやめました。", function () {
          return copyRoomLink(shareUrl);
        });
    });
  }

  // 端末の共有（メッセージ・メールなど）で送る。できなければ copy（コピーする）。返すもの：{ status, message }
  function shareByDevice(data, sentMessage, cancelMessage, copy) {
    if (!navigator.share) {
      return copy();
    }
    return navigator.share(data).then(function () {
      return { status: "shared", message: sentMessage };
    }).catch(function (error) {
      if (error && error.name === "AbortError") {
        return { status: "cancelled", message: cancelMessage };
      }
      return copy();
    });
  }

  function copyRoomLink(shareUrl) {
    return copyInstead(shareUrl, "招待のリンクをコピーしました。メッセージやメールに貼って送れます。", "招待のリンクを長押ししてコピーしてね");
  }

  // この端末に残したひっくりの記録を消す（開きなおすとき）
  function clearAppStorage() {
    var index;
    var key;
    var keys = [];

    try {
      for (index = 0; index < window.localStorage.length; index += 1) {
        key = window.localStorage.key(index);
        if (key && key.indexOf("liff-p2p") === 0) {
          keys.push(key);
        }
      }
      for (index = 0; index < keys.length; index += 1) {
        window.localStorage.removeItem(keys[index]);
      }
    } catch (error) {}

    try {
      window.sessionStorage.clear();
    } catch (error2) {}
  }

  // URL を開きなおす（clearStorage なら記録を消してから）
  function reload(url, clearStorage) {
    if (clearStorage) {
      clearAppStorage();
    }
    window.location.href = url || window.location.href;
  }

  window.OthelloPlatform = {
    withSeason: withSeason,
    generateId: generateId,
    sanitizeForPeer: sanitizeForPeer,
    hashUserId: hashUserId,
    getDeviceId: getDeviceId,
    getAppBaseUrl: getAppBaseUrl,
    getAssetUrl: getAssetUrl,
    buildLiffRoomUrl: buildLiffRoomUrl,
    initIdentity: initIdentity,
    liffReady: function () {
      return liffReadyPromise;
    },
    canPickTarget: canPickTarget,
    useLineWords: useLineWords,
    isOutsideGuest: function () {
      return outsideGuest;
    },
    showOutsideChoice: showOutsideChoice,
    loadVersionInfo: loadVersionInfo,
    copyInstead: copyInstead,
    shareRoom: shareRoom,
    shareResult: shareResult,
    reload: reload
  };
}(window, document));
