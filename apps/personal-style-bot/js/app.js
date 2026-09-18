/* ============================================================================
 * app.js  —  UI controller. Wires the DOM to every engine.
 * ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var K = window.Knowledge;

  var state = {
    garments: [],
    wearlog: [],
    urlCache: {},          // garmentId -> objectURL
    userPhotoUrl: null,
    closetFilter: 'all',
    closetSearch: '',
    lastReco: null,
    pending: null,         // { blob, url, analysis } currently in the add editor
    queue: [],             // batch add queue
    queueIdx: -1,
    vastuWeight: 0.15,
    localModel: null
  };

  /* ============================ boot ====================================== */
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    if (!window.indexedDB) {
      alert('This browser has IndexedDB disabled (are you on a file:// URL in Safari?). ' +
            'Run it via a local server — see README.');
    }
    setupTabs();
    setupToday();
    setupPlanner();
    setupPacking();
    setupAdd();
    setupSettings();
    setupModal();

    Promise.all([window.RL.load(), loadAll()]).then(function () {
      refreshLocalModel(false);
      renderVastuBanner();
      renderCloset();
      renderBrainCtxOptions();
      renderBrain();
      DB.Profile.get('vastuWeight', 0.15).then(function (v) {
        state.vastuWeight = v;
        $('#vastuWeight').value = v; $('#vastuWeightVal').textContent = (+v).toFixed(2);
      });
      DB.Profile.get('userPhoto', null).then(function (blob) {
        if (blob) { state.userPhotoUrl = URL.createObjectURL(blob);
          var p = $('#userPhotoPrev'); p.src = state.userPhotoUrl; p.classList.add('show'); }
      });
    });
  }

  function loadAll() {
    return Promise.all([DB.getAll('garments'), DB.getAll('wearlog')]).then(function (r) {
      state.garments = r[0] || [];
      state.wearlog = r[1] || [];
    });
  }

  function urlFor(g) {
    if (!g.image) return null;
    if (!state.urlCache[g.id]) state.urlCache[g.id] = URL.createObjectURL(g.image);
    return state.urlCache[g.id];
  }

  /* ============================ tabs ===================================== */
  function setupTabs() {
    $$('#tabs .tab').forEach(function (t) {
      t.addEventListener('click', function () { showView(t.dataset.view); });
    });
  }
  function showView(name) {
    $$('#tabs .tab').forEach(function (t) { t.classList.toggle('active', t.dataset.view === name); });
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.dataset.view === name); });
    if (name === 'closet') renderCloset();
    if (name === 'history') renderHistory();
    if (name === 'insights') renderInsights();
    if (name === 'brain') { renderBrainCtxOptions(); renderBrain(); }
    if (name === 'settings') renderModelStatus();
  }

  /* ============================ TODAY ==================================== */
  function setupToday() {
    var mood = $('#moodSel'), intent = $('#intentSel');
    fillMoodSelect(mood, true);
    fillIntentSelect(intent, 'smart-casual');
    fillWeatherSelect($('#weatherSel'), 'mild');

    $('#dateSel').value = todayStr();
    $('#dateSel').addEventListener('change', renderVastuBanner);
    $('#recommendBtn').addEventListener('click', runRecommend);
  }

  function renderVastuBanner() {
    var info = window.Vastu.forDate($('#dateSel').value || todayStr());
    var sw = info.families.slice(0, 4).map(function (f) {
      return '<span class="dot" style="background:' + window.TryOn.familyToCss(f) + '"></span>';
    }).join('');
    $('#vastuBanner').innerHTML =
      '<b>' + info.day + ' · ' + info.planet + '</b> — ' + info.note +
      '<span class="vastu-swatches">' + sw + '</span>';
  }

  function runRecommend() {
    if (!state.garments.length) { toast('Add some clothes first →'); showView('add'); return; }
    var opts = {
      intent: $('#intentSel').value,
      mood: $('#moodSel').value,
      date: $('#dateSel').value || todayStr(),
      weather: $('#weatherSel').value || 'mild',
      vastuWeight: state.vastuWeight,
      limit: 4
    };
    var res = window.Recommender.recommend(state.garments, state.wearlog, opts);
    state.lastReco = res;
    $('#targetSummary').textContent = 'Read: ' + res.target.summary;
    renderReco(res);
  }

  function fillMoodSelect(sel, neutral) {
    sel.innerHTML = (neutral ? '<option value="">— neutral —</option>' : '') +
      window.Mood.moodList().map(function (m) {
        return '<option value="' + m + '">' + cap(m) + '</option>';
      }).join('');
  }

  function fillIntentSelect(sel, selected) {
    sel.innerHTML = window.Mood.intentList().map(function (i) {
      return '<option value="' + i.key + '"' + (i.key === selected ? ' selected' : '') +
        '>' + i.label + '</option>';
    }).join('');
  }

  function fillWeatherSelect(sel, selected) {
    var profiles = K.WEATHER_PROFILES || {};
    sel.innerHTML = Object.keys(profiles).map(function (k) {
      return '<option value="' + k + '"' + (k === selected ? ' selected' : '') +
        '>' + profiles[k].label + '</option>';
    }).join('');
  }

  function renderReco(res) {
    var box = $('#recoResults');
    box.innerHTML = '';
    if (res.note) {
      var n = document.createElement('div');
      n.className = 'panel'; n.innerHTML = '<p class="muted" style="margin:0">' + res.note + '</p>';
      box.appendChild(n);
    }
    if (!res.recommendations.length) return;

    var byId = {}; state.garments.forEach(function (g) { g.imageUrl = urlFor(g); byId[g.id] = g; });

    res.recommendations.forEach(function (rec, i) {
      var card = document.createElement('div');
      card.className = 'reco-card';

      var youLike = rec.predictedYouLike != null ? Math.round(rec.predictedYouLike * 100) : null;
      var badges = '<span class="badge">Fashion ' + Math.round(rec.stylistScore * 100) + '/100</span>';
      badges += '<span class="badge final">Overall ' + Math.round((rec.finalScore || rec.score) * 100) + '/100</span>';
      if (youLike != null) badges += '<span class="badge you">Taste ' + youLike + '/100</span>';
      if (rec.explored) badges += '<span class="badge explore">new idea</span>';

      card.innerHTML =
        '<div class="reco-top"><div class="reco-rank">Look ' + (i + 1) + '</div>' +
        '<div class="score-badges">' + badges + '</div></div>';

      // try-on board
      card.appendChild(window.TryOn.renderBoard(rec, byId, state.userPhotoUrl));

      card.appendChild(scorecardsEl(rec.scorecards || []));

      // reasons
      var ul = document.createElement('ul'); ul.className = 'reco-reasons';
      rec.explanation.forEach(function (e) { var li = document.createElement('li'); li.textContent = e; ul.appendChild(li); });
      card.appendChild(ul);

      // breakdown bars
      card.appendChild(breakdownEl(rec.features));

      // actions
      var act = document.createElement('div'); act.className = 'reco-actions';
      var wear = document.createElement('button'); wear.className = 'primary';
      wear.textContent = 'Wear this & rate';
      wear.addEventListener('click', function () { openRating(rec); });
      act.appendChild(wear);
      card.appendChild(act);

      box.appendChild(card);
    });
  }

  function scorecardsEl(cards) {
    var wrap = document.createElement('div');
    wrap.className = 'scorecards';
    if (!cards.length) return wrap;
    cards.forEach(function (c, idx) {
      var d = document.createElement('details');
      d.className = 'why-card';
      if (idx < 3) d.open = true;
      var sum = document.createElement('summary');
      sum.innerHTML = '<span>' + esc(c.title) + '</span><b>' + Math.round(c.score * 100) + '/100</b>';
      d.appendChild(sum);
      var verdict = document.createElement('p');
      verdict.className = 'why-verdict';
      verdict.textContent = c.verdict;
      d.appendChild(verdict);
      (c.details || []).forEach(function (txt) {
        var p = document.createElement('p');
        p.textContent = txt;
        d.appendChild(p);
      });
      if (c.sourceUrl) {
        var a = document.createElement('a');
        a.href = c.sourceUrl;
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.textContent = c.sourceLabel || 'Why this rule';
        d.appendChild(a);
      }
      wrap.appendChild(d);
    });
    return wrap;
  }

  function breakdownEl(feats) {
    var wrap = document.createElement('div'); wrap.className = 'breakdown';
    var labels = {
      colorHarmony: 'Colour', fitBalance: 'Fit', formalityMatch: 'Formality',
      boldness: 'Boldness', vastuAlign: 'Vastu', novelty: 'Freshness',
      patternSafety: 'Pattern', weatherFit: 'Weather', repeatSafety: 'Repeat',
      accessoryFit: 'Accessory', shoeCompatibility: 'Shoes', fashionTrend: 'Trend',
      moodMatch: 'Mood'
    };
    Object.keys(labels).forEach(function (k) {
      if (feats[k] == null) return;
      var v = Math.round(feats[k] * 100);
      var d = document.createElement('div'); d.className = 'bd-item';
      d.innerHTML = labels[k] + ' ' + v + '%<div class="bd-bar"><div class="bd-fill" style="width:' + v + '%"></div></div>';
      wrap.appendChild(d);
    });
    return wrap;
  }

  /* ============================ PLANNER ================================== */
  function setupPlanner() {
    $('#planStart').value = todayStr();
    fillMoodSelect($('#planMood'), true);
    fillIntentSelect($('#planIntent'), 'smart-casual');
    fillWeatherSelect($('#planWeather'), 'mild');
    $('#planWeekBtn').addEventListener('click', runWeekPlan);
  }

  function runWeekPlan() {
    if (!state.garments.length) { toast('Add clothes before planning'); showView('add'); return; }
    var start = $('#planStart').value || todayStr();
    var shadowWear = state.wearlog.slice();
    var days = [];
    for (var i = 0; i < 7; i++) {
      var date = addDaysStr(start, i);
      var rec = window.Recommender.recommend(state.garments, shadowWear, {
        intent: $('#planIntent').value,
        mood: $('#planMood').value,
        weather: $('#planWeather').value || 'mild',
        date: date,
        vastuWeight: state.vastuWeight,
        epsilon: 0,
        limit: 1
      });
      var top = rec.recommendations[0];
      days.push({ date: date, rec: top, note: rec.note, target: rec.target });
      if (top) {
        shadowWear.push({
          date: date,
          items: top.items.map(function (it) { return it.id; }),
          label: top.items.map(function (it) { return it.subtype; }).join(' + ')
        });
      }
    }
    renderWeekPlan(days);
  }

  function renderWeekPlan(days) {
    var box = $('#weekPlan');
    box.innerHTML = days.map(function (d) {
      var day = dayName(d.date);
      if (!d.rec) {
        return '<div class="plan-card"><div class="plan-date">' + day + '<span>' + d.date +
          '</span></div><p class="muted">' + esc(d.note || 'No outfit found.') + '</p></div>';
      }
      return '<div class="plan-card">' +
        '<div class="plan-date">' + day + '<span>' + d.date + '</span></div>' +
        '<div class="plan-score">' + Math.round(d.rec.stylistScore * 100) + '% stylist fit</div>' +
        '<div class="plan-pieces">' + esc(outfitLabel(d.rec)) + '</div>' +
        '<p class="muted">' + esc(d.rec.explanation[0] || d.target.summary) + '</p>' +
      '</div>';
    }).join('');
  }

  /* ============================ PACKING ================================== */
  function setupPacking() {
    $('#packStart').value = todayStr();
    fillMoodSelect($('#packMood'), true);
    fillIntentSelect($('#packIntent'), 'smart-casual');
    fillWeatherSelect($('#packWeather'), 'mild');
    $('#packBtn').addEventListener('click', runPacking);
  }

  function runPacking() {
    if (!state.garments.length) { toast('Add clothes before packing'); showView('add'); return; }
    var days = Math.max(1, Math.min(21, +$('#packDays').value || 4));
    var start = $('#packStart').value || todayStr();
    var shadowWear = state.wearlog.slice();
    var plan = [], packed = {};
    for (var i = 0; i < days; i++) {
      var date = addDaysStr(start, i);
      var rec = window.Recommender.recommend(state.garments, shadowWear, {
        intent: $('#packIntent').value,
        mood: $('#packMood').value,
        weather: $('#packWeather').value || 'mild',
        date: date,
        vastuWeight: state.vastuWeight,
        epsilon: 0,
        limit: 1
      }).recommendations[0];
      if (!rec) continue;
      plan.push({ date: date, rec: rec });
      rec.items.forEach(function (it) { packed[it.id] = true; });
      shadowWear.push({ date: date, items: rec.items.map(function (it) { return it.id; }) });
    }
    renderPacking(plan, packed);
  }

  function renderPacking(plan, packed) {
    var byId = {}; state.garments.forEach(function (g) { byId[g.id] = g; });
    var ids = Object.keys(packed);
    var groups = {};
    ids.forEach(function (id) {
      var g = byId[id]; if (!g) return;
      var cat = g.category || 'other';
      (groups[cat] || (groups[cat] = [])).push(g);
    });

    var checklist = Object.keys(groups).map(function (cat) {
      var label = K.GARMENTS[cat] ? K.GARMENTS[cat].label : cap(cat);
      return '<div class="pack-group"><h3>' + label + '</h3>' +
        groups[cat].map(function (g) {
          return '<label class="pack-item"><input type="checkbox"> ' +
            window.TryOn.swatchDot(g.colorFamily) + esc(g.name || g.subtype) +
            '<span>' + esc(g.subtype || '') + '</span></label>';
        }).join('') + '</div>';
    }).join('');

    var outfits = plan.map(function (d) {
      return '<div class="pack-day"><b>' + dayName(d.date) + '</b><span>' + d.date +
        '</span><p>' + esc(outfitLabel(d.rec)) + '</p></div>';
    }).join('');

    $('#packingList').innerHTML =
      '<div class="panel"><h2>Pack ' + ids.length + ' items</h2><div class="pack-grid">' +
      checklist + '</div></div>' +
      '<div class="panel"><h2>Trip outfits</h2><div class="pack-days">' + outfits + '</div></div>';
  }

  /* ============================ ADD ====================================== */
  function setupAdd() {
    var cat = $('#catSel');
    cat.innerHTML = Object.keys(K.GARMENTS).map(function (c) {
      return '<option value="' + c + '">' + K.GARMENTS[c].label + '</option>';
    }).join('');
    cat.addEventListener('change', function () {
      fillSubtypes(cat.value);
      if (state.pending && state.pending.analysis) applyCategoryCandidate(cat.value, state.pending.analysis);
    });
    fillSubtypes(cat.value);

    $('#colorFamily').addEventListener('input', function () { paintColorDot(this.value); });

    var dz = $('#dropzone'), fi = $('#fileInput');
    dz.addEventListener('click', function () { fi.click(); });
    fi.addEventListener('change', function () { enqueueFiles(fi.files); fi.value = ''; });
    ['dragover', 'dragenter'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
    });
    dz.addEventListener('drop', function (e) { enqueueFiles(e.dataTransfer.files); });

    $('#addForm').addEventListener('submit', function (e) { e.preventDefault(); saveGarment(); });
    if ($('#closetSearch')) {
      $('#closetSearch').addEventListener('input', function () {
        state.closetSearch = this.value.trim().toLowerCase();
        renderCloset();
      });
    }
  }

  function fillSubtypes(cat, preferredSubtype) {
    var st = $('#subtypeSel');
    var subs = K.GARMENTS[cat] ? Object.keys(K.GARMENTS[cat].subtypes) : [];
    st.innerHTML = subs.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
    if (preferredSubtype && subs.indexOf(preferredSubtype) !== -1) st.value = preferredSubtype;
    // footwear/accessory have no fit
    var noFit = (cat === 'footwear' || cat === 'accessory');
    $('#fitSel').disabled = noFit;
    if (noFit) $('#fitSel').value = '';
  }

  function enqueueFiles(files) {
    var list = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
    if (!list.length) return;
    list.forEach(function (f) {
      state.queue.push({ blob: f, url: URL.createObjectURL(f), analysis: null, done: false });
    });
    renderQueue();
    if (state.queueIdx < 0) loadQueueItem(state.queue.length - list.length);
  }

  function renderQueue() {
    var q = $('#batchQueue'); q.innerHTML = '';
    if (state.queue.length <= 1) return;
    state.queue.forEach(function (item, i) {
      var img = document.createElement('img');
      img.className = 'batch-thumb' + (item.done ? ' done' : '') + (i === state.queueIdx ? ' active' : '');
      img.src = item.url;
      img.addEventListener('click', function () { loadQueueItem(i); });
      q.appendChild(img);
    });
  }

  function loadQueueItem(i) {
    if (i < 0 || i >= state.queue.length) return;
    state.queueIdx = i;
    var item = state.queue[i];
    state.pending = item;
    var prev = $('#addPreview'); prev.src = item.url; prev.classList.add('show');
    $('#addStatus').textContent = 'Analysing photo…';
    renderQueue();

    var afterCV = function (analysis) {
      item.analysis = analysis;
      $('#addStatus').textContent = '';
      renderCVReadout(analysis);
      applyCategoryCandidate($('#catSel').value, analysis);
      applyLocalPrediction(analysis);
    };
    if (item.analysis) afterCV(item.analysis);
    else window.CV.analyzeImage(item.url).then(afterCV).catch(function (e) {
      $('#addStatus').textContent = 'Could not analyse image.';
      console.error(e);
    });
  }

  function renderCVReadout(a) {
    var sw = a.colors.map(function (c) {
      return '<span class="dot" title="' + c.family + ' ' + Math.round(c.share * 100) + '%" style="background:' + c.hex + '"></span>';
    }).join('');
    var focusRows = '';
    if (a.articleCandidates) {
      focusRows = Object.keys(a.articleCandidates).map(function (k) {
        var c = a.articleCandidates[k];
        return '<button type="button" class="cv-focus" data-c="' + k + '">' +
          cap(k) + ' ' + Math.round((c.confidence || 0) * 100) + '% ' +
          window.TryOn.swatchDot(c.primaryFamily) + '</button>';
      }).join('');
    }
    $('#cvReadout').innerHTML =
      '<div class="row"><b>CV read:</b></div>' +
      '<div class="row">Colours: <span class="cv-swatches">' + sw + '</span></div>' +
      '<div class="row">Primary: ' + a.primaryFamily + '</div>' +
      '<div class="row">Brightness: ' + a.brightnessLabel + ' (' + a.brightness + ')</div>' +
      '<div class="row">Pattern: ' + a.patternLabel + ' (' + a.pattern + ')</div>' +
      (focusRows ? '<div class="row cv-focus-row">' + focusRows + '</div>' : '');
    $$('.cv-focus', $('#cvReadout')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        $('#catSel').value = btn.dataset.c;
        fillSubtypes(btn.dataset.c);
        applyCategoryCandidate(btn.dataset.c, a);
      });
    });
  }

  function paintColorDot(fam) {
    $('#colorDot').style.background = window.TryOn.familyToCss((fam || '').trim().toLowerCase());
  }

  function applyCategoryCandidate(cat, analysis) {
    var focus = analysisForCategory(analysis, cat);
    if (!focus) return;
    $('#colorFamily').value = focus.primaryFamily || analysis.primaryFamily || 'grey';
    paintColorDot($('#colorFamily').value);
    if (focus.suggestedSubtype && $('#subtypeSel option[value="' + focus.suggestedSubtype + '"]').length) {
      $('#subtypeSel').value = focus.suggestedSubtype;
    }
  }

  function analysisForCategory(analysis, cat) {
    if (!analysis) return null;
    var cands = analysis.articleCandidates || {};
    var picked = cands[cat] || cands[K.GARMENTS[cat] && K.GARMENTS[cat].slot] || null;
    if (!picked) return analysis;
    var out = {};
    Object.keys(analysis).forEach(function (k) { out[k] = analysis[k]; });
    ['colors', 'brightness', 'brightnessLabel', 'pattern', 'patternLabel', 'primaryFamily',
     'primaryHex', 'geometry', 'focus', 'mode', 'region', 'confidence',
     'suggestedSubtype', 'suggestedSubtypeConfidence', 'subtypeReason'].forEach(function (k) {
      if (picked[k] != null) out[k] = picked[k];
    });
    out.originalAnalysis = analysis.originalAnalysis || {
      colors: analysis.colors,
      primaryFamily: analysis.primaryFamily,
      geometry: analysis.geometry
    };
    return out;
  }

  function applyLocalPrediction(analysis) {
    var hint = $('#modelHint');
    var pred = window.LocalML.predict(analysis, state.localModel);
    if (!pred.ready) {
      var cvCat = analysis.suggestedCategory;
      if (cvCat && analysis.suggestedCategoryConfidence >= 0.45) {
        $('#catSel').value = cvCat;
        fillSubtypes(cvCat);
        applyCategoryCandidate(cvCat, analysis);
        hint.textContent = 'CV article guess: ' + cvCat + ' ' +
          Math.round(analysis.suggestedCategoryConfidence * 100) +
          '%. Confirm or tap a focus chip above.';
        hint.classList.add('strong');
      } else {
        hint.textContent = pred.trainedOn
          ? 'Local model is warming up: trained on ' + pred.trainedOn + ' item(s). It starts suggesting after 3 labelled garments.'
          : 'Local model is ready to train from your saved labels. No cloud model is used.';
        hint.classList.remove('strong');
      }
      return;
    }

    if (pred.category && pred.category.label && pred.category.confidence >= 0.42) {
      $('#catSel').value = pred.category.label;
      fillSubtypes(pred.category.label, pred.subtype && pred.subtype.label);
      applyCategoryCandidate(pred.category.label, analysis);
    } else if (pred.subtype && pred.subtype.label) {
      fillSubtypes($('#catSel').value, pred.subtype.label);
      applyCategoryCandidate($('#catSel').value, analysis);
    }

    if (pred.fit && pred.fit.label && pred.fit.confidence >= 0.35 && !$('#fitSel').disabled) {
      $('#fitSel').value = pred.fit.label;
    }

    var bits = [];
    if (pred.category && pred.category.label) {
      bits.push(pred.category.label + ' ' + Math.round(pred.category.confidence * 100) + '%');
    }
    if (pred.subtype && pred.subtype.label) {
      bits.push(pred.subtype.label + ' ' + Math.round(pred.subtype.confidence * 100) + '%');
    }
    if (pred.fit && pred.fit.label) {
      bits.push(pred.fit.label + ' fit ' + Math.round(pred.fit.confidence * 100) + '%');
    }
    hint.textContent = 'Local model suggestion from ' + pred.trainedOn + ' item(s): ' + bits.join(' · ');
    hint.classList.add('strong');
  }

  function refreshLocalModel(showToast) {
    state.localModel = window.LocalML.train(state.garments);
    DB.Profile.set('local_ml_model', state.localModel);
    renderModelStatus();
    if (showToast && state.localModel.n >= 3) {
      toast('Local model retrained on ' + state.localModel.n + ' garment(s)');
    }
  }

  function renderModelStatus() {
    var el = $('#localModelStatus');
    if (!el || !state.localModel) return;
    var m = state.localModel, metrics = m.metrics || {};
    if (!m.n) {
      el.textContent = 'No garment model yet. Add clothes and confirm labels; training happens locally in this browser.';
      return;
    }
    var acc = metrics.categoryAccuracy == null ? 'warming up'
      : Math.round(metrics.categoryAccuracy * 100) + '% leave-one-out category accuracy';
    el.textContent = 'Trained locally on ' + m.n + ' labelled garment(s), last updated ' +
      new Date(m.trainedAt).toLocaleString() + ' · ' + acc + '.';
  }

  function saveGarment() {
    if (!state.pending) { toast('Pick a photo first'); return; }
    var cat = $('#catSel').value;
    var g = {
      id: DB.uid(),
      category: cat,
      subtype: $('#subtypeSel').value,
      fit: $('#fitSel').value || null,
      colorFamily: ($('#colorFamily').value || 'grey').trim().toLowerCase(),
      brand: extractBrand($('#nameInput').value),
      name: $('#nameInput').value || $('#subtypeSel').value,
      price: readPrice($('#priceInput').value),
      image: state.pending.blob,
      analysis: analysisForCategory(state.pending.analysis, cat),
      formality: K.garmentFormality(cat, $('#subtypeSel').value),
      available: true,
      createdAt: Date.now()
    };
    DB.put('garments', g).then(function () {
      state.garments.push(g);
      if (state.queueIdx >= 0) state.queue[state.queueIdx].done = true;
      toast('Saved: ' + g.name);
      $('#nameInput').value = '';
      $('#priceInput').value = '';
      advanceQueue();
      renderCloset();
      refreshLocalModel(true);
    });
  }

  function advanceQueue() {
    var next = -1;
    for (var i = 0; i < state.queue.length; i++) { if (!state.queue[i].done) { next = i; break; } }
    if (next >= 0) loadQueueItem(next);
    else {
      state.pending = null; state.queueIdx = -1;
      $('#addPreview').classList.remove('show');
      $('#cvReadout').innerHTML = '';
      if (state.queue.length > 1) toast('All photos processed 🎉');
      state.queue = []; renderQueue();
    }
  }

  // naive brand pull: if the note contains a known brand token, use it
  function extractBrand(text) {
    if (!text) return null;
    var low = text.toLowerCase();
    var keys = Object.keys(K.BRAND_TIERS);
    for (var i = 0; i < keys.length; i++) { if (low.indexOf(keys[i]) !== -1) return keys[i]; }
    return null;
  }

  /* ============================ CLOSET =================================== */
  function renderCloset() {
    var grid = $('#closetGrid'); grid.innerHTML = '';
    $('#closetCount').textContent = state.garments.length;
    $('#closetEmpty').style.display = state.garments.length ? 'none' : 'block';

    // filter chips
    var cats = ['all'].concat(Object.keys(K.GARMENTS));
    $('#closetFilters').innerHTML = cats.map(function (c) {
      return '<button class="chip' + (state.closetFilter === c ? ' active' : '') +
        '" data-c="' + c + '">' + (c === 'all' ? 'All' : K.GARMENTS[c].label.split(' ')[0]) + '</button>';
    }).join('');
    $$('#closetFilters .chip').forEach(function (ch) {
      ch.addEventListener('click', function () { state.closetFilter = ch.dataset.c; renderCloset(); });
    });

    var today = new Date();
    var items = state.garments.filter(function (g) {
      var categoryOk = state.closetFilter === 'all' || g.category === state.closetFilter;
      if (!categoryOk) return false;
      if (!state.closetSearch) return true;
      return searchableGarment(g).indexOf(state.closetSearch) !== -1;
    }).sort(function (a, b) { return b.createdAt - a.createdAt; });

    items.forEach(function (g) {
      var url = urlFor(g);
      var days = window.Recommender.daysSinceWorn(g.id, state.wearlog, today);
      var wornTxt, wornCls;
      if (days === Infinity) { wornTxt = 'never worn'; wornCls = 'worn-fresh'; }
      else if (days < window.Recommender.RECENT_DAYS) { wornTxt = 'worn ' + days + 'd ago · resting'; wornCls = 'worn-recent'; }
      else { wornTxt = 'worn ' + days + 'd ago · ready'; wornCls = 'worn-fresh'; }

      var card = document.createElement('div'); card.className = 'gcard';
      var imgHtml = url
        ? '<img src="' + url + '" alt="">'
        : '<div class="gcard swatch-only" style="background:' + window.TryOn.familyToCss(g.colorFamily) + '"></div>';
      card.innerHTML =
        imgHtml +
        '<button class="gcard-del" title="delete">×</button>' +
        '<button class="gcard-status' + (g.available === false ? ' off' : '') + '" title="toggle clean/laundry">' +
          (g.available === false ? 'Laundry' : 'Clean') + '</button>' +
        '<div class="gcard-body">' +
          '<div class="gcard-title">' + esc(g.name) + '</div>' +
          '<div class="gcard-sub">' + window.TryOn.swatchDot(g.colorFamily) + esc(g.subtype) +
            (g.fit ? ' · ' + g.fit : '') + '</div>' +
          '<div class="gcard-worn ' + wornCls + '">' + wornTxt + '</div>' +
        '</div>';
      card.querySelector('.gcard-del').addEventListener('click', function () { deleteGarment(g); });
      card.querySelector('.gcard-status').addEventListener('click', function () { toggleAvailable(g); });
      grid.appendChild(card);
    });
  }

  function toggleAvailable(g) {
    g.available = g.available === false;
    DB.put('garments', g).then(function () {
      toast(g.available ? 'Marked clean and available' : 'Marked in laundry');
      renderCloset();
      if (state.lastReco) runRecommend();
    });
  }

  function searchableGarment(g) {
    return [g.name, g.category, g.subtype, g.fit, g.colorFamily, g.brand,
      g.available === false ? 'laundry unavailable dirty' : 'clean available ready']
      .filter(Boolean).join(' ').toLowerCase();
  }

  function deleteGarment(g) {
    if (!confirm('Remove "' + g.name + '" from your closet?')) return;
    DB.del('garments', g.id).then(function () {
      state.garments = state.garments.filter(function (x) { return x.id !== g.id; });
      if (state.urlCache[g.id]) { URL.revokeObjectURL(state.urlCache[g.id]); delete state.urlCache[g.id]; }
      renderCloset();
      refreshLocalModel(false);
    });
  }

  /* ============================ RATING / WEAR =========================== */
  var _ratingRec = null, _ratingVal = 0;
  function setupModal() {
    $$('#stars span').forEach(function (s) {
      s.addEventListener('click', function () { _ratingVal = +s.dataset.v; paintStars(); });
      s.addEventListener('mouseenter', function () { paintStars(+s.dataset.v); });
    });
    $('#stars').addEventListener('mouseleave', function () { paintStars(); });
    $('#cancelRating').addEventListener('click', closeRating);
    $('#saveRating').addEventListener('click', commitRating);
  }
  function openRating(rec) {
    _ratingRec = rec; _ratingVal = 0; paintStars();
    $('#ratingOutfit').textContent = rec.items.map(function (i) {
      return i.subtype + ' (' + i.family + ')';
    }).join('  +  ');
    $('#markWorn').checked = true;
    $('#ratingModal').classList.remove('hidden');
  }
  function closeRating() { $('#ratingModal').classList.add('hidden'); _ratingRec = null; }
  function paintStars(hover) {
    var n = hover || _ratingVal;
    $$('#stars span').forEach(function (s) { s.classList.toggle('on', +s.dataset.v <= n); });
  }
  function commitRating() {
    if (!_ratingRec) return;
    if (!_ratingVal) { toast('Tap a star rating'); return; }
    var rec = _ratingRec;
    var ctx = state.lastReco ? (state.lastReco.context || state.lastReco.target.intent) : 'smart-casual|neutral';
    var date = $('#dateSel').value || todayStr();

    // 1) teach the RL taste model
    var p = window.RL.update(ctx, rec.features, _ratingVal);
    // 2) record the rating
    DB.add('ratings', { date: date, context: ctx, rating: _ratingVal,
      features: rec.features, items: rec.items.map(function (i) { return i.id; }) });
    // 3) log the wear (drives the 3-day rule) if checked
    var logP = Promise.resolve();
    if ($('#markWorn').checked) {
      var entry = { date: date, items: rec.items.map(function (i) { return i.id; }),
        label: rec.items.map(function (i) { return i.subtype; }).join(' + ') };
      logP = DB.add('wearlog', entry).then(function (id) { entry.id = id; state.wearlog.push(entry); });
    }
    Promise.all([p, logP]).then(function () {
      closeRating();
      toast('Learned from your ' + _ratingVal + '★ · taste brain updated');
      renderBrain();
      renderCloset();
      // refresh recommendations so the 3-day rule + new taste take effect
      if (state.lastReco) runRecommend();
    });
  }

  /* ============================ HISTORY ================================= */
  function renderHistory() {
    Promise.all([DB.getAll('wearlog'), DB.getAll('ratings')]).then(function (r) {
      var logs = (r[0] || []).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
      var ratings = r[1] || [];
      var rByItems = {};
      ratings.forEach(function (rt) { rByItems[(rt.items || []).join(',') + '|' + rt.date] = rt.rating; });

      var box = $('#historyList');
      if (!logs.length) { box.innerHTML = '<p class="muted empty">No outfits logged yet.</p>'; return; }
      box.innerHTML = logs.map(function (l) {
        var key = (l.items || []).join(',') + '|' + l.date;
        var stars = rByItems[key] ? '★'.repeat(rByItems[key]) : '';
        return '<div class="hrow"><div><div class="date">' + l.date + '</div>' +
          '<div class="pieces">' + esc(l.label || '') + '</div></div>' +
          '<div class="rate">' + stars + '</div></div>';
      }).join('');
    });
  }

  /* ============================ INSIGHTS ================================ */
  function renderInsights() {
    var counts = wearCounts();
    var wornIds = Object.keys(counts).filter(function (id) { return counts[id] > 0; });
    var value = state.garments.reduce(function (sum, g) { return sum + (g.price || 0); }, 0);
    var laundry = state.garments.filter(function (g) { return g.available === false; }).length;
    var utilization = state.garments.length ? wornIds.length / state.garments.length : 0;
    var avgWear = state.garments.length
      ? state.garments.reduce(function (sum, g) { return sum + (counts[g.id] || 0); }, 0) / state.garments.length
      : 0;

    $('#insightStats').innerHTML = [
      statCard('Items', state.garments.length),
      statCard('Utilization', Math.round(utilization * 100) + '%'),
      statCard('Avg wears', avgWear.toFixed(1)),
      statCard('In laundry', laundry),
      statCard('Wardrobe value', value ? currency(value) : '—')
    ].join('');

    renderPalette();
    renderInsightLists(counts);
  }

  function renderPalette() {
    var byColor = {};
    state.garments.forEach(function (g) {
      var c = g.colorFamily || 'grey';
      byColor[c] = (byColor[c] || 0) + 1;
    });
    var total = state.garments.length || 1;
    var rows = Object.keys(byColor).sort(function (a, b) { return byColor[b] - byColor[a]; })
      .map(function (c) {
        var pct = Math.round(byColor[c] / total * 100);
        return '<div class="palette-row">' + window.TryOn.swatchDot(c) +
          '<b>' + esc(c) + '</b><span>' + byColor[c] + ' item(s)</span>' +
          '<div class="palette-bar"><div style="width:' + pct + '%;background:' +
          window.TryOn.familyToCss(c) + '"></div></div></div>';
      }).join('');
    $('#paletteBreakdown').innerHTML = rows || '<p class="muted">Add clothes to see your color palette.</p>';
  }

  function renderInsightLists(counts) {
    var sorted = state.garments.slice().sort(function (a, b) {
      return (counts[b.id] || 0) - (counts[a.id] || 0);
    });
    var most = sorted.filter(function (g) { return (counts[g.id] || 0) > 0; }).slice(0, 6);
    var sleeping = sorted.filter(function (g) { return !(counts[g.id] || 0); }).slice(0, 6);
    var costly = state.garments.filter(function (g) { return g.price; }).sort(function (a, b) {
      var ca = a.price / Math.max(1, counts[a.id] || 0);
      var cb = b.price / Math.max(1, counts[b.id] || 0);
      return cb - ca;
    }).slice(0, 6);

    $('#insightLists').innerHTML =
      insightPanel('Most worn', most, counts, 'wears') +
      insightPanel('Sleeping pieces', sleeping, counts, 'not worn yet') +
      insightPanel('Cost-per-wear watchlist', costly, counts, 'cost');
  }

  function insightPanel(title, items, counts, mode) {
    var rows = items.map(function (g) {
      var meta = mode === 'cost' ? currency((g.price || 0) / Math.max(1, counts[g.id] || 0)) + ' / wear'
        : mode === 'not worn yet' ? 'not worn yet'
        : (counts[g.id] || 0) + ' wear(s)';
      return '<div class="insight-row">' + window.TryOn.swatchDot(g.colorFamily) +
        '<div><b>' + esc(g.name || g.subtype) + '</b><span>' + esc(g.subtype || '') + '</span></div>' +
        '<em>' + meta + '</em></div>';
    }).join('');
    return '<div class="panel insight-panel"><h2>' + title + '</h2>' +
      (rows || '<p class="muted">No data yet.</p>') + '</div>';
  }

  function statCard(label, value) {
    return '<div class="stat-card"><span>' + label + '</span><b>' + value + '</b></div>';
  }

  /* ============================ BRAIN ================================== */
  function renderBrainCtxOptions() {
    var sel = $('#brainCtx');
    var cur = sel.value;
    var moods = ['neutral'].concat(window.Mood.moodList());
    var opts = [];
    window.Mood.intentList().forEach(function (i) {
      moods.forEach(function (m) {
        opts.push({ key: i.key + '|' + m, label: i.label + ' · ' + m });
      });
    });
    sel.innerHTML = opts.map(function (i) {
      return '<option value="' + i.key + '">' + i.label + '</option>';
    }).join('');
    if (cur) sel.value = cur;
    sel.onchange = renderBrain;
  }
  function renderBrain() {
    var ctx = $('#brainCtx').value || 'smart-casual|neutral';
    var m = window.RL.weightsFor(ctx);
    var box = $('#brainWeights');
    var labels = {
      colorHarmony: 'Colour harmony', fitBalance: 'Fit balance', formalityMatch: 'Formality match',
      boldness: 'Boldness', vastuAlign: 'Vastu alignment', brandFit: 'Brand fit',
      novelty: 'Freshness', patternSafety: 'Pattern safety',
      weatherFit: 'Weather fit', repeatSafety: 'Repeat safety', accessoryFit: 'Accessory fit',
      shoeCompatibility: 'Shoe compatibility', fashionTrend: 'Trend read', moodMatch: 'Mood match'
    };
    if (!m) {
      box.innerHTML = '<p class="muted">No ratings for this context yet. Rate a few "' + ctx +
        '" outfits and the weights will move.</p>';
      $('#brainMeta').textContent = '';
      return;
    }
    var maxAbs = 2.0;
    box.innerHTML = window.RL.FEATURES.map(function (f) {
      var w = m.w[f] || 0;
      var pct = Math.min(100, Math.abs(w) / maxAbs * 50); // half-track each side
      var cls = w >= 0 ? 'pos' : 'neg';
      return '<div class="bw-row"><div class="bw-name">' + labels[f] + '</div>' +
        '<div class="bw-track"><div class="bw-mid"></div>' +
        '<div class="bw-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
        '<div class="bw-val">' + w.toFixed(2) + '</div></div>';
    }).join('');
    $('#brainMeta').textContent = 'Trained on ' + m.n + ' rating(s) for this context. ' +
      'Green = you reward it, red = you penalise it.';
  }

  /* ============================ SETTINGS =============================== */
  function setupSettings() {
    $('#vastuWeight').addEventListener('input', function () {
      state.vastuWeight = +this.value;
      $('#vastuWeightVal').textContent = state.vastuWeight.toFixed(2);
      DB.Profile.set('vastuWeight', state.vastuWeight);
    });
    $('#userPhotoInput').addEventListener('change', function () {
      var f = this.files[0]; if (!f) return;
      DB.Profile.set('userPhoto', f).then(function () {
        if (state.userPhotoUrl) URL.revokeObjectURL(state.userPhotoUrl);
        state.userPhotoUrl = URL.createObjectURL(f);
        var p = $('#userPhotoPrev'); p.src = state.userPhotoUrl; p.classList.add('show');
        toast('Photo saved — your looks will preview on you');
      });
    });
    $('#retrainModelBtn').addEventListener('click', function () {
      refreshLocalModel(true);
      renderInsights();
    });
    $('#seedDemoBtn').addEventListener('click', seedDemoCloset);
    $('#exportBtn').addEventListener('click', exportData);
    $('#resetBrainBtn').addEventListener('click', function () {
      if (!confirm('Reset the learned taste model? Your clothes and history stay.')) return;
      window.RL.reset().then(function () { toast('Taste brain reset'); renderBrain(); });
    });
    $('#wipeBtn').addEventListener('click', function () {
      if (!confirm('Erase ALL clothes, history and learning? This cannot be undone.')) return;
      Promise.all([DB.clear('garments'), DB.clear('wearlog'), DB.clear('ratings'), DB.clear('profile')])
        .then(function () { location.reload(); });
    });
  }

  function exportData() {
    // export metadata (not the image blobs) as a portable JSON
    var data = {
      exportedAt: new Date().toISOString(),
      garments: state.garments.map(function (g) {
        return { id: g.id, category: g.category, subtype: g.subtype, fit: g.fit,
          colorFamily: g.colorFamily, brand: g.brand, name: g.name,
          price: g.price || null, available: g.available !== false,
          analysis: g.analysis, formality: g.formality };
      }),
      wearlog: state.wearlog,
      localModel: state.localModel,
      rlWeights: (window.RL.weightsFor('smart-casual') || {})
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'stylemind-export.json'; a.click();
  }

  /* ============================ DEMO DATA =============================== */
  function seedDemoCloset() {
    if (state.garments.length && !confirm('Add the test user and demo closet to your existing data?')) return;
    var items = [
      { category: 'top', subtype: 't-shirt', fit: 'regular', color: '#f3f1e8', name: 'home shot off-white regular tee', price: 18 },
      { category: 'top', subtype: 't-shirt', fit: 'oversized', color: '#2d5f8b', name: 'home shot blue oversized tee', price: 24 },
      { category: 'top', subtype: 'polo', fit: 'fitted', color: '#1d1f24', name: 'home shot black fitted polo', price: 32 },
      { category: 'top', subtype: 'casual-shirt', fit: 'relaxed', color: '#7a8b3a', name: 'home shot olive relaxed shirt', price: 40 },
      { category: 'top', subtype: 'oxford-shirt', fit: 'regular', color: '#cbd9e9', name: 'home shot pale blue oxford', price: 45 },
      { category: 'layer', subtype: 'blazer', fit: 'regular', color: '#202b46', name: 'home shot navy soft blazer', price: 95 },
      { category: 'layer', subtype: 'denim-jacket', fit: 'regular', color: '#496b8f', name: 'home shot washed denim jacket', price: 68 },
      { category: 'bottom', subtype: 'jeans', fit: 'regular', color: '#496b8f', name: 'home shot straight blue jeans', price: 55 },
      { category: 'bottom', subtype: 'jeans', fit: 'baggy', color: '#2f435f', name: 'home shot baggy dark denim', price: 65 },
      { category: 'bottom', subtype: 'chinos', fit: 'regular', color: '#c6a46e', name: 'home shot tan chinos', price: 42 },
      { category: 'bottom', subtype: 'cargos', fit: 'relaxed', color: '#6f7435', name: 'home shot olive cargos', price: 58 },
      { category: 'bottom', subtype: 'shorts', fit: 'regular', color: '#d5c29a', name: 'home shot beige shorts', price: 28 },
      { category: 'footwear', subtype: 'white-sneakers', fit: '', color: '#ebe9df', name: 'home shot white sneakers', price: 70 },
      { category: 'footwear', subtype: 'loafers', fit: '', color: '#5a321d', name: 'home shot brown loafers', price: 85 },
      { category: 'footwear', subtype: 'boots', fit: '', color: '#1f1a17', name: 'home shot black boots', price: 110 },
      { category: 'footwear', subtype: 'running-shoes', fit: '', color: '#d8d8d0', accent: '#e94c5a', name: 'home shot running shoes', price: 95 },
      { category: 'accessory', subtype: 'watch', fit: '', color: '#2b2723', name: 'home shot dark leather watch', price: 75 },
      { category: 'accessory', subtype: 'cap', fit: '', color: '#315336', name: 'home shot green cap', price: 20 },
      { category: 'top', subtype: 't-shirt', fit: 'regular', color: '#bc2f3f', name: 'worn test red tee', photo: 'worn', wornTop: '#bc2f3f', wornBottom: '#496b8f', wornShoes: '#ebe9df' },
      { category: 'bottom', subtype: 'jeans', fit: 'regular', color: '#496b8f', name: 'worn test straight denim', photo: 'worn', wornTop: '#bc2f3f', wornBottom: '#496b8f', wornShoes: '#ebe9df' },
      { category: 'footwear', subtype: 'white-sneakers', fit: '', color: '#ebe9df', name: 'worn test white sneakers', photo: 'worn', wornTop: '#bc2f3f', wornBottom: '#496b8f', wornShoes: '#ebe9df' }
    ];
    toast('Building test user and closet locally...');
    Promise.all([demoUserBlob(), Promise.all(items.map(makeDemoGarment))]).then(function (r) {
      var userBlob = r[0], garments = r[1];
      return Promise.all(garments.map(function (g) { return DB.put('garments', g); })
        .concat([DB.Profile.set('userPhoto', userBlob)])).then(function () {
        state.garments = state.garments.concat(garments);
        if (state.userPhotoUrl) URL.revokeObjectURL(state.userPhotoUrl);
        state.userPhotoUrl = URL.createObjectURL(userBlob);
        var p = $('#userPhotoPrev'); p.src = state.userPhotoUrl; p.classList.add('show');
        refreshLocalModel(true);
        renderCloset();
        renderInsights();
        toast('Test profile loaded: user + ' + garments.length + ' closet photos');
      });
    }).catch(function (e) {
      console.error(e);
      toast('Could not build test profile');
    });
  }

  function makeDemoGarment(item) {
    return demoBlob(item).then(function (blob) {
      var url = URL.createObjectURL(blob);
      return window.CV.analyzeImage(url).then(function (analysis) {
        URL.revokeObjectURL(url);
        var focused = analysisForCategory(analysis, item.category);
        return {
          id: DB.uid(),
          category: item.category,
          subtype: item.subtype,
          fit: item.fit || null,
          colorFamily: focused.primaryFamily || analysis.primaryFamily,
          brand: null,
          name: item.name,
          price: item.price || null,
          image: blob,
          analysis: focused,
          formality: K.garmentFormality(item.category, item.subtype),
          available: true,
          createdAt: Date.now() + Math.floor(Math.random() * 1000)
        };
      });
    });
  }

  function demoBlob(item) {
    if (item.photo === 'worn') return wornOutfitBlob(item);
    var cv = document.createElement('canvas');
    cv.width = 520; cv.height = 700;
    var ctx = cv.getContext('2d');
    drawRoom(ctx, cv.width, cv.height);
    ctx.save();
    ctx.translate(260 + rand(-18, 18), 345 + rand(-20, 20));
    ctx.rotate(rand(-0.07, 0.07));
    drawDemoShape(ctx, item);
    ctx.restore();
    addPhotoNoise(ctx, cv.width, cv.height);
    return new Promise(function (resolve) { cv.toBlob(resolve, 'image/jpeg', 0.88); });
  }

  function demoUserBlob() {
    return wornOutfitBlob({
      wornTop: '#2d5f8b',
      wornBottom: '#2f435f',
      wornShoes: '#ebe9df',
      userOnly: true
    });
  }

  function wornOutfitBlob(item) {
    var cv = document.createElement('canvas');
    cv.width = 520; cv.height = 760;
    var ctx = cv.getContext('2d');
    drawRoom(ctx, cv.width, cv.height);
    ctx.save();
    ctx.translate(260, 80);
    drawPlaceholderPerson(ctx, item);
    ctx.restore();
    addPhotoNoise(ctx, cv.width, cv.height);
    return new Promise(function (resolve) { cv.toBlob(resolve, 'image/jpeg', 0.88); });
  }

  function drawRoom(ctx, w, h) {
    ctx.fillStyle = '#ded8cb'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8bca8'; ctx.fillRect(0, h * 0.64, w, h * 0.36);
    ctx.strokeStyle = 'rgba(80,65,45,.14)';
    for (var x = -40; x < w + 60; x += 70) {
      ctx.beginPath(); ctx.moveTo(x, h * 0.64); ctx.lineTo(x + 90, h); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.72, 150, 34, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillRect(42, 52, 108, 150);
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    ctx.fillRect(395, 62, 48, 210);
  }

  function drawDemoShape(ctx, item) {
    ctx.fillStyle = item.color;
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = 4;
    if (item.category === 'top') drawTopShape(ctx, item);
    else if (item.category === 'layer') drawTopShape(ctx, item, true);
    else if (item.category === 'bottom') drawBottomShape(ctx, item);
    else if (item.category === 'footwear') drawShoeShape(ctx, item);
    else drawAccessoryShape(ctx, item);
  }

  function drawTopShape(ctx, item, layer) {
    ctx.beginPath();
    ctx.moveTo(-76, -150); ctx.lineTo(76, -150);
    ctx.lineTo(layer ? 126 : 112, -58); ctx.lineTo(82, -34);
    ctx.lineTo(62, 150); ctx.lineTo(-62, 150);
    ctx.lineTo(-82, -34); ctx.lineTo(layer ? -126 : -112, -58);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(-48, -135, 96, 260);
    drawFabricLines(ctx, -58, -118, 116, 230, layer ? 7 : 5);
  }

  function drawBottomShape(ctx, item) {
    var loose = item.fit === 'baggy';
    ctx.beginPath();
    ctx.moveTo(-66, -170); ctx.lineTo(66, -170); ctx.lineTo(82, 170);
    ctx.lineTo(loose ? 18 : 8, 170); ctx.lineTo(0, -20);
    ctx.lineTo(loose ? -18 : -8, 170); ctx.lineTo(-82, 170);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(0, -160); ctx.lineTo(0, 150); ctx.stroke();
    drawFabricLines(ctx, -58, -130, 116, 270, loose ? 9 : 6);
  }

  function drawShoeShape(ctx, item) {
    ctx.save(); ctx.translate(0, 30);
    [-72, 72].forEach(function (x) {
      ctx.beginPath();
      ctx.ellipse(x, 0, item.subtype === 'boots' ? 54 : 66, item.subtype === 'loafers' ? 26 : 32, -0.08, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(x - 28, -12, 44, 9);
      ctx.fillStyle = item.color;
    });
    ctx.restore();
  }

  function drawAccessoryShape(ctx, item) {
    ctx.beginPath(); ctx.arc(0, 0, 68, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function drawPlaceholderPerson(ctx, item) {
    var skin = '#b98563';
    var top = item.wornTop || '#2d5f8b';
    var bottom = item.wornBottom || '#2f435f';
    var shoes = item.wornShoes || '#ebe9df';

    ctx.fillStyle = 'rgba(0,0,0,.16)';
    ctx.beginPath(); ctx.ellipse(0, 650, 126, 26, 0, 0, Math.PI * 2); ctx.fill();

    // head / neck
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(0, 42, 38, 45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-16, 82, 32, 28);
    ctx.fillStyle = '#2a211d';
    ctx.beginPath(); ctx.ellipse(0, 18, 40, 24, 0, Math.PI, Math.PI * 2); ctx.fill();

    // arms behind shirt
    ctx.fillStyle = skin;
    roundedRect(ctx, -108, 140, 26, 190, 14); ctx.fill();
    roundedRect(ctx, 82, 140, 26, 190, 14); ctx.fill();

    // top
    ctx.fillStyle = top;
    ctx.strokeStyle = 'rgba(0,0,0,.24)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-66, 106); ctx.lineTo(66, 106);
    ctx.lineTo(104, 162); ctx.lineTo(80, 206);
    ctx.lineTo(58, 346); ctx.lineTo(-58, 346);
    ctx.lineTo(-80, 206); ctx.lineTo(-104, 162);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.arc(0, 112, 24, 0, Math.PI); ctx.stroke();
    drawFabricLines(ctx, -46, 142, 92, 180, 8);

    // pants
    ctx.fillStyle = bottom;
    ctx.strokeStyle = 'rgba(0,0,0,.24)';
    ctx.beginPath();
    ctx.moveTo(-58, 346); ctx.lineTo(58, 346);
    ctx.lineTo(78, 616); ctx.lineTo(20, 616);
    ctx.lineTo(0, 410); ctx.lineTo(-20, 616);
    ctx.lineTo(-78, 616); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.moveTo(0, 362); ctx.lineTo(0, 604); ctx.stroke();

    // shoes
    ctx.fillStyle = shoes;
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    [-48, 48].forEach(function (x) {
      ctx.beginPath();
      ctx.ellipse(x, 636, 46, 18, x < 0 ? -0.12 : 0.12, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });

    if (item.userOnly) {
      ctx.fillStyle = 'rgba(255,255,255,.88)';
      ctx.fillRect(-120, 680, 240, 28);
      ctx.fillStyle = '#333';
      ctx.font = '16px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Placeholder user photo', 0, 700);
    }
  }

  function drawFabricLines(ctx, x, y, w, h, n) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,.08)';
    ctx.lineWidth = 2;
    for (var i = 0; i < n; i++) {
      var yy = y + (h / (n + 1)) * (i + 1) + rand(-7, 7);
      ctx.beginPath();
      ctx.moveTo(x + rand(0, 12), yy);
      ctx.bezierCurveTo(x + w * 0.3, yy + rand(-9, 9), x + w * 0.7, yy + rand(-9, 9), x + w - rand(0, 12), yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function addPhotoNoise(ctx, w, h) {
    var img = ctx.getImageData(0, 0, w, h);
    for (var i = 0; i < img.data.length; i += 24) {
      var n = rand(-7, 7);
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ============================ utils ================================== */
  function outfitLabel(rec) {
    return rec.items.map(function (i) {
      return i.subtype + ' (' + i.family + ')';
    }).join(' + ');
  }

  function wearCounts() {
    var counts = {};
    state.wearlog.forEach(function (w) {
      (w.items || []).forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
    });
    return counts;
  }

  function addDaysStr(dateStr, offset) {
    var d = window.Vastu.toLocalDate(dateStr);
    d.setDate(d.getDate() + offset);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function dayName(dateStr) {
    return window.Vastu.toLocalDate(dateStr).toLocaleDateString(undefined, { weekday: 'short' });
  }

  function readPrice(v) {
    var n = parseFloat(v);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  }

  function currency(n) {
    return '$' + (+n).toFixed(2);
  }

  function todayStr() {
    var d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + pad(m) + '-' + pad(day);
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var _toastT;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(_toastT); _toastT = setTimeout(function () { t.classList.add('hidden'); }, 2600);
  }
})();
