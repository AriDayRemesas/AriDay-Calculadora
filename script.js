const SETTINGS_URL = "settings.json";
const SELECTED_SOURCE_KEY = "selected_source_currency_v1";
const COUNTRY_FLAGS = {
  ARS: "🇦🇷",
  MXN: "🇲🇽",
  BRL: "🇧🇷"
};

let sourceCurrencies = [];
let settingsByDocId = new Map();
let settingsList = [];
let settingsBySource = new Map();
let loadedSettingsSource = null;
let lastCalculation = null;
let lastCopyText = null;
let sourceOnLeft = true;
let selectedModeDocId = null;
let sourceCurrency = "ARS";

function getDom() {
  return {
    selectorGroup: document.querySelector(".selector-group"),
    directionSummary: document.getElementById("directionSummary"),
    fromSelect: document.getElementById("currencyFrom"),
    toSelect: document.getElementById("currencyTo"),
    amountInput: document.getElementById("amount"),
    resultText: document.getElementById("resultText"),
    copyResultBtn: document.getElementById("copyResultBtn"),
    resultNote: document.getElementById("resultNote")
  };
}

function readStoredSourceCurrency() {
  try {
    const stored = localStorage.getItem(SELECTED_SOURCE_KEY);
    if (stored && sourceCurrencies.includes(stored)) {
      return stored;
    }
  } catch (_error) {
    // Ignora errores de storage.
  }
  return sourceCurrencies[0] || "ARS";
}

function persistSourceCurrency(value) {
  try {
    localStorage.setItem(SELECTED_SOURCE_KEY, value);
  } catch (_error) {
    // Ignora errores de storage.
  }
}

function currencyPrefix(currencyCode) {
  return currencyCode === "BRL" ? "R$" : "$";
}

function applyCountryTheme(currency) {
  document.body.dataset.source = currency;
  const flagEl = document.getElementById("countryFlag");
  if (flagEl) {
    flagEl.textContent = COUNTRY_FLAGS[currency] || "🌎";
  }
}

function getSelectorRoles() {
  const { fromSelect, toSelect } = getDom();
  return sourceOnLeft
    ? { sourceSelect: fromSelect, modeSelect: toSelect }
    : { sourceSelect: toSelect, modeSelect: fromSelect };
}

function hasOptionValue(selectElement, value) {
  return Array.from(selectElement.options).some((option) => option.value === value);
}

function parseAmount(raw) {
  if (typeof raw !== "string") return NaN;
  const cleaned = raw.trim().replace(/\s/g, "");
  if (!cleaned) return NaN;

  const onlyAllowed = cleaned.replace(/[^0-9.,]/g, "");
  if (!onlyAllowed) return NaN;

  const hasDot = onlyAllowed.includes(".");
  const hasComma = onlyAllowed.includes(",");

  let normalized = onlyAllowed;

  if (hasDot && hasComma) {
    normalized = onlyAllowed.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = onlyAllowed.replace(",", ".");
  } else if (hasDot) {
    const parts = onlyAllowed.split(".");
    if (parts.length > 2) {
      normalized = onlyAllowed.replace(/\./g, "");
    }
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : NaN;
}

function formatAmount(value, maxFractionDigits = 2) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits
  }).format(value);
}

function asModeValue(docId) {
  return `MODE:${docId}`;
}

function parseModeValue(value) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("MODE:")) return null;
  return value.slice(5);
}

function getSettingBySelectValue(value) {
  const docId = parseModeValue(value);
  if (!docId) return null;
  return settingsByDocId.get(docId) || null;
}

function getCurrentModeLabel() {
  const { modeSelect } = getSelectorRoles();
  const selectedOption = modeSelect?.options?.[modeSelect.selectedIndex];
  if (selectedOption && selectedOption.textContent) {
    return selectedOption.textContent.trim();
  }
  return "Destino";
}

function applySelectorLayout() {
  const { selectorGroup, directionSummary } = getDom();
  if (!selectorGroup) return;
  selectorGroup.classList.toggle("swapped", !sourceOnLeft);
  if (directionSummary) {
    const modeLabel = getCurrentModeLabel();
    directionSummary.textContent = sourceOnLeft
      ? `Ingresar: ${sourceCurrency} | Recibir: ${modeLabel}`
      : `Ingresar: ${modeLabel} | ${sourceCurrency} requerido`;
  }
}

