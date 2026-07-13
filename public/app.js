/* Calorie & macro tracker — vanilla JS SPA */
(() => {
  'use strict';

  // ---------- utils ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  const pad = (n) => String(n).padStart(2, '0');
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const toDate = (s) => new Date(s + 'T00:00:00');
  const addDays = (s, n) => {
    const d = toDate(s);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const fmtDate = (s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
    toDate(s).toLocaleDateString(undefined, opts);
  const fmtDateLong = (s) => {
    const today = localToday();
    if (s === today) return 'Today';
    if (s === addDays(today, -1)) return 'Yesterday';
    if (s === addDays(today, 1)) return 'Tomorrow';
    return fmtDate(s);
  };
  const round = (n) => Math.round(n);
  const kcal = (n) => `${round(n).toLocaleString()}`;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v != null) node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null) continue;
      node.append(c.nodeType ? c : document.createTextNode(c));
    }
    return node;
  }

  // ---------- state ----------
  const state = {
    profile: null,
    date: localToday(),
    view: 'today',
    weekStart: mondayOf(localToday()),
    foodMeal: 'breakfast',
    photo: null, // {data, media_type}
  };

  function mondayOf(dateStr) {
    const d = toDate(dateStr);
    const dow = (d.getDay() + 6) % 7; // Mon=0
    return addDays(dateStr, -dow);
  }

  // ---------- boot ----------
  async function boot() {
    const { profile } = await api('/api/profile');
    state.profile = profile;
    if (!profile) {
      showView('setup');
    } else {
      $('#tabbar').hidden = false;
      showView('today');
    }
  }

  function showView(name) {
    state.view = name;
    for (const v of $$('.view')) v.hidden = true;
    $(`#${name}-view`).hidden = false;
    for (const b of $$('#tabbar button')) b.classList.toggle('on', b.dataset.view === name);
    $('#tabbar').hidden = name === 'setup';
    if (name === 'today') renderToday();
    if (name === 'weight') renderWeight();
    if (name === 'stats') renderStats();
    if (name === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  $$('#tabbar button').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

  // ---------- setup ----------
  $('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = Object.fromEntries([...f.entries()].map(([k, v]) => [k, v === '' ? null : isNaN(v) ? v : Number(v)]));
    body.today = localToday();
    try {
      const { profile } = await api('/api/profile', { method: 'POST', body });
      state.profile = profile;
      $('#tabbar').hidden = false;
      showView('today');
    } catch (err) { alert(err.message); }
  });

  // ---------- Today ----------
  const MEALS = [
    ['breakfast', 'Breakfast'],
    ['lunch', 'Lunch'],
    ['dinner', 'Dinner'],
    ['snacks', 'Snacks'],
  ];

  $('#date-prev').addEventListener('click', () => { state.date = addDays(state.date, -1); renderToday(); });
  $('#date-next').addEventListener('click', () => { state.date = addDays(state.date, 1); renderToday(); });
  $('#date-label').addEventListener('click', () => { state.date = localToday(); renderToday(); });

  async function renderToday() {
    $('#date-label').textContent = fmtDateLong(state.date);
    let day;
    try { day = await api(`/api/day?date=${state.date}`); }
    catch (err) { alert(err.message); return; }

    // Adaptive TDEE correction notice
    const notice = $('#tdee-correction');
    if (day.tdeeCorrection) {
      const c = day.tdeeCorrection;
      const sign = c.adjustment >= 0 ? '+' : '−';
      notice.hidden = false;
      notice.textContent = '';
      notice.append(
        el('div', {},
          el('strong', {}, `Adaptive TDEE: ${sign}${Math.abs(c.adjustment)} kcal/day. `),
          `Over ${fmtDate(c.period_start)} – ${fmtDate(c.period_end)} you averaged ${kcal(c.avgIntake)} kcal and ` +
          `${c.weightChange <= 0 ? 'lost' : 'gained'} ${Math.abs(c.weightChange)} lbs, implying a TDEE of ~${kcal(c.observedTdee)} ` +
          `vs the ${kcal(c.expectedTdee)} estimated. Your budget has been corrected.`
        )
      );
    } else notice.hidden = true;

    // Budget hero + meter
    const b = day.budget;
    const hero = $('#hero-remaining');
    hero.textContent = kcal(b.remaining);
    hero.classList.toggle('over', b.remaining < 0);
    const pct = b.budget > 0 ? Math.min(100, (day.totals.calories / b.budget) * 100) : 0;
    const meter = $('#budget-meter');
    meter.style.width = pct + '%';
    meter.classList.toggle('over', b.remaining < 0);
    const math = $('#budget-math');
    math.textContent = '';
    math.append(
      el('span', {}, el('b', {}, kcal(b.effectiveTdee)), ' TDEE'),
      el('span', {}, '− ', el('b', {}, kcal(b.deficit)), ' deficit'),
      el('span', {}, '+ ', el('b', {}, kcal(b.exerciseCals)), ' exercise'),
      el('span', {}, '= ', el('b', {}, kcal(b.budget)), ' budget'),
    );

    const mrow = $('#macro-row');
    mrow.textContent = '';
    const targets = day.targets || {};
    for (const [k, v, key] of [['Protein', day.totals.protein, 'protein'], ['Carbs', day.totals.carbs, 'carbs'], ['Fat', day.totals.fat, 'fat']]) {
      const target = targets[key];
      mrow.append(el('div', { class: 'macro' },
        el('div', { class: 'v' }, target ? `${v}/${target}g` : `${v}g`),
        target ? el('div', { class: 'macro-meter' },
          el('div', { class: 'macro-meter-fill', style: `width:${Math.min(100, (v / target) * 100)}%` })) : null,
        el('div', { class: 'k' }, k)));
    }

    // Copy yesterday
    const hasFood = Object.values(day.meals).some((m) => m.length);
    $('#copy-yesterday-wrap').hidden = !(day.canCopyYesterday && !hasFood);

    // Meals
    const wrap = $('#meals');
    wrap.textContent = '';
    for (const [key, label] of MEALS) {
      const entries = day.meals[key];
      const total = entries.reduce((s, f) => s + f.calories, 0);
      const card = el('div', { class: 'section-card' },
        el('div', { class: 'section-head' },
          el('h2', {}, label, ' ', el('span', { class: 'meal-total' }, entries.length ? `${kcal(total)} kcal` : '')),
          el('button', { class: 'btn small', onclick: () => openFoodSheet(key) }, '+ Add'),
        ),
        entries.length
          ? el('ul', { class: 'entry-list' }, entries.map((f) => foodRow(f)))
          : el('div', { class: 'empty' }, 'Nothing logged'),
      );
      wrap.append(card);
    }

    // Exercise
    const exList = $('#exercise-list');
    exList.textContent = '';
    if (!day.exercises.length) {
      exList.append(el('li', { class: 'empty' }, 'No exercise logged — logging it raises today’s budget'));
    }
    for (const ex of day.exercises) {
      exList.append(el('li', {},
        el('span', { class: 'entry-name' }, el('span', { class: 'n' }, ex.name)),
        el('span', { class: 'entry-cals' }, `+${kcal(ex.calories)}`),
        el('span', { class: 'entry-act' },
          el('button', { 'aria-label': 'Delete', onclick: async () => { await api(`/api/exercises/${ex.id}`, { method: 'DELETE' }); renderToday(); } }, '🗑')),
      ));
    }
  }

  function foodRow(f, readonly = false) {
    return el('li', {},
      el('span', { class: 'entry-name' },
        el('span', { class: 'n' }, f.name),
        el('span', { class: 'm' }, `P ${round(f.protein)} · C ${round(f.carbs)} · F ${round(f.fat)}`),
      ),
      el('span', { class: 'entry-cals' }, kcal(f.calories)),
      readonly ? null : el('span', { class: 'entry-act' },
        el('button', { class: 'fav', 'aria-label': 'Save to favorites', title: 'Save to favorites',
          onclick: async (e) => {
            await api('/api/favorites', { method: 'POST', body: { name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat } });
            e.target.classList.add('on');
          } }, '☆'),
        el('button', { 'aria-label': 'Delete', onclick: async () => { await api(`/api/foods/${f.id}`, { method: 'DELETE' }); renderToday(); } }, '🗑'),
      ),
    );
  }

  $('#copy-yesterday').addEventListener('click', async () => {
    await api('/api/foods/copy-yesterday', { method: 'POST', body: { date: state.date } });
    renderToday();
  });

  // ---------- Food sheet ----------
  function openSheet(id) { $(id).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeSheet(id) { $(id).hidden = true; document.body.style.overflow = ''; }
  $$('.sheet-backdrop').forEach((bd) => {
    bd.addEventListener('click', (e) => { if (e.target === bd || e.target.closest('[data-close]')) closeSheet('#' + bd.id); });
  });

  function openFoodSheet(meal) {
    state.foodMeal = meal;
    $('#food-sheet-title').textContent = `Add to ${meal[0].toUpperCase()}${meal.slice(1)}`;
    $('#food-results').hidden = true;
    $('#food-results').textContent = '';
    $('#food-error').hidden = true;
    $('#food-ai-text').value = '';
    setFoodMode('ai');
    openSheet('#food-sheet');
  }

  function setFoodMode(mode) {
    for (const b of $$('#food-mode button')) b.classList.toggle('on', b.dataset.mode === mode);
    for (const pane of ['ai', 'photo', 'saved', 'manual']) $(`#food-${pane}`).hidden = pane !== mode;
    $('#food-results').hidden = true;
    $('#food-error').hidden = true;
    if (mode === 'saved') renderSavedPane();
  }
  $$('#food-mode button').forEach((b) => b.addEventListener('click', () => setFoodMode(b.dataset.mode)));

  async function addFood(item, meal = state.foodMeal, date = state.date) {
    await api('/api/foods', { method: 'POST', body: { date, meal, name: item.name, calories: item.calories, protein: item.protein || 0, carbs: item.carbs || 0, fat: item.fat || 0 } });
  }

  // AI text estimation
  $('#food-ai-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#food-ai-text').value.trim();
    if (!text) return;
    await runFoodEstimate({ description: text });
  });

  // Photo estimation
  $('#food-photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.photo = await downscaleImage(file);
    const label = $('#photo-drop-label');
    label.textContent = '';
    label.append(el('img', { src: `data:${state.photo.media_type};base64,${state.photo.data}`, alt: 'Meal photo' }));
    $('#food-photo-go').disabled = false;
  });
  $('#food-photo-go').addEventListener('click', async () => {
    if (!state.photo) return;
    await runFoodEstimate({ image: state.photo, description: $('#food-photo-note').value.trim() || undefined });
  });

  async function downscaleImage(file, max = 1024) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return { media_type: 'image/jpeg', data: dataUrl.split(',')[1] };
  }

  async function runFoodEstimate(body) {
    const busy = $('#food-busy'), errBox = $('#food-error'), results = $('#food-results');
    busy.hidden = false; errBox.hidden = true; results.hidden = true; results.textContent = '';
    try {
      const data = await api('/api/estimate/food', { method: 'POST', body });
      results.hidden = false;
      if (data.notes) results.append(el('div', { class: 'result-card notes' }, data.notes));
      for (const item of data.items) {
        const card = el('div', { class: 'result-card' },
          el('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:baseline' },
            el('strong', {}, item.name),
            el('span', { class: 'entry-cals' }, `${kcal(item.calories)} kcal`)),
          el('div', { class: 'm', style: 'color:var(--text-muted);font-size:12px;margin:4px 0 8px' },
            `P ${round(item.protein)}g · C ${round(item.carbs)}g · F ${round(item.fat)}g`),
          el('button', { class: 'btn primary full', onclick: async (e) => {
            e.target.disabled = true; e.target.textContent = 'Added ✓';
            await addFood(item);
          } }, `Add to ${state.foodMeal}`),
        );
        results.append(card);
      }
      if (data.items.length > 1) {
        results.prepend(el('button', { class: 'btn full', onclick: async (e) => {
          e.target.disabled = true; e.target.textContent = 'All added ✓';
          for (const item of data.items) await addFood(item);
        } }, `Add all ${data.items.length} items`));
      }
    } catch (err) {
      errBox.hidden = false;
      errBox.textContent = err.message;
    } finally {
      busy.hidden = true;
    }
  }

  // Saved (favorites + recents)
  async function renderSavedPane() {
    const pane = $('#food-saved');
    pane.textContent = '';
    const { favorites, recents } = await api('/api/quick');
    const quickRow = (item, isFav) => el('li', {},
      el('span', { class: 'entry-name' },
        el('span', { class: 'n' }, item.name),
        el('span', { class: 'm' }, `${kcal(item.calories)} kcal · P ${round(item.protein)} C ${round(item.carbs)} F ${round(item.fat)}`)),
      el('span', { class: 'entry-act' },
        isFav ? el('button', { 'aria-label': 'Remove favorite', onclick: async (e) => { await api(`/api/favorites/${item.id}`, { method: 'DELETE' }); renderSavedPane(); e.stopPropagation(); } }, '🗑') : null,
        el('button', { class: 'btn small', onclick: async (e) => {
          e.target.disabled = true; e.target.textContent = '✓';
          await addFood(item);
        } }, 'Add')),
    );
    if (favorites.length) {
      pane.append(el('div', { class: 'saved-group-label' }, '★ Favorites'));
      pane.append(el('ul', { class: 'entry-list' }, favorites.map((f) => quickRow(f, true))));
    }
    if (recents.length) {
      pane.append(el('div', { class: 'saved-group-label' }, 'Recent'));
      pane.append(el('ul', { class: 'entry-list' }, recents.map((f) => quickRow(f, false))));
    }
    if (!favorites.length && !recents.length) pane.append(el('div', { class: 'empty' }, 'Foods you log will appear here for quick re-adding.'));
  }

  // Manual add
  $('#food-manual-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await addFood({
      name: f.get('name'),
      calories: Number(f.get('calories')),
      protein: Number(f.get('protein')) || 0,
      carbs: Number(f.get('carbs')) || 0,
      fat: Number(f.get('fat')) || 0,
    });
    e.target.reset();
    closeSheet('#food-sheet');
    renderToday();
  });

  // Close food sheet → refresh today
  $('#food-sheet').addEventListener('click', (e) => {
    if (e.target === $('#food-sheet') || e.target.closest('[data-close]')) renderToday();
  });

  // ---------- Exercise sheet ----------
  $('#add-exercise').addEventListener('click', () => {
    $('#exercise-result').hidden = true;
    $('#exercise-result').textContent = '';
    $('#exercise-error').hidden = true;
    $('#exercise-ai-text').value = '';
    openSheet('#exercise-sheet');
  });

  $('#exercise-ai-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#exercise-ai-text').value.trim();
    if (!text) return;
    const busy = $('#exercise-busy'), errBox = $('#exercise-error'), out = $('#exercise-result');
    busy.hidden = false; errBox.hidden = true; out.hidden = true; out.textContent = '';
    try {
      const data = await api('/api/estimate/exercise', { method: 'POST', body: { description: text } });
      out.hidden = false;
      out.append(el('div', { class: 'result-card' },
        el('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:baseline' },
          el('strong', {}, data.name),
          el('span', { class: 'entry-cals' }, `~${kcal(data.calories_burned)} kcal`)),
        data.notes ? el('div', { class: 'notes' }, data.notes) : null,
        el('button', { class: 'btn primary full', onclick: async () => {
          await api('/api/exercises', { method: 'POST', body: { date: state.date, name: data.name, calories: round(data.calories_burned) } });
          closeSheet('#exercise-sheet');
          renderToday();
        } }, 'Log it'),
      ));
    } catch (err) {
      errBox.hidden = false; errBox.textContent = err.message;
    } finally { busy.hidden = true; }
  });

  $('#exercise-manual-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await api('/api/exercises', { method: 'POST', body: { date: state.date, name: f.get('name'), calories: Number(f.get('calories')) } });
    e.target.reset();
    closeSheet('#exercise-sheet');
    renderToday();
  });

  // ---------- Weight view ----------
  async function renderWeight() {
    $('#weigh-date').value = state.date <= localToday() ? state.date : localToday();
    let chart;
    try { chart = await api('/api/chart'); } catch (err) { alert(err.message); return; }
    drawChart(chart);
    renderProjections(chart);

    const list = $('#weight-list');
    list.textContent = '';
    const recent = [...chart.weights].reverse().slice(0, 14);
    if (!recent.length) list.append(el('li', { class: 'empty' }, 'No weigh-ins yet.'));
    for (const w of recent) {
      list.append(el('li', {},
        el('span', { class: 'entry-name' }, el('span', { class: 'n' }, fmtDate(w.date, { weekday: 'short', month: 'short', day: 'numeric', year: undefined }))),
        el('span', { class: 'entry-cals' }, `${w.weight_lbs} lbs`),
        el('span', { class: 'entry-act' },
          el('button', { 'aria-label': 'Delete', onclick: async () => { await api(`/api/weights/${w.date}`, { method: 'DELETE' }); renderWeight(); } }, '🗑')),
      ));
    }
  }

  $('#weigh-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/weights', { method: 'POST', body: { date: $('#weigh-date').value, weight_lbs: Number($('#weigh-lbs').value) } });
      $('#weigh-lbs').value = '';
      renderWeight();
    } catch (err) { alert(err.message); }
  });

  function renderProjections(chart) {
    const card = $('#projection-card');
    const body = $('#projection-body');
    body.textContent = '';
    const { projections: p, goalWeight } = chart;
    if (goalWeight == null) { card.hidden = true; return; }
    card.hidden = false;
    body.append(el('div', { class: 'proj-row' }, el('span', {}, 'Goal weight'), el('b', {}, `${goalWeight} lbs`)));
    if (p.planned) {
      body.append(el('div', { class: 'proj-row' },
        el('span', { class: 'swatch', style: 'border-color:var(--proj-planned)' }),
        el('span', {}, `Planned pace (${Math.abs(p.planned.ratePerWeek)} lbs/wk)`),
        el('b', {}, p.planned.projectedDate ? fmtDate(p.planned.projectedDate, { month: 'short', day: 'numeric', year: 'numeric' }) : '> 1 year')));
    }
    if (p.actual) {
      body.append(el('div', { class: 'proj-row' },
        el('span', { class: 'swatch', style: 'border-color:var(--proj-actual)' }),
        el('span', {}, `Actual pace (${p.actual.ratePerWeek > 0 ? '+' : ''}${p.actual.ratePerWeek} lbs/wk)`),
        el('b', {}, p.actual.projectedDate ? fmtDate(p.actual.projectedDate, { month: 'short', day: 'numeric', year: 'numeric' }) : 'not on track')));
    } else {
      body.append(el('div', { class: 'proj-row' },
        el('span', { class: 'swatch', style: 'border-color:var(--proj-actual)' }),
        el('span', { style: 'color:var(--text-muted)' }, 'Actual-pace projection appears after 14 days of weigh-ins')));
    }
  }

  // ---------- Chart (SVG) ----------
  const CHART = { w: 600, h: 320, top: 14, right: 16, bottom: 30, left: 44 };

  function drawChart(chart) {
    const svg = $('#weight-chart');
    const legend = $('#chart-legend');
    const empty = $('#chart-empty');
    svg.textContent = '';
    legend.textContent = '';

    const { weights, rolling, projections: proj, goalWeight } = chart;
    if (weights.length < 1) { empty.hidden = false; svg.setAttribute('height', '0'); return; }
    empty.hidden = true;

    const { w, h, top, right, bottom, left } = CHART;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.removeAttribute('height');

    // domain: dates & values across all series (+ goal)
    const allDates = [...weights.map((d) => d.date)];
    const allVals = [...weights.map((d) => d.weight_lbs), ...rolling.map((d) => d.weight_lbs)];
    for (const p of [proj.planned, proj.actual]) {
      if (p) { allDates.push(p.to.date); allVals.push(p.to.weight_lbs); }
    }
    if (goalWeight != null) allVals.push(goalWeight);

    const minD = toDate(weights[0].date).getTime();
    const maxD = Math.max(...allDates.map((d) => toDate(d).getTime()), minD + 86400000 * 7);
    let lo = Math.min(...allVals), hi = Math.max(...allVals);
    const padV = Math.max(2, (hi - lo) * 0.08);
    lo -= padV; hi += padV;

    const x = (dateStr) => left + ((toDate(dateStr).getTime() - minD) / (maxD - minD)) * (w - left - right);
    const y = (v) => top + (1 - (v - lo) / (hi - lo)) * (h - top - bottom);
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      return n;
    };

    // y gridlines: clean ticks
    const step = niceStep(hi - lo, 5);
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      svg.append(mk('line', { x1: left, x2: w - right, y1: y(v), y2: y(v), stroke: 'var(--grid)', 'stroke-width': 1 }));
      const t = mk('text', { x: left - 6, y: y(v) + 3.5, 'text-anchor': 'end', 'font-size': 10.5, fill: 'var(--text-muted)' });
      t.textContent = Math.round(v);
      svg.append(t);
    }
    // x ticks: ~4 evenly spaced dates
    const span = maxD - minD;
    for (let i = 0; i <= 3; i++) {
      const t0 = minD + (span * i) / 3;
      const ds = new Date(t0).toISOString().slice(0, 10);
      const t = mk('text', { x: left + ((t0 - minD) / span) * (w - left - right), y: h - 10, 'text-anchor': i === 0 ? 'start' : i === 3 ? 'end' : 'middle', 'font-size': 10.5, fill: 'var(--text-muted)' });
      t.textContent = toDate(ds).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      svg.append(t);
    }

    // goal line
    if (goalWeight != null) {
      svg.append(mk('line', { x1: left, x2: w - right, y1: y(goalWeight), y2: y(goalWeight), stroke: 'var(--baseline)', 'stroke-width': 1 }));
      const t = mk('text', { x: left + 4, y: y(goalWeight) - 4, 'text-anchor': 'start', 'font-size': 10.5, fill: 'var(--text-muted)' });
      t.textContent = `Goal ${goalWeight}`;
      svg.append(t);
    }

    // projections (dashed 2px, from last trend point)
    for (const [p, color] of [[proj.planned, 'var(--proj-planned)'], [proj.actual, 'var(--proj-actual)']]) {
      if (!p) continue;
      svg.append(mk('line', {
        x1: x(p.from.date), y1: y(p.from.weight_lbs), x2: x(p.to.date), y2: y(p.to.weight_lbs),
        stroke: color, 'stroke-width': 2, 'stroke-dasharray': '5 5', 'stroke-linecap': 'round',
      }));
    }

    // 7-day rolling average line (2px, round)
    if (rolling.length > 1) {
      const dAttr = rolling.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.weight_lbs).toFixed(1)}`).join(' ');
      svg.append(mk('path', { d: dAttr, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    }

    // raw weigh-in dots (r4 + 2px surface ring)
    for (const p of weights) {
      svg.append(mk('circle', { cx: x(p.date), cy: y(p.weight_lbs), r: 4, fill: 'var(--accent-soft)', stroke: 'var(--surface)', 'stroke-width': 2 }));
    }

    // direct label: latest trend value at line end
    const last = rolling[rolling.length - 1];
    if (last) {
      const t = mk('text', { x: x(last.date) + 6, y: y(last.weight_lbs) - 8, 'font-size': 11.5, 'font-weight': 650, fill: 'var(--text-secondary)' });
      t.textContent = `${last.weight_lbs}`;
      svg.append(t);
    }

    // crosshair (hidden until hover)
    const cross = mk('line', { x1: 0, x2: 0, y1: top, y2: h - bottom, stroke: 'var(--baseline)', 'stroke-width': 1, opacity: 0 });
    svg.append(cross);

    // legend
    const legendItems = [
      ['dot', 'var(--accent-soft)', 'Weigh-ins'],
      ['line', 'var(--accent)', '7-day average'],
    ];
    if (proj.planned) legendItems.push(['dashed', 'var(--proj-planned)', 'Planned pace']);
    if (proj.actual) legendItems.push(['dashed', 'var(--proj-actual)', 'Actual pace']);
    for (const [kind, color, label] of legendItems) {
      const sw = el('span', { class: `swatch ${kind === 'dot' ? 'dot' : kind === 'dashed' ? 'dashed' : ''}` });
      if (kind === 'dot') sw.style.background = color; else sw.style.borderTopColor = color;
      legend.append(el('span', { class: 'key' }, sw, label));
    }

    attachChartHover(svg, cross, { weights, rolling, proj, x, y, minD, maxD });
  }

  function niceStep(range, targetTicks) {
    const raw = range / targetTicks;
    const mag = 10 ** Math.floor(Math.log10(raw));
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
    return 10 * mag;
  }

  function attachChartHover(svg, cross, ctx) {
    const tooltip = $('#chart-tooltip');
    const wrap = $('#chart-wrap');
    const { weights, rolling, proj, x, minD, maxD } = ctx;
    const rawByDate = new Map(weights.map((p) => [p.date, p.weight_lbs]));
    const trendByDate = new Map(rolling.map((p) => [p.date, p.weight_lbs]));

    const projAt = (p, t) => {
      if (!p) return null;
      const t0 = toDate(p.from.date).getTime(), t1 = toDate(p.to.date).getTime();
      if (t < t0 || t > t1 || t1 === t0) return null;
      return p.from.weight_lbs + ((t - t0) / (t1 - t0)) * (p.to.weight_lbs - p.from.weight_lbs);
    };

    function onMove(ev) {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * CHART.w;
      if (px < CHART.left || px > CHART.w - CHART.right) return hide();
      // snap to nearest day
      const t = minD + ((px - CHART.left) / (CHART.w - CHART.left - CHART.right)) * (maxD - minD);
      const day = new Date(Math.round(t / 86400000) * 86400000).toISOString().slice(0, 10);
      const dayT = toDate(day).getTime();
      const cx = x(day);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
      cross.setAttribute('opacity', 1);

      const rows = [];
      if (rawByDate.has(day)) rows.push(['var(--accent-soft)', 'Weight', rawByDate.get(day)]);
      if (trendByDate.has(day)) rows.push(['var(--accent)', '7-day avg', trendByDate.get(day)]);
      const pl = projAt(proj.planned, dayT), ac = projAt(proj.actual, dayT);
      if (pl != null) rows.push(['var(--proj-planned)', 'Planned', Math.round(pl * 10) / 10]);
      if (ac != null) rows.push(['var(--proj-actual)', 'Actual pace', Math.round(ac * 10) / 10]);
      if (!rows.length) return hide();

      tooltip.textContent = '';
      tooltip.append(el('div', { class: 'tt-date' }, fmtDate(day, { month: 'short', day: 'numeric', year: 'numeric' })));
      for (const [color, label, val] of rows) {
        const key = el('span', { class: 'tt-key' }); key.style.borderTopColor = color;
        tooltip.append(el('div', { class: 'tt-row' }, key, el('span', {}, label), el('span', { class: 'tt-val' }, `${val} lbs`)));
      }
      tooltip.hidden = false;
      const wrapRect = wrap.getBoundingClientRect();
      const xpx = (cx / CHART.w) * rect.width;
      const flip = xpx > rect.width * 0.6;
      tooltip.style.left = flip ? '' : `${xpx + 12}px`;
      tooltip.style.right = flip ? `${rect.width - xpx + 12}px` : '';
      tooltip.style.top = `${Math.max(0, ev.clientY - wrapRect.top - 60)}px`;
    }
    function hide() {
      cross.setAttribute('opacity', 0);
      tooltip.hidden = true;
    }
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerleave', hide);
  }

  // ---------- Stats ----------
  $('#week-prev').addEventListener('click', () => { state.weekStart = addDays(state.weekStart, -7); renderStats(); });
  $('#week-next').addEventListener('click', () => { state.weekStart = addDays(state.weekStart, 7); renderStats(); });

  async function renderStats() {
    // Weekly summary
    const s = await api(`/api/summary?start=${state.weekStart}`);
    const thisMonday = mondayOf(localToday());
    $('#week-label').textContent = state.weekStart === thisMonday ? 'This week'
      : `${fmtDate(s.start, { month: 'short', day: 'numeric' })} – ${fmtDate(s.end, { month: 'short', day: 'numeric' })}`;
    $('#week-next').disabled = state.weekStart >= thisMonday;

    const tiles = $('#week-tiles');
    tiles.textContent = '';
    const deficitDelta = s.actualDeficit != null ? s.actualDeficit - s.plannedDeficit : null;
    const proteinDelta = (s.avgProtein != null && s.proteinTarget) ? s.avgProtein - s.proteinTarget : null;
    const tileData = [
      ['Avg calories', s.avgCalories != null ? kcal(s.avgCalories) : '—', null],
      ['Avg protein', s.avgProtein != null ? `${s.avgProtein}g` : '—',
        proteinDelta == null ? null : [`${proteinDelta >= 0 ? '+' : '−'}${Math.abs(proteinDelta)}g vs ${s.proteinTarget}g target`, proteinDelta >= 0 ? 'good' : 'bad']],
      ['Actual deficit', s.actualDeficit != null ? kcal(s.actualDeficit) : '—',
        deficitDelta == null ? null : [`${deficitDelta >= 0 ? '+' : '−'}${kcal(Math.abs(deficitDelta))} vs plan (${kcal(s.plannedDeficit)})`, deficitDelta >= 0 ? 'good' : 'bad']],
      ['Days logged', `${s.daysLogged}/7`, null],
    ];
    for (const [k, v, d] of tileData) {
      tiles.append(el('div', { class: 'stat-tile' },
        el('div', { class: 'k' }, k),
        el('div', { class: 'v' }, v),
        d ? el('div', { class: `d ${d[1]}` }, d[0]) : null));
    }

    const table = $('#week-table');
    const tbody = $('tbody', table);
    tbody.textContent = '';
    table.hidden = !s.days.length;
    for (const d of s.days) {
      tbody.append(el('tr', {},
        el('td', {}, fmtDate(d.date, { weekday: 'short' })),
        el('td', {}, kcal(d.calories)),
        el('td', {}, `${d.protein}g`),
        el('td', {}, kcal(d.actualDeficit))));
    }

    // TDEE card
    const t = await api('/api/tdee');
    const tb = $('#tdee-body');
    tb.textContent = '';
    tb.append(
      el('div', { class: 'tdee-line' }, el('span', {}, 'Mifflin-St Jeor estimate'), el('b', {}, `${kcal(t.formulaTdee)} kcal`)),
      el('div', { class: 'tdee-line' }, el('span', {}, 'Adaptive correction'), el('b', {}, `${t.adjustmentOffset >= 0 ? '+' : '−'}${kcal(Math.abs(t.adjustmentOffset))} kcal`)),
      el('div', { class: 'tdee-line' }, el('span', {}, el('strong', {}, 'Effective TDEE')), el('b', {}, `${kcal(t.effectiveTdee)} kcal`)),
    );
    if (t.adjustments.length) {
      for (const a of t.adjustments.slice(0, 6)) {
        tb.append(el('div', { class: 'adj-item' },
          `${fmtDate(a.period_start, { month: 'short', day: 'numeric' })} – ${fmtDate(a.period_end, { month: 'short', day: 'numeric' })}: ` +
          `${a.adjustment >= 0 ? '+' : '−'}${Math.abs(a.adjustment)} kcal/day (observed ~${kcal(a.observed_tdee)}, ` +
          `${a.weight_change_lbs <= 0 ? 'lost' : 'gained'} ${Math.abs(a.weight_change_lbs)} lbs)`));
      }
    } else {
      tb.append(el('div', { class: 'adj-item' }, 'Every 2 weeks, your average intake and actual weight change are compared to re-estimate your TDEE. Log food and weigh-ins consistently to enable it.'));
    }

    // History
    const h = await api('/api/history');
    const list = $('#history-list');
    list.textContent = '';
    if (!h.days.length) list.append(el('li', { class: 'empty' }, 'Logged days will appear here.'));
    for (const d of h.days) {
      const over = d.budget != null && d.calories > d.budget;
      list.append(el('li', { style: 'cursor:pointer', onclick: () => openDaySheet(d.date) },
        el('span', { class: 'entry-name' },
          el('span', { class: 'n' }, fmtDateLong(d.date)),
          el('span', { class: 'm' }, `${d.entries} items · P ${d.protein}g`)),
        el('span', { class: 'entry-cals', style: over ? 'color:var(--critical)' : 'color:var(--good)' },
          `${kcal(d.calories)}${d.budget != null ? ` / ${kcal(d.budget)}` : ''}`),
      ));
    }
  }

  async function openDaySheet(date) {
    const day = await api(`/api/day?date=${date}`);
    $('#day-sheet-title').textContent = fmtDate(date, { weekday: 'long', month: 'short', day: 'numeric' });
    const body = $('#day-sheet-body');
    body.textContent = '';
    body.append(el('div', { class: 'budget-math', style: 'justify-content:flex-start;margin:0 0 10px' },
      el('span', {}, el('b', {}, kcal(day.totals.calories)), ` / ${kcal(day.budget.budget)} kcal`),
      el('span', {}, el('b', {}, `${day.totals.protein}g`), ' protein')));
    for (const [key, label] of MEALS) {
      const entries = day.meals[key];
      if (!entries.length) continue;
      body.append(el('h2', { style: 'margin-top:12px' }, label));
      body.append(el('ul', { class: 'entry-list' }, entries.map((f) => foodRow(f, true))));
    }
    if (day.exercises.length) {
      body.append(el('h2', { style: 'margin-top:12px' }, 'Exercise'));
      body.append(el('ul', { class: 'entry-list' }, day.exercises.map((ex) => el('li', {},
        el('span', { class: 'entry-name' }, el('span', { class: 'n' }, ex.name)),
        el('span', { class: 'entry-cals' }, `+${kcal(ex.calories)}`)))));
    }
    openSheet('#day-sheet');
  }

  // ---------- Settings ----------
  function renderSettings() {
    const p = state.profile;
    const form = $('#settings-form');
    form.textContent = '';
    const field = (label, name, type, value, attrs = {}) => el('label', {}, label,
      el('input', { type, name, value: value ?? '', ...attrs }));
    const ft = Math.floor(p.height_in / 12), inch = Math.round(p.height_in % 12);

    const sexSel = el('select', { name: 'sex' },
      el('option', { value: 'male' }, 'Male'), el('option', { value: 'female' }, 'Female'));
    sexSel.value = p.sex;
    const actSel = el('select', { name: 'activity' },
      el('option', { value: 'sedentary' }, 'Sedentary'),
      el('option', { value: 'light' }, 'Lightly active'),
      el('option', { value: 'moderate' }, 'Moderately active'),
      el('option', { value: 'very' }, 'Very active'),
      el('option', { value: 'extra' }, 'Extra active'));
    actSel.value = p.activity;

    form.append(
      el('label', {}, 'Sex', sexSel),
      field('Age', 'age', 'number', p.age, { min: 13, max: 100 }),
      el('div', { class: 'row2' },
        field('Height (ft)', 'height_ft', 'number', ft, { min: 3, max: 7 }),
        field('Height (in)', 'height_in', 'number', inch, { min: 0, max: 11 })),
      field('Starting weight (lbs)', 'weight_lbs', 'number', p.weight_lbs, { step: 0.1 }),
      el('label', {}, 'Activity level', actSel),
      field('Daily deficit (kcal)', 'deficit', 'number', p.deficit, { min: 0, max: 1500, step: 50 }),
      field('Goal weight (lbs)', 'goal_weight_lbs', 'number', p.goal_weight_lbs, { step: 0.1 }),
      el('p', { class: 'hint', style: 'margin:2px 0 10px' }, 'Daily macro targets (grams, optional) — shown as progress on the Today screen.'),
      el('div', { class: 'row2' },
        field('Protein target', 'protein_target', 'number', p.protein_target, { min: 0, max: 1000 }),
        field('Carbs target', 'carbs_target', 'number', p.carbs_target, { min: 0, max: 1000 })),
      field('Fat target', 'fat_target', 'number', p.fat_target, { min: 0, max: 1000 }),
      el('button', { class: 'btn primary full', type: 'submit' }, 'Save changes'),
    );

    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const body = Object.fromEntries([...f.entries()].map(([k, v]) => [k, v === '' ? null : isNaN(v) ? v : Number(v)]));
      try {
        const { profile } = await api('/api/profile', { method: 'POST', body });
        state.profile = profile;
        alert('Saved.');
      } catch (err) { alert(err.message); }
    };
  }

  boot().catch((err) => alert('Failed to load: ' + err.message));
})();
