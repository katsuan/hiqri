// 相手の端末と直接つなぐ（AppPeer。PeerJS）：つなぐ・送る・受ける・切れたら知らせる。合図の線が切れたらつなぎなおす。
// session.js が init で始め、play.js が send で手を送る
(function (window) {
  window.APP_CONFIG = window.APP_CONFIG || {};

  // host、path、secure、port を設定すると独自の PeerJS サーバーを使えます。
  // host を空にすると PeerJS のデフォルト設定を使います。
  window.APP_CONFIG.peer = window.APP_CONFIG.peer || {
    host: "",
    port: 443,
    path: "/",
    secure: true,
    debug: 1
  };

  // ちがう回線どうし（モバイル回線と Wi-Fi など）で直接つなげないときの中継（TURN）。
  // url に、中継の接続情報（RTCIceServer の配列か { iceServers: [...] }）を返す URL を書くと、始める前に読む。
  // 空なら PeerJS のきまり（Google の STUN と PeerJS の無料の中継）だけ
  window.APP_CONFIG.turn = window.APP_CONFIG.turn || { url: "" };
  var TURN_TIMEOUT_MS = 4000;
  // PeerJS 1.5 のきまりと同じもの（読みこんだ中継の前に置く）
  var DEFAULT_ICE = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" }
  ];

  // 中継の接続情報の1つが、使える形か（stun: / turn: / turns: の URL と、文字の名前・合言葉）
  function cleanIceServer(server) {
    if (!server || typeof server !== "object") {
      return null;
    }
    var urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter(function (url) {
      return typeof url === "string" && /^(stun|turns?):[^\s]{1,200}$/.test(url);
    });
    if (!urls.length) {
      return null;
    }
    var out = { urls: urls };
    if (typeof server.username === "string") {
      out.username = server.username.slice(0, 200);
    }
    if (typeof server.credential === "string") {
      out.credential = server.credential.slice(0, 200);
    }
    return out;
  }

  // 中継の接続情報を読む（なければ・読めなければ null。待つのは TURN_TIMEOUT_MS まで）
  function loadIceServers() {
    var url = (window.APP_CONFIG.turn || {}).url;
    if (!url || typeof window.fetch !== "function") {
      return Promise.resolve(null);
    }
    var timer = null;
    var timeout = new Promise(function (resolve) {
      timer = window.setTimeout(function () { resolve(null); }, TURN_TIMEOUT_MS);
    });
    var load = window.fetch(url, { cache: "no-store" }).then(function (response) {
      return response.ok ? response.json() : null;
    }).then(function (data) {
      var list = Array.isArray(data) ? data : (data && Array.isArray(data.iceServers) ? data.iceServers : []);
      var servers = list.map(cleanIceServer).filter(Boolean).slice(0, 8);
      return servers.length ? servers : null;
    }).catch(function (error) {
      if (window.console) {
        window.console.warn("[ひっくり] 中継の接続情報を読めませんでした", error);
      }
      return null;
    });
    return Promise.race([load, timeout]).then(function (servers) {
      window.clearTimeout(timer);
      return servers;
    });
  }

  // PeerJS の設定（自分のサーバーを使うときは host など。iceServers：読みこんだ中継）
  function buildPeerOptions(iceServers) {
    var config = window.APP_CONFIG.peer || {};
    var options = {
      debug: typeof config.debug === "number" ? config.debug : 1
    };
    if (iceServers && iceServers.length) {
      options.config = { iceServers: DEFAULT_ICE.concat(iceServers) };
    }

    if (config.host) {
      options.host = config.host;
      options.port = config.port || 443;
      options.path = config.path || "/";
      options.secure = config.secure !== false;
    }

    return options;
  }

  // 1本の線に、開いた・届いた・閉じた・まちがいの知らせをつなぐ（古い線が閉じても今の線は消さない）
  function attachConnectionHandlers(state, conn) {
    conn.on("open", function () {
      state.connection = conn;
      if (state.handlers.onConnectionOpen) {
        state.handlers.onConnectionOpen(conn);
      }
    });

    conn.on("data", function (data) {
      if (state.handlers.onData) {
        state.handlers.onData(data, conn);
      }
    });

    conn.on("close", function () {
      if (state.connection && state.connection.connectionId === conn.connectionId) {
        state.connection = null;
      }

      if (state.handlers.onConnectionClose) {
        state.handlers.onConnectionClose(conn);
      }
    });

    conn.on("error", function (error) {
      if (state.handlers.onConnectionError) {
        state.handlers.onConnectionError(error, conn);
      }
    });
  }

  var AppPeer = {
    state: {
      peer: null,
      peerId: null,
      connection: null,
      handlers: {}
    },

    // 自分の ID で PeerJS を始める。相手からの線を受けるときは、ルームに書かれた相手だけ通す。返すもの：開いたら終わる Promise
    init: function (peerId, handlers) {
      var self = this;

      self.state.handlers = handlers || {};

      // 中継の接続情報の URL がなければ、待たずにすぐ始める（前と同じ）
      if (!(window.APP_CONFIG.turn || {}).url) {
        return start(null);
      }
      return loadIceServers().then(start);

      function start(iceServers) {
        return new Promise(function (resolve, reject) {
          var peer = new Peer(peerId, buildPeerOptions(iceServers));

          self.state.peer = peer;
          self.state.peerId = peerId;

          peer.on("open", function (id) {
            if (self.state.handlers.onPeerOpen) {
              self.state.handlers.onPeerOpen(id);
            }
            resolve(id);
          });

          peer.on("connection", function (conn) {
            if (self.state.connection && self.state.connection.open) {
              conn.close();
              return;
            }
            // ルームに書かれた相手と別の端末からは、つながない
            if (self.state.handlers.acceptPeer && !self.state.handlers.acceptPeer(conn.peer)) {
              conn.close();
              return;
            }

            attachConnectionHandlers(self.state, conn);

            if (self.state.handlers.onIncomingConnection) {
              self.state.handlers.onIncomingConnection(conn);
            }
          });

          peer.on("error", function (error) {
            if (self.state.handlers.onPeerError) {
              self.state.handlers.onPeerError(error);
            }
            reject(error);
          });

          peer.on("disconnected", function () {
            // 合図の線（シグナリング）が切れただけ。同じ ID でつなぎなおす（相手との線はそのまま使える）
            window.setTimeout(function () {
              if (!peer.destroyed && peer.disconnected) {
                try {
                  peer.reconnect();
                } catch (error) {}
              }
            }, 1000);
            if (self.state.handlers.onPeerDisconnected) {
              self.state.handlers.onPeerDisconnected();
            }
          });
        });
      }
    },

    // 相手の ID へ線をつなぐ（もうつながっていればその線を返す）
    connectTo: function (peerId) {
      if (!this.state.peer) {
        throw new Error("Peer が初期化されていません。");
      }

      if (this.state.connection && this.state.connection.open) {
        return this.state.connection;
      }

      var conn = this.state.peer.connect(peerId, {
        reliable: true,
        serialization: "json"
      });

      attachConnectionHandlers(this.state, conn);
      return conn;
    },

    // 相手に送る。線が開いていなければエラー
    send: function (payload) {
      if (!this.state.connection || !this.state.connection.open) {
        throw new Error("P2P 接続がまだ開いていません。");
      }

      this.state.connection.send(payload);
    },

    // 相手との線を閉じる
    disconnect: function () {
      if (this.state.connection) {
        this.state.connection.close();
        this.state.connection = null;
      }
    },

    // 相手との線が開いているか
    isConnected: function () {
      return !!(this.state.connection && this.state.connection.open);
    }
  };

  // テスト用に、中継の接続情報の確かめ方も出す
  AppPeer.cleanIceServer = cleanIceServer;
  window.AppPeer = AppPeer;
}(window));
