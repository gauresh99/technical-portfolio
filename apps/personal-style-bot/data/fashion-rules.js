/* ============================================================================
 * fashion-rules.js  —  RESEARCHED fashion knowledge (the app's real brain)
 * ----------------------------------------------------------------------------
 * Every rule here returns a structured verdict:
 *     { score:0..1, scheme, title, detail, source }
 * so the UI can show the short `title` and, on click, the `detail` ("why") plus
 * a `source` link. Nothing is a magic number without a reason attached.
 *
 * Sourced from established colour-theory & menswear styling references:
 *  - Westwood Hart — Men's colour theory & the colour wheel
 *      https://westwoodhart.com/blogs/westwood-hart/mens-style-color-theory-color-wheel-outfit-coordination
 *  - Real Men Real Style — Combining colours with the colour wheel
 *      https://www.realmenrealstyle.com/color-wheel-menswear/
 *  - Gentleman Within — Mixing & matching clothing colours
 *      https://www.gentlemanwithin.com/how-to-mix-and-match-clothing-colors-for-men/
 *  - Levi's — How to style baggy jeans (proportion/balance)
 *      https://www.levi.com/GB/en_GB/blog/article/how-to-style-baggy-jeans
 *  - Angharad Jones — How to mix proportions in your outfits
 *      https://angharadjones.substack.com/p/how-to-mix-proportions-in-your-outfits
 *  - Just Men's Shoes — Match shoes to pants
 *      https://www.justmenshoes.com/blogs/news/match-shoes-to-pants-the-ultimate-men-s-outfit-guide
 * ========================================================================== */
