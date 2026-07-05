const DATA_ROOT = "data";
const PATHS = {
  latest: `${DATA_ROOT}/current/latest.json`,
  soilLatest: `${DATA_ROOT}/current/soil_latest.json`,
  image: `${DATA_ROOT}/images/latest.jpg`,
};

const HARVEST_STORAGE_KEY = "farmMonitorHarvestSettings";
const HARVEST_DEFAULTS = {
  source: "air",
  threshold: 18000,
  start: "",
};

const FIELD_DEFINITIONS = {
  temperature: { label: "温度", unit: "degC", digits: 1, color: "#b86b16", note: "INKBIRD ITH-11-B" },
  humidity: { label: "湿度", unit: "%", digits: 1, color: "#2f6f9f", note: "相対湿度" },
  battery: { label: "Battery", unit: "%", digits: 0, color: "#2f7d46", note: "センサー電池" },
  rssi: { label: "RSSI", unit: "dBm", digits: 0, color: "#5f6673", note: "BLE受信強度" },
  timestamp: { label: "温湿度更新", unit: "", digits: 0, color: "#66736a", note: "latest.json" },
  soil_timestamp: { label: "土壌更新", unit: "", digits: 0, color: "#66736a", note: "soil_latest.json" },
  soil_moisture_pct: { label: "土壌水分", unit: "%", digits: 1, color: "#7b6f36", note: "土壌センサー" },
  soil_temperature_c: { label: "土壌温度", unit: "degC", digits: 1, color: "#9a6a2f", note: "土壌センサー" },
  soil_ec_us_cm: { label: "土壌EC", unit: "uS/cm", digits: 0, color: "#7a5ca8", note: "土壌センサー" },
  soil_ph: { label: "土壌pH", unit: "", digits: 1, color: "#b7554f", note: "土壌センサー" },
  illuminance: { label: "照度", unit: "lx", digits: 0, color: "#c69214", note: "追加センサー" },
  soil_moisture: { label: "土壌水分", unit: "%", digits: 1, color: "#7b6f36", note: "追加センサー" },
  ec: { label: "EC", unit: "mS/cm", digits: 2, color: "#7a5ca8", note: "追加センサー" },
  ph: { label: "pH", unit: "", digits: 2, color: "#b7554f", note: "追加センサー" },
  pressure: { label: "気圧", unit: "hPa", digits: 1, color: "#64748b", note: "追加センサー" },
  rainfall: { label: "雨量", unit: "mm", digits: 1, color: "#2563eb", note: "追加センサー" },
};

const PRIMARY_METRICS = ["temperature", "humidity", "battery", "rssi", "timestamp", "soil_timestamp"];
const ENVIRONMENT_FIELDS = ["temperature", "humidity"];
const HEALTH_FIELDS = ["battery", "rssi"];
const SOIL_WATER_FIELDS = ["soil_moisture_pct", "soil_temperature_c"];
const SOIL_CHEM_FIELDS = ["soil_ec_us_cm", "soil_ph"];
const SOIL_FIELDS = [...SOIL_WATER_FIELDS, ...SOIL_CHEM_FIELDS, "soil_timestamp"];
const RANGE_OPTIONS = [
  { key: "6h", label: "6時間", hours: 6 },
  { key: "24h", label: "24時間", hours: 24 },
  { key: "3d", label: "3日", hours: 72 },
  { key: "7d", label: "7日", hours: 168 },
  { key: "all", label: "全期間", hours: null },
];

