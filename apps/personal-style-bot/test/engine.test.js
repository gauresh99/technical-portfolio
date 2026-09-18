/* ============================================================================
 * engine.test.js  —  headless verification of the pure logic engines.
 *   run:  node test/engine.test.js
 *
 * The engines attach themselves to `window`; in Node we alias window->global
 * and stub the tiny DB.Profile the RL model persists through. The DOM-bound
 * pieces (cv.js image decode, tryon.js, app.js) are exercised in the browser,
 * not here — this covers Knowledge / Fashion / Mood / Vastu / RL / Recommender.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

// --- shim the browser globals the engines expect --------------------------
global.window = global;
const mem = {};
global.DB = {
  uid: (p) => (p || 'g') + '_' + Math.random().toString(36).slice(2, 8),
  Profile: {
    get: (k, f) => Promise.resolve(mem[k] !== undefined ? mem[k] : f),
    set: (k, v) => { mem[k] = v; return Promise.resolve(); }
  }
};

function load(rel) {
  const code = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
}
['data/knowledge.js', 'js/cv.js', 'js/localml.js', 'js/fashion.js', 'js/mood.js', 'js/vastu.js',
 'js/rl.js', 'js/recommender.js'].forEach(load);

// --- tiny test harness ----------------------------------------------------
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  -> ' + extra : '')); }
}
function approx(a, b, eps) { return Math.abs(a - b) <= (eps || 0.001); }
function section(t) { console.log('\n' + t); }

// helper to build a garment "view" the fashion engine consumes
function view(slot, family, opts) {
  opts = opts || {};
  return Object.assign({
    id: DB.uid(), slot, family,
    hsl: opts.hsl || [0, 0.6, 0.5], pattern: opts.pattern || 0,
    brightness: opts.brightness != null ? opts.brightness : 128,
    fit: opts.fit || 'regular', formality: opts.formality != null ? opts.formality : 2,
    brand: opts.brand, subtype: opts.subtype || slot, name: opts.name || slot
  }, opts.extra || {});
}

function analysis(family, opts) {
  opts = opts || {};
  return {
    primaryFamily: family,
    brightness: opts.brightness != null ? opts.brightness : 128,
    pattern: opts.pattern || 0,
    colors: [{ family, hsl: opts.hsl || [0, 0.5, 0.5], hex: '#888', share: 1 }],
    geometry: {
      coverage: opts.coverage != null ? opts.coverage : 0.7,
      aspect: opts.aspect != null ? opts.aspect : 0.8,
      widthShare: opts.widthShare != null ? opts.widthShare : 0.7,
      heightShare: opts.heightShare != null ? opts.heightShare : 0.8
    }
  };
}

/* ========================= 1. FASHION ENGINE ============================= */
section('Fashion engine — colour harmony');
{
  const F = window.Fashion;
  const neutralPair = F.colorPair({ family: 'white', hsl: [0, 0, 0.95] },
                                  { family: 'navy', hsl: [0.6, 0.5, 0.2] });
  ok('white + navy scores high (neutral anchor)', neutralPair.score >= 0.85, neutralPair.score);

  const clash = F.colorPair({ family: 'orange', hsl: [0.08, 0.9, 0.5] },
                            { family: 'green', hsl: [0.33, 0.9, 0.45] });
  ok('vivid orange + vivid green flagged as weaker', clash.score <= 0.6, clash.score);

  const mono = F.colorPair({ family: 'blue', hsl: [0.6, 0.6, 0.3] },
                           { family: 'blue', hsl: [0.6, 0.6, 0.6] });
  ok('monochrome blue with contrast is refined', mono.score >= 0.8, mono.score);
}

section('Fashion engine — fit / proportion balance (the brief\'s rule)');
{
  const F = window.Fashion;
  const tightLoose = F.fitBalance('slim', 'baggy');   // tight top + very loose bottom
  ok('slim top + baggy bottom is penalised', tightLoose.score <= 0.4, tightLoose.score);
  const balanced = F.fitBalance('fitted', 'relaxed'); // one fitted, one relaxed
  ok('fitted top + relaxed bottom is rewarded', balanced.score >= 0.85, balanced.score);
  const baggyBaggy = F.fitBalance('baggy', 'baggy');
  ok('baggy + baggy is shapeless (low)', baggyBaggy.score <= 0.4, baggyBaggy.score);
}

