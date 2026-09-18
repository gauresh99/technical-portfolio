/* ============================================================================
 * localml.js  —  Local wardrobe intelligence, trained only on this device.
 * ----------------------------------------------------------------------------
 * A small, transparent k-nearest-neighbours model over the same CV features the
 * app already extracts. It learns from the labels the user confirms while adding
 * clothes, then suggests category, subtype and fit for the next uploads.
 *
 * No API calls. No cloud training. No eval. The model is rebuilt from IndexedDB
 * wardrobe records each session (it is never deserialized from storage into
 * live use), and can be exported/deleted with the rest of the local data.
 *
 * SECURITY / ROBUSTNESS (this file is deliberately defensive):
 *  - Every label that becomes an object key (category / subtype / fit) is
 *    sanitised and screened against __proto__ / prototype / constructor, so a
 *    crafted or corrupted record can't pollute prototypes. All vote maps use
 *    null-prototype objects.
 *  - Categories are constrained to the known taxonomy; labels are length-capped.
 *  - Feature vectors are sanitised to finite, bounded numbers (no NaN/Infinity
 *    poisoning distance math).
 *  - Training set and leave-one-out evaluation are size-capped so a very large
 *    (or maliciously inflated) closet can't freeze the browser with O(n²) work.
 *  - A validateModel() gate is provided for any future load-from-storage path.
 * ========================================================================== */
