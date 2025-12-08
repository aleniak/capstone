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

    // Проверяем заполненность полей для рекомендаций
    const fieldsFilled = {
      title: title.length > 0,
      company_profile: company_profile.length > 0,
      description: description.length > 0,
      requirements: requirements.length > 0,
      benefits: benefits.length > 0,
      location: location.length > 0,
      salary_range: salary_range.length > 0,
      employment_type: employment_type.length > 0,
      industry: industry.length > 0
    };

    const filledCount = Object.values(fieldsFilled).filter(Boolean).length;
    const totalFields = Object.keys(fieldsFilled).length;

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
    statusEl.textContent = "Analyzing job posting...";

    try {
      // Пробуем реальный бэкенд
      const response = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Backend server returned status " + response.status);
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
        throw new Error("Unexpected response format from backend");
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
        messageEl.textContent = "Warning: high fraud probability detected.";
      }

      probEl.textContent =
        "Fraud probability: " +
        fraudPct +
        "% · Legitimate probability: " +
        legitPct +
        "%";

      // Добавляем рекомендацию
      const recommendation = getRecommendation(fraudProba, filledCount, totalFields, fieldsFilled, full_text);
      displayRecommendation(recommendation, fraudProba);

      statusEl.textContent = "Analysis complete.";
    } catch (err) {
      console.warn("Backend not available, using local analysis.", err);
      
      // Используем локальный анализ на основе данных пользователя
      const fraudProba = analyzeJobLocally(title, company_profile, description, requirements, 
                                         benefits, location, salary_range, employment_type, industry);
      
      const fraudPct = (fraudProba * 100).toFixed(1);
      const legitPct = (100 - fraudProba * 100).toFixed(1);

      resultEl.classList.remove("hidden", "success", "danger");

      if (fraudProba < 0.5) {
        resultEl.classList.add("success");
        messageEl.textContent = "This job posting appears legitimate (local analysis).";
      } else {
        resultEl.classList.add("danger");
        messageEl.textContent = "Warning: high fraud probability detected (local analysis).";
      }

      probEl.textContent =
        "Fraud probability: " +
        fraudPct +
        "% · Legitimate probability: " +
        legitPct +
        "%";

      // Добавляем рекомендацию
      const recommendation = getRecommendation(fraudProba, filledCount, totalFields, fieldsFilled, full_text);
      displayRecommendation(recommendation, fraudProba);

      statusEl.textContent = "Local analysis complete (no backend).";
    } finally {
      predictButton.disabled = false;
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    }
  });
}

// Локальный анализ вакансии на основе введенных данных
function analyzeJobLocally(title, company_profile, description, requirements, 
                         benefits, location, salary_range, employment_type, industry) {
  let fraudScore = 0;
  let totalFactors = 0;
  
  // 1. Анализ текста на мошеннические паттерны
  const fullText = (title + " " + company_profile + " " + description + " " + 
                   requirements + " " + benefits).toLowerCase();
  
  const scamPatterns = [
    { pattern: /earn.*\$\d+,?\d*\s*(per|a)\s*(week|month)/i, weight: 0.8 },
    { pattern: /work from home|remote work|home based/i, weight: 0.3 },
    { pattern: /no experience needed|no experience required/i, weight: 0.4 },
    { pattern: /immediate (start|hiring|position)/i, weight: 0.5 },
    { pattern: /apply now|contact now|call now/i, weight: 0.4 },
    { pattern: /flexible hours|flexible schedule/i, weight: 0.2 },
    { pattern: /free.*training|free.*enrollment/i, weight: 0.6 },
    { pattern: /guaranteed.*income|guaranteed.*payment/i, weight: 0.7 },
    { pattern: /investment required|registration fee/i, weight: 0.9 },
    { pattern: /multi.*level.*marketing|mlm|network marketing/i, weight: 0.8 },
    { pattern: /data entry|paid surveys|mystery shopping/i, weight: 0.4 }
  ];
  
  let patternScore = 0;
  let foundPatterns = 0;
  scamPatterns.forEach(item => {
    if (item.pattern.test(fullText)) {
      patternScore += item.weight;
      foundPatterns++;
    }
  });
  
  if (foundPatterns > 0) {
    fraudScore += (patternScore / Math.max(foundPatterns, 1)) * 0.6;
    totalFactors += 0.6;
  }
  
  // 2. Анализ длины текста
  const totalLength = fullText.length;
  if (totalLength < 100) {
    fraudScore += 0.5; // Слишком короткие описания подозрительны
    totalFactors += 0.5;
  } else if (totalLength > 5000) {
    fraudScore += 0.1; // Очень длинные обычно нормальные
    totalFactors += 0.1;
  }
  
  // 3. Анализ зарплаты
  if (salary_range) {
    const salary = parseInt(salary_range.replace(/[^\d]/g, ''));
    if (!isNaN(salary)) {
      if (salary < 10000) {
        fraudScore += 0.3; // Слишком низкая зарплата
        totalFactors += 0.3;
      } else if (salary > 300000) {
        fraudScore += 0.4; // Нереально высокая зарплата
        totalFactors += 0.4;
      }
    } else {
      fraudScore += 0.2; // Нечисловая зарплата
      totalFactors += 0.2;
    }
  } else {
    fraudScore += 0.2; // Отсутствие зарплаты
    totalFactors += 0.2;
  }
  
  // 4. Анализ локации
  if (!location || location.length < 2) {
    fraudScore += 0.3; // Нет локации
    totalFactors += 0.3;
  }
  
  // 5. Анализ профиля компании
  if (!company_profile || company_profile.length < 20) {
    fraudScore += 0.4; // Нет или короткий профиль компании
    totalFactors += 0.4;
  }
  
  // 6. Анализ требований
  if (!requirements || requirements.length < 10) {
    fraudScore += 0.3; // Нет требований
    totalFactors += 0.3;
  }
  
  // 7. Анализ типа работы
  if (employment_type === "Other" || !employment_type) {
    fraudScore += 0.2; // Нестандартный тип
    totalFactors += 0.2;
  }
  
  // Нормализуем результат
  const fraudProba = totalFactors > 0 ? Math.min(fraudScore / totalFactors, 0.95) : 0.1;
  
  // Добавляем базовую вероятность
  return Math.max(0.05, Math.min(fraudProba, 0.95));
}

