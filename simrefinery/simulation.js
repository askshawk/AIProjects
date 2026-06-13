/* ============================================================
   SimRefinery 2.0 — a refinery process + economic simulation
   Inspired by the lost 1992 Maxis "SimRefinery" (Chevron Richmond).
   ============================================================ */

// ---------- Static data ----------

// Crude slates: yield fractions sum ~1. Heavier crude -> more bottoms, more sulfur.
const CRUDES = {
    light:  { name: 'Light Sweet',  sulfur: 0.5, basePrice: 68.74,
              yields: { lpg:0.04, naphtha:0.26, kero:0.16, diesel:0.22, gasoil:0.20, resid:0.12 } },
    medium: { name: 'Medium Sour',  sulfur: 1.5, basePrice: 65.87,
              yields: { lpg:0.03, naphtha:0.20, kero:0.14, diesel:0.21, gasoil:0.24, resid:0.18 } },
    heavy:  { name: 'Heavy Sour',   sulfur: 3.0, basePrice: 63.62,
              yields: { lpg:0.02, naphtha:0.14, kero:0.11, diesel:0.18, gasoil:0.27, resid:0.28 } },
};

// Final products and their market base prices ($/bbl, sulfur $/t)
const PRODUCTS = {
    gasoline:   { name: 'Gasoline',   base: 105.79 },
    jet:        { name: 'Jet fuel',   base: 96.73 },
    diesel:     { name: 'Diesel',     base: 88.92 },
    heatingoil: { name: 'Heating oil',base: 68.23 },
    lpg:        { name: 'LPG',        base: 34.32 },
    sulfur:     { name: 'Sulfur ($/t)', base: 82 },
};

// Intermediate + product streams shown in the left palette, with colors
const STREAMS = [
    { id:'crude',    name:'CRUDE',    color:'#3b2b1a' },
    { id:'lpg',      name:'C3-C4',    color:'#d96cd9' },
    { id:'naphtha',  name:'NAPHTHA',  color:'#e8d44a' },
    { id:'reformate',name:'REFORMATE',color:'#e89a3c' },
    { id:'fccgaso',  name:'FCC GASO', color:'#e85c3c' },
    { id:'alkylate', name:'ALKYLATE', color:'#9ce83c' },
    { id:'jet',      name:'JET',      color:'#6cc8e8' },
    { id:'diesel',   name:'DIESEL',   color:'#c89a3c' },
    { id:'gasoil',   name:'GAS OIL',  color:'#8a6c3c' },
    { id:'resid',    name:'RESIDUUM', color:'#222' },
    { id:'sulfur',   name:'SULFUR',   color:'#e8e83c' },
];

// Snapshot the default market prices so scenario setups (which tweak them)
// never permanently drift the tables across retries.
const ORIG_PROD_BASE = Object.fromEntries(Object.entries(PRODUCTS).map(([k,v]) => [k, v.base]));
const ORIG_CRUDE_BASE = Object.fromEntries(Object.entries(CRUDES).map(([k,v]) => [k, v.basePrice]));

// Economic balance constants.
const MAINT_FULL = 3.0e6;     // maintenance $/week at 100% spending
const ENERGY_PER_BBL = 2.0;   // utilities $/bbl processed

// Refinery units. capacity = bbl/day throughput. severity = adjustable run setting.
function makeUnits() {
    return {
        cdu:  { id:'cdu',  name:'Crude Distillation', short:'CDU',  cap:100000, cond:88, press:60, severity:90, mode:'AUTO', x:140, y:120, online:true },
        reformer:{ id:'reformer', name:'Reformer', short:'REF', cap:30000, cond:63, press:55, severity:80, mode:'AUTO', x:330, y:100, online:true },
        fcc:  { id:'fcc',  name:'Cat Cracker (FCC)', short:'FCC', cap:45000, cond:60, press:70, severity:85, mode:'AUTO', x:330, y:260, online:true },
        hydro:{ id:'hydro',name:'Hydrotreater', short:'HDT', cap:50000, cond:45, press:50, severity:75, mode:'AUTO', x:150, y:320, online:true },
        alky: { id:'alky', name:'Alkylation', short:'ALK', cap:15000, cond:70, press:45, severity:70, mode:'AUTO', x:330, y:420, online:true },
        coker:{ id:'coker',name:'Coker', short:'COK', cap:25000, cond:55, press:65, severity:75, mode:'AUTO', x:500, y:300, online:true },
    };
}