function validateSetting(docId, data) {
  if (!data || typeof data !== "object") return null;

  const numericKeys = ["Rbase", "Rcambio", "Rdifer", "Mmin", "Mmax", "Commission", "Exponent"];
  for (const key of numericKeys) {
    if (typeof data[key] !== "number" || !Number.isFinite(data[key])) return null;
  }

  if (data.Rcambio === 0) return null;
  if (data.Rdifer < 0) return null;
  if (data.Mmax <= data.Mmin) return null;
  if (data.Mmin <= 0) return null;
  const Rmin = data.Rbase / data.Rcambio;
  const Rmax = Rmin - data.Rdifer;
  if (!Number.isFinite(Rmin) || !Number.isFinite(Rmax) || Rmin <= 0 || Rmax <= 0) return null;

  return {
    docId,
    Rbase: data.Rbase,
    Rcambio: data.Rcambio,
    Rdifer: data.Rdifer,
    Mmin: data.Mmin,
    Mmax: data.Mmax,
    Commission: data.Commission,
    Exponent: data.Exponent,
    enabled: data.enabled === true,
    label: typeof data.label === "string" && data.label.trim() ? data.label.trim() : null,
    order: typeof data.order === "number" && Number.isFinite(data.order) ? data.order : 9999
  };
}

function parseSettingsForSource(source, docs) {
  if (!docs || typeof docs !== "object") {
    throw new Error(`Configuracion invalida para ${source}.`);
  }

  const parsed = [];
  for (const [docId, data] of Object.entries(docs)) {
    const setting = validateSetting(docId, data);
    if (setting && setting.enabled) parsed.push(setting);
  }
  parsed.sort((a, b) => a.order - b.order);

  if (parsed.length === 0) {
    throw new Error(`No hay configuraciones habilitadas para ${source}.`);
  }

  return parsed;
}

async function loadAllSettings() {
  const response = await fetch(`${SETTINGS_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${SETTINGS_URL}.`);
  }

  const data = await response.json();
  if (!data || typeof data !== "object") {
    throw new Error("El archivo de configuracion no es valido.");
  }

  sourceCurrencies = Object.keys(data);
  if (sourceCurrencies.length === 0) {
    throw new Error("No hay monedas origen configuradas.");
  }

  settingsBySource = new Map();
  for (const source of sourceCurrencies) {
    settingsBySource.set(source, parseSettingsForSource(source, data[source]));
  }
}

function useSettingsForSource(source) {
  const current = settingsBySource.get(source) || [];
  settingsList = current;
  settingsByDocId = new Map(current.map((item) => [item.docId, item]));
  loadedSettingsSource = source;
}

function ensureSourceSettings(source) {
  const inMemory = settingsBySource.get(source);
  if (Array.isArray(inMemory) && inMemory.length > 0) {
    return inMemory;
  }
  throw new Error(`No se pudo cargar configuracion para ${source}.`);
}

function ensureValidSelection(selectElement) {
  const currentOption = selectElement.options[selectElement.selectedIndex];
  if (currentOption && !currentOption.disabled && !currentOption.hidden) return;

  for (const option of Array.from(selectElement.options)) {
    if (!option.disabled && !option.hidden) {
      selectElement.value = option.value;
      return;
    }
  }
}

function applyOptionsFromSettings() {
  const { fromSelect, toSelect } = getDom();
  const modeOptions = settingsList.map((setting) => ({
    value: asModeValue(setting.docId),
    label: setting.label || setting.docId
  }));
  const currentModeValue = selectedModeDocId ? asModeValue(selectedModeDocId) : null;
  const defaultModeValue = modeOptions.length > 0 ? modeOptions[0].value : "";
  const resolvedModeValue = currentModeValue && modeOptions.some((opt) => opt.value === currentModeValue)
    ? currentModeValue
    : defaultModeValue;

  const buildSourceOnly = (select) => {
    select.innerHTML = "";
    for (const code of sourceCurrencies) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = code;
      select.appendChild(option);
    }
    if (hasOptionValue(select, sourceCurrency)) {
      select.value = sourceCurrency;
    }
    select.disabled = false;
  };

  const buildModesOnly = (select) => {
    select.innerHTML = "";
    for (const modeOption of modeOptions) {
      const option = document.createElement("option");
      option.value = modeOption.value;
      option.textContent = modeOption.label;
      select.appendChild(option);
    }
    select.disabled = false;
    if (resolvedModeValue && hasOptionValue(select, resolvedModeValue)) {
      select.value = resolvedModeValue;
    }
    ensureValidSelection(select);
  };

  if (sourceOnLeft) {
    buildSourceOnly(fromSelect);
    buildModesOnly(toSelect);
    selectedModeDocId = parseModeValue(toSelect.value);
  } else {
    buildModesOnly(fromSelect);
    buildSourceOnly(toSelect);
    selectedModeDocId = parseModeValue(fromSelect.value);
  }

  applySelectorLayout();
}

function calculateRate(amountArs, setting) {
  const Rmin = setting.Rbase / setting.Rcambio;
  const Rmax = Rmin - setting.Rdifer;

  if (amountArs <= setting.Mmin) return Rmin;
  if (amountArs >= setting.Mmax) return Rmax;

  return Rmin - (((amountArs - setting.Mmin) / (setting.Mmax - setting.Mmin)) * (Rmin - Rmax));
}

