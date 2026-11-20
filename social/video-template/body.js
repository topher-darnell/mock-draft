const BEAT = 60 / 140;
const HOOK = 8, PER = 4, N = 6, END = HOOK + PER * N;
const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const back = x => { x = Math.min(1, Math.max(0, x)); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const c01 = x => Math.min(1, Math.max(0, x));
const RED = '<div class="siren"><span><i></i>BREAKING · COLTS</span></div>';
const APP = '<div class="siren"><span style="background:rgba(242,169,59,.12);border-color:rgba(242,169,59,.5);color:#F2A93B"><i style="background:#F2A93B;box-shadow:0 0 18px #F2A93B"></i>BIG HEAD GM · FREE APP</span></div>';
// stamp pops in on the card's 2nd beat
const pop = (cb) => 'transform:scale(' + (cb < 1 ? 0 : back((cb - 1) / 0.35)) + ');transform-origin:left center';
const CARDS = [
  { title: 'the season so far', html: cb => `<div class="card" style="text-align:center">
      <div style="font-size:300px;font-weight:900;letter-spacing:-0.06em;line-height:.9;color:#FF453A">13</div>
      <div style="font-size:64px;font-weight:900;letter-spacing:-0.03em;margin-top:6px">interceptions</div>
      <div class="stamp out" style="${pop(cb)};transform-origin:center">MOST IN THE NFL</div>
      <div class="impact" style="text-align:left"><small>DANIEL JONES · 2026</small><p>1,974 yds · 7 TD · <em>65.4</em> passer rating</p></div></div>` },
  { title: 'thursday night', html: cb => `<div class="sc"><span class="final">FINAL · THURSDAY</span>
      <div class="row"><i class="tm" style="background:#7d8aa8"></i><div class="tn">Texans<small>HOME</small></div><div class="pts">26</div></div>
      <div class="row lose"><i class="tm" style="background:#7d8aa8"></i><div class="tn">Colts<small>3-8</small></div><div class="pts">3</div></div>
      <div class="note" style="opacity:${c01((cb - 1) * 3)}">Jones: <em>12 of 27, 144 yds, 0 TD, 1 INT.</em> Released the next morning.</div></div>` },
  { title: 'the new QB1', html: cb => `<div class="card"><span class="pos QB">QB</span><span class="team">INDIANAPOLIS</span>
      <div class="name">Anthony<br>Richardson Sr.</div>
      <div class="stamp ok" style="${pop(cb)}">STARTS NOW</div>
      <div class="impact"><small>FANTASY</small><p>Superflex managers: <em>he's worth a look</em> on waivers.</p></div></div>` },
  { title: 'it gets worse', html: cb => `<div class="card"><div class="inj" style="margin:0 0 10px;color:rgba(255,255,255,.5);font-size:30px">THE COLTS' 1ST-ROUND PICK?</div>
      <div class="name" style="font-size:96px">the <span style="color:#FF6B5E">Jets</span> own it.</div>
      <div class="stamp out" style="${pop(cb)}">PICK #6</div>
      <div class="impact"><small>OUR 2027 MOCK · 1,000 SIMS</small>
        <div class="list"><div class="li"><span class="pos IDL" style="margin:0">IDL</span>Will Echoles<i>46% at #6</i></div>
        <div class="li"><span class="pos QB" style="margin:0">QB</span>CJ Carr<i>15%</i></div></div>
        <p style="margin-top:18px;font-size:32px;color:rgba(255,255,255,.7)">Colts' first pick: <em>#40</em></p></div></div>` },
  { title: 'jones on your fantasy team?', img: 'app-news.png', crop: [166], ring: [28, 663, 664, 242] },
  { title: 'my team: your best lineup', img: 'app-team.png' },
];
window.setT = function (t) {
  const b = t / BEAT;
  let h = '';
  if (b < HOOK) {
    h += RED;
    const words = ["THE COLTS", "CUT", "DANIEL", "JONES."];
    const slide = b > HOOK - 0.4 ? -ease((b - HOOK + 0.4) / 0.4) * 1100 : 0;
    h += '<div class="hook" style="top:640px;transform:translateX(' + slide + 'px)">';
    words.forEach((w, i) => {
      const k = b - 0.5 - i * 0.7;
      const inner = i >= 2 ? '<em>' + w + '</em>' : w;
      h += '<b style="font-size:' + (i === 1 ? 210 : 150) + 'px;opacity:' + (k > 0 ? 1 : 0) + ';transform:scale(' + (k > 0 ? 1.6 - 0.6 * ease(k / 0.3) : 1) + ')">' + inner + '</b>';
    });
    h += '<span style="opacity:' + c01((b - 3.6) * 3) + '">released friday morning 📉</span></div>';
  } else if (b < END) {
    const i = Math.floor((b - HOOK) / PER), cb = b - HOOK - i * PER, C = CARDS[i];
    const inT = back(cb / 0.55), out = cb > PER - 0.3 ? ease((cb - (PER - 0.3)) / 0.3) : 0;
    const x = (1 - inT) * 1000 - out * 1200, rot = (1 - inT) * 8 - out * 6;
    const pump = 1 + 0.02 * Math.exp(-((cb % 1)) * 6);
    h += C.img ? APP : RED;
    h += '<div class="ttl" style="top:' + (C.img ? 450 : 560) + 'px;opacity:' + c01(cb * 4) + '">' + C.title + '</div>';
    if (C.img) {
      // the app screen in a rounded window; C.crop = [shift up px at 760 wide, ring box]
      const W = 720, H = 1060, sh = C.crop ? C.crop[0] : 0;
      h += '<div style="position:absolute;left:50%;top:570px;width:' + W + 'px;height:' + H + 'px;margin-left:-' + (W / 2) + 'px;border-radius:48px;overflow:hidden;box-shadow:0 40px 120px rgba(0,0,0,.6),0 0 0 2px rgba(255,255,255,.12);transform:translateX(' + x + 'px) rotate(' + rot + 'deg) scale(' + pump + ')">' +
           '<img src="' + C.img + '" style="position:absolute;left:0;top:' + (-sh) + 'px;width:' + W + 'px">' +
           (C.ring ? '<div style="position:absolute;left:' + C.ring[0] + 'px;top:' + (C.ring[1] - sh) + 'px;width:' + C.ring[2] + 'px;height:' + C.ring[3] + 'px;border-radius:26px;border:5px solid #F2A93B;box-shadow:0 0 40px rgba(242,169,59,.7);opacity:' + c01((cb - 1) * 3) + '"></div>' : '') +
           '</div>';
    } else {
      h += '<div style="transform:translateY(260px) translateX(' + x + 'px) rotate(' + rot + 'deg) scale(' + pump + ')">' + C.html(cb) + '</div>';
    }
    h += '<div style="position:absolute;left:50%;top:1860px;transform:translateX(-50%);display:flex;gap:12px">' + CARDS.map((_, j) => '<i style="display:block;width:' + (j === i ? 44 : 14) + 'px;height:14px;border-radius:7px;background:' + (j === i ? '#F2A93B' : 'rgba(255,255,255,.3)') + '"></i>').join('') + '</div>';
  } else {
    const k = b - END;
    h = '<img class="logo" src="logo.png" style="top:600px;transform:scale(' + back(k / 1.0) + ')">' +
        '<div class="endcap" style="top:960px;opacity:' + c01((k - 0.6) * 3) + '">your players.<br>your lineup.<br><em>every week.</em></div>' +
        '<div class="cta" style="top:1290px;transform:scale(' + (back((k - 2) / 0.8) * (1 + 0.04 * Math.exp(-((k - 2) % 1) * 5))) + ')">free on the App Store</div>' +
        '<div class="sub" style="top:1422px;opacity:' + c01((k - 3) * 3) + '">search "big head gm" · or bigheadgm.com</div>';
  }
  document.getElementById("layer").innerHTML = h;
};
window.TOTAL = (END + 9) * BEAT + 0.6;
setT(0);
