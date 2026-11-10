// Big Head GM: the "weekly mock in your inbox" signup boxes.
// Every <section class="nl"> on a page becomes a working form that adds the email to the Kit list.
// To switch the list, change KIT_FORM below (the number in the form's Kit embed code).

(function () {
  const KIT_FORM = "10171761";   // Kit form id, e.g. "8812345". Empty = the signup boxes stay hidden.

  if (!KIT_FORM) return;
  const action = `https://app.kit.com/forms/${KIT_FORM}/subscriptions`;
  let done = false;
  try { done = localStorage.getItem("bhg-newsletter") === "yes"; } catch (e) { /* private window */ }

  function count(path, title) {
    try {
      if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path, title, event: true });
    } catch (e) { /* never let the counter break the page */ }
  }

  for (const box of document.querySelectorAll("section.nl")) {
    const form = box.querySelector("form");
    const input = box.querySelector("input[type=email]");
    const button = box.querySelector("button");
    const note = box.querySelector(".nl-note");
    form.action = action;
    box.hidden = false;
    if (done) {
      form.hidden = true;
      note.textContent = "You're on the list. The next mock lands in your inbox.";
      continue;
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        note.textContent = "That email doesn't look right. Check it and try again.";
        input.focus();
        return;
      }
      button.disabled = true;
      button.textContent = "Signing up…";
      note.textContent = "";
      try {
        const body = new FormData();
        body.append("email_address", email);
        // Kit doesn't let other sites read its reply, so a sent request counts as a signup
        await fetch(action, { method: "POST", body, mode: "no-cors" });
        form.hidden = true;
        note.textContent = "Almost done: check your inbox and tap the button in Kit's email to confirm.";
        try { localStorage.setItem("bhg-newsletter", "yes"); } catch (err) { /* private window */ }
        count(`newsletter-signup-${box.dataset.from || "page"}`, "Joined the email list");
      } catch (err) {
        button.disabled = false;
        button.textContent = "Sign up";
        note.textContent = "Couldn't reach the sign-up service. Check your connection and try again.";
      }
    });
  }
})();