// Scenarios. Each tweaks starting cash, crude slate, prices, conditions.
const SCENARIOS = [
    { id:'continue', name:'Continue saved game', desc:'Week 3, cash $24.2M, steady scenario.',
      setup:(g)=>{ g.cash=24.2e6; g.week=3; } },
    { id:'training', name:'Operator Training', desc:'New here? Ten guided tasks: feed, pressure, crude slates, treating, severity, turnarounds.',
      setup:(g)=>{ g.cash=15e6; g.training=true; } },
    { id:'steady', name:'Steady State', desc:'Light crude, healthy plant. Learn how the units connect.',
      setup:(g)=>{ g.cash=20e6; g.slate='light'; Object.values(g.units).forEach(u=>u.cond=Math.max(u.cond,80)); } },
    { id:'heavy', name:'Heavy Crude', desc:'Heavy sour crude is $10/bbl cheap. The hydrotreater is the bottleneck.',
      setup:(g)=>{ g.cash=20e6; g.slate='heavy'; g.units.hydro.cond=40; CRUDES.heavy.basePrice-=4; } },
    { id:'winter', name:'Winter Demand', desc:'Heating oil prices are spiking. Re-cut the barrel toward the bottom.',
      setup:(g)=>{ g.cash=20e6; PRODUCTS.heatingoil.base=92; PRODUCTS.diesel.base=99; } },
    { id:'failure', name:'Run to Failure', desc:'Every unit is worn and cash is thin. Stabilize before it spirals.',
      setup:(g)=>{ g.cash=4e6; Object.values(g.units).forEach(u=>{u.cond=Math.min(u.cond,32);}); } },
    { id:'wreck', name:'Wreck the Refinery', desc:"The instructor's exercise: abuse the settings, destroy the plant, get fired.",
      setup:(g)=>{ g.cash=20e6; g.sandbox=true; } },
];

// ---------- Game state ----------
let G = null;

function newGame(scenario) {
    G = {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        cash: 20e6,
        startCash: 20e6,
        totalProfit: 0,
        week: 1,
        day: 0,           // total days elapsed
        date: new Date(1992, 0, 1, 8, 0),
        units: makeUnits(),
        slate: 'medium',          // which crude is being bought
        tank: 450000,             // crude in tank (bbl)
        tankMax: 900000,
        tankerDays: 3,            // days until next tanker
        tankerSize: 667000,
        lastTanker: 667000,
        maint: 100,               // maintenance budget %
        streams: {},              // current stream rates
        production: {},           // final product rates
        prices: {},               // current product prices
        crudePrices: {},          // current crude prices
        explosions: 0,
        breakdowns: 0,
        paused: false,
        speed: 1,
        log: [],
        selectedUnit: null,
        selectedStream: null,
        gameOver: false,
        grade: '—',
        weekStartProfit: 0,
        training: false,
        sandbox: false,
    };
    // reset any price-table mutations from a previous scenario run
    for (const k in PRODUCTS) PRODUCTS[k].base = ORIG_PROD_BASE[k];
    for (const k in CRUDES) CRUDES[k].basePrice = ORIG_CRUDE_BASE[k];
    // init markets
    for (const k in PRODUCTS) G.prices[k] = PRODUCTS[k].base;
    for (const k in CRUDES) G.crudePrices[k] = CRUDES[k].basePrice;
    scenario.setup(G);
    G.startCash = G.cash;
    STREAMS.forEach(s => G.streams[s.id] = 0);
    for (const k in PRODUCTS) G.production[k] = 0;
    logEvent(`Scenario started: ${scenario.name}`);
    stepSimulation(); // prime numbers
}

