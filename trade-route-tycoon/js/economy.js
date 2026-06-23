// ======================================================================
// economy.js — the dynamic supply/demand economy
// ----------------------------------------------------------------------
// Each port has a Market. A market tracks STOCK for every good. Price is
// derived from stock: lots of stock → cheap, scarce stock → expensive.
// Buying drains stock (price rises); selling adds stock (price falls).
// Over time stock drifts back toward equilibrium, so prices "heal".
//
// This is the heart of the game loop: find a port that produces a good
// cheaply, buy it, sail to a port that's short on it, and sell high.
// ======================================================================

// Classical Mediterranean trade goods. Grain is the cheap staple; Tyrian
// Purple — the famous dye worth more than its weight in silver — is the
// volatile luxury that makes the boldest fortunes.
const GOODS = ["Grain", "Pottery", "Olive Oil", "Wine", "Marble", "Tyrian Purple"];

// "Fair" price each good gravitates toward at equilibrium stock.
const BASE_PRICES = {
  Grain: 10,
  Pottery: 22,
  "Olive Oil": 30,
  Wine: 35,
  Marble: 48,
  "Tyrian Purple": 95,
};

const EQUILIBRIUM = 60;   // the stock level prices are balanced around

class Market {
  // produces: goods this port makes (abundant + cheap)
  // demands:  goods this port needs (scarce + pricey — sell here!)
  constructor(produces, demands) {
    this.produces = produces;
    this.demands = demands;
    this.stock = {};
    for (const g of GOODS) {
      let s = EQUILIBRIUM;
      if (produces.includes(g)) s = 140;  // glut → cheap
      if (demands.includes(g)) s = 18;    // shortage → expensive
      this.stock[g] = s;
    }
  }

  // Mid price from current stock. Inverse relationship, clamped so prices
  // stay in a sane band even at extreme stock levels.
  price(good) {
    const factor = Phaser.Math.Clamp(EQUILIBRIUM / Math.max(this.stock[good], 1), 0.35, 3.2);
    return Math.round(BASE_PRICES[good] * factor);
  }

  // A small spread between what you pay to buy vs. receive to sell — like a
  // real market maker takes a cut. Stops you arbitraging a single port.
  buyPrice(good)  { return Math.ceil(this.price(good) * 1.08); }
  sellPrice(good) { return Math.floor(this.price(good) * 0.92); }

  applyBuy(good, qty)  { this.stock[good] = Math.max(0, this.stock[good] - qty); }
  applySell(good, qty) { this.stock[good] += qty; }

  // Called on a timer: each good's stock drifts gently back to equilibrium,
  // so a port you drained slowly recovers and prices normalize.
  tick() {
    for (const g of GOODS) {
      this.stock[g] += (EQUILIBRIUM - this.stock[g]) * 0.02;
    }
  }
}

// Expose globally (these are classic scripts, so everything shares one scope).
window.GOODS = GOODS;
window.Market = Market;