(function (global) {
  'use strict';

  var KNN_K = 5;
  var VERSION = 2;
  var MAX_EXAMPLES = 2000;   // cap live training-set size (memory + CPU)
  var MAX_EVAL = 400;        // cap leave-one-out sample (bounds O(n²))
  var MAX_LABEL_LEN = 40;    // cap any label length
  var EXPECTED_LEN = 14 + 24; // base features + one-hot colour families

  var FAMILIES = [
    'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue',
    'indigo', 'purple', 'magenta', 'pink', 'white', 'ivory', 'grey', 'charcoal',
    'black', 'navy', 'beige', 'tan', 'brown', 'olive', 'denim'
  ];
  var has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  // NOTE: a `{ '__proto__': 1 }` literal sets the prototype instead of creating
  // a key, so a blocklist object would silently be EMPTY. Use an explicit test.
  function isDangerousKey(s) {
    return s === '__proto__' || s === 'prototype' || s === 'constructor';
  }

  /* ---- label / category sanitisation -------------------------------------- */
  function safeLabel(v) {
    if (typeof v !== 'string') return '';
    var s = v.trim();
    if (!s || isDangerousKey(s)) return '';
    return s.length > MAX_LABEL_LEN ? s.slice(0, MAX_LABEL_LEN) : s;
  }
  function safeCategory(v) {
    var s = safeLabel(v);
    if (!s) return '';
    var known = global.Knowledge && global.Knowledge.GARMENTS;
    if (known && !has(known, s)) return '';   // reject categories outside taxonomy
    return s;
  }

  /* ---- training ----------------------------------------------------------- */
  function train(garments) {
    var list = Array.isArray(garments) ? garments : [];
    // cap the scan and the resulting set so a huge closet can't hang training
    if (list.length > MAX_EXAMPLES) list = list.slice(list.length - MAX_EXAMPLES);
    var examples = [];
    for (var i = 0; i < list.length && examples.length < MAX_EXAMPLES; i++) {
      var ex = exampleFromGarment(list[i]);
      if (ex) examples.push(ex);
    }
    var model = {
      version: VERSION,
      trainedAt: new Date().toISOString(),
      n: examples.length,
      examples: examples,
      metrics: null
    };
    model.metrics = evaluate(examples);
    return model;
  }

  function exampleFromGarment(g) {
    if (!g || typeof g !== 'object' || !g.analysis) return null;
    var category = safeCategory(g.category);
    if (!category) return null;                    // no usable category -> skip
    return {
      id: safeLabel(g.id) || '',
      vector: sanitizeVector(vectorFromAnalysis(g.analysis)),
      category: category,
      subtype: safeLabel(g.subtype),
      fit: safeLabel(g.fit)
    };
  }

  /* ---- prediction --------------------------------------------------------- */
  function predict(analysis, model, forcedCategory) {
    if (!analysis || !model || !Array.isArray(model.examples) || model.examples.length < 3) {
      return emptyPrediction(model && Array.isArray(model.examples) ? model.examples.length : 0);
    }
    var vector = sanitizeVector(vectorFromAnalysis(analysis));
    var neighbours = nearest(vector, model.examples, KNN_K);
    var category = safeCategory(forcedCategory) ? { label: safeCategory(forcedCategory), confidence: 1 }
      : topVote(neighbours, function (e) { return e.category; });
    category = blendCategoryHint(category, analysis.categoryHints);
    var subtypePool = neighbours.filter(function (n) { return n.example.category === category.label; });
    if (!subtypePool.length) subtypePool = neighbours;
    var fitPool = subtypePool.filter(function (n) { return !!n.example.fit; });

    return {
      ready: true,
      trainedOn: model.examples.length,
      category: category,
      subtype: topVote(subtypePool, function (e) { return e.subtype; }),
      fit: topVote(fitPool.length ? fitPool : neighbours, function (e) { return e.fit; }),
      neighbours: neighbours.slice(0, 3).map(function (n) {
        return {
          id: n.example.id, category: n.example.category, subtype: n.example.subtype,
          fit: n.example.fit, distance: Math.round(n.distance * 1000) / 1000
        };
      })
    };
  }

  function emptyPrediction(n) {
    return { ready: false, trainedOn: n || 0, category: null, subtype: null, fit: null, neighbours: [] };
  }

  /* ---- feature vector ----------------------------------------------------- */
  function vectorFromAnalysis(a) {
    a = a || {};
    var primary = (a.colors && a.colors[0]) || {};
    var hsl = primary.hsl || [0, 0, 0.5];
    var fam = a.primaryFamily || primary.family || 'grey';
    var geo = a.geometry || {};
    var hue = num(hsl[0], 0);
    var vec = [
      norm(a.brightness, 255, 0.5),
      clamp01(num(a.pattern, 0)),
      clamp01(num(hsl[1], 0)),
      clamp01(hsl[2] == null ? 0.5 : num(hsl[2], 0.5)),
      Math.sin(2 * Math.PI * hue),
      Math.cos(2 * Math.PI * hue),
      norm(geo.aspect, 3, 0.45),
      clamp01(geo.coverage == null ? 0.7 : num(geo.coverage, 0.7)),
      clamp01(geo.widthShare == null ? 0.7 : num(geo.widthShare, 0.7)),
      clamp01(geo.heightShare == null ? 0.7 : num(geo.heightShare, 0.7)),
      hint(a, 'top'), hint(a, 'bottom'), hint(a, 'footwear'), hint(a, 'accessory')
    ];
    for (var i = 0; i < FAMILIES.length; i++) vec.push(FAMILIES[i] === fam ? 1 : 0);
    return vec;
  }

  // force a vector to exactly EXPECTED_LEN finite, bounded numbers
  function sanitizeVector(vec) {
    var out = new Array(EXPECTED_LEN);
    for (var i = 0; i < EXPECTED_LEN; i++) {
      var v = (vec && typeof vec[i] === 'number' && isFinite(vec[i])) ? vec[i] : 0;
      out[i] = v < -4 ? -4 : v > 4 ? 4 : v;   // hard bound
    }
    return out;
  }

  /* ---- evaluation (leave-one-out, size-capped) ---------------------------- */
  function evaluate(examples) {
    if (!examples || examples.length < 4) {
      return { ready: false, categoryAccuracy: null, subtypeAccuracy: null, fitAccuracy: null };
    }
    // sample a bounded subset of query points so this stays O(MAX_EVAL · n)
    var queries = examples.length > MAX_EVAL ? sampleEvenly(examples, MAX_EVAL) : examples;
    var catOk = 0, catN = 0, subOk = 0, subN = 0, fitOk = 0, fitN = 0;
    queries.forEach(function (ex) {
      var pool = examples.filter(function (e) { return e !== ex; });
      if (!pool.length) return;
      var ns = nearest(ex.vector, pool, KNN_K);
      var cat = topVote(ns, function (e) { return e.category; });
      if (cat.label) { catN++; if (cat.label === ex.category) catOk++; }
      var subPool = ns.filter(function (n) { return n.example.category === ex.category; });
      var sub = topVote(subPool.length ? subPool : ns, function (e) { return e.subtype; });
      if (ex.subtype && sub.label) { subN++; if (sub.label === ex.subtype) subOk++; }
      var fit = topVote(subPool.length ? subPool : ns, function (e) { return e.fit; });
      if (ex.fit && fit.label) { fitN++; if (fit.label === ex.fit) fitOk++; }
    });
    return {
      ready: true,
      categoryAccuracy: catN ? catOk / catN : null,
      subtypeAccuracy: subN ? subOk / subN : null,
      fitAccuracy: fitN ? fitOk / fitN : null
    };
  }

  function sampleEvenly(arr, k) {
    var out = [], step = arr.length / k;
    for (var i = 0; i < k; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  }

  function nearest(vector, examples, k) {
    return examples.map(function (e) {
      return { example: e, distance: dist(vector, e.vector) };
    }).sort(function (a, b) { return a.distance - b.distance; })
      .slice(0, Math.min(k || KNN_K, examples.length));
  }

  // distance-weighted vote using a NULL-PROTOTYPE map (no prototype pollution)
  function topVote(neighbours, labelFn) {
    var scores = Object.create(null), total = 0;
    (neighbours || []).forEach(function (n) {
      var label = safeLabel(labelFn(n.example));
      if (!label) return;
      var w = 1 / (0.08 + (isFinite(n.distance) ? n.distance : 1e6));
      scores[label] = (scores[label] || 0) + w;
      total += w;
    });
    var best = null, bestScore = -1, keys = Object.keys(scores);
    for (var i = 0; i < keys.length; i++) {
      if (scores[keys[i]] > bestScore) { best = keys[i]; bestScore = scores[keys[i]]; }
    }
    return { label: best, confidence: total ? bestScore / total : 0 };
  }

  function blendCategoryHint(vote, hints) {
    if (!hints || typeof hints !== 'object') return vote;
    var best = null, score = 0, keys = Object.keys(hints);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (isDangerousKey(k)) continue;
      var v = num(hints[k], 0);
      if (v > score) { best = safeCategory(k); score = v; }
    }
    if (!best) return vote;
    if (!vote.label || score >= 0.70 || (score >= 0.52 && vote.confidence < 0.55)) {
      return { label: best, confidence: Math.max(score, vote.confidence || 0) };
    }
    return vote;
  }

  function hint(a, key) {
    return a.categoryHints && typeof a.categoryHints[key] === 'number' && isFinite(a.categoryHints[key])
      ? clamp01(a.categoryHints[key]) : 0;
  }

  function dist(a, b) {
    var s = 0, n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) {
      var d = (num(a[i], 0)) - (num(b[i], 0));
      s += d * d;
    }
    return Math.sqrt(s / (n || 1));
  }

  /* ---- validator for any future load-from-storage path -------------------- */
  function validateModel(model) {
    if (!model || typeof model !== 'object') return null;
    if (model.version !== VERSION || !Array.isArray(model.examples)) return null;
    var examples = [];
    for (var i = 0; i < model.examples.length && examples.length < MAX_EXAMPLES; i++) {
      var e = model.examples[i];
      if (!e || typeof e !== 'object') continue;
      var category = safeCategory(e.category);
      if (!category) continue;
      if (!Array.isArray(e.vector)) continue;
      examples.push({
        id: safeLabel(e.id), vector: sanitizeVector(e.vector),
        category: category, subtype: safeLabel(e.subtype), fit: safeLabel(e.fit)
      });
    }
    return {
      version: VERSION,
      trainedAt: typeof model.trainedAt === 'string' ? model.trainedAt.slice(0, 40) : new Date().toISOString(),
      n: examples.length, examples: examples, metrics: evaluate(examples)
    };
  }

  /* ---- numeric guards ----------------------------------------------------- */
  function num(x, fallback) { return (typeof x === 'number' && isFinite(x)) ? x : fallback; }
  function norm(x, max, fallback) {
    if (typeof x !== 'number' || !isFinite(x)) return fallback;
    return clamp01(x / max);
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  global.LocalML = Object.freeze({
    VERSION: VERSION,
    train: train,
    predict: predict,
    vectorFromAnalysis: vectorFromAnalysis,
    evaluate: evaluate,
    validateModel: validateModel
  });
})(window);
