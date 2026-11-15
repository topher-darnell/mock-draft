// Big Head GM: "get the app" (the site installs like an app: home-screen icon, full screen, works offline).
// - Android / Chrome / Edge: catches the browser's install offer so our own buttons can open it.
// - iPhone / iPad: shows the 3 Safari steps (Share > Add to Home Screen), since Apple has no install button.
// - Phones that haven't installed yet get a small banner above the tab bar; tap X and it stays away for 2 weeks.
(function () {
  const ROOT = (document.currentScript && document.currentScript.src || "").replace(/getapp\.js.*$/, "");
  const KEY = "bhg-app-banner";
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isPhone = window.matchMedia("(max-width: 899px)").matches;
  let offer = null;

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function count(path) { try { window.goatcounter && window.goatcounter.count && window.goatcounter.count({ path, title: path, event: true }); } catch (e) {} }

  // the service worker makes it installable (and offline) from any page, not just the home page
  if ("serviceWorker" in navigator) {
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
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { setUpAppPage(); setTimeout(showBanner, 1200); });
  else { setUpAppPage(); setTimeout(showBanner, 1200); }
})();