// ---------- The process + economic model ----------
// Runs one simulated day.
function stepSimulation() {
    if (!G || G.gameOver) return;
    const u = G.units;

    // 1. Crude feed limited by CDU capacity, condition, severity, and tank.
    const cduRun = u.cdu.online ? (u.cdu.cap * (u.cdu.severity/100) * condFactor(u.cdu.cond)) : 0;
    const feed = Math.min(cduRun, G.tank);
    G.tank = Math.max(0, G.tank - feed);
    if (feed < cduRun * 0.6 && cduRun > 0) logOnce('lowfeed', '⚠ Crude tank running low — distillation starved.');

    // 2. Distillation splits crude into cuts by the slate's yields.
    const slate = CRUDES[G.slate];
    const cut = {};
    for (const frac in slate.yields) cut[frac] = feed * slate.yields[frac];

    // 3. Downstream conversion units.
    // Reformer: naphtha -> reformate (+ a little LPG), needs hydrotreated naphtha.
    const refRun = unitThroughput(u.reformer, cut.naphtha);
    const reformate = refRun * 0.82;
    const refLpg = refRun * 0.06;
    const naphthaToGaso = cut.naphtha - refRun; // light straight-run naphtha to gasoline pool

    // FCC: gas oil -> FCC gasoline + LPG (olefins) + some light cycle oil to diesel.
    const fccRun = unitThroughput(u.fcc, cut.gasoil);
    const fccGaso = fccRun * 0.55;
    const fccLpg = fccRun * 0.18;
    const fccLco = fccRun * 0.20; // light cycle oil -> diesel/heating

    // Coker: residuum -> coker gas oil + coke + light ends.
    const cokerRun = unitThroughput(u.coker, cut.resid);
    const cokerGasoil = cokerRun * 0.45;
    const cokerDistillate = cokerRun * 0.25;

    // Alkylation: LPG olefins -> alkylate (premium gasoline).
    const olefins = fccLpg + refLpg + cut.lpg;
    const alkyFeed = olefins * 0.45;
    const alkyRun = unitThroughput(u.alky, alkyFeed);
    const alkylate = alkyRun * 0.9;
    const lpgProduct = olefins - alkyRun; // leftover LPG sold

    // Hydrotreater: desulfurizes diesel/gasoil streams; removes sulfur as elemental.
    const sulfurFeed = (cut.diesel + cut.gasoil + fccLco) ;
    const hdtRun = unitThroughput(u.hydro, sulfurFeed);
    const sulfurRecovered = hdtRun * (slate.sulfur/100) * 5.0; // tons/day approx
    const treatedDiesel = Math.min(cut.diesel + fccLco + cokerDistillate, hdtRun);

    // 4. Blend final products.
    const prod = {
        gasoline: reformate + fccGaso + alkylate + naphthaToGaso*0.6,
        jet: cut.kero,
        diesel: treatedDiesel,
        heatingoil: (cut.gasoil - fccRun) + cokerGasoil*0.5,
        lpg: Math.max(0, lpgProduct),
        sulfur: sulfurRecovered,
    };
    for (const k in prod) prod[k] = Math.max(0, prod[k]);
    G.production = prod;

    // 5. Update palette stream rates.
    G.streams.crude = feed;
    G.streams.lpg = olefins;
    G.streams.naphtha = cut.naphtha;
    G.streams.reformate = reformate;
    G.streams.fccgaso = fccGaso;
    G.streams.alkylate = alkylate;
    G.streams.jet = cut.kero;
    G.streams.diesel = treatedDiesel;
    G.streams.gasoil = cut.gasoil;
    G.streams.resid = cut.resid;
    G.streams.sulfur = sulfurRecovered;

    // 6. Economics (per day).
    let revenue = 0;
    for (const k in prod) {
        if (k === 'sulfur') revenue += prod[k] * G.prices.sulfur;
        else revenue += prod[k] * G.prices[k];
    }
    const crudeCost = feed * G.crudePrices[G.slate]; // crude is expensed as it's processed
    const energyCost = feed * ENERGY_PER_BBL; // utilities
    const maintCostDaily = (MAINT_FULL * (G.maint/100)) / 7;
    const dayProfit = revenue - crudeCost - energyCost - maintCostDaily;
    G.cash += dayProfit;
    G.totalProfit += dayProfit;
    G.dayRevenue = revenue;
    G.dayCrudeCost = crudeCost;

    // 7. Unit condition dynamics.
    for (const id in u) {
        const unit = u[id];
        if (!unit.online) continue;
        // wear increases with severity & pressure; maintenance offsets.
        const wear = (unit.severity/100) * (unit.press/100) * 0.9;
        const repair = (G.maint - 100) > 0 ? (G.maint-100)/100 * 0.7 : 0;
        unit.cond = clamp(unit.cond - wear + repair - 0.15, 0, 100);
        // random breakdown / explosion chance
        riskCheck(unit);
    }

    // 8. Crude logistics: tanker arrivals (refill only — crude is expensed as
    //    it's processed in step 6, so there is no separate purchase charge).
    G.tankerDays -= 1;
    if (G.tankerDays <= 0) {
        const load = G.tankerSize;
        G.tank = Math.min(G.tankMax, G.tank + load);
        G.lastTanker = load;
        G.tankerDays = 3 + Math.floor(Math.random()*2);
        logEvent(`Tanker delivered ${fmtBig(load)} bbl ${CRUDES[G.slate].name}.`);
    }

    // 9. Market drift.
    driftMarkets();

    // 10. Time + week handling.
    G.day += 1;
    G.date = new Date(G.date.getTime() + 24*3600*1000);
    if (G.day % 7 === 0) endOfWeek();

    // 11. Failure conditions.
    if (G.cash <= -20e6) return firePlayer('Cash fell below −$20M. You have been fired.');
    if (G.explosions >= 2) return firePlayer('A second explosion destroyed the plant. You have been fired.');

    renderAll();
}

function condFactor(cond) { return 0.4 + 0.6 * (cond/100); } // worn units run slower
function unitThroughput(unit, feed) {
    if (!unit.online) return 0;
    const cap = unit.cap * (unit.severity/100) * condFactor(unit.cond);
    return Math.min(cap, feed);
}
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

function riskCheck(unit) {
    // Higher pressure + lower condition raises incident odds.
    const stress = (unit.press/100) * (1 - unit.cond/100);
    if (Math.random() < stress * 0.012) {
        // breakdown
        unit.online = false;
        unit.cond = clamp(unit.cond - 10, 0, 100);
        G.breakdowns++;
        logEvent(`🔧 BREAKDOWN: ${unit.name} tripped offline (condition ${Math.round(unit.cond)}%).`);
    }
    if (unit.press > 80 && unit.cond < 30 && Math.random() < stress * 0.004) {
        // explosion
        unit.online = false;
        unit.cond = clamp(unit.cond - 40, 0, 100);
        G.explosions++;
        G.cash -= 6e6;
        logEvent(`💥 EXPLOSION at ${unit.name}! Damage −$6M. Explosions: ${G.explosions}/2.`);
    }
}

