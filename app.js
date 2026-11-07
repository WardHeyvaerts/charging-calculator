// ── DATA ──────────────────────────────────────────────

// dcCurve: array van [soc%, kW] punten — reële laadsnelheid per SoC niveau (DC)
// wltpRange: officieel WLTP-bereik in km bij 100%
const CARS = [
  {
    id: 'tesla-m3-sr', name: 'Tesla Model 3 Highland Standard Range',
    capacity: 57.5, maxAC: 11, maxDC: 170, wltpRange: 513,
    dcCurve: [
      [2,148],[5,162],[10,170],[20,170],[30,162],[40,148],[50,130],
      [60,108],[70,82],[75,62],[78,50],[80,42],[85,32],[90,24],[95,16],[100,10]
    ]
  },
  {
    id: 'vw-id4-pro', name: 'VW ID.4 Pro',
    capacity: 77, maxAC: 11, maxDC: 135, wltpRange: 529,
    dcCurve: [
      [2,96],[5,120],[10,130],[20,135],[50,128],[60,100],[65,80],
      [70,65],[75,52],[80,40],[85,30],[90,22],[95,15],[100,8]
    ]
  },
  {
    id: 'volvo-ex60', name: 'Volvo EX60',
    capacity: 85, maxAC: 11, maxDC: 200, wltpRange: 460,
    dcCurve: [
      [2,162],[5,188],[10,198],[20,200],[35,198],[50,185],[62,150],
      [68,118],[73,88],[78,65],[80,55],[85,42],[90,30],[95,18],[100,10]
    ]
  },
  {
    id: 'tesla-m3-lr', name: 'Tesla Model 3 Highland Long Range',
    capacity: 75, maxAC: 11, maxDC: 250, wltpRange: 629,
    dcCurve: [
      [2,228],[5,248],[10,250],[20,250],[25,248],[30,242],[35,228],
      [40,214],[45,205],[50,196],[55,182],[60,162],[65,140],[70,112],
      [75,84],[78,68],[80,58],[83,48],[85,44],[88,37],[90,31],
      [93,24],[95,20],[97,16],[100,12]
    ]
  },
  {
    id: 'tesla-my-lr', name: 'Tesla Model Y Long Range (Juniper)',
    capacity: 75, maxAC: 11, maxDC: 250, wltpRange: 533,
    dcCurve: [
      [2,222],[5,244],[10,250],[20,250],[30,240],[40,215],[50,198],
      [60,165],[70,115],[75,85],[80,62],[85,46],[90,34],[95,22],[100,13]
    ]
  },
  {
    id: 'tesla-my-rwd', name: 'Tesla Model Y RWD (Juniper)',
    capacity: 57.5, maxAC: 7.2, maxDC: 170, wltpRange: 466,
    dcCurve: [
      [2,145],[5,162],[10,170],[25,170],[40,150],[55,128],[65,100],
      [73,72],[78,55],[80,46],[85,34],[90,24],[95,16],[100,10]
    ]
  },
  {
    id: 'ioniq6-lr-awd', name: 'Hyundai IONIQ 6 Long Range AWD',
    capacity: 74, maxAC: 11, maxDC: 240, wltpRange: 519,
    dcCurve: [
      [2,178],[5,212],[8,228],[12,240],[20,240],[30,238],[40,232],
      [50,220],[60,185],[65,155],[70,120],[75,88],[80,65],[85,48],
      [90,36],[95,24],[100,14]
    ]
  },
  {
    id: 'bmw-i4-ed40', name: 'BMW i4 eDrive40',
    capacity: 80.7, maxAC: 11, maxDC: 200, wltpRange: 590,
    dcCurve: [
      [2,158],[5,182],[10,194],[20,200],[40,195],[55,180],[65,140],
      [70,110],[75,82],[80,60],[85,44],[90,32],[95,20],[100,12]
    ]
  },
  {
    id: 'polestar2-lrsd', name: 'Polestar 2 Long Range Single Motor',
    capacity: 75, maxAC: 11, maxDC: 205, wltpRange: 551,
    dcCurve: [
      [2,152],[5,188],[10,198],[25,205],[50,196],[60,165],[68,125],
      [73,90],[78,68],[80,58],[85,42],[90,30],[95,18],[100,10]
    ]
  },
  { id: 'custom', name: '— Eigen wagen —', capacity: null, maxAC: null, maxDC: null, wltpRange: null, dcCurve: null },
];

