/* ============================================================================
 * tryon.js  —  SUBAGENT 4: the Try-On / Preview interface
 * ----------------------------------------------------------------------------
 * Renders a "how would this look on me" preview for a recommended outfit.
 *
 * Honest scope: true AI body-warping (draping a flat garment onto your posed
 * photo) needs pose estimation + a garment-warp network and a lot of compute.
 * Instead this builds a clean, useful LOOKBOOK composite — your full-length
 * photo on one side, and the actual garment photos stacked head-to-toe
 * (layer/top → bottom → footwear) beside it, tinted with each piece's detected
 * colour. It's a real, at-a-glance "outfit on me" board you can eyeball, and it
 * uses your own uploaded images, not a generic avatar.
 *
 * If you've marked an optional "body photo" in settings, it anchors the board;
 * otherwise it renders a colour-blocked silhouette in your detected palette.
 * ========================================================================== */
(function (global) {
  'use strict';

  // Build a DOM node previewing an outfit. `garmentsById` maps id -> record
  // (with .imageUrl object URLs already created). `userPhotoUrl` optional.
  function renderBoard(outfit, garmentsById, userPhotoUrl) {
    var wrap = el('div', 'tryon-board');

    // left: you
    var me = el('div', 'tryon-me');
    if (userPhotoUrl) {
      var img = el('img', 'tryon-photo');
      img.src = userPhotoUrl; img.alt = 'You';
      me.appendChild(img);
    } else {
      me.appendChild(silhouette(outfit, garmentsById));
    }
    var meCap = el('div', 'tryon-cap'); meCap.textContent = 'You';
    me.appendChild(meCap);

    // right: the stacked pieces
    var stack = el('div', 'tryon-stack');
    var order = ['layer', 'top', 'bottom', 'footwear', 'accessory'];
    order.forEach(function (slot) {
      var item = outfit.items.filter(function (i) { return i.slot === slot; })[0];
      if (!item) return;
      var rec = garmentsById[item.id];
      stack.appendChild(pieceCard(slot, item, rec));
    });

    wrap.appendChild(me);
    wrap.appendChild(stack);
    return wrap;
  }

  function pieceCard(slot, item, rec) {
    var card = el('div', 'tryon-piece');
    var thumb = el('div', 'tryon-thumb');
    if (rec && rec.imageUrl) {
      var img = el('img'); img.src = rec.imageUrl; img.alt = item.name || slot;
      thumb.appendChild(img);
    } else {
      thumb.style.background = familyToCss(item.family);
      thumb.classList.add('tryon-thumb--swatch');
    }
    var meta = el('div', 'tryon-piece-meta');
    var t = el('div', 'tryon-piece-title');
    t.textContent = cap(slot) + ' · ' + (item.subtype || item.name || '');
    var s = el('div', 'tryon-piece-sub');
    s.innerHTML = swatchDot(item.family) + ' ' + (item.family || '') +
      (item.fit ? ' · ' + item.fit : '');
    meta.appendChild(t); meta.appendChild(s);
    card.appendChild(thumb); card.appendChild(meta);
    return card;
  }

  // Fallback colour-blocked silhouette when no user photo is set.
  function silhouette(outfit, garmentsById) {
    function fam(slot) {
      var it = outfit.items.filter(function (i) { return i.slot === slot; })[0];
      return it ? familyToCss(it.family) : '#d9d9de';
    }
    var svg =
      '<svg viewBox="0 0 120 260" class="tryon-svg" xmlns="http://www.w3.org/2000/svg">' +
      // head
      '<circle cx="60" cy="24" r="16" fill="#e7d3c2"/>' +
      // top (torso + sleeves)
      '<path d="M28 46 L92 46 L104 92 L88 100 L84 150 L36 150 L32 100 L16 92 Z" fill="' + fam('top') + '"/>' +
      // bottom (legs)
      '<path d="M40 150 L80 150 L76 244 L62 244 L60 180 L58 244 L44 244 Z" fill="' + fam('bottom') + '"/>' +
      // shoes
      '<rect x="42" y="244" width="18" height="10" rx="3" fill="' + fam('footwear') + '"/>' +
      '<rect x="62" y="244" width="18" height="10" rx="3" fill="' + fam('footwear') + '"/>' +
      '</svg>';
    var d = el('div', 'tryon-silhouette');
    d.innerHTML = svg;
    return d;
  }

  /* ---- colour family -> a display CSS colour ------------------------------*/
  var FAMILY_CSS = {
    red: '#c0392b', orange: '#e67e22', amber: '#d68910', yellow: '#f1c40f',
    lime: '#a3cb38', green: '#27ae60', teal: '#16a085', cyan: '#00bcd4',
    blue: '#2e6fdb', indigo: '#4b4bce', purple: '#8e44ad', magenta: '#c0399b',
    pink: '#e08a9b',
    white: '#f5f5f2', ivory: '#efe9dc', grey: '#9aa0a6', charcoal: '#3d4148',
    black: '#20232a', navy: '#1f2d4d', beige: '#d9c7a7', tan: '#c9a06a',
    brown: '#6e4b2a', olive: '#6b6b23', denim: '#4a688c'
  };
  function familyToCss(f) { return FAMILY_CSS[f] || '#9aa0a6'; }
  function swatchDot(f) {
    return '<span class="dot" style="background:' + familyToCss(f) + '"></span>';
  }

  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  global.TryOn = {
    renderBoard: renderBoard,
    familyToCss: familyToCss,
    swatchDot: swatchDot
  };
})(window);
