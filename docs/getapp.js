// Big Head GM: "get the app" (the site installs like an app: home-screen icon, full screen, works offline).
// - Android / Chrome / Edge: catches the browser's install offer so our own buttons can open it.
// - iPhone / iPad: shows the 3 Safari steps (Share > Add to Home Screen), since Apple has no install button.
// - Phones that haven't installed yet get a small banner above the tab bar; tap X and it stays away for 2 weeks.
(function () {
  const ROOT = (document.currentScript && document.currentScript.src || "").replace(/getapp\.js.*$/, "");
  const KEY = "bhg-app-banner2";   // new key at App Store launch, so everyone sees the banner once more
  const STORE = "https://apps.apple.com/app/big-head-gm/id6835944276";
  const cap = window.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());   // inside the App Store app
  const standalone = native || window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isPhone = window.matchMedia("(max-width: 899px)").matches;
  let offer = null;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function count(path) { try { window.goatcounter && window.goatcounter.count && window.goatcounter.count({ path, title: path, event: true }); } catch (e) {} }

  // the service worker makes it installable (and offline) from any page, not just the home page
  if ("serviceWorker" in navigator && !native) {
    window.addEventListener("load", () => navigator.serviceWorker.register(ROOT + "sw.js").catch(() => {}));
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    offer = e;
    document.documentElement.classList.add("can-install");
  });
  window.addEventListener("appinstalled", () => {
    store(KEY, "installed");
    document.documentElement.classList.add("app-installed");
    hideBanner();
    count("app-installed");
  });

  // one function for every "install" button on the site
  window.bhgInstall = function () {
    count("app-install-tap");
    if (offer) {
      offer.prompt();
      offer.userChoice.finally(() => { offer = null; document.documentElement.classList.remove("can-install"); });
      return true;
    }
    if (!/app\.html/.test(location.pathname)) { location.href = ROOT + "app.html"; return false; }
    const how = document.getElementById(isIOS ? "app-ios" : "app-android");
    if (how) { how.scrollIntoView({ behavior: "smooth", block: "start" }); how.classList.add("app-flash"); setTimeout(() => how.classList.remove("app-flash"), 1600); }
    return false;
  };

  function hideBanner() {
    const b = document.getElementById("app-banner");
    if (b) b.remove();
    document.documentElement.classList.remove("has-app-banner");
  }

  function showBanner() {
    if (standalone || !isPhone || /app\.html/.test(location.pathname)) return;
    const seen = store(KEY);
    if (seen === "installed") return;
    if (seen && Date.now() - Number(seen) < 14 * 864e5) return;
    const b = document.createElement("div");
    b.id = "app-banner";
    b.className = "app-banner";
    b.innerHTML = `<img src="${ROOT}icons/icon-192.png?v=4" alt="" width="40" height="40">
      <span>${isIOS ? "<b>Big Head GM is on the App Store</b><small>Free · fantasy football + mock draft</small>" : "<b>Get the Big Head GM app</b><small>Free · add it to your home screen</small>"}</span>
      <button type="button" class="app-banner-go">${isIOS ? "Get" : "Add"}</button>
      <button type="button" class="app-banner-x" aria-label="Not now">✕</button>`;
    b.querySelector(".app-banner-go").addEventListener("click", () => {
      if (isIOS) { count("app-store-tap"); location.href = STORE; } else window.bhgInstall();
    });
    b.querySelector(".app-banner-x").addEventListener("click", () => { store(KEY, String(Date.now())); hideBanner(); count("app-banner-dismiss"); });
    document.body.appendChild(b);
    document.documentElement.classList.add("has-app-banner");
  }

  function setUpAppPage() {
    const page = document.getElementById("app-page");
    if (!page) return;
    page.classList.add(standalone ? "is-installed" : isIOS ? "is-ios" : "is-android");
    for (const btn of page.querySelectorAll("[data-install]")) btn.addEventListener("click", () => window.bhgInstall());
  }

  if (standalone) { store(KEY, "installed"); document.documentElement.classList.add("app-installed"); }
  if (native) setUpNative();

  // ---------- the iPhone app (Capacitor): native share, haptics, daily game reminders ----------
  function setUpNative() {
    const P = cap.Plugins || {};
    document.documentElement.classList.add("is-native-app");
    if (/app\.html/.test(location.pathname)) { location.replace(ROOT); return; }   // the "install it" page means nothing inside the app

    // share sheet: the app's own, for text and links (photos still go through the browser's share)
    const webShare = navigator.share && navigator.share.bind(navigator);
    if (P.Share) {
      navigator.share = (d) => (d && d.files && d.files.length && webShare) ? webShare(d)
        : P.Share.share({ title: d && d.title, text: d && d.text, url: d && d.url, dialogTitle: "Share" });
    }

    // a light tap feel on buttons
    if (P.Haptics) {
      document.addEventListener("click", (e) => {
        if (e.target.closest("button, .fx-go, .pg-button, .hero-start, .gd-tabs a")) { try { P.Haptics.impact({ style: "LIGHT" }); } catch (er) {} }
      }, true);
    }

    setUpPush(P.FirebaseMessaging);

    // daily reminder for the new Fantasle + Prospectle (scheduled on the phone, no server)
    const LN = P.LocalNotifications, RKEY = "bhg-remind";
    if (!LN) return;
    LN.addListener && LN.addListener("localNotificationActionPerformed", (a) => {
      const to = a && a.notification && a.notification.extra && a.notification.extra.url;
      location.href = ROOT + (to || "games/fantasle.html");
    });
    setUpTeamAlerts(LN);
    async function setRemind(on) {
      try {
        if (on) {
          let perm = await LN.checkPermissions();
          if (perm.display !== "granted") perm = await LN.requestPermissions();
          if (perm.display !== "granted") { store(RKEY, "off"); return false; }
          await LN.cancel({ notifications: [{ id: 1 }] }).catch(() => {});
          await LN.schedule({ notifications: [{ id: 1, title: "New Fantasle + Prospectle 🟩",
            body: "Today's puzzles are up. Keep your streak alive.", schedule: { on: { hour: 10, minute: 0 }, allowWhileIdle: true } }] });
          store(RKEY, "on"); count("app-remind-on"); return true;
        }
        await LN.cancel({ notifications: [{ id: 1 }] });
        store(RKEY, "off"); count("app-remind-off"); return false;
      } catch (e) { return false; }
    }
    function remindCard() {
      if (!/games\/(index\.html)?$/.test(location.pathname) || document.getElementById("app-remind")) return;
      const main = document.querySelector("main") || document.body;
      const on = store(RKEY) === "on";
      const c = document.createElement("label");
      c.id = "app-remind"; c.className = "app-remind";
      c.innerHTML = `<span><b>Daily reminder</b><small>A nudge at 10 AM when the new Fantasle and Prospectle drop</small></span>
        <input type="checkbox" role="switch"${on ? " checked" : ""} aria-label="Daily reminder"><i aria-hidden="true"></i>`;
      const box = c.querySelector("input");
      box.addEventListener("change", async () => { box.checked = await setRemind(box.checked); });
      const first = main.querySelector("h1");
      (first && first.parentNode === main ? first : main.firstElementChild || main).insertAdjacentElement("afterend", c);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", remindCard); else remindCard();
  }
  // ---------- My Team game-day alerts (scheduled on the phone, no server) ----------
  // Sunday 11 AM ET: check your lineup before the 1 PM games. Tuesday 7 PM ET: new waiver pickups.
  // gameday.js calls BHGApp.teamBrief() with this week's lineup so Sunday's alert can name hurt starters.
  function setUpTeamAlerts(LN) {
    const AKEY = "bhg-team-alerts", LAST_SUNDAY = "2026-12-27";      // Week 17, the end of most fantasy seasons
    const SUN = [11, 12, 13, 14], TUE = [21, 22, 23, 24];
    const et = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23", weekday: "short" });
    const parts = (d) => Object.fromEntries(et.formatToParts(d).map((x) => [x.type, x.value]));
    // the next few times it's <weekday> at h:00 in New York, as real dates
    function next(weekday, h, n) {
      const now = new Date(), p = parts(now), out = [];
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      let ahead = (weekday - days.indexOf(p.weekday) + 7) % 7;
      for (let i = 0; out.length < n && i < 8; i++, ahead += 7) {
        let d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + ahead, h + 5, 0));
        if (+parts(d).hour !== h) d = new Date(d.getTime() - 3600e3);   // daylight time: 4 hours behind UTC
        if (d > now) out.push(d);
      }
      return out;
    }
    const iso = (d) => { const p = parts(d); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };
    let brief = null;
    async function schedule() {
      await LN.cancel({ notifications: [...SUN, ...TUE].map((id) => ({ id })) }).catch(() => {});
      if (store(AKEY) !== "on") return;
      const list = [];
      const today = parts(new Date()).weekday, fresh = !["Mon", "Tue"].includes(today);   // after Tuesday's update the week is right
      next(0, 11, 4).filter((d) => iso(d) <= LAST_SUNDAY).forEach((d, i) => {
        let title = "Set your lineup", body = "The 1 PM ET games kick off soon. Your best lineup is ready on My Team.";
        if (i === 0 && fresh && brief) {
          title = `Week ${brief.week}: set your lineup`;
          body = brief.risky.length ? `Check before 1 PM ET: ${brief.risky.join(", ")}. Your best lineup is on My Team.`
            : brief.empty ? `You have ${brief.empty} empty starting spot${brief.empty > 1 ? "s" : ""}. Fill ${brief.empty > 1 ? "them" : "it"} before 1 PM ET.`
            : `Your lineup projects ${brief.total} points. Kickoff at 1 PM ET.`;
        }
        list.push({ id: SUN[i], title, body, schedule: { at: d, allowWhileIdle: true }, extra: { url: "my-team.html" } });
      });
      next(2, 19, 4).filter((d) => iso(d) <= LAST_SUNDAY).forEach((d, i) => {
        list.push({ id: TUE[i], title: "Waiver pickups for your team", body: "This week's pickups are in. See who beats the players you have.",
          schedule: { at: d, allowWhileIdle: true }, extra: { url: "my-team.html" } });
      });
      if (list.length) await LN.schedule({ notifications: list }).catch(() => {});
    }
    async function set(on) {
      try {
        if (on) {
          let perm = await LN.checkPermissions();
          if (perm.display !== "granted") perm = await LN.requestPermissions();
          if (perm.display !== "granted") { store(AKEY, "off"); await schedule(); return false; }
        }
        store(AKEY, on ? "on" : "off");
        count(on ? "team-alerts-on" : "team-alerts-off");
        await schedule();
        return on;
      } catch (e) { return false; }
    }
    window.BHGApp = {
      teamAlertsOn: () => store(AKEY) === "on",
      setTeamAlerts: set,
      teamBrief: (b) => { brief = b; if (store(AKEY) === "on") schedule(); },
    };
  }

  // ---------- breaking news on your players (Firebase push, app 1.1 and later) ----------
  // The phone follows one topic per My Team player ("p-<slug>") plus "all". When news.csv gets a row about
  // a player, GitHub Actions sends an alert to that player's topic (mockdraft/send_push.py).
  function setUpPush(FM) {
    if (!FM) return;
    const PKEY = "bhg-push", SYNCED = "bhg-push-topics";
    const slugs = () => { try { const t = JSON.parse(localStorage.getItem("bhg-myteam")); return Array.isArray(t) ? t : []; } catch (e) { return []; } };
    const synced = () => { try { return JSON.parse(store(SYNCED) || "[]"); } catch (e) { return []; } };
    FM.addListener && FM.addListener("notificationActionPerformed", (a) => {
      const to = a && a.notification && a.notification.data && a.notification.data.url;
      location.href = ROOT + (to || "my-team.html");
    });
    let syncing = false;
    async function sync() {
      if (syncing) return;
      syncing = true;
      try {
        const want = store(PKEY) === "on" ? ["all", ...slugs().map((x) => "p-" + x)] : [];
        const have = synced();
        for (const t of have.filter((t) => !want.includes(t))) await FM.unsubscribeFromTopic({ topic: t }).catch(() => {});
        for (const t of want.filter((t) => !have.includes(t))) await FM.subscribeToTopic({ topic: t });
        store(SYNCED, JSON.stringify(want));
      } catch (e) { /* try again on the next page */ }
      syncing = false;
    }
    async function set(on) {
      try {
        if (on) {
          let perm = await FM.checkPermissions();
          if (perm.receive !== "granted") perm = await FM.requestPermissions();
          if (perm.receive !== "granted") {
            store(PKEY, "off"); await sync();
            api.error = perm.receive === "denied" ? "Notifications are off for Big Head GM. Turn them on in iPhone Settings → Notifications → Big Head GM." : "Permission: " + perm.receive;
            return false;
          }
          await FM.getToken();                       // registers this phone with Firebase
        }
        store(PKEY, on ? "on" : "off");
        count(on ? "push-on" : "push-off");
        await sync();
        api.error = "";
        return on;
      } catch (e) { api.error = (e && (e.message || e.code)) || String(e); return false; }
    }
    const api = { on: () => store(PKEY) === "on", set, sync, error: "" };
    window.BHGPush = api;
    sync();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { setUpAppPage(); setTimeout(showBanner, 1200); });
  else { setUpAppPage(); setTimeout(showBanner, 1200); }
})();
