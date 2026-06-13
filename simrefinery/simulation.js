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
        flags: { repaired: false, emergency: false }, // for tutorial checks
        wearMod: 1,            // capital "Reliability Program" lowers this
        sulfurBoost: 1,        // capital "Sulfur Recovery Unit" raises this
        built: {},             // purchased capital projects
        trainStep: 0,          // operator-training task index
        _shockTriggered: {},   // track which market shocks have fired
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
    const sulfurRecovered = hdtRun * (slate.sulfur/100) * 5.0 * G.sulfurBoost; // tons/day approx
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
        const wear = (unit.severity/100) * (unit.press/100) * 0.9 * G.wearMod;
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

    // 9b. Market shock events (15% chance per week).
    marketShockCheck();

    // 10. Time + week handling.
    G.day += 1;
    G.date = new Date(G.date.getTime() + 24*3600*1000);
    if (G.day % 7 === 0) endOfWeek();

    // 11. Failure conditions.
    if (G.cash <= -20e6) return firePlayer('Cash fell below −$20M. You have been fired.');
    if (G.explosions >= 2) return firePlayer('A second explosion destroyed the plant. You have been fired.');

    // 12. Auto-save game state.
    saveGameState();

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
        G.flags.repaired = true;
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
    const x = u.x, y = u.y;
    const cond = u.cond, press = u.press;
    const condCol = condColor(cond);
    const pressCol = pressColor(press);
    const online = u.online;

    // Much taller proportions - like real refinery columns/towers
    const w = 30, h = 110, d = 15;

    // Isometric 3D structure with tall proportions
    // Top corners
    const tl = [x - w/2, y - h/2 - d/2];
    const tr = [x + w/2, y - h/2 - d/2];
    const tb = [x, y - h/2 - d];

    // Bottom corners (front)
    const bl = [x - w/2, y + h/2 - d/2];
    const br = [x + w/2, y + h/2 - d/2];

    // Back corners
    const tlb = [x - w/2, y - h/2 - d];
    const trb = [x + w/2, y - h/2 - d];
    const blb = [x - w/2, y + h/2 - d];
    const brb = [x + w/2, y + h/2 - d];

    // --- Draw 3D structure ---

    // Shadow (ground)
    pctx.fillStyle = 'rgba(0,0,0,0.25)';
    pctx.beginPath();
    pctx.moveTo(bl[0], bl[1] + 3);
    pctx.lineTo(br[0], br[1] + 3);
    pctx.lineTo(br[0] + 6, br[1] + 10);
    pctx.lineTo(bl[0] + 6, bl[1] + 10);
    pctx.fill();

    // Left face (dark)
    const leftCol = online ? '#7a8a9a' : '#5a4a4a';
    pctx.fillStyle = leftCol;
    pctx.beginPath();
    pctx.moveTo(tl[0], tl[1]);
    pctx.lineTo(tb[0], tb[1]);
    pctx.lineTo(blb[0], blb[1]);
    pctx.lineTo(bl[0], bl[1]);
    pctx.fill();
    pctx.strokeStyle = '#222'; pctx.lineWidth = 1;
    pctx.stroke();

    // Front face (brightest - main visible surface)
    const frontCol = online ? '#d8e4f0' : '#8a7a7a';
    pctx.fillStyle = frontCol;
    pctx.beginPath();
    pctx.moveTo(tl[0], tl[1]);
    pctx.lineTo(tr[0], tr[1]);
    pctx.lineTo(br[0], br[1]);
    pctx.lineTo(bl[0], bl[1]);
    pctx.fill();
    pctx.strokeStyle = '#222'; pctx.lineWidth = 1.5;
    pctx.stroke();

    // Right face (medium)
    const rightCol = online ? '#a8b8c8' : '#6a5a5a';
    pctx.fillStyle = rightCol;
    pctx.beginPath();
    pctx.moveTo(tr[0], tr[1]);
    pctx.lineTo(trb[0], trb[1]);
    pctx.lineTo(brb[0], brb[1]);
    pctx.lineTo(br[0], br[1]);
    pctx.fill();
    pctx.strokeStyle = '#222'; pctx.lineWidth = 1;
    pctx.stroke();

    // Top face (bright)
    const topCol = online ? '#f0f0f0' : '#9a8a8a';
    pctx.fillStyle = topCol;
    pctx.beginPath();
    pctx.moveTo(tl[0], tl[1]);
    pctx.lineTo(tr[0], tr[1]);
    pctx.lineTo(trb[0], trb[1]);
    pctx.lineTo(tb[0], tb[1]);
    pctx.fill();
    pctx.strokeStyle = '#333'; pctx.lineWidth = 0.5;
    pctx.stroke();

    // --- Add industrial detail: vertical sections/tiers ---
    pctx.strokeStyle = '#333'; pctx.lineWidth = 0.5;
    const tierCount = 5;
    for (let i = 1; i < tierCount; i++) {
        const ratio = i / tierCount;
        const leftX = tl[0] + (bl[0] - tl[0]) * ratio;
        const leftY = tl[1] + (bl[1] - tl[1]) * ratio;
        const rightX = tr[0] + (br[0] - tr[0]) * ratio;
        const rightY = tr[1] + (br[1] - tr[1]) * ratio;
        pctx.beginPath();
        pctx.moveTo(leftX, leftY);
        pctx.lineTo(rightX, rightY);
        pctx.stroke();
    }

    // Vertical edge detail
    pctx.strokeStyle = 'rgba(0,0,0,0.3)'; pctx.lineWidth = 0.5;
    const centerX = x;
    pctx.beginPath();
    pctx.moveTo(centerX, tl[1] + 2);
    pctx.lineTo(centerX, bl[1] - 2);
    pctx.stroke();

    // --- Status indicators bars (full height on sides) ---

    // Condition bar (left edge - green/yellow/red)
    const barW = 5;
    const barH = h - 8;
    const condH = barH * (cond / 100);
    pctx.fillStyle = condCol;
    pctx.fillRect(tl[0] - 3, bl[1] - condH, barW, condH);
    pctx.strokeStyle = '#333'; pctx.lineWidth = 0.5;
    pctx.strokeRect(tl[0] - 3, tl[1], barW, barH);

    // Pressure bar (right edge)
    const pressH = barH * (press / 100);
    pctx.fillStyle = pressCol;
    pctx.fillRect(tr[0] - 2, br[1] - pressH, barW, pressH);
    pctx.strokeStyle = '#333'; pctx.lineWidth = 0.5;
    pctx.strokeRect(tr[0] - 2, tr[1], barW, barH);

    // --- Detail grating on front face ---
    pctx.strokeStyle = 'rgba(0,0,0,0.12)'; pctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
        const ratio = i / 4;
        const lx = tl[0] + (bl[0] - tl[0]) * ratio;
        const ly = tl[1] + (bl[1] - tl[1]) * ratio;
        const rx = tr[0] + (br[0] - tr[0]) * ratio;
        const ry = tr[1] + (br[1] - tr[1]) * ratio;
        pctx.beginPath();
        pctx.moveTo(lx + 6, ly);
        pctx.lineTo(rx - 6, ry);
        pctx.stroke();
    }

    // Vertical detail lines
    for (let i = 1; i < 3; i++) {
        const ratio = i / 3;
        const tx = tl[0] + (tr[0] - tl[0]) * ratio;
        const ty = tl[1] + (tr[1] - tl[1]) * ratio;
        const bx = bl[0] + (br[0] - bl[0]) * ratio;
        const by = bl[1] + (br[1] - bl[1]) * ratio;
        pctx.beginPath();
        pctx.moveTo(tx, ty + 4);
        pctx.lineTo(bx, by - 4);
        pctx.stroke();
    }

    // --- Labels ---
    pctx.fillStyle = '#000'; pctx.font = 'bold 9px Tahoma'; pctx.textAlign = 'center';
    pctx.fillText(u.short, x, y - 10);

    pctx.font = '7px Tahoma'; pctx.fillStyle = online ? '#000' : '#b02020';
    pctx.fillText(Math.round(cond) + '%', x, y + 18);

    // --- Selection glow ---
    if (selected) {
        pctx.strokeStyle = '#ffd700'; pctx.lineWidth = 2.5;
        pctx.beginPath();
        pctx.moveTo(tl[0], tl[1]);
        pctx.lineTo(tr[0], tr[1]);
        pctx.lineTo(br[0], br[1]);
        pctx.lineTo(bl[0], bl[1]);
        pctx.stroke();
        pctx.beginPath();
        pctx.moveTo(tr[0], tr[1]);
        pctx.lineTo(trb[0], trb[1]);
        pctx.lineTo(brb[0], brb[1]);
        pctx.lineTo(br[0], br[1]);
        pctx.stroke();
    }

    // --- Offline X (large, visible) ---
    if (!u.online) {
        pctx.strokeStyle = '#b02020'; pctx.lineWidth = 2;
        const xd = 20;
        pctx.beginPath();
        pctx.moveTo(x - xd, y - xd);
        pctx.lineTo(x + xd, y + xd);
        pctx.stroke();
        pctx.beginPath();
        pctx.moveTo(x + xd, y - xd);
        pctx.lineTo(x - xd, y + xd);
        pctx.stroke();
    }

    // --- Explosion warning (pulsing) ---
    if (u.online && u.press > 80 && u.cond < 30) {
        const a = 0.2 + 0.2 * Math.sin(animT / 4);
        pctx.fillStyle = `rgba(255,0,0,${a})`;
        pctx.beginPath();
        pctx.moveTo(tl[0], tl[1]);
        pctx.lineTo(tr[0], tr[1]);
        pctx.lineTo(br[0], br[1]);
        pctx.lineTo(bl[0], bl[1]);
        pctx.fill();
    }
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
        G.flags.emergency = true;
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
    const ng = document.getElementById('newGameMenu');
    if (ng) ng.onclick = goToLobby;
    document.getElementById('buildBtn').onclick = showBuild;
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

