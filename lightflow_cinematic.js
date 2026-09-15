(function () {
    'use strict';

    /* LIGHTFLOW_GIFENC_VENDOR_START
The MIT License (MIT)
Copyright (c) 2017 Matt DesLauriers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
OR OTHER DEALINGS IN THE SOFTWARE.


    */
    const cinematicGifCodec = (() => {
        const exports = {};
var __defProp = Object.defineProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};

// src/index.js
__markAsModule(exports);
__export(exports, {
  GIFEncoder: () => GIFEncoder,
  applyPalette: () => applyPalette,
  default: () => src_default,
  nearestColor: () => nearestColor,
  nearestColorIndex: () => nearestColorIndex,
  nearestColorIndexWithDistance: () => nearestColorIndexWithDistance,
  prequantize: () => prequantize,
  quantize: () => quantize,
  snapColorsToPalette: () => snapColorsToPalette
});

// src/constants.js
var constants_default = {
  signature: "GIF",
  version: "89a",
  trailer: 59,
  extensionIntroducer: 33,
  applicationExtensionLabel: 255,
  graphicControlExtensionLabel: 249,
  imageSeparator: 44,
  signatureSize: 3,
  versionSize: 3,
  globalColorTableFlagMask: 128,
  colorResolutionMask: 112,
  sortFlagMask: 8,
  globalColorTableSizeMask: 7,
  applicationIdentifierSize: 8,
  applicationAuthCodeSize: 3,
  disposalMethodMask: 28,
  userInputFlagMask: 2,
  transparentColorFlagMask: 1,
  localColorTableFlagMask: 128,
  interlaceFlagMask: 64,
  idSortFlagMask: 32,
  localColorTableSizeMask: 7
};

// src/stream.js
function createStream(initialCapacity = 256) {
  let cursor = 0;
  let contents = new Uint8Array(initialCapacity);
  return {
    get buffer() {
      return contents.buffer;
    },
    reset() {
      cursor = 0;
    },
    bytesView() {
      return contents.subarray(0, cursor);
    },
    bytes() {
      return contents.slice(0, cursor);
    },
    writeByte(byte) {
      expand(cursor + 1);
      contents[cursor] = byte;
      cursor++;
    },
    writeBytes(data, offset = 0, byteLength = data.length) {
      expand(cursor + byteLength);
      for (let i = 0; i < byteLength; i++) {
        contents[cursor++] = data[i + offset];
      }
    },
    writeBytesView(data, offset = 0, byteLength = data.byteLength) {
      expand(cursor + byteLength);
      contents.set(data.subarray(offset, offset + byteLength), cursor);
      cursor += byteLength;
    }
  };
  function expand(newCapacity) {
    var prevCapacity = contents.length;
    if (prevCapacity >= newCapacity)
      return;
    var CAPACITY_DOUBLING_MAX = 1024 * 1024;
    newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) >>> 0);
    if (prevCapacity != 0)
      newCapacity = Math.max(newCapacity, 256);
    const oldContents = contents;
    contents = new Uint8Array(newCapacity);
    if (cursor > 0)
      contents.set(oldContents.subarray(0, cursor), 0);
  }
}

// src/lzwEncode.js
var BITS = 12;
var DEFAULT_HSIZE = 5003;
var MASKS = [
  0,
  1,
  3,
  7,
  15,
  31,
  63,
  127,
  255,
  511,
  1023,
  2047,
  4095,
  8191,
  16383,
  32767,
  65535
];
function lzwEncode(width, height, pixels, colorDepth, outStream = createStream(512), accum = new Uint8Array(256), htab = new Int32Array(DEFAULT_HSIZE), codetab = new Int32Array(DEFAULT_HSIZE)) {
  const hsize = htab.length;
  const initCodeSize = Math.max(2, colorDepth);
  accum.fill(0);
  codetab.fill(0);
  htab.fill(-1);
  let cur_accum = 0;
  let cur_bits = 0;
  const init_bits = initCodeSize + 1;
  const g_init_bits = init_bits;
  let clear_flg = false;
  let n_bits = g_init_bits;
  let maxcode = (1 << n_bits) - 1;
  const ClearCode = 1 << init_bits - 1;
  const EOFCode = ClearCode + 1;
  let free_ent = ClearCode + 2;
  let a_count = 0;
  let ent = pixels[0];
  let hshift = 0;
  for (let fcode = hsize; fcode < 65536; fcode *= 2) {
    ++hshift;
  }
  hshift = 8 - hshift;
  outStream.writeByte(initCodeSize);
  output(ClearCode);
  const length = pixels.length;
  for (let idx = 1; idx < length; idx++) {
    next_block: {
      const c = pixels[idx];
      const fcode = (c << BITS) + ent;
      let i = c << hshift ^ ent;
      if (htab[i] === fcode) {
        ent = codetab[i];
        break next_block;
      }
      const disp = i === 0 ? 1 : hsize - i;
      while (htab[i] >= 0) {
        i -= disp;
        if (i < 0)
          i += hsize;
        if (htab[i] === fcode) {
          ent = codetab[i];
          break next_block;
        }
      }
      output(ent);
      ent = c;
      if (free_ent < 1 << BITS) {
        codetab[i] = free_ent++;
        htab[i] = fcode;
      } else {
        htab.fill(-1);
        free_ent = ClearCode + 2;
        clear_flg = true;
        output(ClearCode);
      }
    }
  }
  output(ent);
  output(EOFCode);
  outStream.writeByte(0);
  return outStream.bytesView();
  function output(code) {
    cur_accum &= MASKS[cur_bits];
    if (cur_bits > 0)
      cur_accum |= code << cur_bits;
    else
      cur_accum = code;
    cur_bits += n_bits;
    while (cur_bits >= 8) {
      accum[a_count++] = cur_accum & 255;
      if (a_count >= 254) {
        outStream.writeByte(a_count);
        outStream.writeBytesView(accum, 0, a_count);
        a_count = 0;
      }
      cur_accum >>= 8;
      cur_bits -= 8;
    }
    if (free_ent > maxcode || clear_flg) {
      if (clear_flg) {
        n_bits = g_init_bits;
        maxcode = (1 << n_bits) - 1;
        clear_flg = false;
      } else {
        ++n_bits;
        maxcode = n_bits === BITS ? 1 << n_bits : (1 << n_bits) - 1;
      }
    }
    if (code == EOFCode) {
      while (cur_bits > 0) {
        accum[a_count++] = cur_accum & 255;
        if (a_count >= 254) {
          outStream.writeByte(a_count);
          outStream.writeBytesView(accum, 0, a_count);
          a_count = 0;
        }
        cur_accum >>= 8;
        cur_bits -= 8;
      }
      if (a_count > 0) {
        outStream.writeByte(a_count);
        outStream.writeBytesView(accum, 0, a_count);
        a_count = 0;
      }
    }
  }
}
var lzwEncode_default = lzwEncode;

// src/rgb-packing.js
function rgb888_to_rgb565(r, g, b) {
  return r << 8 & 63488 | g << 2 & 992 | b >> 3;
}
function rgba8888_to_rgba4444(r, g, b, a) {
  return r >> 4 | g & 240 | (b & 240) << 4 | (a & 240) << 8;
}
function rgb888_to_rgb444(r, g, b) {
  return r >> 4 << 8 | g & 240 | b >> 4;
}

// src/pnnquant2.js
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
function sqr(value) {
  return value * value;
}
function find_nn(bins, idx, hasAlpha) {
  var nn = 0;
  var err = 1e100;
  const bin1 = bins[idx];
  const n1 = bin1.cnt;
  const wa = bin1.ac;
  const wr = bin1.rc;
  const wg = bin1.gc;
  const wb = bin1.bc;
  for (var i = bin1.fw; i != 0; i = bins[i].fw) {
    const bin = bins[i];
    const n2 = bin.cnt;
    const nerr2 = n1 * n2 / (n1 + n2);
    if (nerr2 >= err)
      continue;
    var nerr = 0;
    if (hasAlpha) {
      nerr += nerr2 * sqr(bin.ac - wa);
      if (nerr >= err)
        continue;
    }
    nerr += nerr2 * sqr(bin.rc - wr);
    if (nerr >= err)
      continue;
    nerr += nerr2 * sqr(bin.gc - wg);
    if (nerr >= err)
      continue;
    nerr += nerr2 * sqr(bin.bc - wb);
    if (nerr >= err)
      continue;
    err = nerr;
    nn = i;
  }
  bin1.err = err;
  bin1.nn = nn;
}
function create_bin() {
  return {
    ac: 0,
    rc: 0,
    gc: 0,
    bc: 0,
    cnt: 0,
    nn: 0,
    fw: 0,
    bk: 0,
    tm: 0,
    mtm: 0,
    err: 0
  };
}
function create_bin_list(data, format) {
  const bincount = format === "rgb444" ? 4096 : 65536;
  const bins = new Array(bincount);
  const size = data.length;
  if (format === "rgba4444") {
    for (let i = 0; i < size; ++i) {
      const color = data[i];
      const a = color >> 24 & 255;
      const b = color >> 16 & 255;
      const g = color >> 8 & 255;
      const r = color & 255;
      const index = rgba8888_to_rgba4444(r, g, b, a);
      let bin = index in bins ? bins[index] : bins[index] = create_bin();
      bin.rc += r;
      bin.gc += g;
      bin.bc += b;
      bin.ac += a;
      bin.cnt++;
    }
  } else if (format === "rgb444") {
    for (let i = 0; i < size; ++i) {
      const color = data[i];
      const b = color >> 16 & 255;
      const g = color >> 8 & 255;
      const r = color & 255;
      const index = rgb888_to_rgb444(r, g, b);
      let bin = index in bins ? bins[index] : bins[index] = create_bin();
      bin.rc += r;
      bin.gc += g;
      bin.bc += b;
      bin.cnt++;
    }
  } else {
    for (let i = 0; i < size; ++i) {
      const color = data[i];
      const b = color >> 16 & 255;
      const g = color >> 8 & 255;
      const r = color & 255;
      const index = rgb888_to_rgb565(r, g, b);
      let bin = index in bins ? bins[index] : bins[index] = create_bin();
      bin.rc += r;
      bin.gc += g;
      bin.bc += b;
      bin.cnt++;
    }
  }
  return bins;
}
function quantize(rgba, maxColors, opts = {}) {
  const {
    format = "rgb565",
    clearAlpha = true,
    clearAlphaColor = 0,
    clearAlphaThreshold = 0,
    oneBitAlpha = false
  } = opts;
  if (!rgba || !rgba.buffer) {
    throw new Error("quantize() expected RGBA Uint8Array data");
  }
  if (!(rgba instanceof Uint8Array) && !(rgba instanceof Uint8ClampedArray)) {
    throw new Error("quantize() expected RGBA Uint8Array data");
  }
  const data = new Uint32Array(rgba.buffer);
  let useSqrt = opts.useSqrt !== false;
  const hasAlpha = format === "rgba4444";
  const bins = create_bin_list(data, format);
  const bincount = bins.length;
  const bincountMinusOne = bincount - 1;
  const heap = new Uint32Array(bincount + 1);
  var maxbins = 0;
  for (var i = 0; i < bincount; ++i) {
    const bin = bins[i];
    if (bin != null) {
      var d = 1 / bin.cnt;
      if (hasAlpha)
        bin.ac *= d;
      bin.rc *= d;
      bin.gc *= d;
      bin.bc *= d;
      bins[maxbins++] = bin;
    }
  }
  if (sqr(maxColors) / maxbins < 0.022) {
    useSqrt = false;
  }
  var i = 0;
  for (; i < maxbins - 1; ++i) {
    bins[i].fw = i + 1;
    bins[i + 1].bk = i;
    if (useSqrt)
      bins[i].cnt = Math.sqrt(bins[i].cnt);
  }
  if (useSqrt)
    bins[i].cnt = Math.sqrt(bins[i].cnt);
  var h, l, l2;
  for (i = 0; i < maxbins; ++i) {
    find_nn(bins, i, false);
    var err = bins[i].err;
    for (l = ++heap[0]; l > 1; l = l2) {
      l2 = l >> 1;
      if (bins[h = heap[l2]].err <= err)
        break;
      heap[l] = h;
    }
    heap[l] = i;
  }
  var extbins = maxbins - maxColors;
  for (i = 0; i < extbins; ) {
    var tb;
    for (; ; ) {
      var b1 = heap[1];
      tb = bins[b1];
      if (tb.tm >= tb.mtm && bins[tb.nn].mtm <= tb.tm)
        break;
      if (tb.mtm == bincountMinusOne)
        b1 = heap[1] = heap[heap[0]--];
      else {
        find_nn(bins, b1, false);
        tb.tm = i;
      }
      var err = bins[b1].err;
      for (l = 1; (l2 = l + l) <= heap[0]; l = l2) {
        if (l2 < heap[0] && bins[heap[l2]].err > bins[heap[l2 + 1]].err)
          l2++;
        if (err <= bins[h = heap[l2]].err)
          break;
        heap[l] = h;
      }
      heap[l] = b1;
    }
    var nb = bins[tb.nn];
    var n1 = tb.cnt;
    var n2 = nb.cnt;
    var d = 1 / (n1 + n2);
    if (hasAlpha)
      tb.ac = d * (n1 * tb.ac + n2 * nb.ac);
    tb.rc = d * (n1 * tb.rc + n2 * nb.rc);
    tb.gc = d * (n1 * tb.gc + n2 * nb.gc);
    tb.bc = d * (n1 * tb.bc + n2 * nb.bc);
    tb.cnt += nb.cnt;
    tb.mtm = ++i;
    bins[nb.bk].fw = nb.fw;
    bins[nb.fw].bk = nb.bk;
    nb.mtm = bincountMinusOne;
  }
  let palette = [];
  var k = 0;
  for (i = 0; ; ++k) {
    let r = clamp(Math.round(bins[i].rc), 0, 255);
    let g = clamp(Math.round(bins[i].gc), 0, 255);
    let b = clamp(Math.round(bins[i].bc), 0, 255);
    let a = 255;
    if (hasAlpha) {
      a = clamp(Math.round(bins[i].ac), 0, 255);
      if (oneBitAlpha) {
        const threshold = typeof oneBitAlpha === "number" ? oneBitAlpha : 127;
        a = a <= threshold ? 0 : 255;
      }
      if (clearAlpha && a <= clearAlphaThreshold) {
        r = g = b = clearAlphaColor;
        a = 0;
      }
    }
    const color = hasAlpha ? [r, g, b, a] : [r, g, b];
    const exists = existsInPalette(palette, color);
    if (!exists)
      palette.push(color);
    if ((i = bins[i].fw) == 0)
      break;
  }
  return palette;
}
function existsInPalette(palette, color) {
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    let matchesRGB = p[0] === color[0] && p[1] === color[1] && p[2] === color[2];
    let matchesAlpha = p.length >= 4 && color.length >= 4 ? p[3] === color[3] : true;
    if (matchesRGB && matchesAlpha)
      return true;
  }
  return false;
}

// src/color.js
function euclideanDistanceSquared(a, b) {
  var sum = 0;
  var n;
  for (n = 0; n < a.length; n++) {
    const dx = a[n] - b[n];
    sum += dx * dx;
  }
  return sum;
}

// src/palettize.js
function roundStep(byte, step) {
  return step > 1 ? Math.round(byte / step) * step : byte;
}
function prequantize(rgba, {roundRGB = 5, roundAlpha = 10, oneBitAlpha = null} = {}) {
  const data = new Uint32Array(rgba.buffer);
  for (let i = 0; i < data.length; i++) {
    const color = data[i];
    let a = color >> 24 & 255;
    let b = color >> 16 & 255;
    let g = color >> 8 & 255;
    let r = color & 255;
    a = roundStep(a, roundAlpha);
    if (oneBitAlpha) {
      const threshold = typeof oneBitAlpha === "number" ? oneBitAlpha : 127;
      a = a <= threshold ? 0 : 255;
    }
    r = roundStep(r, roundRGB);
    g = roundStep(g, roundRGB);
    b = roundStep(b, roundRGB);
    data[i] = a << 24 | b << 16 | g << 8 | r << 0;
  }
}
function applyPalette(rgba, palette, format = "rgb565") {
  if (!rgba || !rgba.buffer) {
    throw new Error("quantize() expected RGBA Uint8Array data");
  }
  if (!(rgba instanceof Uint8Array) && !(rgba instanceof Uint8ClampedArray)) {
    throw new Error("quantize() expected RGBA Uint8Array data");
  }
  if (palette.length > 256) {
    throw new Error("applyPalette() only works with 256 colors or less");
  }
  const data = new Uint32Array(rgba.buffer);
  const length = data.length;
  const bincount = format === "rgb444" ? 4096 : 65536;
  const index = new Uint8Array(length);
  const cache = new Array(bincount);
  const hasAlpha = format === "rgba4444";
  if (format === "rgba4444") {
    for (let i = 0; i < length; i++) {
      const color = data[i];
      const a = color >> 24 & 255;
      const b = color >> 16 & 255;
      const g = color >> 8 & 255;
      const r = color & 255;
      const key = rgba8888_to_rgba4444(r, g, b, a);
      const idx = key in cache ? cache[key] : cache[key] = nearestColorIndexRGBA(r, g, b, a, palette);
      index[i] = idx;
    }
  } else {
    const rgb888_to_key = format === "rgb444" ? rgb888_to_rgb444 : rgb888_to_rgb565;
    for (let i = 0; i < length; i++) {
      const color = data[i];
      const b = color >> 16 & 255;
      const g = color >> 8 & 255;
      const r = color & 255;
      const key = rgb888_to_key(r, g, b);
      const idx = key in cache ? cache[key] : cache[key] = nearestColorIndexRGB(r, g, b, palette);
      index[i] = idx;
    }
  }
  return index;
}
function nearestColorIndexRGBA(r, g, b, a, palette) {
  let k = 0;
  let mindist = 1e100;
  for (let i = 0; i < palette.length; i++) {
    const px2 = palette[i];
    const a2 = px2[3];
    let curdist = sqr2(a2 - a);
    if (curdist > mindist)
      continue;
    const r2 = px2[0];
    curdist += sqr2(r2 - r);
    if (curdist > mindist)
      continue;
    const g2 = px2[1];
    curdist += sqr2(g2 - g);
    if (curdist > mindist)
      continue;
    const b2 = px2[2];
    curdist += sqr2(b2 - b);
    if (curdist > mindist)
      continue;
    mindist = curdist;
    k = i;
  }
  return k;
}
function nearestColorIndexRGB(r, g, b, palette) {
  let k = 0;
  let mindist = 1e100;
  for (let i = 0; i < palette.length; i++) {
    const px2 = palette[i];
    const r2 = px2[0];
    let curdist = sqr2(r2 - r);
    if (curdist > mindist)
      continue;
    const g2 = px2[1];
    curdist += sqr2(g2 - g);
    if (curdist > mindist)
      continue;
    const b2 = px2[2];
    curdist += sqr2(b2 - b);
    if (curdist > mindist)
      continue;
    mindist = curdist;
    k = i;
  }
  return k;
}
function snapColorsToPalette(palette, knownColors, threshold = 5) {
  if (!palette.length || !knownColors.length)
    return;
  const paletteRGB = palette.map((p) => p.slice(0, 3));
  const thresholdSq = threshold * threshold;
  const dim = palette[0].length;
  for (let i = 0; i < knownColors.length; i++) {
    let color = knownColors[i];
    if (color.length < dim) {
      color = [color[0], color[1], color[2], 255];
    } else if (color.length > dim) {
      color = color.slice(0, 3);
    } else {
      color = color.slice();
    }
    const r = nearestColorIndexWithDistance(paletteRGB, color.slice(0, 3), euclideanDistanceSquared);
    const idx = r[0];
    const distanceSq = r[1];
    if (distanceSq > 0 && distanceSq <= thresholdSq) {
      palette[idx] = color;
    }
  }
}
function sqr2(a) {
  return a * a;
}
function nearestColorIndex(colors, pixel, distanceFn = euclideanDistanceSquared) {
  let minDist = Infinity;
  let minDistIndex = -1;
  for (let j = 0; j < colors.length; j++) {
    const paletteColor = colors[j];
    const dist = distanceFn(pixel, paletteColor);
    if (dist < minDist) {
      minDist = dist;
      minDistIndex = j;
    }
  }
  return minDistIndex;
}
function nearestColorIndexWithDistance(colors, pixel, distanceFn = euclideanDistanceSquared) {
  let minDist = Infinity;
  let minDistIndex = -1;
  for (let j = 0; j < colors.length; j++) {
    const paletteColor = colors[j];
    const dist = distanceFn(pixel, paletteColor);
    if (dist < minDist) {
      minDist = dist;
      minDistIndex = j;
    }
  }
  return [minDistIndex, minDist];
}
function nearestColor(colors, pixel, distanceFn = euclideanDistanceSquared) {
  return colors[nearestColorIndex(colors, pixel, distanceFn)];
}

// src/index.js
function GIFEncoder(opt = {}) {
  const {initialCapacity = 4096, auto = true} = opt;
  const stream = createStream(initialCapacity);
  const HSIZE = 5003;
  const accum = new Uint8Array(256);
  const htab = new Int32Array(HSIZE);
  const codetab = new Int32Array(HSIZE);
  let hasInit = false;
  return {
    reset() {
      stream.reset();
      hasInit = false;
    },
    finish() {
      stream.writeByte(constants_default.trailer);
    },
    bytes() {
      return stream.bytes();
    },
    bytesView() {
      return stream.bytesView();
    },
    get buffer() {
      return stream.buffer;
    },
    get stream() {
      return stream;
    },
    writeHeader,
    writeFrame(index, width, height, opts = {}) {
      const {
        transparent = false,
        transparentIndex = 0,
        delay = 0,
        palette = null,
        repeat = 0,
        colorDepth = 8,
        dispose = -1
      } = opts;
      let first = false;
      if (auto) {
        if (!hasInit) {
          first = true;
          writeHeader();
          hasInit = true;
        }
      } else {
        first = Boolean(opts.first);
      }
      width = Math.max(0, Math.floor(width));
      height = Math.max(0, Math.floor(height));
      if (first) {
        if (!palette) {
          throw new Error("First frame must include a { palette } option");
        }
        encodeLogicalScreenDescriptor(stream, width, height, palette, colorDepth);
        encodeColorTable(stream, palette);
        if (repeat >= 0) {
          encodeNetscapeExt(stream, repeat);
        }
      }
      const delayTime = Math.round(delay / 10);
      encodeGraphicControlExt(stream, dispose, delayTime, transparent, transparentIndex);
      const useLocalColorTable = Boolean(palette) && !first;
      encodeImageDescriptor(stream, width, height, useLocalColorTable ? palette : null);
      if (useLocalColorTable)
        encodeColorTable(stream, palette);
      encodePixels(stream, index, width, height, colorDepth, accum, htab, codetab);
    }
  };
  function writeHeader() {
    writeUTFBytes(stream, "GIF89a");
  }
}
function encodeGraphicControlExt(stream, dispose, delay, transparent, transparentIndex) {
  stream.writeByte(33);
  stream.writeByte(249);
  stream.writeByte(4);
  if (transparentIndex < 0) {
    transparentIndex = 0;
    transparent = false;
  }
  var transp, disp;
  if (!transparent) {
    transp = 0;
    disp = 0;
  } else {
    transp = 1;
    disp = 2;
  }
  if (dispose >= 0) {
    disp = dispose & 7;
  }
  disp <<= 2;
  const userInput = 0;
  stream.writeByte(0 | disp | userInput | transp);
  writeUInt16(stream, delay);
  stream.writeByte(transparentIndex || 0);
  stream.writeByte(0);
}
function encodeLogicalScreenDescriptor(stream, width, height, palette, colorDepth = 8) {
  const globalColorTableFlag = 1;
  const sortFlag = 0;
  const globalColorTableSize = colorTableSize(palette.length) - 1;
  const fields = globalColorTableFlag << 7 | colorDepth - 1 << 4 | sortFlag << 3 | globalColorTableSize;
  const backgroundColorIndex = 0;
  const pixelAspectRatio = 0;
  writeUInt16(stream, width);
  writeUInt16(stream, height);
  stream.writeBytes([fields, backgroundColorIndex, pixelAspectRatio]);
}
function encodeNetscapeExt(stream, repeat) {
  stream.writeByte(33);
  stream.writeByte(255);
  stream.writeByte(11);
  writeUTFBytes(stream, "NETSCAPE2.0");
  stream.writeByte(3);
  stream.writeByte(1);
  writeUInt16(stream, repeat);
  stream.writeByte(0);
}
function encodeColorTable(stream, palette) {
  const colorTableLength = 1 << colorTableSize(palette.length);
  for (let i = 0; i < colorTableLength; i++) {
    let color = [0, 0, 0];
    if (i < palette.length) {
      color = palette[i];
    }
    stream.writeByte(color[0]);
    stream.writeByte(color[1]);
    stream.writeByte(color[2]);
  }
}
function encodeImageDescriptor(stream, width, height, localPalette) {
  stream.writeByte(44);
  writeUInt16(stream, 0);
  writeUInt16(stream, 0);
  writeUInt16(stream, width);
  writeUInt16(stream, height);
  if (localPalette) {
    const interlace = 0;
    const sorted = 0;
    const palSize = colorTableSize(localPalette.length) - 1;
    stream.writeByte(128 | interlace | sorted | 0 | palSize);
  } else {
    stream.writeByte(0);
  }
}
function encodePixels(stream, index, width, height, colorDepth = 8, accum, htab, codetab) {
  lzwEncode_default(width, height, index, colorDepth, stream, accum, htab, codetab);
}
function writeUInt16(stream, short) {
  stream.writeByte(short & 255);
  stream.writeByte(short >> 8 & 255);
}
function writeUTFBytes(stream, text) {
  for (var i = 0; i < text.length; i++) {
    stream.writeByte(text.charCodeAt(i));
  }
}
function colorTableSize(length) {
  return Math.max(Math.ceil(Math.log2(length)), 1);
}
var src_default = GIFEncoder;

        return exports;
    })();
    /* LIGHTFLOW_GIFENC_VENDOR_END */

    // Mediabunny 1.56.1, Copyright Vanilagy, MPL-2.0.
    // Unmodified browser bundle; original source and license: vendor/mediabunny-1.56.1/upstream.tgz
    // Source also available at https://github.com/Vanilagy/mediabunny/tree/v1.56.1
    let cinematicMediaCodec;
    function getCinematicMediaCodec() {
        if (cinematicMediaCodec) return cinematicMediaCodec;
        const module = { exports: {} };
        const exports = module.exports;
        /* LIGHTFLOW_MEDIABUNNY_VENDOR_START */
/*!
 * Copyright (c) 2026-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
"use strict";var Mediabunny=(()=>{var Sf=Object.create;var Na=Object.defineProperty;var Af=Object.getOwnPropertyDescriptor;var xf=Object.getOwnPropertyNames;var Cf=Object.getPrototypeOf,Pf=Object.prototype.hasOwnProperty;var cl=(i,t)=>(t=Symbol[i])?t:Symbol.for("Symbol."+i),ul=i=>{throw TypeError(i)};var If=(i,t)=>()=>(t||i((t={exports:{}}).exports,t),t.exports),Ef=(i,t)=>{for(var e in t)Na(i,e,{get:t[e],enumerable:!0})},ll=(i,t,e,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of xf(t))!Pf.call(i,n)&&n!==e&&Na(i,n,{get:()=>t[n],enumerable:!(r=Af(t,n))||r.enumerable});return i};var dl=(i,t,e)=>(e=i!=null?Sf(Cf(i)):{},ll(t||!i||!i.__esModule?Na(e,"default",{value:i,enumerable:!0}):e,i)),vf=i=>ll(Na({},"__esModule",{value:!0}),i);var at=(i,t,e)=>{if(t!=null){typeof t!="object"&&typeof t!="function"&&ul("Object expected");var r,n;e&&(r=t[cl("asyncDispose")]),r===void 0&&(r=t[cl("dispose")],e&&(n=r)),typeof r!="function"&&ul("Object not disposable"),n&&(r=function(){try{n.call(this)}catch(a){return Promise.reject(a)}}),i.push([e,r,t])}else e&&i.push([e]);return t},st=(i,t,e)=>{var r=typeof SuppressedError=="function"?SuppressedError:function(s,o,c,u){return u=Error(c),u.name="SuppressedError",u.error=s,u.suppressed=o,u},n=s=>t=e?new r(s,t,"An error was suppressed during disposal"):(e=!0,s),a=s=>{for(;s=i.pop();)try{var o=s[1]&&s[1].call(s[2]);if(s[0])return Promise.resolve(o).then(a,c=>(n(c),a()))}catch(c){n(c)}if(e)throw t};return a()};var hu=If(()=>{});var yg={};Ef(yg,{ADTS:()=>To,ALL_FORMATS:()=>em,ALL_TRACK_TYPES:()=>fc,AUDIO_CODECS:()=>fe,AdtsInputFormat:()=>ha,AdtsOutputFormat:()=>uc,AppendOnlyStreamTarget:()=>Wo,AttachedFile:()=>mr,AudioBufferSink:()=>Oo,AudioBufferSource:()=>tc,AudioSample:()=>Ae,AudioSampleResource:()=>Cr,AudioSampleSink:()=>Ii,AudioSampleSource:()=>Cn,AudioSource:()=>nr,BaseMediaSampleSink:()=>bn,BlobSource:()=>oo,BufferSource:()=>so,BufferTarget:()=>si,CanvasSink:()=>Bo,CanvasSource:()=>Jo,CmafOutputFormat:()=>vi,ConcurrentRunner:()=>Wa,Conversion:()=>gc,ConversionCanceledError:()=>In,CustomAudioDecoder:()=>Pa,CustomAudioEncoder:()=>Ea,CustomPathedSource:()=>un,CustomSource:()=>ln,CustomVideoDecoder:()=>Ca,CustomVideoEncoder:()=>Ia,EncodedAudioPacketSource:()=>Er,EncodedPacket:()=>j,EncodedPacketSink:()=>et,EncodedVideoPacketSource:()=>Ir,EventEmitter:()=>Ge,FLAC:()=>Cu,FilePathSource:()=>uo,FilePathTarget:()=>Ho,FlacInputFormat:()=>pa,FlacOutputFormat:()=>lc,HLS:()=>So,HLS_FORMATS:()=>tm,HlsInputFormat:()=>Ai,HlsOutputFormat:()=>mc,Input:()=>Xr,InputAudioTrack:()=>Zt,InputDisposedError:()=>ke,InputFormat:()=>Ke,InputTrack:()=>ti,InputVideoTrack:()=>Yt,IsobmffInputFormat:()=>dn,IsobmffOutputFormat:()=>Oi,LogLevel:()=>vc,Logging:()=>U,MATROSKA:()=>wu,MP3:()=>ko,MP4:()=>bo,MPEG_TS:()=>wo,MatroskaInputFormat:()=>mn,MediaSource:()=>Fi,MediaStreamAudioTrackSource:()=>rc,MediaStreamVideoTrackSource:()=>ec,MkvOutputFormat:()=>Pn,MovOutputFormat:()=>_i,Mp3InputFormat:()=>da,Mp3OutputFormat:()=>sc,Mp4InputFormat:()=>ca,Mp4OutputFormat:()=>Di,MpegTsInputFormat:()=>ga,MpegTsOutputFormat:()=>dc,NON_PCM_AUDIO_CODECS:()=>ft,NullTarget:()=>oi,OGG:()=>xu,OggInputFormat:()=>fa,OggOutputFormat:()=>cc,Output:()=>ar,OutputAudioTrack:()=>Ua,OutputFormat:()=>Ue,OutputSubtitleTrack:()=>za,OutputTrack:()=>Vi,OutputTrackGroup:()=>nt,OutputVideoTrack:()=>Va,PCM_AUDIO_CODECS:()=>se,PathedSource:()=>qe,PathedTarget:()=>it,QTFF:()=>yo,QUALITY_HIGH:()=>Am,QUALITY_LOW:()=>wm,QUALITY_MEDIUM:()=>Sm,QUALITY_VERY_HIGH:()=>xm,QUALITY_VERY_LOW:()=>Tm,Quality:()=>de,QuickTimeInputFormat:()=>ua,RangedSource:()=>sa,RangedTarget:()=>Ba,ReadableStreamSource:()=>Si,RichImageData:()=>lt,SUBTITLE_CODECS:()=>He,Source:()=>Ve,SourceRef:()=>Gr,StreamSource:()=>$d,StreamTarget:()=>xn,SubtitleSource:()=>Bi,Target:()=>Fe,TextSubtitleSource:()=>ic,UnsupportedInputFormatError:()=>kn,UrlSource:()=>co,VIDEO_CODECS:()=>ce,VIDEO_SAMPLE_PIXEL_FORMATS:()=>wa,VideoSample:()=>We,VideoSampleColorSpace:()=>Ci,VideoSampleResource:()=>Bt,VideoSampleSink:()=>ei,VideoSampleSource:()=>Mi,VideoSource:()=>ir,WAVE:()=>Au,WEBM:()=>Su,WavOutputFormat:()=>oc,WaveInputFormat:()=>ma,WebMInputFormat:()=>la,WebMOutputFormat:()=>ci,asc:()=>Um,canDecode:()=>im,canDecodeAudio:()=>Po,canDecodeVideo:()=>Co,canEncode:()=>Cm,canEncodeAudio:()=>Aa,canEncodeSubtitles:()=>xa,canEncodeVideo:()=>Sa,desc:()=>_a,getDecodableAudioCodecs:()=>Iu,getDecodableCodecs:()=>nm,getDecodableVideoCodecs:()=>Pu,getEncodableAudioCodecs:()=>pn,getEncodableCodecs:()=>Pm,getEncodableSubtitleCodecs:()=>Bu,getEncodableVideoCodecs:()=>Mu,getFirstEncodableAudioCodec:()=>Im,getFirstEncodableSubtitleCodec:()=>Em,getFirstEncodableVideoCodec:()=>Mo,prefer:()=>ii,registerDecoder:()=>vm,registerEncoder:()=>_m,registerVideoSampleTransformer:()=>dm});function g(i){if(!i)throw new Error("Assertion failed.")}var kt=i=>{let t=(i%360+360)%360;if(t===0||t===90||t===180||t===270)return t;throw new Error(`Invalid rotation ${i}.`)},ee=i=>i&&i[i.length-1],Ut=i=>i>=0&&i<2**32,fl=i=>i>=-(2**31)&&i<2**31,O=i=>{let t=0;for(;i.readBits(1)===0&&t<32;)t++;if(t>=32)throw new Error("Invalid exponential-Golomb code.");return(1<<t)-1+i.readBits(t)},ui=(i,t)=>{let e=t+1,r=Math.floor(Math.log2(e));i.writeBits(r,0),i.writeBits(1,1),i.writeBits(r,e-2**r)},zt=i=>{let t=O(i);return(t&1)===0?-(t>>1):t+1>>1},pl=(i,t,e,r)=>{for(let n=t;n<e;n++){let a=Math.floor(n/8),s=i[a],o=7-(n&7);s&=~(1<<o),s|=(r&1<<e-n-1)>>e-n-1<<o,i[a]=s}},Z=i=>i.constructor===Uint8Array?i:ArrayBuffer.isView(i)?new Uint8Array(i.buffer,i.byteOffset,i.byteLength):new Uint8Array(i),L=i=>i.constructor===DataView?i:ArrayBuffer.isView(i)?new DataView(i.buffer,i.byteOffset,i.byteLength):new DataView(i),we=new TextDecoder,J=new TextEncoder,Tt=i=>{for(let t=0;t<i.length;t++)if(i.charCodeAt(t)>255)return!1;return!0},Tc=i=>Object.fromEntries(Object.entries(i).map(([t,e])=>[e,t])),wt={bt709:1,bt470bg:5,smpte170m:6,bt2020:9,smpte432:12},ot=Tc(wt),St={bt709:1,smpte170m:6,linear:8,"iec61966-2-1":13,pq:16,hlg:18},ct=Tc(St),At={rgb:0,bt709:1,bt470bg:5,smpte170m:6,"bt2020-ncl":9},ut=Tc(At),Ui=i=>!!i&&!!i.primaries&&!!i.transfer&&!!i.matrix&&i.fullRange!==void 0,Ha=i=>!i||i.primaries==null&&i.transfer==null&&i.matrix==null&&i.fullRange==null,qa={primaries:void 0,transfer:void 0,matrix:void 0,fullRange:void 0},cr=i=>i instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&i instanceof SharedArrayBuffer||ArrayBuffer.isView(i),ze=class{constructor(){this.currentPromise=Promise.resolve();this.pending=0}async acquire(){let t,e=new Promise(n=>{let a=!1;t=()=>{a||(n(),this.pending--,a=!0)}}),r=this.currentPromise;return this.currentPromise=e,this.pending++,await r,t}},hl=/^[0-9a-fA-F]+$/,_r=i=>[...i].map(t=>t.toString(16).padStart(2,"0")).join(""),gl=i=>{g(i.length%2===0);let t=new Uint8Array(i.length/2);for(let e=0;e<i.length;e+=2)t[e/2]=parseInt(i.slice(e,e+2),16);return t},wc=i=>(i=i>>1&1431655765|(i&1431655765)<<1,i=i>>2&858993459|(i&858993459)<<2,i=i>>4&252645135|(i&252645135)<<4,i=i>>8&16711935|(i&16711935)<<8,i=i>>16&65535|(i&65535)<<16,i>>>0),ur=(i,t,e)=>{let r=0,n=i.length-1,a=-1;for(;r<=n;){let s=r+n>>1,o=e(i[s]);o===t?(a=s,n=s-1):o<t?r=s+1:n=s-1}return a},Q=(i,t,e)=>{let r=0,n=i.length-1,a=-1;for(;r<=n;){let s=r+(n-r+1)/2|0;e(i[s])<=t?(a=s,r=s+1):n=s-1}return a},Sc=(i,t,e)=>{let r=Q(i,e(t),e);i.splice(r+1,0,t)},te=()=>{let i,t;return{promise:new Promise((r,n)=>{i=r,t=n}),resolve:i,reject:t}},zi=(i,t)=>{let e=i.indexOf(t);e!==-1&&i.splice(e,1)},Ac=(i,t)=>{for(let e=i.length-1;e>=0;e--)if(t(i[e]))return i[e]},Rr=(i,t)=>{for(let e=i.length-1;e>=0;e--)if(t(i[e]))return e;return-1},bl=async function*(i){Symbol.iterator in i?yield*i[Symbol.iterator]():yield*i[Symbol.asyncIterator]()},yl=i=>{if(!(Symbol.iterator in i)&&!(Symbol.asyncIterator in i))throw new TypeError("Argument must be an iterable or async iterable.")},ie=i=>{throw new Error(`Unexpected value: ${i}`)},li=(i,t,e)=>{let r=i.getUint8(t),n=i.getUint8(t+1),a=i.getUint8(t+2);return e?r|n<<8|a<<16:r<<16|n<<8|a},kl=(i,t,e)=>li(i,t,e)<<8>>8,di=(i,t,e,r)=>{e=e>>>0,e=e&16777215,r?(i.setUint8(t,e&255),i.setUint8(t+1,e>>>8&255),i.setUint8(t+2,e>>>16&255)):(i.setUint8(t,e>>>16&255),i.setUint8(t+1,e>>>8&255),i.setUint8(t+2,e&255))},Tl=(i,t,e,r)=>{e=ne(e,-8388608,8388607),e<0&&(e=e+16777216&16777215),di(i,t,e,r)},wl=(i,t,e,r)=>{r?(i.setUint32(t+0,e,!0),i.setInt32(t+4,Math.floor(e/2**32),!0)):(i.setInt32(t+0,Math.floor(e/2**32),!0),i.setUint32(t+4,e,!0))},Rn=(i,t)=>({async next(){let e=await i.next();return e.done?{value:void 0,done:!0}:{value:t(e.value),done:!1}},return(){return i.return()},throw(e){return i.throw(e)},[Symbol.asyncIterator](){return this}}),ne=(i,t,e)=>Math.max(t,Math.min(e,i)),Sl=(i,t,e)=>i+(t-i)*e,xc=(i,t)=>i-Math.floor(i/t)*t,ae="und",lr=i=>{let t=Math.round(i);return Math.abs(i/t-1)<10*Number.EPSILON?t:i},Fn=(i,t)=>Math.round(i/t)*t,Nt=(i,t)=>Math.round(i*t)/t,Ka=(i,t)=>Math.floor(i/t)*t,Cc=(i,t)=>Math.floor(i*t)/t,Al=i=>{let t=0;for(;i;)t++,i>>=1;return t},Qa=i=>{let t=0;for(;i!==0;)i&=i-1,t++;return t},_f=/^[a-z]{3}$/,dr=i=>_f.test(i),Lt=1e6*(1+Number.EPSILON),Pc=(i,t)=>{let e={...i,...t};if(i.headers||t.headers){let r=i.headers?La(i.headers):{},n=t.headers?La(t.headers):{},a={...r};Object.entries(n).forEach(([s,o])=>{let c=Object.keys(a).find(u=>u.toLowerCase()===s.toLowerCase());c&&delete a[c],a[s]=o}),e.headers=a}return e},La=i=>{if(i instanceof Headers){let t={};return i.forEach((e,r)=>{t[r]=e}),t}if(Array.isArray(i)){let t={};return i.forEach(([e,r])=>{t[e]=r}),t}return i},Ic=async(i,t,e,r,n)=>{let a=0;for(;;)try{return await i(t,e)}catch(s){if(n())throw s;a++;let o=r(a,s,t);if(o===null)throw s;if(U._error("Retrying failed fetch. Error:",s),!Number.isFinite(o)||o<0)throw new TypeError("Retry delay must be a non-negative finite number.");if(o>0&&await Fr(1e3*o),n())throw s}},xl=(i,t)=>{let e=i<0?-1:1;i=Math.abs(i);let r=0,n=1,a=1,s=0,o=i;for(;;){let c=Math.floor(o),u=c*a+r,l=c*s+n;if(l>t)return{num:e*a,den:s};if(r=a,n=s,a=u,s=l,o=1/(o-c),!isFinite(o))break}return{num:e*a,den:s}},vr=class{constructor(){this.currentPromise=Promise.resolve()}call(t){return this.currentPromise=this.currentPromise.then(t)}},bc=null,Wt=()=>bc!==null?bc:bc=!!(typeof navigator<"u"&&(navigator.vendor?.match(/apple/i)||/AppleWebKit/.test(navigator.userAgent)&&!/Chrome/.test(navigator.userAgent)||/\b(iPad|iPhone|iPod)\b/.test(navigator.userAgent))),yc=null,mi=()=>yc!==null?yc:yc=typeof navigator<"u"&&navigator.userAgent?.includes("Firefox"),kc=null,Mn=()=>kc!==null?kc:kc=!!(typeof navigator<"u"&&(navigator.vendor?.includes("Google Inc")||/Chrome/.test(navigator.userAgent)));var Ni=i=>typeof globalThis.isSecureContext<"u"&&!globalThis.isSecureContext?`${i} is not available in this environment; this may be because this page is running in an insecure context. Try serving your page over HTTPS or use localhost.`:`${i} is not available in this environment.`,Rf=(async()=>{})().constructor,v=i=>i instanceof Rf||i instanceof Promise?!0:typeof i?.then=="function",fi=(i,t)=>i!==-1?i:t,Ga=(i,t,e,r)=>i<=r&&e<=t,xt=function*(i){for(let t in i){let e=i[t];e!==void 0&&(yield{key:t,value:e})}},Cl=i=>{switch(i.toLowerCase()){case"image/jpeg":case"image/jpg":return".jpg";case"image/png":return".png";case"image/gif":return".gif";case"image/webp":return".webp";case"image/bmp":return".bmp";case"image/svg+xml":return".svg";case"image/tiff":return".tiff";case"image/avif":return".avif";case"image/x-icon":case"image/vnd.microsoft.icon":return".ico";default:return null}},pi=i=>{let t=atob(i),e=new Uint8Array(t.length);for(let r=0;r<t.length;r++)e[r]=t.charCodeAt(r);return e},Pl=i=>{let t="";for(let e=0;e<i.length;e++)t+=String.fromCharCode(i[e]);return btoa(t)},ja=(i,t)=>{if(i.length!==t.length)return!1;for(let e=0;e<i.length;e++)if(i[e]!==t[e])return!1;return!0},Li=()=>{Symbol.dispose??=Symbol("Symbol.dispose")},Me=i=>typeof i=="number"&&!Number.isNaN(i),Ce=(i,t)=>{if(t.includes("://"))return t;if(i.includes("://")){let o=i.indexOf("?");o!==-1&&(i=i.slice(0,o))}let e;if(t.startsWith("/")){let o=i.indexOf("://");if(o===-1)e=t;else{let c=i.indexOf("/",o+3);c===-1?e=i+t:e=i.slice(0,c)+t}}else{let o=i.lastIndexOf("/");o===-1?e=t:e=i.slice(0,o+1)+t}let r="",n=e.indexOf("://");if(n!==-1){let o=e.indexOf("/",n+3);o!==-1&&(r=e.slice(0,o),e=e.slice(o))}let a=e.split("/"),s=[];for(let o of a)o===".."?s.pop():o!=="."&&s.push(o);return r+s.join("/")},hi=(i,t)=>{let e=0;for(let r=0;r<i.length;r++)t(i[r])&&e++;return e},Wi=(i,t)=>{let e=-1,r=1/0;for(let n=0;n<i.length;n++){let a=t(i[n]);a<r&&(r=a,e=n)}return e},Il=(i,t)=>{let e=-1,r=-1/0;for(let n=0;n<i.length;n++){let a=t(i[n]);a>r&&(r=a,e=n)}return e},Ht=i=>{g(Number.isInteger(i.num)),g(Number.isInteger(i.den)),g(i.den!==0);let t=Math.abs(i.num),e=Math.abs(i.den);for(;e!==0;){let n=t%e;t=e,e=n}let r=t||1;return{num:i.num/r,den:i.den/r}},Xa=(i,t)=>{if(typeof i!="object"||!i)throw new TypeError(`${t} must be an object.`);if(!Number.isInteger(i.left)||i.left<0)throw new TypeError(`${t}.left must be a non-negative integer.`);if(!Number.isInteger(i.top)||i.top<0)throw new TypeError(`${t}.top must be a non-negative integer.`);if(!Number.isInteger(i.width)||i.width<0)throw new TypeError(`${t}.width must be a non-negative integer.`);if(!Number.isInteger(i.height)||i.height<0)throw new TypeError(`${t}.height must be a non-negative integer.`)},_n,Ff=1,ml=new Map,Ec=new Map,El=()=>typeof window>"u",Mf=()=>{let i=new Map,t=new Map;self.onmessage=e=>{let r=e.data;switch(r.type){case"set-timeout":{let n=setTimeout(()=>{i.delete(r.timerId),self.postMessage({type:"fire",timerId:r.timerId})},r.delay);i.set(r.timerId,n)}break;case"set-interval":{let n=setInterval(()=>{self.postMessage({type:"fire",timerId:r.timerId})},r.delay);t.set(r.timerId,n)}break;case"clear-timeout":{let n=i.get(r.timerId);n!==void 0&&(clearTimeout(n),i.delete(r.timerId))}break;case"clear-interval":{let n=t.get(r.timerId);n!==void 0&&(clearInterval(n),t.delete(r.timerId))}break}}},vl=()=>{if(_n)return _n;let i=`(${Mf.toString()})();`,t=URL.createObjectURL(new Blob([i],{type:"text/javascript"}));return _n=new Worker(t),URL.revokeObjectURL(t),_n.onmessage=e=>{let r=e.data,n=ml.get(r.timerId);if(n){ml.delete(r.timerId),n();return}let a=Ec.get(r.timerId);a&&a()},_n};var _l=(i,t)=>{if(El())return{id:setInterval(i,t)};let e=Ff++;return Ec.set(e,()=>{i()}),vl().postMessage({type:"set-interval",timerId:e,delay:t}),{id:e}},Rl=i=>{if(El()){clearInterval(i.id);return}g(typeof i.id=="number"),Ec.delete(i.id),vl().postMessage({type:"clear-interval",timerId:i.id})},Fr=i=>new Promise(t=>setTimeout(t,i));var qt=i=>Array.isArray(i)?i:[i],Ge=class{constructor(){this._listeners=new Map}on(t,e,r){this._listeners.has(t)||this._listeners.set(t,new Set);let n={fn:e,once:r?.once??!1};return this._listeners.get(t).add(n),()=>{this._listeners.get(t)?.delete(n)}}_emit(...t){let[e,r]=t,n=this._listeners.get(e);if(n)for(let a of n){try{a.fn(r)}catch(s){console.error(s)}a.once&&n.delete(a)}}},gi=i=>Math.ceil(i/2)*2,Wa=class{constructor(t){this._queue=[];this._errored=!1;this.parallelism=t}get errored(){return this._errored}get inFlightCount(){return this._queue.length}async run(t){for(this._errored&&await Promise.race(this._queue);this._queue.length>=this.parallelism;)await Promise.race(this._queue);let e=t();this._queue.push(e),e.then(()=>zi(this._queue,e)).catch(()=>this._errored=!0)}async flush(){await Promise.all(this._queue)}},$a=i=>i!==null&&typeof i=="object"&&Object.getPrototypeOf(i)===Object.prototype&&Object.values(i).every(t=>typeof t=="string");var vc=(n=>(n[n.Silent=0]="Silent",n[n.Errors=1]="Errors",n[n.Warnings=2]="Warnings",n[n.Info=3]="Info",n))(vc||{}),je=class je{constructor(){}static get level(){return je._level}static set level(t){if(t!==0&&t!==1&&t!==2&&t!==3)throw new TypeError("Invalid log level. Use one of the values of the LogLevel enum.");je._level=t}static get _emitter(){return je._emitterInstance??=new Ge}static on(t,e,r){return je._emitter.on(t,e,r)}static _error(...t){je._emitter._emit("error",t),je._level>=1&&console.error(...t)}static _warn(...t){je._emitter._emit("warn",t),je._level>=2&&console.warn(...t)}static _info(...t){je._emitter._emit("info",t),je._level>=3&&console.info(...t)}};je._level=3,je._emitterInstance=null;var U=je;var lt=class{constructor(t,e){this.data=t;this.mimeType=e;if(!(t instanceof Uint8Array))throw new TypeError("data must be a Uint8Array.");if(typeof e!="string")throw new TypeError("mimeType must be a string.")}},mr=class{constructor(t,e,r,n){this.data=t;this.mimeType=e;this.name=r;this.description=n;if(!(t instanceof Uint8Array))throw new TypeError("data must be a Uint8Array.");if(e!==void 0&&typeof e!="string")throw new TypeError("mimeType, when provided, must be a string.");if(r!==void 0&&typeof r!="string")throw new TypeError("name, when provided, must be a string.");if(n!==void 0&&typeof n!="string")throw new TypeError("description, when provided, must be a string.")}},Bn=i=>{if(!i||typeof i!="object")throw new TypeError("tags must be an object.");if(i.title!==void 0&&typeof i.title!="string")throw new TypeError("tags.title, when provided, must be a string.");if(i.description!==void 0&&typeof i.description!="string")throw new TypeError("tags.description, when provided, must be a string.");if(i.artist!==void 0&&typeof i.artist!="string")throw new TypeError("tags.artist, when provided, must be a string.");if(i.album!==void 0&&typeof i.album!="string")throw new TypeError("tags.album, when provided, must be a string.");if(i.albumArtist!==void 0&&typeof i.albumArtist!="string")throw new TypeError("tags.albumArtist, when provided, must be a string.");if(i.trackNumber!==void 0&&(!Number.isInteger(i.trackNumber)||i.trackNumber<=0))throw new TypeError("tags.trackNumber, when provided, must be a positive integer.");if(i.tracksTotal!==void 0&&(!Number.isInteger(i.tracksTotal)||i.tracksTotal<=0))throw new TypeError("tags.tracksTotal, when provided, must be a positive integer.");if(i.discNumber!==void 0&&(!Number.isInteger(i.discNumber)||i.discNumber<=0))throw new TypeError("tags.discNumber, when provided, must be a positive integer.");if(i.discsTotal!==void 0&&(!Number.isInteger(i.discsTotal)||i.discsTotal<=0))throw new TypeError("tags.discsTotal, when provided, must be a positive integer.");if(i.genre!==void 0&&typeof i.genre!="string")throw new TypeError("tags.genre, when provided, must be a string.");if(i.date!==void 0&&(!(i.date instanceof Date)||Number.isNaN(i.date.getTime())))throw new TypeError("tags.date, when provided, must be a valid Date.");if(i.lyrics!==void 0&&typeof i.lyrics!="string")throw new TypeError("tags.lyrics, when provided, must be a string.");if(i.images!==void 0){if(!Array.isArray(i.images))throw new TypeError("tags.images, when provided, must be an array.");for(let t of i.images){if(!t||typeof t!="object")throw new TypeError("Each image in tags.images must be an object.");if(!(t.data instanceof Uint8Array))throw new TypeError("Each image.data must be a Uint8Array.");if(typeof t.mimeType!="string")throw new TypeError("Each image.mimeType must be a string.");if(!["coverFront","coverBack","unknown"].includes(t.kind))throw new TypeError("Each image.kind must be 'coverFront', 'coverBack', or 'unknown'.")}}if(i.comment!==void 0&&typeof i.comment!="string")throw new TypeError("tags.comment, when provided, must be a string.");if(i.raw!==void 0){if(!i.raw||typeof i.raw!="object")throw new TypeError("tags.raw, when provided, must be an object.");for(let t of Object.values(i.raw))if(t!==null&&typeof t!="string"&&!(Array.isArray(t)&&t.every(e=>typeof e=="string"))&&!(t instanceof Uint8Array)&&!(t instanceof lt)&&!(t instanceof mr)&&!$a(t))throw new TypeError("Each value in tags.raw must be a string, string array, Uint8Array, RichImageData, AttachedFile, Record<string, string>, or null.")}},fr=i=>i.title===void 0&&i.description===void 0&&i.artist===void 0&&i.album===void 0&&i.albumArtist===void 0&&i.trackNumber===void 0&&i.tracksTotal===void 0&&i.discNumber===void 0&&i.discsTotal===void 0&&i.genre===void 0&&i.date===void 0&&i.lyrics===void 0&&(!i.images||i.images.length===0)&&i.comment===void 0&&(i.raw===void 0||Object.keys(i.raw).length===0),_e={default:!0,primary:!0,forced:!1,original:!1,commentary:!1,hearingImpaired:!1,visuallyImpaired:!1},Fl=i=>{if(!i||typeof i!="object")throw new TypeError("disposition must be an object.");if(i.default!==void 0&&typeof i.default!="boolean")throw new TypeError("disposition.default must be a boolean.");if(i.primary!==void 0&&typeof i.primary!="boolean")throw new TypeError("disposition.primary must be a boolean.");if(i.forced!==void 0&&typeof i.forced!="boolean")throw new TypeError("disposition.forced must be a boolean.");if(i.original!==void 0&&typeof i.original!="boolean")throw new TypeError("disposition.original must be a boolean.");if(i.commentary!==void 0&&typeof i.commentary!="boolean")throw new TypeError("disposition.commentary must be a boolean.");if(i.hearingImpaired!==void 0&&typeof i.hearingImpaired!="boolean")throw new TypeError("disposition.hearingImpaired must be a boolean.");if(i.visuallyImpaired!==void 0&&typeof i.visuallyImpaired!="boolean")throw new TypeError("disposition.visuallyImpaired must be a boolean.")};var q=class i{constructor(t){this.bytes=t;this.pos=0}seekToByte(t){this.pos=8*t}readBit(){let t=Math.floor(this.pos/8),e=this.bytes[t]??0,r=7-(this.pos&7),n=(e&1<<r)>>r;return this.pos++,n}readBits(t){if(t===1)return this.readBit();let e=0;for(let r=0;r<t;r++)e<<=1,e|=this.readBit();return e}writeBits(t,e){let r=this.pos+t;for(let n=this.pos;n<r;n++){let a=Math.floor(n/8),s=this.bytes[a],o=7-(n&7);s&=~(1<<o),s|=(e&1<<r-n-1)>>r-n-1<<o,this.bytes[a]=s}this.pos=r}copyBits(t,e){let r=0;for(r;r<t-7;r+=8)this.writeBits(8,e.readBits(8));let n=t-r;n>0&&this.writeBits(n,e.readBits(n))}readAlignedByte(){if(this.pos%8!==0)throw new Error("Bitstream is not byte-aligned.");let t=this.pos/8,e=this.bytes[t]??0;return this.pos+=8,e}skipBits(t){this.pos+=t}getBitsLeft(){return this.bytes.length*8-this.pos}clone(){let t=new i(this.bytes);return t.pos=this.pos,t}};var mt=[96e3,88200,64e3,48e3,44100,32e3,24e3,22050,16e3,12e3,11025,8e3,7350],Kt=[-1,1,2,3,4,5,6,8],Qt=i=>{if(!i||i.byteLength<2)throw new TypeError("AAC description must be at least 2 bytes long.");let t=new q(i),e=_c(t),{frequencyIndex:r,sampleRate:n}=Rc(t),a=t.readBits(4),s=null;a>=1&&a<=7&&(s=Kt[a]);let o=e,c=!1,u=n;if(e===5||e===29)c=e===29,u=Rc(t).sampleRate,o=_c(t),o===22&&t.skipBits(4);else for(;t.getBitsLeft()>15;){let l=t.pos;if(t.readBits(11)!==695){t.pos=l+1;continue}_c(t)===5&&t.readBits(1)&&(u=Rc(t).sampleRate,t.getBitsLeft()>11&&t.readBits(11)===1352&&(c=!!t.readBits(1)));break}return s!==null&&s>1&&(c=!1),{objectType:e,coreObjectType:o,frequencyIndex:r,channelConfiguration:a,outputSampleRate:u,outputNumberOfChannels:c&&s===1?2:s}},_c=i=>{let t=i.readBits(5);return t===31?32+i.readBits(6):t},Rc=i=>{let t=i.readBits(4);return t===15?{frequencyIndex:t,sampleRate:i.readBits(24)}:{frequencyIndex:t,sampleRate:t<mt.length?mt[t]:null}},Hi=i=>{let t=i.objectType===5||i.objectType===29,e=i.objectType===29,r=t?i.outputSampleRate/2:i.outputSampleRate,n=e?1:i.outputNumberOfChannels,a=Kt.indexOf(n);if(a===-1)throw new TypeError(`Unsupported number of channels: ${i.outputNumberOfChannels}`);let s=16;i.objectType>=32&&(s+=6),Fc(r)===15&&(s+=24),t&&(s+=9,Fc(i.outputSampleRate)===15&&(s+=24));let o=Math.ceil(s/8),c=new Uint8Array(o),u=new q(c);return Ml(u,i.objectType),Bl(u,r),u.writeBits(4,a),t&&(Bl(u,i.outputSampleRate),Ml(u,2)),u.writeBits(3,0),c},Ml=(i,t)=>{t<32?i.writeBits(5,t):(i.writeBits(5,31),i.writeBits(6,t-32))},Bl=(i,t)=>{let e=Fc(t);i.writeBits(4,e),e===15&&i.writeBits(24,t)},Fc=i=>{let t=mt.indexOf(i);return t===-1?15:t},Ya=i=>{let t=new Uint8Array(7),e=new q(t),{coreObjectType:r,frequencyIndex:n,channelConfiguration:a}=i,s=r-1;return e.writeBits(12,4095),e.writeBits(1,0),e.writeBits(2,0),e.writeBits(1,1),e.writeBits(2,s),e.writeBits(4,n),e.writeBits(1,0),e.writeBits(3,a),e.writeBits(1,0),e.writeBits(1,0),e.writeBits(1,0),e.writeBits(1,0),e.skipBits(13),e.writeBits(11,2047),e.writeBits(2,0),{header:t,bitstream:e}},Za=(i,t)=>{i.pos=30,i.writeBits(13,t)};var bi=[48e3,44100,32e3],Mc=[24e3,22050,16e3];var Mr=function*(i){let t=0,e=-1;for(;t<i.length-2;){let r=i.indexOf(0,t);if(r===-1||r>=i.length-2)break;t=r;let n=0;if(t+3<i.length&&i[t+1]===0&&i[t+2]===0&&i[t+3]===1?n=4:i[t+1]===0&&i[t+2]===1&&(n=3),n===0){t++;continue}e!==-1&&t>e&&(yield{offset:e,length:t-e}),e=t+n,t=e}e!==-1&&e<i.length&&(yield{offset:e,length:i.length-e})},es=function*(i,t){let e=0,r=new DataView(i.buffer,i.byteOffset,i.byteLength);for(;e+t<=i.length;){let n;t===1?n=r.getUint8(e):t===2?n=r.getUint16(e,!1):t===3?n=li(r,e,!1):(g(t===4),n=r.getUint32(e,!1)),e+=t,yield{offset:e,length:n},e+=n}},Oc=(i,t)=>{if(t.description){let n=(Z(t.description)[4]&3)+1;return es(i,n)}else return Mr(i)},Gt=i=>i&31,ts=i=>{let t=[],e=i.length;for(let r=0;r<e;r++)r+2<e&&i[r]===0&&i[r+1]===0&&i[r+2]===3?(t.push(0,0),r+=2):t.push(i[r]);return new Uint8Array(t)},Bf=i=>{let t=[],e=0;for(let r of i)e===2&&r<=3&&(t.push(3),e=0),t.push(r),e=r===0?e+1:0;return new Uint8Array(t)},Bc=new Uint8Array([0,0,0,1]),Vn=i=>{let t=i.reduce((n,a)=>n+Bc.byteLength+a.byteLength,0),e=new Uint8Array(t),r=0;for(let n of i)e.set(Bc,r),r+=Bc.byteLength,e.set(n,r),r+=n.byteLength;return e},rs=(i,t)=>{let e=i.reduce((a,s)=>a+t+s.byteLength,0),r=new Uint8Array(e),n=0;for(let a of i){let s=new DataView(r.buffer,r.byteOffset,r.byteLength);switch(t){case 1:s.setUint8(n,a.byteLength);break;case 2:s.setUint16(n,a.byteLength,!1);break;case 3:di(s,n,a.byteLength,!1);break;case 4:s.setUint32(n,a.byteLength,!1);break}n+=t,r.set(a,n),n+=a.byteLength}return r},Ul=(i,t)=>{if(t.description){let n=(Z(t.description)[4]&3)+1;return rs(i,n)}else return Vn(i)},Br=i=>{try{let t=[],e=[],r=[];for(let o of Mr(i)){let c=i.subarray(o.offset,o.offset+o.length),u=Gt(c[0]);u===7?t.push(c):u===8?e.push(c):u===13&&r.push(c)}if(t.length===0||e.length===0)return null;let n=t[0],a=Or(n);g(a!==null);let s=a.profileIdc===100||a.profileIdc===110||a.profileIdc===122||a.profileIdc===144;return{configurationVersion:1,avcProfileIndication:a.profileIdc,profileCompatibility:a.constraintFlags,avcLevelIndication:a.levelIdc,lengthSizeMinusOne:3,sequenceParameterSets:t,pictureParameterSets:e,chromaFormat:s?a.chromaFormatIdc:null,bitDepthLumaMinus8:s?a.bitDepthLumaMinus8:null,bitDepthChromaMinus8:s?a.bitDepthChromaMinus8:null,sequenceParameterSetExt:s?r:null}}catch(t){return U._error("Error building AVC Decoder Configuration Record:",t),null}},is=i=>{let t=[];t.push(i.configurationVersion),t.push(i.avcProfileIndication),t.push(i.profileCompatibility),t.push(i.avcLevelIndication),t.push(252|i.lengthSizeMinusOne&3),t.push(224|i.sequenceParameterSets.length&31);for(let e of i.sequenceParameterSets){let r=e.byteLength;t.push(r>>8),t.push(r&255);for(let n=0;n<r;n++)t.push(e[n])}t.push(i.pictureParameterSets.length);for(let e of i.pictureParameterSets){let r=e.byteLength;t.push(r>>8),t.push(r&255);for(let n=0;n<r;n++)t.push(e[n])}if((i.avcProfileIndication===100||i.avcProfileIndication===110||i.avcProfileIndication===122||i.avcProfileIndication===144)&&i.chromaFormat!==null){g(i.bitDepthLumaMinus8!==null),g(i.bitDepthChromaMinus8!==null),g(i.sequenceParameterSetExt!==null),t.push(252|i.chromaFormat&3),t.push(248|i.bitDepthLumaMinus8&7),t.push(248|i.bitDepthChromaMinus8&7),t.push(i.sequenceParameterSetExt.length);for(let e of i.sequenceParameterSetExt){let r=e.byteLength;t.push(r>>8),t.push(r&255);for(let n=0;n<r;n++)t.push(e[n])}}return new Uint8Array(t)},qi=i=>{try{let t=L(i),e=0,r=t.getUint8(e++),n=t.getUint8(e++),a=t.getUint8(e++),s=t.getUint8(e++),o=t.getUint8(e++)&3,c=t.getUint8(e++)&31,u=[];for(let f=0;f<c;f++){let p=t.getUint16(e,!1);e+=2,u.push(i.subarray(e,e+p)),e+=p}let l=t.getUint8(e++),m=[];for(let f=0;f<l;f++){let p=t.getUint16(e,!1);e+=2,m.push(i.subarray(e,e+p)),e+=p}let d={configurationVersion:r,avcProfileIndication:n,profileCompatibility:a,avcLevelIndication:s,lengthSizeMinusOne:o,sequenceParameterSets:u,pictureParameterSets:m,chromaFormat:null,bitDepthLumaMinus8:null,bitDepthChromaMinus8:null,sequenceParameterSetExt:null};if((n===100||n===110||n===122||n===144)&&e+4<=i.length){let f=t.getUint8(e++)&3,p=t.getUint8(e++)&7,b=t.getUint8(e++)&7,h=t.getUint8(e++);d.chromaFormat=f,d.bitDepthLumaMinus8=p,d.bitDepthChromaMinus8=b;let y=[];for(let k=0;k<h;k++){let T=t.getUint16(e,!1);e+=2,y.push(i.subarray(e,e+T)),e+=T}d.sequenceParameterSetExt=y}return d}catch(t){return U._error("Error deserializing AVC Decoder Configuration Record:",t),null}},zl={1:{num:1,den:1},2:{num:12,den:11},3:{num:10,den:11},4:{num:16,den:11},5:{num:40,den:33},6:{num:24,den:11},7:{num:20,den:11},8:{num:32,den:11},9:{num:80,den:33},10:{num:18,den:11},11:{num:15,den:11},12:{num:64,den:33},13:{num:160,den:99},14:{num:4,den:3},15:{num:3,den:2},16:{num:2,den:1}},Or=i=>{try{let t=ts(i),e=new q(t);if(e.skipBits(1),e.skipBits(2),e.readBits(5)!==7)return null;let n=e.readAlignedByte(),a=e.readAlignedByte(),s=e.readAlignedByte();O(e);let o=1,c=0,u=0,l=0;if((n===100||n===110||n===122||n===244||n===44||n===83||n===86||n===118||n===128)&&(o=O(e),o===3&&(l=e.readBits(1)),c=O(e),u=O(e),e.skipBits(1),e.readBits(1))){for(let B=0;B<(o!==3?8:12);B++)if(e.readBits(1)){let Y=B<6?16:64,G=8,he=8;for(let pe=0;pe<Y;pe++){if(he!==0){let xe=zt(e);he=(G+xe+256)%256}G=he===0?G:he}}}O(e);let m=O(e);if(m===0)O(e);else if(m===1){e.skipBits(1),zt(e),zt(e);let V=O(e);for(let B=0;B<V;B++)zt(e)}O(e),e.skipBits(1);let d=O(e),f=O(e),p=16*(d+1),b=16*(f+1),h=p,y=b,k=e.readBits(1);if(k||e.skipBits(1),e.skipBits(1),e.readBits(1)){let V=O(e),B=O(e),W=O(e),Y=O(e),G,he;if((l===0?o:0)===0)G=1,he=2-k;else{let xe=o===3?1:2,ge=o===1?2:1;G=xe,he=ge*(2-k)}h-=G*(V+B),y-=he*(W+Y)}let w=2,x=2,C=2,P=0,A={num:1,den:1},S=null,I=null,E=null,R=null,_=e.pos;if(e.readBits(1)){if(e.readBits(1)){let xe=e.readBits(8);if(xe===255)A={num:e.readBits(16),den:e.readBits(16)};else{let ge=zl[xe];ge&&(A=ge)}}e.readBits(1)&&e.skipBits(1),e.readBits(1)&&(e.skipBits(3),P=e.readBits(1),e.readBits(1)&&(w=e.readBits(8),x=e.readBits(8),C=e.readBits(8))),e.readBits(1)&&(O(e),O(e)),e.readBits(1)&&(e.skipBits(32),e.skipBits(32),e.skipBits(1));let he=e.readBits(1);he&&Ol(e);let pe=e.readBits(1);pe&&Ol(e),(he||pe)&&e.skipBits(1),e.skipBits(1),E=e.pos,R=e.readBits(1),R&&(e.skipBits(1),O(e),O(e),O(e),O(e),S=O(e),I=O(e))}if(S===null){g(I===null);let V=a&16;if((n===44||n===86||n===100||n===110||n===122||n===244)&&V)S=0,I=0;else{let B=d+1,W=f+1,Y=(2-k)*W,G=Dn.find(pe=>pe.level>=s)??ee(Dn),he=Math.min(Math.floor(G.maxDpbMbs/(B*Y)),16);S=he,I=he}}return g(I!==null),{emulationUnpreventedBytes:t,profileIdc:n,constraintFlags:a,levelIdc:s,frameMbsOnlyFlag:k,chromaFormatIdc:o,bitDepthLumaMinus8:c,bitDepthChromaMinus8:u,codedWidth:p,codedHeight:b,displayWidth:h,displayHeight:y,pixelAspectRatio:A,colourPrimaries:w,matrixCoefficients:C,transferCharacteristics:x,fullRangeFlag:P,numReorderFrames:S,maxDecFrameBuffering:I,vuiParametersFlagBitOffset:_,bitstreamRestrictionFlagBitOffset:E,bitstreamRestrictionFlag:R}}catch(t){return U._error("Error parsing AVC SPS:",t),null}},Ol=i=>{let t=O(i);i.skipBits(4),i.skipBits(4);for(let e=0;e<=t;e++)O(i),O(i),i.skipBits(1);i.skipBits(5),i.skipBits(5),i.skipBits(5),i.skipBits(5)},Dc=i=>{g(i.bitstreamRestrictionFlag!==1);let t=new Uint8Array(i.emulationUnpreventedBytes.byteLength+64),e=new q(i.emulationUnpreventedBytes),r=new q(t);i.bitstreamRestrictionFlag===null?(r.copyBits(i.vuiParametersFlagBitOffset,e),r.writeBits(1,1),r.writeBits(1,0),r.writeBits(1,0),r.writeBits(1,0),r.writeBits(1,0),r.writeBits(1,0),r.writeBits(1,0),r.writeBits(1,0),r.writeBits(1,0)):(g(i.bitstreamRestrictionFlagBitOffset!==null),r.copyBits(i.bitstreamRestrictionFlagBitOffset,e)),r.writeBits(1,1),r.writeBits(1,1),ui(r,2),ui(r,1),ui(r,16),ui(r,16),ui(r,i.numReorderFrames),ui(r,i.maxDecFrameBuffering),r.writeBits(1,1),r.writeBits((8-r.pos%8)%8,0);let n=r.pos/8;return g(Number.isInteger(n)),Bf(t.subarray(0,n))},Of=(i,t)=>{if(t.description){let n=(Z(t.description)[21]&3)+1;return rs(i,n)}else return Vn(i)},On=(i,t)=>{if(t.description){let n=(Z(t.description)[21]&3)+1;return es(i,n)}else return Mr(i)},Ct=i=>i>>1&63,Un=i=>{try{let t=new q(ts(i));t.skipBits(16),t.readBits(4);let e=t.readBits(3),r=t.readBits(1),{general_profile_space:n,general_tier_flag:a,general_profile_idc:s,general_profile_compatibility_flags:o,general_constraint_indicator_flags:c,general_level_idc:u}=Df(t,e);O(t);let l=O(t),m=0;l===3&&(m=t.readBits(1));let d=O(t),f=O(t),p=d,b=f;if(t.readBits(1)){let R=O(t),_=O(t),z=O(t),V=O(t),B=1,W=1,Y=m===0?l:0;Y===1?(B=2,W=2):Y===2&&(B=2,W=1),p-=(R+_)*B,b-=(z+V)*W}let h=O(t),y=O(t);O(t);let T=t.readBits(1)?0:e,w=0;for(let R=T;R<=e;R++)O(t),w=O(t),O(t);O(t),O(t),O(t),O(t),O(t),O(t),t.readBits(1)&&t.readBits(1)&&Vf(t),t.skipBits(1),t.skipBits(1),t.readBits(1)&&(t.skipBits(4),t.skipBits(4),O(t),O(t),t.skipBits(1));let x=O(t);if(Uf(t,x),t.readBits(1)){let R=O(t);for(let _=0;_<R;_++)O(t),t.skipBits(1)}t.skipBits(1),t.skipBits(1);let C=2,P=2,A=2,S=0,I=0,E={num:1,den:1};if(t.readBits(1)){let R=Nf(t,e);E=R.pixelAspectRatio,C=R.colourPrimaries,P=R.transferCharacteristics,A=R.matrixCoefficients,S=R.fullRangeFlag,I=R.minSpatialSegmentationIdc}return{displayWidth:p,displayHeight:b,pixelAspectRatio:E,colourPrimaries:C,transferCharacteristics:P,matrixCoefficients:A,fullRangeFlag:S,maxDecFrameBuffering:w+1,spsMaxSubLayersMinus1:e,spsTemporalIdNestingFlag:r,generalProfileSpace:n,generalTierFlag:a,generalProfileIdc:s,generalProfileCompatibilityFlags:o,generalConstraintIndicatorFlags:c,generalLevelIdc:u,chromaFormatIdc:l,bitDepthLumaMinus8:h,bitDepthChromaMinus8:y,minSpatialSegmentationIdc:I}}catch(t){return U._error("Error parsing HEVC SPS:",t),null}},Dr=i=>{try{let t=[],e=[],r=[],n=[];for(let u of Mr(i)){let l=i.subarray(u.offset,u.offset+u.length),m=Ct(l[0]);m===32?t.push(l):m===33?e.push(l):m===34?r.push(l):(m===39||m===40)&&n.push(l)}if(e.length===0||r.length===0)return null;let a=Un(e[0]);if(!a)return null;let s=0;if(r.length>0){let u=r[0],l=new q(ts(u));l.skipBits(16),O(l),O(l),l.skipBits(1),l.skipBits(1),l.skipBits(3),l.skipBits(1),l.skipBits(1),O(l),O(l),zt(l),l.skipBits(1),l.skipBits(1),l.readBits(1)&&O(l),zt(l),zt(l),l.skipBits(1),l.skipBits(1),l.skipBits(1),l.skipBits(1);let m=l.readBits(1),d=l.readBits(1);!m&&!d?s=0:m&&!d?s=2:!m&&d?s=3:s=0}let o=[...t.length?[{arrayCompleteness:1,nalUnitType:32,nalUnits:t}]:[],...e.length?[{arrayCompleteness:1,nalUnitType:33,nalUnits:e}]:[],...r.length?[{arrayCompleteness:1,nalUnitType:34,nalUnits:r}]:[],...n.length?[{arrayCompleteness:1,nalUnitType:Ct(n[0][0]),nalUnits:n}]:[]];return{configurationVersion:1,generalProfileSpace:a.generalProfileSpace,generalTierFlag:a.generalTierFlag,generalProfileIdc:a.generalProfileIdc,generalProfileCompatibilityFlags:a.generalProfileCompatibilityFlags,generalConstraintIndicatorFlags:a.generalConstraintIndicatorFlags,generalLevelIdc:a.generalLevelIdc,minSpatialSegmentationIdc:a.minSpatialSegmentationIdc,parallelismType:s,chromaFormatIdc:a.chromaFormatIdc,bitDepthLumaMinus8:a.bitDepthLumaMinus8,bitDepthChromaMinus8:a.bitDepthChromaMinus8,avgFrameRate:0,constantFrameRate:0,numTemporalLayers:a.spsMaxSubLayersMinus1+1,temporalIdNested:a.spsTemporalIdNestingFlag,lengthSizeMinusOne:3,arrays:o}}catch(t){return U._error("Error building HEVC Decoder Configuration Record:",t),null}},Df=(i,t)=>{let e=i.readBits(2),r=i.readBits(1),n=i.readBits(5),a=0;for(let l=0;l<32;l++)a=a<<1|i.readBits(1);let s=new Uint8Array(6);for(let l=0;l<6;l++)s[l]=i.readBits(8);let o=i.readBits(8),c=[],u=[];for(let l=0;l<t;l++)c.push(i.readBits(1)),u.push(i.readBits(1));if(t>0)for(let l=t;l<8;l++)i.skipBits(2);for(let l=0;l<t;l++)c[l]&&i.skipBits(88),u[l]&&i.skipBits(8);return{general_profile_space:e,general_tier_flag:r,general_profile_idc:n,general_profile_compatibility_flags:a,general_constraint_indicator_flags:s,general_level_idc:o}},Vf=i=>{for(let t=0;t<4;t++)for(let e=0;e<(t===3?2:6);e++)if(!i.readBits(1))O(i);else{let n=Math.min(64,1<<4+(t<<1));t>1&&zt(i);for(let a=0;a<n;a++)zt(i)}},Uf=(i,t)=>{let e=[];for(let r=0;r<t;r++)e[r]=zf(i,r,t,e)},zf=(i,t,e,r)=>{let n=0,a=0,s=0;if(t!==0&&(a=i.readBits(1)),a){if(t===e){let c=O(i);s=t-(c+1)}else s=t-1;i.readBits(1),O(i);let o=r[s]??0;for(let c=0;c<=o;c++)i.readBits(1)||i.readBits(1);n=r[s]}else{let o=O(i),c=O(i);for(let u=0;u<o;u++)O(i),i.readBits(1);for(let u=0;u<c;u++)O(i),i.readBits(1);n=o+c}return n},Nf=(i,t)=>{let e=2,r=2,n=2,a=0,s=0,o={num:1,den:1};if(i.readBits(1)){let c=i.readBits(8);if(c===255)o={num:i.readBits(16),den:i.readBits(16)};else{let u=zl[c];u&&(o=u)}}return i.readBits(1)&&i.readBits(1),i.readBits(1)&&(i.readBits(3),a=i.readBits(1),i.readBits(1)&&(e=i.readBits(8),r=i.readBits(8),n=i.readBits(8))),i.readBits(1)&&(O(i),O(i)),i.readBits(1),i.readBits(1),i.readBits(1),i.readBits(1)&&(O(i),O(i),O(i),O(i)),i.readBits(1)&&(i.readBits(32),i.readBits(32),i.readBits(1)&&O(i),i.readBits(1)&&Lf(i,!0,t)),i.readBits(1)&&(i.readBits(1),i.readBits(1),i.readBits(1),s=O(i),O(i),O(i),O(i),O(i)),{pixelAspectRatio:o,colourPrimaries:e,transferCharacteristics:r,matrixCoefficients:n,fullRangeFlag:a,minSpatialSegmentationIdc:s}},Lf=(i,t,e)=>{let r=!1,n=!1,a=!1;t&&(r=i.readBits(1)===1,n=i.readBits(1)===1,(r||n)&&(a=i.readBits(1)===1,a&&(i.readBits(8),i.readBits(5),i.readBits(1),i.readBits(5)),i.readBits(4),i.readBits(4),a&&i.readBits(4),i.readBits(5),i.readBits(5),i.readBits(5)));for(let s=0;s<=e;s++){let o=i.readBits(1)===1,c=!0;o||(c=i.readBits(1)===1);let u=!1;c?O(i):u=i.readBits(1)===1;let l=1;u||(l=O(i)+1),r&&Dl(i,l,a),n&&Dl(i,l,a)}},Dl=(i,t,e)=>{for(let r=0;r<t;r++)O(i),O(i),e&&(O(i),O(i)),i.readBits(1)},Nl=i=>{let t=[];t.push(i.configurationVersion),t.push((i.generalProfileSpace&3)<<6|(i.generalTierFlag&1)<<5|i.generalProfileIdc&31),t.push(i.generalProfileCompatibilityFlags>>>24&255),t.push(i.generalProfileCompatibilityFlags>>>16&255),t.push(i.generalProfileCompatibilityFlags>>>8&255),t.push(i.generalProfileCompatibilityFlags&255),t.push(...i.generalConstraintIndicatorFlags),t.push(i.generalLevelIdc&255),t.push(240|i.minSpatialSegmentationIdc>>8&15),t.push(i.minSpatialSegmentationIdc&255),t.push(252|i.parallelismType&3),t.push(252|i.chromaFormatIdc&3),t.push(248|i.bitDepthLumaMinus8&7),t.push(248|i.bitDepthChromaMinus8&7),t.push(i.avgFrameRate>>8&255),t.push(i.avgFrameRate&255),t.push((i.constantFrameRate&3)<<6|(i.numTemporalLayers&7)<<3|(i.temporalIdNested&1)<<2|i.lengthSizeMinusOne&3),t.push(i.arrays.length&255);for(let e of i.arrays){t.push((e.arrayCompleteness&1)<<7|0|e.nalUnitType&63),t.push(e.nalUnits.length>>8&255),t.push(e.nalUnits.length&255);for(let r of e.nalUnits){t.push(r.length>>8&255),t.push(r.length&255);for(let n=0;n<r.length;n++)t.push(r[n])}}return new Uint8Array(t)},ns=i=>{try{let t=L(i),e=0,r=t.getUint8(e++),n=t.getUint8(e++),a=n>>6&3,s=n>>5&1,o=n&31,c=t.getUint32(e,!1);e+=4;let u=i.subarray(e,e+6);e+=6;let l=t.getUint8(e++),m=(t.getUint8(e++)&15)<<8|t.getUint8(e++),d=t.getUint8(e++)&3,f=t.getUint8(e++)&3,p=t.getUint8(e++)&7,b=t.getUint8(e++)&7,h=t.getUint16(e,!1);e+=2;let y=t.getUint8(e++),k=y>>6&3,T=y>>3&7,w=y>>2&1,x=y&3,C=t.getUint8(e++),P=[];for(let A=0;A<C;A++){let S=t.getUint8(e++),I=S>>7&1,E=S&63,R=t.getUint16(e,!1);e+=2;let _=[];for(let z=0;z<R;z++){let V=t.getUint16(e,!1);e+=2,_.push(i.subarray(e,e+V)),e+=V}P.push({arrayCompleteness:I,nalUnitType:E,nalUnits:_})}return{configurationVersion:r,generalProfileSpace:a,generalTierFlag:s,generalProfileIdc:o,generalProfileCompatibilityFlags:c,generalConstraintIndicatorFlags:u,generalLevelIdc:l,minSpatialSegmentationIdc:m,parallelismType:d,chromaFormatIdc:f,bitDepthLumaMinus8:p,bitDepthChromaMinus8:b,avgFrameRate:h,constantFrameRate:k,numTemporalLayers:T,temporalIdNested:w,lengthSizeMinusOne:x,arrays:P}}catch(t){return U._error("Error deserializing HEVC Decoder Configuration Record:",t),null}};var Ll=(i,t)=>{let e=new Set,r=0;for(let a of On(i,t)){if(r===4){e.add(a.offset);continue}let s=Ct(i[a.offset]);if(r===3&&s!==37){e.add(a.offset);continue}let o=!1;s===35?r>0?o=!0:r=1:s<=31?r>2?o=!0:r=2:s===36?r!==2?o=!0:r=3:s===37?r<2?o=!0:r=4:s===32||s===33||s===34||s===39||s>=41&&s<=44||s>=48&&s<=55?r>1?o=!0:r=1:(s===38||s===40||s>=45&&s<=47||s>=56&&s<=63)&&r<2&&(o=!0),o&&e.add(a.offset)}if(e.size===0)return null;let n=[];for(let a of On(i,t))e.has(a.offset)||n.push(i.subarray(a.offset,a.offset+a.length));return Of(n,t)},Wf={1:{colourPrimaries:5,transferCharacteristics:6,matrixCoefficients:5},2:{colourPrimaries:1,transferCharacteristics:1,matrixCoefficients:1},3:{colourPrimaries:6,transferCharacteristics:6,matrixCoefficients:6},4:{colourPrimaries:7,transferCharacteristics:7,matrixCoefficients:7},5:{colourPrimaries:9,transferCharacteristics:14,matrixCoefficients:9},7:{colourPrimaries:1,transferCharacteristics:13,matrixCoefficients:0}},as=i=>{let t=new q(i);if(t.readBits(2)!==2)return null;let r=t.readBits(1),a=(t.readBits(1)<<1)+r;if(a===3&&t.skipBits(1),t.readBits(1)===1||t.readBits(1)!==0||(t.skipBits(2),t.readBits(24)!==4817730))return null;let u=8;a>=2&&(u=t.readBits(1)?12:10);let l=t.readBits(3),m=0,d=0;if(l!==7)if(d=t.readBits(1),a===1||a===3){let A=t.readBits(1),S=t.readBits(1);m=!A&&!S?3:A&&!S?2:1,t.skipBits(1)}else m=1;else m=3,d=1;let f=t.readBits(16),p=t.readBits(16),b=f+1,h=p+1,y=b*h,k=ee(pr).level;for(let P of pr)if(y<=P.maxPictureSize){k=P.level;break}let T=Wf[l],w=T?.colourPrimaries??2,x=T?.transferCharacteristics??2,C=T?.matrixCoefficients??2;return{profile:a,level:k,bitDepth:u,chromaSubsampling:m,videoFullRangeFlag:d,colourPrimaries:w,transferCharacteristics:x,matrixCoefficients:C}},Wl=i=>i.colourPrimaries!==2||i.transferCharacteristics!==2||i.matrixCoefficients!==2,Hl=function*(i){let t=new q(i),e=()=>{let r=0;for(let n=0;n<8;n++){let a=t.readAlignedByte();if(r+=(a&127)*2**(n*7),!(a&128))break;if(n===7&&a&128)return null}return r>2**32-1?null:r};for(;t.getBitsLeft()>=8;){t.skipBits(1);let r=t.readBits(4),n=t.readBits(1),a=t.readBits(1);t.skipBits(1),n&&t.skipBits(8);let s;if(a){let o=e();if(o===null)return;s=o}else s=Math.floor(t.getBitsLeft()/8);g(t.pos%8===0),yield{type:r,data:i.subarray(t.pos/8,t.pos/8+s)},t.skipBits(s*8)}},zn=i=>{for(let{type:t,data:e}of Hl(i)){if(t!==1)continue;let r=new q(e),n=r.readBits(3),a=r.readBits(1),s=r.readBits(1),o=0,c=0,u=0;if(s)o=r.readBits(5);else{let I=r.readBits(1),E=0;if(I){if(r.skipBits(32),r.skipBits(32),r.readBits(1)){let V=0;for(;V<32&&!r.readBits(1);)V++;V<32&&r.skipBits(V)}E=r.readBits(1),E&&(u=r.readBits(5),r.skipBits(32),r.skipBits(5),r.skipBits(5))}let R=r.readBits(1),_=r.readBits(5);for(let z=0;z<=_;z++){r.skipBits(12);let V=r.readBits(5);if(z===0&&(o=V),V>7){let B=r.readBits(1);z===0&&(c=B)}if(E&&r.readBits(1)){let W=u+1;r.skipBits(W),r.skipBits(W),r.skipBits(1)}R&&r.readBits(1)&&r.skipBits(4)}}let l=r.readBits(4),m=r.readBits(4),d=l+1;r.skipBits(d);let f=m+1;r.skipBits(f);let p=0;if(s?p=0:p=r.readBits(1),p&&(r.skipBits(4),r.skipBits(3)),r.skipBits(1),r.skipBits(1),r.skipBits(1),!s){r.skipBits(1),r.skipBits(1),r.skipBits(1),r.skipBits(1);let I=r.readBits(1);I&&(r.skipBits(1),r.skipBits(1));let E=r.readBits(1),R=0;E?R=2:R=r.readBits(1),R>0&&(r.readBits(1)||r.skipBits(1)),I&&r.skipBits(3)}r.skipBits(1),r.skipBits(1),r.skipBits(1);let b=r.readBits(1),h=8;n===2&&b?h=r.readBits(1)?12:10:n<=2&&(h=b?10:8);let y=0;n!==1&&(y=r.readBits(1));let k=2,T=2,w=2;r.readBits(1)&&(k=r.readBits(8),T=r.readBits(8),w=r.readBits(8));let C=0,P=1,A=1,S=0;return y?C=r.readBits(1):k===1&&T===13&&w===0?(C=1,P=0,A=0):(C=r.readBits(1),n===0?(P=1,A=1):n===1?(P=0,A=0):h===12?(P=r.readBits(1),A=P?r.readBits(1):0):(P=1,A=0),P&&A&&(S=r.readBits(2))),{profile:n,level:o,tier:c,bitDepth:h,monochrome:y,chromaSubsamplingX:P,chromaSubsamplingY:A,chromaSamplePosition:S,videoFullRangeFlag:C,colourPrimaries:k,transferCharacteristics:T,matrixCoefficients:w}}return null},ql=i=>i.colourPrimaries!==2||i.transferCharacteristics!==2||i.matrixCoefficients!==2,ss=i=>{if(i.length<36)return null;let e=L(i);return e.getUint32(4)!==1768124518||e.getUint16(8)<28?null:{fullRange:!1,colourPrimaries:e.getUint8(22),transferCharacteristics:e.getUint8(23),matrixCoefficients:e.getUint8(24)}},Vr=i=>{let t=L(i),e=t.getUint8(9),r=t.getUint16(10,!0),n=t.getUint32(12,!0),a=t.getInt16(16,!0),s=t.getUint8(18),o=null;return s&&(o=i.subarray(19,21+e)),{outputChannelCount:e,preSkip:r,inputSampleRate:n,outputGain:a,channelMappingFamily:s,channelMappingTable:o}},Hf=[480,960,1920,2880,480,960,1920,2880,480,960,1920,2880,480,960,480,960,120,240,480,960,120,240,480,960,120,240,480,960,120,240,480,960],Kl=i=>{let t=i[0]>>3,e=i[0]&3,r;return e===0?r=1:e===1||e===2?r=2:r=i[1]&63,{durationInSamples:Hf[t]*r}},os=i=>{if(i.length<7)throw new Error("Setup header is too short.");if(i[0]!==5)throw new Error("Wrong packet type in Setup header.");if(String.fromCharCode(...i.slice(1,7))!=="vorbis")throw new Error("Invalid packet signature in Setup header.");let e=i.length,r=new Uint8Array(e);for(let m=0;m<e;m++)r[m]=i[e-1-m];let n=new q(r),a=0;for(;n.getBitsLeft()>97;)if(n.readBits(1)===1){a=n.pos;break}if(a===0)throw new Error("Invalid Setup header: framing bit not found.");let s=0,o=!1,c=0;for(;n.getBitsLeft()>=97;){let m=n.pos,d=n.readBits(8),f=n.readBits(16),p=n.readBits(16);if(d>63||f!==0||p!==0){n.pos=m;break}if(n.skipBits(1),s++,s>64)break;n.clone().readBits(6)+1===s&&(o=!0,c=s)}if(!o)throw new Error("Invalid Setup header: mode header not found.");if(c>63)throw new Error(`Unsupported mode count: ${c}.`);let u=c;n.pos=0,n.skipBits(a);let l=Array(u).fill(0);for(let m=u-1;m>=0;m--)n.skipBits(40),l[m]=n.readBits(1);return{modeBlockflags:l}},Ur=(i,t,e)=>{switch(i){case"avc":{for(let r of Oc(e,t)){let n=e[r.offset],a=Gt(n);if(a>=1&&a<=4)return"delta";if(a===5)return"key";if(a===6&&!Mn()){let s=e.subarray(r.offset,r.offset+r.length),o=ts(s),c=1;do{let u=0;for(;;){let d=o[c++];if(d===void 0||(u+=d,d<255))break}let l=0;for(;;){let d=o[c++];if(d===void 0||(l+=d,d<255))break}if(u===6){let d=new q(o);d.pos=8*c;let f=O(d),p=d.readBits(1);if(f===0&&p===1)return"key"}c+=l}while(c<o.length-1)}}return"delta"}case"hevc":{for(let r of On(e,t)){let n=Ct(e[r.offset]);if(n<16)return"delta";if(n<=23)return"key"}return"delta"}case"vp8":return(e[0]&1)===0?"key":"delta";case"vp9":{let r=new q(e);if(r.readBits(2)!==2)return null;let n=r.readBits(1);return(r.readBits(1)<<1)+n===3&&r.skipBits(1),r.readBits(1)?null:r.readBits(1)===0?"key":"delta"}case"av1":{let r=!1;for(let{type:n,data:a}of Hl(e))if(n===1){let s=new q(a);s.skipBits(4),r=!!s.readBits(1)}else if(n===3||n===6||n===7){if(r)return"key";let s=new q(a);return s.readBits(1)?null:s.readBits(2)===0?"key":"delta"}return null}case"prores":return"key";default:ie(i),g(!1)}};var Nn=(i,t)=>{let e=L(i),r=0,n=e.getUint32(r,!0);r+=4;let a=we.decode(i.subarray(r,r+n));r+=n,n>0&&(t.raw??={},t.raw.vendor??=a);let s=e.getUint32(r,!0);r+=4;for(let o=0;o<s;o++){let c=e.getUint32(r,!0);r+=4;let u=we.decode(i.subarray(r,r+c));r+=c;let l=u.indexOf("=");if(l===-1)continue;let m=u.slice(0,l).toUpperCase(),d=u.slice(l+1);switch(t.raw??={},Array.isArray(t.raw[m])?t.raw[m]=[...t.raw[m],d]:typeof t.raw[m]=="string"?t.raw[m]=[t.raw[m],d]:t.raw[m]??=d,m){case"TITLE":t.title??=d;break;case"DESCRIPTION":t.description??=d;break;case"ARTIST":t.artist??=d;break;case"ALBUM":t.album??=d;break;case"ALBUMARTIST":t.albumArtist??=d;break;case"COMMENT":t.comment??=d;break;case"LYRICS":t.lyrics??=d;break;case"TRACKNUMBER":{let f=d.split("/"),p=Number.parseInt(f[0],10),b=f[1]&&Number.parseInt(f[1],10);Number.isInteger(p)&&p>0&&(t.trackNumber??=p),b&&Number.isInteger(b)&&b>0&&(t.tracksTotal??=b)}break;case"TRACKTOTAL":{let f=Number.parseInt(d,10);Number.isInteger(f)&&f>0&&(t.tracksTotal??=f)}break;case"DISCNUMBER":{let f=d.split("/"),p=Number.parseInt(f[0],10),b=f[1]&&Number.parseInt(f[1],10);Number.isInteger(p)&&p>0&&(t.discNumber??=p),b&&Number.isInteger(b)&&b>0&&(t.discsTotal??=b)}break;case"DISCTOTAL":{let f=Number.parseInt(d,10);Number.isInteger(f)&&f>0&&(t.discsTotal??=f)}break;case"DATE":{let f=new Date(d);Number.isNaN(f.getTime())||(t.date??=f)}break;case"GENRE":t.genre??=d;break;case"METADATA_BLOCK_PICTURE":{let f=pi(d),p=L(f),b=p.getUint32(0,!1),h=p.getUint32(4,!1),y=String.fromCharCode(...f.subarray(8,8+h)),k=p.getUint32(8+h,!1),T=we.decode(f.subarray(12+h,12+h+k)),w=p.getUint32(h+k+28),x=f.subarray(h+k+32,h+k+32+w);t.images??=[],t.images.push({data:x,mimeType:y,kind:b===3?"coverFront":b===4?"coverBack":"unknown",name:void 0,description:T||void 0})}break}}},Ln=(i,t,e)=>{let r=[i],a=J.encode("Mediabunny"),s=new Uint8Array(4+a.length),o=new DataView(s.buffer);o.setUint32(0,a.length,!0),s.set(a,4),r.push(s);let c=[],u=(p,b)=>{let h=`${p}=${b}`,y=J.encode(h);s=new Uint8Array(4+y.length),o=new DataView(s.buffer),o.setUint32(0,y.length,!0),s.set(y,4),r.push(s),c.push(p)};for(let{key:p,value:b}of xt(t))switch(p){case"title":u("TITLE",b);break;case"description":u("DESCRIPTION",b);break;case"artist":u("ARTIST",b);break;case"album":u("ALBUM",b);break;case"albumArtist":u("ALBUMARTIST",b);break;case"genre":u("GENRE",b);break;case"date":u("DATE",b.toISOString().slice(0,10));break;case"comment":u("COMMENT",b);break;case"lyrics":u("LYRICS",b);break;case"trackNumber":u("TRACKNUMBER",b.toString());break;case"tracksTotal":u("TRACKTOTAL",b.toString());break;case"discNumber":u("DISCNUMBER",b.toString());break;case"discsTotal":u("DISCTOTAL",b.toString());break;case"images":{if(!e)break;for(let h of b){let y=h.kind==="coverFront"?3:h.kind==="coverBack"?4:0,k=new Uint8Array(h.mimeType.length);for(let P=0;P<h.mimeType.length;P++)k[P]=h.mimeType.charCodeAt(P);let T=J.encode(h.description??""),w=new Uint8Array(8+k.length+4+T.length+16+4+h.data.length),x=L(w);x.setUint32(0,y,!1),x.setUint32(4,k.length,!1),w.set(k,8),x.setUint32(8+k.length,T.length,!1),w.set(T,12+k.length),x.setUint32(28+k.length+T.length,h.data.length,!1),w.set(h.data,32+k.length+T.length);let C=Pl(w);u("METADATA_BLOCK_PICTURE",C)}}break;case"raw":break;default:ie(p)}if(t.raw)for(let p in t.raw){let b=t.raw[p]??t.raw[p.toLowerCase()];if(!(p==="vendor"||b==null||c.includes(p))){if(typeof b=="string")u(p,b);else if(Array.isArray(b)&&b.every(y=>typeof y=="string"))for(let y of b)u(p,y)}}let l=new Uint8Array(4);L(l).setUint32(0,c.length,!0),r.splice(2,0,l);let m=r.reduce((p,b)=>p+b.length,0),d=new Uint8Array(m),f=0;for(let p of r)d.set(p,f),f+=p.length;return d},Wn=[2,1,2,3,3,4,4,5],cs=i=>{if(i.length<7||i[0]!==11||i[1]!==119)return null;let t=new q(i);t.skipBits(16),t.skipBits(16);let e=t.readBits(2);if(e===3)return null;let r=t.readBits(6),n=t.readBits(5);if(n>8)return null;let a=t.readBits(3),s=t.readBits(3);(s&1)!==0&&s!==1&&t.skipBits(2),(s&4)!==0&&t.skipBits(2),s===2&&t.skipBits(2);let o=t.readBits(1),c=Math.floor(r/2);return{fscod:e,bsid:n,bsmod:a,acmod:s,lfeon:o,bitRateCode:c}},Ql=[64*2,69*2,96*2,64*2,70*2,96*2,80*2,87*2,120*2,80*2,88*2,120*2,96*2,104*2,144*2,96*2,105*2,144*2,112*2,121*2,168*2,112*2,122*2,168*2,128*2,139*2,192*2,128*2,140*2,192*2,160*2,174*2,240*2,160*2,175*2,240*2,192*2,208*2,288*2,192*2,209*2,288*2,224*2,243*2,336*2,224*2,244*2,336*2,256*2,278*2,384*2,256*2,279*2,384*2,320*2,348*2,480*2,320*2,349*2,480*2,384*2,417*2,576*2,384*2,418*2,576*2,448*2,487*2,672*2,448*2,488*2,672*2,512*2,557*2,768*2,512*2,558*2,768*2,640*2,696*2,960*2,640*2,697*2,960*2,768*2,835*2,1152*2,768*2,836*2,1152*2,896*2,975*2,1344*2,896*2,976*2,1344*2,1024*2,1114*2,1536*2,1024*2,1115*2,1536*2,1152*2,1253*2,1728*2,1152*2,1254*2,1728*2,1280*2,1393*2,1920*2,1280*2,1394*2,1920*2],Gl=1536,Hn=new Uint8Array([5,4,65,67,45,51]),qn=new Uint8Array([5,4,69,65,67,51]),Vc=[1,2,3,6],us=i=>{if(i.length<6||i[0]!==11||i[1]!==119)return null;let t=new q(i);t.skipBits(16);let e=t.readBits(2);if(t.skipBits(3),e!==0&&e!==2)return null;let r=t.readBits(11),n=t.readBits(2),a=0,s;n===3?(a=t.readBits(2),s=3):s=t.readBits(2);let o=t.readBits(3),c=t.readBits(1),u=t.readBits(5);if(u<11||u>16)return null;let l=Vc[s],m;return n<3?m=bi[n]/1e3:m=Mc[a]/1e3,{dataRate:Math.round((r+1)*m/(l*16)),substreams:[{fscod:n,fscod2:a,bsid:u,bsmod:0,acmod:o,lfeon:c,numDepSub:0,chanLoc:0}]}},jl=i=>{if(i.length<2)return null;let t=new q(i),e=t.readBits(13),r=t.readBits(3),n=[];for(let a=0;a<=r&&!(Math.ceil(t.pos/8)+3>i.length);a++){let s=t.readBits(2),o=t.readBits(5);t.skipBits(1),t.skipBits(1);let c=t.readBits(3),u=t.readBits(3),l=t.readBits(1);t.skipBits(3);let m=t.readBits(4),d=0;m>0?d=t.readBits(9):t.skipBits(1),n.push({fscod:s,fscod2:null,bsid:o,bsmod:c,acmod:u,lfeon:l,numDepSub:m,chanLoc:d})}return n.length===0?null:{dataRate:e,substreams:n}},ls=i=>{let t=i.substreams[0];return g(t),t.fscod<3?bi[t.fscod]:t.fscod2!==null&&t.fscod2<3?Mc[t.fscod2]:null},ds=i=>{let t=i.substreams[0];g(t);let e=Wn[t.acmod]+t.lfeon;if(t.numDepSub>0){let r=[2,2,1,1,2,2,2,1,1];for(let n=0;n<9;n++)t.chanLoc&1<<8-n&&(e+=r[n])}return e};var qf=1683496997,Kn=18,ms=10,Xl=4096,Vl=32,fs=20,Kf=8,Qf=[0,8e3,16e3,32e3,0,0,11025,22050,44100,0,0,12e3,24e3,48e3,96e3,192e3],Gf=[32e3,56e3,64e3,96e3,112e3,128e3,192e3,224e3,256e3,32e4,384e3,448e3,512e3,576e3,64e4,768e3,96e4,1024e3,1152e3,128e4,1344e3,1408e3,1411200,1472e3,1536e3,192e4,2048e3,3072e3,384e4,0,0,0],jf=[16,16,20,20,0,24,24,0],Ja=[1,2,2,2,2,3,3,4,4,5,6,6,6,7,8,8],Xf=[1,2,2,2,2,3,18,19,6,7,518,323,83,519,582,535],$f=8,Yf=44646,Zf=[32e3,44100,48e3,0],Jf=[8e3,16e3,32e3,64e3,128e3,22050,44100,88200,176400,352800,12e3,24e3,48e3,96e3,192e3,384e3],$l=[512,1024,2048,4096],Qn=i=>{let t=Uc(i),e=L(i),r=t?Math.ceil(t.frameSize/4)*4:0,n=null;for(;r+4<=i.length&&e.getUint32(r)===qf;){let s=Gn(i.subarray(r));if(!s)break;n??=s,r+=s.frameSize}if(t)return{frameSize:n?r:t.frameSize,sampleRate:t.sampleRate,numberOfChannels:t.numberOfChannels,sampleCount:t.sampleCount,channelLayout:t.channelLayout,pcmResolution:t.pcmResolution,bitRate:t.bitRate,core:t,hasExtensions:n!==null};if(!n?.asset)return null;let{asset:a}=n;return{frameSize:r,sampleRate:a.sampleRate,numberOfChannels:a.numberOfChannels,sampleCount:a.sampleCount,channelLayout:a.channelLayout,pcmResolution:a.pcmResolution,bitRate:0,core:null,hasExtensions:!0}},ps=i=>{let t=Qn(i);return t?.core?t.hasExtensions?"dtsh":"dtsc":null},Uc=i=>{if(i.length<Kn||i[0]!==127||i[1]!==254||i[2]!==128||i[3]!==1)return null;let t=new q(i);if(t.skipBits(32),t.skipBits(1),t.readBits(5)!==Vl-1)return null;let e=t.readBits(1),r=t.readBits(7)+1;if(r%Kf!==0)return null;let n=t.readBits(14)+1;if(n<96)return null;let a=t.readBits(6);if(a>=Ja.length)return null;let s=Qf[t.readBits(4)];if(s===0)return null;let o=Gf[t.readBits(5)];if(t.readBits(1)!==0)return null;t.skipBits(4),t.skipBits(5);let c=t.readBits(2);if(c===3)return null;t.skipBits(1),e&&t.skipBits(16),t.skipBits(7);let u=jf[t.readBits(3)];if(u===0)return null;let l=c!==0;return{frameSize:n,sampleRate:s,numberOfChannels:Ja[a]+(l?1:0),sampleCount:r*Vl,channelLayout:Xf[a]|(l?$f:0),amode:a,lfePresent:l,bitRate:o,pcmResolution:u}},Gn=i=>{if(i.length<ms||i[0]!==100||i[1]!==88||i[2]!==32||i[3]!==37)return null;let t=new q(i);t.skipBits(32),t.skipBits(8);let e=t.readBits(2),r=t.readBits(1),n=8+4*r,a=16+4*r;t.skipBits(n);let s=t.readBits(a)+1,o={frameSize:s,asset:null};if(!t.readBits(1))return o;let c=Zf[t.readBits(2)],u=512*(t.readBits(3)+1);t.readBits(1)&&t.skipBits(36);let l=t.readBits(3)+1,m=t.readBits(3)+1,d=[];for(let y=0;y<l;y++)d.push(t.readBits(e+1));for(let y of d)t.skipBits(8*Qa(y));if(t.readBits(1)){t.skipBits(2);let y=t.readBits(2)+1<<2,k=t.readBits(2)+1;t.skipBits(k*y)}for(let y=0;y<m;y++)t.skipBits(a);t.skipBits(9),t.skipBits(3),t.readBits(1)&&t.skipBits(4),t.readBits(1)&&t.skipBits(24),t.readBits(1)&&t.skipBits(8*(t.readBits(10)+1));let f=t.readBits(5)+1,p=Jf[t.readBits(4)],b=t.readBits(8)+1,h=0;if(t.readBits(1)&&(b>2&&t.skipBits(1),b>6&&t.skipBits(1),t.readBits(1))){let y=t.readBits(2)+1<<2;h=t.readBits(y)}return c===0||t.getBitsLeft()<0?o:{frameSize:s,asset:{sampleRate:p,numberOfChannels:b,sampleCount:Math.round(u*p/c),channelLayout:h,pcmResolution:f}}},Yl=i=>{if(i.length<fs)return null;let t=L(i),e=t.getUint32(0);if(e===0)return null;let r=new q(i);r.seekToByte(13);let n=r.readBits(2);r.skipBits(5);let a=r.readBits(1),s=r.readBits(6);r.skipBits(14),r.skipBits(1),r.skipBits(3);let o=r.readBits(16),c=null;return o!==0?c=ep(o):s<Ja.length&&(c=Ja[s]+a),{sampleRate:e,maxBitrate:t.getUint32(4),avgBitrate:t.getUint32(8),pcmSampleDepth:i[12],sampleCount:$l[n],channelLayout:o,numberOfChannels:c}},Zl=i=>{let t=new Uint8Array(fs),e=L(t);e.setUint32(0,i.sampleRate),e.setUint32(4,i.bitRate),e.setUint32(8,i.bitRate),t[12]=i.pcmResolution;let r=i.core&&!i.hasExtensions?1:0,n=new q(t);return n.seekToByte(13),n.writeBits(2,Math.max($l.indexOf(i.sampleCount),0)),n.writeBits(5,r),n.writeBits(1,i.core?.lfePresent?1:0),n.writeBits(6,i.core?.amode??0),n.writeBits(14,i.core?i.core.frameSize-1:0),n.writeBits(1,0),n.writeBits(3,0),n.writeBits(16,i.channelLayout),n.writeBits(1,0),n.writeBits(1,0),n.writeBits(1,0),n.writeBits(5,0),t},ep=i=>Qa(i)+Qa(i&Yf);var ce=["avc","hevc","vp9","av1","vp8","prores"],se=["pcm-s16","pcm-s16be","pcm-s24","pcm-s24be","pcm-s32","pcm-s32be","pcm-f32","pcm-f32be","pcm-f64","pcm-f64be","pcm-u8","pcm-s8","ulaw","alaw"],ft=["aac","opus","mp3","vorbis","flac","ac3","eac3","dts"],fe=[...ft,...se],He=["webvtt"],Dn=[{maxMacroblocks:99,maxBitrate:64e3,maxDpbMbs:396,level:10},{maxMacroblocks:396,maxBitrate:192e3,maxDpbMbs:900,level:11},{maxMacroblocks:396,maxBitrate:384e3,maxDpbMbs:2376,level:12},{maxMacroblocks:396,maxBitrate:768e3,maxDpbMbs:2376,level:13},{maxMacroblocks:396,maxBitrate:2e6,maxDpbMbs:2376,level:20},{maxMacroblocks:792,maxBitrate:4e6,maxDpbMbs:4752,level:21},{maxMacroblocks:1620,maxBitrate:4e6,maxDpbMbs:8100,level:22},{maxMacroblocks:1620,maxBitrate:1e7,maxDpbMbs:8100,level:30},{maxMacroblocks:3600,maxBitrate:14e6,maxDpbMbs:18e3,level:31},{maxMacroblocks:5120,maxBitrate:2e7,maxDpbMbs:20480,level:32},{maxMacroblocks:8192,maxBitrate:2e7,maxDpbMbs:32768,level:40},{maxMacroblocks:8192,maxBitrate:5e7,maxDpbMbs:32768,level:41},{maxMacroblocks:8704,maxBitrate:5e7,maxDpbMbs:34816,level:42},{maxMacroblocks:22080,maxBitrate:135e6,maxDpbMbs:110400,level:50},{maxMacroblocks:36864,maxBitrate:24e7,maxDpbMbs:184320,level:51},{maxMacroblocks:36864,maxBitrate:24e7,maxDpbMbs:184320,level:52},{maxMacroblocks:139264,maxBitrate:24e7,maxDpbMbs:696320,level:60},{maxMacroblocks:139264,maxBitrate:48e7,maxDpbMbs:696320,level:61},{maxMacroblocks:139264,maxBitrate:8e8,maxDpbMbs:696320,level:62}],Jl=[{maxPictureSize:36864,maxBitrate:128e3,tier:"L",level:30},{maxPictureSize:122880,maxBitrate:15e5,tier:"L",level:60},{maxPictureSize:245760,maxBitrate:3e6,tier:"L",level:63},{maxPictureSize:552960,maxBitrate:6e6,tier:"L",level:90},{maxPictureSize:983040,maxBitrate:1e7,tier:"L",level:93},{maxPictureSize:2228224,maxBitrate:12e6,tier:"L",level:120},{maxPictureSize:2228224,maxBitrate:3e7,tier:"H",level:120},{maxPictureSize:2228224,maxBitrate:2e7,tier:"L",level:123},{maxPictureSize:2228224,maxBitrate:5e7,tier:"H",level:123},{maxPictureSize:8912896,maxBitrate:25e6,tier:"L",level:150},{maxPictureSize:8912896,maxBitrate:1e8,tier:"H",level:150},{maxPictureSize:8912896,maxBitrate:4e7,tier:"L",level:153},{maxPictureSize:8912896,maxBitrate:16e7,tier:"H",level:153},{maxPictureSize:8912896,maxBitrate:6e7,tier:"L",level:156},{maxPictureSize:8912896,maxBitrate:24e7,tier:"H",level:156},{maxPictureSize:35651584,maxBitrate:6e7,tier:"L",level:180},{maxPictureSize:35651584,maxBitrate:24e7,tier:"H",level:180},{maxPictureSize:35651584,maxBitrate:12e7,tier:"L",level:183},{maxPictureSize:35651584,maxBitrate:48e7,tier:"H",level:183},{maxPictureSize:35651584,maxBitrate:24e7,tier:"L",level:186},{maxPictureSize:35651584,maxBitrate:8e8,tier:"H",level:186}],pr=[{maxPictureSize:36864,maxBitrate:2e5,level:10},{maxPictureSize:73728,maxBitrate:8e5,level:11},{maxPictureSize:122880,maxBitrate:18e5,level:20},{maxPictureSize:245760,maxBitrate:36e5,level:21},{maxPictureSize:552960,maxBitrate:72e5,level:30},{maxPictureSize:983040,maxBitrate:12e6,level:31},{maxPictureSize:2228224,maxBitrate:18e6,level:40},{maxPictureSize:2228224,maxBitrate:3e7,level:41},{maxPictureSize:8912896,maxBitrate:6e7,level:50},{maxPictureSize:8912896,maxBitrate:12e7,level:51},{maxPictureSize:8912896,maxBitrate:18e7,level:52},{maxPictureSize:35651584,maxBitrate:18e7,level:60},{maxPictureSize:35651584,maxBitrate:24e7,level:61},{maxPictureSize:35651584,maxBitrate:48e7,level:62}],ed=[{maxPictureSize:147456,maxBitrate:15e5,tier:"M",level:0},{maxPictureSize:278784,maxBitrate:3e6,tier:"M",level:1},{maxPictureSize:665856,maxBitrate:6e6,tier:"M",level:4},{maxPictureSize:1065024,maxBitrate:1e7,tier:"M",level:5},{maxPictureSize:2359296,maxBitrate:12e6,tier:"M",level:8},{maxPictureSize:2359296,maxBitrate:3e7,tier:"H",level:8},{maxPictureSize:2359296,maxBitrate:2e7,tier:"M",level:9},{maxPictureSize:2359296,maxBitrate:5e7,tier:"H",level:9},{maxPictureSize:8912896,maxBitrate:3e7,tier:"M",level:12},{maxPictureSize:8912896,maxBitrate:1e8,tier:"H",level:12},{maxPictureSize:8912896,maxBitrate:4e7,tier:"M",level:13},{maxPictureSize:8912896,maxBitrate:16e7,tier:"H",level:13},{maxPictureSize:8912896,maxBitrate:6e7,tier:"M",level:14},{maxPictureSize:8912896,maxBitrate:24e7,tier:"H",level:14},{maxPictureSize:35651584,maxBitrate:6e7,tier:"M",level:15},{maxPictureSize:35651584,maxBitrate:24e7,tier:"H",level:15},{maxPictureSize:35651584,maxBitrate:6e7,tier:"M",level:16},{maxPictureSize:35651584,maxBitrate:24e7,tier:"H",level:16},{maxPictureSize:35651584,maxBitrate:1e8,tier:"M",level:17},{maxPictureSize:35651584,maxBitrate:48e7,tier:"H",level:17},{maxPictureSize:35651584,maxBitrate:16e7,tier:"M",level:18},{maxPictureSize:35651584,maxBitrate:8e8,tier:"H",level:18},{maxPictureSize:35651584,maxBitrate:16e7,tier:"M",level:19},{maxPictureSize:35651584,maxBitrate:8e8,tier:"H",level:19}],td=".01.01.01.01.00",rd=".0.110.01.01.01.0",hr=["ap4x","ap4h","apch","apcn","apcs","apco"],jn=["dtsc","dtsh","dtsl","dtse"],tp=[{fourCc:"apco",bitrate:45e6,alpha:!1},{fourCc:"apcs",bitrate:102e6,alpha:!1},{fourCc:"apcn",bitrate:147e6,alpha:!1},{fourCc:"apch",bitrate:22e7,alpha:!1},{fourCc:"ap4h",bitrate:33e7,alpha:!0},{fourCc:"ap4x",bitrate:5e8,alpha:!0}],hs=(i,t,e,r,n)=>{if(i==="avc"){let s=Math.ceil(t/16)*Math.ceil(e/16),o=Dn.find(d=>s<=d.maxMacroblocks&&r<=d.maxBitrate)??ee(Dn),c=o?o.level:0,u="64".padStart(2,"0"),l="00",m=c.toString(16).padStart(2,"0");return`avc1.${u}${l}${m}`}else if(i==="hevc"){let a="",o="6",c=t*e,u=Jl.find(m=>c<=m.maxPictureSize&&r<=m.maxBitrate)??ee(Jl);return`hev1.${a}1.${o}.${u.tier}${u.level}.B0`}else{if(i==="vp8")return"vp8";if(i==="vp9"){let a="00",s=t*e,o=pr.find(u=>s<=u.maxPictureSize&&r<=u.maxBitrate)??ee(pr);return`vp09.${a}.${o.level.toString().padStart(2,"0")}.08`}else if(i==="av1"){let s=t*e,o=ed.find(l=>s<=l.maxPictureSize&&r<=l.maxBitrate)??ee(ed);return`av01.0.${o.level.toString().padStart(2,"0")}${o.tier}.08`}else if(i==="prores"){let s=Math.pow(t*e/2073600,.95),o=tp.filter(l=>l.alpha===n),c=o[0].fourCc,u=1/0;for(let{fourCc:l,bitrate:m}of o){let d=Math.abs(m*s-r);d<u&&(u=d,c=l)}return c}else ie(i)}throw new TypeError(`Unhandled codec '${String(i)}'.`)},id=i=>{let t=i.split("."),e=Number(t[1]),r=Number(t[2]),n=Number(t[3]),a=t[4]?Number(t[4]):1;return[1,1,e,2,1,r,3,1,n,4,1,a]},gs=i=>{let t=i.split("."),n=(1<<7)+1,a=Number(t[1]),s=t[2],o=Number(s.slice(0,-1)),c=(a<<5)+o,u=s.slice(-1)==="H"?1:0,l=Number(t[3]),m=l===8?0:1,d=l===12?1:0,f=t[4]?Number(t[4]):0,p=t[5]?Number(t[5][0]):1,b=t[5]?Number(t[5][1]):1,h=t[5]?Number(t[5][2]):0,y=(u<<7)+(m<<6)+(d<<5)+(f<<4)+(p<<3)+(b<<2)+h;return[n,c,y,0]},Ki=i=>{let{codec:t,codecDescription:e,colorSpace:r,avcCodecInfo:n,hevcCodecInfo:a,vp9CodecInfo:s,av1CodecInfo:o,proresFormat:c}=i;if(t==="avc"){if(g(i.avcType!==null),n){let u=new Uint8Array([n.avcProfileIndication,n.profileCompatibility,n.avcLevelIndication]);return`avc${i.avcType}.${_r(u)}`}if(!e||e.byteLength<4)throw new TypeError("AVC decoder description is not provided or is not at least 4 bytes long.");return`avc${i.avcType}.${_r(e.subarray(1,4))}`}else if(t==="hevc"){let u,l,m,d,f,p;if(a)u=a.generalProfileSpace,l=a.generalProfileIdc,m=wc(a.generalProfileCompatibilityFlags),d=a.generalTierFlag,f=a.generalLevelIdc,p=[...a.generalConstraintIndicatorFlags];else{if(!e||e.byteLength<23)throw new TypeError("HEVC decoder description is not provided or is not at least 23 bytes long.");let h=L(e),y=h.getUint8(1);u=y>>6&3,l=y&31,m=wc(h.getUint32(2)),d=y>>5&1,f=h.getUint8(12),p=[];for(let k=0;k<6;k++)p.push(h.getUint8(6+k))}let b="hev1.";for(b+=["","A","B","C"][u]+l,b+=".",b+=m.toString(16).toUpperCase(),b+=".",b+=d===0?"L":"H",b+=f;p.length>0&&p[p.length-1]===0;)p.pop();return p.length>0&&(b+=".",b+=p.map(h=>h.toString(16).toUpperCase()).join(".")),b}else{if(t==="vp8")return"vp8";if(t==="vp9"){if(!s){let k=i.width*i.height,T=ee(pr).level;for(let w of pr)if(k<=w.maxPictureSize){T=w.level;break}return`vp09.00.${T.toString().padStart(2,"0")}.08`}let u=s.profile.toString().padStart(2,"0"),l=s.level.toString().padStart(2,"0"),m=s.bitDepth.toString().padStart(2,"0"),d=s.chromaSubsampling.toString().padStart(2,"0"),f=s.colourPrimaries.toString().padStart(2,"0"),p=s.transferCharacteristics.toString().padStart(2,"0"),b=s.matrixCoefficients.toString().padStart(2,"0"),h=s.videoFullRangeFlag.toString().padStart(2,"0"),y=`vp09.${u}.${l}.${m}.${d}`;return y+=`.${f}.${p}.${b}.${h}`,y.endsWith(td)&&(y=y.slice(0,-td.length)),y}else if(t==="av1"){if(!o){let w=i.width*i.height,x=ee(pr).level;for(let C of pr)if(w<=C.maxPictureSize){x=C.level;break}return`av01.0.${x.toString().padStart(2,"0")}M.08`}let u=o.profile,l=o.level.toString().padStart(2,"0"),m=o.tier?"H":"M",d=o.bitDepth.toString().padStart(2,"0"),f=o.monochrome?"1":"0",p=100*o.chromaSubsamplingX+10*o.chromaSubsamplingY+1*(o.chromaSubsamplingX&&o.chromaSubsamplingY?o.chromaSamplePosition:0),b=r?.primaries?wt[r.primaries]:1,h=r?.transfer?St[r.transfer]:1,y=r?.matrix?At[r.matrix]:1,k=r?.fullRange?1:0,T=`av01.${u}.${l}${m}.${d}`;return T+=`.${f}.${p.toString().padStart(3,"0")}`,T+=`.${b.toString().padStart(2,"0")}`,T+=`.${h.toString().padStart(2,"0")}`,T+=`.${y.toString().padStart(2,"0")}`,T+=`.${k}`,T.endsWith(rd)&&(T=T.slice(0,-rd.length)),T}else{if(t==="prores")return c??"apch";t!==null&&ie(t)}}throw new TypeError(`Unhandled codec '${t}'.`)},bs=i=>{switch(i.codec){case"avc":{let t=i.avcCodecInfo?.sequenceParameterSets[0];if(!t&&i.codecDescription&&(t=qi(i.codecDescription)?.sequenceParameterSets[0]),t){let e=Or(t);if(e)return{primaries:ot[e.colourPrimaries],transfer:ct[e.transferCharacteristics],matrix:ut[e.matrixCoefficients],fullRange:!!e.fullRangeFlag}}}break;case"hevc":{let t=i.hevcCodecInfo?.arrays.find(e=>e.nalUnitType===33)?.nalUnits[0];if(!t&&i.codecDescription&&(t=ns(i.codecDescription)?.arrays.find(e=>e.nalUnitType===33)?.nalUnits[0]),t){let e=Un(t);if(e)return{primaries:ot[e.colourPrimaries],transfer:ct[e.transferCharacteristics],matrix:ut[e.matrixCoefficients],fullRange:!!e.fullRangeFlag}}}break;case"vp8":break;case"vp9":if(i.vp9CodecInfo)return{primaries:ot[i.vp9CodecInfo.colourPrimaries],transfer:ct[i.vp9CodecInfo.transferCharacteristics],matrix:ut[i.vp9CodecInfo.matrixCoefficients],fullRange:!!i.vp9CodecInfo.videoFullRangeFlag};break;case"av1":if(i.av1CodecInfo)return{primaries:ot[i.av1CodecInfo.colourPrimaries],transfer:ct[i.av1CodecInfo.transferCharacteristics],matrix:ut[i.av1CodecInfo.matrixCoefficients],fullRange:!!i.av1CodecInfo.videoFullRangeFlag};break;case"prores":if(i.proresCodecInfo)return{primaries:ot[i.proresCodecInfo.colourPrimaries],transfer:ct[i.proresCodecInfo.transferCharacteristics],matrix:ut[i.proresCodecInfo.matrixCoefficients],fullRange:i.proresCodecInfo.fullRange};break}return{primaries:void 0,transfer:void 0,matrix:void 0,fullRange:void 0}},ys=(i,t,e)=>{if(i==="aac")return t>=2&&e<=24e3?"mp4a.40.29":e<=24e3?"mp4a.40.5":"mp4a.40.2";if(i==="mp3")return"mp3";if(i==="opus")return"opus";if(i==="vorbis")return"vorbis";if(i==="flac")return"flac";if(i==="ac3")return"ac-3";if(i==="eac3")return"ec-3";if(i==="dts")return"dtsc";if(se.includes(i))return i;throw new TypeError(`Unhandled codec '${i}'.`)},Qi=i=>{let{codec:t,codecDescription:e,aacCodecInfo:r,dtsFormat:n}=i;if(t==="aac"){if(!r)throw new TypeError("AAC codec info must be provided.");if(r.isMpeg2)return"mp4a.67";{let a;return r.objectType!==null?a=r.objectType:a=Qt(e).objectType,`mp4a.40.${a}`}}else{if(t==="mp3")return"mp3";if(t==="opus")return"opus";if(t==="vorbis")return"vorbis";if(t==="flac")return"flac";if(t==="ac3")return"ac-3";if(t==="eac3")return"ec-3";if(t==="dts")return n??"dtsc";if(t&&se.includes(t))return t}throw new TypeError(`Unhandled codec '${t}'.`)},nd=i=>{},ad=i=>{switch(i.codec){case"flac":{let t=pi("ZkxhQ4AAACIQABAAAAYtACWtCsRC8AANRBhVFucAcYu5ASE2m1Dxv8tw");return i.sampleRate>=1<<20||i.numberOfChannels>8?!1:(t[18]=i.sampleRate>>>12,t[19]=i.sampleRate>>>4,t[20]=(i.sampleRate&15)<<4|i.numberOfChannels-1<<1,t)}case"vorbis":{let t=pi("Ah7/AgF2b3JiaXMAAAAAAoC7AAAAAAAAgLUBAAAAAAC4AQN2b3JiaXMNAAAATGF2ZjU4Ljc2LjEwMAgAAAAMAAAAbGFuZ3VhZ2U9dW5kGQAAAGhhbmRsZXJfbmFtZT1Tb3VuZEhhbmRsZXIWAAAAdmVuZG9yX2lkPVswXVswXVswXVswXSAAAABlbmNvZGVyPUxhdmM1OC4xMzQuMTAwIGxpYnZvcmJpcxAAAABtYWpvcl9icmFuZD1pc29tEQAAAG1pbm9yX3ZlcnNpb249NTEyIgAAAGNvbXBhdGlibGVfYnJhbmRzPWlzb21pc28yYXZjMW1wNDEmAAAAREVTQ1JJUFRJT049TWFkZSB3aXRoIFJlbW90aW9uIDQuMC4yNzgBBXZvcmJpcyVCQ1YBAEAAACRzGCpGpXMWhBAaQlAZ4xxCzmvsGUJMEYIcMkxbyyVzkCGkoEKIWyiB0JBVAABAAACHQXgUhIpBCCGEJT1YkoMnPQghhIg5eBSEaUEIIYQQQgghhBBCCCGERTlokoMnQQgdhOMwOAyD5Tj4HIRFOVgQgydB6CCED0K4moOsOQghhCQ1SFCDBjnoHITCLCiKgsQwuBaEBDUojILkMMjUgwtCiJqDSTX4GoRnQXgWhGlBCCGEJEFIkIMGQcgYhEZBWJKDBjm4FITLQagahCo5CB+EIDRkFQCQAACgoiiKoigKEBqyCgDIAAAQQFEUx3EcyZEcybEcCwgNWQUAAAEACAAAoEiKpEiO5EiSJFmSJVmSJVmS5omqLMuyLMuyLMsyEBqyCgBIAABQUQxFcRQHCA1ZBQBkAAAIoDiKpViKpWiK54iOCISGrAIAgAAABAAAEDRDUzxHlETPVFXXtm3btm3btm3btm3btm1blmUZCA1ZBQBAAAAQ0mlmqQaIMAMZBkJDVgEACAAAgBGKMMSA0JBVAABAAACAGEoOogmtOd+c46BZDppKsTkdnEi1eZKbirk555xzzsnmnDHOOeecopxZDJoJrTnnnMSgWQqaCa0555wnsXnQmiqtOeeccc7pYJwRxjnnnCateZCajbU555wFrWmOmkuxOeecSLl5UptLtTnnnHPOOeecc84555zqxekcnBPOOeecqL25lpvQxTnnnE/G6d6cEM4555xzzjnnnHPOOeecIDRkFQAABABAEIaNYdwpCNLnaCBGEWIaMulB9+gwCRqDnELq0ehopJQ6CCWVcVJKJwgNWQUAAAIAQAghhRRSSCGFFFJIIYUUYoghhhhyyimnoIJKKqmooowyyyyzzDLLLLPMOuyssw47DDHEEEMrrcRSU2011lhr7jnnmoO0VlprrbVSSimllFIKQkNWAQAgAAAEQgYZZJBRSCGFFGKIKaeccgoqqIDQkFUAACAAgAAAAABP8hzRER3RER3RER3RER3R8RzPESVREiVREi3TMjXTU0VVdWXXlnVZt31b2IVd933d933d+HVhWJZlWZZlWZZlWZZlWZZlWZYgNGQVAAACAAAghBBCSCGFFFJIKcYYc8w56CSUEAgNWQUAAAIACAAAAHAUR3EcyZEcSbIkS9IkzdIsT/M0TxM9URRF0zRV0RVdUTdtUTZl0zVdUzZdVVZtV5ZtW7Z125dl2/d93/d93/d93/d93/d9XQdCQ1YBABIAADqSIymSIimS4ziOJElAaMgqAEAGAEAAAIriKI7jOJIkSZIlaZJneZaomZrpmZ4qqkBoyCoAABAAQAAAAAAAAIqmeIqpeIqoeI7oiJJomZaoqZoryqbsuq7ruq7ruq7ruq7ruq7ruq7ruq7ruq7ruq7ruq7ruq7ruq4LhIasAgAkAAB0JEdyJEdSJEVSJEdygNCQVQCADACAAAAcwzEkRXIsy9I0T/M0TxM90RM901NFV3SB0JBVAAAgAIAAAAAAAAAMybAUy9EcTRIl1VItVVMt1VJF1VNVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVN0zRNEwgNWQkAkAEAkBBTLS3GmgmLJGLSaqugYwxS7KWxSCpntbfKMYUYtV4ah5RREHupJGOKQcwtpNApJq3WVEKFFKSYYyoVUg5SIDRkhQAQmgHgcBxAsixAsiwAAAAAAAAAkDQN0DwPsDQPAAAAAAAAACRNAyxPAzTPAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABA0jRA8zxA8zwAAAAAAAAA0DwP8DwR8EQRAAAAAAAAACzPAzTRAzxRBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABA0jRA8zxA8zwAAAAAAAAAsDwP8EQR0DwRAAAAAAAAACzPAzxRBDzRAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAEOAAABBgIRQasiIAiBMAcEgSJAmSBM0DSJYFTYOmwTQBkmVB06BpME0AAAAAAAAAAAAAJE2DpkHTIIoASdOgadA0iCIAAAAAAAAAAAAAkqZB06BpEEWApGnQNGgaRBEAAAAAAAAAAAAAzzQhihBFmCbAM02IIkQRpgkAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAGHAAAAgwoQwUGrIiAIgTAHA4imUBAIDjOJYFAACO41gWAABYliWKAABgWZooAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAYcAAACDChDBQashIAiAIAcCiKZQHHsSzgOJYFJMmyAJYF0DyApgFEEQAIAAAocAAACLBBU2JxgEJDVgIAUQAABsWxLE0TRZKkaZoniiRJ0zxPFGma53meacLzPM80IYqiaJoQRVE0TZimaaoqME1VFQAAUOAAABBgg6bE4gCFhqwEAEICAByKYlma5nmeJ4qmqZokSdM8TxRF0TRNU1VJkqZ5niiKommapqqyLE3zPFEURdNUVVWFpnmeKIqiaaqq6sLzPE8URdE0VdV14XmeJ4qiaJqq6roQRVE0TdNUTVV1XSCKpmmaqqqqrgtETxRNU1Vd13WB54miaaqqq7ouEE3TVFVVdV1ZBpimaaqq68oyQFVV1XVdV5YBqqqqruu6sgxQVdd1XVmWZQCu67qyLMsCAAAOHAAAAoygk4wqi7DRhAsPQKEhKwKAKAAAwBimFFPKMCYhpBAaxiSEFEImJaXSUqogpFJSKRWEVEoqJaOUUmopVRBSKamUCkIqJZVSAADYgQMA2IGFUGjISgAgDwCAMEYpxhhzTiKkFGPOOScRUoox55yTSjHmnHPOSSkZc8w556SUzjnnnHNSSuacc845KaVzzjnnnJRSSuecc05KKSWEzkEnpZTSOeecEwAAVOAAABBgo8jmBCNBhYasBABSAQAMjmNZmuZ5omialiRpmud5niiapiZJmuZ5nieKqsnzPE8URdE0VZXneZ4oiqJpqirXFUXTNE1VVV2yLIqmaZqq6rowTdNUVdd1XZimaaqq67oubFtVVdV1ZRm2raqq6rqyDFzXdWXZloEsu67s2rIAAPAEBwCgAhtWRzgpGgssNGQlAJABAEAYg5BCCCFlEEIKIYSUUggJAAAYcAAACDChDBQashIASAUAAIyx1lprrbXWQGettdZaa62AzFprrbXWWmuttdZaa6211lJrrbXWWmuttdZaa6211lprrbXWWmuttdZaa6211lprrbXWWmuttdZaa6211lprrbXWWmstpZRSSimllFJKKaWUUkoppZRSSgUA+lU4APg/2LA6wknRWGChISsBgHAAAMAYpRhzDEIppVQIMeacdFRai7FCiDHnJKTUWmzFc85BKCGV1mIsnnMOQikpxVZjUSmEUlJKLbZYi0qho5JSSq3VWIwxqaTWWoutxmKMSSm01FqLMRYjbE2ptdhqq7EYY2sqLbQYY4zFCF9kbC2m2moNxggjWywt1VprMMYY3VuLpbaaizE++NpSLDHWXAAAd4MDAESCjTOsJJ0VjgYXGrISAAgJACAQUooxxhhzzjnnpFKMOeaccw5CCKFUijHGnHMOQgghlIwx5pxzEEIIIYRSSsaccxBCCCGEkFLqnHMQQgghhBBKKZ1zDkIIIYQQQimlgxBCCCGEEEoopaQUQgghhBBCCKmklEIIIYRSQighlZRSCCGEEEIpJaSUUgohhFJCCKGElFJKKYUQQgillJJSSimlEkoJJYQSUikppRRKCCGUUkpKKaVUSgmhhBJKKSWllFJKIYQQSikFAAAcOAAABBhBJxlVFmGjCRcegEJDVgIAZAAAkKKUUiktRYIipRikGEtGFXNQWoqocgxSzalSziDmJJaIMYSUk1Qy5hRCDELqHHVMKQYtlRhCxhik2HJLoXMOAAAAQQCAgJAAAAMEBTMAwOAA4XMQdAIERxsAgCBEZohEw0JweFAJEBFTAUBigkIuAFRYXKRdXECXAS7o4q4DIQQhCEEsDqCABByccMMTb3jCDU7QKSp1IAAAAAAADADwAACQXAAREdHMYWRobHB0eHyAhIiMkAgAAAAAABcAfAAAJCVAREQ0cxgZGhscHR4fICEiIyQBAIAAAgAAAAAggAAEBAQAAAAAAAIAAAAEBA=="),e=L(t);return e.setUint8(15,i.numberOfChannels),e.setUint32(16,i.sampleRate,!0),t}default:return}},Pt=48e3,sd=/^pcm-([usf])(\d+)(be)?$/,Re=i=>{if(g(se.includes(i)),i==="ulaw")return{dataType:"ulaw",sampleSize:1,littleEndian:!0,silentValue:255};if(i==="alaw")return{dataType:"alaw",sampleSize:1,littleEndian:!0,silentValue:213};let t=sd.exec(i);g(t);let e;t[1]==="u"?e="unsigned":t[1]==="s"?e="signed":e="float";let r=Number(t[2])/8,n=t[3]!=="be",a=i==="pcm-u8"?2**7:0;return{dataType:e,sampleSize:r,littleEndian:n,silentValue:a}},Xe=i=>i.startsWith("avc1")||i.startsWith("avc3")?"avc":i.startsWith("hev1")||i.startsWith("hvc1")?"hevc":i==="vp8"?"vp8":i.startsWith("vp09")?"vp9":i.startsWith("av01")?"av1":hr.includes(i)?"prores":i==="mp3"||i==="mp4a.69"||i==="mp4a.6B"||i==="mp4a.6b"||i==="mp4a.40.34"?"mp3":i.startsWith("mp4a.40.")||i==="mp4a.67"?"aac":i==="opus"?"opus":i==="vorbis"?"vorbis":i==="flac"?"flac":i==="ac-3"||i==="ac3"?"ac3":i==="ec-3"||i==="eac3"?"eac3":jn.includes(i)?"dts":i==="ulaw"?"ulaw":i==="alaw"?"alaw":sd.test(i)?i:i==="webvtt"?"webvtt":null,od=i=>i==="avc"?{avc:{format:"avc"}}:i==="hevc"?{hevc:{format:"hevc"}}:{},cd=i=>i==="aac"?{aac:{format:"aac"}}:i==="opus"?{opus:{format:"opus"}}:{},rp=["avc1","avc3","hev1","hvc1","vp8","vp09","av01",...hr],ip=/^(avc1|avc3)\.[0-9a-fA-F]{6}$/,np=/^(hev1|hvc1)\.(?:[ABC]?\d+)\.[0-9a-fA-F]{1,8}\.[LH]\d+(?:\.[0-9a-fA-F]{1,2}){0,6}$/,ap=/^vp09(?:\.\d{2}){3}(?:(?:\.\d{2}){5})?$/,sp=/^av01\.\d\.\d{2}[MH]\.\d{2}(?:\.\d\.\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d)?$/,jt=(i,t)=>{if(!i)throw new TypeError("Video chunk metadata must be provided.");if(typeof i!="object")throw new TypeError("Video chunk metadata must be an object.");if(!i.decoderConfig)throw new TypeError("Video chunk metadata must include a decoder configuration.");if(typeof i.decoderConfig!="object")throw new TypeError("Video chunk metadata decoder configuration must be an object.");if(typeof i.decoderConfig.codec!="string")throw new TypeError("Video chunk metadata decoder configuration must specify a codec string.");if(!rp.some(e=>i.decoderConfig.codec.startsWith(e)))throw new TypeError("Video chunk metadata decoder configuration codec string must be a valid video codec string as specified in the Mediabunny Codec Registry.");if(!Number.isInteger(i.decoderConfig.codedWidth)||i.decoderConfig.codedWidth<=0)throw new TypeError("Video chunk metadata decoder configuration must specify a valid codedWidth (positive integer).");if(!Number.isInteger(i.decoderConfig.codedHeight)||i.decoderConfig.codedHeight<=0)throw new TypeError("Video chunk metadata decoder configuration must specify a valid codedHeight (positive integer).");if(i.decoderConfig.displayAspectWidth!==void 0&&(!Number.isInteger(i.decoderConfig.displayAspectWidth)||i.decoderConfig.displayAspectWidth<=0))throw new TypeError("Video chunk metadata decoder configuration displayAspectWidth, when defined, must be a positive integer.");if(i.decoderConfig.displayAspectHeight!==void 0&&(!Number.isInteger(i.decoderConfig.displayAspectHeight)||i.decoderConfig.displayAspectHeight<=0))throw new TypeError("Video chunk metadata decoder configuration displayAspectHeight, when defined, must be a positive integer.");if(i.decoderConfig.displayAspectWidth!==void 0!=(i.decoderConfig.displayAspectHeight!==void 0))throw new TypeError("Video chunk metadata decoder configuration must specify both displayAspectWidth and displayAspectHeight, or neither.");if(i.decoderConfig.description!==void 0&&!cr(i.decoderConfig.description))throw new TypeError("Video chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");if(i.decoderConfig.colorSpace!==void 0){let{colorSpace:e}=i.decoderConfig;if(typeof e!="object")throw new TypeError("Video chunk metadata decoder configuration colorSpace, when provided, must be an object.");let r=Object.keys(wt);if(e.primaries!=null&&!r.includes(e.primaries))throw new TypeError(`Video chunk metadata decoder configuration colorSpace primaries, when defined, must be one of ${r.join(", ")}.`);let n=Object.keys(St);if(e.transfer!=null&&!n.includes(e.transfer))throw new TypeError(`Video chunk metadata decoder configuration colorSpace transfer, when defined, must be one of ${n.join(", ")}.`);let a=Object.keys(At);if(e.matrix!=null&&!a.includes(e.matrix))throw new TypeError(`Video chunk metadata decoder configuration colorSpace matrix, when defined, must be one of ${a.join(", ")}.`);if(e.fullRange!=null&&typeof e.fullRange!="boolean")throw new TypeError("Video chunk metadata decoder configuration colorSpace fullRange, when defined, must be a boolean.")}if(i.decoderConfig.codec.startsWith("avc1")||i.decoderConfig.codec.startsWith("avc3")){if(!ip.test(i.decoderConfig.codec))throw new TypeError("Video chunk metadata decoder configuration codec string for AVC must be a valid AVC codec string as specified in Section 3.4 of RFC 6381.")}else if(i.decoderConfig.codec.startsWith("hev1")||i.decoderConfig.codec.startsWith("hvc1")){if(!np.test(i.decoderConfig.codec))throw new TypeError("Video chunk metadata decoder configuration codec string for HEVC must be a valid HEVC codec string as specified in Section E.3 of ISO 14496-15.")}else if(i.decoderConfig.codec.startsWith("vp8")){if(i.decoderConfig.codec!=="vp8")throw new TypeError('Video chunk metadata decoder configuration codec string for VP8 must be "vp8".')}else if(i.decoderConfig.codec.startsWith("vp09")){if(!ap.test(i.decoderConfig.codec))throw new TypeError('Video chunk metadata decoder configuration codec string for VP9 must be a valid VP9 codec string as specified in Section "Codecs Parameter String" of https://www.webmproject.org/vp9/mp4/.')}else if(i.decoderConfig.codec.startsWith("av01")){if(!sp.test(i.decoderConfig.codec))throw new TypeError('Video chunk metadata decoder configuration codec string for AV1 must be a valid AV1 codec string as specified in Section "Codecs Parameter String" of https://aomediacodec.github.io/av1-isobmff/.')}else if(hr.some(e=>i.decoderConfig.codec.startsWith(e))&&!hr.some(e=>i.decoderConfig.codec===e))throw new TypeError(`Video chunk metadata decoder configuration codec string for ProRes must be one of the valid ProRes four-character codes: ${hr.join(", ")}.`);if(t!==null&&Xe(i.decoderConfig.codec)!==t)throw new TypeError(`Video chunk metadata decoder configuration codec string '${i.decoderConfig.codec}' does not fit to the track codec '${t}'.`)},op=["mp4a","mp3","opus","vorbis","flac","ulaw","alaw","pcm","ac-3","ec-3","dts"],Pe=(i,t)=>{if(!i)throw new TypeError("Audio chunk metadata must be provided.");if(typeof i!="object")throw new TypeError("Audio chunk metadata must be an object.");if(!i.decoderConfig)throw new TypeError("Audio chunk metadata must include a decoder configuration.");if(typeof i.decoderConfig!="object")throw new TypeError("Audio chunk metadata decoder configuration must be an object.");if(typeof i.decoderConfig.codec!="string")throw new TypeError("Audio chunk metadata decoder configuration must specify a codec string.");if(!op.some(e=>i.decoderConfig.codec.startsWith(e)))throw new TypeError("Audio chunk metadata decoder configuration codec string must be a valid audio codec string as specified in the Mediabunny Codec Registry.");if(!Number.isInteger(i.decoderConfig.sampleRate)||i.decoderConfig.sampleRate<=0)throw new TypeError("Audio chunk metadata decoder configuration must specify a valid sampleRate (positive integer).");if(!Number.isInteger(i.decoderConfig.numberOfChannels)||i.decoderConfig.numberOfChannels<=0)throw new TypeError("Audio chunk metadata decoder configuration must specify a valid numberOfChannels (positive integer).");if(i.decoderConfig.description!==void 0&&!cr(i.decoderConfig.description))throw new TypeError("Audio chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");if(i.decoderConfig.codec.startsWith("mp4a")&&i.decoderConfig.codec!=="mp4a.69"&&i.decoderConfig.codec!=="mp4a.6B"&&i.decoderConfig.codec!=="mp4a.6b"){if(!["mp4a.40.2","mp4a.40.02","mp4a.40.5","mp4a.40.05","mp4a.40.29","mp4a.67"].includes(i.decoderConfig.codec))throw new TypeError("Audio chunk metadata decoder configuration codec string for AAC must be a valid AAC codec string as specified in https://www.w3.org/TR/webcodecs-aac-codec-registration/.")}else if(i.decoderConfig.codec.startsWith("mp3")||i.decoderConfig.codec.startsWith("mp4a")){if(i.decoderConfig.codec!=="mp3"&&i.decoderConfig.codec!=="mp4a.69"&&i.decoderConfig.codec!=="mp4a.6B"&&i.decoderConfig.codec!=="mp4a.6b")throw new TypeError('Audio chunk metadata decoder configuration codec string for MP3 must be "mp3", "mp4a.69" or "mp4a.6B".')}else if(i.decoderConfig.codec.startsWith("opus")){if(i.decoderConfig.codec!=="opus")throw new TypeError('Audio chunk metadata decoder configuration codec string for Opus must be "opus".');if(i.decoderConfig.description&&i.decoderConfig.description.byteLength<18)throw new TypeError("Audio chunk metadata decoder configuration description, when specified, is expected to be an Identification Header as specified in Section 5.1 of RFC 7845.")}else if(i.decoderConfig.codec.startsWith("vorbis")){if(i.decoderConfig.codec!=="vorbis")throw new TypeError('Audio chunk metadata decoder configuration codec string for Vorbis must be "vorbis".');if(!i.decoderConfig.description)throw new TypeError("Audio chunk metadata decoder configuration for Vorbis must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-vorbis-codec-registration/.")}else if(i.decoderConfig.codec.startsWith("flac")){if(i.decoderConfig.codec!=="flac")throw new TypeError('Audio chunk metadata decoder configuration codec string for FLAC must be "flac".');if(!i.decoderConfig.description||i.decoderConfig.description.byteLength<42)throw new TypeError("Audio chunk metadata decoder configuration for FLAC must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-flac-codec-registration/.")}else if(i.decoderConfig.codec.startsWith("ac-3")||i.decoderConfig.codec.startsWith("ac3")){if(i.decoderConfig.codec!=="ac-3")throw new TypeError('Audio chunk metadata decoder configuration codec string for AC-3 must be "ac-3".')}else if(i.decoderConfig.codec.startsWith("ec-3")||i.decoderConfig.codec.startsWith("eac3")){if(i.decoderConfig.codec!=="ec-3")throw new TypeError('Audio chunk metadata decoder configuration codec string for EC-3 must be "ec-3".')}else if(i.decoderConfig.codec.startsWith("dts")){if(!jn.includes(i.decoderConfig.codec))throw new TypeError(`Audio chunk metadata decoder configuration codec string for DTS must be one of the following four-character codes: ${jn.join(", ")}.`)}else if((i.decoderConfig.codec.startsWith("pcm")||i.decoderConfig.codec.startsWith("ulaw")||i.decoderConfig.codec.startsWith("alaw"))&&!se.includes(i.decoderConfig.codec))throw new TypeError(`Audio chunk metadata decoder configuration codec string for PCM must be one of the supported PCM codecs (${se.join(", ")}).`);if(t!==null&&Xe(i.decoderConfig.codec)!==t)throw new TypeError(`Audio chunk metadata decoder configuration codec string '${i.decoderConfig.codec}' does not fit to the track codec '${t}'.`)},ks=i=>{if(!i)throw new TypeError("Subtitle metadata must be provided.");if(typeof i!="object")throw new TypeError("Subtitle metadata must be an object.");if(!i.config)throw new TypeError("Subtitle metadata must include a config object.");if(typeof i.config!="object")throw new TypeError("Subtitle metadata config must be an object.");if(typeof i.config.description!="string")throw new TypeError("Subtitle metadata config description must be a string.")};var Nc=[44100,48e3,32e3],Ts=[-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,32,40,48,56,64,80,96,112,128,160,192,224,256,320,-1,-1,32,48,56,64,80,96,112,128,160,192,224,256,320,384,-1,-1,32,64,96,128,160,192,224,256,288,320,352,384,416,448,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,8,16,24,32,40,48,56,64,80,96,112,128,144,160,-1,-1,8,16,24,32,40,48,56,64,80,96,112,128,144,160,-1,-1,32,48,56,64,80,96,112,128,144,160,176,192,224,256,-1],zr=1483304551,Gi=1231971951,ws=(i,t,e,r,n)=>t===0?0:t===1?Math.floor(144*e/(r<<i))+n:t===2?Math.floor(144*e/r)+n:(Math.floor(12*e/r)+n)*4,ud=(i,t,e,r)=>t===0?0:t===1?144*e/(r<<i):t===2?144*e/r:12*e/r*4,Nr=(i,t)=>i===3?t===3?21:36:t===3?13:21,Lr=(i,t)=>{let e=i>>>24,r=i>>>16&255,n=i>>>8&255,a=i&255;if(e!==255&&r!==255&&n!==255&&a!==255)return{header:null,bytesAdvanced:4};if(e!==255)return{header:null,bytesAdvanced:1};if((r&224)!==224)return{header:null,bytesAdvanced:1};let s=0,o=0;r&16?s=r&8?0:1:(s=1,o=1);let c=r>>3&3,u=r>>1&3,l=n>>4&15,m=(n>>2&3)%3,d=n>>1&1,f=a>>6&3,p=a>>4&3,b=a>>3&1,h=a>>2&1,y=a&3,k=Ts[s*16*4+u*16+l];if(k===-1)return{header:null,bytesAdvanced:1};let T=k*1e3,w=Nc[m]>>s+o,x=ws(s,u,T,w,d);if(t!==null&&t<x)return{header:null,bytesAdvanced:1};let C;return c===3?C=u===3?384:1152:u===3?C=384:u===2?C=1152:C=576,{header:{totalSize:x,mpegVersionId:c,lowSamplingFrequency:s,layer:u,bitrate:T,frequencyIndex:m,sampleRate:w,channel:f,modeExtension:p,copyright:b,original:h,emphasis:y,audioSamplesInFrame:C},bytesAdvanced:1}},ld=i=>{let t=127,e=0,r=i;for(;(t^2147483647)!==0;)e=r&~t,e<<=1,e|=r&t,t=(t+1<<8)-1,r=e;return e},Ss=i=>{let t=2130706432,e=0;for(;t!==0;)e>>=1,e|=i&t,t>>=8;return e};var Wr=i=>i===3?1:2;var Ie=class{constructor(t){this.input=t}dispose(){}};var Se=new Uint8Array(0),j=class i{constructor(t,e,r,n,a=-1,s,o){this.data=t;this.type=e;this.timestamp=r;this.duration=n;this.sequenceNumber=a;if(t===Se&&s===void 0)throw new Error("Internal error: byteLength must be explicitly provided when constructing metadata-only packets.");if(s===void 0&&(s=t.byteLength),!(t instanceof Uint8Array))throw new TypeError("data must be a Uint8Array.");if(e!=="key"&&e!=="delta")throw new TypeError('type must be either "key" or "delta".');if(!Number.isFinite(r))throw new TypeError("timestamp must be a number.");if(!Number.isFinite(n)||n<0)throw new TypeError("duration must be a non-negative number.");if(!Number.isFinite(a))throw new TypeError("sequenceNumber must be a number.");if(!Number.isInteger(s)||s<0)throw new TypeError("byteLength must be a non-negative integer.");if(o!==void 0&&(typeof o!="object"||!o))throw new TypeError("sideData, when provided, must be an object.");if(o?.alpha!==void 0&&!(o.alpha instanceof Uint8Array))throw new TypeError("sideData.alpha, when provided, must be a Uint8Array.");if(o?.alphaByteLength!==void 0&&(!Number.isInteger(o.alphaByteLength)||o.alphaByteLength<0))throw new TypeError("sideData.alphaByteLength, when provided, must be a non-negative integer.");this.byteLength=s,this.sideData=o??{},this.sideData.alpha&&this.sideData.alphaByteLength===void 0&&(this.sideData.alphaByteLength=this.sideData.alpha.byteLength)}get isMetadataOnly(){return this.data===Se}get microsecondTimestamp(){return Math.trunc(Lt*this.timestamp)}get microsecondDuration(){return Math.trunc(Lt*this.duration)}toEncodedVideoChunk(){if(this.isMetadataOnly)throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");if(typeof EncodedVideoChunk>"u")throw new Error("EncodedVideoChunk is not available in this environment.");return new EncodedVideoChunk({data:this.data,type:this.type,timestamp:this.microsecondTimestamp,duration:this.microsecondDuration})}alphaToEncodedVideoChunk(t=this.type){if(!this.sideData.alpha)throw new TypeError("This packet does not contain alpha side data.");if(this.isMetadataOnly)throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");if(typeof EncodedVideoChunk>"u")throw new Error("EncodedVideoChunk is not available in this environment.");return new EncodedVideoChunk({data:this.sideData.alpha,type:t,timestamp:this.microsecondTimestamp,duration:this.microsecondDuration})}toEncodedAudioChunk(){if(this.isMetadataOnly)throw new TypeError("Metadata-only packets cannot be converted to an audio chunk.");if(typeof EncodedAudioChunk>"u")throw new Error("EncodedAudioChunk is not available in this environment.");return new EncodedAudioChunk({data:this.data,type:this.type,timestamp:this.microsecondTimestamp,duration:this.microsecondDuration})}static fromEncodedChunk(t,e){if(!(t instanceof EncodedVideoChunk||t instanceof EncodedAudioChunk))throw new TypeError("chunk must be an EncodedVideoChunk or EncodedAudioChunk.");let r=new Uint8Array(t.byteLength);return t.copyTo(r),new i(r,t.type,t.timestamp/1e6,(t.duration??0)/1e6,void 0,void 0,e)}clone(t){if(t!==void 0&&(typeof t!="object"||t===null))throw new TypeError("options, when provided, must be an object.");if(t?.data!==void 0&&!(t.data instanceof Uint8Array))throw new TypeError("options.data, when provided, must be a Uint8Array.");if(t?.type!==void 0&&t.type!=="key"&&t.type!=="delta")throw new TypeError('options.type, when provided, must be either "key" or "delta".');if(t?.timestamp!==void 0&&!Number.isFinite(t.timestamp))throw new TypeError("options.timestamp, when provided, must be a number.");if(t?.duration!==void 0&&!Number.isFinite(t.duration))throw new TypeError("options.duration, when provided, must be a number.");if(t?.sequenceNumber!==void 0&&!Number.isFinite(t.sequenceNumber))throw new TypeError("options.sequenceNumber, when provided, must be a number.");if(t?.sideData!==void 0&&(typeof t.sideData!="object"||t.sideData===null))throw new TypeError("options.sideData, when provided, must be an object.");return new i(t?.data??this.data,t?.type??this.type,t?.timestamp??this.timestamp,t?.duration??this.duration,t?.sequenceNumber??this.sequenceNumber,this.byteLength,t?.sideData??this.sideData)}};var As=i=>{let e=(i.hasVideo?"video/":i.hasAudio?"audio/":"application/")+(i.isQuickTime?"quicktime":"mp4");if(i.codecStrings.length>0){let r=[...new Set(i.codecStrings)];e+=`; codecs="${r.join(", ")}"`}return e},xs=i=>{let t=L(i),e=0,r=t.getUint8(e);e+=1,e+=3;let n=_r(i.subarray(e,e+16));e+=16;let a=null;if(r>0){let o=t.getUint32(e);if(e+=4,o>0){a=[];for(let c=0;c<o;c++)a.push(_r(i.subarray(e,e+16))),e+=16}}let s=t.getUint32(e);return e+=4,{systemId:n,keyIds:a,data:i.slice(e,e+s)}},Cs=(i,t)=>i.systemId===t.systemId&&ja(i.data,t.data);var It=8,gr=16,br=i=>{let t=M(i),e=ue(i,4),r=8;t===1&&(t=Ne(i),r=16);let a=t-r;return a<0?null:{name:e,totalSize:t,headerSize:r,contentSize:a}},Hr=i=>yr(i)/65536,Ps=i=>yr(i)/1073741824,Is=i=>{let t=0;for(let e=0;e<4;e++){t<<=7;let r=N(i);if(t|=r&127,(r&128)===0)break}return t},Et=i=>{let t=be(i);return i.skip(2),t=Math.min(t,i.remainingLength),we.decode(D(i,t))},dd=i=>{let t=br(i);if(!t||t.name!=="data"||i.remainingLength<8)return null;let e=M(i);i.skip(4);let r=D(i,t.contentSize-8);switch(e){case 1:return we.decode(r);case 2:return new TextDecoder("utf-16be").decode(r);case 13:return new lt(r,"image/jpeg");case 14:return new lt(r,"image/png");case 27:return new lt(r,"image/bmp");default:return r}};var vt=16,kr=new Uint32Array(256),ji=new Uint32Array(256),Xi=new Uint32Array(256),$i=new Uint32Array(256),Yi=new Uint32Array(256),Be=new Uint32Array(256),md=new Uint32Array(10),fd=!1,cp=()=>{let i=new Uint8Array(256),t=new Uint8Array(256),e=new Uint8Array(256);for(let a=0,s=1;a<256;a++)e[a]=s,t[s]=a,s=s^s<<1^(s&128?283:0);let r=(a,s)=>a&&s?e[(t[a]+t[s])%255]:0;i[0]=99;for(let a=1;a<256;a++){let s=e[255-t[a]],o=s^s<<1^s<<2^s<<3^s<<4;o=o>>>8^o&255^99,i[a]=o}for(let a=0;a<256;a++){let s=i[a],o=i.indexOf(a);kr[a]=s<<24|s<<16|s<<8|s,Be[a]=o<<24|o<<16|o<<8|o;let c=r(o,14),u=r(o,9),l=r(o,13),m=r(o,11),d=c<<24|u<<16|l<<8|m;ji[a]=d,Xi[a]=d>>>8|d<<24,$i[a]=d>>>16|d<<16,Yi[a]=d>>>24|d<<8}let n=1;for(let a=0;a<10;a++)md[a]=n<<24,n=n<<1^(n&128?283:0);fd=!0},Xn=class{constructor(){this.roundkey=new Uint32Array(44);this.iv=new Uint32Array(vt/Uint32Array.BYTES_PER_ELEMENT);this.in=new Uint8Array(vt);this.out=new Uint8Array(vt);this.inView=new DataView(this.in.buffer);this.outView=new DataView(this.out.buffer)}init({key:t,iv:e}){g(t.byteLength===16),g(e.byteLength===16),fd||cp();let r=new DataView(t.buffer,t.byteOffset,t.byteLength),n=new DataView(e.buffer,e.byteOffset,e.byteLength);this.roundkey[0]=r.getUint32(0,!1),this.roundkey[1]=r.getUint32(4,!1),this.roundkey[2]=r.getUint32(8,!1),this.roundkey[3]=r.getUint32(12,!1),this.iv[0]=n.getUint32(0,!1),this.iv[1]=n.getUint32(4,!1),this.iv[2]=n.getUint32(8,!1),this.iv[3]=n.getUint32(12,!1);for(let a=4;a<44;a+=4){let s=this.roundkey[a-1];this.roundkey[a]=this.roundkey[a-4]^kr[s>>>16&255]&4278190080^kr[s>>>8&255]&16711680^kr[s>>>0&255]&65280^kr[s>>>24&255]&255^md[a/4-1],this.roundkey[a+1]=this.roundkey[a-3]^this.roundkey[a],this.roundkey[a+2]=this.roundkey[a-2]^this.roundkey[a+1],this.roundkey[a+3]=this.roundkey[a-1]^this.roundkey[a+2]}for(let a=0,s=40;a<s;a+=4,s-=4)for(let o=0;o<4;o++){let c=this.roundkey[a+o];this.roundkey[a+o]=this.roundkey[s+o],this.roundkey[s+o]=c}for(let a=4;a<40;a+=4)for(let s=0;s<4;s++){let o=this.roundkey[a+s];this.roundkey[a+s]=ji[kr[o>>>24&255]&255]^Xi[kr[o>>>16&255]&255]^$i[kr[o>>>8&255]&255]^Yi[kr[o>>>0&255]&255]}}decrypt(){let t=this.inView.getUint32(0,!1)^this.roundkey[0],e=this.inView.getUint32(4,!1)^this.roundkey[1],r=this.inView.getUint32(8,!1)^this.roundkey[2],n=this.inView.getUint32(12,!1)^this.roundkey[3],a=this.inView.getUint32(0,!1),s=this.inView.getUint32(4,!1),o=this.inView.getUint32(8,!1),c=this.inView.getUint32(12,!1),u,l,m,d;for(let y=1;y<10;y++){let k=y*4;u=ji[t>>>24]^Xi[n>>>16&255]^$i[r>>>8&255]^Yi[e&255]^this.roundkey[k],l=ji[e>>>24]^Xi[t>>>16&255]^$i[n>>>8&255]^Yi[r&255]^this.roundkey[k+1],m=ji[r>>>24]^Xi[e>>>16&255]^$i[t>>>8&255]^Yi[n&255]^this.roundkey[k+2],d=ji[n>>>24]^Xi[r>>>16&255]^$i[e>>>8&255]^Yi[t&255]^this.roundkey[k+3],t=u,e=l,r=m,n=d}let f=Be[t>>>24&255]&4278190080^Be[n>>>16&255]&16711680^Be[r>>>8&255]&65280^Be[e>>>0&255]&255^this.roundkey[40],p=Be[e>>>24&255]&4278190080^Be[t>>>16&255]&16711680^Be[n>>>8&255]&65280^Be[r>>>0&255]&255^this.roundkey[41],b=Be[r>>>24&255]&4278190080^Be[e>>>16&255]&16711680^Be[t>>>8&255]&65280^Be[n>>>0&255]&255^this.roundkey[42],h=Be[n>>>24&255]&4278190080^Be[r>>>16&255]&16711680^Be[e>>>8&255]&65280^Be[t>>>0&255]&255^this.roundkey[43];this.outView.setUint32(0,f^this.iv[0],!1),this.outView.setUint32(4,p^this.iv[1],!1),this.outView.setUint32(8,b^this.iv[2],!1),this.outView.setUint32(12,h^this.iv[3],!1),this.iv[0]=a,this.iv[1]=s,this.iv[2]=o,this.iv[3]=c}},pd=(i,t,e)=>{let r=!1,n=0,a=2**16,s=16,o=new Xn;return new ReadableStream({pull:async c=>{r||(o.init(await t()),r=!0);let u=a+s,l=i.requestSliceRange(n,0,u);if(v(l)&&(l=await l),!l||l.length===0)throw new Error("Invalid ciphertext.");let m=l.length;if(m%16!==0)throw new Error("Invalid ciphertext.");let d=m===u?m-s:m,f=D(l,d),p=new Uint8Array(d);for(let b=0;b<d;b+=16)o.in.set(f.subarray(b,b+16)),o.decrypt(),p.set(o.out,b);if(d<m)c.enqueue(p),n+=d;else{let b=p[d-1];if(b===0||b>16)throw new Error("Invalid PKCS#7 padding. Incorrect key or corrupted data.");let h=p.subarray(0,d-b);c.enqueue(h),c.close(),e()}},cancel:()=>{e()}})};var Es=class i extends Ie{constructor(e){super(e);this.moovSlice=null;this.currentTrack=null;this.tracks=[];this.metadataPromise=null;this.movieTimescale=-1;this.movieDurationInTimescale=-1;this.isQuickTime=!1;this.metadataTags={};this.currentMetadataKeys=null;this.isFragmented=!1;this.fragmentTrackDefaults=[];this.psshBoxes=[];this.currentFragment=null;this.lastReadFragment=null;this.decryptionKeyCache=new Map;this.reader=e._reader}async getTrackBackings(){return await this.readMetadata(),this.tracks.map(e=>e.trackBacking)}async getMimeType(){await this.readMetadata();let e=await this.getTrackBackings(),r=await Promise.all(e.map(n=>n.getDecoderConfig().then(a=>a?.codec??null)));return As({isQuickTime:this.isQuickTime,hasVideo:this.tracks.some(n=>n.info?.type==="video"),hasAudio:this.tracks.some(n=>n.info?.type==="audio"),codecStrings:r.filter(Boolean)})}async getMetadataTags(){return await this.readMetadata(),this.metadataTags}readMetadata(){return this.metadataPromise??=(async()=>{let e=0,r=!1,n=!1;for(;;){let a=this.reader.requestSliceRange(e,It,gr);if(v(a)&&(a=await a),!a)break;let s=e,o=br(a);if(!o)break;if(o.name==="ftyp"||o.name==="styp"){let c=ue(a,4);this.isQuickTime=c==="qt  "}else if(o.name==="moov"){let c=this.reader.requestSlice(a.filePos,o.contentSize);if(v(c)&&(c=await c),!c)break;this.moovSlice=c,this.readContiguousBoxes(this.moovSlice);for(let u of this.tracks){let l=u.editListPreviousSegmentDurations/this.movieTimescale;u.editListOffset-=Math.round(l*u.timescale)}r=this.isFragmented&&this.reader.fileSize!==null&&this.reader.fileSize>s+o.totalSize,n=!0;break}else if(o.name==="moof"){if(!this.input._initInput)throw new Error('"moof" box encountered with no "moov" box present; this file is likely a Segment as described in ISO/IEC 14496-12 Section 8.16. A separate init file that contains a "moov" box is required to read this file, please provide it using InputOptions.initInput.');await this.copyMetadataFromInitInput(this.input._initInput),r=!1,n=!0;break}e=s+o.totalSize}if(!n&&this.input._initInput&&await this.copyMetadataFromInitInput(this.input._initInput),r){g(this.reader.fileSize!==null);let a=this.reader.requestSlice(this.reader.fileSize-4,4);v(a)&&(a=await a),g(a);let s=M(a),o=this.reader.fileSize-s;if(o>=0&&o<=this.reader.fileSize-gr){let c=this.reader.requestSliceRange(o,It,gr);if(v(c)&&(c=await c),c){let u=br(c);if(u&&u.name==="mfra"){let l=this.reader.requestSlice(c.filePos,u.contentSize);v(l)&&(l=await l),l&&this.readContiguousBoxes(l)}}}}})()}async copyMetadataFromInitInput(e){let r=await e._getDemuxer();if(r.constructor!==i)throw new Error("Init input must match the input's format.");await r.readMetadata(),this.movieTimescale=r.movieTimescale,this.movieDurationInTimescale=r.movieDurationInTimescale,this.metadataTags=r.metadataTags,this.isFragmented=!0,this.fragmentTrackDefaults=r.fragmentTrackDefaults,this.psshBoxes=r.psshBoxes;for(let n of r.tracks){let a={id:n.id,demuxer:this,trackBacking:null,disposition:n.disposition,timescale:n.timescale,durationInMediaTimescale:n.durationInMediaTimescale,durationInMovieTimescale:n.durationInMovieTimescale,rotation:n.rotation,internalCodecId:n.internalCodecId,name:n.name,languageCode:n.languageCode,sampleTableByteOffset:null,sampleTable:null,fragmentLookupTable:[],currentFragmentState:null,fragmentPositionCache:[],editListPreviousSegmentDurations:n.editListPreviousSegmentDurations,editListOffset:n.editListOffset,encryptionInfo:n.encryptionInfo,encryptionAuxInfo:null,frmaCodecString:null,info:n.info};if(n.trackBacking){if(g(a.info),a.info.type==="video"&&a.info.width!==-1){let s=a;a.trackBacking=new _s(s),this.tracks.push(a)}else if(a.info.type==="audio"&&a.info.numberOfChannels!==-1){let s=a;a.trackBacking=new Rs(s),this.tracks.push(a)}}}}getSampleTableForTrack(e){if(e.sampleTable)return e.sampleTable;let r={sampleTimingEntries:[],sampleCompositionTimeOffsets:[],sampleSizes:[],keySampleIndices:null,chunkOffsets:[],sampleToChunk:[],presentationTimestamps:null,presentationTimestampIndexMap:null};if(e.sampleTable=r,e.sampleTableByteOffset===null)return r;g(this.moovSlice);let n=this.moovSlice.slice(e.sampleTableByteOffset);if(this.currentTrack=e,this.traverseBox(n),this.currentTrack=null,e.info?.type==="audio"&&e.info.codec&&se.includes(e.info.codec)&&r.sampleCompositionTimeOffsets.length===0){g(e.info?.type==="audio");let s=Re(e.info.codec),o=[],c=[];for(let u=0;u<r.sampleToChunk.length;u++){let l=r.sampleToChunk[u],m=r.sampleToChunk[u+1],d=(m?m.startChunkIndex:r.chunkOffsets.length)-l.startChunkIndex;for(let f=0;f<d;f++){let p=l.startSampleIndex+f*l.samplesPerChunk,b=p+l.samplesPerChunk,h=Q(r.sampleTimingEntries,p,S=>S.startIndex),y=r.sampleTimingEntries[h],k=Q(r.sampleTimingEntries,b,S=>S.startIndex),T=r.sampleTimingEntries[k],w=y.startDecodeTimestamp+(p-y.startIndex)*y.delta,C=T.startDecodeTimestamp+(b-T.startIndex)*T.delta-w,P=ee(o);P&&P.delta===C?P.count++:o.push({startIndex:l.startChunkIndex+f,startDecodeTimestamp:w,count:1,delta:C});let A=l.samplesPerChunk*s.sampleSize*e.info.numberOfChannels;c.push(A)}l.startSampleIndex=l.startChunkIndex,l.samplesPerChunk=1}r.sampleTimingEntries=o,r.sampleSizes=c}if(r.sampleCompositionTimeOffsets.length>0){r.presentationTimestamps=[];for(let s of r.sampleTimingEntries)for(let o=0;o<s.count;o++)r.presentationTimestamps.push({presentationTimestamp:s.startDecodeTimestamp+o*s.delta,sampleIndex:s.startIndex+o});for(let s of r.sampleCompositionTimeOffsets)for(let o=0;o<s.count;o++){let c=s.startIndex+o,u=r.presentationTimestamps[c];u&&(u.presentationTimestamp+=s.offset)}r.presentationTimestamps.sort((s,o)=>s.presentationTimestamp-o.presentationTimestamp),r.presentationTimestampIndexMap=Array(r.presentationTimestamps.length).fill(-1);for(let s=0;s<r.presentationTimestamps.length;s++)r.presentationTimestampIndexMap[r.presentationTimestamps[s].sampleIndex]=s}return r}async readFragment(e){if(this.lastReadFragment?.moofOffset===e)return this.lastReadFragment;let r=this.reader.requestSliceRange(e,It,gr);v(r)&&(r=await r),g(r);let n=br(r);g(n?.name==="moof");let a=this.reader.requestSlice(e,n.totalSize);v(a)&&(a=await a),g(a),this.traverseBox(a);let s=this.lastReadFragment;g(s&&s.moofOffset===e);for(let[,o]of s.trackData){let c=o.track,{fragmentPositionCache:u}=c;if(!o.startTimestampIsFinal){let m=c.fragmentLookupTable.find(d=>d.moofOffset===s.moofOffset);if(m)Lc(o,m.timestamp);else{let d=Q(u,s.moofOffset-1,f=>f.moofOffset);if(d!==-1){let f=u[d];Lc(o,f.endTimestamp)}}o.startTimestampIsFinal=!0}let l=Q(u,o.startTimestamp,m=>m.startTimestamp);if((l===-1||u[l].moofOffset!==s.moofOffset)&&u.splice(l+1,0,{moofOffset:s.moofOffset,startTimestamp:o.startTimestamp,endTimestamp:o.endTimestamp}),o.encryptionAuxInfo&&c.encryptionInfo){let m=await Td(this.reader,c.encryptionInfo,o.encryptionAuxInfo);for(let d=0;d<Math.min(o.samples.length,m.length);d++){let f=m[d];o.samples[d].encryption=f}}}return s}readContiguousBoxes(e){let r=e.filePos;for(;e.filePos-r<=e.length-It&&this.traverseBox(e););}*iterateContiguousBoxes(e){let r=e.filePos;for(;e.filePos-r<=e.length-It;){let n=e.filePos,a=br(e);if(!a)break;yield{boxInfo:a,slice:e},e.filePos=n+a.totalSize}}traverseBox(e){let r=e.filePos,n=br(e);if(!n)return!1;let a=e.filePos,s=r+n.totalSize;switch(n.name){case"mdia":case"minf":case"dinf":case"mfra":case"edts":case"sinf":case"schi":this.readContiguousBoxes(e.slice(a,n.contentSize));break;case"mvhd":{let o=N(e);e.skip(3),o===1?(e.skip(16),this.movieTimescale=M(e),this.movieDurationInTimescale=Ne(e)):(e.skip(8),this.movieTimescale=M(e),this.movieDurationInTimescale=M(e))}break;case"trak":{let o={id:-1,demuxer:this,trackBacking:null,disposition:{..._e,primary:!1},info:null,timescale:-1,durationInMovieTimescale:-1,durationInMediaTimescale:-1,rotation:0,internalCodecId:null,name:null,languageCode:ae,sampleTableByteOffset:-1,sampleTable:null,fragmentLookupTable:[],currentFragmentState:null,fragmentPositionCache:[],editListPreviousSegmentDurations:0,editListOffset:0,encryptionInfo:null,encryptionAuxInfo:null,frmaCodecString:null};if(this.currentTrack=o,this.readContiguousBoxes(e.slice(a,n.contentSize)),o.id!==-1&&o.timescale!==-1&&o.info!==null){if(o.info.type==="video"&&o.info.width!==-1){let c=o;o.trackBacking=new _s(c),this.tracks.push(o)}else if(o.info.type==="audio"&&o.info.numberOfChannels!==-1){let c=o;o.trackBacking=new Rs(c),this.tracks.push(o)}}this.currentTrack=null}break;case"tkhd":{let o=this.currentTrack;if(!o)break;let c=N(e),l=!!(_t(e)&1);if(o.disposition.default=l,c===0)e.skip(8),o.id=M(e),e.skip(4),o.durationInMovieTimescale=M(e);else if(c===1)e.skip(16),o.id=M(e),e.skip(4),o.durationInMovieTimescale=Ne(e);else throw new Error(`Incorrect track header version ${c}.`);e.skip(2*4+2+2+2+2);let m=[Hr(e),Hr(e),Ps(e),Hr(e),Hr(e),Ps(e),Hr(e),Hr(e),Ps(e)],d=kt(Fn(mp(m),90));g(d===0||d===90||d===180||d===270),o.rotation=d}break;case"elst":{let o=this.currentTrack;if(!o)break;let c=N(e);e.skip(3);let u=!1,l=0,m=M(e);for(let d=0;d<m;d++){let f=c===1?Ne(e):M(e),p=c===1?Sd(e):yr(e),b=Hr(e);if(u){U._warn("Unsupported edit list: multiple edits are not currently supported. Only using first edit.");break}if(p===-1){l+=f;continue}if(b!==1){U._warn("Unsupported edit list entry: media rate must be 1.");break}o.editListPreviousSegmentDurations=l,o.editListOffset=p,u=!0}}break;case"mdhd":{let o=this.currentTrack;if(!o)break;let c=N(e);e.skip(3),c===0?(e.skip(8),o.timescale=M(e),o.durationInMediaTimescale=M(e)):c===1&&(e.skip(16),o.timescale=M(e),o.durationInMediaTimescale=Ne(e));let u=be(e);if(u>0){o.languageCode="";for(let l=0;l<3;l++)o.languageCode=String.fromCharCode(96+(u&31))+o.languageCode,u>>=5;dr(o.languageCode)||(o.languageCode=ae)}}break;case"hdlr":{let o=this.currentTrack;if(!o)break;e.skip(8);let c=ue(e,4);c==="vide"?o.info={type:"video",width:-1,height:-1,squarePixelWidth:-1,squarePixelHeight:-1,codec:null,codecDescription:null,colorSpace:{...qa},avcType:null,avcCodecInfo:null,hevcCodecInfo:null,vp9CodecInfo:null,av1CodecInfo:null,proresCodecInfo:null,proresFormat:null}:c==="soun"&&(o.info={type:"audio",numberOfChannels:-1,sampleRate:-1,codec:null,codecDescription:null,aacCodecInfo:null,dtsFormat:null,pcmLittleEndian:!1,pcmSampleSize:null})}break;case"stbl":{let o=this.currentTrack;if(!o)break;o.sampleTableByteOffset=r,this.readContiguousBoxes(e.slice(a,n.contentSize))}break;case"stsd":{let o=this.currentTrack;if(!o||o.info===null||o.sampleTable)break;let c=N(e);e.skip(3);let u=M(e);for(let l=0;l<u;l++){let m=e.filePos,d=br(e);if(!d)break;o.internalCodecId=d.name;let f=d.name.toLowerCase();if(o.info.type==="video"){e.skip(6*1+2+2+2+3*4),o.info.width=be(e),o.info.height=be(e),o.info.squarePixelWidth=o.info.width,o.info.squarePixelHeight=o.info.height,e.skip(50),o.frmaCodecString=null,this.readContiguousBoxes(e.slice(e.filePos,m+d.totalSize-e.filePos));let p=f==="encv"?o.frmaCodecString:f;o.frmaCodecString=null,p==="avc1"||p==="avc3"?(o.info.codec="avc",o.info.avcType=p==="avc1"?1:3):p==="hvc1"||p==="hev1"?o.info.codec="hevc":p==="vp08"?o.info.codec="vp8":p==="vp09"?o.info.codec="vp9":p==="av01"?o.info.codec="av1":hr.includes(f)?(o.info.codec="prores",o.info.proresFormat=f):p===null?U._warn("Unknown encrypted video codec due to missing frma box."):U._warn(`Unsupported video codec (sample entry type '${d.name}').`)}else{e.skip(6*1+2);let p=be(e);e.skip(3*2);let b=be(e),h=be(e);e.skip(2*2);let y=M(e)/65536,k=null;c===0&&p>0&&(p===1?(e.skip(4),h=8*M(e),e.skip(2*4)):p===2&&(e.skip(4),y=Fs(e),b=M(e),e.skip(4),h=M(e),k=M(e),e.skip(2*4))),o.info.numberOfChannels=b,o.info.sampleRate=y,o.frmaCodecString=null,this.readContiguousBoxes(e.slice(e.filePos,m+d.totalSize-e.filePos));let T=f==="enca"?o.frmaCodecString:f;if(o.frmaCodecString=null,T!=="mp4a")if(T==="opus")o.info.codec="opus",o.info.sampleRate=Pt;else if(T==="flac")o.info.codec="flac";else if(T==="ulaw")o.info.codec="ulaw";else if(T==="alaw")o.info.codec="alaw";else if(T==="ac-3")o.info.codec="ac3";else if(T==="ec-3")o.info.codec="eac3";else if(jn.includes(T))o.info.codec="dts",o.info.dtsFormat=T;else if(T==="twos")h===8?o.info.codec="pcm-s8":h===16?o.info.codec=o.info.pcmLittleEndian?"pcm-s16":"pcm-s16be":(U._warn(`Unsupported sample size ${h} for codec 'twos'.`),o.info.codec=null);else if(T==="sowt")h===8?o.info.codec="pcm-s8":h===16?o.info.codec="pcm-s16":(U._warn(`Unsupported sample size ${h} for codec 'sowt'.`),o.info.codec=null);else if(T==="raw ")o.info.codec="pcm-u8";else if(T==="in24")o.info.codec=o.info.pcmLittleEndian?"pcm-s24":"pcm-s24be";else if(T==="in32")o.info.codec=o.info.pcmLittleEndian?"pcm-s32":"pcm-s32be";else if(T==="fl32")o.info.codec=o.info.pcmLittleEndian?"pcm-f32":"pcm-f32be";else if(T==="fl64")o.info.codec=o.info.pcmLittleEndian?"pcm-f64":"pcm-f64be";else if(T==="ipcm"){let w=o.info.pcmSampleSize;o.info.pcmLittleEndian?w===16?o.info.codec="pcm-s16":w===24?o.info.codec="pcm-s24":w===32?o.info.codec="pcm-s32":(U._warn(`Invalid ipcm sample size ${w}.`),o.info.codec=null):w===16?o.info.codec="pcm-s16be":w===24?o.info.codec="pcm-s24be":w===32?o.info.codec="pcm-s32be":(U._warn(`Invalid ipcm sample size ${w}.`),o.info.codec=null)}else if(T==="fpcm"){let w=o.info.pcmSampleSize;o.info.pcmLittleEndian?w===32?o.info.codec="pcm-f32":w===64?o.info.codec="pcm-f64":(U._warn(`Invalid fpcm sample size ${w}.`),o.info.codec=null):w===32?o.info.codec="pcm-f32be":w===64?o.info.codec="pcm-f64be":(U._warn(`Invalid fpcm sample size ${w}.`),o.info.codec=null)}else if(T==="lpcm"&&k!==null){let w=h+7>>3,x=!!(k&1),C=!!(k&2),P=k&4?-1:0;h>0&&h<=64&&(x?h===32&&(o.info.codec=C?"pcm-f32be":"pcm-f32"):P&1<<w-1?w===1?o.info.codec="pcm-s8":w===2?o.info.codec=C?"pcm-s16be":"pcm-s16":w===3?o.info.codec=C?"pcm-s24be":"pcm-s24":w===4&&(o.info.codec=C?"pcm-s32be":"pcm-s32"):w===1&&(o.info.codec="pcm-u8")),o.info.codec===null&&U._warn("Unsupported PCM format.")}else T===null?U._warn("Unknown encrypted audio codec due to missing frma box."):U._warn(`Unsupported audio codec (sample entry type '${d.name}').`)}e.filePos=m+d.totalSize}}break;case"frma":{let o=this.currentTrack;if(!o)break;let u=ue(e,4).toLowerCase();o.frmaCodecString=u}break;case"schm":{let o=this.currentTrack;if(!o)break;e.skip(4);let c=ue(e,4);c==="cenc"||c==="cens"||c==="cbcs"?o.encryptionInfo={scheme:c,defaultKid:null,defaultIsProtected:null,defaultPerSampleIvSize:null,defaultConstantIv:null,defaultCryptByteBlock:null,defaultSkipByteBlock:null}:U._warn(`Unsupported encryption scheme '${c}'.`)}break;case"tenc":{let o=this.currentTrack;if(!o||!o.encryptionInfo)break;let c=N(e);e.skip(3),e.skip(1);let u=N(e);if(c>0?(o.encryptionInfo.defaultCryptByteBlock=u>>4,o.encryptionInfo.defaultSkipByteBlock=u&15):(o.encryptionInfo.defaultCryptByteBlock=0,o.encryptionInfo.defaultSkipByteBlock=0),o.encryptionInfo.defaultIsProtected=N(e)!==0,o.encryptionInfo.defaultPerSampleIvSize=N(e),o.encryptionInfo.defaultKid=_r(D(e,16)),o.encryptionInfo.defaultIsProtected&&o.encryptionInfo.defaultPerSampleIvSize===0){let l=N(e),m=new Uint8Array(16);m.set(D(e,l),0),o.encryptionInfo.defaultConstantIv=m}}break;case"avcC":{let o=this.currentTrack;if(!o||(g(o.info),n.contentSize===0))break;o.info.codecDescription=D(e,n.contentSize)}break;case"hvcC":{let o=this.currentTrack;if(!o||(g(o.info),n.contentSize===0))break;o.info.codecDescription=D(e,n.contentSize)}break;case"vpcC":{let o=this.currentTrack;if(!o)break;g(o.info?.type==="video"),e.skip(4);let c=N(e),u=N(e),l=N(e),m=l>>4,d=l>>1&7,f=l&1,p=N(e),b=N(e),h=N(e);o.info.vp9CodecInfo={profile:c,level:u,bitDepth:m,chromaSubsampling:d,videoFullRangeFlag:f,colourPrimaries:p,transferCharacteristics:b,matrixCoefficients:h}}break;case"av1C":{let o=this.currentTrack;if(!o)break;g(o.info?.type==="video"),e.skip(1);let c=N(e),u=c>>5,l=c&31,m=N(e),d=m>>7,f=m>>6&1,p=m>>5&1,b=m>>4&1,h=m>>3&1,y=m>>2&1,k=m&3,T=u===2&&f?p?12:10:f?10:8;e.skip(1);let w=D(e,n.contentSize-4),x=zn(w);o.info.av1CodecInfo={profile:u,level:l,tier:d,bitDepth:T,monochrome:b,chromaSubsamplingX:h,chromaSubsamplingY:y,chromaSamplePosition:k,videoFullRangeFlag:x?.videoFullRangeFlag??0,colourPrimaries:x?.colourPrimaries??2,transferCharacteristics:x?.transferCharacteristics??2,matrixCoefficients:x?.matrixCoefficients??2}}break;case"colr":{let o=this.currentTrack;if(!o)break;g(o.info?.type==="video");let c=ue(e,4);if(c!=="nclx"&&c!=="nclc")break;let u=be(e),l=be(e),m=be(e),d;c==="nclx"&&(d=!!(N(e)&128)),o.info.colorSpace={primaries:ot[u],transfer:ct[l],matrix:ut[m],fullRange:d}}break;case"pasp":{let o=this.currentTrack;if(!o)break;g(o.info?.type==="video");let c=M(e),u=M(e);c>0&&u>0&&(c>u?o.info.squarePixelWidth=Math.round(o.info.width*c/u):o.info.squarePixelHeight=Math.round(o.info.height*u/c))}break;case"wave":this.readContiguousBoxes(e.slice(a,n.contentSize));break;case"esds":{let o=this.currentTrack;if(!o||o.info?.type!=="audio")break;e.skip(4);let c=N(e);g(c===3),Is(e),e.skip(2);let u=N(e),l=(u&128)!==0,m=(u&64)!==0,d=(u&32)!==0;if(l&&e.skip(2),m){let y=N(e);e.skip(y)}d&&e.skip(2);let f=N(e);g(f===4);let p=Is(e),b=e.filePos,h=N(e);if(h===64||h===103?(o.info.codec="aac",o.info.aacCodecInfo={isMpeg2:h===103,objectType:null}):h===105||h===107?o.info.codec="mp3":h===221?o.info.codec="vorbis":h===169?o.info.codec="dts":U._warn(`Unsupported audio codec (objectTypeIndication ${h}) - discarding track.`),e.skip(12),p>e.filePos-b){let y=N(e);g(y===5);let k=Is(e);if(o.info.codecDescription=D(e,k),o.info.codec==="aac"){let T=Qt(o.info.codecDescription);T.outputNumberOfChannels!==null&&(o.info.numberOfChannels=T.outputNumberOfChannels),T.outputSampleRate!==null&&(o.info.sampleRate=T.outputSampleRate)}}}break;case"enda":{let o=this.currentTrack;if(!o)break;g(o.info?.type==="audio"),o.info.pcmLittleEndian=!!(be(e)&255)}break;case"pcmC":{let o=this.currentTrack;if(!o)break;g(o.info?.type==="audio"),e.skip(4);let c=N(e);o.info.pcmLittleEndian=!!(c&1),o.info.pcmSampleSize=N(e)}break;case"dOps":{let o=this.currentTrack;if(!o)break;g(o.info?.type==="audio"),e.skip(1);let c=N(e),u=be(e),l=M(e),m=$n(e),d=N(e),f;d!==0?f=D(e,2+c):f=new Uint8Array(0);let p=new Uint8Array(19+f.byteLength),b=new DataView(p.buffer);b.setUint32(0,1332770163,!1),b.setUint32(4,1214603620,!1),b.setUint8(8,1),b.setUint8(9,c),b.setUint16(10,u,!0),b.setUint32(12,l,!0),b.setInt16(16,m,!0),b.setUint8(18,d),p.set(f,19),o.info.codecDescription=p,o.info.numberOfChannels=c}break;case"dfLa":{let o=this.currentTrack;if(!o)break;g(o.info?.type==="audio"),e.skip(4);let c=127,u=128,l=e.filePos;for(;e.filePos<s;){let b=N(e),h=_t(e);if((b&c)===0){e.skip(10);let k=M(e),T=k>>>12,w=(k>>9&7)+1;o.info.sampleRate=T,o.info.numberOfChannels=w,e.skip(20)}else e.skip(h);if(b&u)break}let m=e.filePos;e.filePos=l;let d=D(e,m-l),f=new Uint8Array(4+d.byteLength);new DataView(f.buffer).setUint32(0,1716281667,!1),f.set(d,4),o.info.codecDescription=f}break;case"dac3":{let o=this.currentTrack;if(!o)break;g(o.info?.type==="audio");let c=D(e,3),u=new q(c),l=u.readBits(2);u.skipBits(8);let m=u.readBits(3),d=u.readBits(1);l<3&&(o.info.sampleRate=bi[l]),o.info.numberOfChannels=Wn[m]+d}break;case"dec3":{let o=this.currentTrack;if(!o)break;g(o.info?.type==="audio");let c=D(e,n.contentSize),u=jl(c);if(!u){U._warn("Invalid dec3 box contents, ignoring.");break}let l=ls(u);l!==null&&(o.info.sampleRate=l),o.info.numberOfChannels=ds(u)}break;case"ddts":{let o=this.currentTrack;if(!o)break;g(o.info?.type==="audio");let c=D(e,Math.min(n.contentSize,fs)),u=Yl(c);if(!u){U._warn("Invalid ddts box contents, ignoring.");break}o.info.sampleRate=u.sampleRate,u.numberOfChannels!==null&&(o.info.numberOfChannels=u.numberOfChannels)}break;case"stts":{let o=this.currentTrack;if(!o||!o.sampleTable)break;e.skip(4);let c=M(e),u=0,l=0;for(let m=0;m<c;m++){let d=M(e),f=M(e);o.sampleTable.sampleTimingEntries.push({startIndex:u,startDecodeTimestamp:l,count:d,delta:f}),u+=d,l+=d*f}}break;case"ctts":{let o=this.currentTrack;if(!o||!o.sampleTable)break;e.skip(4);let c=M(e),u=0;for(let l=0;l<c;l++){let m=M(e),d=yr(e);o.sampleTable.sampleCompositionTimeOffsets.push({startIndex:u,count:m,offset:d}),u+=m}}break;case"stsz":{let o=this.currentTrack;if(!o||!o.sampleTable)break;e.skip(4);let c=M(e),u=M(e);if(c===0)for(let l=0;l<u;l++){let m=M(e);o.sampleTable.sampleSizes.push(m)}else o.sampleTable.sampleSizes.push(c)}break;case"stz2":{let o=this.currentTrack;if(!o||!o.sampleTable)break;e.skip(4),e.skip(3);let c=N(e),u=M(e),l=D(e,Math.ceil(u*c/8)),m=new q(l);for(let d=0;d<u;d++){let f=m.readBits(c);o.sampleTable.sampleSizes.push(f)}}break;case"stss":{let o=this.currentTrack;if(!o||!o.sampleTable)break;e.skip(4),o.sampleTable.keySampleIndices=[];let c=M(e);for(let u=0;u<c;u++){let l=M(e)-1;o.sampleTable.keySampleIndices.push(l)}o.sampleTable.keySampleIndices[0]!==0&&o.sampleTable.keySampleIndices.unshift(0)}break;case"stsc":{let o=this.currentTrack;if(!o||!o.sampleTable)break;e.skip(4);let c=M(e);for(let l=0;l<c;l++){let m=M(e)-1,d=M(e),f=M(e);o.sampleTable.sampleToChunk.push({startSampleIndex:-1,startChunkIndex:m,samplesPerChunk:d,sampleDescriptionIndex:f})}let u=0;for(let l=0;l<o.sampleTable.sampleToChunk.length;l++)if(o.sampleTable.sampleToChunk[l].startSampleIndex=u,l<o.sampleTable.sampleToChunk.length-1){let d=o.sampleTable.sampleToChunk[l+1].startChunkIndex-o.sampleTable.sampleToChunk[l].startChunkIndex;u+=d*o.sampleTable.sampleToChunk[l].samplesPerChunk}}break;case"stco":{let o=this.currentTrack;if(!o||!o.sampleTable)break;e.skip(4);let c=M(e);for(let u=0;u<c;u++){let l=M(e);o.sampleTable.chunkOffsets.push(l)}}break;case"co64":{let o=this.currentTrack;if(!o||!o.sampleTable)break;e.skip(4);let c=M(e);for(let u=0;u<c;u++){let l=Ne(e);o.sampleTable.chunkOffsets.push(l)}}break;case"mvex":this.isFragmented=!0,this.readContiguousBoxes(e.slice(a,n.contentSize));break;case"mehd":{let o=N(e);e.skip(3);let c=o===1?Ne(e):M(e);this.movieDurationInTimescale=c}break;case"trex":{e.skip(4);let o=M(e),c=M(e),u=M(e),l=M(e),m=M(e);this.fragmentTrackDefaults.push({trackId:o,defaultSampleDescriptionIndex:c,defaultSampleDuration:u,defaultSampleSize:l,defaultSampleFlags:m})}break;case"tfra":{let o=N(e);e.skip(3);let c=M(e),u=this.tracks.find(T=>T.id===c);if(!u)break;let l=M(e),m=(l&48)>>4,d=(l&12)>>2,f=l&3,p=[N,be,_t,M],b=p[m],h=p[d],y=p[f],k=M(e);for(let T=0;T<k;T++){let w=o===1?Ne(e):M(e),x=o===1?Ne(e):M(e);b(e),h(e),y(e),u.fragmentLookupTable.push({timestamp:w,moofOffset:x})}u.fragmentLookupTable.sort((T,w)=>T.timestamp-w.timestamp);for(let T=0;T<u.fragmentLookupTable.length-1;T++){let w=u.fragmentLookupTable[T],x=u.fragmentLookupTable[T+1];w.timestamp===x.timestamp&&(u.fragmentLookupTable.splice(T+1,1),T--)}}break;case"moof":this.currentFragment={moofOffset:r,moofSize:n.totalSize,implicitBaseDataOffset:r,trackData:new Map,psshBoxes:[]},this.readContiguousBoxes(e.slice(a,n.contentSize)),this.lastReadFragment=this.currentFragment,this.currentFragment=null;break;case"traf":if(g(this.currentFragment),this.readContiguousBoxes(e.slice(a,n.contentSize)),this.currentTrack){let o=this.currentFragment.trackData.get(this.currentTrack.id);e:if(o){if(o.samples.length===0){this.currentFragment.trackData.delete(this.currentTrack.id);break e}o.presentationTimestamps=o.samples.map((m,d)=>({presentationTimestamp:m.presentationTimestamp,sampleIndex:d})).sort((m,d)=>m.presentationTimestamp-d.presentationTimestamp);for(let m=0;m<o.presentationTimestamps.length;m++){let d=o.presentationTimestamps[m],f=o.samples[d.sampleIndex];if(o.firstKeyFrameTimestamp===null&&f.isKeyFrame&&(o.firstKeyFrameTimestamp=f.presentationTimestamp),m<o.presentationTimestamps.length-1){let b=o.presentationTimestamps[m+1].presentationTimestamp-d.presentationTimestamp;f.duration=b}}let c=o.samples[o.presentationTimestamps[0].sampleIndex],u=o.samples[ee(o.presentationTimestamps).sampleIndex];o.startTimestamp=c.presentationTimestamp,o.endTimestamp=u.presentationTimestamp+u.duration;let{currentFragmentState:l}=this.currentTrack;g(l),l.startTimestamp!==null&&(Lc(o,l.startTimestamp),o.startTimestampIsFinal=!0),l.encryptionAuxInfo&&!o.samples[0].encryption&&(o.encryptionAuxInfo=l.encryptionAuxInfo)}this.currentTrack.currentFragmentState=null,this.currentTrack=null}break;case"pssh":{if(this.input._formatOptions.isobmff?._suppressPsshParsing)break;let o=xs(D(e,n.contentSize));this.currentFragment?this.currentFragment.psshBoxes.push(o):this.currentTrack||this.psshBoxes.push(o)}break;case"tfhd":{g(this.currentFragment),e.skip(1);let o=_t(e),c=!!(o&1),u=!!(o&2),l=!!(o&8),m=!!(o&16),d=!!(o&32),f=!!(o&65536),p=!!(o&131072),b=M(e),h=this.tracks.find(k=>k.id===b);if(!h)break;let y=this.fragmentTrackDefaults.find(k=>k.trackId===b);this.currentTrack=h,h.currentFragmentState={baseDataOffset:this.currentFragment.implicitBaseDataOffset,sampleDescriptionIndex:y?.defaultSampleDescriptionIndex??null,defaultSampleDuration:y?.defaultSampleDuration??null,defaultSampleSize:y?.defaultSampleSize??null,defaultSampleFlags:y?.defaultSampleFlags??null,startTimestamp:null,encryptionAuxInfo:null},c?h.currentFragmentState.baseDataOffset=Ne(e):p&&(h.currentFragmentState.baseDataOffset=this.currentFragment.moofOffset),u&&(h.currentFragmentState.sampleDescriptionIndex=M(e)),l&&(h.currentFragmentState.defaultSampleDuration=M(e)),m&&(h.currentFragmentState.defaultSampleSize=M(e)),d&&(h.currentFragmentState.defaultSampleFlags=M(e)),f&&(h.currentFragmentState.defaultSampleDuration=0)}break;case"tfdt":{let o=this.currentTrack;if(!o)break;g(o.currentFragmentState);let c=N(e);e.skip(3);let u=c===0?M(e):Ne(e);o.currentFragmentState.startTimestamp=u}break;case"trun":{let o=this.currentTrack;if(!o)break;g(this.currentFragment),g(o.currentFragmentState);let c=N(e),u=_t(e),l=!!(u&1),m=!!(u&4),d=!!(u&256),f=!!(u&512),p=!!(u&1024),b=!!(u&2048),h=M(e),y=null;l&&(y=yr(e));let k=null;m&&(k=M(e));let T;this.currentFragment.trackData.has(o.id)?(T=this.currentFragment.trackData.get(o.id),y!==null&&(T.currentOffset=o.currentFragmentState.baseDataOffset+y)):(T={track:o,currentTimestamp:0,currentOffset:o.currentFragmentState.baseDataOffset+(y??0),startTimestamp:0,endTimestamp:0,firstKeyFrameTimestamp:null,samples:[],presentationTimestamps:[],startTimestampIsFinal:!1,encryptionAuxInfo:null},this.currentFragment.trackData.set(o.id,T));for(let w=0;w<h;w++){let x;d?x=M(e):(g(o.currentFragmentState.defaultSampleDuration!==null),x=o.currentFragmentState.defaultSampleDuration);let C;f?C=M(e):(g(o.currentFragmentState.defaultSampleSize!==null),C=o.currentFragmentState.defaultSampleSize);let P;p?P=M(e):(g(o.currentFragmentState.defaultSampleFlags!==null),P=o.currentFragmentState.defaultSampleFlags),w===0&&k!==null&&(P=k);let A=0;b&&(c===0?A=M(e):A=yr(e));let S=!(P&65536);T.samples.push({presentationTimestamp:T.currentTimestamp+A,duration:x,byteOffset:T.currentOffset,byteSize:C,isKeyFrame:S,encryption:null}),T.currentOffset+=C,T.currentTimestamp+=x}this.currentFragment.implicitBaseDataOffset=T.currentOffset}break;case"saiz":{let o=this.currentTrack;if(!o||!o.encryptionInfo)break;if(e.skip(1),_t(e)&1){let f=ue(e,4),p=M(e);if(f!==o.encryptionInfo.scheme||p!==0)break}let u=N(e),l=M(e),m=null;u===0&&l>0&&(m=D(e,l));let d=gd(o);d.defaultSampleInfoSize=u,d.sampleSizes=m,d.sampleCount=l}break;case"saio":{let o=this.currentTrack;if(!o||!o.encryptionInfo)break;let c=N(e);if(_t(e)&1){let f=ue(e,4),p=M(e);if(f!==o.encryptionInfo.scheme||p!==0)break}let l=M(e);if(l===0)break;l>1&&U._warn("Multiple saio entries are not supported; using the first offset only.");let m=c===0?M(e):Number(Ne(e));this.currentFragment&&(m+=this.currentFragment.moofOffset);let d=gd(o);d.offset=m}break;case"senc":{let o=this.currentTrack;if(!o||!o.encryptionInfo)break;g(this.currentFragment);let c=this.currentFragment.trackData.get(o.id);if(!c)break;e.skip(1);let l=!!(_t(e)&2),m=M(e),d=o.encryptionInfo.defaultPerSampleIvSize;g(d!==null);for(let f=0;f<Math.min(m,c.samples.length);f++){let p=new Uint8Array(16);d>0?p.set(D(e,d),0):p.set(o.encryptionInfo.defaultConstantIv,0);let b=null;if(l){let y=be(e);b=[];for(let k=0;k<y;k++){let T=be(e),w=M(e);b.push({clearLen:T,protectedLen:w})}}let h=c.samples[f];h.encryption={iv:p,subsamples:b}}}break;case"udta":{let o=this.iterateContiguousBoxes(e.slice(a,n.contentSize));for(let{boxInfo:c,slice:u}of o){if(c.name!=="meta"&&!this.currentTrack){let l=u.filePos;this.metadataTags.raw??={},c.name[0]==="\xA9"?this.metadataTags.raw[c.name]??=Et(u):this.metadataTags.raw[c.name]??=D(u,c.contentSize),u.filePos=l}switch(c.name){case"meta":u.skip(-c.headerSize),this.traverseBox(u);break;case"\xA9nam":case"name":this.currentTrack?this.currentTrack.name=we.decode(D(u,c.contentSize)):this.metadataTags.title??=Et(u);break;case"\xA9des":this.currentTrack||(this.metadataTags.description??=Et(u));break;case"\xA9ART":this.currentTrack||(this.metadataTags.artist??=Et(u));break;case"\xA9alb":this.currentTrack||(this.metadataTags.album??=Et(u));break;case"albr":this.currentTrack||(this.metadataTags.albumArtist??=Et(u));break;case"\xA9gen":this.currentTrack||(this.metadataTags.genre??=Et(u));break;case"\xA9day":if(!this.currentTrack){let l=new Date(Et(u));Number.isNaN(l.getTime())||(this.metadataTags.date??=l)}break;case"\xA9cmt":this.currentTrack||(this.metadataTags.comment??=Et(u));break;case"\xA9lyr":this.currentTrack||(this.metadataTags.lyrics??=Et(u));break}}}break;case"meta":{if(this.currentTrack)break;let c=M(e)!==0;this.currentMetadataKeys=new Map,c?this.readContiguousBoxes(e.slice(a,n.contentSize)):this.readContiguousBoxes(e.slice(a+4,n.contentSize-4)),this.currentMetadataKeys=null}break;case"keys":{if(!this.currentMetadataKeys)break;e.skip(4);let o=M(e);for(let c=0;c<o;c++){let u=M(e);e.skip(4);let l=we.decode(D(e,u-8));this.currentMetadataKeys.set(c+1,l)}}break;case"ilst":{if(!this.currentMetadataKeys)break;let o=this.iterateContiguousBoxes(e.slice(a,n.contentSize));for(let{boxInfo:c,slice:u}of o){let l=c.name,m=(l.charCodeAt(0)<<24)+(l.charCodeAt(1)<<16)+(l.charCodeAt(2)<<8)+l.charCodeAt(3);this.currentMetadataKeys.has(m)&&(l=this.currentMetadataKeys.get(m));let d=dd(u);switch(this.metadataTags.raw??={},this.metadataTags.raw[l]??=d,l){case"\xA9nam":case"titl":case"com.apple.quicktime.title":case"title":typeof d=="string"&&(this.metadataTags.title??=d);break;case"\xA9des":case"desc":case"dscp":case"com.apple.quicktime.description":case"description":typeof d=="string"&&(this.metadataTags.description??=d);break;case"\xA9ART":case"com.apple.quicktime.artist":case"artist":typeof d=="string"&&(this.metadataTags.artist??=d);break;case"\xA9alb":case"albm":case"com.apple.quicktime.album":case"album":typeof d=="string"&&(this.metadataTags.album??=d);break;case"aART":case"album_artist":typeof d=="string"&&(this.metadataTags.albumArtist??=d);break;case"\xA9cmt":case"com.apple.quicktime.comment":case"comment":typeof d=="string"&&(this.metadataTags.comment??=d);break;case"\xA9gen":case"gnre":case"com.apple.quicktime.genre":case"genre":typeof d=="string"&&(this.metadataTags.genre??=d);break;case"\xA9lyr":case"lyrics":typeof d=="string"&&(this.metadataTags.lyrics??=d);break;case"\xA9day":case"rldt":case"com.apple.quicktime.creationdate":case"date":if(typeof d=="string"){let f=new Date(d);Number.isNaN(f.getTime())||(this.metadataTags.date??=f)}break;case"covr":case"com.apple.quicktime.artwork":d instanceof lt?(this.metadataTags.images??=[],this.metadataTags.images.push({data:d.data,kind:"coverFront",mimeType:d.mimeType})):d instanceof Uint8Array&&(this.metadataTags.images??=[],this.metadataTags.images.push({data:d,kind:"coverFront",mimeType:"image/*"}));break;case"track":if(typeof d=="string"){let f=d.split("/"),p=Number.parseInt(f[0],10),b=f[1]&&Number.parseInt(f[1],10);Number.isInteger(p)&&p>0&&(this.metadataTags.trackNumber??=p),b&&Number.isInteger(b)&&b>0&&(this.metadataTags.tracksTotal??=b)}break;case"trkn":if(d instanceof Uint8Array&&d.length>=6){let f=L(d),p=f.getUint16(2,!1),b=f.getUint16(4,!1);p>0&&(this.metadataTags.trackNumber??=p),b>0&&(this.metadataTags.tracksTotal??=b)}break;case"disc":case"disk":if(d instanceof Uint8Array&&d.length>=6){let f=L(d),p=f.getUint16(2,!1),b=f.getUint16(4,!1);p>0&&(this.metadataTags.discNumber??=p),b>0&&(this.metadataTags.discsTotal??=b)}break}}}break}return e.filePos=s,!0}},vs=class{constructor(t){this.internalTrack=t;this.packetToSampleIndex=new WeakMap;this.packetToFragmentLocation=new WeakMap}getId(){return this.internalTrack.id}getNumber(){let t=this.internalTrack.demuxer,e=this.internalTrack.trackBacking.getType(),r=0;for(let n of t.tracks)if(n.trackBacking.getType()===e&&r++,n===this.internalTrack)break;return r}getCodec(){throw new Error("Not implemented on base class.")}getInternalCodecId(){return this.internalTrack.internalCodecId}getName(){return this.internalTrack.name}getLanguageCode(){return this.internalTrack.languageCode}getTimeResolution(){return this.internalTrack.timescale}isRelativeToUnixEpoch(){return!1}getUnixTimeForTimestamp(){return null}getDisposition(){return this.internalTrack.disposition}getPairingMask(){return 1n}getBitrate(){return null}getAverageBitrate(){return null}async getDurationFromMetadata(){let t=this.internalTrack;return t.durationInMediaTimescale<=0?null:(g(t.trackBacking),((await t.trackBacking.getFirstPacket({metadataOnly:!0}))?.timestamp??0)+t.durationInMediaTimescale/t.timescale)}async getLiveRefreshInterval(){return null}async getFirstPacket(t){let e=await this.fetchPacketForSampleIndex(0,t);return e||!this.internalTrack.demuxer.isFragmented?e:this.performFragmentedLookup(null,r=>r.trackData.get(this.internalTrack.id)?{sampleIndex:0,correctSampleFound:!0}:{sampleIndex:-1,correctSampleFound:!1},-1/0,1/0,t)}mapTimestampIntoTimescale(t){return lr(t*this.internalTrack.timescale)+this.internalTrack.editListOffset}async getPacket(t,e){let r=this.mapTimestampIntoTimescale(t),n=this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack),a=Wc(n,r),s=await this.fetchPacketForSampleIndex(a,e);return!hd(n)||!this.internalTrack.demuxer.isFragmented?s:this.performFragmentedLookup(null,o=>{let c=o.trackData.get(this.internalTrack.id);if(!c)return{sampleIndex:-1,correctSampleFound:!1};let u=Q(c.presentationTimestamps,r,d=>d.presentationTimestamp),l=u!==-1?c.presentationTimestamps[u].sampleIndex:-1,m=u!==-1&&r<c.endTimestamp;return{sampleIndex:l,correctSampleFound:m}},r,r,e)}async getNextPacket(t,e){let r=this.packetToSampleIndex.get(t);if(r!==void 0)return this.fetchPacketForSampleIndex(r+1,e);let n=this.packetToFragmentLocation.get(t);if(n===void 0)throw new Error("Packet was not created from this track.");return this.performFragmentedLookup(n.fragment,a=>{if(a===n.fragment){let s=a.trackData.get(this.internalTrack.id);if(n.sampleIndex+1<s.samples.length)return{sampleIndex:n.sampleIndex+1,correctSampleFound:!0}}else if(a.trackData.get(this.internalTrack.id))return{sampleIndex:0,correctSampleFound:!0};return{sampleIndex:-1,correctSampleFound:!1}},-1/0,1/0,e)}async getKeyPacket(t,e){let r=this.mapTimestampIntoTimescale(t),n=this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack),a=up(n,r),s=await this.fetchPacketForSampleIndex(a,e);return!hd(n)||!this.internalTrack.demuxer.isFragmented?s:this.performFragmentedLookup(null,o=>{let c=o.trackData.get(this.internalTrack.id);if(!c)return{sampleIndex:-1,correctSampleFound:!1};let u=Rr(c.presentationTimestamps,d=>c.samples[d.sampleIndex].isKeyFrame&&d.presentationTimestamp<=r),l=u!==-1?c.presentationTimestamps[u].sampleIndex:-1,m=u!==-1&&r<c.endTimestamp;return{sampleIndex:l,correctSampleFound:m}},r,r,e)}async getNextKeyPacket(t,e){let r=this.packetToSampleIndex.get(t);if(r!==void 0){let a=this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack),s=dp(a,r);return this.fetchPacketForSampleIndex(s,e)}let n=this.packetToFragmentLocation.get(t);if(n===void 0)throw new Error("Packet was not created from this track.");return this.performFragmentedLookup(n.fragment,a=>{if(a===n.fragment){let o=a.trackData.get(this.internalTrack.id).samples.findIndex((c,u)=>c.isKeyFrame&&u>n.sampleIndex);if(o!==-1)return{sampleIndex:o,correctSampleFound:!0}}else{let s=a.trackData.get(this.internalTrack.id);if(s&&s.firstKeyFrameTimestamp!==null){let o=s.samples.findIndex(c=>c.isKeyFrame);return g(o!==-1),{sampleIndex:o,correctSampleFound:!0}}}return{sampleIndex:-1,correctSampleFound:!1}},-1/0,1/0,e)}async fetchPacketForSampleIndex(t,e){if(t===-1)return null;let r=this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack),n=lp(r,t);if(!n)return null;let a;if(e.metadataOnly)a=Se;else{let u=this.internalTrack.demuxer.reader.requestSlice(n.sampleOffset,n.sampleSize);if(v(u)&&(u=await u),!u)return null;if(a=D(u,n.sampleSize),this.internalTrack.encryptionInfo){let l=null;if(this.internalTrack.encryptionAuxInfo){let m=await Td(this.internalTrack.demuxer.reader,this.internalTrack.encryptionInfo,this.internalTrack.encryptionAuxInfo);t<m.length&&(l=m[t])}l??=bd(this.internalTrack.encryptionInfo),l&&(a=await yd(this.internalTrack,l,a,null))}}let s=(n.presentationTimestamp-this.internalTrack.editListOffset)/this.internalTrack.timescale,o=n.duration/this.internalTrack.timescale,c=new j(a,n.isKeyFrame?"key":"delta",s,o,t,n.sampleSize);return this.packetToSampleIndex.set(c,t),c}async fetchPacketInFragment(t,e,r){if(e===-1)return null;let a=t.trackData.get(this.internalTrack.id).samples[e];g(a);let s;if(r.metadataOnly)s=Se;else{let l=this.internalTrack.demuxer.reader.requestSlice(a.byteOffset,a.byteSize);if(v(l)&&(l=await l),!l)return null;if(s=D(l,a.byteSize),this.internalTrack.encryptionInfo){let m=a.encryption??bd(this.internalTrack.encryptionInfo);m&&(s=await yd(this.internalTrack,m,s,t))}}let o=(a.presentationTimestamp-this.internalTrack.editListOffset)/this.internalTrack.timescale,c=a.duration/this.internalTrack.timescale,u=new j(s,a.isKeyFrame?"key":"delta",o,c,t.moofOffset+e,a.byteSize);return this.packetToFragmentLocation.set(u,{fragment:t,sampleIndex:e}),u}async performFragmentedLookup(t,e,r,n,a){let s=this.internalTrack.demuxer,o=null,c=null,u=-1;if(t){let{sampleIndex:h,correctSampleFound:y}=e(t);if(y)return this.fetchPacketInFragment(t,h,a);h!==-1&&(c=t,u=h)}let l=Q(this.internalTrack.fragmentLookupTable,r,h=>h.timestamp),m=l!==-1?this.internalTrack.fragmentLookupTable[l]:null,d=Q(this.internalTrack.fragmentPositionCache,r,h=>h.startTimestamp),f=d!==-1?this.internalTrack.fragmentPositionCache[d]:null,p=Math.max(m?.moofOffset??0,f?.moofOffset??0)||null,b;for(t?p===null||t.moofOffset>=p?(b=t.moofOffset+t.moofSize,o=t):b=p:b=p??0;;){if(o){let T=o.trackData.get(this.internalTrack.id);if(T&&T.startTimestamp>n)break}let h=s.reader.requestSliceRange(b,It,gr);if(v(h)&&(h=await h),!h)break;let y=b,k=br(h);if(!k)break;if(k.name==="moof"){o=await s.readFragment(y);let{sampleIndex:T,correctSampleFound:w}=e(o);if(w)return this.fetchPacketInFragment(o,T,a);T!==-1&&(c=o,u=T)}b=y+k.totalSize}if(m&&(!c||c.moofOffset<m.moofOffset)){let h=this.internalTrack.fragmentLookupTable[l-1];g(!h||h.timestamp<m.timestamp);let y=h?.timestamp??-1/0;return this.performFragmentedLookup(null,e,y,n,a)}return c?this.fetchPacketInFragment(c,u,a):null}},_s=class extends vs{constructor(e){super(e);this.decoderConfigPromise=null;this.internalTrack=e}getType(){return"video"}getCodec(){return this.internalTrack.info.codec}getCodedWidth(){return this.internalTrack.info.width}getCodedHeight(){return this.internalTrack.info.height}getSquarePixelWidth(){return this.internalTrack.info.squarePixelWidth}getSquarePixelHeight(){return this.internalTrack.info.squarePixelHeight}getRotation(){return this.internalTrack.rotation}async getColorSpace(){let e=await this.getDecoderConfig();return e?{primaries:e.colorSpace?.primaries,transfer:e.colorSpace?.transfer,matrix:e.colorSpace?.matrix,fullRange:e.colorSpace?.fullRange}:this.internalTrack.info.colorSpace}async canBeTransparent(){return this.internalTrack.info.codec==="prores"&&(this.internalTrack.info.proresFormat==="ap4h"||this.internalTrack.info.proresFormat==="ap4x")}async getDecoderConfig(){return this.internalTrack.info.codec?this.decoderConfigPromise??=(async()=>{if(this.internalTrack.info.codec==="avc"&&!this.internalTrack.info.codecDescription){let r=await this.getFirstPacket({});this.internalTrack.info.avcCodecInfo=r&&Br(r.data)}else if(this.internalTrack.info.codec==="hevc"&&!this.internalTrack.info.codecDescription){let r=await this.getFirstPacket({});this.internalTrack.info.hevcCodecInfo=r&&Dr(r.data)}else if(this.internalTrack.info.codec==="vp9"&&(!this.internalTrack.info.vp9CodecInfo||!Wl(this.internalTrack.info.vp9CodecInfo))){let r=await this.getFirstPacket({}),n=r&&as(r.data);n&&(this.internalTrack.info.vp9CodecInfo={...this.internalTrack.info.vp9CodecInfo??n,videoFullRangeFlag:n.videoFullRangeFlag,colourPrimaries:n.colourPrimaries,transferCharacteristics:n.transferCharacteristics,matrixCoefficients:n.matrixCoefficients})}else if(this.internalTrack.info.codec==="av1"&&(!this.internalTrack.info.av1CodecInfo||!ql(this.internalTrack.info.av1CodecInfo))){let r=await this.getFirstPacket({}),n=r&&zn(r.data);n&&(this.internalTrack.info.av1CodecInfo=n)}else if(this.internalTrack.info.codec==="prores"&&!this.internalTrack.info.proresCodecInfo){let r=await this.getFirstPacket({});this.internalTrack.info.proresCodecInfo=r&&ss(r.data)}if(!Ui(this.internalTrack.info.colorSpace)){let r=bs(this.internalTrack.info);this.internalTrack.info.colorSpace.primaries??=r.primaries,this.internalTrack.info.colorSpace.transfer??=r.transfer,this.internalTrack.info.colorSpace.matrix??=r.matrix,this.internalTrack.info.colorSpace.fullRange??=r.fullRange}let e={codec:Ki(this.internalTrack.info),codedWidth:this.internalTrack.info.width,codedHeight:this.internalTrack.info.height,description:this.internalTrack.info.codecDescription??void 0,colorSpace:this.internalTrack.info.colorSpace};return(this.internalTrack.info.width!==this.internalTrack.info.squarePixelWidth||this.internalTrack.info.height!==this.internalTrack.info.squarePixelHeight)&&(e.displayAspectWidth=this.internalTrack.info.squarePixelWidth,e.displayAspectHeight=this.internalTrack.info.squarePixelHeight),e})():null}},Rs=class extends vs{constructor(e){super(e);this.decoderConfigPromise=null;this.internalTrack=e}getType(){return"audio"}getCodec(){return this.internalTrack.info.codec}getNumberOfChannels(){return this.internalTrack.info.numberOfChannels}getSampleRate(){return this.internalTrack.info.sampleRate}async getDecoderConfig(){return this.internalTrack.info.codec?this.decoderConfigPromise??=(async()=>{if(this.internalTrack.info.codec==="dts"&&!this.internalTrack.info.dtsFormat){let e=await this.getFirstPacket({});this.internalTrack.info.dtsFormat=e&&ps(e.data)}return{codec:Qi(this.internalTrack.info),numberOfChannels:this.internalTrack.info.numberOfChannels,sampleRate:this.internalTrack.info.sampleRate,description:this.internalTrack.info.codecDescription??void 0}})():null}},Wc=(i,t)=>{if(i.presentationTimestamps){let e=Q(i.presentationTimestamps,t,r=>r.presentationTimestamp);return e===-1?-1:i.presentationTimestamps[e].sampleIndex}else{let e=Q(i.sampleTimingEntries,t,n=>n.startDecodeTimestamp);if(e===-1)return-1;let r=i.sampleTimingEntries[e];return r.startIndex+Math.min(Math.floor((t-r.startDecodeTimestamp)/r.delta),r.count-1)}},up=(i,t)=>{if(!i.keySampleIndices)return Wc(i,t);if(i.presentationTimestamps){let e=Q(i.presentationTimestamps,t,r=>r.presentationTimestamp);if(e===-1)return-1;for(let r=e;r>=0;r--){let n=i.presentationTimestamps[r].sampleIndex;if(ur(i.keySampleIndices,n,s=>s)!==-1)return n}return-1}else{let e=Wc(i,t),r=Q(i.keySampleIndices,e,n=>n);return i.keySampleIndices[r]??-1}},lp=(i,t)=>{let e=Q(i.sampleTimingEntries,t,y=>y.startIndex),r=i.sampleTimingEntries[e];if(!r||r.startIndex+r.count<=t)return null;let a=r.startDecodeTimestamp+(t-r.startIndex)*r.delta,s=Q(i.sampleCompositionTimeOffsets,t,y=>y.startIndex),o=i.sampleCompositionTimeOffsets[s];o&&t-o.startIndex<o.count&&(a+=o.offset);let c=i.sampleSizes[Math.min(t,i.sampleSizes.length-1)],u=Q(i.sampleToChunk,t,y=>y.startSampleIndex),l=i.sampleToChunk[u];g(l);let m=l.startChunkIndex+Math.floor((t-l.startSampleIndex)/l.samplesPerChunk),d=i.chunkOffsets[m],f=l.startSampleIndex+(m-l.startChunkIndex)*l.samplesPerChunk,p=0,b=d;if(i.sampleSizes.length===1)b+=c*(t-f),p+=c*l.samplesPerChunk;else for(let y=f;y<f+l.samplesPerChunk;y++){let k=i.sampleSizes[y];y<t&&(b+=k),p+=k}let h=r.delta;if(i.presentationTimestamps){let y=i.presentationTimestampIndexMap[t];g(y!==void 0),y<i.presentationTimestamps.length-1&&(h=i.presentationTimestamps[y+1].presentationTimestamp-a)}return{presentationTimestamp:a,duration:h,sampleOffset:b,sampleSize:c,chunkOffset:d,chunkSize:p,isKeyFrame:i.keySampleIndices?ur(i.keySampleIndices,t,y=>y)!==-1:!0}},dp=(i,t)=>{if(!i.keySampleIndices)return t+1;let e=Q(i.keySampleIndices,t,r=>r);return i.keySampleIndices[e+1]??-1},Lc=(i,t)=>{i.startTimestamp+=t,i.endTimestamp+=t;for(let e of i.samples)e.presentationTimestamp+=t;for(let e of i.presentationTimestamps)e.presentationTimestamp+=t},mp=i=>{let[t,e]=i,r=Math.atan2(e,t);return Number.isFinite(r)?r*(180/Math.PI):0},hd=i=>i.sampleSizes.length===0,gd=i=>i.currentFragmentState?i.currentFragmentState.encryptionAuxInfo??={defaultSampleInfoSize:0,sampleSizes:null,sampleCount:0,offset:null,resolved:null}:i.encryptionAuxInfo??={defaultSampleInfoSize:0,sampleSizes:null,sampleCount:0,offset:null,resolved:null},Td=async(i,t,e)=>{if(e.resolved)return e.resolved;if(e.offset===null||e.sampleCount===0)throw new Error("Incomplete saiz/saio info; cannot resolve encryption data.");let r=0;if(e.defaultSampleInfoSize>0)r=e.defaultSampleInfoSize*e.sampleCount;else{g(e.sampleSizes);for(let o=0;o<e.sampleCount;o++)r+=e.sampleSizes[o]}let n=i.requestSlice(e.offset,r);if(v(n)&&(n=await n),!n)throw new Error("Failed to read auxiliary encryption info.");let a=t.defaultPerSampleIvSize;g(a!==null);let s=[];for(let o=0;o<e.sampleCount;o++){let c=e.defaultSampleInfoSize>0?e.defaultSampleInfoSize:e.sampleSizes[o],u=new Uint8Array(16);a>0?u.set(D(n,a),0):u.set(t.defaultConstantIv,0);let l=null;if(c>a){let m=be(n);l=[];for(let d=0;d<m;d++){let f=be(n),p=M(n);l.push({clearLen:f,protectedLen:p})}}s.push({iv:u,subsamples:l})}return e.resolved=s,s},bd=i=>i.defaultConstantIv?{iv:i.defaultConstantIv,subsamples:null}:null,yd=async(i,t,e,r)=>{g(i.encryptionInfo);let n=i.encryptionInfo;g(n.defaultKid!==null);let a=n.defaultKid,s,o=i.demuxer.decryptionKeyCache.get(a);if(o)s=await o;else{if(!i.demuxer.input._formatOptions.isobmff?.resolveKeyId)throw new Error("Encrypted media samples encountered. To decrypt them, please provide a callback for InputOptions.formatOptions.isobmff.resolveKeyId.");let c=(async()=>{let u=i.demuxer.psshBoxes;if(r){u=[...u,...r.psshBoxes].filter(m=>m.keyIds===null||m.keyIds.includes(a));for(let m=0;m<u.length-1;m++)for(let d=m+1;d<u.length;d++)Cs(u[m],u[d])&&(u.splice(d,1),d--)}let l=await i.demuxer.input._formatOptions.isobmff.resolveKeyId({keyId:a,psshBoxes:u});if(!(typeof l=="string"&&l.length===32&&hl.test(l)||l instanceof Uint8Array&&l.byteLength===16))throw new TypeError("resolveKeyId must return a 32-character hex string or a 16-byte Uint8Array containing the decryption key.");return l instanceof Uint8Array?l:gl(l)})();i.demuxer.decryptionKeyCache.set(a,c),s=await c}return n.scheme==="cenc"||n.scheme==="cens"?fp(s,n,t,e):pp(s,n,t,e)},fp=async(i,t,e,r)=>{let n=new Uint8Array(16);n.set(e.iv,0);let a=await crypto.subtle.importKey("raw",i,{name:"AES-CTR"},!1,["decrypt"]),s=async p=>{let b=await crypto.subtle.decrypt({name:"AES-CTR",counter:n,length:64},a,p);return new Uint8Array(b)};if(!e.subsamples)return s(r);g(t.defaultCryptByteBlock!==null&&t.defaultSkipByteBlock!==null);let o=wd(e.subsamples,t.defaultCryptByteBlock,t.defaultSkipByteBlock),c=0;for(let p of o)for(let b of p.perSubsample)c+=b.length;let u=new Uint8Array(c),l=0;for(let p of o)for(let b of p.perSubsample)u.set(r.subarray(b.offset,b.offset+b.length),l),l+=b.length;let m=await s(u),d=new Uint8Array(r),f=0;for(let p of o)for(let b of p.perSubsample)d.set(m.subarray(f,f+b.length),b.offset),f+=b.length;return d},pp=(i,t,e,r)=>{let n=new Xn;n.init({key:i,iv:e.iv});let a=t.defaultCryptByteBlock,s=t.defaultSkipByteBlock;if(g(a!==null&&s!==null),!e.subsamples){let l=new Uint8Array(r),m=Math.floor(r.length/16);for(let d=0;d<m;d++){let f=d*16;n.in.set(r.subarray(f,f+16)),n.decrypt(),l.set(n.out,f)}return l}if(a===0&&s===0)throw new Error("cbcs with subsamples requires pattern encryption.");let o=new Uint8Array(r),c=wd(e.subsamples,a,s),u=new DataView(e.iv.buffer,e.iv.byteOffset,16);for(let l of c){n.iv[0]=u.getUint32(0,!1),n.iv[1]=u.getUint32(4,!1),n.iv[2]=u.getUint32(8,!1),n.iv[3]=u.getUint32(12,!1);for(let m of l.perSubsample){let d=m.length/16;for(let f=0;f<d;f++){let p=m.offset+f*16;n.in.set(r.subarray(p,p+16)),n.decrypt(),o.set(n.out,p)}}}return o},wd=(i,t,e)=>{let r=[],n=t!==0||e!==0,a=0;for(let s of i){a+=s.clearLen;let o=[];if(!n)s.protectedLen>0&&o.push({offset:a,length:s.protectedLen}),a+=s.protectedLen;else{let c=s.protectedLen,u=a;for(;c>0&&!(c<16*t);){let l=16*t;o.push({offset:u,length:l}),u+=l,c-=l;let m=Math.min(16*e,c);u+=m,c-=m}a+=s.protectedLen}r.push({perSubsample:o})}return r};var Zi=class{constructor(t){this.value=t}},Ji=class{constructor(t){this.value=t}},Yn=class{constructor(t){this.value=t}},Rt=class{constructor(t){this.value=t}};var hp=[440786851,408125543],en=[290298740,357149030,524531317,374648427,475249515,423732329,272869232,307544935],Zn=[...hp,...en],Ad=i=>i<256?1:i<65536?2:i<1<<24?3:i<2**32?4:i<2**40?5:6,xd=i=>i<1n<<8n?1:i<1n<<16n?2:i<1n<<24n?3:i<1n<<32n?4:i<1n<<40n?5:i<1n<<48n?6:i<1n<<56n?7:8,Cd=i=>i>=-64&&i<64?1:i>=-8192&&i<8192?2:i>=-(1<<20)&&i<1<<20?3:i>=-(1<<27)&&i<1<<27?4:i>=-(2**34)&&i<2**34?5:6,gp=i=>{if(i<127)return 1;if(i<16383)return 2;if(i<(1<<21)-1)return 3;if(i<(1<<28)-1)return 4;if(i<2**35-1)return 5;if(i<2**42-1)return 6;throw new Error("EBML varint size not supported "+i)},Ms=class{constructor(t){this.writer=t;this.helper=new Uint8Array(8);this.helperView=new DataView(this.helper.buffer);this.offsets=new WeakMap;this.dataOffsets=new WeakMap}writeByte(t){this.helperView.setUint8(0,t),this.writer.write(this.helper.subarray(0,1))}writeFloat32(t){this.helperView.setFloat32(0,t,!1),this.writer.write(this.helper.subarray(0,4))}writeFloat64(t){this.helperView.setFloat64(0,t,!1),this.writer.write(this.helper)}writeUnsignedInt(t,e=Ad(t)){let r=0;switch(e){case 6:this.helperView.setUint8(r++,t/2**40|0);case 5:this.helperView.setUint8(r++,t/2**32|0);case 4:this.helperView.setUint8(r++,t>>24);case 3:this.helperView.setUint8(r++,t>>16);case 2:this.helperView.setUint8(r++,t>>8);case 1:this.helperView.setUint8(r++,t);break;default:throw new Error("Bad unsigned int size "+e)}this.writer.write(this.helper.subarray(0,r))}writeUnsignedBigInt(t,e=xd(t)){let r=0;for(let n=e-1;n>=0;n--)this.helperView.setUint8(r++,Number(t>>BigInt(n*8)&0xffn));this.writer.write(this.helper.subarray(0,r))}writeSignedInt(t,e=Cd(t)){t<0&&(t+=2**(e*8)),this.writeUnsignedInt(t,e)}writeVarInt(t,e=gp(t)){let r=0;switch(e){case 1:this.helperView.setUint8(r++,128|t);break;case 2:this.helperView.setUint8(r++,64|t>>8),this.helperView.setUint8(r++,t);break;case 3:this.helperView.setUint8(r++,32|t>>16),this.helperView.setUint8(r++,t>>8),this.helperView.setUint8(r++,t);break;case 4:this.helperView.setUint8(r++,16|t>>24),this.helperView.setUint8(r++,t>>16),this.helperView.setUint8(r++,t>>8),this.helperView.setUint8(r++,t);break;case 5:this.helperView.setUint8(r++,8|t/2**32&7),this.helperView.setUint8(r++,t>>24),this.helperView.setUint8(r++,t>>16),this.helperView.setUint8(r++,t>>8),this.helperView.setUint8(r++,t);break;case 6:this.helperView.setUint8(r++,4|t/2**40&3),this.helperView.setUint8(r++,t/2**32|0),this.helperView.setUint8(r++,t>>24),this.helperView.setUint8(r++,t>>16),this.helperView.setUint8(r++,t>>8),this.helperView.setUint8(r++,t);break;default:throw new Error("Bad EBML varint size "+e)}this.writer.write(this.helper.subarray(0,r))}writeAsciiString(t){this.writer.write(new Uint8Array(t.split("").map(e=>e.charCodeAt(0))))}writeEBML(t){if(t!==null)if(t instanceof Uint8Array)this.writer.write(t);else if(Array.isArray(t))for(let e of t)this.writeEBML(e);else if(this.offsets.set(t,this.writer.getPos()),this.writeUnsignedInt(t.id),Array.isArray(t.data)){let e=this.writer.getPos(),r=t.size===-1?1:t.size??4;t.size===-1?this.writeByte(255):this.writer.seek(this.writer.getPos()+r);let n=this.writer.getPos();if(this.dataOffsets.set(t,n),this.writeEBML(t.data),t.size!==-1){let a=this.writer.getPos()-n,s=this.writer.getPos();this.writer.seek(e),this.writeVarInt(a,r),this.writer.seek(s)}}else if(typeof t.data=="number"){let e=t.size??Ad(t.data);this.writeVarInt(e),this.writeUnsignedInt(t.data,e)}else if(typeof t.data=="bigint"){let e=t.size??xd(t.data);this.writeVarInt(e),this.writeUnsignedBigInt(t.data,e)}else if(typeof t.data=="string")this.writeVarInt(t.data.length),this.writeAsciiString(t.data);else if(t.data instanceof Uint8Array)this.writeVarInt(t.data.byteLength,t.size),this.writer.write(t.data);else if(t.data instanceof Zi)this.writeVarInt(4),this.writeFloat32(t.data.value);else if(t.data instanceof Ji)this.writeVarInt(8),this.writeFloat64(t.data.value);else if(t.data instanceof Yn){let e=t.size??Cd(t.data.value);this.writeVarInt(e),this.writeSignedInt(t.data.value,e)}else if(t.data instanceof Rt){let e=J.encode(t.data.value);this.writeVarInt(e.length),this.writer.write(e)}else ie(t.data)}},Hc=8,$e=2,Ft=2*Hc,qc=i=>{if(i.remainingLength<1)return null;let t=N(i);if(i.skip(-1),t===0)return null;let e=1,r=128;for(;(t&r)===0;)e++,r>>=1;return i.remainingLength<e?null:e},tn=i=>{if(i.remainingLength<1)return null;let t=N(i);if(t===0)return null;let e=1,r=128;for(;(t&r)===0;)e++,r>>=1;if(i.remainingLength<e-1)return null;let n=t&r-1;for(let a=1;a<e;a++)n*=256,n+=N(i);return n},X=(i,t)=>{if(t<1||t>8)throw new Error("Bad unsigned int size "+t);let e=0;for(let r=0;r<t;r++)e*=256,e+=N(i);return e},Pd=(i,t)=>{if(t<1)throw new Error("Bad unsigned int size "+t);let e=0n;for(let r=0;r<t;r++)e<<=8n,e+=BigInt(N(i));return e};var Bs=i=>{let t=qc(i);return t===null||i.remainingLength<t?null:X(i,t)},Kc=i=>{if(i.remainingLength<1)return null;if(N(i)===255)return;i.skip(-1);let e=tn(i);if(e===null)return null;if(e!==72057594037927940)return e},Mt=i=>{g(i.remainingLength>=$e);let t=Bs(i);if(t===null)return null;let e=Kc(i);return e===null?null:{id:t,size:e}},qr=(i,t)=>{let e=D(i,t),r=0;for(;r<t&&e[r]!==0;)r+=1;return String.fromCharCode(...e.subarray(0,r))},rn=(i,t)=>{let e=D(i,t),r=0;for(;r<t&&e[r]!==0;)r+=1;return we.decode(e.subarray(0,r))},Os=(i,t)=>{if(t===0)return 0;if(t!==4&&t!==8)throw new Error("Bad float size "+t);return t===4?Id(i):Fs(i)},Ds=async(i,t,e,r)=>{let n=new Set(e),a=t;for(;r===null||a<r;){let s=i.requestSliceRange(a,$e,Ft);if(v(s)&&(s=await s),!s)break;let o=Mt(s);if(!o)break;if(n.has(o.id))return{pos:a,found:!0};Tr(o.size),a=s.filePos+o.size}return{pos:r!==null&&r>a?r:a,found:!1}},Qc=async(i,t,e,r)=>{let a=new Set(e),s=t;for(;s<r;){let o=i.requestSliceRange(s,0,Math.min(65536,r-s));if(v(o)&&(o=await o),!o||o.length<Hc)break;for(let c=0;c<o.length-Hc;c++){o.filePos=s;let u=Bs(o);if(u!==null&&a.has(u))return s;s++}}return null},Oe={avc:"V_MPEG4/ISO/AVC",hevc:"V_MPEGH/ISO/HEVC",vp8:"V_VP8",vp9:"V_VP9",av1:"V_AV1",prores:"V_PRORES",aac:"A_AAC",mp3:"A_MPEG/L3",opus:"A_OPUS",vorbis:"A_VORBIS",flac:"A_FLAC",ac3:"A_AC3",eac3:"A_EAC3",dts:"A_DTS","pcm-u8":"A_PCM/INT/LIT","pcm-s16":"A_PCM/INT/LIT","pcm-s16be":"A_PCM/INT/BIG","pcm-s24":"A_PCM/INT/LIT","pcm-s24be":"A_PCM/INT/BIG","pcm-s32":"A_PCM/INT/LIT","pcm-s32be":"A_PCM/INT/BIG","pcm-f32":"A_PCM/FLOAT/IEEE","pcm-f64":"A_PCM/FLOAT/IEEE",webvtt:"S_TEXT/WEBVTT"};function Tr(i){if(i===void 0)throw new Error("Undefined element size is used in a place where it is not supported.")}var Vs=i=>{let e=(i.hasVideo?"video/":i.hasAudio?"audio/":"application/")+(i.isWebM?"webm":"x-matroska");if(i.codecStrings.length>0){let r=[...new Set(i.codecStrings.filter(Boolean))];e+=`; codecs="${r.join(", ")}"`}return e};var Gc=[{id:290298740,flag:"seekHeadSeen"},{id:357149030,flag:"infoSeen"},{id:374648427,flag:"tracksSeen"},{id:475249515,flag:"cuesSeen"}],vd=10*2**20,Us=class extends Ie{constructor(e){super(e);this.readMetadataPromise=null;this.segments=[];this.currentSegment=null;this.currentTrack=null;this.currentCluster=null;this.currentBlock=null;this.currentBlockAdditional=null;this.currentCueTime=null;this.currentDecodingInstruction=null;this.currentTagTargetIsMovie=!0;this.currentSimpleTagName=null;this.currentAttachedFile=null;this.isWebM=!1;this.reader=e._reader}async getTrackBackings(){return await this.readMetadata(),this.segments.flatMap(e=>e.tracks.map(r=>r.trackBacking))}async getMimeType(){await this.readMetadata();let e=await this.getTrackBackings(),r=await Promise.all(e.map(n=>n.getDecoderConfig().then(a=>a?.codec??null)));return Vs({isWebM:this.isWebM,hasVideo:this.segments.some(n=>n.tracks.some(a=>a.info?.type==="video")),hasAudio:this.segments.some(n=>n.tracks.some(a=>a.info?.type==="audio")),codecStrings:r.filter(Boolean)})}async getMetadataTags(){await this.readMetadata();for(let r of this.segments)r.metadataTagsCollected||(this.reader.fileSize!==null&&await this.loadSegmentMetadata(r),r.metadataTagsCollected=!0);let e={};for(let r of this.segments)e={...e,...r.metadataTags};return e}readMetadata(){return this.readMetadataPromise??=(async()=>{let e=0;for(;;){let r=this.reader.requestSliceRange(e,$e,Ft);if(v(r)&&(r=await r),!r)break;let n=Mt(r);if(!n)break;let a=n.id,s=n.size,o=r.filePos;if(a===440786851){Tr(s);let c=this.reader.requestSlice(o,s);if(v(c)&&(c=await c),!c)break;this.readContiguousElements(c)}else if(a===408125543){if(await this.readSegment(o,s),s===void 0||this.reader.fileSize===null)break}else if(a===524531317){if(this.reader.fileSize===null)break;s===void 0&&(s=(await Ds(this.reader,o,Zn,this.reader.fileSize)).pos-o);let c=ee(this.segments);c&&(c.elementEndPos=o+s)}Tr(s),e=o+s}})()}async readSegment(e,r){this.currentSegment={seekHeadSeen:!1,infoSeen:!1,tracksSeen:!1,cuesSeen:!1,tagsSeen:!1,attachmentsSeen:!1,timestampScale:-1,timestampFactor:-1,duration:-1,seekEntries:[],tracks:[],cuePoints:[],dataStartPos:e,elementEndPos:r===void 0?null:e+r,clusterSeekStartPos:e,lastReadCluster:null,metadataTags:{},metadataTagsCollected:!1},this.segments.push(this.currentSegment);let n=e;for(;this.currentSegment.elementEndPos===null||n<this.currentSegment.elementEndPos;){let c=this.reader.requestSliceRange(n,$e,Ft);if(v(c)&&(c=await c),!c)break;let u=n,l=Mt(c);if(!l||!en.includes(l.id)&&l.id!==236){let b=await Qc(this.reader,u,en,Math.min(this.currentSegment.elementEndPos??1/0,u+vd));if(b){n=b;continue}else break}let{id:m,size:d}=l,f=c.filePos,p=Gc.findIndex(b=>b.id===m);if(p!==-1){let b=Gc[p].flag;this.currentSegment[b]=!0,Tr(d);let h=this.reader.requestSlice(f,d);v(h)&&(h=await h),h&&this.readContiguousElements(h)}else if(m===307544935||m===423732329){m===307544935?this.currentSegment.tagsSeen=!0:this.currentSegment.attachmentsSeen=!0,Tr(d);let b=this.reader.requestSlice(f,d);v(b)&&(b=await b),b&&this.readContiguousElements(b)}else if(m===524531317){this.currentSegment.clusterSeekStartPos=u;break}if(d===void 0)break;n=f+d}if(this.currentSegment.seekEntries.sort((c,u)=>c.segmentPosition-u.segmentPosition),this.reader.fileSize!==null)for(let c of this.currentSegment.seekEntries){let u=Gc.find(b=>b.id===c.id);if(!u||this.currentSegment[u.flag])continue;let l=this.reader.requestSliceRange(e+c.segmentPosition,$e,Ft);if(v(l)&&(l=await l),!l)continue;let m=Mt(l);if(!m)continue;let{id:d,size:f}=m;if(d!==u.id)continue;Tr(f),this.currentSegment[u.flag]=!0;let p=this.reader.requestSlice(l.filePos,f);v(p)&&(p=await p),p&&this.readContiguousElements(p)}this.currentSegment.timestampScale===-1&&(this.currentSegment.timestampScale=1e6,this.currentSegment.timestampFactor=1e9/1e6);for(let c of this.currentSegment.tracks)c.defaultDurationNs!==null&&(c.defaultDuration=this.currentSegment.timestampFactor*c.defaultDurationNs/1e9);let a=new Map(this.currentSegment.tracks.map(c=>[c.id,c]));for(let c of this.currentSegment.cuePoints){let u=a.get(c.trackId);u&&u.cuePoints.push(c)}for(let c of this.currentSegment.tracks){c.cuePoints.sort((u,l)=>u.time-l.time);for(let u=0;u<c.cuePoints.length-1;u++){let l=c.cuePoints[u],m=c.cuePoints[u+1];l.time===m.time&&(c.cuePoints.splice(u+1,1),u--)}}let s=null,o=-1/0;for(let c of this.currentSegment.tracks)c.cuePoints.length>o&&(o=c.cuePoints.length,s=c);for(let c of this.currentSegment.tracks)c.cuePoints.length===0&&(c.cuePoints=s.cuePoints);this.currentSegment=null}async readCluster(e,r){if(r.lastReadCluster?.elementStartPos===e)return r.lastReadCluster;let n=this.reader.requestSliceRange(e,$e,Ft);v(n)&&(n=await n),g(n);let a=e,s=Mt(n);g(s);let o=s.id;g(o===524531317);let c=s.size,u=n.filePos;c===void 0&&(c=(await Ds(this.reader,u,Zn,r.elementEndPos)).pos-u);let l=this.reader.requestSlice(u,c);v(l)&&(l=await l);let m={segment:r,elementStartPos:a,elementEndPos:u+c,dataStartPos:u,timestamp:-1,trackData:new Map};if(this.currentCluster=m,l){let d=this.readContiguousElements(l,Zn);m.elementEndPos=d}for(let[,d]of m.trackData){let f=d.track;g(d.blocks.length>0);let p=!1;for(let k=0;k<d.blocks.length;k++){let T=d.blocks[k];T.timestamp+=m.timestamp,p||=T.lacing!==0}d.presentationTimestamps=d.blocks.map((k,T)=>({timestamp:k.timestamp,blockIndex:T})).sort((k,T)=>k.timestamp-T.timestamp);for(let k=0;k<d.presentationTimestamps.length;k++){let T=d.presentationTimestamps[k],w=d.blocks[T.blockIndex];if(d.firstKeyFrameTimestamp===null&&w.isKeyFrame&&(d.firstKeyFrameTimestamp=w.timestamp),k<d.presentationTimestamps.length-1){let x=d.presentationTimestamps[k+1];w.duration=x.timestamp-w.timestamp}else w.duration===0&&f.defaultDuration!=null&&w.lacing===0&&(w.duration=f.defaultDuration)}p&&(this.expandLacedBlocks(d.blocks,f),d.presentationTimestamps=d.blocks.map((k,T)=>({timestamp:k.timestamp,blockIndex:T})).sort((k,T)=>k.timestamp-T.timestamp));let b=d.blocks[d.presentationTimestamps[0].blockIndex],h=d.blocks[ee(d.presentationTimestamps).blockIndex];d.startTimestamp=b.timestamp,d.endTimestamp=h.timestamp+h.duration;let y=Q(f.clusterPositionCache,d.startTimestamp,k=>k.startTimestamp);(y===-1||f.clusterPositionCache[y].elementStartPos!==a)&&f.clusterPositionCache.splice(y+1,0,{elementStartPos:m.elementStartPos,startTimestamp:d.startTimestamp})}return r.lastReadCluster=m,m}getTrackDataInCluster(e,r){let n=e.trackData.get(r);if(!n){let a=e.segment.tracks.find(s=>s.id===r);if(!a)return null;n={track:a,startTimestamp:0,endTimestamp:0,firstKeyFrameTimestamp:null,blocks:[],presentationTimestamps:[]},e.trackData.set(r,n)}return n}expandLacedBlocks(e,r){for(let n=0;n<e.length;n++){let a=e[n];if(a.lacing===0)continue;a.decoded||(a.data=this.decodeBlockData(r,a.data),a.decoded=!0);let s=Ee.tempFromBytes(a.data),o=[],c=N(s)+1;switch(a.lacing){case 1:{let l=0;for(let m=0;m<c-1;m++){let d=0;for(;s.bufferPos<s.length;){let f=N(s);if(d+=f,f<255){o.push(d),l+=d;break}}}o.push(s.length-(s.bufferPos+l))}break;case 2:{let l=s.length-1,m=Math.floor(l/c);for(let d=0;d<c;d++)o.push(m)}break;case 3:{let l=tn(s);g(l!==null);let m=l;o.push(m);let d=m;for(let f=1;f<c-1;f++){let p=s.bufferPos,b=tn(s);g(b!==null);let h=b,k=(1<<(s.bufferPos-p)*7-1)-1,T=h-k;m+=T,o.push(m),d+=m}o.push(s.length-(s.bufferPos+d))}break;default:g(!1)}g(o.length===c),e.splice(n,1);let u=a.duration||c*(r.defaultDuration??0);for(let l=0;l<c;l++){let m=o[l],d=D(s,m),f=a.timestamp+u*l/c,p=u/c;e.splice(n+l,0,{timestamp:f,duration:p,isKeyFrame:a.isKeyFrame,data:d,lacing:0,decoded:!0,postProcessed:!1,mainAdditional:a.mainAdditional})}n+=c,n--}}async loadSegmentMetadata(e){for(let r of e.seekEntries){if(!(r.id===307544935&&!e.tagsSeen)){if(!(r.id===423732329&&!e.attachmentsSeen))continue}let n=this.reader.requestSliceRange(e.dataStartPos+r.segmentPosition,$e,Ft);if(v(n)&&(n=await n),!n)continue;let a=Mt(n);if(!a||a.id!==r.id)continue;let{size:s}=a;Tr(s),g(!this.currentSegment),this.currentSegment=e;let o=this.reader.requestSlice(n.filePos,s);v(o)&&(o=await o),o&&this.readContiguousElements(o),this.currentSegment=null,r.id===307544935?e.tagsSeen=!0:r.id===423732329&&(e.attachmentsSeen=!0)}}readContiguousElements(e,r){for(;e.remainingLength>=$e;){let n=e.filePos;if(!this.traverseElement(e,r))return n}return e.filePos}traverseElement(e,r){let n=Mt(e);if(!n||r&&r.includes(n.id))return!1;let{id:a,size:s}=n,o=e.filePos;switch(Tr(s),a){case 17026:this.isWebM=qr(e,s)==="webm";break;case 19899:{if(!this.currentSegment)break;let c={id:-1,segmentPosition:-1};this.currentSegment.seekEntries.push(c),this.readContiguousElements(e.slice(o,s)),(c.id===-1||c.segmentPosition===-1)&&this.currentSegment.seekEntries.pop()}break;case 21419:{let c=this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length-1];if(!c)break;c.id=X(e,s)}break;case 21420:{let c=this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length-1];if(!c)break;c.segmentPosition=X(e,s)}break;case 2807729:{if(!this.currentSegment)break;this.currentSegment.timestampScale=X(e,s),this.currentSegment.timestampFactor=1e9/this.currentSegment.timestampScale}break;case 17545:{if(!this.currentSegment)break;this.currentSegment.duration=Os(e,s)}break;case 174:{if(!this.currentSegment||(this.currentTrack={id:-1,segment:this.currentSegment,demuxer:this,clusterPositionCache:[],cuePoints:[],disposition:{..._e,primary:!1},trackBacking:null,codecId:null,codecPrivate:null,defaultDuration:null,defaultDurationNs:null,name:null,languageCode:"eng",hasLanguageBcp47:!1,decodingInstructions:[],info:null},this.readContiguousElements(e.slice(o,s)),!this.currentTrack))break;if(this.currentTrack.decodingInstructions.some(c=>c.data?.type!=="decompress"||c.scope!==1||c.data.algorithm!==3)&&(U._warn(`Track #${this.currentTrack.id} has an unsupported content encoding; dropping.`),this.currentTrack=null),this.currentTrack&&this.currentTrack.id!==-1&&this.currentTrack.codecId&&this.currentTrack.info){let c=this.currentTrack.codecId.indexOf("/"),u=c===-1?this.currentTrack.codecId:this.currentTrack.codecId.slice(0,c);if(this.currentTrack.info.type==="video"&&this.currentTrack.info.width!==-1&&this.currentTrack.info.height!==-1){if(this.currentTrack.info.squarePixelWidth=this.currentTrack.info.width,this.currentTrack.info.squarePixelHeight=this.currentTrack.info.height,this.currentTrack.info.displayWidth!==null&&this.currentTrack.info.displayHeight!==null){let m=this.currentTrack.info.displayWidth*this.currentTrack.info.height,d=this.currentTrack.info.displayHeight*this.currentTrack.info.width;m>0&&d>0&&(m>d?this.currentTrack.info.squarePixelWidth=Math.round(this.currentTrack.info.width*m/d):this.currentTrack.info.squarePixelHeight=Math.round(this.currentTrack.info.height*d/m))}if(this.currentTrack.codecId===Oe.avc)this.currentTrack.info.codec="avc",this.currentTrack.info.codecDescription=this.currentTrack.codecPrivate;else if(this.currentTrack.codecId===Oe.hevc)this.currentTrack.info.codec="hevc",this.currentTrack.info.codecDescription=this.currentTrack.codecPrivate;else if(u===Oe.vp8)this.currentTrack.info.codec="vp8";else if(u===Oe.vp9)this.currentTrack.info.codec="vp9";else if(u===Oe.av1)this.currentTrack.info.codec="av1";else if(u===Oe.prores){let m=this.currentTrack.codecPrivate?we.decode(this.currentTrack.codecPrivate):"";hr.includes(m)&&(this.currentTrack.info.codec="prores",this.currentTrack.info.proresFormat=m)}let l=this.currentTrack;this.currentTrack.trackBacking=new jc(l),this.currentSegment.tracks.push(this.currentTrack)}else if(this.currentTrack.info.type==="audio"){u===Oe.aac?(this.currentTrack.info.codec="aac",this.currentTrack.info.aacCodecInfo={isMpeg2:this.currentTrack.codecId.includes("MPEG2"),objectType:null},this.currentTrack.info.codecDescription=this.currentTrack.codecPrivate):this.currentTrack.codecId===Oe.mp3?this.currentTrack.info.codec="mp3":u===Oe.opus?(this.currentTrack.info.codec="opus",this.currentTrack.info.codecDescription=this.currentTrack.codecPrivate,this.currentTrack.info.sampleRate=Pt):u===Oe.vorbis?(this.currentTrack.info.codec="vorbis",this.currentTrack.info.codecDescription=this.currentTrack.codecPrivate):u===Oe.flac?(this.currentTrack.info.codec="flac",this.currentTrack.info.codecDescription=this.currentTrack.codecPrivate):u===Oe.ac3?(this.currentTrack.info.codec="ac3",this.currentTrack.info.codecDescription=this.currentTrack.codecPrivate):u===Oe.eac3?(this.currentTrack.info.codec="eac3",this.currentTrack.info.codecDescription=this.currentTrack.codecPrivate):u===Oe.dts?(this.currentTrack.info.codec="dts",this.currentTrack.codecId==="A_DTS/EXPRESS"?this.currentTrack.info.dtsFormat="dtse":this.currentTrack.codecId==="A_DTS/LOSSLESS"&&(this.currentTrack.info.dtsFormat="dtsl")):this.currentTrack.codecId==="A_PCM/INT/LIT"?this.currentTrack.info.bitDepth===8?this.currentTrack.info.codec="pcm-u8":this.currentTrack.info.bitDepth===16?this.currentTrack.info.codec="pcm-s16":this.currentTrack.info.bitDepth===24?this.currentTrack.info.codec="pcm-s24":this.currentTrack.info.bitDepth===32&&(this.currentTrack.info.codec="pcm-s32"):this.currentTrack.codecId==="A_PCM/INT/BIG"?this.currentTrack.info.bitDepth===8?this.currentTrack.info.codec="pcm-u8":this.currentTrack.info.bitDepth===16?this.currentTrack.info.codec="pcm-s16be":this.currentTrack.info.bitDepth===24?this.currentTrack.info.codec="pcm-s24be":this.currentTrack.info.bitDepth===32&&(this.currentTrack.info.codec="pcm-s32be"):this.currentTrack.codecId==="A_PCM/FLOAT/IEEE"&&(this.currentTrack.info.bitDepth===32?this.currentTrack.info.codec="pcm-f32":this.currentTrack.info.bitDepth===64&&(this.currentTrack.info.codec="pcm-f64"));let l=this.currentTrack;this.currentTrack.trackBacking=new Xc(l),this.currentSegment.tracks.push(this.currentTrack)}}this.currentTrack=null}break;case 215:{if(!this.currentTrack)break;this.currentTrack.id=X(e,s)}break;case 131:{if(!this.currentTrack)break;let c=X(e,s);c===1?this.currentTrack.info={type:"video",width:-1,height:-1,displayWidth:null,displayHeight:null,displayUnit:null,squarePixelWidth:-1,squarePixelHeight:-1,rotation:0,codec:null,codecDescription:null,colorSpace:{...qa},alphaMode:!1,proresFormat:null}:c===2&&(this.currentTrack.info={type:"audio",numberOfChannels:1,sampleRate:8e3,bitDepth:-1,codec:null,codecDescription:null,aacCodecInfo:null,dtsFormat:null})}break;case 185:{if(!this.currentTrack)break;X(e,s)||(this.currentTrack=null)}break;case 136:{if(!this.currentTrack)break;this.currentTrack.disposition.default=!!X(e,s)}break;case 21930:{if(!this.currentTrack)break;this.currentTrack.disposition.forced=!!X(e,s)}break;case 21934:{if(!this.currentTrack)break;this.currentTrack.disposition.original=!!X(e,s)}break;case 21931:{if(!this.currentTrack)break;this.currentTrack.disposition.hearingImpaired=!!X(e,s)}break;case 21932:{if(!this.currentTrack)break;this.currentTrack.disposition.visuallyImpaired=!!X(e,s)}break;case 21935:{if(!this.currentTrack)break;this.currentTrack.disposition.commentary=!!X(e,s)}break;case 134:{if(!this.currentTrack)break;this.currentTrack.codecId=qr(e,s)}break;case 25506:{if(!this.currentTrack)break;this.currentTrack.codecPrivate=D(e,s)}break;case 2352003:{if(!this.currentTrack)break;this.currentTrack.defaultDurationNs=X(e,s)}break;case 21358:{if(!this.currentTrack)break;this.currentTrack.name=rn(e,s)}break;case 2274716:{if(!this.currentTrack||this.currentTrack.hasLanguageBcp47)break;this.currentTrack.languageCode=qr(e,s),dr(this.currentTrack.languageCode)||(this.currentTrack.languageCode=ae)}break;case 2274717:{if(!this.currentTrack)break;let u=qr(e,s).split("-")[0];u?this.currentTrack.languageCode=u:this.currentTrack.languageCode=ae,this.currentTrack.hasLanguageBcp47=!0}break;case 224:{if(this.currentTrack?.info?.type!=="video")break;this.readContiguousElements(e.slice(o,s))}break;case 176:{if(this.currentTrack?.info?.type!=="video")break;this.currentTrack.info.width=X(e,s)}break;case 186:{if(this.currentTrack?.info?.type!=="video")break;this.currentTrack.info.height=X(e,s)}break;case 21680:{if(this.currentTrack?.info?.type!=="video")break;this.currentTrack.info.displayWidth=X(e,s)}break;case 21690:{if(this.currentTrack?.info?.type!=="video")break;this.currentTrack.info.displayHeight=X(e,s)}break;case 21682:{if(this.currentTrack?.info?.type!=="video")break;this.currentTrack.info.displayUnit=X(e,s)}break;case 21440:{if(this.currentTrack?.info?.type!=="video")break;this.currentTrack.info.alphaMode=X(e,s)===1}break;case 21936:{if(this.currentTrack?.info?.type!=="video")break;this.readContiguousElements(e.slice(o,s))}break;case 21937:{if(this.currentTrack?.info?.type!=="video")break;let c=X(e,s),u=ut[c];this.currentTrack.info.colorSpace.matrix=u}break;case 21945:{if(this.currentTrack?.info?.type!=="video")break;let c=X(e,s);this.currentTrack.info.colorSpace.fullRange=c===1||c===2?c===2:void 0}break;case 21946:{if(this.currentTrack?.info?.type!=="video")break;let c=X(e,s),u=ct[c];this.currentTrack.info.colorSpace.transfer=u}break;case 21947:{if(this.currentTrack?.info?.type!=="video")break;let c=X(e,s),u=ot[c];this.currentTrack.info.colorSpace.primaries=u}break;case 30320:{if(this.currentTrack?.info?.type!=="video")break;this.readContiguousElements(e.slice(o,s))}break;case 30325:{if(this.currentTrack?.info?.type!=="video")break;let u=-Os(e,s);try{this.currentTrack.info.rotation=kt(u)}catch{}}break;case 225:{if(this.currentTrack?.info?.type!=="audio")break;this.readContiguousElements(e.slice(o,s))}break;case 181:{if(this.currentTrack?.info?.type!=="audio")break;this.currentTrack.info.sampleRate=Os(e,s)}break;case 159:{if(this.currentTrack?.info?.type!=="audio")break;this.currentTrack.info.numberOfChannels=X(e,s)}break;case 25188:{if(this.currentTrack?.info?.type!=="audio")break;this.currentTrack.info.bitDepth=X(e,s)}break;case 187:{if(!this.currentSegment)break;this.readContiguousElements(e.slice(o,s)),this.currentCueTime=null}break;case 179:this.currentCueTime=X(e,s);break;case 183:{if(this.currentCueTime===null)break;g(this.currentSegment);let c={time:this.currentCueTime,trackId:-1,clusterPosition:-1};this.currentSegment.cuePoints.push(c),this.readContiguousElements(e.slice(o,s)),(c.trackId===-1||c.clusterPosition===-1)&&this.currentSegment.cuePoints.pop()}break;case 247:{let c=this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length-1];if(!c)break;c.trackId=X(e,s)}break;case 241:{let c=this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length-1];if(!c)break;g(this.currentSegment),c.clusterPosition=this.currentSegment.dataStartPos+X(e,s)}break;case 231:{if(!this.currentCluster)break;this.currentCluster.timestamp=X(e,s)}break;case 163:{if(!this.currentCluster)break;let c=tn(e);if(c===null)break;let u=this.getTrackDataInCluster(this.currentCluster,c);if(!u)break;let l=$n(e),m=N(e),d=m>>1&3,f=!!(m&128);u.track.info?.type==="audio"&&u.track.info.codec&&(f=!0);let p=D(e,s-(e.filePos-o)),b=u.track.decodingInstructions.length>0;u.blocks.push({timestamp:l,duration:0,isKeyFrame:f,data:p,lacing:d,decoded:!b,postProcessed:!1,mainAdditional:null})}break;case 160:{if(!this.currentCluster)break;this.readContiguousElements(e.slice(o,s)),this.currentBlock=null}break;case 161:{if(!this.currentCluster)break;let c=tn(e);if(c===null)break;let u=this.getTrackDataInCluster(this.currentCluster,c);if(!u)break;let l=$n(e),d=N(e)>>1&3,f=D(e,s-(e.filePos-o)),p=u.track.decodingInstructions.length>0;this.currentBlock={timestamp:l,duration:0,isKeyFrame:!0,data:f,lacing:d,decoded:!p,postProcessed:!1,mainAdditional:null},u.blocks.push(this.currentBlock)}break;case 30113:this.readContiguousElements(e.slice(o,s));break;case 166:{if(!this.currentBlock)break;this.currentBlockAdditional={addId:1,data:null},this.readContiguousElements(e.slice(o,s)),this.currentBlockAdditional.data&&this.currentBlockAdditional.addId===1&&(this.currentBlock.mainAdditional=this.currentBlockAdditional.data),this.currentBlockAdditional=null}break;case 165:{if(!this.currentBlockAdditional)break;this.currentBlockAdditional.data=D(e,s)}break;case 238:{if(!this.currentBlockAdditional)break;this.currentBlockAdditional.addId=X(e,s)}break;case 155:{if(!this.currentBlock)break;this.currentBlock.duration=X(e,s)}break;case 251:{if(!this.currentBlock)break;this.currentBlock.isKeyFrame=!1}break;case 29555:this.currentTagTargetIsMovie=!0,this.readContiguousElements(e.slice(o,s));break;case 25536:this.readContiguousElements(e.slice(o,s));break;case 26826:X(e,s)!==50&&(this.currentTagTargetIsMovie=!1);break;case 25541:case 25545:case 25540:case 25542:this.currentTagTargetIsMovie=!1;break;case 26568:{if(!this.currentTagTargetIsMovie)break;this.currentSimpleTagName=null,this.readContiguousElements(e.slice(o,s))}break;case 17827:this.currentSimpleTagName=rn(e,s);break;case 17543:{if(!this.currentSimpleTagName)break;let c=rn(e,s);this.processTagValue(this.currentSimpleTagName,c)}break;case 17541:{if(!this.currentSimpleTagName)break;let c=D(e,s);this.processTagValue(this.currentSimpleTagName,c)}break;case 24999:{if(!this.currentSegment)break;this.currentAttachedFile={fileUid:null,fileName:null,fileMediaType:null,fileData:null,fileDescription:null},this.readContiguousElements(e.slice(o,s));let c=this.currentSegment.metadataTags;if(this.currentAttachedFile.fileUid&&this.currentAttachedFile.fileData&&(c.raw??={},c.raw[this.currentAttachedFile.fileUid.toString()]=new mr(this.currentAttachedFile.fileData,this.currentAttachedFile.fileMediaType??void 0,this.currentAttachedFile.fileName??void 0,this.currentAttachedFile.fileDescription??void 0)),this.currentAttachedFile.fileMediaType?.startsWith("image/")&&this.currentAttachedFile.fileData){let u=this.currentAttachedFile.fileName,l="unknown";if(u){let m=u.toLowerCase();m.startsWith("cover.")?l="coverFront":m.startsWith("back.")&&(l="coverBack")}c.images??=[],c.images.push({data:this.currentAttachedFile.fileData,mimeType:this.currentAttachedFile.fileMediaType,kind:l,name:this.currentAttachedFile.fileName??void 0,description:this.currentAttachedFile.fileDescription??void 0})}this.currentAttachedFile=null}break;case 18094:{if(!this.currentAttachedFile)break;this.currentAttachedFile.fileUid=Pd(e,s)}break;case 18030:{if(!this.currentAttachedFile)break;this.currentAttachedFile.fileName=rn(e,s)}break;case 18016:{if(!this.currentAttachedFile)break;this.currentAttachedFile.fileMediaType=qr(e,s)}break;case 18012:{if(!this.currentAttachedFile)break;this.currentAttachedFile.fileData=D(e,s)}break;case 18046:{if(!this.currentAttachedFile)break;this.currentAttachedFile.fileDescription=rn(e,s)}break;case 28032:{if(!this.currentTrack)break;this.readContiguousElements(e.slice(o,s)),this.currentTrack.decodingInstructions.sort((c,u)=>u.order-c.order)}break;case 25152:this.currentDecodingInstruction={order:0,scope:1,data:null},this.readContiguousElements(e.slice(o,s)),this.currentDecodingInstruction.data&&this.currentTrack.decodingInstructions.push(this.currentDecodingInstruction),this.currentDecodingInstruction=null;break;case 20529:{if(!this.currentDecodingInstruction)break;this.currentDecodingInstruction.order=X(e,s)}break;case 20530:{if(!this.currentDecodingInstruction)break;this.currentDecodingInstruction.scope=X(e,s)}break;case 20532:{if(!this.currentDecodingInstruction)break;this.currentDecodingInstruction.data={type:"decompress",algorithm:0,settings:null},this.readContiguousElements(e.slice(o,s))}break;case 16980:{if(this.currentDecodingInstruction?.data?.type!=="decompress")break;this.currentDecodingInstruction.data.algorithm=X(e,s)}break;case 16981:{if(this.currentDecodingInstruction?.data?.type!=="decompress")break;this.currentDecodingInstruction.data.settings=D(e,s)}break;case 20533:{if(!this.currentDecodingInstruction)break;this.currentDecodingInstruction.data={type:"decrypt"}}break}return e.filePos=o+s,!0}decodeBlockData(e,r){g(e.decodingInstructions.length>0);let n=r;for(let a of e.decodingInstructions)switch(g(a.data),a.data.type){case"decompress":switch(a.data.algorithm){case 3:if(a.data.settings&&a.data.settings.length>0){let s=a.data.settings,o=new Uint8Array(s.length+n.length);o.set(s,0),o.set(n,s.length),n=o}break;default:}break;default:}return n}processTagValue(e,r){if(!this.currentSegment?.metadataTags)return;let n=this.currentSegment.metadataTags;if(n.raw??={},n.raw[e]??=r,typeof r=="string")switch(e.toLowerCase()){case"title":n.title??=r;break;case"description":n.description??=r;break;case"artist":n.artist??=r;break;case"album":n.album??=r;break;case"album_artist":n.albumArtist??=r;break;case"genre":n.genre??=r;break;case"comment":n.comment??=r;break;case"lyrics":n.lyrics??=r;break;case"date":{let a=new Date(r);Number.isNaN(a.getTime())||(n.date??=a)}break;case"track_number":case"part_number":{let a=r.split("/"),s=Number.parseInt(a[0],10),o=a[1]&&Number.parseInt(a[1],10);Number.isInteger(s)&&s>0&&(n.trackNumber??=s),o&&Number.isInteger(o)&&o>0&&(n.tracksTotal??=o)}break;case"disc_number":case"disc":{let a=r.split("/"),s=Number.parseInt(a[0],10),o=a[1]&&Number.parseInt(a[1],10);Number.isInteger(s)&&s>0&&(n.discNumber??=s),o&&Number.isInteger(o)&&o>0&&(n.discsTotal??=o)}break}}async getDurationFromMetadata(e){if(e.duration<=0)return null;let r=null;for(let a of e.tracks){g(a.trackBacking);let s=await a.trackBacking.getFirstPacket({metadataOnly:!0});s&&(r=Math.min(r??1/0,s.timestamp))}let n=e.duration/e.timestampFactor;return n+=r??0,n}},zs=class{constructor(t){this.internalTrack=t;this.packetToClusterLocation=new WeakMap}getId(){return this.internalTrack.id}getNumber(){let t=this.internalTrack.demuxer,e=this.internalTrack.trackBacking.getType(),r=0;for(let n of t.segments)for(let a of n.tracks)if(a.trackBacking.getType()===e&&r++,a===this.internalTrack)break;return r}getCodec(){throw new Error("Not implemented on base class.")}getInternalCodecId(){return this.internalTrack.codecId}getName(){return this.internalTrack.name}getLanguageCode(){return this.internalTrack.languageCode}getTimeResolution(){return this.internalTrack.segment.timestampFactor}isRelativeToUnixEpoch(){return!1}getUnixTimeForTimestamp(){return null}getDisposition(){return this.internalTrack.disposition}getPairingMask(){return 1n}getBitrate(){return null}getAverageBitrate(){return null}async getDurationFromMetadata(){return this.internalTrack.demuxer.getDurationFromMetadata(this.internalTrack.segment)}async getLiveRefreshInterval(){return null}async getFirstPacket(t){return this.performClusterLookup(null,e=>e.trackData.get(this.internalTrack.id)?{blockIndex:0,correctBlockFound:!0}:{blockIndex:-1,correctBlockFound:!1},-1/0,1/0,t)}intoTimescale(t){return lr(t*this.internalTrack.segment.timestampFactor)}async getPacket(t,e){let r=this.intoTimescale(t);return this.performClusterLookup(null,n=>{let a=n.trackData.get(this.internalTrack.id);if(!a)return{blockIndex:-1,correctBlockFound:!1};let s=Q(a.presentationTimestamps,r,u=>u.timestamp),o=s!==-1?a.presentationTimestamps[s].blockIndex:-1,c=s!==-1&&r<a.endTimestamp;return{blockIndex:o,correctBlockFound:c}},r,r,e)}async getNextPacket(t,e){let r=this.packetToClusterLocation.get(t);if(r===void 0)throw new Error("Packet was not created from this track.");return this.performClusterLookup(r.cluster,n=>{if(n===r.cluster){let a=n.trackData.get(this.internalTrack.id);if(r.blockIndex+1<a.blocks.length)return{blockIndex:r.blockIndex+1,correctBlockFound:!0}}else if(n.trackData.get(this.internalTrack.id))return{blockIndex:0,correctBlockFound:!0};return{blockIndex:-1,correctBlockFound:!1}},-1/0,1/0,e)}async getKeyPacket(t,e){let r=this.intoTimescale(t);return this.performClusterLookup(null,n=>{let a=n.trackData.get(this.internalTrack.id);if(!a)return{blockIndex:-1,correctBlockFound:!1};let s=Rr(a.presentationTimestamps,u=>a.blocks[u.blockIndex].isKeyFrame&&u.timestamp<=r),o=s!==-1?a.presentationTimestamps[s].blockIndex:-1,c=s!==-1&&r<a.endTimestamp;return{blockIndex:o,correctBlockFound:c}},r,r,e)}async getNextKeyPacket(t,e){let r=this.packetToClusterLocation.get(t);if(r===void 0)throw new Error("Packet was not created from this track.");return this.performClusterLookup(r.cluster,n=>{if(n===r.cluster){let s=n.trackData.get(this.internalTrack.id).blocks.findIndex((o,c)=>o.isKeyFrame&&c>r.blockIndex);if(s!==-1)return{blockIndex:s,correctBlockFound:!0}}else{let a=n.trackData.get(this.internalTrack.id);if(a&&a.firstKeyFrameTimestamp!==null){let s=a.blocks.findIndex(o=>o.isKeyFrame);return g(s!==-1),{blockIndex:s,correctBlockFound:!0}}}return{blockIndex:-1,correctBlockFound:!1}},-1/0,1/0,e)}async fetchPacketInCluster(t,e,r){if(e===-1)return null;let a=t.trackData.get(this.internalTrack.id).blocks[e];if(g(a),a.decoded||(a.data=this.internalTrack.demuxer.decodeBlockData(this.internalTrack,a.data),a.decoded=!0),!a.postProcessed){if(this.internalTrack.info?.codec==="prores"&&!(a.data.length>=8&&a.data[4]===105&&a.data[5]===99&&a.data[6]===112&&a.data[7]===102)){let d=new Uint8Array(a.data.length+8);L(d).setUint32(0,d.length,!1),d[4]=105,d[5]=99,d[6]=112,d[7]=102,d.set(a.data,8),a.data=d}a.postProcessed=!0}let s=r.metadataOnly?Se:a.data,o=a.timestamp/this.internalTrack.segment.timestampFactor,c=a.duration/this.internalTrack.segment.timestampFactor,u={};a.mainAdditional&&this.internalTrack.info?.type==="video"&&this.internalTrack.info.alphaMode&&(u.alpha=r.metadataOnly?Se:a.mainAdditional,u.alphaByteLength=a.mainAdditional.byteLength);let l=new j(s,a.isKeyFrame?"key":"delta",o,c,t.dataStartPos+e,a.data.byteLength,u);return this.packetToClusterLocation.set(l,{cluster:t,blockIndex:e}),l}async performClusterLookup(t,e,r,n,a){let{demuxer:s,segment:o}=this.internalTrack,c=null,u=null,l=-1;if(t){let{blockIndex:y,correctBlockFound:k}=e(t);if(k)return this.fetchPacketInCluster(t,y,a);y!==-1&&(u=t,l=y)}let m=Q(this.internalTrack.cuePoints,r,y=>y.time),d=m!==-1?this.internalTrack.cuePoints[m]:null,f=Q(this.internalTrack.clusterPositionCache,r,y=>y.startTimestamp),p=f!==-1?this.internalTrack.clusterPositionCache[f]:null,b=Math.max(d?.clusterPosition??0,p?.elementStartPos??0)||null,h;for(t?b===null||t.elementStartPos>=b?(h=t.elementEndPos,c=t):h=b:h=b??o.clusterSeekStartPos;o.elementEndPos===null||h<=o.elementEndPos-$e;){if(c){let A=c.trackData.get(this.internalTrack.id);if(A&&A.startTimestamp>n)break}let y=s.reader.requestSliceRange(h,$e,Ft);if(v(y)&&(y=await y),!y)break;let k=h,T=Mt(y);if(!T||!en.includes(T.id)&&T.id!==236){let A=await Qc(s.reader,k,en,Math.min(o.elementEndPos??1/0,k+vd));if(A){h=A;continue}else break}let w=T.id,x=T.size,C=y.filePos;if(w===524531317){c=await s.readCluster(k,o),x=c.elementEndPos-C;let{blockIndex:A,correctBlockFound:S}=e(c);if(S)return this.fetchPacketInCluster(c,A,a);A!==-1&&(u=c,l=A)}x===void 0&&(g(w!==524531317),x=(await Ds(s.reader,C,Zn,o.elementEndPos)).pos-C);let P=C+x;if(o.elementEndPos===null){let A=s.reader.requestSliceRange(P,$e,Ft);if(v(A)&&(A=await A),!A)break;if(Bs(A)===408125543){o.elementEndPos=P;break}}h=P}if(d&&(!u||u.elementStartPos<d.clusterPosition)){let y=this.internalTrack.cuePoints[m-1];g(!y||y.time<d.time);let k=y?.time??-1/0;return this.performClusterLookup(null,e,k,n,a)}return u?this.fetchPacketInCluster(u,l,a):null}},jc=class extends zs{constructor(e){super(e);this.decoderConfigPromise=null;this.internalTrack=e}getType(){return"video"}getCodec(){return this.internalTrack.info.codec}getCodedWidth(){return this.internalTrack.info.width}getCodedHeight(){return this.internalTrack.info.height}getSquarePixelWidth(){return this.internalTrack.info.squarePixelWidth}getSquarePixelHeight(){return this.internalTrack.info.squarePixelHeight}getRotation(){return this.internalTrack.info.rotation}async getColorSpace(){let e=await this.getDecoderConfig();return e?{primaries:e.colorSpace?.primaries,transfer:e.colorSpace?.transfer,matrix:e.colorSpace?.matrix,fullRange:e.colorSpace?.fullRange}:this.internalTrack.info.colorSpace}async canBeTransparent(){return this.internalTrack.info.alphaMode||this.internalTrack.info.codec==="prores"&&(this.internalTrack.info.proresFormat==="ap4h"||this.internalTrack.info.proresFormat==="ap4x")}async getDecoderConfig(){return this.internalTrack.info.codec?this.decoderConfigPromise??=(async()=>{let e=null;(this.internalTrack.info.codec==="vp9"||this.internalTrack.info.codec==="av1"||this.internalTrack.info.codec==="prores"||this.internalTrack.info.codec==="avc"&&!this.internalTrack.info.codecDescription||this.internalTrack.info.codec==="hevc"&&!this.internalTrack.info.codecDescription)&&(e=await this.getFirstPacket({}));let n={width:this.internalTrack.info.width,height:this.internalTrack.info.height,codec:this.internalTrack.info.codec,codecDescription:this.internalTrack.info.codecDescription,colorSpace:this.internalTrack.info.colorSpace,avcType:1,avcCodecInfo:this.internalTrack.info.codec==="avc"&&e?Br(e.data):null,hevcCodecInfo:this.internalTrack.info.codec==="hevc"&&e?Dr(e.data):null,vp9CodecInfo:this.internalTrack.info.codec==="vp9"&&e?as(e.data):null,av1CodecInfo:this.internalTrack.info.codec==="av1"&&e?zn(e.data):null,proresCodecInfo:this.internalTrack.info.codec==="prores"&&e?ss(e.data):null,proresFormat:this.internalTrack.info.proresFormat};if(!Ui(this.internalTrack.info.colorSpace)){let s=bs(n);this.internalTrack.info.colorSpace.primaries??=s.primaries,this.internalTrack.info.colorSpace.transfer??=s.transfer,this.internalTrack.info.colorSpace.matrix??=s.matrix,this.internalTrack.info.colorSpace.fullRange??=s.fullRange}let a={codec:Ki(n),codedWidth:this.internalTrack.info.width,codedHeight:this.internalTrack.info.height,description:this.internalTrack.info.codecDescription??void 0,colorSpace:this.internalTrack.info.colorSpace};return(this.internalTrack.info.width!==this.internalTrack.info.squarePixelWidth||this.internalTrack.info.height!==this.internalTrack.info.squarePixelHeight)&&(a.displayAspectWidth=this.internalTrack.info.squarePixelWidth,a.displayAspectHeight=this.internalTrack.info.squarePixelHeight),a})():null}},Xc=class extends zs{constructor(e){super(e);this.decoderConfigPromise=null;this.internalTrack=e}getType(){return"audio"}getCodec(){return this.internalTrack.info.codec}getNumberOfChannels(){return this.internalTrack.info.numberOfChannels}getSampleRate(){return this.internalTrack.info.sampleRate}async getDecoderConfig(){return this.internalTrack.info.codec?this.decoderConfigPromise??=(async()=>{if(this.internalTrack.info.codec==="dts"&&!this.internalTrack.info.dtsFormat){let e=await this.getFirstPacket({});this.internalTrack.info.dtsFormat=e&&ps(e.data)}return{codec:Qi({codec:this.internalTrack.info.codec,codecDescription:this.internalTrack.info.codecDescription,aacCodecInfo:this.internalTrack.info.aacCodecInfo,dtsFormat:this.internalTrack.info.dtsFormat}),numberOfChannels:this.internalTrack.info.numberOfChannels,sampleRate:this.internalTrack.info.sampleRate,description:this.internalTrack.info.codecDescription??void 0}})():null}};var Jn=async(i,t,e,r=null)=>{let a=t;for(;e===null||a<e;){let s=e!==null?Math.min(65536,e-a):65536,o=i.requestSliceRange(a,4,s);if(v(o)&&(o=await o),!o||o.length<4)break;for(;o.remainingLength>=4;){let c=o.filePos,u=M(o),l=i.fileSize!==null?i.fileSize-a:null,m=Lr(u,l);if(m.header&&(!r||m.header.sampleRate===r.sampleRate&&m.header.mpegVersionId===r.mpegVersionId&&m.header.layer===r.layer&&Wr(m.header.channel)===Wr(r.channel)))return{header:m.header,startPos:a};o.filePos=c+m.bytesAdvanced,a=o.filePos}}return null};var Ns=class extends Ie{constructor(e){super(e);this.metadataPromise=null;this.firstFrameHeader=null;this.firstFrameHeaderPos=null;this.xingFrameHeader=null;this.xingFrameHeaderPos=null;this.loadedSamples=[];this.metadataTags=null;this.xingData=null;this.trackBackings=[];this.readingMutex=new ze;this.lastSampleLoaded=!1;this.lastLoadedPos=0;this.nextTimestampInSamples=0;this.reader=e._reader}async readMetadata(){return this.metadataPromise??=(async()=>{for(;!this.firstFrameHeader&&!this.lastSampleLoaded;)await this.advanceReader();if(!this.firstFrameHeader&&this.xingFrameHeader&&(this.firstFrameHeader=this.xingFrameHeader,this.firstFrameHeaderPos=this.xingFrameHeaderPos),!this.firstFrameHeader)throw new Error("No valid MP3 frame found.");this.trackBackings=[new $c(this)]})()}async advanceReader(){if(this.lastLoadedPos===0)for(;;){let c=this.reader.requestSlice(this.lastLoadedPos,De);if(v(c)&&(c=await c),!c){this.lastSampleLoaded=!0;return}let u=Ye(c);if(!u)break;this.lastLoadedPos=c.filePos+u.size}let e=await Jn(this.reader,this.lastLoadedPos,this.reader.fileSize,this.firstFrameHeader);if(!e){this.lastSampleLoaded=!0;return}let r=e.header;this.lastLoadedPos=e.startPos+r.totalSize-1;let n=Nr(r.mpegVersionId,r.channel),a=this.reader.requestSlice(e.startPos+n,4);if(v(a)&&(a=await a),a){let c=M(a);if(c===zr||c===Gi){if(this.xingFrameHeader||(this.xingFrameHeader=r,this.xingFrameHeaderPos=e.startPos),!this.xingData){let l=this.reader.requestSlice(e.startPos+n+4,12);if(v(l)&&(l=await l),l){let m=D(l,12),d=L(m),f=d.getUint32(0,!1);this.xingData={frameCount:f&1?d.getUint32(4,!1):null,fileSize:f&2?d.getUint32(8,!1):null}}}return}}this.firstFrameHeader||(this.firstFrameHeader=r,this.firstFrameHeaderPos=e.startPos);let s=r.audioSamplesInFrame/this.firstFrameHeader.sampleRate,o={timestamp:this.nextTimestampInSamples/this.firstFrameHeader.sampleRate,duration:s,dataStart:e.startPos,dataSize:r.totalSize};this.loadedSamples.push(o),this.nextTimestampInSamples+=r.audioSamplesInFrame}async getMimeType(){return"audio/mpeg"}async getTrackBackings(){return await this.readMetadata(),this.trackBackings}async getMetadataTags(){let e=await this.readingMutex.acquire();try{if(await this.readMetadata(),this.metadataTags)return this.metadataTags;this.metadataTags={};let r=0,n=!1;for(;;){let a=this.reader.requestSlice(r,De);if(v(a)&&(a=await a),!a)break;let s=Ye(a);if(!s)break;n=!0;let o=this.reader.requestSlice(a.filePos,s.size);if(v(o)&&(o=await o),!o)break;Kr(o,s,this.metadataTags),r=a.filePos+s.size}if(!n&&this.reader.fileSize!==null&&this.reader.fileSize>=ea){let a=this.reader.requestSlice(this.reader.fileSize-ea,ea);v(a)&&(a=await a),g(a),ue(a,3)==="TAG"&&_d(a,this.metadataTags)}return this.metadataTags}finally{e()}}},$c=class{constructor(t){this.demuxer=t}getType(){return"audio"}getId(){return 1}getNumber(){return 1}getTimeResolution(){return g(this.demuxer.firstFrameHeader),this.demuxer.firstFrameHeader.sampleRate/this.demuxer.firstFrameHeader.audioSamplesInFrame}isRelativeToUnixEpoch(){return!1}getUnixTimeForTimestamp(){return null}getPairingMask(){return 1n}getBitrate(){return null}getAverageBitrate(){return null}async getDurationFromMetadata(){let t=this.demuxer;if(g(t.firstFrameHeader!==null),g(t.firstFrameHeaderPos!==null),t.xingData){if(t.xingData.frameCount!==null)return t.xingData.frameCount*t.firstFrameHeader.audioSamplesInFrame/t.firstFrameHeader.sampleRate}else if(t.reader.fileSize!==null){let e=ud(t.firstFrameHeader.lowSamplingFrequency,t.firstFrameHeader.layer,t.firstFrameHeader.bitrate,t.firstFrameHeader.sampleRate),r=(t.reader.fileSize-t.firstFrameHeaderPos)/e;return Math.round(r)*t.firstFrameHeader.audioSamplesInFrame/t.firstFrameHeader.sampleRate}return null}async getLiveRefreshInterval(){return null}getName(){return null}getLanguageCode(){return ae}getCodec(){return"mp3"}getInternalCodecId(){return null}getNumberOfChannels(){return g(this.demuxer.firstFrameHeader),Wr(this.demuxer.firstFrameHeader.channel)}getSampleRate(){return g(this.demuxer.firstFrameHeader),this.demuxer.firstFrameHeader.sampleRate}getDisposition(){return{..._e}}async getDecoderConfig(){return g(this.demuxer.firstFrameHeader),{codec:"mp3",numberOfChannels:Wr(this.demuxer.firstFrameHeader.channel),sampleRate:this.demuxer.firstFrameHeader.sampleRate}}async getPacketAtIndex(t,e){if(t===-1)return null;let r=this.demuxer.loadedSamples[t];if(!r)return null;let n;if(e.metadataOnly)n=Se;else{let a=this.demuxer.reader.requestSlice(r.dataStart,r.dataSize);if(v(a)&&(a=await a),!a)return null;n=D(a,r.dataSize)}return new j(n,"key",r.timestamp,r.duration,t,r.dataSize)}getFirstPacket(t){return this.getPacketAtIndex(0,t)}async getNextPacket(t,e){let r=await this.demuxer.readingMutex.acquire();try{let n=ur(this.demuxer.loadedSamples,t.timestamp,s=>s.timestamp);if(n===-1)throw new Error("Packet was not created from this track.");let a=n+1;for(;a>=this.demuxer.loadedSamples.length&&!this.demuxer.lastSampleLoaded;)await this.demuxer.advanceReader();return this.getPacketAtIndex(a,e)}finally{r()}}async getPacket(t,e){let r=await this.demuxer.readingMutex.acquire();try{for(;;){let n=Q(this.demuxer.loadedSamples,t,a=>a.timestamp);if(n===-1&&this.demuxer.loadedSamples.length>0)return null;if(this.demuxer.lastSampleLoaded)return this.getPacketAtIndex(n,e);if(n>=0&&n+1<this.demuxer.loadedSamples.length)return this.getPacketAtIndex(n,e);await this.demuxer.advanceReader()}}finally{r()}}getKeyPacket(t,e){return this.getPacket(t,e)}getNextKeyPacket(t,e){return this.getNextPacket(t,e)}};var ta=1399285583,yp=79764919,Rd=new Uint32Array(256);for(let i=0;i<256;i++){let t=i<<24;for(let e=0;e<8;e++)t=t&2147483648?t<<1^yp:t<<1;Rd[i]=t>>>0&4294967295}var Ls=i=>{let t=L(i),e=t.getUint32(22,!0);t.setUint32(22,0,!0);let r=0;for(let n=0;n<i.length;n++){let a=i[n];r=(r<<8^Rd[r>>>24^a])>>>0}return t.setUint32(22,e,!0),r},Ws=(i,t,e)=>{let r=0,n=null;if(i.length>0)if(t.codec==="vorbis"){g(t.vorbisInfo);let a=t.vorbisInfo.modeBlockflags.length,o=(1<<Al(a-1))-1<<1,c=(i[0]&o)>>1;if(c>=t.vorbisInfo.modeBlockflags.length)throw new Error("Invalid mode number.");let u=e,l=t.vorbisInfo.modeBlockflags[c];if(n=t.vorbisInfo.blocksizes[l],l===1){let m=(o|1)+1,d=i[0]&m?1:0;u=t.vorbisInfo.blocksizes[d]}r=u!==null?u+n>>2:0}else t.codec==="opus"&&(r=Kl(i).durationInSamples);return{durationInSamples:r,vorbisBlockSize:n}},Hs=i=>{let t="audio/ogg";if(i.codecStrings){let e=[...new Set(i.codecStrings)];t+=`; codecs="${e.join(", ")}"`}return t};var Qr=27,ki=282,qs=ki+255*255,nn=i=>{let t=i.filePos;if(yi(i)!==ta)return null;i.skip(1);let r=N(i),n=Md(i),a=yi(i),s=yi(i),o=yi(i),c=N(i),u=new Uint8Array(c);for(let f=0;f<c;f++)u[f]=N(i);let l=27+c,m=u.reduce((f,p)=>f+p,0),d=l+m;return{headerStartPos:t,totalSize:d,dataStartPos:t+l,dataSize:m,headerType:r,granulePosition:n,serialNumber:a,sequenceNumber:s,checksum:o,lacingValues:u}},Fd=(i,t)=>{for(;i.filePos<t-3;){let e=yi(i),r=e&255,n=e>>>8&255,a=e>>>16&255,s=e>>>24&255,o=79;if(!(r!==o&&n!==o&&a!==o&&s!==o)){if(i.skip(-4),e===ta)return!0;i.skip(1)}}return!1};var Ks=class extends Ie{constructor(e){super(e);this.metadataPromise=null;this.bitstreams=[];this.trackBackings=[];this.metadataTags={};this.reader=e._reader}async readMetadata(){return this.metadataPromise??=(async()=>{let e=0;for(;;){let r=this.reader.requestSliceRange(e,Qr,ki);if(v(r)&&(r=await r),!r)break;let n=nn(r);if(!n||!!!(n.headerType&2))break;this.bitstreams.push({serialNumber:n.serialNumber,bosPage:n,description:null,numberOfChannels:-1,sampleRate:-1,codecInfo:{codec:null,vorbisInfo:null,opusInfo:null},lastMetadataPacket:null}),e=n.headerStartPos+n.totalSize}for(let r of this.bitstreams){let n=await this.readPacket(r.bosPage,0);n&&(n.data.byteLength>=7&&n.data[0]===1&&n.data[1]===118&&n.data[2]===111&&n.data[3]===114&&n.data[4]===98&&n.data[5]===105&&n.data[6]===115?await this.readVorbisMetadata(n,r):n.data.byteLength>=8&&n.data[0]===79&&n.data[1]===112&&n.data[2]===117&&n.data[3]===115&&n.data[4]===72&&n.data[5]===101&&n.data[6]===97&&n.data[7]===100&&await this.readOpusMetadata(n,r),r.codecInfo.codec!==null&&this.trackBackings.push(new Yc(r,this)))}})()}async readVorbisMetadata(e,r){let n=await this.findNextPacketStart(e);if(!n)return;let a=await this.readPacket(n.startPage,n.startSegmentIndex);if(!a||(n=await this.findNextPacketStart(a),!n))return;let s=await this.readPacket(n.startPage,n.startSegmentIndex);if(!s||a.data[0]!==3||s.data[0]!==5)return;let o=[],c=d=>{for(;o.push(Math.min(255,d)),!(d<255);)d-=255};c(e.data.length),c(a.data.length);let u=new Uint8Array(1+o.length+e.data.length+a.data.length+s.data.length);u[0]=2,u.set(o,1),u.set(e.data,1+o.length),u.set(a.data,1+o.length+e.data.length),u.set(s.data,1+o.length+e.data.length+a.data.length),r.codecInfo.codec="vorbis",r.description=u,r.lastMetadataPacket=s;let l=L(e.data);r.numberOfChannels=l.getUint8(11),r.sampleRate=l.getUint32(12,!0);let m=l.getUint8(28);r.codecInfo.vorbisInfo={blocksizes:[1<<(m&15),1<<(m>>4)],modeBlockflags:os(s.data).modeBlockflags},Nn(a.data.subarray(7),this.metadataTags)}async readOpusMetadata(e,r){let n=await this.findNextPacketStart(e);if(!n)return;let a=await this.readPacket(n.startPage,n.startSegmentIndex);if(!a)return;r.codecInfo.codec="opus",r.description=e.data,r.lastMetadataPacket=a;let s=Vr(e.data);r.numberOfChannels=s.outputChannelCount,r.sampleRate=Pt,r.codecInfo.opusInfo={preSkip:s.preSkip},Nn(a.data.subarray(8),this.metadataTags)}async readPacket(e,r){g(r<e.lacingValues.length);let n=0;for(let d=0;d<r;d++)n+=e.lacingValues[d];let a=e,s=n,o=r,c=[];e:for(;;){let d=this.reader.requestSlice(a.dataStartPos,a.dataSize);v(d)&&(d=await d),g(d);let f=D(d,a.dataSize);for(;;){if(o===a.lacingValues.length){c.push(f.subarray(n,s));break}let b=a.lacingValues[o];if(s+=b,b<255){c.push(f.subarray(n,s));break e}o++}let p=a.headerStartPos+a.totalSize;for(;;){let b=this.reader.requestSliceRange(p,Qr,ki);if(v(b)&&(b=await b),!b)return null;let h=nn(b);if(!h)return null;if(a=h,a.serialNumber===e.serialNumber)break;p=a.headerStartPos+a.totalSize}n=0,s=0,o=0}let u=c.reduce((d,f)=>d+f.length,0);if(u===0)return null;let l=new Uint8Array(u),m=0;for(let d=0;d<c.length;d++){let f=c[d];l.set(f,m),m+=f.length}return{data:l,endPage:a,endSegmentIndex:o}}async findNextPacketStart(e){if(e.endSegmentIndex<e.endPage.lacingValues.length-1)return{startPage:e.endPage,startSegmentIndex:e.endSegmentIndex+1};if(!!(e.endPage.headerType&4))return null;let n=e.endPage.headerStartPos+e.endPage.totalSize;for(;;){let a=this.reader.requestSliceRange(n,Qr,ki);if(v(a)&&(a=await a),!a)return null;let s=nn(a);if(!s)return null;if(s.serialNumber===e.endPage.serialNumber)return{startPage:s,startSegmentIndex:0};n=s.headerStartPos+s.totalSize}}async getMimeType(){await this.readMetadata();let e=await Promise.all(this.trackBackings.map(r=>r.getDecoderConfig().then(n=>n?.codec??null)));return Hs({codecStrings:e.filter(Boolean)})}async getTrackBackings(){return await this.readMetadata(),this.trackBackings}async getMetadataTags(){return await this.readMetadata(),this.metadataTags}},Yc=class{constructor(t,e){this.bitstream=t;this.demuxer=e;this.encodedPacketToMetadata=new WeakMap;this.sequentialScanCache=[];this.sequentialScanMutex=new ze;this.internalSampleRate=t.codecInfo.codec==="opus"?Pt:t.sampleRate}getType(){return"audio"}getId(){return this.bitstream.serialNumber}getNumber(){let t=this.demuxer.trackBackings.findIndex(e=>e.bitstream===this.bitstream);return g(t!==-1),t+1}getNumberOfChannels(){return this.bitstream.numberOfChannels}getSampleRate(){return this.bitstream.sampleRate}getTimeResolution(){return this.bitstream.sampleRate}isRelativeToUnixEpoch(){return!1}getUnixTimeForTimestamp(){return null}getPairingMask(){return 1n}getBitrate(){return null}getAverageBitrate(){return null}async getDurationFromMetadata(){return null}async getLiveRefreshInterval(){return null}getCodec(){return this.bitstream.codecInfo.codec}getInternalCodecId(){return null}async getDecoderConfig(){return g(this.bitstream.codecInfo.codec),{codec:this.bitstream.codecInfo.codec,numberOfChannels:this.bitstream.numberOfChannels,sampleRate:this.bitstream.sampleRate,description:this.bitstream.description??void 0}}getName(){return null}getLanguageCode(){return ae}getDisposition(){return{..._e,primary:!1}}granulePositionToTimestampInSamples(t){return this.bitstream.codecInfo.codec==="opus"?(g(this.bitstream.codecInfo.opusInfo),t-this.bitstream.codecInfo.opusInfo.preSkip):t}createEncodedPacketFromOggPacket(t,e,r){if(!t)return null;let{durationInSamples:n,vorbisBlockSize:a}=Ws(t.data,this.bitstream.codecInfo,e.vorbisLastBlocksize),s=new j(r.metadataOnly?Se:t.data,"key",Math.max(0,e.timestampInSamples)/this.internalSampleRate,n/this.internalSampleRate,t.endPage.headerStartPos+t.endSegmentIndex,t.data.byteLength);return this.encodedPacketToMetadata.set(s,{packet:t,timestampInSamples:e.timestampInSamples,durationInSamples:n,vorbisLastBlockSize:e.vorbisLastBlocksize,vorbisBlockSize:a}),s}async getFirstPacket(t){g(this.bitstream.lastMetadataPacket);let e=await this.demuxer.findNextPacketStart(this.bitstream.lastMetadataPacket);if(!e)return null;let r=0;this.bitstream.codecInfo.codec==="opus"&&(g(this.bitstream.codecInfo.opusInfo),r-=this.bitstream.codecInfo.opusInfo.preSkip);let n=await this.demuxer.readPacket(e.startPage,e.startSegmentIndex);return this.createEncodedPacketFromOggPacket(n,{timestampInSamples:r,vorbisLastBlocksize:null},t)}async getNextPacket(t,e){let r=this.encodedPacketToMetadata.get(t);if(!r)throw new Error("Packet was not created from this track.");let n=await this.demuxer.findNextPacketStart(r.packet);if(!n)return null;let a=r.timestampInSamples+r.durationInSamples,s=await this.demuxer.readPacket(n.startPage,n.startSegmentIndex);return this.createEncodedPacketFromOggPacket(s,{timestampInSamples:a,vorbisLastBlocksize:r.vorbisBlockSize},e)}async getPacket(t,e){if(this.demuxer.reader.fileSize===null)return this.getPacketSequential(t,e);let r=lr(t*this.internalSampleRate);if(r===0)return this.getFirstPacket(e);if(r<0)return null;g(this.bitstream.lastMetadataPacket);let n=await this.demuxer.findNextPacketStart(this.bitstream.lastMetadataPacket);if(!n)return null;let a=n.startPage,s=this.demuxer.reader.fileSize,o=[a];e:for(;a.headerStartPos+a.totalSize<s;){let k=a.headerStartPos,T=Math.floor((k+s)/2),w=T;for(;;){let x=Math.min(w+qs,s-Qr),C=this.demuxer.reader.requestSlice(w,x-w);if(v(C)&&(C=await C),g(C),!Fd(C,x)){s=T+Qr;continue e}let A=this.demuxer.reader.requestSliceRange(C.filePos,Qr,ki);v(A)&&(A=await A),g(A);let S=nn(A);g(S);let I=!1;if(S.serialNumber===this.bitstream.serialNumber)I=!0;else{let R=this.demuxer.reader.requestSlice(S.headerStartPos,S.totalSize);v(R)&&(R=await R),g(R);let _=D(R,S.totalSize);I=Ls(_)===S.checksum}if(!I){w=S.headerStartPos+4;continue}if(I&&S.serialNumber!==this.bitstream.serialNumber){w=S.headerStartPos+S.totalSize;continue}if(S.granulePosition===-1){w=S.headerStartPos+S.totalSize;continue}this.granulePositionToTimestampInSamples(S.granulePosition)>r?s=S.headerStartPos:(a=S,o.push(S));continue e}}let c=n.startPage;for(let k of o){if(k.granulePosition===a.granulePosition)break;(!c||k.headerStartPos>c.headerStartPos)&&(c=k)}let u=c,l=[u];for(;!(u.serialNumber===this.bitstream.serialNumber&&u.granulePosition===a.granulePosition);){let k=u.headerStartPos+u.totalSize,T=this.demuxer.reader.requestSliceRange(k,Qr,ki);v(T)&&(T=await T),g(T);let w=nn(T);g(w),u=w,u.serialNumber===this.bitstream.serialNumber&&l.push(u)}g(u.granulePosition!==-1);let m=null,d,f,p=u,b=0;if(u.headerStartPos===n.startPage.headerStartPos)d=this.granulePositionToTimestampInSamples(0),f=!0,m=0;else{d=0,f=!1;for(let w=u.lacingValues.length-1;w>=0;w--)if(u.lacingValues[w]<255){m=w+1;break}if(m===null)throw new Error("Invalid page with granule position: no packets end on this page.");b=m-1;let k={data:Se,endPage:p,endSegmentIndex:b};if(await this.demuxer.findNextPacketStart(k)){let w=Od(l,u,m);g(w);let x=Bd(l,w.page,w.segmentIndex);x&&(u=x.page,m=x.segmentIndex)}else for(;;){let w=Od(l,u,m);if(!w)break;let x=Bd(l,w.page,w.segmentIndex);if(!x)break;if(u=x.page,m=x.segmentIndex,w.page.headerStartPos!==p.headerStartPos){p=w.page,b=w.segmentIndex;break}}}let h=null,y=null;for(;u!==null;){g(m!==null);let k=await this.demuxer.readPacket(u,m);if(!k)break;if(!(u.headerStartPos===n.startPage.headerStartPos&&m<n.startSegmentIndex)){let x=this.createEncodedPacketFromOggPacket(k,{timestampInSamples:d,vorbisLastBlocksize:y?.vorbisBlockSize??null},e);g(x);let C=this.encodedPacketToMetadata.get(x);if(g(C),!f&&k.endPage.headerStartPos===p.headerStartPos&&k.endSegmentIndex===b?(d=this.granulePositionToTimestampInSamples(u.granulePosition),f=!0,x=this.createEncodedPacketFromOggPacket(k,{timestampInSamples:d-C.durationInSamples,vorbisLastBlocksize:y?.vorbisBlockSize??null},e),g(x),C=this.encodedPacketToMetadata.get(x),g(C)):d+=C.durationInSamples,h=x,y=C,f&&(Math.max(d,0)>r||Math.max(C.timestampInSamples,0)===r))break}let w=await this.demuxer.findNextPacketStart(k);if(!w)break;u=w.startPage,m=w.startSegmentIndex}return h}async getPacketSequential(t,e){let r=await this.sequentialScanMutex.acquire();try{let n=lr(t*this.internalSampleRate);t=n/this.internalSampleRate;let a=Q(this.sequentialScanCache,n,c=>c.timestampInSamples),s;if(a!==-1){let c=this.sequentialScanCache[a];s=this.createEncodedPacketFromOggPacket(c.packet,{timestampInSamples:c.timestampInSamples,vorbisLastBlocksize:c.vorbisLastBlockSize},e)}else s=await this.getFirstPacket(e);let o=0;for(;s&&s.timestamp<t;){let c=await this.getNextPacket(s,e);if(!c||c.timestamp>t)break;if(s=c,o++,o===100){o=0;let u=this.encodedPacketToMetadata.get(s);g(u),this.sequentialScanCache.length>0&&g(ee(this.sequentialScanCache).timestampInSamples<=u.timestampInSamples),this.sequentialScanCache.push(u)}}return s}finally{r()}}getKeyPacket(t,e){return this.getPacket(t,e)}getNextKeyPacket(t,e){return this.getNextPacket(t,e)}},Bd=(i,t,e)=>{let r=t,n=e;e:for(;;){for(n--,n;n>=0;n--)if(r.lacingValues[n]<255){n++;break e}if(g(n===-1),!(r.headerType&1)){n=0;break}let s=Ac(i,o=>o.headerStartPos<r.headerStartPos);if(!s)return null;r=s,n=r.lacingValues.length}if(g(n!==-1),n===r.lacingValues.length){let a=i[i.indexOf(r)+1];g(a),r=a,n=0}return{page:r,segmentIndex:n}},Od=(i,t,e)=>{if(e>0)return{page:t,segmentIndex:e-1};let r=Ac(i,n=>n.headerStartPos<t.headerStartPos);return r?{page:r,segmentIndex:r.lacingValues.length-1}:null};var Qs=class extends Ie{constructor(e){super(e);this.metadataPromise=null;this.dataStart=-1;this.dataSize=-1;this.audioInfo=null;this.trackBackings=[];this.lastKnownPacketIndex=0;this.metadataTags={};this.reader=e._reader}async readMetadata(){return this.metadataPromise??=(async()=>{let e=this.reader.requestSlice(0,12);v(e)&&(e=await e),g(e);let r=ue(e,4),n=r!=="RIFX",a=r==="RF64",s=Sr(e,n),o=a?this.reader.fileSize:Math.min(s+8,this.reader.fileSize??1/0);if(ue(e,4)!=="WAVE")throw new Error("Invalid WAVE file - wrong format");let u=0,l=null,m=e.filePos;for(;o===null||m<o;){let f=this.reader.requestSlice(m,8);if(v(f)&&(f=await f),!f)break;let p=ue(f,4),b=Sr(f,n),h=f.filePos;if(a&&u===0&&p!=="ds64")throw new Error('Invalid RF64 file: First chunk must be "ds64".');if(p==="fmt ")await this.parseFmtChunk(h,b,n);else if(p==="data"){if(l??=b,this.dataStart=f.filePos,this.dataSize=Math.min(l,(o??1/0)-this.dataStart),this.reader.fileSize===null)break}else if(p==="ds64"){let y=this.reader.requestSlice(h,b);if(v(y)&&(y=await y),!y)break;let k=Jc(y,n);l=Jc(y,n),o=Math.min(k+8,this.reader.fileSize??1/0)}else p==="LIST"?await this.parseListChunk(h,b,n):(p==="ID3 "||p==="id3 ")&&await this.parseId3Chunk(h,b);m=h+b+(b&1),u++}if(!this.audioInfo)throw new Error('Invalid WAVE file - missing "fmt " chunk');if(this.dataStart===-1)throw new Error('Invalid WAVE file - missing "data" chunk');let d=this.audioInfo.blockSizeInBytes;this.dataSize=Math.floor(this.dataSize/d)*d,this.trackBackings.push(new Zc(this))})()}async parseFmtChunk(e,r,n){let a=this.reader.requestSlice(e,r);if(v(a)&&(a=await a),!a)return;let s=sn(a,n),o=sn(a,n),c=Sr(a,n);a.skip(4);let u=sn(a,n),l;if(r===14?l=8:l=sn(a,n),r>=18&&s!==357){let m=sn(a,n),d=r-18;if(Math.min(d,m)>=22&&s===65534){a.skip(6);let p=D(a,16);s=p[0]|p[1]<<8}}if((s===7||s===6)&&(l=8),s!==1&&s!==3&&s!==6&&s!==7)throw new Error(`Unsupported WAVE codec (format tag ${s}). Only integer/float PCM, A-law, and \u03BC-law are supported.`);if(s===1&&![8,16,24,32].includes(l))throw new Error(`Unsupported WAVE PCM bit depth (${l}). Only 8, 16, 24, and 32 bits are supported.`);if(s===3&&![32,64].includes(l))throw new Error(`Unsupported WAVE float bit depth (${l}). Only 32 and 64 bits are supported.`);this.audioInfo={format:s,numberOfChannels:o,sampleRate:c,sampleSizeInBytes:Math.ceil(l/8),blockSizeInBytes:u}}async parseListChunk(e,r,n){let a=this.reader.requestSlice(e,r);if(v(a)&&(a=await a),!a)return;let s=ue(a,4);if(s!=="INFO"&&s!=="INF0")return;let o=a.filePos;for(;o<=e+r-8;){a.filePos=o;let c=ue(a,4),u=Sr(a,n),l=D(a,u),m=0;for(let f=0;f<l.length&&l[f]!==0;f++)m++;let d=String.fromCharCode(...l.subarray(0,m));switch(this.metadataTags.raw??={},this.metadataTags.raw[c]=d,c){case"INAM":case"TITL":this.metadataTags.title??=d;break;case"TIT3":this.metadataTags.description??=d;break;case"IART":this.metadataTags.artist??=d;break;case"IPRD":this.metadataTags.album??=d;break;case"IPRT":case"ITRK":case"TRCK":{let f=d.split("/"),p=Number.parseInt(f[0],10),b=f[1]&&Number.parseInt(f[1],10);Number.isInteger(p)&&p>0&&(this.metadataTags.trackNumber??=p),b&&Number.isInteger(b)&&b>0&&(this.metadataTags.tracksTotal??=b)}break;case"ICRD":case"IDIT":{let f=new Date(d);Number.isNaN(f.getTime())||(this.metadataTags.date??=f)}break;case"YEAR":{let f=Number.parseInt(d,10);Number.isInteger(f)&&f>0&&(this.metadataTags.date??=new Date(f,0,1))}break;case"IGNR":case"GENR":this.metadataTags.genre??=d;break;case"ICMT":case"CMNT":case"COMM":this.metadataTags.comment??=d;break}o+=8+u+(u&1)}}async parseId3Chunk(e,r){let n=this.reader.requestSlice(e,r);if(v(n)&&(n=await n),!n)return;let a=Ye(n);if(a){let s=r-De;if(a.size=Math.min(a.size,s),a.size>0){let o=n.slice(e+De,a.size);Kr(o,a,this.metadataTags)}}}getCodec(){if(g(this.audioInfo),this.audioInfo.format===7)return"ulaw";if(this.audioInfo.format===6)return"alaw";if(this.audioInfo.format===1){if(this.audioInfo.sampleSizeInBytes===1)return"pcm-u8";if(this.audioInfo.sampleSizeInBytes===2)return"pcm-s16";if(this.audioInfo.sampleSizeInBytes===3)return"pcm-s24";if(this.audioInfo.sampleSizeInBytes===4)return"pcm-s32"}if(this.audioInfo.format===3){if(this.audioInfo.sampleSizeInBytes===4)return"pcm-f32";if(this.audioInfo.sampleSizeInBytes===8)return"pcm-f64"}g(!1)}async getMimeType(){return"audio/wav"}async getTrackBackings(){return await this.readMetadata(),this.trackBackings}async getMetadataTags(){return await this.readMetadata(),this.metadataTags}},an=2048,Zc=class{constructor(t){this.demuxer=t}getType(){return"audio"}getId(){return 1}getNumber(){return 1}getCodec(){return this.demuxer.getCodec()}getInternalCodecId(){return g(this.demuxer.audioInfo),this.demuxer.audioInfo.format}async getDecoderConfig(){let t=this.demuxer.getCodec();return t?(g(this.demuxer.audioInfo),{codec:t,numberOfChannels:this.demuxer.audioInfo.numberOfChannels,sampleRate:this.demuxer.audioInfo.sampleRate}):null}getNumberOfChannels(){return g(this.demuxer.audioInfo),this.demuxer.audioInfo.numberOfChannels}getSampleRate(){return g(this.demuxer.audioInfo),this.demuxer.audioInfo.sampleRate}getTimeResolution(){return g(this.demuxer.audioInfo),this.demuxer.audioInfo.sampleRate}isRelativeToUnixEpoch(){return!1}getUnixTimeForTimestamp(){return null}getPairingMask(){return 1n}getBitrate(){return null}getAverageBitrate(){return null}async getDurationFromMetadata(){return g(this.demuxer.dataSize!==-1),this.demuxer.dataSize/this.demuxer.audioInfo.blockSizeInBytes/this.demuxer.audioInfo.sampleRate}async getLiveRefreshInterval(){return null}getName(){return null}getLanguageCode(){return ae}getDisposition(){return{..._e}}async getPacketAtIndex(t,e){g(t>=0),g(this.demuxer.audioInfo);let r=t*an*this.demuxer.audioInfo.blockSizeInBytes;if(r>=this.demuxer.dataSize)return null;let n=Math.min(an*this.demuxer.audioInfo.blockSizeInBytes,this.demuxer.dataSize-r);if(this.demuxer.reader.fileSize===null){let c=this.demuxer.reader.requestSlice(this.demuxer.dataStart+r,n);if(v(c)&&(c=await c),!c)return null}let a;if(e.metadataOnly)a=Se;else{let c=this.demuxer.reader.requestSlice(this.demuxer.dataStart+r,n);v(c)&&(c=await c),g(c),a=D(c,n)}let s=t*an/this.demuxer.audioInfo.sampleRate,o=n/this.demuxer.audioInfo.blockSizeInBytes/this.demuxer.audioInfo.sampleRate;return this.demuxer.lastKnownPacketIndex=Math.max(t,this.demuxer.lastKnownPacketIndex),new j(a,"key",s,o,t,n)}getFirstPacket(t){return this.getPacketAtIndex(0,t)}async getPacket(t,e){g(this.demuxer.audioInfo);let r=Math.floor(Math.min(t*this.demuxer.audioInfo.sampleRate/an,(this.demuxer.dataSize-1)/(an*this.demuxer.audioInfo.blockSizeInBytes)));if(r<0)return null;let n=await this.getPacketAtIndex(r,e);if(n)return n;if(r===0)return null;g(this.demuxer.reader.fileSize===null);let a=await this.getPacketAtIndex(this.demuxer.lastKnownPacketIndex,e);for(;a;){let s=await this.getNextPacket(a,e);if(!s)break;a=s}return a}getNextPacket(t,e){g(this.demuxer.audioInfo);let r=Math.round(t.timestamp*this.demuxer.audioInfo.sampleRate/an);return this.getPacketAtIndex(r+1,e)}getKeyPacket(t,e){return this.getPacket(t,e)}getNextKeyPacket(t,e){return this.getNextPacket(t,e)}};var Ar=7,dt=9,Ze=i=>{let t=i.filePos,e=D(i,9),r=new q(e);if(r.readBits(12)!==4095||(r.skipBits(1),r.readBits(2)!==0))return null;let s=r.readBits(1),o=r.readBits(2)+1,c=r.readBits(4);if(c===15)return null;r.skipBits(1);let u=r.readBits(3);if(u===0)throw new Error("ADTS frames with channel configuration 0 are not supported.");r.skipBits(1),r.skipBits(1),r.skipBits(1),r.skipBits(1);let l=r.readBits(13);r.skipBits(11);let m=r.readBits(2)+1;if(m!==1)throw new Error("ADTS frames with more than one AAC frame are not supported.");let d=null;return s===1?i.filePos-=2:d=r.readBits(16),{objectType:o,samplingFrequencyIndex:c,channelConfiguration:u,frameLength:l,numberOfAacFrames:m,crcCheck:d,startPos:t}};var ra=1024,Gs=class extends Ie{constructor(e){super(e);this.metadataPromise=null;this.firstFrameHeader=null;this.loadedSamples=[];this.metadataTags=null;this.trackBackings=[];this.readingMutex=new ze;this.lastSampleLoaded=!1;this.lastLoadedPos=0;this.nextTimestampInSamples=0;this.reader=e._reader}async readMetadata(){return this.metadataPromise??=(async()=>{for(;!this.firstFrameHeader&&!this.lastSampleLoaded;)await this.advanceReader();g(this.firstFrameHeader),this.trackBackings=[new eu(this)]})()}async advanceReader(){if(this.lastLoadedPos===0)for(;;){let o=this.reader.requestSlice(this.lastLoadedPos,De);if(v(o)&&(o=await o),!o){this.lastSampleLoaded=!0;return}let c=Ye(o);if(!c)break;this.lastLoadedPos=o.filePos+c.size}let e=this.reader.requestSliceRange(this.lastLoadedPos,Ar,dt);if(v(e)&&(e=await e),!e){this.lastSampleLoaded=!0;return}let r=Ze(e);if(!r){this.lastSampleLoaded=!0;return}if(this.reader.fileSize!==null&&r.startPos+r.frameLength>this.reader.fileSize){this.lastSampleLoaded=!0;return}this.firstFrameHeader||(this.firstFrameHeader=r);let n=mt[r.samplingFrequencyIndex];g(n!==void 0);let a=ra/n,s={timestamp:this.nextTimestampInSamples/n,duration:a,dataStart:r.startPos,dataSize:r.frameLength};this.loadedSamples.push(s),this.nextTimestampInSamples+=ra,this.lastLoadedPos=r.startPos+r.frameLength}async getMimeType(){return"audio/aac"}async getTrackBackings(){return await this.readMetadata(),this.trackBackings}async getMetadataTags(){let e=await this.readingMutex.acquire();try{if(await this.readMetadata(),this.metadataTags)return this.metadataTags;this.metadataTags={};let r=0;for(;;){let n=this.reader.requestSlice(r,De);if(v(n)&&(n=await n),!n)break;let a=Ye(n);if(!a)break;let s=this.reader.requestSlice(n.filePos,a.size);if(v(s)&&(s=await s),!s)break;Kr(s,a,this.metadataTags),r=n.filePos+a.size}return this.metadataTags}finally{e()}}},eu=class{constructor(t){this.demuxer=t}getType(){return"audio"}getId(){return 1}getNumber(){return 1}getTimeResolution(){return this.getSampleRate()/ra}isRelativeToUnixEpoch(){return!1}getUnixTimeForTimestamp(){return null}getPairingMask(){return 1n}getBitrate(){return null}getAverageBitrate(){return null}async getDurationFromMetadata(){return null}async getLiveRefreshInterval(){return null}getName(){return null}getLanguageCode(){return ae}getCodec(){return"aac"}getInternalCodecId(){return g(this.demuxer.firstFrameHeader),this.demuxer.firstFrameHeader.objectType}getNumberOfChannels(){g(this.demuxer.firstFrameHeader);let t=Kt[this.demuxer.firstFrameHeader.channelConfiguration];return g(t!==void 0),t}getSampleRate(){g(this.demuxer.firstFrameHeader);let t=mt[this.demuxer.firstFrameHeader.samplingFrequencyIndex];return g(t!==void 0),t}getDisposition(){return{..._e}}async getDecoderConfig(){return g(this.demuxer.firstFrameHeader),{codec:`mp4a.40.${this.demuxer.firstFrameHeader.objectType}`,numberOfChannels:this.getNumberOfChannels(),sampleRate:this.getSampleRate()}}async getPacketAtIndex(t,e){if(t===-1)return null;let r=this.demuxer.loadedSamples[t];if(!r)return null;let n;if(e.metadataOnly)n=Se;else{let a=this.demuxer.reader.requestSlice(r.dataStart,r.dataSize);if(v(a)&&(a=await a),!a)return null;n=D(a,r.dataSize)}return new j(n,"key",r.timestamp,r.duration,t,r.dataSize)}getFirstPacket(t){return this.getPacketAtIndex(0,t)}async getNextPacket(t,e){let r=await this.demuxer.readingMutex.acquire();try{let n=ur(this.demuxer.loadedSamples,t.timestamp,s=>s.timestamp);if(n===-1)throw new Error("Packet was not created from this track.");let a=n+1;for(;a>=this.demuxer.loadedSamples.length&&!this.demuxer.lastSampleLoaded;)await this.demuxer.advanceReader();return this.getPacketAtIndex(a,e)}finally{r()}}async getPacket(t,e){let r=await this.demuxer.readingMutex.acquire();try{for(;;){let n=Q(this.demuxer.loadedSamples,t,a=>a.timestamp);if(n===-1&&this.demuxer.loadedSamples.length>0)return null;if(this.demuxer.lastSampleLoaded)return this.getPacketAtIndex(n,e);if(n>=0&&n+1<this.demuxer.loadedSamples.length)return this.getPacketAtIndex(n,e);await this.demuxer.advanceReader()}}finally{r()}}getKeyPacket(t,e){return this.getPacket(t,e)}getNextKeyPacket(t,e){return this.getNextPacket(t,e)}};var js=i=>i===0?null:i===1?192:i>=2&&i<=5?144*2**i:i===6?"uncommon-u8":i===7?"uncommon-u16":i>=8&&i<=15?2**i:null,Dd=(i,t)=>{switch(i){case 0:return t;case 1:return 88200;case 2:return 176400;case 3:return 192e3;case 4:return 8e3;case 5:return 16e3;case 6:return 22050;case 7:return 24e3;case 8:return 32e3;case 9:return 44100;case 10:return 48e3;case 11:return 96e3;case 12:return"uncommon-u8";case 13:return"uncommon-u16";case 14:return"uncommon-u16-10";default:return null}},Xs=i=>{let t=0,e=new q(D(i,1));for(;e.readBits(1)===1;)t++;if(t===0)return e.readBits(7);let r=[],n=t-1,a=new q(D(i,n)),s=8-t-1;for(let c=0;c<s;c++)r.unshift(e.readBits(1));for(let c=0;c<n;c++)for(let u=0;u<8;u++){let l=a.readBits(1);u<2||r.unshift(l)}return r.reduce((c,u,l)=>c|u<<l,0)},$s=(i,t)=>{if(t==="uncommon-u16")return be(i)+1;if(t==="uncommon-u8")return N(i)+1;if(typeof t=="number")return t;ie(t),g(!1)},Vd=(i,t)=>t==="uncommon-u16"?be(i):t==="uncommon-u16-10"?be(i)*10:t==="uncommon-u8"?N(i):typeof t=="number"?t:null,Ud=i=>{let e=0;for(let r of i){e^=r;for(let n=0;n<8;n++)(e&128)!==0?e=e<<1^7:e<<=1,e&=255}return e};var Ys=class extends Ie{constructor(e){super(e);this.loadedSamples=[];this.metadataPromise=null;this.trackBacking=null;this.metadataTags={};this.audioInfo=null;this.lastLoadedPos=null;this.blockingBit=null;this.readingMutex=new ze;this.lastSampleLoaded=!1;this.reader=e._reader}async getMetadataTags(){return await this.readMetadata(),this.metadataTags}async getTrackBackings(){return await this.readMetadata(),g(this.trackBacking),[this.trackBacking]}async getMimeType(){return"audio/flac"}async readMetadata(){return this.metadataPromise??=(async()=>{let e=0;for(;;){let r=this.reader.requestSlice(e,De);if(v(r)&&(r=await r),!r){this.lastSampleLoaded=!0;return}let n=Ye(r);if(!n)break;let a=this.reader.requestSlice(r.filePos,n.size);v(a)&&(a=await a),g(a),Kr(a,n,this.metadataTags),e=r.filePos+n.size}for(e+=4;this.reader.fileSize===null||e<this.reader.fileSize;){let r=this.reader.requestSlice(e,4);if(v(r)&&(r=await r),e+=4,r===null)throw new Error(`Metadata block at position ${e} is too small! Corrupted file.`);g(r);let n=N(r),a=_t(r),s=(n&128)!==0;switch(n&127){case 0:{let c=this.reader.requestSlice(e,a);if(v(c)&&(c=await c),g(c),c===null)throw new Error(`StreamInfo block at position ${e} is too small! Corrupted file.`);let u=D(c,34),l=new q(u),m=l.readBits(16),d=l.readBits(16),f=l.readBits(24),p=l.readBits(24),b=l.readBits(20),h=l.readBits(3)+1;l.readBits(5);let y=l.readBits(36);l.skipBits(16*8);let k=new Uint8Array(42);k.set(new Uint8Array([102,76,97,67]),0),k.set(new Uint8Array([128,0,0,34]),4),k.set(u,8),this.audioInfo={numberOfChannels:h,sampleRate:b,totalSamples:y,minimumBlockSize:m,maximumBlockSize:d,minimumFrameSize:f,maximumFrameSize:p,description:k},this.trackBacking=new tu(this);break}case 4:{let c=this.reader.requestSlice(e,a);v(c)&&(c=await c),g(c),Nn(D(c,a),this.metadataTags);break}case 6:{let c=this.reader.requestSlice(e,a);v(c)&&(c=await c),g(c);let u=M(c),l=M(c),m=we.decode(D(c,l)),d=M(c),f=we.decode(D(c,d));c.skip(16);let p=M(c),b=D(c,p);this.metadataTags.images??=[],this.metadataTags.images.push({data:b,mimeType:m,kind:u===3?"coverFront":u===4?"coverBack":"unknown",description:f});break}default:break}if(e+=a,s){this.lastLoadedPos=e;break}}if(!this.audioInfo)throw new Error("Missing STREAMINFO metadata block! Corrupted FLAC file.")})()}async readNextFlacFrame({startPos:e,isFirstPacket:r}){g(this.audioInfo);let n=6,a=16,s=10,o=this.audioInfo.maximumBlockSize*this.audioInfo.numberOfChannels*4+a+2,c=this.audioInfo.minimumFrameSize||s,l=(this.audioInfo.maximumFrameSize||o)+a,m=await this.reader.requestSliceRange(e,a,l);if(!m)return null;let d=this.readFlacFrameHeader({slice:m,isFirstPacket:r});if(!d)return null;for(m.filePos=e+c;;){if(m.filePos>m.end-n)return{num:d.num,blockSize:d.blockSize,sampleRate:d.sampleRate,size:m.end-e,isLastFrame:!0};if(N(m)===255){let p=m.filePos,b=N(m),h=this.blockingBit===1?249:248;if(b!==h){m.filePos=p;continue}m.skip(-2);let y=m.filePos-e,k=this.readFlacFrameHeader({slice:m,isFirstPacket:!1});if(!k){m.filePos=p;continue}if(this.blockingBit===0){if(k.num-d.num!==1){m.filePos=p;continue}}else if(k.num-d.num!==d.blockSize){m.filePos=p;continue}return{num:d.num,blockSize:d.blockSize,sampleRate:d.sampleRate,size:y,isLastFrame:!1}}}}readFlacFrameHeader({slice:e,isFirstPacket:r}){let n=e.filePos,a=D(e,4),s=new q(a);if(s.readBits(15)!==32764)return null;if(this.blockingBit===null){g(r);let y=s.readBits(1);this.blockingBit=y}else if(this.blockingBit===1){if(g(!r),s.readBits(1)!==1)return null}else if(this.blockingBit===0){if(g(!r),s.readBits(1)!==0)return null}else throw new Error("Invalid blocking bit");let c=js(s.readBits(4));if(!c)return null;g(this.audioInfo);let u=Dd(s.readBits(4),this.audioInfo.sampleRate);if(!u||(s.readBits(4),s.readBits(3),s.readBits(1)!==0))return null;let m=Xs(e),d=$s(e,c),f=Vd(e,u);if(f===null||f!==this.audioInfo.sampleRate)return null;let p=e.filePos-n,b=N(e);e.skip(-p),e.skip(-1);let h=Ud(D(e,p));return b!==h?null:{num:m,blockSize:d,sampleRate:f}}async advanceReader(){await this.readMetadata(),g(this.lastLoadedPos!==null),g(this.audioInfo);let e=this.lastLoadedPos,r=await this.readNextFlacFrame({startPos:e,isFirstPacket:this.loadedSamples.length===0});if(!r){this.lastSampleLoaded=!0;return}let n=this.loadedSamples[this.loadedSamples.length-1],s={blockOffset:n?n.blockOffset+n.blockSize:0,blockSize:r.blockSize,byteOffset:e,byteSize:r.size};if(this.lastLoadedPos=this.lastLoadedPos+r.size,this.loadedSamples.push(s),r.isLastFrame){this.lastSampleLoaded=!0;return}}},tu=class{constructor(t){this.demuxer=t}getType(){return"audio"}getId(){return 1}getNumber(){return 1}getCodec(){return"flac"}getInternalCodecId(){return null}getNumberOfChannels(){return g(this.demuxer.audioInfo),this.demuxer.audioInfo.numberOfChannels}getSampleRate(){return g(this.demuxer.audioInfo),this.demuxer.audioInfo.sampleRate}getName(){return null}getLanguageCode(){return ae}getTimeResolution(){return g(this.demuxer.audioInfo),this.demuxer.audioInfo.sampleRate}isRelativeToUnixEpoch(){return!1}getUnixTimeForTimestamp(){return null}getPairingMask(){return 1n}getBitrate(){return null}getAverageBitrate(){return null}async getDurationFromMetadata(){return g(this.demuxer.audioInfo),this.demuxer.audioInfo.totalSamples===0?null:this.demuxer.audioInfo.totalSamples/this.demuxer.audioInfo.sampleRate}async getLiveRefreshInterval(){return null}getDisposition(){return{..._e}}async getDecoderConfig(){return g(this.demuxer.audioInfo),{codec:"flac",numberOfChannels:this.demuxer.audioInfo.numberOfChannels,sampleRate:this.demuxer.audioInfo.sampleRate,description:this.demuxer.audioInfo.description}}async getPacket(t,e){if(g(this.demuxer.audioInfo),t<0)return null;let r=await this.demuxer.readingMutex.acquire();try{for(;;){let n=Q(this.demuxer.loadedSamples,t,c=>c.blockOffset/this.demuxer.audioInfo.sampleRate);if(n===-1){await this.demuxer.advanceReader();continue}let a=this.demuxer.loadedSamples[n],s=a.blockOffset/this.demuxer.audioInfo.sampleRate,o=a.blockSize/this.demuxer.audioInfo.sampleRate;if(s+o<=t){if(this.demuxer.lastSampleLoaded)return this.getPacketAtIndex(this.demuxer.loadedSamples.length-1,e);await this.demuxer.advanceReader();continue}return this.getPacketAtIndex(n,e)}}finally{r()}}async getNextPacket(t,e){let r=await this.demuxer.readingMutex.acquire();try{let n=t.sequenceNumber+1;if(this.demuxer.lastSampleLoaded&&n>=this.demuxer.loadedSamples.length)return null;for(;n>=this.demuxer.loadedSamples.length&&!this.demuxer.lastSampleLoaded;)await this.demuxer.advanceReader();return this.getPacketAtIndex(n,e)}finally{r()}}getKeyPacket(t,e){return this.getPacket(t,e)}getNextKeyPacket(t,e){return this.getNextPacket(t,e)}async getPacketAtIndex(t,e){let r=this.demuxer.loadedSamples[t];if(!r)return null;let n;if(e.metadataOnly)n=Se;else{let o=this.demuxer.reader.requestSlice(r.byteOffset,r.byteSize);if(v(o)&&(o=await o),!o)return null;n=D(o,r.byteSize)}g(this.demuxer.audioInfo);let a=r.blockOffset/this.demuxer.audioInfo.sampleRate,s=r.blockSize/this.demuxer.audioInfo.sampleRate;return new j(n,"key",a,s,t,r.byteSize)}async getFirstPacket(t){for(;this.demuxer.loadedSamples.length===0&&!this.demuxer.lastSampleLoaded;)await this.demuxer.advanceReader();return this.getPacketAtIndex(0,t)}};var Zs=i=>{let t="video/MP2T",e=[...new Set(i.filter(Boolean))];return e.length>0&&(t+=`; codecs="${e.join(", ")}"`),t};var Wd="PES packet is missing PTS where it was expected. PES packets without PTS are not currently supported. If you think this file should be supported, please report it.",zd=5,Tp=1212435798,wp=1212436562,Sp=1146376960,Ap=new Set([133,134,162]),Nd=new Set,Js=class extends Ie{constructor(e){super(e);this.metadataPromise=null;this.elementaryStreams=[];this.trackBackingEntries=[];this.packetOffset=0;this.packetStride=-1;this.sectionEndPositions=[];this.seekChunkSize=5*1024*1024;this.minReferencePointByteDistance=-1;this.timestampWrapInfo=null;this.reader=e._reader}async readMetadata(){return this.metadataPromise??=(async()=>{let e=205,r=this.reader.requestSlice(0,e);v(r)&&(r=await r),g(r);let n=D(r,e);if(n[0]===71&&n[188]===71)this.packetOffset=0,this.packetStride=188;else if(n[0]===71&&n[204]===71)this.packetOffset=0,this.packetStride=204;else if(n[4]===71&&n[196]===71)this.packetOffset=4,this.packetStride=192;else throw new Error("Unreachable.");let a=256;this.minReferencePointByteDistance=a*this.packetStride;let s=this.packetOffset,o=null,c=!1,u=!1;for(;;){let l=await this.readPacketHeader(s);if(!l)break;if(l.payloadUnitStartIndicator===0){s+=this.packetStride;continue}if(u&&!this.elementaryStreams.some(h=>h.pid===l.pid)){s+=this.packetStride;continue}let m=await this.readSection(s,!0,!u);if(!m)break;let d=3,f=32,p=!1;if(!u&&m.pid!==0&&!(m.payload[0]===0&&m.payload[1]===0&&m.payload[2]===1)){let y=new q(m.payload),k=y.readAlignedByte();y.skipBits(8*k),p=y.readBits(8)===2}if(m.pid===0&&!c){let h=new q(m.payload),y=h.readAlignedByte();h.skipBits(8*y),h.skipBits(14);let k=h.readBits(10);for(h.skipBits(40);8*(k+d)-h.pos>f;){let T=h.readBits(16);h.skipBits(3);let w=h.readBits(13);if(T!==0){if(o!==null)throw new Error("Only files with a single program are supported.");o=w}}if(o===null)throw new Error("Program Association Table must link to a Program Map Table.");c=!0}else if((m.pid===o||p)&&!u){let h=new q(m.payload),y=h.readAlignedByte();h.skipBits(8*y),h.skipBits(12);let k=h.readBits(12);h.skipBits(43);let T=h.readBits(13);h.skipBits(6);let w=h.readBits(10),x=h.pos+8*w,C=!1;for(;h.pos<x;){let P=h.readBits(8),A=h.readBits(8),S=h.pos+8*A;if(P===zd&&A>=4){let I=h.readBits(32);C||=I===Tp||I===wp}h.pos=S}for(h.pos=x;8*(k+d)-h.pos>f;){let P=h.readBits(8);h.skipBits(3);let A=h.readBits(13);h.skipBits(6);let S=h.readBits(10),I=h.pos+8*S,E=!1,R=!1,_=!1;for(;h.pos<I;){let B=h.readBits(8),W=h.readBits(8),Y=h.pos+8*W;if(B===106)E=!0;else if(B===122||B===204)R=!0;else if(B===123)_=!0;else if(B===zd&&W>=4){let G=h.readBits(32);_||=(G&4294967040)===Sp}h.pos=Y}let z=null,V=C&&Ap.has(P)?130:P;switch(V){case 27:case 36:z={type:"video",codec:P===27?"avc":"hevc",decoderConfig:null,avcCodecInfo:null,hevcCodecInfo:null,colorSpace:{primaries:null,transfer:null,matrix:null,fullRange:null},width:-1,height:-1,squarePixelWidth:-1,squarePixelHeight:-1,reorderSize:-1};break;case 3:case 4:case 15:case 129:case 135:case 130:case 138:{let B;V===3||V===4?B="mp3":V===15?B="aac":V===129?B="ac3":V===135?B="eac3":B="dts",z={type:"audio",codec:B,decoderConfig:null,aacCodecInfo:null,dtsFormat:null,numberOfChannels:-1,sampleRate:-1}}break;case 6:R?z={type:"audio",codec:"eac3",decoderConfig:null,aacCodecInfo:null,dtsFormat:null,numberOfChannels:-1,sampleRate:-1}:E?z={type:"audio",codec:"ac3",decoderConfig:null,aacCodecInfo:null,dtsFormat:null,numberOfChannels:-1,sampleRate:-1}:_&&(z={type:"audio",codec:"dts",decoderConfig:null,aacCodecInfo:null,dtsFormat:null,numberOfChannels:-1,sampleRate:-1});break;default:Nd.has(P)||(U._warn(`Note: MPEG-TS streams with stream_type 0x${P.toString(16)} are not currently supported.`),Nd.add(P))}z&&this.elementaryStreams.push({demuxer:this,pid:A,streamType:P,initialized:!1,firstSection:null,canBeTrustedWithKeyPackets:!1,info:z,referencePesPackets:[]})}u=!0}else{let h=this.elementaryStreams.find(y=>y.pid===m.pid);e:if(h&&!h.initialized){let y=on(this,m,!0);if(!y)throw new Error(`Couldn't read first PES packet for Elementary Stream with PID ${h.pid}`);if(h.firstSection=m,h.canBeTrustedWithKeyPackets=m.randomAccessIndicator===1,this.input._initInput){let w=(await this.input._initInput._getDemuxer()).elementaryStreams.find(x=>x.pid===m.pid&&x.info.codec===h.info.codec);if(w){h.info=w.info,h.initialized=!0;break e}}let k=new wi(h,y);if(h.info.type==="video"){for(;;){let T=k;if(T.suppliedPacket=null,await k.markNextPacket(),h.info.codec==="avc"){if(!k.suppliedPacket)throw new Error("Invalid AVC video stream; could not extract AVCDecoderConfigurationRecord from any packet.");if(h.info.avcCodecInfo=Br(k.suppliedPacket.data),!h.info.avcCodecInfo)continue;let w=h.info.avcCodecInfo.sequenceParameterSets[0];g(w);let x=Or(w);h.info.width=x.displayWidth,h.info.height=x.displayHeight;let C=x.pixelAspectRatio.num,P=x.pixelAspectRatio.den;C>0&&P>0&&(C>P?(h.info.squarePixelWidth=Math.round(h.info.width*C/P),h.info.squarePixelHeight=h.info.height):(h.info.squarePixelWidth=h.info.width,h.info.squarePixelHeight=Math.round(h.info.height*P/C))),h.info.colorSpace={primaries:ot[x.colourPrimaries],transfer:ct[x.transferCharacteristics],matrix:ut[x.matrixCoefficients],fullRange:!!x.fullRangeFlag},h.info.reorderSize=x.maxDecFrameBuffering;break}else if(h.info.codec==="hevc"){if(!k.suppliedPacket)throw new Error("Invalid HEVC video stream; could not extract HVCDecoderConfigurationRecord from first packet.");if(h.info.hevcCodecInfo=Dr(k.suppliedPacket.data),!h.info.hevcCodecInfo)continue;let x=h.info.hevcCodecInfo.arrays.find(P=>P.nalUnitType===33).nalUnits[0];g(x);let C=Un(x);h.info.width=C.displayWidth,h.info.height=C.displayHeight,C.pixelAspectRatio.num>C.pixelAspectRatio.den?(h.info.squarePixelWidth=Math.round(h.info.width*C.pixelAspectRatio.num/C.pixelAspectRatio.den),h.info.squarePixelHeight=h.info.height):(h.info.squarePixelWidth=h.info.width,h.info.squarePixelHeight=Math.round(h.info.height*C.pixelAspectRatio.den/C.pixelAspectRatio.num)),h.info.colorSpace={primaries:ot[C.colourPrimaries],transfer:ct[C.transferCharacteristics],matrix:ut[C.matrixCoefficients],fullRange:!!C.fullRangeFlag},h.info.reorderSize=C.maxDecFrameBuffering;break}else throw new Error("Unhandled.")}h.info.decoderConfig={codec:Ki({width:h.info.width,height:h.info.height,codec:h.info.codec,codecDescription:null,colorSpace:h.info.colorSpace,avcType:1,avcCodecInfo:h.info.avcCodecInfo,hevcCodecInfo:h.info.hevcCodecInfo,vp9CodecInfo:null,av1CodecInfo:null,proresFormat:null}),codedWidth:h.info.width,codedHeight:h.info.height,colorSpace:h.info.colorSpace},(h.info.width!==h.info.squarePixelWidth||h.info.height!==h.info.squarePixelHeight)&&(h.info.decoderConfig.displayAspectWidth=h.info.squarePixelWidth,h.info.decoderConfig.displayAspectHeight=h.info.squarePixelHeight),h.initialized=!0}else{if(await k.markNextPacket(),!k.suppliedPacket)throw new Error(`Couldn't parse first media packet for Elementary Stream with PID ${h.pid}`);if(h.info.codec==="aac"){let T=Ee.tempFromBytes(k.suppliedPacket.data),w=Ze(T);if(!w)throw new Error("Invalid AAC audio stream; could not read ADTS frame header from first packet.");h.info.aacCodecInfo={isMpeg2:!1,objectType:w.objectType},h.info.numberOfChannels=Kt[w.channelConfiguration],h.info.sampleRate=mt[w.samplingFrequencyIndex]}else if(h.info.codec==="mp3"){let T=M(Ee.tempFromBytes(k.suppliedPacket.data)),w=Lr(T,k.suppliedPacket.data.byteLength);if(!w.header)throw new Error("Invalid MP3 audio stream; could not read frame header from first packet.");h.info.numberOfChannels=Wr(w.header.channel),h.info.sampleRate=w.header.sampleRate}else if(h.info.codec==="ac3"){let T=cs(k.suppliedPacket.data);if(!T)throw new Error("Invalid AC-3 audio stream; could not read sync frame from first packet.");if(T.fscod===3)throw new Error("Invalid AC-3 audio stream; reserved sample rate code found in first packet.");h.info.numberOfChannels=Wn[T.acmod]+T.lfeon,h.info.sampleRate=bi[T.fscod]}else if(h.info.codec==="eac3"){let T=us(k.suppliedPacket.data);if(!T)throw new Error("Invalid E-AC-3 audio stream; could not read sync frame from first packet.");let w=ls(T);if(w===null)throw new Error("Invalid E-AC-3 audio stream; reserved sample rate code found in first packet.");h.info.numberOfChannels=ds(T),h.info.sampleRate=w}else if(h.info.codec==="dts"){let T=Qn(k.suppliedPacket.data);if(!T)throw new Error("Invalid DTS audio stream; could not read frame header from first packet.");h.info.numberOfChannels=T.numberOfChannels,h.info.sampleRate=T.sampleRate,T.core&&(h.info.dtsFormat=T.hasExtensions?"dtsh":"dtsc")}else throw new Error("Unhandled.");h.info.decoderConfig={codec:Qi({codec:h.info.codec,codecDescription:null,aacCodecInfo:h.info.aacCodecInfo,dtsFormat:h.info.dtsFormat}),numberOfChannels:h.info.numberOfChannels,sampleRate:h.info.sampleRate},h.initialized=!0}}}if(u&&this.elementaryStreams.every(h=>h.initialized))break;s+=this.packetStride}if(!u)throw c?new Error("No Program Map Table found in the file."):new Error("No Program Association Table found in the file.");for(let l of this.elementaryStreams)l.initialized&&(l.info.type==="video"?this.trackBackingEntries.push(new ru(l)):this.trackBackingEntries.push(new iu(l)))})()}async getTrackBackings(){return await this.readMetadata(),this.trackBackingEntries}async getMetadataTags(){return{}}async getMimeType(){await this.readMetadata();let e=await Promise.all(this.trackBackingEntries.map(r=>r.getDecoderConfig().then(n=>n?.codec??null)));return Zs(e)}async readSection(e,r,n=!1){let a=e,s=e,o=[],c=0,u=null,l=!0,m=0;for(;;){let f=await this.readPacket(s);if(s+=this.packetStride,!f)break;if(u){if(f.pid!==u.pid){if(n)break;continue}if(f.payloadUnitStartIndicator===1)break}else{if(f.payloadUnitStartIndicator===0)break;u=f}let p=!!(f.adaptationFieldControl&2),b=!!(f.adaptationFieldControl&1),h=0;if(p&&(h=1+f.body[0],f===u&&h>1&&(m=f.body[1]>>6&1)),b&&(h===0?(o.push(f.body),c+=f.body.byteLength):(o.push(f.body.subarray(h)),c+=f.body.byteLength-h)),a=s,!r&&c>=64){l=!1;break}if(ur(this.sectionEndPositions,a,k=>k)!==-1){l=!1;break}}if(l){let f=Q(this.sectionEndPositions,a,p=>p);this.sectionEndPositions.splice(f+1,0,a)}if(!u)return null;let d;if(o.length===1)d=o[0];else{let f=o.reduce((b,h)=>b+h.length,0);d=new Uint8Array(f);let p=0;for(let b of o)d.set(b,p),p+=b.length}return{startPos:e,endPos:r?a:null,pid:u.pid,payload:d,randomAccessIndicator:m}}async readPacketHeader(e){let r=this.reader.requestSlice(e,4);if(v(r)&&(r=await r),!r)return null;if(N(r)!==71)throw new Error("Invalid TS packet sync byte. Likely an internal bug, please report this file.");let a=be(r),s=a>>15,o=a>>14&1,c=a>>13&1,u=a&8191,l=N(r),m=l>>6,d=l>>4&3,f=l&15;return{payloadUnitStartIndicator:o,pid:u,adaptationFieldControl:d}}async readPacket(e){let r=this.reader.requestSlice(e,188);if(v(r)&&(r=await r),!r)return null;let n=D(r,188);if(n[0]!==71)throw new Error("Invalid TS packet sync byte. Likely an internal bug, please report this file.");let s=(n[1]<<8)+n[2],o=s>>15,c=s>>14&1,u=s>>13&1,l=s&8191,m=n[3],d=m>>6,f=m>>4&3,p=m&15;return{payloadUnitStartIndicator:c,pid:l,adaptationFieldControl:f,body:n.subarray(4)}}normalizeTimestamp(e){if(!this.timestampWrapInfo){let a=60*9e4;this.timestampWrapInfo={reference:e-a,offset:e>=8589934592-a?-8589934592:8589934592}}let{reference:r,offset:n}=this.timestampWrapInfo;return n<0&&e>=r||n>0&&e<r?e+n:e}},Ti=(i,t,e)=>{if(t.payload.byteLength<3)return null;let r=new q(t.payload);if(r.readBits(24)!==1)return null;let a=r.readBits(8);if(r.skipBits(16),a===188||a===190||a===191||a===240||a===241||a===255||a===242||a===248)return null;r.skipBits(8);let s=r.readBits(2);r.skipBits(14);let o=null;if(s===2||s===3)o=0,r.skipBits(4),o+=r.readBits(3)*(1<<30),r.skipBits(1),o+=r.readBits(15)*32768,r.skipBits(1),o+=r.readBits(15),o=i.normalizeTimestamp(o);else if(e)throw new Error(Wd);return{sectionStartPos:t.startPos,sectionEndPos:t.endPos,pts:o,randomAccessIndicator:t.randomAccessIndicator}},on=(i,t,e)=>{g(t.endPos!==null);let r=Ti(i,t,e);if(!r)return null;let n=new q(t.payload);n.skipBits(32);let a=n.readBits(16),s=6;n.skipBits(16);let o=n.readBits(8),c=n.pos+8*o;n.pos=c;let u=c/8;g(Number.isInteger(u));let l=t.payload.subarray(u,a>0?s+a:t.payload.byteLength);return{...r,data:l}},eo=class i{constructor(t){this.elementaryStream=t;this.packetBuffers=new WeakMap;this.packetSectionStarts=new WeakMap}getId(){return this.elementaryStream.pid}getNumber(){let t=this.elementaryStream.demuxer,e=this.elementaryStream.info.type,r=0;for(let n of t.trackBackingEntries)if(n.getType()===e&&r++,g(n instanceof i),n.elementaryStream===this.elementaryStream)break;return r}getCodec(){throw new Error("Not implemented on base class.")}getInternalCodecId(){return this.elementaryStream.streamType}getName(){return null}getLanguageCode(){return ae}getDisposition(){return{..._e,primary:!1}}getTimeResolution(){return 9e4}isRelativeToUnixEpoch(){return!1}getUnixTimeForTimestamp(){return null}getPairingMask(){return 1n}getBitrate(){return null}getAverageBitrate(){return null}async getDurationFromMetadata(){return null}async getLiveRefreshInterval(){return null}createEncodedPacket(t,e,r){let n;return this.allPacketsAreKeyPackets()?n="key":n=t.randomAccessIndicator===1?"key":"delta",new j(r.metadataOnly?Se:t.data,n,t.pts/9e4,Math.max(e/9e4,0),t.sequenceNumber,t.data.byteLength)}async getFirstPacket(t){let e=this.elementaryStream.firstSection;g(e);let r=on(this.elementaryStream.demuxer,e,!0);g(r);let n=new wi(this.elementaryStream,r),a=new ia(this,n),s=await a.readNext();if(!s)return null;let o=this.createEncodedPacket(s.packet,s.duration,t);return this.packetBuffers.set(o,a),this.packetSectionStarts.set(o,s.packet.sectionStartPos),o}async getNextPacket(t,e){let r=this.packetBuffers.get(t);if(r){let l=await r.readNext();if(!l)return null;this.packetBuffers.delete(t);let m=this.createEncodedPacket(l.packet,l.duration,e);return this.packetBuffers.set(m,r),this.packetSectionStarts.set(m,l.packet.sectionStartPos),m}let n=this.packetSectionStarts.get(t);if(n===void 0)throw new Error("Packet was not created from this track.");let a=this.elementaryStream.demuxer,s=await a.readSection(n,!0);g(s);let o=on(a,s,!0);g(o);let c=new wi(this.elementaryStream,o);r=new ia(this,c);let u=t.sequenceNumber;for(;;){let l=await r.readNext();if(!l)return null;if(l.packet.sequenceNumber>u){let m=this.createEncodedPacket(l.packet,l.duration,e);return this.packetBuffers.set(m,r),this.packetSectionStarts.set(m,l.packet.sectionStartPos),m}}}async getNextKeyPacket(t,e){let r=t;for(;;){if(r=await this.getNextPacket(r,e),!r)return null;if(r.type==="key")return r}}getPacket(t,e){return this.doPacketLookup(t,!1,e)}getKeyPacket(t,e){return this.doPacketLookup(t,!0,e)}async doPacketLookup(t,e,r){let n=lr(t*9e4),a=this.elementaryStream.demuxer,{reader:s,seekChunkSize:o}=a,c=this.elementaryStream.pid,u=async(w,x,C)=>{let P=w;for(;P<x;){let A=await a.readPacketHeader(P);if(!A)return null;if(A.pid===c&&A.payloadUnitStartIndicator===1){let S=await a.readSection(P,C);if(!S)return null;let I=Ti(a,S,!1);if(I&&I.pts!==null)return{pesPacketHeader:I,section:S}}P+=a.packetStride}return null},l=this.elementaryStream.firstSection;g(l);let m=Ti(a,l,!0);if(g(m),n<m.pts)return null;let d,f=this.elementaryStream.referencePesPackets,p=Q(f,n,w=>w.pts),b=p!==-1?f[p]:null;if(b&&n-b.pts<9e4/2)d=b.sectionStartPos;else{let w=0;if(s.fileSize!==null){let x=Math.ceil(s.fileSize/o);if(x>1){let C=0,P=x-1;for(w=C;C<=P;){let A=Math.floor((C+P)/2),S=Ka(A*o,a.packetStride)+m.sectionStartPos,I=S+o,E=await u(S,I,!1);if(!E){P=A-1;continue}E.pesPacketHeader.pts<=n?(w=A,C=A+1):P=A-1}}}d=Ka(w*o,a.packetStride)+m.sectionStartPos}let y=(await u(d,s.fileSize??1/0,!1))?.pesPacketHeader??null;y||(y=m);let k=this.getReorderSize(),T=async(w,x)=>{let C=await a.readSection(w,!0);g(C);let P=on(a,C,!0);g(P);let A=new wi(this.elementaryStream,P),S=new ia(this,A);for(;!((ee(S.presentationOrderPackets)?.pts??-1/0)>=n||!await S.readNextPacket()););let I=Rr(S.presentationOrderPackets,x);if(I===-1)return null;let E=S.presentationOrderPackets[I],R=I===0?0:E.pts-S.presentationOrderPackets[I-1].pts;for(;S.decodeOrderPackets[0]!==E;)S.decodeOrderPackets.shift();S.lastDuration=R;let _=await S.readNext();g(_);let z=this.createEncodedPacket(_.packet,_.duration,r);return this.packetBuffers.set(z,S),this.packetSectionStarts.set(z,_.packet.sectionStartPos),z};if(!e||this.allPacketsAreKeyPackets()){e:for(;;){let w=y.sectionStartPos+a.packetStride;for(;;){let x=await a.readPacketHeader(w);if(!x)break e;if(x.pid===c&&x.payloadUnitStartIndicator===1){let C=await a.readSection(w,!1);if(C){let P=Ti(a,C,!1);if(P&&P.pts!==null){if(P.pts>n)break e;y=P,nu(this.elementaryStream,y);break}}}w+=a.packetStride}}e:for(let w=0;w<k+1;w++){let x=y.sectionStartPos-a.packetStride;for(;x>=a.packetOffset;){let C=await a.readPacketHeader(x);if(!C)break e;if(C.pid===c&&C.payloadUnitStartIndicator===1){let P=await a.readSection(x,!1);if(P){let A=Ti(a,P,!1);if(A&&A.pts!==null){y=A;break}}}x-=a.packetStride}}return T(y.sectionStartPos,w=>w.pts<=n)}else{let w=d,x=null,C=!this.elementaryStream.canBeTrustedWithKeyPackets;for(;;){let P=null,A=w<=m.sectionStartPos,S,I=null;if(A)S=m,I=l;else{let _=await u(w,s.fileSize??1/0,C);S=_?.pesPacketHeader??null,I=_?.section??null}let E=!1,R=0;e:for(;S&&!(x!==null&&S.sectionStartPos>=x);){if(S.pts<=n){let z;if(this.elementaryStream.canBeTrustedWithKeyPackets)z=S.randomAccessIndicator===1;else{g(I);let V=on(a,I,!0);g(V);let B=new wi(this.elementaryStream,V);await B.markNextPacket(),z=B.suppliedPacket?.randomAccessIndicator===1}z&&(P=S)}if(S.pts>n&&(E=!0),E&&(R++,R>k))break;let _=S.sectionStartPos+a.packetStride;for(;;){let z=await a.readPacketHeader(_);if(!z)break e;if(z.pid===c&&z.payloadUnitStartIndicator===1){let V=await a.readSection(_,C);if(V){let B=Ti(a,V,!1);if(B&&B.pts!==null){S=B,I=V,nu(this.elementaryStream,S);break}}}_+=a.packetStride}}if(P){let _=P;if(R===0)e:for(let V=0;V<k;V++){let B=_.sectionStartPos-a.packetStride;for(;B>=a.packetOffset;){let W=await a.readPacketHeader(B);if(!W)break e;if(W.pid===c&&W.payloadUnitStartIndicator===1){let Y=await a.readSection(B,C);if(Y){let G=Ti(a,Y,!1);if(G&&G.pts!==null){_=G;break}}}B-=a.packetStride}}let z=await T(_.sectionStartPos,V=>V.pts<=n&&V.randomAccessIndicator===1);return g(z),z}if(A)return null;x=w,w=Math.max(Ka(w-m.sectionStartPos-o,a.packetStride)+m.sectionStartPos,m.sectionStartPos)}}}},ru=class extends eo{getType(){return"video"}getCodec(){return this.elementaryStream.info.codec}getCodedWidth(){return this.elementaryStream.info.width}getCodedHeight(){return this.elementaryStream.info.height}getSquarePixelWidth(){return this.elementaryStream.info.squarePixelWidth}getSquarePixelHeight(){return this.elementaryStream.info.squarePixelHeight}getRotation(){return 0}async getColorSpace(){return this.elementaryStream.info.colorSpace}async canBeTransparent(){return!1}async getDecoderConfig(){return g(this.elementaryStream.info.decoderConfig),this.elementaryStream.info.decoderConfig}allPacketsAreKeyPackets(){return!1}getReorderSize(){return this.elementaryStream.info.reorderSize}},iu=class extends eo{getType(){return"audio"}getCodec(){return this.elementaryStream.info.codec}getNumberOfChannels(){return this.elementaryStream.info.numberOfChannels}getSampleRate(){return this.elementaryStream.info.sampleRate}async getDecoderConfig(){return g(this.elementaryStream.info.decoderConfig),this.elementaryStream.info.decoderConfig}allPacketsAreKeyPackets(){return!0}getReorderSize(){return 0}},nu=(i,t)=>{let e=i.referencePesPackets,r=Q(e,t.sectionStartPos,n=>n.sectionStartPos);if(r>=0){let n=e[r];if(t.pts<=n.pts)return!1;let a=i.demuxer.minReferencePointByteDistance;if(t.sectionStartPos-n.sectionStartPos<a)return!1;if(r<e.length-1){let s=e[r+1];if(s.pts<t.pts||s.sectionStartPos-t.sectionStartPos<a)return!1}}return e.splice(r+1,0,t),!0},wi=class{constructor(t,e){this.currentPos=0;this.pesPackets=[];this.currentPesPacketIndex=0;this.currentPesPacketPos=0;this.endPos=0;this.lastSuppliedPesPacket=null;this.nextPts=null;this.suppliedPacket=null;this.elementaryStream=t,this.pid=t.pid,this.demuxer=t.demuxer,this.startingPesPacket=e}ensureBuffered(t){let e=this.endPos-this.currentPos;return e>=t?t:this.bufferData(t-e).then(()=>Math.min(this.endPos-this.currentPos,t))}getCurrentPesPacket(){let t=this.pesPackets[this.currentPesPacketIndex];return g(t),t}async bufferData(t){let e=this.endPos+t;for(;this.endPos<e;){let r;if(this.pesPackets.length===0)r=this.startingPesPacket;else{let n=ee(this.pesPackets).sectionEndPos;for(g(n!==null);;){let a=await this.demuxer.readPacketHeader(n);if(!a)return;if(a.pid===this.pid){let s=await this.demuxer.readSection(n,!0);if(!s)return;let o=on(this.demuxer,s,!1);if(o){r=o;break}}n+=this.demuxer.packetStride}}this.pesPackets.push(r),this.endPos+=r.data.byteLength}}readBytes(t){let e=this.getCurrentPesPacket(),r=this.currentPos-this.currentPesPacketPos,n=r+t;if(this.currentPos+=t,n<=e.data.byteLength)return e.data.subarray(r,n);let a=new Uint8Array(t);a.set(e.data.subarray(r));let s=e.data.byteLength-r;for(;;){this.advanceCurrentPacket();let o=this.getCurrentPesPacket(),c=t-s;if(c<=o.data.byteLength){a.set(o.data.subarray(0,c),s);break}a.set(o.data,s),s+=o.data.byteLength}return a}readU8(){let t=this.getCurrentPesPacket(),e=this.currentPos-this.currentPesPacketPos;return this.currentPos++,e<t.data.byteLength?t.data[e]:(this.advanceCurrentPacket(),t=this.getCurrentPesPacket(),t.data[0])}seekTo(t){if(t!==this.currentPos){if(t<this.currentPos)for(;t<this.currentPesPacketPos;){this.currentPesPacketIndex--;let e=this.getCurrentPesPacket();this.currentPesPacketPos-=e.data.byteLength}else for(;;){let e=this.getCurrentPesPacket(),r=this.currentPesPacketPos+e.data.byteLength;if(t<r)break;this.currentPesPacketPos+=e.data.byteLength,this.currentPesPacketIndex++}this.currentPos=t}}skip(t){this.seekTo(this.currentPos+t)}advanceCurrentPacket(){this.currentPesPacketPos+=this.getCurrentPesPacket().data.byteLength,this.currentPesPacketIndex++}async markNextPacket(){g(!this.suppliedPacket);let t=this.elementaryStream;if(t.info.type==="video"){let e=t.info.codec,r=1024;if(e!=="avc"&&e!=="hevc")throw new Error("Unhandled.");let n=e==="avc"?1:2,a=null,s=!1,o=0;for(;;){let c=this.ensureBuffered(r);if(v(c)&&(c=await c),c===0)break;let u=this.currentPos,l=this.readBytes(c),m=l.byteLength,d=0;for(;d<m;){let f=l.indexOf(0,d);if(f===-1||f>=m)break;d=f;let p=u+d;if(d+3>=m){this.seekTo(p);break}let b=l[d+1],h=l[d+2],y=l[d+3],k=0;if(b===0&&h===0&&y===1?k=4:b===0&&h===1&&(k=3),k===0){d++;continue}let T=p;a??=T;let w=d+k,x=w+n,C=6;if(x+(e==="avc"?C:1)>m){this.seekTo(p);break}let A=l[w],S,I,E;if(e==="avc")S=Gt(A),I=S===1||S===2||S===5,E=S===6||S===7||S===8||S===9;else{if(S=Ct(A),((A&1)<<5|l[w+1]>>3)>0){d+=k;continue}I=S<=9||S>=16&&S<=21,E=S>=32&&S<=37||S===39||S>=41&&S<=44||S>=48&&S<=55}let R=!1;if(I){let _;if(e==="avc"){let z=l.subarray(x,x+C),V=O(new q(z));_=!s||V<=o,o=V}else _=l[x]>>7===1;_&&(s?R=!0:s=!0)}else E&&s&&(R=!0);if(R){let _=T-a;return this.seekTo(a),this.supplyPacket(_,0)}d+=k}if(c<r)break}if(a!==null&&this.endPos>a){let c=this.endPos-a;return this.seekTo(a),this.supplyPacket(c,0)}}else{let e=t.info.codec,r=128;for(;;){let n=this.ensureBuffered(r);v(n)&&(n=await n);let a=this.currentPos;for(;this.currentPos-a<n;){let s=this.readU8();if(e==="aac"){if(s!==255)continue;this.skip(-1);let o=this.currentPos,c=this.ensureBuffered(dt);if(v(c)&&(c=await c),c<dt)return;let u=this.readBytes(dt),l=Ze(Ee.tempFromBytes(u));if(l){this.seekTo(o);let m=this.ensureBuffered(l.frameLength);return v(m)&&(m=await m),this.supplyPacket(m,Math.round(ra*9e4/t.info.sampleRate))}else this.seekTo(o+1)}else if(e==="mp3"){if(s!==255)continue;this.skip(-1);let o=this.currentPos,c=this.ensureBuffered(4);if(v(c)&&(c=await c),c<4)return;let u=this.readBytes(4),l=L(u).getUint32(0),m=Lr(l,null);if(m.header){this.seekTo(o);let d=this.ensureBuffered(m.header.totalSize);v(d)&&(d=await d);let f=m.header.audioSamplesInFrame*9e4/t.info.sampleRate;return this.supplyPacket(d,Math.round(f))}else this.seekTo(o+1)}else if(e==="ac3"){if(s!==11)continue;this.skip(-1);let o=this.currentPos,c=this.ensureBuffered(5);if(v(c)&&(c=await c),c<5)return;let u=this.readBytes(5);if(u[0]!==11||u[1]!==119){this.seekTo(o+1);continue}let l=u[4]>>6,m=u[4]&63;if(l===3||m>37){this.seekTo(o+1);continue}let d=Ql[3*m+l];g(d!==void 0),this.seekTo(o),c=this.ensureBuffered(d),v(c)&&(c=await c);let f=Math.round(Gl*9e4/t.info.sampleRate);return this.supplyPacket(c,f)}else if(e==="eac3"){if(s!==11)continue;this.skip(-1);let o=this.currentPos,c=this.ensureBuffered(5);if(v(c)&&(c=await c),c<5)return;let u=this.readBytes(5);if(u[0]!==11||u[1]!==119){this.seekTo(o+1);continue}let m=(((u[2]&7)<<8|u[3])+1)*2,f=u[4]>>6===3?3:u[4]>>4&3,p=Vc[f];this.seekTo(o),c=this.ensureBuffered(m),v(c)&&(c=await c);let b=p*256,h=Math.round(b*9e4/t.info.sampleRate);return this.supplyPacket(c,h)}else if(e==="dts"){if(s!==127&&s!==100)continue;this.skip(-1);let o=this.currentPos,c=this.ensureBuffered(Kn);if(v(c)&&(c=await c),c<Kn)return;let u=this.readBytes(Kn),l=Uc(u),m=l?null:Gn(u);if(!l&&!m){this.seekTo(o+1);continue}if(m&&!m.asset){this.seekTo(o);let b=Math.min(m.frameSize,Xl),h=this.ensureBuffered(b);v(h)&&(h=await h),m=Gn(this.readBytes(h))??m}let d=l?l.frameSize:m.frameSize;if(l){let b=Math.ceil(l.frameSize/4)*4;for(;;){this.seekTo(o);let h=b+ms,y=this.ensureBuffered(h);if(v(y)&&(y=await y),y<h)break;this.seekTo(o+b);let k=Gn(this.readBytes(ms));if(!k)break;b+=k.frameSize,d=b}}let f=l?.sampleCount??m.asset?.sampleCount;if(f===void 0){this.seekTo(o+1);continue}this.seekTo(o),c=this.ensureBuffered(d),v(c)&&(c=await c);let p=Math.round(f*9e4/t.info.sampleRate);return this.supplyPacket(c,p)}else throw new Error("Unhandled.")}if(n<r)break}}}supplyPacket(t,e){let r=this.getCurrentPesPacket(),n;if(this.lastSuppliedPesPacket===r)g(this.nextPts!==null),n=this.nextPts;else{if(r.pts===null)throw new Error(Wd);n=r.pts,nu(this.elementaryStream,r)}this.lastSuppliedPesPacket=r,this.nextPts=n+e;let a=r.sectionStartPos,s=a+(this.currentPos-this.currentPesPacketPos),o=this.readBytes(t),c=r.randomAccessIndicator;if(c===0&&!this.elementaryStream.canBeTrustedWithKeyPackets){if(this.elementaryStream.info.type==="audio")c=1;else if(this.elementaryStream.info.decoderConfig){let u=Ur(this.elementaryStream.info.codec,this.elementaryStream.info.decoderConfig,o)==="key";c=Number(u)}}this.suppliedPacket={pts:n,data:o,sequenceNumber:s,sectionStartPos:a,randomAccessIndicator:c},this.pesPackets.splice(0,this.currentPesPacketIndex),this.currentPesPacketIndex=0}},ia=class{constructor(t,e){this.decodeOrderPackets=[];this.reorderBuffer=[];this.presentationOrderPackets=[];this.reachedEnd=!1;this.lastDuration=0;this.backing=t,this.context=e,this.reorderSize=t.getReorderSize(),g(this.reorderSize>=0)}async readNext(){if(this.decodeOrderPackets.length===0&&!await this.readNextPacket())return null;await this.ensureCurrentPacketHasNext();let t=this.decodeOrderPackets[0],e=this.presentationOrderPackets.indexOf(t);g(e!==-1);let r;for(e===this.presentationOrderPackets.length-1?r=this.lastDuration:(r=this.presentationOrderPackets[e+1].pts-t.pts,this.lastDuration=r),this.decodeOrderPackets.shift();this.presentationOrderPackets.length>0;){let n=this.presentationOrderPackets[0];if(this.decodeOrderPackets.includes(n))break;this.presentationOrderPackets.shift()}return{packet:t,duration:r}}async readNextPacket(){if(this.reachedEnd)return!1;let t;return this.context.suppliedPacket?t=this.context.suppliedPacket:(await this.context.markNextPacket(),t=this.context.suppliedPacket),this.context.suppliedPacket=null,t?(this.decodeOrderPackets.push(t),this.processPacketThroughReorderBuffer(t),!0):(this.reachedEnd=!0,this.flushReorderBuffer(),!1)}async ensureCurrentPacketHasNext(){let t=this.decodeOrderPackets[0];for(g(t);;){let e=this.presentationOrderPackets.indexOf(t);if(e!==-1&&e<=this.presentationOrderPackets.length-2||!await this.readNextPacket())break}}processPacketThroughReorderBuffer(t){if(this.reorderBuffer.push(t),this.reorderBuffer.length>this.reorderSize){let e=0;for(let n=1;n<this.reorderBuffer.length;n++)this.reorderBuffer[n].pts<this.reorderBuffer[e].pts&&(e=n);let r=this.reorderBuffer[e];this.presentationOrderPackets.push(r),this.reorderBuffer.splice(e,1)}}flushReorderBuffer(){this.reorderBuffer.sort((t,e)=>t.pts-e.pts),this.presentationOrderPackets.push(...this.reorderBuffer),this.reorderBuffer.length=0}};var Xt="application/vnd.apple.mpegurl",au="#EXT-X-STREAM-INF:",su="#EXT-X-I-FRAME-STREAM-INF:",ou="#EXT-X-MEDIA:",na="#EXTINF:",cu="#EXT-X-MAP:",uu="#EXT-X-KEY:",lu="#EXT-X-MEDIA-SEQUENCE:",du="#EXT-X-BYTERANGE:",mu="#EXT-X-PROGRAM-DATE-TIME:",Hd="#EXT-X-DISCONTINUITY",fu="#EXT-X-TARGETDURATION:",qd="#EXT-X-ENDLIST",pu="#EXT-X-PLAYLIST-TYPE:",Kd="#EXT-X-I-FRAMES-ONLY",to=i=>i.length===0||i.startsWith("#")&&!i.startsWith("#EXT"),xr=class{constructor(t){this._attributes={};let e="",r="",n=!1,a=!1;for(let s=0;s<t.length;s++){let o=t[s];o==='"'?a=!a:o==="="&&!n&&!a?n=!0:o===","&&!a?(e&&(this._attributes[e.trim().toLowerCase()]=r),e="",r="",n=!1):n?r+=o:e+=o}e&&(this._attributes[e.trim().toLowerCase()]=r)}get(t){return this._attributes[t.toLowerCase()]??null}getAsNumber(t){let e=this.get(t);if(e===null)return null;let r=Number(e);return Number.isFinite(r)?r:null}merge(t){Object.assign(this._attributes,t._attributes)}};var ro=class{constructor(t,e,r){this.nextInputCacheAge=0;this.inputCache=[];this.trackBackingsPromise=null;this.firstSegment=null;this.firstSegmentFirstTimestamps=new WeakMap;this.firstTimestampCache=new WeakMap;this.input=t,this.path=e,this.trackDeclarations=r}async getDurationFromMetadata(t){let e=await this.getSegmentAt(1/0,{skipLiveWait:t.skipLiveWait});return e?e.timestamp+e.duration:null}async getUnixTimeForTimestamp(t){let e=await this.getSegmentAt(t,{});if(e??=await this.getFirstSegment({}),!e||e.unixEpochTimestamp===null)return null;let r=t-e.timestamp;return e.unixEpochTimestamp+r}async getTrackBackings(){return this.trackBackingsPromise??=(async()=>{let t=[];if(this.trackDeclarations){for(let e of this.trackDeclarations)if(e.type==="video"){let r=hi(t,n=>n.getType()==="video")+1;t.push(new no(this,e,r))}else if(e.type==="audio"){let r=hi(t,n=>n.getType()==="audio")+1;t.push(new ao(this,e,r))}}else{if(this.firstSegment=await this.getFirstSegment({}),!this.firstSegment)return[];let r=await this.getInputForSegment(this.firstSegment).getTracks();for(let n of r)if(n.type==="video"){let a=hi(t,s=>s.getType()==="video")+1;t.push(new no(this,{id:t.length+1,type:"video"},a))}else if(n.type==="audio"){let a=hi(t,s=>s.getType()==="audio")+1;t.push(new ao(this,{id:t.length+1,type:"audio"},a))}}return t})()}async getFirstTimestampForInput(t){let e=this.firstTimestampCache.get(t);if(e!==void 0)return e;let r=await t.getFirstTimestamp();return this.firstTimestampCache.set(t,r),r}async getMediaOffset(t,e){let r=t.firstSegment??t,n;if(this.firstSegmentFirstTimestamps.has(r))n=this.firstSegmentFirstTimestamps.get(r);else{let u=this.getInputForSegment(r);n=await this.getFirstTimestampForInput(u),this.firstSegmentFirstTimestamps.set(r,n)}if(r===t)return r.timestamp-n;let a=await this.getFirstTimestampForInput(e),s=t.timestamp-r.timestamp,c=a-n-s;return Math.abs(c)<=Math.min(.25,s)?r.timestamp-n:t.timestamp-a}dispose(){for(let t of this.inputCache)t.input.dispose();this.inputCache.length=0}},io=class{constructor(t,e,r){this.packetInfos=new WeakMap;this.hydrationPromise=null;this.firstInputTrack=null;this.firstSegment=null;this.segmentedInput=t,this.decl=e,this.number=r}hydrate(){return this.hydrationPromise??=(async()=>{if(this.segmentedInput.firstSegment??=await this.segmentedInput.getFirstSegment({}),!this.segmentedInput.firstSegment)throw new Error("Missing first segment, can't retrieve track.");let t=this.segmentedInput.firstSegment,e=null;for(;t&&(e=(await this.segmentedInput.getInputForSegment(t).getTracks()).find(a=>a.type===this.decl.type&&a.number===this.number)??null,!e);)t=await this.segmentedInput.getNextSegment(t,{});if(!e)throw new Error("No matching track found in underlying media data.");this.firstInputTrack=e,this.firstSegment=t})()}getId(){return this.decl.id}getType(){return this.decl.type}getNumber(){return this.number}delegate(t){return this.firstInputTrack?t():this.hydrate().then(t)}async getDecoderConfig(){return this.delegate(()=>this.firstInputTrack._backing.getDecoderConfig())}getHasOnlyKeyPackets(){return this.delegate(()=>this.firstInputTrack._backing.getHasOnlyKeyPackets?.()??null)}getPairingMask(){return 1n}getCodec(){return this.delegate(()=>this.firstInputTrack._backing.getCodec())}getInternalCodecId(){return this.delegate(()=>this.firstInputTrack._backing.getInternalCodecId())}getDisposition(){return this.delegate(()=>this.firstInputTrack._backing.getDisposition())}getLanguageCode(){return this.delegate(()=>this.firstInputTrack._backing.getLanguageCode())}getName(){return this.delegate(()=>this.firstInputTrack._backing.getName())}getTimeResolution(){return this.delegate(()=>this.firstInputTrack._backing.getTimeResolution())}async isRelativeToUnixEpoch(){return await this.hydrate(),g(this.segmentedInput.firstSegment),this.segmentedInput.firstSegment.unixEpochTimestamp===this.segmentedInput.firstSegment.timestamp}getUnixTimeForTimestamp(t){return this.segmentedInput.getUnixTimeForTimestamp(t)}getBitrate(){return this.delegate(()=>this.firstInputTrack._backing.getBitrate())}getAverageBitrate(){return this.delegate(()=>this.firstInputTrack._backing.getAverageBitrate())}getDurationFromMetadata(t){return this.segmentedInput.getDurationFromMetadata(t)}getLiveRefreshInterval(){return this.segmentedInput.getLiveRefreshInterval()}async createAdjustedPacket(t,e,r){g(t.sequenceNumber>=0),g(this.segmentedInput.firstSegment);let n=await this.segmentedInput.getMediaOffset(e,r.input),a=e.timestamp-this.segmentedInput.firstSegment.timestamp,s=t.clone({timestamp:Nt(t.timestamp+n,await r.getTimeResolution()),sequenceNumber:Math.floor(1e8*a)+t.sequenceNumber});return this.packetInfos.set(s,{segment:e,track:r,sourcePacket:t}),s}async getFirstPacket(t){await this.hydrate(),g(this.firstInputTrack),g(this.firstSegment);let e=this.firstInputTrack,r=this.firstSegment;for(;;){if(e){let s=await e._backing.getFirstPacket(t);if(s)return this.createAdjustedPacket(s,r,e)}if(r=await this.segmentedInput.getNextSegment(r,{skipLiveWait:t.skipLiveWait}),!r)break;e=(await this.segmentedInput.getInputForSegment(r).getTracks()).find(s=>s.type===this.firstInputTrack.type&&s.number===this.firstInputTrack.number)??null}return null}getNextPacket(t,e){return this._getNextInternal(t,e,!1)}getNextKeyPacket(t,e){return this._getNextInternal(t,e,!0)}async _getNextInternal(t,e,r){let n=this.packetInfos.get(t);if(!n)throw new Error("Packet was not created from this track.");let a=r?await n.track._backing.getNextKeyPacket(n.sourcePacket,e):await n.track._backing.getNextPacket(n.sourcePacket,e);if(a)return this.createAdjustedPacket(a,n.segment,n.track);let s=n.segment;for(;;){let o=await this.segmentedInput.getNextSegment(s,{skipLiveWait:e.skipLiveWait});if(!o)return null;let l=(await this.segmentedInput.getInputForSegment(o).getTracks()).find(d=>d.type===n.track.type&&d.number===n.track.number);if(!l){s=o;continue}let m=await l._backing.getFirstPacket(e);return m?this.createAdjustedPacket(m,o,l):null}}getPacket(t,e){return this._getPacketInternal(t,e,!1)}getKeyPacket(t,e){return this._getPacketInternal(t,e,!0)}async _getPacketInternal(t,e,r){let n=await this.segmentedInput.getSegmentAt(t,{skipLiveWait:e.skipLiveWait});if(!n)return null;for(await this.hydrate();n;){let a=this.segmentedInput.getInputForSegment(n),o=(await a.getTracks()).find(m=>m.type===this.firstInputTrack.type&&m.number===this.firstInputTrack.number);if(!o){n=await this.segmentedInput.getPreviousSegment(n,{skipLiveWait:e.skipLiveWait});continue}let c=await this.segmentedInput.getMediaOffset(n,a),u=t-c,l=r?await o._backing.getKeyPacket(u,e):await o._backing.getPacket(u,e);if(!l){n=await this.segmentedInput.getPreviousSegment(n,{skipLiveWait:e.skipLiveWait});continue}return this.createAdjustedPacket(l,n,o)}return null}},no=class extends io{getType(){return"video"}getCodec(){return this.delegate(()=>this.firstInputTrack._backing.getCodec())}getCodedWidth(){return this.delegate(()=>this.firstInputTrack._backing.getCodedWidth())}getCodedHeight(){return this.delegate(()=>this.firstInputTrack._backing.getCodedHeight())}getSquarePixelWidth(){return this.delegate(()=>this.firstInputTrack._backing.getSquarePixelWidth())}getSquarePixelHeight(){return this.delegate(()=>this.firstInputTrack._backing.getSquarePixelHeight())}getRotation(){return this.delegate(()=>this.firstInputTrack._backing.getRotation())}async getColorSpace(){return this.delegate(()=>this.firstInputTrack._backing.getColorSpace())}async canBeTransparent(){return this.delegate(()=>this.firstInputTrack._backing.canBeTransparent())}async getDecoderConfig(){return this.delegate(()=>this.firstInputTrack._backing.getDecoderConfig())}},ao=class extends io{getType(){return"audio"}getCodec(){return this.delegate(()=>this.firstInputTrack._backing.getCodec())}getNumberOfChannels(){return this.delegate(()=>this.firstInputTrack._backing.getNumberOfChannels())}getSampleRate(){return this.delegate(()=>this.firstInputTrack._backing.getSampleRate())}async getDecoderConfig(){return this.delegate(()=>this.firstInputTrack._backing.getDecoderConfig())}};var Qd=dl(hu(),1);Li();var Gd=typeof Qd<"u"?Qd:void 0,bu=0,yu=1/0,gu=null;typeof FinalizationRegistry<"u"&&(gu=new FinalizationRegistry(i=>{i()}));var Ve=class extends Ge{constructor(){super();this._disposed=!1;this._refCount=0;this._usedForHls=!1;this._refFinalizationRegistry=null;this._sizePromise=null;this.onread=null;typeof FinalizationRegistry<"u"&&(this._refFinalizationRegistry=new FinalizationRegistry(e=>{e._decrementRefCount()}))}async getSizeOrNull(){if(this._disposed)throw new ke;return this._sizePromise??=(async()=>{let e=this._getFileSize();return e!==void 0||(await this._read(0,1,bu,yu),e=this._getFileSize(),g(e!==void 0)),e})()}async getSize(){if(this._disposed)throw new ke;let e=await this.getSizeOrNull();if(e===null)throw new Error("Cannot determine the size of an unsized source.");return e}slice(e,r){if(!Number.isInteger(e)||e<0)throw new TypeError("offset must be a non-negative integer.");if(r!==void 0&&(!Number.isInteger(r)||r<0))throw new TypeError("length, when provided, must be a non-negative integer.");return new sa(this,e,r)}_dispatchRead(e,r){this.onread?.(e,r),this._emit("read",{start:e,end:r})}ref(){return new Gr(this)}_incrementRefCount(){this._refCount++}_decrementRefCount(){this._refCount--,this._refCount===0&&(this._dispose(),this._disposed=!0)}},Gr=class{constructor(t){this._freed=!1;if(t._disposed)throw new Error("Cannot ref a disposed source.");t._incrementRefCount(),t._refFinalizationRegistry?.register(this,t,this),this._source=t}get source(){if(!this._source)throw new Error("Can't get source; ref has already been freed.");return this._source}get freed(){return this._freed}free(){if(this._freed)throw new Error("Illegal operation: double free on SourceRef.");let t=this.source;g(t._refCount>0),t._decrementRefCount(),t._refFinalizationRegistry?.unregister(this),this._freed=!0,this._source=null}[Symbol.dispose](){this.freed||this.free()}},qe=class extends Ve{constructor(e,r){if(typeof e!="string")throw new TypeError("rootPath must be a string.");if(typeof r!="function")throw new TypeError("requestHandler must be a function.");super();this.rootPath=e;this.requestHandler=r}_resolveRequest(e){let r=this.requestHandler(e),n=a=>{if(!(a instanceof Ve||a instanceof Gr))throw new TypeError("requestHandler must return or resolve to a Source or SourceRef.");let s=a instanceof Ve?a.ref():a;return s.source._usedForHls||=this._usedForHls,s};return v(r)?r.then(n):n(r)}},ku=(i,t)=>i.path===t.path,un=class extends qe{constructor(){super(...arguments);this._root=null;this._rootRequest=null}_read(e,r,n,a){if(!this._root){if(!this._rootRequest){let s=this._resolveRequest({path:this.rootPath,isRoot:!0}),o=c=>{let u=c instanceof Ve?c.ref():c;return this._root=u,this._rootRequest=null,u};v(s)?this._rootRequest=s.then(o):(o(s),g(this._root))}if(this._rootRequest)return this._rootRequest.then(s=>s.source._read(e,r,n,a))}return this._root.source._read(e,r,n,a)}_getFileSize(){if(this._root)return this._root.source._getFileSize()}_dispose(){this._root?this._root.free():this._rootRequest&&this._rootRequest.then(e=>e.free())}},so=class extends Ve{constructor(e){if(!(e instanceof ArrayBuffer)&&!(typeof SharedArrayBuffer<"u"&&e instanceof SharedArrayBuffer)&&!ArrayBuffer.isView(e))throw new TypeError("buffer must be an ArrayBuffer, SharedArrayBuffer, or ArrayBufferView.");super();this._onreadCalled=!1;this._bytes=Z(e),this._view=L(e)}_getFileSize(){return this._bytes.byteLength}_read(){return this._onreadCalled||(this._dispatchRead(0,this._bytes.byteLength),this._onreadCalled=!0),{bytes:this._bytes,view:this._view,offset:0}}_dispose(){}},jd=typeof FinalizationRegistry<"u"?new FinalizationRegistry(i=>{i.cancel().catch(()=>{})}):null,oo=class extends Ve{constructor(e,r={}){if(!(e instanceof Blob))throw new TypeError("blob must be a Blob.");if(!r||typeof r!="object")throw new TypeError("options must be an object.");if(r.maxCacheSize!==void 0&&(!Me(r.maxCacheSize)||r.maxCacheSize<0))throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");if(r.useStreamReader!==void 0&&typeof r.useStreamReader!="boolean")throw new TypeError("options.useStreamReader, when provided, must be a boolean.");if(r.handleUnhandledError!==void 0&&typeof r.handleUnhandledError!="function")throw new TypeError("options.handleUnhandledError, when provided, must be a function.");super();this._readers=new WeakMap;this._blob=e,this._options=r,this._orchestrator=new aa({maxCacheSize:r.maxCacheSize??8*2**20,maxWorkerCount:4,runWorker:this._runWorker.bind(this),onIdleWorkerRemoved:n=>{let a=this._readers.get(n);a&&(this._readers.delete(n),jd?.unregister(n),a.cancel().catch(()=>{}))},prefetchProfile:Tu.fileSystem,handleUnhandledError:r.handleUnhandledError}),this._orchestrator.fileSize=e.size}_getFileSize(){return this._orchestrator.fileSize}_read(e,r,n,a){return this._orchestrator.read(e,r,n,a)}async _runWorker(e){g(e.strictTarget);let r=this._readers.get(e);for(r===void 0&&("stream"in this._blob&&!Wt()&&this._options.useStreamReader!==!1?(r=this._blob.slice(e.currentPos).stream().getReader(),jd?.register(e,r,e)):r=null,this._readers.set(e,r));e.currentPos<e.targetPos&&!e.aborted;)if(r){let{done:n,value:a}=await r.read();if(n)throw this._orchestrator.onWorkerFinished(e),new Error("Blob reader stopped unexpectedly before all requested data was read.");if(e.aborted)break;this._dispatchRead(e.currentPos,e.currentPos+a.length),this._orchestrator.supplyWorkerData(e,a)}else{let n=await this._blob.slice(e.currentPos,e.targetPos).arrayBuffer();if(e.aborted)break;this._dispatchRead(e.currentPos,e.currentPos+n.byteLength),this._orchestrator.supplyWorkerData(e,new Uint8Array(n))}this._orchestrator.signalWorkerStoppedRunning(e),e.aborted&&await r?.cancel()}_dispose(){this._orchestrator.dispose()}},xp=.5*2**20,Cp=(i,t,e)=>{if(t instanceof Error&&(t.message.includes("Failed to fetch")||t.message.includes("Load failed")||t.message.includes("NetworkError when attempting to fetch resource"))&&typeof window<"u"){let n=null;try{typeof window<"u"&&typeof window.location<"u"&&(n=new URL(e instanceof Request?e.url:e,window.location.href).origin)}catch{}if((typeof navigator<"u"&&typeof navigator.onLine=="boolean"?navigator.onLine:!0)&&n!==null&&n!==window.location.origin)return U._warn("Request will not be retried because a CORS error was suspected due to different origins. You can modify this behavior by providing your own function for the 'getRetryDelay' option."),null}return Math.min(2**(i-2),16)},Xd=new Set,co=class i extends qe{constructor(e,r={}){if(typeof e!="string"&&!(e instanceof URL)&&!(typeof Request<"u"&&e instanceof Request))throw new TypeError("url must be a string, URL or Request.");if(!r||typeof r!="object")throw new TypeError("options must be an object.");if(r.requestInit!==void 0&&(!r.requestInit||typeof r.requestInit!="object"))throw new TypeError("options.requestInit, when provided, must be an object.");if(r.getRetryDelay!==void 0&&typeof r.getRetryDelay!="function")throw new TypeError("options.getRetryDelay, when provided, must be a function.");if(r.maxCacheSize!==void 0&&(!Me(r.maxCacheSize)||r.maxCacheSize<0))throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");if(r.parallelism!==void 0&&(!Number.isInteger(r.parallelism)||r.parallelism<1))throw new TypeError("options.parallelism, when provided, must be a positive number.");if(r.fetchFn!==void 0&&typeof r.fetchFn!="function")throw new TypeError("options.fetchFn, when provided, must be a function.");if(r.handleUnhandledError!==void 0&&typeof r.handleUnhandledError!="function")throw new TypeError("options.handleUnhandledError, when provided, must be a function.");let n=e instanceof Request?e.url:e instanceof URL?e.href:e;super(n,o=>new i(o.path,this._options));this._offset=0;this._length=null;this._fileSizeDetermined=!1;this._sequentialBacking=null;this._url=e,this._options=r,this._getRetryDelay=r.getRetryDelay??Cp,this._requestInit={...r.requestInit};let a=null;if(r.requestInit?.headers){let o={...La(r.requestInit.headers)},c=Object.keys(o).find(u=>u.toLowerCase()==="range");c!==void 0&&(a=o[c],delete o[c],this._requestInit.headers=o)}if(e instanceof Request){let o=e.headers.get("Range");if(o!==null){a??=o;let c=new Request(e);c.headers.delete("Range"),this._url=c}}if(a!==null){let o=Ip(a);o&&(this._offset=o.offset,this._length=o.length)}let s=2;this._orchestrator=new aa({maxCacheSize:r.maxCacheSize??64*2**20,maxWorkerCount:r.parallelism??s,runWorker:this._runWorker.bind(this),prefetchProfile:Tu.network,handleUnhandledError:r.handleUnhandledError})}_getFileSize(){if(!this._fileSizeDetermined)return this._length!==null?this._length:void 0;let e=this._sequentialBacking?this._sequentialBacking._endIndex:this._orchestrator.fileSize;return e===null?this._length!==null?this._length:null:ne(e-this._offset,0,this._length??1/0)}_read(e,r,n,a){if(this._length!==null&&r>this._length)return null;let s=this._offset,o=this._sequentialBacking?this._sequentialBacking._read(s+e,s+r):this._orchestrator.read(s+e,s+r,Math.max(s+n,s),s+Math.min(a,this._length??1/0)),c=u=>u?(u.offset-=this._offset,u):null;return v(o)?o.then(c):c(o)}async _runWorker(e){for(;;){let r=new AbortController,n=await Ic(this._options.fetchFn??fetch,this._url,Pc(this._requestInit,{headers:{Range:`bytes=${e.currentPos}-`},signal:r.signal}),this._getRetryDelay,()=>this._disposed);if(!n.ok)throw new Error(`Error fetching ${String(this._url)}: ${n.status} ${n.statusText}`);n.redirected&&(this.rootPath=n.url);e:if(this._orchestrator.fileSize===null&&(n.status===206||n.type==="basic"&&!n.headers.has("Content-Encoding"))){let s=n.headers.get("Content-Range");if(s){let c=/\/(\d+)/.exec(s);if(c){this._orchestrator.supplyFileSize(Number(c[1]));break e}}let o=n.headers.get("Content-Length");if(o){let c=n.status===206?e.currentPos:0;this._orchestrator.supplyFileSize(c+Number(o))}}if(this._fileSizeDetermined=!0,!n.body)throw new Error("Missing HTTP response body stream. The used fetch function must provide the response body as a ReadableStream.");if(n.status!==206){if(this._sequentialBacking){n.body.cancel();return}if(!this._usedForHls){let s=new URL(this._url instanceof Request?this._url.url:this._url,typeof window<"u"?window.location.href:void 0);s.origin!=="null"&&!(s.pathname.endsWith(".m3u8")||s.pathname.endsWith(".m3u"))&&(Xd.has(s.origin)||(U._warn(`HTTP server (origin ${s.origin}) did not respond to a range request with 206 Partial Content, meaning the resource will now be streamed sequentially, with old data being evicted from the cache. Reads into evicted regions will throw. To enable efficient media file streaming across a network, please make sure your server supports range requests. Alternatively, set maxCacheSize to Infinity in the UrlSource options to keep the entire resource in memory.`),Xd.add(s.origin)))}this._transitionToSequentialMode(n.body);return}let a=n.body.getReader();for(;;){if(e.currentPos>=e.targetPos||e.aborted){r.abort(),this._orchestrator.signalWorkerStoppedRunning(e);return}let s;try{s=await a.read()}catch(u){if(this._disposed)throw u;let l=this._getRetryDelay(1,u,this._url);if(l!==null){U._error("Error while reading response stream. Attempting to resume.",u),await Fr(1e3*l);break}else throw u}if(e.aborted)continue;let{done:o,value:c}=s;if(o){if(e.currentPos>=e.targetPos){this._orchestrator.onWorkerFinished(e);return}if(e.strictTarget)break;this._orchestrator.onWorkerFinished(e);return}this._dispatchRead(e.currentPos,e.currentPos+c.length),this._orchestrator.supplyWorkerData(e,c)}}}_transitionToSequentialMode(e){let r=e.getReader(),n=0,a=0,s=new ReadableStream({pull:async u=>{for(;;){let l;try{l=await r.read()}catch(d){if(this._disposed)throw d;let f=this._getRetryDelay(1,d,this._url);if(f===null)throw d;U._error("Error while reading response stream. Attempting to resume.",d),await Fr(1e3*f);let p=await Ic(this._options.fetchFn??fetch,this._url,Pc(this._requestInit,{headers:{Range:`bytes=${n}-`}}),this._getRetryDelay,()=>this._disposed);if(!p.ok)throw new Error(`Error fetching ${String(this._url)}: ${p.status} ${p.statusText}`);if(!p.body)throw new Error("Missing HTTP response body stream. The used fetch function must provide the response body as a ReadableStream.");r=p.body.getReader(),a=p.status===206?0:n;continue}if(l.done){u.close();return}let m=l.value;if(a>0){let d=Math.min(a,m.length);a-=d,m=m.subarray(d)}if(m.length!==0){n+=m.length,u.enqueue(m);return}}},cancel:()=>r.cancel()}),o=new Si(s,{maxCacheSize:this._orchestrator.options.maxCacheSize,handleUnhandledError:this._options.handleUnhandledError});o._endIndex=this._orchestrator.fileSize,o._cacheMissErrorMessage="Attempted to read data from an already-evicted part of the cache. Because the HTTP server did not honor the range request, data can only be read sequentially, with old data being evicted from the cache. To fix this issue, either ensure your server responds to range requests with 206 Partial Content, or set maxCacheSize to Infinity in the UrlSource options. Note that the latter will store the entire file in the cache if needed, no matter how large.",o.on("read",({start:u,end:l})=>this._dispatchRead(u,l)),this._sequentialBacking=o;let c=new Set;for(let u of this._orchestrator.workers){for(let l of u.pendingSlices)c.add(l);u.aborted=!0,u.pendingSlices.length=0}for(let u of this._orchestrator.queuedReads)for(let l of u.pendingSlices)c.add(l);this._orchestrator.workers.length=0,this._orchestrator.queuedReads.length=0;for(let u of c){let l=o._read(u.start,u.start+u.bytes.length);v(l)?l.then(m=>{m?(g(m.offset===u.start),u.resolve(m.bytes)):u.resolve(null)},m=>u.reject(m)):(g(l===null),u.resolve(null))}}_dispose(){this._orchestrator.dispose(),this._sequentialBacking&&(this._sequentialBacking._disposed=!0,this._sequentialBacking._dispose())}},Pp=/^bytes=(\d+)-(\d*)$/,Ip=i=>{let t=Pp.exec(i.trim());if(!t)return null;let e=Number(t[1]),r=t[2]===""?null:Number(t[2]);return r!==null&&r<e?null:{offset:e,length:r!==null?r-e+1:null}},uo=class i extends qe{constructor(e,r={}){if(typeof e!="string")throw new TypeError("filePath must be a string.");if(!r||typeof r!="object")throw new TypeError("options must be an object.");if(r.maxCacheSize!==void 0&&(!Me(r.maxCacheSize)||r.maxCacheSize<0))throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");if(!Gd.fs)throw new Error("FilePathSource is only available in server-side environments (Node.js, Bun, Deno).");super(e,n=>new i(n.path,r));this._fileHandle=null;this._customSource=new ln({getSize:async()=>{let n=await Gd.fs.open(e,"r");return this._fileHandle=n,gu?.register(this,()=>{n.close()},this),(await n.stat()).size},read:async(n,a)=>{g(this._fileHandle);let s=new Uint8Array(a-n);return await this._fileHandle.read(s,0,a-n,n),s},maxCacheSize:r.maxCacheSize,prefetchProfile:"fileSystem",handleUnhandledError:r.handleUnhandledError})}_read(e,r,n,a){return this._customSource._read(e,r,n,a)}_getFileSize(){return this._customSource._getFileSize()}_dispose(){this._customSource._dispose(),this._fileHandle&&(this._fileHandle.close(),this._fileHandle=null,gu?.unregister(this))}},ln=class extends Ve{constructor(t){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(typeof t.getSize!="function")throw new TypeError("options.getSize must be a function.");if(typeof t.read!="function")throw new TypeError("options.read must be a function.");if(t.dispose!==void 0&&typeof t.dispose!="function")throw new TypeError("options.dispose, when provided, must be a function.");if(t.handleUnhandledError!==void 0&&typeof t.handleUnhandledError!="function")throw new TypeError("options.handleUnhandledError, when provided, must be a function.");if(t.maxCacheSize!==void 0&&(!Me(t.maxCacheSize)||t.maxCacheSize<0))throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");if(t.prefetchProfile&&!["none","fileSystem","network"].includes(t.prefetchProfile))throw new TypeError("options.prefetchProfile, when provided, must be one of 'none', 'fileSystem' or 'network'.");super(),this._options=t,this._orchestrator=new aa({maxCacheSize:t.maxCacheSize??8*2**20,maxWorkerCount:2,prefetchProfile:Tu[t.prefetchProfile??"none"],runWorker:this._runWorker.bind(this),handleUnhandledError:t.handleUnhandledError})}_getFileSize(){return this._orchestrator.fileSize??void 0}_read(t,e,r,n){if(this._orchestrator.fileSize!==null)return this._orchestrator.read(t,e,r,n);let a=this._options.getSize();if(v(a))return a.then(s=>{if(!Number.isInteger(s)||s<0)throw new TypeError("options.getSize must return or resolve to a non-negative integer.");return this._orchestrator.fileSize=s,this._orchestrator.read(t,e,r,n)});if(!Number.isInteger(a)||a<0)throw new TypeError("options.getSize must return or resolve to a non-negative integer.");return this._orchestrator.fileSize=a,this._orchestrator.read(t,e,r,n)}async _runWorker(t){for(;t.currentPos<t.targetPos&&!t.aborted;){let e=t.currentPos,r=t.targetPos,n=this._options.read(t.currentPos,r);if(v(n)&&(n=await n),t.aborted)break;if(n instanceof Uint8Array){if(n=Z(n),n.length!==r-t.currentPos)throw new Error(`options.read returned a Uint8Array with unexpected length: Requested ${r-t.currentPos} bytes, but got ${n.length}.`);this._dispatchRead(t.currentPos,t.currentPos+n.length),this._orchestrator.supplyWorkerData(t,n)}else if(n instanceof ReadableStream){let a=n.getReader();for(;t.currentPos<r&&!t.aborted;){let{done:s,value:o}=await a.read();if(s){if(t.currentPos<r)throw new Error(`ReadableStream returned by options.read ended before supplying enough data. Requested ${r-e} bytes, but got ${t.currentPos-e}`);break}if(!(o instanceof Uint8Array))throw new TypeError("ReadableStream returned by options.read must yield Uint8Array chunks.");if(t.aborted)break;let c=Z(o);this._dispatchRead(t.currentPos,t.currentPos+c.length),this._orchestrator.supplyWorkerData(t,c)}}else throw new TypeError("options.read must return or resolve to a Uint8Array or a ReadableStream.")}this._orchestrator.signalWorkerStoppedRunning(t)}_dispose(){this._orchestrator.dispose(),this._options.dispose?.()}},$d=ln,Si=class extends Ve{constructor(e,r={}){if(!(e instanceof ReadableStream))throw new TypeError("stream must be a ReadableStream.");if(!r||typeof r!="object")throw new TypeError("options must be an object.");if(r.handleUnhandledError!==void 0&&typeof r.handleUnhandledError!="function")throw new TypeError("options.handleUnhandledError, when provided, must be a function.");if(r.maxCacheSize!==void 0&&(!Me(r.maxCacheSize)||r.maxCacheSize<0))throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");super();this._reader=null;this._cache=[];this._pendingSlices=[];this._currentIndex=0;this._targetIndex=0;this._maxRequestedIndex=0;this._endIndex=null;this._pulling=!1;this._cacheMissErrorMessage="Attempted to read data from an already-evicted part of the cache. With ReadableStreamSource, you must access the data more sequentially or increase the size of its cache.";this._stream=e,this._maxCacheSize=r.maxCacheSize??32*2**20,this._handleUnhandledError=r.handleUnhandledError}_getFileSize(){return this._endIndex}_read(e,r){if(this._endIndex!==null&&r>this._endIndex)return null;this._maxRequestedIndex=Math.max(this._maxRequestedIndex,r);let n=Q(this._cache,e,m=>m.start),a=n!==-1?this._cache[n]:null;if(a&&a.start<=e&&r<=a.end)return{bytes:a.bytes,view:a.view,offset:a.start};let s=e,o=new Uint8Array(r-e);if(n!==-1)for(let m=n;m<this._cache.length;m++){let d=this._cache[m];if(d.start>=r)break;let f=Math.max(e,d.start);f>s&&this._throwDueToCacheMiss();let p=Math.min(r,d.end);f<p&&(o.set(d.bytes.subarray(f-d.start,p-d.start),f-e),s=p)}if(s===r)return{bytes:o,view:L(o),offset:e};this._currentIndex>s&&this._throwDueToCacheMiss();let{promise:c,resolve:u,reject:l}=te();return this._pendingSlices.push({start:e,end:r,bytes:o,resolve:u,reject:l}),this._targetIndex=Math.max(this._targetIndex,r),this._pulling||(this._pulling=!0,this._pull().catch(m=>{if(this._pulling=!1,this._pendingSlices.length>0)this._pendingSlices.forEach(d=>d.reject(m)),this._pendingSlices.length=0;else if(this._handleUnhandledError)this._handleUnhandledError(m);else throw m})),c}_throwDueToCacheMiss(){throw new Error(this._cacheMissErrorMessage)}async _pull(){for(this._reader??=this._stream.getReader();this._currentIndex<this._targetIndex&&!this._disposed;){let{done:e,value:r}=await this._reader.read();if(e){for(let s of this._pendingSlices)s.resolve(null);this._pendingSlices.length=0,this._endIndex=this._currentIndex;break}let n=this._currentIndex,a=this._currentIndex+r.byteLength;this._dispatchRead(n,a);for(let s=0;s<this._pendingSlices.length;s++){let o=this._pendingSlices[s],c=Math.max(n,o.start),u=Math.min(a,o.end);c<u&&(o.bytes.set(r.subarray(c-n,u-n),c-o.start),u===o.end&&(o.resolve({bytes:o.bytes,view:L(o.bytes),offset:o.start}),this._pendingSlices.splice(s,1),s--))}for(this._cache.push({start:n,end:a,bytes:r,view:L(r),age:0});this._cache.length>0;){let s=this._cache[0];if(this._maxRequestedIndex-s.end<=this._maxCacheSize)break;this._cache.shift()}this._currentIndex+=r.byteLength}this._pulling=!1}_dispose(){for(let e of this._pendingSlices)e.reject(new ke);this._pendingSlices.length=0,this._cache.length=0,this._reader?.cancel()}},Tu={none:(i,t)=>({start:i,end:t}),fileSystem:(i,t)=>(i=Math.floor((i-65536)/65536)*65536,t=Math.ceil((t+65536)/65536)*65536,{start:i,end:t}),network:(i,t,e)=>{i=Math.max(0,Math.floor((i-65536)/65536)*65536);for(let n of e){let s=Math.max((n.startPos+n.targetPos)/2,n.targetPos-8388608);if(Ga(i,t,s,n.targetPos)){let o=n.targetPos-n.startPos,c=Math.ceil((o+1)/8388608)*8388608,u=2**Math.ceil(Math.log2(o+1)),l=Math.min(u,c);t=Math.max(t,n.startPos+l)}}return t=Math.max(t,i+xp),{start:i,end:t}}},aa=class{constructor(t){this.options=t;this.fileSize=null;this.nextAge=0;this.workers=[];this.cache=[];this.currentCacheSize=0;this.disposed=!1;this.queuedReads=[]}read(t,e,r,n){g(!this.disposed);let a=this.options.prefetchProfile(t,e,this.workers),s=Math.max(a.start,r),o=Math.min(a.end,this.fileSize??1/0,n);g(s<=t&&e<=o);let c=null,u=Q(this.cache,t,x=>x.start),l=u!==-1?this.cache[u]:null;l&&l.start<=t&&e<=l.end&&(l.age=this.nextAge++,c={bytes:l.bytes,view:l.view,offset:l.start});let m=Q(this.cache,s,x=>x.start),d=c?null:new Uint8Array(e-t),f=0,p=s,b=[];if(m!==-1){for(let x=m;x<this.cache.length;x++){let C=this.cache[x];if(C.start>=o)break;if(C.end<=s)continue;let P=Math.max(s,C.start),A=Math.min(o,C.end);if(g(P<=A),p<P&&b.push({start:p,end:P}),p=A,d){let S=Math.max(t,C.start),I=Math.min(e,C.end);if(S<I){let E=S-t;d.set(C.bytes.subarray(S-C.start,I-C.start),E),E===f&&(f=I-t)}}C.age=this.nextAge++}p<o&&b.push({start:p,end:o})}else b.push({start:s,end:o});if(d&&f>=d.length&&(c={bytes:d,view:L(d),offset:t}),b.length===0)return g(c),c;let{promise:h,resolve:y,reject:k}=te(),T=[];for(let x of b){let C=Math.max(t,x.start),P=Math.min(e,x.end);C===x.start&&P===x.end?T.push(x):C<P&&T.push({start:C,end:P})}let w=d&&{start:t,bytes:d,holes:T,resolve:y,reject:k};e:for(let x of b){for(let A of this.workers)if(this.checkHoleAgainstWorker(A,x,w?[w]:[])){this.checkQueuedReadsAgainstWorker(A);continue e}let C=x.end<o||this.fileSize!==null,P=this.createWorker(x.start,x.end,C);if(P)w&&(P.pendingSlices=[w]),this.runWorker(P);else{let A=Q(this.queuedReads,x.start,I=>I.hole.start),S=A!==-1?this.queuedReads[A]:null;for(S&&x.start<=S.hole.end?(S.hole.end=Math.max(S.hole.end,x.end),S.strictTarget&&=C,w&&S.pendingSlices.push(w)):(A++,S={hole:{start:x.start,end:x.end},strictTarget:C,pendingSlices:w?[w]:[],age:this.nextAge++},this.queuedReads.splice(A,0,S));A+1<this.queuedReads.length;){let I=this.queuedReads[A+1];if(I.hole.start>S.hole.end)break;S.hole.end=Math.max(S.hole.end,I.hole.end),S.pendingSlices.push(...I.pendingSlices),S.strictTarget&&=I.strictTarget,S.age=Math.min(S.age,I.age),this.queuedReads.splice(A+1,1)}}}return c?h.catch(x=>{if(!this.disposed)if(this.options.handleUnhandledError)this.options.handleUnhandledError(x);else throw x}):(g(d),c=h.then(x=>x&&{bytes:x,view:L(x),offset:t})),c}checkHoleAgainstWorker(t,e,r){if(Ga(e.start-131072,e.start,t.currentPos,t.targetPos)){t.targetPos=Math.max(t.targetPos,e.end);for(let a=0;a<r.length;a++){let s=r[a];t.pendingSlices.includes(s)||t.pendingSlices.push(s)}return t.running||this.runWorker(t),!0}return!1}checkQueuedReadsAgainstWorker(t){let e=!1;for(let r=0;r<this.queuedReads.length;r++){let n=this.queuedReads[r];if(this.checkHoleAgainstWorker(t,n.hole,n.pendingSlices))this.queuedReads.splice(r,1),r--,e=!0;else if(e)break}}createWorker(t,e,r){if(this.workers.length>=this.options.maxWorkerCount){let a=null,s=null;for(let o=0;o<this.workers.length;o++){let c=this.workers[o];!c.running&&c.pendingSlices.length===0&&(!a||c.age<a.age)&&(s=o,a=c)}if(a)g(s!==null),g(a.pendingSlices.length===0),this.workers.splice(s,1),this.options.onIdleWorkerRemoved?.(a);else return null}let n={startPos:t,currentPos:t,targetPos:e,strictTarget:r,running:!1,aborted:this.disposed,pendingSlices:[],age:this.nextAge++};return this.workers.push(n),n}runWorker(t){g(!t.running),g(t.currentPos<t.targetPos),t.running=!0,t.age=this.nextAge++,this.options.runWorker(t).catch(e=>{if(t.running=!1,t.pendingSlices.length>0)t.pendingSlices.forEach(r=>r.reject(e)),t.pendingSlices.length=0;else if(!t.aborted&&!this.disposed)if(this.options.handleUnhandledError)this.options.handleUnhandledError(e);else throw e}).finally(()=>{if(!t.running&&this.queuedReads.length>0){let e=0;for(let a=1;a<this.queuedReads.length;a++)this.queuedReads[a].age<this.queuedReads[e].age&&(e=a);let r=this.queuedReads[e],n=this.createWorker(r.hole.start,r.hole.end,r.strictTarget);if(!n)return;this.queuedReads.splice(e,1),n.pendingSlices=r.pendingSlices,this.runWorker(n)}})}supplyWorkerData(t,e){g(!t.aborted);let r=t.currentPos,n=r+e.length;this.insertIntoCache({start:r,end:n,bytes:e,view:L(e),age:this.nextAge++}),t.currentPos+=e.length,t.currentPos>t.targetPos&&(t.targetPos=t.currentPos,this.checkQueuedReadsAgainstWorker(t));for(let a=0;a<t.pendingSlices.length;a++){let s=t.pendingSlices[a],o=Math.max(r,s.start),c=Math.min(n,s.start+s.bytes.length);o<c&&s.bytes.set(e.subarray(o-r,c-r),o-s.start);for(let u=0;u<s.holes.length;u++){let l=s.holes[u];r<=l.start&&n>l.start&&(l.start=n),l.end<=l.start&&(s.holes.splice(u,1),u--)}s.holes.length===0&&(s.resolve(s.bytes),t.pendingSlices.splice(a,1),a--)}for(let a=0;a<this.workers.length;a++){let s=this.workers[a];t===s||s.running||Ga(r,n,s.currentPos,s.targetPos)&&(this.workers.splice(a,1),this.options.onIdleWorkerRemoved?.(s),a--)}}supplyFileSize(t){g(this.fileSize===null),this.fileSize=t;for(let e of this.workers){e.targetPos=Math.min(e.targetPos,t),e.strictTarget=!0;for(let r=0;r<e.pendingSlices.length;r++){let n=e.pendingSlices[r];for(let a of n.holes)if(a.end>t){n.resolve(null),e.pendingSlices.splice(r,1),r--;break}}}for(let e=0;e<this.queuedReads.length;e++){let r=this.queuedReads[e];if(r.hole.start>=t){for(let n of r.pendingSlices)n.resolve(null);this.queuedReads.splice(e,1),e--}else if(r.hole.end>t){r.hole.end=t,r.strictTarget=!0;for(let n=0;n<r.pendingSlices.length;n++){let a=r.pendingSlices[n];a.start>=t&&(a.resolve(null),r.pendingSlices.splice(n,1),n--)}}}}signalWorkerStoppedRunning(t){t.running=!1,t.aborted||(t.pendingSlices.length=0)}onWorkerFinished(t){let e=this.workers.indexOf(t);g(e!==-1),t.running=!1,this.workers.splice(e,1),this.options.onIdleWorkerRemoved?.(t),this.fileSize===null&&this.supplyFileSize(t.currentPos);for(let r of t.pendingSlices)r.resolve(null)}insertIntoCache(t){if(this.options.maxCacheSize===0)return;let e=Q(this.cache,t.start,r=>r.start)+1;if(e>0){let r=this.cache[e-1];if(r.end>=t.end)return;if(r.end>t.start){let n=new Uint8Array(t.end-r.start);n.set(r.bytes,0),n.set(t.bytes,t.start-r.start),this.currentCacheSize+=t.end-r.end,r.bytes=n,r.view=L(n),r.end=t.end,e--,t=r}else this.cache.splice(e,0,t),this.currentCacheSize+=t.bytes.length}else this.cache.splice(e,0,t),this.currentCacheSize+=t.bytes.length;for(let r=e+1;r<this.cache.length;r++){let n=this.cache[r];if(t.end<=n.start)break;if(t.end>=n.end){this.cache.splice(r,1),this.currentCacheSize-=n.bytes.length,r--;continue}let a=new Uint8Array(n.end-t.start);a.set(t.bytes,0),a.set(n.bytes,n.start-t.start),this.currentCacheSize-=t.end-n.start,t.bytes=a,t.view=L(a),t.end=n.end,this.cache.splice(r,1);break}for(;this.currentCacheSize>this.options.maxCacheSize;){let r=0,n=this.cache[0];for(let a=1;a<this.cache.length;a++){let s=this.cache[a];s.age<n.age&&(r=a,n=s)}if(this.currentCacheSize-n.bytes.length<=this.options.maxCacheSize)break;this.cache.splice(r,1),this.currentCacheSize-=n.bytes.length}}dispose(){for(let t of this.workers){for(let e of t.pendingSlices)e.reject(new ke);t.pendingSlices.length=0,t.aborted=!0,t.running||this.options.onIdleWorkerRemoved?.(t)}for(let t of this.queuedReads)for(let e of t.pendingSlices)e.reject(new ke);this.workers.length=0,this.cache.length=0,this.queuedReads.length=0,this.disposed=!0}};var sa=class extends Ve{constructor(e,r,n){super();this._ref=null;if(e._disposed)throw new Error("Cannot create a slice of a disposed source.");this._baseSource=e,this._offset=r,this._length=n??null}_getFileSize(){let e=this._baseSource._getFileSize();return e===void 0?this._length!==null?this._length:void 0:e===null?this._length!==null?this._length:null:ne(e-this._offset,0,this._length??1/0)}_read(e,r,n,a){if(this._length!==null&&r>this._length)return null;let s=this._baseSource._read(this._offset+e,this._offset+r,this._offset+n,this._offset+a),o=c=>c?(c.offset-=this._offset,c):null;return v(s)?s.then(o):o(s)}_dispose(){this._ref?.free()}ref(){return this._ref??=this._baseSource.ref(),super.ref()}};var Ep=/^0[xX][0-9a-fA-F]+$/,vp=/^data:.*;base64,/i,oa=class extends ro{constructor(e,r,n,a){super(e.input,r,n);this.segments=[];this.nextLines=null;this.currentUpdateSegmentsPromise=null;this.streamHasEnded=!1;this.lastSegmentUpdateTime=-1/0;this.refreshInterval=5;this.rootPath=r,this.demuxer=e,this.nextLines=a}runUpdateSegments(){return this.currentUpdateSegmentsPromise??=(async()=>{try{let e=this.getRemainingWaitTimeMs();e>0&&await Fr(e),this.lastSegmentUpdateTime=performance.now(),await this.updateSegments()}finally{this.currentUpdateSegmentsPromise=null}})()}getRemainingWaitTimeMs(){let e=performance.now()-this.lastSegmentUpdateTime,r=Math.max(0,1e3*this.refreshInterval-e);return r<=50?0:r}async updateSegments(){let e=this.nextLines;if(this.nextLines=null,!e){var w=[];try{let A=at(w,await this.demuxer.input._getSourceUncached({path:this.rootPath,isRoot:!1}));let S=new jr(A.source);let I=await S.requestEntireFile();g(I);e=lo(I,I.length,{ignore:to});A.source instanceof qe&&(this.rootPath=A.source.rootPath)}catch(x){var C=x,P=!0}finally{st(w,C,P)}}let r=this.input._formatOptions.hls?.offsetTimestampsByDateTime!==!1,n=!1,a=0,s=null,o=null,c=null,u=0,l=null,m=null,d=null,f=null,p=null,b=null,h=!1,y=ee(this.segments)??null,k=A=>{let S=A.indexOf("@"),I=Number(S===-1?A:A.slice(0,S));if(!Number.isInteger(I)||I<0)throw new Error(`Invalid #EXT-X-BYTERANGE length '${A}'.`);let E=null;if(S!==-1&&(E=Number(A.slice(S+1)),!Number.isInteger(E)||E<0))throw new Error(`Invalid #EXT-X-BYTERANGE offset '${A}'.`);return{length:I,offset:E}},T=A=>{u=A,y&&(g(y.sequenceNumber!==null),y.sequenceNumber<A&&(a=y.timestamp+y.duration,l=y.firstSegment,m=y.initSegment,p=y.lastProgramDateTimeSeconds,s=y.unixEpochTimestamp!==null?y.unixEpochTimestamp+y.duration:null,y=null))};for(let A=0;A<e.length;A++){let S=e[A];if(!n){if(S!=="#EXTM3U")throw new Error("Invalid M3U8 file; expected first line to be #EXTM3U.");n=!0;continue}if(!S.startsWith("#")){if(!y){if(o===null)throw new Error("Invalid M3U8 file; a segment must be preceded by an #EXTINF tag.");let I=c;if(I&&I.method==="AES-128"&&!I.iv){let z=new Uint8Array(vt),V=L(z);V.setUint32(8,Math.floor(u/2**32)),V.setUint32(12,u),I={...I,iv:z}}let R={path:Ce(this.rootPath,S),offset:f?.offset??0,length:f?.length??null},_={timestamp:a,unixEpochTimestamp:s,firstSegment:l,sequenceNumber:u,location:R,duration:o,encryption:I,initSegment:m,lastProgramDateTimeSeconds:p};l??=_,a+=o,s!==null&&(s+=o),this.segments.push(_)}o=null,f===null?d=null:f=null,T(u+1)}if(S.startsWith(na)){if(y){h=!0;continue}h||(p===null&&u>0&&b!==null&&(a=u*b),h=!0);let I=S.slice(na.length),E=I.indexOf(","),R=E===-1?I:I.slice(0,E),_=Number(R);if(!Number.isFinite(_)||_<0)throw new Error(`Invalid #EXTINF tag duration '${R}'.`);o=_}else if(S.startsWith(cu)){let I=new xr(S.slice(cu.length)),E=I.get("uri");if(!E)throw new Error("Invalid #EXT-X-MAP tag; missing URI attribute.");let R=I.get("byterange"),_=null;if(R!==null&&(_=k(R)),_&&_.offset===null)throw new Error("Invalid #EXT-X-MAP tag; BYTERANGE attribute must have a specified offset.");if(!y){let V={path:Ce(this.rootPath,E),offset:_?.offset??0,length:_?.length??null};if(c?.method==="AES-128"&&!c.iv)throw new Error("IV attribute must be set on #EXT-X-KEY tag preceding the #EXT-X-MAP tag.");m={timestamp:a,unixEpochTimestamp:s,firstSegment:null,sequenceNumber:null,location:V,duration:0,encryption:c,initSegment:null,lastProgramDateTimeSeconds:p}}o=null,f===null?d=null:f=null}else if(S.startsWith(uu)){let I=new xr(S.slice(uu.length)),E=I.get("method");if(E==="NONE")c=null;else if(E==="AES-128"){let R=I.get("uri");if(!R)throw new Error("Invalid #EXT-X-KEY: AES-128 requires a URI attribute.");let _=null,z=I.get("iv");if(z){if(!Ep.test(z))throw new Error(`Unsupported IV format '${z}'.`);let B=z.slice(2);B=B.padStart(vt*2,"0"),_=new Uint8Array(vt);for(let W=0;W<vt;W++){let Y=-vt*2+W;_[W]=parseInt(B.slice(Y,Y+2),16)}}let V=I.get("keyformat")??"identity";if(V!=="identity")throw new Error("For AES-128 encryption, only the 'identity' KEYFORMAT is currently supported. If you think other formats should be supported, please raise an issue.");c={method:"AES-128",keyUri:Ce(this.rootPath,R),iv:_,keyFormat:V}}else if(E==="SAMPLE-AES"||E==="SAMPLE-AES-CTR"){let R=I.get("uri");if(!R)throw new Error(`Invalid #EXT-X-KEY: ${E} requires a URI attribute.`);if((I.get("keyformat")??"identity")==="identity")throw new Error("For SAMPLE-AES and SAMPLE-AES-CTR encryption, the 'identity' KEYFORMAT is not supported. If you think this format should be supported, please raise an issue.");let z=null;if(vp.test(R)){let V=R.indexOf(","),B=pi(R.slice(V+1));if(B.length>=8&&B[4]===112&&B[5]===115&&B[6]===115&&B[7]===104){let W=L(B).getUint32(0);z=xs(B.subarray(8,Math.min(W,B.length)))}}c={method:E,psshBox:z}}else throw new Error(`Unsupported encryption method '${E}'. If you think this method should be supported, please raise an issue.`)}else if(S.startsWith(lu)){let I=S.slice(lu.length),E=Number(I);if(!Number.isInteger(E)||E<0)throw new Error(`Invalid EXT-X-MEDIA-SEQUENCE value '${I}'.`);T(E)}else if(S.startsWith(du)){let I=k(S.slice(du.length));if(I.offset===null){if(d===null)throw new Error("Invalid M3U8 file; #EXT-X-BYTERANGE without offset requires a previous byte range.");I.offset=d}f=I,d=I.offset+I.length}else if(S.startsWith(mu)){if(y)continue;let I=S.slice(mu.length),E=Date.parse(I);if(!Number.isFinite(E))continue;let R=E/1e3;if(p===R)continue;if(p===null&&this.segments.length>0){let _=ee(this.segments),z=_.timestamp+_.duration,V=R-z;for(let B of this.segments)B.unixEpochTimestamp=B.timestamp+V,r&&(B.timestamp=B.unixEpochTimestamp)}p=R,s=R,r&&(a=R)}else if(S===Hd)l=null;else if(S.startsWith(fu)){let I=S.slice(fu.length),E=Number(I);if(!Number.isFinite(E)||E<0)throw new Error(`Invalid EXT-X-TARGETDURATION value '${I}'.`);this.refreshInterval=E,b=E}else if(S===qd){this.streamHasEnded=!0;break}else S.startsWith(pu)&&S.slice(pu.length).toLowerCase()==="vod"&&(this.streamHasEnded=!0)}if(!n)throw new Error("Invalid M3U8 file; no #EXTM3U header.")}async getFirstSegment(){return this.segments.length===0&&await this.runUpdateSegments(),this.segments[0]??null}async getSegmentAt(e,r){this.segments.length===0&&await this.runUpdateSegments();let n=!!r.skipLiveWait&&this.getRemainingWaitTimeMs()>0;for(;;){let a=Q(this.segments,e,o=>o.timestamp);if(a===-1)return null;if(a<this.segments.length-1||this.streamHasEnded||n)return this.segments[a];let s=this.segments[a];if(e<s.timestamp+s.duration)return s;await this.runUpdateSegments(),r.skipLiveWait&&(n=!0)}}async getNextSegment(e,r){let n=this.segments.indexOf(e);g(n!==-1);let a=n+1,s=!!r.skipLiveWait&&this.getRemainingWaitTimeMs()>0;for(;;){if(a<this.segments.length)return this.segments[a];if(this.streamHasEnded||s)return null;await this.runUpdateSegments(),r.skipLiveWait&&(s=!0)}}async getPreviousSegment(e){let r=this.segments.indexOf(e);return g(r!==-1),this.segments[r-1]??null}getInputForSegment(e){let r=e,n=this.inputCache.find(u=>u.segment===r);if(n)return n.age=this.nextInputCacheAge++,n.input;let a=null;(r.initSegment||r.firstSegment)&&(a=this.getInputForSegment(r.initSegment??r.firstSegment));let s={...this.input._formatOptions,isobmff:{...this.input._formatOptions.isobmff,resolveKeyId:this.input._formatOptions.isobmff?.resolveKeyId&&(u=>{if(!r.encryption||!(r.encryption.method==="SAMPLE-AES"||r.encryption.method==="SAMPLE-AES-CTR")||!r.encryption.psshBox)return this.input._formatOptions.isobmff.resolveKeyId(u);let l=u.psshBoxes,{psshBox:m}=r.encryption;return(m.keyIds===null||m.keyIds.includes(u.keyId))&&!l.some(d=>Cs(d,m))&&(l=[...l,m]),this.input._formatOptions.isobmff.resolveKeyId({...u,psshBoxes:l})})}},o=new Xr({source:new un(r.location.path,async u=>{g(u.isRoot);let l={...u,isRoot:!1},m,d=r.location.offset>0||r.location.length!==null;if(!r.encryption||r.encryption.method==="SAMPLE-AES"||r.encryption.method==="SAMPLE-AES-CTR"){if(m=await this.input._getSourceCached(l),d){let p=m.source.slice(r.location.offset,r.location.length??void 0).ref();m.free(),m=p}}else if(r.encryption.method==="AES-128"){let f=r.encryption;g(f.iv);let p=await this.input._getSourceCached(l);if(d){let k=p.source.slice(r.location.offset,r.location.length??void 0).ref();p.free(),p=k}let b=new jr(p.source),h=pd(b,async()=>{var x=[];try{let y=at(x,await this.input._getSourceCached({path:f.keyUri,isRoot:!1},Yd));let k=new jr(y.source);let T=await k.requestSlice(0,vt);if(!T)throw new Error("Invalid AES-128 key; expected at least 16 bytes of data.");let w=D(T,vt);return{key:w,iv:f.iv}}catch(C){var P=C,A=!0}finally{st(x,P,A)}},()=>{p.free()});m=new Si(h).ref()}else g(!1);return m}),formats:this.input._formats.filter(u=>!(u instanceof Ai)),initInput:a??void 0,formatOptions:s});if(o._onFormatDetermined=u=>{if((r.encryption?.method==="SAMPLE-AES"||r.encryption?.method==="SAMPLE-AES-CTR")&&!u._isIsobmff)throw new Error("The SAMPLE-AES and SAMPLE-AES-CTR encryption methods are currently only supported for ISOBMFF files.")},this.inputCache.push({segment:r,input:o,age:this.nextInputCacheAge++}),this.inputCache.length>4){let u=Wi(this.inputCache,l=>l.age);g(u!==-1),this.inputCache.splice(u,1)}return o}async getLiveRefreshInterval(){return this.getRemainingWaitTimeMs()===0&&await this.runUpdateSegments(),this.streamHasEnded?null:this.refreshInterval}};var fo=class extends Ie{constructor(e){super(e);this.metadataPromise=null;this.trackBackings=null;this.internalTracks=null;this.segmentedInputs=[];this.hasMasterPlaylist=!0}readMetadata(){return this.metadataPromise??=(async()=>{g(this.input._rootSource instanceof qe);let e=await this.input._reader.requestEntireFile();g(e);let r=lo(e,e.length,{ignore:to}),{rootPath:n}=this.input._rootSource,a=[],s=[];for(let d=1;d<r.length;d++){let f=r[d];if(f.startsWith(au)){let p=d,b=r[++d];if(b===void 0)throw new Error("Incorrect M3U8 file; a line must follow the #EXT-X-STREAM-INF tag.");let h=Ce(n,b),y=new xr(f.slice(au.length));if(y.getAsNumber("bandwidth")===null)throw new Error("Invalid M3U8 file; #EXT-X-STREAM-INF tag requires a BANDWIDTH attribute with a valid numerical value.");a.push({fullPath:h,attributes:y,lineNumber:p,hasOnlyKeyPackets:!1})}else if(f.startsWith(su)){let p=new xr(f.slice(su.length)),b=p.get("uri");if(b===null)throw new Error("Invalid M3U8 file; #EXT-X-I-FRAME-STREAM-INF tag requires a URI attribute.");if(p.getAsNumber("bandwidth")===null)throw new Error("Invalid M3U8 file; #EXT-X-I-FRAME-STREAM-INF tag requires a BANDWIDTH attribute with a valid numerical value.");let y=Ce(n,b);a.push({fullPath:y,attributes:p,lineNumber:d,hasOnlyKeyPackets:!0})}else if(f.startsWith(ou)){let p=new xr(f.slice(ou.length));if(p.get("type")===null)throw new Error("Invalid M3U8 file; #EXT-X-MEDIA tag requires a TYPE attribute.");if(p.get("group-id")===null)throw new Error("Invalid M3U8 file; #EXT-X-MEDIA tag requires a GROUP-ID attribute.");let y=null,k=p.get("uri");k!==null&&(y=Ce(n,k)),s.push({fullPath:y,attributes:p,lineNumber:d})}else if(f!==Kd){if(f.startsWith(na)){let p=new oa(this,n,null,r);this.segmentedInputs=[p],this.hasMasterPlaylist=!1,this.trackBackings=await p.getTrackBackings();return}}}let o=[...new Set(s.filter(d=>d.attributes.get("type").toLowerCase()==="video").map(d=>d.attributes.get("group-id")))],c=[...new Set(s.filter(d=>d.attributes.get("type").toLowerCase()==="audio").map(d=>d.attributes.get("group-id")))],u=await Promise.all(a.map(async(d,f)=>{let p=[],b=d.attributes.get("codecs"),h;if(b)h=b.split(",").map(I=>I.trim());else{let E=await this.getSegmentedInputForPath(d.fullPath).getTrackBackings(),R=await Promise.all(E.map(async _=>({track:_,codec:await _.getCodec()})));h=await Promise.all(R.filter(_=>_.codec!==null).map(_=>_.track.getDecoderConfig().then(z=>z.codec)))}let y=d.attributes.get("video"),k=d.attributes.get("audio"),T=h.some(I=>ce.includes(Xe(I))),w=h.some(I=>fe.includes(Xe(I)));if(y!==null&&!T){if(!o.includes(y))throw new Error(`Invalid M3U8 file; variant stream references video group "${y}" which is not defined in any #EXT-X-MEDIA tags.`);let I=s.find(E=>{let R=E.attributes.get("group-id"),_=E.attributes.get("type");return R===y&&_.toLowerCase()==="video"});e:if(I){let E=I.attributes.get("uri");if(E===null)break e;let R=Ce(n,E),V=(await this.getSegmentedInputForPath(R).getTrackBackings()).find(W=>W.getType()==="video");if(!V||await V.getCodec()===null)break e;let B=await V.getDecoderConfig().then(W=>W?.codec??null);g(B!==null),h.push(B)}}if(k!==null&&!w){if(!c.includes(k))throw new Error(`Invalid M3U8 file; variant stream references audio group "${k}" which is not defined in any #EXT-X-MEDIA tags.`);let I=s.find(E=>{let R=E.attributes.get("group-id"),_=E.attributes.get("type");return R===k&&_.toLowerCase()==="audio"});e:if(I){let E=I.attributes.get("uri");if(E===null)break e;let R=Ce(n,E),V=(await this.getSegmentedInputForPath(R).getTrackBackings()).find(W=>W.getType()==="audio");if(!V||await V.getCodec()===null)break e;let B=await V.getDecoderConfig().then(W=>W?.codec??null);g(B!==null),h.push(B)}}h=[...new Set(h)];let x=null,C=null,P=d.attributes.getAsNumber("bandwidth");g(P!==null);let A=d.attributes.getAsNumber("average-bandwidth"),S=d.attributes.get("name");for(let I of h){let E=Xe(I);if(E!==null){if(ce.includes(E)){if(x!==null)throw new Error("Unsupported M3U8 file; multiple video codecs found in the CODECS attribute of a variant stream.");x=I;let R=d.attributes.get("video");if(R===null){let _=d.attributes.get("resolution"),z=null,V=null;if(_){let B=_.match(/^(\d+)x(\d+)$/);B&&(z=Number(B[1]),V=Number(B[2]))}p.push({id:-1,demuxer:this,backingTrack:null,default:!0,autoselect:!0,languageCode:ae,lineNumber:d.lineNumber,fullPath:d.fullPath,fullCodecString:x,pairingMask:1n<<BigInt(f),peakBitrate:P,averageBitrate:A,name:S,hasOnlyKeyPackets:d.hasOnlyKeyPackets,info:{type:"video",width:z,height:V}})}else{if(!o.includes(R))throw new Error(`Invalid M3U8 file; variant stream references video group "${R}" which is not defined in any #EXT-X-MEDIA tags.`);for(let _ of s){let z=_.attributes.get("group-id"),V=_.attributes.get("type");if(z!==R||V.toLowerCase()!=="video")continue;let B=_.attributes.get("resolution")??d.attributes.get("resolution"),W=null,Y=null;if(B){let G=B.match(/^(\d+)x(\d+)$/);G&&(W=Number(G[1]),Y=Number(G[2]))}p.push({id:-1,demuxer:this,backingTrack:null,default:mo(_.attributes),autoselect:mo(_.attributes)||Zd(_.attributes),languageCode:Jd(_.attributes.get("language")),lineNumber:_.lineNumber,fullPath:_.fullPath??d.fullPath,fullCodecString:x,pairingMask:1n<<BigInt(f),peakBitrate:null,averageBitrate:null,name:_.attributes.get("name"),hasOnlyKeyPackets:d.hasOnlyKeyPackets,info:{type:"video",width:W,height:Y}})}}}else if(fe.includes(E)){if(C!==null)throw new Error("Unsupported M3U8 file; multiple audio codecs found in the CODECS attribute of a variant stream.");C=I;let R=d.attributes.get("audio");if(R===null){let _=d.attributes.get("channels"),z=_!==null?Number(_.split("/")[0]):null;p.push({id:-1,demuxer:this,backingTrack:null,default:!0,autoselect:!0,languageCode:ae,lineNumber:d.lineNumber,fullPath:d.fullPath,fullCodecString:C,pairingMask:1n<<BigInt(f),peakBitrate:P,averageBitrate:A,name:S,hasOnlyKeyPackets:d.hasOnlyKeyPackets,info:{type:"audio",numberOfChannels:z!==null&&Number.isInteger(z)&&z>0?z:null}})}else{if(!c.includes(R))throw new Error(`Invalid M3U8 file; variant stream references audio group "${R}" which is not defined in any #EXT-X-MEDIA tags.`);for(let _ of s){let z=_.attributes.get("group-id"),V=_.attributes.get("type");if(z!==R||V.toLowerCase()!=="audio")continue;let B=_.attributes.get("channels")??d.attributes.get("channels"),W=B!==null?Number(B.split("/")[0]):null;p.push({id:-1,demuxer:this,backingTrack:null,default:mo(_.attributes),autoselect:mo(_.attributes)||Zd(_.attributes),languageCode:Jd(_.attributes.get("language")),lineNumber:_.lineNumber,fullPath:_.fullPath??d.fullPath,fullCodecString:C,pairingMask:1n<<BigInt(f),peakBitrate:null,averageBitrate:null,name:_.attributes.get("name"),hasOnlyKeyPackets:d.hasOnlyKeyPackets,info:{type:"audio",numberOfChannels:W!==null&&Number.isInteger(W)&&W>0?W:null}})}}}}}return p})),l=[],m=d=>{let f=l.find(p=>p.fullPath===d.fullPath&&p.info.type===d.info.type);f?(f.pairingMask|=d.pairingMask,f.default||=d.default,f.autoselect||=d.autoselect,f.lineNumber=Math.min(f.lineNumber,d.lineNumber),d.peakBitrate!==null&&(f.peakBitrate=Math.max(f.peakBitrate??-1/0,d.peakBitrate)),d.averageBitrate!==null&&(f.averageBitrate=Math.max(f.averageBitrate??-1/0,d.averageBitrate)),f.languageCode===ae&&(f.languageCode=d.languageCode)):(d.id=l.length+1,l.push(d))};for(let d of u)for(let f of d)m(f);l.sort((d,f)=>d.lineNumber-f.lineNumber),this.trackBackings=[];for(let d of l)d.info.type==="video"?this.trackBackings.push(new ho(d)):this.trackBackings.push(new go(d));this.internalTracks=l})()}async getTrackBackings(){return await this.readMetadata(),g(this.trackBackings),this.trackBackings}getSegmentedInputForPath(e){let r=this.segmentedInputs.find(a=>a.path===e);if(r)return r;let n=null;return this.internalTracks&&(n=this.internalTracks.filter(s=>s.fullPath===e).map(s=>({id:s.id,type:s.info.type}))),r=new oa(this,e,n,null),this.segmentedInputs.push(r),r}async getMetadataTags(){return{}}async getMimeType(){return Xt}dispose(){if(this.segmentedInputs){for(let e of this.segmentedInputs)e.dispose();this.segmentedInputs.length=0}}},po=class{constructor(t){this.internalTrack=t;this.hydrationPromise=null}hydrate(){return this.hydrationPromise??=(async()=>{let t=this.internalTrack.demuxer.getSegmentedInputForPath(this.internalTrack.fullPath),e=null,n=(await t.getTrackBackings()).filter(a=>a.getType()===this.getType());if(n.length===1)e=n[0];else if(this instanceof ho){for(let a of n)if(await a.getCodec()===this.getCodec()){e=a;break}}else{g(this instanceof go);for(let a of n)if(await a.getCodec()===this.getCodec()){e=a;break}}if(!e)throw new Error("Could not find matching track in underlying media data.");this.internalTrack.backingTrack=e})()}delegate(t){return this.internalTrack.backingTrack?t():this.hydrate().then(t)}getCodec(){throw new Error("Not implemented on base class.")}getDisposition(){return{..._e,default:this.internalTrack.autoselect,primary:this.internalTrack.default}}getId(){return this.internalTrack.id}getPairingMask(){return this.internalTrack.pairingMask}getInternalCodecId(){return null}getLanguageCode(){return this.internalTrack.languageCode}getName(){return this.internalTrack.name}getNumber(){g(this.internalTrack.demuxer.internalTracks);let t=this.internalTrack.info.type,e=0;for(let r of this.internalTrack.demuxer.internalTracks)if(r.info.type===t&&e++,r===this.internalTrack)break;return e}getTimeResolution(){return this.delegate(()=>this.internalTrack.backingTrack.getTimeResolution())}isRelativeToUnixEpoch(){return this.delegate(()=>this.internalTrack.backingTrack.isRelativeToUnixEpoch())}getUnixTimeForTimestamp(t){return this.delegate(()=>this.internalTrack.backingTrack.getUnixTimeForTimestamp(t))}getBitrate(){return this.internalTrack.peakBitrate}getAverageBitrate(){return this.internalTrack.averageBitrate}async getDurationFromMetadata(t){return await this.hydrate(),this.internalTrack.backingTrack.getDurationFromMetadata(t)}async getLiveRefreshInterval(){return await this.hydrate(),this.internalTrack.backingTrack.getLiveRefreshInterval()}getHasOnlyKeyPackets(){return this.internalTrack.hasOnlyKeyPackets||null}async getFirstPacket(t){return await this.hydrate(),this.internalTrack.backingTrack.getFirstPacket(t)}async getPacket(t,e){return await this.hydrate(),this.internalTrack.backingTrack.getPacket(t,e)}async getKeyPacket(t,e){return await this.hydrate(),this.internalTrack.backingTrack.getKeyPacket(t,e)}async getNextPacket(t,e){return await this.hydrate(),this.internalTrack.backingTrack.getNextPacket(t,e)}async getNextKeyPacket(t,e){return await this.hydrate(),this.internalTrack.backingTrack.getNextKeyPacket(t,e)}},ho=class extends po{constructor(t){super(t)}get backingVideoTrack(){return this.internalTrack.backingTrack}getType(){return"video"}getCodec(){return Xe(this.internalTrack.fullCodecString)}getCodedWidth(){return this.delegate(()=>this.backingVideoTrack.getCodedWidth())}getCodedHeight(){return this.delegate(()=>this.backingVideoTrack.getCodedHeight())}getSquarePixelWidth(){return this.delegate(()=>this.backingVideoTrack.getSquarePixelWidth())}getSquarePixelHeight(){return this.delegate(()=>this.backingVideoTrack.getSquarePixelHeight())}getMetadataDisplayWidth(){return this.backingVideoTrack?null:this.internalTrack.info.width}getMetadataDisplayHeight(){return this.backingVideoTrack?null:this.internalTrack.info.height}getRotation(){return this.delegate(()=>this.backingVideoTrack.getRotation())}async getColorSpace(){return await this.hydrate(),this.backingVideoTrack.getColorSpace()}async canBeTransparent(){return await this.hydrate(),this.backingVideoTrack.canBeTransparent()}getMetadataCodecParameterString(){return this.backingVideoTrack?null:this.internalTrack.fullCodecString}async getDecoderConfig(){return await this.hydrate(),this.backingVideoTrack.getDecoderConfig()}},go=class extends po{constructor(t){super(t)}get backingAudioTrack(){return this.internalTrack.backingTrack}getType(){return"audio"}getCodec(){return Xe(this.internalTrack.fullCodecString)}getNumberOfChannels(){return this.internalTrack.info.numberOfChannels!==null?this.internalTrack.info.numberOfChannels:this.delegate(()=>this.backingAudioTrack.getNumberOfChannels())}getSampleRate(){return this.delegate(()=>this.backingAudioTrack.getSampleRate())}getMetadataCodecParameterString(){return this.backingAudioTrack?null:this.internalTrack.fullCodecString}async getDecoderConfig(){return await this.hydrate(),this.backingAudioTrack.getDecoderConfig()}},mo=i=>{let t=i.get("default");if(t===null)return!1;let e=t.toUpperCase();if(e==="YES")return!0;if(e==="NO")return!1;throw new Error(`Invalid M3U8 file; #EXT-X-MEDIA DEFAULT attribute must be YES or NO, got "${t}".`)},Zd=i=>{let t=i.get("autoselect");if(t===null)return!1;let e=t.toUpperCase();if(e==="YES")return!0;if(e==="NO")return!1;throw new Error(`Invalid M3U8 file; #EXT-X-MEDIA AUTOSELECT attribute must be YES or NO, got "${t}".`)},Jd=i=>{if(i===null)return ae;let t=i.split("-")[0];return t||ae};var Ke=class{constructor(){this._isIsobmff=!1}},dn=class extends Ke{constructor(){super(...arguments);this._isIsobmff=!0}async _getMajorBrand(e){let r=e._reader.requestSlice(0,12);if(v(r)&&(r=await r),!r)return null;r.skip(4);let n=ue(r,4);return n!=="ftyp"&&n!=="styp"?null:ue(r,4)}_createDemuxer(e){return new Es(e)}},ca=class extends dn{async _canReadInput(t){let e=await this._getMajorBrand(t);if(e!==null)return e!=="qt  ";let r=0;for(let n=0;n<10;n++){let a=t._reader.requestSlice(r,8);if(v(a)&&(a=await a),!a)return!1;let s=M(a),o=8;if(s===1){let u=t._reader.requestSlice(r+8,8);if(v(u)&&(u=await u),!u)return!1;s=Ne(u),o=16}if(s<o)return!1;let c=ue(a,4);if(c==="moof"||c==="sidx")return!0;if(c==="emsg"||c==="prft"||c==="free")r+=s;else return!1}return!1}get name(){return"MP4"}get mimeType(){return"video/mp4"}},ua=class extends dn{async _canReadInput(t){return await this._getMajorBrand(t)==="qt  "}get name(){return"QuickTime File Format"}get mimeType(){return"video/quicktime"}},mn=class extends Ke{async isSupportedEBMLOfDocType(t,e){let r=t._reader.requestSlice(0,Ft);if(v(r)&&(r=await r),!r)return!1;let n=qc(r);if(n===null||n<1||n>8||X(r,n)!==440786851)return!1;let s=Kc(r);if(typeof s!="number")return!1;let o=t._reader.requestSlice(r.filePos,s);if(v(o)&&(o=await o),!o)return!1;let c=r.filePos;for(;o.filePos<=c+s-$e;){let u=Mt(o);if(!u)break;let{id:l,size:m}=u,d=o.filePos;if(m===void 0)return!1;switch(l){case 17030:if(X(o,m)!==1)return!1;break;case 17143:if(X(o,m)!==1)return!1;break;case 17026:if(qr(o,m)!==e)return!1;break;case 17031:if(X(o,m)>4)return!1;break}o.filePos=d+m}return!0}_canReadInput(t){return this.isSupportedEBMLOfDocType(t,"matroska")}_createDemuxer(t){return new Us(t)}get name(){return"Matroska"}get mimeType(){return"video/x-matroska"}},la=class extends mn{_canReadInput(t){return this.isSupportedEBMLOfDocType(t,"webm")}get name(){return"WebM"}get mimeType(){return"video/webm"}},da=class extends Ke{async _canReadInput(t){let e=0;for(;;){let m=t._reader.requestSlice(e,De);if(v(m)&&(m=await m),!m)break;let d=Ye(m);if(!d)break;e=m.filePos+d.size}let r=await Jn(t._reader,e,e+4096);if(!r)return!1;let n=r.header,a=Nr(n.mpegVersionId,n.channel),s=t._reader.requestSlice(r.startPos+a,4);if(v(s)&&(s=await s),!s)return!1;let o=M(s);if(o===zr||o===Gi)return!0;e=r.startPos+r.header.totalSize;let u=await Jn(t._reader,e,e+4);if(!u)return!1;let l=u.header;return!(n.channel!==l.channel||n.sampleRate!==l.sampleRate)}_createDemuxer(t){return new Ns(t)}get name(){return"MP3"}get mimeType(){return"audio/mpeg"}},ma=class extends Ke{async _canReadInput(t){let e=t._reader.requestSlice(0,12);if(v(e)&&(e=await e),!e)return!1;let r=ue(e,4);return r!=="RIFF"&&r!=="RIFX"&&r!=="RF64"?!1:(e.skip(4),ue(e,4)==="WAVE")}_createDemuxer(t){return new Qs(t)}get name(){return"WAVE"}get mimeType(){return"audio/wav"}},fa=class extends Ke{async _canReadInput(t){let e=t._reader.requestSlice(0,4);return v(e)&&(e=await e),e?ue(e,4)==="OggS":!1}_createDemuxer(t){return new Ks(t)}get name(){return"Ogg"}get mimeType(){return"application/ogg"}},pa=class extends Ke{async _canReadInput(t){let e=0;for(;;){let n=t._reader.requestSlice(e,De);if(v(n)&&(n=await n),!n)break;let a=Ye(n);if(!a)break;e=n.filePos+a.size}let r=t._reader.requestSlice(e,4);return v(r)&&(r=await r),r?ue(r,4)==="fLaC":!1}get name(){return"FLAC"}get mimeType(){return"audio/flac"}_createDemuxer(t){return new Ys(t)}},ha=class extends Ke{async _canReadInput(t){let e=0;for(;;){let s=t._reader.requestSlice(e,De);if(v(s)&&(s=await s),!s)break;let o=Ye(s);if(!o)break;e=s.filePos+o.size}let r=t._reader.requestSliceRange(e,Ar,dt);if(v(r)&&(r=await r),!r)return!1;let n=Ze(r);if(!n||(e+=n.frameLength,r=t._reader.requestSliceRange(e,Ar,dt),v(r)&&(r=await r),!r))return!1;let a=Ze(r);return a?n.objectType===a.objectType&&n.samplingFrequencyIndex===a.samplingFrequencyIndex&&n.channelConfiguration===a.channelConfiguration:!1}_createDemuxer(t){return new Gs(t)}get name(){return"ADTS"}get mimeType(){return"audio/aac"}},ga=class extends Ke{async _canReadInput(t){let e=205,r=t._reader.requestSlice(0,e);if(v(r)&&(r=await r),!r)return!1;let n=D(r,e);return n[0]===71&&n[188]===71||n[0]===71&&n[204]===71?!0:n[4]===71&&n[196]===71}_createDemuxer(t){return new Js(t)}get name(){return"MPEG Transport Stream"}get mimeType(){return"video/MP2T"}},Ai=class extends Ke{async _canReadInput(t){let e=t._reader.requestSlice(0,7);if(v(e)&&(e=await e),!e||!(ue(e,7)==="#EXTM3U"))return!1;if(!(t._rootSource instanceof qe))throw new TypeError("HLS inputs require `InputOptions.source` to be a PathedSource or a ref to one.");return t._rootSource._usedForHls=!0,!0}_createDemuxer(t){return new fo(t)}get name(){return"HTTP Live Streaming (HLS)"}get mimeType(){return Xt}},bo=new ca,yo=new ua,wu=new mn,Su=new la,ko=new da,Au=new ma,xu=new fa,To=new ha,Cu=new pa,wo=new ga,So=new Ai,em=[So,bo,yo,wu,Su,Au,xu,Cu,ko,To,wo],tm=[So,bo,yo,ko,To,wo],rm=(i,t)=>{if(!i||typeof i!="object")throw new TypeError(`${t}, when provided, must be an object.`);if(i.isobmff!==void 0){if(!i.isobmff||typeof i.isobmff!="object")throw new TypeError(`${t}.isobmff, when provided, must be an object.`);if(i.isobmff.resolveKeyId!==void 0&&typeof i.isobmff.resolveKeyId!="function")throw new TypeError(`${t}.isobmff.resolveKeyId, when provided, must be a function.`)}if(i.hls!==void 0){if(!i.hls||typeof i.hls!="object")throw new TypeError(`${t}.hls, when provided, must be an object.`);if(i.hls.offsetTimestampsByDateTime!==void 0&&typeof i.hls.offsetTimestampsByDateTime!="boolean")throw new TypeError(`${t}.hls.offsetTimestampsByDateTime, when provided, must be a boolean.`)}};var Ao=new Map,xo=new Map,_p=(i,t)=>{if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.codec!==void 0&&typeof t.codec!="string")throw new TypeError("options.codec, when provided, must be a string.");if(t.codec!==void 0&&Xe(t.codec)!==i)throw new TypeError(`options.codec, when provided, must match the specified codec (${i}).`);if(t.codedWidth!==void 0&&(!Number.isInteger(t.codedWidth)||t.codedWidth<=0))throw new TypeError("options.codedWidth, when provided, must be a positive integer.");if(t.codedHeight!==void 0&&(!Number.isInteger(t.codedHeight)||t.codedHeight<=0))throw new TypeError("options.codedHeight, when provided, must be a positive integer.");if(t.displayAspectWidth!==void 0&&(!Number.isInteger(t.displayAspectWidth)||t.displayAspectWidth<=0))throw new TypeError("options.displayAspectWidth, when provided, must be a positive integer.");if(t.displayAspectHeight!==void 0&&(!Number.isInteger(t.displayAspectHeight)||t.displayAspectHeight<=0))throw new TypeError("options.displayAspectHeight, when provided, must be a positive integer.");if(t.description!==void 0&&!cr(t.description))throw new TypeError("options.description, when provided, must be a buffer source.");if(t.hardwareAcceleration!==void 0&&!["no-preference","prefer-hardware","prefer-software"].includes(t.hardwareAcceleration))throw new TypeError("options.hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");if(t.optimizeForLatency!==void 0&&typeof t.optimizeForLatency!="boolean")throw new TypeError("options.optimizeForLatency, when provided, must be a boolean.")},Rp=(i,t)=>{if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.codec!==void 0&&typeof t.codec!="string")throw new TypeError("options.codec, when provided, must be a string.");if(t.codec!==void 0&&Xe(t.codec)!==i)throw new TypeError(`options.codec, when provided, must match the specified codec (${i}).`);if(t.numberOfChannels!==void 0&&(!Number.isInteger(t.numberOfChannels)||t.numberOfChannels<=0))throw new TypeError("options.numberOfChannels, when provided, must be a positive integer.");if(t.sampleRate!==void 0&&(!Number.isInteger(t.sampleRate)||t.sampleRate<=0))throw new TypeError("options.sampleRate, when provided, must be a positive integer.");if(t.description!==void 0&&!cr(t.description))throw new TypeError("options.description, when provided, must be a buffer source.")},im=i=>ce.includes(i)?Co(i):fe.includes(i)?Po(i):!1,Co=async(i,t={})=>{if(!ce.includes(i))return!1;_p(i,t);let e={...t,codedWidth:t.codedWidth??1280,codedHeight:t.codedHeight??720,codec:t.codec??hs(i,1280,720,1e6,!1)};e.description??=nd(e);let r=JSON.stringify(e),n=Ao.get(r);if(n)return n;let a=(async()=>$r.some(o=>o.supports(i,e))?!0:typeof VideoDecoder>"u"?!1:(await VideoDecoder.isConfigSupported(e)).supported===!0)();return Ao.set(r,a),a},Po=async(i,t={})=>{if(!fe.includes(i))return!1;Rp(i,t);let e={...t,numberOfChannels:t.numberOfChannels??2,sampleRate:t.sampleRate??48e3,codec:t.codec??ys(i,2,48e3)};if(e.description===void 0){let s=ad(e);if(s===!1)return!1;e.description=s}let r=JSON.stringify(e),n=xo.get(r);if(n)return n;let a=(async()=>Yr.some(o=>o.supports(i,e))||se.includes(i)?!0:typeof AudioDecoder>"u"?!1:(await AudioDecoder.isConfigSupported(e)).supported===!0)();return xo.set(r,a),a},nm=async()=>{let[i,t]=await Promise.all([Pu(),Iu()]);return[...i,...t]},Pu=async(i=ce,t)=>{let e=await Promise.all(i.map(r=>Co(r,t)));return i.filter((r,n)=>e[n])},Iu=async(i=fe,t)=>{let e=await Promise.all(i.map(r=>Po(r,t)));return i.filter((r,n)=>e[n])};Li();var am=-1/0,sm=-1/0,Ta=null;typeof FinalizationRegistry<"u"&&(Ta=new FinalizationRegistry(i=>{let t=performance.now();i.type==="video"?(t-am>=1e3&&(U._error("A VideoSample was garbage collected without first being closed. For proper resource management, make sure to call close() on all your VideoSamples as soon as you're done using them."),am=t),typeof VideoFrame<"u"&&i.data instanceof VideoFrame&&i.data.close()):(t-sm>=1e3&&(U._error("An AudioSample was garbage collected without first being closed. For proper resource management, make sure to call close() on all your AudioSamples as soon as you're done using them."),sm=t),typeof AudioData<"u"&&i.data instanceof AudioData&&i.data.close())}));var Bt=class{constructor(){this._referenceCount=0;this._lastAllocationBuffer=null}},wa=["I420","I420P10","I420P12","I420A","I420AP10","I420AP12","I422","I422P10","I422P12","I422A","I422AP10","I422AP12","I444","I444P10","I444P12","I444A","I444AP10","I444AP12","NV12","RGBA","RGBX","BGRA","BGRX"],Fp=new Set(wa),We=class i{constructor(t,e){this._closed=!1;if(t instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&t instanceof SharedArrayBuffer||ArrayBuffer.isView(t)){if(!e||typeof e!="object")throw new TypeError("init must be an object.");if(e.format===void 0||!Fp.has(e.format))throw new TypeError("init.format must be one of: "+wa.join(", "));if(!Number.isInteger(e.codedWidth)||e.codedWidth<=0)throw new TypeError("init.codedWidth must be a positive integer.");if(!Number.isInteger(e.codedHeight)||e.codedHeight<=0)throw new TypeError("init.codedHeight must be a positive integer.");if(e.rotation!==void 0&&![0,90,180,270].includes(e.rotation))throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");if(!Number.isFinite(e.timestamp))throw new TypeError("init.timestamp must be a number.");if(e.duration!==void 0&&(!Number.isFinite(e.duration)||e.duration<0))throw new TypeError("init.duration, when provided, must be a non-negative number.");if(e.layout!==void 0){if(!Array.isArray(e.layout))throw new TypeError("init.layout, when provided, must be an array.");for(let a of e.layout){if(!a||typeof a!="object"||Array.isArray(a))throw new TypeError("Each entry in init.layout must be an object.");if(!Number.isInteger(a.offset)||a.offset<0)throw new TypeError("plane.offset must be a non-negative integer.");if(!Number.isInteger(a.stride)||a.stride<0)throw new TypeError("plane.stride must be a non-negative integer.")}}if(e.visibleRect!==void 0&&Xa(e.visibleRect,"init.visibleRect"),e.displayWidth!==void 0&&(!Number.isInteger(e.displayWidth)||e.displayWidth<=0))throw new TypeError("init.displayWidth, when provided, must be a positive integer.");if(e.displayHeight!==void 0&&(!Number.isInteger(e.displayHeight)||e.displayHeight<=0))throw new TypeError("init.displayHeight, when provided, must be a positive integer.");if(e.displayWidth!==void 0!=(e.displayHeight!==void 0))throw new TypeError("init.displayWidth and init.displayHeight must be either both provided or both omitted.");this.format=e.format,this.rotation=e.rotation??0,this.timestamp=e.timestamp,this.duration=e.duration??0;let r=e.layout??Bp(e.format,e.codedWidth,e.codedHeight),n=e.colorSpace??null;n===null&&(this.format==="RGBA"||this.format==="RGBX"||this.format==="BGRA"||this.format==="BGRX"?n={primaries:"bt709",transfer:"iec61966-2-1",matrix:"rgb",fullRange:!0}:n={primaries:"bt709",transfer:"bt709",matrix:"bt709",fullRange:!1}),this.visibleRect={left:e.visibleRect?.left??0,top:e.visibleRect?.top??0,width:e.visibleRect?.width??e.codedWidth,height:e.visibleRect?.height??e.codedHeight},e.displayWidth!==void 0?(this.squarePixelWidth=this.rotation%180===0?e.displayWidth:e.displayHeight,this.squarePixelHeight=this.rotation%180===0?e.displayHeight:e.displayWidth):(this.squarePixelWidth=this.visibleRect.width,this.squarePixelHeight=this.visibleRect.height),this._data=e._doNotCopy?Z(t):Z(t).slice(),this._layout=r,this.colorSpace=new Ci(n)}else if(typeof VideoFrame<"u"&&t instanceof VideoFrame){if(e?.rotation!==void 0&&![0,90,180,270].includes(e.rotation))throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");if(e?.timestamp!==void 0&&!Number.isFinite(e?.timestamp))throw new TypeError("init.timestamp, when provided, must be a number.");if(e?.duration!==void 0&&(!Number.isFinite(e.duration)||e.duration<0))throw new TypeError("init.duration, when provided, must be a non-negative number.");e?.visibleRect!==void 0&&Xa(e.visibleRect,"init.visibleRect"),this._data=t,this._layout=null,this.format=t.format,this.visibleRect={left:t.visibleRect?.x??0,top:t.visibleRect?.y??0,width:t.visibleRect?.width??t.codedWidth,height:t.visibleRect?.height??t.codedHeight},this.rotation=e?.rotation??0,this.squarePixelWidth=t.displayWidth,this.squarePixelHeight=t.displayHeight,this.timestamp=e?.timestamp??t.timestamp/1e6,this.duration=e?.duration??(t.duration??0)/1e6,this.colorSpace=new Ci(t.colorSpace)}else if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof SVGImageElement<"u"&&t instanceof SVGImageElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap||typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof OffscreenCanvas<"u"&&t instanceof OffscreenCanvas){if(!e||typeof e!="object")throw new TypeError("init must be an object.");if(e.rotation!==void 0&&![0,90,180,270].includes(e.rotation))throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");if(!Number.isFinite(e.timestamp))throw new TypeError("init.timestamp must be a number.");if(e.duration!==void 0&&(!Number.isFinite(e.duration)||e.duration<0))throw new TypeError("init.duration, when provided, must be a non-negative number.");if(e.visibleRect!==void 0&&Xa(e.visibleRect,"init.visibleRect"),typeof VideoFrame<"u")return new i(new VideoFrame(t,{timestamp:Math.trunc(e.timestamp*Lt),duration:Math.trunc((e.duration??0)*Lt)||void 0,visibleRect:e.visibleRect&&{x:e.visibleRect.left,y:e.visibleRect.top,width:e.visibleRect.width,height:e.visibleRect.height}}),e);let r=0,n=0;if("naturalWidth"in t?(r=t.naturalWidth,n=t.naturalHeight):"videoWidth"in t?(r=t.videoWidth,n=t.videoHeight):"width"in t&&(r=Number(t.width),n=Number(t.height)),!r||!n)throw new TypeError("Could not determine dimensions.");let a=e.visibleRect??{left:0,top:0,width:r,height:n},s=new OffscreenCanvas(a.width,a.height),o=s.getContext("2d",{alpha:mi(),willReadFrequently:!0});if(!o)throw new Error("OffscreenCanvas must have support for the '2d' context in order to create a VideoSample from this data.");o.drawImage(t,-a.left,-a.top),this._data=s,this._layout=null,this.format="RGBX",this.visibleRect={left:0,top:0,width:a.width,height:a.height},this.squarePixelWidth=a.width,this.squarePixelHeight=a.height,this.rotation=e.rotation??0,this.timestamp=e.timestamp,this.duration=e.duration??0,this.colorSpace=new Ci({matrix:"rgb",primaries:"bt709",transfer:"iec61966-2-1",fullRange:!0})}else if(t instanceof Bt){if(!e||typeof e!="object")throw new TypeError("init must be an object.");if(e.rotation!==void 0&&![0,90,180,270].includes(e.rotation))throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");if(!Number.isFinite(e.timestamp))throw new TypeError("init.timestamp must be a number.");if(e.duration!==void 0&&(!Number.isFinite(e.duration)||e.duration<0))throw new TypeError("init.duration, when provided, must be a non-negative number.");if(this._data=t,t._referenceCount++,this.format=t.getFormat(),this.format!==null&&!wa.includes(this.format))throw new TypeError("getFormat() must return a VideoSamplePixelFormat or null.");if(this.visibleRect={left:0,top:0,width:t.getCodedWidth(),height:t.getCodedHeight()},!Number.isInteger(this.visibleRect.width)||this.visibleRect.width<=0)throw new TypeError("getCodedWidth() must return a positive integer.");if(!Number.isInteger(this.visibleRect.height)||this.visibleRect.height<=0)throw new TypeError("getCodedHeight() must return a positive integer.");if(this.squarePixelWidth=t.getSquarePixelWidth(),!Number.isInteger(this.squarePixelWidth)||this.squarePixelWidth<=0)throw new TypeError("getSquarePixelWidth() must return a positive integer.");if(this.squarePixelHeight=t.getSquarePixelHeight(),!Number.isInteger(this.squarePixelHeight)||this.squarePixelHeight<=0)throw new TypeError("getSquarePixelHeight() must return a positive integer.");this.rotation=e.rotation??0,this.timestamp=e.timestamp,this.duration=e.duration??0,this.colorSpace=t.getColorSpace()}else throw new TypeError("Invalid data type: Must be a BufferSource, CanvasImageSource, or VideoSampleResource.");this.encodeOptions=e?.encodeOptions??{},this.pixelAspectRatio=Ht({num:this.squarePixelWidth*this.codedHeight,den:this.squarePixelHeight*this.codedWidth}),Ta?.register(this,{type:"video",data:this._data},this)}get codedWidth(){return this.visibleRect.width}get codedHeight(){return this.visibleRect.height}get displayWidth(){return this.rotation%180===0?this.squarePixelWidth:this.squarePixelHeight}get displayHeight(){return this.rotation%180===0?this.squarePixelHeight:this.squarePixelWidth}get microsecondTimestamp(){return Math.trunc(Lt*this.timestamp)}get microsecondDuration(){return Math.trunc(Lt*this.duration)}get hasAlpha(){return this.format&&this.format.includes("A")}clone(){if(this._closed)throw new Error("VideoSample is closed.");return g(this._data!==null),this._data instanceof Bt?new i(this._data,{timestamp:this.timestamp,duration:this.duration,rotation:this.rotation,encodeOptions:this.encodeOptions}):ya(this._data)?new i(this._data.clone(),{timestamp:this.timestamp,duration:this.duration,rotation:this.rotation,encodeOptions:this.encodeOptions}):this._data instanceof Uint8Array?(g(this._layout),new i(this._data,{format:this.format,layout:this._layout,codedWidth:this.codedWidth,codedHeight:this.codedHeight,timestamp:this.timestamp,duration:this.duration,colorSpace:this.colorSpace,rotation:this.rotation,visibleRect:this.visibleRect,displayWidth:this.displayWidth,displayHeight:this.displayHeight,encodeOptions:this.encodeOptions,_doNotCopy:!0})):new i(this._data,{format:this.format,codedWidth:this.codedWidth,codedHeight:this.codedHeight,timestamp:this.timestamp,duration:this.duration,colorSpace:this.colorSpace,rotation:this.rotation,visibleRect:this.visibleRect,displayWidth:this.displayWidth,displayHeight:this.displayHeight,encodeOptions:this.encodeOptions})}close(){this._closed||(Ta?.unregister(this),this._data instanceof Bt?(this._data._referenceCount--,this._data._referenceCount===0&&this._data.close()):ya(this._data)?this._data.close():this._data=null,this._closed=!0)}allocationSize(t={}){if(um(t),this._closed)throw new Error("VideoSample is closed.");if((t.format??this.format)==null)throw new Error("Cannot get allocation size when format is null.");return ya(this._data)?this._data.allocationSize(t):lm(this,t).allocationSize}async copyTo(t,e={}){if(!cr(t))throw new TypeError("destination must be an ArrayBuffer or an ArrayBuffer view.");if(um(e),this._closed)throw new Error("VideoSample is closed.");if((e.format??this.format)==null)throw new Error("Cannot copy video sample data when format is null.");if(g(this._data!==null),ya(this._data))return this._data.copyTo(t,e);if(e.format&&!["RGBA","RGBX","BGRA","BGRX"].includes(this.format)&&["RGBA","RGBX","BGRA","BGRX"].includes(e.format))if(this._data instanceof Bt){var u=[];try{let f=at(u,await this._data.toRgbSample({timestamp:this.timestamp,duration:this.duration,rotation:this.rotation},e.colorSpace??"srgb"));if(!(f instanceof i))throw new TypeError("toRgbSample() must return a VideoSample.");if(!["RGBA","RGBX","BGRA","BGRX"].includes(f.format))throw new Error(`Sample returned by toRgbSample was expected to have an RGB format, got '${f.format}' instead.`);return await f.copyTo(t,e)}catch(l){var m=l,d=!0}finally{st(u,m,d)}}else{if(typeof VideoFrame>"u")throw new Error("For this sample, converting from a non-RGB to an RGB format requires VideoFrame to be defined.");let f=this.toVideoFrame(),p=await f.copyTo(t,e);return f.close(),p}let r=lm(this,e);g(this.format);let n=Z(t);if(n.byteLength<r.allocationSize)throw new TypeError(`Destination buffer too small. Required: ${r.allocationSize}, Available: ${n.byteLength}`);let a=Eo(this.format),s;if(this._data instanceof Bt){let f=this._data.getDataPlanes();if(v(f)&&(f=await f),!Array.isArray(f)||f.some(p=>!(p.data instanceof Uint8Array)||!Number.isInteger(p.stride)||p.stride<0))throw new TypeError('getDataPlanes() must return an array of objects with a Uint8Array "data" property and a non-negative integer "stride" property.');s=f}else if(this._data instanceof Uint8Array)g(this._layout),g(this._layout.length===a.length),s=this._layout.map((f,p)=>{let b=Math.ceil(this.codedHeight/a[p].heightDivisor);return{data:this._data.subarray(f.offset,f.offset+f.stride*b),stride:f.stride}});else{let p=this._data.getContext("2d");g(p);let b=p.getImageData(0,0,this.codedWidth,this.codedHeight);s=[{data:Z(b.data),stride:4*this.codedWidth}]}let o=[],c=a.length;for(let f=0;f<c;f++){let p=r.computedLayouts[f],b=s[f].stride,h=s[f].data,y=p.sourceTop*b;y+=p.sourceLeftBytes;let k=p.destinationOffset,T=p.sourceWidthBytes,w={offset:k,stride:p.destinationStride};for(let x=0;x<p.sourceHeight;x++){if(y+T>h.byteLength)throw new Error("Source buffer OOB read.");if(k+T>n.byteLength)throw new Error("Destination buffer OOB write.");let C=h.subarray(y,y+T);n.set(C,k),y+=b,k+=p.destinationStride}o.push(w)}if(e.format!==void 0){let f=this.format.startsWith("RGB")!==e.format.startsWith("RGB"),p=this.format.includes("X")&&e.format.includes("A");if(f||p)for(let b=0;b<r.allocationSize;b+=4){if(f){let h=n[b],y=n[b+2];n[b]=y,n[b+2]=h}p&&(n[b+3]=255)}}return o}toVideoFrame(){if(this._closed)throw new Error("VideoSample is closed.");if(g(this._data!==null),this._data instanceof Bt){if(this.format===null)throw new Error("Cannot convert a VideoSampleResource-backed VideoSample to VideoFrame if format is null.");let t=this._data.getDataPlanes();if(v(t))throw new Error("Cannot convert a VideoSampleResource-backed VideoSample to VideoFrame if getDataPlanes() returns a promise.");let e=t.reduce((s,o)=>s+o.data.byteLength,0),r=new Uint8Array(e),n=0,a=[];for(let s of t)r.set(s.data,n),a.push(n),n+=s.data.byteLength;return new VideoFrame(r,{format:this.format,layout:t.map((s,o)=>({offset:a[o],stride:s.stride})),codedWidth:this.codedWidth,codedHeight:this.codedHeight,timestamp:this.microsecondTimestamp,duration:this.microsecondDuration,colorSpace:this.colorSpace,visibleRect:this.visibleRect,displayWidth:this.squarePixelWidth,displayHeight:this.squarePixelHeight})}else return ya(this._data)?new VideoFrame(this._data,{timestamp:this.microsecondTimestamp,duration:this.microsecondDuration||void 0}):this._data instanceof Uint8Array?(g(this._layout),new VideoFrame(this._data,{format:this.format,codedWidth:this.codedWidth,codedHeight:this.codedHeight,layout:this._layout,timestamp:this.microsecondTimestamp,duration:this.microsecondDuration||void 0,colorSpace:this.colorSpace,visibleRect:this.visibleRect,displayWidth:this.squarePixelWidth,displayHeight:this.squarePixelHeight})):new VideoFrame(this._data,{timestamp:this.microsecondTimestamp,duration:this.microsecondDuration||void 0})}draw(t,e,r,n,a,s,o,c,u){let l=0,m=0,d=this.displayWidth,f=this.displayHeight,p=0,b=0,h=this.displayWidth,y=this.displayHeight;if(s!==void 0?(l=e,m=r,d=n,f=a,p=s,b=o,c!==void 0?(h=c,y=u):(h=d,y=f)):(p=e,b=r,n!==void 0&&(h=n,y=a)),!(typeof CanvasRenderingContext2D<"u"&&t instanceof CanvasRenderingContext2D||typeof OffscreenCanvasRenderingContext2D<"u"&&t instanceof OffscreenCanvasRenderingContext2D))throw new TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");if(!Number.isFinite(l))throw new TypeError("sx must be a number.");if(!Number.isFinite(m))throw new TypeError("sy must be a number.");if(!Number.isFinite(d)||d<0)throw new TypeError("sWidth must be a non-negative number.");if(!Number.isFinite(f)||f<0)throw new TypeError("sHeight must be a non-negative number.");if(!Number.isFinite(p))throw new TypeError("dx must be a number.");if(!Number.isFinite(b))throw new TypeError("dy must be a number.");if(!Number.isFinite(h)||h<0)throw new TypeError("dWidth must be a non-negative number.");if(!Number.isFinite(y)||y<0)throw new TypeError("dHeight must be a non-negative number.");if(this._closed)throw new Error("VideoSample is closed.");({sx:l,sy:m,sWidth:d,sHeight:f}=this._rotateSourceRegion(l,m,d,f,this.rotation));let k=this.toCanvasImageSource();t.save();let T=p+h/2,w=b+y/2;t.translate(T,w),t.rotate(this.rotation*Math.PI/180);let x=this.rotation%180===0?1:h/y;t.scale(1/x,x),t.drawImage(k,l,m,d,f,-h/2,-y/2,h,y),t.restore()}drawWithFit(t,e){if(!(typeof CanvasRenderingContext2D<"u"&&t instanceof CanvasRenderingContext2D||typeof OffscreenCanvasRenderingContext2D<"u"&&t instanceof OffscreenCanvasRenderingContext2D))throw new TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");if(!e||typeof e!="object")throw new TypeError("options must be an object.");if(!["fill","contain","cover"].includes(e.fit))throw new TypeError("options.fit must be 'fill', 'contain', or 'cover'.");if(e.rotation!==void 0&&![0,90,180,270].includes(e.rotation))throw new TypeError("options.rotation, when provided, must be 0, 90, 180, or 270.");e.crop!==void 0&&Zr(e.crop,"options.");let r=t.canvas.width,n=t.canvas.height,a=e.rotation??this.rotation,[s,o]=a%180===0?[this.squarePixelWidth,this.squarePixelHeight]:[this.squarePixelHeight,this.squarePixelWidth],c=e.crop;c&&(c=fn(c,s,o));let u,l,m,d,{sx:f,sy:p,sWidth:b,sHeight:h}=this._rotateSourceRegion(e.crop?.left??0,e.crop?.top??0,e.crop?.width??s,e.crop?.height??o,a);if(e.fit==="fill")u=0,l=0,m=r,d=n;else{let[k,T]=e.crop?[e.crop.width,e.crop.height]:[s,o],w=e.fit==="contain"?Math.min(r/k,n/T):Math.max(r/k,n/T);m=k*w,d=T*w,u=(r-m)/2,l=(n-d)/2}t.save();let y=a%180===0?1:m/d;t.translate(r/2,n/2),t.rotate(a*Math.PI/180),t.scale(1/y,y),t.translate(-r/2,-n/2),t.drawImage(this.toCanvasImageSource(),f,p,b,h,u,l,m,d),t.restore()}_rotateSourceRegion(t,e,r,n,a){return a===90?[t,e,r,n]=[e,this.squarePixelHeight-t-r,n,r]:a===180?[t,e]=[this.squarePixelWidth-t-r,this.squarePixelHeight-e-n]:a===270&&([t,e,r,n]=[this.squarePixelWidth-e-n,t,n,r]),{sx:t,sy:e,sWidth:r,sHeight:n}}_drawWithFitAndMipmapping(t,e,r){let n=t.width,a=t.height,[s,o]=r.rotation%180===0?[this.squarePixelWidth,this.squarePixelHeight]:[this.squarePixelHeight,this.squarePixelWidth],c=r.crop?r.crop.width:s,u=r.crop?r.crop.height:o,l=0;2*n<c&&2*a<u&&(l=Math.floor(Math.log2(Math.min(c/n,u/a))));let m=n*2**l,d=a*2**l,{canvas:f,context:p,isNew:b}=l>0?cm(m,d):{canvas:t,context:e,isNew:r.targetIsFresh};p.imageSmoothingQuality="high",r.fillBlack?(p.fillStyle="black",p.fillRect(0,0,m,d)):b||p.clearRect(0,0,m,d),this.drawWithFit(p,{fit:r.fit,rotation:r.rotation,crop:r.crop}),p.globalCompositeOperation="copy";for(let h=l;h>1;h--){let y=n*2**h,k=a*2**h;p.drawImage(f,0,0,y,k,0,0,y/2,k/2)}p.globalCompositeOperation="source-over",l>0&&(e.imageSmoothingQuality="high",e.globalCompositeOperation="copy",e.drawImage(f,0,0,2*n,2*a,0,0,n,a),e.globalCompositeOperation="source-over")}toCanvasImageSource(){if(this._closed)throw new Error("VideoSample is closed.");if(g(this._data!==null),this._data instanceof Bt||this._data instanceof Uint8Array){let t=this.toVideoFrame();return queueMicrotask(()=>t.close()),t}else return this._data}async transform(t){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.width!==void 0&&(!Number.isInteger(t.width)||t.width<=0))throw new TypeError("options.width, when provided, must be a positive integer.");if(t.height!==void 0&&(!Number.isInteger(t.height)||t.height<=0))throw new TypeError("options.height, when provided, must be a positive integer.");if(t.roundDimensionsTo!==void 0&&(!Number.isInteger(t.roundDimensionsTo)||t.roundDimensionsTo<=0))throw new TypeError("options.roundDimensionsTo, when provided, must be a positive integer.");if(t.fit!==void 0&&!["fill","contain","cover"].includes(t.fit))throw new TypeError('options.fit, when provided, must be one of "fill", "contain", or "cover".');if(t.width!==void 0&&t.height!==void 0&&t.fit===void 0)throw new TypeError("When both options.width and options.height are provided, options.fit must also be provided.");if(t.rotate!==void 0&&![0,90,180,270].includes(t.rotate))throw new TypeError("options.rotate, when provided, must be 0, 90, 180 or 270.");if(t.crop!==void 0&&Zr(t.crop,"options."),t.alpha!==void 0&&!["keep","discard"].includes(t.alpha))throw new TypeError("options.alpha, when provided, must be 'keep' or 'discard'.");let e=kt(this.rotation+(t.rotate??0)),[r,n]=e%180===0?[this.squarePixelWidth,this.squarePixelHeight]:[this.squarePixelHeight,this.squarePixelWidth],a=t.crop;a&&(a=fn(a,r,n));let s=a?a.width:r,o=a?a.height:n,c=s/o,u,l;t.width!==void 0&&t.height===void 0?(u=t.width,l=u/c):t.width===void 0&&t.height!==void 0?(l=t.height,u=l*c):t.width!==void 0&&t.height!==void 0?(u=t.width,l=t.height):(u=s,l=o),u=Fn(u,t.roundDimensionsTo??1),l=Fn(l,t.roundDimensionsTo??1);let m={width:u,height:l,fit:t.fit??"fill",rotation:e,crop:a??{left:0,top:0,width:r,height:n},alpha:t.alpha??"keep"};for(let b of Eu){let h=b(this,m);if(v(h)&&(h=await h),h!==null)return h}let{canvas:d,context:f,isNew:p}=cm(m.width,m.height);return this._drawWithFitAndMipmapping(d,f,{fit:m.fit,rotation:m.rotation,crop:m.crop,targetIsFresh:p,fillBlack:m.alpha==="discard"}),new i(d,{timestamp:this.timestamp,duration:this.duration,rotation:0})}setRotation(t){if(![0,90,180,270].includes(t))throw new TypeError("newRotation must be 0, 90, 180, or 270.");this.rotation=t}setTimestamp(t){if(!Number.isFinite(t))throw new TypeError("newTimestamp must be a number.");this.timestamp=t}setDuration(t){if(!Number.isFinite(t)||t<0)throw new TypeError("newDuration must be a non-negative number.");this.duration=t}setEncodeOptions(t){if(!t||typeof t!="object")throw new TypeError("newEncodeOptions must be an object.");this.encodeOptions=t}[Symbol.dispose](){this.close()}},Eu=[],dm=i=>{Eu.includes(i)||Eu.push(i)},Mp=3,ba=[],om=0,cm=(i,t)=>{for(let n of ba)if(n.canvas.width===i&&n.canvas.height===t)return n.age=om++,{canvas:n.canvas,context:n.context,isNew:!1};let e;if(typeof OffscreenCanvas<"u")e=new OffscreenCanvas(i,t);else{if(typeof window>"u"||typeof document>"u")throw new Error("Cannot transform VideoSamples in this environment. Either run in an environment with OffscreenCanvas or HTMLCanvasElement, or supply a custom VideoSample transformer using registerVideoSampleTransformer().");e=document.createElement("canvas"),e.width=i,e.height=t}let r=e.getContext("2d",{alpha:!0,willReadFrequently:!1});if(!r)throw new Error("The '2d' canvas context is required to transform VideoSamples. Register a custom transformer using registerVideoSampleTransformer to work around this limitation.");return ba.length>=Mp&&ba.splice(Wi(ba,n=>n.age),1),ba.push({canvas:e,context:r,age:om++}),{canvas:e,context:r,isNew:!0}},Ci=class{constructor(t){if(t!==void 0){if(!t||typeof t!="object")throw new TypeError("init.colorSpace, when provided, must be an object.");let e=Object.keys(wt);if(t.primaries!=null&&!e.includes(t.primaries))throw new TypeError(`init.colorSpace.primaries, when provided, must be one of ${e.join(", ")}.`);let r=Object.keys(St);if(t.transfer!=null&&!r.includes(t.transfer))throw new TypeError(`init.colorSpace.transfer, when provided, must be one of ${r.join(", ")}.`);let n=Object.keys(At);if(t.matrix!=null&&!n.includes(t.matrix))throw new TypeError(`init.colorSpace.matrix, when provided, must be one of ${n.join(", ")}.`);if(t.fullRange!=null&&typeof t.fullRange!="boolean")throw new TypeError("init.colorSpace.fullRange, when provided, must be a boolean.")}this.primaries=t?.primaries??null,this.transfer=t?.transfer??null,this.matrix=t?.matrix??null,this.fullRange=t?.fullRange??null}toJSON(){return{primaries:this.primaries,transfer:this.transfer,matrix:this.matrix,fullRange:this.fullRange}}},ya=i=>typeof VideoFrame<"u"&&i instanceof VideoFrame,fn=(i,t,e)=>{let r=Math.min(i.left,t),n=Math.min(i.top,e),a=Math.min(i.width,t-r),s=Math.min(i.height,e-n);return g(a>=0),g(s>=0),{left:r,top:n,width:a,height:s}},Zr=(i,t)=>{if(!i||typeof i!="object")throw new TypeError(t+"crop, when provided, must be an object.");if(!Number.isInteger(i.left)||i.left<0)throw new TypeError(t+"crop.left must be a non-negative integer.");if(!Number.isInteger(i.top)||i.top<0)throw new TypeError(t+"crop.top must be a non-negative integer.");if(!Number.isInteger(i.width)||i.width<0)throw new TypeError(t+"crop.width must be a non-negative integer.");if(!Number.isInteger(i.height)||i.height<0)throw new TypeError(t+"crop.height must be a non-negative integer.")},um=i=>{if(!i||typeof i!="object")throw new TypeError("options must be an object.");if(i.colorSpace!==void 0&&!["display-p3","srgb"].includes(i.colorSpace))throw new TypeError("options.colorSpace, when provided, must be 'display-p3' or 'srgb'.");if(i.format!==void 0&&typeof i.format!="string")throw new TypeError("options.format, when provided, must be a string.");if(i.layout!==void 0){if(!Array.isArray(i.layout))throw new TypeError("options.layout, when provided, must be an array.");for(let t of i.layout){if(!t||typeof t!="object")throw new TypeError("Each entry in options.layout must be an object.");if(!Number.isInteger(t.offset)||t.offset<0)throw new TypeError("plane.offset must be a non-negative integer.");if(!Number.isInteger(t.stride)||t.stride<0)throw new TypeError("plane.stride must be a non-negative integer.")}}if(i.rect!==void 0){if(!i.rect||typeof i.rect!="object")throw new TypeError("options.rect, when provided, must be an object.");if(i.rect.x!==void 0&&(!Number.isInteger(i.rect.x)||i.rect.x<0))throw new TypeError("options.rect.x, when provided, must be a non-negative integer.");if(i.rect.y!==void 0&&(!Number.isInteger(i.rect.y)||i.rect.y<0))throw new TypeError("options.rect.y, when provided, must be a non-negative integer.");if(i.rect.width!==void 0&&(!Number.isInteger(i.rect.width)||i.rect.width<0))throw new TypeError("options.rect.width, when provided, must be a non-negative integer.");if(i.rect.height!==void 0&&(!Number.isInteger(i.rect.height)||i.rect.height<0))throw new TypeError("options.rect.height, when provided, must be a non-negative integer.")}},Bp=(i,t,e)=>{let r=Eo(i),n=[],a=0;for(let s of r){let o=Math.ceil(t/s.widthDivisor),c=Math.ceil(e/s.heightDivisor),u=o*s.sampleBytes,l=u*c;n.push({offset:a,stride:u}),a+=l}return n},Eo=i=>{let t=(e,r,n,a,s)=>{let o=[{sampleBytes:e,widthDivisor:1,heightDivisor:1},{sampleBytes:r,widthDivisor:n,heightDivisor:a},{sampleBytes:r,widthDivisor:n,heightDivisor:a}];return s&&o.push({sampleBytes:e,widthDivisor:1,heightDivisor:1}),o};switch(i){case"I420":return t(1,1,2,2,!1);case"I420P10":case"I420P12":return t(2,2,2,2,!1);case"I420A":return t(1,1,2,2,!0);case"I420AP10":case"I420AP12":return t(2,2,2,2,!0);case"I422":return t(1,1,2,1,!1);case"I422P10":case"I422P12":return t(2,2,2,1,!1);case"I422A":return t(1,1,2,1,!0);case"I422AP10":case"I422AP12":return t(2,2,2,1,!0);case"I444":return t(1,1,1,1,!1);case"I444P10":case"I444P12":return t(2,2,1,1,!1);case"I444A":return t(1,1,1,1,!0);case"I444AP10":case"I444AP12":return t(2,2,1,1,!0);case"NV12":return[{sampleBytes:1,widthDivisor:1,heightDivisor:1},{sampleBytes:2,widthDivisor:2,heightDivisor:2}];case"RGBA":case"RGBX":case"BGRA":case"BGRX":return[{sampleBytes:4,widthDivisor:1,heightDivisor:1}];default:ie(i),g(!1)}},lm=(i,t)=>{let e={left:0,top:0,width:i.codedWidth,height:i.codedHeight},r=t.rect,n=Op(e,r,i.codedWidth,i.codedHeight,i.format),a=t.layout,s;if(!t.format||t.format===i.format)s=i.format;else if(["RGBA","RGBX","BGRA","BGRX"].includes(t.format))s=t.format;else throw new Error("NotSupportedError: Invalid destination format.");return Vp(n,s,a)},Op=(i,t,e,r,n)=>{let a={...i};if(t!==void 0){if(t.width===0||t.height===0)throw new TypeError("visibleRect dimensions cannot be zero.");if((t.x||0)+(t.width||0)>e)throw new TypeError("visibleRect exceeds codedWidth.");if((t.y||0)+(t.height||0)>r)throw new TypeError("visibleRect exceeds codedHeight.");a.x=t.x||0,a.y=t.y||0,a.width=t.width||0,a.height=t.height||0}if(!Dp(n,a))throw new TypeError("visibleRect alignment is invalid for the format.");return a},Dp=(i,t)=>{if(i===null)return!0;let e=Eo(i);for(let r=0;r<e.length;r++){let n=e[r],a=n.widthDivisor,s=n.heightDivisor;if((t.x||0)%a!==0||(t.y||0)%s!==0)return!1}return!0},Vp=(i,t,e)=>{let r=Eo(t),n=r.length;if(e!==void 0&&e.length!==n)throw new TypeError(`Layout must have ${n} planes.`);let a=0,s=[],o=[];for(let c=0;c<n;c++){let u=r[c],l=u.sampleBytes,m=u.widthDivisor,d=u.heightDivisor,f={destinationOffset:0,destinationStride:0,sourceTop:0,sourceHeight:0,sourceLeftBytes:0,sourceWidthBytes:0};if(f.sourceTop=Math.ceil(Math.trunc(i.y||0)/d),f.sourceHeight=Math.ceil(Math.trunc(i.height||0)/d),f.sourceLeftBytes=Math.floor(Math.trunc(i.x||0)/m)*l,f.sourceWidthBytes=Math.floor(Math.trunc(i.width||0)/m)*l,e!==void 0){let h=e[c];if(h.stride<f.sourceWidthBytes)throw new TypeError(`Stride for plane ${c} is too small.`);f.destinationOffset=h.offset,f.destinationStride=h.stride}else f.destinationOffset=a,f.destinationStride=f.sourceWidthBytes;let b=f.destinationStride*f.sourceHeight+f.destinationOffset;if(b>4294967295)throw new TypeError("Allocation size exceeds limit.");o.push(b),a=Math.max(a,b);for(let h=0;h<c;h++){let y=s[h];if(!(o[c]<=y.destinationOffset||o[h]<=f.destinationOffset))throw new TypeError("Planes overlap.")}s.push(f)}return{allocationSize:a,computedLayouts:s}},Io=new Set(["f32","f32-planar","s16","s16-planar","s32","s32-planar","u8","u8-planar"]),Cr=class{constructor(){this._referenceCount=0}},Ae=class i{constructor(t){this._closed=!1;if(ka(t)){if(t.format===null)throw new TypeError("AudioData with null format is not supported.");this._data=t,this.format=t.format,this.sampleRate=t.sampleRate,this.numberOfFrames=t.numberOfFrames,this.numberOfChannels=t.numberOfChannels,this.timestamp=t.timestamp/1e6,this.duration=t.numberOfFrames/t.sampleRate}else if(t instanceof Cr){if(this._data=t,t._referenceCount++,this.format=t.getFormat(),!Io.has(this.format))throw new TypeError("getFormat() must return an AudioSampleFormat.");if(this.sampleRate=t.getSampleRate(),!Number.isInteger(this.sampleRate)||this.sampleRate<=0)throw new TypeError("getSampleRate() must return a positive integer.");if(this.numberOfFrames=t.getNumberOfFrames(),!Number.isInteger(this.numberOfFrames)||this.numberOfFrames<0)throw new TypeError("getNumberOfFrames() must return a non-negative integer.");if(this.numberOfChannels=t.getNumberOfChannels(),!Number.isInteger(this.numberOfChannels)||this.numberOfChannels<=0)throw new TypeError("getNumberOfChannels() must return a positive integer.");if(this.timestamp=t.getTimestamp(),!Number.isFinite(this.timestamp))throw new TypeError("getTimestamp() must return a finite number.");this.duration=this.numberOfFrames/this.sampleRate}else{if(!t||typeof t!="object")throw new TypeError("Invalid AudioDataInit: must be an object.");if(!Io.has(t.format))throw new TypeError("Invalid AudioDataInit: invalid format.");if(!Number.isFinite(t.sampleRate)||t.sampleRate<=0)throw new TypeError("Invalid AudioDataInit: sampleRate must be > 0.");if(!Number.isInteger(t.numberOfChannels)||t.numberOfChannels===0)throw new TypeError("Invalid AudioDataInit: numberOfChannels must be an integer > 0.");if(!Number.isFinite(t?.timestamp))throw new TypeError("init.timestamp must be a number.");let e=t.data.byteLength/($t(t.format)*t.numberOfChannels);if(!Number.isInteger(e))throw new TypeError("Invalid AudioDataInit: data size is not a multiple of frame size.");this.format=t.format,this.sampleRate=t.sampleRate,this.numberOfFrames=e,this.numberOfChannels=t.numberOfChannels,this.timestamp=t.timestamp,this.duration=e/t.sampleRate;let r;if(t.data instanceof ArrayBuffer)r=new Uint8Array(t.data);else if(ArrayBuffer.isView(t.data))r=new Uint8Array(t.data.buffer,t.data.byteOffset,t.data.byteLength);else throw new TypeError("Invalid AudioDataInit: data is not a BufferSource.");let n=this.numberOfFrames*this.numberOfChannels*$t(this.format);if(r.byteLength<n)throw new TypeError("Invalid AudioDataInit: insufficient data size.");this._data=r}Ta?.register(this,{type:"audio",data:this._data},this)}get microsecondTimestamp(){return Math.trunc(Lt*this.timestamp)}get microsecondDuration(){return Math.trunc(Lt*this.duration)}allocationSize(t){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(!Number.isInteger(t.planeIndex)||t.planeIndex<0)throw new TypeError("planeIndex must be a non-negative integer.");if(t.format!==void 0&&!Io.has(t.format))throw new TypeError("Invalid format.");if(t.frameOffset!==void 0&&(!Number.isInteger(t.frameOffset)||t.frameOffset<0))throw new TypeError("frameOffset must be a non-negative integer.");if(t.frameCount!==void 0&&(!Number.isInteger(t.frameCount)||t.frameCount<0))throw new TypeError("frameCount must be a non-negative integer.");if(this._closed)throw new Error("AudioSample is closed.");let e=t.format??this.format,r=t.frameOffset??0;if(r>=this.numberOfFrames)throw new RangeError("frameOffset out of range");let n=t.frameCount!==void 0?t.frameCount:this.numberOfFrames-r;if(n>this.numberOfFrames-r)throw new RangeError("frameCount out of range");let a=$t(e),s=xi(e);if(s&&t.planeIndex>=this.numberOfChannels)throw new RangeError("planeIndex out of range");if(!s&&t.planeIndex!==0)throw new RangeError("planeIndex out of range");return(s?n:n*this.numberOfChannels)*a}copyTo(t,e){if(!cr(t))throw new TypeError("destination must be an ArrayBuffer or an ArrayBuffer view.");if(!e||typeof e!="object")throw new TypeError("options must be an object.");if(!Number.isInteger(e.planeIndex)||e.planeIndex<0)throw new TypeError("planeIndex must be a non-negative integer.");if(e.format!==void 0&&!Io.has(e.format))throw new TypeError("Invalid format.");if(e.frameOffset!==void 0&&(!Number.isInteger(e.frameOffset)||e.frameOffset<0))throw new TypeError("frameOffset must be a non-negative integer.");if(e.frameCount!==void 0&&(!Number.isInteger(e.frameCount)||e.frameCount<0))throw new TypeError("frameCount must be a non-negative integer.");if(this._closed)throw new Error("AudioSample is closed.");let{format:r,frameCount:n,frameOffset:a}=e,{planeIndex:s}=e,o=this.format,c=r??this.format;if(!c)throw new Error("Destination format not determined");let u=this.numberOfFrames,l=this.numberOfChannels,m=a??0;if(m>=u)throw new RangeError("frameOffset out of range");let d=n!==void 0?n:u-m;if(d>u-m)throw new RangeError("frameCount out of range");let f=$t(c),p=xi(c);if(p&&s>=l)throw new RangeError("planeIndex out of range");if(!p&&s!==0)throw new RangeError("planeIndex out of range");let h=(p?d:d*l)*f;if(t.byteLength<h)throw new RangeError("Destination buffer is too small");let y=L(t),k=fm(c);if(ka(this._data))if(Wt()&&l>2&&c!==o){Up(this._data,y,o,c,l,s,m,d);return}else try{this._data.copyTo(t,{planeIndex:s,frameOffset:m,frameCount:d,format:c});return}catch(A){if(c==="f32-planar")throw A;o="f32-planar"}let T=mm(o),w=$t(o),x=xi(o),C;if(this._data instanceof Cr){let A=S=>{let I=this._data.getDataPlane(S);if(!(I instanceof Uint8Array))throw new TypeError("getDataPlane() must return a Uint8Array.");let E=u*w*(x?1:l);if(I.byteLength!==E)throw new TypeError(`Data plane ${S} has invalid size. Expected exactly ${E} bytes, got ${I.byteLength} bytes.`);return I};if(x)if(p)C=A(s),s=0;else{C=new Uint8Array(u*w*l);for(let S=0;S<l;S++){let I=A(S);C.set(I,S*u*w)}}else C=A(0)}else if(this._data instanceof Uint8Array)C=this._data;else if(g(o==="f32-planar"),p)C=new Uint8Array(this._data.allocationSize({format:"f32-planar",planeIndex:s})),this._data.copyTo(C,{format:"f32-planar",planeIndex:s}),s=0;else{C=new Uint8Array(this._data.allocationSize({format:"f32-planar",planeIndex:0})*l);for(let A=0;A<l;A++)this._data.copyTo(C.subarray(A*u*w,(A+1)*u*w),{format:"f32-planar",planeIndex:A})}let P=L(C);for(let A=0;A<d;A++)if(p){let S=A*f,I;x?I=(s*u+(A+m))*w:I=((A+m)*l+s)*w;let E=T(P,I);k(y,S,E)}else for(let S=0;S<l;S++){let E=(A*l+S)*f,R;x?R=(S*u+(A+m))*w:R=((A+m)*l+S)*w;let _=T(P,R);k(y,E,_)}}clone(){if(this._closed)throw new Error("AudioSample is closed.");if(this._data instanceof Cr){let t=new i(this._data);return t.setTimestamp(this.timestamp),t}else if(ka(this._data)){let t=new i(this._data.clone());return t.setTimestamp(this.timestamp),t}else return new i({format:this.format,sampleRate:this.sampleRate,numberOfFrames:this.numberOfFrames,numberOfChannels:this.numberOfChannels,timestamp:this.timestamp,data:this._data})}trim(t,e=this.numberOfFrames){if(!Number.isInteger(t)||t<0)throw new TypeError("startFrame must be a non-negative integer.");if(!Number.isInteger(e)||e<0)throw new TypeError("endFrame must be a non-negative integer.");if(t>this.numberOfFrames)throw new RangeError("startFrame out of range.");if(e>this.numberOfFrames)throw new RangeError("endFrame out of range.");if(e<t)throw new RangeError("endFrame must not be less than startFrame.");if(this._closed)throw new Error("AudioSample is closed.");let r=e-t,n=$t(this.format),a;if(xi(this.format)){let s=r*n;if(a=new Uint8Array(s*this.numberOfChannels),r>0)for(let o=0;o<this.numberOfChannels;o++)this.copyTo(a.subarray(o*s,(o+1)*s),{planeIndex:o,format:this.format,frameOffset:t,frameCount:r})}else a=new Uint8Array(r*this.numberOfChannels*n),r>0&&this.copyTo(a,{planeIndex:0,format:this.format,frameOffset:t,frameCount:r});return new i({data:a,format:this.format,sampleRate:this.sampleRate,numberOfChannels:this.numberOfChannels,timestamp:this.timestamp+t/this.sampleRate})}close(){this._closed||(Ta?.unregister(this),this._data instanceof Cr?(this._data._referenceCount--,this._data._referenceCount===0&&this._data.close()):ka(this._data)?this._data.close():this._data=new Uint8Array(0),this._closed=!0)}toAudioData(){if(this._closed)throw new Error("AudioSample is closed.");return this._data instanceof Cr?this._createAudioDataFromData():ka(this._data)?this._data.timestamp===this.microsecondTimestamp?this._data.clone():this._createAudioDataFromData():new AudioData({format:this.format,sampleRate:this.sampleRate,numberOfFrames:this.numberOfFrames,numberOfChannels:this.numberOfChannels,timestamp:this.microsecondTimestamp,data:this._data.buffer instanceof ArrayBuffer?this._data.buffer:this._data.slice()})}_createAudioDataFromData(){if(xi(this.format)){let t=this.allocationSize({planeIndex:0,format:this.format}),e=new ArrayBuffer(t*this.numberOfChannels);for(let r=0;r<this.numberOfChannels;r++)this.copyTo(new Uint8Array(e,r*t,t),{planeIndex:r,format:this.format});return new AudioData({format:this.format,sampleRate:this.sampleRate,numberOfFrames:this.numberOfFrames,numberOfChannels:this.numberOfChannels,timestamp:this.microsecondTimestamp,data:e})}else{let t=new ArrayBuffer(this.allocationSize({planeIndex:0,format:this.format}));return this.copyTo(t,{planeIndex:0,format:this.format}),new AudioData({format:this.format,sampleRate:this.sampleRate,numberOfFrames:this.numberOfFrames,numberOfChannels:this.numberOfChannels,timestamp:this.microsecondTimestamp,data:t})}}toAudioBuffer(){if(this._closed)throw new Error("AudioSample is closed.");let t=new AudioBuffer({numberOfChannels:this.numberOfChannels,length:this.numberOfFrames,sampleRate:this.sampleRate}),e=new Float32Array(this.allocationSize({planeIndex:0,format:"f32-planar"})/4);for(let r=0;r<this.numberOfChannels;r++)this.copyTo(e,{planeIndex:r,format:"f32-planar"}),t.copyToChannel(e,r);return t}setTimestamp(t){if(!Number.isFinite(t))throw new TypeError("newTimestamp must be a number.");this.timestamp=t}[Symbol.dispose](){this.close()}static*_fromAudioBuffer(t,e){if(!(t instanceof AudioBuffer))throw new TypeError("audioBuffer must be an AudioBuffer.");let r=48e3*5,n=t.numberOfChannels,a=t.sampleRate,s=t.length,o=Math.floor(r/n),c=0,u=s;for(;u>0;){let l=Math.min(o,u),m=new Float32Array(n*l);for(let d=0;d<n;d++)t.copyFromChannel(m.subarray(d*l,(d+1)*l),d,c);yield new i({format:"f32-planar",sampleRate:a,numberOfFrames:l,numberOfChannels:n,timestamp:e+c/a,data:m}),c+=l,u-=l}}static fromAudioBuffer(t,e){if(!(t instanceof AudioBuffer))throw new TypeError("audioBuffer must be an AudioBuffer.");let r=48e3*5,n=t.numberOfChannels,a=t.sampleRate,s=t.length,o=Math.floor(r/n),c=0,u=s,l=[];for(;u>0;){let m=Math.min(o,u),d=new Float32Array(n*m);for(let p=0;p<n;p++)t.copyFromChannel(d.subarray(p*m,(p+1)*m),p,c);let f=new i({format:"f32-planar",sampleRate:a,numberOfFrames:m,numberOfChannels:n,timestamp:e+c/a,data:d});l.push(f),c+=m,u-=m}return l}},$t=i=>{switch(i){case"u8":case"u8-planar":return 1;case"s16":case"s16-planar":return 2;case"s32":case"s32-planar":return 4;case"f32":case"f32-planar":return 4;default:throw new Error("Unknown AudioSampleFormat")}},xi=i=>{switch(i){case"u8-planar":case"s16-planar":case"s32-planar":case"f32-planar":return!0;default:return!1}},mm=i=>{switch(i){case"u8":case"u8-planar":return(t,e)=>(t.getUint8(e)-128)/128;case"s16":case"s16-planar":return(t,e)=>t.getInt16(e,!0)/32768;case"s32":case"s32-planar":return(t,e)=>t.getInt32(e,!0)/2147483648;case"f32":case"f32-planar":return(t,e)=>t.getFloat32(e,!0)}},fm=i=>{switch(i){case"u8":case"u8-planar":return(t,e,r)=>t.setUint8(e,ne((r+1)*127.5,0,255));case"s16":case"s16-planar":return(t,e,r)=>t.setInt16(e,ne(Math.round(r*32767),-32768,32767),!0);case"s32":case"s32-planar":return(t,e,r)=>t.setInt32(e,ne(Math.round(r*2147483647),-2147483648,2147483647),!0);case"f32":case"f32-planar":return(t,e,r)=>t.setFloat32(e,r,!0)}},ka=i=>typeof AudioData<"u"&&i instanceof AudioData,pm=i=>{switch(i){case"u8-planar":return"u8";case"s16-planar":return"s16";case"s32-planar":return"s32";case"f32-planar":return"f32";default:return i}},Up=(i,t,e,r,n,a,s,o)=>{let c=mm(e),u=fm(r),l=$t(e),m=$t(r),d=xi(e);if(xi(r))if(d){let p=new ArrayBuffer(o*l),b=L(p);i.copyTo(p,{planeIndex:a,frameOffset:s,frameCount:o,format:e});for(let h=0;h<o;h++){let y=h*l,k=h*m,T=c(b,y);u(t,k,T)}}else{let p=new ArrayBuffer(o*n*l),b=L(p);i.copyTo(p,{planeIndex:0,frameOffset:s,frameCount:o,format:e});for(let h=0;h<o;h++){let y=(h*n+a)*l,k=h*m,T=c(b,y);u(t,k,T)}}else if(d){let p=o*l,b=new ArrayBuffer(p),h=L(b);for(let y=0;y<n;y++){i.copyTo(b,{planeIndex:y,frameOffset:s,frameCount:o,format:e});for(let k=0;k<o;k++){let T=k*l,w=(k*n+y)*m,x=c(h,T);u(t,w,x)}}}else{let p=new ArrayBuffer(o*n*l),b=L(p);i.copyTo(p,{planeIndex:0,frameOffset:s,frameCount:o,format:e});for(let h=0;h<o;h++)for(let y=0;y<n;y++){let k=h*n+y,T=k*l,w=k*m,x=c(b,T);u(t,w,x)}}},hm=(i,t)=>{let e=i.allocationSize({format:t,planeIndex:0}),r=new ArrayBuffer(e);return i.copyTo(r,{format:t,planeIndex:0}),new Ae({data:r,format:t,numberOfChannels:i.numberOfChannels,sampleRate:i.sampleRate,timestamp:i.timestamp,duration:i.duration})};var vo=new Map,_o=new Map,Ro=i=>{if(!i||typeof i!="object")throw new TypeError("Encoding config must be an object.");if(!ce.includes(i.codec))throw new TypeError(`Invalid video codec '${i.codec}'. Must be one of: ${ce.join(", ")}.`);let t=i.bitrate;if(i.quality===void 0&&t===void 0)throw new TypeError("config.quality must be provided.");if(i.quality!==void 0&&t!==void 0)throw new TypeError("config.quality and config.bitrate cannot both be provided.");if(i.quality!==void 0&&!(i.quality instanceof de))throw new TypeError("config.quality, when provided, must be a Quality.");if(t!==void 0&&!(t instanceof de)&&(!Number.isInteger(t)||t<=0))throw new TypeError("config.bitrate, when provided, must be a positive integer or a quality.");if(i.keyFrameInterval!==void 0&&(!Number.isFinite(i.keyFrameInterval)||i.keyFrameInterval<0))throw new TypeError("config.keyFrameInterval, when provided, must be a non-negative number.");if(i.sizeChangeBehavior!==void 0&&!["deny","passThrough","fill","contain","cover"].includes(i.sizeChangeBehavior))throw new TypeError("config.sizeChangeBehavior, when provided, must be 'deny', 'passThrough', 'fill', 'contain' or 'cover'.");if(i.transform!==void 0){if(typeof i.transform!="object"||!i.transform)throw new TypeError("config.transform, when provided, must be an object.");if(i.transform.width!==void 0&&(!Number.isInteger(i.transform.width)||i.transform.width<=0))throw new TypeError("config.transform.width, when provided, must be a positive integer.");if(i.transform.height!==void 0&&(!Number.isInteger(i.transform.height)||i.transform.height<=0))throw new TypeError("config.transform.height, when provided, must be a positive integer.");if(i.transform.fit!==void 0&&!["fill","contain","cover"].includes(i.transform.fit))throw new TypeError('config.transform.fit, when provided, must be one of "fill", "contain", or "cover".');if(i.transform.width!==void 0&&i.transform.height!==void 0&&i.transform.fit===void 0&&!["fill","contain","cover"].includes(i.sizeChangeBehavior))throw new TypeError("When both config.transform.width and config.transform.height are provided, config.transform.fit must also be provided.");if(i.transform.fit!==void 0&&["fill","contain","cover"].includes(i.sizeChangeBehavior)&&i.transform.fit!==i.sizeChangeBehavior)throw new TypeError("config.transform.fit, when provided, cannot differ from config.sizeChangeBehavior when config.sizeChangeBehavior is 'fill', 'contain' or 'cover', as sizeChangeBehavior already determines the fitting algorithm.");if(i.transform.rotate!==void 0&&![0,90,180,270].includes(i.transform.rotate))throw new TypeError("config.transform.rotate, when provided, must be 0, 90, 180 or 270.");if(i.transform.crop!==void 0&&Zr(i.transform.crop,"config.transform."),i.transform.process!==void 0&&typeof i.transform.process!="function")throw new TypeError("config.transform.process, when provided, must be a function.");if(i.transform.frameRate!==void 0&&(!Number.isFinite(i.transform.frameRate)||i.transform.frameRate<=0))throw new TypeError("config.transform.frameRate, when provided, must be a finite positive number.");if(i.transform.force!==void 0&&typeof i.transform.force!="boolean")throw new TypeError("config.transform.force, when provided, must be a boolean.")}if(i.onEncodedPacket!==void 0&&typeof i.onEncodedPacket!="function")throw new TypeError("config.onEncodedPacket, when provided, must be a function.");if(i.onEncoderConfig!==void 0&&typeof i.onEncoderConfig!="function")throw new TypeError("config.onEncoderConfig, when provided, must be a function.");if(i.onEncodedSample!==void 0&&typeof i.onEncodedSample!="function")throw new TypeError("config.onEncodedSample, when provided, must be a function.");ym(i.codec,i)},ym=(i,t)=>{if(!t||typeof t!="object")throw new TypeError("Encoding options must be an object.");if(t.alpha!==void 0&&!["discard","keep"].includes(t.alpha))throw new TypeError("options.alpha, when provided, must be 'discard' or 'keep'.");let e=t.bitrateMode;if(e!==void 0&&!["constant","variable"].includes(e))throw new TypeError("bitrateMode, when provided, must be 'constant' or 'variable'.");if(t.latencyMode!==void 0&&!["quality","realtime"].includes(t.latencyMode))throw new TypeError("latencyMode, when provided, must be 'quality' or 'realtime'.");if(t.fullCodecString!==void 0&&typeof t.fullCodecString!="string")throw new TypeError("fullCodecString, when provided, must be a string.");if(t.fullCodecString!==void 0&&Xe(t.fullCodecString)!==i)throw new TypeError(`fullCodecString, when provided, must be a string that matches the specified codec (${i}).`);if(t.hardwareAcceleration!==void 0&&!["no-preference","prefer-hardware","prefer-software"].includes(t.hardwareAcceleration))throw new TypeError("hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");if(t.scalabilityMode!==void 0&&typeof t.scalabilityMode!="string")throw new TypeError("scalabilityMode, when provided, must be a string.");if(t.contentHint!==void 0&&typeof t.contentHint!="string")throw new TypeError("contentHint, when provided, must be a string.")},_u=i=>{let t=i.bitrateMode,e=i.quality._toVideoRateControl(i.codec,i.width,i.height,t),r=(a,s,o)=>({codec:i.fullCodecString??hs(i.codec,i.width,i.height,o,i.alpha==="keep"),width:i.width,height:i.height,displayWidth:i.squarePixelWidth,displayHeight:i.squarePixelHeight,bitrate:a,bitrateMode:s,alpha:i.alpha??"discard",framerate:i.framerate,latencyMode:i.latencyMode,hardwareAcceleration:i.hardwareAcceleration,scalabilityMode:i.scalabilityMode,contentHint:i.contentHint,...od(i.codec)}),n=[];return e.quantizer!==null&&n.push({config:r(void 0,"quantizer",e.bitrate),quantizer:e.quantizer}),e.bitrateMode!=="quantizer"&&n.push({config:r(e.bitrate,e.bitrateMode,e.bitrate),quantizer:null}),g(n.length>0),n},Fo=i=>{if(!i||typeof i!="object")throw new TypeError("Encoding config must be an object.");if(!fe.includes(i.codec))throw new TypeError(`Invalid audio codec '${i.codec}'. Must be one of: ${fe.join(", ")}.`);let t=i.bitrate;if(i.quality===void 0&&t===void 0&&!(se.includes(i.codec)||i.codec==="flac"))throw new TypeError("config.quality must be provided for compressed audio codecs.");if(i.quality!==void 0&&t!==void 0)throw new TypeError("config.quality and config.bitrate cannot both be provided.");if(i.quality!==void 0&&!(i.quality instanceof de))throw new TypeError("config.quality, when provided, must be a Quality.");if(t!==void 0&&!(t instanceof de)&&(!Number.isInteger(t)||t<=0))throw new TypeError("config.bitrate, when provided, must be a positive integer or a quality.");if(i.transform!==void 0){if(typeof i.transform!="object"||!i.transform)throw new TypeError("config.transform, when provided, must be an object.");if(i.transform.numberOfChannels!==void 0&&(!Number.isInteger(i.transform.numberOfChannels)||i.transform.numberOfChannels<=0))throw new TypeError("config.transform.numberOfChannels, when provided, must be a positive integer.");if(i.transform.sampleRate!==void 0&&(!Number.isInteger(i.transform.sampleRate)||i.transform.sampleRate<=0))throw new TypeError("config.transform.sampleRate, when provided, must be a positive integer.");if(i.transform.sampleFormat!==void 0&&!["u8","s16","s32","f32"].includes(i.transform.sampleFormat))throw new TypeError("config.transform.sampleFormat, when provided, must be one of: u8, s16, s32, f32.");if(i.transform.process!==void 0&&typeof i.transform.process!="function")throw new TypeError("config.transform.process, when provided, must be a function.")}if(i.onEncodedPacket!==void 0&&typeof i.onEncodedPacket!="function")throw new TypeError("config.onEncodedPacket, when provided, must be a function.");if(i.onEncoderConfig!==void 0&&typeof i.onEncoderConfig!="function")throw new TypeError("config.onEncoderConfig, when provided, must be a function.");if(i.onEncodedSample!==void 0&&typeof i.onEncodedSample!="function")throw new TypeError("config.onEncodedSample, when provided, must be a function.");km(i.codec,i)},km=(i,t)=>{if(!t||typeof t!="object")throw new TypeError("Encoding options must be an object.");let e=t.bitrateMode;if(e!==void 0&&!["constant","variable"].includes(e))throw new TypeError("bitrateMode, when provided, must be 'constant' or 'variable'.");if(t.fullCodecString!==void 0&&typeof t.fullCodecString!="string")throw new TypeError("fullCodecString, when provided, must be a string.");if(t.fullCodecString!==void 0&&Xe(t.fullCodecString)!==i)throw new TypeError(`fullCodecString, when provided, must be a string that matches the specified codec (${i}).`)},Ru=i=>{let t=i.bitrateMode;return{codec:i.fullCodecString??ys(i.codec,i.numberOfChannels,i.sampleRate),numberOfChannels:i.numberOfChannels,sampleRate:i.sampleRate,bitrate:i.quality?._toAudioBitrate(i.codec),bitrateMode:i.quality?._bitrateMode??t,...cd(i.codec)}},de=class{constructor(t){if((typeof t=="number"||typeof t=="string")&&(t={quality:t}),!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.bitrateMode!==void 0&&!["constant","variable"].includes(t.bitrateMode))throw new TypeError("options.bitrateMode, when provided, must be 'constant' or 'variable'.");if("quality"in t){if(typeof t.quality=="string"?!(t.quality in gm):typeof t.quality!="number"||Number.isNaN(t.quality))throw new TypeError("options.quality must be a number, or one of 'very-low', 'low', 'medium', 'high' or 'very-high'.");if(t.preferBitrate!==void 0&&typeof t.preferBitrate!="boolean")throw new TypeError("options.preferBitrate, when provided, must be a boolean.");if("bitrate"in t||"quantizer"in t)throw new TypeError("options.quality cannot be combined with options.bitrate or options.quantizer.");this._quality=typeof t.quality=="string"?gm[t.quality]:t.quality,this._preferBitrate=t.preferBitrate??!1,this._bitrate=void 0,this._quantizer=void 0}else{if(t.bitrate!==void 0&&(!Number.isInteger(t.bitrate)||t.bitrate<=0))throw new TypeError("options.bitrate, when provided, must be a positive integer.");if(t.quantizer!==void 0&&(!Number.isInteger(t.quantizer)||t.quantizer<0))throw new TypeError("options.quantizer, when provided, must be a non-negative integer.");if(t.bitrate===void 0&&t.quantizer===void 0)throw new TypeError("At least one of options.bitrate or options.quantizer must be set.");if("preferBitrate"in t)throw new TypeError("options.preferBitrate can only be combined with options.quality.");this._quality=void 0,this._preferBitrate=!1,this._bitrate=t.bitrate,this._quantizer=t.quantizer}this._bitrateMode=t.bitrateMode}_toVideoRateControl(t,e,r,n){let a=zp[t],s=null,o=this._bitrateMode??n??"variable";if(this._quantizer!==void 0){if(a)if(this._quantizer<a.min||this._quantizer>a.max){if(this._bitrate===void 0)throw new Error(`Quantizer ${this._quantizer} is out of range for codec '${t}'; must be between ${a.min} and ${a.max}.`)}else s=this._quantizer,this._bitrate===void 0&&(o="quantizer");else if(this._bitrate===void 0)throw new Error(`Codec '${t}' does not support quantizer-based encoding. Provide a bitrate in the Quality to define a fallback.`)}else this._bitrate===void 0&&a&&!this._preferBitrate&&(g(this._quality!==void 0),s=ne(Math.round(Sl(a.worst,a.best,this._quality)),a.min,a.max));let c;if(this._bitrate!==void 0)c=this._bitrate;else{let u=this._quality;u===void 0&&(g(s!==null&&a),u=ne((s-a.worst)/(a.best-a.worst),0,1)),c=bm(t,e,r,vu(u))}return{quantizer:s,bitrate:c,bitrateMode:o}}_toVideoBitrate(t,e,r){return this._bitrate!==void 0?this._bitrate:(g(this._quality!==void 0),bm(t,e,r,vu(this._quality)))}_toAudioBitrate(t){if(se.includes(t)||t==="flac")return;if(this._bitrate!==void 0)return this._bitrate;if(this._quality===void 0)throw new Error("This Quality defines neither a quality level nor a bitrate and therefore cannot be used for audio encoding.");let e=vu(this._quality),n={aac:128e3,opus:64e3,mp3:16e4,vorbis:64e3,ac3:384e3,eac3:192e3,dts:768e3}[t];if(!n)throw new Error(`Unhandled codec: ${t}`);let a=n*e;return t==="aac"?a=[96e3,128e3,16e4,192e3].reduce((o,c)=>Math.abs(c-a)<Math.abs(o-a)?c:o):t==="opus"||t==="vorbis"?a=Math.max(6e3,a):t==="mp3"&&(a=[8e3,16e3,24e3,32e3,4e4,48e3,64e3,8e4,96e3,112e3,128e3,16e4,192e3,224e3,256e3,32e4].reduce((o,c)=>Math.abs(c-a)<Math.abs(o-a)?c:o)),Math.round(a/1e3)*1e3}},gm={"very-low":0,low:.25,medium:.5,high:.75,"very-high":1},zp={avc:{min:0,max:51,worst:41,best:16},hevc:{min:0,max:51,worst:41,best:16},vp9:{min:0,max:63,worst:52,best:20},av1:{min:0,max:255,worst:208,best:80}},vu=i=>.3*Math.exp(2.5538*i),bm=(i,t,e,r)=>{let n=t*e,a=1920*1080,s=3e6,o=Math.pow(n/a,.95),c=s*o,u={avc:1,hevc:.6,vp9:.6,av1:.4,vp8:1.2,prores:22e7/s},m=c*u[i]*r;return Math.ceil(m/1e3)*1e3},Fu=(i,t)=>{if(i==="avc")return{avc:{quantizer:t}};if(i==="hevc")return{hevc:{quantizer:t}};if(i==="vp9")return{vp9:{quantizer:t}};if(i==="av1")return{av1:{quantizer:t}};g(!1)},Tm=new de("very-low"),wm=new de("low"),Sm=new de("medium"),Am=new de("high"),xm=new de("very-high"),Cm=i=>{if(ce.includes(i))return Sa(i);if(fe.includes(i))return Aa(i);if(He.includes(i))return xa(i);throw new TypeError(`Unknown codec '${i}'.`)},Sa=async(i,t={})=>{let{width:e=1280,height:r=720,quality:n,bitrate:a,...s}=t;if(!ce.includes(i))return!1;if(!Number.isInteger(e)||e<=0)throw new TypeError("width must be a positive integer.");if(!Number.isInteger(r)||r<=0)throw new TypeError("height must be a positive integer.");if(n!==void 0&&!(n instanceof de))throw new TypeError("quality, when provided, must be a Quality.");if(n!==void 0&&a!==void 0)throw new TypeError("quality and bitrate cannot both be provided.");if(a!==void 0&&!(a instanceof de)&&(!Number.isInteger(a)||a<=0))throw new TypeError("bitrate must be a positive integer or a quality.");ym(i,s);let o=Jr(n,a)??new de("medium"),c;try{c=_u({codec:i,width:e,height:r,quality:o,framerate:void 0,...s,alpha:"discard"})}catch{return!1}let u=JSON.stringify(c),l=vo.get(u);if(l)return l;let m=(async()=>{for(let{config:f}of c)if(hn.some(p=>p.supports(i,f)))return!0;if(typeof VideoEncoder>"u"||(e%2===1||r%2===1)&&(i==="avc"||i==="hevc"))return!1;for(let{config:f,quantizer:p}of c){try{if(!(await VideoEncoder.isConfigSupported(f)).supported)continue}catch{continue}if(!mi()||await new Promise(async h=>{try{let y=new VideoEncoder({output:()=>{},error:()=>h(!1)});y.configure(f);let k=new Uint8Array(e*r*4),T=new VideoFrame(k,{format:"RGBA",codedWidth:e,codedHeight:r,timestamp:0});y.encode(T,p!==null?Fu(i,p):void 0),T.close(),await y.flush(),h(!0)}catch{h(!1)}}))return!0}return!1})();return vo.set(u,m),m},Aa=async(i,t={})=>{let{numberOfChannels:e=2,sampleRate:r=48e3,quality:n,bitrate:a,...s}=t;if(!fe.includes(i))return!1;if(!Number.isInteger(e)||e<=0)throw new TypeError("numberOfChannels must be a positive integer.");if(!Number.isInteger(r)||r<=0)throw new TypeError("sampleRate must be a positive integer.");if(n!==void 0&&!(n instanceof de))throw new TypeError("quality, when provided, must be a Quality.");if(n!==void 0&&a!==void 0)throw new TypeError("quality and bitrate cannot both be provided.");if(a!==void 0&&!(a instanceof de)&&(!Number.isInteger(a)||a<=0))throw new TypeError("bitrate must be a positive integer.");km(i,s);let o=Jr(n,a)??new de("medium"),c=Ru({codec:i,numberOfChannels:e,sampleRate:r,quality:o,...s}),u=JSON.stringify(c),l=_o.get(u);if(l)return l;let m=(async()=>{if(gn.some(d=>d.supports(i,c))||se.includes(i))return!0;if(typeof AudioEncoder>"u")return!1;try{return(await AudioEncoder.isConfigSupported(c)).supported===!0}catch{return!1}})();return _o.set(u,m),m},Jr=(i,t)=>{if(i!==void 0)return i;if(t!==void 0)return t instanceof de?t:new de({bitrate:t})},xa=async i=>!!He.includes(i),Pm=async()=>{let[i,t,e]=await Promise.all([Mu(),pn(),Bu()]);return[...i,...t,...e]},Mu=async(i=ce,t)=>{let e=await Promise.all(i.map(r=>Sa(r,t)));return i.filter((r,n)=>e[n])},pn=async(i=fe,t)=>{let e=await Promise.all(i.map(r=>Aa(r,t)));return i.filter((r,n)=>e[n])},Bu=async(i=He)=>{let t=await Promise.all(i.map(xa));return i.filter((e,r)=>t[r])},Mo=async(i,t)=>{for(let e of i)if(await Sa(e,t))return e;return null},Im=async(i,t)=>{for(let e of i)if(await Aa(e,t))return e;return null},Em=async i=>{for(let t of i)if(await xa(t))return t;return null};var Ca=class{static supports(t,e){return!1}},Pa=class{static supports(t,e){return!1}},Ia=class{static supports(t,e){return!1}},Ea=class{static supports(t,e){return!1}},$r=[],Yr=[],hn=[],gn=[],vm=i=>{if(i.prototype instanceof Ca){let t=i;if($r.includes(t)){U._warn("Video decoder already registered.");return}$r.push(t),Ao.clear()}else if(i.prototype instanceof Pa){let t=i;if(Yr.includes(t)){U._warn("Audio decoder already registered.");return}Yr.push(t),xo.clear()}else throw new TypeError("Decoder must be a CustomVideoDecoder or CustomAudioDecoder.")},_m=i=>{if(i.prototype instanceof Ia){let t=i;if(hn.includes(t)){U._warn("Video encoder already registered.");return}hn.push(t),vo.clear()}else if(i.prototype instanceof Ea){let t=i;if(gn.includes(t)){U._warn("Audio encoder already registered.");return}gn.push(t),_o.clear()}else throw new TypeError("Encoder must be a CustomVideoEncoder or CustomAudioEncoder.")};var Rm=i=>{let r=i,n=4096,a=0,s=12,o=0;for(r<0&&(r=-r,a=128),r+=33,r>8191&&(r=8191);(r&n)!==n&&s>=5;)n>>=1,s--;return o=r>>s-4&15,~(a|s-5<<4|o)&255},Fm=i=>{let e=0,r=0,n=~i;n&128&&(n&=-129,e=-1),r=((n&240)>>4)+5;let a=(1<<r|(n&15)<<r-4|1<<r-5)-33;return e===0?a:-a},Mm=i=>{let e=2048,r=0,n=11,a=0,s=i;for(s<0&&(s=-s,r=128),s>4095&&(s=4095);(s&e)!==e&&n>=5;)e>>=1,n--;return a=s>>(n===4?1:n-4)&15,(r|n-4<<4|a)^85},Bm=i=>{let t=0,e=0,r=i^85;r&128&&(r&=-129,t=-1),e=((r&240)>>4)+4;let n=0;return e!==4?n=1<<e|(r&15)<<e-4|1<<e-5:n=r<<1|1,t===0?n:-n};var Pi=i=>{if(!i||typeof i!="object")throw new TypeError("options must be an object.");if(i.metadataOnly!==void 0&&typeof i.metadataOnly!="boolean")throw new TypeError("options.metadataOnly, when defined, must be a boolean.");if(i.verifyKeyPackets!==void 0&&typeof i.verifyKeyPackets!="boolean")throw new TypeError("options.verifyKeyPackets, when defined, must be a boolean.");if(i.verifyKeyPackets&&i.metadataOnly)throw new TypeError("options.verifyKeyPackets and options.metadataOnly cannot be enabled together.");if(i.skipLiveWait!==void 0&&typeof i.skipLiveWait!="boolean")throw new TypeError("options.skipLiveWait, when defined, must be a boolean.")},Pr=i=>{if(!Me(i))throw new TypeError("timestamp must be a number.")},Ou=(i,t,e)=>e.verifyKeyPackets?t.then(async r=>{if(!r||r.type==="delta")return r;let n=await i.determinePacketType(r);return n&&(r.type=n),r}):t,et=class{constructor(t){if(!(t instanceof ti))throw new TypeError("track must be an InputTrack.");this._track=t}async getFirstPacket(t={}){if(Pi(t),this._track.input._disposed)throw new ke;return Ou(this._track,this._track._backing.getFirstPacket(t),t)}async getFirstKeyPacket(t={}){Pi(t);let e=await this.getFirstPacket(t);return e?e.type==="key"?e:this.getNextKeyPacket(e,t):null}async getPacket(t,e={}){if(Pr(t),Pi(e),this._track.input._disposed)throw new ke;return Ou(this._track,this._track._backing.getPacket(t,e),e)}async getNextPacket(t,e={}){if(!(t instanceof j))throw new TypeError("packet must be an EncodedPacket.");if(Pi(e),this._track.input._disposed)throw new ke;return Ou(this._track,this._track._backing.getNextPacket(t,e),e)}async getKeyPacket(t,e={}){if(Pr(t),Pi(e),this._track.input._disposed)throw new ke;if(!e.verifyKeyPackets)return this._track._backing.getKeyPacket(t,e);let r=await this._track._backing.getKeyPacket(t,e);return r&&(g(r.type==="key"),await this._track.determinePacketType(r)==="delta"?this.getKeyPacket(r.timestamp-1/await this._track.getTimeResolution(),e):r)}async getNextKeyPacket(t,e={}){if(!(t instanceof j))throw new TypeError("packet must be an EncodedPacket.");if(Pi(e),this._track.input._disposed)throw new ke;if(!e.verifyKeyPackets)return this._track._backing.getNextKeyPacket(t,e);let r=await this._track._backing.getNextKeyPacket(t,e);return r&&(g(r.type==="key"),await this._track.determinePacketType(r)==="delta"?this.getNextKeyPacket(r,e):r)}packets(t,e,r={}){if(t!==void 0&&!(t instanceof j))throw new TypeError("startPacket must be an EncodedPacket.");if(t!==void 0&&t.isMetadataOnly&&!r?.metadataOnly)throw new TypeError("startPacket can only be metadata-only if options.metadataOnly is enabled.");if(e!==void 0&&!(e instanceof j))throw new TypeError("endPacket must be an EncodedPacket.");if(Pi(r),this._track.input._disposed)throw new ke;let n=[],{promise:a,resolve:s}=te(),{promise:o,resolve:c}=te(),u=!1,l=!1,m=null,d=!1,f=[],p=()=>Math.max(2,f.length);(async()=>{let h=t??await this.getFirstPacket(r);for(;h&&!l&&!this._track.input._disposed&&!(e&&h.sequenceNumber>=e?.sequenceNumber);){if(n.length>p()){({promise:o,resolve:c}=te()),await o;continue}n.push(h),s(),{promise:a,resolve:s}=te(),h=await this.getNextPacket(h,r)}u=!0,s()})().catch(h=>{d||(m=h,d=!0,s())});let b=this._track;return{async next(){for(;;){if(b.input._disposed)throw new ke;if(l)return{value:void 0,done:!0};if(d)throw m;if(n.length>0){let h=n.shift(),y=performance.now();for(f.push(y);f.length>0&&y-f[0]>=1e3;)f.shift();return c(),{value:h,done:!1}}else{if(u)return{value:void 0,done:!0};await a}}},async return(){return l=!0,c(),s(),{value:void 0,done:!0}},async throw(h){throw h},[Symbol.asyncIterator](){return this}}}},va=class{constructor(t,e){this.onSample=t;this.onError=e}},bn=class{mediaSamplesInRange(t=-1/0,e=1/0,r){Pr(t),Pr(e);let n=[],a=!1,s=null,{promise:o,resolve:c}=te(),{promise:u,resolve:l}=te(),m=!1,d=!1,f=!1,p=null,b=null,h=!1,y={...r,verifyKeyPackets:!0,metadataOnly:!1};(async()=>{p=await this._createDecoder(S=>{if(l(),S.timestamp>=e&&(d=!0),d){S.close();return}s&&(S.timestamp>t?(n.push(s),a=!0):s.close()),S.timestamp>=t&&(n.push(S),a=!0),s=a?null:S,n.length>0&&(c(),{promise:o,resolve:c}=te())},S=>{h||(b=S,h=!0,c())});let w=this._createPacketSink(),x=await w.getKeyPacket(t,y)??await w.getFirstKeyPacket(y),C=x,A=w.packets(x??void 0,void 0,y);for(await A.next();C&&!d&&!this._track.input._disposed;){let S=Om(n.length);if(n.length+p.getDecodeQueueSize()>S){({promise:u,resolve:l}=te()),await u;continue}p.decode(C);let I=await A.next();if(I.done)break;C=I.value}await A.return(),!f&&!this._track.input._disposed&&await p.flush(),!a&&s&&n.push(s),m=!0,c()})().catch(w=>{h||(b=w,h=!0,c())}).finally(()=>{p?.close()});let k=this._track,T=()=>{s?.close();for(let w of n)w.close()};return{async next(){for(;;){if(k.input._disposed)throw f=!0,d=!0,T(),new ke;if(f)return{value:void 0,done:!0};if(h)throw f=!0,d=!0,T(),b;if(n.length>0){let w=n.shift();return l(),{value:w,done:!1}}else if(!m)await o;else return{value:void 0,done:!0}}},async return(){return f=!0,d=!0,l(),c(),T(),{value:void 0,done:!0}},async throw(w){throw w},[Symbol.asyncIterator](){return this}}}mediaSamplesAtTimestamps(t,e){yl(t);let r=bl(t),n=[],a=[],{promise:s,resolve:o}=te(),{promise:c,resolve:u}=te(),l=!1,m=!1,d=null,f=null,p=!1,b=T=>{a.push(T),o(),{promise:s,resolve:o}=te()},h={...e,verifyKeyPackets:!0,metadataOnly:!1};(async()=>{d=await this._createDecoder(S=>{if(u(),m){S.close();return}let I=0;for(;n.length>0&&S.timestamp-n[0]>-1e-10;)I++,n.shift();if(I>0)for(let E=0;E<I;E++)b(E<I-1?S.clone():S);else S.close()},S=>{p||(f=S,p=!0,o())});let T=this._createPacketSink(),w=null,x=null,C=-1,P=async()=>{g(x),g(d);let S=x;for(d.decode(S);S.sequenceNumber<C;){let I=Om(a.length);for(;a.length+d.getDecodeQueueSize()>I&&!m;)({promise:c,resolve:u}=te()),await c;if(m)break;let E=await T.getNextPacket(S,h);g(E),d.decode(E),S=E}C=-1},A=async()=>{g(d),await d.flush();for(let S=0;S<n.length;S++)b(null);n.length=0};for await(let S of r){if(Pr(S),m||this._track.input._disposed)break;let I=await T.getPacket(S,h),E=I&&await T.getKeyPacket(S,h);if(!E){C!==-1&&(await P(),await A()),b(null),w=null;continue}w&&(E.sequenceNumber!==x.sequenceNumber||I.timestamp<w.timestamp)&&(await P(),await A()),n.push(I.timestamp),C=Math.max(I.sequenceNumber,C),w=I,x=E}!m&&!this._track.input._disposed&&(C!==-1&&await P(),await A()),l=!0,o()})().catch(T=>{p||(f=T,p=!0,o())}).finally(()=>{d?.close()});let y=this._track,k=()=>{for(let T of a)T?.close()};return{async next(){for(;;){if(y.input._disposed)throw m=!0,k(),new ke;if(m)return{value:void 0,done:!0};if(p)throw m=!0,k(),f;if(a.length>0){let T=a.shift();return g(T!==void 0),u(),{value:T,done:!1}}else if(!l)await s;else return{value:void 0,done:!0}}},async return(){return m=!0,u(),o(),k(),{value:void 0,done:!0}},async throw(T){throw T},[Symbol.asyncIterator](){return this}}}},Om=i=>i===0?40:8,Vu=class extends va{constructor(e,r,n,a,s,o){super(e,r);this.codec=n;this.decoderConfig=a;this.rotation=s;this.timeResolution=o;this.decoder=null;this.customDecoder=null;this.customDecoderCallSerializer=new vr;this.customDecoderQueueSize=0;this.inputTimestamps=[];this.sampleQueue=[];this.currentPacketIndex=0;this.raslSkipped=!1;this.alphaDecoder=null;this.alphaHadKeyframe=!1;this.colorQueue=[];this.alphaQueue=[];this.merger=null;this.decodedAlphaChunkCount=0;this.alphaDecoderQueueSize=0;this.nullAlphaFrameQueue=[];this.currentAlphaPacketIndex=0;this.alphaRaslSkipped=!1;this.finalSamples=[];this.mergeAlphaPromises=[];let c=$r.find(u=>u.supports(n,a));if(c)this.customDecoder=new c,this.customDecoder.codec=n,this.customDecoder.config=a,this.customDecoder.onSample=u=>{if(!(u instanceof We))throw new TypeError("The argument passed to onSample must be a VideoSample.");this.finalizeAndEmitSample(u)},this.customDecoder.onError=u=>{r(u)},this.customDecoderCallSerializer.call(()=>this.customDecoder.init()).catch(u=>r(u));else{let u=m=>{if(this.alphaQueue.length>0){let d=this.alphaQueue.shift();g(d!==void 0),this.mergeAlpha(m,d)}else this.colorQueue.push(m)};if(Mn()){if(n==="avc"&&this.decoderConfig.description){let m=qi(Z(this.decoderConfig.description));if(m&&m.sequenceParameterSets.length>0){let d=Or(m.sequenceParameterSets[0]);d&&(d.frameMbsOnlyFlag===0&&(this.decoderConfig={...this.decoderConfig,hardwareAcceleration:"prefer-software"}),d.maxDecFrameBuffering!==0&&d.bitstreamRestrictionFlag!==1&&(m.sequenceParameterSets[0]=Dc(d),this.decoderConfig={...this.decoderConfig,description:is(m)}))}}Ui(this.decoderConfig.colorSpace)||(this.decoderConfig={...this.decoderConfig,colorSpace:{primaries:this.decoderConfig.colorSpace?.primaries??"bt709",matrix:this.decoderConfig.colorSpace?.matrix??"bt709",transfer:this.decoderConfig.colorSpace?.transfer??"bt709",fullRange:this.decoderConfig.colorSpace?.fullRange??!1}})}let l=new Error("Decoding error").stack;this.decoder=new VideoDecoder({output:m=>{try{u(m)}catch(d){this.onError(d)}},error:m=>{m.stack=l,this.onError(m)}}),this.decoder.configure(this.decoderConfig)}}getDecodeQueueSize(){return this.customDecoder?this.customDecoderQueueSize:(g(this.decoder),Math.max(this.decoder.decodeQueueSize,this.alphaDecoder?.decodeQueueSize??0))}decode(e){if(this.codec==="hevc"&&this.currentPacketIndex>0&&!this.raslSkipped){if(this.hasHevcRaslPicture(e.data))return;this.raslSkipped=!0}if(this.customDecoder)this.customDecoderQueueSize++,this.customDecoderCallSerializer.call(()=>this.customDecoder.decode(e)).catch(r=>this.onError(r)).finally(()=>this.customDecoderQueueSize--);else{if(g(this.decoder),Wt()||Sc(this.inputTimestamps,e.timestamp,r=>r),Mn()&&this.currentPacketIndex===0){if(this.codec==="avc"){let r=[],n=!1;for(let s of Oc(e.data,this.decoderConfig)){let o=Gt(e.data[s.offset]);if(n||=o>=1&&o<=5,o===9){if(n)break;r.length=0}o>=20&&o<=31||r.push(e.data.subarray(s.offset,s.offset+s.length))}if(!this.decoderConfig.description)for(let s=0;s<r.length;s++){let o=r[s];if(Gt(o[0])!==7)continue;let c=Or(o);c&&c.maxDecFrameBuffering!==0&&c.bitstreamRestrictionFlag!==1&&(r[s]=Dc(c));break}let a=Ul(r,this.decoderConfig);e=new j(a,e.type,e.timestamp,e.duration)}else if(this.codec==="hevc"){let r=Ll(e.data,this.decoderConfig);r&&(e=new j(r,e.type,e.timestamp,e.duration))}}this.decoder.decode(e.toEncodedVideoChunk()),this.decodeAlphaData(e)}this.currentPacketIndex++}decodeAlphaData(e){if(!e.sideData.alpha){this.pushNullAlphaFrame();return}if(this.merger||(this.merger=new Uu),!this.alphaDecoder){let n=s=>{if(this.colorQueue.length>0){let o=this.colorQueue.shift();g(o!==void 0),this.mergeAlpha(o,s)}else this.alphaQueue.push(s);for(this.decodedAlphaChunkCount++;this.nullAlphaFrameQueue.length>0&&this.nullAlphaFrameQueue[0]===this.decodedAlphaChunkCount;)if(this.nullAlphaFrameQueue.shift(),this.colorQueue.length>0){let o=this.colorQueue.shift();g(o!==void 0),this.mergeAlpha(o,null)}else this.alphaQueue.push(null);this.alphaDecoderQueueSize--},a=new Error("Decoding error").stack;this.alphaDecoder=new VideoDecoder({output:s=>{try{n(s)}catch(o){this.onError(o)}},error:s=>{s.stack=a,this.onError(s)}}),this.alphaDecoder.configure(this.decoderConfig)}let r=Ur(this.codec,this.decoderConfig,e.sideData.alpha);if(this.alphaHadKeyframe||(this.alphaHadKeyframe=r==="key"),this.alphaHadKeyframe){if(this.codec==="hevc"&&this.currentAlphaPacketIndex>0&&!this.alphaRaslSkipped){if(this.hasHevcRaslPicture(e.sideData.alpha)){this.pushNullAlphaFrame();return}this.alphaRaslSkipped=!0}this.currentAlphaPacketIndex++,this.alphaDecoder.decode(e.alphaToEncodedVideoChunk(r??e.type)),this.alphaDecoderQueueSize++}else this.pushNullAlphaFrame()}pushNullAlphaFrame(){this.alphaDecoderQueueSize===0?this.alphaQueue.push(null):this.nullAlphaFrameQueue.push(this.decodedAlphaChunkCount+this.alphaDecoderQueueSize)}hasHevcRaslPicture(e){for(let r of On(e,this.decoderConfig)){let n=Ct(e[r.offset]);if(n===8||n===9)return!0}return!1}sampleHandler(e){if(Wt()){if(this.sampleQueue.length>0&&e.timestamp>=ee(this.sampleQueue).timestamp){for(let r of this.sampleQueue)this.finalizeAndEmitSample(r);this.sampleQueue.length=0}Sc(this.sampleQueue,e,r=>r.timestamp)}else{let r=this.inputTimestamps.shift();g(r!==void 0),e.setTimestamp(r),this.finalizeAndEmitSample(e)}}finalizeAndEmitSample(e){e.setTimestamp(Math.round(e.timestamp*this.timeResolution)/this.timeResolution),e.setDuration(Math.round(e.duration*this.timeResolution)/this.timeResolution),e.setRotation(this.rotation),this.onSample(e)}async mergeAlpha(e,r){let n=te();this.mergeAlphaPromises.push(n.promise);let a={sample:null};this.finalSamples.push(a);try{if(!r)a.sample=new We(e);else{g(this.merger);let s=await this.merger.merge(e,r);a.sample=new We(s)}for(;this.finalSamples.length>0&&this.finalSamples[0].sample!==null;){let s=this.finalSamples.shift();this.sampleHandler(s.sample)}}catch(s){zi(this.finalSamples,a),this.onError(s)}finally{zi(this.mergeAlphaPromises,n.promise),n.resolve()}}async flush(){if(this.customDecoder?await this.customDecoderCallSerializer.call(()=>this.customDecoder.flush()):(g(this.decoder),await Promise.all([this.decoder.flush(),this.alphaDecoder?.flush()]),await Promise.all(this.mergeAlphaPromises),this.colorQueue.forEach(e=>e.close()),this.colorQueue.length=0,this.alphaQueue.forEach(e=>e?.close()),this.alphaQueue.length=0,this.alphaHadKeyframe=!1,this.decodedAlphaChunkCount=0,this.alphaDecoderQueueSize=0,this.nullAlphaFrameQueue.length=0,this.currentAlphaPacketIndex=0,this.alphaRaslSkipped=!1),Wt()){for(let e of this.sampleQueue)this.finalizeAndEmitSample(e);this.sampleQueue.length=0}this.currentPacketIndex=0,this.raslSkipped=!1}close(){this.customDecoder?this.customDecoderCallSerializer.call(()=>this.customDecoder.close()):(g(this.decoder),this.decoder.state!=="closed"&&this.decoder.close(),this.alphaDecoder&&this.alphaDecoder.state!=="closed"&&this.alphaDecoder.close(),this.colorQueue.forEach(e=>e.close()),this.colorQueue.length=0,this.alphaQueue.forEach(e=>e?.close()),this.alphaQueue.length=0,this.merger?.close());for(let e of this.sampleQueue)e.close();this.sampleQueue.length=0}},Du=null,Uu=class{constructor(){this.workers=[];this.nextWorkerIndex=0;this.pendingRequests=new Map;this.nextRequestId=0}merge(t,e){if(this.workers.length===0){if(!Du){let o=new Blob([`(${Np.toString()})()`],{type:"application/javascript"});Du=URL.createObjectURL(o)}let s=ne(navigator.hardwareConcurrency,1,4);for(let o=0;o<s;o++){let c=new Worker(Du);c.addEventListener("message",u=>{let l=u.data,m=this.pendingRequests.get(l.id);m&&(this.pendingRequests.delete(l.id),"error"in l?m.reject(new Error(l.error)):m.resolve(l.frame))}),c.addEventListener("error",u=>{let l=new Error(u.message||"Color/alpha merge worker error.");for(let m of this.pendingRequests.values())m.reject(l);this.pendingRequests.clear()}),this.workers.push(c)}}let r=this.nextRequestId++,n=te();this.pendingRequests.set(r,n);let a=this.workers[this.nextWorkerIndex];return this.nextWorkerIndex=(this.nextWorkerIndex+1)%this.workers.length,a.postMessage({id:r,color:t,alpha:e},{transfer:[t,e]}),n.promise}close(){for(let e of this.workers)e.terminate();this.workers.length=0;let t=new Error("Color/alpha merger closed.");for(let e of this.pendingRequests.values())e.reject(t);this.pendingRequests.clear()}},Np=()=>{let i=null,t=null,e=Promise.resolve();self.addEventListener("message",c=>{let{id:u,color:l,alpha:m}=c.data;e=e.then(async()=>{try{let d=await r(l,m);self.postMessage({id:u,frame:d},{transfer:[d]})}catch(d){self.postMessage({id:u,error:d.message})}finally{l.close(),m.close()}})});let r=async(c,u)=>{let l=c.format,m=u.format;if(!l||!m)throw new Error("CPU color/alpha merging requires a known VideoFrame format.");let d=l.includes("P10"),f=l.includes("P12"),p=m.includes("P10"),b=m.includes("P12");if(p!==d||b!==f)throw new Error(`CPU color/alpha merging requires the alpha frame to have the same bit depth as the color frame (color: '${l}', alpha: '${m}').`);if(l==="RGBX"||l==="RGBA"||l==="BGRX"||l==="BGRA")return await n(c,u,l);if(l==="I420"||l==="I420P10"||l==="I420P12"||l==="I422"||l==="I422P10"||l==="I422P12"||l==="I444"||l==="I444P10"||l==="I444P12")return await a(c,u,l);if(l==="NV12")return await s(c,u);throw new Error(`CPU color/alpha merging does not support format '${l}'.`)},n=async(c,u,l)=>{let m=c.visibleRect?.width??c.codedWidth,d=c.visibleRect?.height??c.codedHeight,f=m*d,p=new Uint8Array(f*4);await c.copyTo(p);let b=await o(u,m,d,1);for(let k=0,T=3;k<f;k++,T+=4)p[T]=b[k];let y={format:l==="RGBX"||l==="RGBA"?"RGBA":"BGRA",codedWidth:m,codedHeight:d,timestamp:c.timestamp,duration:c.duration??void 0,transfer:[p.buffer]};return new VideoFrame(p,y)},a=async(c,u,l)=>{let m=c.visibleRect?.width??c.codedWidth,d=c.visibleRect?.height??c.codedHeight,f=l.includes("P10"),p=l.includes("P12"),b=f||p?2:1,h,y;l.startsWith("I420")?(h=Math.ceil(m/2),y=Math.ceil(d/2)):l.startsWith("I422")?(h=Math.ceil(m/2),y=d):(h=m,y=d);let k=m*d,T=h*y,w=k*b,x=T*b,C=k*b,P=w+2*x+C,A=new Uint8Array(P);await c.copyTo(A);let S=await o(u,m,d,b),I=w+2*x;A.set(S,I);let R={format:l.slice(0,4)+"A"+l.slice(4),codedWidth:m,codedHeight:d,timestamp:c.timestamp,duration:c.duration??void 0,transfer:[A.buffer]};return new VideoFrame(A,R)},s=async(c,u)=>{let l=c.visibleRect?.width??c.codedWidth,m=c.visibleRect?.height??c.codedHeight,d=l*m,f=Math.ceil(l/2),p=Math.ceil(m/2),b=f*p,h=c.allocationSize();(!t||t.byteLength!==h)&&(t=new Uint8Array(h)),await c.copyTo(t);let y=new Uint8Array(d+2*b+d);y.set(t.subarray(0,d),0);let k=d,T=d+b,w=d;for(let P=0;P<b;P++)y[k+P]=t[w+P*2],y[T+P]=t[w+P*2+1];let x=await o(u,l,m,1);y.set(x,d+2*b);let C={format:"I420A",codedWidth:l,codedHeight:m,timestamp:c.timestamp,duration:c.duration??void 0,transfer:[y.buffer]};return new VideoFrame(y,C)},o=async(c,u,l,m)=>{let d=c.allocationSize();(!i||i.byteLength!==d)&&(i=new Uint8Array(d)),await c.copyTo(i);let f=c.format;if(f==="RGBA"||f==="BGRA"||f==="RGBX"||f==="BGRX"){let p=f==="RGBA"||f==="RGBX"?0:2,b=u*l;for(let h=0;h<b;h++)i[h]=i[h*4+p];return i.subarray(0,b)}else return i.subarray(0,u*l*m)}},Dm=i=>{if(!i||typeof i!="object")throw new TypeError("decoderOptions must be an object.");if(i.hardwareAcceleration!==void 0&&!["no-preference","prefer-hardware","prefer-software"].includes(i.hardwareAcceleration))throw new TypeError("decoderOptions.hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");if(i.optimizeForLatency!==void 0&&typeof i.optimizeForLatency!="boolean")throw new TypeError("decoderOptions.optimizeForLatency, when provided, must be a boolean.")},ei=class extends bn{constructor(t,e={}){if(!(t instanceof Yt))throw new TypeError("videoTrack must be an InputVideoTrack.");Dm(e),super(),this._track=t,this._decoderOptions=e}async _createDecoder(t,e){if(!await this._track.canDecode())throw typeof VideoDecoder>"u"?new Error(Ni("VideoDecoder")):new Error("This video track cannot be decoded in this environment. Make sure to check decodability before using a track.");let r=await this._track.getCodec(),n=await this._track.getRotation(),a=await this._track.getDecoderConfig(),s=await this._track.getTimeResolution();return g(r&&a),a={...a,hardwareAcceleration:this._decoderOptions.hardwareAcceleration,optimizeForLatency:this._decoderOptions.optimizeForLatency},new Vu(t,e,r,a,n,s)}_createPacketSink(){return new et(this._track)}async getSample(t,e={}){Pr(t);for await(let r of this.mediaSamplesAtTimestamps([t],e))return r;throw new Error("Internal error: Iterator returned nothing.")}samples(t,e,r={}){return this.mediaSamplesInRange(t,e,r)}samplesAtTimestamps(t,e={}){return this.mediaSamplesAtTimestamps(t,e)}},Bo=class{constructor(t,e={}){this._rotation=0;this._initPromise=null;this._nextCanvasIndex=0;if(!(t instanceof Yt))throw new TypeError("videoTrack must be an InputVideoTrack.");if(e&&typeof e!="object")throw new TypeError("options must be an object.");if(e.alpha!==void 0&&typeof e.alpha!="boolean")throw new TypeError("options.alpha, when provided, must be a boolean.");if(e.width!==void 0&&(!Number.isInteger(e.width)||e.width<=0))throw new TypeError("options.width, when defined, must be a positive integer.");if(e.height!==void 0&&(!Number.isInteger(e.height)||e.height<=0))throw new TypeError("options.height, when defined, must be a positive integer.");if(e.fit!==void 0&&!["fill","contain","cover"].includes(e.fit))throw new TypeError('options.fit, when provided, must be one of "fill", "contain", or "cover".');if(e.width!==void 0&&e.height!==void 0&&e.fit===void 0)throw new TypeError("When both options.width and options.height are provided, options.fit must also be provided.");if(e.rotation!==void 0&&![0,90,180,270].includes(e.rotation))throw new TypeError("options.rotation, when provided, must be 0, 90, 180 or 270.");if(e.crop!==void 0&&Zr(e.crop,"options."),e.poolSize!==void 0&&(typeof e.poolSize!="number"||!Number.isInteger(e.poolSize)||e.poolSize<0))throw new TypeError("poolSize must be a non-negative integer.");e.decoderOptions!==void 0&&Dm(e.decoderOptions),this._videoTrack=t,this._alpha=e.alpha??!1,this._options=e,this._fit=e.fit??"fill",this._videoSampleSink=new ei(t,e.decoderOptions),this._canvasPool=Array.from({length:e.poolSize??0},()=>null)}_ensureInit(){return this._initPromise??=(async()=>{let t=this._options,e=this._videoTrack,r=t.rotation??await e.getRotation(),n=await e.getSquarePixelWidth(),a=await e.getSquarePixelHeight(),[s,o]=r%180===0?[n,a]:[a,n],c=t.crop;c&&(c=fn(c,s,o));let[u,l]=c?[c.width,c.height]:[s,o],m=u/l;t.width!==void 0&&t.height===void 0?(u=t.width,l=Math.round(u/m)):t.width===void 0&&t.height!==void 0?(l=t.height,u=Math.round(l*m)):t.width!==void 0&&t.height!==void 0&&(u=t.width,l=t.height),this._width=u,this._height=l,this._rotation=r,this._crop=c})()}_videoSampleToWrappedCanvas(t){let e=this._width,r=this._height,n=this._canvasPool[this._nextCanvasIndex],a=!1;n||(typeof document<"u"?(n=document.createElement("canvas"),n.width=e,n.height=r):n=new OffscreenCanvas(e,r),this._canvasPool.length>0&&(this._canvasPool[this._nextCanvasIndex]=n),a=!0),this._canvasPool.length>0&&(this._nextCanvasIndex=(this._nextCanvasIndex+1)%this._canvasPool.length);let s=n.getContext("2d",{alpha:this._alpha||mi()});g(s),t._drawWithFitAndMipmapping(n,s,{fit:this._fit,rotation:this._rotation,crop:this._crop,targetIsFresh:a,fillBlack:!this._alpha&&mi()});let o={canvas:n,timestamp:t.timestamp,duration:t.duration};return t.close(),o}async getCanvas(t,e){Pr(t),await this._ensureInit();let r=await this._videoSampleSink.getSample(t,e);return r&&this._videoSampleToWrappedCanvas(r)}async*canvases(t,e,r){await this._ensureInit(),yield*Rn(this._videoSampleSink.samples(t,e,r),n=>this._videoSampleToWrappedCanvas(n))}async*canvasesAtTimestamps(t,e){await this._ensureInit(),yield*Rn(this._videoSampleSink.samplesAtTimestamps(t,e),r=>r&&this._videoSampleToWrappedCanvas(r))}},zu=class extends va{constructor(e,r,n,a){super(e,r);this.decoder=null;this.customDecoder=null;this.customDecoderCallSerializer=new vr;this.customDecoderQueueSize=0;this.currentTimestamp=null;this.expectedFirstTimestamp=null;this.timestampOffset=0;let s=c=>{let u=c.timestamp;this.expectedFirstTimestamp!==null&&this.currentTimestamp===null&&(this.timestampOffset=this.expectedFirstTimestamp-u),u+=this.timestampOffset,(this.currentTimestamp===null||Math.abs(u-this.currentTimestamp)>=c.duration)&&(this.currentTimestamp=u);let l=this.currentTimestamp;if(this.currentTimestamp+=c.duration,c.numberOfFrames===0){c.close();return}let m=a.sampleRate;c.setTimestamp(Math.round(l*m)/m),e(c)},o=Yr.find(c=>c.supports(n,a));if(o)this.customDecoder=new o,this.customDecoder.codec=n,this.customDecoder.config=a,this.customDecoder.onSample=c=>{if(!(c instanceof Ae))throw new TypeError("The argument passed to onSample must be an AudioSample.");s(c)},this.customDecoder.onError=c=>{r(c)},this.customDecoderCallSerializer.call(()=>this.customDecoder.init()).catch(c=>r(c));else{let c=new Error("Decoding error").stack;this.decoder=new AudioDecoder({output:u=>{try{s(new Ae(u))}catch(l){this.onError(l)}},error:u=>{u.stack=c,this.onError(u)}}),this.decoder.configure(a)}}getDecodeQueueSize(){return this.customDecoder?this.customDecoderQueueSize:(g(this.decoder),this.decoder.decodeQueueSize)}decode(e){this.customDecoder?(this.customDecoderQueueSize++,this.customDecoderCallSerializer.call(()=>this.customDecoder.decode(e)).catch(r=>this.onError(r)).finally(()=>this.customDecoderQueueSize--)):(g(this.decoder),this.expectedFirstTimestamp??=e.timestamp,this.decoder.decode(e.toEncodedAudioChunk()))}async flush(){this.customDecoder?await this.customDecoderCallSerializer.call(()=>this.customDecoder.flush()):(g(this.decoder),await this.decoder.flush()),this.currentTimestamp=null,this.expectedFirstTimestamp=null,this.timestampOffset=0}close(){this.customDecoder?this.customDecoderCallSerializer.call(()=>this.customDecoder.close()):(g(this.decoder),this.decoder.state!=="closed"&&this.decoder.close())}},Nu=class extends va{constructor(e,r,n){super(e,r);this.decoderConfig=n;this.currentTimestamp=null;g(se.includes(n.codec)),this.codec=n.codec;let{dataType:a,sampleSize:s,littleEndian:o}=Re(this.codec);switch(this.inputSampleSize=s,s){case 1:a==="unsigned"?this.readInputValue=(c,u)=>c.getUint8(u)-2**7:a==="signed"?this.readInputValue=(c,u)=>c.getInt8(u):a==="ulaw"?this.readInputValue=(c,u)=>Fm(c.getUint8(u)):a==="alaw"?this.readInputValue=(c,u)=>Bm(c.getUint8(u)):g(!1);break;case 2:a==="unsigned"?this.readInputValue=(c,u)=>c.getUint16(u,o)-2**15:a==="signed"?this.readInputValue=(c,u)=>c.getInt16(u,o):g(!1);break;case 3:a==="unsigned"?this.readInputValue=(c,u)=>li(c,u,o)-2**23:a==="signed"?this.readInputValue=(c,u)=>kl(c,u,o):g(!1);break;case 4:a==="unsigned"?this.readInputValue=(c,u)=>c.getUint32(u,o)-2**31:a==="signed"?this.readInputValue=(c,u)=>c.getInt32(u,o):a==="float"?this.readInputValue=(c,u)=>c.getFloat32(u,o):g(!1);break;case 8:a==="float"?this.readInputValue=(c,u)=>c.getFloat64(u,o):g(!1);break;default:ie(s),g(!1)}switch(s){case 1:a==="ulaw"||a==="alaw"?(this.outputSampleSize=2,this.outputFormat="s16",this.writeOutputValue=(c,u,l)=>c.setInt16(u,l,!0)):(this.outputSampleSize=1,this.outputFormat="u8",this.writeOutputValue=(c,u,l)=>c.setUint8(u,l+2**7));break;case 2:this.outputSampleSize=2,this.outputFormat="s16",this.writeOutputValue=(c,u,l)=>c.setInt16(u,l,!0);break;case 3:this.outputSampleSize=4,this.outputFormat="s32",this.writeOutputValue=(c,u,l)=>c.setInt32(u,l<<8,!0);break;case 4:this.outputSampleSize=4,a==="float"?(this.outputFormat="f32",this.writeOutputValue=(c,u,l)=>c.setFloat32(u,l,!0)):(this.outputFormat="s32",this.writeOutputValue=(c,u,l)=>c.setInt32(u,l,!0));break;case 8:this.outputSampleSize=4,this.outputFormat="f32",this.writeOutputValue=(c,u,l)=>c.setFloat32(u,l,!0);break;default:ie(s),g(!1)}}getDecodeQueueSize(){return 0}decode(e){let r=L(e.data),n=e.byteLength/this.decoderConfig.numberOfChannels/this.inputSampleSize,a=n*this.decoderConfig.numberOfChannels*this.outputSampleSize,s=new ArrayBuffer(a),o=new DataView(s);for(let m=0;m<n*this.decoderConfig.numberOfChannels;m++){let d=m*this.inputSampleSize,f=m*this.outputSampleSize,p=this.readInputValue(r,d);this.writeOutputValue(o,f,p)}let c=n/this.decoderConfig.sampleRate;(this.currentTimestamp===null||Math.abs(e.timestamp-this.currentTimestamp)>=c)&&(this.currentTimestamp=e.timestamp);let u=this.currentTimestamp;this.currentTimestamp+=c;let l=new Ae({format:this.outputFormat,data:s,numberOfChannels:this.decoderConfig.numberOfChannels,sampleRate:this.decoderConfig.sampleRate,numberOfFrames:n,timestamp:u});this.onSample(l)}async flush(){}close(){}},Ii=class extends bn{constructor(t){if(!(t instanceof Zt))throw new TypeError("audioTrack must be an InputAudioTrack.");super(),this._track=t}async _createDecoder(t,e){if(!await this._track.canDecode())throw typeof AudioDecoder>"u"?new Error(Ni("AudioDecoder")):new Error("This audio track cannot be decoded in this environment. Make sure to check decodability before using a track.");let r=await this._track.getCodec(),n=await this._track.getDecoderConfig();return g(r&&n),se.includes(n.codec)?new Nu(t,e,n):new zu(t,e,r,n)}_createPacketSink(){return new et(this._track)}async getSample(t,e={}){Pr(t);for await(let r of this.mediaSamplesAtTimestamps([t],e))return r;throw new Error("Internal error: Iterator returned nothing.")}samples(t,e,r={}){return this.mediaSamplesInRange(t,e,r)}samplesAtTimestamps(t,e={}){return this.mediaSamplesAtTimestamps(t,e)}},Oo=class{constructor(t){if(!(t instanceof Zt))throw new TypeError("audioTrack must be an InputAudioTrack.");this._audioSampleSink=new Ii(t)}_audioSampleToWrappedArrayBuffer(t){let e={buffer:t.toAudioBuffer(),timestamp:t.timestamp,duration:t.duration};return t.close(),e}async getBuffer(t,e){Pr(t);let r=await this._audioSampleSink.getSample(t,e);return r&&this._audioSampleToWrappedArrayBuffer(r)}buffers(t,e,r){return Rn(this._audioSampleSink.samples(t,e,r),n=>this._audioSampleToWrappedArrayBuffer(n))}buffersAtTimestamps(t,e){return Rn(this._audioSampleSink.samplesAtTimestamps(t,e),r=>r&&this._audioSampleToWrappedArrayBuffer(r))}};var ti=class i{constructor(t,e){this.input=t,this._backing=e}isVideoTrack(){return this instanceof Yt}isAudioTrack(){return this instanceof Zt}get id(){return this._backing.getId()}get number(){return this._backing.getNumber()}async getInternalCodecId(){return this._backing.getInternalCodecId()}get internalCodecId(){return ye(this._backing.getInternalCodecId(),"internalCodecId","getInternalCodecId")}async getLanguageCode(){return this._backing.getLanguageCode()}get languageCode(){return ye(this._backing.getLanguageCode(),"languageCode","getLanguageCode")}async getName(){return this._backing.getName()}get name(){return ye(this._backing.getName(),"name","getName")}async getTimeResolution(){return this._backing.getTimeResolution()}get timeResolution(){return ye(this._backing.getTimeResolution(),"timeResolution","getTimeResolution")}async isRelativeToUnixEpoch(){return this._backing.isRelativeToUnixEpoch()}async getUnixTimeForTimestamp(t){return this._backing.getUnixTimeForTimestamp(t)}async hasUnixTimeMapping(){return await this._backing.getUnixTimeForTimestamp(await this.getFirstTimestamp())!==null}async getDisposition(){return this._backing.getDisposition()}get disposition(){return ye(this._backing.getDisposition(),"disposition","getDisposition")}async getBitrate(){return this._backing.getBitrate()}async getAverageBitrate(){return this._backing.getAverageBitrate()}async getFirstTimestamp(){return(await this._backing.getFirstPacket({metadataOnly:!0}))?.timestamp??0}async computeDuration(t){let e=await this._backing.getPacket(1/0,{metadataOnly:!0,...t}),r=(e?.timestamp??0)+(e?.duration??0);return Nt(r,await this.getTimeResolution())}async getDurationFromMetadata(t={}){return this._backing.getDurationFromMetadata(t)}async computePacketStats(t=1/0,e){let r=new et(this),n=1/0,a=-1/0,s=0,o=0;for await(let c of r.packets(void 0,void 0,{metadataOnly:!0,...e})){if(s>=t&&c.timestamp>=a)break;n=Math.min(n,c.timestamp),a=Math.max(a,c.timestamp+c.duration),s++,o+=c.byteLength}return{packetCount:s,averagePacketRate:s?Number((s/(a-n)).toPrecision(16)):0,averageBitrate:s?Number((8*o/(a-n)).toPrecision(16)):0}}async isLive(){return await this._backing.getLiveRefreshInterval()!==null}async getLiveRefreshInterval(){return this._backing.getLiveRefreshInterval()}canBePairedWith(t){if(!(t instanceof i))throw new TypeError("other must be an InputTrack.");return this.input!==t.input||this===t?!1:(this._backing.getPairingMask()&t._backing.getPairingMask())!==0n}async getPairableTracks(t){return this.input.getTracks(ri({filter:e=>e.canBePairedWith(this)},t))}async getPairableVideoTracks(t){return this.input.getVideoTracks(ri({filter:e=>e.canBePairedWith(this)},t))}async getPairableAudioTracks(t){return this.input.getAudioTracks(ri({filter:e=>e.canBePairedWith(this)},t))}async getPrimaryPairableVideoTrack(t){return this.input.getPrimaryVideoTrack(ri({filter:e=>e.canBePairedWith(this)},t))}async getPrimaryPairableAudioTrack(t){return this.input.getPrimaryAudioTrack(ri({filter:e=>e.canBePairedWith(this)},t))}async hasPairableTrack(t){t&&=Lu(t);let e=await this.input.getTracks();for(let r of e)if(this.canBePairedWith(r)&&(!t||await t(r)))return!0;return!1}hasPairableVideoTrack(t){return t&&=Lu(t),this.hasPairableTrack(async e=>e.isVideoTrack()&&(!t||await t(e)))}hasPairableAudioTrack(t){return t&&=Lu(t),this.hasPairableTrack(async e=>e.isAudioTrack()&&(!t||await t(e)))}},ye=(i,t,e)=>{if(v(i))throw new Error(`'${t}' is deprecated and not available synchronously for this track. Use the preferred '${e}()' instead.`);return i},Lu=i=>{if(i!==void 0&&typeof i!="function")throw new TypeError("predicate, when provided, must be a function.");return i?t=>{let e=n=>{if(typeof n!="boolean")throw new TypeError("predicate must return or resolve to a boolean value.");return n},r=i(t);return v(r)?r.then(e):e(r)}:void 0},Yt=class extends ti{constructor(e,r){super(e,r);this._pixelAspectRatioCache=null;this._backing=r}get type(){return"video"}async getCodec(){return this._backing.getCodec()}get codec(){return ye(this._backing.getCodec(),"codec","getCodec")}async hasOnlyKeyPackets(){return await this._backing.getHasOnlyKeyPackets?.()??await this._backing.getCodec()==="prores"}async getCodedWidth(){return this._backing.getCodedWidth()}get codedWidth(){return ye(this._backing.getCodedWidth(),"codedWidth","getCodedWidth")}async getCodedHeight(){return this._backing.getCodedHeight()}get codedHeight(){return ye(this._backing.getCodedHeight(),"codedHeight","getCodedHeight")}async getRotation(){return this._backing.getRotation()}get rotation(){return ye(this._backing.getRotation(),"rotation","getRotation")}async getSquarePixelWidth(){return this._backing.getSquarePixelWidth()}get squarePixelWidth(){return ye(this._backing.getSquarePixelWidth(),"squarePixelWidth","getSquarePixelWidth")}async getSquarePixelHeight(){return this._backing.getSquarePixelHeight()}get squarePixelHeight(){return ye(this._backing.getSquarePixelHeight(),"squarePixelHeight","getSquarePixelHeight")}async getPixelAspectRatio(){return this._pixelAspectRatioCache??=Ht({num:await this.getSquarePixelWidth()*await this.getCodedHeight(),den:await this.getSquarePixelHeight()*await this.getCodedWidth()})}get pixelAspectRatio(){return this._pixelAspectRatioCache??=Ht({num:ye(this._backing.getSquarePixelWidth(),"pixelAspectRatio","getPixelAspectRatio")*ye(this._backing.getCodedHeight(),"pixelAspectRatio","getPixelAspectRatio"),den:ye(this._backing.getSquarePixelHeight(),"pixelAspectRatio","getPixelAspectRatio")*ye(this._backing.getCodedWidth(),"pixelAspectRatio","getPixelAspectRatio")})}async getDisplayWidth(){let e=await this._backing.getMetadataDisplayWidth?.();return e??(await this.getRotation()%180===0?this.getSquarePixelWidth():this.getSquarePixelHeight())}get displayWidth(){let e=this._backing.getMetadataDisplayWidth?.();if(e!==void 0){let a=ye(e,"displayWidth","getDisplayWidth");if(a!==null)return a}let n=ye(this._backing.getRotation(),"displayWidth","getDisplayWidth")%180===0?this._backing.getSquarePixelWidth():this._backing.getSquarePixelHeight();return ye(n,"displayWidth","getDisplayWidth")}async getDisplayHeight(){let e=await this._backing.getMetadataDisplayHeight?.();return e??(await this.getRotation()%180===0?this.getSquarePixelHeight():this.getSquarePixelWidth())}get displayHeight(){let e=this._backing.getMetadataDisplayHeight?.();if(e!==void 0){let a=ye(e,"displayHeight","getDisplayHeight");if(a!==null)return a}let n=ye(this._backing.getRotation(),"displayHeight","getDisplayHeight")%180===0?this._backing.getSquarePixelHeight():this._backing.getSquarePixelWidth();return ye(n,"displayHeight","getDisplayHeight")}async getColorSpace(){return this._backing.getColorSpace()}async hasHighDynamicRange(){let e=await this._backing.getColorSpace();return e.primaries==="bt2020"||e.primaries==="smpte432"||e.transfer==="pq"||e.transfer==="hlg"||e.matrix==="bt2020-ncl"}async canBeTransparent(){return this._backing.canBeTransparent()}async getDecoderConfig(){return this._backing.getDecoderConfig()}async getCodecParameterString(){let e=await this._backing.getMetadataCodecParameterString?.();return e??(await this._backing.getDecoderConfig())?.codec??null}async canDecode(){try{let e=await this._backing.getDecoderConfig();if(!e)return!1;let r=await this._backing.getCodec();return g(r!==null),$r.some(a=>a.supports(r,e))?!0:typeof VideoDecoder>"u"?!1:(await VideoDecoder.isConfigSupported(e)).supported===!0}catch(e){return U._error("Error during decodability check:",e),!1}}async determinePacketType(e){if(!(e instanceof j))throw new TypeError("packet must be an EncodedPacket.");if(e.isMetadataOnly)throw new TypeError("packet must not be metadata-only to determine its type.");let r=await this.getCodec();if(r===null)return null;let n=await this.getDecoderConfig();return g(n),Ur(r,n,e.data)}async computeFrameRateMetrics(e={}){if(!e||typeof e!="object")throw new TypeError("options must be an object.");if(e.targetPacketCount!==void 0&&(!Me(e.targetPacketCount)||e.targetPacketCount<0))throw new TypeError("options.targetPacketCount must be a non-negative number.");let r=await this.getTimeResolution(),n=e.targetPacketCount??256,a=new et(this),s=[],o=-1/0,c=0;for await(let E of a.packets(void 0,void 0,{metadataOnly:!0})){if(s.length>=n&&E.timestamp>=o)break;s.push(E.timestamp),o=Math.max(o,E.timestamp),c++}let u=new Float64Array(s.length);for(let E=0;E<s.length;E++)u[E]=Math.round(s[E]*r);u.sort();let l=1;for(let E=1;E<u.length;E++)u[E]!==u[l-1]&&(u[l++]=u[E]);if(l<2)return{underlyingFrameRate:null,bestGuessFrameRate:r,minFrameRate:r,maxFrameRate:r,averageFrameRate:r,medianFrameRate:r,frameRateIsConstant:!0,probedPacketCount:c};let m=u.subarray(0,l),d=Lp(m,r),f=d??r,p=d!==null?r/d:null,b=new Map,h=1/0,y=-1/0,k=0;for(let E=1;E<l;E++){let R=m[E]-m[E-1],_=p!==null?Math.max(1,Math.round(R/p)):R;b.set(_,(b.get(_)??0)+1),h=Math.min(h,_),y=Math.max(y,_),k+=_}let T=l-1,w=[...b.keys()].sort((E,R)=>E-R),x=T-1>>1,C=T>>1,P=0,A=0,S=0;for(let E of w)if(S+=b.get(E),P===0&&S>x&&(P=E),S>C){A=E;break}let I=(f/P+f/A)/2;return{underlyingFrameRate:d,bestGuessFrameRate:d!==null?d:Wp(I),minFrameRate:f/y,maxFrameRate:f/h,averageFrameRate:f*T/k,medianFrameRate:I,frameRateIsConstant:d!==null&&h===1&&y===1,probedPacketCount:c}}},Zt=class extends ti{constructor(t,e){super(t,e),this._backing=e}get type(){return"audio"}async getCodec(){return this._backing.getCodec()}get codec(){return ye(this._backing.getCodec(),"codec","getCodec")}async hasOnlyKeyPackets(){return await this._backing.getHasOnlyKeyPackets?.()??!0}async getNumberOfChannels(){return this._backing.getNumberOfChannels()}get numberOfChannels(){return ye(this._backing.getNumberOfChannels(),"numberOfChannels","getNumberOfChannels")}async getSampleRate(){return this._backing.getSampleRate()}get sampleRate(){return ye(this._backing.getSampleRate(),"sampleRate","getSampleRate")}async getDecoderConfig(){return this._backing.getDecoderConfig()}async getCodecParameterString(){let t=await this._backing.getMetadataCodecParameterString?.();return t??(await this._backing.getDecoderConfig())?.codec??null}async canDecode(){try{let t=await this._backing.getDecoderConfig();if(!t)return!1;let e=await this._backing.getCodec();return g(e!==null),Yr.some(r=>r.supports(e,t))||t.codec.startsWith("pcm-")?!0:typeof AudioDecoder>"u"?!1:(await AudioDecoder.isConfigSupported(t)).supported===!0}catch(t){return U._error("Error during decodability check:",t),!1}}async determinePacketType(t){if(!(t instanceof j))throw new TypeError("packet must be an EncodedPacket.");return await this.getCodec()===null?null:"key"}},Um=i=>i??1/0,_a=i=>-(i??-1/0),ii=i=>-i,yn=i=>{if(typeof i!="object"||!i)throw new TypeError("query must be an object.");if(i.filter!==void 0&&typeof i.filter!="function")throw new TypeError("query.filter, when provided, must be a function.");if(i.sortBy!==void 0&&typeof i.sortBy!="function")throw new TypeError("query.sortBy, when provided, must be a function.");return{filter:i.filter?t=>{let e=n=>{if(typeof n!="boolean")throw new TypeError("query.filter must return or resolve to a boolean.");return n},r=i.filter(t);return v(r)?r.then(e):e(r)}:void 0,sortBy:i.sortBy?t=>{let e=n=>{if(typeof n!="number"&&(!Array.isArray(n)||!n.every(a=>typeof a=="number")))throw new TypeError("query.sortBy must return or resolve to a number or an array of numbers.");return n},r=i.sortBy(t);return v(r)?r.then(e):e(r)}:void 0}},ri=(i,t)=>({filter:i?.filter||t?.filter?e=>{let r=i?.filter?.(e)??!0,n=a=>a===!1?!1:t?.filter?.(e)??!0;return v(r)?r.then(n):n(r)}:void 0,sortBy:i?.sortBy||t?.sortBy?e=>{let r=i?.sortBy?.(e)??[],n=t?.sortBy?.(e)??[],a=(s,o)=>[...Array.isArray(s)?s:[s],...Array.isArray(o)?o:[o]];return v(r)||v(n)?Promise.all([r,n]).then(([s,o])=>a(s,o)):a(r,n)}:void 0}),Do=async(i,t)=>{let e=i;if(t?.filter){let s=i.map(c=>t.filter(c));if(s.some(c=>v(c))){let c=await Promise.all(s);e=i.filter((u,l)=>c[l])}else e=i.filter((c,u)=>s[u])}if(!t?.sortBy)return e;let r=e.map(s=>t.sortBy(s)),a=r.some(s=>v(s))?await Promise.all(r):r;return e.map((s,o)=>({track:s,sortValue:a[o]})).sort((s,o)=>{let c=Array.isArray(s.sortValue)?s.sortValue:[s.sortValue],u=Array.isArray(o.sortValue)?o.sortValue:[o.sortValue],l=Math.max(c.length,u.length);for(let m=0;m<l;m++){let d=c[m]??0,f=u[m]??0;if(d!==f)return d-f}return 0}).map(s=>s.track)},Lp=(i,t)=>{let n=1.000000001,a=1e3,s=[12,15,20,24e3/1001,24,25,3e4/1001,30,48,50,6e4/1001,60,100,12e4/1001,120,144,240];if(i.length<2)return null;let o=new Float64Array(i.length-1);for(let P=1;P<i.length;P++){let A=i[P]-i[P-1];if(!(A>0))return null;o[P-1]=A}let c=o.slice();c.sort();let u=c[Math.floor(c.length*.05)];for(let P=0;P<6;P++){let A=0,S=0;for(let E of o){let R=Math.max(1,Math.round(E/u));Math.abs(E-R*u)>=n||(A+=E,S+=R)}if(S===0)return null;let I=A/S;if(Math.abs(I-u)<=1e-12*Math.max(1,u)){u=I;break}u=I}let l=0,m=0,d=0;for(let P of o){let A=Math.max(1,Math.round(P/u));Math.abs(P-A*u)>=n||(l++,m+=P,d+=A)}if(l/o.length<.98)return null;u=m/d;let f=1/Math.min(d,a),p=Math.max(Number.EPSILON,u-f),b=u+f,h=t/b,y=t/p,k=t/u,T=null,w=1/0;for(let P of s){if(P<h||P>y)continue;let A=Math.abs(P/k-1);A<w&&(T=P,w=A)}if(T===null){let P=Vm(p,b,1e6),A=Vm(h,y,1e6);if(A&&(!P||A.den<P.den||A.den===P.den&&A.num<=P.num))T=A.num/A.den;else if(P)T=t*P.den/P.num;else return null}let x=t/T,C=0;for(let P of o){let A=Math.max(1,Math.round(P/x));Math.abs(P-A*x)<n&&C++}return C/o.length<.98?null:T},Vm=(i,t,e)=>{for(let r=1;r<=e;r++){let n=Math.floor(i*r)+1;if(n/r<t)return Ht({num:n,den:r})}return null},Wp=i=>{let t=[23.976023976023978,29.970029970029973,59.940059940059946,119.88011988011989],e=[12,15,20,24,25,30,48,50,60,100,120,144,240],r=5e-4,n=.025;for(let o of t)if(Math.abs(o/i-1)<=r)return o;let a=i,s=1/0;for(let o of e){let c=Math.abs(o/i-1);c<=n&&c<s&&(a=o,s=c)}return a};Li();var Hp=1,Yd=2,Xr=class i extends Ge{constructor(e){super();this._demuxerPromise=null;this._format=null;this._trackBackingsCache=null;this._backingToTrack=new Map;this._disposed=!1;this._nextSourceCacheAge=0;this._sourceRefs=[];this._sourceCache=[];this._sourceCachePromises=[];this._onFormatDetermined=null;if(!e||typeof e!="object")throw new TypeError("options must be an object.");if(!Array.isArray(e.formats)||e.formats.some(r=>!(r instanceof Ke)))throw new TypeError("options.formats must be an array of InputFormat.");if(!(e.source instanceof Ve||e.source instanceof Gr))throw new TypeError("options.source must be a Source or SourceRef.");if(e.source instanceof Ve&&e.source._disposed)throw new TypeError("options.source must not be a disposed Source.");if(e.initInput!==void 0&&!(e.initInput instanceof i))throw new TypeError("options.initInput, when provided, must be an Input.");e.formatOptions!==void 0&&rm(e.formatOptions,"formatOptions"),this._formats=e.formats,this._initInput=e.initInput??null,this._formatOptions=e.formatOptions??{},e.source instanceof Ve?this._rootRef=e.source.ref():this._rootRef=e.source,this._sourceRefs.push(this._rootRef)}get disposed(){return this._disposed}get _rootSource(){return this._rootRef.source}async _getSourceUncached(e){g(this._rootSource instanceof qe);let r=await this._rootSource._resolveRequest(e);return this._emit("source",{source:r.source,request:e,isRoot:e.isRoot}),r}_getSourceCached(e,r=Hp){let n=this._sourceCache.find(o=>o.cacheGroup===r&&ku(o.request,e));if(n)return n.age++,Promise.resolve(n.sourceRef.source.ref());let a=this._sourceCachePromises.find(o=>o.cacheGroup===r&&ku(o.request,e));if(a)return a.promise.then(o=>o.sourceRef.source.ref());let s=(async()=>{let o=await this._getSourceUncached(e);if(hi(this._sourceCache,d=>d.cacheGroup===r&&d.sourceRef.source._refCount===1)>=4){let d=Wi(this._sourceCache,p=>p.cacheGroup===r&&p.sourceRef.source._refCount===1?p.age:1/0);g(d!==-1);let f=this._sourceCache[d];this._sourceCache.splice(d,1),f.sourceRef.free(),zi(this._sourceRefs,f.sourceRef)}this._sourceRefs.push(o);let l=this._sourceCachePromises.findIndex(d=>d.request===e);return g(l!==-1),this._sourceCachePromises.splice(l,1),{request:e,sourceRef:o,age:this._nextSourceCacheAge++,cacheGroup:r}})();return this._sourceCachePromises.push({request:e,cacheGroup:r,promise:s}),s.then(o=>{let c=o.sourceRef.source.ref();return this._sourceCache.push(o),c})}_getDemuxer(){return this._demuxerPromise??=(async()=>{this._reader=new jr(this._rootSource),this._emit("source",{source:this._rootSource,request:null,isRoot:!0});for(let e of this._formats)if(await e._canReadInput(this))return this._format=e,this._onFormatDetermined?.(e),e._createDemuxer(this);throw new kn})()}get source(){return this._rootSource}async getFormat(){return await this._getDemuxer(),g(this._format),this._format}async canRead(){try{return await this._getDemuxer(),!0}catch(e){if(e instanceof kn)return!1;throw e}}async getFirstTimestamp(e){e??=await this.getTracks();let r=e.filter(s=>s!==null);if(r.length===0)return 0;let n=await Promise.all(r.map(s=>s._backing.getFirstPacket({metadataOnly:!0}))),a=Math.min(...n.map(s=>s?.timestamp??1/0));return a===1/0?0:a}async computeDuration(e,r){e??=await this.getTracks();let n=e.filter(s=>s!==null);if(n.length===0)return 0;let a=await Promise.all(n.map(s=>s.computeDuration(r)));return Math.max(...a)}async getDurationFromMetadata(e,r){e??=await this.getTracks();let n=e.filter(o=>o!==null),s=(await Promise.all(n.map(o=>o.getDurationFromMetadata(r)))).filter(o=>o!==null);return s.length===0?null:Math.max(...s)}async getTracks(e){e&&=yn(e);let n=(await this._getTrackBackings()).map(a=>this._wrapBackingAsTrack(a));return Do(n,e)}async getVideoTracks(e){e&&=yn(e);let n=(await this.getTracks()).filter(a=>a.isVideoTrack());return Do(n,e)}async getAudioTracks(e){e&&=yn(e);let n=(await this.getTracks()).filter(a=>a.isAudioTrack());return Do(n,e)}async getPrimaryVideoTrack(e){e&&=yn(e);let r=ri(e,{sortBy:async a=>[ii((await a.getDisposition()).default),ii(await a.hasPairableAudioTrack()),ii(!await a.hasOnlyKeyPackets()),_a(await a.getBitrate())]});return(await this.getVideoTracks(r))[0]??null}async getPrimaryAudioTrack(e){e&&=yn(e);let r=await this.getPrimaryVideoTrack(),n=ri(e,{sortBy:async s=>[ii(!r||s.canBePairedWith(r)),ii((await s.getDisposition()).default),_a(await s.getBitrate())]});return(await this.getAudioTracks(n))[0]??null}async _getTrackBackings(){let e=await this._getDemuxer();return this._trackBackingsCache??=await e.getTrackBackings()}_wrapBackingAsTrack(e){let r=this._backingToTrack.get(e);if(r)return r;let a=e.getType()==="video"?new Yt(this,e):new Zt(this,e);return this._backingToTrack.set(e,a),a}async getMimeType(){return(await this._getDemuxer()).getMimeType()}async getMetadataTags(){return(await this._getDemuxer()).getMetadataTags()}dispose(){if(!this._disposed){this._disposed=!0;for(let e of this._sourceRefs)e.free();this._sourceRefs.length=0,this._demuxerPromise&&this._demuxerPromise.then(e=>e.dispose()).catch(()=>{})}}[Symbol.dispose](){this.dispose()}},kn=class extends Error{constructor(t="Input has an unsupported or unrecognizable format."){super(t),this.name="UnsupportedInputFormatError"}},ke=class extends Error{constructor(t="Input has been disposed."){super(t),this.name="InputDisposedError"}};var jr=class{constructor(t){this.source=t}get fileSize(){let t=this.source._getFileSize();if(t===void 0)throw new Error("Reading file size too early; read required first.");return t}get fileSizeNonStrict(){return this.source._getFileSize()??null}requestSlice(t,e){if(this.source._disposed)throw new ke;if(t<0||this.fileSizeNonStrict!==null&&t+e>this.fileSizeNonStrict)return null;if(e===0){let a=new Uint8Array(0);return new Ee(a,L(a),0,t,t)}let r=t+e,n=this.source._read(t,r,bu,yu);return v(n)?n.then(a=>a?new Ee(a.bytes,a.view,a.offset,t,r):null):n?new Ee(n.bytes,n.view,n.offset,t,r):null}requestSliceRange(t,e,r){if(this.source._disposed)throw new ke;if(t<0)return null;if(this.fileSizeNonStrict!==null)return this.requestSlice(t,ne(this.fileSizeNonStrict-t,e,r));{let n=this.requestSlice(t,r),a=s=>s||(g(this.fileSizeNonStrict!==null),this.requestSlice(t,ne(this.fileSizeNonStrict-t,e,r)));return v(n)?n.then(a):a(n)}}requestEntireFile(){if(this.fileSizeNonStrict!==null)return this.requestSlice(0,this.fileSizeNonStrict);let t=1024;return(async()=>{let e=[],r=0;for(;;){if(e.length===1&&this.fileSizeNonStrict!==null)return this.requestSlice(0,this.fileSizeNonStrict);let s=this.requestSliceRange(r,0,t);if(v(s)&&(s=await s),!s||s.length===0)break;let o=D(s,s.length);e.push(o),r+=s.length}let n=new Uint8Array(r),a=0;for(let s of e)n.set(s,a),a+=s.length;return new Ee(n,L(n),0,0,r)})()}},Ee=class i{constructor(t,e,r,n,a){this.bytes=t;this.view=e;this.offset=r;this.start=n;this.end=a;this.bufferPos=n-r}static tempFromBytes(t){return new i(t,L(t),0,0,t.length)}get length(){return this.end-this.start}get filePos(){return this.offset+this.bufferPos}set filePos(t){this.bufferPos=t-this.offset}get remainingLength(){return Math.max(this.end-this.filePos,0)}skip(t){this.bufferPos+=t}slice(t,e=this.end-t){if(t<this.start||t+e>this.end)throw new RangeError("Slicing outside of original slice.");return new i(this.bytes,this.view,this.offset,t,t+e)}},tt=(i,t)=>{if(i.filePos<i.start||i.filePos+t>i.end)throw new RangeError(`Tried reading [${i.filePos}, ${i.filePos+t}), but slice is [${i.start}, ${i.end}). This is likely an internal error, please report it alongside the file that caused it.`)},D=(i,t)=>{tt(i,t);let e=i.bytes.subarray(i.bufferPos,i.bufferPos+t);return i.bufferPos+=t,e},N=i=>(tt(i,1),i.view.getUint8(i.bufferPos++)),sn=(i,t)=>{tt(i,2);let e=i.view.getUint16(i.bufferPos,t);return i.bufferPos+=2,e},be=i=>{tt(i,2);let t=i.view.getUint16(i.bufferPos,!1);return i.bufferPos+=2,t},_t=i=>{tt(i,3);let t=li(i.view,i.bufferPos,!1);return i.bufferPos+=3,t},$n=i=>{tt(i,2);let t=i.view.getInt16(i.bufferPos,!1);return i.bufferPos+=2,t},Sr=(i,t)=>{tt(i,4);let e=i.view.getUint32(i.bufferPos,t);return i.bufferPos+=4,e},M=i=>{tt(i,4);let t=i.view.getUint32(i.bufferPos,!1);return i.bufferPos+=4,t},yi=i=>{tt(i,4);let t=i.view.getUint32(i.bufferPos,!0);return i.bufferPos+=4,t},yr=i=>{tt(i,4);let t=i.view.getInt32(i.bufferPos,!1);return i.bufferPos+=4,t},qp=i=>{tt(i,4);let t=i.view.getInt32(i.bufferPos,!0);return i.bufferPos+=4,t},Jc=(i,t)=>{let e,r;return t?(e=Sr(i,!0),r=Sr(i,!0)):(r=Sr(i,!1),e=Sr(i,!1)),r*4294967296+e},Ne=i=>{let t=M(i),e=M(i);return t*4294967296+e},Sd=i=>{let t=yr(i),e=M(i);return t*4294967296+e},Md=i=>{let t=yi(i);return qp(i)*4294967296+t},Id=i=>{tt(i,4);let t=i.view.getFloat32(i.bufferPos,!1);return i.bufferPos+=4,t},Fs=i=>{tt(i,8);let t=i.view.getFloat64(i.bufferPos,!1);return i.bufferPos+=8,t},ue=(i,t)=>{tt(i,t);let e="";for(let r=0;r<t;r++)e+=String.fromCharCode(i.bytes[i.bufferPos++]);return e},lo=(i,t,e)=>we.decode(D(i,t)).split(`
`).map(a=>a.trim()).filter(a=>a.length>0&&!e?.ignore?.(a));var ea=128,De=10,wn=["Blues","Classic rock","Country","Dance","Disco","Funk","Grunge","Hip-hop","Jazz","Metal","New age","Oldies","Other","Pop","Rhythm and blues","Rap","Reggae","Rock","Techno","Industrial","Alternative","Ska","Death metal","Pranks","Soundtrack","Euro-techno","Ambient","Trip-hop","Vocal","Jazz & funk","Fusion","Trance","Classical","Instrumental","Acid","House","Game","Sound clip","Gospel","Noise","Alternative rock","Bass","Soul","Punk","Space","Meditative","Instrumental pop","Instrumental rock","Ethnic","Gothic","Darkwave","Techno-industrial","Electronic","Pop-folk","Eurodance","Dream","Southern rock","Comedy","Cult","Gangsta","Top 40","Christian rap","Pop/funk","Jungle music","Native US","Cabaret","New wave","Psychedelic","Rave","Showtunes","Trailer","Lo-fi","Tribal","Acid punk","Acid jazz","Polka","Retro","Musical","Rock 'n' roll","Hard rock","Folk","Folk rock","National folk","Swing","Fast fusion","Bebop","Latin","Revival","Celtic","Bluegrass","Avantgarde","Gothic rock","Progressive rock","Psychedelic rock","Symphonic rock","Slow rock","Big band","Chorus","Easy listening","Acoustic","Humour","Speech","Chanson","Opera","Chamber music","Sonata","Symphony","Booty bass","Primus","Porn groove","Satire","Slow jam","Club","Tango","Samba","Folklore","Ballad","Power ballad","Rhythmic Soul","Freestyle","Duet","Punk rock","Drum solo","A cappella","Euro-house","Dance hall","Goa music","Drum & bass","Club-house","Hardcore techno","Terror","Indie","Britpop","Negerpunk","Polsk punk","Beat","Christian gangsta rap","Heavy metal","Black metal","Crossover","Contemporary Christian","Christian rock","Merengue","Salsa","Thrash metal","Anime","Jpop","Synthpop","Christmas","Art rock","Baroque","Bhangra","Big beat","Breakbeat","Chillout","Downtempo","Dub","EBM","Eclectic","Electro","Electroclash","Emo","Experimental","Garage","Global","IDM","Illbient","Industro-Goth","Jam Band","Krautrock","Leftfield","Lounge","Math rock","New romantic","Nu-breakz","Post-punk","Post-rock","Psytrance","Shoegaze","Space rock","Trop rock","World music","Neoclassical","Audiobook","Audio theatre","Neue Deutsche Welle","Podcast","Indie rock","G-Funk","Dubstep","Garage rock","Psybient"],_d=(i,t)=>{let e=i.filePos;t.raw??={},t.raw.TAG??=D(i,ea-3),i.filePos=e;let r=Tn(i,30);r&&(t.title??=r);let n=Tn(i,30);n&&(t.artist??=n);let a=Tn(i,30);a&&(t.album??=a);let s=Tn(i,4),o=Number.parseInt(s,10);Number.isInteger(o)&&o>0&&(t.date??=new Date(String(o)));let c=D(i,30),u;if(c[28]===0&&c[29]!==0){let m=c[29];m>0&&(t.trackNumber??=m),i.skip(-30),u=Tn(i,28),i.skip(2)}else i.skip(-30),u=Tn(i,30);u&&(t.comment??=u);let l=N(i);l<wn.length&&(t.genre??=wn[l])},Tn=(i,t)=>{let e=D(i,t),r=fi(e.indexOf(0),e.length),n=e.subarray(0,r),a="";for(let s=0;s<n.length;s++)a+=String.fromCharCode(n[s]);return a.trimEnd()},Ye=i=>{let t=i.filePos,e=ue(i,3),r=N(i),n=N(i),a=N(i),s=M(i);if(e!=="ID3"||r===255||n===255||(s&2155905152)!==0)return i.filePos=t,null;let o=Ss(s);return a&16&&(o+=De),{majorVersion:r,revision:n,flags:a,size:o}},Kr=(i,t,e)=>{if(![2,3,4].includes(t.majorVersion)){U._warn(`Unsupported ID3v2 major version: ${t.majorVersion}`);return}let r=t.flags&16?t.size-De:t.size,n=D(i,r),a=new Wu(t,n);if(t.flags&128&&t.majorVersion===3&&a.ununsynchronizeAll(),t.flags&64){let s=a.readU32();t.majorVersion===3?a.pos+=s:a.pos+=s-4}for(;a.pos<=a.bytes.length-a.frameHeaderSize();){let s=a.readId3V2Frame();if(!s)break;let o=a.pos,c=a.pos+s.size,u=!1,l=!1,m=!1;if(t.majorVersion===3?(u=!!(s.flags&64),l=!!(s.flags&128)):t.majorVersion===4&&(u=!!(s.flags&4),l=!!(s.flags&8),m=!!(s.flags&2)||!!(t.flags&128)),u){U._warn(`Skipping encrypted ID3v2 frame ${s.id}`),a.pos=c;continue}if(l){U._warn(`Skipping compressed ID3v2 frame ${s.id}`),a.pos=c;continue}if(m&&a.ununsynchronizeRegion(a.pos,c),e.raw??={},s.id==="TXXX"){let d=e.raw.TXXX??={},f=a.readId3V2TextEncoding(),p=a.readId3V2Text(f,c),b=a.readId3V2Text(f,c);d[p]??=b}else s.id[0]==="T"?e.raw[s.id]??=a.readId3V2EncodingAndText(c):e.raw[s.id]??=a.readBytes(s.size);switch(a.pos=o,s.id){case"TIT2":case"TT2":e.title??=a.readId3V2EncodingAndText(c);break;case"TIT3":case"TT3":e.description??=a.readId3V2EncodingAndText(c);break;case"TPE1":case"TP1":e.artist??=a.readId3V2EncodingAndText(c);break;case"TALB":case"TAL":e.album??=a.readId3V2EncodingAndText(c);break;case"TPE2":case"TP2":e.albumArtist??=a.readId3V2EncodingAndText(c);break;case"TRCK":case"TRK":{let f=a.readId3V2EncodingAndText(c).split("/"),p=Number.parseInt(f[0],10),b=f[1]&&Number.parseInt(f[1],10);Number.isInteger(p)&&p>0&&(e.trackNumber??=p),b&&Number.isInteger(b)&&b>0&&(e.tracksTotal??=b)}break;case"TPOS":case"TPA":{let f=a.readId3V2EncodingAndText(c).split("/"),p=Number.parseInt(f[0],10),b=f[1]&&Number.parseInt(f[1],10);Number.isInteger(p)&&p>0&&(e.discNumber??=p),b&&Number.isInteger(b)&&b>0&&(e.discsTotal??=b)}break;case"TCON":case"TCO":{let d=a.readId3V2EncodingAndText(c),f=/^\((\d+)\)/.exec(d);if(f){let p=Number.parseInt(f[1]);if(wn[p]!==void 0){e.genre??=wn[p];break}}if(f=/^\d+$/.exec(d),f){let p=Number.parseInt(f[0]);if(wn[p]!==void 0){e.genre??=wn[p];break}}e.genre??=d}break;case"TDRC":case"TDAT":{let d=a.readId3V2EncodingAndText(c),f=new Date(d);Number.isNaN(f.getTime())||(e.date??=f)}break;case"TYER":case"TYE":{let d=a.readId3V2EncodingAndText(c),f=Number.parseInt(d,10);Number.isInteger(f)&&(e.date??=new Date(String(f)))}break;case"USLT":case"ULT":{let d=a.readU8();a.pos+=3,a.readId3V2Text(d,c),e.lyrics??=a.readId3V2Text(d,c)}break;case"COMM":case"COM":{let d=a.readU8();a.pos+=3,a.readId3V2Text(d,c),e.comment??=a.readId3V2Text(d,c)}break;case"APIC":case"PIC":{let d=a.readId3V2TextEncoding(),f;if(t.majorVersion===2){let y=a.readAscii(3);f=y==="PNG"?"image/png":y==="JPG"?"image/jpeg":"image/*"}else f=a.readId3V2Text(d,c);let p=a.readU8(),b=a.readId3V2Text(d,c).trimEnd(),h=c-a.pos;if(h>=0){let y=a.readBytes(h);e.images||(e.images=[]),e.images.push({data:y,mimeType:f,kind:p===3?"coverFront":p===4?"coverBack":"unknown",description:b})}}break;default:a.pos+=s.size;break}a.pos=c}},Wu=class{constructor(t,e){this.header=t;this.bytes=e;this.pos=0;this.view=new DataView(e.buffer,e.byteOffset,e.byteLength)}frameHeaderSize(){return this.header.majorVersion===2?6:10}ununsynchronizeAll(){let t=[];for(let e=0;e<this.bytes.length;e++){let r=this.bytes[e];t.push(r),r===255&&e!==this.bytes.length-1&&this.bytes[e]===0&&e++}this.bytes=new Uint8Array(t),this.view=new DataView(this.bytes.buffer)}ununsynchronizeRegion(t,e){let r=[];for(let s=t;s<e;s++){let o=this.bytes[s];r.push(o),o===255&&s!==e-1&&this.bytes[s+1]===0&&s++}let n=this.bytes.subarray(0,t),a=this.bytes.subarray(e);this.bytes=new Uint8Array(n.length+r.length+a.length),this.bytes.set(n,0),this.bytes.set(r,n.length),this.bytes.set(a,n.length+r.length),this.view=new DataView(this.bytes.buffer)}readBytes(t){let e=this.bytes.subarray(this.pos,this.pos+t);return this.pos+=t,e}readU8(){let t=this.view.getUint8(this.pos);return this.pos+=1,t}readU16(){let t=this.view.getUint16(this.pos,!1);return this.pos+=2,t}readU24(){let t=this.view.getUint16(this.pos,!1),e=this.view.getUint8(this.pos+2);return this.pos+=3,t*256+e}readU32(){let t=this.view.getUint32(this.pos,!1);return this.pos+=4,t}readAscii(t){let e="";for(let r=0;r<t;r++)e+=String.fromCharCode(this.view.getUint8(this.pos+r));return this.pos+=t,e}readId3V2Frame(){if(this.header.majorVersion===2){let t=this.readAscii(3);if(t==="\0\0\0")return null;let e=this.readU24();return{id:t,size:e,flags:0}}else{let t=this.readAscii(4);if(t==="\0\0\0\0")return null;let e=this.readU32(),r=this.header.majorVersion===4?Ss(e):e,n=this.readU16(),a=this.pos,s=o=>{let c=this.pos+o;if(c>this.bytes.length)return!1;if(c<=this.bytes.length-this.frameHeaderSize()){this.pos+=o;let u=this.readAscii(4);if(u!=="\0\0\0\0"&&!/[0-9A-Z]{4}/.test(u))return!1}return!0};if(!s(r)){let o=this.header.majorVersion===4?e:Ss(e);s(o)&&(r=o)}return this.pos=a,{id:t,size:r,flags:n}}}readId3V2TextEncoding(){let t=this.readU8();if(t>3)throw new Error(`Unsupported text encoding: ${t}`);return t}readId3V2Text(t,e){let r=this.pos,n=this.readBytes(e-this.pos);switch(t){case 0:{let a="";for(let s=0;s<n.length;s++){let o=n[s];if(o===0){this.pos=r+s+1;break}a+=String.fromCharCode(o)}return a}case 1:if(n[0]===255&&n[1]===254){let a=new TextDecoder("utf-16le"),s=fi(n.findIndex((o,c)=>o===0&&n[c+1]===0&&c%2===0),n.length);return this.pos=r+Math.min(s+2,n.length),a.decode(n.subarray(2,s))}else if(n[0]===254&&n[1]===255){let a=new TextDecoder("utf-16be"),s=fi(n.findIndex((o,c)=>o===0&&n[c+1]===0&&c%2===0),n.length);return this.pos=r+Math.min(s+2,n.length),a.decode(n.subarray(2,s))}else{let a=fi(n.findIndex(s=>s===0),n.length);return this.pos=r+Math.min(a+1,n.length),we.decode(n.subarray(0,a))}case 2:{let a=new TextDecoder("utf-16be"),s=fi(n.findIndex((o,c)=>o===0&&n[c+1]===0&&c%2===0),n.length);return this.pos=r+Math.min(s+2,n.length),a.decode(n.subarray(0,s))}case 3:{let a=fi(n.findIndex(s=>s===0),n.length);return this.pos=r+Math.min(a+1,n.length),we.decode(n.subarray(0,a))}}}readId3V2EncodingAndText(t){if(this.pos>=t)return"";let e=this.readId3V2TextEncoding();return this.readId3V2Text(e,t)}},ni=class{constructor(t){this.helper=new Uint8Array(8);this.helperView=L(this.helper);this.writer=t}writeId3V2Tag(t){let e=this.writer.getPos();this.writeAscii("ID3"),this.writeU8(4),this.writeU8(0),this.writeU8(0),this.writeSynchsafeU32(0);let r=this.writer.getPos(),n=new Set;for(let{key:o,value:c}of xt(t))switch(o){case"title":this.writeId3V2TextFrame("TIT2",c),n.add("TIT2");break;case"description":this.writeId3V2TextFrame("TIT3",c),n.add("TIT3");break;case"artist":this.writeId3V2TextFrame("TPE1",c),n.add("TPE1");break;case"album":this.writeId3V2TextFrame("TALB",c),n.add("TALB");break;case"albumArtist":this.writeId3V2TextFrame("TPE2",c),n.add("TPE2");break;case"trackNumber":{let u=t.tracksTotal!==void 0?`${c}/${t.tracksTotal}`:c.toString();this.writeId3V2TextFrame("TRCK",u),n.add("TRCK")}break;case"discNumber":{let u=t.discsTotal!==void 0?`${c}/${t.discsTotal}`:c.toString();this.writeId3V2TextFrame("TPOS",u),n.add("TPOS")}break;case"genre":this.writeId3V2TextFrame("TCON",c),n.add("TCON");break;case"date":this.writeId3V2TextFrame("TDRC",c.toISOString().slice(0,10)),n.add("TDRC");break;case"lyrics":this.writeId3V2LyricsFrame(c),n.add("USLT");break;case"comment":this.writeId3V2CommentFrame(c),n.add("COMM");break;case"images":{let u={coverFront:3,coverBack:4,unknown:0};for(let l of c){let m=u[l.kind]??0,d=l.description??"";this.writeId3V2ApicFrame(l.mimeType,m,d,l.data)}}break;case"tracksTotal":case"discsTotal":break;case"raw":break;default:ie(o)}if(t.raw)for(let o in t.raw){let c=t.raw[o];if(c==null||o.length!==4||n.has(o))continue;let u;if(typeof c=="string")if(Tt(c)){u=new Uint8Array(c.length+2),u[0]=0;for(let m=0;m<c.length;m++)u[m+1]=c.charCodeAt(m)}else{let m=J.encode(c);u=new Uint8Array(m.byteLength+2),u[0]=3,u.set(m,1)}else if(c instanceof Uint8Array)u=c;else if(o==="TXXX"&&$a(c)){for(let l in c){let m=c[l],d=Tt(l)&&Tt(m),f=d?null:J.encode(l),p=d?null:J.encode(m),b=d?l.length:f.byteLength,h=d?m.length:p.byteLength,y=1+b+1+h+1;this.writeAscii("TXXX"),this.writeSynchsafeU32(y),this.writeU16(0),this.writeU8(d?0:3),d?(this.writeIsoString(l),this.writeIsoString(m)):(this.writer.write(f),this.writeU8(0),this.writer.write(p),this.writeU8(0))}continue}else continue;this.writeAscii(o),this.writeSynchsafeU32(u.byteLength),this.writeU16(0),this.writer.write(u)}let a=this.writer.getPos(),s=a-r;return this.writer.seek(e+6),this.writeSynchsafeU32(s),this.writer.seek(a),s+10}writeU8(t){this.helper[0]=t,this.writer.write(this.helper.subarray(0,1))}writeU16(t){this.helperView.setUint16(0,t,!1),this.writer.write(this.helper.subarray(0,2))}writeU32(t){this.helperView.setUint32(0,t,!1),this.writer.write(this.helper.subarray(0,4))}writeAscii(t){for(let e=0;e<t.length;e++)this.helper[e]=t.charCodeAt(e);this.writer.write(this.helper.subarray(0,t.length))}writeSynchsafeU32(t){this.writeU32(ld(t))}writeIsoString(t){let e=new Uint8Array(t.length+1);for(let r=0;r<t.length;r++)e[r]=t.charCodeAt(r);this.writer.write(e)}writeUtf8String(t){let e=J.encode(t);this.writer.write(e),this.writeU8(0)}writeId3V2TextFrame(t,e){let r=Tt(e),a=1+(r?e.length:J.encode(e).byteLength)+1;this.writeAscii(t),this.writeSynchsafeU32(a),this.writeU16(0),this.writeU8(r?0:3),r?this.writeIsoString(e):this.writeUtf8String(e)}writeId3V2LyricsFrame(t){let e=Tt(t),r="",n=4+r.length+1+t.length+1;this.writeAscii("USLT"),this.writeSynchsafeU32(n),this.writeU16(0),this.writeU8(e?0:3),this.writeAscii("und"),e?(this.writeIsoString(r),this.writeIsoString(t)):(this.writeUtf8String(r),this.writeUtf8String(t))}writeId3V2CommentFrame(t){let e=Tt(t),r=e?t.length:J.encode(t).byteLength,n="",a=4+n.length+1+r+1;this.writeAscii("COMM"),this.writeSynchsafeU32(a),this.writeU16(0),this.writeU8(e?0:3),this.writeU8(117),this.writeU8(110),this.writeU8(100),e?(this.writeIsoString(n),this.writeIsoString(t)):(this.writeUtf8String(n),this.writeUtf8String(t))}writeId3V2ApicFrame(t,e,r,n){let a=Tt(t)&&Tt(r),s=a?r.length:J.encode(r).byteLength,o=1+t.length+1+1+s+1+n.byteLength;this.writeAscii("APIC"),this.writeSynchsafeU32(o),this.writeU16(0),this.writeU8(a?0:3),a?this.writeIsoString(t):this.writeUtf8String(t),this.writeU8(e),a?this.writeIsoString(r):this.writeUtf8String(r),this.writer.write(n)}};var ve=class{constructor(t){this.mutex=new ze;this.trackTimestampInfo=new WeakMap;this.output=t}onTrackClose(t){}validateTimestamp(t,e,r){let n=this.trackTimestampInfo.get(t);if(n){if(r&&(n.maxTimestampBeforeLastKeyPacket=n.maxTimestamp),n.maxTimestampBeforeLastKeyPacket!==null&&e<n.maxTimestampBeforeLastKeyPacket)throw new Error(`Timestamps cannot be smaller than the largest timestamp of the previous GOP (a GOP begins with a key packet and ends right before the next key packet). Got ${e}s, but largest timestamp is ${n.maxTimestampBeforeLastKeyPacket}s.`);n.maxTimestamp=Math.max(n.maxTimestamp,e)}else{if(!r)throw new Error("First packet must be a key packet.");n={maxTimestamp:e,maxTimestampBeforeLastKeyPacket:null},this.trackTimestampInfo.set(t,n)}}};var Vo=class extends ve{constructor(e,r){super(e);this.header=null;this.headerBitstream=null;this.inputIsAdts=null;this.format=r}async start(){let e=await this.mutex.acquire();this.writer=await this.output._getRootWriter(!0),fr(this.output._metadataTags)||new ni(this.writer).writeId3V2Tag(this.output._metadataTags),e()}async getMimeType(){return"audio/aac"}async addEncodedVideoPacket(){throw new Error("ADTS does not support video.")}async addEncodedAudioPacket(e,r,n){let a=await this.mutex.acquire();try{if(this.validateTimestamp(e,r.timestamp,r.type==="key"),this.inputIsAdts===null){Pe(n,e.source._codec);let s=n?.decoderConfig?.description;if(this.inputIsAdts=!s,!this.inputIsAdts){let o=Qt(Z(s)),c=Ya(o);this.header=c.header,this.headerBitstream=c.bitstream}}if(this.inputIsAdts){let s=this.writer.getPos();this.writer.write(r.data),this.format._options.onFrame&&this.format._options.onFrame(r.data,s)}else{g(this.header);let s=r.data.byteLength+this.header.byteLength;Za(this.headerBitstream,s);let o=this.writer.getPos();if(this.writer.write(this.header),this.writer.write(r.data),this.format._options.onFrame){let c=new Uint8Array(s);c.set(this.header,0),c.set(r.data,this.header.byteLength),this.format._options.onFrame(c,o)}}await this.writer.flush()}finally{a()}}async addSubtitleCue(){throw new Error("ADTS does not support subtitles.")}async finalize(){let e=await this.mutex.acquire();if(this.inputIsAdts===null)throw new Error("Cannot finalize an empty ADTS file: not a single packet was added.");e()}};var zm=new Uint8Array([102,76,97,67]),Kp=38,Qp=34,Uo=class extends ve{constructor(e,r){super(e);this.metadataWritten=!1;this.blockSizes=[];this.frameSizes=[];this.sampleRate=null;this.channels=null;this.bitsPerSample=null;this.format=r}async start(){let e=await this.mutex.acquire();this.writer=await this.output._getRootWriter(!!this.format._options.appendOnly),this.writer.write(zm);let r=this.output.tracks[0];g(r?.isAudioTrack()),r.metadata.decoderConfig&&(Pe({decoderConfig:r.metadata.decoderConfig},r.source._codec),this.applyDecoderConfig(r.metadata.decoderConfig)),e()}applyDecoderConfig(e){g(e.description),this.sampleRate=e.sampleRate,this.channels=e.numberOfChannels;let r=new q(Z(e.description));r.skipBits(167),this.bitsPerSample=r.readBits(5)+1,this.format._options.appendOnly&&this.writeHeader({minimumBlockSize:16,maximumBlockSize:65535,minimumFrameSize:0,maximumFrameSize:0,sampleRate:this.sampleRate,channels:this.channels,bitsPerSample:this.bitsPerSample,totalSamples:0})}writeHeader({bitsPerSample:e,minimumBlockSize:r,maximumBlockSize:n,minimumFrameSize:a,maximumFrameSize:s,sampleRate:o,channels:c,totalSamples:u}){g(this.writer.getPos()===4);let l=!fr(this.output._metadataTags),m=new q(new Uint8Array(4));m.writeBits(1,+!l),m.writeBits(7,0),m.writeBits(24,Qp),this.writer.write(m.bytes);let d=new q(new Uint8Array(18));if(d.writeBits(16,r),d.writeBits(16,n),d.writeBits(24,a),d.writeBits(24,s),d.writeBits(20,o),d.writeBits(3,c-1),d.writeBits(5,e-1),u>=2**32)throw new Error("This muxer only supports writing up to 2 ** 32 samples");d.writeBits(4,0),d.writeBits(32,u),this.writer.write(d.bytes),this.writer.write(new Uint8Array(16))}writePictureBlock(e){let r=32+e.mimeType.length+(e.description?.length??0)+e.data.length,n=new Uint8Array(r),a=0,s=L(n);s.setUint32(a,e.kind==="coverFront"?3:e.kind==="coverBack"?4:0),a+=4,s.setUint32(a,e.mimeType.length),a+=4,n.set(J.encode(e.mimeType),8),a+=e.mimeType.length,s.setUint32(a,e.description?.length??0),a+=4,n.set(J.encode(e.description??""),a),a+=e.description?.length??0,a+=16,s.setUint32(a,e.data.length),a+=4,n.set(e.data,a),a+=e.data.length,g(a===r);let o=new q(new Uint8Array(4));o.writeBits(1,0),o.writeBits(7,6),o.writeBits(24,r),this.writer.write(o.bytes),this.writer.write(n)}writeVorbisCommentAndPictureBlock(){if(this.format._options.appendOnly||this.writer.seek(Kp+zm.byteLength),fr(this.output._metadataTags)){this.metadataWritten=!0;return}let e=this.output._metadataTags.images??[];for(let a of e)this.writePictureBlock(a);let r=Ln(new Uint8Array(0),this.output._metadataTags,!1),n=new q(new Uint8Array(4));n.writeBits(1,1),n.writeBits(7,4),n.writeBits(24,r.length),this.writer.write(n.bytes),this.writer.write(r),this.metadataWritten=!0}async getMimeType(){return"audio/flac"}async addEncodedVideoPacket(){throw new Error("FLAC does not support video.")}async addEncodedAudioPacket(e,r,n){let a=await this.mutex.acquire();try{this.validateTimestamp(e,r.timestamp,r.type==="key"),this.sampleRate===null&&(Pe(n,e.source._codec),g(n),g(n.decoderConfig),this.applyDecoderConfig(n.decoderConfig)),this.metadataWritten||this.writeVorbisCommentAndPictureBlock();let s=Ee.tempFromBytes(r.data);s.skip(2);let o=D(s,2),c=new q(o),u=js(c.readBits(4));if(u===null)throw new Error("Invalid FLAC frame: Invalid block size.");Xs(s);let l=$s(s,u);this.format._options.appendOnly||(this.blockSizes.push(l),this.frameSizes.push(r.data.length));let m=this.writer.getPos();this.writer.write(r.data),this.format._options.onFrame&&this.format._options.onFrame(r.data,m),await this.writer.flush()}finally{a()}}addSubtitleCue(){throw new Error("FLAC does not support subtitles.")}async finalize(){let e=await this.mutex.acquire();if(this.sampleRate===null)throw new Error("Cannot finalize an empty FLAC file: no packets were added and the track specified no decoderConfig in its metadata, so there's no telling what the file should look like.");if(this.metadataWritten||this.writeVorbisCommentAndPictureBlock(),!this.format._options.appendOnly){let r=1/0,n=0,a=1/0,s=0,o=0;for(let c=0;c<this.blockSizes.length;c++)a=Math.min(a,this.frameSizes[c]),s=Math.max(s,this.frameSizes[c]),n=Math.max(n,this.blockSizes[c]),o+=this.blockSizes[c],c!==this.blockSizes.length-1&&(r=Math.min(r,this.blockSizes[c]));this.blockSizes.length===0&&(r=16,n=65535,a=0,s=0),g(this.channels!==null),g(this.bitsPerSample!==null),this.writer.seek(4),this.writeHeader({minimumBlockSize:r,maximumBlockSize:n,minimumFrameSize:a,maximumFrameSize:s,sampleRate:this.sampleRate,channels:this.channels,bitsPerSample:this.bitsPerSample,totalSamples:o})}e()}};var Ra=/(?:(.+?)\n)?((?:\d{2}:)?\d{2}:\d{2}.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}.\d{3})/g,Gp=/^WEBVTT(.|\n)*?\n{2}/,Sn=/<(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})>/g,zo=class{constructor(t){this.preambleText=null;this.preambleEmitted=!1;this.options=t}parse(t){t=t.replaceAll(`\r
`,`
`).replaceAll("\r",`
`),Ra.lastIndex=0;let e;if(!this.preambleText){if(!Gp.test(t))throw new Error("WebVTT preamble incorrect.");e=Ra.exec(t);let r=t.slice(0,e?.index??t.length).trimEnd();if(!r)throw new Error("No WebVTT preamble provided.");this.preambleText=r,e&&(t=t.slice(e.index),Ra.lastIndex=0)}for(;e=Ra.exec(t);){let r=t.slice(0,e.index),n=e[1],a=e.index+e[0].length,s=t.indexOf(`
`,a)+1,o=t.slice(a,s).trim(),c=t.indexOf(`

`,a);c===-1&&(c=t.length);let u=No(e[2]),m=No(e[3])-u,d=t.slice(s,c).trim();t=t.slice(c).trimStart(),Ra.lastIndex=0;let f={timestamp:u/1e3,duration:m/1e3,text:d,identifier:n,settings:o,notes:r},p={};this.preambleEmitted||(p.config={description:this.preambleText},this.preambleEmitted=!0),this.options.output(f,p)}}},jp=/(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})/,No=i=>{let t=jp.exec(i);if(!t)throw new Error("Expected match.");return 60*60*1e3*Number(t[1]||"0")+60*1e3*Number(t[2])+1e3*Number(t[3])+Number(t[4])},Lo=i=>{let t=Math.floor(i/36e5),e=Math.floor(i%(60*60*1e3)/(60*1e3)),r=Math.floor(i%(60*1e3)/1e3),n=i%1e3;return t.toString().padStart(2,"0")+":"+e.toString().padStart(2,"0")+":"+r.toString().padStart(2,"0")+"."+n.toString().padStart(3,"0")};var Ei=class{constructor(t){this.writer=t;this.helper=new Uint8Array(8);this.helperView=new DataView(this.helper.buffer);this.offsets=new WeakMap}writeU32(t){this.helperView.setUint32(0,t,!1),this.writer.write(this.helper.subarray(0,4))}writeU64(t){this.helperView.setUint32(0,Math.floor(t/2**32),!1),this.helperView.setUint32(4,t,!1),this.writer.write(this.helper.subarray(0,8))}writeAscii(t){for(let e=0;e<t.length;e++)this.helperView.setUint8(e%8,t.charCodeAt(e)),e%8===7&&this.writer.write(this.helper);t.length%8!==0&&this.writer.write(this.helper.subarray(0,t.length%8))}writeBox(t){if(this.offsets.set(t,this.writer.getPos()),t.contents&&!t.children)this.writeBoxHeader(t,t.size??t.contents.byteLength+8),this.writer.write(t.contents);else{let e=this.writer.getPos();if(this.writeBoxHeader(t,0),t.contents&&this.writer.write(t.contents),t.children)for(let a of t.children)a&&this.writeBox(a);let r=this.writer.getPos(),n=t.size??r-e;this.writer.seek(e),this.writeBoxHeader(t,n),this.writer.seek(r)}}writeBoxHeader(t,e){this.writeU32(t.largeSize?1:e),this.writeAscii(t.type),t.largeSize&&this.writeU64(e)}measureBoxHeader(t){return 8+(t.largeSize?8:0)}patchBox(t){let e=this.offsets.get(t);g(e!==void 0);let r=this.writer.getPos();this.writer.seek(e),this.writeBox(t),this.writer.seek(r)}measureBox(t){if(t.contents&&!t.children)return this.measureBoxHeader(t)+t.contents.byteLength;{let e=this.measureBoxHeader(t);if(t.contents&&(e+=t.contents.byteLength),t.children)for(let r of t.children)r&&(e+=this.measureBox(r));return e}}},$=new Uint8Array(8),ht=new DataView($.buffer),Te=i=>[(i%256+256)%256],K=i=>(ht.setUint16(0,i,!1),[$[0],$[1]]),Qu=i=>(ht.setInt16(0,i,!1),[$[0],$[1]]),Hm=i=>(ht.setUint32(0,i,!1),[$[1],$[2],$[3]]),F=i=>(ht.setUint32(0,i,!1),[$[0],$[1],$[2],$[3]]),tr=i=>(ht.setInt32(0,i,!1),[$[0],$[1],$[2],$[3]]),Dt=i=>(ht.setUint32(0,Math.floor(i/2**32),!1),ht.setUint32(4,i,!1),[$[0],$[1],$[2],$[3],$[4],$[5],$[6],$[7]]),Nm=i=>(ht.setInt32(0,Math.floor(i/2**32),!1),ht.setUint32(4,i,!1),[$[0],$[1],$[2],$[3],$[4],$[5],$[6],$[7]]),qm=i=>(ht.setInt16(0,2**8*i,!1),[$[0],$[1]]),pt=i=>(ht.setInt32(0,2**16*i,!1),[$[0],$[1],$[2],$[3]]),Hu=i=>(ht.setInt32(0,2**30*i,!1),[$[0],$[1],$[2],$[3]]),qu=(i,t)=>{let e=[],r=i;do{let n=r&127;r>>=7,e.length>0&&(n|=128),e.push(n),t!==void 0&&t--}while(r>0||t);return e.reverse()},le=(i,t=!1)=>{let e=Array(i.length).fill(null).map((r,n)=>i.charCodeAt(n));return t&&e.push(0),e},Km=i=>{let t=i*(Math.PI/180),e=Math.round(Math.cos(t)),r=Math.round(Math.sin(t));return[e,r,0,-r,e,0,0,0,1]},Qm=Km(0),Gm=i=>[pt(i[0]),pt(i[1]),Hu(i[2]),pt(i[3]),pt(i[4]),Hu(i[5]),pt(i[6]),pt(i[7]),Hu(i[8])],H=(i,t,e)=>({type:i,contents:t&&new Uint8Array(t.flat(10)),children:e}),re=(i,t,e,r,n)=>H(i,[Te(t),Hm(e),r??[]],n),jm=i=>i.isQuickTime?H("ftyp",[le("qt  "),F(512),le("qt  ")]):i.fragmented?i.cmaf?H("ftyp",[le("iso5"),F(512),le("iso5"),le("iso6"),le("mp41"),le("cmfc"),le("dash")]):H("ftyp",[le("iso5"),F(512),le("iso5"),le("iso6"),le("mp41")]):H("ftyp",[le("isom"),F(512),le("isom"),i.holdsAvc?le("avc1"):[],le("mp41")]),Gu=()=>H("styp",[le("iso5"),F(0),le("iso5"),le("iso6"),le("mp41"),le("cmfc"),le("dash")]),ju=(i,t)=>{let e=Math.max(0,i.minWrittenTimestamp),r=Math.max(0,i.maxWrittenEndTimestamp-e);return Number.isFinite(r)||(r=0),re("sidx",1,0,[F(1),F(rt),Dt(me(e,rt)),Dt(0),K(0),K(1),F(t&2147483647),F(me(r,rt)),F(0)])},Ma=i=>({type:"mdat",largeSize:i}),Xm=i=>({type:"free",size:i}),An=i=>H("moov",void 0,[Xp(i.creationTime,i.trackDatas),...i.trackDatas.map(t=>$p(t,i.creationTime)),i.isFragmented?Dh(i.trackDatas):null,Kh(i)]),Xp=(i,t)=>{let e=Math.max(0,...t.map(s=>Math.max(0,me(Fa(s),rt)+me(s.startTimestampOffset??0,rt)))),r=Math.max(0,...t.map(s=>s.track.id))+1,n=!Ut(i)||!Ut(e),a=n?Dt:F;return re("mvhd",+n,0,[a(i),a(i),F(rt),a(e),pt(1),qm(1),Array(10).fill(0),Gm(Qm),Array(24).fill(0),F(r)])},Fa=i=>{if(i.samples.length===0)return 0;let t=1/0,e=-1/0;for(let r=0;r<i.samples.length;r++){let n=i.samples[r];n.timestamp<t&&(t=n.timestamp),n.timestamp+n.duration>e&&(e=n.timestamp+n.duration)}return t===1/0?0:e-t},$p=(i,t)=>{let e=af(i),r=i.startTimestampOffset!==null&&i.startTimestampOffset!==0;return H("trak",void 0,[Yp(i,t),r?Zp(i):null,Jp(i,t),e.name!==void 0?H("udta",void 0,[H("name",[...J.encode(e.name)])]):null])},Yp=(i,t)=>{let e=Math.max(0,me(Fa(i),rt)+me(i.startTimestampOffset??0,rt)),r=!Ut(t)||!Ut(e),n=r?Dt:F,a;if(i.type==="video"){let c=i.track.metadata.rotation;a=Km(c??0)}else a=Qm;let s=2;i.track.metadata.disposition?.default!==!1&&(s|=1);let o=i.type==="video"?0:i.type==="audio"?1:i.type==="subtitle"?2:ie(i);return re("tkhd",+r,s,[n(t),n(t),F(i.track.id),F(0),n(e),Array(8).fill(0),K(0),K(o),qm(i.type==="audio"?1:0),K(0),Gm(a),pt(i.type==="video"?i.info.width:0),pt(i.type==="video"?i.info.height:0)])},Zp=i=>{let t=i.startTimestampOffset;if(g(t!==null),t>0){let e=me(t,rt),r=me(Fa(i),rt),n=!Ut(e)||!Ut(r),a=n?Dt:F,s=n?Nm:tr;return H("edts",void 0,[re("elst",n?1:0,0,[F(2),a(e),s(-1),pt(1),a(r),s(0),pt(1)])])}else{let e=me(-t,i.timescale),r=Math.max(0,me(Fa(i),rt)+me(t,rt)),n=!fl(e)||!Ut(r),a=n?Dt:F,s=n?Nm:tr;return H("edts",void 0,[re("elst",n?1:0,0,[F(1),a(r),s(e),pt(1)])])}},Jp=(i,t)=>H("mdia",void 0,[eh(i,t),Xu(!0,th[i.type],rh[i.type]),ih(i)]),eh=(i,t)=>{let e=me(Fa(i),i.timescale),r=!Ut(t)||!Ut(e),n=r?Dt:F;return re("mdhd",+r,0,[n(t),n(t),F(i.timescale),n(e),K(nf(i.track.metadata.languageCode??ae)),K(0)])},th={video:"vide",audio:"soun",subtitle:"text"},rh={video:"MediabunnyVideoHandler",audio:"MediabunnySoundHandler",subtitle:"MediabunnyTextHandler"},Xu=(i,t,e,r="\0\0\0\0")=>re("hdlr",0,0,[i?le("mhlr"):F(0),le(t),le(r),F(0),F(0),le(e,!0)]),ih=i=>H("minf",void 0,[oh[i.type](),ch(),dh(i)]),nh=()=>re("vmhd",0,1,[K(0),K(0),K(0),K(0)]),ah=()=>re("smhd",0,0,[K(0),K(0)]),sh=()=>re("nmhd",0,0),oh={video:nh,audio:ah,subtitle:sh},ch=()=>H("dinf",void 0,[uh()]),uh=()=>re("dref",0,0,[F(1)],[lh()]),lh=()=>re("url ",0,1),dh=i=>{let t=i.compositionTimeOffsetTable.length>1||i.compositionTimeOffsetTable.some(e=>e.sampleCompositionTimeOffset!==0);return H("stbl",void 0,[mh(i),vh(i),t?Bh(i):null,t?Oh(i):null,Rh(i),Fh(i),Mh(i),_h(i)])},mh=i=>{let t;if(i.type==="video")t=fh(Xh(i.track.source._codec,i.info.decoderConfig.codec),i);else if(i.type==="audio"){let e=rf(i.track.source._codec,i.info.decoderConfig.codec,i.muxer.isQuickTime);g(e),t=kh(e,i)}else i.type==="subtitle"&&(t=Ih(Zh[i.track.source._codec],i));return g(t),re("stsd",0,0,[F(1)],[t])},fh=(i,t)=>H(i,[Array(6).fill(0),K(1),K(0),K(0),Array(12).fill(0),K(t.info.width),K(t.info.height),F(4718592),F(4718592),F(0),K(1),Te(10),le("Mediabunny"),Array(21).fill(0),K(t.info.hasAlphaChannel?32:24),Qu(65535)],[$h[t.track.source._codec]?.(t)??null,ph(t),Ha(t.info.decoderConfig.colorSpace)?null:hh(t)]),ph=i=>i.info.pixelAspectRatio.num===i.info.pixelAspectRatio.den?null:H("pasp",[F(i.info.pixelAspectRatio.num),F(i.info.pixelAspectRatio.den)]),hh=i=>{let t=i.info.decoderConfig.colorSpace;return H("colr",[le(i.muxer.isQuickTime?"nclc":"nclx"),K(t?.primaries!=null?wt[t.primaries]:2),K(t?.transfer!=null?St[t.transfer]:2),K(t?.matrix!=null?At[t.matrix]:2),i.muxer.isQuickTime?[]:Te((t?.fullRange?1:0)<<7)])},gh=i=>i.info.decoderConfig&&H("avcC",[...Z(i.info.decoderConfig.description)]),bh=i=>i.info.decoderConfig&&H("hvcC",[...Z(i.info.decoderConfig.description)]),Lm=i=>{if(!i.info.decoderConfig)return null;let t=i.info.decoderConfig,e=t.codec.split("."),r=Number(e[1]),n=Number(e[2]),a=Number(e[3]),s=e[4]?Number(e[4]):1,o=e[8]?Number(e[8]):Number(t.colorSpace?.fullRange??0),c=(a<<4)+(s<<1)+o,u=e[5]?Number(e[5]):t.colorSpace?.primaries?wt[t.colorSpace.primaries]:1,l=e[6]?Number(e[6]):t.colorSpace?.transfer?St[t.colorSpace.transfer]:1,m=e[7]?Number(e[7]):t.colorSpace?.matrix?At[t.colorSpace.matrix]:1;return re("vpcC",1,0,[Te(r),Te(n),Te(c),Te(u),Te(l),Te(m),K(0)])},yh=i=>H("av1C",gs(i.info.decoderConfig.codec)),kh=(i,t)=>{let e=0,r,n=16,a=se.includes(t.track.source._codec);if(a){let s=t.track.source._codec,{sampleSize:o}=Re(s);n=8*o,n>16&&(e=1)}if(t.muxer.isQuickTime&&(e=1),e===0)r=[Array(6).fill(0),K(1),K(e),K(0),F(0),K(t.info.numberOfChannels),K(n),K(0),K(0),K(t.info.sampleRate<2**16?t.info.sampleRate:0),K(0)];else{let s=a?0:-2;r=[Array(6).fill(0),K(1),K(e),K(0),F(0),K(t.info.numberOfChannels),K(Math.min(n,16)),Qu(s),K(0),K(t.info.sampleRate<2**16?t.info.sampleRate:0),K(0),a?[F(1),F(n/8),F(t.info.numberOfChannels*n/8)]:[F(0),F(0),F(0)],F(2)]}return H(i,r,[Yh(t.track.source._codec,t.muxer.isQuickTime)?.(t)??null])},Ku=i=>{let t;switch(i.track.source._codec){case"aac":t=64;break;case"mp3":t=107;break;case"vorbis":t=221;break;default:throw new Error(`Unhandled audio codec: ${i.track.source._codec}`)}let e=[...Te(t),...Te(21),...Hm(0),...F(0),...F(0)];if(i.info.decoderConfig.description){let r=Z(i.info.decoderConfig.description);e=[...e,...Te(5),...qu(r.byteLength),...r]}return e=[...K(1),...Te(0),...Te(4),...qu(e.length),...e,...Te(6),...Te(1),...Te(2)],e=[...Te(3),...qu(e.length),...e],re("esds",0,0,e)},ai=i=>H("wave",void 0,[Th(i),wh(i),H("\0\0\0\0")]),Th=i=>H("frma",[le(rf(i.track.source._codec,i.info.decoderConfig.codec,i.muxer.isQuickTime))]),wh=i=>{let{littleEndian:t}=Re(i.track.source._codec);return H("enda",[K(+t)])},Sh=i=>{let t=i.info.numberOfChannels,e=3840,r=i.info.sampleRate,n=0,a=0,s=new Uint8Array(0),o=i.info.decoderConfig?.description;if(o){g(o.byteLength>=18);let c=Z(o),u=Vr(c);t=u.outputChannelCount,e=u.preSkip,r=u.inputSampleRate,n=u.outputGain,a=u.channelMappingFamily,u.channelMappingTable&&(s=u.channelMappingTable)}return H("dOps",[Te(0),Te(t),K(e),F(r),Qu(n),Te(a),...s])},Ah=i=>{let t=i.info.decoderConfig?.description;g(t);let e=Z(t);return re("dfLa",0,0,[...e.subarray(4)])},Jt=i=>{let{littleEndian:t,sampleSize:e}=Re(i.track.source._codec),r=+t;return re("pcmC",0,0,[Te(r),Te(8*e)])},xh=i=>{g(i.info.primingPacket);let t=cs(i.info.primingPacket.data);if(!t)throw new Error("Couldn't extract AC-3 frame info from the audio packet. Ensure the packets contain valid AC-3 sync frames (as specified in ETSI TS 102 366).");let e=new Uint8Array(3),r=new q(e);return r.writeBits(2,t.fscod),r.writeBits(5,t.bsid),r.writeBits(3,t.bsmod),r.writeBits(3,t.acmod),r.writeBits(1,t.lfeon),r.writeBits(5,t.bitRateCode),r.writeBits(5,0),H("dac3",[...e])},Ch=i=>{g(i.info.primingPacket);let t=us(i.info.primingPacket.data);if(!t)throw new Error("Couldn't extract E-AC-3 frame info from the audio packet. Ensure the packets contain valid E-AC-3 sync frames (as specified in ETSI TS 102 366).");let e=16;for(let s of t.substreams)e+=23,s.numDepSub>0?e+=9:e+=1;let r=Math.ceil(e/8),n=new Uint8Array(r),a=new q(n);a.writeBits(13,t.dataRate),a.writeBits(3,t.substreams.length-1);for(let s of t.substreams)a.writeBits(2,s.fscod),a.writeBits(5,s.bsid),a.writeBits(1,0),a.writeBits(1,0),a.writeBits(3,s.bsmod),a.writeBits(3,s.acmod),a.writeBits(1,s.lfeon),a.writeBits(3,0),a.writeBits(4,s.numDepSub),s.numDepSub>0?a.writeBits(9,s.chanLoc):a.writeBits(1,0);return H("dec3",[...n])},Ph=i=>{g(i.info.primingPacket);let t=Qn(i.info.primingPacket.data);if(!t)throw new Error("Couldn't extract DTS frame info from the audio packet. Ensure the packets contain valid DTS frames as specified in ETSI TS 102 114.");return H("ddts",[...Zl(t)])},Ih=(i,t)=>H(i,[Array(6).fill(0),K(1)],[Jh[t.track.source._codec](t)]),Eh=i=>H("vttC",[...J.encode(i.info.config.description)]);var vh=i=>re("stts",0,0,[F(i.timeToSampleTable.length),i.timeToSampleTable.map(t=>[F(t.sampleCount),F(t.sampleDelta)])]),_h=i=>{if(i.samples.every(e=>e.type==="key"))return null;let t=[...i.samples.entries()].filter(([,e])=>e.type==="key");return re("stss",0,0,[F(t.length),t.map(([e])=>F(e+1))])},Rh=i=>re("stsc",0,0,[F(i.compactlyCodedChunkTable.length),i.compactlyCodedChunkTable.map(t=>[F(t.firstChunk),F(t.samplesPerChunk),F(1)])]),Fh=i=>{if(i.type==="audio"&&i.info.requiresPcmTransformation){let{sampleSize:t}=Re(i.track.source._codec);return re("stsz",0,0,[F(t*i.info.numberOfChannels),F(i.samples.reduce((e,r)=>e+me(r.duration,i.timescale),0))])}return re("stsz",0,0,[F(0),F(i.samples.length),i.samples.map(t=>F(t.size))])},Mh=i=>i.finalizedChunks.length>0&&ee(i.finalizedChunks).offset>=2**32?re("co64",0,0,[F(i.finalizedChunks.length),i.finalizedChunks.map(t=>Dt(t.offset))]):re("stco",0,0,[F(i.finalizedChunks.length),i.finalizedChunks.map(t=>F(t.offset))]),Bh=i=>re("ctts",1,0,[F(i.compositionTimeOffsetTable.length),i.compositionTimeOffsetTable.map(t=>[F(t.sampleCount),tr(t.sampleCompositionTimeOffset)])]),Oh=i=>{let t=1/0,e=-1/0,r=1/0,n=-1/0;g(i.compositionTimeOffsetTable.length>0),g(i.samples.length>0);for(let s=0;s<i.compositionTimeOffsetTable.length;s++){let o=i.compositionTimeOffsetTable[s];t=Math.min(t,o.sampleCompositionTimeOffset),e=Math.max(e,o.sampleCompositionTimeOffset)}for(let s=0;s<i.samples.length;s++){let o=i.samples[s];r=Math.min(r,me(o.timestamp,i.timescale)),n=Math.max(n,me(o.timestamp+o.duration,i.timescale))}let a=Math.max(-t,0);return n>=2**31?null:re("cslg",0,0,[tr(a),tr(t),tr(e),tr(r),tr(n)])},Dh=i=>H("mvex",void 0,i.map(Vh)),Vh=i=>re("trex",0,0,[F(i.track.id),F(1),F(0),F(0),F(0)]),$u=(i,t)=>H("moof",void 0,[Uh(i),...t.map(zh)]),Uh=i=>re("mfhd",0,0,[F(i)]),$m=i=>{let t=0,e=0,r=0,n=0,a=i.type==="delta";return e|=+a,a?t|=1:t|=2,t<<24|e<<16|r<<8|n},zh=i=>H("traf",void 0,[Nh(i),Lh(i),Wh(i)]),Nh=i=>{g(i.currentChunk);let t=0;t|=8,t|=16,t|=32,t|=131072;let e=i.currentChunk.samples[1]??i.currentChunk.samples[0],r={duration:e.timescaleUnitsToNextSample,size:e.size,flags:$m(e)};return re("tfhd",0,t,[F(i.track.id),F(r.duration),F(r.size),F(r.flags)])},Lh=i=>(g(i.currentChunk),re("tfdt",1,0,[Dt(me(i.currentChunk.startTimestamp,i.timescale))])),Wh=i=>{g(i.currentChunk);let t=i.currentChunk.samples.map(b=>b.timescaleUnitsToNextSample),e=i.currentChunk.samples.map(b=>b.size),r=i.currentChunk.samples.map($m),n=i.currentChunk.samples.map(b=>me(b.timestamp-b.decodeTimestamp,i.timescale)),a=new Set(t),s=new Set(e),o=new Set(r),c=new Set(n),u=o.size===2&&r[0]!==r[1],l=a.size>1,m=s.size>1,d=!u&&o.size>1,f=c.size>1||[...c].some(b=>b!==0),p=0;return p|=1,p|=4*+u,p|=256*+l,p|=512*+m,p|=1024*+d,p|=2048*+f,re("trun",1,p,[F(i.currentChunk.samples.length),F(i.currentChunk.offset-i.currentChunk.moofOffset||0),u?F(r[0]):[],i.currentChunk.samples.map((b,h)=>[l?F(t[h]):[],m?F(e[h]):[],d?F(r[h]):[],f?tr(n[h]):[]])])},Ym=i=>H("mfra",void 0,[...i.map(Hh),qh()]),Hh=i=>re("tfra",1,0,[F(i.track.id),F(63),F(i.finalizedChunks.length),i.finalizedChunks.map(e=>[Dt(me(e.samples[0].timestamp,i.timescale)),Dt(e.moofOffset),F(e.trafIndex+1),F(1),F(1)])]),qh=()=>re("mfro",0,0,[F(0)]),Zm=()=>H("vtte"),Jm=(i,t,e,r,n)=>H("vttc",void 0,[n!==null?H("vsid",[tr(n)]):null,e!==null?H("iden",[...J.encode(e)]):null,t!==null?H("ctim",[...J.encode(Lo(t))]):null,r!==null?H("sttg",[...J.encode(r)]):null,H("payl",[...J.encode(i)])]),ef=i=>H("vtta",[...J.encode(i)]),Kh=i=>{let t=[],e=i.format._options.metadataFormat??"auto",r=i.output._metadataTags;if(e==="mdir"||e==="auto"&&!i.isQuickTime){let n=Gh(r);n&&t.push(n)}else if(e==="mdta"){let n=jh(r);n&&t.push(n)}else(e==="udta"||e==="auto"&&i.isQuickTime)&&Qh(t,i.output._metadataTags);return t.length===0?null:H("udta",void 0,t)},Qh=(i,t)=>{for(let{key:e,value:r}of xt(t))switch(e){case"title":i.push(er("\xA9nam",r));break;case"description":i.push(er("\xA9des",r));break;case"artist":i.push(er("\xA9ART",r));break;case"album":i.push(er("\xA9alb",r));break;case"albumArtist":i.push(er("albr",r));break;case"genre":i.push(er("\xA9gen",r));break;case"date":i.push(er("\xA9day",r.toISOString().slice(0,10)));break;case"comment":i.push(er("\xA9cmt",r));break;case"lyrics":i.push(er("\xA9lyr",r));break;case"raw":break;case"discNumber":case"discsTotal":case"trackNumber":case"tracksTotal":case"images":break;default:ie(e)}if(t.raw)for(let e in t.raw){let r=t.raw[e];r==null||e.length!==4||i.some(n=>n.type===e)||(typeof r=="string"?i.push(er(e,r)):r instanceof Uint8Array&&i.push(H(e,Array.from(r))))}},er=(i,t)=>{let e=J.encode(t);return H(i,[K(e.length),K(nf("und")),Array.from(e)])},Wm={"image/jpeg":13,"image/png":14,"image/bmp":27},tf=(i,t)=>{let e=[];for(let{key:r,value:n}of xt(i))switch(r){case"title":e.push({key:t?"title":"\xA9nam",value:Ot(n)});break;case"description":e.push({key:t?"description":"\xA9des",value:Ot(n)});break;case"artist":e.push({key:t?"artist":"\xA9ART",value:Ot(n)});break;case"album":e.push({key:t?"album":"\xA9alb",value:Ot(n)});break;case"albumArtist":e.push({key:t?"album_artist":"aART",value:Ot(n)});break;case"comment":e.push({key:t?"comment":"\xA9cmt",value:Ot(n)});break;case"genre":e.push({key:t?"genre":"\xA9gen",value:Ot(n)});break;case"lyrics":e.push({key:t?"lyrics":"\xA9lyr",value:Ot(n)});break;case"date":e.push({key:t?"date":"\xA9day",value:Ot(n.toISOString().slice(0,10))});break;case"images":for(let a of n)a.kind==="coverFront"&&e.push({key:"covr",value:H("data",[F(Wm[a.mimeType]??0),F(0),Array.from(a.data)])});break;case"trackNumber":if(t){let a=i.tracksTotal!==void 0?`${n}/${i.tracksTotal}`:n.toString();e.push({key:"track",value:Ot(a)})}else e.push({key:"trkn",value:H("data",[F(0),F(0),K(0),K(n),K(i.tracksTotal??0),K(0)])});break;case"discNumber":t||e.push({key:"disc",value:H("data",[F(0),F(0),K(0),K(n),K(i.discsTotal??0),K(0)])});break;case"tracksTotal":case"discsTotal":break;case"raw":break;default:ie(r)}if(i.raw)for(let r in i.raw){let n=i.raw[r];n==null||!t&&r.length!==4||e.some(a=>a.key===r)||(typeof n=="string"?e.push({key:r,value:Ot(n)}):n instanceof Uint8Array?e.push({key:r,value:H("data",[F(0),F(0),Array.from(n)])}):n instanceof lt&&e.push({key:r,value:H("data",[F(Wm[n.mimeType]??0),F(0),Array.from(n.data)])}))}return e},Gh=i=>{let t=tf(i,!1);return t.length===0?null:re("meta",0,0,void 0,[Xu(!1,"mdir","","appl"),H("ilst",void 0,t.map(e=>H(e.key,void 0,[e.value])))])},jh=i=>{let t=tf(i,!0);return t.length===0?null:H("meta",void 0,[Xu(!1,"mdta",""),re("keys",0,0,[F(t.length)],t.map(e=>H("mdta",[...J.encode(e.key)]))),H("ilst",void 0,t.map((e,r)=>{let n=String.fromCharCode(...F(r+1));return H(n,void 0,[e.value])}))])},Ot=i=>H("data",[F(1),F(0),...J.encode(i)]),Xh=(i,t)=>{switch(i){case"avc":return t.startsWith("avc3")?"avc3":"avc1";case"hevc":return"hvc1";case"vp8":return"vp08";case"vp9":return"vp09";case"av1":return"av01";case"prores":return t}},$h={avc:gh,hevc:bh,vp8:Lm,vp9:Lm,av1:yh,prores:null},rf=(i,t,e)=>{switch(i){case"aac":return"mp4a";case"mp3":return"mp4a";case"opus":return"Opus";case"vorbis":return"mp4a";case"flac":return"fLaC";case"ulaw":return"ulaw";case"alaw":return"alaw";case"pcm-u8":return"raw ";case"pcm-s8":return"sowt";case"ac3":return"ac-3";case"eac3":return"ec-3";case"dts":return t}if(e)switch(i){case"pcm-s16":return"sowt";case"pcm-s16be":return"twos";case"pcm-s24":return"in24";case"pcm-s24be":return"in24";case"pcm-s32":return"in32";case"pcm-s32be":return"in32";case"pcm-f32":return"fl32";case"pcm-f32be":return"fl32";case"pcm-f64":return"fl64";case"pcm-f64be":return"fl64"}else switch(i){case"pcm-s16":return"ipcm";case"pcm-s16be":return"ipcm";case"pcm-s24":return"ipcm";case"pcm-s24be":return"ipcm";case"pcm-s32":return"ipcm";case"pcm-s32be":return"ipcm";case"pcm-f32":return"fpcm";case"pcm-f32be":return"fpcm";case"pcm-f64":return"fpcm";case"pcm-f64be":return"fpcm"}},Yh=(i,t)=>{switch(i){case"aac":return Ku;case"mp3":return Ku;case"opus":return Sh;case"vorbis":return Ku;case"flac":return Ah;case"ac3":return xh;case"eac3":return Ch;case"dts":return Ph}if(t)switch(i){case"pcm-s24":return ai;case"pcm-s24be":return ai;case"pcm-s32":return ai;case"pcm-s32be":return ai;case"pcm-f32":return ai;case"pcm-f32be":return ai;case"pcm-f64":return ai;case"pcm-f64be":return ai}else switch(i){case"pcm-s16":return Jt;case"pcm-s16be":return Jt;case"pcm-s24":return Jt;case"pcm-s24be":return Jt;case"pcm-s32":return Jt;case"pcm-s32be":return Jt;case"pcm-f32":return Jt;case"pcm-f32be":return Jt;case"pcm-f64":return Jt;case"pcm-f64be":return Jt}return null},Zh={webvtt:"wvtt"},Jh={webvtt:Eh},nf=i=>{g(i.length===3);let t=0;for(let e=0;e<3;e++)t<<=5,t+=i.charCodeAt(e)-96;return t};var rr=class{constructor(t,e){this.finalized=!1;this.started=!1;this.pos=0;this.trackedWrites=null;this.trackedStart=-1;this.trackedEnd=-1;if(t._writerAcquired)throw new Error("Can't have multiple Writers for the same Target.");this.target=t,t._setMonotonicity(e),t._writerAcquired=!0}start(){g(!this.started),this.target._start(),this.started=!0}write(t){g(this.started&&!this.finalized),this.maybeTrackWrites(t),this.target._write(t,this.pos),this.pos+=t.byteLength}seek(t){this.pos=t}getPos(){return this.pos}async flush(){return g(this.started&&!this.finalized),this.target._flush()}async finalize(){g(this.started&&!this.finalized),await this.target._finalize(),this.finalized=!0}maybeTrackWrites(t){if(!this.trackedWrites)return;let e=this.getPos();if(e<this.trackedStart){if(e+t.byteLength<=this.trackedStart)return;t=t.subarray(this.trackedStart-e),e=0}let r=e+t.byteLength-this.trackedStart,n=this.trackedWrites.byteLength;for(;n<r;)n*=2;if(n!==this.trackedWrites.byteLength){let a=new Uint8Array(n);a.set(this.trackedWrites,0),this.trackedWrites=a}this.trackedWrites.set(t,e-this.trackedStart),this.trackedEnd=Math.max(this.trackedEnd,e+t.byteLength)}startTrackingWrites(){this.trackedWrites=new Uint8Array(2**10),this.trackedStart=this.getPos(),this.trackedEnd=this.trackedStart}stopTrackingWrites(){if(!this.trackedWrites)throw new Error("Internal error: Can't get tracked writes since nothing was tracked.");let e={data:this.trackedWrites.subarray(0,this.trackedEnd-this.trackedStart),start:this.trackedStart,end:this.trackedEnd};return this.trackedWrites=null,e}};var sf=dl(hu(),1);var of=typeof sf<"u"?sf:void 0,Fe=class extends Ge{constructor(){super(...arguments);this._writerAcquired=!1;this._monotonicity=null;this.onwrite=null}_setMonotonicity(e){this._monotonicity!==!1&&(this._monotonicity=e)}_dispatchWrite(e,r){this.onwrite?.(e,r),this._emit("write",{start:e,end:r})}slice(e){if(!Number.isInteger(e)||e<0)throw new TypeError("offset must be a non-negative integer.");return new Ba(this,e)}},Yu=2**16,Zu=2**32,si=class extends Fe{constructor(e={}){super();this.buffer=null;this._maxPos=0;if(!e||typeof e!="object")throw new TypeError("BufferTarget options, when provided, must be an object.");if(e.onFinalize!==void 0&&typeof e.onFinalize!="function")throw new TypeError("options.onFinalize, when provided, must be a function.");if(this._options=e,this._supportsResize="resize"in new ArrayBuffer(0),this._supportsResize)try{this._buffer=new ArrayBuffer(Yu,{maxByteLength:Zu})}catch{this._buffer=new ArrayBuffer(Yu),this._supportsResize=!1}else this._buffer=new ArrayBuffer(Yu);this._bytes=new Uint8Array(this._buffer)}_ensureSize(e){let r=this._buffer.byteLength;for(;r<e;)r*=2;if(r!==this._buffer.byteLength){if(r>Zu)throw new Error(`ArrayBuffer exceeded maximum size of ${Zu} bytes. Please consider using another target.`);if(this._supportsResize)this._buffer.resize(r);else{let n=new ArrayBuffer(r),a=new Uint8Array(n);a.set(this._bytes,0),this._buffer=n,this._bytes=a}}}_start(){}_write(e,r){this._ensureSize(r+e.byteLength),this._bytes.set(e,r),this._maxPos=Math.max(this._maxPos,r+e.byteLength),this._dispatchWrite(r,r+e.byteLength)}async _flush(){}async _finalize(){this.buffer=this._buffer.slice(0,this._maxPos),this._options.onFinalize&&await this._options.onFinalize(this.buffer),this._emit("finalized")}async _close(){}_getSlice(e,r){return this._bytes.slice(e,r)}},eg=2**24,tg=2,xn=class extends Fe{constructor(e,r={}){super();this._sections=[];this._lastWriteEnd=0;this._lastFlushEnd=0;this._streamWriter=null;this._writeError=null;this._chunks=[];if(!(e instanceof WritableStream))throw new TypeError("StreamTarget requires a WritableStream instance.");if(r!=null&&typeof r!="object")throw new TypeError("StreamTarget options, when provided, must be an object.");if(r.chunked!==void 0&&typeof r.chunked!="boolean")throw new TypeError("options.chunked, when provided, must be a boolean.");if(r.chunkSize!==void 0&&(!Number.isInteger(r.chunkSize)||r.chunkSize<1024))throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.");this._writable=e,this._options=r,this._chunked=r.chunked??!1,this._chunkSize=r.chunkSize??eg}_start(){this._streamWriter=this._writable.getWriter()}_write(e,r){if(r>this._lastWriteEnd){let n=r-this._lastWriteEnd;this._write(new Uint8Array(n),this._lastWriteEnd)}this._sections.push({data:e.slice(),start:r}),this._lastWriteEnd=Math.max(this._lastWriteEnd,r+e.byteLength),this._dispatchWrite(r,r+e.byteLength)}async _flush(){if(this._writeError!==null)throw this._writeError;if(g(this._streamWriter),this._sections.length===0)return;let e=[],r=[...this._sections].sort((n,a)=>n.start-a.start);e.push({start:r[0].start,size:r[0].data.byteLength});for(let n=1;n<r.length;n++){let a=e[e.length-1],s=r[n];s.start<=a.start+a.size?a.size=Math.max(a.size,s.start+s.data.byteLength-a.start):e.push({start:s.start,size:s.data.byteLength})}for(let n of e){n.data=new Uint8Array(n.size);for(let a of this._sections)n.start<=a.start&&a.start<n.start+n.size&&n.data.set(a.data,a.start-n.start);if(this._streamWriter.desiredSize!==null&&this._streamWriter.desiredSize<=0&&await this._streamWriter.ready,this._chunked)this._writeDataIntoChunks(n.data,n.start),this._tryToFlushChunks();else{if(this._monotonicity===!0&&n.start!==this._lastFlushEnd)throw new Error("Internal error: Monotonicity violation.");this._streamWriter.write({type:"write",data:n.data,position:n.start}).catch(a=>{this._writeError??=a}),this._lastFlushEnd=n.start+n.data.byteLength}}this._sections.length=0}_writeDataIntoChunks(e,r){let n=this._chunks.findIndex(u=>u.start<=r&&r<u.start+this._chunkSize);n===-1&&(n=this._createChunk(r));let a=this._chunks[n],s=r-a.start,o=e.subarray(0,Math.min(this._chunkSize-s,e.byteLength));a.data.set(o,s);let c={start:s,end:s+o.byteLength};if(this._insertSectionIntoChunk(a,c),a.written[0].start===0&&a.written[0].end===this._chunkSize&&(a.shouldFlush=!0),this._chunks.length>tg){for(let u=0;u<this._chunks.length-1;u++)this._chunks[u].shouldFlush=!0;this._tryToFlushChunks()}o.byteLength<e.byteLength&&this._writeDataIntoChunks(e.subarray(o.byteLength),r+o.byteLength)}_insertSectionIntoChunk(e,r){let n=0,a=e.written.length-1,s=-1;for(;n<=a;){let o=Math.floor(n+(a-n+1)/2);e.written[o].start<=r.start?(n=o+1,s=o):a=o-1}for(e.written.splice(s+1,0,r),(s===-1||e.written[s].end<r.start)&&s++;s<e.written.length-1&&e.written[s].end>=e.written[s+1].start;)e.written[s].end=Math.max(e.written[s].end,e.written[s+1].end),e.written.splice(s+1,1)}_createChunk(e){let n={start:Math.floor(e/this._chunkSize)*this._chunkSize,data:new Uint8Array(this._chunkSize),written:[],shouldFlush:!1};return this._chunks.push(n),this._chunks.sort((a,s)=>a.start-s.start),this._chunks.indexOf(n)}_tryToFlushChunks(e=!1){g(this._streamWriter);for(let r=0;r<this._chunks.length;r++){let n=this._chunks[r];if(!(!n.shouldFlush&&!e)){for(let a of n.written){let s=n.start+a.start;if(this._monotonicity===!0&&s!==this._lastFlushEnd)throw new Error("Internal error: Monotonicity violation.");let o=a.start!==0||a.end!==n.data.byteLength,c;o&&Wt()?c=n.data.slice(a.start,a.end):c=n.data.subarray(a.start,a.end),this._streamWriter.write({type:"write",data:c,position:s}).catch(u=>{this._writeError??=u}),this._lastFlushEnd=n.start+a.end}this._chunks.splice(r--,1)}}}async _finalize(){if(this._chunked&&this._tryToFlushChunks(!0),this._writeError!==null)throw this._writeError;g(this._streamWriter),await this._streamWriter.ready,await this._streamWriter.close(),this._emit("finalized")}async _close(){return this._streamWriter?.close()}},Wo=class extends Fe{constructor(e){super();this._writer=null;this._nextWritePos=0;this._writable=e,this._streamTarget=new xn(new WritableStream({start:()=>{this._writer=this._writable.getWriter()},write:r=>{if(this._monotonicity!==!0)throw new Error("AppendOnlyStreamTarget requires that data be written monotonically (always appended to the end). You must use a format that guarantees this behavior.");return g(r.position===this._nextWritePos),this._nextWritePos+=r.data.byteLength,g(this._writer),this._writer.write(r.data)},close:()=>this._writer?.close()}))}_start(){this._streamTarget._start()}_write(e,r){this._streamTarget._write(e,r)}_flush(){return this._streamTarget._flush()}_finalize(){return this._streamTarget._finalize()}_close(){return this._streamTarget._close()}_setMonotonicity(e){super._setMonotonicity(e),this._streamTarget._setMonotonicity(e)}},Ho=class extends Fe{constructor(e,r={}){if(typeof e!="string")throw new TypeError("filePath must be a string.");if(!r||typeof r!="object")throw new TypeError("options must be an object.");if(!of.fs)throw new Error("FilePathTarget is only available in server-side environments (Node.js, Bun, Deno).");super();this._fileHandle=null;let n=new WritableStream({start:async()=>{this._fileHandle=await of.fs.open(e,"w")},write:async a=>{g(this._fileHandle),await this._fileHandle.write(a.data,0,a.data.byteLength,a.position)},close:async()=>{this._fileHandle&&(await this._fileHandle.close(),this._fileHandle=null)}});this._streamTarget=new xn(n,{chunked:!0,...r})}_start(){this._streamTarget._start()}_write(e,r){this._streamTarget._write(e,r),this._dispatchWrite(r,r+e.byteLength)}async _flush(){return this._streamTarget._flush()}async _finalize(){await this._streamTarget._finalize(),this._emit("finalized")}async _close(){return this._streamTarget._close()}_setMonotonicity(e){super._setMonotonicity(e),this._streamTarget._setMonotonicity(e)}},oi=class extends Fe{_start(){}_write(t,e){this._dispatchWrite(e,e+t.byteLength)}async _flush(){}async _finalize(){this._emit("finalized")}async _close(){}},Ba=class extends Fe{constructor(t,e){super(),this._baseTarget=t,this._offset=e}_start(){}_write(t,e){this._baseTarget._write(t,this._offset+e),this._dispatchWrite(e,e+t.byteLength)}_flush(){return this._baseTarget._flush()}async _finalize(){this._emit("finalized")}async _close(){}_setMonotonicity(t){super._setMonotonicity(t),this._baseTarget._setMonotonicity(t)}},it=class{constructor(t,e){this.rootPath=t;this.getTarget=e;if(typeof t!="string")throw new TypeError("rootPath must be a string.");if(typeof e!="function")throw new TypeError("getTarget must be a function.")}};var rt=57600,rg=2082844800,af=i=>{let t={},e=i.track;return e.metadata.name!==void 0&&(t.name=e.metadata.name),t},me=(i,t,e=!0)=>{let r=i*t;return e?Math.round(r):r},qo=class extends ve{constructor(e,r){super(e);this.writer=null;this.boxWriter=null;this.initWriter=null;this.initBoxWriter=null;this.auxTarget=new si;this.auxWriter=new rr(this.auxTarget,!1);this.auxBoxWriter=new Ei(this.auxWriter);this.mdat=null;this.ftypSize=null;this.trackDatas=[];this.allTracksKnown=te();this.creationTime=Math.floor(Date.now()/1e3)+rg;this.finalizedChunks=[];this.wroteFragmentedHeader=!1;this.nextFragmentNumber=1;this.maxWrittenTimestamp=-1/0;this.minWrittenTimestamp=1/0;this.maxWrittenEndTimestamp=-1/0;this.segmentHeaderSize=null;this.format=r,this.formatOptions={...r._options},this.isQuickTime=r instanceof _i,this.isCmaf=r instanceof vi,this.minimumFragmentDuration=this.formatOptions.minimumFragmentDuration??(r instanceof vi?1/0:1),this.auxWriter.start()}async start(){let e=await this.mutex.acquire();if(this.isCmaf?(this.fastStart="fragmented",this.isFragmented=!0):(this.writer=await this.output._getRootWriter(n=>this.formatOptions.fastStart!==void 0?this.formatOptions.fastStart==="fragmented":n instanceof si),this.boxWriter=new Ei(this.writer),this.fastStart=this.formatOptions.fastStart??(this.writer.target instanceof si?"in-memory":!1),this.isFragmented=this.fastStart==="fragmented"),this.isCmaf){if(!this.output._hasInitTarget())throw new Error("CMAF outputs require the initTarget field in OutputOptions to be set; the init segment will be written to it.");let n=await this.output._getInitTarget(),a=new rr(n,!0);a.start(),this.initWriter=a,this.initBoxWriter=new Ei(a)}let r=this.output.tracks.some(n=>n.isVideoTrack()&&n.source._codec==="avc");{let n=this.initBoxWriter??this.boxWriter;if(g(n),this.formatOptions.onFtyp&&n.writer.startTrackingWrites(),n.writeBox(jm({isQuickTime:this.isQuickTime,holdsAvc:r,fragmented:this.isFragmented,cmaf:this.isCmaf})),this.formatOptions.onFtyp){let{data:a,start:s}=n.writer.stopTrackingWrites();this.formatOptions.onFtyp(a,s)}this.ftypSize=n.writer.getPos(),this.isCmaf&&await this.initWriter.flush()}if(this.fastStart!=="in-memory")if(this.fastStart==="reserve"){for(let n of this.output.tracks)if(n.metadata.maximumPacketCount===void 0)throw new Error("All tracks must specify maximumPacketCount in their metadata when using fastStart: 'reserve'.")}else this.isFragmented||(g(this.writer),g(this.boxWriter),this.formatOptions.onMdat&&this.writer.startTrackingWrites(),this.mdat=Ma(!0),this.boxWriter.writeBox(this.mdat));await this.writer?.flush();for(let n of this.output.tracks)n.isVideoTrack()&&n.metadata.decoderConfig?this.getVideoTrackData(n,n.metadata.primingPacket??null,{decoderConfig:n.metadata.decoderConfig}):n.isAudioTrack()&&n.metadata.decoderConfig&&this.getAudioTrackData(n,n.metadata.primingPacket??null,{decoderConfig:n.metadata.decoderConfig});e()}allTracksAreKnown(){for(let e of this.output.tracks)if(!e.source._closed&&!this.trackDatas.some(r=>r.track===e))return!1;return!0}async getMimeType(){await this.allTracksKnown.promise;let e=this.trackDatas.map(r=>r.type==="video"||r.type==="audio"?r.info.decoderConfig.codec:{webvtt:"wvtt"}[r.track.source._codec]);return As({isQuickTime:this.isQuickTime,hasVideo:this.trackDatas.some(r=>r.type==="video"),hasAudio:this.trackDatas.some(r=>r.type==="audio"),codecStrings:e})}getVideoTrackData(e,r,n){let a=this.trackDatas.find(p=>p.track===e);if(a)return a;jt(n,e.source._codec),g(n),g(n.decoderConfig);let s={...n.decoderConfig};g(s.codedWidth!==void 0),g(s.codedHeight!==void 0);let o=!1;if(e.source._codec==="avc"&&!s.description){if(!r)throw new Error("No AVC description provided; you must therefore provide a priming packet.");let p=Br(r.data);if(!p)throw new Error("Couldn't extract an AVCDecoderConfigurationRecord from the AVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.264) when not providing a description, or provide a description (must be an AVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in AVCC format.");s.description=is(p),o=!0}else if(e.source._codec==="hevc"&&!s.description){if(!r)throw new Error("No HEVC description provided; you must therefore provide a priming packet.");let p=Dr(r.data);if(!p)throw new Error("Couldn't extract an HEVCDecoderConfigurationRecord from the HEVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.265) when not providing a description, or provide a description (must be an HEVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in HEVC format.");s.description=Nl(p),o=!0}let c=xl(1/(e.metadata.frameRate??rt),1e6).den,u=s.displayAspectWidth,l=s.displayAspectHeight,m=u===void 0||l===void 0?{num:1,den:1}:Ht({num:u*s.codedHeight,den:l*s.codedWidth}),d=s.codec==="ap4h"||s.codec==="ap4x",f={muxer:this,track:e,type:"video",info:{width:s.codedWidth,height:s.codedHeight,pixelAspectRatio:m,decoderConfig:s,requiresAnnexBTransformation:o,hasAlphaChannel:d},timescale:c,samples:[],sampleQueue:[],timestampProcessingQueue:[],timeToSampleTable:[],compositionTimeOffsetTable:[],lastTimescaleUnits:null,lastSample:null,startTimestampOffset:null,finalizedChunks:[],currentChunk:null,compactlyCodedChunkTable:[],closed:!1};return this.trackDatas.push(f),this.trackDatas.sort((p,b)=>p.track.id-b.track.id),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),f}getAudioTrackData(e,r,n){let a=this.trackDatas.find(u=>u.track===e);if(a)return a;Pe(n,e.source._codec),g(n),g(n.decoderConfig);let s={...n.decoderConfig},o=!1;if(e.source._codec==="aac"&&!s.description){if(!r)throw new Error("No AAC description provided; you must therefore provide a priming packet.");let u=Ze(Ee.tempFromBytes(r.data));if(!u)throw new Error("Couldn't parse ADTS header from the AAC packet. Make sure the packets are in ADTS format (as specified in ISO 13818-7) when not providing a description, or provide a description (must be an AudioSpecificConfig as specified in ISO 14496-3) and ensure the packets are raw AAC data.");let l=mt[u.samplingFrequencyIndex],m=Kt[u.channelConfiguration];if(l===void 0||m===void 0)throw new Error("Invalid ADTS frame header.");s.description=Hi({objectType:u.objectType,outputSampleRate:l,outputNumberOfChannels:m}),o=!0}if(!r){if(e.source._codec==="ac3"||e.source._codec==="eac3")throw new Error("AC-3/E-AC-3 require a priming packet.");if(e.source._codec==="dts")throw new Error("DTS requires a priming packet.")}let c={muxer:this,track:e,type:"audio",info:{numberOfChannels:n.decoderConfig.numberOfChannels,sampleRate:n.decoderConfig.sampleRate,decoderConfig:s,requiresPcmTransformation:!this.isFragmented&&se.includes(e.source._codec),expectedNextPcmPacketTimestamp:null,requiresAdtsStripping:o,primingPacket:r},timescale:s.sampleRate,samples:[],sampleQueue:[],timestampProcessingQueue:[],timeToSampleTable:[],compositionTimeOffsetTable:[],lastTimescaleUnits:null,lastSample:null,startTimestampOffset:null,finalizedChunks:[],currentChunk:null,compactlyCodedChunkTable:[],closed:!1};return this.trackDatas.push(c),this.trackDatas.sort((u,l)=>u.track.id-l.track.id),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),c}getSubtitleTrackData(e,r){let n=this.trackDatas.find(s=>s.track===e);if(n)return n;ks(r),g(r),g(r.config);let a={muxer:this,track:e,type:"subtitle",info:{config:r.config},timescale:1e3,samples:[],sampleQueue:[],timestampProcessingQueue:[],timeToSampleTable:[],compositionTimeOffsetTable:[],lastTimescaleUnits:null,lastSample:null,startTimestampOffset:null,finalizedChunks:[],currentChunk:null,compactlyCodedChunkTable:[],closed:!1,lastCueEndTimestamp:null,cueQueue:[],nextSourceId:0,cueToSourceId:new WeakMap};return this.trackDatas.push(a),this.trackDatas.sort((s,o)=>s.track.id-o.track.id),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),a}async addEncodedVideoPacket(e,r,n){let a=await this.mutex.acquire();try{let s=this.getVideoTrackData(e,r,n),o=r.data;if(s.info.requiresAnnexBTransformation){let u=[...Mr(o)].map(l=>o.subarray(l.offset,l.offset+l.length));if(u.length===0)throw new Error("Failed to transform packet data. Make sure all packets are provided in Annex B format, as specified in ITU-T-REC-H.264 and ITU-T-REC-H.265.");o=rs(u,4)}this.validateTimestamp(s.track,r.timestamp,r.type==="key");let c=this.createSampleForTrack(s,o,r.timestamp,r.duration,r.type);await this.registerSample(s,c)}finally{a()}}async addEncodedAudioPacket(e,r,n){let a=await this.mutex.acquire();try{let s=this.getAudioTrackData(e,r,n),o=r.data;if(s.info.requiresAdtsStripping){let m=Ze(Ee.tempFromBytes(o));if(!m)throw new Error("Expected ADTS frame, didn't get one.");let d=m.crcCheck===null?Ar:dt;o=o.subarray(d)}this.validateTimestamp(s.track,r.timestamp,r.type==="key");let c=r.timestamp,u=r.duration;if(s.info.requiresPcmTransformation){let d=Re(s.info.decoderConfig.codec).sampleSize*s.info.numberOfChannels;if(u=o.byteLength/d/s.info.sampleRate,s.info.expectedNextPcmPacketTimestamp!==null){let f=c-s.info.expectedNextPcmPacketTimestamp;if(f<.01)c=s.info.expectedNextPcmPacketTimestamp;else{let p=await this.padWithSilence(s,s.info.expectedNextPcmPacketTimestamp,f);c=s.info.expectedNextPcmPacketTimestamp+p}}s.info.expectedNextPcmPacketTimestamp=c+u}let l=this.createSampleForTrack(s,o,c,u,r.type);await this.registerSample(s,l)}finally{a()}}async padWithSilence(e,r,n){let a=me(n,e.timescale);if(n=a/e.timescale,a>0){let{sampleSize:s,silentValue:o}=Re(e.info.decoderConfig.codec),c=a*e.info.numberOfChannels,u=new Uint8Array(s*c).fill(o),l=this.createSampleForTrack(e,new Uint8Array(u.buffer),r,n,"key");await this.registerSample(e,l)}return n}async addSubtitleCue(e,r,n){let a=await this.mutex.acquire();try{let s=this.getSubtitleTrackData(e,n);this.validateTimestamp(s.track,r.timestamp,!0),e.source._codec==="webvtt"&&(s.cueQueue.push(r),await this.processWebVTTCues(s,r.timestamp))}finally{a()}}async processWebVTTCues(e,r){for(;e.cueQueue.length>0;){e.lastCueEndTimestamp??=Math.min(0,e.cueQueue[0].timestamp);let n=new Set([]);for(let l of e.cueQueue)g(l.timestamp<=r),g(e.lastCueEndTimestamp<=l.timestamp+l.duration),n.add(Math.max(l.timestamp,e.lastCueEndTimestamp)),n.add(l.timestamp+l.duration);let a=[...n].sort((l,m)=>l-m),s=a[0],o=a[1]??s;if(r<o)break;if(e.lastCueEndTimestamp<s){this.auxWriter.seek(0);let l=Zm();this.auxBoxWriter.writeBox(l);let m=this.auxTarget._getSlice(0,this.auxWriter.getPos()),d=this.createSampleForTrack(e,m,e.lastCueEndTimestamp,s-e.lastCueEndTimestamp,"key");await this.registerSample(e,d),e.lastCueEndTimestamp=s}this.auxWriter.seek(0);for(let l=0;l<e.cueQueue.length;l++){let m=e.cueQueue[l];if(m.timestamp>=o)break;Sn.lastIndex=0;let d=Sn.test(m.text),f=m.timestamp+m.duration,p=e.cueToSourceId.get(m);if(p===void 0&&o<f&&(p=e.nextSourceId++,e.cueToSourceId.set(m,p)),m.notes){let h=ef(m.notes);this.auxBoxWriter.writeBox(h)}let b=Jm(m.text,d?s:null,m.identifier??null,m.settings??null,p??null);this.auxBoxWriter.writeBox(b),f===o&&e.cueQueue.splice(l--,1)}let c=this.auxTarget._getSlice(0,this.auxWriter.getPos()),u=this.createSampleForTrack(e,c,s,o-s,"key");await this.registerSample(e,u),e.lastCueEndTimestamp=o}}createSampleForTrack(e,r,n,a,s){return{timestamp:n,decodeTimestamp:n,duration:a,data:r,size:r.byteLength,type:s,timescaleUnitsToNextSample:me(a,e.timescale)}}processTimestamps(e,r){if(e.timestampProcessingQueue.length===0)return;if(e.type==="audio"&&e.info.requiresPcmTransformation){g(!this.isFragmented),e.startTimestampOffset??=e.timestampProcessingQueue[0].timestamp;let a=0;for(let s=0;s<e.timestampProcessingQueue.length;s++){let o=e.timestampProcessingQueue[s],c=me(o.duration,e.timescale);a+=c}if(e.timeToSampleTable.length===0)e.timeToSampleTable.push({sampleCount:a,sampleDelta:1});else{let s=ee(e.timeToSampleTable);s.sampleCount+=a}e.timestampProcessingQueue.length=0;return}let n=e.timestampProcessingQueue.map(a=>a.timestamp).sort((a,s)=>a-s);this.isFragmented?e.startTimestampOffset??=Math.min(n[0],0):e.startTimestampOffset??=n[0];for(let a=0;a<e.timestampProcessingQueue.length;a++){let s=e.timestampProcessingQueue[a];s.decodeTimestamp=n[a];let o=me(s.timestamp-s.decodeTimestamp,e.timescale),c=me(s.duration,e.timescale);if(e.lastTimescaleUnits!==null){g(e.lastSample);let u=me(s.decodeTimestamp,e.timescale,!1),l=Math.round(u-e.lastTimescaleUnits);if(g(l>=0),e.lastTimescaleUnits+=l,e.lastSample.timescaleUnitsToNextSample=l,!this.isFragmented){let m=ee(e.timeToSampleTable);if(g(m),m.sampleCount===1){m.sampleDelta=l;let f=e.timeToSampleTable[e.timeToSampleTable.length-2];f&&f.sampleDelta===l&&(f.sampleCount++,e.timeToSampleTable.pop(),m=f)}else m.sampleDelta!==l&&(m.sampleCount--,e.timeToSampleTable.push(m={sampleCount:1,sampleDelta:l}));m.sampleDelta===c?m.sampleCount++:e.timeToSampleTable.push({sampleCount:1,sampleDelta:c});let d=ee(e.compositionTimeOffsetTable);g(d),d.sampleCompositionTimeOffset===o?d.sampleCount++:e.compositionTimeOffsetTable.push({sampleCount:1,sampleCompositionTimeOffset:o})}}else e.lastTimescaleUnits=me(s.decodeTimestamp,e.timescale,!1),this.isFragmented||(e.timeToSampleTable.push({sampleCount:1,sampleDelta:c}),e.compositionTimeOffsetTable.push({sampleCount:1,sampleCompositionTimeOffset:o}));e.lastSample=s}if(e.timestampProcessingQueue.length=0,g(e.lastSample),g(e.lastTimescaleUnits!==null),r!==void 0&&e.lastSample.timescaleUnitsToNextSample===0){g(r.type==="key");let a=me(r.timestamp,e.timescale,!1),s=Math.round(a-e.lastTimescaleUnits);e.lastSample.timescaleUnitsToNextSample=s}}async registerSample(e,r){r.type==="key"&&this.processTimestamps(e,r),e.timestampProcessingQueue.push(r),this.isFragmented?(e.sampleQueue.push(r),await this.interleaveSamples()):this.fastStart==="reserve"?await this.registerSampleFastStartReserve(e,r):await this.addSampleToTrack(e,r)}async addSampleToTrack(e,r){if(!this.isFragmented&&(e.samples.push(r),this.fastStart==="reserve")){let a=e.track.metadata.maximumPacketCount;if(g(a!==void 0),e.samples.length>a)throw new Error(`Track #${e.track.id} has already reached the maximum packet count (${a}). Either add less packets or increase the maximum packet count.`)}let n=!1;if(!e.currentChunk)n=!0;else{e.currentChunk.startTimestamp=Math.min(e.currentChunk.startTimestamp,r.timestamp);let a=r.timestamp-e.currentChunk.startTimestamp;if(this.isFragmented){let s=this.trackDatas.every(o=>{if(e===o)return r.type==="key";let c=o.sampleQueue[0];return c?c.type==="key":o.closed});a>=this.minimumFragmentDuration&&s&&r.timestamp>this.maxWrittenTimestamp&&(n=!0,await this.finalizeFragment())}else n=a>=.5}n&&(e.currentChunk&&await this.finalizeCurrentChunk(e),e.currentChunk={startTimestamp:r.timestamp,samples:[],offset:null,moofOffset:null,trafIndex:null}),g(e.currentChunk),e.currentChunk.samples.push(r),this.isFragmented&&(this.maxWrittenTimestamp=Math.max(this.maxWrittenTimestamp,r.timestamp),this.maxWrittenEndTimestamp=Math.max(this.maxWrittenEndTimestamp,r.timestamp+r.duration),this.minWrittenTimestamp=Math.min(this.minWrittenTimestamp,r.timestamp))}async finalizeCurrentChunk(e){if(g(!this.isFragmented),g(this.writer),!e.currentChunk)return;e.finalizedChunks.push(e.currentChunk),this.finalizedChunks.push(e.currentChunk);let r=e.currentChunk.samples.length;if(e.type==="audio"&&e.info.requiresPcmTransformation&&(r=e.currentChunk.samples.reduce((n,a)=>n+me(a.duration,e.timescale),0)),(e.compactlyCodedChunkTable.length===0||ee(e.compactlyCodedChunkTable).samplesPerChunk!==r)&&e.compactlyCodedChunkTable.push({firstChunk:e.finalizedChunks.length,samplesPerChunk:r}),this.fastStart==="in-memory"){e.currentChunk.offset=0;return}e.currentChunk.offset=this.writer.getPos();for(let n of e.currentChunk.samples)g(n.data),this.writer.write(n.data),n.data=null;await this.writer.flush()}async interleaveSamples(e=!1){if(g(this.isFragmented),!(!e&&!this.allTracksAreKnown()))e:for(;;){let r=null,n=1/0;for(let s of this.trackDatas){if(!e&&s.sampleQueue.length===0&&!s.closed)break e;s.sampleQueue.length>0&&s.sampleQueue[0].timestamp<n&&(r=s,n=s.sampleQueue[0].timestamp)}if(!r)break;let a=r.sampleQueue.shift();await this.addSampleToTrack(r,a)}}async finalizeFragment(e=!this.isCmaf){if(g(this.isFragmented),!this.wroteFragmentedHeader){this.wroteFragmentedHeader=!0;let p=this.initBoxWriter??this.boxWriter;g(p),this.formatOptions.onMoov&&p.writer.startTrackingWrites(),this.ensureOneEnabledTrack();let b=An(this);if(p.writeBox(b),this.formatOptions.onMoov){let{data:h,start:y}=p.writer.stopTrackingWrites();this.formatOptions.onMoov(h,y)}if(this.isCmaf){g(this.initWriter),await this.initWriter.flush(),await this.initWriter.finalize(),this.writer=await this.output._getRootWriter(!0),this.boxWriter=new Ei(this.writer);let h=this.boxWriter.measureBox(Gu()),y=this.boxWriter.measureBox(ju(this,0));this.segmentHeaderSize=h+y,this.writer.seek(this.segmentHeaderSize)}}g(this.writer),g(this.boxWriter);let r=this.trackDatas.filter(p=>p.currentChunk);if(r.length===0){e&&await this.writer.flush();return}let n=this.nextFragmentNumber++,a=$u(n,r),s=this.writer.getPos(),o=s+this.boxWriter.measureBox(a),c=o+It,u=1/0;for(let p=0;p<r.length;p++){let b=r[p];g(b.currentChunk),g(b.startTimestampOffset!==null),b.currentChunk.offset=c,b.currentChunk.moofOffset=s,b.currentChunk.trafIndex=p,b.currentChunk.startTimestamp-=b.startTimestampOffset;for(let h of b.currentChunk.samples)c+=h.size,h.timestamp-=b.startTimestampOffset,h.decodeTimestamp-=b.startTimestampOffset;u=Math.min(u,b.currentChunk.startTimestamp)}let l=c-o,m=l>=2**32;if(m)for(let p of r)p.currentChunk.offset+=gr-It;this.formatOptions.onMoof&&this.writer.startTrackingWrites();let d=$u(n,r);if(this.boxWriter.writeBox(d),this.formatOptions.onMoof){let{data:p,start:b}=this.writer.stopTrackingWrites();this.formatOptions.onMoof(p,b,u)}g(this.writer.getPos()===o),this.formatOptions.onMdat&&this.writer.startTrackingWrites();let f=Ma(m);f.size=l,this.boxWriter.writeBox(f),this.writer.seek(o+(m?gr:It));for(let p of r)for(let b of p.currentChunk.samples)this.writer.write(b.data),b.data=null;if(this.formatOptions.onMdat){let{data:p,start:b}=this.writer.stopTrackingWrites();this.formatOptions.onMdat(p,b)}for(let p of r)p.finalizedChunks.push(p.currentChunk),this.finalizedChunks.push(p.currentChunk),p.currentChunk=null;e&&await this.writer.flush()}async registerSampleFastStartReserve(e,r){this.allTracksAreKnown()?(this.mdat||await this.createFastStartReserveMdat(),await this.addSampleToTrack(e,r)):e.sampleQueue.push(r)}async createFastStartReserveMdat(){g(this.writer),g(this.boxWriter),this.ensureOneEnabledTrack();let e=An(this),n=this.boxWriter.measureBox(e)+this.computeSampleTableSizeUpperBound()+4096;g(this.ftypSize!==null),this.writer.seek(this.ftypSize+n),this.formatOptions.onMdat&&this.writer.startTrackingWrites(),this.mdat=Ma(!0),this.boxWriter.writeBox(this.mdat);for(let a of this.trackDatas){for(let s of a.sampleQueue)await this.addSampleToTrack(a,s);a.sampleQueue.length=0}}computeSampleTableSizeUpperBound(){g(this.fastStart==="reserve");let e=0;for(let r of this.trackDatas){let n=r.track.metadata.maximumPacketCount;g(n!==void 0),e+=8*Math.ceil(2/3*n),e+=4*n,e+=8*Math.ceil(2/3*n),e+=12*Math.ceil(2/3*n),e+=4*n,e+=8*n}return e}async onTrackClose(e){let r=await this.mutex.acquire(),n=this.trackDatas.find(a=>a.track===e);n&&(n.closed=!0,n.type==="subtitle"&&e.source._codec==="webvtt"&&await this.processWebVTTCues(n,1/0),this.processTimestamps(n)),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),this.isFragmented&&await this.interleaveSamples(),r()}ensureOneEnabledTrack(){for(let e of["video","audio","subtitle"]){let r=this.trackDatas.filter(a=>a.type===e);if(r.length===0)continue;if(!r.some(a=>a.track.metadata.disposition?.default!==!1)){let a=r[0];a.track.metadata.disposition={...a.track.metadata.disposition,default:!0}}}}async forceFragmentFinalization(){g(this.isFragmented);let e=await this.mutex.acquire();try{for(let r of this.trackDatas)r.type==="subtitle"&&r.track.source._codec==="webvtt"&&await this.processWebVTTCues(r,1/0),this.processTimestamps(r);await this.interleaveSamples(!0),await this.finalizeFragment()}finally{e()}}async finalize(){let e=await this.mutex.acquire();this.allTracksKnown.resolve(),this.ensureOneEnabledTrack(),!this.mdat&&this.fastStart==="reserve"&&await this.createFastStartReserveMdat();for(let r of this.trackDatas)r.closed=!0,r.type==="subtitle"&&r.track.source._codec==="webvtt"&&await this.processWebVTTCues(r,1/0),this.processTimestamps(r);if(this.isFragmented)await this.interleaveSamples(!0),await this.finalizeFragment(!1);else for(let r of this.trackDatas)if(await this.finalizeCurrentChunk(r),r.startTimestampOffset!==null)for(let n=0;n<r.samples.length;n++){let a=r.samples[n];a.timestamp-=r.startTimestampOffset,a.decodeTimestamp-=r.startTimestampOffset}if(g(this.writer),g(this.boxWriter),this.fastStart==="in-memory"){this.mdat=Ma(!1);let r;for(let a=0;a<2;a++){let s=An(this),o=this.boxWriter.measureBox(s);r=this.boxWriter.measureBox(this.mdat);let c=this.writer.getPos()+o+r;for(let u of this.finalizedChunks){u.offset=c;for(let{data:l}of u.samples)g(l),c+=l.byteLength,r+=l.byteLength}if(c<2**32)break;r>=2**32&&(this.mdat.largeSize=!0)}this.formatOptions.onMoov&&this.writer.startTrackingWrites();let n=An(this);if(this.boxWriter.writeBox(n),this.formatOptions.onMoov){let{data:a,start:s}=this.writer.stopTrackingWrites();this.formatOptions.onMoov(a,s)}this.formatOptions.onMdat&&this.writer.startTrackingWrites(),this.mdat.size=r,this.boxWriter.writeBox(this.mdat);for(let a of this.finalizedChunks)for(let s of a.samples)g(s.data),this.writer.write(s.data),s.data=null;if(this.formatOptions.onMdat){let{data:a,start:s}=this.writer.stopTrackingWrites();this.formatOptions.onMdat(a,s)}}else if(this.isFragmented)if(this.isCmaf){let r=this.segmentHeaderSize!==null?this.writer.getPos()-this.segmentHeaderSize:0;this.writer.seek(0),this.boxWriter.writeBox(Gu()),this.boxWriter.writeBox(ju(this,r))}else{let r=this.writer.getPos(),n=Ym(this.trackDatas);this.boxWriter.writeBox(n);let a=this.writer.getPos()-r;this.writer.seek(this.writer.getPos()-4),this.boxWriter.writeU32(a)}else{g(this.mdat);let r=this.boxWriter.offsets.get(this.mdat);g(r!==void 0);let n=this.writer.getPos()-r;if(this.mdat.size=n,this.mdat.largeSize=n>=2**32,this.boxWriter.patchBox(this.mdat),this.formatOptions.onMdat){let{data:s,start:o}=this.writer.stopTrackingWrites();this.formatOptions.onMdat(s,o)}let a=An(this);if(this.fastStart==="reserve"){g(this.ftypSize!==null),this.writer.seek(this.ftypSize),this.formatOptions.onMoov&&this.writer.startTrackingWrites(),this.boxWriter.writeBox(a);let s=this.boxWriter.offsets.get(this.mdat)-this.writer.getPos();this.boxWriter.writeBox(Xm(s))}else this.formatOptions.onMoov&&this.writer.startTrackingWrites(),this.boxWriter.writeBox(a);if(this.formatOptions.onMoov){let{data:s,start:o}=this.writer.stopTrackingWrites();this.formatOptions.onMoov(s,o)}}e()}};var ig=-(2**15),ng=2**15-1,cf="Mediabunny",uf=6,lf=5,ag={video:1,audio:2,subtitle:17},Ko=class extends ve{constructor(e,r){super(e);this.trackDatas=[];this.allTracksKnown=te();this.segment=null;this.segmentInfo=null;this.seekHead=null;this.tracksElement=null;this.tagsElement=null;this.attachmentsElement=null;this.segmentDuration=null;this.cues=null;this.currentCluster=null;this.currentClusterStartMsTimestamp=null;this.currentClusterMaxMsTimestamp=null;this.trackDatasInCurrentCluster=new Map;this.startTimestamp=1/0;this.endTimestamp=-1/0;this.warnedAboutTooNegativeTimestamp=!1;this.format=r}async start(){let e=await this.mutex.acquire();this.writer=await this.output._getRootWriter(!!this.format._options.appendOnly),this.ebmlWriter=new Ms(this.writer),this.writeEBMLHeader(),this.createSegmentInfo(),this.createCues(),await this.writer.flush();for(let r of this.output.tracks)r.isVideoTrack()&&r.metadata.decoderConfig?this.getVideoTrackData(r,r.metadata.primingPacket??null,{decoderConfig:r.metadata.decoderConfig}):r.isAudioTrack()&&r.metadata.decoderConfig&&this.getAudioTrackData(r,r.metadata.primingPacket??null,{decoderConfig:r.metadata.decoderConfig});e()}writeEBMLHeader(){this.format._options.onEbmlHeader&&this.writer.startTrackingWrites();let e={id:440786851,data:[{id:17030,data:1},{id:17143,data:1},{id:17138,data:4},{id:17139,data:8},{id:17026,data:this.format instanceof ci?"webm":"matroska"},{id:17031,data:2},{id:17029,data:2}]};if(this.ebmlWriter.writeEBML(e),this.format._options.onEbmlHeader){let{data:r,start:n}=this.writer.stopTrackingWrites();this.format._options.onEbmlHeader(r,n)}}maybeCreateSeekHead(e){if(this.format._options.appendOnly)return;let r=new Uint8Array([28,83,187,107]),n=new Uint8Array([21,73,169,102]),a=new Uint8Array([22,84,174,107]),s=new Uint8Array([25,65,164,105]),o=new Uint8Array([18,84,195,103]),c={id:290298740,data:[{id:19899,data:[{id:21419,data:r},{id:21420,size:5,data:e?this.ebmlWriter.offsets.get(this.cues)-this.segmentDataOffset:0}]},{id:19899,data:[{id:21419,data:n},{id:21420,size:5,data:e?this.ebmlWriter.offsets.get(this.segmentInfo)-this.segmentDataOffset:0}]},{id:19899,data:[{id:21419,data:a},{id:21420,size:5,data:e?this.ebmlWriter.offsets.get(this.tracksElement)-this.segmentDataOffset:0}]},this.attachmentsElement?{id:19899,data:[{id:21419,data:s},{id:21420,size:5,data:e?this.ebmlWriter.offsets.get(this.attachmentsElement)-this.segmentDataOffset:0}]}:null,this.tagsElement?{id:19899,data:[{id:21419,data:o},{id:21420,size:5,data:e?this.ebmlWriter.offsets.get(this.tagsElement)-this.segmentDataOffset:0}]}:null]};this.seekHead=c}createSegmentInfo(){let e={id:17545,data:new Ji(0)};this.segmentDuration=e;let r={id:357149030,data:[{id:2807729,data:1e6},{id:19840,data:cf},{id:22337,data:cf},this.format._options.appendOnly?null:e]};this.segmentInfo=r}createTracks(){let e={id:374648427,data:[]};this.tracksElement=e;for(let r of this.trackDatas){let n=Oe[r.track.source._codec];g(n),r.type==="audio"&&r.track.source._codec==="dts"&&(r.info.decoderConfig.codec==="dtse"?n="A_DTS/EXPRESS":r.info.decoderConfig.codec==="dtsl"&&(n="A_DTS/LOSSLESS"));let a=0;if(r.type==="audio"&&r.track.source._codec==="opus"){a=1e6*80;let s=r.info.decoderConfig.description;if(s){let o=Z(s),c=Vr(o);a=Math.round(1e9*(c.preSkip/Pt))}}e.data.push({id:174,data:[{id:215,data:r.track.id},{id:29637,data:r.track.id},{id:131,data:ag[r.type]},r.track.metadata.disposition?.default===!1?{id:136,data:0}:null,r.track.metadata.disposition?.forced?{id:21930,data:1}:null,r.track.metadata.disposition?.hearingImpaired?{id:21931,data:1}:null,r.track.metadata.disposition?.visuallyImpaired?{id:21932,data:1}:null,r.track.metadata.disposition?.original?{id:21934,data:1}:null,r.track.metadata.disposition?.commentary?{id:21935,data:1}:null,{id:156,data:0},{id:2274716,data:r.track.metadata.languageCode??ae},{id:134,data:n},r.codecPrivate?{id:25506,data:Z(r.codecPrivate)}:null,{id:22186,data:0},{id:22203,data:a},r.track.metadata.name!==void 0?{id:21358,data:new Rt(r.track.metadata.name)}:null,r.type==="video"?this.videoSpecificTrackInfo(r):null,r.type==="audio"?this.audioSpecificTrackInfo(r):null,r.type==="subtitle"?this.subtitleSpecificTrackInfo(r):null]})}}videoSpecificTrackInfo(e){let{frameRate:r,rotation:n}=e.track.metadata,a=[r?{id:2352003,data:1e9/r}:null],s=n?kt(-n):0,o=!!e.info.aspectRatio&&e.info.aspectRatio.num*e.info.height!==e.info.aspectRatio.den*e.info.width,c=e.info.decoderConfig.colorSpace,u={id:224,data:[{id:176,data:e.info.width},{id:186,data:e.info.height},o?{id:21680,data:e.info.aspectRatio.num}:null,o?{id:21690,data:e.info.aspectRatio.den}:null,o?{id:21682,data:3}:null,e.info.alphaMode?{id:21440,data:1}:null,Ha(c)?null:{id:21936,data:[{id:21937,data:c?.matrix!=null?At[c.matrix]:2},{id:21946,data:c?.transfer!=null?St[c.transfer]:2},{id:21947,data:c?.primaries!=null?wt[c.primaries]:2},{id:21945,data:c?.fullRange!=null?c.fullRange?2:1:0}]},s?{id:30320,data:[{id:30321,data:0},{id:30325,data:new Zi((s+180)%360-180)}]}:null]};return a.push(u),a}audioSpecificTrackInfo(e){let r=se.includes(e.track.source._codec)?Re(e.track.source._codec):null;return[{id:225,data:[{id:181,data:new Zi(e.info.sampleRate)},{id:159,data:e.info.numberOfChannels},r?{id:25188,data:8*r.sampleSize}:null]}]}subtitleSpecificTrackInfo(e){return[]}maybeCreateTags(){let e=[],r=(s,o)=>{e.push({id:26568,data:[{id:17827,data:new Rt(s)},typeof o=="string"?{id:17543,data:new Rt(o)}:{id:17541,data:o}]})},n=this.output._metadataTags,a=new Set;for(let{key:s,value:o}of xt(n))switch(s){case"title":r("TITLE",o),a.add("TITLE");break;case"description":r("DESCRIPTION",o),a.add("DESCRIPTION");break;case"artist":r("ARTIST",o),a.add("ARTIST");break;case"album":r("ALBUM",o),a.add("ALBUM");break;case"albumArtist":r("ALBUM_ARTIST",o),a.add("ALBUM_ARTIST");break;case"genre":r("GENRE",o),a.add("GENRE");break;case"comment":r("COMMENT",o),a.add("COMMENT");break;case"lyrics":r("LYRICS",o),a.add("LYRICS");break;case"date":r("DATE",o.toISOString().slice(0,10)),a.add("DATE");break;case"trackNumber":{let c=n.tracksTotal!==void 0?`${o}/${n.tracksTotal}`:o.toString();r("PART_NUMBER",c),a.add("PART_NUMBER")}break;case"discNumber":{let c=n.discsTotal!==void 0?`${o}/${n.discsTotal}`:o.toString();r("DISC",c),a.add("DISC")}break;case"tracksTotal":case"discsTotal":break;case"images":case"raw":break;default:ie(s)}if(n.raw)for(let s in n.raw){let o=n.raw[s];o==null||a.has(s)||(typeof o=="string"||o instanceof Uint8Array)&&r(s,o)}e.length!==0&&(this.tagsElement={id:307544935,data:[{id:29555,data:[{id:25536,data:[{id:26826,data:50},{id:25546,data:"MOVIE"}]},...e]}]})}maybeCreateAttachments(){let e=this.output._metadataTags,r=[],n=new Set,a=e.images??[];for(let s of a){let o=s.name;o===void 0&&(o=(s.kind==="coverFront"?"cover":s.kind==="coverBack"?"back":"image")+(Cl(s.mimeType)??""));let c;for(;;){c=0n;for(let u=0;u<8;u++)c<<=8n,c|=BigInt(Math.floor(Math.random()*256));if(c!==0n&&!n.has(c))break}n.add(c),r.push({id:24999,data:[s.description!==void 0?{id:18046,data:new Rt(s.description)}:null,{id:18030,data:new Rt(o)},{id:18016,data:s.mimeType},{id:18012,data:s.data},{id:18094,data:c}]})}for(let[s,o]of Object.entries(e.raw??{}))!(o instanceof mr)||!/^\d+$/.test(s)||a.find(u=>u.mimeType===o.mimeType&&ja(u.data,o.data))||r.push({id:24999,data:[o.description!==void 0?{id:18046,data:new Rt(o.description)}:null,{id:18030,data:new Rt(o.name??"")},{id:18016,data:o.mimeType??""},{id:18012,data:o.data},{id:18094,data:BigInt(s)}]});r.length!==0&&(this.attachmentsElement={id:423732329,data:r})}createSegment(){this.createTracks(),this.maybeCreateTags(),this.maybeCreateAttachments(),this.maybeCreateSeekHead(!1);let e={id:408125543,size:this.format._options.appendOnly?-1:uf,data:[this.seekHead,this.segmentInfo,this.tracksElement,this.attachmentsElement,this.tagsElement]};if(this.segment=e,this.format._options.onSegmentHeader&&this.writer.startTrackingWrites(),this.ebmlWriter.writeEBML(e),this.format._options.onSegmentHeader){let{data:r,start:n}=this.writer.stopTrackingWrites();this.format._options.onSegmentHeader(r,n)}}createCues(){this.cues={id:475249515,data:[]}}get segmentDataOffset(){return g(this.segment),this.ebmlWriter.dataOffsets.get(this.segment)}allTracksAreKnown(){for(let e of this.output.tracks)if(!e.source._closed&&!this.trackDatas.some(r=>r.track===e))return!1;return!0}async getMimeType(){await this.allTracksKnown.promise;let e=this.trackDatas.map(r=>r.type==="video"||r.type==="audio"?r.info.decoderConfig.codec:{webvtt:"wvtt"}[r.track.source._codec]);return Vs({isWebM:this.format instanceof ci,hasVideo:this.trackDatas.some(r=>r.type==="video"),hasAudio:this.trackDatas.some(r=>r.type==="audio"),codecStrings:e})}getVideoTrackData(e,r,n){let a=this.trackDatas.find(l=>l.track===e);if(a)return a;jt(n,e.source._codec),g(n),g(n.decoderConfig),g(n.decoderConfig.codedWidth!==void 0),g(n.decoderConfig.codedHeight!==void 0);let s=n.decoderConfig.displayAspectWidth,o=n.decoderConfig.displayAspectHeight,c=s===void 0||o===void 0?null:Ht({num:s,den:o}),u={track:e,type:"video",info:{width:n.decoderConfig.codedWidth,height:n.decoderConfig.codedHeight,aspectRatio:c,decoderConfig:n.decoderConfig,alphaMode:r?!!r.sideData.alpha:null},chunkQueue:[],lastWrittenMsTimestamp:null,codecPrivate:n.decoderConfig.description??null,closed:!1};return e.source._codec==="vp9"?u.codecPrivate=new Uint8Array(id(u.info.decoderConfig.codec)):e.source._codec==="av1"?u.codecPrivate=new Uint8Array(gs(u.info.decoderConfig.codec)):e.source._codec==="prores"&&(u.codecPrivate=J.encode(n.decoderConfig.codec)),this.trackDatas.push(u),this.trackDatas.sort((l,m)=>l.track.id-m.track.id),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),u}getAudioTrackData(e,r,n){let a=this.trackDatas.find(u=>u.track===e);if(a)return a;Pe(n,e.source._codec),g(n),g(n.decoderConfig);let s={...n.decoderConfig},o=!1;if(e.source._codec==="aac"&&!s.description){if(!r)throw new Error("No AAC description provided; you must therefore provide a priming packet.");let u=Ze(Ee.tempFromBytes(r.data));if(!u)throw new Error("Couldn't parse ADTS header from the AAC packet. Make sure the packets are in ADTS format (as specified in ISO 13818-7) when not providing a description, or provide a description (must be an AudioSpecificConfig as specified in ISO 14496-3) and ensure the packets are raw AAC data.");let l=mt[u.samplingFrequencyIndex],m=Kt[u.channelConfiguration];if(l===void 0||m===void 0)throw new Error("Invalid ADTS frame header.");s.description=Hi({objectType:u.objectType,outputSampleRate:l,outputNumberOfChannels:m}),o=!0}let c={track:e,type:"audio",info:{numberOfChannels:n.decoderConfig.numberOfChannels,sampleRate:n.decoderConfig.sampleRate,decoderConfig:s,requiresAdtsStripping:o},chunkQueue:[],lastWrittenMsTimestamp:null,codecPrivate:s.description??null,closed:!1};return this.trackDatas.push(c),this.trackDatas.sort((u,l)=>u.track.id-l.track.id),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),c}getSubtitleTrackData(e,r){let n=this.trackDatas.find(s=>s.track===e);if(n)return n;ks(r),g(r),g(r.config);let a={track:e,type:"subtitle",info:{config:r.config},chunkQueue:[],lastWrittenMsTimestamp:null,codecPrivate:J.encode(r.config.description),closed:!1};return this.trackDatas.push(a),this.trackDatas.sort((s,o)=>s.track.id-o.track.id),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),a}async addEncodedVideoPacket(e,r,n){let a=await this.mutex.acquire();try{let s=this.getVideoTrackData(e,r,n);s.info.alphaMode??=!!r.sideData.alpha;let o=r.data;if(e.source._codec==="prores"){if(o.byteLength<8)throw new Error("ProRes packet too small, expected at least 8 bytes.");o=o.subarray(8)}let c=r.type==="key";this.validateTimestamp(s.track,r.timestamp,c);let u=r.timestamp,l=r.duration;e.metadata.frameRate!==void 0&&(u=Nt(u,e.metadata.frameRate),l=Nt(l,e.metadata.frameRate));let m=s.info.alphaMode?r.sideData.alpha??null:null,d=this.createInternalChunk(o,u,l,r.type,m);e.source._codec==="vp9"&&this.fixVP9ColorSpace(s,d),s.chunkQueue.push(d),await this.interleaveChunks()}finally{a()}}async addEncodedAudioPacket(e,r,n){let a=await this.mutex.acquire();try{let s=this.getAudioTrackData(e,r,n),o=r.data;if(s.info.requiresAdtsStripping){let l=Ze(Ee.tempFromBytes(o));if(!l)throw new Error("Expected ADTS frame, didn't get one.");let m=l.crcCheck===null?Ar:dt;o=o.subarray(m)}let c=r.type==="key";this.validateTimestamp(s.track,r.timestamp,c);let u=this.createInternalChunk(o,r.timestamp,r.duration,r.type);s.chunkQueue.push(u),await this.interleaveChunks()}finally{a()}}async addSubtitleCue(e,r,n){let a=await this.mutex.acquire();try{let s=this.getSubtitleTrackData(e,n);this.validateTimestamp(s.track,r.timestamp,!0);let o=r.text,c=Math.round(r.timestamp*1e3);Sn.lastIndex=0,o=o.replace(Sn,d=>{let p=No(d.slice(1,-1))-c;return`<${Lo(p)}>`});let u=J.encode(o),l=`${r.settings??""}
${r.identifier??""}
${r.notes??""}`,m=this.createInternalChunk(u,r.timestamp,r.duration,"key",l.trim()?J.encode(l):null);s.chunkQueue.push(m),await this.interleaveChunks()}finally{a()}}async interleaveChunks(e=!1){if(!(!e&&!this.allTracksAreKnown())){e:for(;;){let r=null,n=1/0;for(let s of this.trackDatas){if(!e&&s.chunkQueue.length===0&&!s.closed)break e;s.chunkQueue.length>0&&s.chunkQueue[0].timestamp<n&&(r=s,n=s.chunkQueue[0].timestamp)}if(!r)break;let a=r.chunkQueue.shift();this.writeBlock(r,a)}e||await this.writer.flush()}}fixVP9ColorSpace(e,r){if(r.type!=="key"||!e.info.decoderConfig.colorSpace||!e.info.decoderConfig.colorSpace.matrix)return;let n=new q(r.data);n.skipBits(2);let a=n.readBits(1),o=(n.readBits(1)<<1)+a;if(o===3&&n.skipBits(1),n.readBits(1)||n.readBits(1)!==0||(n.skipBits(2),n.readBits(24)!==4817730))return;o>=2&&n.skipBits(1);let m={rgb:7,bt709:2,bt470bg:1,smpte170m:3}[e.info.decoderConfig.colorSpace.matrix];pl(r.data,n.pos,n.pos+3,m)}createInternalChunk(e,r,n,a,s=null){return{data:e,type:a,timestamp:r,duration:n,additions:s}}writeBlock(e,r){this.segment||this.createSegment();let n=Math.round(1e3*r.timestamp),a=this.trackDatas.every(d=>{if(e===d)return r.type==="key";let f=d.chunkQueue[0];return f?f.type==="key":d.closed}),s=!1;if(!this.currentCluster)s=!0;else{g(this.currentClusterStartMsTimestamp!==null),g(this.currentClusterMaxMsTimestamp!==null);let d=n-this.currentClusterStartMsTimestamp;s=a&&n>this.currentClusterMaxMsTimestamp&&d>=1e3*(this.format._options.minimumClusterDuration??1)||d>ng}s&&this.createNewCluster(n);let o=n-this.currentClusterStartMsTimestamp;if(o<ig){if(!this.warnedAboutTooNegativeTimestamp){let d=this.format instanceof ci?"WebM":"Matroska";U._warn(`Packets had to be discarded because their timestamp is too negative to represent in ${d}.`),this.warnedAboutTooNegativeTimestamp=!0}return}let c=new Uint8Array(4),u=new DataView(c.buffer);u.setUint8(0,128|e.track.id),u.setInt16(1,o,!1);let l=Math.round(1e3*r.duration);if(!!r.additions||e.type==="subtitle"){let d={id:160,data:[{id:161,data:[c,r.data]},r.type==="delta"?{id:251,data:new Yn(e.lastWrittenMsTimestamp-n)}:null,r.additions?{id:30113,data:[{id:166,data:[{id:238,data:1},{id:165,data:r.additions}]}]}:null,l>0?{id:155,data:l}:null]};this.ebmlWriter.writeEBML(d)}else{u.setUint8(3,+(r.type==="key")<<7);let d={id:163,data:[c,r.data]};this.ebmlWriter.writeEBML(d)}this.startTimestamp=Math.min(this.startTimestamp,n),this.endTimestamp=Math.max(this.endTimestamp,n+l),e.lastWrittenMsTimestamp=n,this.trackDatasInCurrentCluster.has(e)||this.trackDatasInCurrentCluster.set(e,{firstMsTimestamp:n}),this.currentClusterMaxMsTimestamp=Math.max(this.currentClusterMaxMsTimestamp,n)}createNewCluster(e){e=Math.max(0,e),this.currentCluster&&this.finalizeCurrentCluster(),this.format._options.onCluster&&this.writer.startTrackingWrites(),this.currentCluster={id:524531317,size:this.format._options.appendOnly?-1:lf,data:[{id:231,data:e}]},this.ebmlWriter.writeEBML(this.currentCluster),this.currentClusterStartMsTimestamp=e,this.currentClusterMaxMsTimestamp=e,this.trackDatasInCurrentCluster.clear()}finalizeCurrentCluster(){if(g(this.currentCluster),!this.format._options.appendOnly){let a=this.writer.getPos()-this.ebmlWriter.dataOffsets.get(this.currentCluster),s=this.writer.getPos();this.writer.seek(this.ebmlWriter.offsets.get(this.currentCluster)+4),this.ebmlWriter.writeVarInt(a,lf),this.writer.seek(s)}if(this.format._options.onCluster){g(this.currentClusterStartMsTimestamp!==null);let{data:a,start:s}=this.writer.stopTrackingWrites();this.format._options.onCluster(a,s,this.currentClusterStartMsTimestamp/1e3)}let e=this.ebmlWriter.offsets.get(this.currentCluster)-this.segmentDataOffset,r=new Map;for(let[a,{firstMsTimestamp:s}]of this.trackDatasInCurrentCluster)r.has(s)||r.set(s,[]),r.get(s).push(a);let n=[...r.entries()].sort((a,s)=>a[0]-s[0]);for(let[a,s]of n)g(this.cues),this.cues.data.push({id:187,data:[{id:179,data:Math.max(0,a)},...s.map(o=>({id:183,data:[{id:247,data:o.track.id},{id:241,data:e}]}))]})}async onTrackClose(e){let r=await this.mutex.acquire(),n=this.trackDatas.find(a=>a.track===e);n&&(n.closed=!0),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),await this.interleaveChunks(),r()}async finalize(){let e=await this.mutex.acquire();this.allTracksKnown.resolve();for(let r of this.trackDatas)r.closed=!0;if(this.segment||this.createSegment(),await this.interleaveChunks(!0),this.currentCluster&&this.finalizeCurrentCluster(),g(this.cues),this.ebmlWriter.writeEBML(this.cues),!this.format._options.appendOnly){let r=this.writer.getPos()-this.segmentDataOffset;this.writer.seek(this.ebmlWriter.offsets.get(this.segment)+4),this.ebmlWriter.writeVarInt(r,uf);let n=this.startTimestamp===1/0?0:this.endTimestamp-this.startTimestamp;this.segmentDuration.data=new Ji(n),this.writer.seek(this.ebmlWriter.offsets.get(this.segmentDuration)),this.ebmlWriter.writeEBML(this.segmentDuration),g(this.seekHead),this.writer.seek(this.ebmlWriter.offsets.get(this.seekHead)),this.maybeCreateSeekHead(!0),this.ebmlWriter.writeEBML(this.seekHead)}e()}};var Qo=class{constructor(t){this.writer=t;this.helper=new Uint8Array(8);this.helperView=new DataView(this.helper.buffer)}writeU32(t){this.helperView.setUint32(0,t,!1),this.writer.write(this.helper.subarray(0,4))}writeXingFrame(t){let e=this.writer.getPos(),r=255,n=224|t.mpegVersionId<<3|t.layer<<1,a;t.mpegVersionId&2?a=t.mpegVersionId&1?0:1:a=1;let s=0,o=155,c=-1,u=a*16*4+t.layer*16;for(let h=0;h<16;h++){let y=Ts[u+h];if(ws(a,t.layer,1e3*y,t.sampleRate,s)>=o){c=h;break}}if(c===-1)throw new Error("No suitable bitrate found.");let l=c<<4|t.frequencyIndex<<2|s<<1,m=t.channel<<6|t.modeExtension<<4|t.copyright<<3|t.original<<2|t.emphasis;this.helper[0]=r,this.helper[1]=n,this.helper[2]=l,this.helper[3]=m,this.writer.write(this.helper.subarray(0,4));let d=Nr(t.mpegVersionId,t.channel);this.writer.seek(e+d),this.writeU32(zr);let f=0;t.frameCount!==null&&(f|=1),t.fileSize!==null&&(f|=2),t.toc!==null&&(f|=4),this.writeU32(f),this.writeU32(t.frameCount??0),this.writeU32(t.fileSize??0),this.writer.write(t.toc??new Uint8Array(100));let p=Ts[u+c],b=ws(a,t.layer,1e3*p,t.sampleRate,s);this.writer.write(new Uint8Array(e+b-this.writer.getPos()))}};var Go=class extends ve{constructor(e,r){super(e);this.xingFrameData=null;this.frameCount=0;this.framePositions=[];this.xingFramePos=null;this.format=r}async start(){let e=await this.mutex.acquire();this.writer=await this.output._getRootWriter(this.format._options.xingHeader===!1),this.mp3Writer=new Qo(this.writer),fr(this.output._metadataTags)||new ni(this.writer).writeId3V2Tag(this.output._metadataTags),e()}async getMimeType(){return"audio/mpeg"}async addEncodedVideoPacket(){throw new Error("MP3 does not support video.")}async addEncodedAudioPacket(e,r){let n=await this.mutex.acquire();try{let a=this.format._options.xingHeader!==!1;if(!this.xingFrameData&&a){let s=L(r.data);if(s.byteLength<4)throw new Error("Invalid MP3 header in sample.");let o=s.getUint32(0,!1),c=Lr(o,null).header;if(!c)throw new Error("Invalid MP3 header in sample.");let u=Nr(c.mpegVersionId,c.channel);if(s.byteLength>=u+4){let l=s.getUint32(u,!1);if(l===zr||l===Gi)return}this.xingFrameData={mpegVersionId:c.mpegVersionId,layer:c.layer,frequencyIndex:c.frequencyIndex,sampleRate:c.sampleRate,channel:c.channel,modeExtension:c.modeExtension,copyright:c.copyright,original:c.original,emphasis:c.emphasis,frameCount:null,fileSize:null,toc:null},this.xingFramePos=this.writer.getPos(),this.mp3Writer.writeXingFrame(this.xingFrameData),this.frameCount++}this.validateTimestamp(e,r.timestamp,r.type==="key"),a&&this.framePositions.push(this.writer.getPos()),this.writer.write(r.data),this.frameCount++,await this.writer.flush()}finally{n()}}async addSubtitleCue(){throw new Error("MP3 does not support subtitles.")}async finalize(){let e=await this.mutex.acquire();if(!this.xingFrameData&&this.format._options.xingHeader===!1)throw new Error("Cannot finalize an empty MP3 file: not a single packet was added and the Xing header is disabled, so there's no frame we could write.");if(!this.xingFrameData){let a=this.output.tracks[0];g(a?.isAudioTrack());let s=a.metadata.primingPacket;if(s){let o=L(s.data);if(o.byteLength<4)throw new Error("Invalid MP3 header in priming packet.");let c=o.getUint32(0,!1),u=Lr(c,null).header;if(!u)throw new Error("Invalid MP3 header in priming packet.");this.xingFrameData={mpegVersionId:u.mpegVersionId,layer:u.layer,frequencyIndex:u.frequencyIndex,sampleRate:u.sampleRate,channel:u.channel,modeExtension:u.modeExtension,copyright:u.copyright,original:u.original,emphasis:u.emphasis,frameCount:null,fileSize:null,toc:null}}else if(a.metadata.decoderConfig){let{sampleRate:o,numberOfChannels:c}=a.metadata.decoderConfig,u=[3,2,0],l=null,m=-1;for(let d=0;d<u.length;d++)if(m=Nc.indexOf(o<<d),m!==-1){l=u[d];break}if(l===null)throw new Error(`${o} Hz is not a valid MP3 sample rate.`);this.xingFrameData={mpegVersionId:l,layer:1,frequencyIndex:m,sampleRate:o,channel:c===1?3:0,modeExtension:0,copyright:0,original:0,emphasis:0,frameCount:null,fileSize:null,toc:null}}else throw new Error("Cannot finalize an empty MP3 file: no packets were added and the track specified neither a decoderConfig nor a primingPacket in its metadata, so there's no telling what the file should look like.");this.xingFramePos=this.writer.getPos(),this.mp3Writer.writeXingFrame(this.xingFrameData),this.frameCount++}g(this.xingFramePos!==null);let n=this.writer.getPos()-this.xingFramePos;if(this.writer.seek(this.xingFramePos),this.framePositions.length>0){let a=new Uint8Array(100);for(let s=0;s<100;s++){let o=Math.floor(this.framePositions.length*(s/100)),c=this.framePositions[o]-this.xingFramePos;a[s]=256*(c/n)}this.xingFrameData.toc=a}if(this.xingFrameData.frameCount=this.frameCount,this.xingFrameData.fileSize=n,this.format._options.onXingFrame&&this.writer.startTrackingWrites(),this.mp3Writer.writeXingFrame(this.xingFrameData),this.format._options.onXingFrame){let{data:a,start:s}=this.writer.stopTrackingWrites();this.format._options.onXingFrame(a,s)}e()}};var sg=8192,jo=class extends ve{constructor(e,r){super(e);this.trackDatas=[];this.bosPagesWritten=!1;this.allTracksKnown=te();this.pageBytes=new Uint8Array(qs);this.pageView=new DataView(this.pageBytes.buffer);this.format=r}async start(){let e=await this.mutex.acquire();this.writer=await this.output._getRootWriter(!0);for(let r of this.output.tracks)g(r.isAudioTrack()),r.metadata.decoderConfig&&this.getTrackData(r,{decoderConfig:r.metadata.decoderConfig});e()}async getMimeType(){return await this.allTracksKnown.promise,Hs({codecStrings:this.trackDatas.map(e=>e.codecInfo.codec)})}addEncodedVideoPacket(){throw new Error("Video tracks are not supported.")}getTrackData(e,r){let n=this.trackDatas.find(o=>o.track===e);if(n)return n;let a;do a=Math.floor(2**32*Math.random());while(this.trackDatas.some(o=>o.serialNumber===a));g(e.source._codec==="vorbis"||e.source._codec==="opus"),Pe(r,e.source._codec),g(r),g(r.decoderConfig);let s={track:e,serialNumber:a,internalSampleRate:e.source._codec==="opus"?Pt:r.decoderConfig.sampleRate,codecInfo:{codec:e.source._codec,vorbisInfo:null,opusInfo:null},vorbisLastBlocksize:null,packetQueue:[],currentTimestampInSamples:0,pagesWritten:0,currentGranulePosition:0,currentLacingValues:[],currentPageData:[],currentPageSize:27,currentPageStartsWithFreshPacket:!0,currentPageStartTimestampInSamples:0,closed:!1};return this.queueHeaderPackets(s,r),this.trackDatas.push(s),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),s}queueHeaderPackets(e,r){if(g(r.decoderConfig),e.track.source._codec==="vorbis"){g(r.decoderConfig.description);let n=Z(r.decoderConfig.description);if(n[0]!==2)throw new TypeError("First byte of Vorbis decoder description must be 2.");let a=1,s=()=>{let h=0;for(;;){let y=n[a++];if(y===void 0)throw new TypeError("Vorbis decoder description is too short.");if(h+=y,y<255)return h}},o=s(),c=s();if(n.length-a<=0)throw new TypeError("Vorbis decoder description is too short.");let l=n.subarray(a,a+=o);a+=c;let m=n.subarray(a),d=new Uint8Array(7);d[0]=3,d[1]=118,d[2]=111,d[3]=114,d[4]=98,d[5]=105,d[6]=115;let f=Ln(d,this.output._metadataTags,!0);e.packetQueue.push({data:l,timestampInSamples:0,durationInSamples:0,forcePageFlush:!0},{data:f,timestampInSamples:0,durationInSamples:0,forcePageFlush:!1},{data:m,timestampInSamples:0,durationInSamples:0,forcePageFlush:!0});let b=L(l).getUint8(28);e.codecInfo.vorbisInfo={blocksizes:[1<<(b&15),1<<(b>>4)],modeBlockflags:os(m).modeBlockflags}}else if(e.track.source._codec==="opus"){if(!r.decoderConfig.description)throw new TypeError("For Ogg, Opus decoder description is required.");let n=Z(r.decoderConfig.description),a=new Uint8Array(8),s=L(a);s.setUint32(0,1332770163,!1),s.setUint32(4,1415669619,!1);let o=Ln(a,this.output._metadataTags,!0);e.packetQueue.push({data:n,timestampInSamples:0,durationInSamples:0,forcePageFlush:!0},{data:o,timestampInSamples:0,durationInSamples:0,forcePageFlush:!0}),e.codecInfo.opusInfo={preSkip:Vr(n).preSkip}}}async addEncodedAudioPacket(e,r,n){let a=await this.mutex.acquire();try{let s=this.getTrackData(e,n);this.validateTimestamp(s.track,r.timestamp,r.type==="key");let o=s.currentTimestampInSamples,{durationInSamples:c,vorbisBlockSize:u}=Ws(r.data,s.codecInfo,s.vorbisLastBlocksize);s.currentTimestampInSamples+=c,s.vorbisLastBlocksize=u,s.packetQueue.push({data:r.data,timestampInSamples:o,durationInSamples:c,forcePageFlush:!1}),await this.interleavePages()}finally{a()}}addSubtitleCue(){throw new Error("Subtitle tracks are not supported.")}allTracksAreKnown(){for(let e of this.output.tracks)if(!e.source._closed&&!this.trackDatas.some(r=>r.track===e))return!1;return!0}async interleavePages(e=!1){if(!this.bosPagesWritten){if(!this.allTracksAreKnown()&&!e)return;for(let r of this.trackDatas)for(;r.packetQueue.length>0;){let n=r.packetQueue.shift();if(this.writePacket(r,n,!1),n.forcePageFlush)break}this.bosPagesWritten=!0}e:for(;;){let r=null,n=1/0;for(let o of this.trackDatas){if(!e&&o.packetQueue.length<=1&&!o.closed)break e;o.packetQueue.length>0&&o.packetQueue[0].timestampInSamples<n&&(r=o,n=o.packetQueue[0].timestampInSamples)}if(!r)break;let a=r.packetQueue.shift(),s=r.packetQueue.length===0;this.writePacket(r,a,s)}e||await this.writer.flush()}writePacket(e,r,n){let a=r.timestampInSamples+r.durationInSamples;if(this.format._options.maximumPageDuration!==void 0){let l=this.format._options.maximumPageDuration*e.internalSampleRate;e.currentLacingValues.length>0&&a-e.currentPageStartTimestampInSamples>l&&this.writePage(e,!1)}let s=r.data.length,o=0,c=0;for(;;){e.currentLacingValues.length===0&&o>0&&(e.currentPageStartsWithFreshPacket=!1);let l=Math.min(255,s);e.currentLacingValues.push(l),e.currentPageSize++,c+=l;let m=s<255;if(e.currentLacingValues.length===255){let d=r.data.subarray(o,c);if(o=c,e.currentPageData.push(d),e.currentPageSize+=d.length,this.writePage(e,n&&m),m)return}if(m)break;s-=255}let u=r.data.subarray(o);e.currentPageData.push(u),e.currentPageSize+=u.length,e.currentGranulePosition=a,(e.currentPageSize>=sg||r.forcePageFlush)&&this.writePage(e,n)}writePage(e,r){this.pageView.setUint32(0,ta,!0),this.pageView.setUint8(4,0);let n=0;e.currentPageStartsWithFreshPacket||(n|=1),e.pagesWritten===0&&(n|=2),r&&(n|=4),this.pageView.setUint8(5,n);let a=e.currentLacingValues.every(u=>u===255)?-1:e.currentGranulePosition;wl(this.pageView,6,a,!0),this.pageView.setUint32(14,e.serialNumber,!0),this.pageView.setUint32(18,e.pagesWritten,!0),this.pageView.setUint32(22,0,!0),this.pageView.setUint8(26,e.currentLacingValues.length),this.pageBytes.set(e.currentLacingValues,27);let s=27+e.currentLacingValues.length;for(let u of e.currentPageData)this.pageBytes.set(u,s),s+=u.length;let o=this.pageBytes.subarray(0,s),c=Ls(o);if(this.pageView.setUint32(22,c,!0),e.pagesWritten++,e.currentLacingValues.length=0,e.currentPageData.length=0,e.currentPageSize=27,e.currentPageStartsWithFreshPacket=!0,e.currentPageStartTimestampInSamples=e.currentGranulePosition,this.format._options.onPage&&this.writer.startTrackingWrites(),this.writer.write(o),this.format._options.onPage){let{data:u,start:l}=this.writer.stopTrackingWrites();this.format._options.onPage(u,l,e.track.source)}}async onTrackClose(e){let r=await this.mutex.acquire(),n=this.trackDatas.find(a=>a.track===e);n&&(n.closed=!0),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),await this.interleavePages(),r()}async finalize(){let e=await this.mutex.acquire();this.allTracksKnown.resolve();for(let r of this.trackDatas)r.closed=!0;await this.interleavePages(!0);for(let r of this.trackDatas)r.currentLacingValues.length>0&&this.writePage(r,!0);e()}};var og=0,hf=4096,df=256,cg=224,mf=192,ff=new Uint8Array([9,240]),pf=new Uint8Array([70,1]),Xo=class extends ve{constructor(e,r){super(e);this.trackDatas=[];this.tablesWritten=!1;this.continuityCounters=new Map;this.packetBuffer=new Uint8Array(188);this.packetView=L(this.packetBuffer);this.allTracksKnown=te();this.videoTrackIndex=0;this.audioTrackIndex=0;this.adaptationFieldBuffer=new Uint8Array(184);this.payloadBuffer=new Uint8Array(184);this.format=r}async start(){let e=await this.mutex.acquire();this.writer=await this.output._getRootWriter(!0),e()}async getMimeType(){return await this.allTracksKnown.promise,Zs(this.trackDatas.map(e=>e.codecString))}getVideoTrackData(e,r){let n=this.trackDatas.find(l=>l.track===e);if(n)return n;jt(r,e.source._codec),g(r?.decoderConfig);let a=e.source._codec;g(a==="avc"||a==="hevc");let s=a==="avc"?27:36,o=df+this.trackDatas.length,c=cg+this.videoTrackIndex++,u={track:e,pid:o,streamType:s,streamId:c,codecString:r.decoderConfig.codec,timestampProcessingQueue:[],packetQueue:[],inputIsAnnexB:null,inputIsAdts:null,avcDecoderConfig:null,hevcDecoderConfig:null,adtsHeader:null,adtsHeaderBitstream:null,firstPacketWritten:!1,closed:!1};return this.trackDatas.push(u),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),u}getAudioTrackData(e,r){let n=this.trackDatas.find(l=>l.track===e);if(n)return n;Pe(r,e.source._codec),g(r?.decoderConfig);let a=e.source._codec;g(a==="aac"||a==="mp3"||a==="ac3"||a==="eac3"||a==="dts");let s,o;switch(a){case"aac":s=15,o=mf+this.audioTrackIndex++;break;case"mp3":s=3,o=mf+this.audioTrackIndex++;break;case"ac3":s=129,o=189;break;case"eac3":s=135,o=189;break;case"dts":s=130,o=189;break}let c=df+this.trackDatas.length,u={track:e,pid:c,streamType:s,streamId:o,codecString:r.decoderConfig.codec,timestampProcessingQueue:[],packetQueue:[],inputIsAnnexB:null,inputIsAdts:null,avcDecoderConfig:null,hevcDecoderConfig:null,adtsHeader:null,adtsHeaderBitstream:null,firstPacketWritten:!1,closed:!1};return this.trackDatas.push(u),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),u}async addEncodedVideoPacket(e,r,n){let a=await this.mutex.acquire();try{let s=this.getVideoTrackData(e,n);this.validateTimestamp(s.track,r.timestamp,r.type==="key");let o=this.prepareVideoPacket(s,r,n);r.type==="key"&&await this.flushTimestampQueue(s),s.timestampProcessingQueue.push({data:o,presentationTimestamp:r.timestamp,decodeTimestamp:null,isKeyframe:r.type==="key"})}finally{a()}}async addEncodedAudioPacket(e,r,n){let a=await this.mutex.acquire();try{let s=this.getAudioTrackData(e,n);this.validateTimestamp(s.track,r.timestamp,r.type==="key");let o=this.prepareAudioPacket(s,r,n);r.type==="key"&&await this.flushTimestampQueue(s),s.timestampProcessingQueue.push({data:o,presentationTimestamp:r.timestamp,decodeTimestamp:null,isKeyframe:r.type==="key"})}finally{a()}}async addSubtitleCue(){throw new Error("MPEG-TS does not support subtitles.")}prepareVideoPacket(e,r,n){let a=e.track.source._codec;if(e.inputIsAnnexB===null){let s=n?.decoderConfig?.description;if(e.inputIsAnnexB=!s,!e.inputIsAnnexB){let o=Z(s);a==="avc"?e.avcDecoderConfig=qi(o):e.hevcDecoderConfig=ns(o)}}return e.inputIsAnnexB?this.prepareAnnexBVideoPacket(r.data,a):this.prepareLengthPrefixedVideoPacket(e,r,a)}prepareAnnexBVideoPacket(e,r){let n=[];for(let s of Mr(e)){let o=e.subarray(s.offset,s.offset+s.length);(r==="avc"?Gt(o[0])===9:Ct(o[0])===35)||n.push(o)}let a=r==="avc"?ff:pf;return n.unshift(a),Vn(n)}prepareLengthPrefixedVideoPacket(e,r,n){let a=r.data,s=n==="avc"?e.avcDecoderConfig.lengthSizeMinusOne+1:e.hevcDecoderConfig.lengthSizeMinusOne+1,o=[];for(let u of es(a,s)){let l=a.subarray(u.offset,u.offset+u.length);(n==="avc"?Gt(l[0])===9:Ct(l[0])===35)||o.push(l)}if(r.type==="key")if(n==="avc"){let u=e.avcDecoderConfig;for(let l of u.pictureParameterSets)o.unshift(l);for(let l of u.sequenceParameterSets)o.unshift(l)}else{let u=e.hevcDecoderConfig;for(let l of u.arrays)if(l.nalUnitType===34)for(let m of l.nalUnits)o.unshift(m);for(let l of u.arrays)if(l.nalUnitType===33)for(let m of l.nalUnits)o.unshift(m);for(let l of u.arrays)if(l.nalUnitType===32)for(let m of l.nalUnits)o.unshift(m)}let c=n==="avc"?ff:pf;return o.unshift(c),Vn(o)}prepareAudioPacket(e,r,n){let a=e.track.source._codec;if(a==="mp3"||a==="ac3"||a==="eac3"||a==="dts")return r.data;if(e.inputIsAdts===null){let u=n?.decoderConfig?.description;if(e.inputIsAdts=!u,!e.inputIsAdts){let l=Qt(Z(u)),m=Ya(l);e.adtsHeader=m.header,e.adtsHeaderBitstream=m.bitstream}}if(e.inputIsAdts)return r.data;g(e.adtsHeader),g(e.adtsHeaderBitstream);let s=e.adtsHeader,o=r.data.byteLength+s.byteLength;Za(e.adtsHeaderBitstream,o);let c=new Uint8Array(o);return c.set(s,0),c.set(r.data,s.byteLength),c}allTracksAreKnown(){for(let e of this.output.tracks)if(!e.source._closed&&!this.trackDatas.some(r=>r.track===e))return!1;return!0}async flushTimestampQueue(e,r=!0){if(e.timestampProcessingQueue.length===0)return;let n=e.timestampProcessingQueue.map(a=>a.presentationTimestamp).sort((a,s)=>a-s);for(let a=0;a<e.timestampProcessingQueue.length;a++){let s=e.timestampProcessingQueue[a];s.decodeTimestamp=n[a],e.packetQueue.push(s)}e.timestampProcessingQueue.length=0,r&&await this.interleavePackets()}async interleavePackets(e=!1){if(!this.tablesWritten){if(!this.allTracksAreKnown()&&!e)return;this.writeTables()}e:for(;;){let r=null,n=1/0;for(let s of this.trackDatas){if(!e&&s.packetQueue.length===0&&!s.closed)break e;s.packetQueue.length>0&&s.packetQueue[0].presentationTimestamp<n&&(r=s,n=s.packetQueue[0].presentationTimestamp)}if(!r)break;let a=r.packetQueue.shift();this.writePesPacket(r,a)}e||await this.writer.flush()}writeTables(){g(!this.tablesWritten),this.writePsiSection(og,Ri),this.writePsiSection(hf,lg(this.trackDatas)),this.tablesWritten=!0}writePsiSection(e,r){let n=0,a=!0;for(;n<r.length;){let o=184-(a?1:0),c=r.length-n,u=Math.min(o,c),l;a?(l=this.payloadBuffer.subarray(0,1+u),l[0]=0,l.set(r.subarray(n,n+u),1)):l=r.subarray(n,n+u),this.writeTsPacket(e,a,null,l),n+=u,a=!1}}writePesPacket(e,r){let n=e.track.type==="video",a=n?10:5,s=new Uint8Array(9+a),o=L(s),c=new q(s.subarray(9));di(o,0,1,!1),s[3]=e.streamId;let u=e.track.type==="video"?0:Math.min(8+r.data.length,65535);o.setUint16(4,u,!1),o.setUint8(6,132),o.setUint8(7,n?192:128),o.setUint8(8,a);let l=Math.round(r.presentationTimestamp*9e4),m=xc(l,8589934592);if(c.pos=0,c.writeBits(4,n?3:2),c.writeBits(3,Math.floor(m/2**30)),c.writeBits(1,1),c.writeBits(15,Math.floor(m/2**15)%2**15),c.writeBits(1,1),c.writeBits(15,m%2**15),c.writeBits(1,1),n){g(r.decodeTimestamp!==null);let b=Math.round(r.decodeTimestamp*9e4),h=xc(b,8589934592);c.writeBits(4,1),c.writeBits(3,Math.floor(h/2**30)),c.writeBits(1,1),c.writeBits(15,Math.floor(h/2**15)%2**15),c.writeBits(1,1),c.writeBits(15,h%2**15),c.writeBits(1,1)}let d=s.length+r.data.length,f=0,p=!0;for(;f<d;){let b=p,h=d-f,y=p&&r.isKeyframe,k=p&&!e.firstPacketWritten,T=Math.max(0,184-h),w;y||k?w=Math.max(2,T):w=T;let x=null;if(w>0){let E=this.adaptationFieldBuffer;w===1?E[0]=0:(E[0]=w-1,E[1]=Number(k)<<7|Number(y)<<6,E.fill(255,2,w)),x=E.subarray(0,w)}let C=Math.min(184-w,h),P=this.payloadBuffer.subarray(0,C),A=0;if(f<s.length){let E=Math.min(s.length-f,C);P.set(s.subarray(f,f+E),0),A=E}let S=Math.max(0,f-s.length),I=S+(C-A);A<C&&P.set(r.data.subarray(S,I),A),this.writeTsPacket(e.pid,b,x,P),f+=C,p=!1}e.firstPacketWritten=!0}writeTsPacket(e,r,n,a){let s=this.continuityCounters.get(e)??0,o=a.length>0,c=n?o?3:2:o?1:0;this.packetBuffer[0]=71,this.packetView.setUint16(1,(r?16384:0)|e&8191,!1),this.packetBuffer[3]=c<<4|s&15,o&&this.continuityCounters.set(e,s+1&15);let u=4;n&&(this.packetBuffer.set(n,u),u+=n.length),this.packetBuffer.set(a,u),u+=a.length,u<188&&this.packetBuffer.fill(255,u);let l=this.writer.getPos();this.writer.write(this.packetBuffer),this.format._options.onPacket&&this.format._options.onPacket(this.packetBuffer.slice(),l)}async onTrackClose(e){let r=await this.mutex.acquire(),n=this.trackDatas.find(a=>a.track===e);n&&(n.closed=!0,await this.flushTimestampQueue(n,!1)),this.allTracksAreKnown()&&this.allTracksKnown.resolve(),await this.interleavePackets(),r()}async finalize(){let e=await this.mutex.acquire();this.allTracksKnown.resolve();for(let r of this.trackDatas)r.closed=!0,await this.flushTimestampQueue(r,!1);await this.interleavePackets(!0),e()}},ug=79764919,gf=new Uint32Array(256);for(let i=0;i<256;i++){let t=i<<24;for(let e=0;e<8;e++)t=t&2147483648?t<<1^ug:t<<1;gf[i]=t>>>0&4294967295}var bf=i=>{let t=4294967295;for(let e=0;e<i.length;e++){let r=i[e];t=(t<<8^gf[t>>>24^r])>>>0}return t},Ri=new Uint8Array(16);{let i=L(Ri);Ri[0]=0,i.setUint16(1,45069,!1),i.setUint16(3,1,!1),Ri[5]=193,Ri[6]=0,Ri[7]=0,i.setUint16(8,1,!1),i.setUint16(10,57344|hf&8191,!1),i.setUint32(12,bf(Ri.subarray(0,12)),!1)}var lg=i=>{let t=0;for(let c of i)t+=5,c.streamType===129?t+=Hn.length:c.streamType===135&&(t+=qn.length);let e=9+t+4,r=new Uint8Array(3+e-4),n=L(r);r[0]=2,n.setUint16(1,45056|e&4095,!1),n.setUint16(3,1,!1),r[5]=193,r[6]=0,r[7]=0,n.setUint16(8,65535,!1),n.setUint16(10,61440,!1);let a=12;for(let c of i)r[a++]=c.streamType,n.setUint16(a,57344|c.pid&8191,!1),a+=2,c.streamType===129?(n.setUint16(a,61440|Hn.length,!1),a+=2,r.set(Hn,a),a+=Hn.length):c.streamType===135?(n.setUint16(a,61440|qn.length,!1),a+=2,r.set(qn,a),a+=qn.length):(n.setUint16(a,61440,!1),a+=2);let s=bf(r),o=new Uint8Array(r.length+4);return o.set(r,0),L(o).setUint32(r.length,s,!1),o};var $o=class{constructor(t){this.writer=t;this.helper=new Uint8Array(8);this.helperView=new DataView(this.helper.buffer)}writeU16(t){this.helperView.setUint16(0,t,!0),this.writer.write(this.helper.subarray(0,2))}writeU32(t){this.helperView.setUint32(0,t,!0),this.writer.write(this.helper.subarray(0,4))}writeU64(t){this.helperView.setUint32(0,t,!0),this.helperView.setUint32(4,Math.floor(t/2**32),!0),this.writer.write(this.helper)}writeAscii(t){this.writer.write(new TextEncoder().encode(t))}};var Yo=class extends ve{constructor(e,r){super(e);this.headerWritten=!1;this.dataSize=0;this.sampleRate=null;this.sampleCount=0;this.riffSizePos=null;this.dataSizePos=null;this.ds64RiffSizePos=null;this.ds64DataSizePos=null;this.ds64SampleCountPos=null;this.format=r,this.isRf64=!!r._options.large}async start(){let e=await this.mutex.acquire();this.writer=await this.output._getRootWriter(!1),this.riffWriter=new $o(this.writer);let r=this.output.tracks[0];g(r?.isAudioTrack()),r.metadata.decoderConfig&&(Pe({decoderConfig:r.metadata.decoderConfig},r.source._codec),this.writeHeader(r,r.metadata.decoderConfig),this.sampleRate=r.metadata.decoderConfig.sampleRate,this.headerWritten=!0),e()}async getMimeType(){return"audio/wav"}async addEncodedVideoPacket(){throw new Error("WAVE does not support video.")}async addEncodedAudioPacket(e,r,n){let a=await this.mutex.acquire();try{if(this.headerWritten||(Pe(n,e.source._codec),g(n),g(n.decoderConfig),this.writeHeader(e,n.decoderConfig),this.sampleRate=n.decoderConfig.sampleRate,this.headerWritten=!0),this.validateTimestamp(e,r.timestamp,r.type==="key"),!this.isRf64&&this.writer.getPos()+r.data.byteLength>=2**32)throw new Error("Adding more audio data would exceed the maximum RIFF size of 4 GiB. To write larger files, use RF64 by setting `large: true` in the WavOutputFormatOptions.");this.writer.write(r.data),this.dataSize+=r.data.byteLength,this.sampleCount+=Math.round(r.duration*this.sampleRate),await this.writer.flush()}finally{a()}}async addSubtitleCue(){throw new Error("WAVE does not support subtitles.")}writeHeader(e,r){this.format._options.onHeader&&this.writer.startTrackingWrites();let n,a=e.source._codec,s=Re(a);s.dataType==="ulaw"?n=7:s.dataType==="alaw"?n=6:s.dataType==="float"?n=3:n=1;let o=r.numberOfChannels,c=r.sampleRate,u=s.sampleSize*o;if(this.riffWriter.writeAscii(this.isRf64?"RF64":"RIFF"),this.isRf64?this.riffWriter.writeU32(4294967295):(this.riffSizePos=this.writer.getPos(),this.riffWriter.writeU32(0)),this.riffWriter.writeAscii("WAVE"),this.isRf64&&(this.riffWriter.writeAscii("ds64"),this.riffWriter.writeU32(28),this.ds64RiffSizePos=this.writer.getPos(),this.riffWriter.writeU64(0),this.ds64DataSizePos=this.writer.getPos(),this.riffWriter.writeU64(0),this.ds64SampleCountPos=this.writer.getPos(),this.riffWriter.writeU64(0),this.riffWriter.writeU32(0)),this.riffWriter.writeAscii("fmt "),this.riffWriter.writeU32(16),this.riffWriter.writeU16(n),this.riffWriter.writeU16(o),this.riffWriter.writeU32(c),this.riffWriter.writeU32(c*u),this.riffWriter.writeU16(u),this.riffWriter.writeU16(8*s.sampleSize),!fr(this.output._metadataTags)){let l=this.format._options.metadataFormat??"info";l==="info"?this.writeInfoChunk(this.output._metadataTags):l==="id3"?this.writeId3Chunk(this.output._metadataTags):ie(l)}if(this.riffWriter.writeAscii("data"),this.isRf64?this.riffWriter.writeU32(4294967295):(this.dataSizePos=this.writer.getPos(),this.riffWriter.writeU32(0)),this.format._options.onHeader){let{data:l,start:m}=this.writer.stopTrackingWrites();this.format._options.onHeader(l,m)}}writeInfoChunk(e){let r=this.writer.getPos();this.riffWriter.writeAscii("LIST"),this.riffWriter.writeU32(0),this.riffWriter.writeAscii("INFO");let n=new Set,a=(c,u)=>{if(!Tt(u)){U._warn(`Didn't write tag '${c}' because '${u}' is not ISO 8859-1-compatible.`);return}let l=u.length+1,m=new Uint8Array(l);for(let d=0;d<u.length;d++)m[d]=u.charCodeAt(d);this.riffWriter.writeAscii(c),this.riffWriter.writeU32(l),this.writer.write(m),l&1&&this.writer.write(new Uint8Array(1)),n.add(c)};for(let{key:c,value:u}of xt(e))switch(c){case"title":a("INAM",u),n.add("INAM");break;case"artist":a("IART",u),n.add("IART");break;case"album":a("IPRD",u),n.add("IPRD");break;case"trackNumber":{let l=e.tracksTotal!==void 0?`${u}/${e.tracksTotal}`:u.toString();a("ITRK",l),n.add("ITRK")}break;case"genre":a("IGNR",u),n.add("IGNR");break;case"date":a("ICRD",u.toISOString().slice(0,10)),n.add("ICRD");break;case"comment":a("ICMT",u),n.add("ICMT");break;case"albumArtist":case"discNumber":case"tracksTotal":case"discsTotal":case"description":case"lyrics":case"images":break;case"raw":break;default:ie(c)}if(e.raw)for(let c in e.raw){let u=e.raw[c];u==null||c.length!==4||n.has(c)||typeof u=="string"&&a(c,u)}let s=this.writer.getPos(),o=s-r-8;this.writer.seek(r+4),this.riffWriter.writeU32(o),this.writer.seek(s),o&1&&this.writer.write(new Uint8Array(1))}writeId3Chunk(e){let r=this.writer.getPos();this.riffWriter.writeAscii("ID3 "),this.riffWriter.writeU32(0);let a=new ni(this.writer).writeId3V2Tag(e),s=this.writer.getPos();this.writer.seek(r+4),this.riffWriter.writeU32(a),this.writer.seek(s),a&1&&this.writer.write(new Uint8Array(1))}async finalize(){let e=await this.mutex.acquire();if(!this.headerWritten)throw new Error("Cannot finalize an empty WAVE file: no packets were added and the track specified no decoderConfig in its metadata, so there's no telling what the file should look like.");let r=this.writer.getPos();this.isRf64?(g(this.ds64RiffSizePos!==null),this.writer.seek(this.ds64RiffSizePos),this.riffWriter.writeU64(r-8),g(this.ds64DataSizePos!==null),this.writer.seek(this.ds64DataSizePos),this.riffWriter.writeU64(this.dataSize),g(this.ds64SampleCountPos!==null),this.writer.seek(this.ds64SampleCountPos),this.riffWriter.writeU64(this.sampleCount)):(g(this.riffSizePos!==null),this.writer.seek(this.riffSizePos),this.riffWriter.writeU32(r-8),g(this.dataSizePos!==null),this.writer.seek(this.dataSizePos),this.riffWriter.writeU32(this.dataSize)),e()}};var Zo=class{constructor(t){this.sourceSampleRate=null;this.sourceNumberOfChannels=null;this.startTime=null;this.bufferStartFrame=0;this.maxWrittenFrame=null;this.targetSampleRate=t.targetSampleRate,this.targetNumberOfChannels=t.targetNumberOfChannels,this.onSample=t.onSample,this.bufferSizeInFrames=Math.floor(this.targetSampleRate*5),this.bufferSizeInSamples=this.bufferSizeInFrames*this.targetNumberOfChannels,this.outputBuffer=new Float32Array(this.bufferSizeInSamples)}doChannelMixerSetup(){g(this.sourceNumberOfChannels!==null);let t=this.sourceNumberOfChannels,e=this.targetNumberOfChannels;t===1&&e===2?this.channelMixer=(r,n)=>r[n*t]:t===1&&e===4?this.channelMixer=(r,n,a)=>r[n*t]*+(a<2):t===1&&e===6?this.channelMixer=(r,n,a)=>r[n*t]*+(a===2):t===2&&e===1?this.channelMixer=(r,n)=>{let a=n*t;return .5*(r[a]+r[a+1])}:t===2&&e===4?this.channelMixer=(r,n,a)=>r[n*t+a]*+(a<2):t===2&&e===6?this.channelMixer=(r,n,a)=>r[n*t+a]*+(a<2):t===4&&e===1?this.channelMixer=(r,n)=>{let a=n*t;return .25*(r[a]+r[a+1]+r[a+2]+r[a+3])}:t===4&&e===2?this.channelMixer=(r,n,a)=>{let s=n*t;return .5*(r[s+a]+r[s+a+2])}:t===4&&e===6?this.channelMixer=(r,n,a)=>{let s=n*t;return a<2?r[s+a]:a===2||a===3?0:r[s+a-2]}:t===6&&e===1?this.channelMixer=(r,n)=>{let a=n*t;return Math.SQRT1_2*(r[a]+r[a+1])+r[a+2]+.5*(r[a+4]+r[a+5])}:t===6&&e===2?this.channelMixer=(r,n,a)=>{let s=n*t;return r[s+a]+Math.SQRT1_2*(r[s+2]+r[s+a+4])}:t===6&&e===4?this.channelMixer=(r,n,a)=>{let s=n*t;return a<2?r[s+a]+Math.SQRT1_2*r[s+2]:r[s+a+2]}:this.channelMixer=(r,n,a)=>a<t?r[n*t+a]:0}ensureTempBufferSize(t){let e=this.tempSourceBuffer.length;for(;e<t;)e*=2;if(e!==this.tempSourceBuffer.length){let r=new Float32Array(e);r.set(this.tempSourceBuffer),this.tempSourceBuffer=r}}async add(t){this.sourceSampleRate===null&&(this.sourceSampleRate=t.sampleRate,this.sourceNumberOfChannels=t.numberOfChannels,this.startTime=t.timestamp,this.tempSourceBuffer=new Float32Array(this.sourceSampleRate*this.sourceNumberOfChannels),this.doChannelMixerSetup()),g(this.startTime!==null);let e=t.numberOfFrames*t.numberOfChannels;this.ensureTempBufferSize(e);let r=t.allocationSize({planeIndex:0,format:"f32"}),n=new Float32Array(this.tempSourceBuffer.buffer,0,r/4);t.copyTo(n,{planeIndex:0,format:"f32"});let a=t.timestamp-this.startTime,s=a+t.duration,o=Math.floor((a-1/this.sourceSampleRate)*this.targetSampleRate)+1,c=Math.ceil(s*this.targetSampleRate);for(let u=o;u<c;u++){if(u<this.bufferStartFrame)continue;for(;u>=this.bufferStartFrame+this.bufferSizeInFrames;)await this.finalizeCurrentBuffer(),this.bufferStartFrame+=this.bufferSizeInFrames;let l=u-this.bufferStartFrame;g(l<this.bufferSizeInFrames);let f=(u/this.targetSampleRate-a)*this.sourceSampleRate,p=Math.floor(f),b=Math.ceil(f),h=f-p;for(let y=0;y<this.targetNumberOfChannels;y++){let k=0,T=0;p>=0&&p<t.numberOfFrames&&(k=this.channelMixer(n,p,y)),b>=0&&b<t.numberOfFrames&&(T=this.channelMixer(n,b,y));let w=k+h*(T-k),x=l*this.targetNumberOfChannels+y;this.outputBuffer[x]+=w}this.maxWrittenFrame===null?this.maxWrittenFrame=l:this.maxWrittenFrame=Math.max(this.maxWrittenFrame,l)}}async finalizeCurrentBuffer(){if(this.maxWrittenFrame===null)return;g(this.startTime!==null);let t=(this.maxWrittenFrame+1)*this.targetNumberOfChannels,e=new Float32Array(t);e.set(this.outputBuffer.subarray(0,t));let r=new Ae({format:"f32",sampleRate:this.targetSampleRate,numberOfChannels:this.targetNumberOfChannels,timestamp:this.startTime+this.bufferStartFrame/this.targetSampleRate,data:e});await this.onSample(r),this.outputBuffer.fill(0),this.maxWrittenFrame=null}finalize(){return this.finalizeCurrentBuffer()}};var Fi=class{constructor(){this._connectedTrack=null;this._closingPromise=null;this._closed=!1}_ensureValidAdd(){if(!this._connectedTrack)throw new Error("Source is not connected to an output track.");if(this._connectedTrack.output.state==="canceled")throw new Error("Output has been canceled.");if(this._connectedTrack.output.state==="finalizing"||this._connectedTrack.output.state==="finalized")throw new Error("Output has been finalized.");if(this._connectedTrack.output.state==="pending")throw new Error("Output has not started.");if(this._closed)throw new Error("Source is closed.")}async _start(){}async _flushAndClose(t){}close(){if(this._closingPromise)return;let t=this._connectedTrack;if(!t)throw new Error("Cannot call close without connecting the source to an output track.");if(t.output.state==="pending")throw new Error("Cannot call close before output has been started.");this._closingPromise=(async()=>{await this._flushAndClose(!1),this._closed=!0,!(t.output.state==="finalizing"||t.output.state==="finalized")&&t.output._muxer.onTrackClose(t)})()}async _flushOrWaitForOngoingClose(t){return this._closingPromise??=(async()=>{await this._flushAndClose(t),this._closed=!0})()}},ir=class extends Fi{constructor(e){super();this._connectedTrack=null;if(!ce.includes(e))throw new TypeError(`Invalid video codec '${e}'. Must be one of: ${ce.join(", ")}.`);this._codec=e}},rl=(i,t)=>{if(i.metadata.hasOnlyKeyPackets&&t.type!=="key")throw new Error("Cannot add non-key packets to a hasOnlyKeyPackets video track.")},Ir=class extends ir{constructor(t){super(t)}add(t,e){if(!(t instanceof j))throw new TypeError("packet must be an EncodedPacket.");if(t.isMetadataOnly)throw new TypeError("Metadata-only packets cannot be added.");if(e!==void 0&&(!e||typeof e!="object"))throw new TypeError("meta, when provided, must be an object.");return this._ensureValidAdd(),rl(this._connectedTrack,t),this._connectedTrack.output._muxer.addEncodedVideoPacket(this._connectedTrack,t,e)}},Oa=class{constructor(t,e){this.source=t;this.encodingConfig=e;this.ensureEncoderPromise=null;this.encoderInitialized=!1;this.encoder=null;this.muxer=null;this.lastMultipleOfKeyFrameInterval=-1;this.emittedEncoderPackets=0;this.codedWidth=null;this.codedHeight=null;this.outputWidth=null;this.outputHeight=null;this.frameRateLastSample=null;this.frameRateLastTimestamp=null;this.frameRateLastEndTimestamp=null;this.preciseTimings=[];this.customEncoder=null;this.customEncoderCallSerializer=new vr;this.customEncoderQueueSize=0;this.defaultEncodeOptions={};this.alphaEncoder=null;this.splitter=null;this.splitterCreationFailed=!1;this.alphaFrameQueue=[];this.error=null;this.errorSet=!1;this.lastMuxerPromise=Promise.resolve();this.closed=!1}setError(t){this.errorSet||(this.error=t,this.errorSet=!0)}async add(t,e,r){let n=t;try{this.checkForEncoderError(),this.source._ensureValidAdd();let a=this.encodingConfig,s=a.sizeChangeBehavior??"deny",o=!1;if(this.codedWidth!==null&&this.codedHeight!==null){if((t.codedWidth!==this.codedWidth||t.codedHeight!==this.codedHeight)&&(o=!0,s==="deny"))throw new Error(`Video sample size must remain constant. Expected ${this.codedWidth}x${this.codedHeight}, got ${t.codedWidth}x${t.codedHeight}. To allow the sample size to change over time, set \`sizeChangeBehavior\` to a value other than 'deny' in the encoding options.`)}else this.codedWidth=t.codedWidth,this.codedHeight=t.codedHeight;if(a.transform?.width!==void 0||a.transform?.height!==void 0||a.transform?.rotate!==void 0||a.transform?.crop!==void 0||a.transform?.force===!0||o&&s!=="passThrough"){let m=a.transform?.width,d=a.transform?.height,f=a.transform?.fit??"fill";o&&s!=="passThrough"&&(g(this.outputWidth),g(this.outputHeight),g(s!=="deny"),m=this.outputWidth,d=this.outputHeight,f=s);let p=await t.transform({width:m,height:d,roundDimensionsTo:2,crop:a.transform?.crop,rotate:a.transform?.rotate,fit:f,alpha:a.alpha});(this.outputWidth===null||this.outputHeight===null)&&(this.outputWidth=p.displayWidth,this.outputHeight=p.displayHeight),e&&t.close(),t=p,e=!0}else(this.outputWidth===null||this.outputHeight===null)&&(this.outputWidth=t.codedWidth,this.outputHeight=t.codedHeight);let l=a.transform?.frameRate;if(l!==void 0){let m=t.timestamp+t.duration,d=Cc(t.timestamp,l);if(this.frameRateLastSample!==null)if(d<=this.frameRateLastTimestamp){this.frameRateLastSample.close(),this.frameRateLastSample=t.clone(),this.frameRateLastEndTimestamp=m;return}else await this.padFrameRate(d,r);t===n&&(t=t.clone(),e=!0),t.setTimestamp(d),t.setDuration(1/l),this.frameRateLastSample?.close(),this.frameRateLastSample=t.clone(),this.frameRateLastTimestamp=d,this.frameRateLastEndTimestamp=m}await this.processAndEncode(t,r)}finally{e&&t.close()}}async processAndEncode(t,e){let r=this.encodingConfig,n;if(r.transform?.process){let a=r.transform.process(t);if(v(a)&&(a=await a),a===null)return;Array.isArray(a)||(a=[a]);let s=[];try{for(let o of a)o instanceof We?s.push(o):typeof VideoFrame<"u"&&o instanceof VideoFrame?s.push(new We(o)):s.push(new We(o,{timestamp:t.timestamp,duration:t.duration}))}catch(o){for(let c of s)c!==t&&c.close();for(let c of a)(c instanceof We&&c!==t||typeof VideoFrame<"u"&&c instanceof VideoFrame)&&c.close();throw o}n=s}else n=[t];try{for(let a of n){if(this.encoderInitialized||(this.ensureEncoderPromise||this.ensureEncoder(a),this.encoderInitialized||await this.ensureEncoderPromise),g(this.encoderInitialized),this.closed)break;let s=this.encodingConfig.keyFrameInterval??2,o=Math.floor(a.timestamp/s),c={...this.defaultEncodeOptions,...a.encodeOptions,...e},u={...c,keyFrame:c.keyFrame!==void 0?c.keyFrame:s===0||o!==this.lastMultipleOfKeyFrameInterval};if(this.lastMultipleOfKeyFrameInterval=o,this.encodingConfig.onEncodedSample?.(a),this.customEncoder){this.customEncoderQueueSize++;let l=a.clone(),m=this.customEncoderCallSerializer.call(()=>this.customEncoder.encode(l,u)).catch(d=>this.setError(d)).finally(()=>{this.customEncoderQueueSize--,l.close()});this.customEncoderQueueSize>=4&&await m}else{g(this.encoder);let l=a.toVideoFrame(),m=Q(this.preciseTimings,l.timestamp,f=>f.microsecondTimestamp),d=m!==-1?this.preciseTimings[m]:null;if(d&&d.microsecondTimestamp===l.timestamp?(d.timestamp!==a.timestamp&&(d.timestampIsValid=!1),d.duration!==a.duration&&(d.durationIsValid=!1)):(this.preciseTimings.splice(m+1,0,{microsecondTimestamp:l.timestamp,timestamp:a.timestamp,duration:a.duration,timestampIsValid:!0,durationIsValid:!0}),this.preciseTimings.length>128&&this.preciseTimings.shift()),this.alphaEncoder)if(!!l.format&&!l.format.includes("A")||this.splitterCreationFailed){this.alphaFrameQueue.push(null);try{this.encoder.encode(l,u)}finally{l.close()}}else{this.splitter||(this.splitter=new il);let{colorFrame:p,alphaFrame:b}=await this.splitter.split(l);this.alphaFrameQueue.push(b);try{this.encoder.encode(p,u)}finally{p.close()}}else try{this.encoder.encode(l,u)}finally{l.close()}this.encoder.encodeQueueSize>=4&&await new Promise(f=>this.encoder.addEventListener("dequeue",f,{once:!0}))}await this.lastMuxerPromise}}finally{for(let a of n)a!==t&&a.close()}}async padFrameRate(t,e){let r=this.encodingConfig.transform.frameRate;g(this.frameRateLastSample);let n=Math.round((t-this.frameRateLastTimestamp)*r);for(let u=1;u<n;u++){var a=[];try{let l=at(a,this.frameRateLastSample.clone());l.setTimestamp(this.frameRateLastTimestamp+u/r);l.setDuration(1/r);await this.processAndEncode(l,e)}catch(s){var o=s,c=!0}finally{st(a,o,c)}}}ensureEncoder(t){this.ensureEncoderPromise=(async()=>{let e=Jr(this.encodingConfig.quality,this.encodingConfig.bitrate);g(e!==void 0);let r=_u({...this.encodingConfig,quality:e,width:t.codedWidth,height:t.codedHeight,squarePixelWidth:t.squarePixelWidth,squarePixelHeight:t.squarePixelHeight,framerate:this.source._connectedTrack?.metadata.frameRate}),n=null,a;for(let o of r){let c=o.config;if(this.encodingConfig.onEncoderConfig?.(c),a=hn.find(l=>l.supports(this.encodingConfig.codec,c)),a){n=o;break}if(typeof VideoEncoder>"u")continue;if(c.alpha="discard",this.encodingConfig.alpha==="keep"&&(c.latencyMode="quality"),(c.width%2===1||c.height%2===1)&&(this.encodingConfig.codec==="avc"||this.encodingConfig.codec==="hevc"))throw new Error(`The dimensions ${c.width}x${c.height} are not supported for codec '${this.encodingConfig.codec}'; both width and height must be even numbers. Make sure to round your dimensions to the nearest even number.`);try{if((await VideoEncoder.isConfigSupported(c)).supported){n=o;break}}catch{}}if(!n){if(typeof VideoEncoder>"u")throw new Error(Ni("VideoEncoder"));let o=r[0].config,c=r.map(({config:u,quantizer:l})=>l!==null?`quantizer ${l}`:`${u.bitrate} bps`);throw new Error(`This specific encoder configuration (${o.codec}, ${c.join(" / ")}, ${o.width}x${o.height}, hardware acceleration: ${o.hardwareAcceleration??"no-preference"}) is not supported in this environment. Consider using another codec or changing your video parameters.`)}let s=n.config;if(n.quantizer!==null&&(this.defaultEncodeOptions=Fu(this.encodingConfig.codec,n.quantizer)),a)this.customEncoder=new a,this.customEncoder.codec=this.encodingConfig.codec,this.customEncoder.config=s,this.customEncoder.onPacket=(o,c)=>{if(!(o instanceof j))throw new TypeError("The first argument passed to onPacket must be an EncodedPacket.");if(c!==void 0&&(!c||typeof c!="object"))throw new TypeError("The second argument passed to onPacket must be an object or undefined.");rl(this.source._connectedTrack,o),this.encodingConfig.onEncodedPacket?.(o,c),this.lastMuxerPromise=this.muxer.addEncodedVideoPacket(this.source._connectedTrack,o,c).catch(u=>{this.setError(u)})},this.customEncoder.onError=o=>{this.setError(o)},await this.customEncoder.init();else{let o=[],c=[],u=0,l=0,m=(f,p,b)=>{let h={};if(p){let x=new Uint8Array(p.byteLength);p.copyTo(x),h.alpha=x}let y=j.fromEncodedChunk(f,h),k=Q(this.preciseTimings,f.timestamp,x=>x.microsecondTimestamp),T=k!==-1?this.preciseTimings[k]:null,w=null;this.emittedEncoderPackets===0&&y.type==="delta"&&b?.decoderConfig&&(w=Ur(this.encodingConfig.codec,b.decoderConfig,y.data)),(T&&T.microsecondTimestamp===f.timestamp||w!==null)&&(y=y.clone({timestamp:T?.timestampIsValid?T.timestamp:void 0,duration:T?.durationIsValid?T.duration:void 0,type:w??void 0})),rl(this.source._connectedTrack,y),this.encodingConfig.onEncodedPacket?.(y,b),this.lastMuxerPromise=this.muxer.addEncodedVideoPacket(this.source._connectedTrack,y,b).catch(x=>{this.setError(x)}),this.emittedEncoderPackets++},d=new Error("Encoding error").stack;if(this.encoder=new VideoEncoder({output:(f,p)=>{if(!this.alphaEncoder){m(f,null,p);return}let b=this.alphaFrameQueue.shift();g(b!==void 0),b?(this.alphaEncoder.encode(b,{...this.defaultEncodeOptions,keyFrame:f.type==="key"}),l++,b.close(),o.push({chunk:f,meta:p})):l===0?m(f,null,p):(c.push(u+l),o.push({chunk:f,meta:p}))},error:f=>{f.stack=d,this.setError(f)}}),this.encoder.configure(s),this.encodingConfig.alpha==="keep"){let f=new Error("Encoding error").stack;this.alphaEncoder=new VideoEncoder({output:(p,b)=>{l--;let h=o.shift();for(g(h!==void 0),m(h.chunk,p,h.meta),u++;c.length>0&&c[0]===u;){c.shift();let y=o.shift();g(y!==void 0),m(y.chunk,null,y.meta)}},error:p=>{p.stack=f,this.setError(p)}}),this.alphaEncoder.configure(s)}}g(this.source._connectedTrack),this.muxer=this.source._connectedTrack.output._muxer,this.encoderInitialized=!0})()}async flushAndClose(t){try{if(!t&&(this.checkForEncoderError(),this.frameRateLastSample)){let e=this.encodingConfig.transform.frameRate,r=Cc(this.frameRateLastEndTimestamp,e);await this.padFrameRate(r)}this.closed=!0,t||(this.customEncoder?this.customEncoderCallSerializer.call(()=>this.customEncoder.flush()):this.encoder&&(await this.encoder.flush(),await this.alphaEncoder?.flush(),await Fr(25)))}finally{this.closed=!0,this.frameRateLastSample?.close(),this.frameRateLastSample=null,this.customEncoder?await this.customEncoderCallSerializer.call(()=>this.customEncoder.close()).catch(e=>this.setError(e)):this.encoder&&(this.encoder.state!=="closed"&&this.encoder.close(),this.alphaEncoder&&this.alphaEncoder.state!=="closed"&&this.alphaEncoder.close(),this.alphaFrameQueue.forEach(e=>e?.close()),this.alphaFrameQueue.length=0,this.splitter?.close())}t||this.checkForEncoderError()}getQueueSize(){return this.customEncoder?this.customEncoderQueueSize:this.encoder?.encodeQueueSize??0}checkForEncoderError(){if(this.errorSet)throw this.error}},Ju=null,il=class{constructor(){this.worker=null;this.pendingRequests=new Map;this.nextRequestId=0}split(t){if(!this.worker){if(!Ju){let n=new Blob([`(${dg.toString()})()`],{type:"application/javascript"});Ju=URL.createObjectURL(n)}this.worker=new Worker(Ju),this.worker.addEventListener("message",n=>{let a=n.data,s=this.pendingRequests.get(a.id);s&&(this.pendingRequests.delete(a.id),"error"in a?s.reject(new Error(a.error)):s.resolve({colorFrame:a.colorFrame,alphaFrame:a.alphaFrame}))}),this.worker.addEventListener("error",n=>{let a=new Error(n.message||"Color/alpha splitter worker error.");for(let s of this.pendingRequests.values())s.reject(a);this.pendingRequests.clear()})}let e=this.nextRequestId++,r=te();return this.pendingRequests.set(e,r),this.worker.postMessage({id:e,sourceFrame:t},{transfer:[t]}),r.promise}close(){this.worker?.terminate(),this.worker=null;let t=new Error("Color/alpha splitter closed.");for(let e of this.pendingRequests.values())e.reject(t);this.pendingRequests.clear()}},dg=()=>{let i=null,t=Promise.resolve();self.addEventListener("message",a=>{let{id:s,sourceFrame:o}=a.data;t=t.then(async()=>{try{let{colorFrame:c,alphaFrame:u}=await e(o);self.postMessage({id:s,colorFrame:c,alphaFrame:u},{transfer:[c,u]})}catch(c){self.postMessage({id:s,error:c.message})}finally{o.close()}})});let e=async a=>{let s=a.format;if(!s)throw new Error("CPU color/alpha splitting requires a known VideoFrame format.");let o=a.allocationSize();if((!i||i.byteLength!==o)&&(i=new Uint8Array(o)),await a.copyTo(i),s==="RGBA"||s==="BGRA")return r(i,s,a);if(s==="I420A"||s==="I420AP10"||s==="I420AP12"||s==="I422A"||s==="I422AP10"||s==="I422AP12"||s==="I444A"||s==="I444AP10"||s==="I444AP12")return n(i,s,a);throw new Error(`CPU color/alpha splitting does not support format '${s}'.`)},r=(a,s,o)=>{let c=o.visibleRect?.width??o.codedWidth,u=o.visibleRect?.height??o.codedHeight,l=c*u,m=Math.ceil(c/2),d=Math.ceil(u/2),f=l+m*d*2,p=new Uint8Array(f);for(let k=0,T=3;k<l;k++,T+=4)p[k]=a[T];p.fill(128,l);let b=new VideoFrame(a,{format:s==="RGBA"?"RGBX":"BGRX",codedWidth:c,codedHeight:u,timestamp:o.timestamp,duration:o.duration??void 0}),h={format:"I420",codedWidth:c,codedHeight:u,timestamp:o.timestamp,duration:o.duration??void 0,transfer:[p.buffer]},y=new VideoFrame(p,h);return{colorFrame:b,alphaFrame:y}},n=(a,s,o)=>{let c=o.visibleRect?.width??o.codedWidth,u=o.visibleRect?.height??o.codedHeight,l=s.includes("P10"),m=s.includes("P12"),d=l||m?2:1,f,p;s.startsWith("I420")?(f=Math.ceil(c/2),p=Math.ceil(u/2)):s.startsWith("I422")?(f=Math.ceil(c/2),p=u):(f=c,p=u);let b=c*u,h=f*p,y=b*d,k=h*d,T=b*d,w=y+k*2,x=s.replace("A",""),C=Math.ceil(c/2),P=Math.ceil(u/2),A=C*P,S=A*d,I=T+2*S,E=new Uint8Array(I),R=w;E.set(a.subarray(R,R+T),0);let _=T,z=l?512:m?2048:128;d===1?E.fill(z,_):new Uint16Array(E.buffer,_,2*A).fill(z);let V=l?"I420P10":m?"I420P12":"I420",B=new VideoFrame(a.subarray(0,w),{format:x,codedWidth:c,codedHeight:u,timestamp:o.timestamp,duration:o.duration??void 0}),W={format:V,codedWidth:c,codedHeight:u,timestamp:o.timestamp,duration:o.duration??void 0,transfer:[E.buffer]},Y=new VideoFrame(E,W);return{colorFrame:B,alphaFrame:Y}}},Mi=class extends ir{constructor(t){Ro(t),super(t.codec),this._encoder=new Oa(this,t)}add(t,e){if(!(t instanceof We))throw new TypeError("videoSample must be a VideoSample.");return this._encoder.add(t,!1,e)}_flushAndClose(t){return this._encoder.flushAndClose(t)}},Jo=class extends ir{constructor(t,e){if(!(typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement)&&!(typeof OffscreenCanvas<"u"&&t instanceof OffscreenCanvas))throw new TypeError("canvas must be an HTMLCanvasElement or OffscreenCanvas.");Ro(e),super(e.codec),this._encoder=new Oa(this,e),this._canvas=t}add(t,e=0,r){if(!Number.isFinite(t))throw new TypeError("timestamp must be a finite number.");if(!Number.isFinite(e)||e<0)throw new TypeError("duration must be a non-negative number.");let n=new We(this._canvas,{timestamp:t,duration:e});return this._encoder.add(n,!0,r)}_flushAndClose(t){return this._encoder.flushAndClose(t)}},ec=class extends ir{constructor(e,r,n={}){if(!(e instanceof MediaStreamTrack)||e.kind!=="video")throw new TypeError("track must be a video MediaStreamTrack.");if(Ro(r),typeof n!="object"||!n)throw new TypeError("options must be an object.");if(n.frameRate!=null&&(typeof n.frameRate!="number"||n.frameRate<=0))throw new TypeError("options.frameRate, when provided, must be either a positive number or null.");if(n.timestampBase!==void 0&&n.timestampBase!=="synced-zero"&&n.timestampBase!=="zero"&&n.timestampBase!=="unix")throw new TypeError("options.timestampBase, when provided, must be one of 'synced-zero', 'zero', or 'unix'.");r={...r,latencyMode:"realtime"};super(r.codec);this._abortController=null;this._workerTrackId=null;this._workerListener=null;this._promiseWithResolvers=te();this._errorPromiseAccessed=!1;this._paused=!1;this._lastVideoFrame=null;this._timerHandle=null;this._videoElement=null;this._options=n,this._encoder=new Oa(this,r),this._track=e}get errorPromise(){return this._errorPromiseAccessed=!0,this._promiseWithResolvers.promise}get paused(){return this._paused}async _start(){this._errorPromiseAccessed||U._warn("Make sure not to ignore the `errorPromise` field on MediaStreamVideoTrackSource, so that any internal errors get bubbled up properly.");let e=this._options.frameRate!==void 0?this._options.frameRate:this._track.getSettings().frameRate??null;this._abortController=new AbortController;let r=null,n=null,a=0,s=!1,o=null,c=0,u=()=>{if(g(e!==null),!this._lastVideoFrame)return;g(n!==null),g(r!==null);let d=performance.now();for(;d-n>1e3/e;){n+=1e3/e;let f=r+a/e,p=new VideoFrame(this._videoElement??this._lastVideoFrame,{timestamp:1e6*f,duration:1e6/e});m(p,d)}};e!==null&&(this._timerHandle=_l(u,4));let l=d=>{if(e===null)m(d);else{let f=performance.now();this._lastVideoFrame?(u(),this._lastVideoFrame?.close(),this._lastVideoFrame=d):(m(d.clone(),f),n=f,this._lastVideoFrame=d)}},m=(d,f=performance.now())=>{if(s){d.close();return}a++;let p=d.timestamp/1e6;if(this._paused){if(r!==null){if(o!==null&&this._options.timestampBase!=="unix"){let y=p-o;c-=y}o=p}d.close();return}if(r===null){r=p;let h,y=this._options.timestampBase??"synced-zero";if(y==="unix")h=Date.now()/1e3;else if(y==="zero")h=0;else{let k=this._connectedTrack.output;k._firstMediaStreamTimestamp===null?(k._firstMediaStreamTimestamp=f/1e3,h=0):h=f/1e3-k._firstMediaStreamTimestamp}c=h-r}if(o=p,this._encoder.getQueueSize()>=8){d.close();return}let b=new We(d,{timestamp:p+c});this._encoder.add(b,!0).catch(h=>{s=!0,this._abortController?.abort(),this._promiseWithResolvers.reject(h),this._workerTrackId!==null&&tl({type:"stopTrack",trackId:this._workerTrackId})})};if(typeof MediaStreamTrackProcessor<"u"){let d=new MediaStreamTrackProcessor({track:this._track}),f=new WritableStream({write:l});d.readable.pipeTo(f,{signal:this._abortController.signal}).catch(p=>{p instanceof DOMException&&p.name==="AbortError"||this._promiseWithResolvers.reject(p)})}else if(await hg())this._workerTrackId=fg++,tl({type:"videoTrack",trackId:this._workerTrackId,track:this._track}),this._workerListener=f=>{let p=f.data;p.type==="videoFrame"&&p.trackId===this._workerTrackId?l(p.videoFrame):p.type==="error"&&p.trackId===this._workerTrackId&&this._promiseWithResolvers.reject(p.error)},gt.addEventListener("message",this._workerListener);else if(e!==null){let f=document.createElement("video");f.style.position="fixed",f.style.left="-10000px",f.style.top="-10000px",f.style.width="1px",f.style.height="1px",f.style.opacity="0",f.style.pointerEvents="none",f.muted=!0,f.srcObject=new MediaStream([this._track]),document.body.appendChild(f),this._videoElement=f,f.addEventListener("loadeddata",()=>{if(s||!this._videoElement)return;let p=new VideoFrame(f,{timestamp:1e3*performance.now()});l(p),p.close()},{once:!0}),f.play().catch(p=>{s=!0,this._promiseWithResolvers.reject(p)})}else throw new Error("When no explicit frame rate is set, MediaStreamTrackProcessor is required; but it's not available in this environment.")}pause(){this._paused=!0}resume(){this._paused=!1}async _flushAndClose(e){this._abortController&&(this._abortController.abort(),this._abortController=null),this._timerHandle&&Rl(this._timerHandle),this._lastVideoFrame?.close(),this._videoElement&&(this._videoElement.srcObject=null,this._videoElement.remove(),this._videoElement=null),this._workerTrackId!==null&&(g(this._workerListener),tl({type:"stopTrack",trackId:this._workerTrackId}),await new Promise(r=>{let n=a=>{let s=a.data;s.type==="trackStopped"&&s.trackId===this._workerTrackId&&(g(this._workerListener),gt.removeEventListener("message",this._workerListener),gt.removeEventListener("message",n),r())};gt.addEventListener("message",n)})),await this._encoder.flushAndClose(e)}},nr=class extends Fi{constructor(e){super();this._connectedTrack=null;if(!fe.includes(e))throw new TypeError(`Invalid audio codec '${e}'. Must be one of: ${fe.join(", ")}.`);this._codec=e}},Er=class extends nr{constructor(t){super(t)}add(t,e){if(!(t instanceof j))throw new TypeError("packet must be an EncodedPacket.");if(t.isMetadataOnly)throw new TypeError("Metadata-only packets cannot be added.");if(e!==void 0&&(!e||typeof e!="object"))throw new TypeError("meta, when provided, must be an object.");return this._ensureValidAdd(),this._connectedTrack.output._muxer.addEncodedAudioPacket(this._connectedTrack,t,e)}},Da=class{constructor(t,e){this.source=t;this.encodingConfig=e;this.ensureEncoderPromise=null;this.encoderInitialized=!1;this.encoder=null;this.muxer=null;this.lastNumberOfChannels=null;this.lastSampleRate=null;this.isPcmEncoder=!1;this.outputSampleSize=null;this.writeOutputValue=null;this.customEncoder=null;this.customEncoderCallSerializer=new vr;this.customEncoderQueueSize=0;this.lastEndSampleIndex=null;this.resampler=null;this.error=null;this.errorSet=!1;this.lastMuxerPromise=Promise.resolve();this.closed=!1}setError(t){this.errorSet||(this.error=t,this.errorSet=!0)}async add(t,e){try{if(this.checkForEncoderError(),this.source._ensureValidAdd(),this.lastNumberOfChannels!==null&&this.lastSampleRate!==null){if(t.numberOfChannels!==this.lastNumberOfChannels||t.sampleRate!==this.lastSampleRate)throw new Error(`Audio parameters must remain constant. Expected ${this.lastNumberOfChannels} channels at ${this.lastSampleRate} Hz, got ${t.numberOfChannels} channels at ${t.sampleRate} Hz.`)}else this.lastNumberOfChannels=t.numberOfChannels,this.lastSampleRate=t.sampleRate;let r=this.encodingConfig;r.transform?.numberOfChannels!==void 0||r.transform?.sampleRate!==void 0?(this.resampler||(this.resampler=new Zo({targetNumberOfChannels:r.transform.numberOfChannels??t.numberOfChannels,targetSampleRate:r.transform.sampleRate??t.sampleRate,onSample:async a=>{await this.processAndEncode(a,!0)}})),await this.resampler.add(t)):await this.processAndEncode(t,e)}finally{e&&t.close()}}async processAndEncode(t,e){let r=this.encodingConfig;if(r.transform?.sampleFormat!==void 0&&pm(t.format)!==r.transform.sampleFormat){let n=hm(t,r.transform.sampleFormat);e&&t.close(),t=n,e=!0}if(r.transform?.process)try{let n=r.transform.process(t);if(v(n)&&(n=await n),n===null)return;Array.isArray(n)||(n=[n]);try{for(let a of n)if(!(a instanceof Ae))throw new TypeError("The audio process function must return an AudioSample, null, or an array of AudioSamples.");for(let a of n)await this.encodeSample(a,!0)}finally{for(let a of n)a instanceof Ae&&a.close()}}finally{e&&t.close()}else await this.encodeSample(t,e)}async encodeSample(t,e){try{if(this.encoderInitialized||(this.ensureEncoderPromise||this.ensureEncoder(t),this.encoderInitialized||await this.ensureEncoderPromise),g(this.encoderInitialized),this.closed)return;{let r=Math.round(t.timestamp*t.sampleRate),n=Math.round((t.timestamp+t.duration)*t.sampleRate);if(this.lastEndSampleIndex===null)this.lastEndSampleIndex=n;else{let a=r-this.lastEndSampleIndex;if(a>=64){let s=new Ae({data:new Float32Array(a*t.numberOfChannels),format:"f32-planar",sampleRate:t.sampleRate,numberOfChannels:t.numberOfChannels,numberOfFrames:a,timestamp:this.lastEndSampleIndex/t.sampleRate});await this.encodeSample(s,!0)}this.lastEndSampleIndex+=t.numberOfFrames}}if(this.encodingConfig.onEncodedSample?.(t),this.customEncoder){this.customEncoderQueueSize++;let r=t.clone(),n=this.customEncoderCallSerializer.call(()=>this.customEncoder.encode(r)).catch(a=>this.setError(a)).finally(()=>{this.customEncoderQueueSize--,r.close()});this.customEncoderQueueSize>=4&&await n,await this.lastMuxerPromise}else if(this.isPcmEncoder)await this.doPcmEncoding(t,e);else{g(this.encoder);let r=t.toAudioData();this.encoder.encode(r),r.close(),e&&t.close(),this.encoder.encodeQueueSize>=4&&await new Promise(n=>this.encoder.addEventListener("dequeue",n,{once:!0})),await this.lastMuxerPromise}}finally{e&&t.close()}}async doPcmEncoding(t,e){g(this.outputSampleSize),g(this.writeOutputValue);let{numberOfChannels:r,numberOfFrames:n,sampleRate:a,timestamp:s}=t,o=2048,c=[];for(let d=0;d<n;d+=o){let f=Math.min(o,t.numberOfFrames-d),p=f*r*this.outputSampleSize,b=new ArrayBuffer(p),h=new DataView(b);c.push({frameCount:f,view:h})}let u=t.allocationSize({planeIndex:0,format:"f32-planar"}),l=new Float32Array(u/Float32Array.BYTES_PER_ELEMENT);for(let d=0;d<r;d++){t.copyTo(l,{planeIndex:d,format:"f32-planar"});for(let f=0;f<c.length;f++){let{frameCount:p,view:b}=c[f];for(let h=0;h<p;h++)this.writeOutputValue(b,(h*r+d)*this.outputSampleSize,l[f*o+h])}}e&&t.close();let m={decoderConfig:{codec:this.encodingConfig.codec,numberOfChannels:r,sampleRate:a}};for(let d=0;d<c.length;d++){let{frameCount:f,view:p}=c[d],b=p.buffer,h=d*o,y=new j(new Uint8Array(b),"key",s+h/a,f/a);this.encodingConfig.onEncodedPacket?.(y,m),await this.muxer.addEncodedAudioPacket(this.source._connectedTrack,y,m)}}ensureEncoder(t){this.ensureEncoderPromise=(async()=>{let{numberOfChannels:e,sampleRate:r}=t,n=Jr(this.encodingConfig.quality,this.encodingConfig.bitrate),a=Ru({numberOfChannels:e,sampleRate:r,...this.encodingConfig,quality:n});this.encodingConfig.onEncoderConfig?.(a);let s=gn.find(o=>o.supports(this.encodingConfig.codec,a));if(s)this.customEncoder=new s,this.customEncoder.codec=this.encodingConfig.codec,this.customEncoder.config=a,this.customEncoder.onPacket=(o,c)=>{if(!(o instanceof j))throw new TypeError("The first argument passed to onPacket must be an EncodedPacket.");if(c!==void 0&&(!c||typeof c!="object"))throw new TypeError("The second argument passed to onPacket must be an object or undefined.");this.encodingConfig.onEncodedPacket?.(o,c),this.lastMuxerPromise=this.muxer.addEncodedAudioPacket(this.source._connectedTrack,o,c).catch(u=>{this.setError(u)})},this.customEncoder.onError=o=>{this.setError(o)},await this.customEncoder.init();else if(se.includes(this.encodingConfig.codec))this.initPcmEncoder();else{if(typeof AudioEncoder>"u")throw new Error(Ni("AudioEncoder"));let o;try{o=(await AudioEncoder.isConfigSupported(a)).supported??!1}catch{o=!1}if(!o)throw new Error(`This specific encoder configuration (${a.codec}, ${a.bitrate} bps, ${a.numberOfChannels} channels, ${a.sampleRate} Hz) is not supported in this environment. Consider using another codec or changing your audio parameters.`);let c=new Error("Encoding error").stack;this.encoder=new AudioEncoder({output:(u,l)=>{if(this.encodingConfig.codec==="aac"&&l?.decoderConfig){let d=!1;if(!l.decoderConfig.description||l.decoderConfig.description.byteLength<2?d=!0:d=Qt(Z(l.decoderConfig.description)).objectType===0,d){let f=Number(ee(a.codec.split(".")));l.decoderConfig.description=Hi({objectType:f,outputNumberOfChannels:l.decoderConfig.numberOfChannels,outputSampleRate:l.decoderConfig.sampleRate})}}let m=j.fromEncodedChunk(u);m=m.clone({timestamp:Nt(m.timestamp,a.sampleRate),duration:u.duration!=null?Nt(m.duration,a.sampleRate):void 0}),this.encodingConfig.onEncodedPacket?.(m,l),this.lastMuxerPromise=this.muxer.addEncodedAudioPacket(this.source._connectedTrack,m,l).catch(d=>{this.setError(d)})},error:u=>{u.stack=c,this.setError(u)}}),this.encoder.configure(a)}g(this.source._connectedTrack),this.muxer=this.source._connectedTrack.output._muxer,this.encoderInitialized=!0})()}initPcmEncoder(){this.isPcmEncoder=!0;let t=this.encodingConfig.codec,{dataType:e,sampleSize:r,littleEndian:n}=Re(t);switch(this.outputSampleSize=r,r){case 1:e==="unsigned"?this.writeOutputValue=(a,s,o)=>a.setUint8(s,ne((o+1)*127.5,0,255)):e==="signed"?this.writeOutputValue=(a,s,o)=>{a.setInt8(s,ne(Math.round(o*128),-128,127))}:e==="ulaw"?this.writeOutputValue=(a,s,o)=>{let c=ne(Math.floor(o*32767),-32768,32767);a.setUint8(s,Rm(c))}:e==="alaw"?this.writeOutputValue=(a,s,o)=>{let c=ne(Math.floor(o*32767),-32768,32767);a.setUint8(s,Mm(c))}:g(!1);break;case 2:e==="unsigned"?this.writeOutputValue=(a,s,o)=>a.setUint16(s,ne((o+1)*32767.5,0,65535),n):e==="signed"?this.writeOutputValue=(a,s,o)=>a.setInt16(s,ne(Math.round(o*32767),-32768,32767),n):g(!1);break;case 3:e==="unsigned"?this.writeOutputValue=(a,s,o)=>di(a,s,ne((o+1)*83886075e-1,0,16777215),n):e==="signed"?this.writeOutputValue=(a,s,o)=>Tl(a,s,ne(Math.round(o*8388607),-8388608,8388607),n):g(!1);break;case 4:e==="unsigned"?this.writeOutputValue=(a,s,o)=>a.setUint32(s,ne((o+1)*21474836475e-1,0,4294967295),n):e==="signed"?this.writeOutputValue=(a,s,o)=>a.setInt32(s,ne(Math.round(o*2147483647),-2147483648,2147483647),n):e==="float"?this.writeOutputValue=(a,s,o)=>a.setFloat32(s,o,n):g(!1);break;case 8:e==="float"?this.writeOutputValue=(a,s,o)=>a.setFloat64(s,o,n):g(!1);break;default:ie(r),g(!1)}}async flushAndClose(t){try{t||(this.checkForEncoderError(),this.resampler&&await this.resampler.finalize()),this.closed=!0,t||(this.customEncoder?this.customEncoderCallSerializer.call(()=>this.customEncoder.flush()):this.encoder&&await this.encoder.flush())}finally{this.closed=!0,this.resampler=null,this.customEncoder?await this.customEncoderCallSerializer.call(()=>this.customEncoder.close()).catch(e=>this.setError(e)):this.encoder&&this.encoder.state!=="closed"&&this.encoder.close()}t||this.checkForEncoderError()}getQueueSize(){return this.customEncoder?this.customEncoderQueueSize:this.isPcmEncoder?0:this.encoder?.encodeQueueSize??0}checkForEncoderError(){if(this.errorSet)throw this.error}},Cn=class extends nr{constructor(t){Fo(t),super(t.codec),this._encoder=new Da(this,t)}add(t){if(!(t instanceof Ae))throw new TypeError("audioSample must be an AudioSample.");return this._encoder.add(t,!1)}_flushAndClose(t){return this._encoder.flushAndClose(t)}},tc=class extends nr{constructor(t,e={}){if(Fo(t),typeof e!="object"||!e)throw new TypeError("options must be an object.");if(e.startTimestamp!==void 0&&!Number.isFinite(e.startTimestamp))throw new TypeError("options.startTimestamp, when provided, must be a finite number.");super(t.codec),this._encoder=new Da(this,t),this._accumulatedTime=e.startTimestamp??0}async add(t){if(!(t instanceof AudioBuffer))throw new TypeError("audioBuffer must be an AudioBuffer.");let e=Ae._fromAudioBuffer(t,this._accumulatedTime);this._accumulatedTime+=t.duration;for(let r of e)await this._encoder.add(r,!0)}_flushAndClose(t){return this._encoder.flushAndClose(t)}},rc=class extends nr{constructor(e,r,n={}){if(!(e instanceof MediaStreamTrack)||e.kind!=="audio")throw new TypeError("track must be an audio MediaStreamTrack.");if(Fo(r),typeof n!="object"||!n)throw new TypeError("options must be an object.");if(n.timestampBase!==void 0&&n.timestampBase!=="synced-zero"&&n.timestampBase!=="zero"&&n.timestampBase!=="unix")throw new TypeError("options.timestampBase, when provided, must be one of 'synced-zero', 'zero', or 'unix'.");super(r.codec);this._abortController=null;this._audioContext=null;this._scriptProcessorNode=null;this._promiseWithResolvers=te();this._errorPromiseAccessed=!1;this._paused=!1;this._options=n,this._encoder=new Da(this,r),this._track=e}get errorPromise(){return this._errorPromiseAccessed=!0,this._promiseWithResolvers.promise}get paused(){return this._paused}async _start(){this._errorPromiseAccessed||U._warn("Make sure not to ignore the `errorPromise` field on MediaStreamAudioTrackSource, so that any internal errors get bubbled up properly."),this._abortController=new AbortController;let e=null,r=!1,n=null,a=0,s=o=>{if(r){o.close();return}let c=o.timestamp;if(this._paused){if(e!==null){if(n!==null&&this._options.timestampBase!=="unix"){let l=c-n;a-=l}n=c}o.close();return}if(e===null){e=o.timestamp;let u,l=this._options.timestampBase??"synced-zero";if(l==="unix")u=Date.now()/1e3;else if(l==="zero")u=0;else{let m=this._connectedTrack.output;m._firstMediaStreamTimestamp===null?(m._firstMediaStreamTimestamp=performance.now()/1e3,u=0):u=performance.now()/1e3-m._firstMediaStreamTimestamp}a=u-e}if(n=c,this._encoder.getQueueSize()>=8){o.close();return}o.setTimestamp(c+a),this._encoder.add(o,!0).catch(u=>{r=!0,this._abortController?.abort(),this._promiseWithResolvers.reject(u),this._audioContext?.suspend()})};if(typeof MediaStreamTrackProcessor<"u"){let o=new MediaStreamTrackProcessor({track:this._track}),c=new WritableStream({write:u=>s(new Ae(u))});o.readable.pipeTo(c,{signal:this._abortController.signal}).catch(u=>{u instanceof DOMException&&u.name==="AbortError"||this._promiseWithResolvers.reject(u)})}else{let o=window.AudioContext||window.webkitAudioContext;this._audioContext=new o({sampleRate:this._track.getSettings().sampleRate});let c=this._audioContext.createMediaStreamSource(new MediaStream([this._track]));this._scriptProcessorNode=this._audioContext.createScriptProcessor(4096),this._audioContext.state==="suspended"&&await this._audioContext.resume(),c.connect(this._scriptProcessorNode),this._scriptProcessorNode.connect(this._audioContext.destination);let u=0;this._scriptProcessorNode.onaudioprocess=l=>{let m=Ae._fromAudioBuffer(l.inputBuffer,u);u+=l.inputBuffer.duration;for(let d of m)s(d)}}}pause(){this._paused=!0}resume(){this._paused=!1}async _flushAndClose(e){this._abortController&&(this._abortController.abort(),this._abortController=null),this._audioContext&&(g(this._scriptProcessorNode),this._scriptProcessorNode.disconnect(),await this._audioContext.suspend()),await this._encoder.flushAndClose(e)}},mg=()=>{let i=(r,n)=>{n?self.postMessage(r,{transfer:n}):self.postMessage(r)};i({type:"support",supported:typeof MediaStreamTrackProcessor<"u"});let t=new Map,e=new Map;self.addEventListener("message",r=>{let n=r.data;switch(n.type){case"videoTrack":{e.set(n.trackId,n.track);let a=new MediaStreamTrackProcessor({track:n.track}),s=new WritableStream({write:c=>{if(!e.has(n.trackId)){c.close();return}i({type:"videoFrame",trackId:n.trackId,videoFrame:c},[c])}}),o=new AbortController;t.set(n.trackId,o),a.readable.pipeTo(s,{signal:o.signal}).catch(c=>{c instanceof DOMException&&c.name==="AbortError"||i({type:"error",trackId:n.trackId,error:c})})}break;case"stopTrack":{let a=t.get(n.trackId);a&&(a.abort(),t.delete(n.trackId)),e.get(n.trackId)?.stop(),e.delete(n.trackId),i({type:"trackStopped",trackId:n.trackId})}break;default:ie(n)}})},fg=0,gt=null,pg=()=>{let i=new Blob([`(${mg.toString()})()`],{type:"application/javascript"}),t=URL.createObjectURL(i);gt=new Worker(t)},el=null,hg=async()=>el!==null?el:(gt||pg(),new Promise(i=>{g(gt);let t=e=>{let r=e.data;r.type==="support"&&(el=r.supported,gt.removeEventListener("message",t),i(r.supported))};gt.addEventListener("message",t)})),tl=(i,t)=>{g(gt),t?gt.postMessage(i,t):gt.postMessage(i)},Bi=class extends Fi{constructor(e){super();this._connectedTrack=null;if(!He.includes(e))throw new TypeError(`Invalid subtitle codec '${e}'. Must be one of: ${He.join(", ")}.`);this._codec=e}},ic=class extends Bi{constructor(e){super(e);this._error=null;this._errorSet=!1;this._lastMuxerPromise=Promise.resolve();this._parser=new zo({codec:e,output:(r,n)=>{this._lastMuxerPromise=this._connectedTrack.output._muxer.addSubtitleCue(this._connectedTrack,r,n).catch(a=>{this._setError(a)})}})}add(e){if(typeof e!="string")throw new TypeError("text must be a string.");return this._checkForError(),this._ensureValidAdd(),this._parser.parse(e),this._lastMuxerPromise}_setError(e){this._errorSet||(this._error=e,this._errorSet=!0)}_checkForError(){if(this._errorSet)throw this._error}async _flushAndClose(e){e||this._checkForError()}};var ac=class extends ve{constructor(e,r){if(!(e._target instanceof it))throw new TypeError("HLS outputs require `OutputOptions.target` to be a PathedTarget.");super(e);this.trackDatas=[];this.isRelativeToUnixEpoch=!1;this.numWrittenMasterPlaylists=0;this.playlists=[];this.playlistDeclarations=[];this.format=r,this.targetSegmentDuration=r._options.targetDuration??2,this.singleFilePerPlaylist=r._options.singleFilePerPlaylist??!1,this.isLive=r._options.live??!1,this.maxLiveSegmentCount=r._options.maxLiveSegmentCount??1/0,this.globalTargetDuration=this.targetSegmentDuration,this.getPlaylistPath=r._options.getPlaylistPath??(({n})=>`playlist-${n}.m3u8`),this.getSegmentPath=r._options.getSegmentPath??(n=>n.isSingleFile?`segments-${n.playlist.n}${n.format.fileExtension}`:`segment-${n.playlist.n}-${n.n}${n.format.fileExtension}`),this.getInitPath=r._options.getInitPath??(n=>`init-${n.n}${n.segmentFormat.fileExtension}`)}async start(){let e=await this.mutex.acquire(),r=this.output.tracks.some(y=>y.metadata.isRelativeToUnixEpoch),n=this.output.tracks.some(y=>!y.metadata.isRelativeToUnixEpoch);if(r&&n)throw new Error("All tracks must agree on `relativeToUnixEpoch`: some tracks are relative to the Unix epoch and some are not.");this.isRelativeToUnixEpoch=r;let a=new Map,s=[],o=!1,c=!1,u=!1;for(let y of this.output.tracks){y.type==="video"&&(o=!0);let k=new Map;for(let T of this.output.tracks){if(y===T||!y.canBePairedWith(T))continue;if(y.type===T.type){c||(U._warn(`Illegal pairing of two ${y.type} tracks detected, which is not possible in HLS; treating them as unpaired.`),c=!0);continue}if(y.isVideoTrack()&&y.metadata.hasOnlyKeyPackets||T.isVideoTrack()&&T.metadata.hasOnlyKeyPackets){u||(U._warn("A key-packets-only video track is pairable with another track, which is not possible in HLS; treating them as unpaired."),u=!0);continue}let w=k.get(T.source._codec);w||k.set(T.source._codec,w=[]),w.push(T)}for(let[,T]of k){let w=T.map(P=>P.id).join("-");s.find(P=>P.key===w)||s.push({name:T[0].type+"-"+(s.length+1),key:w,tracks:T,needsEmit:!1,firstNoUri:!1});let C=a.get(y);C||a.set(y,C=[]),C.push(w)}}let l=o?"video":"audio",m=[],d=[],f=[];for(let y of this.output.tracks){let k=a.get(y);if(k){if(g(k.length>0),y.type!==l)continue;for(let T of k){let w=s.find(x=>x.key===T);if(g(w),k.length===1&&w.tracks.length===1){let x=a.get(w.tracks[0]);if(g(x!==void 0),x.length===1){let C=s.find(P=>P.key===x[0]);if(C.tracks.length===1){g(C.tracks[0]===y),m.push({tracks:[y,w.tracks[0]],linkedGroup:null});continue}}}m.push({tracks:[y],linkedGroup:w}),w.needsEmit=!0}}else y.type==="video"?d.push(y):y.type==="audio"&&f.push(y)}let p=({metadata:y})=>{let k="";return k+=`${y.languageCode??ae}-`,k+=`${y.name??""}-`,k+=`${y.disposition?.default??!0}-`,k+=`${y.disposition?.primary??!1}-`,k+=`${y.disposition?.forced??!1}-`,k};if(d.length>0)if(new Set(d.map(p)).size>1){let k={key:d.map(T=>T.id).join("-"),name:"video-"+(s.length+1),tracks:d,needsEmit:!0,firstNoUri:!0};s.push(k),m.push({tracks:[d[0]],linkedGroup:k})}else for(let k of d)m.push({tracks:[k],linkedGroup:null});if(f.length>0)if(new Set(f.map(p)).size>1){let k={key:f.map(T=>T.id).join("-"),name:"audio-"+(s.length+1),tracks:f,needsEmit:!0,firstNoUri:!0};s.push(k),m.push({tracks:[f[0]],linkedGroup:k})}else for(let k of f)m.push({tracks:[k],linkedGroup:null});let b=y=>{let k=[],T=0,w=0,x=!1,C=null,P=-1/0;for(let A of y)A.isVideoTrack()?(T++,x||=(A.metadata.rotation??0)!==0):A.isAudioTrack()&&w++,k.push(A.source._codec);for(let A of qt(this.format._options.segmentFormat)){let S=A.getSupportedCodecs(),I=A.getSupportedTrackCounts();if(k.some(R=>!S.includes(R))||T<I.video.min||T>I.video.max||w<I.audio.min||w>I.audio.max)continue;let E=0;x&&A.supportsVideoRotationMetadata&&E++,E>P&&(C=A,P=E)}return g(C),C},h=async y=>{if(y.some(C=>this.playlists.some(P=>P.tracks.includes(C))))throw new Error("Internal error: track is already registered in a playlist.");let k=b(y),T=this.playlists.length+1,w=await this.getPlaylistPath({n:T,tracks:y,segmentFormat:k});gg(w);let x={id:this.playlists.length+1,path:w,tracks:y,segmentFormat:k,currentSegmentStartTimestamp:null,currentSegmentStartTimestampIsFixed:!1,nextSegmentId:1,initSegment:null,writtenSegments:[],peakBitrate:null,averageBitrate:null,mediaSequence:0,done:!1,singleFile:null,mutex:new ze};return this.playlists.push(x),x};for(let y of s)if(y.needsEmit)for(let k=0;k<y.tracks.length;k++){let T=y.tracks[k],w=this.playlists.find(x=>x.tracks[0].id===T.id);w??=await h([T]),this.playlistDeclarations.push({playlist:w,groupId:y.name,noUri:y.firstNoUri&&k===0,references:[]})}for(let y of m){let k=this.playlists.find(T=>T.tracks[0].id===y.tracks[0].id);k??=await h(y.tracks),this.playlistDeclarations.push({playlist:k,groupId:null,noUri:!1,references:y.linkedGroup?this.playlistDeclarations.filter(T=>T.groupId===y.linkedGroup.name):[]})}for(let y of this.output.tracks)y.isVideoTrack()&&y.metadata.decoderConfig?this.getVideoTrackData(y,y.metadata.primingPacket??null,{decoderConfig:y.metadata.decoderConfig}):y.isAudioTrack()&&y.metadata.decoderConfig&&this.getAudioTrackData(y,y.metadata.primingPacket??null,{decoderConfig:y.metadata.decoderConfig});e()}async getMimeType(){return Xt}allTracksAreKnown(e){for(let r of e.tracks)if(!r.source._closed&&!this.trackDatas.some(n=>n.track===r))return!1;return!0}async onTrackClose(e){let r=this.trackDatas.find(s=>s.track===e);r&&(r.closed=!0);let n=this.playlists.find(s=>s.tracks.includes(e));g(n);let a=await n.mutex.acquire();try{await this.advancePlaylist(n)}finally{a()}}getVideoTrackData(e,r,n){let a=this.trackDatas.find(o=>o.track===e);if(a)return a;jt(n,e.source._codec),g(n),g(n?.decoderConfig);let s=this.playlists.filter(o=>o.tracks.includes(e));return g(s.length===1),a={track:e,packets:[],playlist:s[0],closed:!1,info:{type:"video",decoderConfig:n.decoderConfig,primingPacket:r}},this.trackDatas.push(a),a}getAudioTrackData(e,r,n){let a=this.trackDatas.find(o=>o.track===e);if(a)return a;Pe(n,e.source._codec),g(n),g(n?.decoderConfig);let s=this.playlists.filter(o=>o.tracks.includes(e));return g(s.length===1),a={track:e,packets:[],playlist:s[0],closed:!1,info:{type:"audio",decoderConfig:n.decoderConfig,primingPacket:r}},this.trackDatas.push(a),a}async addEncodedVideoPacket(e,r,n){let a=this.getVideoTrackData(e,r,n),s=a.playlist,o=await s.mutex.acquire();try{this.validateTimestamp(e,r.timestamp,r.type==="key"),a.packets.push(r),s.currentSegmentStartTimestamp===null?s.currentSegmentStartTimestamp=r.timestamp:s.currentSegmentStartTimestampIsFixed||(s.currentSegmentStartTimestamp=Math.min(s.currentSegmentStartTimestamp,r.timestamp)),await this.advancePlaylist(s)}finally{o()}}async addEncodedAudioPacket(e,r,n){let a=this.getAudioTrackData(e,r,n),s=a.playlist,o=await s.mutex.acquire();try{this.validateTimestamp(e,r.timestamp,r.type==="key"),a.packets.push(r),s.currentSegmentStartTimestamp===null?s.currentSegmentStartTimestamp=r.timestamp:s.currentSegmentStartTimestampIsFixed||(s.currentSegmentStartTimestamp=Math.min(s.currentSegmentStartTimestamp,r.timestamp)),await this.advancePlaylist(s)}finally{o()}}async addSubtitleCue(e,r,n){throw new Error("Unreachable.")}async advancePlaylist(e){if(g(!e.done),!this.allTracksAreKnown(e))return;let r=this.trackDatas.filter(s=>e.tracks.includes(s.track));if(e.currentSegmentStartTimestamp===null){r.every(s=>s.closed)&&await this.onPlaylistDone(e);return}let n=r.find(s=>s.info.type==="video"),a=r.find(s=>s.info.type==="audio");for(;;){let s=e.currentSegmentStartTimestamp+this.targetSegmentDuration,o=0,c=0;if(n&&(!n.closed||n.packets.length>0)){let C=n.packets.every(S=>S.timestamp<s),P=null,A=null;if(C){if(!n.closed)return}else for(let S=0;S<n.packets.length;S++){let I=n.packets[S];if(P!==null&&I.timestamp>s)break;S>0&&I.type==="key"&&(P=I,A=S)}if(A!==null){if(o=A,a){let S=a.packets.findIndex(I=>I.timestamp>=P.timestamp);if(S!==-1)c=S;else if(a.closed)c=a.packets.length;else return}}else{if(!n.closed)return;o=n.packets.length;let S=Il(n.packets,E=>E.timestamp),I=n.packets[S];if(g(I),a)if(I.timestamp<s){let E=a.packets.findIndex(R=>R.timestamp>=s);if(E!==-1)c=E;else if(a.closed)c=a.packets.length;else return}else{let E=a.packets.findIndex(R=>R.timestamp>I.timestamp);if(E!==-1)c=E;else if(a.closed)c=a.packets.length;else return}}}else if(a&&(!a.closed||a.packets.length>0))if(a.packets.every(P=>P.timestamp<s))if(a.closed)c=a.packets.length;else return;else{let P=Rr(a.packets,A=>A.timestamp<=s);c=Math.max(P,1)}if(o===0&&c===0){r.every(P=>P.closed)&&await this.onPlaylistDone(e);return}let u=null,l,m;g(this.output._target instanceof it);let d=this.output._target;if(this.singleFilePerPlaylist)if(e.singleFile===null){let C={n:e.nextSegmentId,format:e.segmentFormat,isSingleFile:!0,playlist:nc(e)};l=await this.getSegmentPath(C),yf(l),m=Ce(Ce(d.rootPath,e.path),l);let P=await this.output._getTarget({path:m,isRoot:!1,mimeType:e.segmentFormat.mimeType}),A=null;if(e.segmentFormat._isFragmentedIsobmff()){A={output:new ar({format:e.segmentFormat,target:P}),videoSource:null,audioSource:null,firstMoofPosition:null,currentFileSize:0},P.on("write",({end:E})=>{A.currentFileSize=Math.max(A.currentFileSize,E)});let S=A.output._muxer;S.minimumFragmentDuration=1/0;let I=S.formatOptions.onMoof;S.formatOptions.onMoof=(E,R,_)=>{A.firstMoofPosition=R,I?.(E,R,_),S.formatOptions.onMoof=I},n&&(A.videoSource=new Ir(n.track.source._codec),A.output.addVideoTrack(A.videoSource,{...n.track.metadata,decoderConfig:n.info.decoderConfig,primingPacket:n.info.primingPacket??void 0})),a&&(A.audioSource=new Er(a.track.source._codec),A.output.addAudioTrack(A.audioSource,{...a.track.metadata,decoderConfig:a.info.decoderConfig,primingPacket:a.info.primingPacket??void 0})),await A.output.start()}else P._start();e.singleFile={target:P,path:l,nextOffset:0,info:C,fragmentedIsobmffOutput:A}}else l=e.singleFile.path,m=Ce(Ce(d.rootPath,e.path),l);else u={n:e.nextSegmentId,format:e.segmentFormat,isSingleFile:!1,playlist:nc(e)},l=await this.getSegmentPath(u),yf(l),m=Ce(Ce(d.rootPath,e.path),l),e.nextSegmentId++;let f=0,p=null,b=-1/0,h=null,y=null,k=null;try{if(e.singleFile?.fragmentedIsobmffOutput?(h=e.singleFile.fragmentedIsobmffOutput.output,y=e.singleFile.fragmentedIsobmffOutput.videoSource,k=e.singleFile.fragmentedIsobmffOutput.audioSource):(h=new ar({format:e.segmentFormat,target:new it(m,async C=>{let P={...C,isRoot:!1};if(C.isRoot)if(e.singleFile){let A=e.singleFile.target.slice(e.singleFile.nextOffset);return A.on("write",({end:S})=>f=Math.max(f,S)),A}else{let A=await this.output._getTarget(P);return p=A,A.on("write",({end:S})=>f=Math.max(f,S)),A}return this.output._getTarget(P)}),initTarget:async()=>{if(e.initSegment)return new oi;if(e.singleFile){e.initSegment={path:e.singleFile.path,duration:0,timestamp:0,byteSize:0,byteOffset:0,info:null};let C=e.singleFile.target.slice(e.singleFile.nextOffset);return C.on("write",({end:P})=>{e.initSegment.byteSize=Math.max(e.initSegment.byteSize,P)}),C.on("finalized",()=>{e.singleFile.nextOffset=e.initSegment.byteSize}),C}else{let C=nc(e),P=await this.getInitPath(C);bg(P),e.initSegment={path:P,duration:0,timestamp:0,byteSize:0,byteOffset:null,info:null};let A=Ce(Ce(d.rootPath,e.path),P),S=await this.output._getTarget({path:A,isRoot:!1,mimeType:e.segmentFormat.mimeType});return S.on("write",({end:I})=>{e.initSegment.byteSize=Math.max(e.initSegment.byteSize,I)}),S.on("finalized",()=>{this.format._options.onInit?.(S,C)}),S}}}),n&&(y=new Ir(n.track.source._codec),h.addVideoTrack(y,{...n.track.metadata,decoderConfig:n.info.decoderConfig,primingPacket:n.info.primingPacket??void 0})),a&&(k=new Er(a.track.source._codec),h.addAudioTrack(k,{...a.track.metadata,decoderConfig:a.info.decoderConfig,primingPacket:a.info.primingPacket??void 0})),await h.start()),n){g(y);let C={decoderConfig:n.info.decoderConfig};for(let P=0;P<o;P++){let A=n.packets[P];await y.add(A,C),b=Math.max(b,A.timestamp+A.duration)}}if(a){g(k);let C={decoderConfig:a.info.decoderConfig};for(let P=0;P<c;P++){let A=a.packets[P];await k.add(A,C),b=Math.max(b,A.timestamp+A.duration)}}e.singleFile?.fragmentedIsobmffOutput?(await e.singleFile.fragmentedIsobmffOutput.output._muxer.forceFragmentFinalization(),e.singleFile.fragmentedIsobmffOutput.firstMoofPosition!==null&&!e.initSegment&&(e.initSegment={path:e.singleFile.path,duration:0,timestamp:0,byteSize:e.singleFile.fragmentedIsobmffOutput.firstMoofPosition,byteOffset:0,info:null},e.singleFile.nextOffset=e.singleFile.fragmentedIsobmffOutput.firstMoofPosition),f=e.singleFile.fragmentedIsobmffOutput.currentFileSize-e.singleFile.nextOffset):await h.finalize()}catch(C){throw await h?.cancel(),C}u&&(g(p),this.format._options.onSegment?.(p,u)),o>0&&(g(n),n.packets.splice(0,o)),c>0&&(g(a),a.packets.splice(0,c));let T=1/0;n&&n.packets.length>0&&(T=n.packets[0].timestamp),a&&a.packets.length>0&&(T=Math.min(T,a.packets[0].timestamp));let w=T<1/0?T:b;g(Number.isFinite(w));let x=w-e.currentSegmentStartTimestamp;if(g(x>=0),e.writtenSegments.push({path:l,duration:x,timestamp:e.currentSegmentStartTimestamp,byteSize:f,byteOffset:e.singleFile?e.singleFile.nextOffset:null,info:u??null}),this.globalTargetDuration=Math.max(this.globalTargetDuration,x),e.currentSegmentStartTimestamp=w,e.currentSegmentStartTimestampIsFixed=!0,e.singleFile&&(e.singleFile.nextOffset+=f),this.isLive){for(;e.writtenSegments.length>this.maxLiveSegmentCount;){let C=e.writtenSegments.shift();e.mediaSequence++,this.singleFilePerPlaylist||(g(C.info),this.format._options.onSegmentPopped?.(C.path,C.info))}await this.writePlaylist(e),await this.tryWriteMasterPlaylist()}}}async onPlaylistDone(e){g(!e.done),e.done=!0,e.singleFile&&(e.singleFile.fragmentedIsobmffOutput?await e.singleFile.fragmentedIsobmffOutput.output.finalize():(await e.singleFile.target._flush(),await e.singleFile.target._finalize()),this.format._options.onSegment?.(e.singleFile.target,e.singleFile.info)),await this.writePlaylist(e),this.isLive&&e.writtenSegments.length===0&&await this.tryWriteMasterPlaylist()}updatePlaylistBitrates(e){let r=e.writtenSegments,n=0,a=0,s=0;for(let o=0;o<r.length;o++){s+=r[o].duration;let c=0,u=0;for(let l=o;l<r.length&&(c+=r[l].byteSize,u+=r[l].duration,u>=.5*this.globalTargetDuration&&u<=1.5*this.globalTargetDuration&&(n=Math.max(n,8*c/u)),!(u>1.5*this.globalTargetDuration));l++);}if(n===0)for(let o of r){let c=o.duration||1;n=Math.max(n,8*o.byteSize/c)}for(let o of r)a+=8*o.byteSize;e.peakBitrate=n,e.averageBitrate=a/(s||1)}async writePlaylist(e){g(this.output._target instanceof it);let r=this.output._target;this.updatePlaylistBitrates(e);let n=!1;for(let d of e.writtenSegments)n||=d.byteOffset!==null;let a=e.tracks[0].isVideoTrack()&&e.tracks[0].metadata.hasOnlyKeyPackets,s=3;(a||n)&&(s=4),e.initSegment&&(s=5),e.initSegment&&!a&&(s=6);let o=this.isLive?this.targetSegmentDuration:this.globalTargetDuration,c=Ce(r.rootPath,e.path),u=`#EXTM3U
#EXT-X-VERSION:${s}
`+(this.isLive?"":`#EXT-X-PLAYLIST-TYPE:VOD
`)+`#EXT-X-TARGETDURATION:${Math.ceil(o)}
`+(Number.isFinite(this.maxLiveSegmentCount)?`#EXT-X-MEDIA-SEQUENCE:${e.mediaSequence}
`:"")+`#EXT-X-INDEPENDENT-SEGMENTS
`+(a?`#EXT-X-I-FRAMES-ONLY
`:"")+(e.initSegment?`#EXT-X-MAP:URI="${e.initSegment.path}"`+(e.initSegment.byteOffset!==null?`,BYTERANGE="${e.initSegment.byteSize}@${e.initSegment.byteOffset}"`:"")+`
`:"")+`
`+e.writtenSegments.map(d=>`#EXTINF:${+d.duration.toFixed(12)},
`+(this.isRelativeToUnixEpoch?`#EXT-X-PROGRAM-DATE-TIME:${new Date(1e3*d.timestamp).toISOString()}
`:"")+(d.byteOffset!==null?`#EXT-X-BYTERANGE:${d.byteSize}@${d.byteOffset}
`:"")+`${d.path}
`).join("")+(e.done?(e.writtenSegments.length>0?`
`:"")+`#EXT-X-ENDLIST
`:"");this.format._options.onPlaylist?.(u,nc(e));let l=await this.output._getTarget({path:c,isRoot:!1,mimeType:Xt}),m=new rr(l,!0);m.start(),m.write(J.encode(u)),await m.flush(),await m.finalize()}async writeMasterPlaylist(){g(this.output._target instanceof it);let e=this.output._target,r=`#EXTM3U
`,n=!1,a=null,s=0,o=!1;for(let u of this.playlistDeclarations)if(u.groupId===null){let l=u.playlist.tracks[0].isVideoTrack()&&u.playlist.tracks[0].metadata.hasOnlyKeyPackets,m=[];for(let y of u.playlist.tracks){let T=this.trackDatas.find(w=>w.track===y)?.info.decoderConfig.codec??y.source._codec;m.push(T)}let d=0,f=0;if(u.references.length>0){let k=u.references[0].playlist.tracks[0],w=this.trackDatas.find(x=>x.track===k)?.info.decoderConfig.codec??k.source._codec;m.push(w);for(let x of u.references)g(x.playlist.peakBitrate!==null),d=Math.max(d,x.playlist.peakBitrate),f=Math.max(f,x.playlist.averageBitrate??0)}g(u.playlist.peakBitrate!==null);let p=u.playlist.peakBitrate+d,b=(u.playlist.averageBitrate??0)+f;n||(r+=`
`,n=!0),l?r+="#EXT-X-I-FRAME-STREAM-INF:":r+="#EXT-X-STREAM-INF:",r+=`BANDWIDTH=${Math.ceil(p)}`,b>0&&(r+=`,AVERAGE-BANDWIDTH=${Math.ceil(b)}`),r+=`,CODECS="${m.join(",")}"`;let h=u.playlist.tracks.find(y=>y.isVideoTrack());if(h?.isVideoTrack()){let k=this.trackDatas.find(T=>T.track===h)?.info.decoderConfig;if(k){let T=k.displayAspectWidth??k.codedWidth,w=k.displayAspectHeight??k.codedHeight;T!==void 0&&w!==void 0&&(h.metadata.rotation!==void 0&&h.metadata.rotation%180===90&&([T,w]=[w,T]),r+=`,RESOLUTION=${T}x${w}`)}!l&&h.metadata.frameRate!==void 0&&(r+=`,FRAME-RATE=${+h.metadata.frameRate.toFixed(3)}`)}if(!l){let y=new Map;for(let k of u.references){g(k.groupId!==null);let T=k.playlist.tracks[0].type;y.set(T,k.groupId)}for(let[k,T]of y)r+=`,${k.toUpperCase()}="${T}"`}l?(r+=`,URI="${u.playlist.path}"`,r+=`
`):(r+=`
`,r+=`${u.playlist.path}
`)}else{g(u.playlist.tracks.length===1);let l=u.playlist.tracks[0],m=l.type,d=l.metadata.name??null,f=l.metadata.languageCode,p=l.metadata.disposition;(a===null||u.groupId!==a)&&(s=0,r+=`
`,o=!1),a=u.groupId,s++,r+=`#EXT-X-MEDIA:TYPE=${m.toUpperCase()},GROUP-ID="${u.groupId}"`,d!==null&&/[\n\r"]/.test(d)&&(U._warn("Dropping track name since it includes a line feed, carriage return, or double quote character, which are not allowed in HLS playlist attributes."),d=null),d??=`${f??u.groupId}-${s}`,r+=`,NAME="${d}"`,f!==void 0&&(r+=`,LANGUAGE="${f}"`);let b=p?.primary??!1,h=p?.default??!0,y=p?.forced??!1;if(b&&!o&&(r+=",DEFAULT=YES",o=!0),(b||h)&&(r+=",AUTOSELECT=YES"),y&&(r+=",FORCED=YES"),m==="audio"){let T=this.trackDatas.find(w=>w.track===l)?.info.decoderConfig;T&&(r+=`,CHANNELS="${T.numberOfChannels}"`)}u.noUri||(r+=`,URI="${u.playlist.path}"`),r+=`
`}this.format._options.onMaster?.(r);let c=await this.mutex.acquire();try{let u;if(this.numWrittenMasterPlaylists===0)u=await this.output._getRootWriter(!0);else{let l=await this.output._getTarget({path:e.rootPath,isRoot:!0,mimeType:Xt});u=new rr(l,!0),u.start()}u.write(J.encode(r)),await u.flush(),await u.finalize(),this.numWrittenMasterPlaylists++}finally{c()}}async tryWriteMasterPlaylist(){g(this.isLive);for(let e of this.playlists)if(e.writtenSegments.length===0&&!e.done)return;await this.writeMasterPlaylist()}async finalize(){(await Promise.all(this.playlists.map(r=>r.mutex.acquire()))).forEach(r=>r());for(let r of this.trackDatas)r.closed=!0;await Promise.all(this.playlists.map(r=>r.done?Promise.resolve():this.advancePlaylist(r))),this.isLive||await this.writeMasterPlaylist()}},gg=i=>{if(typeof i!="string")throw new TypeError("options.getPlaylistPath must return or resolve to a string");if(/[\n\r"]/.test(i))throw new TypeError("Playlist paths cannot contain line feed, carriage return, or double quote characters.")},yf=i=>{if(typeof i!="string")throw new TypeError("options.getSegmentPath must return or resolve to a string");if(/[\n\r"]/.test(i))throw new TypeError("Segment paths cannot contain line feed or carriage return characters.")},bg=i=>{if(typeof i!="string")throw new TypeError("options.getInitPath must return or resolve to a string");if(/[\n\r"]/.test(i))throw new TypeError("Init paths cannot contain line feed, carriage return, or double quote characters.")},nc=i=>({n:i.id,tracks:i.tracks,segmentFormat:i.segmentFormat});var Ue=class{getSupportedVideoCodecs(){return this.getSupportedCodecs().filter(t=>ce.includes(t))}getSupportedAudioCodecs(){return this.getSupportedCodecs().filter(t=>fe.includes(t))}getSupportedSubtitleCodecs(){return this.getSupportedCodecs().filter(t=>He.includes(t))}_codecUnsupportedHint(t){return""}_isFragmentedIsobmff(){return!1}},Oi=class extends Ue{constructor(t={}){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.fastStart!==void 0&&![!1,"in-memory","reserve","fragmented"].includes(t.fastStart))throw new TypeError("options.fastStart, when provided, must be false, 'in-memory', 'reserve', or 'fragmented'.");if(t.minimumFragmentDuration!==void 0&&(!Me(t.minimumFragmentDuration)||t.minimumFragmentDuration<0))throw new TypeError("options.minimumFragmentDuration, when provided, must be a non-negative number.");if(t.onFtyp!==void 0&&typeof t.onFtyp!="function")throw new TypeError("options.onFtyp, when provided, must be a function.");if(t.onMoov!==void 0&&typeof t.onMoov!="function")throw new TypeError("options.onMoov, when provided, must be a function.");if(t.onMdat!==void 0&&typeof t.onMdat!="function")throw new TypeError("options.onMdat, when provided, must be a function.");if(t.onMoof!==void 0&&typeof t.onMoof!="function")throw new TypeError("options.onMoof, when provided, must be a function.");if(t.metadataFormat!==void 0&&!["mdir","mdta","udta","auto"].includes(t.metadataFormat))throw new TypeError("options.metadataFormat, when provided, must be either 'auto', 'mdir', 'mdta', or 'udta'.");super(),this._options=t}getSupportedTrackCounts(){return{video:{min:0,max:4294967295},audio:{min:0,max:4294967295},subtitle:{min:0,max:4294967295},total:{min:0,max:4294967295}}}get supportsVideoRotationMetadata(){return!0}get supportsTimestampedMediaData(){return!0}get negativeTimestampSupport(){return"full"}_createMuxer(t){return new qo(t,this)}_isFragmentedIsobmff(){return this._options.fastStart==="fragmented"}},Di=class extends Oi{constructor(t){super(t)}get _name(){return"MP4"}get fileExtension(){return".mp4"}get mimeType(){return"video/mp4"}getSupportedCodecs(){return[...ce,...ft,"pcm-s16","pcm-s16be","pcm-s24","pcm-s24be","pcm-s32","pcm-s32be","pcm-f32","pcm-f32be","pcm-f64","pcm-f64be",...He]}_codecUnsupportedHint(t){return new _i().getSupportedCodecs().includes(t)?" Switching to MOV will grant support for this codec.":""}},vi=class extends Oi{constructor(t){super(t)}get _name(){return"CMAF"}get fileExtension(){return".m4s"}get mimeType(){return"video/mp4"}getSupportedCodecs(){return[...ce,...ft,"pcm-s16","pcm-s16be","pcm-s24","pcm-s24be","pcm-s32","pcm-s32be","pcm-f32","pcm-f32be","pcm-f64","pcm-f64be",...He]}},_i=class extends Oi{constructor(t){super(t)}get _name(){return"MOV"}get fileExtension(){return".mov"}get mimeType(){return"video/quicktime"}getSupportedCodecs(){return[...ce,...fe]}_codecUnsupportedHint(t){return new Di().getSupportedCodecs().includes(t)?" Switching to MP4 will grant support for this codec.":""}},Pn=class extends Ue{constructor(t={}){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.appendOnly!==void 0&&typeof t.appendOnly!="boolean")throw new TypeError("options.appendOnly, when provided, must be a boolean.");if(t.minimumClusterDuration!==void 0&&(!Me(t.minimumClusterDuration)||t.minimumClusterDuration<0))throw new TypeError("options.minimumClusterDuration, when provided, must be a non-negative number.");if(t.onEbmlHeader!==void 0&&typeof t.onEbmlHeader!="function")throw new TypeError("options.onEbmlHeader, when provided, must be a function.");if(t.onSegmentHeader!==void 0&&typeof t.onSegmentHeader!="function")throw new TypeError("options.onHeader, when provided, must be a function.");if(t.onCluster!==void 0&&typeof t.onCluster!="function")throw new TypeError("options.onCluster, when provided, must be a function.");super(),this._options=t}_createMuxer(t){return new Ko(t,this)}get _name(){return"Matroska"}getSupportedTrackCounts(){return{video:{min:0,max:127},audio:{min:0,max:127},subtitle:{min:0,max:127},total:{min:0,max:127}}}get fileExtension(){return".mkv"}get mimeType(){return"video/x-matroska"}getSupportedCodecs(){return[...ce,...ft,...se.filter(t=>!["pcm-s8","pcm-f32be","pcm-f64be","ulaw","alaw"].includes(t)),...He]}get supportsVideoRotationMetadata(){return!1}get supportsTimestampedMediaData(){return!0}get negativeTimestampSupport(){return"prefer-non-negative"}},ci=class extends Pn{constructor(t){super(t)}getSupportedCodecs(){return[...ce.filter(t=>["vp8","vp9","av1"].includes(t)),...fe.filter(t=>["opus","vorbis"].includes(t)),...He]}get _name(){return"WebM"}get fileExtension(){return".webm"}get mimeType(){return"video/webm"}_codecUnsupportedHint(t){return new Pn().getSupportedCodecs().includes(t)?" Switching to MKV will grant support for this codec.":""}},sc=class extends Ue{constructor(t={}){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.xingHeader!==void 0&&typeof t.xingHeader!="boolean")throw new TypeError("options.xingHeader, when provided, must be a boolean.");if(t.onXingFrame!==void 0&&typeof t.onXingFrame!="function")throw new TypeError("options.onXingFrame, when provided, must be a function.");super(),this._options=t}_createMuxer(t){return new Go(t,this)}get _name(){return"MP3"}getSupportedTrackCounts(){return{video:{min:0,max:0},audio:{min:1,max:1},subtitle:{min:0,max:0},total:{min:1,max:1}}}get fileExtension(){return".mp3"}get mimeType(){return"audio/mpeg"}getSupportedCodecs(){return["mp3"]}get supportsVideoRotationMetadata(){return!1}get supportsTimestampedMediaData(){return!1}get negativeTimestampSupport(){return null}},oc=class extends Ue{constructor(t={}){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.large!==void 0&&typeof t.large!="boolean")throw new TypeError("options.large, when provided, must be a boolean.");if(t.metadataFormat!==void 0&&!["info","id3"].includes(t.metadataFormat))throw new TypeError("options.metadataFormat, when provided, must be either 'info' or 'id3'.");if(t.onHeader!==void 0&&typeof t.onHeader!="function")throw new TypeError("options.onHeader, when provided, must be a function.");super(),this._options=t}_createMuxer(t){return new Yo(t,this)}get _name(){return"WAVE"}getSupportedTrackCounts(){return{video:{min:0,max:0},audio:{min:1,max:1},subtitle:{min:0,max:0},total:{min:1,max:1}}}get fileExtension(){return".wav"}get mimeType(){return"audio/wav"}getSupportedCodecs(){return[...se.filter(t=>["pcm-s16","pcm-s24","pcm-s32","pcm-f32","pcm-f64","pcm-u8","ulaw","alaw"].includes(t))]}get supportsVideoRotationMetadata(){return!1}get supportsTimestampedMediaData(){return!1}get negativeTimestampSupport(){return null}},cc=class extends Ue{constructor(t={}){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.maximumPageDuration!==void 0&&(!Me(t.maximumPageDuration)||t.maximumPageDuration<=0))throw new TypeError("options.maximumPageDuration, when provided, must be a positive number.");if(t.onPage!==void 0&&typeof t.onPage!="function")throw new TypeError("options.onPage, when provided, must be a function.");super(),this._options=t}_createMuxer(t){return new jo(t,this)}get _name(){return"Ogg"}getSupportedTrackCounts(){return{video:{min:0,max:0},audio:{min:0,max:4294967296},subtitle:{min:0,max:0},total:{min:0,max:4294967296}}}get fileExtension(){return".ogg"}get mimeType(){return"application/ogg"}getSupportedCodecs(){return[...fe.filter(t=>["vorbis","opus"].includes(t))]}get supportsVideoRotationMetadata(){return!1}get supportsTimestampedMediaData(){return!1}get negativeTimestampSupport(){return null}},uc=class extends Ue{constructor(t={}){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.onFrame!==void 0&&typeof t.onFrame!="function")throw new TypeError("options.onFrame, when provided, must be a function.");super(),this._options=t}_createMuxer(t){return new Vo(t,this)}get _name(){return"ADTS"}getSupportedTrackCounts(){return{video:{min:0,max:0},audio:{min:1,max:1},subtitle:{min:0,max:0},total:{min:1,max:1}}}get fileExtension(){return".aac"}get mimeType(){return"audio/aac"}getSupportedCodecs(){return["aac"]}get supportsVideoRotationMetadata(){return!1}get supportsTimestampedMediaData(){return!1}get negativeTimestampSupport(){return null}},lc=class extends Ue{constructor(t={}){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.appendOnly!==void 0&&typeof t.appendOnly!="boolean")throw new TypeError("options.appendOnly, when provided, must be a boolean.");super(),this._options=t}_createMuxer(t){return new Uo(t,this)}get _name(){return"FLAC"}getSupportedTrackCounts(){return{video:{min:0,max:0},audio:{min:1,max:1},subtitle:{min:0,max:0},total:{min:1,max:1}}}get fileExtension(){return".flac"}get mimeType(){return"audio/flac"}getSupportedCodecs(){return["flac"]}get supportsVideoRotationMetadata(){return!1}get supportsTimestampedMediaData(){return!1}get negativeTimestampSupport(){return null}},dc=class extends Ue{constructor(t={}){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.onPacket!==void 0&&typeof t.onPacket!="function")throw new TypeError("options.onPacket, when provided, must be a function.");super(),this._options=t}_createMuxer(t){return new Xo(t,this)}get _name(){return"MPEG-TS"}getSupportedTrackCounts(){return{video:{min:0,max:16},audio:{min:0,max:32},subtitle:{min:0,max:0},total:{min:0,max:48}}}get fileExtension(){return".ts"}get mimeType(){return"video/MP2T"}getSupportedCodecs(){return[...ce.filter(t=>["avc","hevc"].includes(t)),...fe.filter(t=>["aac","mp3","ac3","eac3","dts"].includes(t))]}get supportsVideoRotationMetadata(){return!1}get supportsTimestampedMediaData(){return!0}get negativeTimestampSupport(){return"prefer-non-negative"}},mc=class extends Ue{constructor(t){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(!(t.segmentFormat instanceof Ue)&&(!Array.isArray(t.segmentFormat)||t.segmentFormat.length===0||!t.segmentFormat.every(e=>e instanceof Ue)))throw new TypeError("options.segmentFormat must be an OutputFormat or a non-empty array of OutputFormat instances.");if(t.targetDuration!==void 0&&(typeof t.targetDuration!="number"||t.targetDuration<=0))throw new TypeError("options.targetDuration, when provided, must be a positive number.");if(t.singleFilePerPlaylist!==void 0&&typeof t.singleFilePerPlaylist!="boolean")throw new TypeError("options.singleFilePerPlaylist, when provided, must be a boolean.");if(t.live!==void 0&&typeof t.live!="boolean")throw new TypeError("options.live, when provided, must be a boolean.");if(t.maxLiveSegmentCount!==void 0&&(typeof t.maxLiveSegmentCount!="number"||t.maxLiveSegmentCount<1||Number.isFinite(t.maxLiveSegmentCount)&&!Number.isInteger(t.maxLiveSegmentCount)))throw new TypeError("options.maxLiveSegmentCount, when provided, must be a positive integer or Infinity.");if(t.getPlaylistPath!==void 0&&typeof t.getPlaylistPath!="function")throw new TypeError("options.getPlaylistPath, when provided, must be a function.");if(t.getSegmentPath!==void 0&&typeof t.getSegmentPath!="function")throw new TypeError("options.getSegmentPath, when provided, must be a function.");if(t.getInitPath!==void 0&&typeof t.getInitPath!="function")throw new TypeError("options.getInitPath, when provided, must be a function.");if(t.onMaster!==void 0&&typeof t.onMaster!="function")throw new TypeError("options.onMaster, when provided, must be a function.");if(t.onPlaylist!==void 0&&typeof t.onPlaylist!="function")throw new TypeError("options.onPlaylist, when provided, must be a function.");if(t.onSegment!==void 0&&typeof t.onSegment!="function")throw new TypeError("options.onSegment, when provided, must be a function.");if(t.onInit!==void 0&&typeof t.onInit!="function")throw new TypeError("options.onInit, when provided, must be a function.");if(t.onSegmentPopped!==void 0&&typeof t.onSegmentPopped!="function")throw new TypeError("options.onSegmentPopped, when provided, must be a function.");super(),this._options=t}_createMuxer(t){return new ac(t,this)}get _name(){return"HTTP Live Streaming (HLS)"}get fileExtension(){return".m3u8"}get mimeType(){return Xt}getSupportedCodecs(){return[...new Set(qt(this._options.segmentFormat).flatMap(e=>e.getSupportedCodecs()))]}getSupportedTrackCounts(){let t=!1,e=!1,r=!1;for(let n of qt(this._options.segmentFormat)){let a=n.getSupportedTrackCounts();t||=a.video.max>0,e||=a.audio.max>0,r||=a.subtitle.max>0}return{video:{min:0,max:t?1/0:0},audio:{min:0,max:e?1/0:0},subtitle:{min:0,max:0},total:{min:0,max:1/0}}}get supportsVideoRotationMetadata(){return qt(this._options.segmentFormat).some(t=>t.supportsVideoRotationMetadata)}get supportsTimestampedMediaData(){return!0}get negativeTimestampSupport(){let t=qt(this._options.segmentFormat);return t.some(e=>e.negativeTimestampSupport==="none")?"none":t.some(e=>e.negativeTimestampSupport==="prefer-non-negative")?"prefer-non-negative":t.some(e=>e.negativeTimestampSupport==="full")?"full":null}_codecUnsupportedHint(t){return" Using different segment formats may grant support for this codec."}};var fc=["video","audio","subtitle"],Vi=class i{constructor(t,e,r,n,a){this.id=t,this.output=e,this.type=r,this.source=n,this.metadata=a}isVideoTrack(){return this.type==="video"}isAudioTrack(){return this.type==="audio"}isSubtitleTrack(){return this.type==="subtitle"}canBePairedWith(t){if(!(t instanceof i))throw new TypeError("other must be an OutputTrack.");if(this===t)return!1;let e=qt(this.metadata.group),r=qt(t.metadata.group);for(let n of e)if(this.type!==t.type&&r.some(o=>n===o)||r.some(o=>n._pairedGroups.has(o)))return!0;return!1}},Va=class extends Vi{constructor(t,e,r,n){super(t,e,"video",r,n)}},Ua=class extends Vi{constructor(t,e,r,n){super(t,e,"audio",r,n)}},za=class extends Vi{constructor(t,e,r,n){super(t,e,"subtitle",r,n)}},nt=class i{constructor(){this._pairedGroups=new Set}pairWith(t){if(!(t instanceof i))throw new TypeError("other must be an OutputTrackGroup.");if(this===t)throw new TypeError("Cannot pair a group with itself.");this._pairedGroups.add(t),t._pairedGroups.add(this)}},nl=i=>{if(!i||typeof i!="object")throw new TypeError("metadata must be an object.");if(i.languageCode!==void 0&&!dr(i.languageCode))throw new TypeError("metadata.languageCode, when provided, must be a three-letter, ISO 639-2/T language code.");if(i.name!==void 0&&typeof i.name!="string")throw new TypeError("metadata.name, when provided, must be a string.");if(i.disposition!==void 0&&Fl(i.disposition),i.maximumPacketCount!==void 0&&(!Number.isInteger(i.maximumPacketCount)||i.maximumPacketCount<0))throw new TypeError("metadata.maximumPacketCount, when provided, must be a non-negative integer.");if(i.group!==void 0&&!(i.group instanceof nt)&&(!Array.isArray(i.group)||i.group.some(t=>!(t instanceof nt))))throw new TypeError("metadata.group, when provided, must be an OutputTrackGroup instance or an array of OutputTrackGroup instances.")},ar=class extends Ge{constructor(e){super();this.state="pending";this.defaultTrackGroup=new nt;this.tracks=[];this._onFinalize=null;this._unfinalizedTargets=new Set;this._rootWriterPromise=null;this._startPromise=null;this._cancelPromise=null;this._finalizePromise=null;this._mutex=new ze;this._metadataTags={};this._rootTarget=null;this._rootTargetPromise=null;this._firstMediaStreamTimestamp=null;if(!e||typeof e!="object")throw new TypeError("options must be an object.");if(!(e.format instanceof Ue))throw new TypeError("options.format must be an OutputFormat.");if(!(e.target instanceof Fe||e.target instanceof it))throw new TypeError("options.target must be a Target or a PathedTarget.");if(e.target instanceof Fe&&this._rememberTarget(e.target),e.initTarget!==void 0&&!(e.initTarget instanceof Fe)&&typeof e.initTarget!="function")throw new Error("options.initTarget, when provided, must be a Target or a function that returns or resolves to a Target.");if(e.onFinalize!==void 0&&typeof e.onFinalize!="function")throw new TypeError("options.onFinalize, when provided, must be a function.");this.format=e.format,this._target=e.target,this._onFinalize=e.onFinalize??null,this._initTarget=e.initTarget??null,this._initTarget instanceof Fe&&this._rememberTarget(this._initTarget),this._muxer=e.format._createMuxer(this)}get target(){let e="Output.target cannot be used when using PathedTarget with an async callback. Use the 'target' event instead.";if(this._rootTargetPromise)throw new TypeError(e);let r=this._getRootTarget();if(v(r))throw new TypeError(e);return r}_getTargetValidated(e){g(this._target instanceof it);let r=this._target.getTarget(e),n=a=>{if(!(a instanceof Fe))throw new TypeError("getTarget must return a Target.");return a};return v(r)?r.then(n):n(r)}async _getTarget(e){g(this._target instanceof it);let r=await this._getTargetValidated(e);return this._emit("target",{target:r,request:e,isRoot:e.isRoot}),this.state==="canceled"?await r._close():this._rememberTarget(r),r}_rememberTarget(e){this._unfinalizedTargets.add(e),e.on("finalized",()=>this._unfinalizedTargets.delete(e),{once:!0})}async _getInitTarget(){if(g(this._initTarget!==null),this._initTarget instanceof Fe)return this._initTarget;let e=await this._initTarget();return this.state==="canceled"?await e._close():this._rememberTarget(e),e}_hasInitTarget(){return this._initTarget!==null}_getRootTarget(){if(this._rootTarget)return this._rootTarget;if(this._rootTargetPromise)return this._rootTargetPromise;if(this._target instanceof Fe)return this._emit("target",{target:this._target,request:null,isRoot:!0}),this._rootTarget=this._target,this._target;let e={path:this._target.rootPath,isRoot:!0,mimeType:this.format.mimeType},r=this._getTargetValidated(e),n=a=>(this.state==="canceled"?a._close():this._rememberTarget(a),this._emit("target",{target:a,request:e,isRoot:!0}),this._rootTarget=a,a);return v(r)?this._rootTargetPromise=r.then(n):n(r)}_getRootWriter(e){return this._rootWriterPromise??=(async()=>{let r=await this._getRootTarget(),n=new rr(r,typeof e=="boolean"?e:e(r));return n.start(),n})()}addVideoTrack(e,r={}){if(!(e instanceof ir))throw new TypeError("source must be a VideoSource.");if(nl(r),r.rotation!==void 0&&![0,90,180,270].includes(r.rotation))throw new TypeError(`Invalid video rotation: ${r.rotation}. Has to be 0, 90, 180 or 270.`);if(!this.format.supportsVideoRotationMetadata&&r.rotation)throw new Error(`${this.format._name} does not support video rotation metadata.`);if(r.frameRate!==void 0&&(!Number.isFinite(r.frameRate)||r.frameRate<=0))throw new TypeError(`Invalid video frame rate: ${r.frameRate}. Must be a positive number.`);if(r.decoderConfig!==void 0&&jt({decoderConfig:r.decoderConfig},e._codec),r.primingPacket!==void 0){if(!(r.primingPacket instanceof j))throw new TypeError("metadata.primingPacket, when provided, must be an EncodedPacket.");if(r.decoderConfig===void 0)throw new TypeError("metadata.primingPacket can only be provided alongside metadata.decoderConfig.")}let n={...r};return n.group??=this.defaultTrackGroup,this._addTrack(new Va(this.tracks.length+1,this,e,n))}addAudioTrack(e,r={}){if(!(e instanceof nr))throw new TypeError("source must be an AudioSource.");if(nl(r),r.decoderConfig!==void 0&&Pe({decoderConfig:r.decoderConfig},e._codec),r.primingPacket!==void 0){if(!(r.primingPacket instanceof j))throw new TypeError("metadata.primingPacket, when provided, must be an EncodedPacket.");if(r.decoderConfig===void 0)throw new TypeError("metadata.primingPacket can only be provided alongside metadata.decoderConfig.")}let n={...r};return n.group??=this.defaultTrackGroup,this._addTrack(new Ua(this.tracks.length+1,this,e,n))}addSubtitleTrack(e,r={}){if(!(e instanceof Bi))throw new TypeError("source must be a SubtitleSource.");nl(r);let n={...r};return n.group??=this.defaultTrackGroup,this._addTrack(new za(this.tracks.length+1,this,e,n))}setMetadataTags(e){if(Bn(e),this.state!=="pending")throw new Error("Cannot set metadata tags after output has been started or canceled.");this._metadataTags=e}_addTrack(e){if(this.state!=="pending")throw new Error("Cannot add track after output has been started or canceled.");if(e.source._connectedTrack)throw new Error("Source is already used for a track.");let r=this.format.getSupportedTrackCounts(),n=this.tracks.reduce((o,c)=>o+(c.type===e.type?1:0),0),a=r[e.type].max;if(n===a)throw new Error(a===0?`${this.format._name} does not support ${e.type} tracks.`:`${this.format._name} does not support more than ${a} ${e.type} track${a===1?"":"s"}.`);let s=r.total.max;if(this.tracks.length===s)throw new Error(`${this.format._name} does not support more than ${s} tracks${s===1?"":"s"} in total.`);if(e.isVideoTrack()){let o=this.format.getSupportedVideoCodecs();if(o.length===0)throw new Error(`${this.format._name} does not support video tracks.`+this.format._codecUnsupportedHint(e.source._codec));if(!o.includes(e.source._codec))throw new Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported video codecs are: ${o.map(c=>`'${c}'`).join(", ")}.`+this.format._codecUnsupportedHint(e.source._codec))}else if(e.isAudioTrack()){let o=this.format.getSupportedAudioCodecs();if(o.length===0)throw new Error(`${this.format._name} does not support audio tracks.`+this.format._codecUnsupportedHint(e.source._codec));if(!o.includes(e.source._codec))throw new Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported audio codecs are: ${o.map(c=>`'${c}'`).join(", ")}.`+this.format._codecUnsupportedHint(e.source._codec))}else if(e.isSubtitleTrack()){let o=this.format.getSupportedSubtitleCodecs();if(o.length===0)throw new Error(`${this.format._name} does not support subtitle tracks.`+this.format._codecUnsupportedHint(e.source._codec));if(!o.includes(e.source._codec))throw new Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported subtitle codecs are: ${o.map(c=>`'${c}'`).join(", ")}.`+this.format._codecUnsupportedHint(e.source._codec))}return this.tracks.push(e),e.source._connectedTrack=e,e}hasEnoughTracks(){let e=this.format.getSupportedTrackCounts();for(let n of fc){let a=this.tracks.reduce((o,c)=>o+(c.type===n?1:0),0),s=e[n].min;if(a<s)return!1}let r=e.total.min;return!(this.tracks.length<r)}async start(){let e=this.format.getSupportedTrackCounts();for(let n of fc){let a=this.tracks.reduce((o,c)=>o+(c.type===n?1:0),0),s=e[n].min;if(a<s)throw new Error(s===e[n].max?`${this.format._name} requires exactly ${s} ${n} track${s===1?"":"s"}.`:`${this.format._name} requires at least ${s} ${n} track${s===1?"":"s"}.`)}let r=e.total.min;if(this.tracks.length<r)throw new Error(r===e.total.max?`${this.format._name} requires exactly ${r} track${r===1?"":"s"}.`:`${this.format._name} requires at least ${r} track${r===1?"":"s"}.`);if(this.state==="canceled")throw new Error("Output has been canceled.");return this._startPromise?(U._warn("Output has already been started."),this._startPromise):this._startPromise=(async()=>{this.state="started";let n=this._mutex.acquire();try{await this._muxer.start();let a=this.tracks.map(s=>s.source._start());await Promise.all(a)}finally{(await n)()}})()}getMimeType(){return this._muxer.getMimeType()}async cancel(){if(this._cancelPromise)return U._warn("Output has already been canceled."),this._cancelPromise;if(this.state==="finalizing"||this.state==="finalized"){this.state==="finalized"&&U._warn("Output has already been finalized.");return}return this._cancelPromise=(async()=>{this.state="canceled";let e=await this._mutex.acquire();try{let r=this.tracks.map(n=>n.source._flushOrWaitForOngoingClose(!0));await Promise.all(r),await Promise.all([...this._unfinalizedTargets].map(n=>n._close())),this._unfinalizedTargets.clear()}finally{e()}})()}async finalize(){if(this.state==="pending")throw new Error("Cannot finalize before starting.");if(this.state==="canceled")throw new Error("Cannot finalize after canceling.");return this._finalizePromise?(U._warn("Output has already been finalized."),this._finalizePromise):this._finalizePromise=(async()=>{this.state="finalizing";let e=await this._mutex.acquire();try{let r=this.tracks.map(n=>n.source._flushOrWaitForOngoingClose(!1));if(await Promise.all(r),await this._muxer.finalize(),this._rootWriterPromise){let n=await this._rootWriterPromise;n.finalized||(await n.flush(),await n.finalize())}this._onFinalize&&await this._onFinalize(),this.state="finalized"}finally{await Promise.all([...this._unfinalizedTargets].map(r=>r._close().catch(()=>{}))),this._unfinalizedTargets.clear(),e()}})()}};var pc=i=>{if(!i||typeof i!="object")throw new TypeError("options.video, when provided, must be an object.");if(i?.discard!==void 0&&typeof i.discard!="boolean")throw new TypeError("options.video.discard, when provided, must be a boolean.");if(i?.forceTranscode!==void 0&&typeof i.forceTranscode!="boolean")throw new TypeError("options.video.forceTranscode, when provided, must be a boolean.");if(i?.codec!==void 0&&!ce.includes(i.codec))throw new TypeError(`options.video.codec, when provided, must be one of: ${ce.join(", ")}.`);let t=i?.bitrate;if(i?.quality!==void 0&&!(i.quality instanceof de))throw new TypeError("options.video.quality, when provided, must be a Quality.");if(i?.quality!==void 0&&t!==void 0)throw new TypeError("options.video.quality and options.video.bitrate cannot both be provided.");if(t!==void 0&&!(t instanceof de)&&(!Number.isInteger(t)||t<=0))throw new TypeError("options.video.bitrate, when provided, must be a positive integer or a quality.");if(i?.width!==void 0&&(!Number.isInteger(i.width)||i.width<=0))throw new TypeError("options.video.width, when provided, must be a positive integer.");if(i?.height!==void 0&&(!Number.isInteger(i.height)||i.height<=0))throw new TypeError("options.video.height, when provided, must be a positive integer.");if(i?.fit!==void 0&&!["fill","contain","cover"].includes(i.fit))throw new TypeError("options.video.fit, when provided, must be one of 'fill', 'contain', or 'cover'.");if(i?.width!==void 0&&i.height!==void 0&&i.fit===void 0)throw new TypeError("When both options.video.width and options.video.height are provided, options.video.fit must also be provided.");if(i?.rotate!==void 0&&![0,90,180,270].includes(i.rotate))throw new TypeError("options.video.rotate, when provided, must be 0, 90, 180 or 270.");if(i?.allowRotationMetadata!==void 0&&typeof i.allowRotationMetadata!="boolean")throw new TypeError("options.video.allowRotationMetadata, when provided, must be a boolean.");if(i?.crop!==void 0&&Zr(i.crop,"options.video."),i?.frameRate!==void 0&&(!Number.isFinite(i.frameRate)||i.frameRate<=0))throw new TypeError("options.video.frameRate, when provided, must be a finite positive number.");if(i?.alpha!==void 0&&!["discard","keep"].includes(i.alpha))throw new TypeError("options.video.alpha, when provided, must be either 'discard' or 'keep'.");if(i?.keyFrameInterval!==void 0&&(!Number.isFinite(i.keyFrameInterval)||i.keyFrameInterval<0))throw new TypeError("options.video.keyFrameInterval, when provided, must be a non-negative number.");if(i?.process!==void 0&&typeof i.process!="function")throw new TypeError("options.video.process, when provided, must be a function.");if(i?.processedWidth!==void 0&&(!Number.isInteger(i.processedWidth)||i.processedWidth<=0))throw new TypeError("options.video.processedWidth, when provided, must be a positive integer.");if(i?.processedHeight!==void 0&&(!Number.isInteger(i.processedHeight)||i.processedHeight<=0))throw new TypeError("options.video.processedHeight, when provided, must be a positive integer.");if(i?.hardwareAcceleration!==void 0&&!["no-preference","prefer-hardware","prefer-software"].includes(i.hardwareAcceleration))throw new TypeError("options.video.hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");if(i?.group!==void 0&&!(i.group instanceof nt||Array.isArray(i.group)&&i.group.every(e=>e instanceof nt)))throw new TypeError("options.video.group, when provided, must be an OutputTrackGroup or an array of OutputTrackGroups.")},hc=i=>{if(!i||typeof i!="object")throw new TypeError("options.audio, when provided, must be an object.");if(i?.discard!==void 0&&typeof i.discard!="boolean")throw new TypeError("options.audio.discard, when provided, must be a boolean.");if(i?.forceTranscode!==void 0&&typeof i.forceTranscode!="boolean")throw new TypeError("options.audio.forceTranscode, when provided, must be a boolean.");if(i?.codec!==void 0&&!fe.includes(i.codec))throw new TypeError(`options.audio.codec, when provided, must be one of: ${fe.join(", ")}.`);let t=i?.bitrate;if(i?.quality!==void 0&&!(i.quality instanceof de))throw new TypeError("options.audio.quality, when provided, must be a Quality.");if(i?.quality!==void 0&&t!==void 0)throw new TypeError("options.audio.quality and options.audio.bitrate cannot both be provided.");if(t!==void 0&&!(t instanceof de)&&(!Number.isInteger(t)||t<=0))throw new TypeError("options.audio.bitrate, when provided, must be a positive integer or a quality.");if(i?.numberOfChannels!==void 0&&(!Number.isInteger(i.numberOfChannels)||i.numberOfChannels<=0))throw new TypeError("options.audio.numberOfChannels, when provided, must be a positive integer.");if(i?.sampleRate!==void 0&&(!Number.isInteger(i.sampleRate)||i.sampleRate<=0))throw new TypeError("options.audio.sampleRate, when provided, must be a positive integer.");if(i?.sampleFormat!==void 0&&!["u8","s16","s32","f32"].includes(i.sampleFormat))throw new TypeError("options.audio.sampleFormat, when provided, must be one of: u8, s16, s32, f32.");if(i?.process!==void 0&&typeof i.process!="function")throw new TypeError("options.audio.process, when provided, must be a function.");if(i?.processedNumberOfChannels!==void 0&&(!Number.isInteger(i.processedNumberOfChannels)||i.processedNumberOfChannels<=0))throw new TypeError("options.audio.processedNumberOfChannels, when provided, must be a positive integer.");if(i?.processedSampleRate!==void 0&&(!Number.isInteger(i.processedSampleRate)||i.processedSampleRate<=0))throw new TypeError("options.audio.processedSampleRate, when provided, must be a positive integer.");if(i?.group!==void 0&&!(i.group instanceof nt||Array.isArray(i.group)&&i.group.every(e=>e instanceof nt)))throw new TypeError("options.audio.group, when provided, must be an OutputTrackGroup or an array of OutputTrackGroups.")},al=2,sl=48e3,gc=class i{constructor(t){this._state="idle";this._timestampOffset=0;this._timestampOffsetAdjusted=!1;this._copyTimestampPossible=new Map;this._copyStartPackets=new Map;this._nextOutputTrackId=0;this._outputTrackIds=[];this._outputOwnTrackGroups=[];this._trackPumps=[];this._composable=!1;this._executed=!1;this._executionUntil=1/0;this._pauseRequested=!1;this._synchronizer=new ol(this);this._totalDuration=null;this._maxTimestamps=new Map;this.onProgress=void 0;this._computeProgress=!1;this._lastProgress=0;this.isValid=!1;this.utilizedTracks=[];this.discardedTracks=[];if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(!(t.input instanceof Xr))throw new TypeError("options.input must be an Input.");if(!(t.output instanceof ar))throw new TypeError("options.output must be an Output.");if(t.tracks!==void 0&&t.tracks!=="all"&&t.tracks!=="primary")throw new TypeError("options.tracks, when provided, must be either 'all' or 'primary'.");if(t.composable!==void 0&&typeof t.composable!="boolean")throw new TypeError("options.composable, when provided, must be a boolean.");if(t.copy!==void 0&&t.copy!==!1){if(!t.copy||typeof t.copy!="object")throw new TypeError("options.copy, when provided, must be an object or false.");if(t.copy.mode!==void 0&&!["forced","preferred"].includes(t.copy.mode))throw new TypeError("options.copy.mode, when provided, must be 'forced' or 'preferred'.");if(t.copy.shiftTolerance!==void 0&&(!Me(t.copy.shiftTolerance)||t.copy.shiftTolerance<0))throw new TypeError("options.copy.shiftTolerance, when provided, must be a non-negative number.");if(t.copy.boundaryPolicy!==void 0&&!["expand","shrink"].includes(t.copy.boundaryPolicy))throw new TypeError("options.copy.boundaryPolicy, when provided, must be 'expand' or 'shrink'.")}let e=t.composable??!1;if(e){if(t.tags!==void 0)throw new TypeError("options.tags cannot be set by a composable conversion; set metadata directly on the output instead.");if(t.output.state!=="pending")throw new TypeError("options.output must not have been started yet.")}else if(t.output.tracks.length>0||Object.keys(t.output._metadataTags).length>0||t.output.state!=="pending")throw new TypeError("options.output must be fresh: no tracks or metadata tags added and not started.");if(t.video!==void 0&&typeof t.video!="function")if(Array.isArray(t.video))for(let r of t.video)pc(r);else pc(t.video);if(t.audio!==void 0&&typeof t.audio!="function")if(Array.isArray(t.audio))for(let r of t.audio)hc(r);else hc(t.audio);if(t.trim!==void 0&&(!t.trim||typeof t.trim!="object"))throw new TypeError("options.trim, when provided, must be an object.");if(t.trim?.start!==void 0&&!Number.isFinite(t.trim.start))throw new TypeError("options.trim.start, when provided, must be a finite number.");if(t.trim?.end!==void 0&&!Me(t.trim.end))throw new TypeError("options.trim.end, when provided, must be a number.");if(t.trim?.start!==void 0&&t.trim.end!==void 0&&t.trim.start>=t.trim.end)throw new TypeError("options.trim.start must be less than options.trim.end.");if(t.tags!==void 0&&(typeof t.tags!="object"||!t.tags)&&typeof t.tags!="function")throw new TypeError("options.tags, when provided, must be an object or a function.");if(typeof t.tags=="object"&&Bn(t.tags),t.showWarnings!==void 0&&typeof t.showWarnings!="boolean")throw new TypeError("options.showWarnings, when provided, must be a boolean.");this._options=t,this._copyMode=t.copy===!1?!1:t.copy?.mode??"preferred",this._copyTimestampShiftTolerance=t.copy===!1?0:t.copy?.shiftTolerance??0,this._copyBoundaryPolicy=t.copy===!1?"expand":t.copy?.boundaryPolicy??"expand",this._composable=e,this.input=t.input,this.output=t.output}get state(){return this._state}static async init(t){let e=new i(t);return await e._init(),e}async _init(){let t=await this.input.getFormat(),e,r=this._options.tracks;if(r===void 0&&(r=t.name.includes("(HLS)")?"primary":"all"),r==="all")e=await this.input.getTracks();else if(r==="primary"){let u=await this.input.getPrimaryVideoTrack(),l=await this.input.getPrimaryAudioTrack();e=[u,l].filter(m=>m!==null)}else ie(r),g(!1);let n=this.output.format.getSupportedTrackCounts(),a=1,s=1,o=[],c=[];for(let u of e){let l;if(u.isVideoTrack())if(this._options.video)if(typeof this._options.video=="function"){let f=await this._options.video(u,a)??{};if(Array.isArray(f))for(let p of f)pc(p);else pc(f);l=Array.isArray(f)?f:[f],a++}else l=Array.isArray(this._options.video)?this._options.video:[this._options.video];else l=[{}];else if(u.isAudioTrack())if(this._options.audio)if(typeof this._options.audio=="function"){let f=await this._options.audio(u,s)??{};if(Array.isArray(f))for(let p of f)hc(p);else hc(f);l=Array.isArray(f)?f:[f],s++}else l=Array.isArray(this._options.audio)?this._options.audio:[this._options.audio];else l=[{}];else g(!1);let m=l.filter(f=>f.discard);for(let f of m)this.discardedTracks.push({track:u,reason:"discarded_by_user",trackOptions:f});if(l.length===m.length){l.length===0&&this.discardedTracks.push({track:u,reason:"discarded_by_user",trackOptions:{}});continue}let d=l.filter(f=>!f.discard);o.push(u),c.push(d)}this._options.trim?.start!==void 0?this._startTimestamp=this._options.trim.start:this._startTimestamp=Math.max(await this.input.getFirstTimestamp(o),0),this._endTimestamp=Math.max(this._options.trim?.end??1/0,this._startTimestamp),this._timestampOffset=-this._startTimestamp;for(let u=0;u<o.length;u++){let l=o[u],m=c[u];for(let d of m){if(this.output.tracks.length===n.total.max){this.discardedTracks.push({track:l,reason:"max_track_count_reached",trackOptions:d});continue}if(this.output.tracks.reduce((b,h)=>b+(h.type===l.type?1:0),0)===n[l.type].max){this.discardedTracks.push({track:l,reason:"max_track_count_of_type_reached",trackOptions:d});continue}let p=this._nextOutputTrackId++;l.isVideoTrack()?await this._processVideoTrack(l,d,p):l.isAudioTrack()?await this._processAudioTrack(l,d,p):g(!1)}}for(let u=0;u<this.utilizedTracks.length-1;u++)for(let l=u+1;l<this.utilizedTracks.length;l++){let m=this.utilizedTracks[u],d=this.utilizedTracks[l],f=this._outputOwnTrackGroups[u],p=this._outputOwnTrackGroups[l];g(f!==void 0),g(p!==void 0),f&&p&&m.canBePairedWith(d)&&f.pairWith(p)}if(!this._composable){let u=await this.input.getMetadataTags(),l;if(this._options.tags){let f=typeof this._options.tags=="function"?await this._options.tags(u):this._options.tags;Bn(f),l=f}else l=u;let m=t.mimeType===this.output.format.mimeType;u.raw===l.raw&&!m&&delete l.raw,this.output.setMetadataTags(l)}if(this._composable?this.isValid=!0:this.isValid=this.output.hasEnoughTracks()&&this.output.tracks.length>0,this._options.showWarnings??!0){let u=[],l=this.discardedTracks.filter(m=>m.reason!=="discarded_by_user");l.length>0&&u.push("Some tracks had to be discarded from the conversion:",l),this.isValid||(u.length>0&&u.push(`

`),u.push(this._getInvalidityExplanation().join(""))),u.length>0&&U._warn(...u)}}_getInvalidityExplanation(){let t=[];if(this.discardedTracks.length===0)t.push("Due to missing tracks, this conversion cannot be executed.");else{let e=this.discardedTracks.every(r=>r.reason==="discarded_by_user"||r.reason==="no_encodable_target_codec")&&this.discardedTracks.some(r=>r.reason==="no_encodable_target_codec");if(t.push("Due to discarded tracks, this conversion cannot be executed."),e){let r=this.discardedTracks.flatMap(a=>{if(a.reason==="discarded_by_user")return[];let s;return a.track.type==="video"?s=this.output.format.getSupportedVideoCodecs():a.track.type==="audio"?s=this.output.format.getSupportedAudioCodecs():s=this.output.format.getSupportedSubtitleCodecs(),s.filter(o=>!a.trackOptions.codec||o===a.trackOptions.codec)}),n=[...new Set(r)];n.length===1?t.push(`
Tracks were discarded because your environment is not able to encode '${n[0]}' with the provided parameters.`):t.push(`
Tracks were discarded because your environment is not able to encode any of the codecs ${n.map(a=>`'${a}'`).join(", ")} with the provided parameters.`),n.includes("mp3")&&t.push(`
The @mediabunny/mp3-encoder extension package provides support for encoding MP3.`),n.includes("aac")&&t.push(`
The @mediabunny/aac-encoder extension package provides support for encoding AAC.`),(n.includes("ac3")||n.includes("eac3"))&&t.push(`
The @mediabunny/ac3 extension package provides support for encoding and decoding AC-3/E-AC-3.`),n.includes("flac")&&t.push(`
The @mediabunny/flac-encoder extension package provides support for encoding FLAC.`)}else t.push(`
Check the discardedTracks field for more info.`)}return t}async execute(t={}){if(!t||typeof t!="object")throw new TypeError("options must be an object.");if(t.until!==void 0&&(typeof t.until!="number"||Number.isNaN(t.until)))throw new TypeError("options.until, when provided, must be a number.");if(t.pauseSignal!==void 0&&!(t.pauseSignal instanceof AbortSignal))throw new TypeError("options.pauseSignal, when provided, must be an AbortSignal.");if(!this.isValid)throw new Error(`Cannot execute this conversion because its output configuration is invalid. Make sure to always check the isValid field before executing a conversion.
`+this._getInvalidityExplanation().join(""));if(this._state==="executing")throw new Error("Cannot call execute() while a previous call to execute() is still running.");if(this._state==="canceled")throw new In;if(this._state==="done")return;if(this._composable&&this.output.state==="pending")throw new Error("A composable conversion requires the output to be started. Call start() on the output before executing the conversion.");this._state="executing",this._executionUntil=t.until??1/0,this._pauseRequested=t.pauseSignal?.aborted??!1;let e=()=>{this._state==="executing"&&(this._pauseRequested=!0,this._synchronizer.resolveAll())};t.pauseSignal?.addEventListener("abort",e);for(let n of this._trackPumps)n.done||(n.resolvers=te());if(this._executed)for(let n of this._trackPumps)n.wake?.();else{this._executed=!0;for(let n of this._outputTrackIds)this._synchronizer.declareTrack(n);if(this.onProgress){let a=[...new Set(this.utilizedTracks)].map(async o=>await o.isLive()?1/0:await o.getDurationFromMetadata()??await o.computeDuration()),s=Math.max(0,...await Promise.all(a));this._computeProgress=!0,this._totalDuration=Math.min(s-this._startTimestamp,this._endTimestamp-this._startTimestamp);for(let o of this._outputTrackIds)this._maxTimestamps.set(o,0);this.onProgress?.(0,0)}this._composable||await this.output.start();for(let n of this._trackPumps)n.start()}try{await Promise.all(this._trackPumps.map(n=>n.resolvers.promise))}catch(n){throw this._state!=="canceled"&&this.cancel(),n}finally{t.pauseSignal?.removeEventListener("abort",e)}if(this._state==="canceled")throw new In;let r=this._trackPumps.every(n=>n.done);if(this._state=r?"done":"idle",r&&(this._composable||await this.output.finalize(),this._computeProgress)){let n=Math.min(...this._maxTimestamps.values());this.onProgress?.(1,n)}}async cancel(){if(this._state!=="done"){if(this._state==="canceled"){U._warn("Conversion already canceled.");return}this._state="canceled";for(let t of this._trackPumps)t.wake?.();this._synchronizer.resolveAll(),this._composable||await this.output.cancel()}}async _processVideoTrack(t,e,r){let n=await t.getCodec();if(!n){this.discardedTracks.push({track:t,reason:"unknown_source_codec",trackOptions:e});return}let a,s=await t.getRotation(),o=kt(s+(e.rotate??0)),c=o,u=this.output.format.supportsVideoRotationMetadata&&(e.allowRotationMetadata??!0),l=await t.getSquarePixelWidth(),m=await t.getSquarePixelHeight(),[d,f]=o%180===0?[l,m]:[m,l],p=e.crop;p&&(p=fn(p,d,f));let[b,h]=p?[p.width,p.height]:[d,f],y=b,k=h,T=y/k;e.width!==void 0&&e.height===void 0?(y=gi(e.width),k=gi(Math.round(y/T))):e.width===void 0&&e.height!==void 0?(k=gi(e.height),y=gi(Math.round(k*T))):e.width!==void 0&&e.height!==void 0&&(y=gi(e.width),k=gi(e.height));let w=this.output.format.getSupportedVideoCodecs(),x=e.alpha??"discard",C=!this._copyMode||!!e.forceTranscode||!!e.frameRate||e.keyFrameInterval!==void 0||e.process!==void 0||e.quality!==void 0||e.bitrate!==void 0||!w.includes(n)||e.codec&&e.codec!==n||y!==b||k!==h||o!==0&&!u||!!p,P=null;if(!C){let B=new et(t),W=await B.getKeyPacket(this._startTimestamp,{verifyKeyPackets:!0})??await B.getFirstKeyPacket({verifyKeyPackets:!0});if(W&&W.timestamp<this._startTimestamp&&W.timestamp+W.duration<=this._startTimestamp&&this._copyBoundaryPolicy==="shrink"&&(W=await B.getNextKeyPacket(W,{verifyKeyPackets:!0})),P=W,W){let Y=this._copyBoundaryPolicy==="shrink"?Math.max(W.timestamp,this._startTimestamp):W.timestamp;if(this.output.format.supportsTimestampedMediaData){if(this.output.format.negativeTimestampSupport!=="full"&&Y<this._startTimestamp){let G=Math.min(this._startTimestamp-Y,this._copyTimestampShiftTolerance);Y+G>=this._startTimestamp||this.output.format.negativeTimestampSupport==="prefer-non-negative"&&this._copyMode==="forced"?this._timestampOffset=Math.max(this._timestampOffset,-this._startTimestamp+G):C=!0}}else if(this._timestampOffsetAdjusted)Y+this._timestampOffset===0||(C=!0);else{let G=ne(this._startTimestamp-Y,-this._copyTimestampShiftTolerance,this._copyTimestampShiftTolerance);Y+G===this._startTimestamp?(this._timestampOffset=-this._startTimestamp+G,this._timestampOffsetAdjusted=!0):C=!0}}}if(C&&this._copyMode==="forced"){this.discardedTracks.push({track:t,reason:"cannot_copy",trackOptions:e});return}if(C){if(!await t.canDecode()){this.discardedTracks.push({track:t,reason:"undecodable_source_codec",trackOptions:e});return}e.codec&&(w=w.filter(ge=>ge===e.codec));let W=Jr(e.quality,e.bitrate)??new de("high"),Y=await Mo(w,{width:e.process&&e.processedWidth?e.processedWidth:y,height:e.process&&e.processedHeight?e.processedHeight:k,quality:W});if(!Y){this.discardedTracks.push({track:t,reason:"no_encodable_target_codec",trackOptions:e});return}let G={codec:Y,quality:W,keyFrameInterval:e.keyFrameInterval,sizeChangeBehavior:e.fit??"passThrough",alpha:x,hardwareAcceleration:e.hardwareAcceleration,transform:{}};g(G.transform);let he=y!==b||k!==h||o!==0&&(!u||e.process!==void 0)||!!p||l!==await t.getCodedWidth()||m!==await t.getCodedHeight();if(!he){var R=[];try{let ge=new ar({format:new Di,target:new oi});let oe=new Mi(G);ge.addVideoTrack(oe);await ge.start();let sr=new ei(t);let Qe=at(R,await sr.getSample(await t.getFirstTimestamp()));if(Qe)try{await oe.add(Qe),Qe.close(),await ge.finalize()}catch(or){U._warn("An error occurred when probing encoder support. Falling back to rerender path.",or),ge.cancel(),he=!0,G.transform.force=!0}else await ge.cancel()}catch(_){var z=_,V=!0}finally{st(R,z,V)}}e.frameRate&&(G.transform.frameRate=e.frameRate),e.process&&(G.transform.process=e.process),he&&(c=0,G.transform.width=y,G.transform.height=k,G.transform.fit=e.fit??"fill",G.transform.rotate=kt(o-s),G.transform.crop=p,G.transform.alpha=x);let pe=null;G.onEncodedSample=ge=>{pe=ge.timestamp};let xe=new Mi(G);a=xe,this._registerTrackPump(async ge=>{let oe=new ei(t);for await(var sr of oe.samples(this._startTimestamp,this._endTimestamp)){var Qe=[];try{let yt=at(Qe,sr);if(this._state==="canceled")break;let En=Math.max(this._startTimestamp,yt.timestamp),vn=Math.min(this._endTimestamp,yt.timestamp+yt.duration);En>=vn||(yt.setTimestamp(En+this._timestampOffset),yt.setDuration(vn-En),this._reportProgress(r,yt.timestamp+yt.duration),await xe.add(yt),yt.close(),pe!==null&&(this._synchronizer.shouldWait(r,pe)&&await this._synchronizer.wait(pe),await this._checkpoint(ge,pe)))}catch(or){var Vt=or,bt=!0}finally{st(Qe,Vt,bt)}}xe.close(),this._synchronizer.closeTrack(r)})}else{let B=new Ir(n);a=B,this._registerTrackPump(async W=>{let Y=new et(t),he={decoderConfig:await t.getDecoderConfig()??void 0};if(P)for await(let pe of Y.packets(P,void 0,{verifyKeyPackets:!0})){if(this._state==="canceled")break;if(pe.timestamp>=this._endTimestamp){if(this._copyBoundaryPolicy==="shrink")break;{let sr=pe,Qe=!1,or=6;for(let Vt=0;Vt<or;Vt++){let bt=await Y.getNextPacket(sr,{metadataOnly:!0});if(!bt)break;if(bt.timestamp<this._endTimestamp){Qe=!0;break}sr=bt}if(!Qe)break}}let xe=pe.timestamp,ge=pe.timestamp+pe.duration;this._copyBoundaryPolicy==="shrink"&&(xe=Math.max(xe,this._startTimestamp),ge=Math.min(ge,this._endTimestamp),ge=Math.max(ge,xe)),xe+=this._timestampOffset,ge+=this._timestampOffset;let oe=pe.clone({timestamp:xe,duration:ge-xe,sideData:x==="discard"?{}:pe.sideData});this._reportProgress(r,oe.timestamp+oe.duration),await B.add(oe,he),this._synchronizer.shouldWait(r,oe.timestamp)&&await this._synchronizer.wait(oe.timestamp),await this._checkpoint(W,oe.timestamp)}B.close(),this._synchronizer.closeTrack(r)})}let A=null;!e.group&&!this._composable&&(A=new nt);let S=await t.getLanguageCode(),I=await t.getName(),E=await t.getDisposition();this.output.addVideoTrack(a,{frameRate:e.frameRate,languageCode:dr(S)?S:void 0,name:I??void 0,disposition:E,rotation:c,group:A??e.group}),this.utilizedTracks.push(t),this._outputTrackIds.push(r),this._outputOwnTrackGroups.push(A)}async _processAudioTrack(t,e,r){let n=await t.getCodec();if(!n){this.discardedTracks.push({track:t,reason:"unknown_source_codec",trackOptions:e});return}let a,s=await t.getNumberOfChannels(),o=await t.getSampleRate(),c=e.numberOfChannels??s,u=e.sampleRate??o,l=this.output.format.getSupportedAudioCodecs(),m=!this._copyMode||!!e.forceTranscode||!!e.quality||!!e.bitrate||c!==s||u!==o||!l.includes(n)||!!e.codec&&e.codec!==n||e.process!==void 0||e.sampleFormat!==void 0,d=null;if(!m){let y=new et(t),k=await y.getKeyPacket(this._startTimestamp)??await y.getFirstKeyPacket();k&&(this._copyBoundaryPolicy==="shrink"&&k.timestamp<this._startTimestamp||this._copyBoundaryPolicy==="expand"&&k.timestamp+k.duration<=this._startTimestamp)&&(k=await y.getNextKeyPacket(k));let T=ft.includes(n)&&n!=="flac";if(k&&this._copyBoundaryPolicy==="expand"&&T){let w=await y.getKeyPacket(k.timestamp-1/await t.getTimeResolution());w&&(k=w)}if(d=k,k)if(this.output.format.supportsTimestampedMediaData){if(this.output.format.negativeTimestampSupport!=="full"&&k.timestamp<this._startTimestamp){let w=Math.min(this._startTimestamp-k.timestamp,this._copyTimestampShiftTolerance);k.timestamp+w>=this._startTimestamp||this.output.format.negativeTimestampSupport==="prefer-non-negative"&&this._copyMode==="forced"?this._timestampOffset=Math.max(this._timestampOffset,-this._startTimestamp+w):m=!0}}else if(this._timestampOffsetAdjusted)k.timestamp+this._timestampOffset===0||(m=!0);else{let w=ne(this._startTimestamp-k.timestamp,-this._copyTimestampShiftTolerance,this._copyTimestampShiftTolerance);k.timestamp+w===this._startTimestamp?(this._timestampOffset=-this._startTimestamp+w,this._timestampOffsetAdjusted=!0):m=!0}}if(m&&this._copyMode==="forced"){this.discardedTracks.push({track:t,reason:"cannot_copy",trackOptions:e});return}if(m){if(!await t.canDecode()){this.discardedTracks.push({track:t,reason:"undecodable_source_codec",trackOptions:e});return}let k=null;e.codec&&(l=l.filter(A=>A===e.codec));let T=Jr(e.quality,e.bitrate)??new de("high"),w=await pn(l,{numberOfChannels:e.process&&e.processedNumberOfChannels?e.processedNumberOfChannels:c,sampleRate:e.process&&e.processedSampleRate?e.processedSampleRate:u,quality:T});if(!w.some(A=>ft.includes(A))&&l.some(A=>ft.includes(A))&&(c!==al||u!==sl)){let S=(await pn(l,{numberOfChannels:al,sampleRate:sl,quality:T})).find(I=>ft.includes(I));S&&(k=S,c=al,u=sl)}else k=w[0]??null;if(k===null){this.discardedTracks.push({track:t,reason:"no_encodable_target_codec",trackOptions:e});return}let x={codec:k,quality:T,transform:{sampleFormat:e.sampleFormat,process:e.process}};g(x.transform),c!==s&&(x.transform.numberOfChannels=c),u!==o&&(x.transform.sampleRate=u);let C=null;x.onEncodedSample=A=>{C=A.timestamp};let P=new Cn(x);a=P,this._registerTrackPump(async A=>{let S=null,I=new Ii(t);for await(var G of I.samples(this._startTimestamp,this._endTimestamp)){var he=[];try{let oe=at(he,G);var V=[];try{if(this._state==="canceled")break;let sr=0;let Qe=oe.numberOfFrames;oe.timestamp<this._startTimestamp&&(sr=Math.round((this._startTimestamp-oe.timestamp)*oe.sampleRate));oe.timestamp+oe.duration>this._endTimestamp&&(Qe=Math.round((this._endTimestamp-oe.timestamp)*oe.sampleRate));if(sr>=Qe){oe.close();continue}let or;if(sr>0||Qe<oe.numberOfFrames){let bt=oe.trim(sr,Qe);if(oe.close(),or=bt,bt.numberOfFrames===0){bt.close();continue}}else or=oe;let Vt=at(V,or);Vt.setTimestamp(Vt.timestamp+this._timestampOffset);S===null&&(S=Vt.timestamp>0&&!this.output.format.supportsTimestampedMediaData);if(S){var E=[];try{let bt=Vt.timestamp;let yt=Math.round(bt*o);let En=$t(oe.format);let vn=new Uint8Array(En*yt*s);(oe.format==="u8"||oe.format==="u8-planar")&&vn.fill(2**7);let wf=at(E,new Ae({data:vn,format:oe.format,numberOfChannels:s,sampleRate:o,timestamp:0}));await this._registerAudioSample(A,wf,P,r,()=>C);S=!1}catch(R){var _=R,z=!0}finally{st(E,_,z)}}await this._registerAudioSample(A,Vt,P,r,()=>C)}catch(B){var W=B,Y=!0}finally{st(V,W,Y)}}catch(pe){var xe=pe,ge=!0}finally{st(he,xe,ge)}}P.close(),this._synchronizer.closeTrack(r)})}else{let y=new Er(n);a=y,this._registerTrackPump(async k=>{let T=new et(t),x={decoderConfig:await t.getDecoderConfig()??void 0};if(d)for await(let C of T.packets(d)){if(this._state==="canceled"||C.timestamp>=this._endTimestamp||this._copyBoundaryPolicy==="shrink"&&C.timestamp+C.duration>this._endTimestamp)break;let P=C.clone({timestamp:C.timestamp+this._timestampOffset,duration:C.duration});this._reportProgress(r,P.timestamp+P.duration),await y.add(P,x),this._synchronizer.shouldWait(r,P.timestamp)&&await this._synchronizer.wait(P.timestamp),await this._checkpoint(k,P.timestamp)}y.close(),this._synchronizer.closeTrack(r)})}let f=null;!e.group&&!this._composable&&(f=new nt);let p=await t.getLanguageCode(),b=await t.getName(),h=await t.getDisposition();this.output.addAudioTrack(a,{languageCode:dr(p)?p:void 0,name:b??void 0,disposition:h,group:f??e.group}),this.utilizedTracks.push(t),this._outputTrackIds.push(r),this._outputOwnTrackGroups.push(f)}async _registerAudioSample(t,e,r,n,a){this._reportProgress(n,e.timestamp+e.duration),await r.add(e),e.close();let s=a();s!==null&&(this._synchronizer.shouldWait(n,s)&&await this._synchronizer.wait(s),await this._checkpoint(t,s))}_registerTrackPump(t){let e={done:!1,resolvers:te(),wake:null,start:()=>{t(e).then(()=>{e.done=!0,e.resolvers.resolve()},r=>{e.resolvers.reject(r)})}};this._trackPumps.push(e)}async _checkpoint(t,e){for(;this._state!=="canceled"&&(e>=this._executionUntil||this._pauseRequested);){t.resolvers.resolve();let{promise:r,resolve:n}=te();t.wake=n,await r}}_reportProgress(t,e){if(!this._computeProgress)return;g(this._totalDuration!==null),this._maxTimestamps.set(t,Math.max(e,this._maxTimestamps.get(t)));let r=Math.min(...this._maxTimestamps.values()),n=ne(r/this._totalDuration,0,1);n!==this._lastProgress&&(this._lastProgress=n,this.onProgress?.(n,r))}},In=class extends Error{constructor(t="Conversion has been canceled."){super(t),this.name="ConversionCanceledError"}},kf=1,ol=class{constructor(t){this.maxTimestamps=new Map;this.resolvers=[];this.conversion=t}declareTrack(t){this.maxTimestamps.set(t,-1/0)}shouldWait(t,e){let r=this.maxTimestamps.get(t);g(r!==void 0),this.maxTimestamps.set(t,Math.max(e,r));let n=this.computeMinAndMaybeResolve();return this.conversion._state==="canceled"||this.conversion._pauseRequested||e>=this.conversion._executionUntil?!1:e-n>kf}wait(t){let{promise:e,resolve:r}=te();return this.resolvers.push({timestamp:t,resolve:r}),e}closeTrack(t){this.maxTimestamps.delete(t),this.computeMinAndMaybeResolve()}resolveAll(){for(let t of this.resolvers)t.resolve();this.resolvers.length=0}computeMinAndMaybeResolve(){let t=1/0;for(let[,e]of this.maxTimestamps)t=Math.min(t,e);for(let e=0;e<this.resolvers.length;e++){let r=this.resolvers[e];r.timestamp-t<kf&&(r.resolve(),this.resolvers.splice(e,1),e--)}return t}};var Tf=Symbol.for("mediabunny loaded");globalThis[Tf]&&U._error(`[WARNING]
Mediabunny was loaded twice. This will likely cause Mediabunny not to work correctly. Check if multiple dependencies are importing different versions of Mediabunny, or if something is being bundled incorrectly.`);globalThis[Tf]=!0;return vf(yg);})();
if (typeof module === "object" && typeof module.exports === "object") Object.assign(module.exports, Mediabunny)

        /* LIGHTFLOW_MEDIABUNNY_VENDOR_END */
        cinematicMediaCodec = module.exports;
        return cinematicMediaCodec;
    }

    const PLUGIN_ID = 'lightflow_cinematic';
    const PROJECT_PROPERTY = 'lightflow_cinematic_project_json';
    const CINEMATIC_UNDO_ASPECT = 'lightflow_cinematic_document';
    const DOCUMENT_VERSION = 1;
    const DEFAULT_SEQUENCE_LENGTH = 120;
    const DEFAULT_SENSOR_WIDTH_MM = 36;
    const DEFAULT_SENSOR_HEIGHT_MM = 20.25;
    const STUDIO_SETTING_KEYS = Object.freeze([
        'tile_size',
        'background_mode',
        'background_color',
        'shading',
        'show_gizmos',
        'bloom_enabled',
        'bloom_threshold',
        'bloom_soft_knee',
        'bloom_strength',
        'bloom_core_strength',
        'bloom_core_radius',
        'bloom_halo_strength',
        'bloom_radius',
        'bloom_hdr_strength',
        'bloom_emissive_strength',
        'bloom_occlusion',
        'color_grading_enabled',
        'exposure',
        'contrast',
        'saturation',
        'temperature',
        'tint',
        'vignette'
    ]);
    const FRAME_RATE_PRESETS = Object.freeze({
        '24/1': { numerator: 24, denominator: 1, label: '24 fps' },
        '25/1': { numerator: 25, denominator: 1, label: '25 fps' },
        '30/1': { numerator: 30, denominator: 1, label: '30 fps' },
        '48/1': { numerator: 48, denominator: 1, label: '48 fps' },
        '50/1': { numerator: 50, denominator: 1, label: '50 fps' },
        '60/1': { numerator: 60, denominator: 1, label: '60 fps' },
        '24000/1001': { numerator: 24000, denominator: 1001, label: '23.976 fps' },
        '30000/1001': { numerator: 30000, denominator: 1001, label: '29.97 fps' },
        '60000/1001': { numerator: 60000, denominator: 1001, label: '59.94 fps' }
    });

    let projectProperty;
    let lifecycleHydrator;
    let projectListener;
    let closeProjectListener;
    let parsedListener;
    let managerDialog;
    let montageDialog;
    let physicalCameraDialog;
    let managerRefreshScheduled = false;
    let persistenceWarningShown = false;
    let activeRenderJob = null;
    let activeEncoderProcess = null;
    let activeSinkCancellation = null;
    let ffmpegExecutable = 'ffmpeg';
    let videoExportBackend = 'integrated';
    let unloading = false;
    let openAction;
    let cameraAction;
    let keyframeAction;
    let previewAction;
    let playAction;
    let renderSequenceAction;
    let cancelRenderAction;
    let viewThroughCameraAction;
    let updateCameraFromViewAction;
    let cameraSettingsAction;
    let deleteCameraAction;
    let sequenceToolbarSelect;
    let cameraToolbarSelect;
    let fpsToolbarSelect;
    let timingToolbarText;
    let cameraElementType;
    let cameraPreviewController;
    let cameraTimelineAnimatorType;
    let cameraElementProperties = [];
    let armatureBoneCameraChildTypes = null;
    let ownsArmatureBoneCameraChildType = false;
    let cameraElementSyncTimer = null;
    let syncingCameraElements = false;
    const pendingCameraTransformElements = new Set();
    let displayAnimationFrameListener;
    let timelinePlayListener;
    let timelinePauseListener;
    let selectAnimationListener;
    let selectModeListener;
    let frameRegionListener;
    let cinematicUndoHooks;
    let gizmoVisibilityListener;
    let cinematicFrameEditSequenceId = '';
    let cinematicTimelineSyncTimer = null;
    const cinematicTimelineAnimators = new Map();
    const playbackState = {
        running: false,
        ownsNativeTimeline: false,
        requestId: null,
        generation: 0,
        startClock: 0,
        startFrame: 0,
        sequenceId: ''
    };
    const publishedWindowBindings = new Map();
    const emptyProjectDocuments = new WeakMap();
    const projectDocumentCache = new WeakMap();

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function finite(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function finiteArray(value, length, fallback) {
        if (!Array.isArray(value) || value.length < length) return fallback.slice();
        const result = value.slice(0, length).map(Number);
        return result.every(Number.isFinite) ? result : fallback.slice();
    }

    function deepClone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function createId(prefix) {
        if (typeof guid === 'function') return guid();
        return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    }

    function cleanName(value, fallback, maxLength = 80) {
        const result = String(value == null ? '' : value).trim().slice(0, maxLength);
        return result || fallback;
    }

    function getActiveProject() {
        return typeof Project !== 'undefined' ? Project : null;
    }

    function isCinematicDesktop() {
        // Blockbench 5.x exposes isWeb; isApp is a native global, not an API property.
        return (typeof isApp !== 'undefined' && isApp === true) ||
            Blockbench.isWeb === false || Blockbench.isApp === true;
    }

    function getPreview() {
        if (typeof Preview !== 'undefined' && Preview.selected) return Preview.selected;
        if (window.main_preview) return window.main_preview;
        return null;
    }

    function translate(key, fallback) {
        try {
            const translated = typeof tl === 'function' ? tl(key) : key;
            return translated && translated !== key ? translated : fallback;
        } catch (error) {
            return fallback;
        }
    }

    function hasLightflowFormType(type) {
        return Array.isArray(window.LightManagerUI?.formElementTypes) &&
            window.LightManagerUI.formElementTypes.includes(type);
    }

    function cinematicSelect(options) {
        return Object.assign({
            type: hasLightflowFormType('enum_select') ? 'enum_select' : 'select'
        }, options);
    }

    function cinematicText(options) {
        return Object.assign({
            type: hasLightflowFormType('compact_text') ? 'compact_text' : 'text'
        }, options);
    }

    function cinematicNumber(options, resetValue) {
        return Object.assign({
            type: 'number',
            resettable: true,
            reset_value: resetValue
        }, options);
    }

    function cinematicVector(options, resetValue) {
        if (!hasLightflowFormType('custom_vector')) {
            return Object.assign({ type: 'vector' }, options);
        }
        return Object.assign({
            type: 'custom_vector',
            resettable: true,
            default: Array.isArray(resetValue) ? resetValue.slice() : resetValue
        }, options);
    }

    function cinematicSection(label, fallback, icon) {
        if (!hasLightflowFormType('bar_display')) {
            return { type: 'info', text: '**' + translate(label, fallback) + '**' };
        }
        return {
            type: 'bar_display',
            variant: 'subsection',
            value: translate(label, fallback),
            icon,
            paragraph: false,
            expand: true,
            color: 'var(--color-text)'
        };
    }

    function publishWindowBinding(name, value) {
        if (!publishedWindowBindings.has(name)) {
            publishedWindowBindings.set(name, {
                hadOwnValue: Object.prototype.hasOwnProperty.call(window, name),
                previousValue: window[name],
                ownedValue: value
            });
        } else {
            publishedWindowBindings.get(name).ownedValue = value;
        }
        window[name] = value;
        return value;
    }

    function restoreWindowBindings() {
        Array.from(publishedWindowBindings.entries()).reverse().forEach(([name, binding]) => {
            if (window[name] !== binding.ownedValue) return;
            if (binding.hadOwnValue) window[name] = binding.previousValue;
            else delete window[name];
        });
        publishedWindowBindings.clear();
    }

    function normalizeQuaternion(value, fallback = [0, 0, 0, 1]) {
        const result = finiteArray(value, 4, fallback);
        const length = Math.hypot(result[0], result[1], result[2], result[3]);
        if (length < 1e-10) return fallback.slice();
        return result.map(component => component / length);
    }

    function slerpQuaternion(leftValue, rightValue, amount) {
        const left = normalizeQuaternion(leftValue);
        let right = normalizeQuaternion(rightValue);
        let dot = left[0] * right[0] + left[1] * right[1] + left[2] * right[2] + left[3] * right[3];
        if (dot < 0) {
            right = right.map(component => -component);
            dot = -dot;
        }
        if (dot > 0.9995) {
            return normalizeQuaternion(left.map((component, index) => component + (right[index] - component) * amount));
        }
        const theta = Math.acos(clamp(dot, -1, 1));
        const sine = Math.sin(theta);
        if (Math.abs(sine) < 1e-8) return left.slice();
        const leftWeight = Math.sin((1 - amount) * theta) / sine;
        const rightWeight = Math.sin(amount * theta) / sine;
        return left.map((component, index) => component * leftWeight + right[index] * rightWeight);
    }

    function lerp(left, right, amount) {
        return left + (right - left) * amount;
    }

    function lerpArray(left, right, amount) {
        return left.map((value, index) => lerp(value, right[index], amount));
    }

    function easeAmount(amount, interpolation) {
        const value = clamp(amount, 0, 1);
        if (interpolation === 'step') return 0;
        if (interpolation === 'ease_in') return value * value;
        if (interpolation === 'ease_out') return 1 - (1 - value) * (1 - value);
        if (interpolation === 'smooth') return value * value * (3 - 2 * value);
        return value;
    }

    function focalLengthToVerticalFov(focalLengthMm, sensorHeightMm) {
        const focal = Math.max(0.01, finite(focalLengthMm, 50));
        const sensor = Math.max(0.01, finite(sensorHeightMm, DEFAULT_SENSOR_HEIGHT_MM));
        return 2 * Math.atan(sensor / (2 * focal)) * 180 / Math.PI;
    }

    function verticalFovToFocalLength(fovDegrees, sensorHeightMm) {
        const fov = clamp(finite(fovDegrees, 39.6), 0.01, 179) * Math.PI / 180;
        const sensor = Math.max(0.01, finite(sensorHeightMm, DEFAULT_SENSOR_HEIGHT_MM));
        return sensor / (2 * Math.tan(fov / 2));
    }

    function normalizeFrameRate(value) {
        let numerator;
        let denominator;
        if (typeof value === 'string' && value.includes('/')) {
            const parts = value.split('/').map(Number);
            numerator = parts[0];
            denominator = parts[1];
        } else if (value && typeof value === 'object') {
            numerator = Number(value.numerator);
            denominator = Number(value.denominator);
        } else {
            const numeric = Number(value);
            const matched = Object.values(FRAME_RATE_PRESETS).find(entry => Math.abs(entry.numerator / entry.denominator - numeric) < 0.0006);
            numerator = matched?.numerator || numeric || 24;
            denominator = matched?.denominator || 1;
        }
        numerator = Math.max(1, Math.round(finite(numerator, 24)));
        denominator = Math.max(1, Math.round(finite(denominator, 1)));
        return { numerator, denominator };
    }

    function frameRateKey(rate) {
        const normalized = normalizeFrameRate(rate);
        const exact = normalized.numerator + '/' + normalized.denominator;
        return FRAME_RATE_PRESETS[exact] ? exact : '24/1';
    }

    function frameRateValue(rate) {
        const normalized = normalizeFrameRate(rate);
        return normalized.numerator / normalized.denominator;
    }

    function normalizeCaptureFrame(value) {
        const source = value && typeof value === 'object' ? value : {};
        const width = clamp(finite(source.width, 0.82), 0.001, 1);
        const height = clamp(finite(source.height, 0.82), 0.001, 1);
        return {
            x: clamp(finite(source.x, (1 - width) / 2), 0, 1 - width),
            y: clamp(finite(source.y, (1 - height) / 2), 0, 1 - height),
            width,
            height
        };
    }

    function sequenceDurationFrames(sequence) {
        return Math.max(1, Math.round(finite(sequence?.end_frame, 1)) - Math.round(finite(sequence?.start_frame, 0)));
    }

    function sequenceDurationSeconds(sequence) {
        return sequenceDurationFrames(sequence) / frameRateValue(sequence?.frame_rate);
    }

    function sequenceSourceDurationSeconds(sequence) {
        return sequenceDurationSeconds(sequence) * Math.max(0.0001, finite(sequence?.playback_rate, 1));
    }

    function formatDurationSeconds(value) {
        const seconds = Math.max(0, finite(value, 0));
        const wholeMinutes = Math.floor(seconds / 60);
        const wholeSeconds = Math.floor(seconds % 60);
        const milliseconds = Math.round((seconds - Math.floor(seconds)) * 1000);
        return String(wholeMinutes).padStart(2, '0') + ':' +
            String(wholeSeconds).padStart(2, '0') + '.' +
            String(milliseconds).padStart(3, '0');
    }

    function getActiveAnimationRange() {
        const animation = typeof Animation !== 'undefined' ? Animation.selected : null;
        if (!animation) return null;
        const animationLength = Math.max(0, finite(animation.length, 0));
        const customRange = typeof Timeline !== 'undefined' && Array.isArray(Timeline.custom_range)
            ? Timeline.custom_range
            : null;
        const customStart = customRange ? Math.max(0, finite(customRange[0], 0)) : 0;
        const customEnd = customRange ? Math.max(0, finite(customRange[1], 0)) : 0;
        const usesCustomRange = customEnd > customStart + 1e-8;
        const startSeconds = usesCustomRange ? customStart : 0;
        const endSeconds = usesCustomRange ? Math.min(animationLength || customEnd, customEnd) : animationLength;
        return {
            id: String(animation.uuid || animation.name || ''),
            name: cleanName(animation.name, 'Active Animation'),
            startSeconds,
            endSeconds: Math.max(startSeconds, endSeconds),
            durationSeconds: Math.max(0, endSeconds - startSeconds)
        };
    }

    function adaptSequenceValueToActiveAnimation(sequenceValue) {
        const sequence = normalizeSequence(sequenceValue || {});
        const range = getActiveAnimationRange();
        if (!range || range.durationSeconds <= 0) return sequence;
        const frames = Math.max(1, Math.ceil(
            range.durationSeconds * frameRateValue(sequence.frame_rate) /
            Math.max(0.0001, sequence.playback_rate)
        ));
        return normalizeSequence({
            ...sequence,
            duration_mode: 'active_animation',
            source_animation_id: range.id,
            source_animation_name: range.name,
            source_start_seconds: range.startSeconds,
            end_frame: sequence.start_frame + frames
        });
    }

    function sequenceTimingSummary(sequence) {
        const frames = sequenceDurationFrames(sequence);
        const duration = sequenceDurationSeconds(sequence);
        const sourceDuration = sequenceSourceDurationSeconds(sequence);
        const firstFrame = Math.round(finite(sequence?.start_frame, 0));
        const lastFrame = firstFrame + frames - 1;
        let summary = firstFrame + '-' + lastFrame + '  |  ' +
            frames + ' ' + translate('lightflow_cinematic.unit.frames', 'frames') +
            '  |  ' + duration.toFixed(3) + ' s  |  ' + formatDurationSeconds(duration);
        if (Math.abs(sourceDuration - duration) > 1e-6) {
            summary += '  |  ' + translate('lightflow_cinematic.unit.source', 'source') +
                ' ' + sourceDuration.toFixed(3) + ' s';
        }
        if (sequence?.duration_mode === 'active_animation' && sequence.source_animation_name) {
            summary += '  |  ' + sequence.source_animation_name;
        }
        return summary;
    }

    function cinematicToolbarTimingText(sequence, frameValue) {
        if (!sequence) return 'F --/--  |  --:--.---/--:--.---';
        const firstFrame = Math.round(finite(sequence.start_frame, 0));
        const lastFrame = Math.max(firstFrame, Math.round(finite(sequence.end_frame, firstFrame + 1)) - 1);
        const frame = clamp(Math.round(finite(frameValue, firstFrame)), firstFrame, lastFrame);
        const rate = Math.max(0.0001, frameRateValue(sequence.frame_rate));
        const elapsedSeconds = (frame - firstFrame) / rate;
        return 'F ' + frame + '/' + lastFrame + '  |  ' +
            formatDurationSeconds(elapsedSeconds) + '/' + formatDurationSeconds(sequenceDurationSeconds(sequence));
    }

    function frameTimestampMicroseconds(sequence, frame) {
        const rate = normalizeFrameRate(sequence?.frame_rate);
        const start = Math.round(finite(sequence?.start_frame, 0));
        return Math.round((Math.round(frame) - start) * 1000000 * rate.denominator / rate.numerator);
    }

    function frameToTimelineSeconds(sequence, frame, subframe = false) {
        const start = Math.round(finite(sequence?.start_frame, 0));
        const sourceStart = finite(sequence?.source_start_seconds, 0);
        const playbackRate = Math.max(0.0001, finite(sequence?.playback_rate, 1));
        return sourceStart + ((subframe ? frame : Math.round(frame)) - start) * playbackRate / frameRateValue(sequence?.frame_rate);
    }

    function timelineSecondsToFrame(sequence, seconds) {
        const start = Math.round(finite(sequence?.start_frame, 0));
        const sourceStart = finite(sequence?.source_start_seconds, 0);
        const playbackRate = Math.max(0.0001, finite(sequence?.playback_rate, 1));
        return start + Math.round((finite(seconds, sourceStart) - sourceStart) * frameRateValue(sequence?.frame_rate) / playbackRate);
    }

    function defaultPhysicalCameraState() {
        return {
            projection: 'perspective',
            position: [0, 0, 32],
            quaternion: [0, 0, 0, 1],
            up: [0, 1, 0],
            target: [0, 0, 0],
            sensor_width_mm: DEFAULT_SENSOR_WIDTH_MM,
            sensor_height_mm: DEFAULT_SENSOR_HEIGHT_MM,
            focal_length_mm: 50,
            aperture_f_stop: 2.8,
            focus_distance: 32,
            shutter_angle: 180,
            iso: 100,
            exposure_compensation_ev: 0,
            lens_shift_x: 0,
            lens_shift_y: 0,
            anamorphic_squeeze: 1,
            near_clip: 0.1,
            far_clip: 1000,
            ortho_world_height: 16,
            blade_count: 7,
            layers_mask: 1
        };
    }

    function normalizePhysicalCameraState(value, fallback = defaultPhysicalCameraState()) {
        const source = value && typeof value === 'object' ? value : {};
        const base = fallback && typeof fallback === 'object' ? fallback : defaultPhysicalCameraState();
        const sensorWidth = Math.max(0.1, finite(source.sensor_width_mm, base.sensor_width_mm));
        const sensorHeight = Math.max(0.1, finite(source.sensor_height_mm, base.sensor_height_mm));
        const requestedFocalLength = source.focal_length_mm == null && source.fov != null
            ? verticalFovToFocalLength(source.fov, sensorHeight)
            : source.focal_length_mm;
        const state = {
            projection: (source.projection == null ? base.projection : source.projection) === 'orthographic'
                ? 'orthographic'
                : 'perspective',
            position: finiteArray(source.position, 3, base.position),
            quaternion: normalizeQuaternion(source.quaternion, base.quaternion),
            up: finiteArray(source.up, 3, base.up),
            target: finiteArray(source.target, 3, base.target),
            sensor_width_mm: sensorWidth,
            sensor_height_mm: sensorHeight,
            focal_length_mm: clamp(finite(requestedFocalLength, base.focal_length_mm), 0.1, 2000),
            aperture_f_stop: clamp(finite(source.aperture_f_stop, base.aperture_f_stop), 0.1, 128),
            focus_distance: Math.max(0.0001, finite(source.focus_distance, base.focus_distance)),
            shutter_angle: clamp(finite(source.shutter_angle, base.shutter_angle), 0, 360),
            iso: clamp(finite(source.iso, base.iso), 1, 204800),
            exposure_compensation_ev: clamp(finite(source.exposure_compensation_ev, base.exposure_compensation_ev), -20, 20),
            lens_shift_x: clamp(finite(source.lens_shift_x, base.lens_shift_x), -2, 2),
            lens_shift_y: clamp(finite(source.lens_shift_y, base.lens_shift_y), -2, 2),
            anamorphic_squeeze: clamp(finite(source.anamorphic_squeeze, base.anamorphic_squeeze), 0.25, 4),
            near_clip: Math.max(0.0001, finite(source.near_clip, base.near_clip)),
            far_clip: Math.max(0.001, finite(source.far_clip, base.far_clip)),
            ortho_world_height: Math.max(0.0001, finite(source.ortho_world_height, base.ortho_world_height)),
            blade_count: clamp(Math.round(finite(source.blade_count, base.blade_count)), 3, 32),
            layers_mask: Math.floor(finite(source.layers_mask, base.layers_mask)) >>> 0
        };
        state.far_clip = Math.max(state.near_clip + 0.001, state.far_clip);
        return state;
    }

    function interpolatePhysicalCameraState(leftValue, rightValue, amount, interpolation = 'linear') {
        const left = normalizePhysicalCameraState(leftValue);
        const right = normalizePhysicalCameraState(rightValue, left);
        const t = easeAmount(amount, interpolation);
        const numericKeys = [
            'sensor_width_mm', 'sensor_height_mm', 'focal_length_mm', 'aperture_f_stop',
            'focus_distance', 'shutter_angle', 'iso', 'exposure_compensation_ev',
            'lens_shift_x', 'lens_shift_y', 'anamorphic_squeeze', 'near_clip',
            'far_clip', 'ortho_world_height'
        ];
        const result = {
            projection: amount >= 1 ? right.projection : left.projection,
            position: lerpArray(left.position, right.position, t),
            quaternion: slerpQuaternion(left.quaternion, right.quaternion, t),
            up: lerpArray(left.up, right.up, t),
            target: lerpArray(left.target, right.target, t),
            blade_count: Math.round(lerp(left.blade_count, right.blade_count, t)),
            layers_mask: amount >= 1 ? right.layers_mask : left.layers_mask
        };
        numericKeys.forEach(key => {
            result[key] = lerp(left[key], right[key], t);
        });
        return normalizePhysicalCameraState(result, left);
    }

    function normalizeCameraKeyframe(value, fallbackState) {
        if (!value || typeof value !== 'object') return null;
        const interpolation = ['step', 'linear', 'smooth', 'ease_in', 'ease_out'].includes(value.interpolation)
            ? value.interpolation
            : 'smooth';
        return {
            id: String(value.id || createId('cinematic_keyframe')),
            frame: Math.round(finite(value.frame, 0)),
            interpolation,
            state: normalizePhysicalCameraState(value.state || value, fallbackState)
        };
    }

    function normalizeCamera(value) {
        if (!value || typeof value !== 'object') return null;
        const base = normalizePhysicalCameraState(value.base || value.state);
        const keyframes = (Array.isArray(value.keyframes) ? value.keyframes : [])
            .map(entry => normalizeCameraKeyframe(entry, base))
            .filter(Boolean)
            .sort((left, right) => left.frame - right.frame);
        const unique = [];
        keyframes.forEach(entry => {
            const existing = unique.findIndex(candidate => candidate.frame === entry.frame);
            if (existing >= 0) unique[existing] = entry;
            else unique.push(entry);
        });
        return {
            id: String(value.id || createId('cinematic_camera')),
            name: cleanName(value.name, 'Physical Camera'),
            type: 'physical',
            base,
            keyframes: unique,
            created_at: finite(value.created_at, Date.now()),
            updated_at: finite(value.updated_at, Date.now())
        };
    }

    function sanitizeStudioSettings(value) {
        const source = value && typeof value === 'object' ? value : {};
        const result = {};
        STUDIO_SETTING_KEYS.forEach(key => {
            if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = deepClone(source[key]);
        });
        return result;
    }

    function captureCurrentStudioSettings() {
        return sanitizeStudioSettings(window.StudioRender?.settings || {});
    }

    function normalizeSequence(value, index = 0) {
        const source = value && typeof value === 'object' ? value : {};
        const startFrame = Math.round(finite(source.start_frame, 0));
        const endFrame = Math.max(startFrame + 1, Math.round(finite(source.end_frame, startFrame + DEFAULT_SEQUENCE_LENGTH)));
        const resolution = finiteArray(source.resolution, 2, [1920, 1080])
            .map(dimension => clamp(Math.round(dimension), 1, 16384));
        const durationMode = ['frames', 'seconds', 'active_animation'].includes(source.duration_mode)
            ? source.duration_mode
            : 'frames';
        return {
            id: String(source.id || createId('cinematic_sequence')),
            name: cleanName(source.name, 'Sequence ' + (index + 1)),
            frame_rate: normalizeFrameRate(source.frame_rate || { numerator: 24, denominator: 1 }),
            start_frame: startFrame,
            end_frame: endFrame,
            duration_mode: durationMode,
            source_start_seconds: Math.max(0, finite(source.source_start_seconds, 0)),
            source_animation_id: String(source.source_animation_id || ''),
            source_animation_name: cleanName(source.source_animation_name, '', 120),
            playback_rate: Math.max(0.0001, finite(source.playback_rate, 1)),
            loop_preview: source.loop_preview !== false,
            preview_camera: source.preview_camera !== false,
            resolution,
            samples: String(clamp(Math.round(finite(source.samples, 4)), 1, 8)),
            output_format: ['png', 'mp4', 'webm', 'gif'].includes(source.output_format) ? source.output_format : 'png',
            video_quality: ['low', 'medium', 'high'].includes(source.video_quality) ? source.video_quality : 'high',
            capture_area: source.capture_area === 'frame' ? 'frame' : 'full',
            render_frame: normalizeCaptureFrame(source.render_frame || source.frame),
            match_frame_ratio: source.match_frame_ratio !== false,
            camera_id: String(source.camera_id || ''),
            studio: sanitizeStudioSettings(source.studio),
            created_at: finite(source.created_at, Date.now()),
            updated_at: finite(source.updated_at, Date.now())
        };
    }

    function createDefaultSequence(index = 0) {
        const shot = captureCurrentShot('Cinematic Sequence Frame');
        const studioSettings = window.StudioRender?.settings || {};
        return normalizeSequence({
            name: 'Sequence ' + (index + 1),
            studio: captureCurrentStudioSettings(),
            capture_area: studioSettings.capture_area === 'frame' ? 'frame' : 'full',
            render_frame: shot?.frame,
            match_frame_ratio: studioSettings.match_frame_ratio !== false
        }, index);
    }

    function createEmptyDocument() {
        const sequence = createDefaultSequence(0);
        return {
            version: DOCUMENT_VERSION,
            active_sequence_id: sequence.id,
            active_camera_id: '',
            sequences: [sequence],
            cameras: [],
            montage: normalizeMontage({})
        };
    }

    function normalizeDocument(value) {
        const source = value && typeof value === 'object' ? value : {};
        const sequences = (Array.isArray(source.sequences) ? source.sequences : [])
            .map(normalizeSequence)
            .filter(Boolean);
        if (!sequences.length) sequences.push(createDefaultSequence(0));
        const cameras = (Array.isArray(source.cameras) ? source.cameras : [])
            .map(normalizeCamera)
            .filter(Boolean);
        const cameraIds = new Set(cameras.map(camera => camera.id));
        sequences.forEach(sequence => {
            if (!cameraIds.has(sequence.camera_id)) sequence.camera_id = '';
        });
        const activeSequenceId = sequences.some(sequence => sequence.id === source.active_sequence_id)
            ? String(source.active_sequence_id)
            : sequences[0].id;
        const activeSequence = sequences.find(sequence => sequence.id === activeSequenceId) || sequences[0];
        const requestedCameraId = String(source.active_camera_id || activeSequence.camera_id || '');
        const activeCameraId = cameraIds.has(requestedCameraId) ? requestedCameraId : (activeSequence.camera_id || '');
        return {
            version: DOCUMENT_VERSION,
            active_sequence_id: activeSequenceId,
            active_camera_id: activeCameraId,
            sequences,
            cameras,
            montage: normalizeMontage(source.montage)
        };
    }

    function normalizeMontage(value) {
        const source = value && typeof value === 'object' ? value : {};
        const output = normalizeSequence({ ...source, id: 'cinematic_montage', name: source.name || 'Montage' });
        return {
            id: 'cinematic_montage', name: output.name, frame_rate: output.frame_rate,
            resolution: output.resolution, samples: output.samples, output_format: output.output_format,
            video_quality: output.video_quality,
            clips: (Array.isArray(source.clips) ? source.clips : []).map(clip => ({
                id: String(clip.id || createId('clip')), sequence_id: String(clip.sequence_id || ''),
                in_frame: Math.round(finite(clip.in_frame, 0)), out_frame: Math.round(finite(clip.out_frame, 1)),
                speed: clamp(finite(clip.speed, 1), 0.01, 100)
            }))
        };
    }

    function updateMontage(patch, options = {}) {
        return runCinematicUndo('Edit Cinematic Montage', () => mutateDocument(document => {
            document.montage = normalizeMontage({ ...document.montage, ...patch });
            return deepClone(document.montage);
        }), options);
    }

    function addMontageClip(sequenceId, options = {}) {
        const document = readDocument();
        const sequence = document.sequences.find(item => item.id === sequenceId);
        if (!sequence) throw new Error('Montage source sequence not found.');
        const clip = { id: createId('clip'), sequence_id: sequence.id, in_frame: sequence.start_frame,
            out_frame: sequence.end_frame, speed: 1 };
        updateMontage({ clips: [...document.montage.clips, clip] }, options);
        return deepClone(clip);
    }

    function updateMontageClip(clipId, patch, options = {}) {
        const clips = readDocument().montage.clips;
        const index = clips.findIndex(clip => clip.id === clipId);
        if (index < 0) throw new Error('Montage clip not found.');
        clips[index] = { ...clips[index], ...patch, id: clips[index].id };
        return updateMontage({ clips }, options);
    }

    function moveMontageClip(clipId, offset, options = {}) {
        const clips = readDocument().montage.clips;
        const index = clips.findIndex(clip => clip.id === clipId);
        if (index < 0) throw new Error('Montage clip not found.');
        const next = clamp(index + Math.round(finite(offset, 0)), 0, clips.length - 1);
        if (index === next) return readDocument().montage;
        clips.splice(next, 0, clips.splice(index, 1)[0]);
        return updateMontage({ clips }, options);
    }

    function deleteMontageClip(clipId, options = {}) {
        return updateMontage({ clips: readDocument().montage.clips.filter(clip => clip.id !== clipId) }, options);
    }

    function buildMontagePlan(document = readDocument()) {
        const montage = normalizeMontage(document.montage);
        if (!montage.clips.length) throw new Error('Add at least one shot to the montage.');
        const outputRate = frameRateValue(montage.frame_rate);
        let exactEnd = 0, endFrame = 0;
        const shots = montage.clips.map((clip, index) => {
            const sequence = document.sequences.find(item => item.id === clip.sequence_id);
            if (!sequence) throw new Error('Montage shot ' + (index + 1) + ' references a missing sequence.');
            const camera = document.cameras.find(item => item.id === sequence.camera_id);
            if (!camera) throw new Error('Montage shot ' + (index + 1) + ' has no camera.');
            if (clip.in_frame < sequence.start_frame || clip.out_frame > sequence.end_frame || clip.out_frame <= clip.in_frame) {
                throw new Error('Invalid In/Out range for montage shot ' + (index + 1) + ': ' + sequence.name);
            }
            const start = endFrame;
            exactEnd += (clip.out_frame - clip.in_frame) / frameRateValue(sequence.frame_rate) / clip.speed * outputRate;
            endFrame = Math.round(exactEnd);
            if (endFrame <= start) throw new Error('Montage shot ' + (index + 1) + ' is shorter than one output frame.');
            return { clip, sequence, camera, start, end: endFrame };
        });
        return { shots, sequence: normalizeSequence({ ...montage, start_frame: 0, end_frame: endFrame,
            duration_mode: 'frames', camera_id: shots[0].camera.id }) };
    }

    function registerProjectProperty() {
        if (projectProperty || typeof Property === 'undefined') return projectProperty;
        const project = getActiveProject();
        const ProjectClass = typeof ModelProject !== 'undefined'
            ? ModelProject
            : (project?.constructor && project.constructor !== Object ? project.constructor : null);
        if (!ProjectClass) return null;
        projectProperty = new Property(ProjectClass, 'string', PROJECT_PROPERTY, {
            default: '',
            exposed: true
        });
        return projectProperty;
    }

    function hydrateProject(project, model) {
        if (!project) return;
        projectDocumentCache.delete(project);
        if (
            (!project[PROJECT_PROPERTY] || !String(project[PROJECT_PROPERTY]).trim()) &&
            typeof model?.[PROJECT_PROPERTY] === 'string'
        ) {
            project[PROJECT_PROPERTY] = model[PROJECT_PROPERTY];
        }
        if (project[PROJECT_PROPERTY] && String(project[PROJECT_PROPERTY]).trim()) {
            emptyProjectDocuments.delete(project);
        }
    }

    function readDocumentView(project = getActiveProject()) {
        if (!project) return createEmptyDocument();
        try {
            const raw = project[PROJECT_PROPERTY];
            if (!raw || !String(raw).trim()) {
                if (!emptyProjectDocuments.has(project)) {
                    emptyProjectDocuments.set(project, createEmptyDocument());
                }
                return emptyProjectDocuments.get(project);
            }
            const rawText = typeof raw === 'string' ? raw : JSON.stringify(raw);
            const cached = projectDocumentCache.get(project);
            if (cached?.raw === rawText) return cached.document;
            const document = normalizeDocument(typeof raw === 'string' ? JSON.parse(raw) : raw);
            projectDocumentCache.set(project, { raw: rawText, document });
            return document;
        } catch (error) {
            console.warn('[Lightflow Cinematic] Invalid project document; using a clean in-memory document.', error);
            if (!emptyProjectDocuments.has(project)) {
                emptyProjectDocuments.set(project, createEmptyDocument());
            }
            return emptyProjectDocuments.get(project);
        }
    }

    function readDocument(project = getActiveProject()) {
        return deepClone(readDocumentView(project));
    }

    function isPersistentProject(project = getActiveProject()) {
        if (!project) return false;
        const path = typeof project.save_path === 'string' ? project.save_path.toLowerCase() : '';
        return path.endsWith('.bbmodel') || project.format?.id === 'free' || window.Format?.id === 'free';
    }

    function writeDocument(documentValue, project = getActiveProject(), options = {}) {
        if (!project) return false;
        registerProjectProperty();
        const document = normalizeDocument(documentValue);
        const raw = JSON.stringify(document);
        project[PROJECT_PROPERTY] = raw;
        projectDocumentCache.set(project, { raw, document: deepClone(document) });
        emptyProjectDocuments.delete(project);
        if (typeof project.saved === 'boolean') project.saved = false;
        if (options.warn !== false && !isPersistentProject(project) && !persistenceWarningShown) {
            persistenceWarningShown = true;
            Blockbench.showQuickMessage(translate(
                'lightflow_cinematic.message.temporary',
                'Cinematic data is temporary in this format. Save as .bbmodel to keep it.'
            ), 4500);
        }
        if (options.syncElements !== false) scheduleCameraElementSync();
        scheduleCinematicTimelineSync();
        syncFpsToolbar();
        return true;
    }

    function mutateDocument(callback, options = {}) {
        const project = getActiveProject();
        if (!project) return null;
        const document = readDocument(project);
        const result = callback(document);
        writeDocument(document, project, options);
        return result;
    }

    function serializeCinematicDocumentForUndo(project = getActiveProject()) {
        return JSON.stringify(normalizeDocument(readDocumentView(project)));
    }

    function attachCinematicDocumentToCurrentUndo(project = getActiveProject()) {
        if (
            !project ||
            typeof Undo === 'undefined' ||
            !Undo.current_save
        ) return false;
        const save = Undo.current_save;
        if (!save.aspects || typeof save.aspects !== 'object') save.aspects = {};
        save.aspects[CINEMATIC_UNDO_ASPECT] = true;
        if (save[CINEMATIC_UNDO_ASPECT] === undefined) {
            save[CINEMATIC_UNDO_ASPECT] = serializeCinematicDocumentForUndo(project);
        }
        return true;
    }

    function runCinematicUndo(label, callback, options = {}) {
        const project = getActiveProject();
        if (
            options.undo === false ||
            !project ||
            typeof Undo === 'undefined' ||
            typeof Undo.initEdit !== 'function'
        ) return callback();
        if (Undo.current_save) {
            attachCinematicDocumentToCurrentUndo(project);
            return callback();
        }
        const aspects = { [CINEMATIC_UNDO_ASPECT]: true };
        Undo.initEdit(aspects);
        try {
            const result = callback();
            if (result === null || result === false) {
                Undo.cancelEdit?.(false);
            } else {
                Undo.finishEdit(label, aspects);
            }
            return result;
        } catch (error) {
            Undo.cancelEdit?.(true);
            throw error;
        }
    }

    function restoreCinematicDocumentFromUndo(serialized) {
        const project = getActiveProject();
        if (!project || serialized === undefined) return false;
        try {
            const document = normalizeDocument(
                typeof serialized === 'string' ? JSON.parse(serialized) : serialized
            );
            const raw = JSON.stringify(document);
            project[PROJECT_PROPERTY] = raw;
            projectDocumentCache.set(project, { raw, document: deepClone(document) });
            emptyProjectDocuments.delete(project);
            syncCameraElementsFromDocument();
            syncFpsToolbar();
            scheduleManagerRefresh();
            if (cinematicFrameEditSequenceId && typeof window.StudioRender?.showFrame === 'function') {
                const sequence = getSequence(document, cinematicFrameEditSequenceId);
                if (sequence) {
                    window.StudioRender.showFrame({
                        persistProjectState: false,
                        owner: 'lightflow_cinematic',
                        settings: {
                            resolution: sequence.resolution.slice(),
                            capture_area: 'frame',
                            match_frame_ratio: sequence.match_frame_ratio
                        }
                    }, sequence.render_frame);
                }
            }
            dispatchCinematicEvent('lightflow_cinematic_document_changed', {
                cause: 'undo',
                undo: true
            });
            return true;
        } catch (error) {
            console.warn('[Lightflow Cinematic] Could not restore Cinematic undo state.', error);
            return false;
        }
    }

    function getSequence(document, id) {
        const sequenceId = String(id || document.active_sequence_id || '');
        return document.sequences.find(sequence => sequence.id === sequenceId) || document.sequences[0] || null;
    }

    function getCamera(document, id, sequence = null) {
        const cameraId = String(id || sequence?.camera_id || document.active_camera_id || '');
        return document.cameras.find(camera => camera.id === cameraId) || null;
    }

    function createSequence(value = {}, options = {}) {
        const create = () => mutateDocument(document => {
            const sequence = normalizeSequence({
                ...value,
                studio: value.studio || captureCurrentStudioSettings(),
                name: value.name || 'Sequence ' + (document.sequences.length + 1)
            }, document.sequences.length);
            document.sequences.push(sequence);
            document.active_sequence_id = sequence.id;
            document.active_camera_id = sequence.camera_id;
            return deepClone(sequence);
        });
        return runCinematicUndo(translate(
            'lightflow_cinematic.undo.create_sequence',
            'Create Cinematic Sequence'
        ), create, options);
    }

    function updateSequence(id, patch, options = {}) {
        const update = () => mutateDocument(document => {
            const index = document.sequences.findIndex(sequence => sequence.id === id);
            if (index < 0) return null;
            const previous = document.sequences[index];
            const next = normalizeSequence({ ...previous, ...(patch || {}), id: previous.id }, index);
            next.created_at = previous.created_at;
            next.updated_at = Date.now();
            document.sequences[index] = next;
            if (document.active_sequence_id === id) document.active_camera_id = next.camera_id;
            return deepClone(next);
        });
        return runCinematicUndo(options.undo_label || translate(
            'lightflow_cinematic.undo.edit_sequence',
            'Edit Cinematic Sequence'
        ), update, options);
    }

    function deleteSequence(id, options = {}) {
        const remove = () => mutateDocument(document => {
            if (document.sequences.length <= 1) return false;
            const index = document.sequences.findIndex(sequence => sequence.id === id);
            if (index < 0) return false;
            document.sequences.splice(index, 1);
            if (document.active_sequence_id === id) {
                document.active_sequence_id = document.sequences[Math.max(0, index - 1)].id;
                document.active_camera_id = getSequence(document)?.camera_id || '';
            }
            return true;
        });
        return runCinematicUndo(translate(
            'lightflow_cinematic.undo.delete_sequence',
            'Delete Cinematic Sequence'
        ), remove, options);
    }

    function setActiveSequence(id) {
        return mutateDocument(document => {
            const sequence = getSequence(document, id);
            if (!sequence) return false;
            document.active_sequence_id = sequence.id;
            document.active_camera_id = sequence.camera_id || '';
            return true;
        }, { warn: false });
    }

    function setActiveCamera(id, options = {}) {
        const currentDocument = readDocument();
        const currentSequence = getSequence(currentDocument, options.sequence_id);
        const currentCamera = getCamera(currentDocument, id, currentSequence);
        if (
            currentSequence && currentCamera &&
            currentDocument.active_sequence_id === currentSequence.id &&
            currentDocument.active_camera_id === currentCamera.id &&
            (options.assign_to_sequence === false || currentSequence.camera_id === currentCamera.id)
        ) return true;
        return mutateDocument(document => {
            const sequence = getSequence(document, options.sequence_id);
            const camera = getCamera(document, id, sequence);
            if (!sequence || !camera) return false;
            document.active_sequence_id = sequence.id;
            document.active_camera_id = camera.id;
            if (options.assign_to_sequence !== false) sequence.camera_id = camera.id;
            return true;
        }, { warn: options.warn === true });
    }

    function deleteCamera(id, options = {}) {
        const cameraId = String(id || '');
        const remove = () => mutateDocument(document => {
            const index = document.cameras.findIndex(camera => camera.id === cameraId);
            if (index < 0) return false;
            document.cameras.splice(index, 1);
            document.sequences.forEach(sequence => {
                if (sequence.camera_id === cameraId) sequence.camera_id = '';
            });
            if (document.active_camera_id === cameraId) {
                document.active_camera_id = getSequence(document)?.camera_id || '';
            }
            return true;
        }, { syncElements: options.syncElements !== false });
        const removed = runCinematicUndo(translate(
            'lightflow_cinematic.undo.delete_camera',
            'Delete Lightflow Camera'
        ), remove, options);
        if (removed && options.syncElements !== false) syncCameraElementsFromDocument();
        return removed;
    }

    function adaptSequenceToActiveAnimation(sequenceId, options = {}) {
        const range = getActiveAnimationRange();
        if (!range || range.durationSeconds <= 0) {
            Blockbench.showQuickMessage(translate(
                'lightflow_cinematic.message.no_active_animation',
                'Select an animation with a non-zero duration first.'
            ));
            return null;
        }
        const adapt = () => mutateDocument(document => {
            const sequence = getSequence(document, sequenceId);
            if (!sequence) return null;
            const adapted = adaptSequenceValueToActiveAnimation(sequence);
            Object.assign(sequence, adapted, {
                id: sequence.id,
                created_at: sequence.created_at,
                updated_at: Date.now()
            });
            return deepClone(sequence);
        });
        return runCinematicUndo(translate(
            'lightflow_cinematic.undo.adapt_animation',
            'Fit Sequence to Active Animation'
        ), adapt, options);
    }

    function setSequenceFrameRate(sequenceId, rateValue, options = {}) {
        const update = () => mutateDocument(document => {
            const sequence = getSequence(document, sequenceId);
            if (!sequence) return null;
            const previousDurationSeconds = sequenceDurationSeconds(sequence);
            const previousFrames = sequenceDurationFrames(sequence);
            sequence.frame_rate = normalizeFrameRate(rateValue);
            if (sequence.duration_mode === 'active_animation') {
                const adapted = adaptSequenceValueToActiveAnimation(sequence);
                Object.assign(sequence, adapted, { id: sequence.id, created_at: sequence.created_at });
            } else if (sequence.duration_mode === 'seconds') {
                sequence.end_frame = sequence.start_frame + Math.max(
                    1,
                    Math.round(previousDurationSeconds * frameRateValue(sequence.frame_rate))
                );
            } else {
                sequence.end_frame = sequence.start_frame + previousFrames;
            }
            sequence.updated_at = Date.now();
            return deepClone(sequence);
        });
        return runCinematicUndo(translate(
            'lightflow_cinematic.undo.frame_rate',
            'Change Cinematic Frame Rate'
        ), update, options);
    }

    function getCurrentCaptureFrame(sequence) {
        if (typeof window.StudioRender?.getFrameState === 'function') {
            return normalizeCaptureFrame(window.StudioRender.getFrameState({
                owner: 'lightflow_cinematic',
                settings: {
                    resolution: sequence?.resolution || [1920, 1080],
                    capture_area: 'frame'
                }
            }));
        }
        return normalizeCaptureFrame(captureCurrentShot('Cinematic Capture Region')?.frame || sequence?.render_frame);
    }

    function projectionShiftFromCamera(camera) {
        camera?.updateProjectionMatrix?.();
        const elements = camera?.projectionMatrix?.elements || [];
        return {
            x: Number.isFinite(elements[8]) ? -elements[8] : 0,
            y: Number.isFinite(elements[9]) ? -elements[9] : 0
        };
    }

    function captureCurrentShot(name = 'Cinematic Shot') {
        if (typeof window.StudioRender?.captureShot === 'function') {
            const shot = window.StudioRender.captureShot(name, { exact_projection: true });
            if (shot) return shot;
        }
        const preview = getPreview();
        const camera = preview?.camera;
        if (!preview || !camera) return null;
        const width = Math.max(1, preview.width || preview.node?.clientWidth || 1);
        const height = Math.max(1, preview.height || preview.node?.clientHeight || 1);
        const shift = projectionShiftFromCamera(camera);
        return {
            id: createId('cinematic_shot'),
            name,
            camera: {
                projection: preview.isOrtho ? 'orthographic' : 'perspective',
                position: camera.position?.toArray?.() || [0, 0, 0],
                quaternion: camera.quaternion?.toArray?.() || [0, 0, 0, 1],
                up: camera.up?.toArray?.() || [0, 1, 0],
                target: preview.controls?.target?.toArray?.() || [0, 0, 0],
                controls_unlinked: !!preview.controls?.unlinked,
                exact_projection: true,
                near: camera.near,
                far: camera.far,
                reference_aspect: width / height,
                fov: camera.fov,
                zoom: camera.zoom,
                film_gauge: camera.filmGauge || DEFAULT_SENSOR_WIDTH_MM,
                projection_shift_x: shift.x,
                projection_shift_y: shift.y,
                focus: camera.focus,
                ortho_world_height: preview.isOrtho
                    ? (height / 40) / Math.max(0.0001, camera.zoom || 1)
                    : 1,
                layers_mask: camera.layers?.mask ?? 1
            },
            frame: { x: 0, y: 0, width: 1, height: 1 },
            output: {
                resolution_preset: 'custom',
                resolution: [width, height],
                output_scale: 1,
                capture_area: 'full',
                match_frame_ratio: true
            }
        };
    }

    function physicalStateFromShot(shot, fallback) {
        const camera = shot?.camera;
        if (!camera) return normalizePhysicalCameraState(fallback);
        const sensorWidth = Math.max(0.1, finite(camera.film_gauge, fallback?.sensor_width_mm || DEFAULT_SENSOR_WIDTH_MM));
        const aspect = Math.max(0.0001, finite(camera.reference_aspect, 16 / 9));
        const sensorHeight = Math.max(0.1, finite(fallback?.sensor_height_mm, sensorWidth / aspect));
        return normalizePhysicalCameraState({
            ...fallback,
            projection: camera.projection,
            position: camera.position,
            quaternion: camera.quaternion,
            up: camera.up,
            target: camera.target,
            sensor_width_mm: sensorWidth,
            sensor_height_mm: sensorHeight,
            focal_length_mm: verticalFovToFocalLength(camera.fov, sensorHeight),
            focus_distance: camera.focus,
            lens_shift_x: finite(camera.projection_shift_x, 0) / 2,
            lens_shift_y: finite(camera.projection_shift_y, 0) / 2,
            near_clip: camera.near,
            far_clip: camera.far,
            ortho_world_height: camera.ortho_world_height,
            layers_mask: camera.layers_mask
        }, fallback || defaultPhysicalCameraState());
    }

    function shotFromPhysicalState(stateValue, sequenceValue, name = 'Cinematic Shot') {
        const state = normalizePhysicalCameraState(stateValue);
        const sequence = normalizeSequence(sequenceValue || {});
        const aspect = sequence.resolution[0] / Math.max(1, sequence.resolution[1]);
        return {
            id: createId('cinematic_shot'),
            name,
            camera: {
                projection: state.projection,
                position: state.position.slice(),
                quaternion: state.quaternion.slice(),
                up: state.up.slice(),
                target: state.target.slice(),
                controls_unlinked: true,
                exact_projection: true,
                near: state.near_clip,
                far: state.far_clip,
                reference_aspect: aspect,
                fov: focalLengthToVerticalFov(state.focal_length_mm, state.sensor_height_mm),
                zoom: 1,
                film_gauge: state.sensor_width_mm,
                lens_shift_x: 0,
                projection_shift_x: state.lens_shift_x * 2,
                projection_shift_y: state.lens_shift_y * 2,
                focus: state.focus_distance,
                ortho_world_height: state.ortho_world_height,
                layers_mask: state.layers_mask
            },
            frame: deepClone(sequence.render_frame),
            output: {
                resolution_preset: 'custom',
                resolution: sequence.resolution.slice(),
                output_scale: 1,
                capture_area: sequence.capture_area,
                match_frame_ratio: sequence.match_frame_ratio
            }
        };
    }

    function applyPhysicalStateFallback(stateValue) {
        const state = normalizePhysicalCameraState(stateValue);
        const preview = getPreview();
        if (!preview) return false;
        const isOrtho = state.projection === 'orthographic';
        preview.setProjectionMode?.(isOrtho);
        const camera = isOrtho ? preview.camOrtho : preview.camPers;
        if (!camera) return false;
        camera.clearViewOffset?.();
        camera.position?.fromArray?.(state.position);
        camera.quaternion?.fromArray?.(state.quaternion);
        camera.up?.fromArray?.(state.up);
        camera.near = state.near_clip;
        camera.far = state.far_clip;
        camera.focus = state.focus_distance;
        if (camera.layers) camera.layers.mask = state.layers_mask;
        const width = Math.max(1, preview.width || preview.node?.clientWidth || 1);
        const height = Math.max(1, preview.height || preview.node?.clientHeight || 1);
        if (isOrtho) {
            camera.left = -width / 80;
            camera.right = width / 80;
            camera.top = height / 80;
            camera.bottom = -height / 80;
            camera.zoom = Math.max(0.0001, (camera.top - camera.bottom) / state.ortho_world_height);
        } else {
            camera.aspect = width / height;
            camera.fov = focalLengthToVerticalFov(state.focal_length_mm, state.sensor_height_mm);
            camera.filmGauge = state.sensor_width_mm;
            camera.filmOffset = 0;
            if (typeof camera.setViewOffset === 'function' && (state.lens_shift_x || state.lens_shift_y)) {
                camera.setViewOffset(
                    width,
                    height,
                    -state.lens_shift_x * width,
                    state.lens_shift_y * height,
                    width,
                    height
                );
            }
        }
        preview.controls?.target?.fromArray?.(state.target);
        if (preview.controls) preview.controls.unlinked = true;
        camera.updateProjectionMatrix?.();
        camera.updateMatrixWorld?.(true);
        preview.render?.();
        return true;
    }

    function applyPhysicalState(state, sequence) {
        if (typeof window.StudioRender?.applyShot === 'function') {
            return window.StudioRender.applyShot(
                shotFromPhysicalState(state, sequence),
                { transient: true, notify: false }
            );
        }
        return applyPhysicalStateFallback(state);
    }

    function setArrayProperty(target, key, value) {
        if (target?.[key] && typeof target[key].replace === 'function') target[key].replace(value);
        else target[key] = value.slice();
    }

    function resolveCameraSequence(document, cameraId) {
        const active = getSequence(document);
        if (active?.camera_id === cameraId) return active;
        return document.sequences.find(sequence => sequence.camera_id === cameraId) || active;
    }

    function getCameraElementById(cameraId) {
        if (!cameraElementType) return null;
        const elements = Array.isArray(cameraElementType.all)
            ? cameraElementType.all
            : (Array.isArray(window.Outliner?.elements) ? Outliner.elements : []);
        return elements.find(element => (
            element?.type === 'lightflow_camera' &&
            (element.cinematic_camera_id === cameraId || element.uuid === cameraId)
        )) || null;
    }

    function cameraElementWorldState(element, fallbackState) {
        const fallback = normalizePhysicalCameraState(fallbackState);
        const mesh = element?.mesh;
        if (!mesh || typeof THREE === 'undefined') return fallback;
        mesh.updateMatrixWorld?.(true);
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        mesh.getWorldPosition?.(position);
        mesh.getWorldQuaternion?.(quaternion);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
        const target = position.clone().add(forward.multiplyScalar(Math.max(0.0001, fallback.focus_distance)));
        return normalizePhysicalCameraState({
            ...fallback,
            position: position.toArray(),
            quaternion: quaternion.toArray(),
            target: target.toArray()
        }, fallback);
    }

    function getLocalCameraTransform(element, stateValue) {
        const state = normalizePhysicalCameraState(stateValue);
        const position = new THREE.Vector3().fromArray(state.position);
        const quaternion = new THREE.Quaternion().fromArray(state.quaternion);
        if (!element?.parent?.mesh) return { position, quaternion };
        element.parent.mesh.updateMatrixWorld?.(true);
        const worldMatrix = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
        const parentInverse = new THREE.Matrix4().copy(element.parent.mesh.matrixWorld);
        if (typeof parentInverse.invert === 'function') parentInverse.invert();
        else if (typeof parentInverse.getInverse === 'function') parentInverse.getInverse(element.parent.mesh.matrixWorld);
        const localMatrix = parentInverse.multiply(worldMatrix);
        const localScale = new THREE.Vector3();
        localMatrix.decompose(position, quaternion, localScale);
        return { position, quaternion };
    }

    function cameraFrustumVertices(stateValue, sequence) {
        const state = normalizePhysicalCameraState(stateValue);
        const aspect = sequence?.resolution?.[0] && sequence?.resolution?.[1]
            ? sequence.resolution[0] / sequence.resolution[1]
            : state.sensor_width_mm / Math.max(0.1, state.sensor_height_mm);
        const depth = 8;
        if (state.projection === 'orthographic') {
            const halfHeight = state.ortho_world_height / 2;
            const halfWidth = halfHeight * aspect;
            return [
                -halfWidth, -halfHeight, 0, -halfWidth, -halfHeight, -depth,
                 halfWidth, -halfHeight, 0,  halfWidth, -halfHeight, -depth,
                -halfWidth,  halfHeight, 0, -halfWidth,  halfHeight, -depth,
                 halfWidth,  halfHeight, 0,  halfWidth,  halfHeight, -depth,
                -halfWidth, -halfHeight, -depth,  halfWidth, -halfHeight, -depth,
                -halfWidth,  halfHeight, -depth,  halfWidth,  halfHeight, -depth,
                -halfWidth, -halfHeight, -depth, -halfWidth,  halfHeight, -depth,
                 halfWidth, -halfHeight, -depth,  halfWidth,  halfHeight, -depth
            ];
        }
        const halfHeight = Math.tan(focalLengthToVerticalFov(
            state.focal_length_mm,
            state.sensor_height_mm
        ) * Math.PI / 360) * depth;
        const halfWidth = halfHeight * aspect * state.anamorphic_squeeze;
        return [
            0, 0, 0, -halfWidth, -halfHeight, -depth,
            0, 0, 0,  halfWidth, -halfHeight, -depth,
            0, 0, 0, -halfWidth,  halfHeight, -depth,
            0, 0, 0,  halfWidth,  halfHeight, -depth,
            -halfWidth, -halfHeight, -depth,  halfWidth, -halfHeight, -depth,
            -halfWidth,  halfHeight, -depth,  halfWidth,  halfHeight, -depth,
            -halfWidth, -halfHeight, -depth, -halfWidth,  halfHeight, -depth,
             halfWidth, -halfHeight, -depth,  halfWidth,  halfHeight, -depth
        ];
    }

    function updateCameraElementGeometry(element, stateValue = null, sequenceValue = null) {
        if (!element?.mesh?.frustum || typeof THREE === 'undefined') return;
        const document = readDocumentView();
        const camera = getCamera(document, element.cinematic_camera_id);
        const sequence = sequenceValue || resolveCameraSequence(document, camera?.id);
        const frame = sequence
            ? clamp(timelineSecondsToFrame(sequence, typeof Timeline !== 'undefined' ? Timeline.time : 0), sequence.start_frame, sequence.end_frame - 1)
            : 0;
        const state = stateValue || sampleCamera(camera, frame) || camera?.base || defaultPhysicalCameraState();
        const vertices = cameraFrustumVertices(state, sequence);
        element.mesh.frustum.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(vertices, 3)
        );
        element.mesh.frustum.geometry.computeBoundingSphere?.();
    }

    function applyCameraStateToElement(element, stateValue, options = {}) {
        if (!element?.mesh || typeof THREE === 'undefined') return false;
        const state = normalizePhysicalCameraState(stateValue);
        const local = getLocalCameraTransform(element, state);
        if (options.persistProperties) {
            const euler = new THREE.Euler().setFromQuaternion(
                local.quaternion,
                window.Format?.euler_order || 'ZYX'
            );
            setArrayProperty(element, 'position', local.position.toArray());
            setArrayProperty(element, 'rotation', [euler.x, euler.y, euler.z].map(value => value * 180 / Math.PI));
            cameraPreviewController?.updateTransform?.(element);
        } else {
            element.mesh.position.copy(local.position);
            element.mesh.quaternion.copy(local.quaternion);
            element.mesh.updateMatrixWorld?.(true);
            updateCameraElementGeometry(element, state, options.sequence);
        }
        return true;
    }

    function applyCameraTimelineStateToElement(element, stateValue, sequence) {
        if (!element) return false;
        const previousSyncState = syncingCameraElements;
        syncingCameraElements = true;
        try {
            return applyCameraStateToElement(element, stateValue, {
                persistProperties: true,
                sequence
            });
        } finally {
            syncingCameraElements = previousSyncState;
        }
    }

    function syncCameraElementTransformToDocument(target, options = {}) {
        if (!target || syncingCameraElements || target.type !== 'lightflow_camera') return null;
        if (options.attachUndo !== false) attachCinematicDocumentToCurrentUndo();
        const document = readDocument();
        const sequence = resolveCameraSequence(document, target.cinematic_camera_id);
        const camera = getCamera(document, target.cinematic_camera_id, sequence);
        if (!sequence || !camera) return null;
        const frame = clamp(
            timelineSecondsToFrame(sequence, typeof Timeline !== 'undefined' ? Timeline.time : 0),
            sequence.start_frame,
            sequence.end_frame - 1
        );
        const previous = sampleCamera(camera, frame) || camera.base;
        return addOrUpdateCameraKeyframe(camera.id, frame, {
            sequence_id: sequence.id,
            state: cameraElementWorldState(target, previous),
            interpolation: camera.keyframes.find(keyframe => keyframe.frame === frame)?.interpolation || 'smooth',
            camera_name: target.name,
            syncElements: false,
            undo: false
        });
    }

    function queueCameraElementTransformWrite(element) {
        if (syncingCameraElements || !element) return;
        pendingCameraTransformElements.add(element);
        if (typeof Undo !== 'undefined' && Undo.current_save) return;
        pendingCameraTransformElements.delete(element);
        syncCameraElementTransformToDocument(element, { attachUndo: false });
    }

    function registerCinematicUndoHooks() {
        if (cinematicUndoHooks || typeof Blockbench === 'undefined') return cinematicUndoHooks;
        const createSaveListener = Blockbench.on('create_undo_save', event => {
            if (!event?.aspects?.[CINEMATIC_UNDO_ASPECT] || !event.save) return;
            event.save[CINEMATIC_UNDO_ASPECT] = serializeCinematicDocumentForUndo();
        });
        const finishEditListener = Blockbench.on('finish_edit', event => {
            if (unloading || syncingCameraElements) return;
            const affected = new Set(pendingCameraTransformElements);
            pendingCameraTransformElements.clear();
            if (Array.isArray(event?.aspects?.elements)) {
                event.aspects.elements.forEach(element => {
                    if (element?.type === 'lightflow_camera') affected.add(element);
                });
            }
            affected.forEach(element => syncCameraElementTransformToDocument(element));
            syncCinematicTimelineKeyframesToDocument(event?.aspects?.keyframes);
            if (typeof Undo !== 'undefined' && Undo.current_save?.aspects?.[CINEMATIC_UNDO_ASPECT]) {
                event.aspects[CINEMATIC_UNDO_ASPECT] = true;
            }
        });
        const loadSaveListener = Blockbench.on('load_undo_save', event => {
            const serialized = event?.save?.[CINEMATIC_UNDO_ASPECT];
            if (serialized === undefined) return;
            restoreCinematicDocumentFromUndo(serialized);
        });
        cinematicUndoHooks = {
            delete() {
                createSaveListener?.delete?.();
                finishEditListener?.delete?.();
                loadSaveListener?.delete?.();
                cinematicUndoHooks = null;
            }
        };
        return cinematicUndoHooks;
    }

    function syncCameraGizmoVisibility() {
        if (!cameraElementType) return;
        const showGizmos = typeof Canvas === 'undefined' || Canvas.show_gizmos !== false;
        (cameraElementType.all || []).forEach(element => {
            if (element.mesh) element.mesh.visible = element.visibility !== false && showGizmos;
        });
    }

    function registerCameraElementType() {
        if (
            cameraElementType ||
            typeof OutlinerElement === 'undefined' ||
            typeof NodePreviewController === 'undefined' ||
            typeof THREE === 'undefined' ||
            typeof Property === 'undefined'
        ) return cameraElementType;

        class LightflowCameraElement extends OutlinerElement {
            constructor(data, uuid) {
                super(data, uuid);
                for (const key in LightflowCameraElement.properties) {
                    LightflowCameraElement.properties[key].reset(this);
                }
                if (data && typeof data === 'object') this.extend(data);
                if (!this.cinematic_camera_id) this.cinematic_camera_id = this.uuid;
            }
            get origin() { return this.position; }
            getWorldCenter() {
                return this.mesh && THREE.fastWorldPosition
                    ? THREE.fastWorldPosition(this.mesh, Reusable.vec2)
                    : this.mesh?.getWorldPosition?.(new THREE.Vector3());
            }
            extend(object) {
                for (const key in LightflowCameraElement.properties) {
                    LightflowCameraElement.properties[key].merge(this, object);
                }
                this.sanitizeName?.();
                return this;
            }
            getUndoCopy() {
                const copy = new LightflowCameraElement(this);
                copy.uuid = this.uuid;
                delete copy.parent;
                return copy;
            }
            getSaveCopy() {
                const copy = {};
                for (const key in LightflowCameraElement.properties) {
                    LightflowCameraElement.properties[key].copy(this, copy);
                }
                copy.type = 'lightflow_camera';
                copy.uuid = this.uuid;
                return copy;
            }
            select(event, isOutlinerClick) {
                super.select(event, isOutlinerClick);
                if (!syncingCameraElements) {
                    setActiveCamera(this.cinematic_camera_id, {
                        assign_to_sequence: false,
                        warn: false
                    });
                    selectCameraTimelineTrack(this.cinematic_camera_id, { select: true });
                    scheduleManagerRefresh();
                }
                return this;
            }
            unselect(...args) {
                const result = super.unselect(...args);
                cinematicTimelineAnimators.forEach(animator => {
                    if (animator.camera_id === this.cinematic_camera_id) animator.selected = false;
                });
                return result;
            }
            remove(...args) {
                const cameraId = this.cinematic_camera_id;
                const result = super.remove(...args);
                if (!syncingCameraElements && cameraId) deleteCamera(cameraId, { syncElements: false });
                return result;
            }
            static behavior = {
                unique_name: true,
                movable: true,
                rotatable: true,
                parent_types: ['root', 'group', 'armature_bone'],
                hide_in_screenshot: true
            };
        }

        LightflowCameraElement.prototype.title = 'Lightflow Camera';
        LightflowCameraElement.prototype.type = 'lightflow_camera';
        LightflowCameraElement.prototype.icon = 'videocam';
        LightflowCameraElement.prototype.movable = true;
        LightflowCameraElement.prototype.rotatable = true;
        LightflowCameraElement.prototype.needsUniqueName = true;
        LightflowCameraElement.prototype.buttons = [
            Outliner.buttons.locked,
            Outliner.buttons.visibility
        ];

        cameraElementProperties = [
            new Property(LightflowCameraElement, 'string', 'name', { default: 'Lightflow Camera' }),
            new Property(LightflowCameraElement, 'string', 'cinematic_camera_id', { default: '' }),
            new Property(LightflowCameraElement, 'vector', 'position'),
            new Property(LightflowCameraElement, 'vector', 'rotation'),
            new Property(LightflowCameraElement, 'boolean', 'visibility', { default: true })
        ];
        OutlinerElement.registerType(LightflowCameraElement, 'lightflow_camera');
        cameraElementType = LightflowCameraElement;
        publishWindowBinding('LightflowCameraElement', LightflowCameraElement);
        armatureBoneCameraChildTypes = window.ArmatureBone?.behavior?.child_types || null;
        ownsArmatureBoneCameraChildType = Array.isArray(armatureBoneCameraChildTypes) &&
            !armatureBoneCameraChildTypes.includes('lightflow_camera');
        if (ownsArmatureBoneCameraChildType) armatureBoneCameraChildTypes.push('lightflow_camera');

        cameraPreviewController = new NodePreviewController(LightflowCameraElement, {
            setup(element) {
                const GeometryType = THREE.BoxBufferGeometry || THREE.BoxGeometry;
                const material = new THREE.MeshBasicMaterial({
                    color: 0x74b9ff,
                    transparent: true,
                    opacity: 0.9,
                    depthTest: false
                });
                const mesh = new THREE.Mesh(new GeometryType(1.8, 1.1, 1.25), material);
                Project.nodes_3d[element.uuid] = mesh;
                mesh.name = element.uuid;
                mesh.type = element.type;
                mesh.isElement = true;
                mesh.no_export = true;
                mesh.renderOrder = 1000;
                mesh.rotation.order = window.Format?.euler_order || 'ZYX';
                mesh.geometry.translate?.(0, 0, 0.35);

                const frustumGeometry = new THREE.BufferGeometry();
                const frustumMaterial = new THREE.LineBasicMaterial({
                    color: 0x74b9ff,
                    transparent: true,
                    opacity: 0.8,
                    depthTest: false
                });
                const frustum = new THREE.LineSegments(frustumGeometry, frustumMaterial);
                frustum.raycast = () => {};
                frustum.no_export = true;
                frustum.renderOrder = 1000;
                mesh.add(frustum);
                mesh.frustum = frustum;
                mesh.fix_position = new THREE.Vector3();
                mesh.fix_rotation = new THREE.Euler();

                this.updateTransform(element);
                syncCameraGizmoVisibility();
                this.dispatchEvent('setup', { element });
            },
            remove(element) {
                element?.mesh?.frustum?.geometry?.dispose?.();
                element?.mesh?.frustum?.material?.dispose?.();
                element?.mesh?.material?.dispose?.();
                NodePreviewController.prototype.remove.call(this, element);
            },
            updateTransform(element) {
                NodePreviewController.prototype.updateTransform.call(this, element);
                if (
                    element.parent?.type === 'armature_bone' &&
                    element.parent.mesh &&
                    element.mesh.parent !== element.parent.mesh
                ) {
                    element.parent.mesh.add(element.mesh);
                    element.mesh.updateMatrixWorld?.(true);
                }
                element.mesh.fix_position?.copy?.(element.mesh.position);
                element.mesh.fix_rotation?.copy?.(element.mesh.rotation);
                updateCameraElementGeometry(element);
                queueCameraElementTransformWrite(element);
                this.dispatchEvent('update_transform', { element });
            },
            updateSelection(element) {
                const color = element.selected ? 0xffa726 : 0x74b9ff;
                element.mesh?.material?.color?.setHex?.(color);
                element.mesh?.frustum?.material?.color?.setHex?.(color);
                this.dispatchEvent('update_selection', { element });
            }
        });
        return cameraElementType;
    }

    function syncCameraElementsFromDocument() {
        if (!registerCameraElementType() || !getActiveProject()) return;
        const document = readDocument();
        syncingCameraElements = true;
        try {
            const cameraIds = new Set(document.cameras.map(camera => camera.id));
            (cameraElementType.all || []).slice().forEach(element => {
                if (!cameraIds.has(element.cinematic_camera_id || element.uuid)) element.remove(false);
            });
            document.cameras.forEach(camera => {
                let element = getCameraElementById(camera.id);
                if (!element) {
                    const selectedNode = Array.isArray(window.Outliner?.selected) && Outliner.selected.length
                        ? Outliner.selected[Outliner.selected.length - 1]
                        : null;
                    const childTypes = selectedNode?.getTypeBehavior?.('child_types');
                    const parent = selectedNode?.getTypeBehavior?.('parent') &&
                        (!Array.isArray(childTypes) || childTypes.includes('lightflow_camera'))
                        ? selectedNode
                        : (typeof getCurrentGroup === 'function' ? getCurrentGroup() : 'root');
                    element = new cameraElementType({
                        name: camera.name,
                        cinematic_camera_id: camera.id,
                        visibility: true
                    }, camera.id).addTo(parent || 'root').init();
                }
                element.cinematic_camera_id = camera.id;
                element.name = camera.name;
                const sequence = resolveCameraSequence(document, camera.id);
                const frame = sequence
                    ? clamp(timelineSecondsToFrame(sequence, typeof Timeline !== 'undefined' ? Timeline.time : 0), sequence.start_frame, sequence.end_frame - 1)
                    : 0;
                applyCameraStateToElement(element, sampleCamera(camera, frame) || camera.base, {
                    persistProperties: true,
                    sequence
                });
                element.updateElement?.();
            });
            syncCameraGizmoVisibility();
        } finally {
            syncingCameraElements = false;
        }
    }

    function scheduleCameraElementSync() {
        if (!cameraElementType && typeof OutlinerElement === 'undefined') return;
        if (cameraElementSyncTimer != null) return;
        cameraElementSyncTimer = setTimeout(() => {
            cameraElementSyncTimer = null;
            syncCameraElementsFromDocument();
        }, 0);
    }

    function cancelPendingCameraElementWork() {
        if (cameraElementSyncTimer != null) clearTimeout(cameraElementSyncTimer);
        if (cinematicTimelineSyncTimer != null) clearTimeout(cinematicTimelineSyncTimer);
        cameraElementSyncTimer = null;
        cinematicTimelineSyncTimer = null;
        pendingCameraTransformElements.clear();
        clearCinematicTimelineAnimators();
    }

    function selectCameraElement(cameraId) {
        syncCameraElementsFromDocument();
        const element = getCameraElementById(cameraId);
        if (!element) return null;
        if (typeof unselectAll === 'function') unselectAll();
        element.select?.();
        return element;
    }

    function createCameraFromView(name, sequenceId, options = {}) {
        const shot = captureCurrentShot(name || 'Physical Camera');
        if (!shot) return null;
        const create = () => mutateDocument(document => {
            const sequence = getSequence(document, sequenceId);
            if (!sequence) return null;
            const frame = clamp(
                timelineSecondsToFrame(sequence, typeof Timeline !== 'undefined' ? Timeline.time : 0),
                sequence.start_frame,
                sequence.end_frame - 1
            );
            const state = physicalStateFromShot(shot, defaultPhysicalCameraState());
            const camera = normalizeCamera({
                name: name || 'Physical Camera ' + (document.cameras.length + 1),
                base: state,
                keyframes: [{ frame, interpolation: 'smooth', state }]
            });
            document.cameras.push(camera);
            sequence.camera_id = camera.id;
            sequence.updated_at = Date.now();
            document.active_sequence_id = sequence.id;
            document.active_camera_id = camera.id;
            return deepClone(camera);
        });
        const created = runCinematicUndo(translate(
            'lightflow_cinematic.undo.create_camera',
            'Create Lightflow Camera'
        ), create, options);
        if (created) selectCameraElement(created.id);
        return created;
    }

    function updateCameraFromView(cameraId, sequenceId) {
        const document = readDocument();
        const sequence = getSequence(document, sequenceId);
        const camera = getCamera(document, cameraId, sequence);
        if (!sequence || !camera) return null;
        const frame = clamp(
            timelineSecondsToFrame(sequence, typeof Timeline !== 'undefined' ? Timeline.time : 0),
            sequence.start_frame,
            sequence.end_frame - 1
        );
        const keyframe = addOrUpdateCameraKeyframe(camera.id, frame, { sequence_id: sequence.id });
        if (keyframe) selectCameraElement(camera.id);
        return keyframe;
    }

    function addOrUpdateCameraKeyframe(cameraId, frame, options = {}) {
        const shot = options.state ? null : captureCurrentShot('Camera Keyframe');
        if (!shot && !options.state) return null;
        const update = () => mutateDocument(document => {
            const sequence = getSequence(document, options.sequence_id);
            const camera = getCamera(document, cameraId, sequence);
            if (!sequence || !camera) return null;
            const keyframeFrame = clamp(
                Math.round(finite(frame, timelineSecondsToFrame(sequence, typeof Timeline !== 'undefined' ? Timeline.time : 0))),
                sequence.start_frame,
                sequence.end_frame - 1
            );
            const state = options.state
                ? normalizePhysicalCameraState(options.state, camera.base)
                : physicalStateFromShot(shot, camera.base);
            const existing = camera.keyframes.find(entry => entry.frame === keyframeFrame);
            const keyframe = normalizeCameraKeyframe({
                id: existing?.id,
                frame: keyframeFrame,
                interpolation: options.interpolation || existing?.interpolation || 'smooth',
                state
            }, camera.base);
            if (existing) Object.assign(existing, keyframe);
            else camera.keyframes.push(keyframe);
            camera.keyframes.sort((left, right) => left.frame - right.frame);
            if (options.camera_name != null) {
                camera.name = cleanName(options.camera_name, camera.name);
            }
            camera.updated_at = Date.now();
            document.active_sequence_id = sequence.id;
            document.active_camera_id = camera.id;
            sequence.camera_id = camera.id;
            return deepClone(keyframe);
        }, { syncElements: options.syncElements !== false });
        return runCinematicUndo(options.undo_label || translate(
            'lightflow_cinematic.undo.camera_keyframe',
            'Edit Lightflow Camera Keyframe'
        ), update, options);
    }

    function deleteCameraKeyframe(cameraId, keyframeId, options = {}) {
        const remove = () => mutateDocument(document => {
            const sequence = resolveCameraSequence(document, cameraId);
            const camera = getCamera(document, cameraId, sequence);
            if (!sequence || !camera) return false;
            const index = camera.keyframes.findIndex(keyframe => keyframe.id === keyframeId);
            if (index < 0) return false;
            camera.keyframes.splice(index, 1);
            camera.updated_at = Date.now();
            return true;
        }, { syncElements: options.syncElements !== false });
        return runCinematicUndo(translate(
            'lightflow_cinematic.undo.delete_camera_keyframe',
            'Delete Lightflow Camera Keyframe'
        ), remove, options);
    }

    function updateCameraKeyframeInterpolation(cameraId, keyframeId, interpolation, options = {}) {
        const update = () => mutateDocument(document => {
            const sequence = resolveCameraSequence(document, cameraId);
            const camera = getCamera(document, cameraId, sequence);
            const keyframe = camera?.keyframes.find(entry => entry.id === keyframeId);
            if (!sequence || !camera || !keyframe) return null;
            keyframe.interpolation = ['step', 'linear', 'smooth', 'ease_in', 'ease_out'].includes(interpolation)
                ? interpolation
                : keyframe.interpolation;
            camera.updated_at = Date.now();
            return deepClone(keyframe);
        }, { syncElements: options.syncElements !== false });
        return runCinematicUndo(translate(
            'lightflow_cinematic.undo.camera_interpolation',
            'Change Camera Keyframe Interpolation'
        ), update, options);
    }

    function nativeTimelineInterpolation(interpolation) {
        return interpolation === 'step' ? 'step' : 'linear';
    }

    function cinematicInterpolationFromNative(interpolation, fallback = 'smooth') {
        if (interpolation === 'step') return 'step';
        if (interpolation === 'linear') return 'linear';
        if (interpolation === 'catmullrom' || interpolation === 'bezier') return 'smooth';
        return fallback;
    }

    function removeCinematicTimelineAnimator(animator) {
        if (!animator) return;
        if (typeof Timeline !== 'undefined' && Array.isArray(Timeline.animators)) {
            const index = Timeline.animators.indexOf(animator);
            if (index >= 0) Timeline.animators.splice(index, 1);
            const markers = new Set(animator.keyframes || []);
            if (Array.isArray(Timeline.selected)) {
                for (let selectedIndex = Timeline.selected.length - 1; selectedIndex >= 0; selectedIndex--) {
                    if (markers.has(Timeline.selected[selectedIndex])) Timeline.selected.splice(selectedIndex, 1);
                }
            }
            if (Timeline.selected_animator === animator) Timeline.selected_animator = null;
        }
        animator.selected = false;
    }

    function clearCinematicTimelineAnimators() {
        cinematicTimelineAnimators.forEach(removeCinematicTimelineAnimator);
        cinematicTimelineAnimators.clear();
        try { Timeline.vue?.$forceUpdate?.(); } catch (error) {}
    }

    function registerCameraTimelineAnimatorType() {
        if (
            cameraTimelineAnimatorType ||
            typeof GeneralAnimator === 'undefined' ||
            typeof Keyframe === 'undefined'
        ) return cameraTimelineAnimatorType;

        class LightflowCameraTimelineAnimator extends GeneralAnimator {
            constructor(cameraId, animation) {
                super(cameraId, animation);
                this.camera_id = cameraId;
                this.element = getCameraElementById(cameraId);
                this.pose = [];
                this.lens = [];
                this.exposure = [];
                this.expanded = true;
            }
            get name() {
                const document = readDocument();
                const camera = getCamera(document, this.camera_id);
                return (camera?.name || this.element?.name || 'Lightflow Camera') + ' · Cinematic';
            }
            get node() {
                this.element = getCameraElementById(this.camera_id);
                return this.element;
            }
            select() {
                if (typeof Timeline === 'undefined') return this;
                Timeline.animators?.forEach?.(animator => { animator.selected = false; });
                this.selected = true;
                Timeline.selected_animator = this;
                this.addToTimeline();
                try { Vue.nextTick(() => this.scrollTo()); } catch (error) {}
                return this;
            }
            clickSelect() {
                selectCameraElement(this.camera_id);
                return this;
            }
            addKeyframe() {
                return null;
            }
            createKeyframe(value, time) {
                const document = readDocument();
                const sequence = resolveCameraSequence(document, this.camera_id);
                if (!sequence) return null;
                const frame = clamp(
                    timelineSecondsToFrame(sequence, typeof time === 'number' ? time : Timeline.time),
                    sequence.start_frame,
                    sequence.end_frame - 1
                );
                const created = addOrUpdateCameraKeyframe(this.camera_id, frame, {
                    sequence_id: sequence.id
                });
                scheduleCinematicTimelineSync();
                return created;
            }
            displayFrame() {}
        }
        LightflowCameraTimelineAnimator.prototype.type = 'lightflow_camera_timeline';
        LightflowCameraTimelineAnimator.prototype.channels = {
            pose: {
                name: translate('lightflow_cinematic.timeline.pose', 'Pose'),
                mutable: false,
                transform: false,
                max_data_points: 1
            },
            lens: {
                name: translate('lightflow_cinematic.timeline.lens', 'Lens / Focus'),
                mutable: false,
                transform: false,
                max_data_points: 1
            },
            exposure: {
                name: translate('lightflow_cinematic.timeline.exposure', 'Exposure'),
                mutable: false,
                transform: false,
                max_data_points: 1
            }
        };
        cameraTimelineAnimatorType = LightflowCameraTimelineAnimator;
        return cameraTimelineAnimatorType;
    }

    function openCinematicTimelineKeyframeMenu(marker, event) {
        if (!marker || typeof Menu === 'undefined') return;
        const document = readDocument();
        const sequence = resolveCameraSequence(document, marker.animator?.camera_id);
        const camera = getCamera(document, marker.animator?.camera_id, sequence);
        const keyframe = camera?.keyframes.find(entry => entry.id === marker.cinematic_keyframe_id);
        if (!sequence || !camera || !keyframe) return;
        new Menu([
            {
                name: 'lightflow_cinematic.action.camera_settings',
                icon: 'settings_photo_camera',
                click() {
                    Timeline.setTime?.(marker.time);
                    openPhysicalCameraDialog(camera.id, sequence.id);
                }
            },
            {
                name: 'lightflow_cinematic.field.interpolation',
                icon: 'timeline',
                children: ['step', 'linear', 'smooth', 'ease_in', 'ease_out'].map(value => ({
                    name: value.replace('_', ' '),
                    icon: keyframe.interpolation === value ? 'radio_button_checked' : 'radio_button_unchecked',
                    click() {
                        updateCameraKeyframeInterpolation(camera.id, keyframe.id, value);
                    }
                }))
            },
            '_',
            {
                name: 'generic.delete',
                icon: 'delete',
                click() {
                    deleteCameraKeyframe(camera.id, keyframe.id);
                }
            }
        ]).open(event, marker);
    }

    function rebuildCinematicTimelineAnimator(animator) {
        if (!animator || typeof Keyframe === 'undefined') return null;
        const document = readDocument();
        const sequence = resolveCameraSequence(document, animator.camera_id);
        const camera = getCamera(document, animator.camera_id, sequence);
        animator.element = getCameraElementById(animator.camera_id);
        ['pose', 'lens', 'exposure'].forEach(channel => { animator[channel].length = 0; });
        if (!sequence || !camera) return animator;
        camera.keyframes.forEach(cameraKeyframe => {
            const time = frameToTimelineSeconds(sequence, cameraKeyframe.frame);
            ['pose', 'lens', 'exposure'].forEach(channel => {
                const marker = new Keyframe({
                    channel,
                    time,
                    interpolation: nativeTimelineInterpolation(cameraKeyframe.interpolation)
                }, null, animator);
                marker.animator = animator;
                marker.cinematic_keyframe_id = cameraKeyframe.id;
                marker.cinematic_camera_id = camera.id;
                marker.cinematic_interpolation = cameraKeyframe.interpolation;
                marker.showContextMenu = event => openCinematicTimelineKeyframeMenu(marker, event);
                animator[channel].push(marker);
            });
        });
        return animator;
    }

    function selectCameraTimelineTrack(cameraId, options = {}) {
        const AnimatorType = registerCameraTimelineAnimatorType();
        if (
            !AnimatorType ||
            typeof Animation === 'undefined' ||
            !Animation.selected ||
            typeof Timeline === 'undefined' ||
            !Array.isArray(Timeline.animators) ||
            (typeof Animator !== 'undefined' && Animator.open === false)
        ) return null;
        const document = readDocument();
        const sequence = resolveCameraSequence(document, cameraId);
        if (
            sequence?.source_animation_id &&
            sequence.source_animation_id !== Animation.selected.uuid
        ) return null;
        const key = Animation.selected.uuid + ':' + cameraId;
        let animator = cinematicTimelineAnimators.get(key);
        if (!animator) {
            animator = new AnimatorType(cameraId, Animation.selected);
            cinematicTimelineAnimators.set(key, animator);
        }
        rebuildCinematicTimelineAnimator(animator);
        animator.addToTimeline();
        if (options.select !== false) animator.select();
        try { Timeline.vue?.$forceUpdate?.(); } catch (error) {}
        return animator;
    }

    function syncExistingCinematicTimelineAnimators() {
        if (typeof Animation === 'undefined' || !Animation.selected) {
            clearCinematicTimelineAnimators();
            return;
        }
        const document = readDocument();
        cinematicTimelineAnimators.forEach((animator, key) => {
            const sequence = resolveCameraSequence(document, animator.camera_id);
            if (
                animator.animation !== Animation.selected ||
                (sequence?.source_animation_id && sequence.source_animation_id !== Animation.selected.uuid)
            ) {
                removeCinematicTimelineAnimator(animator);
                cinematicTimelineAnimators.delete(key);
                return;
            }
            rebuildCinematicTimelineAnimator(animator);
        });
        try { Timeline.vue?.$forceUpdate?.(); } catch (error) {}
    }

    function scheduleCinematicTimelineSync() {
        if (cinematicTimelineSyncTimer != null) return;
        cinematicTimelineSyncTimer = setTimeout(() => {
            cinematicTimelineSyncTimer = null;
            syncExistingCinematicTimelineAnimators();
        }, 0);
    }

    function showActiveCameraTimelineTrack(options = {}) {
        const document = readDocument();
        const sequence = getSequence(document);
        const camera = getCamera(document, null, sequence);
        return camera ? selectCameraTimelineTrack(camera.id, options) : null;
    }

    function syncCinematicTimelineKeyframesToDocument(keyframes) {
        const markers = (Array.isArray(keyframes) ? keyframes : [])
            .filter(keyframe => keyframe?.animator?.type === 'lightflow_camera_timeline' && keyframe.cinematic_keyframe_id);
        if (!markers.length) return false;
        attachCinematicDocumentToCurrentUndo();
        return mutateDocument(document => {
            const processed = new Set();
            let changed = false;
            markers.forEach(marker => {
                const cameraId = marker.animator.camera_id;
                const key = cameraId + ':' + marker.cinematic_keyframe_id;
                if (processed.has(key)) return;
                processed.add(key);
                const sequence = resolveCameraSequence(document, cameraId);
                const camera = getCamera(document, cameraId, sequence);
                const keyframeIndex = camera?.keyframes.findIndex(entry => entry.id === marker.cinematic_keyframe_id) ?? -1;
                if (!sequence || !camera || keyframeIndex < 0) return;
                const markerStillExists = Array.isArray(marker.animator[marker.channel]) &&
                    marker.animator[marker.channel].includes(marker);
                if (!markerStillExists) {
                    camera.keyframes.splice(keyframeIndex, 1);
                    camera.updated_at = Date.now();
                    changed = true;
                    return;
                }
                const keyframe = camera.keyframes[keyframeIndex];
                const nextFrame = clamp(
                    timelineSecondsToFrame(sequence, marker.time),
                    sequence.start_frame,
                    sequence.end_frame - 1
                );
                const nextInterpolation = marker.interpolation === nativeTimelineInterpolation(marker.cinematic_interpolation)
                    ? marker.cinematic_interpolation
                    : cinematicInterpolationFromNative(marker.interpolation, keyframe.interpolation);
                if (keyframe.frame !== nextFrame || keyframe.interpolation !== nextInterpolation) {
                    keyframe.frame = nextFrame;
                    keyframe.interpolation = nextInterpolation;
                    camera.keyframes = camera.keyframes.filter(entry => (
                        entry.id === keyframe.id || entry.frame !== nextFrame
                    ));
                    camera.keyframes.sort((left, right) => left.frame - right.frame);
                    camera.updated_at = Date.now();
                    changed = true;
                }
            });
            return changed;
        }, { syncElements: false });
    }

    function sampleCamera(cameraValue, frameValue) {
        const camera = normalizeCamera(cameraValue);
        if (!camera) return null;
        const frame = finite(frameValue, 0);
        if (!camera.keyframes.length) return deepClone(camera.base);
        const exact = camera.keyframes.find(keyframe => Math.abs(frame - keyframe.frame) < 1e-8);
        if (exact) return deepClone(exact.state);
        if (frame <= camera.keyframes[0].frame) return deepClone(camera.keyframes[0].state);
        const last = camera.keyframes[camera.keyframes.length - 1];
        if (frame >= last.frame) return deepClone(last.state);
        for (let index = 0; index < camera.keyframes.length - 1; index++) {
            const left = camera.keyframes[index];
            const right = camera.keyframes[index + 1];
            if (frame < left.frame || frame > right.frame) continue;
            const span = Math.max(1e-8, right.frame - left.frame);
            return interpolatePhysicalCameraState(
                left.state,
                right.state,
                (frame - left.frame) / span,
                left.interpolation
            );
        }
        return deepClone(last.state);
    }

    function dispatchCinematicEvent(name, detail) {
        try { Blockbench.dispatchEvent(name, detail); } catch (error) {}
        try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (error) {}
    }

    function setFrameContext(context) {
        if (unloading) return;
        publishWindowBinding('LightflowCinematicFrameContext', context || null);
    }

    function waitForFrames(count = 1) {
        let remaining = Math.max(0, Math.round(count));
        return new Promise(resolve => {
            const next = () => {
                if (remaining-- <= 0) {
                    resolve();
                    return;
                }
                let completed = false, frameHandle = null;
                const advance = () => {
                    if (completed) return;
                    completed = true;
                    clearTimeout(timer);
                    if (frameHandle != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameHandle);
                    next();
                };
                // Offline rendering must advance even in hidden/minimized windows.
                const timer = setTimeout(advance, 50);
                if (typeof requestAnimationFrame === 'function') frameHandle = requestAnimationFrame(advance);
            };
            next();
        });
    }

    async function evaluateFrame(sequenceId, frameValue, options = {}) {
        const document = options.render_document || readDocument();
        const sequence = options.sequence_override || getSequence(document, sequenceId);
        const camera = getCamera(document, options.camera_id, sequence);
        if (!sequence) throw new Error('Cinematic sequence not found.');
        const frame = clamp(
            options.subframe ? finite(frameValue, sequence.start_frame) : Math.round(finite(frameValue, sequence.start_frame)),
            sequence.start_frame,
            sequence.end_frame - (options.subframe ? 1e-8 : 1)
        );
        const timeSeconds = frameToTimelineSeconds(sequence, frame, options.subframe);
        const context = Object.freeze({
            version: 1,
            source: options.source || 'lightflow_cinematic',
            sequenceId: sequence.id,
            cameraId: camera?.id || '',
            frame,
            sequenceFrame: frame - sequence.start_frame,
            startFrame: sequence.start_frame,
            endFrame: sequence.end_frame,
            frameRate: deepClone(sequence.frame_rate),
            timeSeconds,
            timestampMicroseconds: frameTimestampMicroseconds(sequence, frame),
            shutterSample: finite(options.shutter_sample, 0.5),
            shutterSamples: Math.max(1, Math.round(finite(options.shutter_samples, 1))),
            deterministic: true
        });
        setFrameContext(context);
        dispatchCinematicEvent('lightflow_cinematic_pre_evaluate', context);
        if (typeof Timeline !== 'undefined' && typeof Timeline.setTime === 'function') {
            Timeline.setTime(timeSeconds);
        }
        if (typeof Animator !== 'undefined' && typeof Animator.preview === 'function') {
            Animator.preview(false);
        }
        let cameraState = null;
        if (camera && options.apply_camera !== false) {
            cameraState = sampleCamera(camera, frame);
            applyPhysicalState(cameraState, sequence);
            applyCameraTimelineStateToElement(getCameraElementById(camera.id), cameraState, sequence);
        }
        const evaluated = Object.freeze({ ...context, cameraState: cameraState ? deepClone(cameraState) : null });
        setFrameContext(evaluated);
        syncCinematicTimingToolbar(frame);
        dispatchCinematicEvent('lightflow_cinematic_frame_evaluated', evaluated);
        try { window.LightflowRequestPreviewRender?.({ cause: 'cinematic_frame', immediate: true }); } catch (error) {}
        if (options.settle_frames !== 0) await waitForFrames(options.settle_frames == null ? 1 : options.settle_frames);
        return evaluated;
    }

    function buildStudioRenderSettings(sequence) {
        const current = window.StudioRender?.settings || {};
        return {
            ...current,
            ...sanitizeStudioSettings(sequence.studio),
            camera_preset_id: '',
            angle_preset: 'view',
            zoom: null,
            resolution_preset: 'custom',
            resolution: sequence.resolution.slice(),
            output_scale: 1,
            samples: String(sequence.samples),
            capture_area: sequence.capture_area,
            match_frame_ratio: sequence.match_frame_ratio,
            show_gizmos: false,
            destination: 'preview',
            file_name: cleanFileComponent(sequence.name)
        };
    }

    function cleanFileComponent(value) {
        return cleanName(value, 'sequence', 60)
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/[. ]+$/g, '') || 'sequence';
    }

    function captureRestoreState() {
        return {
            animationSelection: typeof AnimationItem !== 'undefined' ? AnimationItem.selected
                : (typeof Animation !== 'undefined' ? Animation.selected : null),
            animationStates: getCinematicAnimations().map(animation => ({ animation, playing: animation.playing })),
            selectedElements: Array.isArray(window.Outliner?.selected) ? Outliner.selected.slice() : [],
            timelineTime: typeof Timeline !== 'undefined' ? finite(Timeline.time, 0) : null,
            shot: captureCurrentShot('Cinematic Restore'),
            frameContext: window.LightflowCinematicFrameContext || null
        };
    }

    function restoreEvaluationState(state) {
        if (!state) return;
        if (state.animationSelection && typeof state.animationSelection.select === 'function') state.animationSelection.select();
        else if (!state.animationSelection && typeof AnimationItem !== 'undefined') {
            if (AnimationItem.selected) AnimationItem.selected.selected = false;
            AnimationItem.selected = null;
            if (typeof Timeline !== 'undefined') Timeline.clear?.();
        }
        for (const entry of state.animationStates || []) entry.animation.playing = entry.playing;
        for (const element of state.selectedElements || []) element.selectLow?.();
        if (state.timelineTime != null && typeof Timeline !== 'undefined' && typeof Timeline.setTime === 'function') {
            Timeline.setTime(state.timelineTime);
            if (typeof Animator !== 'undefined' && typeof Animator.preview === 'function') Animator.preview(false);
        }
        if (state.shot) {
            if (typeof window.StudioRender?.applyShot === 'function') {
                window.StudioRender.applyShot(state.shot, { transient: true, notify: false });
            } else {
                applyPhysicalStateFallback(physicalStateFromShot(state.shot));
            }
        }
        setFrameContext(state.frameContext || null);
        scheduleCameraElementSync();
        try { window.LightflowRequestPreviewRender?.({ cause: 'cinematic_restore', immediate: true }); } catch (error) {}
    }

    function getCinematicAnimations() {
        if (typeof Animation === 'undefined') return [];
        if (Array.isArray(Animation.all)) return Animation.all;
        if (typeof Animator !== 'undefined' && Array.isArray(Animator.animations)) return Animator.animations;
        return Animation.selected ? [Animation.selected] : [];
    }

    function resolveCinematicSourceAnimation(sequence) {
        if (!sequence.source_animation_id) return null;
        const animation = getCinematicAnimations().find(item => item.uuid === sequence.source_animation_id);
        if (!animation) throw new Error('The source animation for this sequence is missing: ' +
            (sequence.source_animation_name || sequence.source_animation_id));
        return animation;
    }

    function activateCinematicSourceAnimation(animation) {
        if (!animation) return;
        if (Animation.selected !== animation) {
            if (typeof animation.select !== 'function') throw new Error('The source animation cannot be selected.');
            animation.select();
        }
        // A bound shot has one source. Locked native preview layers must not leak into it.
        for (const item of getCinematicAnimations()) item.playing = item === animation;
    }

    function cancelActiveRender(reason = 'user_cancelled') {
        if (!activeRenderJob) return false;
        activeRenderJob.cancelled = true;
        activeRenderJob.cancelReason = String(reason || 'user_cancelled');
        window.StudioRender?.cancelRender?.('lightflow_cinematic:' + activeRenderJob.cancelReason);
        activeEncoderProcess?.kill?.();
        if (activeSinkCancellation) {
            try { Promise.resolve(activeSinkCancellation()).catch(() => {}); } catch (_) {}
        }
        return true;
    }

    function snapshotRenderJob(job) {
        if (!job) return null;
        const { project, ...serializable } = job;
        return deepClone(serializable);
    }

    async function renderSequence(options = {}) {
        if (activeRenderJob) throw new Error('A Lightflow Cinematic render is already active.');
        if (typeof window.StudioRender?.renderFrame !== 'function') {
            throw new Error('Studio Render 1.9.10 or newer is required for deterministic frame handoff.');
        }
        const project = getActiveProject();
        let document = readDocument(project);
        const montagePlan = options.montage ? buildMontagePlan(document) : null;
        if (montagePlan) montagePlan.shots.forEach(shot => {
            resolveCinematicSourceAnimation(shot.sequence);
            shot.renderSequence = { ...shot.sequence, resolution: montagePlan.sequence.resolution, samples: montagePlan.sequence.samples };
            shot.settings = buildStudioRenderSettings(shot.renderSequence);
        });
        let sequence = montagePlan ? montagePlan.sequence : getSequence(document, options.sequence_id);
        let sourceAnimation = sequence ? resolveCinematicSourceAnimation(montagePlan ? montagePlan.shots[0].sequence : sequence) : null;
        if (!montagePlan && sequence?.duration_mode === 'active_animation' && getActiveAnimationRange() &&
            (!sourceAnimation || sourceAnimation === Animation.selected)) {
            adaptSequenceToActiveAnimation(sequence.id);
            document = readDocument(project);
            sequence = getSequence(document, options.sequence_id);
        }
        const camera = getCamera(document, options.camera_id, sequence);
        const sink = options.sink;
        if (!sequence) throw new Error('Cinematic sequence not found.');
        if (!camera) throw new Error('The sequence has no physical camera.');
        if (!sink || typeof sink.writeFrame !== 'function') {
            throw new Error('A streaming frame sink is required.');
        }
        const firstFrame = clamp(
            Math.round(finite(options.start_frame, sequence.start_frame)),
            sequence.start_frame,
            sequence.end_frame - 1
        );
        const endFrame = clamp(
            Math.round(finite(options.end_frame, sequence.end_frame)),
            firstFrame + 1,
            sequence.end_frame
        );
        const totalFrames = endFrame - firstFrame;
        const restoreState = captureRestoreState();
        const job = {
            id: createId('cinematic_render'),
            project,
            sequenceId: sequence.id,
            cameraId: camera.id,
            firstFrame,
            endFrame,
            totalFrames,
            completedFrames: 0,
            cancelled: false,
            cancelReason: '',
            startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now()
        };
        activeRenderJob = job;
        activeSinkCancellation = typeof sink.cancel === 'function' ? () => sink.cancel() : null;
        if (typeof BARS !== 'undefined') BARS.updateConditions?.();
        const settings = buildStudioRenderSettings(sequence);
        let failure = null;
        let sinkStarted = false;
        try {
            pauseCinematicPlayback();
            activateCinematicSourceAnimation(sourceAnimation);
            let renderAnimationSelection = typeof Animation !== 'undefined' ? Animation.selected : null;
            let renderAnimationMix = getCinematicAnimations().map(animation => ({ animation, playing: animation.playing }));
            let previousShot = null;
            let montageShotIndex = 0;
            sinkStarted = true;
            if (typeof sink.begin === 'function') {
                await sink.begin({
                    job: snapshotRenderJob(job),
                    sequence: deepClone(sequence),
                    camera: deepClone(camera),
                    montage: montagePlan ? deepClone(document.montage) : null,
                    settings: deepClone(settings)
                });
            }
            dispatchCinematicEvent('lightflow_cinematic_render_started', {
                job: snapshotRenderJob(job),
                sequence: deepClone(sequence)
            });
            for (let frame = firstFrame; frame < endFrame; frame++) {
                if (job.cancelled) break;
                if (getActiveProject() !== project) throw new Error('The active Blockbench project changed during render.');
                if (sourceAnimation && (Animation.selected !== sourceAnimation || !getCinematicAnimations().includes(sourceAnimation))) {
                    throw new Error('The source animation changed during render.');
                }
                if ((typeof Animation !== 'undefined' && Animation.selected !== renderAnimationSelection) ||
                    renderAnimationMix.some(entry => entry.animation.playing !== entry.playing)) {
                    throw new Error('The animation mix changed during render.');
                }
                if (montagePlan) {
                    while (montageShotIndex < montagePlan.shots.length - 1 && frame >= montagePlan.shots[montageShotIndex].end) montageShotIndex++;
                }
                const shot = montagePlan?.shots[montageShotIndex];
                if (shot && shot !== previousShot) {
                    if (!shot.sequence.source_animation_id) {
                        restoreState.animationSelection?.select?.();
                        for (const entry of restoreState.animationStates) entry.animation.playing = entry.playing;
                    }
                    sourceAnimation = resolveCinematicSourceAnimation(shot.sequence);
                    activateCinematicSourceAnimation(sourceAnimation);
                    renderAnimationSelection = typeof Animation !== 'undefined' ? Animation.selected : null;
                    renderAnimationMix = getCinematicAnimations().map(animation => ({ animation, playing: animation.playing }));
                    previousShot = shot;
                    job.clipId = shot.clip.id;
                    job.cameraId = shot.camera.id;
                }
                const frameSequence = shot ? shot.renderSequence : sequence;
                const sourceFrame = shot ? Math.min(shot.clip.out_frame - 1e-8,
                    shot.clip.in_frame + (frame - shot.start) / frameRateValue(sequence.frame_rate) *
                    frameRateValue(shot.sequence.frame_rate) * shot.clip.speed) : frame;
                const evaluated = await evaluateFrame(frameSequence.id, sourceFrame, {
                    render_document: document,
                    sequence_override: frameSequence,
                    subframe: !!shot,
                    camera_id: shot ? shot.camera.id : camera.id,
                    source: 'lightflow_cinematic_render',
                    settle_frames: 1
                });
                if (job.cancelled) break;
                Blockbench.setStatusBarText(
                    translate('lightflow_cinematic.status.rendering', 'Rendering cinematic frame') +
                    ' ' + (job.completedFrames + 1) + ' / ' + totalFrames
                );
                let frameConsumed = false;
                const result = await window.StudioRender.renderFrame(
                    shot ? shot.settings : settings,
                    async payload => {
                        await sink.writeFrame({
                            ...payload,
                            frame,
                            sourceFrame,
                            sourceSequenceId: frameSequence.id,
                            clipId: shot?.clip.id || '',
                            sequenceFrame: frame - sequence.start_frame,
                            timeSeconds: evaluated.timeSeconds,
                            timestampMicroseconds: frameTimestampMicroseconds(sequence, frame),
                            durationMicroseconds:
                                frameTimestampMicroseconds(sequence, frame + 1) -
                                frameTimestampMicroseconds(sequence, frame),
                            sequence: deepClone(sequence),
                            cameraState: evaluated.cameraState ? deepClone(evaluated.cameraState) : null
                        });
                        frameConsumed = true;
                    },
                    {
                        silent: true,
                        frameState: frameSequence.capture_area === 'frame'
                            ? deepClone(frameSequence.render_frame)
                            : null
                    }
                );
                if (frameConsumed) job.completedFrames += 1;
                if (result?.cancelled && !job.cancelled) {
                    job.cancelled = true;
                    job.cancelReason = result.cancelReason || 'studio_render_cancelled';
                }
                if (job.cancelled) break;
                if (!result?.ok) throw new Error(result?.error || 'Studio Render did not return a completed frame.');
                if (!frameConsumed) throw new Error('Studio Render completed without delivering a frame.');
                dispatchCinematicEvent('lightflow_cinematic_frame_rendered', {
                    job: snapshotRenderJob(job),
                    frame,
                    result: deepClone(result)
                });
            }
            if (job.cancelled) {
                if (typeof sink.abort === 'function') await sink.abort({ job: snapshotRenderJob(job), reason: job.cancelReason });
            } else if (typeof sink.end === 'function') {
                await sink.end({ job: snapshotRenderJob(job), sequence: deepClone(sequence) });
            }
        } catch (error) {
            failure = job.cancelled ? null : error;
            if (sinkStarted && typeof sink.abort === 'function') {
                try { await sink.abort({ job: snapshotRenderJob(job), reason: error?.message || String(error), error }); } catch (abortError) {}
            }
        } finally {
            try {
                if (getActiveProject() === project) restoreEvaluationState(restoreState);
                else setFrameContext(null);
            } catch (restoreError) {
                failure = failure || restoreError;
                setFrameContext(null);
            }
            // Release ownership even when native restoration fails.
            if (activeRenderJob === job) activeRenderJob = null;
            activeSinkCancellation = null;
            Blockbench.setProgress();
            Blockbench.setStatusBarText();
            if (typeof BARS !== 'undefined') BARS.updateConditions?.();
            dispatchCinematicEvent('lightflow_cinematic_render_complete', {
                job: snapshotRenderJob(job),
                cancelled: job.cancelled,
                error: failure?.message || null
            });
        }
        if (failure) throw failure;
        return {
            ok: !job.cancelled,
            cancelled: job.cancelled,
            cancelReason: job.cancelReason,
            completedFrames: job.completedFrames,
            totalFrames
        };
    }

    function canvasToPngBlob(canvas) {
        return new Promise((resolve, reject) => {
            if (!canvas?.toBlob) {
                reject(new Error('The rendered canvas cannot be encoded as PNG.'));
                return;
            }
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('PNG encoding returned an empty frame.'));
            }, 'image/png');
        });
    }

    function writeDesktopFile(path, content, savetype = 'binary') {
        if (typeof require === 'function') {
            const data = content instanceof ArrayBuffer ? require('buffer').Buffer.from(content) : content;
            return desktopFileModules(require('path').dirname(path)).fs.writeFile(path, data).then(() => path);
        }
        return new Promise((resolve, reject) => {
            try {
                Blockbench.writeFile(path, { content, savetype }, writtenPath => resolve(writtenPath || path));
            } catch (error) {
                reject(error);
            }
        });
    }

    function joinFilesystemPath(directory, fileName) {
        const separator = String(directory).includes('\\') ? '\\' : '/';
        return String(directory).replace(/[\\/]+$/g, '') + separator + fileName;
    }

    function renderJobPrefix(sequence) {
        const date = new Date();
        const stamp = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0'),
            String(date.getHours()).padStart(2, '0'),
            String(date.getMinutes()).padStart(2, '0'),
            String(date.getSeconds()).padStart(2, '0')
        ].join('');
        return cleanFileComponent(sequence.name) + '_' + stamp + '_' + Math.random().toString(36).slice(2, 6);
    }

    function formatFrameNumber(frame, digits) {
        const rounded = Math.round(frame);
        return rounded < 0
            ? 'm' + String(Math.abs(rounded)).padStart(digits, '0')
            : String(rounded).padStart(digits, '0');
    }

    function createPngSequenceSink(target, options = {}) {
        const sequence = normalizeSequence(options.sequence || {});
        const prefix = options.prefix || renderJobPrefix(sequence);
        const digits = Math.max(4, String(Math.max(Math.abs(sequence.start_frame), Math.abs(sequence.end_frame - 1))).length);
        const manifest = {
            schema: 1,
            generator: 'Lightflow Cinematic',
            prefix,
            sequence: deepClone(sequence),
            frames: []
        };
        const isDesktop = target?.kind === 'desktop_directory';
        const isWeb = target?.kind === 'web_directory';
        const checkpointInterval = Math.max(1, Math.round(finite(options.checkpoint_interval, 24)));
        if (!isDesktop && !isWeb) throw new Error('Unsupported PNG sequence target.');
        async function writeNamedFile(fileName, content) {
            if (isDesktop) {
                const data = content instanceof Blob ? await content.arrayBuffer() : content;
                return writeDesktopFile(joinFilesystemPath(target.path, fileName), data, data instanceof ArrayBuffer ? 'binary' : 'text');
            }
            const handle = await target.handle.getFileHandle(fileName, { create: true });
            const writable = await handle.createWritable();
            try {
                await writable.write(content);
            } finally {
                await writable.close();
            }
            return fileName;
        }
        async function checkpoint() {
            manifest.completed_frames = manifest.frames.length;
            manifest.checkpoint_at = new Date().toISOString();
            await writeNamedFile(prefix + '_manifest.partial.json',
                new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
        }
        return {
            kind: 'png_sequence',
            prefix,
            async begin(context) {
                manifest.job = context.job;
                manifest.camera = context.camera;
                if (context.montage) manifest.montage = deepClone(context.montage);
                manifest.sequence = deepClone(context.sequence);
                manifest.settings = deepClone(context.settings);
                manifest.started_at = new Date().toISOString();
                manifest.status = 'rendering';
                await checkpoint();
            },
            async writeFrame(payload) {
                const outputFrame = options.zero_based ? manifest.frames.length : payload.frame;
                const fileName = prefix + '_' + formatFrameNumber(outputFrame, digits) + '.png';
                const blob = await canvasToPngBlob(payload.canvas);
                await writeNamedFile(fileName, blob);
                manifest.frames.push({
                    frame: payload.frame,
                    file: fileName,
                    timestamp_microseconds: payload.timestampMicroseconds,
                    duration_microseconds: payload.durationMicroseconds,
                    bytes: blob.size
                });
                if (manifest.frames.length % checkpointInterval === 0) await checkpoint();
            },
            async end(context) {
                manifest.completed_at = new Date().toISOString();
                manifest.status = 'complete';
                manifest.completed_frames = context.job.completedFrames;
                await checkpoint();
                await writeNamedFile(
                    prefix + '_manifest.json',
                    new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
                );
            },
            async abort(context) {
                manifest.aborted_at = new Date().toISOString();
                manifest.status = 'aborted';
                manifest.abort_reason = context.reason || 'cancelled';
                manifest.completed_frames = context.job?.completedFrames || manifest.frames.length;
                await writeNamedFile(
                    prefix + '_manifest.partial.json',
                    new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
                );
            }
        };
    }

    async function choosePngSequenceTarget() {
        if (isCinematicDesktop() && typeof Blockbench.pickDirectory === 'function') {
            const path = Blockbench.pickDirectory({
                title: translate('lightflow_cinematic.dialog.output_directory', 'Choose PNG sequence directory'),
                resource_id: 'lightflow_cinematic_frames'
            });
            return path ? { kind: 'desktop_directory', path } : null;
        }
        if (typeof window.showDirectoryPicker === 'function') {
            try {
                const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                return handle ? { kind: 'web_directory', handle } : null;
            } catch (error) {
                if (error?.name === 'AbortError') return null;
                throw error;
            }
        }
        throw new Error('This browser cannot stream files to a directory. Use a Chromium browser with File System Access support.');
    }

    async function renderPngSequence(sequenceId) {
        const document = readDocument();
        const sequence = getSequence(document, sequenceId);
        if (!sequence) throw new Error('Cinematic sequence not found.');
        const target = await choosePngSequenceTarget();
        if (!target) return { ok: false, cancelled: true, completedFrames: 0, totalFrames: 0 };
        const sink = createPngSequenceSink(target, { sequence });
        return renderSequence({ sequence_id: sequence.id, sink });
    }

    function renderMontage(options = {}) {
        return renderSequence({ ...options, montage: true });
    }

    async function exportMontage(options = {}) {
        const project = getActiveProject();
        const plan = buildMontagePlan();
        const format = options.format || plan.sequence.output_format;
        if (format === 'png') {
            const target = options.target || await choosePngSequenceTarget();
            if (!target) return { cancelled: true, completedFrames: 0 };
            if (getActiveProject() !== project) throw new Error('The active project changed before export.');
            return renderMontage({ sink: createPngSequenceSink(target, { sequence: plan.sequence, zero_based: true }) });
        }
        const target = options.target || await chooseBinaryExportTarget(format, plan.sequence.name);
        if (!target) return { cancelled: true, completedFrames: 0 };
        try {
            if (getActiveProject() !== project) throw new Error('The active project changed before export.');
            const sink = format === 'gif' ? createIntegratedGifSink(target, options)
                : createIntegratedVideoSink(target, { ...options, format });
            const result = await renderMontage({ sink });
            return { ...result, outputPath: result.ok ? target.outputPath : null };
        } catch (error) { try { await target.abort?.(); } catch (_) {} throw error; }
    }

    function openMontageDialog(selectedClipId = '') {
        if (!getActiveProject()) return;
        montageDialog?.hide?.();
        const document = readDocument();
        const montage = document.montage;
        const clip = montage.clips.find(item => item.id === selectedClipId) || montage.clips[0];
        const clipId = clip?.id || '';
        let summary;
        try {
            const plan = buildMontagePlan(document);
            summary = plan.shots.length + ' shots · ' + sequenceDurationFrames(plan.sequence) + ' frames · ' +
                formatDurationSeconds(sequenceDurationSeconds(plan.sequence));
        } catch (error) { summary = error.message; }
        const save = form => {
            const clips = readDocument().montage.clips.map(item => item.id === clipId ? { ...item,
                in_frame: form.in_frame, out_frame: form.out_frame, speed: form.speed } : item);
            return updateMontage({ name: form.name, frame_rate: normalizeFrameRate(form.frame_rate),
                resolution: form.resolution, samples: form.samples, video_quality: form.video_quality,
                output_format: form.output_format, clips });
        };
        montageDialog = new Dialog({
            id: 'lightflow_cinematic_montage', title: 'lightflow_cinematic.montage.title', width: 720,
            form: {
                name: cinematicText({ label: 'generic.name', value: montage.name }),
                summary: { type: 'info', text: summary },
                frame_rate: cinematicSelect({ label: 'lightflow_cinematic.field.frame_rate', value: frameRateKey(montage.frame_rate), options: frameRateOptions() }),
                resolution: cinematicVector({ label: 'lightflow_cinematic.field.resolution', dimensions: 2, value: montage.resolution, integer: true, min: 1 }, [1920, 1080]),
                samples: cinematicSelect({ label: 'lightflow_cinematic.field.samples', value: montage.samples, options: { 1: '1x', 2: '2x', 4: '4x', 8: '8x' } }),
                output_format: cinematicSelect({ label: 'lightflow_cinematic.field.output_format', value: montage.output_format,
                    options: { png: 'PNG', mp4: 'MP4', webm: 'WebM', gif: 'GIF' } }),
                video_quality: cinematicSelect({ label: 'lightflow_cinematic.field.video_quality', value: montage.video_quality,
                    options: { low: 'lightflow_cinematic.quality.low', medium: 'lightflow_cinematic.quality.medium', high: 'lightflow_cinematic.quality.high' },
                    condition: form => ['mp4', 'webm'].includes(form.output_format) }),
                _shots: cinematicSection('lightflow_cinematic.montage.shots', 'Shots', 'view_list'),
                clip_id: cinematicSelect({ label: 'lightflow_cinematic.montage.shot', value: clipId || '__empty__',
                    options: montage.clips.length ? Object.fromEntries(montage.clips.map((item, index) => [item.id,
                        (index + 1) + ' · ' + (document.sequences.find(sequence => sequence.id === item.sequence_id)?.name || 'Missing sequence')])) : { __empty__: '—' } }),
                in_frame: cinematicNumber({ label: 'lightflow_cinematic.montage.in', value: clip?.in_frame || 0, integer: true, condition: () => !!clip }, 0),
                out_frame: cinematicNumber({ label: 'lightflow_cinematic.montage.out', value: clip?.out_frame || 1, integer: true, condition: () => !!clip }, 1),
                speed: cinematicNumber({ label: 'lightflow_cinematic.field.playback_rate', value: clip?.speed || 1, min: 0.01, max: 100, condition: () => !!clip }, 1),
                source_sequence: cinematicSelect({ label: 'lightflow_cinematic.group.sequence', value: document.active_sequence_id, options: sequenceOptions(document) }),
                shot_tools: { type: 'buttons', buttons: ['lightflow_cinematic.montage.add', 'lightflow_cinematic.montage.duplicate',
                    'lightflow_cinematic.montage.earlier', 'lightflow_cinematic.montage.later', 'lightflow_cinematic.montage.remove'],
                    click(index) {
                        const form = montageDialog.getFormResult();
                        let nextId = clipId;
                        runCinematicUndo('Edit Cinematic Montage', () => {
                            save(form);
                            if (index === 0) nextId = addMontageClip(form.source_sequence).id;
                            else if (clipId && index === 1) {
                                const current = readDocument().montage;
                                const selectedIndex = current.clips.findIndex(item => item.id === clipId);
                                const duplicate = { ...current.clips[selectedIndex], id: createId('clip') };
                                current.clips.splice(selectedIndex + 1, 0, duplicate); updateMontage(current); nextId = duplicate.id;
                            } else if (clipId && index === 2) moveMontageClip(clipId, -1);
                            else if (clipId && index === 3) moveMontageClip(clipId, 1);
                            else if (clipId && index === 4) { deleteMontageClip(clipId); nextId = ''; }
                        });
                        openMontageDialog(nextId);
                    } },
                render_tools: { type: 'buttons', buttons: ['lightflow_cinematic.montage.render', 'lightflow_cinematic.button.cancel'],
                    click(index) {
                        if (index === 1) { cancelActiveRender(); return; }
                        save(montageDialog.getFormResult());
                        montageDialog.hide(); montageDialog = null;
                        exportMontage().then(reportRenderResult).catch(showCinematicError);
                    } }
            },
            onFormChange(form) {
                if (form.clip_id && form.clip_id !== '__empty__' && form.clip_id !== clipId) {
                    save(form); openMontageDialog(form.clip_id);
                }
            },
            onConfirm(form) { save(form); montageDialog = null; },
            onCancel() { montageDialog = null; }
        });
        montageDialog.show();
    }

    function desktopFileModules(scope) {
        if (!isCinematicDesktop() || typeof require !== 'function') {
            throw new Error('Video encoding requires Blockbench desktop and native Node access.');
        }
        const path = require('path');
        const nativeFs = require('fs', { scope: scope ? path.resolve(scope) : undefined,
            message: 'Save cinematic frames and video in the selected output folder.' });
        if (!nativeFs?.promises) throw new Error('Cinematic output folder access was denied.');
        return { fs: nativeFs.promises, path };
    }

    async function createCinematicOutputDirectory(fs, path, parent) {
        for (let attempt = 0; attempt < 4; attempt++) {
            const directory = path.join(path.resolve(parent), 'lightflow-cinematic-' + createId('output'));
            try { await fs.mkdir(directory); return directory; }
            catch (error) { if (error?.code !== 'EEXIST') throw error; }
        }
        throw new Error('Could not create a unique cinematic output directory.');
    }

    async function createDesktopExportTarget(directoryPath, format = 'mp4', name = 'sequence') {
        if (!['mp4', 'webm', 'gif'].includes(format)) throw new Error('Unsupported output format.');
        const fileName = cleanFileComponent(name) + '.' + format;
        const { fs, path } = desktopFileModules(directoryPath);
        const directory = await createCinematicOutputDirectory(fs, path, directoryPath);
        const outputPath = path.join(directory, fileName);
        const temporaryPath = path.join(directory, 'delivery.partial.' + format);
        let handle = typeof fs.open === 'function' ? await fs.open(temporaryPath, 'wx') : null;
        const blockSize = 1024 * 1024;
        const blocks = new Set();
        let size = 0;
        let cursor = 0;
        return {
            outputPath,
            async write(bytes, position = cursor) {
                if (!handle) {
                    // Blockbench 5 scoped FS has no file handles. Stage bounded blocks on disk.
                    let offset = 0;
                    while (offset < bytes.length) {
                        const index = Math.floor((position + offset) / blockSize);
                        const within = (position + offset) % blockSize;
                        const length = Math.min(blockSize - within, bytes.length - offset);
                        const blockPath = path.join(directory, 'chunk-' + index + '.bin');
                        const block = new Uint8Array(blockSize);
                        if (blocks.has(index)) block.set(await fs.readFile(blockPath));
                        block.set(bytes.subarray(offset, offset + length), within);
                        await fs.writeFile(blockPath, block);
                        blocks.add(index); offset += length;
                    }
                    cursor = position + bytes.length; size = Math.max(size, cursor);
                    return;
                }
                let offset = 0;
                while (offset < bytes.length) {
                    const result = await handle.write(bytes, offset, bytes.length - offset, position + offset);
                    if (!result.bytesWritten) throw new Error('The output file stopped accepting data.');
                    offset += result.bytesWritten;
                }
                cursor = position + bytes.length;
            },
            async close() {
                if (handle) { await handle.close(); handle = null; }
                else {
                    await fs.writeFile(temporaryPath, new Uint8Array(), { flag: 'wx' });
                    for (let index = 0; index < Math.ceil(size / blockSize); index++) {
                        const block = blocks.has(index) ? await fs.readFile(path.join(directory, 'chunk-' + index + '.bin')) : new Uint8Array(blockSize);
                        await fs.appendFile(temporaryPath, block.subarray(0, Math.min(blockSize, size - index * blockSize)));
                    }
                }
                await fs.rename(temporaryPath, outputPath);
                for (const index of blocks) {
                    try { await fs.unlink(path.join(directory, 'chunk-' + index + '.bin')); } catch (_) {}
                }
            },
            async abort() { if (handle) { await handle.close(); handle = null; } }
        };
    }

    async function chooseBinaryExportTarget(format, name) {
        const fileName = cleanFileComponent(name) + '.' + format;
        const mime = format === 'gif' ? 'image/gif' : 'video/' + format;
        if (isCinematicDesktop() && typeof require === 'function') {
            const target = await choosePngSequenceTarget();
            if (!target) return null;
            return createDesktopExportTarget(target.path, format, name);
        }
        if (typeof window.showSaveFilePicker === 'function') {
            try {
                const handle = await window.showSaveFilePicker({ suggestedName: fileName,
                    types: [{ description: format.toUpperCase(), accept: { [mime]: ['.' + format] } }] });
                const writable = await handle.createWritable();
                return { outputPath: handle.name, write: (bytes, position) => position === undefined
                    ? writable.write(bytes) : writable.write({ type: 'write', position, data: bytes }),
                    close: () => writable.close(), abort: () => writable.abort() };
            } catch (error) { if (error?.name === 'AbortError') return null; throw error; }
        }
        // Browsers without a writable file API get an explicitly bounded download.
        const pages = [];
        const pageSize = 1024 * 1024;
        let size = 0;
        let cursor = 0;
        return {
            outputPath: fileName,
            async write(bytes, position = cursor) {
                if (position + bytes.length > 128 * 1024 * 1024) {
                    throw new Error('This browser download exceeds 128 MiB. Use a browser with direct file saving or reduce the duration/resolution.');
                }
                let offset = 0;
                while (offset < bytes.length) {
                    const index = Math.floor((position + offset) / pageSize);
                    const within = (position + offset) % pageSize;
                    const length = Math.min(pageSize - within, bytes.length - offset);
                    if (!pages[index]) pages[index] = new Uint8Array(pageSize);
                    pages[index].set(bytes.subarray(offset, offset + length), within);
                    offset += length;
                }
                cursor = position + bytes.length;
                size = Math.max(size, cursor);
            },
            async close() {
                const blob = new Blob(Array.from({ length: Math.ceil(size / pageSize) }, (_, index) =>
                    (pages[index] || new Uint8Array(pageSize)).subarray(0, Math.min(pageSize, size - index * pageSize))), { type: mime });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url; link.download = fileName; link.click();
                setTimeout(() => URL.revokeObjectURL(url), 60000);
                pages.length = 0;
            },
            async abort() { pages.length = 0; size = 0; }
        };
    }

    function createIntegratedGifSink(target, options = {}) {
        let encoder, count = 0, expectedWidth, expectedHeight;
        let scratch = null;
        return {
            kind: 'integrated_gif',
            async begin(context) {
                const rate = frameRateValue(context.sequence.frame_rate);
                if (rate > 100) throw new Error('GIF timing is limited to 100 frames per second.');
                encoder = cinematicGifCodec.GIFEncoder({ auto: false });
            },
            async writeFrame(payload) {
                const canvas = payload.canvas;
                const width = canvas.width || payload.width, height = canvas.height || payload.height;
                if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535) {
                    throw new Error('Invalid GIF frame dimensions.');
                }
                if (count && (width !== expectedWidth || height !== expectedHeight)) throw new Error('GIF frame dimensions changed during export.');
                expectedWidth = width; expectedHeight = height;
                // WebGL canvases cannot also provide a 2D context. Copy only one frame.
                if (!scratch) scratch = typeof OffscreenCanvas === 'function'
                    ? new OffscreenCanvas(width, height) : document.createElement('canvas');
                scratch.width = width; scratch.height = height;
                const ctx = scratch.getContext('2d', { willReadFrequently: true });
                if (!ctx) throw new Error('A 2D canvas is required for GIF encoding.');
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(canvas, 0, 0);
                const data = ctx.getImageData(0, 0, width, height).data;
                const palette = cinematicGifCodec.quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true });
                const indexed = cinematicGifCodec.applyPalette(data, palette, 'rgba4444');
                const transparentIndex = palette.findIndex(color => color[3] === 0);
                // Round boundaries rather than each delay: 24/29.97 fps must not drift.
                const start = Math.round(payload.timestampMicroseconds / 10000);
                const end = Math.round((payload.timestampMicroseconds + payload.durationMicroseconds) / 10000);
                if (!count) encoder.writeHeader();
                encoder.writeFrame(indexed, width, height, { palette, first: count === 0,
                    delay: Math.max(1, end - start) * 10, repeat: options.loop === false ? -1 : 0,
                    transparent: transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex), dispose: 2 });
                await target.write(encoder.bytesView());
                encoder.reset();
                count++;
            },
            async end() { await target.write(new Uint8Array([0x3b])); await target.close(); scratch = null; encoder = null; },
            async abort() { scratch = null; encoder = null; await target.abort?.(); }
        };
    }

    async function renderGifSequence(sequenceId, options = {}) {
        if (activeRenderJob) throw new Error('A Lightflow Cinematic render is already active.');
        const project = getActiveProject();
        const sequence = getSequence(readDocument(), sequenceId);
        if (!sequence) throw new Error('Cinematic sequence not found.');
        const target = options.target || await chooseBinaryExportTarget('gif', sequence.name);
        if (!target) return { ok: false, cancelled: true, completedFrames: 0, totalFrames: 0 };
        try {
            if (getActiveProject() !== project) throw new Error('The active Blockbench project changed before export.');
            const result = await renderSequence({ sequence_id: sequence.id, sink: createIntegratedGifSink(target, options) });
            return { ...result, outputPath: result.ok ? target.outputPath : null };
        } catch (error) { try { await target.abort?.(); } catch (_) {} throw error; }
    }

    async function probeIntegratedVideo(sequenceValue, format = 'mp4', options = {}) {
        if (!['mp4', 'webm'].includes(format)) throw new Error('Unsupported integrated video format.');
        if (typeof window.VideoEncoder !== 'function' || typeof window.VideoFrame !== 'function') {
            throw new Error('This environment does not provide WebCodecs video encoding. Choose GIF/PNG or optional desktop FFmpeg.');
        }
        const media = getCinematicMediaCodec();
        const sequence = normalizeSequence(sequenceValue);
        const quality = new media.Quality(options.quality || sequence.video_quality);
        const codecs = format === 'mp4' ? ['avc'] : ['vp9', 'vp8'];
        for (const codec of codecs) {
            if (await media.canEncodeVideo(codec, {
                width: sequence.resolution[0], height: sequence.resolution[1], quality,
                hardwareAcceleration: 'no-preference'
            })) return { codec, quality };
        }
        throw new Error(format.toUpperCase() + ' encoding is unavailable at ' + sequence.resolution.join(' × ') +
            ' on this device. Choose another format/resolution, GIF/PNG, or optional desktop FFmpeg.');
    }

    function createIntegratedVideoSink(target, options = {}) {
        let output = null, source = null, origin = null;
        let width = 0, height = 0;
        return {
            kind: 'integrated_video',
            async begin(context) {
                const format = options.format || 'mp4';
                const config = await probeIntegratedVideo(context.sequence, format, options);
                const media = getCinematicMediaCodec();
                [width, height] = context.sequence.resolution;
                // Positional writes allow duration/index finalization without retaining video bytes.
                const stream = new WritableStream({ write: chunk => target.write(chunk.data, chunk.position) });
                output = new media.Output({
                    format: format === 'mp4'
                        ? new media.Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 })
                        : new media.WebMOutputFormat(),
                    target: new media.StreamTarget(stream, { chunked: true, chunkSize: 1024 * 1024 })
                });
                source = new media.VideoSampleSource({ ...config, alpha: 'discard',
                    keyFrameInterval: 1, sizeChangeBehavior: 'deny' });
                output.addVideoTrack(source, { frameRate: frameRateValue(context.sequence.frame_rate) });
                await output.start();
            },
            async writeFrame(payload) {
                const canvas = payload.canvas;
                if (canvas.width !== width || canvas.height !== height) throw new Error('Video frame dimensions differ from the selected output resolution.');
                if (origin === null) origin = payload.timestampMicroseconds;
                const media = getCinematicMediaCodec();
                const sample = new media.VideoSample(canvas, {
                    timestamp: (payload.timestampMicroseconds - origin) / 1000000,
                    duration: payload.durationMicroseconds / 1000000
                });
                try { await source.add(sample); }
                finally { sample.close(); }
            },
            async end() {
                await output.finalize();
                if (activeRenderJob?.cancelled) throw new Error('Video encoding cancelled.');
                await target.close(); output = null; source = null;
            },
            async cancel() { if (output && !['finalized', 'canceled'].includes(output.state)) await output.cancel(); },
            async abort() {
                try { if (output && output.state !== 'finalized') await output.cancel(); }
                finally { output = null; source = null; await target.abort?.(); }
            }
        };
    }

    async function renderIntegratedVideoSequence(sequenceId, options = {}) {
        if (activeRenderJob) throw new Error('A Lightflow Cinematic render is already active.');
        const project = getActiveProject();
        const sequence = getSequence(readDocument(), sequenceId);
        if (!sequence) throw new Error('Cinematic sequence not found.');
        // Invoke picker within the original click's activation, before probing asynchronously.
        const target = options.target || await chooseBinaryExportTarget(options.format || 'mp4', sequence.name);
        if (!target) return { ok: false, cancelled: true, completedFrames: 0, totalFrames: 0 };
        try {
            if (getActiveProject() !== project) throw new Error('The active Blockbench project changed before export.');
            const result = await renderSequence({ sequence_id: sequence.id, sink: createIntegratedVideoSink(target, options) });
            return { ...result, outputPath: result.ok ? target.outputPath : null };
        } catch (error) { try { await target.abort?.(); } catch (_) {} throw error; }
    }

    function runEncoderProcess(executable, args, options = {}) {
        if (!isCinematicDesktop() || typeof require !== 'function') throw new Error('FFmpeg requires Blockbench desktop.');
        const nativeProcess = require('child_process', { message: 'Run the optional FFmpeg video encoder.' });
        if (!nativeProcess?.spawn) throw new Error('Permission to run FFmpeg was denied.');
        const { spawn } = nativeProcess;
        return new Promise((resolve, reject) => {
            const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
            if (options.owned) activeEncoderProcess = child;
            let output = '', diagnostic = '';
            const timeout = options.timeout ? setTimeout(() => child.kill(), options.timeout) : null;
            child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-131072); });
            child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-8192); });
            const release = () => {
                if (timeout) clearTimeout(timeout);
                if (activeEncoderProcess === child) activeEncoderProcess = null;
            };
            child.on('error', error => { release(); reject(new Error('FFmpeg: ' + error.message)); });
            child.on('close', code => {
                release();
                if (code === 0) resolve(output);
                else reject(new Error('FFmpeg failed (' + code + '): ' + diagnostic));
            });
        });
    }

    async function probeVideoEncoder(executable = 'ffmpeg', format = 'mp4') {
        const encoder = { mp4: 'libx264', webm: 'libvpx-vp9', gif: 'gif' }[format];
        if (!encoder) throw new Error('Unsupported video format.');
        const result = await runEncoderProcess(executable, ['-hide_banner', '-encoders'], { timeout: 15000 });
        if (!result.split(/\r?\n/).some(line => line.trim().split(/\s+/)[1] === encoder)) {
            throw new Error('The selected FFmpeg does not include ' + encoder + '.');
        }
        return { executable, format, encoder };
    }

    function videoEncodingArguments(sequence, inputPattern, outputPath, options = {}) {
        const format = options.format || 'mp4';
        const rate = normalizeFrameRate(sequence.frame_rate);
        const input = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-framerate',
            rate.numerator + '/' + rate.denominator, '-start_number', '0', '-i', inputPattern];
        const frames = String(sequenceDurationFrames(sequence));
        if (format === 'mp4' || format === 'webm') {
            if (sequence.resolution.some(value => value % 2 !== 0)) {
                throw new Error('MP4/WebM output requires even width and height. Choose an even resolution or PNG/GIF.');
            }
            const quality = options.quality || sequence.video_quality || 'high';
            const qualityCrf = (format === 'mp4' ? { low: 28, medium: 23, high: 18 } : { low: 36, medium: 30, high: 24 })[quality];
            const crf = String(clamp(Math.round(finite(options.crf, qualityCrf)), 0, 51));
            return [...input, '-frames:v', frames, '-an', '-c:v', format === 'mp4' ? 'libx264' : 'libvpx-vp9',
                '-crf', crf, ...(format === 'mp4' ? ['-preset', 'medium', '-movflags', '+faststart'] : ['-b:v', '0']),
                '-pix_fmt', 'yuv420p', outputPath];
        }
        if (format === 'gif') {
            return [...input, '-i', options.palette_path, '-filter_complex', '[0:v][1:v]paletteuse=dither=sierra2_4a',
                '-frames:v', frames, '-loop', options.loop === false ? '-1' : '0', outputPath];
        }
        throw new Error('Unsupported video format.');
    }

    async function renderVideoSequence(sequenceId, options = {}) {
        if (activeRenderJob) throw new Error('A Lightflow Cinematic render is already active.');
        const document = readDocument();
        const project = getActiveProject();
        const sequence = getSequence(document, sequenceId);
        if (!sequence) throw new Error('Cinematic sequence not found.');
        const format = options.format || 'mp4';
        const executable = options.ffmpeg_path || 'ffmpeg';
        // Validate configuration and actual encoder availability before rendering any frames.
        videoEncodingArguments(sequence, 'frames_%04d.png', 'delivery.' + format, { ...options, format });
        await probeVideoEncoder(executable, format);
        const target = options.target || await choosePngSequenceTarget();
        if (!target) return { ok: false, cancelled: true, completedFrames: 0, totalFrames: 0 };
        if (target.kind !== 'desktop_directory') throw new Error('FFmpeg requires a desktop output directory.');
        if (getActiveProject() !== project) throw new Error('The active Blockbench project changed before export.');
        const { fs, path } = desktopFileModules(target.path);
        const directory = await createCinematicOutputDirectory(fs, path, target.path);
        const pngSink = createPngSequenceSink({ kind: 'desktop_directory', path: directory },
            { sequence, prefix: 'frame', zero_based: true });
        let renderContext;
        const outputPath = path.join(directory, 'delivery.' + format);
        const temporaryPath = path.join(directory, 'delivery.partial.' + format);
        const palettePath = path.join(directory, 'palette.png');
        const sink = {
            async begin(context) {
                videoEncodingArguments(context.sequence, 'frames_%04d.png', 'delivery.' + format, { ...options, format });
                renderContext = context;
                await pngSink.begin(context);
            },
            writeFrame: payload => pngSink.writeFrame(payload),
            abort: context => pngSink.abort(context),
            async end(context) {
                await pngSink.end(context);
                if (activeRenderJob?.cancelled) return;
                const effectiveSequence = renderContext.sequence;
                const digits = Math.max(4, String(Math.max(Math.abs(sequence.start_frame), Math.abs(sequence.end_frame - 1))).length);
                const inputPattern = path.join(directory, 'frame_%0' + digits + 'd.png');
                Blockbench.setStatusBarText(translate('lightflow_cinematic.status.encoding', 'Encoding video') + ': ' + format.toUpperCase());
                if (activeRenderJob) activeRenderJob.phase = 'encoding';
                if (format === 'gif') {
                    const rate = effectiveSequence.frame_rate;
                    await runEncoderProcess(executable, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
                        '-framerate', rate.numerator + '/' + rate.denominator, '-start_number', '0', '-i', inputPattern,
                        '-vf', 'palettegen=stats_mode=full', '-frames:v', '1', '-update', '1', palettePath], { owned: true });
                }
                if (activeRenderJob?.cancelled) return;
                await runEncoderProcess(executable, videoEncodingArguments(effectiveSequence, inputPattern, temporaryPath,
                    { ...options, format, palette_path: palettePath }), { owned: true });
                if (activeRenderJob?.cancelled) return;
                await fs.rename(temporaryPath, outputPath);
            }
        };
        try {
            const result = await renderSequence({ sequence_id: sequenceId, sink });
            return { ...result, outputPath: result.ok ? outputPath : null, masterDirectory: directory };
        } catch (error) {
            throw new Error(error.message + '\nPNG masters: ' + directory);
        }
    }

    function getCapabilities() {
        const webCodecs = typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';
        const mediaRecorder = typeof window.MediaRecorder === 'function';
        const directoryStreaming = isCinematicDesktop() || typeof window.showDirectoryPicker === 'function';
        return {
            studioFrameConsumer: typeof window.StudioRender?.renderFrame === 'function',
            deterministicTimeline: typeof Timeline !== 'undefined' && typeof Animator !== 'undefined',
            desktop: isCinematicDesktop(),
            webCodecs,
            integratedGif: true,
            integratedVideo: webCodecs,
            mediaRecorder,
            directoryStreaming,
            pngSequence: directoryStreaming && typeof window.StudioRender?.renderFrame === 'function',
            recommendedVideoBackend: webCodecs ? 'webcodecs_with_streaming_muxer' : 'gif_or_png_sequence'
        };
    }

    function replaceToolbarSelectOptions(select, options, value) {
        if (!select) return;
        select.options = options;
        select.values = Object.keys(options);
        const fallback = select.values[0];
        const nextValue = Object.prototype.hasOwnProperty.call(options, value) ? value : fallback;
        if (nextValue != null && select.get?.() !== nextValue) select.set?.(nextValue);
        select.updateEnabledState?.();
    }

    function currentCinematicFrame(sequence) {
        if (!sequence) return 0;
        if (typeof Timeline !== 'undefined' && Number.isFinite(Number(Timeline.time))) {
            return clamp(
                timelineSecondsToFrame(sequence, Timeline.time),
                sequence.start_frame,
                sequence.end_frame - 1
            );
        }
        const context = window.LightflowCinematicFrameContext;
        if (context?.sequenceId === sequence.id && Number.isFinite(Number(context.frame))) {
            return clamp(Math.round(Number(context.frame)), sequence.start_frame, sequence.end_frame - 1);
        }
        return sequence.start_frame;
    }

    function syncCinematicTimingToolbar(frameValue) {
        if (!timingToolbarText) return;
        const sequence = getSequence(readDocumentView());
        const frame = frameValue == null ? currentCinematicFrame(sequence) : frameValue;
        timingToolbarText.set?.(cinematicToolbarTimingText(sequence, frame));
        timingToolbarText.updateEnabledState?.();
    }

    function syncFpsToolbar() {
        const document = readDocument();
        const sequence = getSequence(document);
        if (sequenceToolbarSelect) {
            const sequenceOptions = {};
            document.sequences.forEach(entry => {
                sequenceOptions[entry.id] = { name: entry.name, icon: 'movie' };
            });
            replaceToolbarSelectOptions(
                sequenceToolbarSelect,
                sequenceOptions,
                sequence?.id || document.active_sequence_id
            );
        }
        if (cameraToolbarSelect) {
            const cameraOptions = {
                __none__: {
                    name: translate('lightflow_cinematic.option.no_camera', 'No Camera'),
                    icon: 'videocam_off'
                }
            };
            document.cameras.forEach(camera => {
                cameraOptions[camera.id] = { name: camera.name, icon: 'videocam' };
            });
            replaceToolbarSelectOptions(
                cameraToolbarSelect,
                cameraOptions,
                sequence?.camera_id || '__none__'
            );
        }
        if (fpsToolbarSelect) {
            const key = frameRateKey(sequence?.frame_rate);
            if (fpsToolbarSelect.get?.() !== key) fpsToolbarSelect.set?.(key);
            fpsToolbarSelect.updateEnabledState?.();
        }
        syncCinematicTimingToolbar();
    }

    function syncPlaybackAction() {
        if (!playAction) return;
        const playing = playbackState.running || (typeof Timeline !== 'undefined' && Timeline.playing);
        playAction.setIcon?.(playing ? 'pause' : 'play_arrow');
        const name = translate(
            playing ? 'lightflow_cinematic.action.pause' : 'lightflow_cinematic.action.play',
            playing ? 'Pause Cinematic Preview' : 'Play Cinematic Preview'
        );
        if (typeof playAction.setName === 'function') playAction.setName(name);
        else playAction.name = name;
        playAction.updateEnabledState?.();
    }

    function syncActiveCameraPreviewFromTimeline() {
        const document = readDocumentView();
        const sequence = getSequence(document);
        const camera = getCamera(document, null, sequence);
        if (!sequence || !camera || sequence.preview_camera === false) return false;
        const frame = clamp(
            timelineSecondsToFrame(sequence, typeof Timeline !== 'undefined' ? Timeline.time : sequence.source_start_seconds),
            sequence.start_frame,
            sequence.end_frame - 1
        );
        const state = sampleCamera(camera, frame);
        if (!state) return false;
        applyPhysicalState(state, sequence);
        applyCameraTimelineStateToElement(getCameraElementById(camera.id), state, sequence);
        return true;
    }

    function pauseCinematicPlayback(options = {}) {
        playbackState.generation += 1;
        playbackState.running = false;
        if (playbackState.requestId != null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(playbackState.requestId);
        } else if (playbackState.requestId != null) {
            clearTimeout(playbackState.requestId);
        }
        playbackState.requestId = null;
        const shouldPauseTimeline = options.pauseTimeline !== false &&
            typeof Timeline !== 'undefined' && Timeline.playing &&
            typeof Timeline.pause === 'function';
        playbackState.ownsNativeTimeline = false;
        if (shouldPauseTimeline) Timeline.pause();
        syncPlaybackAction();
        syncCinematicTimingToolbar();
        return true;
    }

    function startStandaloneCinematicPlayback(sequence) {
        playbackState.generation += 1;
        const generation = playbackState.generation;
        const currentFrame = clamp(
            timelineSecondsToFrame(sequence, typeof Timeline !== 'undefined' ? Timeline.time : sequence.source_start_seconds),
            sequence.start_frame,
            sequence.end_frame - 1
        );
        playbackState.running = true;
        playbackState.ownsNativeTimeline = false;
        playbackState.sequenceId = sequence.id;
        playbackState.startFrame = currentFrame;
        playbackState.startClock = typeof performance !== 'undefined' ? performance.now() : Date.now();
        playbackState.inFlight = false;
        const tick = async nowValue => {
            if (!playbackState.running || generation !== playbackState.generation) return;
            const now = finite(nowValue, typeof performance !== 'undefined' ? performance.now() : Date.now());
            const elapsedSeconds = Math.max(0, now - playbackState.startClock) / 1000;
            let frame = playbackState.startFrame + Math.floor(elapsedSeconds * frameRateValue(sequence.frame_rate));
            if (frame >= sequence.end_frame) {
                if (!sequence.loop_preview) {
                    pauseCinematicPlayback({ pauseTimeline: false });
                    return;
                }
                playbackState.startFrame = sequence.start_frame;
                playbackState.startClock = now;
                frame = sequence.start_frame;
            }
            if (!playbackState.inFlight) {
                playbackState.inFlight = true;
                try {
                    await evaluateFrame(sequence.id, frame, {
                        source: 'lightflow_cinematic_preview',
                        settle_frames: 0
                    });
                } catch (error) {
                    pauseCinematicPlayback({ pauseTimeline: false });
                    showCinematicError(error);
                    return;
                } finally {
                    playbackState.inFlight = false;
                }
            }
            if (playbackState.running && generation === playbackState.generation) {
                playbackState.requestId = typeof requestAnimationFrame === 'function'
                    ? requestAnimationFrame(tick)
                    : setTimeout(() => tick(Date.now()), 16);
            }
        };
        playbackState.requestId = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(tick)
            : setTimeout(() => tick(Date.now()), 16);
        syncPlaybackAction();
        return true;
    }

    function startCinematicPlayback(sequenceId) {
        let document = readDocument();
        let sequence = getSequence(document, sequenceId);
        if (!sequence) return false;
        if (sequence.duration_mode === 'active_animation' && getActiveAnimationRange()) {
            adaptSequenceToActiveAnimation(sequence.id);
            document = readDocument();
            sequence = getSequence(document, sequence.id);
        }
        const camera = getCamera(document, null, sequence);
        if (!camera) {
            Blockbench.showQuickMessage(translate(
                'lightflow_cinematic.message.no_camera',
                'Create or assign a physical camera first.'
            ));
            return false;
        }
        pauseCinematicPlayback({ pauseTimeline: false });
        if (
            typeof Animation !== 'undefined' && Animation.selected &&
            typeof Timeline !== 'undefined' && typeof Timeline.start === 'function' &&
            Math.abs(sequence.playback_rate - 1) < 1e-8
        ) {
            const sourceEnd = sequence.source_start_seconds + sequenceSourceDurationSeconds(sequence);
            if (Timeline.time < sequence.source_start_seconds || Timeline.time >= sourceEnd) {
                Timeline.setTime?.(sequence.source_start_seconds);
                if (typeof Animator !== 'undefined') Animator.preview?.();
            }
            playbackState.running = true;
            playbackState.ownsNativeTimeline = true;
            playbackState.sequenceId = sequence.id;
            Timeline.start();
            syncPlaybackAction();
            return true;
        }
        return startStandaloneCinematicPlayback(sequence);
    }

    function toggleCinematicPlayback(sequenceId) {
        if (playbackState.running || (typeof Timeline !== 'undefined' && Timeline.playing)) {
            return pauseCinematicPlayback();
        }
        return startCinematicPlayback(sequenceId);
    }

    function handleAnimationDisplayFrame() {
        syncActiveCameraPreviewFromTimeline();
        const displayedSequence = getSequence(readDocumentView());
        if (displayedSequence) {
            const displayedTime = typeof Timeline !== 'undefined'
                ? Timeline.time
                : displayedSequence.source_start_seconds;
            syncCinematicTimingToolbar(timelineSecondsToFrame(displayedSequence, displayedTime));
        }
        if (!playbackState.ownsNativeTimeline || typeof Timeline === 'undefined' || !Timeline.playing) return;
        const sequence = getSequence(readDocumentView(), playbackState.sequenceId);
        if (!sequence) return;
        const sourceEnd = sequence.source_start_seconds + sequenceSourceDurationSeconds(sequence);
        if (Timeline.time < sourceEnd - 1e-6) return;
        if (sequence.loop_preview) {
            Timeline.setTime?.(sequence.source_start_seconds);
        } else {
            pauseCinematicPlayback();
        }
    }

    function jumpToSequenceStart(sequenceId) {
        const sequence = getSequence(readDocument(), sequenceId);
        if (!sequence) return false;
        if (typeof Timeline !== 'undefined') Timeline.setTime?.(sequence.source_start_seconds);
        if (typeof Animator !== 'undefined') Animator.preview?.();
        syncActiveCameraPreviewFromTimeline();
        syncCinematicTimingToolbar(sequence.start_frame);
        return true;
    }

    function addTranslations() {
        if (typeof Language === 'undefined' || typeof Language.addTranslations !== 'function') return;
        Language.addTranslations('en', {
            'lightflow_cinematic.montage.title': 'Montage',
            'lightflow_cinematic.montage.shots': 'Shots',
            'lightflow_cinematic.montage.shot': 'Shot',
            'lightflow_cinematic.montage.in': 'In frame (included)',
            'lightflow_cinematic.montage.out': 'Out frame (excluded)',
            'lightflow_cinematic.montage.add': 'Add shot',
            'lightflow_cinematic.montage.duplicate': 'Duplicate',
            'lightflow_cinematic.montage.earlier': 'Earlier',
            'lightflow_cinematic.montage.later': 'Later',
            'lightflow_cinematic.montage.remove': 'Remove',
            'lightflow_cinematic.montage.render': 'Render montage',

            'lightflow_cinematic.field.source_animation': 'Source animation',
            'lightflow_cinematic.option.current_animation_mix': 'Current animation mix',
            'lightflow_cinematic.field.video_quality': 'Video quality',
            'lightflow_cinematic.quality.low': 'Draft',
            'lightflow_cinematic.quality.medium': 'Standard',
            'lightflow_cinematic.quality.high': 'High',

            'lightflow_cinematic.workflow.hint': 'Confirm saves the fields. Preview, camera and render buttons perform their action immediately.',
            'lightflow_cinematic.plugin.title': 'Lightflow Cinematic',
            'lightflow_cinematic.action.open': 'Lightflow Cinematic...',
            'lightflow_cinematic.action.open.desc': 'Manage deterministic sequences and physical cameras.',
            'lightflow_cinematic.action.camera': 'Create Physical Camera from View',
            'lightflow_cinematic.action.keyframe': 'Add / Update Camera Keyframe',
            'lightflow_cinematic.action.preview': 'Preview Cinematic Frame',
            'lightflow_cinematic.action.play': 'Play Cinematic Preview',
            'lightflow_cinematic.action.pause': 'Pause Cinematic Preview',
            'lightflow_cinematic.action.view_camera': 'View Through Lightflow Camera',
            'lightflow_cinematic.action.update_camera': 'Move Camera to Current View',
            'lightflow_cinematic.action.camera_settings': 'Physical Camera Settings...',
            'lightflow_cinematic.action.delete_camera': 'Delete Lightflow Camera',
            'lightflow_cinematic.action.render_sequence': 'Render Cinematic PNG Sequence...',
            'lightflow_cinematic.action.cancel_render': 'Cancel Cinematic Render',
            'lightflow_cinematic.group.sequence': 'Sequence',
            'lightflow_cinematic.group.camera': 'Physical Camera',
            'lightflow_cinematic.group.timing': 'Timing and Playback',
            'lightflow_cinematic.group.capture': 'Capture Region',
            'lightflow_cinematic.group.output': 'Frame Output',
            'lightflow_cinematic.field.sequence': 'Active Sequence',
            'lightflow_cinematic.field.sequence_name': 'Name',
            'lightflow_cinematic.field.frame_rate': 'Frame Rate',
            'lightflow_cinematic.field.frame_range': 'Frame Range (In / Out)',
            'lightflow_cinematic.field.start_frame': 'Output Start Frame',
            'lightflow_cinematic.field.duration_mode': 'Length Control',
            'lightflow_cinematic.field.duration_frames': 'Length (Frames)',
            'lightflow_cinematic.field.duration_seconds': 'Length (Seconds)',
            'lightflow_cinematic.field.source_start': 'Animation Start (Seconds)',
            'lightflow_cinematic.field.playback_rate': 'Source Playback Rate',
            'lightflow_cinematic.field.loop_preview': 'Loop Preview',
            'lightflow_cinematic.field.preview_camera': 'View Through Camera While Scrubbing',
            'lightflow_cinematic.field.capture_area': 'Capture Area',
            'lightflow_cinematic.field.capture_full': 'Full Viewport',
            'lightflow_cinematic.field.capture_frame': 'Studio Render Frame',
            'lightflow_cinematic.field.match_frame_ratio': 'Match Output to Frame Ratio',
            'lightflow_cinematic.option.duration.frames': 'Frames',
            'lightflow_cinematic.option.duration.seconds': 'Seconds',
            'lightflow_cinematic.option.duration.active_animation': 'Active Animation',
            'lightflow_cinematic.option.no_camera': 'No Camera',
            'lightflow_cinematic.toolbar.time': 'Current Frame and Duration',
            'lightflow_cinematic.field.camera': 'Camera',
            'lightflow_cinematic.field.resolution': 'Resolution',
            'lightflow_cinematic.field.samples': 'Studio SSAA Samples',
            'lightflow_cinematic.button.new_sequence': 'New Sequence',
            'lightflow_cinematic.button.delete_sequence': 'Delete Sequence',
            'lightflow_cinematic.button.capture_look': 'Capture Studio Look',
            'lightflow_cinematic.button.use_active_animation': 'Fit to Active Animation',
            'lightflow_cinematic.button.start_current': 'Start at Current Time',
            'lightflow_cinematic.button.jump_start': 'Jump to Start',
            'lightflow_cinematic.button.play_pause': 'Play / Pause',
            'lightflow_cinematic.button.edit_region': 'Edit Region in Viewport',
            'lightflow_cinematic.button.capture_region': 'Capture Current Region',
            'lightflow_cinematic.button.new_camera': 'Camera from View',
            'lightflow_cinematic.button.physical_settings': 'Physical Settings',
            'lightflow_cinematic.button.keyframe': 'Keyframe Current View',
            'lightflow_cinematic.button.preview': 'Preview Frame',
            'lightflow_cinematic.button.render_png': 'Render PNG Sequence',
            'lightflow_cinematic.button.render_output': 'Render Output',
            'lightflow_cinematic.field.output_format': 'Output Format',
            'lightflow_cinematic.option.integrated_encoder': 'Integrated',
            'lightflow_cinematic.output.gif_note': 'GIF uses up to 256 colors and binary transparency.',
            'lightflow_cinematic.output.download_limit': 'Without direct file saving, downloads are limited to 128 MiB.',
            'lightflow_cinematic.field.video_backend': 'Video encoder',
            'lightflow_cinematic.field.ffmpeg_path': 'FFmpeg executable (optional backend)',
            'lightflow_cinematic.output.backend_note': 'Video formats are checked on your device before rendering. MP4/WebM output is opaque; choose PNG to preserve transparency.',
            'lightflow_cinematic.status.encoding': 'Encoding video',
            'lightflow_cinematic.button.cancel': 'Cancel Render',
            'lightflow_cinematic.dialog.delete_sequence': 'Delete sequence "{name}"?',
            'lightflow_cinematic.dialog.output_directory': 'Choose PNG sequence directory',
            'lightflow_cinematic.dialog.physical_camera': 'Physical Camera Settings',
            'lightflow_cinematic.field.projection': 'Projection',
            'lightflow_cinematic.field.sensor_size': 'Sensor (Width / Height mm)',
            'lightflow_cinematic.field.focal_length': 'Focal Length (mm)',
            'lightflow_cinematic.field.aperture': 'Aperture (f-stop)',
            'lightflow_cinematic.field.focus_distance': 'Focus Distance',
            'lightflow_cinematic.field.shutter_angle': 'Shutter Angle',
            'lightflow_cinematic.field.iso': 'ISO',
            'lightflow_cinematic.field.exposure_compensation': 'Exposure Compensation (EV)',
            'lightflow_cinematic.field.lens_shift': 'Lens Shift (X / Y)',
            'lightflow_cinematic.field.anamorphic_squeeze': 'Anamorphic Squeeze',
            'lightflow_cinematic.field.clipping': 'Clipping (Near / Far)',
            'lightflow_cinematic.field.blade_count': 'Aperture Blades',
            'lightflow_cinematic.field.interpolation': 'Interpolation to Next Keyframe',
            'lightflow_cinematic.info.physical_pending': 'Pose, focal length, lens shift, focus and clipping already reach the render camera. Aperture, shutter, ISO and blades are persisted for the upcoming DOF, motion-blur and physical-exposure passes.',
            'lightflow_cinematic.message.camera_created': 'Physical camera created',
            'lightflow_cinematic.message.keyframe_saved': 'Camera keyframe saved at frame {frame}',
            'lightflow_cinematic.message.sequence_complete': 'Cinematic sequence completed: {frames} frames',
            'lightflow_cinematic.message.sequence_cancelled': 'Cinematic render cancelled after {frames} frames',
            'lightflow_cinematic.message.temporary': 'Cinematic data is temporary in this format. Save as .bbmodel to keep it.',
            'lightflow_cinematic.message.no_active_animation': 'Select an animation with a non-zero duration first.',
            'lightflow_cinematic.message.no_camera': 'Create or assign a physical camera first.',
            'lightflow_cinematic.message.region_editing': 'Move or resize the Studio Render frame. Changes are saved to this sequence.',
            'lightflow_cinematic.undo.create_sequence': 'Create Cinematic Sequence',
            'lightflow_cinematic.undo.edit_sequence': 'Edit Cinematic Sequence',
            'lightflow_cinematic.undo.delete_sequence': 'Delete Cinematic Sequence',
            'lightflow_cinematic.undo.adapt_animation': 'Fit Sequence to Active Animation',
            'lightflow_cinematic.undo.frame_rate': 'Change Cinematic Frame Rate',
            'lightflow_cinematic.undo.capture_look': 'Capture Studio Look',
            'lightflow_cinematic.undo.capture_region': 'Edit Cinematic Capture Region',
            'lightflow_cinematic.undo.create_camera': 'Create Lightflow Camera',
            'lightflow_cinematic.undo.delete_camera': 'Delete Lightflow Camera',
            'lightflow_cinematic.undo.camera_keyframe': 'Edit Lightflow Camera Keyframe',
            'lightflow_cinematic.undo.delete_camera_keyframe': 'Delete Lightflow Camera Keyframe',
            'lightflow_cinematic.undo.camera_interpolation': 'Change Camera Keyframe Interpolation',
            'lightflow_cinematic.undo.camera_settings': 'Edit Physical Camera Settings',
            'lightflow_cinematic.undo.assign_camera': 'Assign Cinematic Camera',
            'lightflow_cinematic.timeline.pose': 'Pose',
            'lightflow_cinematic.timeline.lens': 'Lens / Focus',
            'lightflow_cinematic.timeline.exposure': 'Exposure',
            'lightflow_cinematic.unit.frames': 'frames',
            'lightflow_cinematic.unit.source': 'source',
            'lightflow_cinematic.status.rendering': 'Rendering cinematic frame'
        });
        Language.addTranslations('es', {
            'lightflow_cinematic.montage.title': 'Montaje',
            'lightflow_cinematic.montage.shots': 'Planos',
            'lightflow_cinematic.montage.shot': 'Plano',
            'lightflow_cinematic.montage.in': 'Frame de entrada (incluido)',
            'lightflow_cinematic.montage.out': 'Frame de salida (excluido)',
            'lightflow_cinematic.montage.add': 'Añadir plano',
            'lightflow_cinematic.montage.duplicate': 'Duplicar',
            'lightflow_cinematic.montage.earlier': 'Antes',
            'lightflow_cinematic.montage.later': 'Después',
            'lightflow_cinematic.montage.remove': 'Quitar',
            'lightflow_cinematic.montage.render': 'Renderizar montaje',

            'lightflow_cinematic.field.source_animation': 'Animación fuente',
            'lightflow_cinematic.option.current_animation_mix': 'Mezcla de animaciones actual',
            'lightflow_cinematic.field.video_quality': 'Calidad de vídeo',
            'lightflow_cinematic.quality.low': 'Borrador',
            'lightflow_cinematic.quality.medium': 'Estándar',
            'lightflow_cinematic.quality.high': 'Alta',

            'lightflow_cinematic.workflow.hint': 'Confirmar guarda los campos. Los botones de vista previa, cámara y render ejecutan su acción inmediatamente.',
            'lightflow_cinematic.plugin.title': 'Lightflow Cinematic',
            'lightflow_cinematic.action.open': 'Lightflow Cinematic...',
            'lightflow_cinematic.action.open.desc': 'Administra secuencias deterministas y camaras fisicas.',
            'lightflow_cinematic.action.camera': 'Crear Camara Fisica desde la Vista',
            'lightflow_cinematic.action.keyframe': 'Agregar / Actualizar Fotograma Clave de Camara',
            'lightflow_cinematic.action.preview': 'Previsualizar Fotograma Cinematografico',
            'lightflow_cinematic.action.play': 'Reproducir Previsualizacion Cinematografica',
            'lightflow_cinematic.action.pause': 'Pausar Previsualizacion Cinematografica',
            'lightflow_cinematic.action.view_camera': 'Ver a Traves de la Camara Lightflow',
            'lightflow_cinematic.action.update_camera': 'Mover Camara a la Vista Actual',
            'lightflow_cinematic.action.camera_settings': 'Ajustes Fisicos de Camara...',
            'lightflow_cinematic.action.delete_camera': 'Eliminar Camara Lightflow',
            'lightflow_cinematic.action.render_sequence': 'Renderizar Secuencia PNG Cinematografica...',
            'lightflow_cinematic.action.cancel_render': 'Cancelar Render Cinematografico',
            'lightflow_cinematic.group.sequence': 'Secuencia',
            'lightflow_cinematic.group.camera': 'Camara Fisica',
            'lightflow_cinematic.group.timing': 'Tiempo y Reproduccion',
            'lightflow_cinematic.group.capture': 'Region de Captura',
            'lightflow_cinematic.group.output': 'Salida de Fotogramas',
            'lightflow_cinematic.field.sequence': 'Secuencia Activa',
            'lightflow_cinematic.field.sequence_name': 'Nombre',
            'lightflow_cinematic.field.frame_rate': 'Fotogramas por Segundo',
            'lightflow_cinematic.field.frame_range': 'Rango (Entrada / Salida)',
            'lightflow_cinematic.field.start_frame': 'Fotograma Inicial de Salida',
            'lightflow_cinematic.field.duration_mode': 'Control de Longitud',
            'lightflow_cinematic.field.duration_frames': 'Longitud (Fotogramas)',
            'lightflow_cinematic.field.duration_seconds': 'Longitud (Segundos)',
            'lightflow_cinematic.field.source_start': 'Inicio de Animacion (Segundos)',
            'lightflow_cinematic.field.playback_rate': 'Velocidad de la Fuente',
            'lightflow_cinematic.field.loop_preview': 'Repetir Previsualizacion',
            'lightflow_cinematic.field.preview_camera': 'Ver por la Camara al Navegar el Timeline',
            'lightflow_cinematic.field.capture_area': 'Area de Captura',
            'lightflow_cinematic.field.capture_full': 'Viewport Completo',
            'lightflow_cinematic.field.capture_frame': 'Marco de Studio Render',
            'lightflow_cinematic.field.match_frame_ratio': 'Adaptar Salida a la Proporcion del Marco',
            'lightflow_cinematic.option.duration.frames': 'Fotogramas',
            'lightflow_cinematic.option.duration.seconds': 'Segundos',
            'lightflow_cinematic.option.duration.active_animation': 'Animacion Activa',
            'lightflow_cinematic.option.no_camera': 'Sin Camara',
            'lightflow_cinematic.toolbar.time': 'Fotograma Actual y Duracion',
            'lightflow_cinematic.field.camera': 'Camara',
            'lightflow_cinematic.field.resolution': 'Resolucion',
            'lightflow_cinematic.field.samples': 'Muestras SSAA de Studio',
            'lightflow_cinematic.button.new_sequence': 'Nueva Secuencia',
            'lightflow_cinematic.button.delete_sequence': 'Eliminar Secuencia',
            'lightflow_cinematic.button.capture_look': 'Capturar Look de Studio',
            'lightflow_cinematic.button.use_active_animation': 'Adaptar a Animacion Activa',
            'lightflow_cinematic.button.start_current': 'Iniciar en Tiempo Actual',
            'lightflow_cinematic.button.jump_start': 'Ir al Inicio',
            'lightflow_cinematic.button.play_pause': 'Reproducir / Pausar',
            'lightflow_cinematic.button.edit_region': 'Editar Region en Viewport',
            'lightflow_cinematic.button.capture_region': 'Capturar Region Actual',
            'lightflow_cinematic.button.new_camera': 'Camara desde la Vista',
            'lightflow_cinematic.button.physical_settings': 'Ajustes Fisicos',
            'lightflow_cinematic.button.keyframe': 'Keyframe de Vista Actual',
            'lightflow_cinematic.button.preview': 'Previsualizar Fotograma',
            'lightflow_cinematic.button.render_png': 'Renderizar Secuencia PNG',
            'lightflow_cinematic.button.render_output': 'Renderizar salida',
            'lightflow_cinematic.field.output_format': 'Formato de salida',
            'lightflow_cinematic.option.integrated_encoder': 'Integrado',
            'lightflow_cinematic.output.gif_note': 'GIF usa hasta 256 colores y transparencia binaria.',
            'lightflow_cinematic.output.download_limit': 'Sin guardado directo, las descargas se limitan a 128 MiB.',
            'lightflow_cinematic.field.video_backend': 'Codificador de vídeo',
            'lightflow_cinematic.field.ffmpeg_path': 'Ejecutable FFmpeg (backend opcional)',
            'lightflow_cinematic.output.backend_note': 'Los formatos de vídeo se comprueban en tu dispositivo antes de renderizar. MP4/WebM son opacos; elige PNG para conservar transparencia.',
            'lightflow_cinematic.status.encoding': 'Codificando vídeo',
            'lightflow_cinematic.button.cancel': 'Cancelar Render',
            'lightflow_cinematic.dialog.delete_sequence': 'Eliminar la secuencia "{name}"?',
            'lightflow_cinematic.dialog.output_directory': 'Elegir carpeta para la secuencia PNG',
            'lightflow_cinematic.dialog.physical_camera': 'Ajustes de Camara Fisica',
            'lightflow_cinematic.field.projection': 'Proyeccion',
            'lightflow_cinematic.field.sensor_size': 'Sensor (Ancho / Alto mm)',
            'lightflow_cinematic.field.focal_length': 'Distancia Focal (mm)',
            'lightflow_cinematic.field.aperture': 'Apertura (f-stop)',
            'lightflow_cinematic.field.focus_distance': 'Distancia de Enfoque',
            'lightflow_cinematic.field.shutter_angle': 'Angulo de Obturador',
            'lightflow_cinematic.field.iso': 'ISO',
            'lightflow_cinematic.field.exposure_compensation': 'Compensacion de Exposicion (EV)',
            'lightflow_cinematic.field.lens_shift': 'Desplazamiento de Lente (X / Y)',
            'lightflow_cinematic.field.anamorphic_squeeze': 'Compresion Anamorfica',
            'lightflow_cinematic.field.clipping': 'Recorte (Cerca / Lejos)',
            'lightflow_cinematic.field.blade_count': 'Laminas de Apertura',
            'lightflow_cinematic.field.interpolation': 'Interpolacion al Siguiente Keyframe',
            'lightflow_cinematic.info.physical_pending': 'La pose, focal, lens shift, foco y clipping ya llegan a la camara de render. Apertura, shutter, ISO y laminas quedan persistidos para los proximos pases de DOF, motion blur y exposicion fisica.',
            'lightflow_cinematic.message.camera_created': 'Camara fisica creada',
            'lightflow_cinematic.message.keyframe_saved': 'Fotograma clave de camara guardado en {frame}',
            'lightflow_cinematic.message.sequence_complete': 'Secuencia cinematografica terminada: {frames} fotogramas',
            'lightflow_cinematic.message.sequence_cancelled': 'Render cinematografico cancelado tras {frames} fotogramas',
            'lightflow_cinematic.message.temporary': 'Los datos cinematograficos son temporales en este formato. Guarda como .bbmodel para conservarlos.',
            'lightflow_cinematic.message.no_active_animation': 'Selecciona primero una animacion con duracion mayor que cero.',
            'lightflow_cinematic.message.no_camera': 'Crea o asigna primero una camara fisica.',
            'lightflow_cinematic.message.region_editing': 'Mueve o redimensiona el marco de Studio Render. Los cambios se guardan en esta secuencia.',
            'lightflow_cinematic.undo.create_sequence': 'Crear Secuencia Cinematografica',
            'lightflow_cinematic.undo.edit_sequence': 'Editar Secuencia Cinematografica',
            'lightflow_cinematic.undo.delete_sequence': 'Eliminar Secuencia Cinematografica',
            'lightflow_cinematic.undo.adapt_animation': 'Adaptar Secuencia a la Animacion Activa',
            'lightflow_cinematic.undo.frame_rate': 'Cambiar Fotogramas por Segundo',
            'lightflow_cinematic.undo.capture_look': 'Capturar Look de Studio',
            'lightflow_cinematic.undo.capture_region': 'Editar Region de Captura Cinematografica',
            'lightflow_cinematic.undo.create_camera': 'Crear Camara Lightflow',
            'lightflow_cinematic.undo.delete_camera': 'Eliminar Camara Lightflow',
            'lightflow_cinematic.undo.camera_keyframe': 'Editar Fotograma Clave de Camara Lightflow',
            'lightflow_cinematic.undo.delete_camera_keyframe': 'Eliminar Fotograma Clave de Camara Lightflow',
            'lightflow_cinematic.undo.camera_interpolation': 'Cambiar Interpolacion del Fotograma de Camara',
            'lightflow_cinematic.undo.camera_settings': 'Editar Ajustes de Camara Fisica',
            'lightflow_cinematic.undo.assign_camera': 'Asignar Camara Cinematografica',
            'lightflow_cinematic.timeline.pose': 'Pose',
            'lightflow_cinematic.timeline.lens': 'Lente / Enfoque',
            'lightflow_cinematic.timeline.exposure': 'Exposicion',
            'lightflow_cinematic.unit.frames': 'fotogramas',
            'lightflow_cinematic.unit.source': 'fuente',
            'lightflow_cinematic.status.rendering': 'Renderizando fotograma cinematografico'
        });
    }

    function sequenceOptions(document) {
        return Object.fromEntries(document.sequences.map(sequence => [sequence.id, sequence.name]));
    }

    function cameraOptions(document) {
        const options = { '': translate('lightflow_cinematic.field.camera', 'Physical Camera') + ' -' };
        document.cameras.forEach(camera => { options[camera.id] = camera.name; });
        return options;
    }

    function frameRateOptions() {
        return Object.fromEntries(Object.entries(FRAME_RATE_PRESETS).map(([key, value]) => [key, value.label]));
    }

    function saveManagerForm(form, sequenceIdOverride = '', options = {}) {
        const document = readDocument();
        const sequence = getSequence(document, sequenceIdOverride || form?.sequence_id);
        if (!sequence) return null;
        const save = () => mutateDocument(nextDocument => {
            const next = getSequence(nextDocument, sequence.id);
            next.name = cleanName(form.sequence_name, next.name);
            next.frame_rate = normalizeFrameRate(form.frame_rate);
            next.duration_mode = ['frames', 'seconds', 'active_animation'].includes(form.duration_mode)
                ? form.duration_mode
                : next.duration_mode;
            next.start_frame = Math.round(finite(form.start_frame, next.start_frame));
            next.source_start_seconds = Math.max(0, finite(form.source_start_seconds, next.source_start_seconds));
            next.playback_rate = Math.max(0.0001, finite(form.playback_rate, next.playback_rate));
            next.loop_preview = form.loop_preview !== false;
            next.preview_camera = form.preview_camera !== false;
            if (next.duration_mode === 'active_animation' && getActiveAnimationRange()) {
                const adapted = adaptSequenceValueToActiveAnimation(next);
                Object.assign(next, adapted, { id: next.id, created_at: next.created_at });
            } else if (next.duration_mode === 'seconds') {
                const durationSeconds = Math.max(
                    1 / frameRateValue(next.frame_rate),
                    finite(form.duration_seconds, sequenceDurationSeconds(next))
                );
                next.end_frame = next.start_frame + Math.max(
                    1,
                    Math.round(durationSeconds * frameRateValue(next.frame_rate))
                );
            } else {
                next.end_frame = next.start_frame + Math.max(
                    1,
                    Math.round(finite(form.duration_frames, sequenceDurationFrames(next)))
                );
            }
            next.resolution = finiteArray(form.resolution, 2, next.resolution)
                .map(value => clamp(Math.round(value), 1, 16384));
            next.samples = String(clamp(Math.round(finite(form.samples, next.samples)), 1, 8));
            if (['png', 'mp4', 'webm', 'gif'].includes(form.output_format)) next.output_format = form.output_format;
            if (['low', 'medium', 'high'].includes(form.video_quality)) next.video_quality = form.video_quality;
            if (typeof form.source_animation_id === 'string') {
                next.source_animation_id = form.source_animation_id === '__active__' ? '' : form.source_animation_id;
                next.source_animation_name = getCinematicAnimations().find(item => item.uuid === next.source_animation_id)?.name || '';
            }
            if (['integrated', 'ffmpeg'].includes(form.video_backend)) videoExportBackend = form.video_backend;
            if (typeof form.ffmpeg_path === 'string') ffmpegExecutable = form.ffmpeg_path.trim() || 'ffmpeg';
            next.capture_area = form.capture_area === 'frame' ? 'frame' : 'full';
            next.match_frame_ratio = form.match_frame_ratio !== false;
            if (form.render_frame && typeof form.render_frame === 'object') {
                next.render_frame = normalizeCaptureFrame(form.render_frame);
            }
            const cameraId = String(form.camera_id || '');
            next.camera_id = nextDocument.cameras.some(camera => camera.id === cameraId) ? cameraId : '';
            next.updated_at = Date.now();
            nextDocument.active_sequence_id = next.id;
            nextDocument.active_camera_id = next.camera_id;
            return deepClone(next);
        });
        return runCinematicUndo(translate(
            'lightflow_cinematic.undo.edit_sequence',
            'Edit Cinematic Sequence'
        ), save, options);
    }

    function scheduleManagerRefresh() {
        if (managerRefreshScheduled) return;
        managerRefreshScheduled = true;
        setTimeout(() => {
            managerRefreshScheduled = false;
            if (!managerDialog) return;
            managerDialog.hide?.();
            managerDialog = null;
            openManagerDialog();
        }, 0);
    }

    function currentManagerForm() {
        return managerDialog?.getFormResult?.() || {};
    }

    function openPhysicalCameraDialog(cameraId, sequenceId) {
        const document = readDocument();
        const sequence = getSequence(document, sequenceId);
        const camera = getCamera(document, cameraId, sequence);
        if (!sequence || !camera) return;
        const frame = clamp(
            timelineSecondsToFrame(sequence, typeof Timeline !== 'undefined' ? Timeline.time : 0),
            sequence.start_frame,
            sequence.end_frame - 1
        );
        const state = sampleCamera(camera, frame) || camera.base;
        const keyframe = camera.keyframes.find(entry => entry.frame === frame);
        physicalCameraDialog?.hide?.();
        physicalCameraDialog = new Dialog({
            id: 'lightflow_cinematic_physical_camera',
            title: 'lightflow_cinematic.dialog.physical_camera',
            width: 660,
            form: {
                name: cinematicText({
                    label: 'lightflow_cinematic.field.sequence_name',
                    value: camera.name
                }),
                projection: cinematicSelect({
                    label: 'lightflow_cinematic.field.projection',
                    value: state.projection,
                    options: {
                        perspective: 'Perspective',
                        orthographic: 'Orthographic'
                    }
                }),
                sensor_size: cinematicVector({
                    dimensions: 2,
                    label: 'lightflow_cinematic.field.sensor_size',
                    value: [state.sensor_width_mm, state.sensor_height_mm],
                    min: 0.1,
                    step: 0.01
                }, [DEFAULT_SENSOR_WIDTH_MM, DEFAULT_SENSOR_HEIGHT_MM]),
                focal_length_mm: cinematicNumber({
                    label: 'lightflow_cinematic.field.focal_length',
                    value: state.focal_length_mm,
                    min: 0.1,
                    max: 2000,
                    step: 0.1
                }, 50),
                aperture_f_stop: cinematicNumber({
                    label: 'lightflow_cinematic.field.aperture',
                    value: state.aperture_f_stop,
                    min: 0.1,
                    max: 128,
                    step: 0.1
                }, 2.8),
                focus_distance: cinematicNumber({
                    label: 'lightflow_cinematic.field.focus_distance',
                    value: state.focus_distance,
                    min: 0.0001,
                    max: 128,
                    allow_higher: true,
                    step: 0.1
                }, 32),
                shutter_angle: cinematicNumber({
                    label: 'lightflow_cinematic.field.shutter_angle',
                    value: state.shutter_angle,
                    min: 0,
                    max: 360,
                    step: 1
                }, 180),
                iso: cinematicNumber({
                    label: 'lightflow_cinematic.field.iso',
                    value: state.iso,
                    min: 1,
                    max: 204800,
                    step: 1
                }, 100),
                exposure_compensation_ev: cinematicNumber({
                    label: 'lightflow_cinematic.field.exposure_compensation',
                    value: state.exposure_compensation_ev,
                    min: -20,
                    max: 20,
                    step: 0.1
                }, 0),
                lens_shift: cinematicVector({
                    dimensions: 2,
                    label: 'lightflow_cinematic.field.lens_shift',
                    value: [state.lens_shift_x, state.lens_shift_y],
                    min: -2,
                    max: 2,
                    step: 0.001
                }, [0, 0]),
                anamorphic_squeeze: cinematicNumber({
                    label: 'lightflow_cinematic.field.anamorphic_squeeze',
                    value: state.anamorphic_squeeze,
                    min: 0.25,
                    max: 4,
                    step: 0.01
                }, 1),
                clipping: cinematicVector({
                    dimensions: 2,
                    label: 'lightflow_cinematic.field.clipping',
                    value: [state.near_clip, state.far_clip],
                    min: 0.0001,
                    step: 0.01
                }, [0.1, 1000]),
                blade_count: cinematicNumber({
                    label: 'lightflow_cinematic.field.blade_count',
                    value: state.blade_count,
                    min: 3,
                    max: 32,
                    step: 1
                }, 7),
                interpolation: cinematicSelect({
                    label: 'lightflow_cinematic.field.interpolation',
                    value: keyframe?.interpolation || 'smooth',
                    options: {
                        step: 'Step',
                        linear: 'Linear',
                        smooth: 'Smooth',
                        ease_in: 'Ease In',
                        ease_out: 'Ease Out'
                    }
                }),
                physical_status: {
                    type: 'info',
                    text: translate('lightflow_cinematic.info.physical_pending', '')
                }
            },
            buttons: ['dialog.confirm', 'dialog.cancel'],
            onConfirm(form) {
                const sensor = finiteArray(form.sensor_size, 2, [state.sensor_width_mm, state.sensor_height_mm]);
                const shift = finiteArray(form.lens_shift, 2, [state.lens_shift_x, state.lens_shift_y]);
                const clipping = finiteArray(form.clipping, 2, [state.near_clip, state.far_clip]);
                const nextState = normalizePhysicalCameraState({
                    ...state,
                    projection: form.projection,
                    sensor_width_mm: sensor[0],
                    sensor_height_mm: sensor[1],
                    focal_length_mm: form.focal_length_mm,
                    aperture_f_stop: form.aperture_f_stop,
                    focus_distance: form.focus_distance,
                    shutter_angle: form.shutter_angle,
                    iso: form.iso,
                    exposure_compensation_ev: form.exposure_compensation_ev,
                    lens_shift_x: shift[0],
                    lens_shift_y: shift[1],
                    anamorphic_squeeze: form.anamorphic_squeeze,
                    near_clip: clipping[0],
                    far_clip: clipping[1],
                    blade_count: form.blade_count
                }, state);
                addOrUpdateCameraKeyframe(camera.id, frame, {
                    sequence_id: sequence.id,
                    state: nextState,
                    interpolation: form.interpolation,
                    camera_name: form.name,
                    undo_label: translate(
                        'lightflow_cinematic.undo.camera_settings',
                        'Edit Physical Camera Settings'
                    )
                });
                applyPhysicalState(nextState, sequence);
                physicalCameraDialog = null;
                scheduleManagerRefresh();
            },
            onCancel() {
                physicalCameraDialog = null;
            }
        });
        physicalCameraDialog.show();
    }

    function createManagerForm() {
        const document = readDocument();
        const sequence = getSequence(document);
        return {
            montage_tools: { type: 'buttons', buttons: ['lightflow_cinematic.montage.title'], click() {
                saveManagerForm(currentManagerForm());
                managerDialog?.hide?.(); managerDialog = null;
                openMontageDialog();
            } },
            _sequence: cinematicSection('lightflow_cinematic.group.sequence', 'Sequence', 'movie'),
            sequence_id: cinematicSelect({
                label: 'lightflow_cinematic.field.sequence',
                value: sequence.id,
                options: sequenceOptions(document)
            }),
            sequence_name: cinematicText({
                label: 'lightflow_cinematic.field.sequence_name',
                value: sequence.name
            }),
            frame_rate: cinematicSelect({
                label: 'lightflow_cinematic.field.frame_rate',
                value: frameRateKey(sequence.frame_rate),
                options: frameRateOptions()
            }),
            _timing: cinematicSection('lightflow_cinematic.group.timing', 'Timing and Playback', 'schedule'),
            duration_mode: cinematicSelect({
                label: 'lightflow_cinematic.field.duration_mode',
                value: sequence.duration_mode,
                options: {
                    frames: 'lightflow_cinematic.option.duration.frames',
                    seconds: 'lightflow_cinematic.option.duration.seconds',
                    active_animation: 'lightflow_cinematic.option.duration.active_animation'
                }
            }),
            start_frame: cinematicNumber({
                label: 'lightflow_cinematic.field.start_frame',
                value: sequence.start_frame,
                integer: true,
                step: 1,
                min: -1000000,
                max: 1000000
            }, 0),
            duration_frames: cinematicNumber({
                label: 'lightflow_cinematic.field.duration_frames',
                value: sequenceDurationFrames(sequence),
                integer: true,
                min: 1,
                max: 10000000,
                allow_higher: true,
                step: 1,
                condition: form => form.duration_mode === 'frames'
            }, DEFAULT_SEQUENCE_LENGTH),
            duration_seconds: cinematicNumber({
                label: 'lightflow_cinematic.field.duration_seconds',
                value: sequenceDurationSeconds(sequence),
                min: 1 / frameRateValue(sequence.frame_rate),
                max: 86400,
                allow_higher: true,
                step: 0.001,
                condition: form => form.duration_mode === 'seconds'
            }, 5),
            source_animation_id: cinematicSelect({
                label: 'lightflow_cinematic.field.source_animation',
                value: sequence.source_animation_id || '__active__',
                options: Object.assign({ __active__: translate('lightflow_cinematic.option.current_animation_mix', 'Current animation mix') },
                    sequence.source_animation_id ? { [sequence.source_animation_id]: sequence.source_animation_name || sequence.source_animation_id } : {},
                    Object.fromEntries(getCinematicAnimations().map(animation => [animation.uuid, animation.name])))
            }),
            source_start_seconds: cinematicNumber({
                label: 'lightflow_cinematic.field.source_start',
                value: sequence.source_start_seconds,
                min: 0,
                max: 86400,
                allow_higher: true,
                step: 0.001
            }, 0),
            playback_rate: cinematicNumber({
                label: 'lightflow_cinematic.field.playback_rate',
                value: sequence.playback_rate,
                min: 0.01,
                max: 16,
                step: 0.01
            }, 1),
            timing_summary: {
                type: 'info',
                text: sequenceTimingSummary(sequence)
            },
            loop_preview: {
                type: 'checkbox',
                label: 'lightflow_cinematic.field.loop_preview',
                value: sequence.loop_preview
            },
            preview_camera: {
                type: 'checkbox',
                label: 'lightflow_cinematic.field.preview_camera',
                value: sequence.preview_camera
            },
            timing_tools: {
                type: 'buttons',
                buttons: [
                    'lightflow_cinematic.button.use_active_animation',
                    'lightflow_cinematic.button.start_current',
                    'lightflow_cinematic.button.jump_start',
                    'lightflow_cinematic.button.play_pause'
                ],
                click(index) {
                    const form = currentManagerForm();
                    if (index === 0 || index === 1) {
                        const label = index === 0
                            ? translate('lightflow_cinematic.undo.adapt_animation', 'Fit Sequence to Active Animation')
                            : translate('lightflow_cinematic.undo.edit_sequence', 'Edit Cinematic Sequence');
                        runCinematicUndo(label, () => {
                            const savedSequence = saveManagerForm(form);
                            if (!savedSequence) return null;
                            if (index === 0) {
                                const adapted = adaptSequenceToActiveAnimation(savedSequence.id);
                                if (adapted) scheduleManagerRefresh();
                                return adapted;
                            }
                            const updated = updateSequence(savedSequence.id, {
                                source_start_seconds: Math.max(0, finite(
                                    typeof Timeline !== 'undefined' ? Timeline.time : 0,
                                    0
                                ))
                            });
                            scheduleManagerRefresh();
                            return updated;
                        });
                        return;
                    }
                    const savedSequence = saveManagerForm(form);
                    if (!savedSequence) return;
                    if (index === 2) {
                        jumpToSequenceStart(savedSequence.id);
                    } else {
                        toggleCinematicPlayback(savedSequence.id);
                    }
                }
            },
            sequence_tools: {
                type: 'buttons',
                buttons: [
                    'lightflow_cinematic.button.new_sequence',
                    'lightflow_cinematic.button.delete_sequence',
                    'lightflow_cinematic.button.capture_look'
                ],
                click(index) {
                    const form = currentManagerForm();
                    if (index === 0) {
                        runCinematicUndo(translate(
                            'lightflow_cinematic.undo.create_sequence',
                            'Create Cinematic Sequence'
                        ), () => {
                            saveManagerForm(form);
                            return createSequence();
                        });
                        scheduleManagerRefresh();
                    } else if (index === 1) {
                        const currentDocument = readDocument();
                        const selected = getSequence(currentDocument, form.sequence_id);
                        if (!selected || currentDocument.sequences.length <= 1) return;
                        const message = translate('lightflow_cinematic.dialog.delete_sequence', 'Delete sequence "{name}"?')
                            .replace('{name}', selected.name);
                        Blockbench.showMessageBox({
                            title: 'lightflow_cinematic.plugin.title',
                            message,
                            icon: 'delete',
                            buttons: ['dialog.confirm', 'dialog.cancel'],
                            confirm: 0,
                            cancel: 1
                        }, result => {
                            if (result !== 0 && result !== 'dialog.confirm') return;
                            runCinematicUndo(translate(
                                'lightflow_cinematic.undo.delete_sequence',
                                'Delete Cinematic Sequence'
                            ), () => {
                                saveManagerForm(form);
                                return deleteSequence(selected.id);
                            });
                            scheduleManagerRefresh();
                        });
                    } else {
                        runCinematicUndo(translate(
                            'lightflow_cinematic.undo.capture_look',
                            'Capture Studio Look'
                        ), () => {
                            saveManagerForm(form);
                            return updateSequence(form.sequence_id, { studio: captureCurrentStudioSettings() });
                        });
                        Blockbench.showQuickMessage(translate('lightflow_cinematic.button.capture_look', 'Capture Studio Look'));
                    }
                }
            },
            _camera: cinematicSection('lightflow_cinematic.group.camera', 'Physical Camera', 'videocam'),
            camera_id: cinematicSelect({
                label: 'lightflow_cinematic.field.camera',
                value: sequence.camera_id,
                options: cameraOptions(document)
            }),
            camera_tools: {
                type: 'buttons',
                buttons: [
                    'lightflow_cinematic.button.new_camera',
                    'lightflow_cinematic.button.physical_settings',
                    'lightflow_cinematic.button.keyframe',
                    'lightflow_cinematic.button.preview'
                ],
                click(index) {
                    const form = currentManagerForm();
                    let savedSequence;
                    if (index === 0 || index === 2) {
                        const label = index === 0
                            ? translate('lightflow_cinematic.undo.create_camera', 'Create Lightflow Camera')
                            : translate('lightflow_cinematic.undo.camera_keyframe', 'Edit Lightflow Camera Keyframe');
                        return runCinematicUndo(label, () => {
                            savedSequence = saveManagerForm(form);
                            if (!savedSequence) return null;
                            if (index === 0) {
                                const camera = createCameraFromView(null, savedSequence.id);
                                if (camera) {
                                    Blockbench.showQuickMessage(translate('lightflow_cinematic.message.camera_created', 'Physical camera created') + ': ' + camera.name);
                                    scheduleManagerRefresh();
                                }
                                return camera;
                            }
                            const keyframe = addOrUpdateCameraKeyframe(form.camera_id, null, { sequence_id: savedSequence.id });
                            if (keyframe) {
                                Blockbench.showQuickMessage(translate(
                                    'lightflow_cinematic.message.keyframe_saved',
                                    'Camera keyframe saved at frame {frame}'
                                ).replace('{frame}', keyframe.frame));
                            }
                            return keyframe;
                        });
                    }
                    savedSequence = saveManagerForm(form);
                    if (!savedSequence) return;
                    if (index === 1) {
                        openPhysicalCameraDialog(form.camera_id, savedSequence.id);
                    } else {
                        const frame = timelineSecondsToFrame(savedSequence, typeof Timeline !== 'undefined' ? Timeline.time : 0);
                        evaluateFrame(savedSequence.id, frame).catch(showCinematicError);
                    }
                }
            },
            _capture: cinematicSection('lightflow_cinematic.group.capture', 'Capture Region', 'crop_free'),
            capture_area: cinematicSelect({
                label: 'lightflow_cinematic.field.capture_area',
                value: sequence.capture_area,
                options: {
                    full: 'lightflow_cinematic.field.capture_full',
                    frame: 'lightflow_cinematic.field.capture_frame'
                }
            }),
            match_frame_ratio: {
                type: 'checkbox',
                label: 'lightflow_cinematic.field.match_frame_ratio',
                value: sequence.match_frame_ratio,
                condition: form => form.capture_area === 'frame'
            },
            capture_summary: {
                type: 'info',
                text: Math.round(sequence.render_frame.x * 1000) / 10 + '%, ' +
                    Math.round(sequence.render_frame.y * 1000) / 10 + '%  |  ' +
                    Math.round(sequence.render_frame.width * 1000) / 10 + '% x ' +
                    Math.round(sequence.render_frame.height * 1000) / 10 + '%',
                condition: form => form.capture_area === 'frame'
            },
            capture_tools: {
                type: 'buttons',
                buttons: [
                    'lightflow_cinematic.button.edit_region',
                    'lightflow_cinematic.button.capture_region'
                ],
                condition: form => form.capture_area === 'frame',
                click(index) {
                    const form = currentManagerForm();
                    const savedSequence = saveManagerForm(form);
                    if (!savedSequence) return;
                    if (index === 0) {
                        cinematicFrameEditSequenceId = savedSequence.id;
                        managerDialog?.hide?.();
                        managerDialog = null;
                        window.StudioRender?.showFrame?.({
                            persistProjectState: false,
                            owner: 'lightflow_cinematic',
                            settings: {
                                resolution: savedSequence.resolution.slice(),
                                capture_area: 'frame',
                                match_frame_ratio: savedSequence.match_frame_ratio
                            }
                        }, savedSequence.render_frame);
                        Blockbench.showQuickMessage(translate(
                            'lightflow_cinematic.message.region_editing',
                            'Move or resize the Studio Render frame. Changes are saved to this sequence.'
                        ), 5000);
                    } else {
                        runCinematicUndo(translate(
                            'lightflow_cinematic.undo.capture_region',
                            'Edit Cinematic Capture Region'
                        ), () => {
                            return updateSequence(savedSequence.id, {
                                capture_area: 'frame',
                                render_frame: getCurrentCaptureFrame(savedSequence)
                            });
                        });
                        scheduleManagerRefresh();
                    }
                }
            },
            _output: cinematicSection('lightflow_cinematic.group.output', 'Frame Output', 'video_file'),
            resolution: cinematicVector({
                dimensions: 2,
                label: 'lightflow_cinematic.field.resolution',
                value: sequence.resolution,
                min: 1,
                integer: true,
                linked_ratio: false
            }, [1920, 1080]),
            samples: cinematicSelect({
                label: 'lightflow_cinematic.field.samples',
                value: sequence.samples,
                options: { 1: '1x', 2: '2x', 3: '3x', 4: '4x', 6: '6x', 8: '8x' }
            }),
            output_format: cinematicSelect({
                label: 'lightflow_cinematic.field.output_format',
                value: sequence.output_format,
                options: { png: 'PNG', mp4: 'MP4', webm: 'WebM', gif: 'GIF' }
            }),
            video_quality: cinematicSelect({
                label: 'lightflow_cinematic.field.video_quality',
                value: sequence.video_quality,
                options: { low: 'lightflow_cinematic.quality.low', medium: 'lightflow_cinematic.quality.medium', high: 'lightflow_cinematic.quality.high' },
                condition: form => ['mp4', 'webm'].includes(form.output_format)
            }),
            video_backend: cinematicSelect({
                label: 'lightflow_cinematic.field.video_backend',
                value: videoExportBackend,
                options: { integrated: 'lightflow_cinematic.option.integrated_encoder', ffmpeg: 'FFmpeg' },
                condition: form => isCinematicDesktop() && ['mp4', 'webm'].includes(form.output_format)
            }),
            ffmpeg_path: cinematicText({
                label: 'lightflow_cinematic.field.ffmpeg_path',
                value: ffmpegExecutable,
                condition: form => isCinematicDesktop() && form.video_backend === 'ffmpeg' && ['mp4', 'webm'].includes(form.output_format)
            }),
            output_backend_note: { type: 'info', text: translate('lightflow_cinematic.output.backend_note',
                'Video output is opaque.'), condition: form => ['mp4', 'webm'].includes(form.output_format) },
            gif_output_note: { type: 'info', text: translate('lightflow_cinematic.output.gif_note'),
                condition: form => form.output_format === 'gif' },
            download_limit_note: { type: 'info', text: translate('lightflow_cinematic.output.download_limit'),
                condition: form => form.output_format !== 'png' && !isCinematicDesktop() && typeof window.showSaveFilePicker !== 'function' },
            render_tools: {
                type: 'buttons',
                buttons: [
                    'lightflow_cinematic.button.render_output',
                    'lightflow_cinematic.button.cancel'
                ],
                click(index) {
                    if (index === 1) {
                        cancelActiveRender();
                        return;
                    }
                    const form = currentManagerForm();
                    const savedSequence = saveManagerForm(form);
                    managerDialog?.hide?.();
                    managerDialog = null;
                    const result = savedSequence?.output_format === 'gif'
                        ? renderGifSequence(savedSequence.id)
                        : savedSequence?.output_format && savedSequence.output_format !== 'png'
                        ? (isCinematicDesktop() && videoExportBackend === 'ffmpeg'
                            ? renderVideoSequence(savedSequence.id, { format: savedSequence.output_format, ffmpeg_path: ffmpegExecutable })
                            : renderIntegratedVideoSequence(savedSequence.id, { format: savedSequence.output_format }))
                        : renderPngSequence(savedSequence?.id);
                    result.then(reportRenderResult).catch(showCinematicError);
                }
            }
        };
    }

    let managerWorkflowTab = 'sequence';
    function createManagerWorkflowForm() {
        const tabs = {sequence: {name: 'lightflow_cinematic.group.sequence'}, camera: {name: 'lightflow_cinematic.group.camera'}, output: {name: 'lightflow_cinematic.group.output'}};
        const form = {
            _cinematic_workflow: window.LightManagerUI?.formDesign?.tabs
                ? window.LightManagerUI.formDesign.tabs({value: managerWorkflowTab, options: tabs})
                : {type: 'select', value: managerWorkflowTab, options: Object.fromEntries(Object.entries(tabs).map(([id, tab]) => [id, tab.name]))},
            _cinematic_workflow_hint: {type: 'info', text: translate('lightflow_cinematic.workflow.hint')}
        };
        let section = 'sequence';
        Object.entries(createManagerForm()).forEach(([key, value]) => {
            if (key === '_camera' || key === '_capture') section = 'camera';
            if (key === '_output') section = 'output';
            const tab = section;
            const condition = value.condition;
            form[key] = {...value, condition: result => (result._cinematic_workflow || managerWorkflowTab) === tab && (!condition || Condition(condition, result))};
        });
        return form;
    }

    function openManagerDialog() {
        if (!getActiveProject()) {
            Blockbench.showQuickMessage('Open a project before using Lightflow Cinematic.');
            return;
        }
        managerDialog?.hide?.();
        managerDialog = new Dialog({
            id: 'lightflow_cinematic_manager',
            title: 'lightflow_cinematic.plugin.title',
            width: 680,
            form: createManagerWorkflowForm(),
            buttons: ['dialog.confirm', 'dialog.cancel'],
            onFormChange(form) {
                if (['sequence', 'camera', 'output'].includes(form._cinematic_workflow)) managerWorkflowTab = form._cinematic_workflow;
                const document = readDocument();
                if (form.sequence_id && form.sequence_id !== document.active_sequence_id) {
                    cinematicFrameEditSequenceId = '';
                    saveManagerForm(form, document.active_sequence_id);
                    setActiveSequence(form.sequence_id);
                    scheduleManagerRefresh();
                }
            },
            onConfirm(form) {
                saveManagerForm(form);
                managerDialog = null;
            },
            onCancel() {
                managerDialog = null;
            }
        });
        managerDialog.show();
    }

    function showCinematicError(error) {
        console.error('[Lightflow Cinematic]', error);
        Blockbench.showMessageBox({
            title: 'lightflow_cinematic.plugin.title',
            message: error?.message || String(error),
            icon: 'error'
        });
    }

    function reportRenderResult(result) {
        if (!result) return;
        if (result.cancelled) {
            Blockbench.showQuickMessage(translate(
                'lightflow_cinematic.message.sequence_cancelled',
                'Cinematic render cancelled after {frames} frames'
            ).replace('{frames}', result.completedFrames));
        } else if (result.ok) {
            Blockbench.showQuickMessage(translate(
                'lightflow_cinematic.message.sequence_complete',
                'Cinematic sequence completed: {frames} frames'
            ).replace('{frames}', result.completedFrames) + (result.outputPath ? '\n' + result.outputPath : ''), 8000);
        }
    }

    function getActiveSequenceAndCamera() {
        const document = readDocument();
        const sequence = getSequence(document);
        return { document, sequence, camera: getCamera(document, null, sequence) };
    }

    function getSelectedCameraElement() {
        if (cameraElementType?.selected?.[0]) return cameraElementType.selected[0];
        return Array.isArray(window.Outliner?.selected)
            ? Outliner.selected.find(element => element?.type === 'lightflow_camera') || null
            : null;
    }

    function unloadPlugin() {
        unloading = true;
        pauseCinematicPlayback();
        cancelActiveRender('plugin_unload');
        montageDialog?.hide?.();
        montageDialog = null;
        managerDialog?.hide?.();
        managerDialog = null;
        physicalCameraDialog?.hide?.();
        physicalCameraDialog = null;
        if (cameraElementSyncTimer != null) clearTimeout(cameraElementSyncTimer);
        if (cinematicTimelineSyncTimer != null) clearTimeout(cinematicTimelineSyncTimer);
        cameraElementSyncTimer = null;
        cinematicTimelineSyncTimer = null;
        pendingCameraTransformElements.clear();
        displayAnimationFrameListener?.delete?.();
        timelinePlayListener?.delete?.();
        timelinePauseListener?.delete?.();
        selectAnimationListener?.delete?.();
        selectModeListener?.delete?.();
        frameRegionListener?.delete?.();
        cinematicUndoHooks?.delete?.();
        window.removeEventListener?.('lightflow_gizmo_visibility_changed', gizmoVisibilityListener);
        gizmoVisibilityListener = null;
        clearCinematicTimelineAnimators();
        syncingCameraElements = true;
        try {
            (cameraElementType?.all || []).slice().forEach(element => element.remove?.(false));
        } finally {
            syncingCameraElements = false;
        }
        if (typeof NodePreviewController !== 'undefined' && NodePreviewController.controllers?.lightflow_camera === cameraPreviewController) {
            cameraPreviewController.delete?.();
        }
        if (typeof OutlinerElement !== 'undefined' && OutlinerElement.types?.lightflow_camera === cameraElementType) {
            delete OutlinerElement.types.lightflow_camera;
        }
        if (ownsArmatureBoneCameraChildType && Array.isArray(armatureBoneCameraChildTypes)) {
            const index = armatureBoneCameraChildTypes.indexOf('lightflow_camera');
            if (index >= 0) armatureBoneCameraChildTypes.splice(index, 1);
        }
        armatureBoneCameraChildTypes = null;
        ownsArmatureBoneCameraChildType = false;
        cameraElementProperties.forEach(property => property?.delete?.());
        cameraElementProperties = [];
        cameraPreviewController = null;
        cameraElementType = null;
        cameraTimelineAnimatorType = null;
        [
            openAction,
            cameraAction,
            keyframeAction,
            previewAction,
            playAction,
            renderSequenceAction,
            cancelRenderAction,
            viewThroughCameraAction,
            updateCameraFromViewAction,
            cameraSettingsAction,
            deleteCameraAction,
            sequenceToolbarSelect,
            cameraToolbarSelect,
            fpsToolbarSelect,
            timingToolbarText
        ]
            .forEach(action => action?.delete?.());
        lifecycleHydrator?.delete?.();
        projectListener?.delete?.();
        closeProjectListener?.delete?.();
        parsedListener?.delete?.();
        projectProperty?.delete?.();
        restoreWindowBindings();
        projectProperty = null;
        lifecycleHydrator = null;
        projectListener = null;
        closeProjectListener = null;
        parsedListener = null;
        displayAnimationFrameListener = null;
        timelinePlayListener = null;
        timelinePauseListener = null;
        selectAnimationListener = null;
        selectModeListener = null;
        frameRegionListener = null;
        cinematicUndoHooks = null;
        openAction = null;
        cameraAction = null;
        keyframeAction = null;
        previewAction = null;
        playAction = null;
        renderSequenceAction = null;
        cancelRenderAction = null;
        viewThroughCameraAction = null;
        updateCameraFromViewAction = null;
        cameraSettingsAction = null;
        deleteCameraAction = null;
        sequenceToolbarSelect = null;
        cameraToolbarSelect = null;
        fpsToolbarSelect = null;
        timingToolbarText = null;
        cinematicFrameEditSequenceId = '';
    }

    Plugin.register(PLUGIN_ID, {
        title: 'Lightflow Cinematic',
        icon: 'movie_creation',
        author: 'MidFord327',
        description: 'Adds deterministic sequences, physical cameras, frame-accurate evaluation, and streaming professional render foundations to Lightflow.',
        tags: ['Lightflow', 'Animation', 'Rendering'],
        version: '0.1.0',
        min_version: '4.9.0',
        variant: 'both',
        onload() {
            unloading = false;
            addTranslations();
            registerProjectProperty();
            hydrateProject(getActiveProject(), null);
            registerCinematicUndoHooks();

            cameraAction = new Action('lightflow_cinematic_camera_from_view', {
                name: 'lightflow_cinematic.action.camera',
                icon: 'videocam',
                category: 'animation',
                condition: () => !!getActiveProject() && !!getPreview(),
                click() {
                    const { sequence } = getActiveSequenceAndCamera();
                    const camera = createCameraFromView(null, sequence?.id);
                    if (camera) Blockbench.showQuickMessage(translate('lightflow_cinematic.message.camera_created', 'Physical camera created') + ': ' + camera.name);
                }
            });
            keyframeAction = new Action('lightflow_cinematic_camera_keyframe', {
                name: 'lightflow_cinematic.action.keyframe',
                icon: 'add_circle',
                category: 'animation',
                condition: () => !!getActiveSequenceAndCamera().camera,
                click() {
                    const { sequence, camera } = getActiveSequenceAndCamera();
                    const keyframe = addOrUpdateCameraKeyframe(camera?.id, null, { sequence_id: sequence?.id });
                    if (keyframe) {
                        Blockbench.showQuickMessage(translate(
                            'lightflow_cinematic.message.keyframe_saved',
                            'Camera keyframe saved at frame {frame}'
                        ).replace('{frame}', keyframe.frame));
                    }
                }
            });
            previewAction = new Action('lightflow_cinematic_preview_frame', {
                name: 'lightflow_cinematic.action.preview',
                icon: 'preview',
                category: 'animation',
                condition: () => !!getActiveSequenceAndCamera().camera,
                click() {
                    const { sequence } = getActiveSequenceAndCamera();
                    const frame = timelineSecondsToFrame(sequence, typeof Timeline !== 'undefined' ? Timeline.time : 0);
                    evaluateFrame(sequence.id, frame).catch(showCinematicError);
                }
            });
            playAction = new Action('lightflow_cinematic_play', {
                name: 'lightflow_cinematic.action.play',
                description: 'lightflow_cinematic.action.open.desc',
                icon: 'play_arrow',
                category: 'animation',
                condition: () => !!getActiveSequenceAndCamera().camera && !activeRenderJob,
                click() {
                    const { sequence } = getActiveSequenceAndCamera();
                    toggleCinematicPlayback(sequence?.id);
                }
            });
            renderSequenceAction = new Action('lightflow_cinematic_render_png_sequence', {
                name: 'lightflow_cinematic.action.render_sequence',
                icon: 'video_file',
                category: 'animation',
                condition: () => !!getActiveSequenceAndCamera().camera && !activeRenderJob,
                click() {
                    const { sequence } = getActiveSequenceAndCamera();
                    renderPngSequence(sequence.id).then(reportRenderResult).catch(showCinematicError);
                }
            });
            cancelRenderAction = new Action('lightflow_cinematic_cancel_render', {
                name: 'lightflow_cinematic.action.cancel_render',
                icon: 'cancel',
                category: 'animation',
                condition: () => !!activeRenderJob,
                click: () => cancelActiveRender()
            });

            viewThroughCameraAction = new Action('lightflow_cinematic_view_through_camera', {
                name: 'lightflow_cinematic.action.view_camera',
                icon: 'camera',
                category: 'animation',
                condition: () => !!getSelectedCameraElement(),
                click() {
                    const element = getSelectedCameraElement();
                    const document = readDocument();
                    const sequence = resolveCameraSequence(document, element?.cinematic_camera_id);
                    const camera = getCamera(document, element?.cinematic_camera_id, sequence);
                    if (!sequence || !camera) return;
                    setActiveCamera(camera.id, { sequence_id: sequence.id, warn: false });
                    const frame = clamp(
                        timelineSecondsToFrame(sequence, typeof Timeline !== 'undefined' ? Timeline.time : 0),
                        sequence.start_frame,
                        sequence.end_frame - 1
                    );
                    const state = sampleCamera(camera, frame);
                    applyPhysicalState(state, sequence);
                    applyCameraStateToElement(element, state, { sequence });
                }
            });
            updateCameraFromViewAction = new Action('lightflow_cinematic_move_camera_to_view', {
                name: 'lightflow_cinematic.action.update_camera',
                icon: 'control_camera',
                category: 'animation',
                condition: () => !!getSelectedCameraElement() && !!getPreview(),
                click() {
                    const element = getSelectedCameraElement();
                    const document = readDocument();
                    const sequence = resolveCameraSequence(document, element?.cinematic_camera_id);
                    updateCameraFromView(element?.cinematic_camera_id, sequence?.id);
                }
            });
            cameraSettingsAction = new Action('lightflow_cinematic_camera_settings', {
                name: 'lightflow_cinematic.action.camera_settings',
                icon: 'settings_photo_camera',
                category: 'animation',
                condition: () => !!getSelectedCameraElement(),
                click() {
                    const element = getSelectedCameraElement();
                    const document = readDocument();
                    const sequence = resolveCameraSequence(document, element?.cinematic_camera_id);
                    openPhysicalCameraDialog(element?.cinematic_camera_id, sequence?.id);
                }
            });
            deleteCameraAction = new Action('lightflow_cinematic_delete_camera', {
                name: 'lightflow_cinematic.action.delete_camera',
                icon: 'delete',
                category: 'animation',
                condition: () => !!getSelectedCameraElement(),
                click() {
                    const element = getSelectedCameraElement();
                    if (!element) return;
                    Blockbench.showMessageBox({
                        title: 'lightflow_cinematic.plugin.title',
                        message: translate('lightflow_cinematic.action.delete_camera', 'Delete Lightflow Camera') + ': ' + element.name + '?',
                        icon: 'delete',
                        buttons: ['dialog.confirm', 'dialog.cancel'],
                        confirm: 0,
                        cancel: 1
                    }, result => {
                        if (result !== 0 && result !== 'dialog.confirm') return;
                        deleteCamera(element.cinematic_camera_id);
                    });
                }
            });

            const toolbarSideMenu = typeof Menu !== 'undefined'
                ? new Menu([
                    cameraAction,
                    keyframeAction,
                    previewAction,
                    '_',
                    renderSequenceAction,
                    cancelRenderAction
                ])
                : null;
            openAction = new Action('lightflow_cinematic_open', {
                name: 'lightflow_cinematic.action.open',
                description: 'lightflow_cinematic.action.open.desc',
                icon: 'movie_creation',
                category: 'animation',
                condition: () => !!getActiveProject(),
                side_menu: toolbarSideMenu || undefined,
                click: openManagerDialog
            });

            // Empty projects need an entry point, not an entire sequence toolbar.
            // Keep detailed controls available while animating or using a camera.
            const showSequenceToolbar = () => !!getActiveProject()
                && (Project.mode === 'animate' || !!getActiveSequenceAndCamera().camera);
            if (typeof BarSelect !== 'undefined') {
                sequenceToolbarSelect = new BarSelect('lightflow_cinematic_sequence', {
                    name: 'lightflow_cinematic.field.sequence',
                    category: 'animation',
                    width: 128,
                    condition: showSequenceToolbar,
                    value: getSequence(readDocument())?.id,
                    options: Object.fromEntries(readDocument().sequences.map(sequence => [
                        sequence.id,
                        { name: sequence.name, icon: 'movie' }
                    ])),
                    onChange(select) {
                        if (readDocumentView().active_sequence_id === select.get()) {
                            syncFpsToolbar();
                            return;
                        }
                        pauseCinematicPlayback();
                        if (!setActiveSequence(select.get())) {
                            syncFpsToolbar();
                            return;
                        }
                        clearCinematicTimelineAnimators();
                        const document = readDocument();
                        const sequence = getSequence(document);
                        if (sequence?.camera_id) selectCameraElement(sequence.camera_id);
                        showActiveCameraTimelineTrack({ select: false });
                        syncActiveCameraPreviewFromTimeline();
                        syncFpsToolbar();
                        scheduleManagerRefresh();
                    }
                });
                cameraToolbarSelect = new BarSelect('lightflow_cinematic_camera', {
                    name: 'lightflow_cinematic.field.camera',
                    category: 'animation',
                    width: 116,
                    condition: showSequenceToolbar,
                    value: '__none__',
                    options: {
                        __none__: {
                            name: translate('lightflow_cinematic.option.no_camera', 'No Camera'),
                            icon: 'videocam_off'
                        }
                    },
                    onChange(select) {
                        const document = readDocument();
                        const sequence = getSequence(document);
                        if (!sequence) return;
                        const selectedId = select.get();
                        const cameraId = selectedId === '__none__' ? '' : selectedId;
                        if ((sequence.camera_id || '') === cameraId) {
                            syncFpsToolbar();
                            return;
                        }
                        const updated = updateSequence(sequence.id, { camera_id: cameraId }, {
                            undo_label: translate(
                                'lightflow_cinematic.undo.assign_camera',
                                'Assign Cinematic Camera'
                            )
                        });
                        if (!updated) {
                            syncFpsToolbar();
                            return;
                        }
                        clearCinematicTimelineAnimators();
                        if (cameraId) {
                            selectCameraElement(cameraId);
                            showActiveCameraTimelineTrack({ select: false });
                            syncActiveCameraPreviewFromTimeline();
                        }
                        syncFpsToolbar();
                        scheduleManagerRefresh();
                    }
                });
                fpsToolbarSelect = new BarSelect('lightflow_cinematic_fps', {
                    name: 'lightflow_cinematic.field.frame_rate',
                    category: 'animation',
                    min_width: 74,
                    condition: showSequenceToolbar,
                    value: frameRateKey(getSequence(readDocument())?.frame_rate),
                    options: frameRateOptions(),
                    onChange(select) {
                        const sequence = getSequence(readDocument());
                        if (!sequence) return;
                        if (frameRateKey(sequence.frame_rate) === select.get()) return;
                        setSequenceFrameRate(sequence.id, select.get());
                        scheduleManagerRefresh();
                    }
                });
            }
            if (typeof BarText !== 'undefined') {
                const initialSequence = getSequence(readDocument());
                timingToolbarText = new BarText('lightflow_cinematic_time', {
                    name: 'lightflow_cinematic.toolbar.time',
                    category: 'animation',
                    condition: showSequenceToolbar,
                    text: cinematicToolbarTimingText(initialSequence, currentCinematicFrame(initialSequence)),
                    onUpdate() {
                        syncCinematicTimingToolbar();
                    },
                    click() {
                        const sequence = getSequence(readDocument());
                        if (sequence) jumpToSequenceStart(sequence.id);
                    }
                });
            }

            registerCameraElementType();
            registerCameraTimelineAnimatorType();
            if (cameraElementType && typeof Menu !== 'undefined') {
                cameraElementType.prototype.menu = new Menu([
                    viewThroughCameraAction,
                    updateCameraFromViewAction,
                    cameraSettingsAction,
                    '_',
                    ...Outliner.control_menu_group,
                    '_',
                    'rename',
                    deleteCameraAction
                ]);
            }
            syncCameraElementsFromDocument();
            showActiveCameraTimelineTrack({ select: false });

            MenuBar.addAction(openAction, 'animation');
            MenuBar.addAction(cameraAction, 'animation');
            MenuBar.addAction(keyframeAction, 'animation');
            MenuBar.addAction(previewAction, 'animation');
            MenuBar.addAction(renderSequenceAction, 'animation');
            MenuBar.addAction(cancelRenderAction, 'animation');
            if (typeof Toolbars !== 'undefined') {
                Toolbars.main_tools?.add?.(openAction);
                if (sequenceToolbarSelect) Toolbars.main_tools?.add?.(sequenceToolbarSelect);
                if (cameraToolbarSelect) Toolbars.main_tools?.add?.(cameraToolbarSelect);
                Toolbars.main_tools?.add?.(playAction);
                if (fpsToolbarSelect) Toolbars.main_tools?.add?.(fpsToolbarSelect);
                if (timingToolbarText) Toolbars.main_tools?.add?.(timingToolbarText);
            }
            if (typeof Interface !== 'undefined') {
                Interface.Panels?.outliner?.menu?.addAction?.(cameraAction, '3');
            }
            syncFpsToolbar();
            syncPlaybackAction();

            displayAnimationFrameListener = Blockbench.on('display_animation_frame', handleAnimationDisplayFrame);
            timelinePlayListener = Blockbench.on('timeline_play', () => {
                playbackState.running = true;
                syncPlaybackAction();
            });
            timelinePauseListener = Blockbench.on('timeline_pause', () => {
                if (playbackState.ownsNativeTimeline) {
                    playbackState.running = false;
                    playbackState.ownsNativeTimeline = false;
                }
                syncPlaybackAction();
            });
            selectAnimationListener = Blockbench.on('select_animation', () => {
                clearCinematicTimelineAnimators();
                showActiveCameraTimelineTrack({ select: false });
            });
            selectModeListener = Blockbench.on('select_mode', event => {
                if (event?.mode?.id === 'animate') {
                    showActiveCameraTimelineTrack({ select: false });
                } else {
                    clearCinematicTimelineAnimators();
                }
            });
            frameRegionListener = Blockbench.on('studio_render_frame_changed', event => {
                if (
                    !cinematicFrameEditSequenceId ||
                    !event?.frame ||
                    event.owner !== 'lightflow_cinematic'
                ) return;
                updateSequence(cinematicFrameEditSequenceId, {
                    capture_area: 'frame',
                    render_frame: normalizeCaptureFrame(event.frame)
                }, {
                    undo_label: translate(
                        'lightflow_cinematic.undo.capture_region',
                        'Edit Cinematic Capture Region'
                    )
                });
            });
            gizmoVisibilityListener = () => syncCameraGizmoVisibility();
            window.addEventListener?.('lightflow_gizmo_visibility_changed', gizmoVisibilityListener);

            lifecycleHydrator = window.LightflowLifecycle?.registerHydrator?.(
                'lightflow_cinematic',
                ({ project, model, deferred }) => {
                    if (deferred) {
                        cancelPendingCameraElementWork();
                        managerDialog?.hide?.();
                        managerDialog = null;
                        cinematicFrameEditSequenceId = '';
                        pauseCinematicPlayback();
                        cancelActiveRender('project_change');
                        return;
                    }
                    if (!project) return;
                    hydrateProject(project, model);
                    persistenceWarningShown = false;
                    syncCameraElementsFromDocument();
                    syncFpsToolbar();
                }
            );
            if (!lifecycleHydrator) {
                projectListener = Blockbench.on('select_project', event => {
                    cancelPendingCameraElementWork();
                    managerDialog?.hide?.();
                    managerDialog = null;
                    cinematicFrameEditSequenceId = '';
                    pauseCinematicPlayback();
                    cancelActiveRender('project_change');
                    hydrateProject(event?.project || getActiveProject(), null);
                    persistenceWarningShown = false;
                    syncCameraElementsFromDocument();
                    syncFpsToolbar();
                });
                closeProjectListener = Blockbench.on('close_project', () => {
                    cancelPendingCameraElementWork();
                    managerDialog?.hide?.();
                    managerDialog = null;
                    cinematicFrameEditSequenceId = '';
                    pauseCinematicPlayback();
                    cancelActiveRender('project_close');
                });
            }
            parsedListener = window.Codecs?.project?.on?.('parsed', event => {
                hydrateProject(getActiveProject(), event?.model || event);
                syncCameraElementsFromDocument();
                syncFpsToolbar();
            });

            publishWindowBinding('LightflowCinematic', {
                version: '0.1.0',
                documentVersion: DOCUMENT_VERSION,
                get document() { return deepClone(readDocument()); },
                get capabilities() { return getCapabilities(); },
                get activeJob() { return snapshotRenderJob(activeRenderJob); },
                open: openManagerDialog,
                createSequence,
                updateSequence,
                deleteSequence,
                setActiveSequence,
                adaptSequenceToActiveAnimation,
                setSequenceFrameRate,
                createCameraFromView,
                updateCameraFromView,
                deleteCamera,
                setActiveCamera,
                selectCamera: selectCameraElement,
                addCameraKeyframe: addOrUpdateCameraKeyframe,
                deleteCameraKeyframe,
                updateCameraKeyframeInterpolation,
                showCameraTimeline: showActiveCameraTimelineTrack,
                sampleCamera,
                startPlayback: startCinematicPlayback,
                pausePlayback: pauseCinematicPlayback,
                togglePlayback: toggleCinematicPlayback,
                jumpToSequenceStart,
                evaluateFrame,
                renderSequence,
                renderMontage,
                exportMontage,
                openMontage: openMontageDialog,
                getMontagePlan: () => deepClone(buildMontagePlan()),
                updateMontage,
                addMontageClip,
                updateMontageClip,
                moveMontageClip,
                deleteMontageClip,
                renderPngSequence,
                renderVideoSequence,
                renderGifSequence,
                renderIntegratedVideoSequence,
                createIntegratedVideoSink,
                createDesktopExportTarget,
                probeIntegratedVideo,
                createIntegratedGifSink,
                probeVideoEncoder,
                videoEncodingArguments,
                createPngSequenceSink,
                cancelRender: cancelActiveRender,
                captureCurrentShot,
                physicalStateFromShot,
                shotFromPhysicalState,
                focalLengthToVerticalFov,
                verticalFovToFocalLength,
                frameToTimelineSeconds,
                timelineSecondsToFrame,
                frameTimestampMicroseconds,
                sequenceDurationFrames,
                sequenceDurationSeconds,
                sequenceTimingSummary,
                cinematicToolbarTimingText
            });
            publishWindowBinding('LightflowCinematicFrameContext', null);
        },
        onunload: unloadPlugin
    });
})();
