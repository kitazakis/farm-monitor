const PATH_CANDIDATES = {
  log: ["data/ith11b_log.csv", "../data/ith11b_log.csv"],
  image: ["images/latest.jpg", "../images/latest.jpg"],
};

const FIELD_ALIASES = {
  timestamp: ["timestamp", "datetime", "date_time", "time"],
  temperature: ["temperature", "temperature_c", "temp", "temp_c"],
  humidity: ["humidity", "humidity_percent", "rh"],
  battery: ["battery", "battery_percent", "battery_level"],
  rssi: ["rssi", "rssi_dbm"],
};

const METRICS = [
  {
    key: "temperature",
    label: "温度",
    unit: "degC",
    note: "INKBIRD ITH-11-B",
    format: (value) => formatNumber(value, 1),
  },
  {
    key: "humidity",
    label: "湿度",
    unit: "%",
    note: "相対湿度",
    format: (value) => formatNumber(value, 1),
  },
  {
    key: "battery",
    label: "バッテリー",
    unit: "%",
    note: "センサー電池",
    format: (value) => formatNumber(value, 0),
  },
  {
    key: "rssi",
    label: "RSSI",
    unit: "dBm",
    note: "BLE受信強度",
    format: (value) => formatNumber(value, 0),
  },
  {
    key: "timestamp",
    label: "更新日時",
    unit: "",
    note: "CSV最新行",
    format: (value) => formatDateTime(value),
  },
];

const CHART_FIELDS = {
  environment: [
    {
      key: "temperature",
      label: "温度 (degC)",
      borderColor: "#b86b16",
      backgroundColor: "rgba(184, 107, 22, 0.12)",
      yAxisID: "y",
    },
    {
      key: "humidity",
      label: "湿度 (%)",
      borderColor: "#2f6f9f",
      backgroundColor: "rgba(47, 111, 159, 0.12)",
      yAxisID: "y1",
    },
  ],
  health: [
    {
      key: "battery",
      label: "バッテリー (%)",
      borderColor: "#2f7d46",
      backgroundColor: "rgba(47, 125, 70, 0.12)",
      yAxisID: "y",
    },
    {
      key: "rssi",
      label: "RSSI (dBm)",
      borderColor: "#5f6673",
      backgroundColor: "rgba(95, 102, 115, 0.12)",
      yAxisID: "y1",
    },
  ],
};

const state = {
  charts: {},
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderMetricCards({});
  await Promise.all([loadLog(), loadLatestImage()]);
}

async function loadLog() {
  try {
    const csv = await fetchText(PATH_CANDIDATES.log);
    const rows = parseCsv(csv).map(normalizeRow).filter((row) => row.timestamp);

    if (!rows.length) {
      renderMetricCards({});
      renderEmptyChart("environmentChart", "CSVデータがありません");
      renderEmptyChart("healthChart", "CSVデータがありません");
      setStatusError("CSVデータがありません");
      setText("lastUpdated", "更新日時: --");
      return;
    }

    const latest = rows[rows.length - 1];
    renderMetricCards(latest);
    setText("lastUpdated", `更新日時: ${formatDateTime(latest.timestamp)}`);
    setText("dataStatus", "CSV更新済み");
    document.getElementById("dataStatus").classList.remove("error");

    renderLineChart("environmentChart", rows, CHART_FIELDS.environment, {
      leftTitle: "温度 (degC)",
      rightTitle: "湿度 (%)",
    });
    renderLineChart("healthChart", rows, CHART_FIELDS.health, {
      leftTitle: "バッテリー (%)",
      rightTitle: "RSSI (dBm)",
    });
  } catch (error) {
    renderMetricCards({});
    renderEmptyChart("environmentChart", "CSVを読み込めません");
    renderEmptyChart("healthChart", "CSVを読み込めません");
    setStatusError("CSVを読み込めません");
    setText("lastUpdated", "更新日時: --");
  }
}