// ---------- Save / Load system ----------
function saveGameState() {
    if (!G || G.gameOver) return;
    try {
        const save = {
            scenario: G.scenarioId,
            timestamp: new Date().toISOString(),
            state: G,
        };
        localStorage.setItem('simrefinery_save', JSON.stringify(save));
    } catch (e) {
        console.error('Failed to save game:', e);
    }
}

function loadGameState() {
    try {
        const save = JSON.parse(localStorage.getItem('simrefinery_save'));
        if (!save || !save.state) return null;
        return save.state;
    } catch (e) {
        console.error('Failed to load game:', e);
        return null;
    }
}

function clearSavedGame() {
    try {
        localStorage.removeItem('simrefinery_save');
    } catch (e) {
        console.error('Failed to clear save:', e);
    }
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
    else if (menu==='file') {
        const hasSave = !!loadGameState();
        const msg = hasSave
            ? `<p>SimRefinery 2.0 — your progress is saved to browser storage and will be available when you return.</p>
               <p><b>Saved game:</b> ${new Date(loadGameState().date).toLocaleDateString()} — ${loadGameState().scenarioName}</p>`
            : '<p>SimRefinery 2.0 — your progress is saved to browser storage.</p>';
        showModal('File', msg + `<div class="modal-btn" onclick="location.reload()">Restart / Choose Scenario</div><div class="modal-btn" onclick="closeModal()">OK</div>`);
    }
    else if (menu==='windows') showReport();
}