const state = {
  charts: {},
  latest: {},
  rows: [],
  soilRows: [],
  activeRange: localStorage.getItem("farmMonitorRange") || "24h",
  harvest: loadHarvestSettings(),
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderMetricCards({});
  renderUpdateSummary();
  renderRangeControls();
  renderHarvestControls();
  renderHarvestEstimator();
  document.getElementById("rangeControls").addEventListener("click", handleRangeClick);
  document.getElementById("harvestSource").addEventListener("change", handleHarvestInput);
  document.getElementById("harvestStart").addEventListener("input", handleHarvestInput);
  document.getElementById("harvestThreshold").addEventListener("input", handleHarvestInput);

  try {
    const latest = await fetchJson(PATHS.latest);
    state.latest = { ...state.latest, ...latest };
    renderLatest();
    await Promise.all([loadMonthlyLog(latest), loadSoilData(), loadLatestImage()]);
    renderHarvestEstimator();
    setStatus("データ更新済み");
  } catch (error) {
    setStatus("データを読み込めません", true);
    setText("chartSummary", "データを読み込めません");
    renderUpdateSummary();
    renderMetricCards(state.latest);
    renderHarvestEstimator();
    renderEmptyChart("environmentChart", "データを読み込めません");
    renderEmptyChart("healthChart", "データを読み込めません");
    document.getElementById("latestImage").hidden = true;
    document.getElementById("noImage").hidden = false;
  }
}

function renderLatest() {
  renderMetricCards(state.latest);
  renderUpdateSummary();
}

function renderUpdateSummary() {
  const environmentTime = formatDateTime(state.latest.timestamp);
  const soilTime = formatDateTime(state.latest.soil_timestamp);
  setText("lastUpdated", `データ更新: 温湿度 ${environmentTime} / 土壌 ${soilTime}`);
}

function renderRangeControls() {
  const wrap = document.getElementById("rangeControls");
  wrap.innerHTML = RANGE_OPTIONS.map((option) => {
    const active = option.key === state.activeRange ? " active" : "";
    return `<button class="range-button${active}" type="button" data-range="${option.key}">${option.label}</button>`;
  }).join("");
}

function renderHarvestControls() {
  document.getElementById("harvestSource").value = state.harvest.source;
  document.getElementById("harvestStart").value = state.harvest.start;
  document.getElementById("harvestThreshold").value = state.harvest.threshold;
}

function handleRangeClick(event) {
  const button = event.target.closest("button[data-range]");
  if (!button) return;
  state.activeRange = button.dataset.range;
  localStorage.setItem("farmMonitorRange", state.activeRange);
  renderRangeControls();
  updateCharts();
}

function handleHarvestInput(event) {
  const { id, value } = event.target;
  if (id === "harvestSource") state.harvest.source = value;
  if (id === "harvestStart") state.harvest.start = value;
  if (id === "harvestThreshold") state.harvest.threshold = Number(value) || HARVEST_DEFAULTS.threshold;
  saveHarvestSettings();
  renderHarvestEstimator();
}

async function loadMonthlyLog(latest) {
  const logPath = latest.log_path || buildMonthlyLogPath(latest.timestamp);
  setText("environmentSource", logPath || "月次CSV");

  if (!logPath) {
    renderEmptyChart("environmentChart", "CSVパスを判定できません");
    renderEmptyChart("healthChart", "CSVパスを判定できません");
    return;
  }

  const csv = await fetchText(`${DATA_ROOT}/${logPath}`);
  state.rows = parseCsv(csv)
    .map(normalizeRow)
    .filter((row) => row.timestamp && row.date)
    .sort((a, b) => a.date - b.date);

  if (!state.rows.length) {
    renderEmptyChart("environmentChart", "CSVデータがありません");
    renderEmptyChart("healthChart", "CSVデータがありません");
    setText("chartSummary", "CSVデータがありません");
    return;
  }

  updateCharts();
  renderHarvestEstimator();
}

