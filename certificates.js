/* Certificates — Viewer PDF cu FLIP + SCROLL + HiDPI
   1) PDF-urile: /certificates/*.pdf
   2) Clar pe mobil: randează la devicePixelRatio (2x/3x), scale vizual în CSS.
*/
(function () {
  // === PDF.js worker
  if (window['pdfjsLib']) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

    const CERTS = [
    { title: "Certificat ISO 9001",   url: "certificates/iso9001.pdf" },
    { title: "Certificat PEFC",       url: "certificates/pefc.pdf" },
    { title: "Certificat ISO 14001",  url: "certificates/iso14001.pdf" },
    { title: "LICENȚA REPARAȚIE UIC-EUR",  url: "certificates/reparatie.pdf" },
    { title: "LICENȚA INTERMEDIERE TRANSPORT", url: "certificates/licenta-arr.pdf" },

  ];

  // === Generează thumbnails (prima pagină)
  const listEl = document.getElementById('certList');
  if (!listEl) return;

  function createItem(cert, index){
    const li = document.createElement('li');
    li.className = 'cert-item';

    const btn = document.createElement('button');
    btn.className = 'cert-card';
    btn.type = 'button';
    btn.setAttribute('aria-label', `Deschide ${cert.title}`);
    btn.dataset.index = index;

    const canvas = document.createElement('canvas');
    canvas.className = 'cert-thumb';
    btn.appendChild(canvas);

    const label = document.createElement('div');
    label.className = 'cert-label';
    label.textContent = cert.title;
    btn.appendChild(label);

    li.appendChild(btn);
    return { li, canvas, btn };
  }

  async function renderThumb(pdfUrl, canvas){
    try{
      const pdf  = await pdfjsLib.getDocument(pdfUrl).promise;
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });

      const maxW = canvas.parentElement.clientWidth || 300;
      const scale = maxW / base.width;
      const vp   = page.getViewport({ scale });

      // pentru thumbs e suficient 1x (rapid)
      canvas.width  = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    }catch(e){
      console.error('Thumb error:', e);
      const ctx = canvas.getContext('2d');
      canvas.width = 600; canvas.height = 850;
      ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#334155'; ctx.font = 'bold 22px system-ui';
      ctx.fillText('Previzualizare indisponibilă', 20, 44);
    }
  }

  (async function mount(){
    for (let i=0;i<CERTS.length;i++){
      const { li, canvas, btn } = createItem(CERTS[i], i);
      listEl.appendChild(li);
      renderThumb(CERTS[i].url, canvas);
      btn.addEventListener('click', () => openViewer(i));
    }
  })();

  // === Viewer cu FLIP + SCROLL + HiDPI
  let modal, pageCur, pageNext, pageNum, pageCnt, prevBtn, nextBtn, dlBtn, pageWrap, pageStage;
  let pdfDoc = null, currentPage = 1, totalPages = 1, animating = false;
  let resizeTimer = null;

  function ensureModal(){
    if (modal) return;
    const wrap = document.createElement('div');
    wrap.className = 'cert-modal';
    wrap.id = 'certModal';
    wrap.setAttribute('aria-hidden','true');
    wrap.innerHTML = `
      <div class="cert-backdrop" data-close></div>
      <div class="cert-dialog" role="dialog" aria-modal="true" aria-label="Vizualizare certificat">
        <button class="cert-close" id="certClose" aria-label="Închide">×</button>

        <div class="viewer-toolbar">
          <div class="viewer-left">
            <button class="nav-btn" id="prevPage" aria-label="Pagina anterioară" disabled>‹</button>
            <span class="page-indicator"><span id="pageNum">1</span> / <span id="pageCount">1</span></span>
            <button class="nav-btn" id="nextPage" aria-label="Pagina următoare" disabled>›</button>
          </div>
          <div class="viewer-right">
            <a class="download-btn" id="downloadPdf" href="#" download>Descarcă PDF</a>
          </div>
        </div>

        <div class="page-stage">
          <div class="page-wrap">
            <canvas id="pageCurrent" class="page-canvas"></canvas>
            <canvas id="pageNext" class="page-canvas"></canvas>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    modal     = wrap;
    pageCur   = modal.querySelector('#pageCurrent');
    pageNext  = modal.querySelector('#pageNext');
    pageNum   = modal.querySelector('#pageNum');
    pageCnt   = modal.querySelector('#pageCount');
    prevBtn   = modal.querySelector('#prevPage');
    nextBtn   = modal.querySelector('#nextPage');
    dlBtn     = modal.querySelector('#downloadPdf');
    pageWrap  = modal.querySelector('.page-wrap');
    pageStage = modal.querySelector('.page-stage');

    modal.querySelector('#certClose').addEventListener('click', closeViewer);
    modal.querySelector('[data-close]').addEventListener('click', closeViewer);
    prevBtn.addEventListener('click', goPrev);
    nextBtn.addEventListener('click', goNext);

    // Re-randare (debounced) la resize/rotate ca să păstrăm claritatea
    window.addEventListener('resize', () => {
      if (!pdfDoc) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => renderPage(currentPage, pageCur), 120);
    });
  }

  async function openViewer(index){
    ensureModal();
    const { url } = CERTS[index];

    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    dlBtn.href = url;

    try{
      pdfDoc = await pdfjsLib.getDocument(url).promise;
      totalPages = pdfDoc.numPages;
      currentPage = 1;
      pageCnt.textContent = totalPages;
      // ascundem canvasul de „rezervă” ca să nu apară colțul alb
      pageNext.style.opacity = '0';
      await renderPage(currentPage, pageCur);
      updateControls();
      pageStage.scrollTop = 0;
    }catch(err){
      console.error('Eroare PDF:', err);
    }
  }

  function closeViewer(){
    if (!modal) return;
    modal.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
    [pageCur, pageNext].forEach(c=>{
      const ctx=c.getContext('2d'); if(ctx) ctx.clearRect(0,0,c.width,c.height);
      c.removeAttribute('style');
    });
    pageWrap.style.height = '';
    pageNext.style.opacity = '0';
    pdfDoc = null; currentPage = 1; totalPages = 1; updateControls();
  }

  // ====== Randare HiDPI: clar pe mobil ======
  async function renderPage(num, targetCanvas){
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(num);

    // 1) Lățimea CSS disponibilă în container
    const containerW = pageWrap.getBoundingClientRect().width || 900;

    // 2) Scale CSS (cât vezi vizual)
    const base = page.getViewport({ scale: 1 });
    const scaleCSS = containerW / base.width;

    // 3) Scale „device” (HiDPI) — limităm la max 3x pentru performanță
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const scaleDev = scaleCSS * dpr;

    const vpCSS = page.getViewport({ scale: scaleCSS });
    const vpDev = page.getViewport({ scale: scaleDev  });

    // 4) Dimensiuni canvas interne (pixeli reali) + vizuale (CSS)
    targetCanvas.width  = Math.round(vpDev.width);
    targetCanvas.height = Math.round(vpDev.height);
    targetCanvas.style.width  = `${Math.round(vpCSS.width)}px`;
    targetCanvas.style.height = `${Math.round(vpCSS.height)}px`;

    // 5) Setăm înălțimea containerului = înălțimea paginii CSS -> permite scroll dacă e mai lungă
    pageWrap.style.height = `${Math.round(vpCSS.height)}px`;

    // 6) Randăm clar
    const ctx = targetCanvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vpDev }).promise;
  }

  function updateControls(){
    pageNum.textContent = String(currentPage);
    pageCnt.textContent = String(totalPages);
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  }

  async function goNext(){
    if (!pdfDoc || currentPage >= totalPages || animating) return;
    animating = true;
    const nextPageNum = currentPage + 1;

    await renderPage(nextPageNum, pageNext);   // pregătește pagina următoare (HiDPI)
    pageNext.style.opacity = '1';              // arătăm pânza secundară sub current
    pageCur.style.zIndex = 2; pageNext.style.zIndex = 1;
    pageWrap.classList.remove('flip-back');
    pageWrap.classList.add('flip-forward');

    await wait(430);
    swapToNext();
    currentPage = nextPageNum;
    updateControls();
    animating = false;
    pageStage.scrollTop = 0;
  }

  async function goPrev(){
    if (!pdfDoc || currentPage <= 1 || animating) return;
    animating = true;
    const prevPageNum = currentPage - 1;

    await renderPage(prevPageNum, pageNext);
    pageNext.style.opacity = '1';
    pageCur.style.zIndex = 2; pageNext.style.zIndex = 1;
    pageWrap.classList.remove('flip-forward');
    pageWrap.classList.add('flip-back');

    await wait(430);
    swapToNext();
    currentPage = prevPageNum;
    updateControls();
    animating = false;
    pageStage.scrollTop = 0;
  }

  function swapToNext(){
    // Copiem bitmap din pageNext în pageCur (fără re-randare)
    const ctxCur = pageCur.getContext('2d');
    ctxCur.clearRect(0,0,pageCur.width,pageCur.height);
    ctxCur.drawImage(pageNext, 0, 0);

    // Sincronizăm dimensiunile CSS + wrapper height
    pageCur.style.width  = pageNext.style.width;
    pageCur.style.height = pageNext.style.height;
    pageWrap.style.height = pageNext.style.height;

    // Curățăm pânza secundară și o ascundem iar
    const ctxNext = pageNext.getContext('2d');
    ctxNext.clearRect(0,0,pageNext.width,pageNext.height);
    pageNext.style.opacity = '0';

    pageWrap.classList.remove('flip-forward','flip-back');
  }

  function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }
})();
