/*
 * ECO TRACK — MEMBER A STARTER APP
 * The factor numbers below are deliberately illustrative placeholders.
 * Replace them with values and source names agreed with Member B / mentor.
 * Formula: amount × factor = estimated kg CO2e.
 */

const STORAGE_KEY = 'ecoTrack.activities.v1';
const API_BASE = 'http://127.0.0.1:8000';
const CATEGORIES = {
  transport: { label: 'Transport', icon: '↗', color: '#27845a' },
  electricity: { label: 'Electricity', icon: 'ϟ', color: '#e6a73b' },
  fuel: { label: 'Fuel', icon: '◉', color: '#427d9b' },
  waste: { label: 'Waste', icon: '♻', color: '#9b75bd' },
};
function fallbackRecommendation(entry) {
  if (entry.category === 'transport') {
    if (['car', 'auto', 'motorcycle'].includes(entry.mode)) return {
      title: `For your ${labelForMode(entry.mode).toLowerCase()} trip`,
      action: 'For a similar trip, consider public transit, sharing the ride, or combining errands if practical.',
    };
    if (['bus', 'metro'].includes(entry.mode)) return {
      title: `Keep using ${labelForMode(entry.mode).toLowerCase()}`,
      action: 'For a very short trip, consider walking or cycling when the route is safe and practical.',
    };
    return { title: 'Keep this low-emission choice', action: 'Consider walking or cycling for other short trips when safe and practical.' };
  }
  if (entry.category === 'electricity') return {
    title: 'For your next electricity bill',
    action: 'Switch off devices that are not in use; choose a fan over AC when you are comfortable.',
  };
  if (entry.category === 'fuel') return {
    title: `For your ${entry.fuelType} entry`,
    action: 'Combine nearby errands where possible and avoid leaving the engine running while parked.',
  };
  if (entry.category === 'waste') {
    const alreadyManaged = ['recycled', 'reused'].includes(entry.disposal);
    return {
      title: `${capitalize(entry.material)} packaging`,
      action: alreadyManaged
        ? 'Keep reusing or recycling it, and choose less packaging for a future delivery when possible.'
        : 'For a future delivery, decline items you do not need and reuse or recycle packaging where available.',
    };
  }
  return { title: 'Review this activity', action: 'Look for a practical lower-emission option for a similar activity.' };
}

// Electricity source: NITI Aayog, Scenarios Towards Viksit Bharat and Net Zero:
// Sectoral Insights — Power, Table E.1. The report cites CEA grid data.
// This is the India weighted-average grid factor for FY 2024–25, reported as CO2.
const INDIA_ELECTRICITY_FY24_25 = 0.710;
const ELECTRICITY_FACTOR_SOURCE = 'NITI Aayog / CEA, FY 2024–25 grid factor (kg CO₂/kWh). This is CO₂, not a full life-cycle CO₂e factor.';
const ELECTRICITY_SOURCE_URL = 'https://www.niti.gov.in/sites/default/files/2026-02/Scenarios-Towards-Viksit-Bharat-and-Net-Zero-Sectoral-Insights-Power.pdf';

// DEMO PLACEHOLDERS ONLY for transport, fuel and waste. Replace these with
// values, units, scope and sources agreed with Member B / your mentor.
// Each factor's unit must match the quantity unit entered in the form.
const DEMO_FACTORS = {
  transport: { walk: 0.01, cycle: 0.01, bus: 0.08, metro: 0.05, auto: 0.12, car: 0.18, motorcycle: 0.09 }, // kg CO2e / passenger-km (illustrative)
  fuel: { petrol: 2.30, diesel: 2.68 }, // kg CO2e / litre (illustrative)
  waste: { cardboard: 0.35, plastic: 1.80, mixed: 0.90 }, // kg CO2e / kg waste (illustrative)
};

const category = document.querySelector('#category');
const dynamicFields = document.querySelector('#dynamic-fields');
const form = document.querySelector('#activity-form');
const periodSelect = document.querySelector('#period-select');
let entries = loadEntries();
let toastTimer;

