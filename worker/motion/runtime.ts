/**
 * O "relógio" do motion. O modelo escreve a animação contra uma API pequena
 * (`motion.build`, `motion.timeline`, `motion.onFrame`) e este script, posto
 * no começo do HTML, controla o tempo:
 *  - prévia (iframe da tela): toca em loop e obedece play, pausa e pulo
 *    vindos da tela (postMessage);
 *  - render (worker): parado; o worker pula para cada quadro
 *    (`motion.seek(t)`) e tira a foto da tela;
 *  - arquivo (HTML baixado): toca em loop, encolhido para caber na janela.
 * Tudo que se mexe passa pela linha do tempo do GSAP (pausada) ou pelo
 * `onFrame`: assim qualquer instante pode ser desenhado na hora, na ordem que
 * for. Compartilhado entre o app e o worker.
 */

export type ModoRuntime = "preview" | "render" | "arquivo";

/** GSAP fixo (o modelo não escolhe): todos os plugins são livres desde a 3.13. */
export const GSAP_VERSAO = "3.13.0";
export const PLUGINS_GSAP = [
  "SplitText",
  "CustomEase",
  "MotionPathPlugin",
  "DrawSVGPlugin",
  "MorphSVGPlugin",
  "ScrambleTextPlugin",
  "TextPlugin",
  "Physics2DPlugin",
  "Flip",
] as const;

const cdn = (arquivo: string) =>
  `https://cdnjs.cloudflare.com/ajax/libs/gsap/${GSAP_VERSAO}/${arquivo}`;

export interface ConfigRuntime {
  largura: number;
  altura: number;
  duracao: number;
  fps: number;
  modo: ModoRuntime;
  /** Semente do Math.random: a prévia e o vídeo sorteiam igual. */
  semente?: number;
}

/** O script do relógio (sem a tag). `cfg` vai embutido como JSON. */
export function runtimeJs(cfg: ConfigRuntime): string {
  return `(function () {
  var C = ${JSON.stringify({ semente: 7, ...cfg })};
  var plugins = ${JSON.stringify(PLUGINS_GSAP)};
  var s = C.semente >>> 0 || 1;
  Math.random = function () {
    s = (s + 0x6d2b79f5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  var construtores = [], aCadaQuadro = [], linha = null, tempo = 0;
  var tocando = C.modo !== "render";
  function avisar(m) {
    if (C.modo !== "preview") return;
    m.motion = true;
    try { parent.postMessage(m, "*"); } catch (e) {}
  }
  function falhou(m) {
    m = String(m && m.message ? m.message : m || "Erro no script");
    if (!window.__motionErro) window.__motionErro = m;
    avisar({ tipo: "erro", mensagem: m });
  }
  window.addEventListener("error", function (e) { falhou(e.message || e.error); });
  window.addEventListener("unhandledrejection", function (e) { falhou(e.reason); });

  var motion = (window.motion = {
    width: C.largura,
    height: C.altura,
    duration: C.duracao,
    fps: C.fps,
    build: function (fn) { construtores.push(fn); },
    timeline: function (vars) {
      if (!linha) {
        var v = {};
        for (var k in vars || {}) v[k] = vars[k];
        v.paused = true;
        linha = gsap.timeline(v);
      }
      return linha;
    },
    onFrame: function (fn) { aCadaQuadro.push(fn); },
    seek: function (t) {
      tempo = Math.max(0, Math.min(Number(t) || 0, C.duracao));
      if (linha) linha.seek(tempo, true);
      var anims = document.getAnimations ? document.getAnimations() : [];
      for (var i = 0; i < anims.length; i++) {
        try { anims[i].pause(); anims[i].currentTime = tempo * 1000; } catch (e) {}
      }
      for (var j = 0; j < aCadaQuadro.length; j++) {
        try { aCadaQuadro[j](tempo); } catch (e) { falhou(e); }
      }
    },
  });

  function registrarPlugins() {
    var lista = [];
    for (var i = 0; i < plugins.length; i++) if (window[plugins[i]]) lista.push(window[plugins[i]]);
    try { if (lista.length) gsap.registerPlugin.apply(gsap, lista); } catch (e) {}
  }
  function imagensCarregadas() {
    return Promise.all(
      Array.prototype.map.call(document.images, function (img) {
        if (img.complete) return null;
        return new Promise(function (ok) { img.addEventListener("load", ok); img.addEventListener("error", ok); });
      }),
    );
  }
  // Tween criado fora da linha do tempo andaria sozinho: entra nela, no mesmo ponto.
  function adotarSoltos() {
    var filhos = gsap.globalTimeline.getChildren(false, true, true);
    for (var i = 0; i < filhos.length; i++) {
      var f = filhos[i];
      if (f !== linha) linha.add(f, Math.max(0, f.startTime() - linha.startTime()));
    }
  }
  function iniciar() {
    if (!window.gsap) return falhou("GSAP não carregou");
    registrarPlugins();
    Promise.all([document.fonts ? document.fonts.ready : null, imagensCarregadas()]).then(function () {
      try {
        motion.timeline();
        for (var i = 0; i < construtores.length; i++) construtores[i]();
        adotarSoltos();
        motion.seek(0);
      } catch (e) {
        return falhou(e);
      }
      window.__motionPronto = true;
      avisar({ tipo: "pronto", duracao: C.duracao });
      if (C.modo !== "render") tocar();
    });
  }
  function tocar() {
    var antes = performance.now(), aviso = 0;
    function passo(agora) {
      if (tocando) {
        tempo += (agora - antes) / 1000;
        if (tempo >= C.duracao) tempo = 0;
        motion.seek(tempo);
      }
      antes = agora;
      if (agora - aviso > 100) { aviso = agora; avisar({ tipo: "tempo", t: tempo, tocando: tocando }); }
      requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  }
  window.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || !d.motionControle) return;
    if (d.motionControle === "tocar") tocando = true;
    if (d.motionControle === "pausar") tocando = false;
    if (d.motionControle === "pular") { tocando = false; motion.seek(d.t); }
  });
  if (C.modo === "arquivo") {
    var caber = function () {
      document.documentElement.style.zoom = String(Math.min(innerWidth / C.largura, innerHeight / C.altura, 1));
    };
    addEventListener("resize", caber);
    caber();
  }
  if (document.readyState === "complete") iniciar();
  else addEventListener("load", iniciar);
})();`;
}