// ---------- Capital projects (BUILD) ----------
const BUILD_PROJECTS = [
    { id:'crudetrain', name:'New Crude Train', cost:40e6,
      desc:'+25,000 bbl/d crude distillation capacity. The biggest throughput lever.',
      apply:(g)=>{ g.units.cdu.cap += 25000; } },
    { id:'fccrevamp', name:'FCC Revamp', cost:25e6,
      desc:'+10,000 bbl/d cat-cracker capacity — converts more gas oil into gasoline.',
      apply:(g)=>{ g.units.fcc.cap += 10000; } },
    { id:'hdtexpand', name:'Hydrotreater Expansion', cost:30e6,
      desc:'+15,000 bbl/d hydrotreating — lets you run cheap heavy-sour crude without choking.',
      apply:(g)=>{ g.units.hydro.cap += 15000; } },
    { id:'cokerup', name:'Coker Upgrade', cost:18e6,
      desc:'+8,000 bbl/d coking — turns low-value residuum into distillate.',
      apply:(g)=>{ g.units.coker.cap += 8000; } },
    { id:'alkyexpand', name:'Alkylation Expansion', cost:12e6,
      desc:'+6,000 bbl/d alkylation — more premium gasoline blendstock from LPG.',
      apply:(g)=>{ g.units.alky.cap += 6000; } },
    { id:'reliability', name:'Reliability Program', cost:20e6,
      desc:'Cuts equipment wear 25% plant-wide. Fewer breakdowns, lower turnaround spend.',
      apply:(g)=>{ g.wearMod *= 0.75; } },
    { id:'sru', name:'Sulfur Recovery Unit', cost:15e6,
      desc:'+50% sulfur recovery revenue and cleaner heavy-crude operation.',
      apply:(g)=>{ g.sulfurBoost *= 1.5; } },
];