function loadEntries() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function apiPayloadFor(entry) {
  const unit = entry.category === 'transport' ? 'km'
    : entry.category === 'electricity' ? 'kWh'
    : entry.category === 'fuel' ? 'L'
    : entry.category === 'waste' ? 'kg' : 'unit';
  return {
    name: titleFor(entry),
    category: entry.category,
    quantity: number(entry.amount),
    unit,
    estimated_kg_co2e: number(entry.kgCO2e),
    entry_json: entry,
  };
}

function entryFromApiRow(row) {
  if (row && row.entry && typeof row.entry === 'object') return row.entry;
  if (row && typeof row.entry_json === 'string') {
    try { return JSON.parse(row.entry_json); } catch { /* use fallback below */ }
  }
  // Compatibility fallback for rows created before full entry details were stored.
  return {
    id: String(row.id), category: row.category, amount: number(row.quantity),
    date: (row.created_at || new Date().toISOString()).slice(0, 10),
    kgCO2e: number(row.estimated_kg_co2e), factor: null,
    factorSource: 'Imported from the EcoTrack SQLite database.',
  };
}

async function apiGetEntries() {
  const response = await fetch(`${API_BASE}/activities`);
  if (!response.ok) throw new Error(`GET /activities failed (${response.status})`);
  const rows = await response.json();
  return rows.map(entryFromApiRow).filter((entry) => CATEGORIES[entry.category]);
}