(function (global) {
  'use strict';

  var K = global.Knowledge;

  var SRC = {
    colorWheel: { name: 'Westwood Hart — colour theory & the colour wheel',
      url: 'https://westwoodhart.com/blogs/westwood-hart/mens-style-color-theory-color-wheel-outfit-coordination' },
    colorMix: { name: 'Gentleman Within — mixing & matching colours',
      url: 'https://www.gentlemanwithin.com/how-to-mix-and-match-clothing-colors-for-men/' },
    proportion: { name: "Angharad Jones — mixing proportions",
      url: 'https://angharadjones.substack.com/p/how-to-mix-proportions-in-your-outfits' },
    baggy: { name: "Levi's — how to style baggy jeans",
      url: 'https://www.levi.com/GB/en_GB/blog/article/how-to-style-baggy-jeans' },
    shoes: { name: "Just Men's Shoes — match shoes to pants",
      url: 'https://www.justmenshoes.com/blogs/news/match-shoes-to-pants-the-ultimate-men-s-outfit-guide' }
  };

  /* =========================================================================
   * 1) COLOUR RELATIONSHIP
   * ---------------------------------------------------------------------------
   * Neutrals (black/white/grey/charcoal/navy/beige/tan/brown/olive/denim) sit
   * "outside" the wheel and anchor anything. For two chromatic colours we use
   * the hue angle: analogous (≤~45°), triadic/mid clash zone, complementary
   * (~180°). Contrast must be *grounded* — one colour dominates, the other
   * accents; avoid 50/50 fights and >3 colours. (Westwood Hart, Gentleman Within)
   * ======================================================================== */

  // curated, high-confidence specific pairs (keyed by sorted "a|b")
  var CURATED = {
    // classic wins
    'navy|white':   good('Navy + white', 'The cleanest contrast in menswear — a cool neutral against bright neutral. Effortlessly sharp.'),
    'navy|grey':    good('Navy + grey', 'Two cool neutrals; low-risk, quietly refined. A menswear staple.'),
    'black|white':  good('Black + white', 'Maximum-contrast neutral pairing — bold, timeless, always reads intentional.'),
    'charcoal|white': good('Charcoal + white', 'Softer than black+white but just as reliable.'),
    'beige|navy':   good('Beige + navy', 'Warm light neutral grounded by a deep cool neutral — smart-casual gold standard.'),
    'navy|tan':     good('Navy + tan', 'Warm/cool neutral balance; the backbone of a lot of great casual fits.'),
    'olive|beige':  good('Olive + beige', 'Earthy analogous neutrals — relaxed, outdoorsy, hard to get wrong.'),
    'brown|beige':  good('Brown + cream/beige', 'Tonal earth palette; monochrome-adjacent warmth that looks considered.'),
    'olive|white':  good('Olive + white', 'Muted green lifted by bright neutral — fresh and easy.'),
    'denim|white':  good('Denim + white', 'Blue denim reads as a neutral; white on top is foolproof.'),
    'blue|green':   { score: 0.85, scheme: 'analogous', title: 'Blue + green (analogous)',
      detail: 'Adjacent on the wheel — the strongest, most wearable analogous combination in menswear. Low contrast, harmonious.', source: SRC.colorWheel },
    'navy|orange':  { score: 0.8, scheme: 'complementary', title: 'Navy + burnt orange (complementary accent)',
      detail: 'Opposite hues pop. Keep navy dominant and orange as the accent (pocket square / tee under a jacket), never 50/50.', source: SRC.colorWheel },
    // cautions
    'black|brown':  { score: 0.55, scheme: 'caution', title: 'Black + brown (tricky)',
      detail: 'Two heavy tones that can look muddy together. Doable if one is clearly an accent, but brown+navy or brown+cream is safer.', source: SRC.colorMix },
    'black|navy':   { score: 0.58, scheme: 'caution', title: 'Black + navy (looks-like-a-mistake risk)',
      detail: 'Close but not matching — can read like you got dressed in the dark. Make it obviously deliberate (texture contrast) or swap one out.', source: SRC.colorMix },
    'red|green':    { score: 0.4, scheme: 'clash', title: 'Red + green (festive clash)',
      detail: 'Vivid complementaries at full strength read "Christmas". Mute one heavily or separate them with neutral.', source: SRC.colorWheel },
    'orange|green': { score: 0.42, scheme: 'clash', title: 'Orange + green (busy)',
      detail: 'Two warm-ish brights compete. Works only if one is very desaturated (olive) or tiny as an accent.', source: SRC.colorWheel }
  };

  function good(title, detail) {
    return { score: 0.9, scheme: 'neutral', title: title, detail: detail, source: SRC.colorMix };
  }
  function key(a, b) { return [a, b].sort().join('|'); }

  function colorRelation(a, b) {
    // a,b are colour family names
    var curated = CURATED[key(a, b)];
    if (curated) return curated;

    var aN = K.isNeutralName(a), bN = K.isNeutralName(b);
    if (a === b) {
      return { score: 0.8, scheme: 'monochrome', title: 'Monochrome ' + a,
        detail: 'Same hue family — cohesive and intentional. Vary the light/dark value between pieces so it has depth instead of looking flat.',
        source: SRC.colorWheel };
    }
    if (aN && bN) {
      return { score: 0.86, scheme: 'neutral', title: cap(a) + ' + ' + b + ' (neutrals)',
        detail: 'Neutrals sit outside the colour wheel and never clash — the most reliable foundation in any wardrobe.',
        source: SRC.colorWheel };
    }
    if (aN || bN) {
      var chroma = aN ? b : a, neut = aN ? a : b;
      return { score: 0.9, scheme: 'neutral-anchor', title: cap(neut) + ' anchoring ' + chroma,
        detail: 'A neutral grounds a colour beautifully — this is the safest way to wear any hue. Let the neutral do the heavy lifting.',
        source: SRC.colorWheel };
    }

    // both chromatic → use hue geometry
    var ha = K.familyHue(a), hb = K.familyHue(b);
    if (ha == null || hb == null) {
      return { score: 0.65, scheme: 'mixed', title: cap(a) + ' + ' + b,
        detail: 'Mixed tones — wearable but not a textbook scheme. A neutral third piece will tie it together.', source: SRC.colorMix };
    }
    var gap = K.angularDist(ha, hb);
    if (gap <= 45) {
      return { score: 0.82, scheme: 'analogous', title: cap(a) + ' + ' + b + ' (analogous)',
        detail: 'Neighbouring hues on the wheel — minimal contrast, very harmonious and restrained. Great for a put-together, low-risk look.',
        source: SRC.colorWheel };
    }
    if (gap >= 150) {
      return { score: 0.66, scheme: 'complementary', title: cap(a) + ' + ' + b + ' (complementary)',
        detail: 'Opposite hues create high-energy contrast. It works only when one colour dominates and the other accents — never a 50/50 split — and ideally with a neutral mixed in to ground it.',
        source: SRC.colorWheel };
    }
    if (gap >= 90) {
      return { score: 0.52, scheme: 'triadic', title: cap(a) + ' + ' + b + ' (wide gap)',
        detail: 'These hues are far apart but not true opposites — the trickiest zone. Pull one back to a muted/neutral version or add a neutral buffer.',
        source: SRC.colorWheel };
    }
    return { score: 0.6, scheme: 'mid', title: cap(a) + ' + ' + b,
      detail: 'A middling hue gap — acceptable, but a neutral third piece or muting one colour will make it look more deliberate.',
      source: SRC.colorMix };
  }

  // saturation adjustment: two very vivid chromatics fighting -> nudge down
  function saturationPenalty(rel, satA, satB) {
    if (rel.scheme === 'complementary' || rel.scheme === 'triadic' || rel.scheme === 'mid' || rel.scheme === 'clash') {
      if (satA > 0.55 && satB > 0.55) {
        return Object.assign({}, rel, {
          score: Math.max(0.32, rel.score - 0.2),
          detail: rel.detail + ' Here BOTH colours are highly saturated, which makes the clash louder — mute one or swap it for a neutral.'
        });
      }
    }
    return rel;
  }

  /* =========================================================================
   * 2) FIT / PROPORTION RELATIONSHIP  (top fit level vs bottom fit level)
   * ---------------------------------------------------------------------------
   * Levels: 1 slim … 6 baggy (Knowledge.FIT_LEVELS). The researched principle:
   * BALANCE VOLUME WITH STRUCTURE. One fitted anchor + one relaxed/voluminous
   * piece = flattering. Loose + loose = shapeless "pyjama" look. Slim + slim is
   * sharp but can read severe. Note this *corrects* the naive "tight top can't
   * go with loose jeans" — a fitted top is exactly what balances baggy denim.
   * (Levi's, Angharad Jones)
   * ======================================================================== */
  function fitRelation(topLevel, bottomLevel) {
    var t = topLevel || 3, b = bottomLevel || 3;
    var fitted = Math.min(t, b) <= 2;      // at least one genuinely fitted piece
    var bothLoose = Math.min(t, b) >= 4;   // neither piece is fitted, both relaxed+
    var diff = Math.abs(t - b);

    if (bothLoose) {
      return { score: 0.4, scheme: 'volume-clash', title: 'Loose + loose (shapeless)',
        detail: 'Two relaxed pieces with no fitted anchor read as pyjamas. Add structure: a fitted top, a tuck, or a belt so the silhouette has a defined line.',
        source: SRC.baggy };
    }
    if (fitted && diff >= 2) {
      var which = t < b ? 'A fitted top anchors the volume of the relaxed bottom'
                        : 'A slim bottom sharpens the volume of the relaxed top';
      return { score: 0.95, scheme: 'balanced-contrast', title: 'Balanced contrast (fitted + relaxed)',
        detail: which + '. This one-volume-one-anchor pairing is the textbook flattering silhouette — e.g. a fitted tee with baggy jeans.',
        source: SRC.proportion };
    }
    if (diff <= 2 && t === 3 && b === 3) {
      return { score: 0.85, scheme: 'regular', title: 'Clean regular fit',
        detail: 'Both pieces sit at a regular fit — safe, versatile and always presentable.', source: SRC.proportion };
    }
    if (fitted && diff <= 1 && Math.max(t, b) <= 2) {
      return { score: 0.72, scheme: 'slim', title: 'Slim + slim (sharp, can read severe)',
        detail: 'A lean, sharp silhouette. It works but can feel tight all over — break it up with a relaxed layer, jacket or chunkier shoe.',
        source: SRC.proportion };
    }
    // mild contrast, one piece near-fitted
    return { score: 0.8, scheme: 'gentle-contrast', title: 'Gentle proportion contrast',
      detail: 'A moderate difference in fit gives the outfit some shape without going extreme. Reliable.', source: SRC.proportion };
  }

  /* =========================================================================
   * 3) SHOE / BOTTOM RELATIONSHIP
   * ---------------------------------------------------------------------------
   * Match the visual weight & formality of the footwear to the trouser. Sneakers
   * for jeans/casual; loafers & derbies for chinos/smart-casual; boots for
   * jeans (esp. dark wash); dress shoes for trousers/formal. White sneakers are
   * the versatile swing piece. (Just Men's Shoes)
   * ======================================================================== */
  var SHOE_AFFINITY = {
    // footwear subtype -> which bottoms it loves (subtype or family) + base formality feel
    'sneakers':        { loves: ['jeans', 'joggers', 'shorts', 'cargos', 'track-pants', 'chinos'], note: 'casual all-rounder' },
    'white-sneakers':  { loves: ['jeans', 'chinos', 'trousers', 'shorts', 'joggers'], note: 'the versatile swing piece — dresses jeans up or trousers down' },
    'running-shoes':   { loves: ['joggers', 'track-pants', 'shorts'], note: 'keep to athletic/relaxed bottoms' },
    'loafers':         { loves: ['chinos', 'trousers', 'jeans'], note: 'smart-casual; great on chinos, sharp on dark denim' },
    'derby':           { loves: ['chinos', 'trousers', 'jeans'], note: 'smart-casual to business' },
    'oxford-shoes':    { loves: ['trousers', 'chinos'], note: 'the dressiest — pair with tailored trousers' },
    'boots':           { loves: ['jeans', 'chinos', 'cargos'], note: 'structured; especially strong with dark-wash denim' },
    'kolhapuri':       { loves: ['jeans', 'chinos', 'pyjama', 'shorts'], note: 'relaxed ethnic-casual' },
    'sandals':         { loves: ['shorts', 'joggers'], note: 'strictly casual/warm-weather' },
    'flip-flops':      { loves: ['shorts'], note: 'loungewear only' }
  };

  function shoeRelation(footSubtype, bottomSubtype, footFormality, targetFormality) {
    var aff = SHOE_AFFINITY[footSubtype];
    var loves = aff && aff.loves.indexOf(bottomSubtype) !== -1;
    var formGap = Math.abs((footFormality || 2) - (targetFormality || 2));

    if (loves && formGap <= 1) {
      return { score: 0.92, scheme: 'shoe-match', title: cap(labelShoe(footSubtype)) + ' + ' + bottomSubtype,
        detail: (aff.note ? cap(aff.note) + '. ' : '') + 'This is a recommended footwear-to-trouser pairing and sits right for the occasion.',
        source: SRC.shoes };
    }
    if (loves) {
      return { score: 0.78, scheme: 'shoe-ok', title: cap(labelShoe(footSubtype)) + ' + ' + bottomSubtype,
        detail: (aff.note ? cap(aff.note) + '. ' : '') + 'A natural pairing, though the formality is a little off from what you asked for today.',
        source: SRC.shoes };
    }
    if (formGap >= 3) {
      return { score: 0.4, scheme: 'shoe-clash', title: cap(labelShoe(footSubtype)) + ' feels off with ' + bottomSubtype,
        detail: 'The shoe\'s dress level is far from the rest of the outfit. Match the visual weight of the footwear to the trousers — e.g. sneakers with jeans, leather shoes with tailored trousers.',
        source: SRC.shoes };
    }
    return { score: 0.62, scheme: 'shoe-neutral', title: cap(labelShoe(footSubtype)) + ' + ' + bottomSubtype,
      detail: 'Workable, but not a standout pairing. Check the visual weights match.', source: SRC.shoes };
  }

  function labelShoe(s) { return s ? s.replace(/-/g, ' ') : s; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  global.FashionRules = {
    colorRelation: colorRelation,
    saturationPenalty: saturationPenalty,
    fitRelation: fitRelation,
    shoeRelation: shoeRelation,
    SOURCES: SRC
  };
})(window);
