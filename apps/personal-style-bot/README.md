# StyleMind — your personal AI stylist 👔🧠

A private, offline web app that learns your wardrobe and hands you outfits based
on your **mood**, **occasion**, **weather context**, wardrobe availability, and
the **kind of fit you want** — while respecting real style rules, a **3-day
no-repeat** on tops, local laundry status, repeat-outfit safety, accessories,
and (optionally) the **auspicious colour of the day** from Hindu astrology.

Portfolio note: this project is included as a product and local-first web app,
not as a machine-learning research credential. It was built with AI coding
assistance, and the defensible ownership is the product framing, feature
selection, local privacy model, and the lessons from real wardrobe-photo failure
modes.

Everything runs **locally in your browser**. No accounts, no server, no installs,
nothing leaves your device. Your clothes photos live in the browser's IndexedDB.
The ML models are local too: one model learns your taste from ratings, and one
learns garment auto-tagging from the labels you confirm while building the closet.

---

## Run it (macOS)

**Easiest:** double-click **`run.command`** in Finder. It starts a tiny local server
and opens the app in your browser.

**Or from a terminal:**

```bash
cd "/Users/gaureshmaheshwary/Desktop/personal bot"
python3 -m http.server 4599
```

then open <http://localhost:4599> in Chrome.

> Running through a local server (not double-clicking `index.html`) is recommended
> so browser storage (IndexedDB) works reliably. Safari blocks storage on bare
> `file://` pages; Chrome is the safest choice.

---

## The five experts (your "subagents")

You asked for a team of specialists. Each is built as a focused engine that the
**lead planner** (`js/recommender.js`) orchestrates. They speak to each other
through a shared **feature vector** so the rule-experts *compute* features and the
learner *weights* them:

| # | Your subagent | File | What it actually does |
|---|---------------|------|-----------------------|
| 1 | **Fashion expert** | `js/fashion.js` | Colour-wheel harmony (neutral / monochrome / analogous / complementary / clash), fit-proportion balance (the "tight tee ↔ loose jeans" rule), pattern-clash, formality coherence, light/dark contrast. Returns a score + plain-English reasons. |
| 2 | **Human-behaviour expert** | `js/mood.js` | Turns *mood* (confident, lazy, low…) + *intent* (relaxed vs. "solid fit for going out") into concrete targets: formality, silhouette, boldness, and **brand tier** preference. |
| 3 | **Easy web app** | `index.html`, `js/app.js`, `css/styles.css` | Zero-dependency UI: upload, closet, one-tap daily reco, week planning, packing lists, insights, ratings, history. |
| 4 | **Try-on interface** | `js/tryon.js` | Builds a "how it looks on me" board — your full-length photo beside the actual garment photos stacked head-to-toe, tinted by detected colour. |
| 5 | **Culture / Vastu expert** | `js/vastu.js` | Maps each weekday → ruling planet (graha) → auspicious colours (jyotish tradition) and scores how well a look aligns. Adjustable influence; set to 0 to ignore. |

Supporting engines:

- **`js/cv.js` — computer vision, from scratch (no ML library).** Reads each photo
  on a `<canvas>`: suppresses likely background, extracts dominant colours,
  measures brightness/pattern, and reports geometry. For worn/full-body photos it
  now follows the human-parsing idea used in garment segmentation research:
  separate likely **top**, **bottom**, and **footwear** regions before choosing
  the colour. You can tap a CV focus chip if the uploaded photo contains more
  than one article.
- **`js/localml.js` — local garment model.** A tiny KNN classifier trained from
  your saved wardrobe labels. Once you have a few confirmed garments, new uploads
  get local category/subtype/fit suggestions. It is rebuilt from local IndexedDB
  data and persisted locally; there is no API, hosted model, or credit spend.
- **`js/rl.js` — reinforcement learning.** A **contextual bandit** with a linear
  reward model. Each time you rate an outfit it does online SGD
  `w ← w + α·(reward − prediction)·features` on the weights *for that occasion*,
  and uses **ε-greedy** exploration so it occasionally tries something new. Over
  time it learns, e.g., that for "going out" you reward fit-balance + boldness but
  punish loud patterns — and biases future picks toward what *you* like.
- **`data/knowledge.js`** — the shared reference library: colour wheel, garment
  taxonomy, fit levels, formality scale, brand tiers.

---

## How a daily recommendation is made

