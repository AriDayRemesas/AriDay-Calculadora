let MIN_ARS, MIN_CUP, MIN_MLC, MIN_SALDO, RATE_MIN, RATE_MAX, RATE_MLC, RATE_USD, USD_EXTRA, CUP_POR_SALDO;
let MIN_ARS_CUP_EF, MIN_CUP_EF, RATE_MIN_CUP_EF, RATE_MAX_CUP_EF;
let lastResult = '';
let copyText = '';

function formatAR(num) {
  return num.toLocaleString('es-AR');
}

async function loadPrices() {
  try {
    const response = await fetch('prices.json', { cache: 'no-store' });
    const prices = await response.json();
    MIN_ARS = prices.MIN_ARS;
    MIN_CUP = prices.MIN_CUP;
    MIN_MLC = prices.MIN_MLC;
    MIN_SALDO = prices.MIN_SALDO;
    RATE_MIN = prices.RATE_MIN;
    RATE_MAX = prices.RATE_MAX;
    RATE_MLC = prices.RATE_MLC;
    RATE_USD = prices.RATE_USD;
    USD_EXTRA = prices.USD_EXTRA;
    CUP_POR_SALDO = prices.CUP_POR_SALDO;
    MIN_ARS_CUP_EF = prices.MIN_ARS_CUP_EF;
    MIN_CUP_EF = prices.MIN_CUP_EF;
    RATE_MIN_CUP_EF = prices.RATE_MIN_CUP_EF;
    RATE_MAX_CUP_EF = prices.RATE_MAX_CUP_EF;
  } catch (error) {
    console.error('Error loading prices:', error);
  }
}

function enforceNumericInput(event) {
  let value = event.target.value.replace(/\D/g, '');
  if (value.length > 9) value = value.slice(0, 9);
  value = value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  event.target.value = value;
}

function updateDisabledOptions() {
  const from = document.getElementById('currencyFrom').value;
  const toSelect = document.getElementById('currencyTo');
  for (let opt of toSelect.options) {
    opt.disabled = (
      opt.value === from ||
      (from === 'CUP' && opt.value === 'MLC') ||
      (from === 'CUP_EF' && opt.value === 'MLC') ||
      (from === 'MLC' && opt.value === 'CUP') ||
      (from === 'MLC' && opt.value === 'CUP_EF') ||
      ((from === 'SALDO' || opt.value === 'SALDO') && (from !== 'ARS' && opt.value !== 'ARS'))
    );
  }
  if (from === toSelect.value) {
    toSelect.value = (from === 'ARS') ? 'CUP' : 'ARS';
  }
}

function swapCurrencies() {
  const f = document.getElementById('currencyFrom');
  const t = document.getElementById('currencyTo');
  [f.value, t.value] = [t.value, f.value];
  updateDisabledOptions();
  document.getElementById('amount').value = '';
  document.getElementById('resultText').textContent = '';
  lastResult = '';
  copyText = '';
  const copyBtn = document.getElementById('copyBtn');
  if (copyBtn) copyBtn.style.display = 'none';
}

function rateForCup(cup) {
  if (cup <= MIN_CUP) return RATE_MIN;
  if (cup >= 100000) return RATE_MAX;
  const slope = (RATE_MAX - RATE_MIN) / (100000 - MIN_CUP);
  return RATE_MIN + slope * (cup - MIN_CUP);
}

function cupToArs(cup) { return cup * rateForCup(cup); }

function arsToCup(ars) {
  if (ars >= RATE_MAX * 100000) {
    return Math.floor(ars / RATE_MAX);
  }
  let low = MIN_CUP, high = 100000, mid, est;
  for (let i = 0; i < 50; i++) {
    mid = (low + high) / 2;
    est = cupToArs(mid);
    if (est > ars) high = mid; else low = mid;
  }
  return mid;
}

function rateForCupEfectivo(cup) {
  if (cup <= MIN_CUP_EF) return RATE_MIN_CUP_EF;
  if (cup >= 100000) return RATE_MAX_CUP_EF;
  const slope = (RATE_MAX_CUP_EF - RATE_MIN_CUP_EF) / (100000 - MIN_CUP_EF);
  return RATE_MIN_CUP_EF + slope * (cup - MIN_CUP_EF);
}

function cupEfectivoToArs(cup) { return cup * rateForCupEfectivo(cup); }

function arsToCupEfectivo(ars) {
  if (ars >= RATE_MAX_CUP_EF * 100000) {
    return Math.floor(ars / RATE_MAX_CUP_EF);
  }
  let low = MIN_CUP_EF, high = 100000, mid, est;
  for (let i = 0; i < 50; i++) {
    mid = (low + high) / 2;
    est = cupEfectivoToArs(mid);
    if (est > ars) high = mid; else low = mid;
  }
  return mid;
}