function driftMarkets() {
    for (const k in G.prices) {
        const base = (k==='sulfur') ? PRODUCTS.sulfur.base : PRODUCTS[k].base;
        const drift = (Math.random()-0.5) * base * 0.02;
        G.prices[k] = clamp(G.prices[k] + drift, base*0.7, base*1.4);
        G._priceDir = G._priceDir || {};
    }
    for (const k in G.crudePrices) {
        const base = CRUDES[k].basePrice;
        const drift = (Math.random()-0.5) * base * 0.015;
        G.crudePrices[k] = clamp(G.crudePrices[k] + drift, base*0.8, base*1.25);
    }
}

function endOfWeek() {
    G.week++;
    const weekProfit = G.totalProfit - G.weekStartProfit;
    G.weekStartProfit = G.totalProfit;
    // grade based on weekly profit
    const g = weekProfit > 8e6 ? 'A' : weekProfit > 3e6 ? 'B' : weekProfit > 0 ? 'C' : weekProfit > -3e6 ? 'D' : 'F';
    G.grade = g;
    logEvent(`📊 Week ${G.week-1} review: profit ${fmtMoney(weekProfit)} — grade ${g}.`);
}

function firePlayer(msg) {
    G.gameOver = true;
    G.paused = true;
    logEvent('❌ ' + msg);
    showModal('Game Over', `
        <h3 style="color:#b02020">You're fired.</h3>
        <p>${msg}</p>
        <table>
          <tr><td>Weeks operated</td><td>${G.week}</td></tr>
          <tr><td>Total profit</td><td>${fmtMoney(G.totalProfit)}</td></tr>
          <tr><td>Breakdowns</td><td>${G.breakdowns}</td></tr>
          <tr><td>Explosions</td><td>${G.explosions}</td></tr>
        </table>
        <div style="display:flex;gap:8px">
          <div class="modal-btn" onclick="retryScenario()">Retry scenario</div>
          <div class="modal-btn" onclick="location.reload()">Choose scenario</div>
        </div>
    `);
    renderAll();
}

// ---------- Logging ----------
const _onceFlags = {};
function logOnce(key, msg){ if (G._onceTick !== G.day){ G._onceTick = G.day; } if(!_onceFlags[key] || _onceFlags[key] !== G.day){ _onceFlags[key]=G.day; logEvent(msg);} }
function logEvent(msg) {
    G.log.unshift(msg);
    if (G.log.length > 40) G.log.pop();
    const feed = document.getElementById('tickerFeed');
    if (feed) feed.textContent = G.log.slice(0, 3).join('   •   ');
}

// ---------- Formatting ----------
function fmt(n){ return Math.round(n).toLocaleString('en-US'); }
function fmtBig(n){ return Math.round(n).toLocaleString('en-US'); }
function fmtMoney(n){
    const a = Math.abs(n); const s = n<0?'−':'';
    if (a >= 1e6) return `${s}$${(a/1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${s}$${(a/1e3).toFixed(0)}K`;
    return `${s}$${a.toFixed(0)}`;
}

// ---------- Rendering ----------
function renderAll() {
    renderClock();
    renderStreams();
    renderPlantUnits();
    renderCrudeSupply();
    renderMaintenance();
    renderCrudeMarket();
    renderProductPrices();
    renderProduction();
    renderPerformance();
    renderUnitControls();
    drawPlant();
}

function renderClock() {
    const d = G.date;
    const opts = { month:'short', day:'numeric', year:'numeric' };
    let h = d.getHours(); const ampm = h>=12?'pm':'am'; h = h%12||12;
    const mm = String(d.getMinutes()).padStart(2,'0');
    document.getElementById('gameClock').textContent =
        `${d.toLocaleDateString('en-US',opts)}  ${h}:${mm}${ampm}`;
    document.getElementById('scenarioName').textContent = G.scenarioName;
}

function renderStreams() {
    const el = document.getElementById('streamList');
    el.innerHTML = STREAMS.map(s => `
        <div class="stream-item ${G.selectedStream===s.id?'active':''}" data-stream="${s.id}">
            <span class="stream-swatch" style="background:${s.color}"></span>
            <span class="stream-name">${s.name}</span>
            <span class="stream-qty">${fmt(G.streams[s.id]||0)}</span>
        </div>`).join('');
    el.querySelectorAll('.stream-item').forEach(it => {
        it.onclick = () => { G.selectedStream = (G.selectedStream===it.dataset.stream)?null:it.dataset.stream; renderStreams(); drawPlant(); };
    });
}

function renderPlantUnits() {
    const el = document.getElementById('plantUnitsList');
    el.innerHTML = Object.values(G.units).map(u => {
        const cc = condColor(u.cond), pc = pressColor(u.press);
        return `<div class="unit-row ${G.selectedUnit===u.id?'selected':''} ${u.online?'':'offline'}" data-unit="${u.id}">
            <span class="unit-name">${u.short} ${u.online?'':'⛔'}</span>
            <span class="mini-bar"><span class="mini-bar-fill" style="width:${u.cond}%;background:${cc}"></span></span>
            <span class="mini-bar"><span class="mini-bar-fill" style="width:${u.press}%;background:${pc}"></span></span>
        </div>`;
    }).join('');
    el.querySelectorAll('.unit-row').forEach(r => {
        r.onclick = () => selectUnit(r.dataset.unit);
    });
}