async function loadSoilData() {
  const soilPanel = document.getElementById("soilPanel");

  try {
    const soilLatest = await fetchJson(PATHS.soilLatest);
    const { timestamp, ...soilValues } = soilLatest;
    state.latest = { ...state.latest, ...soilValues, soil_timestamp: timestamp };
    renderLatest();

    const logPath = soilLatest.log_path || buildSoilMonthlyLogPath(timestamp);
    const updatedText = timestamp ? ` / 土壌更新: ${formatDateTime(timestamp)}` : "";
    setText("soilSource", `${logPath || "月次CSV"}${updatedText}`);

    if (!logPath) {
      soilPanel.hidden = false;
      renderEmptyChart("soilWaterChart", "CSVパスを判定できません");
      renderEmptyChart("soilChemChart", "CSVパスを判定できません");
      renderHarvestEstimator();
      return;
    }

    const csv = await fetchText(`${DATA_ROOT}/${logPath}`);
    state.soilRows = parseCsv(csv)
      .map(normalizeRow)
      .filter((row) => row.timestamp && row.date)
      .sort((a, b) => a.date - b.date);

    if (!state.soilRows.length) {
      soilPanel.hidden = false;
      renderEmptyChart("soilWaterChart", "土壌CSVデータがありません");
      renderEmptyChart("soilChemChart", "土壌CSVデータがありません");
      renderHarvestEstimator();
      return;
    }

    updateSoilCharts();
    renderHarvestEstimator();
  } catch (error) {
    state.soilRows = [];
    soilPanel.hidden = true;
    renderHarvestEstimator();
  }
}

function updateCharts() {
  updateSoilCharts();
  if (!state.rows.length) return;

  const visibleRows = getVisibleRows(state.rows);
  const chartRows = downsampleRows(visibleRows, maxChartPoints());
  const range = currentRange();

  if (!visibleRows.length) {
    renderEmptyChart("environmentChart", "選択期間にデータがありません");
    renderEmptyChart("healthChart", "選択期間にデータがありません");
    setText("chartSummary", `${range.label}: データなし`);
    return;
  }

  setText(
    "chartSummary",
    `${range.label}: 温湿度 ${visibleRows.length}件 / ${state.rows.length}件中${chartRows.length < visibleRows.length ? `（描画 ${chartRows.length}点に間引き）` : ""}`,
  );

  renderBatteryInsight(visibleRows);

  renderLineChart("environmentChart", chartRows, ENVIRONMENT_FIELDS, {
    leftTitle: "温度 (degC)",
    rightTitle: "湿度 (%)",
  });

  renderLineChart("healthChart", chartRows, HEALTH_FIELDS, {
    leftTitle: "Battery (%)",
    rightTitle: "RSSI (dBm)",
  });

  const extraFields = Object.keys(FIELD_DEFINITIONS).filter((key) => {
    return !ENVIRONMENT_FIELDS.includes(key)
      && !HEALTH_FIELDS.includes(key)
      && !SOIL_FIELDS.includes(key)
      && !PRIMARY_METRICS.includes(key)
      && visibleRows.some((row) => row[key] !== null && row[key] !== undefined);
  });

  const extraPanel = document.getElementById("extraPanel");
  if (extraFields.length) {
    extraPanel.hidden = false;
    renderLineChart("extraChart", chartRows, extraFields, {
      leftTitle: "追加センサー",
      rightTitle: "",
    });
  } else {
    extraPanel.hidden = true;
  }
}

function updateSoilCharts() {
  const soilPanel = document.getElementById("soilPanel");
  if (!state.soilRows.length) return;

  const visibleRows = getVisibleRows(state.soilRows);
  const chartRows = downsampleRows(visibleRows, maxChartPoints());
  soilPanel.hidden = false;

  if (!visibleRows.length) {
    renderEmptyChart("soilWaterChart", "選択期間に土壌データがありません");
    renderEmptyChart("soilChemChart", "選択期間に土壌データがありません");
    return;
  }

  renderLineChart("soilWaterChart", chartRows, SOIL_WATER_FIELDS, {
    leftTitle: "土壌水分 (%)",
    rightTitle: "土壌温度 (degC)",
  });

  renderLineChart("soilChemChart", chartRows, SOIL_CHEM_FIELDS, {
    leftTitle: "EC (uS/cm)",
    rightTitle: "pH",
  });
}