function cupToArsFixed(cup) { return cup * RATE_MIN; }

function arsToCupFixed(ars) { return ars / RATE_MIN; }

function arsMinParaSaldoMinimo() {
  const cupMin = MIN_SALDO * CUP_POR_SALDO;
  return Math.round(cupMin * RATE_MIN);
}

function copyToClipboard() {
  if (!copyText) return;
  
  navigator.clipboard.writeText(copyText).then(() => {
    const copyBtn = document.getElementById('copyBtn');
    const originalHTML = copyBtn.innerHTML;
    copyBtn.innerHTML = '✓';
    setTimeout(() => {
      copyBtn.innerHTML = originalHTML;
    }, 1000);
  }).catch(err => {
    console.error('Error copying to clipboard:', err);
  });
}

function showCopyButton() {
  let copyBtn = document.getElementById('copyBtn');
  if (!copyBtn) {
    copyBtn = document.createElement('button');
    copyBtn.id = 'copyBtn';
    copyBtn.className = 'copy-btn';
    copyBtn.innerHTML = '📋';
    copyBtn.onclick = copyToClipboard;
    const resultText = document.getElementById('resultText');
    resultText.appendChild(copyBtn);
  }
  copyBtn.style.display = 'inline-flex';
}

function calculate() {
  const from = document.getElementById('currencyFrom').value;
  const to   = document.getElementById('currencyTo').value;
  const raw  = document.getElementById('amount').value;
  const num  = parseFloat(raw.replace(/\./g, ''));
  const out  = document.getElementById('resultText');
  out.textContent = ''; lastResult = ''; copyText = '';
  
  const copyBtn = document.getElementById('copyBtn');
  if (copyBtn) copyBtn.style.display = 'none';

  if (from === to) {
    out.textContent = 'Seleccione monedas diferentes.';
    return;
  }
  if (!raw || isNaN(num)) {
    out.textContent = 'Ingrese un monto válido.';
    return;
  }

  if (from==='ARS' && to==='CUP') {
    if (num < MIN_ARS) {
      out.textContent = `ARS ≥ ${formatAR(MIN_ARS)}.`;
      return;
    }
    const cup = Math.round(arsToCup(num));
    out.textContent = `💲 Con ${formatAR(num)} ARS recibís aprox. ${formatAR(cup)} CUP.`;
    copyText = `Con ${formatAR(num)} ARS Recibis aprox. ${formatAR(cup)} CUP.`;
    lastResult = `Quiero enviar ${formatAR(num)} ARS y recibir ${formatAR(cup)} CUP.`;
    showCopyButton();
  }
  else if (from==='CUP' && to==='ARS') {
    if (num < MIN_CUP) {
      out.textContent = `CUP ≥ ${formatAR(MIN_CUP)}.`;
      return;
    }
    const ars = Math.round(cupToArs(num));
    out.textContent = `💲 Recibis aprox. ${formatAR(num)} CUP con ${formatAR(ars)} ARS.`;
    copyText = `Recibis ${formatAR(num)} CUP con ${formatAR(ars)} ARS.`;
    lastResult = `Quiero enviar ${formatAR(ars)} ARS y recibir ${formatAR(num)} CUP.`;
    showCopyButton();
  }
  else if (from==='ARS' && to==='CUP_EF') {
    if (num < MIN_ARS_CUP_EF) {
      out.textContent = `ARS ≥ ${formatAR(MIN_ARS_CUP_EF)}.`;
      return;
    }
    const cup = Math.round(arsToCupEfectivo(num));
    out.textContent = `💲 Con ${formatAR(num)} ARS recibís aprox. ${formatAR(cup)} CUP Efectivo.`;
    copyText = `Con ${formatAR(num)} ARS Recibis aprox. ${formatAR(cup)} CUP Efectivo.`;
    lastResult = `Quiero enviar ${formatAR(num)} ARS y recibir ${formatAR(cup)} CUP Efectivo.`;
    showCopyButton();
  }
  else if (from==='CUP_EF' && to==='ARS') {
    if (num < MIN_CUP_EF) {
      out.textContent = `CUP Efectivo ≥ ${formatAR(MIN_CUP_EF)}.`;
      return;
    }
    const ars = Math.round(cupEfectivoToArs(num));
    out.textContent = `💲 Recibis aprox. ${formatAR(num)} CUP Efectivo con ${formatAR(ars)} ARS.`;
    copyText = `Recibis ${formatAR(num)} CUP Efectivo con ${formatAR(ars)} ARS.`;
    lastResult = `Quiero enviar ${formatAR(ars)} ARS y recibir ${formatAR(num)} CUP Efectivo.`;
    showCopyButton();
  }
  else if (from==='ARS' && to==='MLC') {
    if (num < MIN_ARS) {
      out.textContent = `ARS ≥ ${formatAR(MIN_ARS)}.`;
      return;
    }
    const mlc = (num / RATE_MLC).toFixed(2);
    out.textContent = `💲 Con ${formatAR(num)} ARS recibís aprox. ${mlc} MLC.`;
    copyText = `Con ${formatAR(num)} ARS Recibis aprox. ${mlc} MLC.`;
    lastResult = `Quiero enviar ${formatAR(num)} ARS y recibir ${mlc} MLC.`;
    showCopyButton();
  }
  else if (from==='MLC' && to==='ARS') {
    if (num < MIN_MLC) {
      out.textContent = `MLC ≥ ${MIN_MLC}.`;
      return;
    }
    const ars = Math.round(num * RATE_MLC);
    out.textContent = `💲 Recibis aprox. ${num} MLC con ${formatAR(ars)} ARS.`;
    copyText = `Recibis ${num} MLC con ${formatAR(ars)} ARS.`;
    lastResult = `Quiero enviar ${formatAR(ars)} ARS y recibir ${num} MLC.`;
    showCopyButton();
  }
  else if (from==='ARS' && to==='USD') {
    if (num < MIN_ARS) {
      out.textContent = `ARS ≥ ${formatAR(MIN_ARS)}.`;
      return;
    }
    const usd = Math.round(num / (RATE_USD * (1 + USD_EXTRA)));
    out.textContent = `💲 Con ${formatAR(num)} ARS recibís aprox. ${formatAR(usd)} USD Efectivo.`;
    copyText = `Con ${formatAR(num)} ARS Recibis aprox. ${formatAR(usd)} USD Efectivo.`;
    lastResult = `Quiero enviar ${formatAR(num)} ARS y recibir ${formatAR(usd)} USD Efectivo.`;
    showCopyButton();
  }
  else if (from==='USD' && to==='ARS') {
    const ars = Math.round(num * (1 + USD_EXTRA) * RATE_USD);
    out.textContent = `💲 Recibis aprox. ${formatAR(num)} USD Efectivo con ${formatAR(ars)} ARS.`;
    copyText = `Recibis ${formatAR(num)} USD Efectivo con ${formatAR(ars)} ARS.`;
    lastResult = `Quiero enviar ${formatAR(ars)} ARS y recibir ${formatAR(num)} USD Efectivo.`;
    showCopyButton();
  }
  else if (from==='ARS' && to==='SALDO') {
    const minArsSaldo = arsMinParaSaldoMinimo();
    if (num < minArsSaldo) {
      out.textContent = `ARS ≥ ${formatAR(minArsSaldo)} (equiv. a ${MIN_SALDO} Saldo).`;
      return;
    }
    const cup = arsToCupFixed(num);
    const saldo = Math.round(cup / CUP_POR_SALDO);
    out.textContent = `💲 Con ${formatAR(num)} ARS recibís aprox. ${formatAR(saldo)} Saldo Móvil.`;
    copyText = `Con ${formatAR(num)} ARS Recibis aprox. ${formatAR(saldo)} Saldo Móvil.`;
    lastResult = `Quiero enviar ${formatAR(num)} ARS y recibir ${formatAR(saldo)} Saldo Móvil.`;
    showCopyButton();
  }
  else if (from==='SALDO' && to==='ARS') {
    if (num < MIN_SALDO) {
      out.textContent = `Saldo ≥ ${formatAR(MIN_SALDO)}.`;
      return;
    }
    const cup = num * CUP_POR_SALDO;
    const ars = Math.round(cupToArsFixed(cup));
    out.textContent = `💲 Recibis aprox. ${formatAR(num)} Saldo Móvil con ${formatAR(ars)} ARS.`;
    copyText = `Recibis ${formatAR(num)} Saldo Móvil con ${formatAR(ars)} ARS.`;
    lastResult = `Quiero enviar ${formatAR(ars)} ARS y recibir ${formatAR(num)} Saldo Móvil.`;
    showCopyButton();
  }
  else if (from==='SALDO' || to==='SALDO') {
    out.textContent = '⛔ Conversión con Saldo Móvil no permitida (solo ARS ⇄ Saldo).';
  }
  else {
    out.textContent = '⛔ Conversión CUP ⇄ MLC no permitida.';
  }
}

function sendToWhatsApp() {
  if (!lastResult) {
    alert('Primero calcula un monto válido antes de enviar.');
    return;
  }
  const phone = '5491165218910';
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lastResult)}`, '_blank');
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadPrices();
  updateDisabledOptions();
  document.getElementById('currencyFrom').addEventListener('change', updateDisabledOptions);
  document.getElementById('currencyTo').addEventListener('change', updateDisabledOptions);
  document.getElementById('amount').addEventListener('input', enforceNumericInput);
});