async function apiSaveEntry(entry) {
  const response = await fetch(`${API_BASE}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(apiPayloadFor(entry)),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`POST /activities failed (${response.status}): ${detail}`);
  }
  return response.json();
}

async function syncWithBackend() {
  try {
    let remoteEntries = await apiGetEntries();
    const remoteIds = new Set(remoteEntries.map((entry) => String(entry.id)));
    // Migrate existing browser-saved entries to SQLite once, without re-uploading matching IDs.
    for (const localEntry of entries) {
      if (!remoteIds.has(String(localEntry.id))) {
        await apiSaveEntry(localEntry);
        remoteIds.add(String(localEntry.id));
      }
    }
    remoteEntries = await apiGetEntries();
    entries = remoteEntries;
    saveEntries();
    renderDashboard();
    console.info(`EcoTrack backend connected. Loaded ${entries.length} activities from SQLite.`);
  } catch (error) {
    console.warn('EcoTrack backend is not connected; continuing with browser storage.', error);
  }
}

function localISO(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localISO(date);
}

function prettyDate(iso) {
  if (!iso) return 'Date not set';
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function factorFor(entry) {
  if (entry.category === 'transport') return DEMO_FACTORS.transport[entry.mode] ?? 0;
  if (entry.category === 'electricity') return INDIA_ELECTRICITY_FY24_25;
  if (entry.category === 'fuel') return DEMO_FACTORS.fuel[entry.fuelType] ?? 0;
  if (entry.category === 'waste') return DEMO_FACTORS.waste[entry.material] ?? 0;
  return 0;
}

function calculate(entry) {
  const factor = factorFor(entry);
  const kgCO2e = number(entry.amount) * factor;
  return { factor, kgCO2e };
}

function factorSourceFor(entry) {
  if (entry.category === 'electricity') return ELECTRICITY_FACTOR_SOURCE;
  return 'Illustrative demo placeholder — replace with your team’s verified factor and source.';
}

function amountText(entry) {
  if (entry.category === 'transport') return `${entry.amount} km · ${labelForMode(entry.mode)}`;
  if (entry.category === 'electricity') return `${entry.amount} kWh · ${prettyDate(entry.startDate)} – ${prettyDate(entry.endDate)}`;
  if (entry.category === 'fuel') return `${entry.amount} L · ${entry.fuelType}`;
  if (entry.category === 'waste') return `${entry.amount} kg · ${entry.material}`;
  return `${entry.amount}`;
}

function labelForMode(mode) {
  return ({ walk: 'Walking', cycle: 'Cycling', bus: 'Bus', metro: 'Metro/train', auto: 'Auto/cab', car: 'Car', motorcycle: 'Motorcycle' })[mode] || mode;
}

function titleFor(entry) {
  if (entry.category === 'transport') return `${labelForMode(entry.mode)} trip`;
  if (entry.category === 'electricity') return 'Electricity bill';
  if (entry.category === 'fuel') return `${capitalize(entry.fuelType)} fuel`; 
  if (entry.category === 'waste') return `${capitalize(entry.material)} packaging`;
  return 'Activity';
}

function capitalize(value = '') { return value.charAt(0).toUpperCase() + value.slice(1); }

function spanForEntry(entry) {
  if (entry.category === 'electricity') return { start: entry.startDate, end: entry.endDate };
  return { start: entry.date, end: entry.date };
}

// Allocate an electricity bill evenly across the days it covers for daily/weekly views.
function emissionInRange(entry, start, end) {
  const span = spanForEntry(entry);
  const billDays = Math.max(1, Math.round((new Date(`${span.end}T12:00:00`) - new Date(`${span.start}T12:00:00`)) / 86400000) + 1);
  const overlapStart = span.start > start ? span.start : start;
  const overlapEnd = span.end < end ? span.end : end;
  if (overlapStart > overlapEnd) return 0;
  const overlapDays = Math.round((new Date(`${overlapEnd}T12:00:00`) - new Date(`${overlapStart}T12:00:00`)) / 86400000) + 1;
  return calculate(entry).kgCO2e * overlapDays / billDays;
}

function selectedRange() {
  const today = localISO();
  if (periodSelect.value === 'today') return { start: today, end: today, label: 'today' };
  if (periodSelect.value === 'year') return { start: `${today.slice(0, 4)}-01-01`, end: today, label: 'this year' };
  if (periodSelect.value === 'month') {
    const first = `${today.slice(0, 7)}-01`;
    const lastDay = new Date(new Date(`${first}T12:00:00`).getFullYear(), new Date(`${first}T12:00:00`).getMonth() + 1, 0).getDate();
    return { start: first, end: `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`, label: 'this month' };
  }
  // Monday through Sunday, including today.
  const day = new Date(`${today}T12:00:00`).getDay();
  const sinceMonday = (day + 6) % 7;
  const monday = addDays(today, -sinceMonday);
  return { start: monday, end: addDays(monday, 6), label: 'this week' };
}

function entriesInRange(start, end) {
  return entries.filter((entry) => emissionInRange(entry, start, end) > 0 || (() => {
    const span = spanForEntry(entry);
    return span.start <= end && span.end >= start;
  })());
}

function totalsForRange(start, end) {
  const totals = Object.fromEntries(Object.keys(CATEGORIES).map((key) => [key, 0]));
  for (const entry of entriesInRange(start, end)) totals[entry.category] += emissionInRange(entry, start, end);
  return totals;
}

function renderDashboard() {
  const range = selectedRange();
  const selectedEntries = entriesInRange(range.start, range.end);
  const totals = totalsForRange(range.start, range.end);
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const biggest = sorted.find(([, value]) => value > 0);

  document.querySelector('#period-label').textContent = range.label;
  document.querySelector('#total-value').textContent = selectedEntries.length ? total.toFixed(2) : '—';
  document.querySelector('#entry-count').textContent = String(selectedEntries.length);
  document.querySelector('#top-category').textContent = biggest ? CATEGORIES[biggest[0]].label : '—';
  document.querySelector('#top-category-copy').textContent = biggest
    ? `${biggest[1].toFixed(2)} kg CO₂e estimated in ${range.label}.`
    : 'Add an activity to see your biggest source.';
  document.querySelector('#top-category-icon').textContent = biggest ? CATEGORIES[biggest[0]].icon : '✳';

  renderCategoryList(totals, total);
  renderComparison();
  renderRecommendations(totals, range);
  renderEngagement();
  renderHistory(selectedEntries);
  renderTrend();
}

function renderEngagement() {
  const today = localISO();
  const weekday = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
  const weekStart = addDays(today, -weekday);
  const weekEntries = entriesInRange(weekStart, today);
  const greenerTripModes = ['walk', 'cycle', 'bus', 'metro'];
  const tripCount = weekEntries.filter((entry) => entry.category === 'transport' && greenerTripModes.includes(entry.mode)).length;
  const packagingCount = weekEntries.filter((entry) => entry.category === 'waste' && ['reused', 'recycled'].includes(entry.disposal)).length;

  const challenges = [
    { title: 'Try a lower-impact commute', detail: 'Log one walking, cycling, bus, or metro trip this week.', count: tripCount, target: 1 },
    { title: 'Give packaging another use', detail: 'Log one delivery package as reused or recycled this week.', count: packagingCount, target: 1 },
  ];
  const challengeList = document.querySelector('#challenge-list');
  challengeList.replaceChildren();
  for (const challenge of challenges) {
    const card = document.createElement('div'); card.className = 'challenge-item';
    const header = document.createElement('div'); header.className = 'challenge-header';
    const title = document.createElement('strong'); title.textContent = challenge.title;
    const progressText = document.createElement('span'); progressText.textContent = `${Math.min(challenge.count, challenge.target)} / ${challenge.target}`;
    header.append(title, progressText);
    const detail = document.createElement('p'); detail.textContent = challenge.detail;
    const track = document.createElement('div'); track.className = 'challenge-track';
    const fill = document.createElement('div'); fill.className = 'challenge-fill';
    fill.style.width = `${Math.min(100, challenge.count / challenge.target * 100)}%`;
    if (challenge.count >= challenge.target) fill.classList.add('complete');
    track.append(fill);
    const status = document.createElement('small');
    status.textContent = challenge.count >= challenge.target ? 'Challenge complete!' : 'Progress updates when you save a matching activity.';
    card.append(header, detail, track, status); challengeList.append(card);
  }

  const badges = [
    { icon: '✳', title: 'First Footprint', detail: 'Logged your first activity', earned: entries.length > 0 },
    { icon: '↗', title: 'Ride Explorer', detail: 'Logged a walk, cycle, bus, or metro trip', earned: entries.some((entry) => entry.category === 'transport' && greenerTripModes.includes(entry.mode)) },
    { icon: '♻', title: 'Packaging Reuser', detail: 'Reused or recycled delivery packaging', earned: entries.some((entry) => entry.category === 'waste' && ['reused', 'recycled'].includes(entry.disposal)) },
    { icon: '✓', title: 'Weekly Check-in', detail: 'Logged 3 activities in one week', earned: entries.some((entry) => {
      const date = entry.category === 'electricity' ? entry.endDate : entry.date;
      if (!date) return false;
      const day = new Date(`${date}T12:00:00`);
      const monday = addDays(date, -((day.getDay() + 6) % 7));
      return entriesInRange(monday, addDays(monday, 6)).length >= 3;
    }) },
  ];
  const badgeList = document.querySelector('#badge-list');
  badgeList.replaceChildren();
  for (const badge of badges) {
    const item = document.createElement('div'); item.className = `badge-item${badge.earned ? ' earned' : ''}`;
    const icon = document.createElement('span'); icon.className = 'badge-icon'; icon.textContent = badge.icon;
    const text = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = badge.title;
    const detail = document.createElement('small'); detail.textContent = badge.detail;
    text.append(title, detail); item.append(icon, text); badgeList.append(item);
  }
  document.querySelector('#badge-count').textContent = `${badges.filter((badge) => badge.earned).length} of ${badges.length} earned`;
}

// Compare the selected period with the equivalent elapsed dates in the
// previous period. Missing activity logs are never treated as zero emissions.
function comparisonRanges() {
  const today = localISO();
  const todayDate = new Date(`${today}T12:00:00`);

  if (periodSelect.value === 'today') {
    const yesterday = addDays(today, -1);
    return { label: 'CHANGE VS YESTERDAY', current: [today, today], previous: [yesterday, yesterday] };
  }

  if (periodSelect.value === 'week') {
    const weekday = (todayDate.getDay() + 6) % 7;
    const monday = addDays(today, -weekday);
    return {
      label: 'CHANGE VS LAST WEEK',
      current: [monday, today],
      previous: [addDays(monday, -7), addDays(today, -7)],
    };
  }

  if (periodSelect.value === 'month') {
    const currentStart = `${today.slice(0, 7)}-01`;
    const previousMonthDate = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1, 12);
    const previousStart = localISO(previousMonthDate);
    const previousLastDay = new Date(previousMonthDate.getFullYear(), previousMonthDate.getMonth() + 1, 0).getDate();
    const day = Math.min(todayDate.getDate(), previousLastDay);
    const previousEnd = `${previousStart.slice(0, 7)}-${String(day).padStart(2, '0')}`;
    return { label: 'CHANGE VS LAST MONTH', current: [currentStart, today], previous: [previousStart, previousEnd] };
  }

  const currentStart = `${today.slice(0, 4)}-01-01`;
  const previousYear = todayDate.getFullYear() - 1;
  const previousLastDay = new Date(previousYear, todayDate.getMonth() + 1, 0).getDate();
  const previousDay = Math.min(todayDate.getDate(), previousLastDay);
  const previousEnd = `${previousYear}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(previousDay).padStart(2, '0')}`;
  return { label: 'CHANGE VS LAST YEAR', current: [currentStart, today], previous: [`${previousYear}-01-01`, previousEnd] };
}

function renderComparison() {
  const valueEl = document.querySelector('#comparison-value');
  const copyEl = document.querySelector('#comparison-copy');
  const labelEl = document.querySelector('#comparison-label');
  const ranges = comparisonRanges();
  labelEl.textContent = ranges.label;
  const [currentStart, currentEnd] = ranges.current;
  const [previousStart, previousEnd] = ranges.previous;
  const currentEntries = entriesInRange(currentStart, currentEnd);
  const previousEntries = entriesInRange(previousStart, previousEnd);

  if (!currentEntries.length || !previousEntries.length) {
    valueEl.textContent = '—';
    copyEl.textContent = 'Record activities in both periods to compare your estimated emissions.';
    valueEl.classList.remove('comparison-down', 'comparison-up');
    return;
  }

  const sumRange = (start, end) => entriesInRange(start, end)
    .reduce((sum, entry) => sum + emissionInRange(entry, start, end), 0);
  const current = sumRange(currentStart, currentEnd);
  const previous = sumRange(previousStart, previousEnd);
  const change = current - previous;
  const amount = Math.abs(change).toFixed(2);
  valueEl.classList.remove('comparison-down', 'comparison-up');

  if (Math.abs(change) < 0.005) {
    valueEl.textContent = 'No change';
    copyEl.textContent = 'Recorded emissions are about the same as the previous 7 days.';
  } else if (change < 0) {
    valueEl.textContent = `↓ ${amount} kg`;
    valueEl.classList.add('comparison-down');
    copyEl.textContent = 'less estimated CO₂e recorded than in the previous 7 days.';
  } else {
    valueEl.textContent = `↑ ${amount} kg`;
    valueEl.classList.add('comparison-up');
    copyEl.textContent = 'more estimated CO₂e recorded than in the previous 7 days.';
  }
}

function renderRecommendations(totals, range) {
  const list = document.querySelector('#recommendation-list');
  const empty = document.querySelector('#recommendation-empty');
  list.replaceChildren();
  const activities = entriesInRange(range.start, range.end)
    .sort((a, b) => (spanForEntry(b).end || '').localeCompare(spanForEntry(a).end || ''));
  empty.style.display = activities.length ? 'none' : 'block';
  if (!activities.length) return;

  // Member B may provide one result for each activity:
  // window.EcoTrackRecommendations.getRecommendations({ totals, entries, period })
  // Return [{ entryId, title, action, potentialSavedKgCO2e? }].
  let supplied = [];
  try {
    const result = window.EcoTrackRecommendations?.getRecommendations?.({
      totals: { ...totals },
      entries: activities.map((entry) => ({ ...entry })),
      period: range.label,
    });
    if (Array.isArray(result)) supplied = result;
  } catch (error) {
    console.warn('Recommendation module could not provide suggestions.', error);
  }
  const byEntry = new Map(supplied.map((item) => [item.entryId, item]));

  for (const entry of activities) {
    const key = entry.category;
    const provided = byEntry.get(entry.id);
    const fallback = fallbackRecommendation(entry);
    const item = document.createElement('div'); item.className = 'recommendation-item';
    const icon = document.createElement('span'); icon.className = 'recommendation-icon'; icon.textContent = CATEGORIES[key].icon;
    const text = document.createElement('div'); text.className = 'recommendation-text';
    const title = document.createElement('strong'); title.textContent = provided?.title || fallback.title;
    const action = document.createElement('p'); action.textContent = provided?.action || fallback.action;
    const context = document.createElement('div'); context.className = 'recommendation-context';
    if (Number.isFinite(provided?.potentialSavedKgCO2e)) {
      context.textContent = `Potential saving: ${provided.potentialSavedKgCO2e.toFixed(2)} kg CO₂e (estimate)`;
    } else {
      context.textContent = `For: ${titleFor(entry)} · ${amountText(entry)}`;
    }
    text.append(title, action, context); item.append(icon, text); list.append(item);
  }
}

function renderCategoryList(totals, total) {
  const list = document.querySelector('#category-list');
  const empty = document.querySelector('#category-empty');
  const items = Object.entries(totals).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  list.replaceChildren();
  empty.style.display = items.length ? 'none' : 'flex';
  for (const [key, value] of items) {
    const row = document.createElement('div'); row.className = 'category-row';
    const name = document.createElement('span'); name.className = 'cat-name'; name.textContent = CATEGORIES[key].label;
    const track = document.createElement('div'); track.className = 'cat-track';
    const fill = document.createElement('div'); fill.className = 'cat-fill';
    fill.style.width = `${Math.max(2, value / total * 100)}%`; fill.style.background = CATEGORIES[key].color;
    track.append(fill);
    const amount = document.createElement('span'); amount.className = 'cat-amount'; amount.textContent = `${value.toFixed(2)} kg`;
    row.append(name, track, amount); list.append(row);
  }
}

function renderHistory(list) {
  const container = document.querySelector('#history-list');
  const empty = document.querySelector('#history-empty');
  container.replaceChildren();
  empty.style.display = list.length ? 'none' : 'flex';
  document.querySelector('#history-add').style.display = list.length ? 'inline' : 'none';
  const sorted = [...list].sort((a, b) => (spanForEntry(b).end || '').localeCompare(spanForEntry(a).end || ''));
  for (const entry of sorted.slice(0, 6)) {
    const row = document.createElement('div'); row.className = 'history-row';
    const icon = document.createElement('span'); icon.className = 'history-icon'; icon.textContent = CATEGORIES[entry.category].icon;
    const main = document.createElement('span'); main.className = 'history-main';
    const title = document.createElement('strong'); title.textContent = titleFor(entry);
    const details = document.createElement('small'); details.textContent = amountText(entry);
    main.append(title, details);
    const cat = document.createElement('span'); cat.className = 'history-category'; cat.textContent = CATEGORIES[entry.category].label;
    const co2 = document.createElement('span'); co2.className = 'history-co2'; co2.textContent = `${calculate(entry).kgCO2e.toFixed(2)} kg CO₂e`;
    row.append(icon, main, cat, co2); container.append(row);
  }
}

function renderTrend() {
  const chart = document.querySelector('#trend-chart'); chart.replaceChildren();
  const today = localISO();
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const values = days.map((day) => totalsForRange(day, day));
  const sums = values.map((item) => Object.values(item).reduce((sum, value) => sum + value, 0));
  const max = Math.max(...sums, 0.01);
  days.forEach((day, index) => {
    const col = document.createElement('div'); col.className = `trend-day${day === today ? ' today' : ''}`;
    const value = document.createElement('span'); value.className = 'trend-value'; value.textContent = sums[index] ? sums[index].toFixed(1) : '—';
    const wrap = document.createElement('div'); wrap.className = 'trend-bar-wrap';
    const bar = document.createElement('div'); bar.className = 'trend-bar'; bar.style.height = sums[index] ? `${Math.max(5, sums[index] / max * 100)}%` : '3px';
    wrap.append(bar);
    const label = document.createElement('span'); label.className = 'trend-label'; label.textContent = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
    col.append(value, wrap, label); chart.append(col);
  });
}

function renderFields() {
  const type = category.value;
  const date = localISO();
  const commonDate = `<div class="field-wrap"><label class="field-label" for="activity-date">Date</label><input class="input-control" id="activity-date" type="date" value="${date}" required /></div>`;
  if (type === 'transport') {
    dynamicFields.innerHTML = `
      <label class="field-label" for="mode">How did you travel?</label>
      <select id="mode" class="input-control" required>
        <option value="bus">Bus</option><option value="metro">Metro / train</option><option value="auto">Auto / cab</option><option value="car">Car</option><option value="motorcycle">Motorcycle</option><option value="cycle">Bicycle</option><option value="walk">Walking</option>
      </select>
      <div class="two-fields"><div class="field-wrap"><label class="field-label" for="amount">Distance</label><input class="input-control" id="amount" type="number" min="0.1" step="0.1" placeholder="e.g. 8" required /><p class="field-help">Enter the passenger distance for this trip in kilometres.</p></div>${commonDate}</div>
      <p class="field-help">The app asks you to confirm the mode. GPS does not identify it.</p>`;
  } else if (type === 'electricity') {
    dynamicFields.innerHTML = `
      <div class="field-wrap"><label class="field-label" for="amount">Electricity used (kWh or units)</label><input class="input-control" id="amount" type="number" min="0.1" step="0.1" placeholder="Find this on your bill" required /><p class="field-help">Enter the usage amount, not the rupee bill total.</p></div>
      <div class="two-fields"><div class="field-wrap"><label class="field-label" for="start-date">Bill start date</label><input class="input-control" id="start-date" type="date" required /></div><div class="field-wrap"><label class="field-label" for="end-date">Bill end date</label><input class="input-control" id="end-date" type="date" value="${date}" required /></div></div>
      <label class="field-label" for="region">Region / state</label><input class="input-control" id="region" type="text" placeholder="Needed for a local electricity factor" required />
      <p class="field-help">This bill is spread across its bill dates in daily and weekly views.</p>`;
    document.querySelector('#start-date').value = date.slice(0, 8) + '01';
  } else if (type === 'fuel') {
    dynamicFields.innerHTML = `
      <label class="field-label" for="fuel-type">Fuel type</label><select id="fuel-type" class="input-control"><option value="petrol">Petrol</option><option value="diesel">Diesel</option></select>
      <div class="two-fields"><div class="field-wrap"><label class="field-label" for="amount">Fuel used (litres)</label><input class="input-control" id="amount" type="number" min="0.1" step="0.1" placeholder="e.g. 3" required /></div>${commonDate}</div>
      <p class="field-help">Use this fuel method instead of also adding the same car trip under distance-based transport.</p>`;
  } else {
    dynamicFields.innerHTML = `
      <label class="field-label" for="material">Packaging / waste type</label><select id="material" class="input-control"><option value="cardboard">Cardboard / paper</option><option value="plastic">Plastic packaging</option><option value="mixed">Mixed packaging</option></select>
      <div class="two-fields"><div class="field-wrap"><label class="field-label" for="amount">Approximate amount (kg)</label><input class="input-control" id="amount" type="number" min="0.01" step="0.01" placeholder="Estimate the packaging weight" required /></div>${commonDate}</div>
      <label class="field-label" for="disposal">What happened to it?</label><select id="disposal" class="input-control"><option value="discarded">Thrown away</option><option value="recycled">Recycled</option><option value="reused">Reused</option><option value="unknown">Not sure</option></select>
      <p class="field-help">A packaging estimate needs its type and approximate amount. This demo factor is illustrative.</p>`;
  }
  updateReceiptPreview();
}

function readDraft() {
  const type = category.value;
  const amountInput = document.querySelector('#amount');
  if (!amountInput) return null;
  const entry = { id: 'preview', category: type, amount: number(amountInput.value) };
  if (type === 'transport') { entry.mode = document.querySelector('#mode').value; entry.date = document.querySelector('#activity-date').value; }
  if (type === 'electricity') {
    entry.startDate = document.querySelector('#start-date').value; entry.endDate = document.querySelector('#end-date').value;
    entry.date = entry.endDate; entry.region = document.querySelector('#region').value.trim();
  }
  if (type === 'fuel') { entry.fuelType = document.querySelector('#fuel-type').value; entry.date = document.querySelector('#activity-date').value; }
  if (type === 'waste') { entry.material = document.querySelector('#material').value; entry.disposal = document.querySelector('#disposal').value; entry.date = document.querySelector('#activity-date').value; }
  return entry;
}

function updateReceiptPreview() {
  const entry = readDraft();
  if (!entry) return;
  const value = entry.amount > 0 ? calculate(entry).kgCO2e.toFixed(2) : '—';
  document.querySelector('#preview-activity').textContent = titleFor(entry);
  document.querySelector('#preview-amount').textContent = entry.amount > 0 ? amountText(entry) : 'Enter an amount';
  document.querySelector('#preview-total').innerHTML = `${value} <small>kg CO₂e</small>`;
  document.querySelector('#preview-source').innerHTML = entry.category === 'electricity'
    ? `${INDIA_ELECTRICITY_FY24_25.toFixed(3)} kg CO₂/kWh · ${ELECTRICITY_FACTOR_SOURCE}<br><a href="${ELECTRICITY_SOURCE_URL}" target="_blank" rel="noreferrer">Open source report</a>`
    : factorSourceFor(entry);
  document.querySelector('.receipt-foot').textContent = entry.category === 'electricity'
    ? 'Electricity factor is India’s FY 2024–25 grid average. The bill period and regional limitations still apply.'
    : 'This category still uses an illustrative placeholder. Replace it with a sourced factor before presenting its result as verified.';
}

function showPage(page) {
  const dashboard = page === 'dashboard';
  document.querySelector('#dashboard-page').classList.toggle('hidden', !dashboard);
  document.querySelector('#add-page').classList.toggle('hidden', dashboard);
  document.querySelector('#page-title').textContent = dashboard ? 'Your dashboard' : 'Add an activity';
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
  if (!dashboard) renderFields();
  else renderDashboard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function notify(message) {
  const toast = document.querySelector('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.page)));
['#top-add', '#history-add', '#empty-add'].forEach((selector) => document.querySelector(selector).addEventListener('click', () => showPage('add')));
document.querySelector('#cancel-entry').addEventListener('click', () => showPage('dashboard'));
document.querySelector('#category').addEventListener('change', renderFields);
document.querySelector('#dynamic-fields').addEventListener('input', updateReceiptPreview);
document.querySelector('#dynamic-fields').addEventListener('change', updateReceiptPreview);
periodSelect.addEventListener('change', renderDashboard);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const entry = readDraft();
  if (!entry || entry.amount <= 0) return;
  if (entry.category === 'electricity' && entry.endDate < entry.startDate) {
    notify('The bill end date must be after its start date.'); return;
  }
  const { factor, kgCO2e } = calculate(entry);
  entry.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  entry.factor = factor;
  entry.factorSource = factorSourceFor(entry);
  entry.kgCO2e = kgCO2e;
  entry.createdAt = new Date().toISOString();

  try {
    await apiSaveEntry(entry);
    entries.push(entry);
    saveEntries();
    document.querySelector('#period-select').value = entry.category === 'electricity' ? 'month' : 'week';
    showPage('dashboard');
    notify(`Saved to SQLite · ${kgCO2e.toFixed(2)} kg CO₂e (demo estimate)`);
  } catch (error) {
    console.error('Could not save to the backend; saving locally instead.', error);
    entries.push(entry);
    saveEntries();
    document.querySelector('#period-select').value = entry.category === 'electricity' ? 'month' : 'week';
    showPage('dashboard');
    notify('Backend unavailable: saved in this browser only.');
  }
  form.reset(); category.value = 'transport'; renderFields();
});

// Shared read-only interface for Member B's recommendation module.
// Example: window.EcoTrack.getSummary('week') returns category totals and the biggest source.
window.EcoTrack = {
  getEntries: () => structuredClone(entries),
  getSummary(period = 'week') {
    const today = localISO();
    let start = today; let end = today;
    if (period === 'month') { start = `${today.slice(0, 7)}-01`; end = today; }
    if (period === 'week') { const offset = (new Date(`${today}T12:00:00`).getDay() + 6) % 7; start = addDays(today, -offset); end = today; }
    const totals = totalsForRange(start, end);
    const biggest = Object.entries(totals).sort((a, b) => b[1] - a[1]).find(([, value]) => value > 0);
    return { period, start, end, totals, totalKgCO2e: Object.values(totals).reduce((sum, value) => sum + value, 0), biggestCategory: biggest?.[0] ?? null };
  },
};

renderFields();
renderDashboard();
syncWithBackend();