section('Fashion engine — pattern clash');
{
  const F = window.Fashion;
  const twoPatterns = F.patternPair({ pattern: 0.6 }, { pattern: 0.6 });
  ok('two loud patterns clash', twoPatterns.score <= 0.45, twoPatterns.score);
  const patternSolid = F.patternPair({ pattern: 0.6 }, { pattern: 0.05 });
  ok('pattern + solid is clean', patternSolid.score >= 0.8, patternSolid.score);
}

section('Fashion engine — full outfit score');
{
  const good = window.Fashion.scoreOutfit([
    view('top', 'white', { fit: 'fitted', formality: 3, hsl: [0, 0, 0.9], brightness: 230 }),
    view('bottom', 'navy', { fit: 'regular', formality: 3, hsl: [0.6, 0.5, 0.22], brightness: 60 }),
    view('footwear', 'white', { fit: null, formality: 2, hsl: [0, 0, 0.9], brightness: 230 })
  ]);
  ok('clean white/navy look scores well', good.score >= 0.75, good.score);
  ok('outfit returns human reasons', Array.isArray(good.reasons) && good.reasons.length > 0);
  ok('outfit returns clickable scorecard data', Array.isArray(good.scorecards) && good.scorecards.length >= 5);
}

section('Fashion engine — shoes and denim compatibility');
{
  const baggyDenim = view('bottom', 'denim', { fit: 'baggy', subtype: 'jeans' });
  const sneakers = view('footwear', 'white', { subtype: 'sneakers' });
  const oxfords = view('footwear', 'black', { subtype: 'oxford-shoes' });
  const sneakerScore = window.Fashion.footwearSystem([baggyDenim, sneakers]).score;
  const oxfordScore = window.Fashion.footwearSystem([baggyDenim, oxfords]).score;
  ok('baggy denim scores better with substantial sneakers than formal oxfords',
     sneakerScore > oxfordScore, sneakerScore + ' vs ' + oxfordScore);
}

/* ========================= 2. MOOD ENGINE =============================== */
section('Behaviour engine — mood + intent -> targets');
{
  const M = window.Mood;
  const sharp = M.resolve('sharp', 'confident');
  const relaxed = M.resolve('relaxed', 'lazy');
  ok('"going out" wants higher formality than "relaxed"', sharp.formality > relaxed.formality,
     sharp.formality + ' vs ' + relaxed.formality);
  ok('"going out" wants a more fitted silhouette', sharp.fitBias < relaxed.fitBias,
     sharp.fitBias + ' vs ' + relaxed.fitBias);
  ok('"going out" leans on higher brand tier', sharp.brandTierPref > relaxed.brandTierPref);
  ok('confident mood raises boldness', sharp.boldness > M.resolve('sharp', 'calm').boldness);
  ok('target ships a human summary', typeof sharp.summary === 'string' && sharp.summary.length > 10);

  // garment affinity respects the target
  const fittedElevated = view('top', 'white', { fit: 'fitted', formality: 4, brand: 'ami' });
  const baggyComfort = view('top', 'grey', { fit: 'baggy', formality: 1, brand: 'decathlon' });
  ok('elevated fitted top matches "going out" better than baggy comfort tee',
     M.garmentAffinity(fittedElevated, sharp) > M.garmentAffinity(baggyComfort, sharp));
  ok('baggy comfort tee matches "relaxed" better than elevated top',
     M.garmentAffinity(baggyComfort, relaxed) > M.garmentAffinity(fittedElevated, relaxed));
}

/* ========================= 3. VASTU ENGINE ============================= */
section('Culture/Vastu engine — planetary day colours');
{
  const V = window.Vastu;
  // pass date strings exactly as the app does; the engine parses them as LOCAL
  // dates so the weekday is timezone-stable.
  const wed = '2026-07-22'; // Wednesday (Budh/Mercury -> green)
  ok('Wednesday maps to Mercury', V.forDate(wed).planet.indexOf('Mercury') !== -1,
     V.forDate(wed).planet);
  ok('green is auspicious on Wednesday', V.alignment('green', wed) === 1);
  ok('off-theme colour scores lower than the ideal on Wednesday',
     V.alignment('red', wed) < V.alignment('green', wed));
  ok('neutrals are always acceptable', V.alignment('white', wed) >= 0.7);
  const sat = '2026-07-25'; // Saturday (Shani -> blue/black)
  ok('Saturday favours blue', V.alignment('blue', sat) === 1);
}

