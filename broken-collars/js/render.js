/*
 * Broken Collars - isometric renderer.
 *
 * Pure presentation. Nothing here decides anything about the game; it only
 * draws whatever state it is handed, whether that is the player's live base or
 * a frame from a recorded battle replay.
 *
 * Projection is standard 2:1 isometric. A tile at (tx, ty) lands at:
 *   sx = originX + (tx - ty) * TW/2
 *   sy = originY + (tx + ty) * TH/2
 * so tile (0,0) is the top corner of the diamond, (grid,0) is the right corner.
 * Because everything is drawn as a box standing on its tile, draw order is the
 * whole game: sort by (tx + ty) and paint back to front, or buildings overlap
 * wrongly and the illusion collapses.
 */
(function (root, factory) {
  var api = factory();
  root.KW = root.KW || {};
  Object.assign(root.KW, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LOGICAL_W = 880, LOGICAL_H = 600;

  // ---------------------------------------------------------------- colour

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  // amt > 0 lightens toward white, amt < 0 darkens toward black.
  function shade(hex, amt) {
    var c = hexToRgb(hex);
    var t = amt < 0 ? 0 : 255;
    var p = Math.abs(amt);
    return 'rgb(' + c.map(function (v) {
      return Math.round(v + (t - v) * p);
    }).join(',') + ')';
  }

  // Base colour per building type. The three visible faces are shaded from it.
  var COLORS = {
    kennel: '#8a6a3a',
    farm: '#5c7a3a',
    goldMine: '#6b5a48',
    foodStore: '#8a6a4a',
    goldVault: '#8a7530',
    breedingPen: '#6a5a7a',
    trainingYard: '#7a6a4a',
    watchtower: '#7a4a45',
    guardPost: '#7a4a45',
    cage: '#4a4a52',
    wall: '#6b665e'
  };

  var ROOFS = { kennel: '#9c4a3c', watchtower: '#9c4a3c', guardPost: '#8a4436' };

  // Box height as a multiple of tile width.
  var HEIGHTS = {
    kennel: 1.25, farm: 0.42, goldMine: 0.52, foodStore: 0.7, goldVault: 0.7,
    breedingPen: 0.44, trainingYard: 0.4, watchtower: 1.5, guardPost: 0.8,
    cage: 0.62, wall: 0.4
  };

  // ---------------------------------------------------------------- setup

  function metrics(grid) {
    var TW = (LOGICAL_W - 34) / grid;
    var TH = TW / 2;
    return {
      TW: TW, TH: TH,
      originX: LOGICAL_W / 2,
      // Centres the diamond vertically, with headroom above the top corner for
      // tall buildings like the watchtower.
      originY: 92,
      grid: grid
    };
  }

  function setup(canvas, grid) {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    var m = metrics(grid);
    m.ctx = ctx;
    return m;
  }

  function project(m, tx, ty) {
    return {
      x: m.originX + (tx - ty) * m.TW / 2,
      y: m.originY + (tx + ty) * m.TH / 2
    };
  }

  // Screen point back to fractional tile coordinates.
  function unproject(m, sx, sy) {
    var dx = sx - m.originX, dy = sy - m.originY;
    return {
      x: (dx / (m.TW / 2) + dy / (m.TH / 2)) / 2,
      y: (dy / (m.TH / 2) - dx / (m.TW / 2)) / 2
    };
  }

  function eventToTile(canvas, evt, grid) {
    var rect = canvas.getBoundingClientRect();
    var sx = (evt.clientX - rect.left) / rect.width * LOGICAL_W;
    var sy = (evt.clientY - rect.top) / rect.height * LOGICAL_H;
    return unproject(metrics(grid), sx, sy);
  }

  // Painter's-algorithm key. Bigger = nearer the camera = drawn later.
  function depthOf(x, y, size) { return x + y + (size || 1) * 0.999; }

  // ---------------------------------------------------------------- ground

  var groundCache = {};

  function buildGround(grid) {
    var m = metrics(grid);
    var off = document.createElement('canvas');
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    off.width = LOGICAL_W * dpr;
    off.height = LOGICAL_H * dpr;
    var ctx = off.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (var y = 0; y < grid; y++) {
      for (var x = 0; x < grid; x++) {
        // Deterministic per-tile variation, so grass does not shimmer between
        // frames the way Math.random() would make it.
        var n = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        var v = (n % 100) / 100;
        var base = v < 0.12 ? '#3c4a2e' : (v < 0.5 ? '#354229' : '#313d26');
        tileDiamond(ctx, m, x, y);
        ctx.fillStyle = base;
        ctx.fill();
      }
    }

    // Soft outer vignette so the field does not end on a hard edge.
    var g = ctx.createRadialGradient(LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_H * 0.28,
      LOGICAL_W / 2, LOGICAL_H / 2, LOGICAL_H * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    return off;
  }

  function tileDiamond(ctx, m, x, y) {
    var a = project(m, x, y), b = project(m, x + 1, y);
    var c = project(m, x + 1, y + 1), d = project(m, x, y + 1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
  }

  function drawGround(m) {
    if (!groundCache[m.grid]) groundCache[m.grid] = buildGround(m.grid);
    m.ctx.drawImage(groundCache[m.grid], 0, 0, LOGICAL_W, LOGICAL_H);
  }

  // Fill one tile with a colour (selection, ghost footprint, deploy band).
  function fillTile(m, x, y, style, stroke) {
    var ctx = m.ctx;
    tileDiamond(ctx, m, x, y);
    if (style) { ctx.fillStyle = style; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  // Outline a whole footprint, used for the selected building.
  function outlineFootprint(m, x, y, size, style) {
    var ctx = m.ctx;
    var a = project(m, x, y), b = project(m, x + size, y);
    var c = project(m, x + size, y + size), d = project(m, x, y + size);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.strokeStyle = style;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ---------------------------------------------------------------- buildings

  function poly(ctx, pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /**
   * Draw one building as an isometric box with a top and two visible sides.
   * @param opts { type, size, level, hp (0..1), ghost, invalid, selected, collapse (0..1) }
   */
  function drawBuilding(m, x, y, opts) {
    var ctx = m.ctx;
    var size = opts.size;
    var type = opts.type;
    var base = COLORS[type] || COLORS.wall;
    var h = (HEIGHTS[type] || 0.5) * m.TW * size / Math.max(1, size);

    // Collapsing buildings sink into the ground rather than blinking out.
    var collapse = opts.collapse || 0;
    if (collapse > 0) h *= Math.max(0, 1 - collapse);

    ctx.save();
    if (opts.ghost) ctx.globalAlpha = 0.6;
    if (collapse > 0) ctx.globalAlpha = Math.max(0, 1 - collapse) * 0.9;

    // Footprint corners: top, right, bottom, left.
    var t = project(m, x, y);
    var r = project(m, x + size, y);
    var bo = project(m, x + size, y + size);
    var l = project(m, x, y + size);

    // Contact shadow.
    if (!opts.ghost) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      poly(ctx, [
        { x: t.x + 2, y: t.y + 3 }, { x: r.x + 2, y: r.y + 3 },
        { x: bo.x + 2, y: bo.y + 3 }, { x: l.x + 2, y: l.y + 3 }
      ], '#000');
      ctx.restore();
    }

    var up = function (p) { return { x: p.x, y: p.y - h }; };
    var tT = up(t), tR = up(r), tB = up(bo), tL = up(l);

    var fillTop = opts.invalid ? '#a33' : shade(base, 0.2);
    var fillRight = opts.invalid ? '#822' : shade(base, -0.05);
    var fillLeft = opts.invalid ? '#611' : shade(base, -0.34);

    // Right face (bottom -> right edge) and left face (left -> bottom edge).
    poly(ctx, [l, bo, tB, tL], fillLeft);
    poly(ctx, [bo, r, tR, tB], fillRight);
    poly(ctx, [tT, tR, tB, tL], fillTop);

    // Edge highlight along the top so forms read against each other.
    ctx.strokeStyle = opts.selected ? '#f0d264' : shade(base, 0.34);
    ctx.lineWidth = opts.selected ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(tT.x, tT.y); ctx.lineTo(tR.x, tR.y);
    ctx.lineTo(tB.x, tB.y); ctx.lineTo(tL.x, tL.y);
    ctx.closePath();
    ctx.stroke();

    if (!opts.ghost && collapse === 0) {
      drawDetail(m, type, { t: tT, r: tR, b: tB, l: tL }, size, opts);
    }

    // Damage: buildings darken and take a health bar as they are chewed down.
    if (opts.hp != null && opts.hp < 1) {
      ctx.save();
      ctx.globalAlpha = 0.5 * (1 - opts.hp);
      poly(ctx, [tT, tR, tB, tL], '#1a0d08');
      poly(ctx, [l, bo, tB, tL], '#1a0d08');
      poly(ctx, [bo, r, tR, tB], '#1a0d08');
      ctx.restore();

      if (opts.hp > 0) {
        var bw = m.TW * size * 0.62;
        var bx = (tT.x + tB.x) / 2 - bw / 2;
        var by = tT.y - 7;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(bx, by, bw, 3.5);
        ctx.fillStyle = opts.hp > 0.5 ? '#7fbf5f' : (opts.hp > 0.25 ? '#d8b13f' : '#c8503f');
        ctx.fillRect(bx, by, bw * opts.hp, 3.5);
      }
    }

    ctx.restore();
  }

  // Per-type detail drawn on the top face. This is what stops every building
  // looking like the same brown box.
  function drawDetail(m, type, top, size, opts) {
    var ctx = m.ctx;
    var cx = (top.t.x + top.b.x) / 2;
    var cy = (top.t.y + top.b.y) / 2;
    var w = m.TW * size;
    var lvl = opts.level || 1;

    switch (type) {
      case 'kennel':
        pyramidRoof(ctx, top, w * 0.55, ROOFS.kennel);
        banner(ctx, cx, cy - w * 0.55, w * 0.42, '#c9a227');
        break;

      case 'watchtower':
        pyramidRoof(ctx, top, w * 0.62, ROOFS.watchtower);
        // Arrow slits on the upper wall.
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(cx - w * 0.05, cy + w * 0.02, w * 0.045, w * 0.14);
        break;

      case 'guardPost':
        pyramidRoof(ctx, top, w * 0.38, ROOFS.guardPost);
        break;

      case 'wall':
        // Crenellations: two small blocks on the parapet.
        ctx.fillStyle = shade(COLORS.wall, 0.34);
        ctx.fillRect(cx - w * 0.3, cy - w * 0.1, w * 0.22, w * 0.12);
        ctx.fillRect(cx + w * 0.08, cy - w * 0.1, w * 0.22, w * 0.12);
        break;

      case 'farm':
        // Furrows running along the plot.
        ctx.strokeStyle = 'rgba(30,50,20,0.55)';
        ctx.lineWidth = 1.4;
        for (var f = -2; f <= 2; f++) {
          var a = { x: top.l.x + (top.t.x - top.l.x) * (0.5 + f * 0.16), y: top.l.y + (top.t.y - top.l.y) * (0.5 + f * 0.16) };
          var b = { x: top.b.x + (top.r.x - top.b.x) * (0.5 + f * 0.16), y: top.b.y + (top.r.y - top.b.y) * (0.5 + f * 0.16) };
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        break;

      case 'goldMine':
        // A dark shaft mouth with a beam over it.
        ctx.fillStyle = '#241d16';
        ellipse(ctx, cx, cy, w * 0.2, w * 0.11);
        ctx.fillStyle = '#4a3b2a';
        ctx.fillRect(cx - w * 0.24, cy - w * 0.03, w * 0.48, w * 0.05);
        break;

      case 'foodStore':
        barrels(ctx, cx, cy, w, '#7a5330');
        break;

      case 'goldVault':
        // Stacked coins.
        for (var c = 0; c < 3; c++) {
          ctx.fillStyle = c === 2 ? '#f0d264' : '#c9a227';
          ellipse(ctx, cx, cy - c * w * 0.05, w * 0.16, w * 0.085);
        }
        break;

      case 'breedingPen':
        fencePosts(ctx, top, '#6b5a3f');
        break;

      case 'trainingYard':
        // Training posts and a straw dummy.
        ctx.fillStyle = '#5c4a32';
        ctx.fillRect(cx - w * 0.22, cy - w * 0.16, w * 0.05, w * 0.2);
        ctx.fillRect(cx + w * 0.16, cy - w * 0.16, w * 0.05, w * 0.2);
        ctx.fillStyle = '#a8903f';
        ellipse(ctx, cx, cy - w * 0.04, w * 0.09, w * 0.07);
        break;

      case 'cage':
        // Iron bars across the top, and a padlock. The prize of the raid.
        ctx.strokeStyle = '#2c2c33';
        ctx.lineWidth = Math.max(1, w * 0.035);
        for (var i = -2; i <= 2; i++) {
          var p1 = { x: top.l.x + (top.t.x - top.l.x) * (0.5 + i * 0.17), y: top.l.y + (top.t.y - top.l.y) * (0.5 + i * 0.17) };
          var p2 = { x: top.b.x + (top.r.x - top.b.x) * (0.5 + i * 0.17), y: top.b.y + (top.r.y - top.b.y) * (0.5 + i * 0.17) };
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        }
        ctx.fillStyle = '#8a8a2a';
        ellipse(ctx, cx, cy + w * 0.04, w * 0.07, w * 0.06);
        break;
    }

    // Level pips floating just above the roofline.
    if (lvl > 1) {
      var dots = Math.min(lvl, 5);
      var dr = Math.max(1.3, w * 0.035);
      var gap = dr * 2.8;
      var sx = cx - (dots - 1) * gap / 2;
      ctx.fillStyle = '#f0d264';
      for (var d = 0; d < dots; d++) {
        ctx.beginPath();
        ctx.arc(sx + d * gap, top.t.y - 14, dr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function ellipse(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Four-sided pyramid roof sitting on the top face. Back faces first.
  function pyramidRoof(ctx, top, height, color) {
    var cx = (top.t.x + top.b.x) / 2;
    var cy = (top.t.y + top.b.y) / 2;
    var apex = { x: cx, y: cy - height };
    poly(ctx, [top.t, top.r, apex], shade(color, 0.08));   // back right
    poly(ctx, [top.l, top.t, apex], shade(color, -0.1));   // back left
    poly(ctx, [top.r, top.b, apex], shade(color, 0.2));    // front right, catches light
    poly(ctx, [top.b, top.l, apex], shade(color, -0.28));  // front left, in shade
  }

  function banner(ctx, x, y, size, color) {
    ctx.strokeStyle = '#3a2f1e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - size);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.5, y - size * 0.82);
    ctx.lineTo(x, y - size * 0.64);
    ctx.closePath();
    ctx.fill();
  }

  function barrels(ctx, cx, cy, w, color) {
    var spots = [[-0.16, 0.02], [0.14, -0.03], [-0.01, 0.11]];
    spots.forEach(function (s) {
      ctx.fillStyle = color;
      ellipse(ctx, cx + w * s[0], cy + w * s[1], w * 0.1, w * 0.075);
      ctx.fillStyle = shade(color, 0.25);
      ellipse(ctx, cx + w * s[0], cy + w * s[1] - w * 0.02, w * 0.08, w * 0.055);
    });
  }

  function fencePosts(ctx, top, color) {
    ctx.fillStyle = color;
    [top.t, top.r, top.b, top.l].forEach(function (p) {
      ctx.fillRect(p.x - 1.4, p.y - 7, 2.8, 8);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(top.t.x, top.t.y - 4);
    ctx.lineTo(top.r.x, top.r.y - 4);
    ctx.lineTo(top.b.x, top.b.y - 4);
    ctx.lineTo(top.l.x, top.l.y - 4);
    ctx.closePath();
    ctx.stroke();
  }

  // ---------------------------------------------------------------- dogs

  /**
   * An actual dog rather than a dot: body, head, snout, ear, tail and four legs
   * with a running cycle. Small enough on screen that the silhouette does the
   * work, which is why the legs and tail move.
   * @param opts { color, facing (1|-1), phase, hp, attacking, defender, moving }
   */
  function drawDog(m, tx, ty, opts) {
    var ctx = m.ctx;
    var p = project(m, tx, ty);
    var s = m.TW * 0.46;                 // overall dog scale
    var f = opts.facing < 0 ? -1 : 1;
    var phase = opts.phase || 0;
    var color = opts.color || '#ccc';
    var dark = shade(color, -0.4);

    ctx.save();
    ctx.translate(p.x, p.y);

    // Contact shadow keeps the dog planted on the tile.
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ellipse(ctx, 0, 0, s * 0.42, s * 0.15);

    ctx.scale(f, 1);

    var bob = opts.moving ? Math.sin(phase * 2) * s * 0.03 : 0;
    var bodyY = -s * 0.34 + bob;

    // Legs: front and back pairs swing in opposition.
    var swing = opts.moving ? Math.sin(phase) * s * 0.16 : 0;
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1.3, s * 0.1);
    ctx.lineCap = 'round';
    [[-0.2, swing], [-0.14, -swing], [0.18, -swing], [0.24, swing]].forEach(function (leg) {
      ctx.beginPath();
      ctx.moveTo(s * leg[0], bodyY + s * 0.1);
      ctx.lineTo(s * (leg[0] + leg[1] / s * 0.5), -s * 0.02);
      ctx.stroke();
    });

    // Tail, wagging.
    var wag = Math.sin(phase * 1.7) * 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, s * 0.09);
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, bodyY - s * 0.02);
    ctx.quadraticCurveTo(-s * 0.52, bodyY - s * (0.2 + wag * 0.2), -s * 0.44, bodyY - s * (0.34 + wag * 0.3));
    ctx.stroke();

    // Body.
    ctx.fillStyle = color;
    ellipse(ctx, 0, bodyY, s * 0.34, s * 0.2);

    // Head, snout and ear.
    var hx = s * 0.32, hy = bodyY - s * 0.16;
    ctx.fillStyle = color;
    ellipse(ctx, hx, hy, s * 0.17, s * 0.16);
    ctx.fillStyle = shade(color, -0.18);
    ellipse(ctx, hx + s * 0.15, hy + s * 0.04, s * 0.1, s * 0.07);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(hx - s * 0.06, hy - s * 0.13);
    ctx.lineTo(hx + s * 0.03, hy - s * 0.28);
    ctx.lineTo(hx + s * 0.1, hy - s * 0.11);
    ctx.closePath();
    ctx.fill();

    // Eye.
    ctx.fillStyle = '#1b1410';
    ellipse(ctx, hx + s * 0.06, hy - s * 0.02, s * 0.032, s * 0.032);

    ctx.restore();

    // Defender collar, so enemy hounds read instantly as hostile.
    if (opts.defender) {
      ctx.strokeStyle = '#e0503a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y - s * 0.3, s * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bite flash.
    if (opts.attacking) {
      ctx.strokeStyle = 'rgba(255,212,94,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x + f * s * 0.42, p.y - s * 0.42, s * 0.26, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (opts.hp != null && opts.hp < 1) {
      var bw = s * 0.8;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(p.x - bw / 2, p.y - s * 0.95, bw, 2.6);
      ctx.fillStyle = opts.hp > 0.5 ? '#7fbf5f' : (opts.hp > 0.25 ? '#d8b13f' : '#c8503f');
      ctx.fillRect(p.x - bw / 2, p.y - s * 0.95, bw * opts.hp, 2.6);
    }
  }

  // ---------------------------------------------------------------- effects

  function drawDeployZone(m, margin) {
    var grid = m.grid;
    for (var y = 0; y < grid; y++) {
      for (var x = 0; x < grid; x++) {
        var edge = x < margin || y < margin || x >= grid - margin || y >= grid - margin;
        if (!edge) continue;
        fillTile(m, x, y, 'rgba(240,210,100,0.13)');
      }
    }
  }

  // Debris thrown up when a building falls.
  function drawDebris(m, tx, ty, progress) {
    var ctx = m.ctx;
    var p = project(m, tx, ty);
    var n = 7;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - progress);
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + 0.7;
      var dist = progress * m.TW * 0.9;
      var rise = Math.sin(progress * Math.PI) * m.TW * 0.5;
      ctx.fillStyle = i % 2 ? '#8a7a68' : '#5a4c3e';
      ctx.fillRect(
        p.x + Math.cos(a) * dist - 1.6,
        p.y + Math.sin(a) * dist * 0.5 - rise - 1.6,
        3.2, 3.2
      );
    }
    ctx.restore();
  }

  // Freed hounds bolting out of a broken cage.
  function drawFreedBurst(m, tx, ty, progress) {
    var ctx = m.ctx;
    var p = project(m, tx, ty);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - progress);
    for (var i = 0; i < 5; i++) {
      var a = (i / 5) * Math.PI * 2 + 0.4;
      var dist = progress * m.TW * 1.5;
      ctx.fillStyle = '#e8dfc8';
      ellipse(ctx,
        p.x + Math.cos(a) * dist,
        p.y + Math.sin(a) * dist * 0.5 - Math.sin(progress * Math.PI) * 6,
        m.TW * 0.1, m.TW * 0.062);
    }
    ctx.restore();
  }

  // Floating text, used for loot and rescues.
  function drawFloatText(m, tx, ty, text, progress, color) {
    var ctx = m.ctx;
    var p = project(m, tx, ty);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - progress);
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(text, p.x, p.y - 22 - progress * 26);
    ctx.fillStyle = color || '#f0d264';
    ctx.fillText(text, p.x, p.y - 22 - progress * 26);
    ctx.restore();
  }

  return {
    render: {
      LOGICAL_W: LOGICAL_W, LOGICAL_H: LOGICAL_H,
      setup: setup, metrics: metrics, project: project, unproject: unproject,
      eventToTile: eventToTile, depthOf: depthOf,
      drawGround: drawGround, fillTile: fillTile, outlineFootprint: outlineFootprint,
      drawBuilding: drawBuilding, drawDog: drawDog, drawDeployZone: drawDeployZone,
      drawDebris: drawDebris, drawFreedBurst: drawFreedBurst, drawFloatText: drawFloatText,
      shade: shade, COLORS: COLORS
    }
  };
});
