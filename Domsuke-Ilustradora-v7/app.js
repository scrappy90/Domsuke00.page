(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ==========================================================
     1. IMÁGENES
     Orden: archivo local (images/) -> copia en Drive -> recuadro de ayuda
     ========================================================== */
  function handleMiss(img) {
    const drive = img.dataset.driveSrc;
    if (drive && !img.dataset.triedDrive) {
      img.dataset.triedDrive = "1";
      img.src = drive;
      return;
    }
    const slot = img.closest(".ph-slot");
    if (slot) slot.classList.add("is-empty");
  }
  $$(".ph-slot img").forEach((img) => {
    img.addEventListener("error", () => handleMiss(img));
    if (img.complete && img.naturalWidth === 0) handleMiss(img);
  });

  /* ==========================================================
     2. AVISO Y BOTONES "COPIAR"
     ========================================================== */
  let toastTimer;
  function say(text) {
    const el = $("toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch (err2) {
        return false;
      }
    }
  }

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const text = btn.dataset.copy;
    if (await copyText(text)) {
      say("Copiado: " + text);
      const original = btn.textContent;
      btn.textContent = "¡Listo!";
      setTimeout(() => { btn.textContent = original; }, 1400);
    } else {
      say("Selecciona y copia a mano: " + text);
    }
  });

  /* ==========================================================
     3. BARRA DE PROGRESO Y MENÚ ACTIVO
     ========================================================== */
  const bar = $("scrollProgress");
  // Solo los enlaces internos (#...) siguen el scroll; los que van a otra página quedan fijos
  const navLinks = $$(".nav-link").filter((l) => (l.getAttribute("href") || "").startsWith("#"));
  const sections = navLinks.map((l) => document.querySelector(l.getAttribute("href")));
  let ticking = false;

  function update() {
    ticking = false;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, y / max) : 0) + ")";

    let cur = 0;
    const line = window.innerHeight * 0.35;
    sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= line) cur = i; });
    if (max > 0 && y >= max - 4) cur = sections.length - 1;

    navLinks.forEach((l, i) => {
      const on = i === cur;
      l.classList.toggle("active", on);
      if (on) l.setAttribute("aria-current", "true"); else l.removeAttribute("aria-current");
    });
  }
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener("resize", update);
  update();

  /* ==========================================================
     4. APARICIÓN AL HACER SCROLL
     .reveal  -> un elemento
     .stagger -> sus hijos entran uno tras otro (--i)
     ========================================================== */
  const targets = $$(".reveal, .stagger");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("is-visible");
          obs.unobserve(en.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    targets.forEach((t) => io.observe(t));
  } else {
    targets.forEach((t) => t.classList.add("is-visible"));
  }

  /* ==========================================================
     5. INCLINACIÓN Y BRILLO EN LA ILUSTRACIÓN PRINCIPAL
     ========================================================== */
  const frame = document.querySelector(".tilt-frame");
  if (frame && !reduceMotion && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    let raf;
    frame.addEventListener("pointermove", (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = frame.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        frame.style.setProperty("--mx", x * 100 + "%");
        frame.style.setProperty("--my", y * 100 + "%");
        frame.style.transform =
          "perspective(950px) rotateY(" + ((x - 0.5) * 7).toFixed(2) + "deg) rotateX(" +
          (-(y - 0.5) * 7).toFixed(2) + "deg) scale3d(1.012,1.012,1.012)";
      });
    });
    frame.addEventListener("pointerleave", () => {
      cancelAnimationFrame(raf);
      frame.style.transform = "";
    });
  }

  /* ==========================================================
     6. VISOR AMPLIADO
     Teclado: Esc cierra, flechas cambian de imagen. En móvil: deslizar.
     ========================================================== */
  const lightbox = $("lightbox");
  const lbImg = $("lbImg");
  const lbTitle = $("lbTitle");
  const lbCategory = $("lbCategory");
  const lbDesc = $("lbDesc");
  const lbPrev = $("lbPrev");
  const lbNext = $("lbNext");
  const lbClose = $("lbClose");
  const triggers = $$("[data-lightbox-trigger]");
  let current = 0;
  let lastFocus = null;

  const usable = (el) => !el.classList.contains("is-empty") && el.querySelector("img");
  const usableCount = () => triggers.filter(usable).length;

  function show(index) {
    const item = triggers[index];
    const img = item.querySelector("img");
    current = index;

    lbImg.classList.add("is-loading");
    lbImg.onload = lbImg.onerror = () => lbImg.classList.remove("is-loading");
    lbImg.src = item.dataset.full || img.currentSrc || img.src;
    lbImg.alt = img.alt || "";
    if (lbImg.complete) lbImg.classList.remove("is-loading");

    lbTitle.textContent = item.dataset.title || "Ilustración";
    lbCategory.textContent = item.dataset.category || "Domsuke";
    lbDesc.textContent = item.dataset.desc || "";

    const several = usableCount() > 1;
    lbPrev.hidden = !several;
    lbNext.hidden = !several;
  }

  function openLightbox(index) {
    if (!triggers[index] || !usable(triggers[index])) return;
    lastFocus = document.activeElement;
    show(index);
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    lbClose.focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function stepLightbox(dir) {
    const n = triggers.length;
    let idx = current;
    for (let k = 0; k < n; k++) {
      idx = (idx + dir + n) % n;
      if (usable(triggers[idx])) { show(idx); return; }
    }
  }

  triggers.forEach((el, i) => {
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Ampliar: " + (el.dataset.title || "ilustración"));
    el.addEventListener("click", () => openLightbox(i));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLightbox(i);
      }
    });
  });

  // Enlace directo desde el inicio: galeria.html#obra-3 abre esa ilustración
  const deep = location.hash.match(/^#obra-(\d+)$/);
  if (deep) openLightbox(parseInt(deep[1], 10) - 1);
  window.addEventListener("hashchange", () => {
    const m = location.hash.match(/^#obra-(\d+)$/);
    if (m && lightbox.hidden) openLightbox(parseInt(m[1], 10) - 1);
  });

  $$("[data-lb-close]").forEach((el) => el.addEventListener("click", closeLightbox));
  lbPrev.addEventListener("click", () => stepLightbox(-1));
  lbNext.addEventListener("click", () => stepLightbox(1));

  document.addEventListener("keydown", (e) => {
    if (lightbox.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") stepLightbox(-1);
    else if (e.key === "ArrowRight") stepLightbox(1);
    else if (e.key === "Tab") {
      const focusables = [lbClose, lbPrev, lbNext].filter((b) => !b.hidden);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  let touchX = null;
  lightbox.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  lightbox.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