/* ========================= 4. WEATHER / LOCAL ML ======================= */
section('Local context engine — weather comfort');
{
  const hotGood = window.Knowledge.outfitWeatherScore([
    view('top', 'white', { subtype: 'tank' }),
    view('bottom', 'beige', { subtype: 'shorts' }),
    view('footwear', 'tan', { subtype: 'sandals' })
  ], 'hot');
  const hotBad = window.Knowledge.outfitWeatherScore([
    view('top', 'grey', { subtype: 'sweater' }),
    view('bottom', 'denim', { subtype: 'jeans' }),
    view('footwear', 'brown', { subtype: 'boots' })
  ], 'hot');
  ok('hot weather rewards breathable outfits', hotGood > hotBad, hotGood + ' vs ' + hotBad);

  const rainGood = window.Knowledge.outfitWeatherScore([
    view('top', 'blue', { subtype: 't-shirt' }),
    view('layer', 'navy', { subtype: 'windbreaker' }),
    view('bottom', 'denim', { subtype: 'jeans' }),
    view('footwear', 'brown', { subtype: 'boots' })
  ], 'rainy');
  const rainBad = window.Knowledge.outfitWeatherScore([
    view('top', 'white', { subtype: 't-shirt' }),
    view('bottom', 'beige', { subtype: 'shorts' }),
    view('footwear', 'tan', { subtype: 'sandals' })
  ], 'rainy');
  ok('rainy weather rewards weather layers and boots', rainGood > rainBad, rainGood + ' vs ' + rainBad);
}

section('Local garment model — trains without APIs');
{
  const L = window.LocalML;
  const garments = [
    { id: 'top1', category: 'top', subtype: 't-shirt', fit: 'regular',
      analysis: analysis('white', { aspect: 0.65, hsl: [0, 0, 0.9] }) },
    { id: 'top2', category: 'top', subtype: 't-shirt', fit: 'regular',
      analysis: analysis('grey', { aspect: 0.68, hsl: [0, 0, 0.5] }) },
    { id: 'top3', category: 'top', subtype: 't-shirt', fit: 'regular',
      analysis: analysis('blue', { aspect: 0.7, hsl: [0.6, 0.5, 0.45] }) },
    { id: 'shoe1', category: 'footwear', subtype: 'sneakers', fit: '',
      analysis: analysis('white', { aspect: 2.1, heightShare: 0.35 }) },
    { id: 'shoe2', category: 'footwear', subtype: 'sneakers', fit: '',
      analysis: analysis('black', { aspect: 2.2, heightShare: 0.34 }) },
    { id: 'shoe3', category: 'footwear', subtype: 'sneakers', fit: '',
      analysis: analysis('navy', { aspect: 2.0, heightShare: 0.36 }) }
  ];
  const model = L.train(garments);
  const pred = L.predict(analysis('black', { aspect: 2.15, heightShare: 0.35 }), model);
  ok('local model trains on saved garments', model.n === 6, model.n);
  ok('local model predicts a similar footwear upload', pred.category.label === 'footwear',
     pred.category && pred.category.label);
  ok('local model reports evaluation metrics', model.metrics && model.metrics.ready);
}

section('Computer vision — worn outfit region colors');
{
  const w = 80, h = 140;
  const data = new Uint8ClampedArray(w * h * 4);
  function px(x, y, r, g, b) {
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) px(x, y, 245, 244, 238);
  }
  // head
  for (let y = 8; y < 28; y++) for (let x = 32; x < 48; x++) px(x, y, 186, 128, 91);
  // red worn t-shirt
  for (let y = 30; y < 72; y++) for (let x = 24; x < 56; x++) px(x, y, 170, 22, 42);
  // arms
  for (let y = 36; y < 70; y++) { for (let x = 16; x < 24; x++) px(x, y, 186, 128, 91); for (let x = 56; x < 64; x++) px(x, y, 186, 128, 91); }
  // blue denim
  for (let y = 72; y < 122; y++) { for (let x = 26; x < 39; x++) px(x, y, 50, 78, 112); for (let x = 42; x < 55; x++) px(x, y, 50, 78, 112); }
  // brown footwear
  for (let y = 122; y < 132; y++) { for (let x = 22; x < 39; x++) px(x, y, 82, 48, 26); for (let x = 42; x < 59; x++) px(x, y, 82, 48, 26); }

  const a = window.CV.analyzePixels(data, w, h);
  ok('worn-photo CV detects person segmentation mode', a.segmentationMode === 'worn-person', a.segmentationMode);
  ok('worn-photo CV reads t-shirt region, not skin/background',
     a.articleCandidates.top.primaryFamily === 'red', a.articleCandidates.top.primaryFamily);
  ok('worn-photo CV returns bottomwear candidate',
     ['denim', 'blue', 'navy'].includes(a.articleCandidates.bottom.primaryFamily),
     a.articleCandidates.bottom.primaryFamily);
  ok('worn-photo CV returns footwear candidate',
     ['brown', 'black'].includes(a.articleCandidates.footwear.primaryFamily),
     a.articleCandidates.footwear.primaryFamily);
}