async function loadLatestImage() {
  const image = document.getElementById("latestImage");
  const noImage = document.getElementById("noImage");
  const src = await findLoadableImage(PATH_CANDIDATES.image);

  if (!src) {
    image.hidden = true;
    noImage.hidden = false;
    return;
  }

  image.src = `${src}?v=${Date.now()}`;
  image.hidden = false;
  noImage.hidden = true;
}

function renderMetricCards(latest) {
  const grid = document.getElementById("metricGrid");
  grid.innerHTML = METRICS.map((metric) => {
    const rawValue = latest[metric.key];
    const value = rawValue === undefined || rawValue === null || rawValue === ""
      ? "--"
      : metric.format(rawValue);

    return `
      <article class="metric-card">
        <span class="metric-label">${metric.label}</span>
        <div class="metric-value">
          <span>${value}</span>
          ${metric.unit ? `<span class="metric-unit">${metric.unit}</span>` : ""}
        </div>
        <p class="metric-note">${metric.note}</p>
      </article>
    `;
  }).join("");
}

function renderLineChart(canvasId, rows, fields, axisTitles) {
  if (!window.Chart) {
    renderEmptyChart(canvasId, "Chart.jsを読み込めません");
    return;
  }

  const canvas = document.getElementById(canvasId);
  const labels = rows.map((row) => formatShortTime(row.timestamp));
  const datasets = fields.map((field) => ({
    label: field.label,
    data: rows.map((row) => row[field.key]),
    borderColor: field.borderColor,
    backgroundColor: field.backgroundColor,
    yAxisID: field.yAxisID,
    borderWidth: 2,
    pointRadius: rows.length > 48 ? 0 : 2.5,
    pointHoverRadius: 5,
    tension: 0.25,
    spanGaps: true,
  }));

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
  }

  state.charts[canvasId] = new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: {
          labels: {
            boxWidth: 14,
            color: "#17211b",
            usePointStyle: true,
          },
        },
        tooltip: {
          callbacks: {
            title: (items) => rows[items[0].dataIndex]?.timestamp || "",
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#66736a",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
        y: {
          beginAtZero: false,
          position: "left",
          title: {
            display: true,
            text: axisTitles.leftTitle,
          },
          ticks: { color: "#66736a" },
          grid: { color: "#edf2ed" },
        },
        y1: {
          beginAtZero: false,
          position: "right",
          title: {
            display: true,
            text: axisTitles.rightTitle,
          },
          ticks: { color: "#66736a" },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function renderEmptyChart(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  const wrap = canvas.parentElement;
  canvas.hidden = true;

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
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
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
  const keys = header.map((key) => key.trim().toLowerCase());
  return body.map((values) => Object.fromEntries(
    keys.map((key, index) => [key, (values[index] || "").trim()])
  ));
}

function normalizeRow(row) {
  return {
    timestamp: getField(row, FIELD_ALIASES.timestamp),
    temperature: toNumber(getField(row, FIELD_ALIASES.temperature)),
    humidity: toNumber(getField(row, FIELD_ALIASES.humidity)),
    battery: toNumber(getField(row, FIELD_ALIASES.battery)),
    rssi: toNumber(getField(row, FIELD_ALIASES.rssi)),
  };
}

async function fetchText(candidates) {
  let lastError;

  for (const path of candidates) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (response.ok) {
        return response.text();
      }
      lastError = new Error(`${path}: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Fetch failed");
}

function findLoadableImage(candidates) {
  return new Promise((resolve) => {
    let index = 0;

    const tryNext = () => {
      if (index >= candidates.length) {
        resolve("");
        return;
      }

      const src = candidates[index];
      index += 1;

      const image = new Image();
      image.onload = () => resolve(src);
      image.onerror = tryNext;
      image.src = `${src}?v=${Date.now()}`;
    };

    tryNext();
  });
}

function getField(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) {
      return row[name];
    }
  }
  return "";
}

function formatNumber(value, digits) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "--";
  }
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(number);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseTimestamp(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = parseTimestamp(value);
  if (!date) {
    return String(value || "--");
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatShortTime(value) {
  const date = parseTimestamp(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function setStatusError(message) {
  const status = document.getElementById("dataStatus");
  status.textContent = message;
  status.classList.add("error");
}
