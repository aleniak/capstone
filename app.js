// --------- Tab navigation ----------
document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-tab");

      tabButtons.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      btn.classList.add("active");
      const target = document.getElementById(targetId);
      if (target) target.classList.add("active");
    });
  });

  setupPredictionForm();
  setupEDA();
});

// --------- Job Check logic ----------
function setupPredictionForm() {
  const form = document.getElementById("job-form");
  if (!form) return;

  const predictButton = document.getElementById("predict-button");
  const statusEl = document.getElementById("predict-status");
  const resultEl = document.getElementById("predict-result");
  const messageEl = document.getElementById("predict-message");
  const probEl = document.getElementById("predict-prob");
  const errorEl = document.getElementById("predict-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    resultEl.classList.add("hidden");

    const formData = new FormData(form);

    const title = (formData.get("title") || "").toString().trim();
    const company_profile = (formData.get("company_profile") || "").toString().trim();
    const description = (formData.get("description") || "").toString().trim();
    const requirements = (formData.get("requirements") || "").toString().trim();
    const benefits = (formData.get("benefits") || "").toString().trim();
    const location = (formData.get("location") || "").toString().trim();
    const salary_range = (formData.get("salary_range") || "").toString().trim();
    const employment_type = (formData.get("employment_type") || "").toString().trim();
    const industry = (formData.get("industry") || "").toString().trim();

    const full_text = [
      title,
      company_profile,
      description,
      requirements,
      benefits,
      location,
      salary_range,
      employment_type,
      industry
    ].join(" ");

    const payload = { full_text };

    predictButton.disabled = true;
    statusEl.textContent = "Sending request...";

    try {
      // TODO: заменить "/predict" на URL настоящего бэкенда
      const response = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Server returned status " + response.status);
      }

      const data = await response.json();

      const proba =
        typeof data.fraud_proba === "number"
          ? data.fraud_proba
          : typeof data.probability === "number"
          ? data.probability
          : typeof data.fraud_probability === "number"
          ? data.fraud_probability
          : null;

      if (proba === null || isNaN(proba)) {
        throw new Error("Unexpected response format");
      }

      const fraudProba = Math.min(Math.max(proba, 0), 1);
      const fraudPct = (fraudProba * 100).toFixed(1);
      const legitPct = (100 - fraudProba * 100).toFixed(1);

      resultEl.classList.remove("hidden", "success", "danger");

      if (fraudProba < 0.5) {
        resultEl.classList.add("success");
        messageEl.textContent = "This job posting appears legitimate.";
      } else {
        resultEl.classList.add("danger");
        messageEl.textContent = "Warning: high fraud probability.";
      }

      probEl.textContent =
        "Fraud probability: " +
        fraudPct +
        "% · Legitimate probability: " +
        legitPct +
        "%";

      statusEl.textContent = "Prediction received.";
    } catch (err) {
      console.warn("Real backend not available, using demo prediction.", err);

      // DEMO: случайный прогноз
      const fakeProba = 0.02 + Math.random() * 0.83;
      showDemoResult(fakeProba, resultEl, messageEl, probEl, statusEl);
    } finally {
      predictButton.disabled = false;
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    }
  });
}

function showDemoResult(proba, resultEl, messageEl, probEl, statusEl) {
  const fraudProba = Math.min(Math.max(proba, 0), 1);
  const fraudPct = (fraudProba * 100).toFixed(1);
  const legitPct = (100 - fraudProba * 100).toFixed(1);

  resultEl.classList.remove("hidden", "success", "danger");

  if (fraudProba < 0.5) {
    resultEl.classList.add("success");
    messageEl.textContent =
      "This job posting appears legitimate (demo mode).";
  } else {
    resultEl.classList.add("danger");
    messageEl.textContent =
      "Warning: high fraud probability (demo mode).";
  }

  probEl.textContent =
    "Fraud probability: " +
    fraudPct +
    "% · Legitimate probability: " +
    legitPct +
    "%";

  statusEl.textContent = "Demo prediction (no backend).";
}

// --------- EDA logic using eda_data.json ----------
let fraudChart = null;
let lengthChart = null;
let lengthByClassChart = null;
let missingChart = null;