const CONNECTORS = [
  { id: 'ac-type2',   label: 'AC Type 2 (thuis / publiek)', isDC: false },
  { id: 'dc-ccs',     label: 'DC CCS2 (snellader)',         isDC: true  },
  { id: 'tesla-sc',   label: 'Tesla Supercharger',          isDC: true  },
  { id: 'dc-chademo', label: 'DC CHAdeMO',                  isDC: true  },
];

// ── STATE ─────────────────────────────────────────────

let chargerIdCounter = 0;
const chargerIds = [];

// ── HELPERS ───────────────────────────────────────────

const $ = id => document.getElementById(id);

// Lineaire interpolatie op de laadcurve bij een gegeven SoC
function interpolateCurve(curve, soc) {
  if (soc <= curve[0][0]) return curve[0][1];
  if (soc >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];
  for (let i = 0; i < curve.length - 1; i++) {
    if (soc >= curve[i][0] && soc < curve[i + 1][0]) {
      const t = (soc - curve[i][0]) / (curve[i + 1][0] - curve[i][0]);
      return curve[i][1] + t * (curve[i + 1][1] - curve[i][1]);
    }
  }
  return curve[curve.length - 1][1];
}

// Bereken laadtijd via numerieke integratie (0.5% stappen)
// Houdt rekening met laadcurve EN paalbeperking
function calcTimeWithCurve(car, fromPct, toPct, actualMaxKw, isDC) {
  if (!isDC || !car.dcCurve) {
    const kwhNeeded = ((toPct - fromPct) / 100) * car.capacity;
    return (kwhNeeded / actualMaxKw) * 60;
  }
  const STEP = 0.5;
  let totalMin = 0;
  for (let soc = fromPct; soc < toPct; soc += STEP) {
    const curveKw     = interpolateCurve(car.dcCurve, soc + STEP / 2);
    const effectiveKw = Math.min(actualMaxKw, curveKw);
    const kwhStep     = (STEP / 100) * car.capacity;
    totalMin += (kwhStep / effectiveKw) * 60;
  }
  return totalMin;
}

function numVal(id) {
  const v = parseFloat($(id).value);
  return isNaN(v) ? null : v;
}

function fmt(val) {
  return '€ ' + val.toFixed(2);
}

