/* ============================================================================
 * vastu.js  —  SUBAGENT 5: the Culture / Jyotish (Hindu astrology) Expert
 * ----------------------------------------------------------------------------
 * Traditional Hindu practice associates each weekday with a planet (graha) and
 * a set of auspicious colours. This module returns, for a given date, the
 * ruling planet, its recommended colours, and colours to go easy on — then
 * scores how well a garment's colour family aligns.
 *
 * Vaara (weekday) → Graha (planet) → Varna (colour) mapping used widely in
 * jyotish / vaastu tradition:
 *   Sunday    Surya   (Sun)      warm reds, orange, gold, saffron
 *   Monday    Chandra (Moon)     white, cream, silver, pale blue
 *   Tuesday   Mangal  (Mars)     red, coral, crimson
 *   Wednesday Budh    (Mercury)  green, teal, olive
 *   Thursday  Guru    (Jupiter)  yellow, gold, saffron, cream
 *   Friday    Shukra  (Venus)    white, pink, pastels, floral tones
 *   Saturday  Shani   (Saturn)   blue, navy, black, deep purple
 *
 * This is offered as optional, respectful cultural guidance — a gentle nudge in
 * the score, never a hard filter. The user can turn its weight to zero.
 * ========================================================================== */
(function (global) {
  'use strict';

  var DAYS = [
    { day: 'Sunday',    planet: 'Surya (Sun)',      sanskrit: 'Ravivara',
      colors: ['red', 'orange', 'amber', 'gold', 'saffron'],
      families: ['red', 'orange', 'amber'],
      avoid: ['black'],
      note: 'Ruled by the Sun — warm, radiant tones bring vitality and confidence.' },
    { day: 'Monday',    planet: 'Chandra (Moon)',   sanskrit: 'Somavara',
      colors: ['white', 'ivory', 'silver', 'pale blue'],
      families: ['white', 'ivory', 'grey'],
      avoid: ['black'],
      note: 'Ruled by the Moon — soft whites and silvers bring calm and clarity.' },
    { day: 'Tuesday',   planet: 'Mangal (Mars)',    sanskrit: 'Mangalavara',
      colors: ['red', 'coral', 'crimson'],
      families: ['red', 'pink'],
      avoid: [],
      note: 'Ruled by Mars — reds channel energy, courage and drive.' },
    { day: 'Wednesday', planet: 'Budh (Mercury)',   sanskrit: 'Budhavara',
      colors: ['green', 'teal', 'olive'],
      families: ['green', 'teal', 'lime', 'olive'],
      avoid: [],
      note: 'Ruled by Mercury — greens sharpen intellect and communication.' },
    { day: 'Thursday',  planet: 'Guru (Jupiter)',   sanskrit: 'Guruvara',
      colors: ['yellow', 'gold', 'saffron', 'cream'],
      families: ['yellow', 'amber'],
      avoid: [],
      note: 'Ruled by Jupiter — yellows invite wisdom, growth and fortune.' },
    { day: 'Friday',    planet: 'Shukra (Venus)',   sanskrit: 'Shukravara',
      colors: ['white', 'pink', 'pastel', 'light blue'],
      families: ['white', 'pink', 'ivory'],
      avoid: [],
      note: 'Ruled by Venus — whites and pinks bring charm, love and beauty.' },
    { day: 'Saturday',  planet: 'Shani (Saturn)',   sanskrit: 'Shanivara',
      colors: ['blue', 'navy', 'black', 'deep purple'],
      families: ['blue', 'navy', 'indigo', 'black', 'purple'],
      avoid: [],
      note: 'Ruled by Saturn — deep blues and blacks bring discipline and focus.' }
  ];

  // Parse 'YYYY-MM-DD' as a LOCAL date (not UTC) so the weekday is correct in
  // every timezone; pass Dates through unchanged.
  function toLocalDate(date) {
    if (date instanceof Date) return date;
    if (typeof date === 'string') {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    }
    return new Date(date);
  }

  function forDate(date) {
    return DAYS[toLocalDate(date).getDay()];
  }

  // 0..1 alignment for a garment colour family on a given date.
  function alignment(family, date) {
    var info = forDate(date);
    if (info.families.indexOf(family) !== -1) return 1;      // ideal colour
    if (info.avoid.indexOf(family) !== -1) return 0.15;      // discouraged
    if (global.Knowledge.isNeutralName(family)) return 0.7;  // neutrals are always fine
    return 0.5;                                              // neutral-ish / off-theme
  }

  // Score a whole outfit's alignment (weights the most visible pieces).
  function outfitAlignment(items, date) {
    var weights = { top: 0.45, bottom: 0.30, layer: 0.15, footwear: 0.10 };
    var s = 0, w = 0;
    items.forEach(function (i) {
      var ww = weights[i.slot] || 0.05;
      s += alignment(i.family, date) * ww; w += ww;
    });
    return w ? s / w : 0.5;
  }

  global.Vastu = {
    forDate: forDate,
    toLocalDate: toLocalDate,
    alignment: alignment,
    outfitAlignment: outfitAlignment,
    DAYS: DAYS
  };
})(window);
