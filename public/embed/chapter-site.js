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

  // Upcoming Events sits above Announcements, even when the GoDaddy markup lists announcements first.
  var eventList = document.querySelector("[data-scs-list=\"event\"]");
  var announcementList = document.querySelector("[data-scs-list=\"announcement\"]");
  if (eventList && announcementList) {
    var eventSection = eventList.closest("section") || eventList;
    var announcementSection = announcementList.closest("section") || announcementList;
    if (
      eventSection !== announcementSection &&
      eventSection.parentNode &&
      eventSection.parentNode === announcementSection.parentNode &&
      (eventSection.compareDocumentPosition(announcementSection) & Node.DOCUMENT_POSITION_PRECEDING)
    ) {
      announcementSection.parentNode.insertBefore(eventSection, announcementSection);
    }
  }

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
    var rich = safeSection(item.summaryHtml);
    if (rich) html += rich;
    else if (item.summary) html += "<p>" + escapeHtml(item.summary) + "</p>";
    var details = item.href && String(item.href).indexOf("/p/") === 0
      ? origin + item.href
      : (item.slug ? origin + "/p/" + encodeURIComponent(item.slug) : "");
    var extra = item.url
      ? /^https?:\/\//i.test(item.url)
        ? item.url
        : "https://" + item.url
      : "";
    var detailsLabel = item.layout === "conference" ? "Conference page" : "Event details";
    if (details) html += "<p><a href=\"" + escapeHtml(details) + "\">" + detailsLabel + "</a></p>";
    if (item.eventPage && item.eventPage.href && origin + item.eventPage.href !== details) {
      html += "<p><a href=\"" + escapeHtml(origin + item.eventPage.href) + "\">Event page: " + escapeHtml(item.eventPage.title || "") + "</a></p>";
    }
    else if (extra) html += "<p><a href=\"" + escapeHtml(extra) + "\">Read more</a></p>";
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

  // summaryHtml is sanitized on the server. This check refuses anything else.
  function safeSection(s) {
    if (!s) return "";
    var t = String(s).trim();
    if (!/^<section\b[\s\S]*<\/section>$/i.test(t)) return "";
    if (/<\s*\/?\s*(script|iframe|object|embed|link|meta|base|form|style)\b/i.test(t)) return "";
    if (/javascript\s*:/i.test(t) || /\son[a-z]+\s*=/i.test(t)) return "";
    return t;
  }

  function topHtml(item) {
    var html = "<article class=\"scs-top\">";
    if (item.imageSrc) {
      html += "<img src=\"" + escapeHtml(origin + item.imageSrc) + "\" alt=\"" + escapeHtml(item.title || "") + "\">";
    }
    html += card(item);
    html += "</article>";
    return html;
  }

  // When a saved section order arrives, reorder list hosts that share one parent.
  // Hosts under a different parent stay where they are.
  function reorderSections(orderText) {
    var keys = String(orderText).split(",");
    var nodes = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i].replace(/^\s+|\s+$/g, "");
      if (!key) continue;
      var host = document.querySelector("[data-scs-list=\"" + key + "\"]");
      if (!host) continue;
      var node = host.closest("section") || host;
      if (nodes.indexOf(node) !== -1) continue;
      nodes.push(node);
    }
    var groups = [];
    for (var n = 0; n < nodes.length; n++) {
      var parent = nodes[n].parentNode;
      var found = false;
      for (var g = 0; g < groups.length; g++) {
        if (groups[g].parent === parent) {
          groups[g].nodes.push(nodes[n]);
          found = true;
          break;
        }
      }
      if (!found) groups.push({ parent: parent, nodes: [nodes[n]] });
    }
    for (var g2 = 0; g2 < groups.length; g2++) {
      var group = groups[g2];
      if (!group.parent || group.nodes.length < 2) continue;
      for (var k = 1; k < group.nodes.length; k++) {
        var prev = group.nodes[k - 1];
        if (prev.nextSibling !== group.nodes[k]) group.parent.insertBefore(group.nodes[k], prev.nextSibling);
      }
    }
  }

  fetch(origin + "/api/public-site")
    .then(function (r) {
      if (!r.ok) throw new Error("public-site " + r.status);
      return r.json();
    })
    .then(function (data) {
      var s = (data && data.settings) || {};
      text(document.querySelector("[data-scs=\"title\"]"), s.publicTitle);
      text(document.querySelector("[data-scs=\"tagline\"]"), s.publicTagline);
      var aboutEl = document.querySelector("[data-scs=\"about\"]");
      var aboutRich = safeSection(s.aboutHtml);
      if (aboutEl && aboutRich) aboutEl.innerHTML = aboutRich;
      else text(aboutEl, s.about);
      if (s.homeSections) reorderSections(s.homeSections);
      var topId = "";
      var topHost = document.querySelector("[data-scs=\"top\"]");
      if (data && data.top && topHost) {
        topId = data.top.id || "";
        topHost.innerHTML = topHtml(data.top);
      }
      var items = (data && data.items) || [];
      ["announcement", "event", "article", "document", "course"].forEach(function (kind) {
        var host = document.querySelector("[data-scs-list=\"" + kind + "\"]");
        if (!host) return;
        var group = items.filter(function (i) {
          if (i.kind !== kind) return false;
          if (topId && i.id === topId) return false;
          return true;
        });
        host.innerHTML = group.map(card).join("") || "<p>Nothing posted yet.</p>";
      });
      var pastHost = document.querySelector("[data-scs-list=\"past-event\"]");
      if (data && data.pastEvents && pastHost) {
        pastHost.innerHTML = data.pastEvents.map(card).join("") || "<p>Nothing posted yet.</p>";
      }
    })
    .catch(function () {
      /* leave existing GoDaddy markup in place */
    });
})();
