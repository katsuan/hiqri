// ひっくり：画面・LINE のカード・端末の共有に出す名前。名前はここにだけ書き、ほかは window.HiqriNames から読む
// index.html でいちばん先に読む。直書きがないかは q-dev の test/service-names.test.js が見る
(function (window) {
  // <service-names>
  window.HiqriNames = {
    app: "ひっくり",
    en: "HiQRi",
    copy: "ひっくり返せ、その一手"
  };
  // </service-names>
}(window));
