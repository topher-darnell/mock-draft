/*
  Big-head GMs: one original general manager per team.

  The GMs are photos (made with ChatGPT, cut out and framed for the site) in docs/gm:
    gm/small-<mood>.webp  every team for one mood: 8 across, 4 down, 180x216 each, 4px gaps
    gm/<team-slug>.webp   one team, all 5 moods in a row: 320x384 each, 6px gaps
  The drawn cartoon GMs below are the backup if a photo can't load.

  Website:  GM.img("New York Jets", "focused", 96)  -> HTML you can drop into the page
  Anywhere: GM.svg("New York Jets", "happy")        -> the drawn backup GM as SVG text

  Moods (photo / drawn backup):
    neutral  - smug, arms crossed / relaxed smile
    focused  - on the clock: thinking / draft headset
    happy    - steal, good grade: laughing / fist pump
    sad      - reach, bad grade: shocked / grimace
    trade    - trade talk: pointing, yelling / phone to the ear

  Every GM is original: team colors, no logos, no real people.
*/
(function (root) {
  "use strict";

  const MOODS = ["neutral", "focused", "happy", "sad", "trade"];
  const W = 200;
  const H = 240;

  // ---------- color helpers ----------

  function rgb(hex) {
    let h = String(hex || "#888888").replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function toHex(c) {
    return "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  }

  // amount < 0 darkens, amount > 0 lightens (-1 to 1)
  function shade(hex, amount) {
    const target = amount < 0 ? 0 : 255;
    const p = Math.abs(amount);
    return toHex(rgb(hex).map((v) => v + (target - v) * p));
  }

  function mix(hex, otherHex, amount) {
    const a = rgb(hex);
    const b = rgb(otherHex);
    return toHex(a.map((v, i) => v * amount + b[i] * (1 - amount)));
  }

  // ---------- tiny SVG builder ----------

  function attrs(o) {
    let s = "";
    for (const k in o) {
      const v = o[k];
      if (v === undefined || v === null || v === false) continue;
      s += " " + k + '="' + v + '"';
    }
    return s;
  }
  const P = (d, o) => "<path d=\"" + d + "\"" + attrs(o || {}) + "/>";
  const C = (cx, cy, r, o) => "<circle" + attrs(Object.assign({ cx, cy, r }, o || {})) + "/>";
  const E = (cx, cy, rx, ry, o) => "<ellipse" + attrs(Object.assign({ cx, cy, rx, ry }, o || {})) + "/>";
  const R = (x, y, w, h, rx, o) => "<rect" + attrs(Object.assign({ x, y, width: w, height: h, rx }, o || {})) + "/>";
  const G = (inner, o) => "<g" + attrs(o || {}) + ">" + inner + "</g>";
  const r1 = (n) => Math.round(n * 10) / 10;

  // points along a quadratic curve, for beads, braids and curls
  function quadPoints(x0, y0, cx, cy, x1, y1, count) {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      pts.push([r1(x), r1(y)]);
    }
    return pts;
  }

  function arcPoints(cx, cy, radius, fromDeg, toDeg, step) {
    const pts = [];
    for (let d = fromDeg; d <= toDeg + 0.01; d += step) {
      const rad = (d * Math.PI) / 180;
      pts.push([r1(cx + radius * Math.cos(rad)), r1(cy + radius * Math.sin(rad)), d]);
    }
    return pts;
  }

  // ---------- face and body shapes ----------

  const HEADS = {
    round: "M100 24 C142 24 166 54 166 96 C166 136 142 168 100 168 C58 168 34 136 34 96 C34 54 58 24 100 24 Z",
    square: "M100 24 C144 24 168 52 168 94 C168 124 162 150 146 162 C134 170 118 174 100 174 C82 174 66 170 54 162 C38 150 32 124 32 94 C32 52 56 24 100 24 Z",
    long: "M100 22 C138 22 162 52 162 94 C162 136 140 176 100 178 C60 176 38 136 38 94 C38 52 62 22 100 22 Z",
    heart: "M100 24 C142 24 166 54 166 94 C166 130 138 166 100 172 C62 166 34 130 34 94 C34 54 58 24 100 24 Z",
    wide: "M100 26 C146 26 172 54 172 98 C172 140 146 170 100 170 C54 170 28 140 28 98 C28 54 54 26 100 26 Z"
  };
  const EAR_X = { round: [36, 164], square: [34, 166], long: [40, 160], heart: [36, 164], wide: [30, 170] };

  const BODY = "M20 240 C20 212 40 194 70 188 C80 186 90 186 100 186 C110 186 120 186 130 188 C160 194 180 212 180 240 Z";
  const PANEL_L = "M20 240 C20 212 38 196 66 189 L84 186 L97 240 Z";
  const PANEL_R = "M180 240 C180 212 162 196 134 189 L116 186 L103 240 Z";

  // ---------- hair ----------

  function hair(L, uid) {
    const c = L.hair;
    const s = shade(c, -0.32);
    const hi = shade(c, 0.22);
    const line = { fill: c, stroke: s, "stroke-width": 2, "stroke-linejoin": "round" };
    const tex = { fill: "none", stroke: hi, "stroke-width": 2.2, "stroke-linecap": "round", opacity: 0.55 };
    let back = "";
    let front = "";

    switch (L.hairStyle) {
      case "short":
        front = P("M34 98 C28 46 62 14 100 14 C138 14 172 46 166 98 C162 76 150 60 132 54 C120 62 92 64 72 56 C54 62 40 78 34 98 Z", line) +
          P("M70 28 Q84 38 90 54 M110 24 Q124 34 128 50", tex);
        break;
      case "sidepart":
        front = P("M33 100 C26 44 62 12 102 13 C142 14 174 46 167 100 C163 76 152 60 136 52 C120 56 104 50 92 40 C82 54 58 62 33 100 Z", line) +
          P("M92 40 Q96 28 104 18 M120 22 Q138 30 148 50", tex);
        break;
      case "pixie":
        front = P("M34 100 C28 48 62 14 104 14 C146 14 174 48 166 100 C164 82 156 68 142 58 C128 68 100 72 74 64 C56 70 42 84 34 100 Z", line) +
          P("M74 64 Q104 58 138 30 M60 50 Q84 40 104 22", tex);
        break;
      case "messy":
        front = P("M34 98 C30 62 42 36 60 26 L62 12 L76 20 L86 6 L97 18 L110 4 L118 18 L133 10 L137 26 C158 36 170 62 166 98 C160 76 146 60 126 54 C110 62 88 62 72 54 C54 60 40 76 34 98 Z", line) +
          P("M86 22 Q92 36 94 50 M118 22 Q120 38 116 50", tex);
        break;
      case "waves":
        front = P("M32 102 C26 50 60 14 102 14 C146 14 176 52 168 104 C164 82 152 66 134 60 C124 74 104 76 90 66 C74 74 56 70 48 62 C40 72 35 86 32 102 Z", line) +
          P("M54 40 Q74 30 92 42 Q110 52 132 38 M60 56 Q76 48 92 56", tex);
        break;
      case "wavylong":
        back = P("M28 98 C16 150 28 198 54 210 C60 188 58 164 56 142 L144 142 C142 164 140 188 146 210 C172 198 184 150 172 98 Z", line) +
          P("M34 130 Q28 160 40 190 M166 130 Q172 160 160 190", tex);
        front = P("M30 104 C24 50 60 14 102 14 C146 14 178 52 170 106 C164 84 150 66 130 58 C110 70 80 72 60 62 C46 72 36 86 30 104 Z", line) +
          P("M60 62 Q90 50 118 30 M130 58 Q150 52 160 70", tex);
        break;
      case "long":
        back = P("M30 96 C22 150 30 202 48 216 L152 216 C170 202 178 150 170 96 Z", line) +
          P("M40 120 L38 200 M160 120 L162 200", tex);
        front = P("M32 106 C26 52 60 14 100 14 C140 14 174 52 168 106 C160 80 140 60 106 52 L100 40 L94 52 C60 60 40 80 32 106 Z", line) +
          P("M100 40 L100 18 M70 34 Q84 40 92 52 M130 34 Q116 40 108 52", tex);
        break;
      case "bob":
        back = P("M28 96 C24 140 30 168 46 180 L154 180 C170 168 176 140 172 96 Z", line);
        front = P("M30 106 C24 48 60 14 100 14 C140 14 176 48 170 106 C168 92 164 82 158 76 L42 76 C36 82 32 92 30 106 Z", line) +
          P("M58 28 Q100 16 142 28", Object.assign({}, tex, { opacity: 0.7 }));
        break;
      case "bigcurls": {
        back = P("M14 120 C0 70 34 4 100 2 C166 4 200 70 186 120 C190 160 172 198 148 208 L52 208 C28 198 10 160 14 120 Z", line);
        let curls = "";
        for (const [x, y] of arcPoints(100, 110, 88, 150, 390, 20)) {
          curls += C(x, y, 17, { fill: c, stroke: s, "stroke-width": 2 });
        }
        back += curls;
        front = P("M28 108 C20 50 60 10 104 10 C150 10 182 50 172 108 C166 86 152 70 132 62 C112 74 84 76 62 64 C46 74 34 90 28 108 Z", line) +
          P("M62 64 Q90 52 112 30 M132 62 Q150 56 158 74 M40 70 Q48 50 64 40", tex);
        break;
      }
      case "bun":
        front = C(100, 17, 19, line) + P("M88 12 Q100 4 112 12", tex) +
          P("M34 96 C30 50 62 22 100 22 C138 22 170 50 166 96 C160 74 140 58 100 56 C60 58 40 74 34 96 Z", line) +
          R(90, 32, 20, 6, 3, { fill: shade(c, -0.45) }) +
          P("M60 40 Q80 34 98 40 M140 40 Q120 34 102 40", tex);
        break;
      case "ponytail":
        back = P("M134 34 C168 22 194 52 190 100 C188 130 176 156 158 172 C168 136 170 96 150 62 C146 52 140 42 134 34 Z", line) +
          P("M172 60 Q182 92 172 132", tex);
        front = P("M34 98 C30 48 62 18 100 18 C138 18 170 48 166 98 C160 74 140 60 100 58 C60 60 40 74 34 98 Z", line) +
          R(132, 30, 14, 12, 4, { fill: L.trim, stroke: shade(L.trim, -0.3), "stroke-width": 1.5, transform: "rotate(-25 139 36)" }) +
          P("M60 44 Q96 28 134 36 M54 60 Q92 44 136 46", tex);
        break;
      case "braids": {
        back = P("M30 96 C22 150 30 204 48 222 L152 222 C170 204 178 150 170 96 Z", line);
        let strands = "";
        for (const sx of [44, 156]) {
          for (let y = 104; y <= 226; y += 10) {
            strands += E(sx, y, 7.5, 6, { fill: c, stroke: s, "stroke-width": 1.6 });
          }
          strands += R(sx - 8, 186, 16, 7, 3, { fill: "#E2B33C", stroke: "#A67C1E", "stroke-width": 1 });
        }
        front = P("M34 102 C28 52 62 16 100 16 C138 16 172 52 166 102 C160 80 140 60 104 54 L100 44 L96 54 C60 60 40 80 34 102 Z", line) +
          P("M100 44 L100 18 M96 54 Q70 40 52 64 M104 54 Q130 40 148 64 M90 30 Q70 34 56 48 M110 30 Q130 34 144 48", tex) +
          strands;
        break;
      }
      case "curly":
      case "messycurls": {
        const messy = L.hairStyle === "messycurls";
        let curls = "";
        const outer = arcPoints(100, 88, messy ? 68 : 64, 192, 348, messy ? 12 : 14);
        outer.forEach(([x, y], i) => {
          const r = messy ? [16, 13, 18, 14, 15][i % 5] : (i % 2 ? 13 : 15);
          curls += C(x, y, r, { fill: c, stroke: s, "stroke-width": 1.8 });
        });
        const inner = arcPoints(100, 92, 48, 220, 320, 20);
        inner.forEach(([x, y], i) => {
          curls += C(x, y, i % 2 ? 11 : 12.5, { fill: c, stroke: s, "stroke-width": 1.8 });
        });
        front = P("M36 96 C32 52 62 24 100 24 C138 24 168 52 164 96 C150 76 128 64 100 64 C72 64 50 76 36 96 Z", { fill: c }) + curls;
        break;
      }
      case "twists": {
        let tw = "";
        for (const [x, y, d] of arcPoints(100, 90, 62, 196, 344, 9)) {
          tw += E(x, y, 5.5, 11, { fill: c, stroke: s, "stroke-width": 1.4, transform: "rotate(" + (d + 90) + " " + x + " " + y + ")" });
        }
        front = P("M36 96 C32 50 62 24 100 24 C138 24 168 50 164 96 C158 74 140 60 100 58 C60 60 42 74 36 96 Z", line) + tw;
        break;
      }
      case "afro": {
        let dots = "";
        for (const [x, y] of [[60, 30], [80, 18], [104, 14], [128, 20], [146, 34], [44, 56], [158, 56], [70, 44], [96, 34], [122, 40], [52, 82], [150, 80]]) {
          dots += C(x, y, 2.2, { fill: hi, opacity: 0.6 });
        }
        front = P("M26 106 C10 56 46 4 100 4 C154 4 190 56 174 106 C166 80 150 62 128 56 C110 64 90 64 72 56 C50 62 34 80 26 106 Z", line) + dots;
        break;
      }
      case "bald": // gray or dark tufts on the sides only
        front = P("M34 112 C28 94 32 78 42 70 C42 86 44 100 48 114 Z M166 112 C172 94 168 78 158 70 C158 86 156 100 152 114 Z", line);
        break;
      case "shaved":
      default:
        front = "";
    }
    return { back, front };
  }

  // ---------- eyes, brows, mouth by mood ----------

  function eyes(L, mood) {
    const dark = "#1D1A18";
    const lidC = L.skin;
    const rim = shade(L.skin, -0.42);
    let out = "";
    const lashes = (x, side) => {
      if (!L.lashes) return "";
      const k = side === "L" ? -1 : 1;
      return P("M" + (x + 11 * k) + " 93 l" + 6 * k + " -5 M" + (x + 13 * k) + " 98 l" + 7 * k + " -2", { stroke: dark, "stroke-width": 2.6, "stroke-linecap": "round", fill: "none" });
    };

    if (mood === "happy") {
      for (const [x, side] of [[76, "L"], [124, "R"]]) {
        out += P("M" + (x - 12) + " 106 Q" + x + " 92 " + (x + 12) + " 106", { stroke: dark, "stroke-width": 5, "stroke-linecap": "round", fill: "none" });
        if (L.lashes) out += P("M" + (x + (side === "L" ? -12 : 12)) + " 106 l" + (side === "L" ? -5 : 5) + " -3", { stroke: dark, "stroke-width": 2.6, "stroke-linecap": "round" });
      }
      return out;
    }

    const look = { neutral: [1, 1], focused: [0, 1], sad: [-3, 5], trade: [-5, 0] }[mood] || [1, 1];
    for (const [x, side] of [[76, "L"], [124, "R"]]) {
      out += E(x, 102, 13, 14, { fill: "#FFFFFF", stroke: rim, "stroke-width": 1.6 });
      const px = x + look[0];
      const py = 103 + look[1];
      out += C(px, py, 6.8, { fill: dark });
      out += C(px + 2.4, py - 2.6, 2.1, { fill: "#FFFFFF" });
      let lid = 0;
      if (mood === "focused") lid = 9;
      if (mood === "trade" && side === "R") lid = 8;
      if (mood === "sad") lid = 0;
      if (lid) {
        out += P("M" + (x - 15) + " 86 L" + (x + 15) + " 86 L" + (x + 15) + " " + (88 + lid) + " Q" + x + " " + (86 + lid - 3) + " " + (x - 15) + " " + (88 + lid) + " Z", { fill: lidC });
        out += P("M" + (x - 13) + " " + (88 + lid) + " Q" + x + " " + (86 + lid - 3) + " " + (x + 13) + " " + (88 + lid), { stroke: rim, "stroke-width": 2.2, fill: "none", "stroke-linecap": "round" });
      }
      if (mood === "trade" && side === "R") {
        out += P("M" + (x - 11) + " 112 Q" + x + " 116 " + (x + 11) + " 112", { stroke: rim, "stroke-width": 1.8, fill: "none", "stroke-linecap": "round" });
      }
      out += lashes(x, side);
    }
    return out;
  }

  function brows(L, mood) {
    const sets = {
      neutral: ["M62 82 Q76 75 90 81", "M110 81 Q124 75 138 82"],
      focused: ["M61 78 Q76 79 91 87", "M109 87 Q124 79 139 78"],
      happy: ["M62 77 Q76 66 90 75", "M110 75 Q124 66 138 77"],
      sad: ["M61 86 Q76 84 91 74", "M109 74 Q124 84 139 86"],
      trade: ["M60 74 Q76 60 92 72", "M109 86 Q124 82 139 84"]
    };
    const [l, r] = sets[mood] || sets.neutral;
    const o = { stroke: L.brow, "stroke-width": L.age === "old" ? 7.5 : 6.2, "stroke-linecap": "round", fill: "none" };
    return P(l, o) + P(r, o);
  }

  function mouth(L, mood) {
    const dark = "#3E1216";
    const line = { stroke: dark, "stroke-width": 4.6, "stroke-linecap": "round", fill: "none" };
    switch (mood) {
      case "happy":
        return P("M70 142 Q100 188 130 142 Q100 154 70 142 Z", { fill: "#4A1418", stroke: dark, "stroke-width": 2.4, "stroke-linejoin": "round" }) +
          P("M76 145 Q100 155 124 145 L122 152 Q100 160 78 152 Z", { fill: "#FFFFFF" }) +
          P("M86 167 Q100 158 114 167 Q100 177 86 167 Z", { fill: "#E26A6A" });
      case "sad":
        return P("M76 145 Q100 139 124 145 Q127 154 122 163 Q100 168 78 163 Q73 154 76 145 Z", { fill: "#FFFFFF", stroke: dark, "stroke-width": 3, "stroke-linejoin": "round" }) +
          P("M77 154 Q100 151 123 154 M88 142 L88 166 M96 141 L96 167 M104 141 L104 167 M112 142 L112 166", { stroke: dark, "stroke-width": 1.8, fill: "none" });
      case "focused":
        return P("M84 152 Q102 157 118 145", line);
      case "trade":
        return P("M84 151 Q100 149 118 154", line);
      default:
        return P("M80 147 Q100 163 120 147", line) +
          P("M78 145 l-3 -2 M122 145 l3 -2", { stroke: dark, "stroke-width": 2.4, "stroke-linecap": "round" });
    }
  }

  // ---------- clothes and accessories ----------

  function patterns(L, uid) {
    let d = "";
    if (L.neck === "scarf" && L.scarfPattern === "checker") {
      d += '<pattern id="' + uid + '-chk" width="10" height="10" patternUnits="userSpaceOnUse">' +
        R(0, 0, 10, 10, 0, { fill: "#FFFFFF" }) + R(0, 0, 5, 5, 0, { fill: "#16181C" }) + R(5, 5, 5, 5, 0, { fill: "#16181C" }) + "</pattern>";
    }
    if (L.neck === "scarf" && L.scarfPattern === "subway") {
      d += '<pattern id="' + uid + '-sub" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">' +
        R(0, 0, 28, 28, 0, { fill: "#F4F4F2" }) +
        R(2, 0, 3, 28, 0, { fill: "#EE352E" }) + R(9, 0, 3, 28, 0, { fill: "#0039A6" }) +
        R(16, 0, 3, 28, 0, { fill: "#FCCC0A" }) + R(23, 0, 3, 28, 0, { fill: "#00933C" }) + "</pattern>";
    }
    if (L.outer === "flannel") {
      const base = L.outerColor;
      d += '<pattern id="' + uid + '-plaid" width="18" height="18" patternUnits="userSpaceOnUse">' +
        R(0, 0, 18, 18, 0, { fill: base }) +
        R(0, 6, 18, 6, 0, { fill: shade(base, -0.35), opacity: 0.6 }) +
        R(6, 0, 6, 18, 0, { fill: shade(base, -0.35), opacity: 0.6 }) +
        R(0, 14, 18, 1.5, 0, { fill: shade(base, 0.5), opacity: 0.5 }) +
        R(14, 0, 1.5, 18, 0, { fill: shade(base, 0.5), opacity: 0.5 }) + "</pattern>";
    }
    return d ? "<defs>" + d + "</defs>" : "";
  }

  function sparkles(points, color) {
    let s = "";
    for (const [x, y, k] of points) {
      const r = k || 4;
      s += P("M" + x + " " + (y - r) + " L" + (x + r * 0.3) + " " + (y - r * 0.3) + " L" + (x + r) + " " + y + " L" + (x + r * 0.3) + " " + (y + r * 0.3) + " L" + x + " " + (y + r) + " L" + (x - r * 0.3) + " " + (y + r * 0.3) + " L" + (x - r) + " " + y + " L" + (x - r * 0.3) + " " + (y - r * 0.3) + " Z", { fill: color });
    }
    return s;
  }

  function outerwear(L, uid) {
    const c = L.outerColor;
    const s = shade(c, -0.3);
    const o = { fill: c, stroke: s, "stroke-width": 2, "stroke-linejoin": "round" };
    switch (L.outer) {
      case "blazer":
      case "suit":
      case "linen": {
        let out = P(PANEL_L, o) + P(PANEL_R, o) +
          P("M84 186 L70 198 L86 210 L97 238 Z", { fill: shade(c, -0.16), stroke: s, "stroke-width": 1.6 }) +
          P("M116 186 L130 198 L114 210 L103 238 Z", { fill: shade(c, -0.16), stroke: s, "stroke-width": 1.6 });
        if (L.outer === "suit") out += P("M48 214 L62 210 L60 218 Z", { fill: "#FFFFFF" });
        if (L.outer === "linen") out += P("M40 214 Q50 206 62 210 M140 210 Q150 206 160 214", { stroke: shade(c, -0.12), "stroke-width": 1.5, fill: "none" });
        if (L.sparkle) out += sparkles([[42, 222, 4], [56, 204, 3], [64, 228, 4], [150, 206, 3], [160, 226, 4], [138, 230, 3], [30, 232, 3]], L.sparkle);
        return out;
      }
      case "vest":
        return P(PANEL_L, o) + P(PANEL_R, o) +
          P("M30 214 L94 214 M26 228 L96 228 M40 202 L90 202 M106 202 L160 202 M104 214 L170 214 M104 228 L174 228", { stroke: s, "stroke-width": 1.6, fill: "none", opacity: 0.8 });
      case "parka":
        return P("M20 240 C20 212 38 196 66 189 L88 186 L99 240 Z", o) + P("M180 240 C180 212 162 196 134 189 L112 186 L101 240 Z", o) +
          P("M34 222 L96 222 M106 222 L168 222", { stroke: s, "stroke-width": 1.6, fill: "none" });
      case "raincoat":
        return P("M20 240 C20 212 38 196 66 189 L90 186 L99 240 Z", o) + P("M180 240 C180 212 162 196 134 189 L110 186 L101 240 Z", o) +
          P("M100 200 L100 240", { stroke: s, "stroke-width": 2.4 }) +
          C(88, 214, 2.5, { fill: s }) + C(88, 230, 2.5, { fill: s }) + C(112, 214, 2.5, { fill: s }) + C(112, 230, 2.5, { fill: s });
      case "workjacket":
        return P(PANEL_L, o) + P(PANEL_R, o) +
          R(46, 206, 22, 18, 3, { fill: shade(c, -0.08), stroke: s, "stroke-width": 1.6 }) + P("M46 212 L68 212", { stroke: s, "stroke-width": 1.6 }) +
          P("M84 186 L66 196 L80 208 L92 202 Z M116 186 L134 196 L120 208 L108 202 Z", { fill: shade(c, -0.38), stroke: s, "stroke-width": 1.4 }) +
          P("M92 240 L84 192 M108 240 L116 192", { stroke: shade(c, 0.35), "stroke-width": 1.2, "stroke-dasharray": "3 3", fill: "none" });
      case "flannel":
        return P(PANEL_L, { fill: "url(#" + uid + "-plaid)", stroke: s, "stroke-width": 2 }) + P(PANEL_R, { fill: "url(#" + uid + "-plaid)", stroke: s, "stroke-width": 2 }) +
          P("M84 186 L74 200 L90 204 Z M116 186 L126 200 L110 204 Z", { fill: shade(c, -0.2), stroke: s, "stroke-width": 1.4 });
      case "hoodie":
        return P(PANEL_L, o) + P(PANEL_R, o) +
          P("M88 196 L86 222 M112 196 L114 222", { stroke: "#E8E8E8", "stroke-width": 2.4, "stroke-linecap": "round" }) +
          R(83, 220, 6, 7, 2, { fill: "#B9BEC6" }) + R(111, 220, 6, 7, 2, { fill: "#B9BEC6" });
      case "apron":
        return P("M84 186 L76 198 M116 186 L124 198", { stroke: shade(c, -0.2), "stroke-width": 3, "stroke-linecap": "round" }) +
          P("M72 198 L128 198 L136 240 L64 240 Z", o) +
          R(88, 214, 24, 16, 2, { fill: "none", stroke: s, "stroke-width": 1.6 }) +
          P("M98 222 Q100 214 104 218 Q106 224 100 226 Q96 224 98 222 Z", { fill: "#F2A93B" });
      default:
        return "";
    }
  }

  function hoodieBack(L) {
    if (L.outer !== "hoodie") return "";
    const c = L.outerColor;
    return P("M50 198 C52 170 78 160 100 160 C122 160 148 170 150 198 Z", { fill: shade(c, -0.12), stroke: shade(c, -0.35), "stroke-width": 2 });
  }

  function collar(L) {
    if (L.outer === "parka") return "";
    const t = L.trim;
    const s = shade(t, -0.3);
    const o = { fill: t, stroke: s, "stroke-width": 1.8, "stroke-linejoin": "round" };
    let out = P("M82 186 L100 206 L92 222 L70 196 Z", o) + P("M118 186 L100 206 L108 222 L130 196 Z", o);
    if (L.outer === "none" || !L.outer) {
      out += P("M100 208 L100 240", { stroke: shade(L.shirt, -0.3), "stroke-width": 2.6 }) +
        C(100, 220, 2.6, { fill: t, stroke: s, "stroke-width": 1 }) + C(100, 232, 2.6, { fill: t, stroke: s, "stroke-width": 1 });
    }
    return out;
  }

  function neckwear(L, uid) {
    switch (L.neck) {
      case "scarf": {
        const fill = L.scarfPattern === "checker" ? "url(#" + uid + "-chk)" : L.scarfPattern === "subway" ? "url(#" + uid + "-sub)" : L.scarfColor;
        const s = shade(L.scarfPattern ? "#9AA0A8" : L.scarfColor, -0.35);
        const o = { fill, stroke: s, "stroke-width": 2, "stroke-linejoin": "round" };
        const tail = L.scarfBlow
          ? P("M124 186 C146 178 170 166 196 168 C188 180 170 194 140 202 Z", o) + P("M190 170 l6 -4 M193 175 l6 -2 M188 180 l6 0", { stroke: s, "stroke-width": 2, "stroke-linecap": "round" })
          : P("M74 194 L94 196 L92 238 L72 236 Z", o) + P("M75 236 l-1 4 M80 236 l0 4 M85 237 l0 3 M90 238 l1 2", { stroke: s, "stroke-width": 1.8, "stroke-linecap": "round" });
        return tail + P("M66 178 C80 168 120 168 134 178 C138 188 134 198 128 202 C114 194 86 194 72 202 C66 198 62 188 66 178 Z", o);
      }
      case "beads": {
        let out = "";
        [["#6B2D8F", 212], ["#2E8B3E", 222], ["#E2B33C", 232]].forEach(([col, dip], i) => {
          for (const [x, y] of quadPoints(72 - i * 2, 190, 100, dip + 14, 128 + i * 2, 190, 11)) {
            out += C(x, y, 3.6, { fill: col, stroke: shade(col, -0.35), "stroke-width": 1 });
          }
        });
        return out;
      }
      case "chain":
        return P("M76 190 Q100 226 124 190", { stroke: "#E2B33C", "stroke-width": 3.4, fill: "none", "stroke-dasharray": "5 2" }) +
          C(100, 210, 5, { fill: "#E2B33C", stroke: "#A67C1E", "stroke-width": 1.4 });
      case "napkin":
        return P("M84 190 L116 190 L100 226 Z", { fill: "#FFFFFF", stroke: "#C7CCD2", "stroke-width": 1.6, "stroke-linejoin": "round" }) +
          P("M92 190 L100 208", { stroke: "#D5D9DE", "stroke-width": 1.4 }) +
          C(96, 200, 2.4, { fill: "#C2571F" }) + C(105, 206, 1.8, { fill: "#C2571F" }) + C(101, 214, 2, { fill: "#B5501C" });
      default:
        return "";
    }
  }

  function pin(L) {
    const at = (inner, rot) => G(inner, { transform: "translate(60 216) rotate(" + (rot || 0) + ")" });
    switch (L.pin) {
      case "rocket":
        return at(P("M0 -11 C5 -6 5 5 3 9 L-3 9 C-5 5 -5 -6 0 -11 Z", { fill: "#F4F4F4", stroke: "#9AA0A8", "stroke-width": 1 }) +
          P("M-3 4 L-7 10 L-3 9 Z M3 4 L7 10 L3 9 Z", { fill: "#D3312B" }) + C(0, -2, 2.2, { fill: "#4AA3DF" }) +
          P("M-2 10 L0 15 L2 10 Z", { fill: "#F2A93B" }), -20);
      case "wrench":
        return at(P("M-2 -10 C-8 -10 -10 -4 -8 0 L-1 7 L-1 12 L3 12 L3 6 L4 0 C8 -4 6 -10 0 -10 L0 -6 L-3 -6 Z", { fill: "#B9BEC6", stroke: "#6E747C", "stroke-width": 1 }), 30);
      case "clapper":
        return at(R(-9, -4, 18, 12, 1.5, { fill: "#1E2228" }) +
          P("M-9 -4 L-9 -9 L9 -9 L9 -4 Z", { fill: "#F4F4F4", stroke: "#1E2228", "stroke-width": 1 }) +
          P("M-6 -9 L-3 -4 M0 -9 L3 -4 M6 -9 L9 -5", { stroke: "#1E2228", "stroke-width": 1.6 }), -10);
      case "trumpet":
        return at(P("M-10 -2 L4 -2 L10 -7 L10 7 L4 2 L-10 2 Z", { fill: "#E2B33C", stroke: "#A67C1E", "stroke-width": 1 }) +
          R(-4, -6, 2, 4, 0.5, { fill: "#A67C1E" }) + R(0, -6, 2, 4, 0.5, { fill: "#A67C1E" }), -15);
      default:
        return "";
    }
  }

  function snow(L) {
    if (!L.snow) return "";
    let out = "";
    for (const [x, y] of [[36, 214], [52, 200], [148, 202], [166, 216], [42, 230], [158, 230]]) {
      out += P("M" + (x - 5) + " " + y + " L" + (x + 5) + " " + y + " M" + (x - 3) + " " + (y - 4.5) + " L" + (x + 3) + " " + (y + 4.5) + " M" + (x - 3) + " " + (y + 4.5) + " L" + (x + 3) + " " + (y - 4.5),
        { stroke: "#FFFFFF", "stroke-width": 1.8, "stroke-linecap": "round" });
    }
    return out;
  }

  function eyewear(L, mood) {
    const frame = "#1E2228";
    switch (L.eyewear) {
      case "glasses":
      case "chainglasses": {
        const col = L.frameColor || frame;
        let out = R(60, 88, 32, 28, 9, { fill: "#FFFFFF", "fill-opacity": 0.1, stroke: col, "stroke-width": 4.5 }) +
          R(108, 88, 32, 28, 9, { fill: "#FFFFFF", "fill-opacity": 0.1, stroke: col, "stroke-width": 4.5 }) +
          P("M92 100 Q100 95 108 100 M60 98 L44 96 M140 98 L156 96", { stroke: col, "stroke-width": 4, fill: "none", "stroke-linecap": "round" });
        if (L.eyewear === "chainglasses") {
          out += P("M44 98 C34 140 56 182 100 186 C144 182 166 140 156 98", { stroke: L.chainColor || "#C04A7A", "stroke-width": 3.2, fill: "none", "stroke-dasharray": "0.1 6", "stroke-linecap": "round" });
        }
        return out;
      }
      case "sunglasses":
        return R(57, 88, 37, 28, 10, { fill: "#15181D", stroke: frame, "stroke-width": 3.5 }) +
          R(106, 88, 37, 28, 10, { fill: "#15181D", stroke: frame, "stroke-width": 3.5 }) +
          P("M94 100 Q100 95 106 100 M57 98 L44 96 M143 98 L156 96", { stroke: frame, "stroke-width": 4, fill: "none", "stroke-linecap": "round" }) +
          P("M64 94 L74 94 M112 94 L122 94", { stroke: "#FFFFFF", "stroke-width": 2.2, opacity: 0.55, "stroke-linecap": "round" });
      case "shades":
        return P("M52 90 L148 90 L144 110 Q124 118 106 108 L94 108 Q76 118 56 110 Z", { fill: "#121418", stroke: "#000000", "stroke-width": 2, "stroke-linejoin": "round" }) +
          P("M60 96 L80 96 M110 96 L128 96", { stroke: "#FFFFFF", "stroke-width": 2, opacity: 0.45, "stroke-linecap": "round" }) +
          P("M52 94 L42 94 M148 94 L158 94", { stroke: "#000000", "stroke-width": 3.4 });
      default:
        return "";
    }
  }

  function star(cx, cy, r) {
    let d = "";
    for (let i = 0; i < 10; i++) {
      const rad = ((i * 36 - 90) * Math.PI) / 180;
      const rr = i % 2 === 0 ? r : r * 0.48;
      d += (i === 0 ? "M" : " L") + r1(cx + rr * Math.cos(rad)) + " " + r1(cy + rr * Math.sin(rad));
    }
    return d + " Z";
  }

  function foreheadGear(L) {
    if (L.forehead === "goggles") {
      return R(30, 58, 140, 10, 4, { fill: "#2A2F36" }) +
        R(62, 46, 76, 28, 14, { fill: "#F59E42", stroke: "#22262C", "stroke-width": 3.5 }) +
        P("M70 54 Q100 46 130 54", { stroke: "#FFE3B8", "stroke-width": 3, fill: "none", "stroke-linecap": "round", opacity: 0.9 });
    }
    if (L.forehead === "starshades") {
      return P(star(80, 38, 16), { fill: "#2B1E3A", stroke: "#FFA300", "stroke-width": 3, "stroke-linejoin": "round" }) +
        P(star(120, 38, 16), { fill: "#2B1E3A", stroke: "#FFA300", "stroke-width": 3, "stroke-linejoin": "round" }) +
        P("M94 38 Q100 34 106 38", { stroke: "#FFA300", "stroke-width": 3, fill: "none" }) +
        P("M74 34 L80 30 M114 34 L120 30", { stroke: "#FFFFFF", "stroke-width": 2, opacity: 0.6, "stroke-linecap": "round" });
    }
    return "";
  }

  function hat(L) {
    const c = L.hatColor;
    const s = shade(c, -0.32);
    const o = { fill: c, stroke: s, "stroke-width": 2, "stroke-linejoin": "round" };
    switch (L.hat) {
      case "cap":
        return P("M38 76 C38 30 68 14 100 14 C132 14 162 30 162 76 Z", o) +
          P("M100 14 L100 74 M70 20 Q78 48 74 74 M130 20 Q122 48 126 74", { stroke: s, "stroke-width": 1.4, fill: "none", opacity: 0.6 }) +
          P("M36 74 C70 66 130 66 164 74 C168 86 150 94 100 94 C50 94 32 86 36 74 Z", { fill: shade(c, -0.18), stroke: s, "stroke-width": 2 }) +
          C(100, 16, 5, { fill: L.trim, stroke: s, "stroke-width": 1 });
      case "beanie":
        return P("M34 80 C34 30 66 12 100 12 C134 12 166 30 166 80 Z", o) +
          P("M60 22 L62 70 M80 14 L80 70 M100 12 L100 70 M120 14 L120 70 M140 22 L138 70", { stroke: s, "stroke-width": 1.4, opacity: 0.5 }) +
          R(30, 66, 140, 24, 12, { fill: shade(c, -0.14), stroke: s, "stroke-width": 2 }) +
          (L.pom === false ? "" : C(100, 10, 12, { fill: L.pomColor || c, stroke: s, "stroke-width": 2 }));
      case "earflap":
        return P("M32 112 C26 120 30 146 42 150 C50 146 52 126 50 110 Z M168 112 C174 120 170 146 158 150 C150 146 148 126 150 110 Z", o) +
          P("M42 150 L40 176 M158 150 L160 176", { stroke: s, "stroke-width": 2.4, "stroke-linecap": "round" }) +
          C(40, 178, 4, { fill: c, stroke: s, "stroke-width": 1.4 }) + C(160, 178, 4, { fill: c, stroke: s, "stroke-width": 1.4 }) +
          P("M32 86 C30 32 66 12 100 12 C134 12 170 32 168 86 Z", o) +
          R(28, 74, 144, 18, 9, { fill: "#EFE6D2", stroke: "#BBAF95", "stroke-width": 2 }) +
          C(100, 10, 12, { fill: "#EFE6D2", stroke: "#BBAF95", "stroke-width": 2 });
      case "cowboy":
        return P("M54 72 C50 38 62 16 80 20 C88 28 112 28 120 20 C138 16 150 38 146 72 Z", o) +
          R(54, 58, 92, 10, 3, { fill: L.trim, stroke: shade(L.trim, -0.3), "stroke-width": 1.4 }) +
          P("M6 72 C30 56 62 68 100 68 C138 68 170 56 194 72 C182 86 150 86 100 86 C50 86 18 86 6 72 Z", { fill: shade(c, -0.08), stroke: s, "stroke-width": 2.2, "stroke-linejoin": "round" });
      case "sunhat":
        return P("M50 76 C48 36 70 20 100 20 C130 20 152 36 150 76 Z", o) +
          R(50, 60, 100, 10, 3, { fill: shade(c, -0.25) }) +
          P("M4 80 C40 64 160 64 196 80 C180 96 20 96 4 80 Z", { fill: shade(c, 0.06), stroke: s, "stroke-width": 2.2, "stroke-linejoin": "round" }) +
          P("M38 92 Q44 140 74 160 M162 92 Q156 140 126 160", { stroke: shade(c, -0.4), "stroke-width": 1.6, fill: "none", opacity: 0.8 });
      case "bucket": {
        let lures = "";
        for (const [x, y, col] of [[66, 50, "#E8443A"], [92, 40, "#F2C230"], [124, 46, "#3D9BE9"]]) {
          lures += P("M" + x + " " + y + " q4 10 0 14 q-3 2 -4 -2", { stroke: "#9AA0A8", "stroke-width": 1.6, fill: "none" }) + E(x - 1, y + 4, 4, 6, { fill: col, stroke: shade(col, -0.35), "stroke-width": 1 });
        }
        return P("M44 80 C40 34 66 18 100 18 C134 18 160 34 156 80 Z", o) +
          P("M20 82 C46 70 154 70 180 82 C176 100 24 100 20 82 Z", { fill: shade(c, -0.1), stroke: s, "stroke-width": 2 }) +
          P("M46 70 L154 70", { stroke: s, "stroke-width": 1.4, opacity: 0.6 }) + lures;
      }
      case "newsboy":
        return P("M34 80 C28 44 62 20 104 20 C152 20 176 50 166 80 Z", o) +
          P("M104 20 L100 76 M66 30 Q76 54 70 78 M142 30 Q132 54 138 78", { stroke: s, "stroke-width": 1.4, fill: "none", opacity: 0.55 }) +
          C(104, 20, 4.5, { fill: shade(c, -0.2) }) +
          P("M42 76 C76 66 124 66 158 76 C152 90 48 90 42 76 Z", { fill: shade(c, -0.18), stroke: s, "stroke-width": 2 });
      case "captain":
        return P("M40 74 C36 46 50 24 100 22 C150 24 164 46 160 74 Z", { fill: "#F7F7F5", stroke: "#B9BEC6", "stroke-width": 2 }) +
          R(42, 60, 116, 16, 4, { fill: "#1B2A44" }) +
          P("M44 74 C76 68 124 68 156 74 C152 90 48 90 44 74 Z", { fill: "#15181D", stroke: "#000000", "stroke-width": 1.6 }) +
          P("M54 72 Q100 64 146 72", { stroke: "#E2B33C", "stroke-width": 2.4, fill: "none" }) +
          E(100, 46, 9, 7, { fill: "#E2B33C", stroke: "#A67C1E", "stroke-width": 1.2 });
      case "hardhat":
        return P("M36 80 C36 32 66 12 100 12 C134 12 164 32 164 80 Z", o) +
          P("M88 14 C90 34 90 56 90 78 L110 78 C110 56 110 34 112 14 Z", { fill: shade(c, -0.1), stroke: s, "stroke-width": 1.6 }) +
          P("M24 78 C60 70 140 70 176 78 C174 90 26 90 24 78 Z", { fill: shade(c, -0.06), stroke: s, "stroke-width": 2 }) +
          P("M54 30 Q66 22 80 20", { stroke: "#FFFFFF", "stroke-width": 3, fill: "none", opacity: 0.5, "stroke-linecap": "round" });
      default:
        return "";
    }
  }

  function hoodBack(L) {
    if (L.hat !== "hood") return "";
    const c = L.hatColor;
    return P("M30 200 C24 176 30 160 44 152 L156 152 C170 160 176 176 170 200 Z", { fill: shade(c, -0.25), stroke: shade(c, -0.45), "stroke-width": 2 });
  }

  function hoodFront(L) {
    if (L.hat !== "hood") return "";
    const c = L.hatColor;
    const s = shade(c, -0.4);
    const outer = "M20 124 C12 56 52 6 100 6 C148 6 188 56 180 124 C178 154 170 176 158 190 L42 190 C30 176 22 154 20 124 Z";
    const hole = "M100 40 C70 40 46 64 44 104 C42 142 64 174 100 178 C136 174 158 142 156 104 C154 64 130 40 100 40 Z";
    return P(outer + " " + hole, { fill: c, "fill-rule": "evenodd", stroke: s, "stroke-width": 2, "stroke-linejoin": "round" }) +
      P(hole, { fill: "none", stroke: shade(c, -0.28), "stroke-width": 5, opacity: 0.6 }) +
      P("M100 6 L100 40", { stroke: s, "stroke-width": 1.6, opacity: 0.6 }) +
      P("M64 182 L62 212 M136 182 L138 212", { stroke: "#E8E8E8", "stroke-width": 2.4, "stroke-linecap": "round" }) +
      C(62, 214, 2.6, { fill: "#B9BEC6" }) + C(138, 214, 2.6, { fill: "#B9BEC6" });
  }

  function earGear(L, mood, ex) {
    let out = "";
    if (L.earrings === "hoops") {
      out += C(ex[0], 128, 8.5, { fill: "none", stroke: "#E2B33C", "stroke-width": 3 }) + C(ex[1], 128, 8.5, { fill: "none", stroke: "#E2B33C", "stroke-width": 3 });
    }
    if (L.earrings === "picks") {
      for (const x of ex) {
        out += P("M" + (x - 6) + " 122 Q" + x + " 118 " + (x + 6) + " 122 Q" + (x + 4) + " 132 " + x + " 136 Q" + (x - 4) + " 132 " + (x - 6) + " 122 Z", { fill: L.trim, stroke: "#FFFFFF", "stroke-width": 1.4 });
      }
    }
    return out;
  }

  function earmuffs(L, mood) {
    if (!L.earmuffs || mood === "focused") return "";
    const c = L.earmuffs;
    let out = P("M34 100 C30 28 170 28 166 100", { stroke: shade(c, -0.25), "stroke-width": 7, fill: "none", "stroke-linecap": "round" });
    for (const x of [34, 166]) {
      for (const [fx, fy] of arcPoints(x, 106, 15, 0, 330, 30)) out += C(fx, fy, 6, { fill: c, stroke: shade(c, -0.3), "stroke-width": 1 });
      out += C(x, 106, 15, { fill: c });
    }
    return out;
  }

  function pencil(L) {
    if (!L.pencil) return "";
    return G(R(-3.5, -24, 7, 40, 1, { fill: "#F2C230", stroke: "#B58A12", "stroke-width": 1 }) +
      R(-3.5, -30, 7, 7, 1.5, { fill: "#E98AA0", stroke: "#B5566C", "stroke-width": 1 }) +
      P("M-3.5 16 L0 24 L3.5 16 Z", { fill: "#E8C99A", stroke: "#B58A12", "stroke-width": 1 }) + P("M-1.2 21 L0 24 L1.2 21 Z", { fill: "#333333" }),
    { transform: "translate(170 84) rotate(24)" });
  }

  function headset(L, mood, ex) {
    if (mood !== "focused") return "";
    const dark = "#2A2F36";
    let out = "";
    const covered = L.hat && L.hat !== "none";
    if (!covered) out += P("M" + (ex[0] - 6) + " 104 C" + (ex[0] - 10) + " 24 " + (ex[1] + 10) + " 24 " + (ex[1] + 6) + " 104", { stroke: dark, "stroke-width": 8, fill: "none", "stroke-linecap": "round" });
    for (const x of ex) {
      out += R(x - 10, 90, 20, 32, 8, { fill: dark, stroke: "#14171B", "stroke-width": 1.6 }) + C(x, 106, 4.5, { fill: L.trim });
    }
    out += P("M" + (ex[0] - 2) + " 120 C" + (ex[0] + 2) + " 146 56 156 76 154", { stroke: dark, "stroke-width": 5, fill: "none", "stroke-linecap": "round" }) +
      E(78, 153, 7, 6, { fill: dark });
    return out;
  }

  function hand(x, y, L, rot, scale) {
    const s = shade(L.skin, -0.35);
    return G(R(-12, -11, 24, 22, 9, { fill: L.skin, stroke: s, "stroke-width": 2 }) +
      P("M-6 -11 L-6 -3 M0 -11 L0 -3 M6 -11 L6 -3", { stroke: s, "stroke-width": 1.6, "stroke-linecap": "round" }) +
      E(-11, 2, 6, 8, { fill: L.skin, stroke: s, "stroke-width": 1.8 }),
    { transform: "translate(" + x + " " + y + ") rotate(" + (rot || 0) + ") scale(" + (scale || 1) + ")" });
  }

  function sleeveColor(L) {
    return L.outer && L.outer !== "none" && L.outer !== "apron" ? (L.outer === "flannel" ? L.outerColor : L.outerColor) : L.shirt;
  }

  function prop(L) {
    const sk = shade(L.skin, -0.35);
    switch (L.prop) {
      case "coffee":
        return P("M142 178 L170 178 L166 216 L146 216 Z", { fill: "#FFFFFF", stroke: "#B9BEC6", "stroke-width": 1.8, "stroke-linejoin": "round" }) +
          P("M144 192 L168 192 L167 204 L145 204 Z", { fill: "#8B5A3C" }) +
          R(139, 171, 34, 9, 3, { fill: "#3B3F45" }) + hand(156, 222, L);
      case "pizza":
        return P("M154 164 L176 212 Q156 220 134 212 Z", { fill: "#F2C14E", stroke: "#C98A2A", "stroke-width": 1.8, "stroke-linejoin": "round" }) +
          C(150, 186, 4, { fill: "#C8392F" }) + C(160, 200, 4, { fill: "#C8392F" }) + C(146, 204, 3.5, { fill: "#C8392F" }) +
          P("M134 212 Q156 220 176 212 Q172 226 156 225 Q140 226 134 212 Z", { fill: "#C98A3E", stroke: "#9C6424", "stroke-width": 1.6 }) + hand(156, 226, L);
      case "sandwich":
        return G(E(0, 0, 30, 12, { fill: "#D9A066", stroke: "#A8743E", "stroke-width": 2 }) +
          P("M-28 -2 Q-18 -10 -8 -3 Q2 -10 12 -3 Q22 -10 28 -2", { stroke: "#8B4A2B", "stroke-width": 5, fill: "none", "stroke-linecap": "round" }) +
          P("M-20 2 q2 6 4 0 M0 2 q2 7 4 0 M16 1 q2 6 4 0", { stroke: "#F5C542", "stroke-width": 3, fill: "none", "stroke-linecap": "round" }),
        { transform: "translate(154 196) rotate(-24)" }) + hand(160, 222, L);
      case "tea":
        return R(144, 178, 26, 38, 5, { fill: "#C9802A", stroke: "#9AA0A8", "stroke-width": 1.8, "fill-opacity": 0.92 }) +
          R(147, 182, 5, 26, 2.5, { fill: "#FFFFFF", opacity: 0.45 }) +
          R(142, 172, 30, 8, 2, { fill: "#B9BEC6", stroke: "#7D838B", "stroke-width": 1.2 }) +
          P("M162 172 L168 152", { stroke: "#E8443A", "stroke-width": 3, "stroke-linecap": "round" }) +
          C(166, 190, 6, { fill: "#F5E05A", stroke: "#C9B12A", "stroke-width": 1.4 }) + hand(157, 222, L);
      case "phone":
        return R(146, 180, 20, 36, 4, { fill: "#20242B", stroke: "#0E1013", "stroke-width": 1.6 }) +
          R(149, 184, 14, 26, 2, { fill: "#4AA3DF" }) + hand(156, 220, L);
      case "mallet":
        return P("M166 220 L146 172", { stroke: "#B07A44", "stroke-width": 5, "stroke-linecap": "round" }) +
          G(R(-16, -8, 32, 16, 3, { fill: "#C98E52", stroke: "#8A5A2B", "stroke-width": 1.8 }), { transform: "translate(144 166) rotate(-22)" }) + hand(164, 222, L);
      case "laptop": {
        let stickers = C(138, 194, 5, { fill: "#F2A93B" }) + R(150, 198, 9, 9, 2, { fill: "#4AA3DF" }) + C(162, 190, 4, { fill: "#6CD39A" }) + R(140, 206, 12, 5, 2, { fill: "#E26A6A" });
        return R(124, 178, 54, 38, 4, { fill: "#A3AAB4", stroke: "#6E747C", "stroke-width": 1.8 }) + stickers + hand(172, 222, L);
      }
      default:
        return "";
    }
  }

  function moodHands(L, mood) {
    const sleeve = sleeveColor(L);
    const ss = shade(sleeve, -0.3);
    const sk = shade(L.skin, -0.35);
    if (mood === "happy") {
      // fist pump
      return P("M20 240 C18 220 20 204 28 190 L52 196 C46 210 44 226 48 240 Z", { fill: sleeve, stroke: ss, "stroke-width": 2, "stroke-linejoin": "round" }) +
        P("M30 192 L50 198", { stroke: ss, "stroke-width": 2 }) +
        P("M30 194 L22 164 L42 158 L50 196 Z", { fill: L.skin, stroke: sk, "stroke-width": 2, "stroke-linejoin": "round" }) +
        hand(32, 150, L, -6, 1.3) +
        P("M8 138 Q3 128 8 118 M15 128 Q12 120 17 113", { stroke: "#F2A93B", "stroke-width": 2.8, fill: "none", "stroke-linecap": "round" });
    }
    if (mood === "trade") {
      // phone to the ear
      return P("M148 240 C154 224 160 210 166 198 L194 204 C190 218 186 230 184 240 Z", { fill: sleeve, stroke: ss, "stroke-width": 2, "stroke-linejoin": "round" }) +
        P("M168 202 L171 160 L193 157 L192 206 Z", { fill: L.skin, stroke: sk, "stroke-width": 2, "stroke-linejoin": "round" }) +
        P("M166 199 L194 205", { stroke: ss, "stroke-width": 2.4 }) +
        G(R(-9, -19, 18, 38, 4.5, { fill: "#20242B", stroke: "#0E1013", "stroke-width": 1.6 }) + R(-6, -15, 12, 26, 2, { fill: "#3A6B8C" }),
          { transform: "translate(170 110) rotate(14)" }) +
        hand(182, 146, L, -12, 1.25);
    }
    if (mood === "sad") {
      // sweat drop on the temple
      return P("M154 74 C160 84 163 90 159 96 C155 102 148 100 148 93 C148 87 152 80 154 74 Z", { fill: "#8FD3F6", stroke: "#3C8DBC", "stroke-width": 1.6 }) +
        P("M151 86 Q150 91 152 94", { stroke: "#FFFFFF", "stroke-width": 1.6, fill: "none", "stroke-linecap": "round", opacity: 0.8 });
    }
    if (mood === "neutral" || mood === "focused") return prop(L);
    return "";
  }

  function faceDetails(L, mood) {
    const sk = shade(L.skin, -0.3);
    let out = "";
    // soft shading and a forehead highlight
    out += E(124, 120, 44, 48, { fill: shade(L.skin, -0.3), opacity: 0.12 });
    out += E(84, 58, 26, 13, { fill: "#FFFFFF", opacity: 0.13 });
    // smile lines
    out += P("M80 132 Q72 140 76 152 M120 132 Q128 140 124 152", { stroke: sk, "stroke-width": 1.8, fill: "none", "stroke-linecap": "round", opacity: L.age === "old" ? 0.7 : 0.35 });
    if (L.age === "old") {
      out += P("M80 62 Q100 56 120 62 M84 70 Q100 65 116 70", { stroke: sk, "stroke-width": 1.8, fill: "none", "stroke-linecap": "round", opacity: 0.6 });
      out += P("M58 100 l-6 -3 M58 105 l-7 0 M58 110 l-6 3 M142 100 l6 -3 M142 105 l7 0 M142 110 l6 3", { stroke: sk, "stroke-width": 1.6, "stroke-linecap": "round", opacity: 0.6 });
    }
    // cheeks
    let blush = 0.12;
    if (mood === "happy") blush = 0.32;
    if (L.rosy) blush += 0.2;
    const blushColor = L.sunburn ? "#E0553F" : "#E36B5F";
    if (L.sunburn) blush += 0.12;
    out += C(56, 134, 13, { fill: blushColor, opacity: Math.min(blush, 0.6) }) + C(144, 134, 13, { fill: blushColor, opacity: Math.min(blush, 0.6) });
    if (L.freckles) {
      for (const [x, y] of [[62, 124], [70, 129], [60, 131], [138, 124], [130, 129], [140, 131], [92, 114], [108, 114]]) out += C(x, y, 1.6, { fill: shade(L.skin, -0.42), opacity: 0.7 });
    }
    return out;
  }

  function facialHair(L) {
    const c = L.facial || L.hair;
    const s = shade(c, -0.3);
    const BEARD = "M36 108 C38 150 62 186 100 188 C138 186 162 150 164 108 C160 126 150 140 136 146 C126 140 114 136 100 136 C86 136 74 140 64 146 C50 140 40 126 36 108 Z";
    switch (L.beard) {
      case "full":
      case "braided": {
        let out = P(BEARD, { fill: c, stroke: s, "stroke-width": 2, "stroke-linejoin": "round" }) +
          P("M60 160 Q66 172 74 178 M140 160 Q134 172 126 178 M100 176 L100 186", { stroke: shade(c, 0.2), "stroke-width": 2, fill: "none", opacity: 0.6, "stroke-linecap": "round" });
        if (L.beard === "braided") {
          for (let y = 190; y <= 226; y += 9) out += E(100, y, 9, 6.5, { fill: c, stroke: s, "stroke-width": 1.6 });
          out += R(92, 220, 16, 6, 3, { fill: "#B9BEC6", stroke: "#7D838B", "stroke-width": 1 });
        }
        return out;
      }
      case "stubble":
        return P(BEARD, { fill: shade(L.skin, -0.4), opacity: 0.22 });
      default:
        return "";
    }
  }

  function mustache(L) {
    if (!L.mustache) return "";
    const c = L.facial || L.hair;
    return P("M70 142 C78 128 94 130 100 136 C106 130 122 128 130 142 C122 150 110 148 100 142 C90 148 78 150 70 142 Z", { fill: c, stroke: shade(c, -0.3), "stroke-width": 1.8, "stroke-linejoin": "round" });
  }

  function nose(L) {
    const fill = L.sunburn ? mix("#E8826F", L.skin, 0.65) : shade(L.skin, -0.14);
    let out = E(100, 126, 13, 11, { fill, stroke: shade(L.skin, -0.32), "stroke-width": 1.6 }) +
      E(94, 131, 2.6, 1.8, { fill: shade(L.skin, -0.5), opacity: 0.6 }) + E(106, 131, 2.6, 1.8, { fill: shade(L.skin, -0.5), opacity: 0.6 }) +
      E(95, 121, 4, 3, { fill: "#FFFFFF", opacity: 0.35 });
    if (L.sunscreen) out += P("M92 117 Q100 112 108 117 L108 123 Q100 119 92 123 Z", { fill: "#FFFFFF", opacity: 0.95 });
    return out;
  }

  function extras(L, mood) {
    if (mood === "happy") return sparkles([[176, 40, 6], [186, 62, 4], [20, 54, 4]], "#F5D76E");
    return "";
  }

  // ---------- the full drawing ----------

  function drawInner(look, mood, uid) {
    const L = Object.assign({}, DEFAULT_LOOK, look);
    if (!L.brow) L.brow = shade(L.facial || L.hair, -0.25);
    if (!L.outerColor) L.outerColor = L.shirt;
    if (!L.hatColor) L.hatColor = L.shirt;
    mood = MOODS.indexOf(mood) === -1 ? "neutral" : mood;
    const ex = EAR_X[L.face] || EAR_X.round;
    const skinS = shade(L.skin, -0.16);
    const skinD = shade(L.skin, -0.35);
    const h = hair(L, uid);

    let out = patterns(L, uid);
    out += hoodBack(L);
    out += h.back;
    out += hoodieBack(L);

    // neck and body
    out += P("M84 148 L84 192 Q100 200 116 192 L116 148 Z", { fill: skinS });
    out += E(100, 166, 20, 8, { fill: skinD, opacity: 0.3 });
    out += P(BODY, { fill: L.shirt, stroke: shade(L.shirt, -0.32), "stroke-width": 2, "stroke-linejoin": "round" });
    if (L.outer === "apron") {
      out += collar(L) + outerwear(L, uid);
    } else {
      out += outerwear(L, uid) + collar(L);
    }
    if (L.outer === "parka") {
      let fur = "";
      for (const [x, y] of quadPoints(62, 192, 100, 168, 138, 192, 9)) fur += C(x, y, 8, { fill: "#EFE6D2", stroke: "#BBAF95", "stroke-width": 1.2 });
      out += fur;
    }
    out += neckwear(L, uid) + pin(L) + snow(L);

    // ears (pencil tucks behind the right ear)
    out += pencil(L);
    for (const x of ex) {
      out += E(x, 106, 10, 14, { fill: L.skin, stroke: skinD, "stroke-width": 1.8 }) +
        P("M" + (x + (x < 100 ? 3 : -3)) + " 98 Q" + (x + (x < 100 ? -3 : 3)) + " 106 " + (x + (x < 100 ? 3 : -3)) + " 114", { stroke: skinD, "stroke-width": 1.6, fill: "none", opacity: 0.6 });
    }
    out += earGear(L, mood, ex);

    // head and face
    out += P(HEADS[L.face] || HEADS.round, { fill: L.skin, stroke: skinD, "stroke-width": 2.2 });
    // face shading stays inside the head outline
    out += '<clipPath id="' + uid + '-face"><path d="' + (HEADS[L.face] || HEADS.round) + '"/></clipPath>' +
      G(faceDetails(L, mood), { "clip-path": "url(#" + uid + "-face)" });
    out += facialHair(L);
    if (L.hairStyle === "shaved" || L.hairStyle === "bald") out += E(80, 46, 16, 8, { fill: "#FFFFFF", opacity: 0.25, transform: "rotate(-20 80 46)" });
    out += h.front;
    out += eyes(L, mood) + brows(L, mood) + nose(L) + mouth(L, mood) + mustache(L);
    out += eyewear(L, mood) + hat(L) + foreheadGear(L) + hoodFront(L) + earmuffs(L, mood) + headset(L, mood, ex);
    out += moodHands(L, mood) + extras(L, mood);
    return out;
  }

  function svgFor(look, mood, uid) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '">' + drawInner(look, mood, uid || "gm") + "</svg>";
  }

  // ---------- the 32 GMs ----------

  const DEFAULT_LOOK = {
    skin: "#D9A27C", hair: "#2B1B14", hairStyle: "short", face: "round", age: "mid",
    shirt: "#3A4656", trim: "#E8ECF1", outer: "none", neck: "none", pin: "none",
    hat: "none", eyewear: "none", forehead: "none", earrings: "none", beard: "none",
    mustache: false, prop: "none", lashes: false
  };

  const TEAMS = {
    "Arizona Cardinals": { short: "Cardinals", catchphrase: "It's a dry heat. Stay cool.", persona: "Calm desert veteran. Nothing rattles him.",
      skin: "#B9784F", hair: "#D5D5D5", facial: "#E2E2E2", brow: "#B8B8B8", hairStyle: "short", face: "square", age: "old", mustache: true, sunscreen: true,
      shirt: "#97233F", trim: "#1A1A1A", hat: "sunhat", hatColor: "#C8A36B" },
    "Atlanta Falcons": { short: "Falcons", catchphrase: "Hold on, I've got another call.", persona: "Music-producer cool. Always on the phone.",
      skin: "#6B4430", hair: "#15100E", hairStyle: "braids", face: "heart", lashes: true, earrings: "hoops", prop: "phone",
      shirt: "#A71930", trim: "#101820" },
    "Baltimore Ravens": { short: "Ravens", catchphrase: "Tough picks for tough people.", persona: "Gruff but lovable. Crab mallet in his pocket.",
      skin: "#E2B08C", hair: "#2A1E17", facial: "#2A1E17", hairStyle: "shaved", face: "square", beard: "full", prop: "mallet",
      shirt: "#241773", trim: "#9E7C0C" },
    "Buffalo Bills": { short: "Bills", catchphrase: "This is our year. Again.", persona: "Unshakeable optimist. Snow doesn't scare her.",
      skin: "#F2C9AE", hair: "#6A4128", hairStyle: "wavylong", face: "round", lashes: true, rosy: true, snow: true,
      shirt: "#00338D", trim: "#C60C30", outer: "vest", outerColor: "#C60C30" },
    "Carolina Panthers": { short: "Panthers", catchphrase: "No rush. Pour another glass.", persona: "Easygoing. Sweet tea in hand.",
      skin: "#7B4A2D", hair: "#1A1210", hairStyle: "twists", face: "long", prop: "tea",
      shirt: "#0085CA", trim: "#101820" },
    "Chicago Bears": { short: "Bears", catchphrase: "Wind's blowing. Pick fast.", persona: "No-nonsense. Deep-dish in one hand.",
      skin: "#E9C2A6", hair: "#BDBDBD", hairStyle: "pixie", face: "heart", lashes: true, age: "old", prop: "pizza",
      neck: "scarf", scarfColor: "#C83803", scarfBlow: true, shirt: "#0B162A", trim: "#C83803" },
    "Cincinnati Bengals": { short: "Bengals", catchphrase: "Ooh! Ooh! Is it our turn?", persona: "Jittery energy. Napkin always tucked in.",
      skin: "#F4CDB5", hair: "#B5471B", hairStyle: "curly", face: "round", freckles: true, neck: "napkin",
      shirt: "#FB4F14", trim: "#101820" },
    "Cleveland Browns": { short: "Browns", catchphrase: "Next year starts now.", persona: "Hopeful and stubborn. Glasses on a chain.",
      skin: "#D9A47F", hair: "#9E9E9E", hairStyle: "curly", face: "round", age: "old", lashes: true, eyewear: "chainglasses", frameColor: "#7A3E1D", chainColor: "#FF3C00",
      hat: "beanie", hatColor: "#FF3C00", shirt: "#311D00", trim: "#FF3C00" },
    "Dallas Cowboys": { short: "Cowboys", catchphrase: "Everything's bigger on draft day.", persona: "Larger than life. Rhinestones included.",
      skin: "#F1C9AC", hair: "#C9963F", hairStyle: "bigcurls", face: "heart", lashes: true,
      shirt: "#041E42", trim: "#869397", outer: "blazer", outerColor: "#B9C0C8", sparkle: "#FFFFFF" },
    "Denver Broncos": { short: "Broncos", catchphrase: "Send it!", persona: "Outdoorsy. Goggles on, always.",
      skin: "#E9BE9C", hair: "#5A3A22", hairStyle: "short", face: "long", beard: "stubble", hat: "beanie", hatColor: "#002244", pomColor: "#FB4F14", forehead: "goggles",
      shirt: "#FB4F14", trim: "#002244" },
    "Detroit Lions": { short: "Lions", catchphrase: "We build it. We don't buy it.", persona: "Gritty builder. Wrench pin on her jacket.",
      skin: "#5C3A24", hair: "#141010", hairStyle: "afro", face: "heart", lashes: true, pin: "wrench",
      shirt: "#0076B6", trim: "#B0B7BC", outer: "workjacket", outerColor: "#B58A57" },
    "Green Bay Packers": { short: "Packers", catchphrase: "Well, hey there, neighbor.", persona: "Small-town friendly. Knows every scout by name.",
      skin: "#EAC1A0", hair: "#B9B9B9", hairStyle: "short", face: "wide", age: "old",
      hat: "earflap", hatColor: "#FFB612", shirt: "#203731", trim: "#FFB612", outer: "parka", outerColor: "#2F3A33" },
    "Houston Texans": { short: "Texans", catchphrase: "Running the numbers. Liftoff in 3…", persona: "Engineer focus. Rocket patch on his chest.",
      skin: "#C88E66", hair: "#2B1B14", hairStyle: "sidepart", face: "long", eyewear: "glasses", pin: "rocket",
      shirt: "#03202F", trim: "#A71930" },
    "Indianapolis Colts": { short: "Colts", catchphrase: "Pedal down. Pick's in.", persona: "Quick decision-maker. Racing-flag scarf.",
      skin: "#F0C6A8", hair: "#3B2414", hairStyle: "ponytail", face: "heart", lashes: true, neck: "scarf", scarfPattern: "checker",
      shirt: "#002C5F", trim: "#FFFFFF" },
    "Jacksonville Jaguars": { short: "Jaguars", catchphrase: "Patience. The big one's coming.", persona: "Relaxed angler. Lures on his hat.",
      skin: "#EDB596", hair: "#A9A9A9", facial: "#BDBDBD", hairStyle: "short", face: "square", age: "old", beard: "stubble", sunburn: true,
      hat: "bucket", hatColor: "#9C8F6E", shirt: "#006778", trim: "#D7A22A" },
    "Kansas City Chiefs": { short: "Chiefs", catchphrase: "Low and slow wins the draft.", persona: "Proud pitmaster. Apron always on.",
      skin: "#C68A62", hair: "#6E6E6E", facial: "#7A7A7A", hairStyle: "short", face: "wide", beard: "full", eyewear: "glasses",
      shirt: "#E31837", trim: "#FFB81C", outer: "apron", outerColor: "#3E2C23" },
    "Las Vegas Raiders": { short: "Raiders", catchphrase: "Read my face. You can't.", persona: "Poker face. Sequins on.",
      skin: "#E8B896", hair: "#111111", hairStyle: "bob", face: "heart", lashes: true, eyewear: "shades",
      shirt: "#000000", trim: "#A5ACAF", outer: "blazer", outerColor: "#1E1E22", sparkle: "#C9CED4" },
    "Los Angeles Chargers": { short: "Chargers", catchphrase: "Chill. The wave always comes.", persona: "Laid-back beach energy. Never sweats a pick.",
      skin: "#F1C4A1", hair: "#D9A441", hairStyle: "waves", face: "long", eyewear: "sunglasses",
      shirt: "#0080C6", trim: "#FFC20E" },
    "Los Angeles Rams": { short: "Rams", catchphrase: "And… action!", persona: "Dramatic flair. Star shades on top.",
      skin: "#C99572", hair: "#2A1A12", hairStyle: "long", face: "heart", lashes: true, forehead: "starshades", pin: "clapper",
      shirt: "#003594", trim: "#FFA300" },
    "Miami Dolphins": { short: "Dolphins", catchphrase: "Make it flashy.", persona: "Nightlife flair. Loves a flashy pick.",
      skin: "#8A5A3B", hair: "#1C1C1C", hairStyle: "curly", face: "long", beard: "stubble", neck: "chain",
      shirt: "#008E97", trim: "#FC4C02", outer: "linen", outerColor: "#EFE5CC" },
    "Minnesota Vikings": { short: "Vikings", catchphrase: "Cold hands, warm picks.", persona: "Big and cheerful. Braided beard, earmuffs.",
      skin: "#F2C6A6", hair: "#D9B45A", facial: "#D9B45A", hairStyle: "messy", face: "wide", beard: "braided", earmuffs: "#FFC62F",
      shirt: "#4F2683", trim: "#FFC62F", outer: "flannel", outerColor: "#8A2E2E" },
    "New England Patriots": { short: "Patriots", catchphrase: "Three moves ahead.", persona: "Chess-master calm. Small knowing smile.",
      skin: "#EFC7AA", hair: "#D2D2D2", hairStyle: "pixie", face: "long", lashes: true, age: "old",
      shirt: "#002244", trim: "#C60C30", outer: "blazer", outerColor: "#1C2230" },
    "New Orleans Saints": { short: "Saints", catchphrase: "Cue the band!", persona: "Pure joy. Brings a brass band to every draft.",
      skin: "#5E3A26", hair: "#8C8C8C", facial: "#8C8C8C", hairStyle: "bald", face: "round", age: "old", neck: "beads", pin: "trumpet",
      shirt: "#101820", trim: "#D3BC8D" },
    "New York Giants": { short: "Giants", catchphrase: "I was scouting before you were born.", persona: "Gruff old-school scout. Pencil behind his ear.",
      skin: "#E2B391", hair: "#A0A0A0", facial: "#A8A8A8", hairStyle: "short", face: "square", age: "old", beard: "stubble", pencil: true,
      hat: "newsboy", hatColor: "#5B5149", shirt: "#0B2265", trim: "#A71930" },
    "New York Jets": { short: "Jets", catchphrase: "Talk fast. I've got three picks.", persona: "Fast-talking hustler. Headset on, phone buzzing.",
      skin: "#A86F4C", hair: "#2B1B14", hairStyle: "bun", face: "heart", lashes: true, neck: "scarf", scarfPattern: "subway", prop: "phone",
      shirt: "#125740", trim: "#FFFFFF" },
    "Philadelphia Eagles": { short: "Eagles", catchphrase: "Somebody pass the cheesesteak!", persona: "Loud and passionate. Big laugh.",
      skin: "#EBC0A0", hair: "#4A2E1E", hairStyle: "messycurls", face: "wide", beard: "stubble", prop: "sandwich",
      shirt: "#004C54", trim: "#A5ACAF" },
    "Pittsburgh Steelers": { short: "Steelers", catchphrase: "Built tough. Drafted tougher.", persona: "Steady and tough. Hard hat on.",
      skin: "#B07850", hair: "#3A2A20", hairStyle: "curly", face: "round", lashes: true, hat: "hardhat", hatColor: "#FFB612",
      shirt: "#101820", trim: "#FFB612" },
    "San Francisco 49ers": { short: "49ers", catchphrase: "The model says…", persona: "Data-obsessed. Laptop covered in stickers.",
      skin: "#E6B48F", hair: "#4B3424", hairStyle: "messy", face: "long", prop: "laptop",
      shirt: "#AA0000", trim: "#B3995D", outer: "hoodie", outerColor: "#3C4350" },
    "Seattle Seahawks": { short: "Seahawks", catchphrase: "Another coffee, then we pick.", persona: "Calm and caffeinated, rain or shine.",
      skin: "#F3CFB3", hair: "#7A3B22", hairStyle: "long", face: "heart", lashes: true, freckles: true, prop: "coffee",
      hat: "hood", hatColor: "#69BE28", shirt: "#002244", trim: "#69BE28", outer: "raincoat", outerColor: "#69BE28" },
    "Tampa Bay Buccaneers": { short: "Bucs", catchphrase: "Steady as she goes.", persona: "Cheerful boat captain. A little sunburned.",
      skin: "#E7A988", hair: "#D0D0D0", facial: "#F2F2F2", hairStyle: "bald", face: "wide", age: "old", mustache: true, sunburn: true,
      hat: "captain", shirt: "#D50A0A", trim: "#34302B" },
    "Tennessee Titans": { short: "Titans", catchphrase: "This pick's a hit single.", persona: "Country-singer charm. Guitar-pick earrings.",
      skin: "#F2CBB0", hair: "#C9963F", hairStyle: "wavylong", face: "heart", lashes: true, earrings: "picks",
      hat: "cowboy", hatColor: "#8B5A2B", shirt: "#0C2340", trim: "#4B92DB" },
    "Washington Commanders": { short: "Commanders", catchphrase: "Let's make a deal.", persona: "Smooth-talking dealmaker. Always in a suit.",
      skin: "#7A4E35", hair: "#1B1B1B", hairStyle: "short", face: "long", eyewear: "glasses",
      shirt: "#5A1414", trim: "#FFB612", outer: "suit", outerColor: "#2B2B33" }
  };

  const FALLBACK = { short: "GM", catchphrase: "Let's get to work.", persona: "", shirt: "#3A4656", trim: "#E8ECF1" };
  const TEAM_NAMES = Object.keys(TEAMS).sort();

  function lookFor(teamName) {
    return TEAMS[teamName] || FALLBACK;
  }

  function slug(teamName) {
    return String(teamName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  // ---------- what people say ----------

  const QUIPS = {
    clock: ["Phones are ringing. Who's our guy?", "Clock's ticking. Don't overthink it.", "I've got a feeling about this one.", "Board looks good from here.", "Let's make some noise."],
    steal: ["Can't believe he fell to us!", "Highway robbery.", "Somebody check on the other 31 teams.", "That's a steal and we all know it."],
    value: ["Great value right there.", "Love it. Love it.", "Exactly the guy we wanted."],
    fair: ["Solid pick. Next!", "Good player, good fit.", "That works."],
    reach: ["Trust me on this one.", "The tape doesn't lie… right?", "I'll explain later.", "Bold. Very bold."],
    trade: ["Make me an offer.", "What's it gonna take?", "Talk to me.", "I'm listening…"],
    tradeDone: ["Pleasure doing business.", "We fleeced 'em.", "Deal's done!"],
    gradeHigh: ["Somebody get me a raise.", "Best draft in team history. Probably.", "Frame this one."],
    gradeMid: ["Solid work. Not flashy, but solid.", "We got better today.", "I'll take it."],
    gradeLow: ["We'll fix it in free agency.", "Don't read the grades. Never read the grades.", "Rebuilding is a process."]
  };

  function quip(kind) {
    const list = QUIPS[kind] || QUIPS.fair;
    return list[Math.floor(Math.random() * list.length)];
  }

  // ---------- website helpers ----------

  const cache = {};

  function svg(teamName, mood) {
    return svgFor(lookFor(teamName), mood, "gm-" + slug(teamName) + "-" + (mood || "neutral"));
  }

  function url(teamName, mood) {
    const key = teamName + "|" + mood;
    if (!cache[key]) {
      cache[key] = URL.createObjectURL(new Blob([svg(teamName, mood)], { type: "image/svg+xml" }));
    }
    return cache[key];
  }

  // ---------- photo GMs ----------

  const PHOTO_V = "1";                      // bump when the photos change (sw.js uses the same number)
  const SMALL = { w: 180, h: 216, gap: 4, cols: 8, rows: 4 };
  const BIG = { w: 320, h: 384, gap: 6 };
  const BIG_FROM = 72;                      // GMs wider than this use the big photos
  const state = {};                         // photo url -> "loading" | "ok" | "error"
  const pictures = {};                      // photo url -> loaded Image, for the share card

  function moodOf(mood) { return MOODS.indexOf(mood) === -1 ? "neutral" : mood; }
  function smallUrl(mood) { return "gm/small-" + moodOf(mood) + ".webp?v=" + PHOTO_V; }
  function bigUrl(teamName) { return "gm/" + slug(teamName) + ".webp?v=" + PHOTO_V; }
  function hasPhoto(teamName) { return TEAM_NAMES.indexOf(teamName) !== -1; }

  // load a photo once; if it fails, every GM using it switches to the next best picture
  function ensure(src) {
    if (state[src] || typeof Image === "undefined") return;
    state[src] = "loading";
    const im = new Image();
    im.onload = () => { state[src] = "ok"; pictures[src] = im; };
    im.onerror = () => { state[src] = "error"; refresh(); };
    im.src = src;
  }

  // where this GM's picture is: which file, and how to show one cell of it
  function source(teamName, mood, big) {
    mood = moodOf(mood);
    if (hasPhoto(teamName)) {
      if (big && state[bigUrl(teamName)] !== "error") {
        const span = BIG.w * 5 + BIG.gap * 4;
        return { src: bigUrl(teamName), size: (span / BIG.w * 100) + "% 100%", pos: (MOODS.indexOf(mood) * 25) + "% 0%",
                 sx: MOODS.indexOf(mood) * (BIG.w + BIG.gap), sy: 0, sw: BIG.w, sh: BIG.h };
      }
      if (state[smallUrl(mood)] !== "error") {
        const i = TEAM_NAMES.indexOf(teamName);
        const col = i % SMALL.cols, row = Math.floor(i / SMALL.cols);
        const sw = SMALL.w * SMALL.cols + SMALL.gap * (SMALL.cols - 1);
        const sh = SMALL.h * SMALL.rows + SMALL.gap * (SMALL.rows - 1);
        return { src: smallUrl(mood), size: (sw / SMALL.w * 100) + "% " + (sh / SMALL.h * 100) + "%",
                 pos: (col / (SMALL.cols - 1) * 100) + "% " + (row / (SMALL.rows - 1) * 100) + "%",
                 sx: col * (SMALL.w + SMALL.gap), sy: row * (SMALL.h + SMALL.gap), sw: SMALL.w, sh: SMALL.h };
      }
    }
    return { src: url(teamName, mood), size: "100% 100%", pos: "0% 0%", sx: 0, sy: 0, sw: W, sh: H, drawn: true };
  }

  function paint(el) {
    const s = source(el.dataset.team, el.dataset.mood, el.dataset.big === "1");
    if (!s.drawn) ensure(s.src);
    el.style.backgroundImage = 'url("' + s.src + '")';
    el.style.backgroundSize = s.size;
    el.style.backgroundPosition = s.pos;
  }

  // after a photo fails to load, repaint the GMs that used it
  function refresh() {
    if (typeof document === "undefined") return;
    for (const el of document.querySelectorAll(".gm[data-team]")) paint(el);
  }

  function esc(text) {
    return String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  // A GM for the website. alt is empty by default, since the team name is shown next to it.
  function img(teamName, mood, size, className, alt) {
    const w = Math.round(size);
    const big = w > BIG_FROM;
    const s = source(teamName, mood, big);
    if (!s.drawn) ensure(s.src);
    const label = alt ? ' role="img" aria-label="' + esc(alt) + '"' : ' aria-hidden="true"';
    return '<span class="gm ' + (className || "") + '" data-team="' + esc(teamName) + '" data-mood="' + moodOf(mood) + '"' +
      (big ? ' data-big="1"' : "") + label + ' style="--w:' + w + "px;--gm-tint:" + tint(teamName) +
      ";background-image:url(&quot;" + s.src + "&quot;);background-size:" + s.size + ";background-position:" + s.pos + '"></span>';
  }

  // change the mood of a GM already on the page
  function setMood(el, mood) {
    if (!el || !el.dataset) return;
    el.dataset.mood = moodOf(mood);
    paint(el);
  }

  // load a team's photos ahead of time, so mood changes don't flash
  function preload(teamName) {
    if (hasPhoto(teamName)) ensure(bigUrl(teamName));
    for (const m of MOODS) ensure(smallUrl(m));
  }

  // for <canvas>: { image, sx, sy, sw, sh } (best photo that loads, or the drawn GM)
  function picture(teamName, mood) {
    const tries = [source(teamName, mood, true), source(teamName, mood, false)];
    const load = (src) => new Promise((resolve) => {
      if (pictures[src]) return resolve(pictures[src]);
      const im = new Image();
      im.onload = () => { pictures[src] = im; resolve(im); };
      im.onerror = () => { state[src] = "error"; resolve(null); };
      im.src = src;
    });
    return (async () => {
      for (const s of tries) {
        const im = await load(s.src);
        if (im) return { image: im, sx: s.sx, sy: s.sy, sw: s.sw, sh: s.sh };
      }
      const im = await load(url(teamName, mood));
      return im ? { image: im, sx: 0, sy: 0, sw: W, sh: H } : null;
    })();
  }

  // team color blended into the page background, for avatar tiles
  function tint(teamName, amount, bg) {
    return mix(lookFor(teamName).shirt || "#3A4656", bg || "#1A212B", amount == null ? 0.55 : amount);
  }

  const api = {
    MOODS, TEAMS, TEAM_NAMES, W, H, PHOTO_V,
    svg, svgFor, drawInner, url, img, setMood, preload, picture, tint, quip, QUIPS, slug,
    short: (name) => lookFor(name).short || name,
    catchphrase: (name) => lookFor(name).catchphrase || "",
    persona: (name) => lookFor(name).persona || ""
  };

  root.GM = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
