(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(c));
    }
    return node;
  };

  // Browser storage can be missing or throw (private mode, blocked site data).
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    }
  };

  const KEYS = { theme: "coe-cert-theme", persona: "coe-cert-persona", done: "coe-cert-done" };

  const state = {
    data: null,
    byCode: new Map(),
    persona: "all",
    done: new Set(),
    openCode: null,
    lastFocus: null
  };

  /* ---------- Theme ---------- */
  function initTheme() {
    const saved = store.get(KEYS.theme, null);
    if (saved) document.documentElement.dataset.theme = saved;
    $("#theme-toggle").addEventListener("click", () => {
      const current = document.documentElement.dataset.theme
        || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      store.set(KEYS.theme, next);
    });
  }

  /* ---------- Helpers ---------- */
  const track = id => state.data.tracks.find(t => t.id === id);
  const level = id => state.data.levels.find(l => l.id === id);
  const priority = id => state.data.priorities.find(p => p.id === id);
  const persona = id => state.data.personas.find(p => p.id === id);
  const priorityRank = { mandatory: 0, recommended: 1, optional: 2, explore: 3 };

  const predecessors = cert => [...cert.prerequisites, ...cert.recommendedBefore];
  const successors = cert => state.data.certifications.filter(c => predecessors(c).includes(cert.code));

  function routeOf(personaId) {
    const p = persona(personaId);
    return p ? { route: p.route, optional: p.optional } : { route: [], optional: [] };
  }

  function statusTag(cert) {
    if (cert.status === "beta") return el("span", { class: "tag tag--beta" }, "Beta");
    if (cert.status === "new") return el("span", { class: "tag tag--new" }, "New");
    return null;
  }

  function maxWeight(w) {
    const nums = String(w).match(/\d+/g);
    return nums ? Math.max(...nums.map(Number)) : 0;
  }

  /* ---------- Hero stats ---------- */
  function renderStats() {
    const certs = state.data.certifications;
    const core = new Set(state.data.personas.flatMap(p => p.route));
    const stats = [
      [certs.length, "certifications mapped"],
      [core.size, "on a core route"],
      [certs.filter(c => c.priority === "mandatory").length, "mandatory"]
    ];
    $("#stats").replaceChildren(...stats.map(([n, label]) =>
      el("div", {}, el("dd", {}, String(n)), el("dt", {}, label))));
  }

  /* ---------- Persona switch ---------- */
  function renderPersonaSwitch() {
    const options = [{ id: "all", name: "All certifications" }, ...state.data.personas];
    const wrap = $("#persona-switch");
    wrap.replaceChildren(...options.map(o => el("button", {
      type: "button", role: "radio", "data-id": o.id,
      "aria-checked": String(o.id === state.persona),
      onclick: () => setPersona(o.id)
    }, o.name)));
    wrap.addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const ids = options.map(o => o.id);
      const i = ids.indexOf(state.persona) + (e.key === "ArrowRight" ? 1 : -1);
      setPersona(ids[(i + ids.length) % ids.length]);
      wrap.querySelector(`[data-id="${state.persona}"]`).focus();
    });
  }

  function setPersona(id) {
    state.persona = id;
    store.set(KEYS.persona, id);
    document.querySelectorAll("#persona-switch button").forEach(b =>
      b.setAttribute("aria-checked", String(b.dataset.id === id)));
    const p = persona(id);
    $("#persona-summary").textContent = p
      ? `${p.summary} Numbered badges show the suggested order.`
      : "Showing every certification in the plan. Choose a persona to see a suggested route.";
    applyPersonaToMap();
    renderRoadmap();
  }

  /* ---------- Map ---------- */
  function nodeFor(cert) {
    const t = track(cert.track);
    return el("button", {
      type: "button", class: "node",
      "data-code": cert.code, "data-track": cert.track, "data-priority": cert.priority,
      "aria-label": `${cert.code} ${cert.title}. ${priority(cert.priority).name}, ${t.name}. Open details.`,
      onclick: () => openDrawer(cert.code)
    },
      el("span", { class: "node__top" },
        el("span", { class: "node__code" }, cert.code),
        statusTag(cert),
        cert.issuer === "GitHub" ? el("span", { class: "tag tag--github" }, "GitHub") : null),
      el("span", { class: "node__title" }, cert.title),
      el("span", { class: "node__meta" }, el("span", {}, cert.effort))
    );
  }

  function renderMap() {
    const map = $("#cert-map");
    const svg = $("#map-links");
    map.replaceChildren(svg);

    map.append(el("div", { class: "map__colhead", "aria-hidden": "true" }));
    for (const lv of state.data.levels) {
      map.append(el("div", { class: "map__colhead" }, lv.name, el("small", {}, lv.hint)));
    }

    for (const t of state.data.tracks) {
      const lane = el("div", { class: "lane", "data-track": t.id });
      lane.append(
        el("div", { class: "lane__title" }, el("span", { class: `chip chip--${t.id}` }, t.name), el("small", {}, t.tagline)),
        el("div", { class: "map__rowhead" }, el("span", { class: `chip chip--${t.id}` }, t.name), el("p", {}, t.tagline))
      );
      for (const lv of state.data.levels) {
        const certs = state.data.certifications
          .filter(c => c.track === t.id && c.level === lv.id)
          .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
        lane.append(el("div", { class: "cell", "data-level": lv.id }, certs.map(nodeFor)));
      }
      map.append(lane);
    }

    applyPersonaToMap();
    new ResizeObserver(() => drawLinks()).observe(map);
  }

  function applyPersonaToMap() {
    const { route, optional } = routeOf(state.persona);
    const all = state.persona === "all";
    document.querySelectorAll(".node").forEach(n => {
      const code = n.dataset.code;
      const step = route.indexOf(code);
      n.classList.toggle("is-dim", !all && step < 0 && !optional.includes(code));
      n.classList.toggle("is-route", !all && step >= 0);
      n.querySelector(".node__step")?.remove();
      if (!all && step >= 0) n.prepend(el("span", { class: "node__step", "aria-hidden": "true" }, String(step + 1)));
    });
    drawLinks();
  }

  function applyDoneToMap() {
    document.querySelectorAll(".node").forEach(n => {
      const done = state.done.has(n.dataset.code);
      n.querySelector(".node__done")?.remove();
      if (done) n.append(el("span", { class: "node__done", title: "Earned", "aria-hidden": "true" }, "✓"));
      const label = n.getAttribute("aria-label").replace(/ Earned\.$/, "");
      n.setAttribute("aria-label", done ? `${label} Earned.` : label);
    });
  }

  function drawLinks() {
    const map = $("#cert-map");
    const svg = $("#map-links");
    if (!map || !svg || getComputedStyle(svg).display === "none") return;
    const box = map.getBoundingClientRect();
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);

    const { route } = routeOf(state.persona);
    const all = state.persona === "all";
    const ns = "http://www.w3.org/2000/svg";
    const paths = [];

    for (const cert of state.data.certifications) {
      for (const from of predecessors(cert)) {
        const a = map.querySelector(`.node[data-code="${from}"]`)?.getBoundingClientRect();
        const b = map.querySelector(`.node[data-code="${cert.code}"]`)?.getBoundingClientRect();
        if (!a || !b) continue;
        let d;
        if (Math.abs(a.left - b.left) < 20) {
          // Same column: hook around the right side.
          const x = a.right - box.left, y1 = a.top + a.height / 2 - box.top, y2 = b.top + b.height / 2 - box.top;
          d = `M${x},${y1} C${x + 34},${y1} ${x + 34},${y2} ${x},${y2}`;
        } else {
          const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top;
          const x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top;
          const mid = (x1 + x2) / 2;
          d = `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2 - 4},${y2}`;
        }
        const onRoute = !all && route.includes(from) && route.includes(cert.code);
        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", d);
        path.setAttribute("marker-end", "url(#arrow)");
        if (onRoute) path.classList.add("is-route");
        else if (!all) path.classList.add("is-dim");
        paths.push(path);
      }
    }

    const defs = document.createElementNS(ns, "defs");
    defs.innerHTML = '<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>';
    svg.replaceChildren(defs, ...paths);
  }

  /* ---------- Drawer ---------- */
  function linkItem(label, url, hint = "↗") {
    return el("li", {}, el("a", { href: url, target: "_blank", rel: "noopener" }, el("span", {}, label), el("span", {}, hint)));
  }

  function certPill(code) {
    const c = state.byCode.get(code);
    return el("button", { type: "button", class: "pill", onclick: () => openDrawer(code) },
      el("span", { class: "code" }, code), c.title);
  }

  function openDrawer(code) {
    const cert = state.byCode.get(code);
    if (!cert) return;
    const t = track(cert.track);
    const trackColor = { data: "var(--data)", ai: "var(--ai)" }[cert.track] || "var(--explore)";
    const top = Math.max(...cert.skills.map(s => maxWeight(s.weight)));

    const body = $("#drawer-body");
    body.style.setProperty("--c", trackColor);
    const before = predecessors(cert);
    const after = successors(cert).map(c => c.code);
    const forPersonas = state.data.personas.filter(p => p.route.includes(code) || p.optional.includes(code));

    body.replaceChildren(
      el("div", { class: "drawer__hero" },
        el("span", { class: "node__code", style: `color:${trackColor}` }, cert.code),
        el("h2", { id: "drawer-title" }, cert.title),
        el("div", { class: "drawer__chips" },
          el("span", { class: `chip chip--${cert.track}` }, t.name),
          el("span", { class: "chip chip--explore" }, priority(cert.priority).name),
          statusTag(cert),
          el("span", { class: "tag tag--github" }, cert.issuer))),

      el("section", {}, el("h3", {}, "Why it matters for us"), el("p", {}, cert.whyForUs)),

      el("section", {}, el("dl", { class: "facts" },
        el("div", {}, el("dt", {}, "Level"), el("dd", {}, level(cert.level).name)),
        el("div", {}, el("dt", {}, "Estimated effort"), el("dd", {}, cert.effort)),
        el("div", {}, el("dt", {}, "Validity"), el("dd", {}, cert.validity)),
        el("div", {}, el("dt", {}, "Personas"), el("dd", {}, forPersonas.map(p => p.name).join(", ") || "Not on a core route")))),

      el("section", {}, el("h3", {}, "Who it's for"), el("p", { class: "muted" }, cert.audience)),

      el("section", {}, el("h3", {}, "Skills measured"),
        el("ul", { class: "skills" }, cert.skills.map(s => el("li", {},
          el("span", { class: "row" }, el("span", {}, s.name), el("b", {}, s.weight)),
          el("span", { class: "bar" }, el("i", { style: `width:${(maxWeight(s.weight) / top) * 100}%` })))))),

      el("section", {}, el("h3", {}, "Official links"),
        el("ul", { class: "links links--primary" },
          linkItem("Exam & certification page", cert.examUrl),
          linkItem("Study guide", cert.studyGuideUrl),
          cert.practiceUrl ? linkItem("Free practice assessment", cert.practiceUrl) : null)),

      el("section", {}, el("h3", {}, "Learning paths"),
        el("ul", { class: "links" },
          cert.learningPaths.length
            ? cert.learningPaths.map(lp => linkItem(lp.title, lp.url))
            : linkItem("See \"Study resources\" in the study guide", `${cert.studyGuideUrl}#study-resources`))),

      (before.length || after.length) ? el("section", {}, el("h3", {}, "Where it sits in the path"),
        before.length ? el("p", { class: "muted" }, "Take before:") : null,
        before.length ? el("div", { class: "related" }, before.map(certPill)) : null,
        after.length ? el("p", { class: "muted", style: "margin-top:12px" }, "Leads to:") : null,
        after.length ? el("div", { class: "related" }, after.map(certPill)) : null) : null,

      el("section", {}, el("label", { class: "drawer__toggle" },
        el("input", {
          type: "checkbox", "data-done": code, checked: state.done.has(code),
          onchange: e => setDone(code, e.target.checked)
        }),
        "I've earned this certification"))
    );
    state.openCode = code;

    const drawer = $("#drawer");
    const wasOpen = !drawer.hidden;
    if (!wasOpen) state.lastFocus = document.activeElement;
    drawer.hidden = false;
    $("#drawer-scrim").hidden = false;
    drawer.scrollTop = 0;
    document.body.style.overflow = "hidden";
    $("#drawer-close").focus();
    history.replaceState(null, "", `#cert-${code}`);
  }

  function closeDrawer() {
    $("#drawer").hidden = true;
    $("#drawer-scrim").hidden = true;
    state.openCode = null;
    document.body.style.overflow = "";
    history.replaceState(null, "", location.pathname + location.search);
    state.lastFocus?.focus?.();
  }

  function initDrawer() {
    $("#drawer-close").addEventListener("click", closeDrawer);
    $("#drawer-scrim").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", e => {
      const drawer = $("#drawer");
      if (drawer.hidden) return;
      if (e.key === "Escape") closeDrawer();
      if (e.key === "Tab") {
        const focusable = [...drawer.querySelectorAll("button, a[href], input")].filter(n => n.offsetParent !== null);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
    });
  }

  /* ---------- Roadmap ---------- */
  const roadmapPersona = () => persona(state.persona) || state.data.personas[0];

  function renderRoadmap() {
    const p = roadmapPersona();
    $("#roadmap-persona").textContent = persona(state.persona) ? p.name : `${p.name} (choose a persona on the map to switch)`;

    $("#timeline").replaceChildren(...p.route.map(code => {
      const c = state.byCode.get(code);
      return el("li", { "data-track": c.track, "data-code": code },
        el("div", { class: "step-card" },
          el("div", { class: "step-card__head" },
            el("span", { class: "code" }, c.code),
            el("h3", {}, c.title),
            el("span", { class: `chip chip--${c.track}` }, track(c.track).name),
            statusTag(c)),
          el("p", {}, c.whyForUs),
          el("div", { class: "step-card__foot" },
            el("span", {}, `${priority(c.priority).name} · ${c.effort} · ${c.validity}`),
            el("button", { type: "button", class: "linkish", onclick: () => openDrawer(code) }, "Details & learning paths"))));
    }));

    $("#optional-box").replaceChildren(
      el("h3", {}, "Optional add-ons for this persona"),
      el("div", { class: "pill-row" }, p.optional.map(certPill)));
    refreshProgress();
  }

  /* ---------- Progress ---------- */
  function setDone(code, value) {
    if (value) state.done.add(code); else state.done.delete(code);
    store.set(KEYS.done, [...state.done]);
    refreshProgress();
  }

  function renderChecklist() {
    $("#checklist").replaceChildren(...state.data.tracks.map(t =>
      el("div", { class: "check-group" },
        el("h3", {}, el("span", { class: `chip chip--${t.id}` }, t.name)),
        state.data.certifications.filter(c => c.track === t.id).map(c =>
          el("label", { class: "check" },
            el("input", { type: "checkbox", "data-done": c.code, onchange: e => setDone(c.code, e.target.checked) }),
            el("span", {}, el("b", { class: "code" }, c.code), el("small", {}, `${c.title} · ${priority(c.priority).name}`)))))));
  }

  function ring(label, done, total, color) {
    const r = 38, circ = 2 * Math.PI * r;
    const pct = total ? done / total : 0;
    return el("div", { class: "ring", role: "img", "aria-label": `${label}: ${done} of ${total} earned` },
      el("span", {
        html: `<svg viewBox="0 0 92 92" aria-hidden="true"><circle class="ring__bg" cx="46" cy="46" r="${r}"/>` +
          `<circle class="ring__fg" cx="46" cy="46" r="${r}" stroke="${color}" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct)}"/></svg>`
      }),
      el("span", { class: "ring__value" }, `${done}/${total}`),
      el("span", { class: "ring__label" }, label));
  }

  function refreshProgress() {
    if (!state.data) return;
    const isDone = code => state.done.has(code);
    const p = roadmapPersona();

    document.querySelectorAll("input[data-done]").forEach(i => { i.checked = isDone(i.dataset.done); });
    document.querySelectorAll("#timeline li").forEach(li => li.classList.toggle("is-done", isDone(li.dataset.code)));
    applyDoneToMap();

    const trackCerts = id => state.data.certifications.filter(c => c.track === id).map(c => c.code);
    const count = list => list.filter(isDone).length;
    $("#rings").replaceChildren(
      ring(`${p.name} route`, count(p.route), p.route.length, "var(--gold)"),
      ring("Data & Analytics", count(trackCerts("data")), trackCerts("data").length, "var(--data)"),
      ring("AI-assisted dev", count(trackCerts("ai")), trackCerts("ai").length, "var(--ai)"));

    const nextCode = p.route.find(c => !isDone(c));
    const nextOptional = p.optional.find(c => !isDone(c));
    const next = $("#next-step");
    if (nextCode) {
      const c = state.byCode.get(nextCode);
      next.replaceChildren(
        el("h3", {}, `Your next step · ${p.name}`),
        el("p", { class: "big" }, el("span", { class: "code" }, c.code), ` ${c.title}`),
        el("p", { class: "muted" }, `${priority(c.priority).name} · about ${c.effort} of study.`),
        el("div", {}, el("button", { type: "button", class: "btn btn--small", onclick: () => openDrawer(c.code) }, "Start studying")));
    } else {
      next.replaceChildren(
        el("h3", {}, p.name),
        el("p", { class: "big" }, "Route complete. Great work! 🎉"),
        nextOptional
          ? el("p", { class: "muted" }, "Want more? Try an optional add-on: ", certPill(nextOptional))
          : el("p", { class: "muted" }, "You've earned every certification on this route and its add-ons."));
    }
  }

  /* ---------- Resources ---------- */
  function renderResources(resources) {
    $("#resource-list").replaceChildren(...resources.groups.map(g =>
      el("div", { class: "res-group" },
        el("h3", {}, g.name),
        el("ul", {}, g.items.map(item => el("li", { class: item.url ? null : "is-placeholder" },
          item.url ? el("a", { href: item.url, target: "_blank", rel: "noopener" }, item.title) : el("span", {}, item.title),
          item.note ? el("small", {}, item.note) : null))))));
  }

  /* ---------- Boot ---------- */
  function validate(data) {
    for (const c of data.certifications) {
      for (const ref of predecessors(c)) {
        if (!state.byCode.has(ref)) console.warn(`[certifications.json] ${c.code} references unknown code ${ref}`);
      }
    }
    for (const p of data.personas) {
      for (const ref of [...p.route, ...p.optional]) {
        if (!state.byCode.has(ref)) console.warn(`[certifications.json] persona ${p.id} references unknown code ${ref}`);
      }
    }
  }

  async function boot() {
    initTheme();
    initDrawer();
    try {
      const [data, resources] = await Promise.all([
        fetch("data/certifications.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
        fetch("data/resources.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      ]);
      state.data = data;
      data.certifications.forEach(c => state.byCode.set(c.code, c));
      validate(data);

      const saved = store.get(KEYS.persona, "all");
      state.persona = saved === "all" || persona(saved) ? saved : "all";
      const savedDone = store.get(KEYS.done, []);
      state.done = new Set(Array.isArray(savedDone) ? savedDone.filter(c => state.byCode.has(c)) : []);

      $("#last-verified").textContent = new Date(data.meta.lastVerified + "T00:00:00")
        .toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      renderStats();
      renderPersonaSwitch();
      renderMap();
      renderChecklist();
      setPersona(state.persona);
      renderResources(resources);
      $("#reset-progress").addEventListener("click", () => {
        if (!state.done.size || !confirm("Clear all ticked certifications in this browser?")) return;
        state.done.clear();
        store.set(KEYS.done, []);
        refreshProgress();
      });

      const deep = location.hash.match(/^#cert-(.+)$/);
      if (deep) openDrawer(decodeURIComponent(deep[1]));
    } catch (err) {
      console.error(err);
      $("#cert-map").replaceChildren(el("div", { class: "load-error" },
        el("strong", {}, "Couldn't load the certification data. "),
        "If you opened index.html straight from disk, serve the folder instead, for example ",
        el("code", {}, "npx serve ."), " or ", el("code", {}, "python -m http.server"), "."));
    }
  }

  boot();
})();