function fmtTime(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} u`;
  return `${h} u ${m} min`;
}

// ── SAVED CARS (localStorage) ─────────────────────────

function loadSavedCars() {
  try { return JSON.parse(localStorage.getItem('savedCars') || '[]'); }
  catch { return []; }
}

function persistSavedCars(cars) {
  localStorage.setItem('savedCars', JSON.stringify(cars));
}

function saveCustomCar() {
  const name     = ($('c_name').value || '').trim();
  const capacity = numVal('c_cap');
  const maxAC    = numVal('c_ac');
  const maxDC    = numVal('c_dc');

  if (!name)                 return alert('Geef je wagen een naam.');
  if (!capacity || !maxAC || !maxDC) return alert('Vul capaciteit, max AC en max DC in.');

  const saved = loadSavedCars();
  const id    = 'saved_' + Date.now();
  saved.push({ id, name, capacity, maxAC, maxDC });
  persistSavedCars(saved);

  rebuildCarDropdown();
  $('car_select').value = id;
  $('custom_fields').classList.add('hidden');
  $('saved_car_actions').classList.add('hidden');
  recalculate();
}

function deleteCurrentCar() {
  const selId = $('car_select').value;
  const saved = loadSavedCars().filter(c => c.id !== selId);
  persistSavedCars(saved);
  rebuildCarDropdown();
  $('saved_car_actions').classList.add('hidden');
  recalculate();
}

function rebuildCarDropdown() {
  const sel   = $('car_select');
  const prevVal = sel.value;
  sel.innerHTML = '';

  const saved = loadSavedCars();

  if (saved.length > 0) {
    const grpSaved = document.createElement('optgroup');
    grpSaved.label = 'Mijn wagens';
    saved.forEach(car => {
      const opt = document.createElement('option');
      opt.value = car.id;
      opt.textContent = car.name;
      grpSaved.appendChild(opt);
    });
    sel.appendChild(grpSaved);
  }

  const grpPreset = document.createElement('optgroup');
  grpPreset.label = 'Vooringesteld';
  CARS.filter(c => c.id !== 'custom').forEach(car => {
    const opt = document.createElement('option');
    opt.value = car.id;
    opt.textContent = car.name;
    grpPreset.appendChild(opt);
  });
  sel.appendChild(grpPreset);

  const optCustom = document.createElement('option');
  optCustom.value = 'custom';
  optCustom.textContent = '— Eigen wagen —';
  sel.appendChild(optCustom);

  // restore selection if still valid
  const stillExists = [...sel.options].some(o => o.value === prevVal);
  sel.value = stillExists ? prevVal : (saved.length > 0 ? saved[0].id : CARS[0].id);
}

// ── CAR ───────────────────────────────────────────────

function getCarData() {
  const id = $('car_select').value;
  if (id === 'custom') {
    return { id: 'custom', capacity: numVal('c_cap'), maxAC: numVal('c_ac'), maxDC: numVal('c_dc'), wltpRange: numVal('c_range'), dcCurve: null };
  }
  if (id.startsWith('saved_')) {
    return loadSavedCars().find(c => c.id === id) || null;
  }
  return CARS.find(c => c.id === id) || null;
}

function rangeKm(car, pct) {
  if (!car || !car.wltpRange) return null;
  return Math.round((pct / 100) * car.wltpRange);
}

function updateCarSpecsBar(car) {
  const bar = $('car_specs_bar');
  if (!car || !car.capacity) { bar.innerHTML = ''; return; }
  bar.innerHTML =
    `<span class="spec">${car.capacity} kWh</span>` +
    `<span class="spec-dot">·</span>` +
    `<span class="spec">AC max <strong>${car.maxAC} kW</strong></span>` +
    `<span class="spec-dot">·</span>` +
    `<span class="spec">DC max <strong>${car.maxDC} kW</strong></span>`;
}

// ── BATTERY ───────────────────────────────────────────

function getKwhNeeded(car) {
  if (!car || !car.capacity) return null;
  const from = numVal('current_pct');
  const to   = numVal('target_pct');
  if (from === null || to === null || to <= from || from < 0 || to > 100) return null;
  return ((to - from) / 100) * car.capacity;
}

// ── CHARGER CARD ──────────────────────────────────────

function chargerCardHTML(id, num) {
  const connOptions = CONNECTORS.map(c =>
    `<option value="${c.id}">${c.label}</option>`
  ).join('');

  return `
    <div class="charger-header">
      <div class="charger-title">
        <span class="conn-badge" id="badge_${id}" data-conn="ac-type2">AC</span>
        <span class="charger-num">Laadpaal ${num}</span>
      </div>
      <button class="btn-delete" onclick="removeCharger(${id})">✕</button>
    </div>

    <div class="charger-fields">
      <div class="field">
        <label>Type aansluiting</label>
        <select id="connector_${id}" class="input-select">${connOptions}</select>
      </div>
      <div class="field">
        <label>Paalvermogen (kW)</label>
        <input type="number" id="kw_${id}" inputmode="decimal" placeholder="bv. 50" />
      </div>
      <div class="field">
        <label>Kost per kWh (€)</label>
        <input type="number" id="kwh_rate_${id}" inputmode="decimal" placeholder="bv. 0.45" />
      </div>
      <div class="field">
        <label>Transactiekosten (€)</label>
        <input type="number" id="tx_${id}" inputmode="decimal" value="0.35" />
      </div>

      <button class="extra-toggle" id="extra_btn_${id}" onclick="toggleExtra(${id})">
        <span class="arrow">›</span> Meer opties
      </button>
      <div class="extra-fields" id="extra_fields_${id}">
        <div class="field">
          <label>Minuuttarief (€/min)</label>
          <input type="number" id="min_rate_${id}" inputmode="decimal" placeholder="optioneel" />
        </div>
        <div class="field">
          <label>Blokkeringstarief (€/min)</label>
          <input type="number" id="blk_rate_${id}" inputmode="decimal" placeholder="optioneel" />
        </div>
        <div class="field">
          <label>Blokkering na (min na volledig laden)</label>
          <input type="number" id="blk_after_${id}" inputmode="decimal" placeholder="optioneel" />
        </div>
        <div class="field">
          <label>Blokkering duur (min)</label>
          <input type="number" id="blk_dur_${id}" inputmode="decimal" placeholder="optioneel" />
        </div>
      </div>
    </div>

    <div id="result_${id}" class="charger-result"></div>
  `;
}

function addCharger() {
  chargerIdCounter++;
  const id  = chargerIdCounter;
  const num = chargerIdCounter;
  chargerIds.push(id);

  const card = document.createElement('div');
  card.className = 'card charger-card';
  card.id = `charger_card_${id}`;
  card.dataset.conn = 'ac-type2';
  card.innerHTML = chargerCardHTML(id, num);
  $('chargers').appendChild(card);

  // live recalc on any input change
  const fields = ['connector', 'kw', 'kwh_rate', 'tx', 'min_rate', 'blk_rate', 'blk_after', 'blk_dur'];
  fields.forEach(prefix => {
    const el = $(`${prefix}_${id}`);
    if (el) el.addEventListener('input', recalculate);
  });

  $(`connector_${id}`).addEventListener('change', () => {
    updateConnBadge(id);
    recalculate();
  });

  recalculate();
}

function removeCharger(id) {
  const idx = chargerIds.indexOf(id);
  if (idx > -1) chargerIds.splice(idx, 1);
  const card = $(`charger_card_${id}`);
  if (card) card.remove();
  recalculate();
}

function toggleExtra(id) {
  const btn    = $(`extra_btn_${id}`);
  const fields = $(`extra_fields_${id}`);
  btn.classList.toggle('open');
  fields.classList.toggle('open');
}

function updateConnBadge(id) {
  const connId = $(`connector_${id}`).value;
  const conn   = CONNECTORS.find(c => c.id === connId);
  const badge  = $(`badge_${id}`);
  const card   = $(`charger_card_${id}`);

  badge.textContent   = conn.isDC ? 'DC' : 'AC';
  badge.dataset.conn  = connId;
  card.dataset.conn   = connId;
}

// ── CALCULATION ───────────────────────────────────────

function calcCharger(id, car, kwhNeeded, fromPct, toPct) {
  const pctDiff  = toPct - fromPct;
  const connId   = $(`connector_${id}`).value;
  const conn     = CONNECTORS.find(c => c.id === connId);
  const chargerKw = numVal(`kw_${id}`);
  const kwhRate   = numVal(`kwh_rate_${id}`);

  if (chargerKw === null || kwhRate === null || chargerKw <= 0 || kwhRate < 0) return null;

  const carLimit  = conn.isDC ? car.maxDC : car.maxAC;
  const actualKw  = carLimit ? Math.min(chargerKw, carLimit) : chargerKw;
  const limited   = carLimit !== null && chargerKw > carLimit;
  const chargingMin = calcTimeWithCurve(car, fromPct, toPct, actualKw, conn.isDC);

  const energyCost = kwhNeeded * kwhRate;

  const minRate    = numVal(`min_rate_${id}`);
  const minuteCost = (minRate !== null && minRate > 0) ? chargingMin * minRate : 0;

  const blkRate = numVal(`blk_rate_${id}`);
  const blkDur  = numVal(`blk_dur_${id}`);
  const blockingCost = (blkRate !== null && blkRate > 0 && blkDur !== null && blkDur > 0)
    ? blkRate * blkDur : 0;

  const txCost = numVal(`tx_${id}`) ?? 0;
  const total  = energyCost + minuteCost + blockingCost + txCost;

  return {
    actualKw, chargerKw, carLimit, limited, chargingMin,
    energyCost, minuteCost, blockingCost, txCost, total,
    costPerPct: total / pctDiff,
    isDC: conn.isDC,
    toPct,
    hasCurve: !!(car.dcCurve && conn.isDC),
    addedKm: rangeKm(car, pctDiff),
  };
}

function renderChargerResult(id, r) {
  const el = $(`result_${id}`);
  if (!r) { el.className = 'charger-result'; el.innerHTML = ''; return; }

  const speedNote = r.limited
    ? `<span class="speed-limited">⚠ Paal ${r.chargerKw} kW → beperkt tot ${r.actualKw} kW door wagen</span>`
    : `<span class="speed-ok">✓ ${r.actualKw} kW</span>`;

  const dcWarning = r.hasCurve
    ? `<span class="res-note curve-note">✓ Berekend via laadcurve</span>`
    : (r.isDC && r.toPct > 80 ? `<span class="res-note">⚠ Schatting — DC vertraagt boven 80%</span>` : '');

  let html = `
    <div class="res-speed">
      ${speedNote}
      <span>· ${fmtTime(r.chargingMin)}</span>
      ${dcWarning}
    </div>
    <div class="res-breakdown">
      <div class="res-row"><span>Energiekosten</span><strong>${fmt(r.energyCost)}</strong></div>
  `;

  if (r.minuteCost > 0)   html += `<div class="res-row"><span>Minuutkosten</span><strong>${fmt(r.minuteCost)}</strong></div>`;
  if (r.blockingCost > 0) html += `<div class="res-row"><span>Blokkering</span><strong>${fmt(r.blockingCost)}</strong></div>`;
  if (r.txCost > 0)       html += `<div class="res-row"><span>Transactiekosten</span><strong>${fmt(r.txCost)}</strong></div>`;

  html += `
      <div class="res-row total"><span>Totaal</span><strong>${fmt(r.total)}</strong></div>
      <div class="res-row per-pct"><span>Kost per %</span><strong>${fmt(r.costPerPct)} / %</strong></div>
      ${r.addedKm !== null ? `<div class="res-row per-pct"><span>Bereik toegevoegd</span><strong>~${r.addedKm} km <span class="wltp-note">WLTP</span></strong></div>` : ''}
    </div>
  `;

  el.innerHTML = html;
  el.className = 'charger-result visible';
}

// ── CURVE CHART ───────────────────────────────────────

function renderCurveChart(car, fromPct, toPct) {
  const container = $('curve_chart');
  if (!container) return;

  if (!car || !car.dcCurve) {
    container.innerHTML = car && car.id === 'custom'
      ? '<p class="curve-unavail">Geen laadcurve beschikbaar voor eigen wagen</p>'
      : '';
    return;
  }

  const W = 300, H = 82;
  const PL = 28, PR = 6, PT = 6, PB = 16;
  const PW = W - PL - PR;
  const PH = H - PT - PB;
  const maxKw = car.maxDC;

  const sx = soc => PL + (soc / 100) * PW;
  const sy = kw  => PT + PH - (kw / maxKw) * PH;

  // Horizontale gridlijnen + y-labels
  let grid = '';
  [0, 0.25, 0.5, 0.75, 1].forEach(f => {
    const y  = sy(maxKw * f);
    const kw = Math.round(maxKw * f);
    grid += `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="#1c2231" stroke-width="1"/>`;
    if (f > 0) grid += `<text x="${PL - 3}" y="${y + 3}" font-size="7" fill="#484f58" text-anchor="end">${kw}</text>`;
  });

  // Gemarkeerde SoC-zone
  let zone = '';
  const validRange = fromPct !== null && toPct !== null && toPct > fromPct;
  if (validRange) {
    const x1 = sx(fromPct), x2 = sx(toPct);
    zone  = `<rect x="${x1}" y="${PT}" width="${x2 - x1}" height="${PH}" fill="rgba(63,185,80,0.13)" rx="1"/>`;
    zone += `<line x1="${x1}" y1="${PT}" x2="${x1}" y2="${PT + PH}" stroke="rgba(63,185,80,0.45)" stroke-width="1" stroke-dasharray="3,2"/>`;
    zone += `<line x1="${x2}" y1="${PT}" x2="${x2}" y2="${PT + PH}" stroke="rgba(63,185,80,0.45)" stroke-width="1" stroke-dasharray="3,2"/>`;
  }

  // Vulpad onder curve
  const first = car.dcCurve[0];
  const last  = car.dcCurve[car.dcCurve.length - 1];
  const fillD = `M${sx(first[0])},${sy(first[1])} ` +
    car.dcCurve.slice(1).map(([s, k]) => `L${sx(s)},${sy(k)}`).join(' ') +
    ` L${sx(last[0])},${PT + PH} L${sx(first[0])},${PT + PH} Z`;

  // Curvepunten voor de lijn
  const linePoints = car.dcCurve.map(([s, k]) => `${sx(s)},${sy(k)}`).join(' ');

  // X-labels
  let xLabels = '';
  [0, 20, 40, 60, 80, 100].forEach(soc => {
    xLabels += `<text x="${sx(soc)}" y="${H - 2}" font-size="7" fill="#484f58" text-anchor="middle">${soc}%</text>`;
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#58a6ff" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#58a6ff" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${grid}
      ${zone}
      <path d="${fillD}" fill="url(#cg)"/>
      <polyline points="${linePoints}" fill="none" stroke="#58a6ff" stroke-width="1.8"
        stroke-linejoin="round" stroke-linecap="round"/>
      <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${PT + PH}" stroke="#30363d" stroke-width="1"/>
      <line x1="${PL}" y1="${PT + PH}" x2="${W - PR}" y2="${PT + PH}" stroke="#30363d" stroke-width="1"/>
      ${xLabels}
      <text x="${W - PR}" y="${PT + 9}" font-size="7" fill="#484f58" text-anchor="end">max ${maxKw} kW</text>
      <text x="${PL}" y="${PT + 9}" font-size="7" fill="#484f58">kW</text>
    </svg>`;
}