function renderHarvestEstimator() {
  const source = state.harvest.source === "soil" ? "soil" : "air";
  const sourceConfig = source === "soil"
    ? { label: "土壌温度", rows: state.soilRows, field: "soil_temperature_c" }
    : { label: "外気温", rows: state.rows, field: "temperature" };
  const rows = sourceConfig.rows
    .filter((row) => row.date && Number.isFinite(row[sourceConfig.field]))
    .sort((a, b) => a.date - b.date);
  const threshold = Math.max(Number(state.harvest.threshold) || HARVEST_DEFAULTS.threshold, 1);

  if (rows.length < 2) {
    setHarvestResult({
      summary: `${sourceConfig.label}: データ不足`,
      accumulated: null,
      progress: 0,
      remaining: null,
      note: `${sourceConfig.label}の時系列データが2点以上必要です。`,
    });
    return;
  }

  const fallbackStart = rows[0].date;
  const startDate = parseDateTimeLocal(state.harvest.start) || fallbackStart;
  const startInput = document.getElementById("harvestStart");
  if (!state.harvest.start && startInput && !startInput.value) {
    startInput.value = formatDateTimeLocal(fallbackStart);
  }

  const accumulated = calculateTemperatureHours(rows, sourceConfig.field, startDate);
  const progress = Math.min((accumulated / threshold) * 100, 100);
  const remaining = Math.max(threshold - accumulated, 0);
  const reached = accumulated >= threshold;
  const startText = formatDateTime(startDate);

  setHarvestResult({
    summary: `${sourceConfig.label}: ${formatNumber(progress, 1)}%`,
    accumulated,
    progress,
    remaining,
    note: `${startText} から ${sourceConfig.label}で積算。${reached ? "目標値に到達しています。" : "目標値は現場の実測に合わせて調整してください。"}`,
  });
}

function setHarvestResult(result) {
  setText("harvestSummary", result.summary);
  setText("harvestAccumulated", result.accumulated === null ? "-- ℃・h" : `${formatNumber(result.accumulated, 0)} ℃・h`);
  setText("harvestProgressText", `${formatNumber(result.progress, 1)} %`);
  setText("harvestRemaining", result.remaining === null ? "-- ℃・h" : `${formatNumber(result.remaining, 0)} ℃・h`);
  setText("harvestNote", result.note);
  document.getElementById("harvestProgressBar").style.width = `${Math.min(Math.max(result.progress, 0), 100)}%`;
}

function calculateTemperatureHours(rows, field, startDate) {
  let total = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (!previous.date || !current.date || current.date <= startDate) continue;

    const segmentStart = previous.date < startDate ? startDate : previous.date;
    const hours = (current.date - segmentStart) / 36e5;
    if (hours <= 0) continue;

    const averageTemperature = (previous[field] + current[field]) / 2;
    if (Number.isFinite(averageTemperature)) total += averageTemperature * hours;
  }

  return total;
}

function currentRange() {
  return RANGE_OPTIONS.find((option) => option.key === state.activeRange) || RANGE_OPTIONS[1];
}

function getVisibleRows(rows) {
  const range = currentRange();
  if (!range.hours) return rows;

  const latest = rows[rows.length - 1]?.date;
  if (!latest) return rows;

  const startTime = latest.getTime() - range.hours * 60 * 60 * 1000;
  const filtered = rows.filter((row) => row.date && row.date.getTime() >= startTime);
  return filtered.length ? filtered : rows.slice(-1);
}

function maxChartPoints() {
  if (window.matchMedia("(max-width: 620px)").matches) return 160;
  if (window.matchMedia("(max-width: 940px)").matches) return 240;
  return 360;
}

function downsampleRows(rows, maxPoints) {
  if (rows.length <= maxPoints) return rows;

  const sampled = [];
  const step = (rows.length - 1) / (maxPoints - 1);
  let previousIndex = -1;

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round(index * step);
    if (sourceIndex !== previousIndex) sampled.push(rows[sourceIndex]);
    previousIndex = sourceIndex;
  }

  return sampled;
}