// Функция для получения рекомендации на английском
function getRecommendation(fraudProba, filledCount, totalFields, fieldsFilled, fullText) {
  const completeness = (filledCount / totalFields) * 100;
  
  let recommendation = {};
  let confidence = "";
  
  // Определяем уровень уверенности
  if (fraudProba < 0.2) {
    confidence = "VERY HIGH confidence";
  } else if (fraudProba < 0.4) {
    confidence = "HIGH confidence";
  } else if (fraudProba < 0.6) {
    confidence = "MEDIUM confidence";
  } else if (fraudProba < 0.8) {
    confidence = "LOW confidence";
  } else {
    confidence = "VERY LOW confidence";
  }
  
  // Основная рекомендация по вероятности мошенничества
  if (fraudProba < 0.1) {
    recommendation = {
      title: "✅ STRONGLY RECOMMEND applying for this job",
      text: "The job posting appears highly legitimate. Fraud probability is extremely low.",
      details: [
        "Job posting matches typical characteristics of legitimate offers",
        "Recommend verifying the company in official registries",
        "Clarify employment details during the interview"
      ]
    };
  } else if (fraudProba < 0.3) {
    recommendation = {
      title: "⚠️ CONSIDER applying for this job",
      text: "The job looks normal, but there are minor risks to be aware of.",
      details: [
        "Recommend additional verification of the company",
        "Check for official contact information",
        "Never transfer money for employment opportunities"
      ]
    };
  } else if (fraudProba < 0.5) {
    recommendation = {
      title: "⚠️ PROCEED WITH CAUTION",
      text: "There are some suspicious signs. Additional verification is required.",
      details: [
        "Thoroughly research the company online",
        "Look for employer reviews and ratings",
        "Do not share confidential information before interview"
      ]
    };
  } else if (fraudProba < 0.7) {
    recommendation = {
      title: "❌ NOT RECOMMENDED",
      text: "High probability of fraud. Be extremely cautious.",
      details: [
        "Strong indicators of potential scam detected",
        "Avoid sending resume with personal information",
        "Watch for requests for upfront payments"
      ]
    };
  } else {
    recommendation = {
      title: "🚫 CRITICAL RISK - DO NOT APPLY",
      text: "Extremely high probability of fraud. AVOID THIS POSTING!",
      details: [
        "Clear signs of fraudulent activity detected",
        "Do not contact the supposed employer",
        "Consider reporting this posting to the platform"
      ]
    };
  }
  
  // Добавляем информацию о заполненности полей
  if (completeness < 50) {
    recommendation.details.push(`⚠️ You only filled ${filledCount} out of ${totalFields} fields. Results are less accurate.`);
  } else if (completeness > 80) {
    recommendation.details.push(`✅ Good job! You filled ${filledCount} out of ${totalFields} fields for accurate analysis.`);
  }
  
  // Проверяем конкретные проблемные поля
  const problemFields = [];
  if (!fieldsFilled.company_profile) problemFields.push("company profile");
  if (!fieldsFilled.salary_range) problemFields.push("salary information");
  if (!fieldsFilled.location) problemFields.push("location");
  
  if (problemFields.length > 0 && fraudProba > 0.3) {
    recommendation.details.push(`⚠️ Missing information: ${problemFields.join(", ")}`);
  }
  
  // Анализ текста на конкретные паттерны
  const scamIndicators = analyzeTextPatterns(fullText);
  if (scamIndicators.length > 0 && fraudProba > 0.4) {
    recommendation.details.push(`⚠️ Detected potential red flags: ${scamIndicators.join(", ")}`);
  }
  
  recommendation.confidence = confidence;
  recommendation.completeness = completeness;
  
  return recommendation;
}

