/* ============================================================================
 * mood.js  —  SUBAGENT 2: the Human-Behaviour Expert
 * ----------------------------------------------------------------------------
 * Translates how you FEEL and what you WANT ("relaxed", "solid fit for going
 * out", "work", "date") into concrete, machine-usable style *targets* the
 * fashion engine can aim at:
 *
 *   { formality:0..5, fitBias, boldness:0..1, brandTierPref, comfort:0..1,
 *     wantsLayer, keywords:[] }
 *
 * It reads two independent inputs so it matches real life:
 *   - MOOD     : your emotional state today (energetic, low, confident, lazy…)
 *   - INTENT   : the job the outfit must do (relaxed / sharp / work / party…)
 *
 * Brand awareness: "solid fit / going out" biases toward higher brand tiers and
 * a cleaner silhouette; "relaxed" biases toward comfort tiers and softer fits.
 * ========================================================================== */
(function (global) {
  'use strict';

  // Intent presets — the backbone. "fitBias" is a target on the FIT_LEVELS
  // scale (1 slim .. 6 baggy); the recommender prefers tops/bottoms near it.
  var INTENTS = {
    relaxed: {
      label: 'Relaxed / comfort',
      formality: 1, fitBias: 4, boldness: 0.35, comfort: 0.9,
      brandTierPref: 2, wantsLayer: false,
      keywords: ['soft', 'easy', 'breathable', 'no fuss']
    },
    'smart-casual': {
      label: 'Smart casual',
      formality: 3, fitBias: 3, boldness: 0.5, comfort: 0.6,
      brandTierPref: 3, wantsLayer: true,
      keywords: ['clean', 'put-together', 'versatile']
    },
    sharp: {
      label: 'Solid fit / going out',
      formality: 4, fitBias: 2, boldness: 0.7, comfort: 0.4,
      brandTierPref: 4, wantsLayer: true,
      keywords: ['tailored', 'elevated', 'statement', 'crisp']
    },
    work: {
      label: 'Work',
      formality: 4, fitBias: 3, boldness: 0.4, comfort: 0.55,
      brandTierPref: 3, wantsLayer: true,
      keywords: ['professional', 'reliable', 'muted']
    },
    date: {
      label: 'Date',
      formality: 3.5, fitBias: 2, boldness: 0.65, comfort: 0.5,
      brandTierPref: 4, wantsLayer: true,
      keywords: ['considered', 'flattering', 'a little bold']
    },
    active: {
      label: 'Active / errands',
      formality: 1, fitBias: 3, boldness: 0.4, comfort: 0.95,
      brandTierPref: 2, wantsLayer: false,
      keywords: ['functional', 'move-friendly']
    },
    festive: {
      label: 'Festive / traditional',
      formality: 4, fitBias: 3, boldness: 0.8, comfort: 0.6,
      brandTierPref: 3, wantsLayer: true,
      keywords: ['rich', 'celebratory', 'colourful']
    },
    formal: {
      label: 'Formal event',
      formality: 5, fitBias: 2.5, boldness: 0.55, comfort: 0.45,
      brandTierPref: 4, wantsLayer: true,
      keywords: ['polished', 'dressy', 'controlled']
    },
    interview: {
      label: 'Interview / important meeting',
      formality: 4.5, fitBias: 2.7, boldness: 0.35, comfort: 0.5,
      brandTierPref: 3, wantsLayer: true,
      keywords: ['credible', 'sharp', 'calm']
    },
    travel: {
      label: 'Travel capsule',
      formality: 2, fitBias: 3.8, boldness: 0.45, comfort: 0.9,
      brandTierPref: 2, wantsLayer: true,
      keywords: ['repeatable', 'comfortable', 'layerable']
    }
  };

  // Mood modifiers — nudge the intent target rather than replace it.
  var MOODS = {
    confident:  { boldnessΔ:  0.28, fitΔ: -0.8, formalityΔ:  0.5, layer: true, keyword: 'assertive' },
    energetic:  { boldnessΔ:  0.22, fitΔ: -0.5, formalityΔ:  0.1, keyword: 'dynamic' },
    calm:       { boldnessΔ: -0.18, fitΔ:  0.4, formalityΔ: -0.1, keyword: 'tonal' },
    low:        { boldnessΔ: -0.35, fitΔ:  0.9, formalityΔ: -0.7, comfortΔ: 0.28, layer: false, keyword: 'soft' },
    lazy:       { boldnessΔ: -0.32, fitΔ:  1.2, formalityΔ: -1.0, comfortΔ: 0.35, layer: false, keyword: 'slouchy' },
    playful:    { boldnessΔ:  0.35, fitΔ:  0.1, formalityΔ: -0.1, keyword: 'accented' },
    focused:    { boldnessΔ: -0.12, fitΔ: -0.35, formalityΔ:  0.35, layer: true, keyword: 'precise' }
  };

  function resolve(intentKey, moodKey) {
    var base = INTENTS[intentKey] || INTENTS['smart-casual'];
    var mod = MOODS[moodKey] || {};
    var t = {
      intent: intentKey,
      mood: moodKey,
      label: base.label,
      formality: clamp(base.formality + (mod.formalityΔ || 0), 0, 5),
      fitBias: clamp(base.fitBias + (mod.fitΔ || 0), 1, 6),
      boldness: clamp01(base.boldness + (mod.boldnessΔ || 0)),
      comfort: clamp01(base.comfort + (mod.comfortΔ || 0)),
      brandTierPref: base.brandTierPref,
      wantsLayer: mod.layer != null ? mod.layer : base.wantsLayer,
      keywords: base.keywords.slice()
    };
    if (mod.keyword) t.keywords.push(mod.keyword);
    t.summary = describe(t, moodKey);
    return t;
  }

  function describe(t, moodKey) {
    var fitWord = t.fitBias <= 2 ? 'a sharp, fitted' :
                  t.fitBias >= 4.5 ? 'a loose, easy' : 'a balanced';
    var lvl = global.Knowledge.FORMALITY_LABELS[Math.round(t.formality)] || 'casual';
    var moodBit = moodKey ? ('feeling ' + moodKey + ', ') : '';
    return moodBit + 'aiming for ' + fitWord + ' ' + lvl + ' look' +
      (t.boldness > 0.6 ? ' with room to be bold' : ', kept understated') + '.';
  }

  /* How well a single garment matches the behavioural target (0..1). Used to
   * pre-filter and to weight candidates before the fashion engine runs. */
  function garmentAffinity(garment, target) {
    var s = 0, n = 0;
    // formality closeness
    s += 1 - Math.min(1, Math.abs((garment.formality || 2) - target.formality) / 3); n++;
    // fit closeness (only tops/bottoms carry a fit)
    if (garment.fit) {
      var f = global.Knowledge.FIT_LEVELS[garment.fit] || 3;
      s += 1 - Math.min(1, Math.abs(f - target.fitBias) / 3); n++;
    }
    // brand tier closeness
    var tier = global.Knowledge.brandTier(garment.brand);
    s += 1 - Math.min(1, Math.abs(tier - target.brandTierPref) / 3); n++;
    // boldness: saturated / patterned pieces score higher when boldness wanted
    var vivid = ((garment.hsl && garment.hsl[1]) || 0) * 0.6 + (garment.pattern || 0) * 0.4;
    s += 1 - Math.abs(vivid - target.boldness); n++;
    return clamp01(s / n);
  }

  function intentList() {
    return Object.keys(INTENTS).map(function (k) {
      return { key: k, label: INTENTS[k].label };
    });
  }
  function moodList() { return Object.keys(MOODS); }

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function clamp01(x) { return clamp(x, 0, 1); }

  global.Mood = {
    resolve: resolve,
    garmentAffinity: garmentAffinity,
    intentList: intentList,
    moodList: moodList,
    INTENTS: INTENTS,
    MOODS: MOODS
  };
})(window);
