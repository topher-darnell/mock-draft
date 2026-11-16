// Big Head GM: "get the app" (the site installs like an app: home-screen icon, full screen, works offline).
// - Android / Chrome / Edge: catches the browser's install offer so our own buttons can open it.
// - iPhone / iPad: shows the 3 Safari steps (Share > Add to Home Screen), since Apple has no install button.
// - Phones that haven't installed yet get a small banner above the tab bar; tap X and it stays away for 2 weeks.
(function () {
  const ROOT = (document.currentScript && document.currentScript.src || "").replace(/getapp\.js.*$/, "");
  const KEY = "bhg-app-banner";
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
      <span><b>Get the Big Head GM app</b><small>Free · no App Store needed</small></span>
      <button type="button" class="app-banner-go">Get it</button>
      <button type="button" class="app-banner-x" aria-label="Not now">✕</button>`;
    b.querySelector(".app-banner-go").addEventListener("click", () => window.bhgInstall());
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
        if (e.target.closest("button, .fx-go, .pg-button, .hero-start")) { try { P.Haptics.impact({ style: "LIGHT" }); } catch (er) {} }
      }, true);
    }

    // daily reminder for the new Fantasle + Prospectle (scheduled on the phone, no server)
    const LN = P.LocalNotifications, RKEY = "bhg-remind";
    if (!LN) return;
    LN.addListener && LN.addListener("localNotificationActionPerformed", () => { location.href = ROOT + "games/fantasle.html"; });
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
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { setUpAppPage(); setTimeout(showBanner, 1200); });
  else { setUpAppPage(); setTimeout(showBanner, 1200); }
})();
