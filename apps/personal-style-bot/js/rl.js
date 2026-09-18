/* ============================================================================
 * rl.js  —  Reinforcement learning: the taste model that learns YOU
 * ----------------------------------------------------------------------------
 * A contextual multi-armed bandit with a linear reward model (online SGD).
 *
 *   context   = the intent you asked for today (relaxed / sharp / work / …)
 *   arm       = a candidate outfit
 *   features  = φ(outfit) — interpretable signals, each in 0..1:
 *                 colorHarmony, fitBalance, formalityMatch, boldness,
 *                 vastuAlign, brandFit, novelty, patternSafety
 *   model     = per-context weight vector w (+ bias)
 *   prediction= ŷ = σ(w·φ + b)                (expected "you'll like it")
 *   action    = ε-greedy: usually pick the top ŷ outfit, sometimes explore
 *   reward    = your rating mapped to r ∈ [0,1]
 *   update    = w ← w + α·(r − ŷ)·φ ,  b ← b + α·(r − ŷ)      (SGD on log-loss-ish)
 *
 * So every time you rate an outfit, the weights for THAT context shift toward
 * the features of looks you liked — the system literally learns that, say,
 * "for going out you reward high fit-balance + boldness but punish loud
 * patterns", and biases future picks accordingly. Weights persist in IndexedDB.
 * ========================================================================== */
(function (global) {
  'use strict';

  var FEATURES = ['colorHarmony', 'fitBalance', 'formalityMatch', 'boldness',
                  'vastuAlign', 'brandFit', 'novelty', 'patternSafety',
                  'weatherFit', 'repeatSafety', 'accessoryFit',
                  'shoeCompatibility', 'fashionTrend', 'moodMatch'];
  var ALPHA = 0.08;         // learning rate
  var EPSILON = 0.15;       // exploration probability
  var PROFILE_KEY = 'rl_weights';

  var _model = null;        // { contextKey: {w:{feat:val}, b:number, n:count} }

  function load() {
    return global.DB.Profile.get(PROFILE_KEY, null).then(function (m) {
      _model = m || {};
      return _model;
    });
  }

  function ctxModel(ctx) {
    if (!_model[ctx]) {
      var w = {};
      // sensible priors: these features are generally good, so start positive.
      FEATURES.forEach(function (f) { w[f] = defaultPrior(f); });
      _model[ctx] = { w: w, b: 0, n: 0 };
    } else {
      FEATURES.forEach(function (f) {
        if (_model[ctx].w[f] == null) _model[ctx].w[f] = defaultPrior(f);
      });
    }
    return _model[ctx];
  }

  function defaultPrior(f) {
    switch (f) {
      case 'colorHarmony': return 1.2;
      case 'fitBalance': return 1.0;
      case 'formalityMatch': return 1.0;
      case 'patternSafety': return 0.6;
      case 'novelty': return 0.3;
      case 'vastuAlign': return 0.3;
      case 'brandFit': return 0.4;
      case 'boldness': return 0.2;
      case 'weatherFit': return 0.9;
      case 'repeatSafety': return 0.5;
      case 'accessoryFit': return 0.35;
      case 'shoeCompatibility': return 1.0;
      case 'fashionTrend': return 0.55;
      case 'moodMatch': return 1.0;
      default: return 0.5;
    }
  }

  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

  function predict(ctx, feats) {
    var m = ctxModel(ctx), z = m.b;
    FEATURES.forEach(function (f) { z += (m.w[f] || 0) * (feats[f] || 0); });
    return sigmoid(z);
  }

  // Update the model from an observed reward. `rating` is a 1..5 star value
  // (1 = hated it, 5 = loved it). Mapped linearly to reward r in [0,1] so that
  // 1★ -> 0 genuinely penalises and 5★ -> 1 genuinely reinforces.
  function update(ctx, feats, rating) {
    var r = Math.max(0, Math.min(1, (rating - 1) / 4)); // 1..5 star -> 0..1
    var m = ctxModel(ctx);
    var yhat = predict(ctx, feats);
    var err = r - yhat;
    FEATURES.forEach(function (f) {
      m.w[f] = (m.w[f] || 0) + ALPHA * err * (feats[f] || 0);
    });
    m.b += ALPHA * err;
    m.n += 1;
    return global.DB.Profile.set(PROFILE_KEY, _model).then(function () {
      return { yhat: yhat, reward: r, err: err };
    });
  }

  // ε-greedy selection over scored candidates.
  // candidates: [{...outfit, _feats, _pred}]  (pred already computed)
  // Returns a re-ordered list; the head is the chosen recommendation.
  function rank(ctx, candidates, opts) {
    opts = opts || {};
    var eps = opts.epsilon != null ? opts.epsilon : EPSILON;
    candidates.forEach(function (c) { c._pred = predict(ctx, c._feats); });
    candidates.sort(function (a, b) { return b._pred - a._pred; });

    // With prob eps, promote a random-but-decent candidate to encourage
    // exploration (only if we have several options).
    if (candidates.length > 3 && Math.random() < eps) {
      var pick = 1 + Math.floor(Math.random() * Math.min(4, candidates.length - 1));
      var chosen = candidates.splice(pick, 1)[0];
      chosen._explored = true;
      candidates.unshift(chosen);
    }
    return candidates;
  }

  function weightsFor(ctx) {
    var m = _model && _model[ctx];
    return m ? { w: m.w, b: m.b, n: m.n } : null;
  }

  function reset() { _model = {}; return global.DB.Profile.set(PROFILE_KEY, _model); }

  global.RL = {
    FEATURES: FEATURES,
    load: load,
    predict: predict,
    update: update,
    rank: rank,
    weightsFor: weightsFor,
    reset: reset
  };
})(window);
