/**
 * Drop this on scs-wisconsin-usa.org. It fills elements marked data-scs / data-scs-list
 * from Chapter Book published copy. No CRM people are included.
 *
 *   <script src="https://chapter-book-beryl.vercel.app/embed/chapter-site.js" defer></script>
 *   <h1 data-scs="title"></h1>
 *   <p data-scs="tagline"></p>
 *   <div data-scs-list="event"></div>
 */
(function () {
  var script = document.currentScript;
  var src = script && script.src ? script.src : "";
  var origin = src ? src.replace(/\/embed\/chapter-site\.js(?:\?.*)?$/i, "") : "";
  if (!origin) return;

  function text(el, value) {
    if (!el) return;
    el.textContent = value || "";
  }

  function card(item) {
    var html = "<article class=\"scs-item\">";
    if (item.featured) html += "<p class=\"scs-kicker\">Featured</p>";
    html += "<h3>" + escapeHtml(item.title || "") + "</h3>";
    if (item.subtitle) html += "<p class=\"scs-sub\">" + escapeHtml(item.subtitle) + "</p>";
    if (item.whenLabel) html += "<p class=\"scs-when\">" + escapeHtml(item.whenLabel) + "</p>";
    if (item.location) html += "<p class=\"scs-loc\">" + escapeHtml(item.location) + "</p>";
    if (item.audience) html += "<p class=\"scs-aud\">" + escapeHtml(item.audience) + "</p>";
    if (item.summary) html += "<p>" + escapeHtml(item.summary) + "</p>";
    if (item.url) {
      var href = /^https?:\/\//i.test(item.url) ? item.url : "https://" + item.url;
      html += "<p><a href=\"" + escapeHtml(href) + "\">Read more</a></p>";
    }
    html += "</article>";
    return html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  fetch(origin + "/api/public-site?t=" + Date.now())
    .then(function (r) {
      if (!r.ok) throw new Error("public-site " + r.status);
      return r.json();
    })
    .then(function (data) {
      var s = (data && data.settings) || {};
      text(document.querySelector("[data-scs=\"title\"]"), s.publicTitle);
      text(document.querySelector("[data-scs=\"tagline\"]"), s.publicTagline);
      text(document.querySelector("[data-scs=\"about\"]"), s.about);
      var items = (data && data.items) || [];
      ["announcement", "event", "article", "document", "course"].forEach(function (kind) {
        var host = document.querySelector("[data-scs-list=\"" + kind + "\"]");
        if (!host) return;
        var group = items.filter(function (i) {
          return i.kind === kind;
        });
        host.innerHTML = group.map(card).join("") || "<p>Nothing posted yet.</p>";
      });
    })
    .catch(function () {
      /* leave existing GoDaddy markup in place */
    });
})();