// Анализ текста на мошеннические паттерны
function analyzeTextPatterns(text) {
  const indicators = [];
  const textLower = text.toLowerCase();
  
  if (/earn.*\$\d+,?\d*\s*(per|a)\s*(week|month)/i.test(textLower)) {
    indicators.push("Unrealistic earnings promises");
  }
  if (/no experience needed|no experience required/i.test(textLower)) {
    indicators.push("No experience required for high pay");
  }
  if (/immediate (start|hiring|position)/i.test(textLower)) {
    indicators.push("Urgent hiring language");
  }
  if (/investment required|registration fee/i.test(textLower)) {
    indicators.push("Requests for upfront payment");
  }
  if (/multi.*level.*marketing|mlm|network marketing/i.test(textLower)) {
    indicators.push("MLM/pyramid scheme indicators");
  }
  if (/guaranteed.*income|guaranteed.*payment/i.test(textLower)) {
    indicators.push("Guaranteed income promises");
  }
  
  return indicators;
}

// Функция для отображения рекомендации
function displayRecommendation(recommendation, fraudProba) {
  // Удаляем старую рекомендацию, если есть
  const oldRec = document.getElementById("recommendation-container");
  if (oldRec) oldRec.remove();
  
  // Создаем контейнер для рекомендации
  const resultEl = document.getElementById("predict-result");
  const recContainer = document.createElement("div");
  recContainer.id = "recommendation-container";
  recContainer.className = "recommendation";
  
  // Добавляем класс в зависимости от уровня риска
  if (fraudProba < 0.3) {
    recContainer.classList.add("recommendation-safe");
  } else if (fraudProba < 0.5) {
    recContainer.classList.add("recommendation-warning");
  } else {
    recContainer.classList.add("recommendation-danger");
  }
  
  // Создаем HTML для рекомендации
  recContainer.innerHTML = `
    <div class="recommendation-header">
      <h3>${recommendation.title}</h3>
      <div class="recommendation-confidence">Confidence level: ${recommendation.confidence}</div>
    </div>
    <div class="recommendation-body">
      <p class="recommendation-summary">${recommendation.text}</p>
      <div class="recommendation-details">
        <h4>Recommended actions:</h4>
        <ul>
          ${recommendation.details.map(detail => `<li>${detail}</li>`).join('')}
        </ul>
      </div>
      ${recommendation.completeness < 70 ? 
        `<div class="completeness-warning">
          <strong>Tip:</strong> Fill more fields for better accuracy (currently ${recommendation.completeness.toFixed(0)}% filled)
        </div>` : 
        `<div class="completeness-good">
          <strong>Great!</strong> You filled ${recommendation.completeness.toFixed(0)}% of fields, ensuring high analysis accuracy.
        </div>`
      }
    </div>
  `;
  
  // Вставляем рекомендацию после результата
  resultEl.appendChild(recContainer);
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
      // агрегированные счётчики из eda_data.json
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

      // пропуски по полям (в процентах)
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
        missingReal[f] = edadata.missing?.real?.[f] ?? 0;
        missingFake[f] = edadata.missing?.fake?.[f] ?? 0;
      });

      // рисуем все четыре графика
      renderFraudChart(realCount, fraudCount);
      renderLengthChart(shortCount, mediumCount, longCount);
      renderLengthByClassChart(lenBinsReal, lenBinsFake);
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
      labels: ["Short (<300)", "Medium (300-800)", "Long (>800)"],
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
      labels: ["Short (<300)", "Medium (300-800)", "Long (>800)"],
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