/* ========================= 5. RL ENGINE =============================== */
section('Reinforcement learner — taste model updates');
(async () => {
  const RL = window.RL;
  await RL.load();
  const ctx = 'sharp';
  const feats = { colorHarmony: 0.9, fitBalance: 0.9, formalityMatch: 0.9, boldness: 0.8,
                  vastuAlign: 0.5, brandFit: 0.8, novelty: 0.7, patternSafety: 0.9 };
  const before = RL.predict(ctx, feats);
  // reward this style highly several times
  for (let i = 0; i < 8; i++) await RL.update(ctx, feats, 5);
  const after = RL.predict(ctx, feats);
  ok('rewarding a look raises its predicted preference', after > before,
     before.toFixed(3) + ' -> ' + after.toFixed(3));

  // punish a different profile and check its weight drops
  const bad = { colorHarmony: 0.2, fitBalance: 0.2, formalityMatch: 0.2, boldness: 0.9,
                vastuAlign: 0.3, brandFit: 0.2, novelty: 0.2, patternSafety: 0.2 };
  const bBefore = RL.predict(ctx, bad);
  for (let i = 0; i < 8; i++) await RL.update(ctx, bad, 1);
  const bAfter = RL.predict(ctx, bad);
  ok('penalising a look lowers its predicted preference', bAfter < bBefore,
     bBefore.toFixed(3) + ' -> ' + bAfter.toFixed(3));

  const w = RL.weightsFor(ctx);
  ok('weights persisted with a training count', w && w.n === 16, w && w.n);

  /* ===================== 6. RECOMMENDER (end to end) ================== */
  section('Recommender — end to end incl. the 3-day rule');
  const R = window.Recommender;

  // wardrobe: 4 tops, 2 bottoms, footwear, a layer
  function g(cat, sub, family, opts) {
    opts = opts || {};
    return {
      id: DB.uid(), category: cat, subtype: sub, colorFamily: family,
      fit: opts.fit || 'regular', brand: opts.brand,
      formality: opts.formality != null ? opts.formality : 2,
      available: true, createdAt: Date.now(),
      analysis: { colors: [{ family, hsl: opts.hsl || [0, 0.5, 0.5], hex: '#888' }],
                  brightness: opts.brightness != null ? opts.brightness : 128,
                  pattern: opts.pattern || 0 }
    };
  }
  const wardrobe = [
    g('top', 't-shirt', 'white', { fit: 'fitted', formality: 1, hsl: [0, 0, 0.9], brightness: 235, name: 'white tee' }),
    g('top', 'oxford-shirt', 'navy', { fit: 'regular', formality: 3, hsl: [0.6, 0.5, 0.25], brightness: 60, name: 'navy oxford' }),
    g('top', 't-shirt', 'olive', { fit: 'relaxed', formality: 1, hsl: [0.2, 0.4, 0.4], brightness: 90, name: 'olive tee' }),
    g('top', 'polo', 'black', { fit: 'fitted', formality: 2, hsl: [0, 0, 0.1], brightness: 25, name: 'black polo' }),
    g('bottom', 'jeans', 'denim', { fit: 'regular', formality: 2, hsl: [0.6, 0.3, 0.4], brightness: 90, name: 'blue jeans' }),
    g('bottom', 'chinos', 'beige', { fit: 'regular', formality: 3, hsl: [0.1, 0.3, 0.7], brightness: 180, name: 'beige chinos' }),
    g('footwear', 'white-sneakers', 'white', { formality: 2, hsl: [0, 0, 0.9], brightness: 235, name: 'white sneakers' }),
    g('layer', 'blazer', 'navy', { formality: 4, hsl: [0.6, 0.5, 0.2], brightness: 55, name: 'navy blazer' })
  ];

  const noLog = [];
  const rec1 = R.recommend(wardrobe, noLog, { intent: 'smart-casual', date: '2026-07-22' });
  ok('recommender returns ranked outfits', rec1.recommendations.length > 0, rec1.recommendations.length);
  ok('each outfit has an explanation from every expert',
     rec1.recommendations[0].explanation.length >= 3);
  ok('each outfit has a learned + stylist score',
     typeof rec1.recommendations[0].score === 'number' &&
     typeof rec1.recommendations[0].stylistScore === 'number');
  ok('recommendations include local context features',
     typeof rec1.recommendations[0].features.weatherFit === 'number' &&
     typeof rec1.recommendations[0].features.repeatSafety === 'number' &&
     typeof rec1.recommendations[0].features.accessoryFit === 'number');

  // now log the white tee as worn today -> should be blocked for 3 days
  const whiteTeeId = wardrobe[0].id;
  const wearlog = [{ date: '2026-07-22', items: [whiteTeeId] }];
  const rec2 = R.recommend(wardrobe, wearlog, { intent: 'smart-casual', date: '2026-07-23' });
  const usesWhiteTee = rec2.recommendations.some(r => r.items.some(i => i.id === whiteTeeId));
  ok('3-day rule: white tee worn yesterday is NOT recommended today', !usesWhiteTee);
  ok('3-day rule reports how many tops were blocked', rec2.blockedByRule >= 1, rec2.blockedByRule);

  // 4 days later it becomes eligible again
  const rec3 = R.recommend(wardrobe, wearlog, { intent: 'smart-casual', date: '2026-07-26' });
  const eligibleAgain = R.daysSinceWorn(whiteTeeId, wearlog, new Date('2026-07-26')) >= R.RECENT_DAYS;
  ok('white tee is eligible again after 3+ days', eligibleAgain);

  // going-out intent should skew toward the more formal pieces
  const recSharp = R.recommend(wardrobe, noLog, { intent: 'sharp', date: '2026-07-22', vastuWeight: 0.1 });
  const meanFormTop = recSharp.recommendations[0].items
      .filter(i => i.slot === 'top')
      .map(i => wardrobe.find(w => w.id === i.id).formality)[0];
  ok('"going out" tends to pick a dressier top (formality >= 2)', meanFormTop >= 2, meanFormTop);

  // vastu influence: on Wednesday, boosting vastuWeight should be able to surface olive/green
  const recVastu = R.recommend(wardrobe, noLog, { intent: 'relaxed', date: '2026-07-22', vastuWeight: 0.5 });
  ok('vastu-weighted Wednesday reco runs and returns looks', recVastu.recommendations.length > 0);

  const moodCloset = [
    g('top', 't-shirt', 'blue', { fit: 'oversized', formality: 1, hsl: [0.61, 0.55, 0.45], brightness: 95, name: 'oversized blue tee' }),
    g('top', 'polo', 'black', { fit: 'fitted', formality: 2, hsl: [0, 0, 0.1], brightness: 25, name: 'fitted black polo' }),
    g('bottom', 'jeans', 'denim', { fit: 'regular', formality: 2, hsl: [0.6, 0.3, 0.4], brightness: 90, name: 'straight jeans' }),
    g('footwear', 'sneakers', 'white', { formality: 2, hsl: [0, 0, 0.9], brightness: 235, name: 'white sneakers' })
  ];
  const lazy = R.recommend(moodCloset, [], { intent: 'smart-casual', mood: 'lazy', date: '2026-07-22', epsilon: 0 }).recommendations[0];
  const confident = R.recommend(moodCloset, [], { intent: 'smart-casual', mood: 'confident', date: '2026-07-22', epsilon: 0 }).recommendations[0];
  const lazyTop = lazy.items.find(i => i.slot === 'top').subtype + '|' + lazy.items.find(i => i.slot === 'top').fit;
  const confidentTop = confident.items.find(i => i.slot === 'top').subtype + '|' + confident.items.find(i => i.slot === 'top').fit;
  ok('same intent but different moods can produce different top choices', lazyTop !== confidentTop,
     lazyTop + ' vs ' + confidentTop);

  // ---- summary ----
  console.log('\n----------------------------------------');
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  console.log('----------------------------------------');
  process.exit(fail ? 1 : 0);
})();
