/* ============================================================================
 * fashion.js  —  SUBAGENT 1: the Fashion Expert
 * ----------------------------------------------------------------------------
 * Judges whether two/three garments go together and returns a 0..1 score plus
 * human-readable reasons. It reasons over the CV output (colour family, HSL,
 * pattern, brightness) and the declared fit/formality.
 *
 * Rules encoded (all standard, blog-consensus style principles):
 *
 *  A. COLOUR HARMONY (colour-wheel based)
 *     - Neutral + anything ....................... always safe
 *     - Monochrome (same family, diff lightness) . refined
 *     - Analogous (<= 40° apart) ................. harmonious, low risk
 *     - Complementary (~180°) .................... high energy, good if one is muted
 *     - Triadic (~120°) ......................... bold, capped unless one is neutral
 *     - Clash (odd 60–150° gap, both saturated) .. penalised
 *
 *  B. PROPORTION / FIT BALANCE
 *     - Contrast one fitted piece with one relaxed piece = balanced silhouette.
 *     - "tight top + very loose bottom" or "baggy top + skinny bottom" past a
 *       threshold is penalised (the exact case in the brief).
 *     - slim+slim and baggy+baggy are mildly penalised (no visual balance).
 *
 *  C. PATTERN
 *     - Two strong patterns together clash unless one is small/neutral.
 *     - Pattern + solid is the safe default.
 *
 *  D. FORMALITY COHERENCE
 *     - Pieces should sit within ~2 formality steps of each other
 *       (no dress-shoes-with-gym-shorts).
 *     - Footwear formality is weighted heavily; it makes or breaks a look.
 *
 *  E. CONTRAST
 *     - all-dark or all-light head to toe gets a small nudge to add contrast.
 * ========================================================================== */