function renderCrudeSupply() {
    document.getElementById('tankInv').textContent = `${fmt(G.tank)} / ${fmt(G.tankMax)}`;
    document.getElementById('tankBar').style.width = (G.tank/G.tankMax*100)+'%';
    document.getElementById('tankerEta').textContent = `New tanker in ${G.tankerDays} day${G.tankerDays===1?'':'s'}`;
    document.getElementById('lastTanker').textContent = `last: ${fmt(G.lastTanker)}`;
}

function renderMaintenance() {
    const weekly = MAINT_FULL * (G.maint/100);
    document.getElementById('maintLabel').textContent = `${G.maint}% — ${fmtMoney(weekly)}/wk`;
    document.getElementById('maintSlider').value = G.maint;
}

function renderCrudeMarket() {
    const el = document.getElementById('crudeMarket');
    el.innerHTML = Object.keys(CRUDES).map(k => {
        const c = CRUDES[k];
        return `<div class="market-row buy-crude ${G.slate===k?'selected':''}" data-crude="${k}">
            <span>${c.name}</span>
            <span class="mr-sulfur">${c.sulfur.toFixed(1)}%S</span>
            <span class="mr-price">$${G.crudePrices[k].toFixed(2)}</span>
        </div>`;
    }).join('');
    el.querySelectorAll('.buy-crude').forEach(r => {
        r.onclick = () => { G.slate = r.dataset.crude; document.getElementById('crudeSlateNote').textContent = 'Buying: '+CRUDES[G.slate].name; logEvent(`Crude slate switched to ${CRUDES[G.slate].name}.`); renderCrudeMarket(); };
    });
    document.getElementById('crudeSlateNote').textContent = 'Buying: '+CRUDES[G.slate].name;
}

function renderProductPrices() {
    const el = document.getElementById('productPrices');
    el.innerHTML = Object.keys(PRODUCTS).map(k => {
        const p = PRODUCTS[k];
        const cur = G.prices[k];
        const dir = cur > p.base*1.02 ? 'up' : cur < p.base*0.98 ? 'down' : '';
        const unit = k==='sulfur' ? '/t' : '';
        return `<div class="market-row ${dir}">
            <span>${p.name}</span><span></span>
            <span class="mr-price">$${cur.toFixed(2)}${unit}</span>
        </div>`;
    }).join('');
}

function renderProduction() {
    const el = document.getElementById('todayProduction');
    const p = G.production;
    el.innerHTML = `
        <div class="ops-row"><span>Crude processed</span><span>${fmt(G.streams.crude)}</span></div>
        <div class="ops-row"><span>Gasoline</span><span>${fmt(p.gasoline)}</span></div>
        <div class="ops-row"><span>Jet fuel</span><span>${fmt(p.jet)}</span></div>
        <div class="ops-row"><span>Diesel</span><span>${fmt(p.diesel)}</span></div>
        <div class="ops-row"><span>Heating oil</span><span>${fmt(p.heatingoil)}</span></div>
        <div class="ops-row"><span>LPG (C3-C4)</span><span>${fmt(p.lpg)}</span></div>
        <div class="ops-row"><span>Sulfur (t/d)</span><span>${fmt(p.sulfur)}</span></div>
        <div class="ops-row"><span>Revenue / crude cost</span><span>${fmtMoney(G.dayRevenue||0)} / ${fmtMoney(G.dayCrudeCost||0)}</span></div>`;
}

function renderPerformance() {
    document.getElementById('perfCash').textContent = fmtMoney(G.cash);
    document.getElementById('perfCash').style.color = G.cash < 0 ? '#b02020' : '#000';
    document.getElementById('perfProfit').textContent = fmtMoney(G.totalProfit);
    document.getElementById('perfWeeks').textContent = G.week;
    document.getElementById('perfIncidents').textContent = `${G.breakdowns} / ${G.explosions}`;
    document.getElementById('perfGrade').textContent = G.grade;
}

function selectUnit(id) {
    G.selectedUnit = (G.selectedUnit===id)?null:id;
    renderPlantUnits();
    renderUnitControls();
    drawPlant();
    const u = G.units[G.selectedUnit];
    document.getElementById('plantHint').textContent = u ? `${u.name}: condition ${Math.round(u.cond)}%, pressure ${u.press}%, ${u.online?'online':'OFFLINE'}.` : 'Click a unit to inspect and control it.';
}

