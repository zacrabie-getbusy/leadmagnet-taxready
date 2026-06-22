/* Wórkiro wordmark — display swap.
   Shows the brand name as "Wórkiro" (ó, U+00F3) in page text, including
   link and button labels, WITHOUT touching the underlying value. Skips
   code, inputs, and any text that is itself an email address or URL, so
   workiro.com links / mailto: / alt text stay literal "Workiro".

   Loaded site-wide via <script src="/js/workiro-wordmark.js" defer>.
   Self-guards against running twice if a page references it more than
   once (e.g. a static page that also pulls a shared include). */
(function () {
  if (window.__wkWordmark) return;   // run-once guard
  window.__wkWordmark = true;

  var WORD = /Workiro/g;
  var ACCENTED = 'Wórkiro';
  var SKIP_TAGS = { CODE:1, PRE:1, KBD:1, SAMP:1, SCRIPT:1, STYLE:1, NOSCRIPT:1, INPUT:1, TEXTAREA:1, SELECT:1, OPTION:1 };
  var IS_ADDRESS = /@|https?:\/\/|www\./i;

  function inSkippedContext(node) {
    for (var el = node.parentNode; el && el.nodeType === 1; el = el.parentNode) {
      if (SKIP_TAGS[el.tagName]) return true;
      if (el.isContentEditable) return true;
      if (el.classList && el.classList.contains('no-accent')) return true;
    }
    return false;
  }

  function run() {
    if (!document.body) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var node, changes = [];
    while ((node = walker.nextNode())) {
      var t = node.nodeValue;
      if (t.indexOf('Workiro') === -1) continue;
      if (IS_ADDRESS.test(t)) continue;
      if (inSkippedContext(node)) continue;
      changes.push(node);
    }
    for (var i = 0; i < changes.length; i++) {
      changes[i].nodeValue = changes[i].nodeValue.replace(WORD, ACCENTED);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  if (window.MutationObserver) {
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; run(); });
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