// ---------- Market shock events ----------
const MARKET_SHOCKS = [
    { id:'opec', name:'OPEC Production Cut', desc:'Major supplier cuts output. Crude prices spike.', week:(7+Math.random()*21), effects:{crude:{light:1.18,medium:1.18,heavy:1.18}, products:{}} },
    { id:'fire', name:'Refinery Fire in Singapore', desc:'Global refinery accident. Gasoline premiums tighten.', week:(5+Math.random()*25), effects:{crude:{}, products:{gasoline:0.88,heatingoil:0.92}} },
    { id:'winter', name:'Harsh Winter Incoming', desc:'Heating season demand, cold snap forecasted.', week:(8+Math.random()*20), effects:{crude:{}, products:{heatingoil:1.25,diesel:1.15,jet:1.08}} },
    { id:'recession', name:'Economic Slowdown', desc:'GDP forecasts cut. Demand expectations fall.', week:(15+Math.random()*20), effects:{crude:{light:0.85,medium:0.87,heavy:0.89}, products:{gasoline:0.90,diesel:0.91,heatingoil:0.92}} },
    { id:'hurricane', name:'Hurricane - Gulf Shutdown', desc:'Major offshore platforms go dark.', week:(6+Math.random()*24), effects:{crude:{light:1.22,medium:1.20,heavy:1.18}, products:{gasoline:1.12,diesel:1.10,heatingoil:1.08}} },
    { id:'tech', name:'Refining Tech Breakthrough', desc:'New catalysts improve margins industry-wide.', week:(10+Math.random()*22), effects:{crude:{}, products:{gasoline:1.06,diesel:1.05,heatingoil:1.04}} },
    { id:'warupset', name:'Middle East Tensions', desc:'Supply uncertainty. Prices volatile.', week:(4+Math.random()*26), effects:{crude:{light:1.15,medium:1.16,heavy:1.17}, products:{}} },
    { id:'dlrise', name:'Dollar Strengthens', desc:'USD rally cuts petroleum demand. Prices weaken.', week:(12+Math.random()*20), effects:{crude:{light:0.92,medium:0.93,heavy:0.94}, products:{gasoline:0.93,diesel:0.94,heatingoil:0.93,lpg:0.92}} },
];

function marketShockCheck() {
    // Roll for a shock once per week
    if (G.day % 7 !== 0) return;
    const remaining = MARKET_SHOCKS.filter(s => !G._shockTriggered[s.id]);
    if (remaining.length === 0) return;

    // ~15% chance per week of triggering a remaining shock
    if (Math.random() > 0.15) return;

    const shock = remaining[Math.floor(Math.random() * remaining.length)];
    G._shockTriggered[shock.id] = true;

    // Apply effects
    for (const crude in shock.effects.crude) {
        G.crudePrices[crude] *= shock.effects.crude[crude];
    }
    for (const prod in shock.effects.products) {
        G.prices[prod] *= shock.effects.products[prod];
    }

    logEvent(`🔔 ${shock.name}: ${shock.desc}`);
}

function showBuild() {
    const rows = BUILD_PROJECTS.map(p => {
        const owned = !!G.built[p.id];
        const afford = G.cash >= p.cost;
        const btn = owned
            ? `<span style="color:#2a8a2a;font-weight:bold">✔ Built</span>`
            : `<span class="modal-btn" style="margin:0;${afford?'':'opacity:.45;pointer-events:none'}" onclick="buyProject('${p.id}')">Buy ${fmtMoney(p.cost)}</span>`;
        return `<tr><td style="text-align:left">
                  <b>${p.name}</b> — ${fmtMoney(p.cost)}<br>
                  <span style="font-size:10px;color:#555">${p.desc}</span>
                </td><td>${btn}</td></tr>`;
    }).join('');
    showModal('Build — Capital Projects', `
        <p>Cash on hand: <b>${fmtMoney(G.cash)}</b>. Capital projects are permanent upgrades for the current run.</p>
        <table>${rows}</table>
        <div class="modal-btn" onclick="closeModal()">Close</div>`);
}