function renderUnitControls() {
    const box = document.getElementById('unitControls');
    if (!G.selectedUnit) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const u = G.units[G.selectedUnit];
    document.getElementById('unitCtrlHeader').textContent = u.name.toUpperCase();
    document.getElementById('unitCtrlBody').innerHTML = `
        <label>Severity <span class="uc-val">${u.severity}%</span></label>
        <input type="range" class="ops-slider" id="ucSeverity" min="0" max="100" value="${u.severity}">
        <label>Pressure <span class="uc-val">${u.press}%</span></label>
        <input type="range" class="ops-slider" id="ucPressure" min="20" max="100" value="${u.press}">
        <div class="ops-row" style="margin-top:4px"><span>Condition</span><span style="color:${condColor(u.cond)}">${Math.round(u.cond)}%</span></div>
        <div class="ops-row"><span>Status</span><span style="color:${u.online?'#2a8a2a':'#b02020'}">${u.online?'ONLINE':'OFFLINE'}</span></div>
        <div class="uc-btn-row">
            <button class="pal-btn" id="ucToggle">${u.online?'SHUTDOWN':'START UP'}</button>
            <button class="pal-btn" id="ucRepair">REPAIR</button>
        </div>
        <div class="ops-note">Higher severity = more throughput but faster wear. High pressure on a worn unit risks an explosion.</div>
    `;
    document.getElementById('ucSeverity').oninput = (e)=>{ u.severity=+e.target.value; renderUnitControls(); };
    document.getElementById('ucPressure').oninput = (e)=>{ u.press=+e.target.value; renderUnitControls(); };
    document.getElementById('ucToggle').onclick = ()=>{ u.online=!u.online; logEvent(`${u.name} ${u.online?'started up':'shut down'}.`); renderUnitControls(); renderPlantUnits(); drawPlant(); };
    document.getElementById('ucRepair').onclick = ()=>{
        const costM = (100-u.cond) * 0.08e6;
        if (G.cash < costM) { logEvent('Not enough cash for repair.'); return; }
        G.cash -= costM; u.cond = clamp(u.cond+30,0,100); u.online=true;
        logEvent(`Turnaround on ${u.name}: condition restored (−${fmtMoney(costM)}).`);
        renderUnitControls(); renderPlantUnits(); renderPerformance(); drawPlant();
    };
}

function condColor(c){ return c>60?'#2a8a2a':c>30?'#c8a000':'#b02020'; }
function pressColor(p){ return p>80?'#b02020':p>60?'#c8a000':'#2a8a2a'; }

// ---------- Canvas plant ----------
let plantCanvas, pctx, animT=0;
function initCanvas() {
    plantCanvas = document.getElementById('plantCanvas');
    pctx = plantCanvas.getContext('2d');
    plantCanvas.onclick = (e) => {
        const rect = plantCanvas.getBoundingClientRect();
        const sx = plantCanvas.width / rect.width, sy = plantCanvas.height / rect.height;
        const x = (e.clientX-rect.left)*sx, y = (e.clientY-rect.top)*sy;
        for (const id in G.units) {
            const u = G.units[id];
            if (x>u.x-45 && x<u.x+45 && y>u.y-45 && y<u.y+55) { selectUnit(id); return; }
        }
        G.selectedUnit=null; renderPlantUnits(); renderUnitControls(); drawPlant();
    };
}

// pipe connections between units
const PIPES = [
    ['cdu','reformer','naphtha'], ['cdu','fcc','gasoil'], ['cdu','hydro','diesel'],
    ['cdu','coker','resid'], ['fcc','alky','lpg'], ['reformer','alky','lpg'],
];

function drawPlant() {
    if (!pctx || !G) return;
    const w = plantCanvas.width, h = plantCanvas.height;
    // ground
    pctx.fillStyle = '#6b8e6b'; pctx.fillRect(0,0,w,h);
    // grid concrete pads
    pctx.strokeStyle = 'rgba(0,0,0,0.08)';
    for (let i=0;i<w;i+=40){ pctx.beginPath();pctx.moveTo(i,0);pctx.lineTo(i,h);pctx.stroke(); }
    for (let j=0;j<h;j+=40){ pctx.beginPath();pctx.moveTo(0,j);pctx.lineTo(w,j);pctx.stroke(); }

    // pipes
    PIPES.forEach(([a,b,streamId]) => {
        const ua=G.units[a], ub=G.units[b];
        const s = STREAMS.find(s=>s.id===streamId);
        const highlight = G.selectedStream===streamId;
        drawPipe(ua.x, ua.y, ub.x, ub.y, s?s.color:'#888', highlight, ua.online&&ub.online);
    });

    // units
    for (const id in G.units) drawUnit(G.units[id], id===G.selectedUnit);

    // tank (crude supply) bottom-left indicator
    drawStorageTank(70, 520, G.tank/G.tankMax, '#3b2b1a', 'CRUDE');

    animT += 1;
}

function drawPipe(x1,y1,x2,y2,color,highlight,flowing) {
    pctx.strokeStyle = highlight ? '#ffd700' : '#555';
    pctx.lineWidth = highlight ? 7 : 5;
    pctx.beginPath(); pctx.moveTo(x1,y1); pctx.lineTo(x2,y2); pctx.stroke();
    if (flowing) {
        const len = Math.hypot(x2-x1,y2-y1); const n = Math.floor(len/22);
        for (let i=0;i<n;i++){
            const t = ((animT/8 + i)%n)/n;
            const x = x1+(x2-x1)*t, y=y1+(y2-y1)*t;
            pctx.fillStyle = color; pctx.beginPath(); pctx.arc(x,y,highlight?4:3,0,7); pctx.fill();
        }
    }
}

