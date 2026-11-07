// Serviço do Smart Hub Preview: as fileiras que aparecem ao parar em cima do ícone do Nyx.
// Vai no .wgt e NÃO é atualizado sem cabo, então é burro de propósito: o app manda o JSON pronto
// (app-control "pick", dado "preview") e o serviço só repassa para a TV e fecha.
// Quando a própria TV o chama (a cada ~10 min), não vem JSON: fecha sem mexer no que já está lá.
// Roda no runtime de serviço da TV (Node antigo): ES5, sem nada do bundle.
function quit() {
  try {
    tizen.application.getCurrentApplication().exit();
  } catch (e) {}
}

module.exports.onStart = function () {};

module.exports.onRequest = function () {
  var json = null;
  try {
    var req = tizen.application.getCurrentApplication().getRequestedAppControl();
    var data = (req && req.appControl && req.appControl.data) || [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].key === 'preview') json = data[i].value.join('');
    }
  } catch (e) {}
  if (!json) return quit();
  try {
    webapis.preview.setPreviewData(json, quit, function (e) {
      console.log('nyx preview: setPreviewData falhou ' + (e && e.message));
      quit();
    });
  } catch (e) {
    console.log('nyx preview: exceção ' + (e && e.message));
    quit();
  }
};

module.exports.onExit = function () {};