function buyProject(id) {
    const p = BUILD_PROJECTS.find(x => x.id === id);
    if (!p || G.built[id]) return;
    if (G.cash < p.cost) { logEvent('Not enough cash for that project.'); return; }
    G.cash -= p.cost;
    G.built[id] = true;
    p.apply(G);
    logEvent(`🏗️ Capital project complete: ${p.name} (−${fmtMoney(p.cost)}).`);
    renderAll();
    showBuild(); // refresh the list
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

// ---------- Operator Training (guided 10-task tutorial) ----------
const TRAINING_TASKS = [
    { text:'Welcome to the Richmond refinery. First choose your feedstock: in the <b>CRUDE MARKET</b> panel, click <b>Light Sweet</b> to buy it.',
      hint:'Light sweet is pricier but clean and gasoline-rich.',
      check:(g)=>g.slate==='light' },
    { text:'Open a unit\'s controls: click the <b>Crude Distillation (CDU)</b> tower on the plant — or the CDU row in the PLANT list.',
      hint:'The CDU splits the barrel into the cuts that feed every other unit.',
      check:(g)=>g.selectedUnit==='cdu' },
    { text:'Throttle the still: with the CDU selected, drag its <b>Severity down to 70% or lower</b>.',
      hint:'Lower severity = less throughput but slower wear.',
      check:(g)=>g.units.cdu.severity<=70 },
    { text:'Run it safely: select the <b>Cat Cracker (FCC)</b> and bring its <b>Pressure to 60% or lower</b>.',
      hint:'High pressure on a worn unit is exactly how explosions happen.',
      check:(g)=>g.units.fcc.press<=60 },
    { text:'Feedstock economics: switch to <b>Heavy Sour</b> crude in the CRUDE MARKET and watch the hydrotreater load up.',
      hint:'Heavy sour is cheap but dirty — the hydrotreater becomes the bottleneck.',
      check:(g)=>g.slate==='heavy' },
    { text:'Protect your iron: raise the <b>Maintenance budget above 115%</b> with the slider.',
      hint:'Above 115% the budget slowly restores unit condition.',
      check:(g)=>g.maint>115 },
    { text:'Run a turnaround: select any unit and press <b>REPAIR</b> to restore its condition.',
      hint:'A targeted repair is faster than waiting on the maintenance budget.',
      check:(g)=>g.flags.repaired },
    { text:'Think big: open <b>BUILD</b> (left palette) and purchase any one capital project.',
      hint:'Capital projects permanently debottleneck the plant.',
      check:(g)=>Object.keys(g.built).length>0 },
    { text:'Emergency drill: hit <b>EMERGENCY SHUTDOWN</b>, then select the CDU and press <b>START UP</b> to bring it back online.',
      hint:'Know how to safe the plant — and how to recover.',
      check:(g)=>g.flags.emergency && g.units.cdu.online },
    { text:'Final exam: keep the plant in the black and grow cash by <b>$1M</b> from here.',
      hint:'Balance throughput, crude choice, and maintenance.',
      start:(g)=>{ g._trainTarget = g.cash + 1e6; },
      check:(g)=>g.cash >= (g._trainTarget||0) },
];

function updateTraining() {
    const panel = document.getElementById('trainingPanel');
    if (!panel) return;
    if (!G || !G.training) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');

    if (G.trainStep >= TRAINING_TASKS.length) { renderTrainingDone(panel); return; }
    const task = TRAINING_TASKS[G.trainStep];
    if (G._trainRenderedStep !== G.trainStep) {
        G._trainRenderedStep = G.trainStep;
        if (task.start) task.start(G);
        renderTrainingPanel(panel, task);
    }
    if (task.check(G)) {
        logEvent(`✓ Training task ${G.trainStep+1}/${TRAINING_TASKS.length} complete.`);
        G.trainStep++;
    }
}

function renderTrainingPanel(panel, task) {
    const n = G.trainStep + 1, total = TRAINING_TASKS.length;
    panel.innerHTML = `
        <div class="train-head">🎓 Operator Training — Task ${n}/${total}</div>
        <div class="train-bar"><div class="train-bar-fill" style="width:${(G.trainStep/total)*100}%"></div></div>
        <div class="train-text">${task.text}</div>
        <div class="train-hint">💡 ${task.hint}</div>
        <div class="train-btns">
            <span class="modal-btn" style="margin:0" onclick="skipTrainingTask()">Skip task</span>
            <span class="modal-btn" style="margin:0" onclick="exitTraining()">Exit tutorial</span>
        </div>`;
}

function renderTrainingDone(panel) {
    if (G._trainRenderedStep === 'done') return;
    G._trainRenderedStep = 'done';
    panel.innerHTML = `
        <div class="train-head">🎓 Operator Training — Complete ✅</div>
        <div class="train-text">You've covered feed selection, unit control, safety, maintenance,
        turnarounds, capital projects, and emergencies. The plant is yours — keep it profitable.</div>
        <div class="train-btns">
            <span class="modal-btn" style="margin:0" onclick="exitTraining()">Keep playing</span>
        </div>`;
}

function skipTrainingTask() {
    if (!G || !G.training) return;
    if (G.trainStep < TRAINING_TASKS.length) G.trainStep++;
    G._trainRenderedStep = -1; // force re-render of next task
}
function exitTraining() {
    if (!G) return;
    G.training = false;
    document.getElementById('trainingPanel').classList.add('hidden');
    logEvent('Tutorial closed. Free play resumed.');
}

// Return to the scenario lobby (stops the sim cleanly).
function goToLobby() {
    G = null;
    const tp = document.getElementById('trainingPanel');
    if (tp) tp.classList.add('hidden');
    closeModal();
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('scenarioScreen').classList.remove('hidden');
}

// ---------- Boot ----------
function renderScenarioList() {
    const el = document.getElementById('scenarioList');
    const saved = loadGameState();
    let html = '';

    // Show "Load Saved Game" at top if available
    if (saved) {
        const d = new Date(saved.date);
        const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        html += `<div class="scenario-item saved-game" data-action="load-saved">
                    <div class="sc-name">⏱ Load Saved Game</div>
                    <div class="sc-desc">${saved.scenarioName} — Week ${saved.week} — ${dateStr}</div>
                </div>`;
    }

    // Show all regular scenarios
    html += SCENARIOS.map((s,i)=>`
        <div class="scenario-item" data-idx="${i}">
            <div class="sc-name">${s.name}</div>
            <div class="sc-desc">${s.desc}</div>
        </div>`).join('');

    el.innerHTML = html;

    // Attach click handlers
    if (saved) {
        el.querySelector('[data-action="load-saved"]').onclick = () => loadAndStartGame();
    }
    el.querySelectorAll('.scenario-item:not(.saved-game)').forEach(it=>{
        it.onclick = () => startScenario(SCENARIOS[+it.dataset.idx]);
    });
}

let currentScenario = null, loopsStarted = false;

function resetPauseButton() {
    const p = document.getElementById('pauseMenu');
    p.textContent = 'Pause';
    p.style.color = '';
}

function loadAndStartGame() {
    const saved = loadGameState();
    if (!saved) return;

    // Start the game screen with the loaded state
    document.getElementById('scenarioScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    G = saved;
    currentScenario = SCENARIOS.find(s => s.id === saved.scenarioId) || SCENARIOS[0];
    initCanvas();
    setupControls();
    resetPauseButton();
    renderAll();

    logEvent('Game resumed from save.');

    // start loops exactly once so retries don't stack timers
    if (!loopsStarted) {
        loopsStarted = true;
        setInterval(() => { if (G && !G.paused && !G.gameOver) stepSimulation(); }, 2000); // day tick
        setInterval(() => { if (G) { drawPlant(); updateTraining(); } }, 60); // animation + tutorial
    }
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
        setInterval(() => { if (G) { drawPlant(); updateTraining(); } }, 60); // animation + tutorial
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