// ── COMPARISON ────────────────────────────────────────

function updateComparison(results) {
  const section = $('compare_section');
  if (results.length < 2) { section.classList.add('hidden'); return; }

  section.classList.remove('hidden');
  const sorted = [...results].sort((a, b) => a.r.total - b.r.total);
  const best   = sorted[0].r.total;

  $('compare_body').innerHTML = sorted.map(({ id, r }, i) => {
    const num  = chargerIds.indexOf(id) + 1;
    const diff = i === 0 ? '' : `<span class="diff">+${fmt(r.total - best)}</span>`;
    const cls  = i === 0 ? 'cmp-row best' : 'cmp-row';
    const badge = i === 0 ? `<span class="cmp-best-badge">goedkoopst</span>` : '';
    return `<div class="${cls}"><span>Laadpaal ${num}</span><strong>${fmt(r.total)}</strong>${diff}${badge}</div>`;
  }).join('');
}

// ── MASTER RECALCULATE ────────────────────────────────

function recalculate() {
  const car = getCarData();
  updateCarSpecsBar(car);

  const from      = numVal('current_pct');
  const to        = numVal('target_pct');
  const kwhNeeded = getKwhNeeded(car);
  const pctDiff   = (from !== null && to !== null) ? to - from : null;

  const validRange = from !== null && to !== null && to > from;
  renderCurveChart(car, validRange ? from : null, validRange ? to : null);

  const badge = $('kwh_badge');
  const rangeBadge = $('range_badge');

  if (kwhNeeded !== null && kwhNeeded > 0) {
    badge.innerHTML = `Te laden: <strong>${kwhNeeded.toFixed(1)} kWh</strong> (${pctDiff}%)`;
    badge.className = 'kwh-badge visible';

    const addedKm  = rangeKm(car, pctDiff);
    const totalKm  = rangeKm(car, to);
    if (addedKm !== null) {
      rangeBadge.innerHTML = `+<strong>~${addedKm} km</strong> bereik · ~${totalKm} km na laden <span class="wltp-note">WLTP</span>`;
      rangeBadge.className = 'range-badge visible';
    } else {
      rangeBadge.className = 'range-badge';
    }
  } else {
    badge.className = 'kwh-badge';
    rangeBadge.className = 'range-badge';
  }

  const results = [];
  chargerIds.forEach(id => {
    const r = (kwhNeeded !== null && kwhNeeded > 0 && car && car.capacity)
      ? calcCharger(id, car, kwhNeeded, from, to)
      : null;
    renderChargerResult(id, r);
    if (r) results.push({ id, r });
  });

  updateComparison(results);
}

// ── INIT ──────────────────────────────────────────────

function init() {
  rebuildCarDropdown();

  $('car_select').addEventListener('change', () => {
    const id = $('car_select').value;
    $('custom_fields').classList.toggle('hidden', id !== 'custom');
    $('saved_car_actions').classList.toggle('hidden', !id.startsWith('saved_'));
    recalculate();
  });

  $('save_car_btn').addEventListener('click', saveCustomCar);
  $('delete_car_btn').addEventListener('click', deleteCurrentCar);

  ['current_pct', 'target_pct'].forEach(id => $(id).addEventListener('input', recalculate));
  ['c_cap', 'c_ac', 'c_dc', 'c_range'].forEach(id => $(id).addEventListener('input', recalculate));

  $('add_btn').addEventListener('click', addCharger);

  addCharger();
}

init();