function calculateDynamicCommission(amountArs, setting) {
  if (amountArs < setting.Mmin) {
    return setting.Commission * ((setting.Mmin / amountArs) ** setting.Exponent);
  }
  return 0;
}

function convertArsToMode(amountArs, setting) {
  const rate = calculateRate(amountArs, setting);
  const dynamicCommission = calculateDynamicCommission(amountArs, setting);
  const result = (amountArs / rate) * (1 - (dynamicCommission / 100));
  return { amountArs, rate, dynamicCommission, result };
}

function convertModeToArs(targetAmount, setting) {
  let low = 0;
  let high = Math.max(targetAmount * setting.Rcambio * 2, setting.Mmin * 2, 1000);

  for (let i = 0; i < 40; i += 1) {
    const probe = convertArsToMode(high, setting).result;
    if (!Number.isFinite(probe) || probe >= targetAmount) break;
    high *= 2;
  }

  for (let i = 0; i < 70; i += 1) {
    const mid = (low + high) / 2;
    const probe = convertArsToMode(mid, setting).result;

    if (!Number.isFinite(probe) || probe < targetAmount) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return convertArsToMode(high, setting);
}

function renderError(message) {
  const { resultText, copyResultBtn, resultNote } = getDom();
  resultText.textContent = message;
  if (copyResultBtn) copyResultBtn.hidden = true;
  if (resultNote) {
    resultNote.hidden = true;
    resultNote.textContent = "";
  }
  lastCalculation = null;
  lastCopyText = null;
}

function formatMessageOutput(calc) {
  if (calc.modeDocId === "usd_cash") {
    return formatAmount(Math.floor(calc.output), 0);
  }
  return formatAmount(calc.output, 2);
}

function buildWhatsAppMessage(calc) {
  const hour = new Date().getHours();
  const saludo = hour < 12 ? "buenos días" : hour < 19 ? "buenas tardes" : "buenas noches";
  return [
    `Hola, ${saludo}`,
    `Quiero enviar ${calc.from} ${formatAmount(calc.input)} para recibir ${calc.to} ${formatMessageOutput(calc)}`
  ].join("\n");
}

function showCopyFeedback() {
  const { copyResultBtn } = getDom();
  if (!copyResultBtn) return;

  const originalLabel = copyResultBtn.getAttribute("aria-label") || "Copiar resultado";
  copyResultBtn.setAttribute("aria-label", "Copiado");
  window.setTimeout(() => {
    copyResultBtn.setAttribute("aria-label", originalLabel);
  }, 2000);
}

async function copyResult() {
  if (!lastCopyText) return;

  try {
    await navigator.clipboard.writeText(lastCopyText);
    showCopyFeedback();
    return;
  } catch (_error) {
    // Fallback para navegadores sin clipboard API.
  }

  const textarea = document.createElement("textarea");
  textarea.value = lastCopyText;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    showCopyFeedback();
  } catch (_error) {
    renderError("No se pudo copiar el resultado.");
  } finally {
    document.body.removeChild(textarea);
  }
}

function normalizePair() {
  const { sourceSelect, modeSelect } = getSelectorRoles();
  sourceSelect.value = sourceCurrency;
  sourceSelect.disabled = false;

  const firstModeValue = settingsList.length > 0 ? asModeValue(settingsList[0].docId) : "";
  if (!parseModeValue(modeSelect.value)) {
    modeSelect.value = firstModeValue;
  }
  modeSelect.disabled = false;
  selectedModeDocId = parseModeValue(modeSelect.value);
  applySelectorLayout();
}