1. **Behaviour** engine reads today's mood + intent → a style target.
2. Planner builds candidate outfits (top × bottom × optional layer × footwear).
3. **Wear rules**: any top/layer worn within the last **3 days** is filtered out.
4. Each candidate is scored into a **feature vector** by the Fashion + Behaviour +
   Vastu + local context engines (colour harmony, fit balance, formality match,
   boldness, vastu alignment, brand fit, freshness, pattern safety, weather fit,
   repeat safety, accessory fit).
5. The **RL taste model** predicts how much *you* will like each, and ranks them
   (with a little exploration).
6. You get the top looks, each with a try-on board, an explanation from every
   expert, and a score breakdown. Rate it → the model learns.

---

## Using it

1. **Add clothes** — drop in photos (many at once). CV auto-reads colour,
   brightness, pattern and geometry; the local garment model learns from your
   confirmed labels and starts suggesting type/subtype/fit after a few saves.
2. **Settings** — optionally add one full-length photo of yourself for the try-on
   board, set the Vastu influence slider, and see/retrain the local model.
3. **Today** — pick your mood + the look you want + local weather context, hit
   **Recommend**, then
   **Wear this & rate** with a ★ rating (tick "I wore this" to arm the 3-day rule).
4. **Planner** — generate a local 7-day outfit plan; planned days simulate wear
   so the same top is not reused too quickly.
5. **Packing** — build a trip capsule and checklist from the same local
   recommender, with day-by-day outfits.
6. **Closet** — mark items Clean/Laundry so unavailable clothes are excluded.
7. **Insights** — see wardrobe utilization, colour palette, sleeping pieces,
   most-worn items, optional cost-per-wear, and local model status.
8. **Taste brain** — watch the learned weights move per occasion.
9. **History** — see everything you've logged.

---

## Research-informed additions

I benchmarked current wardrobe and AI-styling products/reviews in July 2026,
  including Cladwell App Store reviews, GetWardrobe docs, Wearra, Acloset, WEARiT,
  Indyx comparisons, privacy pages from current AI styling apps, human-parsing
  CV papers, color-fashion studies, and 2026 menswear trend coverage. The recurring
  user asks were:

- calendar/week planning, future dates, and duplicate/repeat control
- weather-aware outfit suggestions without silly season mismatches
- packing lists and capsules for trips
- accessories included in full outfits
- laundry/unavailable status
- wardrobe analytics: utilization, sleeping items, colour mix, cost-per-wear
- privacy and avoidance of cloud AI credits/subscription-only features
- better worn-photo CV, not only flat-lay/studio-item CV
- explanations that say *why* a fit works, not just unexplained percentages

This version implements local equivalents for those needs without paid APIs.

Fashion logic now uses clickable scorecards for Color Theory, Silhouette, Shoes,
Pattern, Dress Level, Contrast, and Trend Read. The rule base explicitly handles
examples such as oversized tees with straight/relaxed denim, baggy denim needing
substantial sneakers/boots, trousers preferring structured shoes, and neutral
anchors for bold colours.

---

## Honest scope notes

- **Garment *type*** remains confirmable by you because user labels beat guessy
  generic fashion AI. CV now suggests top/bottom/footwear from geometry and
  worn-photo regions, and the app trains a small local classifier from your own
  confirmed wardrobe; it improves as your closet grows.
- **Try-on** is a real lookbook composite of *your* photos, not AI body-warping
  (that needs pose estimation + a garment-warp network + GPU). It's an honest,
  useful preview you can eyeball.
- **Weather** is manual local context, not a live forecast. That keeps the app
  zero-API-cost while still avoiding hot/cold/rain mismatches.
- **Vastu/astrology** guidance is offered respectfully as optional cultural
  tradition, never as a hard rule — hence the adjustable weight.

---

## Tests

Pure-logic engines are verified headlessly:

```bash
node test/engine.test.js
```

46 assertions across colour harmony, fit balance, shoes-with-denim compatibility,
pattern clash, mood mapping, worn-photo CV region extraction, vastu day-colours,
local weather context, the local garment model, the RL learner, and the
end-to-end recommender incl. mood-specific ranking and the 3-day rule.

---

## Files

```
index.html            app shell + view markup
css/styles.css        light/dark styling
data/knowledge.js     shared style knowledge base
js/db.js              IndexedDB persistence
js/cv.js              canvas computer vision
js/localml.js         local KNN garment auto-tagging model
js/fashion.js         subagent 1 — fashion expert
js/mood.js            subagent 2 — behaviour expert
js/tryon.js           subagent 4 — try-on board
js/vastu.js           subagent 5 — culture/astrology
js/rl.js              reinforcement-learning taste model
js/recommender.js     the lead planner / orchestrator
js/app.js             UI controller
test/engine.test.js   headless verification
run.command           double-click launcher (macOS)
```