/** Troca `asset://<id>` pelo endereço de cada imagem (URL ou data URI). */
export function resolverAssets(html: string, enderecos: Record<string, string>): string {
  return html.replace(/asset:\/\/([A-Za-z0-9_-]+)/g, (tudo, id: string) => enderecos[id] ?? tudo);
}

/**
 * O HTML pronto para tocar: as imagens resolvidas e, no começo do <head>, o
 * palco no tamanho do vídeo, o GSAP e o relógio.
 */
export function montarHtml(
  html: string,
  o: ConfigRuntime & { enderecos: Record<string, string> },
): string {
  const { enderecos, ...cfg } = o;
  const cabeca = [
    '<meta charset="utf-8">',
    `<style>html,body{margin:0;padding:0;width:${cfg.largura}px;height:${cfg.altura}px;overflow:hidden}</style>`,
    `<script src="${cdn("gsap.min.js")}"></script>`,
    ...PLUGINS_GSAP.map((p) => `<script src="${cdn(`${p}.min.js`)}"></script>`),
    `<script>${runtimeJs(cfg)}</script>`,
  ].join("\n");
  const corpo = resolverAssets(html, enderecos);
  if (/<head[^>]*>/i.test(corpo)) return corpo.replace(/<head[^>]*>/i, (h) => `${h}\n${cabeca}`);
  if (/<html[^>]*>/i.test(corpo))
    return corpo.replace(/<html[^>]*>/i, (h) => `${h}\n<head>\n${cabeca}\n</head>`);
  return `<!doctype html>\n<html><head>\n${cabeca}\n</head><body>${corpo}</body></html>`;
}

/**
 * O documento HTML dentro da resposta do modelo (que às vezes vem entre
 * cercas de código ou com uma frase antes). Null se não houver um completo.
 */
export function extrairHtml(texto: string): string | null {
  const inicio = texto.search(/<!doctype html|<html[\s>]/i);
  const fim = texto.toLowerCase().lastIndexOf("</html>");
  if (inicio < 0 || fim < inicio) return null;
  return texto.slice(inicio, fim + "</html>".length).trim();
}