async function calculate() {
  const { amountInput, resultText, copyResultBtn, resultNote } = getDom();

  if (settingsByDocId.size === 0 || loadedSettingsSource !== sourceCurrency) {
    try {
      ensureSourceSettings(sourceCurrency);
      useSettingsForSource(sourceCurrency);
      applyOptionsFromSettings();
    } catch (error) {
      renderError("No se pudo cargar la configuración.");
      console.error(error);
      return;
    }
  }
  normalizePair();

  const amount = parseAmount(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    renderError("Ingresa un monto válido mayor a 0.");
    return;
  }

  const { modeSelect } = getSelectorRoles();
  const modeValue = modeSelect.value;
  const setting = getSettingBySelectValue(modeValue);
  if (!setting) {
    renderError("Ese modo está deshabilitado o sin configuración.");
    return;
  }

  const conversion = sourceOnLeft
    ? convertArsToMode(amount, setting)
    : convertModeToArs(amount, setting);

  if (!Number.isFinite(conversion.result) || conversion.result <= 0 || !Number.isFinite(conversion.amountArs)) {
    renderError("No se pudo calcular con los parámetros actuales.");
    return;
  }

  const modeLabel = modeSelect.options[modeSelect.selectedIndex]?.textContent || setting.label || setting.docId;
  const outputAmount = sourceOnLeft ? conversion.result : conversion.amountArs;
  const sourceAmount = sourceOnLeft ? amount : outputAmount;
  const modeAmount = sourceOnLeft ? outputAmount : amount;
  const sourcePrefix = currencyPrefix(sourceCurrency);
  const modePrefix = "$";
  const mainText = sourceOnLeft
    ? `Con ${sourcePrefix} ${formatAmount(amount)} ${sourceCurrency} recibis aprox. ${modePrefix} ${formatAmount(outputAmount, 2)} ${modeLabel}`
    : `Recibis aprox. ${modePrefix} ${formatAmount(amount, 2)} ${modeLabel} con ${sourcePrefix} ${formatAmount(outputAmount)} ${sourceCurrency}`;

  resultText.innerHTML = `<strong>${mainText}</strong>`;

  if (resultNote) {
    if (setting.docId === "usd_cash" && modeAmount < 50) {
      resultNote.textContent = "Es posible que no haya disponibilidad para envios inferiores a 50 USD. Consulta con el proveedor de servicios.";
      resultNote.hidden = false;
    } else {
      resultNote.textContent = "";
      resultNote.hidden = true;
    }
  }

  lastCalculation = {
    from: sourceCurrency,
    to: modeLabel,
    input: sourceAmount,
    output: modeAmount,
    modeDocId: setting.docId,
    modeLabel: setting.label || setting.docId
  };
  lastCopyText = buildWhatsAppMessage(lastCalculation);

  if (copyResultBtn) copyResultBtn.hidden = false;
}

function swapCurrencies() {
  const { fromSelect, toSelect } = getDom();
  selectedModeDocId = parseModeValue(fromSelect.value) || parseModeValue(toSelect.value) || selectedModeDocId;
  sourceOnLeft = !sourceOnLeft;
  applyOptionsFromSettings();
  normalizePair();
}

function sendToWhatsApp() {
  const amountInput = document.getElementById("amount");
  const inputAmount = parseAmount(amountInput.value);

  if (!lastCalculation || !Number.isFinite(inputAmount) || inputAmount <= 0) {
    renderError("Primero realiza un cálculo válido.");
    return;
  }

  const text = buildWhatsAppMessage(lastCalculation);

  const whatsappNumber = "5491165218910";
  const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

async function init() {
  const { amountInput, resultText, fromSelect, toSelect, copyResultBtn, resultNote } = getDom();
  resultText.textContent = "Cargando configuración...";
  if (copyResultBtn) copyResultBtn.hidden = true;
  if (resultNote) resultNote.hidden = true;

  try {
    await loadAllSettings();
    sourceCurrency = readStoredSourceCurrency();
    applyCountryTheme(sourceCurrency);
    ensureSourceSettings(sourceCurrency);
    useSettingsForSource(sourceCurrency);
    applyOptionsFromSettings();
    normalizePair();
    resultText.textContent = "Listo para calcular.";
  } catch (error) {
    console.error(error);
    resultText.textContent = "No se pudo cargar la configuración.";
  }

  amountInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") calculate();
  });

  const syncModeSelection = () => {
    const { sourceSelect, modeSelect } = getSelectorRoles();
    const nextSourceCurrency = sourceSelect.value;

    if (nextSourceCurrency !== sourceCurrency) {
      sourceCurrency = nextSourceCurrency;
      persistSourceCurrency(sourceCurrency);
      applyCountryTheme(sourceCurrency);
      selectedModeDocId = null;
      resultText.textContent = "Cargando configuración...";
      if (copyResultBtn) copyResultBtn.hidden = true;
      if (resultNote) resultNote.hidden = true;
      try {
        ensureSourceSettings(sourceCurrency);
        useSettingsForSource(sourceCurrency);
        applyOptionsFromSettings();
        normalizePair();
        resultText.textContent = "Listo para calcular.";
      } catch (error) {
        console.error(error);
        settingsList = [];
        settingsByDocId = new Map();
        loadedSettingsSource = null;
        applyOptionsFromSettings();
        normalizePair();
        resultText.textContent = "No se pudo cargar la configuración para la moneda seleccionada.";
      }
      return;
    }

    selectedModeDocId = parseModeValue(modeSelect.value) || selectedModeDocId;
    normalizePair();
  };
  fromSelect.addEventListener("change", syncModeSelection);
  toSelect.addEventListener("change", syncModeSelection);
}

window.calculate = calculate;
window.swapCurrencies = swapCurrencies;
window.sendToWhatsApp = sendToWhatsApp;
window.copyResult = copyResult;

init();
