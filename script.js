let MIN_ARS, MIN_CUP, MIN_MLC, MIN_SALDO, RATE_MIN, RATE_MAX, RATE_MLC, RATE_USD, USD_EXTRA, CUP_POR_SALDO;
let lastResult = '';

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
  } catch (error) {
    console.error('Error loading prices:', error);
  }
}

function enforceNumericInput(event) {
  let value = event.target.value.replace(/\D/g, '');
  if (value.length > 9) value = value.slice(0, 9);
  value = value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  event.target.value = value;
}

function updateDisabledOptions() {
  const from = document.getElementById('currencyFrom').value;
  const toSelect = document.getElementById('currencyTo');
  for (let opt of toSelect.options) {
    opt.disabled = (
      opt.value === from ||
      (from === 'CUP' && opt.value === 'MLC') ||
      (from === 'MLC' && opt.value === 'CUP') ||
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

function cupToArsFixed(cup) { return cup * RATE_MIN; }

function arsToCupFixed(ars) { return ars / RATE_MIN; }

function arsMinParaSaldoMinimo() {
  const cupMin = MIN_SALDO * CUP_POR_SALDO;
  return Math.round(cupMin * RATE_MIN);
}

function copyToClipboard() {
  const resultText = document.getElementById('resultText').textContent;
  if (!resultText) return;
  
  navigator.clipboard.writeText(resultText).then(() => {
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
  const num  = parseFloat(raw.replace(/,/g, ''));
  const out  = document.getElementById('resultText');
  out.textContent = ''; lastResult = '';
  
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
      out.textContent = `ARS ≥ ${MIN_ARS.toLocaleString()}.`;
      return;
    }
    const cup = Math.round(arsToCup(num));
    out.textContent = `💲 Con ${num.toLocaleString()} ARS recibís aprox. ${cup.toLocaleString()} CUP.`;
    lastResult = `Quiero enviar ${num.toLocaleString()} ARS y recibir ${cup.toLocaleString()} CUP.`;
    showCopyButton();
  }
  else if (from==='CUP' && to==='ARS') {
    if (num < MIN_CUP) {
      out.textContent = `CUP ≥ ${MIN_CUP.toLocaleString()}.`;
      return;
    }
    const ars = Math.round(cupToArs(num));
    out.textContent = `💲 Recibis aprox. ${num.toLocaleString()} CUP con ${ars.toLocaleString()} ARS.`;
    lastResult = `Quiero enviar ${ars.toLocaleString()} ARS y recibir ${num.toLocaleString()} CUP.`;
    showCopyButton();
  }
  else if (from==='ARS' && to==='MLC') {
    if (num < MIN_ARS) {
      out.textContent = `ARS ≥ ${MIN_ARS.toLocaleString()}.`;
      return;
    }
    const mlc = (num / RATE_MLC).toFixed(2);
    out.textContent = `💲 Con ${num.toLocaleString()} ARS recibís aprox. ${mlc} MLC.`;
    lastResult = `Quiero enviar ${num.toLocaleString()} ARS y recibir ${mlc} MLC.`;
    showCopyButton();
  }
  else if (from==='MLC' && to==='ARS') {
    if (num < MIN_MLC) {
      out.textContent = `MLC ≥ ${MIN_MLC}.`;
      return;
    }
    const ars = Math.round(num * RATE_MLC);
    out.textContent = `💲 Recibis aprox. ${num} MLC con ${ars.toLocaleString()} ARS.`;
    lastResult = `Quiero enviar ${ars.toLocaleString()} ARS y recibir ${num} MLC.`;
    showCopyButton();
  }
  else if (from==='ARS' && to==='USD') {
    if (num < MIN_ARS) {
      out.textContent = `ARS ≥ ${MIN_ARS.toLocaleString()}.`;
      return;
    }
    const usd = Math.round(num / (RATE_USD * (1 + USD_EXTRA)));
    out.textContent = `💲 Con ${num.toLocaleString()} ARS recibís aprox. ${usd.toLocaleString()} USD Efectivo.`;
    lastResult = `Quiero enviar ${num.toLocaleString()} ARS y recibir ${usd.toLocaleString()} USD Efectivo.`;
    showCopyButton();
  }
  else if (from==='USD' && to==='ARS') {
    const ars = Math.round(num * (1 + USD_EXTRA) * RATE_USD);
    out.textContent = `💲 Recibis aprox. ${num.toLocaleString()} USD Efectivo con ${ars.toLocaleString()} ARS.`;
    lastResult = `Quiero enviar ${ars.toLocaleString()} ARS y recibir ${num.toLocaleString()} USD Efectivo.`;
    showCopyButton();
  }
  else if (from==='ARS' && to==='SALDO') {
    const minArsSaldo = arsMinParaSaldoMinimo();
    if (num < minArsSaldo) {
      out.textContent = `ARS ≥ ${minArsSaldo.toLocaleString()} (equiv. a ${MIN_SALDO} Saldo).`;
      return;
    }
    const cup = arsToCupFixed(num);
    const saldo = Math.round(cup / CUP_POR_SALDO);
    out.textContent = `💲 Con ${num.toLocaleString()} ARS recibís aprox. ${saldo.toLocaleString()} Saldo Móvil.`;
    lastResult = `Quiero enviar ${num.toLocaleString()} ARS y recibir ${saldo.toLocaleString()} Saldo Móvil.`;
    showCopyButton();
  }
  else if (from==='SALDO' && to==='ARS') {
    if (num < MIN_SALDO) {
      out.textContent = `Saldo ≥ ${MIN_SALDO.toLocaleString()}.`;
      return;
    }
    const cup = num * CUP_POR_SALDO;
    const ars = Math.round(cupToArsFixed(cup));
    out.textContent = `💲 Recibis aprox. ${num.toLocaleString()} Saldo Móvil con ${ars.toLocaleString()} ARS.`;
    lastResult = `Quiero enviar ${ars.toLocaleString()} ARS y recibir ${num.toLocaleString()} Saldo Móvil.`;
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