function renderBatteryInsight(rows) {
  const insight = document.getElementById("batteryInsight");
  const batteryRows = rows.filter((row) => row.battery !== null && row.battery !== undefined && row.date);

  insight.classList.remove("warning");
  if (batteryRows.length < 2) {
    insight.textContent = "Battery 推移: 判定には2点以上必要です";
    return;
  }

  const first = batteryRows[0];
  const last = batteryRows[batteryRows.length - 1];
  const elapsedHours = (last.date - first.date) / 36e5;
  const drop = first.battery - last.battery;

  if (elapsedHours <= 0 || drop <= 0) {
    insight.textContent = `Battery 推移: ${formatNumber(last.battery, 0)}%（選択期間で低下なし）`;
    return;
  }

  const rate = drop / elapsedHours;
  const remainingHours = rate > 0 ? last.battery / rate : null;
  const remainingText = remainingHours === null ? "--" : formatDurationHours(remainingHours);
  insight.textContent = `Battery 推移: ${formatNumber(first.battery, 0)}% -> ${formatNumber(last.battery, 0)}% / ${formatNumber(elapsedHours, 1)}時間、推定残り ${remainingText}`;

  if (last.battery <= 20 || (remainingHours !== null && remainingHours <= 48)) {
    insight.classList.add("warning");
  }
}

async function loadLatestImage() {
  const image = document.getElementById("latestImage");
  const noImage = document.getElementById("noImage");

  try {
    await testImage(PATHS.image);
    image.src = `${PATHS.image}?v=${Date.now()}`;
    image.hidden = false;
    noImage.hidden = true;
  } catch (error) {
    image.hidden = true;
    noImage.hidden = false;
  }
}

function renderMetricCards(latest) {
  const grid = document.getElementById("metricGrid");
  const additional = Object.keys(FIELD_DEFINITIONS).filter((key) => {
    return !PRIMARY_METRICS.includes(key) && latest[key] !== undefined && latest[key] !== null && latest[key] !== "";
  });
  const metrics = [...PRIMARY_METRICS, ...additional];

  grid.innerHTML = metrics.map((key) => {
    if (key === "timestamp" || key === "soil_timestamp") {
      const def = FIELD_DEFINITIONS[key];
      return metricCard(def.label, formatDateTime(latest[key]), "", def.note);
    }

    const def = FIELD_DEFINITIONS[key] || { label: key, unit: "", digits: 1, note: "追加データ" };
    const rawValue = latest[key];
    const value = rawValue === undefined || rawValue === null || rawValue === "" ? "--" : formatNumber(rawValue, def.digits);
    const warningClass = key === "battery" && Number(rawValue) <= 20 ? " warning" : "";
    return metricCard(def.label, value, def.unit, def.note, warningClass);
  }).join("");
}

function metricCard(label, value, unit, note, className = "") {
  return `
    <article class="metric-card${className}">
      <span class="metric-label">${escapeHtml(label)}</span>
      <div class="metric-value">
        <span>${escapeHtml(value)}</span>
        ${unit ? `<span class="metric-unit">${escapeHtml(unit)}</span>` : ""}
      </div>
      <p class="metric-note">${escapeHtml(note)}</p>
    </article>
  `;
}

function renderLineChart(canvasId, rows, fields, axisTitles) {
  if (!window.Chart) {
    renderEmptyChart(canvasId, "Chart.jsを読み込めません");
    return;
  }

  const canvas = document.getElementById(canvasId);
  canvas.hidden = false;
  const empty = canvas.parentElement.querySelector(".empty-state");
  if (empty) empty.remove();

  const labels = rows.map((row) => formatShortTime(row.timestamp));
  const datasets = fields.map((key, index) => {
    const def = FIELD_DEFINITIONS[key] || { label: key, unit: "", color: defaultColor(index) };
    return {
      label: def.unit ? `${def.label} (${def.unit})` : def.label,
      data: rows.map((row) => row[key]),
      borderColor: def.color || defaultColor(index),
      backgroundColor: transparent(def.color || defaultColor(index)),
      yAxisID: index === 1 ? "y1" : "y",
      borderWidth: 2,
      pointRadius: rows.length > 72 ? 0 : 2.5,
      pointHoverRadius: 5,
      tension: 0.2,
      spanGaps: true,
    };
  });

  if (state.charts[canvasId]) state.charts[canvasId].destroy();

  state.charts[canvasId] = new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { labels: { boxWidth: 14, color: "#17211b", usePointStyle: true } },
        tooltip: { callbacks: { title: (items) => rows[items[0].dataIndex]?.timestamp || "" } },
      },
      scales: chartScales(fields, axisTitles),
    },
  });
}

