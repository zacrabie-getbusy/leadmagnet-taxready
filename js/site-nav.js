/* ─── SITE NAV — shared open/close handlers ──────────────────────────────
   Wires up the "Menu" trigger / mega-menu / scroll-tint / Esc-to-close
   for every page that uses /css/site-nav.css. The HTML lives inline in
   each page so the right-side CTA can vary per page; this file is just
   the behaviour.

   Loaded with `defer`: handlers attach on DOMContentLoaded, no FOUC
   because the HTML and CSS are already in place by then. */

(function(){
  'use strict';

  // ── Sticky-nav scroll tint ──
  // Adds .scrolled to <nav id="topnav"> after a short scroll so the
  // hairline border under the nav fades in. Same behaviour as the
  // homepage.
  function bindScrollTint() {
    var nav = document.getElementById('topnav');
    if (!nav) return;
    var apply = function(){
      if (window.scrollY > 4) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    window.addEventListener('scroll', apply, { passive: true });
    apply();
  }

  // ── Mega menu open/close ──
  // Exposed globally because the trigger uses an inline onclick=""
  // attribute (matches the homepage convention so each page's HTML
  // can stay copy-paste-able).
  window.toggleMenu = function() {
    var menu = document.getElementById('megaMenu');
    if (!menu) return;
    if (menu.classList.contains('open')) window.closeMenu();
    else window.openMenu();
  };
  window.openMenu = function() {
    var menu = document.getElementById('megaMenu');
    var trigger = document.getElementById('navMenuTrigger');
    var backdrop = document.getElementById('megaMenuBackdrop');
    if (!menu || !trigger) return;
    menu.removeAttribute('hidden');
    void menu.offsetWidth; // force layout so the transition runs
    menu.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    trigger.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  };
  window.closeMenu = function() {
    var menu = document.getElementById('megaMenu');
    var trigger = document.getElementById('navMenuTrigger');
    var backdrop = document.getElementById('megaMenuBackdrop');
    if (!menu || !trigger) return;
    menu.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    trigger.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    // Re-add hidden once the transition has played out so screen
    // readers + tab order skip the panel cleanly.
    setTimeout(function(){
      if (!menu.classList.contains('open')) menu.setAttribute('hidden', '');
    }, 300);
  };

  // Click any link inside the menu → close. Navigation happens normally;
  // we just trigger the close animation in parallel.
  function bindMenuLinkClose() {
    var menu = document.getElementById('megaMenu');
    if (!menu) return;
    menu.addEventListener('click', function(e){
      var a = e.target.closest('a');
      if (a) window.closeMenu();
    });
  }

  // Esc closes the menu if open.
  function bindEsc() {
    document.addEventListener('keydown', function(e){
      if (e.key !== 'Escape') return;
      var menu = document.getElementById('megaMenu');
      if (menu && menu.classList.contains('open')) window.closeMenu();
    });
  }

  function init() {
    bindScrollTint();
    bindMenuLinkClose();
    bindEsc();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