(function (global) {
  'use strict';

  var K = global.Knowledge;

  /* ---- colour pair score in 0..1 with a reason ----------------------------*/
  function colorPair(a, b) {
    var an = a.family, bn = b.family;
    var aNeutral = K.isNeutralName(an), bNeutral = K.isNeutralName(bn);

    if (aNeutral && bNeutral) {
      // avoid the one weak neutral combo (brown + black) mild penalty
      if ((an === 'brown' && bn === 'black') || (an === 'black' && bn === 'brown'))
        return r(0.72, 'neutral pair (brown+black is a touch heavy)');
      return r(0.9, 'neutral + neutral — foolproof');
    }
    if (aNeutral || bNeutral) return r(0.92, 'neutral anchors the colour — safe & sharp');

    if (an === bn) {
      var dl = Math.abs(a.hsl[2] - b.hsl[2]);
      return dl > 0.15
        ? r(0.85, 'monochrome ' + an + ' with light/dark contrast — refined')
        : r(0.55, 'same ' + an + ' with little contrast — a bit flat');
    }

    var ha = K.familyHue(an), hb = K.familyHue(bn);
    if (ha == null || hb == null) return r(0.7, 'mixed tones');
    var gap = K.angularDist(ha, hb);
    var satA = a.hsl[1], satB = b.hsl[1];
    var bothVivid = satA > 0.5 && satB > 0.5;

    if (gap <= 40) return r(0.82, 'analogous (' + an + '/' + bn + ') — smooth & tonal');
    if (gap >= 150) {
      // complementary: great if at least one is muted, risky if both scream
      return bothVivid
        ? r(0.6, 'complementary ' + an + '/' + bn + ' — bold, keep one muted')
        : r(0.86, 'complementary ' + an + '/' + bn + ' — striking, balanced');
    }
    if (gap >= 100 && gap < 140) {
      return bothVivid
        ? r(0.5, 'triadic-ish ' + an + '/' + bn + ' — busy when both are vivid')
        : r(0.72, 'triadic accent ' + an + '/' + bn);
    }
    // the awkward middle gap
    return bothVivid
      ? r(0.4, an + ' + ' + bn + ' clash — hues fight each other')
      : r(0.65, an + ' + ' + bn + ' — acceptable, both are soft');
  }

  /* ---- fit balance between top and bottom ---------------------------------*/
  function fitBalance(topFit, bottomFit) {
    var t = K.FIT_LEVELS[topFit] || 3, b = K.FIT_LEVELS[bottomFit] || 3;
    var diff = b - t;                 // + means bottom looser than top
    var mag = Math.abs(diff);
    if (mag === 0) {
      if (t <= 2) return r(0.6, 'slim top + slim bottom — sleek but no balance');
      if (t >= 5) return r(0.35, 'baggy top + baggy bottom — shapeless');
      return r(0.8, 'balanced regular fit');
    }
    if (mag === 1 || mag === 2) return r(0.9, 'nice proportion — one piece fitted, one relaxed');
    if (mag === 3) return r(0.55, 'strong fit contrast — borderline');
    return r(0.3, 'extreme fit mismatch (' + topFit + ' top vs ' + bottomFit + ' bottom)');
  }

  function patternPair(a, b) {
    var pa = a.pattern || 0, pb = b.pattern || 0;
    if (pa >= 0.4 && pb >= 0.4) return r(0.4, 'two loud patterns — one should be solid');
    if (pa >= 0.4 || pb >= 0.4) return r(0.85, 'pattern + solid — clean');
    return r(0.8, 'solid + solid — versatile');
  }

  function colorSystem(items) {
    var byslot = {}; items.forEach(function (i) { byslot[i.slot] = i; });
    var top = byslot.top, bottom = byslot.bottom, layer = byslot.layer, foot = byslot.footwear;
    var parts = [], details = [];
    if (top && bottom) { var tb = colorPair(top, bottom); parts.push({ v: tb.score, w: 0.54 }); details.push(tb.why); }
    if (layer && top) { var lt = colorPair(layer, top); parts.push({ v: lt.score, w: 0.25 }); details.push(lt.why); }
    if (foot && bottom) { var fb = colorPair(foot, bottom); parts.push({ v: fb.score, w: 0.21 }); details.push(fb.why); }

    var families = items.map(function (i) { return i.family; });
    var unique = {};
    families.forEach(function (f) { unique[f] = true; });
    var uniqueCount = Object.keys(unique).length;
    var vivid = items.filter(function (i) { return !K.isNeutralName(i.family) && (i.hsl[1] || 0) > 0.55; }).length;
    var neutralCount = items.filter(function (i) { return K.isNeutralName(i.family); }).length;

    var score = weighted(parts, 0.72);
    if (uniqueCount === 1 && items.length > 2) {
      score *= 0.82;
      details.push('too matchy head-to-toe; needs texture or contrast to avoid looking flat');
    } else if (vivid >= 3 && neutralCount === 0) {
      score *= 0.72;
      details.push('three vivid colors with no neutral anchor reads noisy');
    } else if (neutralCount >= 1 && vivid <= 1 && uniqueCount >= 2) {
      score = Math.min(1, score + 0.06);
      details.push('neutral base with one controlled color keeps it intentional');
    }

    return card('Color theory', score,
      score >= 0.84 ? 'Strong: balanced color relationship' :
      score >= 0.68 ? 'Good: wearable, with a small caveat' :
      'Weak: color needs a calmer anchor',
      details,
      'Moderate matching beats both matchy-matchy and clashing.',
      'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0102772');
  }

  function silhouetteSystem(items) {
    var byslot = {}; items.forEach(function (i) { byslot[i.slot] = i; });
    var top = byslot.top, bottom = byslot.bottom, foot = byslot.footwear;
    if (!top || !bottom) {
      return card('Silhouette', 0.65, 'Needs top and bottom to judge proportion',
        ['add both upper and lower garments for a real proportion read']);
    }
    var t = K.FIT_LEVELS[top.fit] || 3, b = K.FIT_LEVELS[bottom.fit] || 3;
    var footSub = foot ? foot.subtype : '';
    var chunkyFoot = /sneakers|running|boots/.test(footSub || '');
    var score, details = [];

    if (t >= 5 && b >= 5) {
      score = chunkyFoot ? 0.62 : 0.38;
      details.push(chunkyFoot
        ? 'baggy top + baggy bottom can work as streetwear because the shoe has enough weight'
        : 'baggy top + baggy bottom needs a chunkier shoe or sharper layer');
    } else if (t >= 5 && b >= 3 && b <= 4) {
      score = 0.86;
      details.push('oversized top works best over straight or relaxed denim for shape');
    } else if (t <= 2 && b >= 3 && b <= 5) {
      score = b >= 5 ? 0.68 : 0.88;
      details.push(b >= 5
        ? 'fitted top with very loose denim is high contrast; keep the shoe substantial'
        : 'fitted top balances straight/relaxed denim cleanly');
    } else if (Math.abs(t - b) <= 1) {
      score = t <= 2 ? 0.64 : 0.84;
      details.push(t <= 2
        ? 'slim-on-slim is sleek but less current than a little ease'
        : 'regular/straight proportions are the safest daily silhouette');
    } else if (Math.abs(t - b) <= 2) {
      score = 0.78;
      details.push('one fitted and one relaxed piece gives visible balance');
    } else {
      score = 0.42;
      details.push('extreme top-bottom fit contrast looks accidental unless styled deliberately');
    }

    return card('Silhouette', score,
      score >= 0.84 ? 'Strong: proportions look intentional' :
      score >= 0.65 ? 'Decent: works with the right styling' :
      'Weak: proportion mismatch',
      details,
      'Modern denim styling favors balance over extremes.',
      'https://www.gq.com/story/how-to-pull-off-a-blazer-and-jeans');
  }

  function footwearSystem(items) {
    var byslot = {}; items.forEach(function (i) { byslot[i.slot] = i; });
    var bottom = byslot.bottom, foot = byslot.footwear;
    if (!bottom || !foot) {
      return card('Shoes', 0.65, 'No footwear selected',
        ['add shoes to judge the full outfit from the ground up']);
    }
    var bfit = K.FIT_LEVELS[bottom.fit] || 3;
    var sub = foot.subtype || '';
    var bottomSub = bottom.subtype || '';
    var score = 0.68, details = [];

    if (/joggers|track-pants/.test(bottomSub)) {
      score = /sneakers|running-shoes/.test(sub) ? 0.92 : 0.34;
      details.push(score > 0.8 ? 'athletic bottoms need athletic shoes' : 'formal shoes fight the sportswear base');
    } else if (/shorts/.test(bottomSub)) {
      score = /sneakers|sandals|loafers|kolhapuri/.test(sub) ? 0.86 : 0.52;
      details.push(score > 0.8 ? 'shorts pair best with low, easy footwear' : 'heavy formal shoes make shorts feel confused');
    } else if (/trousers|chinos|pyjama/.test(bottomSub)) {
      score = /loafers|derby|oxford|kolhapuri|boots/.test(sub) ? 0.90 :
        /white-sneakers|sneakers/.test(sub) ? 0.74 : 0.48;
      details.push(score > 0.8 ? 'tailored bottoms like structured shoes' : 'casual shoes lower the dress level');
    } else if (/jeans|cargos/.test(bottomSub)) {
      if (bfit >= 5) {
        score = /sneakers|running-shoes|boots/.test(sub) ? 0.90 :
          /loafers/.test(sub) ? 0.78 : 0.56;
        details.push(score >= 0.85 ? 'loose denim needs visual weight at the shoe' :
          'baggy denim can take loafers, but the hem and shoe profile matter');
      } else if (bfit >= 3) {
        score = /sneakers|white-sneakers|loafers|boots|derby/.test(sub) ? 0.88 : 0.58;
        details.push('straight denim is flexible: sneakers, loafers, boots and derbies all work');
      } else {
        score = /white-sneakers|loafers|boots/.test(sub) ? 0.78 : 0.56;
        details.push('slim denim needs cleaner, lower-profile shoes');
      }
    }

    return card('Shoes', score,
      score >= 0.84 ? 'Strong: shoe shape supports the bottomwear' :
      score >= 0.65 ? 'Good: acceptable with styling attention' :
      'Weak: shoes fight the pants',
      details,
      'Jeans and trousers depend heavily on shoe shape, hem and proportion.',
      'https://www.joesfootwear.com/blog/shoes-to-wear-with-jeans/');
  }

  function trendSystem(items) {
    var byslot = {}; items.forEach(function (i) { byslot[i.slot] = i; });
    var top = byslot.top, bottom = byslot.bottom, layer = byslot.layer, foot = byslot.footwear;
    var details = [], score = 0.66;
    if (layer && /blazer|sport-coat/.test(layer.subtype || '') && bottom && /jeans/.test(bottom.subtype || '')) {
      var b = K.FIT_LEVELS[bottom.fit] || 3;
      score = b >= 3 && b <= 4 ? 0.9 : 0.58;
      details.push(score > 0.8
        ? 'blazer + straight/relaxed jeans is current because structure meets ease'
        : 'blazer with very skinny or very baggy jeans is harder to balance');
    } else if (bottom && /jeans|cargos/.test(bottom.subtype || '') && (K.FIT_LEVELS[bottom.fit] || 3) >= 4) {
      score = foot && /loafers|sneakers|boots/.test(foot.subtype || '') ? 0.84 : 0.66;
      details.push('relaxed denim is current; the shoe decides whether it reads polished or sloppy');
    } else if (bottom && /shorts/.test(bottom.subtype || '')) {
      score = top && /t-shirt|casual-shirt|tank/.test(top.subtype || '') ? 0.8 : 0.62;
      details.push('sporty shorts are trending as off-duty wear when the top stays clean');
    } else {
      details.push('classic rather than trend-led; rely on color, fit and shoes');
    }
    return card('Trend read', score,
      score >= 0.82 ? 'Current: trend-aware but wearable' :
      score >= 0.66 ? 'Classic: not loud, still usable' :
      'Caution: trend proportions need adjustment',
      details,
      'Recent fashion coverage points toward relaxed denim, loafers and structured casual layers.',
      'https://www.gq.com/story/how-to-pull-off-a-blazer-and-jeans');
  }

  function formalityCoherence(items) {
    var fs = items.map(function (i) { return i.formality; });
    var min = Math.min.apply(null, fs), max = Math.max.apply(null, fs);
    var spread = max - min;
    if (spread <= 1) return r(0.9, 'consistent dress level');
    if (spread === 2) return r(0.78, 'slightly mixed formality — still coherent');
    if (spread === 3) return r(0.5, 'mixed formality — check it reads intentional');
    return r(0.3, 'formality all over the place');
  }

  /* ---- overall look score --------------------------------------------------
   * items = array of normalised garment views:
   *   { slot, family, hsl:[h,s,l], pattern, brightness, fit, formality }
   * Returns { score:0..1, breakdown:{...}, reasons:[...] }
   */
  function scoreOutfit(items) {
    var byslot = {};
    items.forEach(function (i) { byslot[i.slot] = i; });
    var top = byslot.top, bottom = byslot.bottom, layer = byslot.layer,
        foot = byslot.footwear;

    var color = colorSystem(items);
    var silhouette = silhouetteSystem(items);
    var shoes = footwearSystem(items);
    var pattern = top && bottom ? cardFromPair('Pattern', patternPair(top, bottom),
      'Two loud patterns usually need one solid anchor.') : card('Pattern', 0.78, 'Pattern-safe', ['not enough pattern conflict to worry about']);
    var formality = cardFromPair('Dress level', formalityCoherence(items),
      'Pieces should sit close enough in formality to look deliberate.');
    var cont = cardFromPair('Light/dark contrast', contrast(items),
      'Contrast keeps all-dark or all-light outfits from going flat.');
    var trend = trendSystem(items);

    var scorecards = [color, silhouette, shoes, pattern, formality, cont, trend];
    var parts = [
      { key: 'color', card: color, w: 0.28 },
      { key: 'fit', card: silhouette, w: 0.24 },
      { key: 'footwear', card: shoes, w: 0.18 },
      { key: 'formality', card: formality, w: 0.11 },
      { key: 'pattern', card: pattern, w: 0.07 },
      { key: 'contrast', card: cont, w: 0.05 },
      { key: 'trend', card: trend, w: 0.07 }
    ];

    var total = 0, wsum = 0, breakdown = {};
    parts.forEach(function (p) {
      total += p.card.score * p.w; wsum += p.w;
      breakdown[p.key] = Math.round(p.card.score * 100) / 100;
    });
    var score = wsum ? total / wsum : 0.5;
    var reasons = scorecards.map(function (c) { return c.verdict; });

    return { score: clamp01(score), breakdown: breakdown, reasons: reasons, scorecards: scorecards };
  }

  function contrast(items) {
    var bs = items.filter(function (i) { return typeof i.brightness === 'number'; })
                  .map(function (i) { return i.brightness; });
    if (bs.length < 2) return r(0.8, '');
    var spread = Math.max.apply(null, bs) - Math.min.apply(null, bs);
    if (spread < 35) {
      var dark = bs[0] < 100;
      return r(0.6, dark ? 'all-dark — add a lighter piece for depth'
                         : 'very light head-to-toe — an anchor piece would ground it');
    }
    return r(0.85, 'good light/dark contrast');
  }

  function r(score, why) { return { score: score, why: why }; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function weighted(parts, fallback) {
    var total = 0, wsum = 0;
    parts.forEach(function (p) { total += p.v * p.w; wsum += p.w; });
    return wsum ? total / wsum : fallback;
  }
  function card(title, score, verdict, details, sourceLabel, sourceUrl) {
    return {
      title: title,
      score: clamp01(score),
      verdict: verdict,
      details: details || [],
      sourceLabel: sourceLabel || null,
      sourceUrl: sourceUrl || null
    };
  }
  function cardFromPair(title, res, sourceLabel, sourceUrl) {
    return card(title, res.score,
      res.score >= 0.82 ? 'Strong: ' + res.why :
      res.score >= 0.62 ? 'Usable: ' + res.why :
      'Weak: ' + res.why,
      [res.why],
      sourceLabel,
      sourceUrl);
  }

  global.Fashion = {
    scoreOutfit: scoreOutfit,
    colorPair: colorPair,
    fitBalance: fitBalance,
    patternPair: patternPair,
    footwearSystem: footwearSystem,
    silhouetteSystem: silhouetteSystem,
    colorSystem: colorSystem
  };
})(window);