function drawUnit(u, selected) {
    const x=u.x, y=u.y;
    // shadow
    pctx.fillStyle='rgba(0,0,0,0.2)'; pctx.fillRect(x-38,y-30,76,80);
    // body
    const base = u.online ? '#b9bcc4' : '#7a6060';
    pctx.fillStyle = base;
    pctx.fillRect(x-40,y-32,80,80);
    // 3d top
    pctx.fillStyle = u.online ? '#d6d9e0' : '#8a7070';
    pctx.fillRect(x-40,y-32,80,12);
    // outline / selection
    pctx.lineWidth = selected?4:2;
    pctx.strokeStyle = selected?'#ffd700':'#333';
    pctx.strokeRect(x-40,y-32,80,80);

    // distillation tower flair on CDU
    if (u.id==='cdu') {
        pctx.fillStyle = base; pctx.fillRect(x-12,y-72,24,42);
        pctx.strokeRect(x-12,y-72,24,42);
        // heat shimmer
        const heat = (animT%20)/20;
        pctx.fillStyle = `rgba(255,${120+heat*100},0,0.5)`; pctx.fillRect(x-10,y+30,20,14);
    }

    // condition light
    pctx.fillStyle = condColor(u.cond); pctx.beginPath(); pctx.arc(x-28,y-26,5,0,7); pctx.fill();
    // pressure gauge
    pctx.fillStyle = pressColor(u.press); pctx.fillRect(x+18,y-28,8,16);

    // offline X / smoke
    if (!u.online) {
        pctx.strokeStyle='#b02020'; pctx.lineWidth=4;
        pctx.beginPath(); pctx.moveTo(x-30,y-22); pctx.lineTo(x+30,y+38);
        pctx.moveTo(x+30,y-22); pctx.lineTo(x-30,y+38); pctx.stroke();
    }
    // explosion-prone warning
    if (u.online && u.press>80 && u.cond<30) {
        const a = 0.4+0.4*Math.sin(animT/4);
        pctx.fillStyle=`rgba(255,0,0,${a})`; pctx.fillRect(x-40,y-32,80,80);
    }

    // label
    pctx.fillStyle = '#000'; pctx.font = 'bold 12px Tahoma'; pctx.textAlign='center';
    pctx.fillText(u.short, x, y+16);
    pctx.font = '9px Tahoma'; pctx.fillStyle='#222';
    pctx.fillText(Math.round(u.cond)+'%', x, y+44);
}

function drawStorageTank(x,y,level,color,label) {
    pctx.fillStyle='#999'; pctx.beginPath(); pctx.ellipse(x,y,38,12,0,0,7); pctx.fill();
    pctx.fillStyle='#bbb'; pctx.fillRect(x-38,y-60,76,60);
    pctx.fillStyle=color; pctx.globalAlpha=0.85;
    const fh = 60*level; pctx.fillRect(x-36,y-2-fh,72,fh); pctx.globalAlpha=1;
    pctx.strokeStyle='#333'; pctx.lineWidth=2; pctx.strokeRect(x-38,y-60,76,60);
    pctx.fillStyle='#000'; pctx.font='bold 11px Tahoma'; pctx.textAlign='center';
    pctx.fillText(label, x, y+26); pctx.fillText(Math.round(level*100)+'%', x, y-26);
}

// ---------- Controls / menu ----------
function setupControls() {
    document.getElementById('pauseMenu').onclick = togglePause;
    document.getElementById('emergencyBtn').onclick = () => {
        Object.values(G.units).forEach(u=>u.online=false);
        logEvent('🛑 EMERGENCY SHUTDOWN — all units offline.');
        renderAll();
    };
    document.getElementById('maintSlider').oninput = (e)=>{ G.maint=+e.target.value; renderMaintenance(); };

    document.querySelectorAll('.palette-controls .pal-btn').forEach(b => {
        b.onclick = () => {
            document.querySelectorAll('.palette-controls .pal-btn').forEach(x=>x.classList.remove('active'));
            b.classList.add('active');
            const mode=b.dataset.mode;
            if (G.selectedUnit){ const u=G.units[G.selectedUnit];
                if(mode==='SHUTDOWN'){u.online=false;} else if(mode==='STARTUP'){u.online=true;} else {u.mode=mode;}
                logEvent(`${u.name}: ${mode}.`); renderAll();
            } else { Object.values(G.units).forEach(u=>{ if(mode==='SHUTDOWN')u.online=false; else if(mode==='STARTUP')u.online=true; else u.mode=mode; }); logEvent('All units: '+mode); renderAll(); }
        };
    });

    document.getElementById('budgetBtn').onclick = showBudget;
    document.getElementById('reportBtn').onclick = showReport;
    document.getElementById('buildBtn').onclick = () => showModal('Build', '<p>Capital projects (new units, debottlenecking) are planned for a future release. For now, run turnarounds via a unit\'s REPAIR button to restore condition.</p><div class="modal-btn" onclick="closeModal()">OK</div>');
    document.getElementById('modalClose').onclick = closeModal;

    document.querySelectorAll('.menu-item[data-menu]').forEach(m=>{
        m.onclick = () => handleMenu(m.dataset.menu);
    });
}