function chartScales(fields, axisTitles) {
  const leftIsBattery = fields[0] === "battery";
  return {
    x: {
      grid: { display: false },
      ticks: { color: "#66736a", maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
    },
    y: {
      beginAtZero: leftIsBattery,
      suggestedMin: leftIsBattery ? 0 : undefined,
      suggestedMax: leftIsBattery ? 100 : undefined,
      position: "left",
      title: { display: true, text: axisTitles.leftTitle },
      ticks: { color: "#66736a" },
      grid: { color: "#edf2ed" },
    },
    y1: {
      beginAtZero: false,
      position: "right",
      title: { display: Boolean(axisTitles.rightTitle), text: axisTitles.rightTitle },
      ticks: { color: "#66736a" },
      grid: { drawOnChartArea: false },
    },
  };
}

function renderEmptyChart(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  const wrap = canvas.parentElement;
  canvas.hidden = true;
  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
    delete state.charts[canvasId];
  }

  let empty = wrap.querySelector(".empty-state");
  if (!empty) {
    empty = document.createElement("div");
    empty.className = "empty-state";
    wrap.appendChild(empty);
  }
  empty.textContent = message;
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header = [], ...body] = rows;
  const keys = header.map((key) => key.trim());
  return body.map((values) => Object.fromEntries(keys.map((key, index) => [key, (values[index] || "").trim()])));
}

function normalizeRow(row) {
  const normalized = { timestamp: row.timestamp || "" };
  normalized.date = parseTimestamp(normalized.timestamp);
  Object.keys(row).forEach((key) => {
    if (key !== "timestamp") normalized[key] = toNumber(row[key]);
  });
  return normalized;
}

function buildMonthlyLogPath(timestamp) {
  const parts = parseTimestampParts(timestamp);
  if (!parts) return "";
  return `logs/${parts.year}/${parts.month}/ith11b_${parts.year}-${parts.month}.csv`;
}

function buildSoilMonthlyLogPath(timestamp) {
  const parts = parseTimestampParts(timestamp);
  if (!parts) return "";
  return `logs/${parts.year}/${parts.month}/soil_${parts.year}-${parts.month}.csv`;
}

function parseTimestampParts(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-/);
  return match ? { year: match[1], month: match[2] } : null;
}

async function fetchJson(path) {
  const text = await fetchText(path);
  return JSON.parse(text);
}

async function fetchText(path) {
  const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.text();
}

function testImage(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = reject;
    image.src = `${path}?v=${Date.now()}`;
  });
}

function loadHarvestSettings() {
  try {
    return { ...HARVEST_DEFAULTS, ...JSON.parse(localStorage.getItem(HARVEST_STORAGE_KEY) || "{}") };
  } catch (error) {
    return { ...HARVEST_DEFAULTS };
  }
}

function saveHarvestSettings() {
  localStorage.setItem(HARVEST_STORAGE_KEY, JSON.stringify(state.harvest));
}

function formatNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(number);
}

function formatDurationHours(hours) {
  if (!Number.isFinite(hours)) return "--";
  if (hours < 24) return `${formatNumber(hours, 1)}時間`;
  return `${formatNumber(hours / 24, 1)}日`;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseTimestamp(value) {
  if (!value) return null;
  const normalized = String(value).trim().replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : parseTimestamp(value);
  if (!date) return String(value || "--");
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDateTimeLocal(value) {
  const date = value instanceof Date ? value : parseTimestamp(value);
  if (!date) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatShortTime(value) {
  const date = parseTimestamp(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function transparent(hex) {
  const value = hex.replace("#", "");
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

function defaultColor(index) {
  return ["#2f7d46", "#2f6f9f", "#b86b16", "#7a5ca8", "#b7554f"][index % 5];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function setStatus(message, isError = false) {
  const status = document.getElementById("dataStatus");
  status.textContent = message;
  status.classList.toggle("error", isError);
}
