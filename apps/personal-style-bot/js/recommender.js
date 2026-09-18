/* ============================================================================
 * recommender.js  —  THE LEAD PLANNER (orchestrator)
 * ----------------------------------------------------------------------------
 * This is the conductor that all five "subagent" engines report to. Given the
 * wardrobe + today's mood/intent + date, it:
 *
 *   1. asks the Behaviour engine (mood.js) for today's style target
 *   2. builds candidate outfits (top × bottom × optional layer × footwear)
 *   3. enforces the WEAR RULES — the 3-day no-repeat on tops/layers, and
 *      "available/clean" flags
 *   4. scores each candidate by combining:
 *          Fashion  (colour/fit/pattern/formality)   — fashion.js
 *          Behaviour affinity (matches your mood)     — mood.js
 *          Vastu alignment (auspicious colour today)  — vastu.js
 *      into an interpretable FEATURE VECTOR
 *   5. hands features to the RL taste model (rl.js) which predicts how much
 *      YOU specifically will like each, learned from past ratings
 *   6. returns the ranked recommendations with full explanations
 *
 * The feature vector is the shared language between the rule engines and the
 * learner: rules compute the features, the learner weights them per-context.
 * ========================================================================== */
(function (global) {
  'use strict';

  var K = global.Knowledge;
  var RECENT_DAYS = 3;    // the "can't repeat a top within 3 days" rule
  var MAX_POOL = { top: 36, bottom: 36, layer: 14, footwear: 14, accessory: 12 };

  /* Convert a stored garment record into the light "view" the engines expect. */
  function toView(g) {
    var c = (g.analysis && g.analysis.colors && g.analysis.colors[0]) || {};
    return {
      id: g.id,
      slot: K.GARMENTS[g.category] ? K.GARMENTS[g.category].slot : g.category,
      category: g.category,
      subtype: g.subtype,
      family: (g.colorFamily || c.family || 'grey'),
      hsl: c.hsl || [0, 0, 0.5],
      pattern: g.analysis ? g.analysis.pattern : 0,
      brightness: g.analysis ? g.analysis.brightness : 128,
      fit: g.fit,
      formality: (typeof g.formality === 'number') ? g.formality
                 : K.garmentFormality(g.category, g.subtype),
      brand: g.brand,
      name: g.name || g.subtype
    };
  }

  /* Days since a garment was last worn (Infinity if never). wearlog = array of
   * { date:'YYYY-MM-DD', items:[garmentId,...] }. */
  function daysSinceWorn(garmentId, wearlog, today) {
    var last = null;
    wearlog.forEach(function (w) {
      if (w.items && w.items.indexOf(garmentId) !== -1) {
        var d = global.Vastu.toLocalDate(w.date);
        if (!last || d > last) last = d;
      }
    });
    if (!last) return Infinity;
    return Math.floor((stripTime(today) - stripTime(last)) / 86400000);
  }

  function stripTime(d) {
    var x = new Date(global.Vastu.toLocalDate(d)); x.setHours(0, 0, 0, 0); return x;
  }

  /* ---- feature extraction: the shared vocabulary for rules + RL ------------*/
  function features(items, target, date, recencyMap, opts) {
    opts = opts || {};
    var fashion = global.Fashion.scoreOutfit(items);
    var vastu = global.Vastu.outfitAlignment(items, date);
    var weatherFit = K.outfitWeatherScore ? K.outfitWeatherScore(items, opts.weather || 'mild') : 0.85;
    var repeatSafety = outfitRepeatSafety(items, opts.wearlog || [], date);
    var accessoryFit = accessoryScore(items, target);

    // behaviour affinity: average garment affinity to the mood target
    var aff = 0;
    items.forEach(function (i) { aff += global.Mood.garmentAffinity(i, target); });
    aff /= items.length;

    var byslot = {}; items.forEach(function (i) { byslot[i.slot] = i; });
    var top = byslot.top, bottom = byslot.bottom;

    var fitMatch = 1, formMatch = 1, boldness = 0, patternSafety = 1, brandFit = 1;
    // formality match to target
    var meanForm = items.reduce(function (a, i) { return a + i.formality; }, 0) / items.length;
    formMatch = 1 - Math.min(1, Math.abs(meanForm - target.formality) / 3);
    // fit match to target (from top+bottom)
    if (top && bottom) {
      var f = ((K.FIT_LEVELS[top.fit] || 3) + (K.FIT_LEVELS[bottom.fit] || 3)) / 2;
      fitMatch = 1 - Math.min(1, Math.abs(f - target.fitBias) / 3);
    }
    // boldness of the look (saturation + pattern of top/bottom)
    var vivid = items.map(function (i) { return (i.hsl[1] || 0) * 0.6 + (i.pattern || 0) * 0.4; });
    boldness = vivid.reduce(function (a, b) { return a + b; }, 0) / vivid.length;
    // pattern safety = inverse of pattern clash risk
    if (top && bottom && (top.pattern || 0) >= 0.4 && (bottom.pattern || 0) >= 0.4)
      patternSafety = 0.35;
    // brand fit
    var tierErr = items.map(function (i) {
      return Math.abs(K.brandTier(i.brand) - target.brandTierPref) / 3;
    });
    brandFit = 1 - Math.min(1, tierErr.reduce(function (a, b) { return a + b; }, 0) / tierErr.length);

    // novelty: how "rested" the pieces are (recently-worn -> lower novelty)
    var nov = items.map(function (i) {
      var d = recencyMap[i.id];
      if (d === Infinity) return 1;
      return Math.min(1, d / 10);
    });
    var novelty = nov.reduce(function (a, b) { return a + b; }, 0) / nov.length;
    var boldnessMatch = 1 - Math.min(1, Math.abs(boldness - target.boldness));
    var moodMatch = clamp01(0.40 * formMatch + 0.35 * fitMatch + 0.25 * boldnessMatch);

    return {
      vec: {
        colorHarmony: fashion.breakdown.color != null ? fashion.breakdown.color : fashion.score,
        fitBalance: (fashion.breakdown.fit != null) ? fashion.breakdown.fit : fitMatch,
        formalityMatch: formMatch,
        boldness: boldness,
        vastuAlign: vastu,
        brandFit: brandFit,
        novelty: novelty,
        patternSafety: patternSafety,
        weatherFit: weatherFit,
        repeatSafety: repeatSafety,
        accessoryFit: accessoryFit,
        shoeCompatibility: fashion.breakdown.footwear != null ? fashion.breakdown.footwear : 0.65,
        fashionTrend: fashion.breakdown.trend != null ? fashion.breakdown.trend : 0.65,
        moodMatch: moodMatch
      },
      fashion: fashion,
      vastu: vastu,
      weatherFit: weatherFit,
      repeatSafety: repeatSafety,
      accessoryFit: accessoryFit,
      affinity: aff,
      fitMatch: fitMatch,
      moodMatch: moodMatch
    };
  }

  /* ---- main entry ----------------------------------------------------------
   * garments : all stored garment records
   * wearlog  : array of wear entries
   * opts     : { intent, mood, date, limit, vastuWeight }
   */
  function recommend(garments, wearlog, opts) {
    opts = opts || {};
    var date = opts.date ? global.Vastu.toLocalDate(opts.date) : new Date();
    var target = global.Mood.resolve(opts.intent || 'smart-casual', opts.mood);
    var ctx = contextKey(opts.intent || 'smart-casual', opts.mood);
    var vastuWeight = opts.vastuWeight != null ? opts.vastuWeight : 0.15;
    var weather = opts.weather || 'mild';

    // bucket by slot and drop unavailable items
    var views = garments.filter(function (g) { return g.available !== false; }).map(toView);
    var byslot = { top: [], bottom: [], layer: [], footwear: [], accessory: [] };
    views.forEach(function (v) { if (byslot[v.slot]) byslot[v.slot].push(v); });

    // recency map + 3-day filter on tops & layers
    var recencyMap = {};
    views.forEach(function (v) { recencyMap[v.id] = daysSinceWorn(v.id, wearlog, date); });
    var eligibleTops = byslot.top.filter(function (t) { return recencyMap[t.id] >= RECENT_DAYS; });
    var eligibleLayers = byslot.layer.filter(function (l) { return recencyMap[l.id] >= RECENT_DAYS; });

    var blocked = byslot.top.length - eligibleTops.length;
    eligibleTops = rankPool(eligibleTops, target, MAX_POOL.top);
    byslot.bottom = rankPool(byslot.bottom, target, MAX_POOL.bottom);
    eligibleLayers = rankPool(eligibleLayers, target, MAX_POOL.layer);
    byslot.footwear = rankPool(byslot.footwear, target, MAX_POOL.footwear);
    byslot.accessory = rankPool(byslot.accessory, target, MAX_POOL.accessory);

    if (!eligibleTops.length || !byslot.bottom.length) {
      return {
        target: target,
        vastu: global.Vastu.forDate(date),
        recommendations: [],
        note: buildShortfallNote(byslot, eligibleTops, blocked)
      };
    }

    // build candidates (cap the search so it stays instant even for big closets)
    var footOptions = byslot.footwear.length ? byslot.footwear : [null];
    var layerOptions = [null].concat(target.wantsLayer ? eligibleLayers : []);
    var accessoryOptions = [null].concat(byslot.accessory);
    var candidates = [];
    eligibleTops.forEach(function (top) {
      byslot.bottom.forEach(function (bottom) {
        layerOptions.forEach(function (layer) {
          footOptions.forEach(function (foot) {
            accessoryOptions.forEach(function (accessory) {
              var items = [top, bottom];
              if (layer) items.push(layer);
              if (foot) items.push(foot);
              if (accessory) items.push(accessory);
              candidates.push(items);
            });
          });
        });
      });
    });

    // score every candidate
    var scored = candidates.map(function (items) {
      var fx = features(items, target, date, recencyMap, { weather: weather, wearlog: wearlog });
      // blended rule score (used for tie-break + shown as "stylist score")
      var parts = [
        { v: fx.fashion.score, w: 0.48 },
        { v: fx.moodMatch, w: 0.18 },
        { v: fx.affinity, w: 0.10 },
        { v: fx.weatherFit, w: 0.07 },
        { v: fx.repeatSafety, w: 0.03 },
        { v: fx.accessoryFit, w: 0.04 },
        { v: fx.vec.novelty, w: 0.03 },
        { v: fx.vec.brandFit, w: 0.02 },
        { v: fx.vastu, w: Math.max(0, Math.min(0.5, vastuWeight)) }
      ];
      var total = 0, wsum = 0;
      parts.forEach(function (p) { total += p.v * p.w; wsum += p.w; });
      var ruleScore = clamp01(total / (wsum || 1));
      return {
        items: items,
        _feats: fx.vec,
        ruleScore: ruleScore,
        fashion: fx.fashion,
        vastu: fx.vastu,
        weather: weather,
        weatherFit: fx.weatherFit,
        repeatSafety: fx.repeatSafety,
        accessoryFit: fx.accessoryFit,
        affinity: fx.affinity,
        reasons: fx.fashion.reasons
      };
    });

    // let the learned taste model rank them (ε-greedy)
    global.RL.rank(ctx, scored, { epsilon: opts.epsilon });
    scored.forEach(function (c) {
      c.finalScore = clamp01(0.72 * c.ruleScore + 0.28 * (c._pred == null ? c.ruleScore : c._pred) +
        (c._explored ? 0.04 : 0));
    });
    scored.sort(function (a, b) { return b.finalScore - a.finalScore; });

    // de-duplicate so we don't show 6 variants of the same top
    var seenTop = {}, out = [];
    for (var i = 0; i < scored.length && out.length < (opts.limit || 4); i++) {
      var topId = scored[i].items[0].id;
      var key = topId + '|' + scored[i].items[1].id;
      if (seenTop[topId] && out.length >= 2) continue; // allow some variety, avoid spam
      seenTop[topId] = true;
      out.push(finalize(scored[i], target, date));
    }

    return {
      target: target,
      context: ctx,
      vastu: global.Vastu.forDate(date),
      weather: K.WEATHER_PROFILES[weather] || K.WEATHER_PROFILES.mild,
      blockedByRule: blocked,
      recommendations: out,
      note: blocked ? (blocked + ' top(s) hidden — worn within the last ' + RECENT_DAYS + ' days.') : null
    };
  }

  function finalize(c, target, date) {
    // build a friendly explanation combining every engine's voice
    var expl = [];
    var top = c.items[0], bottom = c.items[1];
    expl.push('Fashion: ' + (c.fashion.reasons[0] || 'balanced pairing') + '.');
    expl.push('Mood: matches your "' + target.label.toLowerCase() + '" goal (' +
              Math.round(c.affinity * 100) + '% fit).');
    if (K.weatherNote) expl.push(K.weatherNote(c.items, c.weather));
    var vday = global.Vastu.forDate(date);
    expl.push('Today is ' + vday.day + ' (' + vday.planet + '): favours ' +
              vday.families.slice(0, 3).join('/') + '. This look scores ' +
              Math.round(c.vastu * 100) + '% on that.');
    if (hasSlot(c.items, 'accessory')) {
      expl.push('Accessory: included as part of the look, not an afterthought.');
    }
    if (c.repeatSafety < 0.5) {
      expl.push('Repeat check: similar full outfit appeared recently, so this is deliberately lower ranked.');
    }

    return {
      items: c.items.map(function (i) {
        return { id: i.id, slot: i.slot, name: i.name, subtype: i.subtype,
                 family: i.family, fit: i.fit };
      }),
      score: c.finalScore != null ? c.finalScore : c.ruleScore,
      tasteScore: c._pred != null ? c._pred : c.ruleScore,
      stylistScore: c.ruleScore,                         // rule-based score
      predictedYouLike: c._pred,
      explored: !!c._explored,
      weatherFit: c.weatherFit,
      repeatSafety: c.repeatSafety,
      reasons: c.fashion.reasons,
      explanation: expl,
      breakdown: c.fashion.breakdown,
      scorecards: c.fashion.scorecards || [],
      features: c._feats
    };
  }

  function buildShortfallNote(byslot, eligibleTops, blocked) {
    if (!byslot.top.length) return 'Add at least one top to get recommendations.';
    if (!byslot.bottom.length) return 'Add at least one bottom to get recommendations.';
    if (!eligibleTops.length)
      return 'Every top was worn within the last ' + RECENT_DAYS +
             ' days. Add more tops or mark some as available.';
    return 'Not enough items yet — add a few more pieces.';
  }

  function rankPool(items, target, limit) {
    return (items || []).slice().sort(function (a, b) {
      return global.Mood.garmentAffinity(b, target) - global.Mood.garmentAffinity(a, target);
    }).slice(0, limit);
  }

  function contextKey(intent, mood) {
    return intent + '|' + (mood || 'neutral');
  }

  function accessoryScore(items, target) {
    var has = hasSlot(items, 'accessory');
    var wants = target.intent === 'sharp' || target.intent === 'date' ||
                target.intent === 'festive' || target.intent === 'work' ||
                target.formality >= 3.5;
    if (has && wants) return 1;
    if (has) return 0.82;
    return wants ? 0.58 : 0.78;
  }

  function hasSlot(items, slot) {
    return items.some(function (i) { return i.slot === slot; });
  }

  function outfitKey(items) {
    return items.map(function (i) { return i.id; }).sort().join('|');
  }

  function outfitRepeatSafety(items, wearlog, today) {
    var key = outfitKey(items);
    var last = null;
    (wearlog || []).forEach(function (w) {
      if (!w.items || outfitKey(w.items.map(function (id) { return { id: id }; })) !== key) return;
      var d = global.Vastu.toLocalDate(w.date);
      if (!last || d > last) last = d;
    });
    if (!last) return 1;
    var days = Math.floor((stripTime(today) - stripTime(last)) / 86400000);
    if (days < 0) return 0.45;
    return Math.min(1, days / 14);
  }

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  global.Recommender = {
    recommend: recommend,
    toView: toView,
    features: features,
    daysSinceWorn: daysSinceWorn,
    RECENT_DAYS: RECENT_DAYS
  };
})(window);