function togglePause() {
    G.paused = !G.paused;
    document.getElementById('pauseMenu').textContent = G.paused ? 'Resume' : 'Pause';
    document.getElementById('pauseMenu').style.color = G.paused ? '#b02020' : '';
    logEvent(G.paused ? 'Simulation paused.' : 'Simulation resumed.');
}

function handleMenu(menu) {
    if (menu==='help') showModal('Help', `
        <h3>How to play</h3>
        <p><b>Goal:</b> maximize long-term profit. No ending. Fired at −$20M cash or a 2nd explosion.</p>
        <p><b>Crude:</b> pick a slate in CRUDE MARKET. Light sweet = pricier, cleaner, more gasoline. Heavy sour = cheap but needs the hydrotreater and makes more residuum.</p>
        <p><b>Units:</b> click a unit (canvas or list) to set <b>severity</b> (throughput vs wear) and <b>pressure</b>. Worn + high-pressure = explosions.</p>
        <p><b>Maintenance:</b> above 115% restores condition. Or run a per-unit REPAIR turnaround.</p>
        <p><b>Streams:</b> click a stream in the left palette to highlight its path on the plant.</p>
        <div class="modal-btn" onclick="closeModal()">OK</div>`);
    else if (menu==='refinery') showReport();
    else if (menu==='options') showModal('Options', `
        <h3>Simulation speed</h3>
        <p>Days advance automatically. Use Pause to stop.</p>
        <div class="ops-row"><span>Speed</span><span>${G.speed}×</span></div>
        <input type="range" class="ops-slider" min="1" max="5" value="${G.speed}" oninput="G.speed=+this.value">
        <div class="modal-btn" onclick="closeModal()">OK</div>`);
    else if (menu==='file') showModal('File', '<p>SimRefinery 2.0 — homage build. Progress is in-memory only.</p><div class="modal-btn" onclick="location.reload()">Restart / Choose Scenario</div>');
    else if (menu==='windows') showReport();
}

function showBudget() {
    const weekly = MAINT_FULL*(G.maint/100);
    showModal('$ Budget', `
        <h3>Weekly economics (current run rate)</h3>
        <table>
          <tr><td>Daily revenue</td><td>${fmtMoney(G.dayRevenue||0)}</td></tr>
          <tr><td>Daily crude cost</td><td>${fmtMoney(G.dayCrudeCost||0)}</td></tr>
          <tr><td>Maintenance / wk</td><td>${fmtMoney(weekly)}</td></tr>
          <tr><td>Cash on hand</td><td>${fmtMoney(G.cash)}</td></tr>
          <tr><td>Total profit</td><td>${fmtMoney(G.totalProfit)}</td></tr>
        </table>
        <div class="modal-btn" onclick="closeModal()">OK</div>`);
}

function showReport() {
    const rows = Object.values(G.units).map(u=>`<tr><td>${u.name}</td><td>${u.online?'online':'OFFLINE'} · cond ${Math.round(u.cond)}% · press ${u.press}%</td></tr>`).join('');
    showModal('Refinery Report', `
        <h3>${G.scenarioName} — Week ${G.week}</h3>
        <table>${rows}</table>
        <h3>Performance</h3>
        <table>
          <tr><td>Cash</td><td>${fmtMoney(G.cash)}</td></tr>
          <tr><td>Total profit</td><td>${fmtMoney(G.totalProfit)}</td></tr>
          <tr><td>Breakdowns / explosions</td><td>${G.breakdowns} / ${G.explosions}</td></tr>
          <tr><td>Latest grade</td><td>${G.grade}</td></tr>
        </table>
        <div class="modal-btn" onclick="closeModal()">OK</div>`);
}

function showModal(title, html) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modalOverlay').classList.remove('hidden');
}
function closeModal(){ document.getElementById('modalOverlay').classList.add('hidden'); }

// ---------- Boot ----------
function renderScenarioList() {
    const el = document.getElementById('scenarioList');
    el.innerHTML = SCENARIOS.map((s,i)=>`
        <div class="scenario-item" data-idx="${i}">
            <div class="sc-name">${s.name}</div>
            <div class="sc-desc">${s.desc}</div>
        </div>`).join('');
    el.querySelectorAll('.scenario-item').forEach(it=>{
        it.onclick = () => startScenario(SCENARIOS[+it.dataset.idx]);
    });
}

let currentScenario = null, loopsStarted = false;

function resetPauseButton() {
    const p = document.getElementById('pauseMenu');
    p.textContent = 'Pause';
    p.style.color = '';
}

function startScenario(scenario) {
    currentScenario = scenario;
    document.getElementById('scenarioScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    newGame(scenario);
    initCanvas();
    setupControls();
    resetPauseButton();
    renderAll();

    // start loops exactly once so retries don't stack timers
    if (!loopsStarted) {
        loopsStarted = true;
        setInterval(() => { if (G && !G.paused && !G.gameOver) stepSimulation(); }, 2000); // day tick
        setInterval(() => { if (G) drawPlant(); }, 60); // animation
    }
}

// Restart the current scenario in place (from the Game Over screen).
function retryScenario() {
    closeModal();
    newGame(currentScenario);
    resetPauseButton();
    renderAll();
}

document.addEventListener('DOMContentLoaded', renderScenarioList);
