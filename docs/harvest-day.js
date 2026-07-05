(() => {
  const SETTINGS_VERSION = 2;
  const UNIT = "degree-day";
  const DEFAULTS = {
    source: "air",
    threshold: 1420,
    start: "",
    unit: UNIT,
    version: SETTINGS_VERSION,
  };

  function loadDegreeDaySettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(HARVEST_STORAGE_KEY) || "{}");
      if (saved.unit !== UNIT || saved.version !== SETTINGS_VERSION) {
        return {
          ...DEFAULTS,
          source: saved.source === "soil" ? "soil" : DEFAULTS.source,
          start: saved.start || DEFAULTS.start,
        };
      }
      return { ...DEFAULTS, ...saved };
    } catch (error) {
      return { ...DEFAULTS };
    }
  }

  loadHarvestSettings = function loadHarvestSettings() {
    return loadDegreeDaySettings();
  };

  saveHarvestSettings = function saveHarvestSettings() {
    localStorage.setItem(HARVEST_STORAGE_KEY, JSON.stringify({
      ...state.harvest,
      unit: UNIT,
      version: SETTINGS_VERSION,
    }));
  };

  handleHarvestInput = function handleHarvestInput(event) {
    const { id, value } = event.target;
    if (id === "harvestSource") state.harvest.source = value;
    if (id === "harvestStart") state.harvest.start = value;
    if (id === "harvestThreshold") state.harvest.threshold = Number(value) || DEFAULTS.threshold;
    state.harvest.unit = UNIT;
    state.harvest.version = SETTINGS_VERSION;
    saveHarvestSettings();
    renderHarvestEstimator();
  };

  renderHarvestEstimator = function renderHarvestEstimator() {
    const source = state.harvest.source === "soil" ? "soil" : "air";
    const sourceConfig = source === "soil"
      ? { label: "土壌温度", rows: state.soilRows, field: "soil_temperature_c" }
      : { label: "外気温", rows: state.rows, field: "temperature" };
    const rows = sourceConfig.rows
      .filter((row) => row.date && Number.isFinite(row[sourceConfig.field]))
      .sort((a, b) => a.date - b.date);
    const threshold = Math.max(Number(state.harvest.threshold) || DEFAULTS.threshold, 1);

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

    const accumulated = calculateTemperatureDays(rows, sourceConfig.field, startDate);
    const progress = Math.min((accumulated / threshold) * 100, 100);
    const remaining = Math.max(threshold - accumulated, 0);
    const reached = accumulated >= threshold;
    const startText = formatDateTime(startDate);

    setHarvestResult({
      summary: `${sourceConfig.label}: ${formatNumber(progress, 1)}%`,
      accumulated,
      progress,
      remaining,
      note: `${startText} から ${sourceConfig.label}で単純積算温度を計算。${reached ? "目標値に到達しています。" : "ゴールドラッシュ83日タイプの目安を1420 ℃・日として仮設定しています。"}`,
    });
  };

  setHarvestResult = function setHarvestResult(result) {
    setText("harvestSummary", result.summary);
    setText("harvestAccumulated", result.accumulated === null ? "-- ℃・日" : `${formatNumber(result.accumulated, 1)} ℃・日`);
    setText("harvestProgressText", `${formatNumber(result.progress, 1)} %`);
    setText("harvestRemaining", result.remaining === null ? "-- ℃・日" : `${formatNumber(result.remaining, 1)} ℃・日`);
    setText("harvestNote", result.note);
    document.getElementById("harvestProgressBar").style.width = `${Math.min(Math.max(result.progress, 0), 100)}%`;
  };

  function calculateTemperatureDays(rows, field, startDate) {
    let total = 0;

    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const current = rows[index];
      if (!previous.date || !current.date || current.date <= startDate) continue;

      const segmentStart = previous.date < startDate ? startDate : previous.date;
      const hours = (current.date - segmentStart) / 36e5;
      if (hours <= 0) continue;

      const averageTemperature = (previous[field] + current[field]) / 2;
      if (Number.isFinite(averageTemperature)) total += averageTemperature * (hours / 24);
    }

    return total;
  }

  calculateTemperatureHours = function calculateTemperatureHours(rows, field, startDate) {
    return calculateTemperatureDays(rows, field, startDate);
  };

  if (typeof state !== "undefined") {
    state.harvest = loadDegreeDaySettings();
  }
})();