function setupEDA() {
  const jsonPath = "data/eda_data.json";

  const edaError = document.getElementById("eda-error");
  const totalEl = document.getElementById("total-count");
  const realEl = document.getElementById("real-count");
  const fraudEl = document.getElementById("fraud-count");

  fetch(jsonPath)
    .then((response) => {
      if (!response.ok) {
        throw new Error("EDA json not found: " + response.status);
      }
      return response.json();
    })
    .then((edadata) => {
      // агрегированные счётчики из eda_data.json [file:56]
      const realCount = edadata.class_counts?.Real ?? 0;
      const fraudCount = edadata.class_counts?.Fake ?? 0;
      const total = realCount + fraudCount;

      if (totalEl) totalEl.textContent = total.toLocaleString();
      if (realEl) realEl.textContent = realCount.toLocaleString();
      if (fraudEl) fraudEl.textContent = fraudCount.toLocaleString();

      // длины по бинам (all)
      const shortCount = edadata.length_buckets?.all?.short ?? 0;
      const mediumCount = edadata.length_buckets?.all?.medium ?? 0;
      const longCount = edadata.length_buckets?.all?.long ?? 0;

      // длины по классам
      const lenBinsReal = edadata.length_buckets?.by_class?.real ?? {
        short: 0,
        medium: 0,
        long: 0
      };
      const lenBinsFake = edadata.length_buckets?.by_class?.fake ?? {
        short: 0,
        medium: 0,
        long: 0
      };

      // пропуски по полям (в долях) → сразу переведём в проценты
      const fields = [
        "company_profile",
        "requirements",
        "benefits",
        "salary_range",
        "employment_type",
        "industry"
      ];
    const missingReal = {};
const missingFake = {};
fields.forEach((f) => {
  missingReal[f] = edadata.missing?.real?.[f] ?? 0;   // уже проценты
  missingFake[f] = edadata.missing?.fake?.[f] ?? 0;
});

      // рисуем все четыре графика
      renderFraudChart(realCount, fraudCount);
      renderLengthChart(shortCount, mediumCount, longCount);
      renderLengthByClassChart(lenBinsReal, lenBinsFake);
      // realCount/fraudCount здесь уже не нужны, передаём фиктивные 100
      renderMissingChart(fields, missingReal, missingFake);
    })
    .catch((error) => {
      console.warn("EDA JSON load failed, using fallback:", error);

      if (edaError) {
        edaError.textContent =
          "Failed to load eda_data.json. Using fallback stats.";
        edaError.classList.remove("hidden");
      }

      const fallbackStats = {
        total: 27880,
        real: 17014,
        fraud: 10866,
        short: 5234,
        medium: 12456,
        long: 10190
      };

      if (totalEl) totalEl.textContent = fallbackStats.total.toLocaleString();
      if (realEl) realEl.textContent = fallbackStats.real.toLocaleString();
      if (fraudEl) fraudEl.textContent = fallbackStats.fraud.toLocaleString();

      renderFraudChart(fallbackStats.real, fallbackStats.fraud);
      renderLengthChart(
        fallbackStats.short,
        fallbackStats.medium,
        fallbackStats.long
      );
    });
}

function renderFraudChart(realCount, fraudCount) {
  const ctx = document.getElementById("fraud-chart");
  if (!ctx || typeof Chart === "undefined") return;

  if (fraudChart) fraudChart.destroy();

  fraudChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Legitimate (0)", "Fraudulent (1)"],
      datasets: [
        {
          data: [realCount, fraudCount],
          backgroundColor: ["#22c55e", "#f97373"],
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af" }
        },
        y: {
          ticks: { color: "#9ca3af", precision: 0 },
          beginAtZero: true
        }
      }
    }
  });
}

function renderLengthChart(shortCount, mediumCount, longCount) {
  const ctx = document.getElementById("length-chart");
  if (!ctx || typeof Chart === "undefined") return;

  if (lengthChart) lengthChart.destroy();

  lengthChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Short (<300)", "Medium (300–800)", "Long (>800)"],
      datasets: [
        {
          data: [shortCount, mediumCount, longCount],
          backgroundColor: ["#38bdf8", "#0ea5e9", "#0369a1"],
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af" }
        },
        y: {
          ticks: { color: "#9ca3af", precision: 0 },
          beginAtZero: true
        }
      }
    }
  });
}

function renderLengthByClassChart(lenBinsReal, lenBinsFake) {
  const ctx = document.getElementById("length-by-class-chart");
  if (!ctx || typeof Chart === "undefined") return;

  if (lengthByClassChart) lengthByClassChart.destroy();

  lengthByClassChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Short (<300)", "Medium (300–800)", "Long (>800)"],
          datasets: [
      {
        label: "Real",
        data: [
          lenBinsReal.short,
          lenBinsReal.medium,
          lenBinsReal.long
        ],
        backgroundColor: "rgba(56, 189, 248, 0.7)"
      },
      {
        label: "Fake",
        data: [
          lenBinsFake.short,
          lenBinsFake.medium,
          lenBinsFake.long
        ],
        backgroundColor: "rgba(248, 113, 113, 0.8)"
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: "#9ca3af" }
      }
    },
    scales: {
      x: { ticks: { color: "#9ca3af" } },
      y: {
        ticks: { color: "#9ca3af", precision: 0 },
        beginAtZero: true
      }
    }
  }
});
}

function renderMissingChart(fields, missingReal, missingFake) {

  const ctx = document.getElementById("missing-chart");
  if (!ctx || typeof Chart === "undefined") return;

  if (missingChart) missingChart.destroy();

  const labels = fields.map((f) => f.replace("_", " "));
const realPerc = fields.map((f) => missingReal[f] ?? 0);
const fakePerc = fields.map((f) => missingFake[f] ?? 0);

  missingChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Real missing, %",
          data: realPerc,
          backgroundColor: "rgba(56, 189, 248, 0.8)"
        },
        {
          label: "Fake missing, %",
          data: fakePerc,
          backgroundColor: "rgba(248, 113, 113, 0.9)"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#9ca3af" }
        },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#9ca3af" }
        },
        y: {
          ticks: { color: "#9ca3af" },
          beginAtZero: true,
          max: 100
        }
      }
    }
  });
}
