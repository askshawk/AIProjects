/*
 * Kennel Wars - canvas drawing helpers.
 *
 * Pure presentation. Nothing here decides anything about the game; it only
 * draws whatever state it is handed, whether that is the player's live base or
 * a frame from a recorded battle replay.
 */
(function (root, factory) {
  var api = factory();
  root.KW = root.KW || {};
  Object.assign(root.KW, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ROLE_COLORS = {
    core: { fill: '#7a5322', edge: '#c9a227' },
    production: { fill: '#3d5730', edge: '#6f9553' },
    storage: { fill: '#6a5424', edge: '#b39239' },
    army: { fill: '#4a3d63', edge: '#8878ad' },
    defense: { fill: '#6d2f2f', edge: '#b45a5a' },
    wall: { fill: '#4f4a44', edge: '#7b736a' }
  };

  var LOGICAL = 624;   // canvas drawing size in CSS pixels

  function setup(canvas, grid) {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = LOGICAL * dpr;
    canvas.height = LOGICAL * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, tile: LOGICAL / grid, size: LOGICAL };
  }

  // Translate a mouse/touch event into fractional tile coordinates.
  function eventToTile(canvas, evt, grid) {
    var rect = canvas.getBoundingClientRect();
    var px = (evt.clientX - rect.left) / rect.width * LOGICAL;
    var py = (evt.clientY - rect.top) / rect.height * LOGICAL;
    var tile = LOGICAL / grid;
    return { x: px / tile, y: py / tile };
  }

  function drawGround(ctx, grid, tile) {
    ctx.fillStyle = '#2b3524';
    ctx.fillRect(0, 0, grid * tile, grid * tile);
    ctx.fillStyle = '#313d29';
    for (var y = 0; y < grid; y++) {
      for (var x = 0; x < grid; x++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * tile, y * tile, tile, tile);
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (var i = 0; i <= grid; i++) {
      ctx.beginPath();
      ctx.moveTo(i * tile, 0); ctx.lineTo(i * tile, grid * tile);
      ctx.moveTo(0, i * tile); ctx.lineTo(grid * tile, i * tile);
      ctx.stroke();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * @param opts { size, role, icon, level, hp (0..1), ghost, invalid, selected, dim }
   */
  function drawBuilding(ctx, x, y, tile, opts) {
    var size = opts.size;
    var px = x * tile, py = y * tile;
    var w = size * tile, h = size * tile;
    var pad = Math.max(1.5, tile * 0.08);
    var colors = ROLE_COLORS[opts.role] || ROLE_COLORS.wall;

    ctx.save();
    if (opts.ghost) ctx.globalAlpha = 0.55;
    if (opts.dim) ctx.globalAlpha = 0.28;

    ctx.fillStyle = opts.invalid ? '#7a2a2a' : colors.fill;
    roundRect(ctx, px + pad, py + pad, w - pad * 2, h - pad * 2, Math.min(6, tile * 0.28));
    ctx.fill();

    ctx.strokeStyle = opts.invalid ? '#c05050' : (opts.selected ? '#f0d264' : colors.edge);
    ctx.lineWidth = opts.selected ? 2.5 : 1.5;
    ctx.stroke();

    // Damage overlay: buildings darken and redden as they are chewed down.
    if (opts.hp != null && opts.hp < 1) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.55 * (1 - opts.hp)).toFixed(3) + ')';
      roundRect(ctx, px + pad, py + pad, w - pad * 2, h - pad * 2, Math.min(6, tile * 0.28));
      ctx.fill();
    }

    if (opts.icon && size > 1) {
      ctx.font = Math.floor(tile * (size >= 3 ? 0.85 : 0.72)) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.icon, px + w / 2, py + h / 2 + tile * 0.04);
    }

    // Level pips along the bottom edge.
    if (opts.level > 1 && size > 1) {
      var dots = Math.min(opts.level, 5);
      var dotR = Math.max(1.2, tile * 0.075);
      var gap = dotR * 2.6;
      var startX = px + w / 2 - (dots - 1) * gap / 2;
      ctx.fillStyle = '#f0d264';
      for (var d = 0; d < dots; d++) {
        ctx.beginPath();
        ctx.arc(startX + d * gap, py + h - pad - dotR * 1.6, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (opts.hp != null && opts.hp < 1 && opts.hp > 0) {
      var bw = w - pad * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(px + pad, py + pad, bw, 3);
      ctx.fillStyle = opts.hp > 0.5 ? '#7fbf5f' : (opts.hp > 0.25 ? '#d8b13f' : '#c8503f');
      ctx.fillRect(px + pad, py + pad, bw * opts.hp, 3);
    }
    ctx.restore();
  }

  // Range circle for a selected defensive building.
  function drawRange(ctx, cx, cy, radius, tile) {
    ctx.save();
    ctx.strokeStyle = 'rgba(240,210,100,0.5)';
    ctx.fillStyle = 'rgba(240,210,100,0.07)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(cx * tile, cy * tile, radius * tile, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * @param opts { color, hp (0..1), attacking, defender, radius }
   */
  function drawDog(ctx, x, y, tile, opts) {
    var px = x * tile, py = y * tile;
    var r = (opts.radius || 0.34) * tile;

    ctx.save();
    // Shadow grounds the sprite against the grass.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(px, py + r * 0.55, r * 0.85, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = opts.color || '#ddd';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = opts.defender ? '#e05a4a' : 'rgba(0,0,0,0.55)';
    ctx.lineWidth = opts.defender ? 2 : 1.2;
    ctx.stroke();

    // A bite flash so attacking is readable at a glance.
    if (opts.attacking) {
      ctx.strokeStyle = '#ffd45e';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(px, py, r * 1.45, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (opts.hp != null && opts.hp < 1) {
      var bw = r * 2.2;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(px - bw / 2, py - r - 5, bw, 2.5);
      ctx.fillStyle = opts.hp > 0.5 ? '#7fbf5f' : (opts.hp > 0.25 ? '#d8b13f' : '#c8503f');
      ctx.fillRect(px - bw / 2, py - r - 5, bw * opts.hp, 2.5);
    }
    ctx.restore();
  }

  // Shaded band showing where dogs may be released.
  function drawDeployZone(ctx, grid, tile, margin) {
    var full = grid * tile, band = margin * tile;
    ctx.save();
    ctx.fillStyle = 'rgba(240,210,100,0.10)';
    ctx.fillRect(0, 0, full, band);
    ctx.fillRect(0, full - band, full, band);
    ctx.fillRect(0, band, band, full - band * 2);
    ctx.fillRect(full - band, band, band, full - band * 2);
    ctx.strokeStyle = 'rgba(240,210,100,0.35)';
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(band, band, full - band * 2, full - band * 2);
    ctx.restore();
  }

  function drawBlast(ctx, x, y, tile, progress) {
    var r = tile * (0.4 + progress * 1.5);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - progress);
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x * tile, y * tile, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  return {
    render: {
      LOGICAL: LOGICAL, ROLE_COLORS: ROLE_COLORS,
      setup: setup, eventToTile: eventToTile,
      drawGround: drawGround, drawBuilding: drawBuilding, drawRange: drawRange,
      drawDog: drawDog, drawDeployZone: drawDeployZone, drawBlast: drawBlast
    }
  };
});
