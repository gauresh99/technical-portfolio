/* ============================================================================
 * cv.js  —  Computer-vision analysis of a garment photo (from scratch)
 * ----------------------------------------------------------------------------
 * No external ML library. Everything is done on a <canvas> from raw pixels:
 *
 *   1. Downscale the photo to a small working buffer (fast, denoises).
 *   2. Background suppression: sample the 4 corners; pixels close to the corner
 *      colour are treated as background and dropped. This isolates the garment
 *      in typical "flat-lay / hung on a wall" shots.
 *   3. Dominant colours: bucket remaining pixels into a coarse RGB grid and
 *      report the largest buckets -> converted to HSL, a family name, and hex.
 *   4. Brightness: mean luma of garment pixels -> light / mid / dark.
 *   5. Pattern score: normalised local contrast (neighbour luma variance).
 *      Low = solid, high = patterned/printed/striped. This drives the
 *      "pattern clash" rule in the fashion engine.
 *
 * These are honest, deterministic signals. Garment *type* is confirmed by the
 * user in the add form (auto-suggested from the active tab) — image-only type
 * classification is unreliable without a trained model, so we keep a human in
 * the loop for that one field and let CV nail colour / pattern / brightness.
 * ========================================================================== */
(function (global) {
  'use strict';

  var WORK = 128; // working edge length in px; region CV needs a little detail

  function analyzeImage(imgOrBlobUrl) {
    return loadImage(imgOrBlobUrl).then(function (img) {
      var scale = WORK / Math.max(img.width, img.height);
      var w = Math.max(1, Math.round(img.width * scale));
      var h = Math.max(1, Math.round(img.height * scale));
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      var data = ctx.getImageData(0, 0, w, h).data;
      var analysis = analyzePixels(data, w, h);
      analysis.source = {
        width: img.width,
        height: img.height,
        aspect: img.height ? img.width / img.height : 1
      };
      return analysis;
    });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function analyzePixels(data, w, h) {
    // --- background colour estimate from the four corners ---
    var corners = [
      idx(0, 0, w), idx(w - 1, 0, w),
      idx(0, h - 1, w), idx(w - 1, h - 1, w)
    ];
    var bg = [0, 0, 0];
    for (var c = 0; c < corners.length; c++) {
      bg[0] += data[corners[c]]; bg[1] += data[corners[c] + 1]; bg[2] += data[corners[c] + 2];
    }
    bg[0] /= 4; bg[1] /= 4; bg[2] /= 4;

    var lumaGrid = new Float32Array(w * h); // for pattern analysis
    var bgMask = new Uint8Array(w * h);

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = idx(x, y, w);
        var r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        lumaGrid[y * w + x] = lum;
        bgMask[y * w + x] = a < 40 || colorDist(r, g, b, bg[0], bg[1], bg[2]) < 36 ? 1 : 0;
      }
    }

    var wholeStats = collectRegion(data, w, h, lumaGrid, bgMask, function (x, y) {
      return !bgMask[y * w + x];
    }, { excludeSkin: false, fallbackAll: false });

    // Fallback: if background suppression removed nearly everything (garment
    // fills the frame and matches corners), redo without suppression.
    if (wholeStats.count < (w * h) * 0.05) {
      return analyzeNoBg(data, w, h, lumaGrid);
    }

    var bbox = wholeStats.bounds;
    var whole = statsToAnalysis(wholeStats, 'whole', 'whole-photo');
    // Person requires BOTH a tall/narrow silhouette AND real person structure
    // (visible skin, or a top half whose colour differs from the bottom half).
    // This stops a single tall garment (e.g. jeans laid out vertically) from
    // being mistaken for a body and sliced into top/bottom/footwear bands.
    var personLike = isPersonLike(whole.geometry) &&
      hasPersonStructure(data, w, h, bbox, bgMask);
    var candidates = {};
    var categoryHints = {};

    if (personLike) {
      candidates.top = wornRegion(data, w, h, lumaGrid, bgMask, bbox, 'top', 0.16, 0.48, 0.34, 0.66);
      candidates.bottom = wornRegion(data, w, h, lumaGrid, bgMask, bbox, 'bottom', 0.55, 0.82, 0.36, 0.64);
      candidates.footwear = wornRegion(data, w, h, lumaGrid, bgMask, bbox, 'footwear', 0.86, 1.0, 0.30, 0.70);
      categoryHints.top = candidates.top.confidence;
      categoryHints.bottom = candidates.bottom.confidence;
      categoryHints.footwear = candidates.footwear.confidence;
      whole = mergeAnalysis(whole, bestCandidate(candidates, 'top'));
      whole.segmentationMode = 'worn-person';
    } else {
      var flat = inferFlatCategory(whole);
      candidates[flat.category] = mergeAnalysis(whole, {
        focus: flat.category,
        confidence: flat.confidence,
        mode: 'flat-lay'
      });
      categoryHints[flat.category] = flat.confidence;
      whole.segmentationMode = 'flat-lay';
    }

    // Guess a specific garment type per candidate region (t-shirt vs shirt,
    // jeans vs trousers vs chinos vs shorts, sneakers vs boots, …).
    Object.keys(candidates).forEach(function (cat) {
      var gs = guessSubtype(candidates[cat], cat);
      if (gs) {
        candidates[cat].suggestedSubtype = gs.subtype;
        candidates[cat].suggestedSubtypeConfidence = gs.confidence;
        candidates[cat].subtypeReason = gs.reason;
      }
    });

    whole.articleCandidates = candidates;
    whole.categoryHints = categoryHints;
    whole.suggestedCategory = topHint(categoryHints) || 'top';
    whole.suggestedCategoryConfidence = categoryHints[whole.suggestedCategory] || 0;
    var sc = candidates[whole.suggestedCategory];
    whole.suggestedSubtype = (sc && sc.suggestedSubtype) || null;
    whole.suggestedSubtypeConfidence = (sc && sc.suggestedSubtypeConfidence) || 0;
    whole.subtypeReason = (sc && sc.subtypeReason) || null;
    return whole;
  }

  /* ---- garment TYPE understanding ------------------------------------------
   * Deterministic, honest heuristics over the region's own colour, pattern and
   * geometry. The strongest signal is denim: a blue, mid-saturation, mid-dark
   * bottom is jeans; a light cotton bottom is chinos; a dark structured bottom
   * is trousers; a wide/short bottom is shorts. Tops are harder from pixels
   * alone, so their subtype guess is low-confidence and the user/model confirm.*/
  function guessSubtype(a, category) {
    if (!a) return null;
    var fam = a.primaryFamily, geo = a.geometry || {}, pat = a.pattern || 0;
    var hsl = (a.colors && a.colors[0] && a.colors[0].hsl) || [0, 0, 0.5];

    if (category === 'bottom') {
      if (isDenimLike(fam, hsl)) return sub('jeans', 0.82, 'blue denim colour + tone reads as jeans');
      if (geo.aspect > 1.3) return sub('shorts', 0.55, 'wide, short shape reads as shorts');
      if (fam === 'beige' || fam === 'tan' || fam === 'ivory' || fam === 'grey')
        return sub('chinos', 0.55, 'light cotton colour reads as chinos');
      if (fam === 'olive' || fam === 'green' || fam === 'brown')
        return sub('cargos', 0.45, 'utility earth tone reads as cargos/chinos');
      if (fam === 'black' || fam === 'charcoal' || fam === 'navy')
        return sub('trousers', 0.5, 'dark structured colour reads as trousers');
      return sub('trousers', 0.35, 'non-denim bottom — defaulting to trousers');
    }
    if (category === 'top') {
      if (pat >= 0.42) return sub('casual-shirt', 0.42, 'patterned/textured fabric reads as a shirt');
      return sub('t-shirt', 0.4, 'solid casual top — defaulting to t-shirt');
    }
    if (category === 'layer') {
      if (isDenimLike(fam, hsl)) return sub('denim-jacket', 0.5, 'denim colour reads as a denim jacket');
      return sub('overshirt', 0.32, 'outer layer — confirm the exact type');
    }
    if (category === 'footwear') {
      if (fam === 'white' || fam === 'ivory') return sub('white-sneakers', 0.55, 'white/bright reads as sneakers');
      if (fam === 'black' || fam === 'charcoal' || fam === 'brown')
        return sub('boots', 0.4, 'dark leather tone — boots or derbies');
      return sub('sneakers', 0.45, 'casual footwear — defaulting to sneakers');
    }
    return null;
  }

  function isDenimLike(fam, hsl) {
    if (fam === 'denim') return true;
    // blue-ish, not too saturated, mid-to-dark: classic indigo/washed denim
    var h = (hsl[0] || 0) * 360, s = hsl[1] || 0, l = hsl[2] == null ? 0.5 : hsl[2];
    return h >= 195 && h <= 255 && s >= 0.12 && s <= 0.62 && l >= 0.18 && l <= 0.62;
  }

  function sub(subtype, confidence, reason) {
    return { subtype: subtype, confidence: confidence, reason: reason };
  }

  function analyzeNoBg(data, w, h, lumaGrid) {
    var buckets = {}, lumaSum = 0, lumaN = 0;
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var key = (r >> 5) + '-' + (g >> 5) + '-' + (b >> 5);
      var bk = buckets[key] || (buckets[key] = { count: 0, r: 0, g: 0, b: 0 });
      bk.count++; bk.r += r; bk.g += g; bk.b += b;
      lumaSum += 0.2126 * r + 0.7152 * g + 0.0722 * b; lumaN++;
    }
    var colors = topBuckets(buckets, 3);
    var pattern = patternScore(lumaGrid, w, h, null, data);
    var whole = decorate(colors, lumaSum / lumaN, pattern, {
      coverage: 1,
      aspect: w / h,
      widthShare: 1,
      heightShare: 1
    });
    var flat = inferFlatCategory(whole);
    whole.articleCandidates = {};
    whole.articleCandidates[flat.category] = mergeAnalysis(whole, {
      focus: flat.category,
      confidence: flat.confidence,
      mode: 'full-frame'
    });
    whole.categoryHints = {};
    whole.categoryHints[flat.category] = flat.confidence;
    whole.suggestedCategory = flat.category;
    whole.suggestedCategoryConfidence = flat.confidence;
    var gs = guessSubtype(whole.articleCandidates[flat.category], flat.category);
    if (gs) {
      whole.articleCandidates[flat.category].suggestedSubtype = gs.subtype;
      whole.articleCandidates[flat.category].suggestedSubtypeConfidence = gs.confidence;
      whole.articleCandidates[flat.category].subtypeReason = gs.reason;
      whole.suggestedSubtype = gs.subtype;
      whole.suggestedSubtypeConfidence = gs.confidence;
      whole.subtypeReason = gs.reason;
    }
    whole.segmentationMode = 'full-frame';
    return whole;
  }

  function decorate(colors, brightness, pattern, geometry) {
    var primary = colors[0] || { r: 128, g: 128, b: 128 };
    var hsl = rgbToHsl(primary.r, primary.g, primary.b);
    return {
      colors: colors.map(function (col) {
        var h = rgbToHsl(col.r, col.g, col.b);
        return {
          hex: rgbToHex(col.r, col.g, col.b),
          rgb: [Math.round(col.r), Math.round(col.g), Math.round(col.b)],
          hsl: h,
          family: colorFamily(h),
          share: col.share
        };
      }),
      brightness: Math.round(brightness),                 // 0..255
      brightnessLabel: brightness < 85 ? 'dark' : brightness > 175 ? 'light' : 'mid',
      pattern: Math.round(pattern * 100) / 100,           // 0..1
      patternLabel: pattern < 0.18 ? 'solid' : pattern < 0.4 ? 'textured' : 'patterned',
      primaryFamily: colorFamily(hsl),
      primaryHex: rgbToHex(primary.r, primary.g, primary.b),
      geometry: geometry || { coverage: 1, aspect: 1, widthShare: 1, heightShare: 1 }
    };
  }

  function collectRegion(data, w, h, lumaGrid, bgMask, inside, opts) {
    opts = opts || {};
    var buckets = {}, lumaSum = 0, lumaN = 0, count = 0;
    var minX = w, minY = h, maxX = 0, maxY = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (!inside(x, y)) continue;
        var p = y * w + x, i = idx(x, y, w);
        var r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 40) continue;
        if (!opts.fallbackAll && bgMask && bgMask[p]) continue;
        var hsl = rgbToHsl(r, g, b);
        if (opts.excludeSkin && isSkinLike(r, g, b, hsl)) continue;
        if (opts.excludeVeryDark && hsl[2] < 0.08) continue;
        addBucket(buckets, r, g, b);
        lumaSum += lumaGrid[p]; lumaN++; count++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return {
      buckets: buckets,
      brightness: lumaN ? lumaSum / lumaN : 128,
      pattern: regionPatternScore(lumaGrid, w, h, inside),
      count: count,
      bounds: count ? { minX: minX, minY: minY, maxX: maxX, maxY: maxY } :
        { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 },
      imageSize: { w: w, h: h }
    };
  }

  function wornRegion(data, w, h, lumaGrid, bgMask, bbox, focus, y0, y1, x0, x1) {
    var bx = bbox.maxX - bbox.minX + 1, by = bbox.maxY - bbox.minY + 1;
    var rx0 = Math.round(bbox.minX + bx * x0), rx1 = Math.round(bbox.minX + bx * x1);
    var ry0 = Math.round(bbox.minY + by * y0), ry1 = Math.round(bbox.minY + by * y1);
    var inside = function (x, y) { return x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1; };
    var area = Math.max(1, (rx1 - rx0 + 1) * (ry1 - ry0 + 1));

    // This is already a TIGHT CENTRAL band over one garment, so we deliberately
    // IGNORE the global background mask (fallbackAll:true). That keeps a white/
    // light garment on a light backdrop from being suppressed. We isolate the
    // garment with skin exclusion + the narrow band instead.
    var stats = collectRegion(data, w, h, lumaGrid, bgMask, inside, {
      excludeSkin: true, fallbackAll: true
    });
    // Recovery: if skin removal emptied the band (e.g. a beige/tan garment that
    // overlaps skin tones), read it again WITHOUT skin exclusion.
    if (stats.count < area * 0.12) {
      stats = collectRegion(data, w, h, lumaGrid, bgMask, inside, {
        excludeSkin: false, fallbackAll: true
      });
    }
    var a = statsToAnalysis(stats, focus, 'worn-person');
    a.region = { x0: rx0 / w, y0: ry0 / h, x1: rx1 / w, y1: ry1 / h };
    a.confidence = clamp01(stats.count / (area * 0.5));
    if (focus === 'footwear') a.confidence *= 0.85;
    return a;
  }

  function statsToAnalysis(stats, focus, mode) {
    var colors = topBuckets(stats.buckets, 3);
    var b = stats.bounds, size = stats.imageSize;
    var bw = Math.max(1, b.maxX - b.minX + 1), bh = Math.max(1, b.maxY - b.minY + 1);
    var a = decorate(colors, stats.brightness, stats.pattern, {
      coverage: stats.count / (size.w * size.h),
      aspect: bw / bh,
      widthShare: bw / size.w,
      heightShare: bh / size.h
    });
    a.focus = focus;
    a.mode = mode;
    a.pixelCount = stats.count;
    a.confidence = clamp01(stats.count / Math.max(1, size.w * size.h * 0.12));
    return a;
  }

  function mergeAnalysis(base, extra) {
    var out = {};
    Object.keys(base || {}).forEach(function (k) { out[k] = base[k]; });
    Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  function bestCandidate(candidates, fallback) {
    var best = candidates[fallback] || null;
    Object.keys(candidates).forEach(function (k) {
      if (!best || candidates[k].confidence > best.confidence) best = candidates[k];
    });
    return best || candidates[fallback];
  }

  function inferFlatCategory(analysis) {
    var g = analysis.geometry || {};
    var fam = analysis.primaryFamily;
    if (g.aspect > 1.45 && g.heightShare < 0.72) {
      return { category: 'footwear', confidence: 0.76 };
    }
    if ((g.aspect < 0.58 && g.heightShare > 0.68) || fam === 'denim') {
      return { category: 'bottom', confidence: fam === 'denim' ? 0.72 : 0.64 };
    }
    if (g.aspect > 0.55 && g.aspect < 1.45) {
      return { category: 'top', confidence: 0.62 };
    }
    return { category: 'top', confidence: 0.48 };
  }

  function isPersonLike(g) {
    return g.heightShare > 0.68 && g.aspect < 0.78 && g.coverage > 0.08;
  }

  // Confirm the tall shape is actually a body: either visible skin near the top,
  // or the upper garment colour clearly differs from the lower garment colour.
  function hasPersonStructure(data, w, h, bbox, bgMask) {
    var top = slabStats(data, w, h, bgMask, bbox, 0.02, 0.24);
    if (top.skinFrac > 0.06) return true;                 // face/hands => a person
    var bot = slabStats(data, w, h, bgMask, bbox, 0.58, 0.95);
    if (top.n > 5 && bot.n > 5) {
      if (colorDist(top.r, top.g, top.b, bot.r, bot.g, bot.b) > 45) return true;
    }
    return false;                                         // uniform tall garment
  }

  function slabStats(data, w, h, bgMask, bbox, y0, y1) {
    var by = bbox.maxY - bbox.minY + 1;
    var ry0 = Math.round(bbox.minY + by * y0), ry1 = Math.round(bbox.minY + by * y1);
    var r = 0, g = 0, b = 0, n = 0, skin = 0;
    for (var y = ry0; y <= ry1; y++) {
      for (var x = bbox.minX; x <= bbox.maxX; x++) {
        var p = y * w + x;
        if (p < 0 || p >= w * h || bgMask[p]) continue;
        var i = idx(x, y, w), rr = data[i], gg = data[i + 1], bb = data[i + 2];
        if (isSkinLike(rr, gg, bb, rgbToHsl(rr, gg, bb))) skin++;
        r += rr; g += gg; b += bb; n++;
      }
    }
    return { r: n ? r / n : 0, g: n ? g / n : 0, b: n ? b / n : 0, n: n, skinFrac: n ? skin / n : 0 };
  }

  function topHint(hints) {
    var best = null, score = -1;
    Object.keys(hints || {}).forEach(function (k) {
      if (hints[k] > score) { best = k; score = hints[k]; }
    });
    return best;
  }

  function addBucket(buckets, r, g, b) {
    var key = (r >> 5) + '-' + (g >> 5) + '-' + (b >> 5);
    var bk = buckets[key] || (buckets[key] = { count: 0, r: 0, g: 0, b: 0 });
    bk.count++; bk.r += r; bk.g += g; bk.b += b;
  }

  function isSkinLike(r, g, b, hsl) {
    var h = hsl[0] * 360, s = hsl[1], l = hsl[2];
    // Deliberately CONSERVATIVE: skin is warm with a strict R>G>B ordering, a
    // moderate green-blue gap and moderate saturation. Being strict here stops
    // the filter from eating saturated / red-dominant GARMENTS (red, orange,
    // mustard tops etc.) which previously collapsed the whole region.
    if (!(r > g && g > b)) return false;        // strict warm descending order
    var gb = g - b, rg = r - g;
    if (gb < 8 || gb > 85) return false;        // green→blue falloff typical of skin
    if (rg > 95) return false;                  // red shirts are far more red-dominant
    if (s < 0.15 || s > 0.62) return false;     // vivid clothing is not skin
    if (l < 0.30 || l > 0.86) return false;     // too dark / too bright is not skin
    if (h > 50) return false;                   // past warm-orange it isn't skin
    return true;
  }

  function regionPatternScore(luma, w, h, inside) {
    var acc = 0, n = 0;
    for (var y = 0; y < h - 1; y++) {
      for (var x = 0; x < w - 1; x++) {
        if (!inside(x, y)) continue;
        var p = luma[y * w + x];
        if (inside(x + 1, y)) { acc += Math.abs(p - luma[y * w + (x + 1)]); n++; }
        if (inside(x, y + 1)) { acc += Math.abs(p - luma[(y + 1) * w + x]); n++; }
      }
    }
    return n ? Math.min(1, (acc / n) / 40) : 0;
  }

  /* ---- pattern score: mean absolute luma difference to right/below neighbour,
   * skipping background pixels; normalised into ~0..1 range. --------------- */
  function patternScore(luma, w, h, bg, data) {
    var acc = 0, n = 0;
    for (var y = 0; y < h - 1; y++) {
      for (var x = 0; x < w - 1; x++) {
        if (bg) {
          var i = idx(x, y, w);
          if (colorDist(data[i], data[i + 1], data[i + 2], bg[0], bg[1], bg[2]) < 34) continue;
        }
        var p = luma[y * w + x];
        var dr = Math.abs(p - luma[y * w + (x + 1)]);
        var db = Math.abs(p - luma[(y + 1) * w + x]);
        acc += (dr + db); n += 2;
      }
    }
    if (!n) return 0;
    var mean = acc / n;            // 0..255-ish
    return Math.min(1, mean / 40); // ~40 luma delta -> treated as fully patterned
  }

  function topBuckets(buckets, k) {
    var arr = [];
    var total = 0;
    for (var key in buckets) {
      if (!buckets.hasOwnProperty(key)) continue;
      var b = buckets[key];
      total += b.count;
      arr.push({ r: b.r / b.count, g: b.g / b.count, b: b.b / b.count, count: b.count });
    }
    arr.sort(function (a, b) { return b.count - a.count; });
    var out = arr.slice(0, k);
    out.forEach(function (o) { o.share = total ? o.count / total : 0; });
    return out;
  }

  /* ---- colour helpers ------------------------------------------------------*/

  function colorFamily(hsl) {
    var h = hsl[0] * 360, s = hsl[1], l = hsl[2];

    // 1) achromatic neutrals (defined by lightness / very low saturation)
    if (l >= 0.92) return 'white';
    if (l <= 0.10) return 'black';
    if (s < 0.12) {
      if (l < 0.28) return 'charcoal';
      if (l < 0.62) return 'grey';
      return 'ivory';
    }

    var fam = global.Knowledge.hueToFamily(h);
    var warm = (fam === 'red' || fam === 'orange' || fam === 'amber' ||
                fam === 'yellow' || fam === 'lime');

    // 2) blues: dark -> navy, muted+mid -> denim, else true blue
    if (fam === 'blue' || fam === 'indigo' || fam === 'cyan' || fam === 'teal') {
      if (l < 0.30) return 'navy';
      if (s < 0.45 && l < 0.58) return 'denim';
      return fam === 'indigo' ? 'blue' : fam;
    }

    // 3) muted warm/earthy tones -> olive / brown / beige (only when not vivid)
    if (warm && s < 0.55) {
      if (fam === 'yellow' || fam === 'lime') return 'olive';
      if (l < 0.42) return 'brown';
      return 'beige';
    }

    return fam;
  }

  function idx(x, y, w) { return (y * w + x) * 4; }
  function colorDist(r1, g1, b1, r2, g2, b2) {
    var dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      var s = Math.round(v).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  global.CV = {
    analyzeImage: analyzeImage,
    analyzePixels: analyzePixels,
    rgbToHsl: rgbToHsl,
    rgbToHex: rgbToHex,
    colorFamily: colorFamily
  };
})(window);
