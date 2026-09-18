/* ============================================================================
 * knowledge.js  —  Shared knowledge base for all engines
 * ----------------------------------------------------------------------------
 * This is the "reference library" every expert engine reads from. It encodes
 * well-established, non-controversial style principles:
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ---- Color families ------------------------------------------------------
   * 12 hue spokes at 30° each. We bucket a measured hue into the nearest spoke.
   * Each spoke stores its center hue so harmony math can use angular distance. */
  var HUE_SPOKES = [
    { name: 'red',        hue: 0   },
    { name: 'orange',     hue: 30  },
    { name: 'amber',      hue: 45  },
    { name: 'yellow',     hue: 60  },
    { name: 'lime',       hue: 90  },
    { name: 'green',      hue: 120 },
    { name: 'teal',       hue: 165 },
    { name: 'cyan',       hue: 190 },
    { name: 'blue',       hue: 220 },
    { name: 'indigo',     hue: 250 },
    { name: 'purple',     hue: 280 },
    { name: 'magenta',    hue: 320 },
    { name: 'pink',       hue: 340 }
  ];

  // Neutrals are defined by low saturation and/or extreme lightness, not hue.
  // They act as universal partners in the harmony engine.
  var NEUTRALS = ['white', 'ivory', 'grey', 'charcoal', 'black', 'navy', 'beige', 'tan', 'brown', 'olive', 'denim'];

  /* ---- Garment taxonomy ----------------------------------------------------
   * slot = where it lives in a head-to-toe stack. baseFormality gives a sane
   * default the user can override. layer=true means it stacks over a top. */
  var GARMENTS = {
    top: {
      label: 'Top / Upper garment',
      slot: 'top',
      subtypes: {
        't-shirt':     { formality: 1 },
        'polo':        { formality: 2 },
        'henley':      { formality: 2 },
        'casual-shirt':{ formality: 3 },
        'oxford-shirt':{ formality: 3 },
        'dress-shirt': { formality: 4 },
        'kurta':       { formality: 3 },
        'sweater':     { formality: 2 },
        'sweatshirt':  { formality: 1 },
        'hoodie':      { formality: 1 },
        'tank':        { formality: 1 }
      }
    },
    layer: {
      label: 'Layer / Outerwear',
      slot: 'layer',
      layer: true,
      subtypes: {
        'overshirt':   { formality: 2 },
        'denim-jacket':{ formality: 2 },
        'bomber':      { formality: 2 },
        'blazer':      { formality: 4 },
        'sport-coat':  { formality: 4 },
        'cardigan':    { formality: 2 },
        'nehru-jacket':{ formality: 4 },
        'windbreaker': { formality: 1 },
        'leather-jacket':{ formality: 3 }
      }
    },
    bottom: {
      label: 'Bottom',
      slot: 'bottom',
      subtypes: {
        'jeans':       { formality: 2 },
        'chinos':      { formality: 3 },
        'trousers':    { formality: 4 },
        'joggers':     { formality: 1 },
        'shorts':      { formality: 1 },
        'cargos':      { formality: 2 },
        'track-pants': { formality: 1 },
        'pyjama':      { formality: 3 } // as in kurta-pyjama
      }
    },
    footwear: {
      label: 'Footwear',
      slot: 'footwear',
      subtypes: {
        'sneakers':    { formality: 2 },
        'white-sneakers':{ formality: 2 },
        'loafers':     { formality: 4 },
        'derby':       { formality: 4 },
        'oxford-shoes':{ formality: 5 },
        'boots':       { formality: 3 },
        'sandals':     { formality: 1 },
        'flip-flops':  { formality: 0 },
        'kolhapuri':   { formality: 2 },
        'running-shoes':{ formality: 1 }
      }
    },
    accessory: {
      label: 'Accessory (optional)',
      slot: 'accessory',
      optional: true,
      subtypes: {
        'watch':       { formality: 3 },
        'cap':         { formality: 1 },
        'beanie':      { formality: 1 },
        'belt':        { formality: 3 },
        'sunglasses':  { formality: 2 },
        'chain':       { formality: 2 },
        'scarf':       { formality: 3 }
      }
    }
  };

  /* ---- Fit levels ----------------------------------------------------------
   * Numeric so the proportion-balance rule (fashion.js) can compare tops vs
   * bottoms. The core menswear principle: avoid "baggy + baggy" and avoid
   * "skin-tight + skin-tight"; contrast one fitted piece with one relaxed piece
   * for a balanced silhouette, but never let the gap get extreme. */
  var FIT_LEVELS = {
    'slim':    1,
    'fitted':  2,
    'regular': 3,
    'relaxed': 4,
    'oversized': 5,
    'baggy':   6
  };

  var FORMALITY_LABELS = ['loungewear', 'ultra-casual', 'casual', 'smart-casual', 'business-casual', 'formal'];

  /* ---- Local weather / comfort intelligence -------------------------------
   * No weather API is required. The UI asks for a simple condition, and the
   * recommender checks whether the outfit has roughly the right warmth,
   * breathability, coverage and rain handling.
   */
  var WEATHER_PROFILES = {
    mild:  { label: 'Mild / indoor', targetWarmth: 2.0, heat: 0.35, rain: 0,   wind: 0 },
    hot:   { label: 'Hot',           targetWarmth: 0.8, heat: 0.9,  rain: 0,   wind: 0 },
    humid: { label: 'Humid',         targetWarmth: 0.7, heat: 1.0,  rain: 0.2, wind: 0 },
    cool:  { label: 'Cool',          targetWarmth: 2.8, heat: 0.15, rain: 0,   wind: 0.2 },
    cold:  { label: 'Cold',          targetWarmth: 3.8, heat: 0,    rain: 0,   wind: 0.4 },
    rainy: { label: 'Rainy',         targetWarmth: 2.2, heat: 0.2,  rain: 1,   wind: 0.2 },
    windy: { label: 'Windy',         targetWarmth: 2.7, heat: 0.15, rain: 0.2, wind: 1 }
  };

  var SUBTYPE_COMFORT = {
    'tank': { warmth: 0.3, breathability: 1 },
    't-shirt': { warmth: 0.8, breathability: 0.85 },
    'polo': { warmth: 1.1, breathability: 0.75 },
    'henley': { warmth: 1.4, breathability: 0.65 },
    'casual-shirt': { warmth: 1.2, breathability: 0.75 },
    'oxford-shirt': { warmth: 1.4, breathability: 0.65 },
    'dress-shirt': { warmth: 1.3, breathability: 0.6 },
    'kurta': { warmth: 1.2, breathability: 0.8 },
    'sweater': { warmth: 2.7, breathability: 0.35 },
    'sweatshirt': { warmth: 2.4, breathability: 0.35 },
    'hoodie': { warmth: 2.7, breathability: 0.3, wind: 0.25 },
    'overshirt': { warmth: 1.8, breathability: 0.45, wind: 0.25 },
    'denim-jacket': { warmth: 2.2, breathability: 0.25, wind: 0.45 },
    'bomber': { warmth: 2.4, breathability: 0.25, wind: 0.65 },
    'blazer': { warmth: 2.0, breathability: 0.35, wind: 0.35 },
    'sport-coat': { warmth: 2.0, breathability: 0.4, wind: 0.35 },
    'cardigan': { warmth: 2.1, breathability: 0.45 },
    'nehru-jacket': { warmth: 1.8, breathability: 0.45, wind: 0.2 },
    'windbreaker': { warmth: 1.7, breathability: 0.25, rain: 0.8, wind: 1 },
    'leather-jacket': { warmth: 2.5, breathability: 0.2, rain: 0.4, wind: 0.85 },
    'jeans': { warmth: 1.8, breathability: 0.35 },
    'chinos': { warmth: 1.5, breathability: 0.55 },
    'trousers': { warmth: 1.6, breathability: 0.45 },
    'joggers': { warmth: 1.9, breathability: 0.45 },
    'shorts': { warmth: 0.5, breathability: 1 },
    'cargos': { warmth: 1.6, breathability: 0.5 },
    'track-pants': { warmth: 1.5, breathability: 0.65 },
    'pyjama': { warmth: 1.4, breathability: 0.75 },
    'sneakers': { warmth: 1.2, breathability: 0.45, rain: 0.25 },
    'white-sneakers': { warmth: 1.1, breathability: 0.45, rain: 0.15 },
    'loafers': { warmth: 1.0, breathability: 0.45, rain: 0.2 },
    'derby': { warmth: 1.2, breathability: 0.35, rain: 0.35 },
    'oxford-shoes': { warmth: 1.2, breathability: 0.35, rain: 0.3 },
    'boots': { warmth: 1.8, breathability: 0.25, rain: 0.75, wind: 0.5 },
    'sandals': { warmth: 0.3, breathability: 1, rain: 0.2 },
    'flip-flops': { warmth: 0.2, breathability: 1, rain: 0.15 },
    'kolhapuri': { warmth: 0.4, breathability: 0.9, rain: 0.15 },
    'running-shoes': { warmth: 1.0, breathability: 0.65, rain: 0.3 },
    'watch': { warmth: 0, breathability: 1 },
    'cap': { warmth: 0.2, breathability: 0.8 },
    'beanie': { warmth: 0.8, breathability: 0.2 },
    'belt': { warmth: 0, breathability: 1 },
    'sunglasses': { warmth: 0, breathability: 1 },
    'chain': { warmth: 0, breathability: 1 },
    'scarf': { warmth: 1.0, breathability: 0.2, wind: 0.35 }
  };

  /* ---- Brand tiers (used by the behaviour engine) --------------------------
   * A rough map so "solid fit / going out" can lean on elevated pieces while
   * "relaxed" leans on comfort brands. Purely heuristic and easily extended by
   * the user; unknown brands fall back to tier 2 (mid). */
  var BRAND_TIERS = {
    // value / comfort
    'uniqlo': 2, 'hm': 1, 'h&m': 1, 'zara': 2, 'decathlon': 1, 'jockey': 1,
    'nike': 3, 'adidas': 3, 'puma': 2, 'levis': 2, "levi's": 2,
    // elevated / going-out
    'aime leon dore': 4, 'ami': 4, 'cos': 3, 'arket': 3, 'fred perry': 3,
    'ralph lauren': 4, 'polo ralph lauren': 4, 'tommy hilfiger': 3,
    'stone island': 5, 'acne studios': 5, 'our legacy': 5,
    // indian labels
    'fabindia': 3, 'manyavar': 3, 'raymond': 3, 'allen solly': 2, 'peter england': 2
  };

  /* ---- helpers -------------------------------------------------------------*/

  // nearest hue spoke name for a given hue in [0,360)
  function hueToFamily(h) {
    var best = HUE_SPOKES[0], bestD = 999;
    for (var i = 0; i < HUE_SPOKES.length; i++) {
      var d = angularDist(h, HUE_SPOKES[i].hue);
      if (d < bestD) { bestD = d; best = HUE_SPOKES[i]; }
    }
    return best.name;
  }

  function familyHue(name) {
    for (var i = 0; i < HUE_SPOKES.length; i++) {
      if (HUE_SPOKES[i].name === name) return HUE_SPOKES[i].hue;
    }
    return null; // neutral / unknown
  }

  function angularDist(a, b) {
    var d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  function isNeutralName(name) {
    return NEUTRALS.indexOf(name) !== -1;
  }

  function garmentFormality(category, subtype) {
    var cat = GARMENTS[category];
    if (!cat) return 2;
    var st = cat.subtypes[subtype];
    return st ? st.formality : 2;
  }

  function brandTier(brand) {
    if (!brand) return 2;
    var key = String(brand).trim().toLowerCase();
    return BRAND_TIERS.hasOwnProperty(key) ? BRAND_TIERS[key] : 2;
  }

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  function comfortFor(subtype) {
    return SUBTYPE_COMFORT[subtype] || { warmth: 1.3, breathability: 0.55, rain: 0.1, wind: 0.1 };
  }

  function outfitWeatherScore(items, weatherKey) {
    var profile = WEATHER_PROFILES[weatherKey] || WEATHER_PROFILES.mild;
    if (!items || !items.length) return 0.7;

    var visible = { top: 0.30, bottom: 0.25, layer: 0.25, footwear: 0.15, accessory: 0.05 };
    var warmth = 0, breath = 0, rain = 0, wind = 0, wsum = 0;
    items.forEach(function (item) {
      var c = comfortFor(item.subtype);
      var w = visible[item.slot] || 0.05;
      warmth += (c.warmth || 0) * w;
      breath += (c.breathability == null ? 0.55 : c.breathability) * w;
      rain = Math.max(rain, c.rain || 0);
      wind = Math.max(wind, c.wind || 0);
      wsum += w;
    });
    warmth = warmth / (wsum || 1);
    breath = breath / (wsum || 1);

    var warmthFit = 1 - Math.min(1, Math.abs(warmth - profile.targetWarmth) / 3.2);
    var heatFit = 1 - profile.heat * Math.max(0, 0.72 - breath);
    var rainFit = profile.rain ? (0.35 + 0.65 * rain) : 1;
    var windFit = profile.wind ? (0.45 + 0.55 * wind) : 1;
    return clamp01(0.45 * warmthFit + 0.25 * heatFit + 0.20 * rainFit + 0.10 * windFit);
  }

  function weatherNote(items, weatherKey) {
    var profile = WEATHER_PROFILES[weatherKey] || WEATHER_PROFILES.mild;
    var score = outfitWeatherScore(items, weatherKey);
    if (score >= 0.78) return 'Weather: works for ' + profile.label.toLowerCase() + ' conditions.';
    if (weatherKey === 'rainy') return 'Weather: consider stronger rain footwear or a weather layer.';
    if (weatherKey === 'hot' || weatherKey === 'humid') return 'Weather: this may run warm; breathable pieces are safer.';
    if (weatherKey === 'cold' || weatherKey === 'windy') return 'Weather: add a stronger layer if you will be outside.';
    return 'Weather: acceptable, but not the strongest match for ' + profile.label.toLowerCase() + '.';
  }

  global.Knowledge = {
    HUE_SPOKES: HUE_SPOKES,
    NEUTRALS: NEUTRALS,
    GARMENTS: GARMENTS,
    FIT_LEVELS: FIT_LEVELS,
    FORMALITY_LABELS: FORMALITY_LABELS,
    WEATHER_PROFILES: WEATHER_PROFILES,
    SUBTYPE_COMFORT: SUBTYPE_COMFORT,
    BRAND_TIERS: BRAND_TIERS,
    hueToFamily: hueToFamily,
    familyHue: familyHue,
    angularDist: angularDist,
    isNeutralName: isNeutralName,
    garmentFormality: garmentFormality,
    brandTier: brandTier,
    comfortFor: comfortFor,
    outfitWeatherScore: outfitWeatherScore,
    weatherNote: weatherNote
  };
})(window);
