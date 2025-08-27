/* Viewer PDF: FLIP + SCROLL vertical. Pagina se randează la lățimea containerului,
   fără să fie micșorată pe înălțime; dacă e lungă, derulezi în modal. */
(function () {
  if (window['pdfjsLib']) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  const CERTS = [
    { title: "Certificat ISO 9001",   url: "certificates/iso9001.pdf" },
    { title: "Certificat ISO 14001",  url: "certificates/iso14001.pdf" },
    { title: "LICENȚA REPARAȚIE UIC-EUR",  url: "certificates/reparatie.pdf" },
    { title: "LICENȚA INTERMEDIERE TRANSPORT", url: "certificates/licenta-arr.pdf" },
    { title: "Certificat PEFC",       url: "certificates/pefc.pdf" },
  ];

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

      canvas.width  = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    }catch(e){
      console.error('Thumb error:', e);
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

  // ===== Viewer (flip + scroll) =====
  let modal, pageCur, pageNext, pageNum, pageCnt, prevBtn, nextBtn, pageWrap, pageStage;
  let pdfDoc = null, currentPage = 1, totalPages = 1, animating = false;

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
    pageWrap  = modal.querySelector('.page-wrap');
    pageStage = modal.querySelector('.page-stage');

    modal.querySelector('#certClose').addEventListener('click', closeViewer);
    modal.querySelector('[data-close]').addEventListener('click', closeViewer);
    prevBtn.addEventListener('click', goPrev);
    nextBtn.addEventListener('click', goNext);

    window.addEventListener('resize', () => { if (pdfDoc) renderPage(currentPage, pageCur); });
  }

  async function openViewer(index){
    ensureModal();
    const { url } = CERTS[index];
    modal.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';

    try{
      pdfDoc = await pdfjsLib.getDocument(url).promise;
      totalPages = pdfDoc.numPages;
      currentPage = 1;
      pageCnt.textContent = totalPages;
      await renderPage(currentPage, pageCur);
      updateControls();
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
      c.style.width = c.style.height = '';
    });
    pageWrap.style.height = '';
    pdfDoc = null; currentPage = 1; totalPages = 1; updateControls();
  }

  // === Randare: POTRIVIRE PE LĂȚIME, înălțime naturală; scroll în .page-stage ===
  async function renderPage(num, targetCanvas){
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(num);

    const containerW = pageWrap.getBoundingClientRect().width || 900;
    const base = page.getViewport({ scale: 1 });
    const scale = containerW / base.width;
    const vp    = page.getViewport({ scale });

    targetCanvas.width  = Math.floor(vp.width);
    targetCanvas.height = Math.floor(vp.height);
    targetCanvas.style.width  = `${Math.floor(vp.width)}px`;
    targetCanvas.style.height = `${Math.floor(vp.height)}px`;

    pageWrap.style.height = `${Math.floor(vp.height)}px`;

    const ctx = targetCanvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
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

    await renderPage(nextPageNum, pageNext);
    pageCur.style.zIndex = 2; pageNext.style.zIndex = 1;
    pageWrap.classList.remove('flip-back');
    pageWrap.classList.add('flip-forward');

    await new Promise(r=>setTimeout(r, 430));
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
    pageCur.style.zIndex = 2; pageNext.style.zIndex = 1;
    pageWrap.classList.remove('flip-forward');
    pageWrap.classList.add('flip-back');

    await new Promise(r=>setTimeout(r, 430));
    swapToNext();
    currentPage = prevPageNum;
    updateControls();
    animating = false;
    pageStage.scrollTop = 0;
  }

  function swapToNext(){
    const ctxCur = pageCur.getContext('2d');
    ctxCur.clearRect(0,0,pageCur.width,pageCur.height);
    ctxCur.drawImage(pageNext, 0, 0);

    pageCur.style.width  = pageNext.style.width;
    pageCur.style.height = pageNext.style.height;
    pageWrap.style.height = pageNext.style.height;

    const ctxNext = pageNext.getContext('2d');
    ctxNext.clearRect(0,0,pageNext.width,pageNext.height);

    pageWrap.classList.remove('flip-forward','flip-back');
  }
})();
