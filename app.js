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
      showResults(fraudProba, filledCount, totalFields, fieldsFilled, full_text, resultEl, messageEl, probEl, statusEl, false);

    } catch (err) {
      console.warn("Backend not available, using local analysis.", err);
      
      // Используем локальный анализ на основе данных пользователя
      const fraudProba = analyzeJobLocally(title, company_profile, description, requirements, 
                                         benefits, location, salary_range, employment_type, industry);
      
      showResults(fraudProba, filledCount, totalFields, fieldsFilled, full_text, resultEl, messageEl, probEl, statusEl, true);
    } finally {
      predictButton.disabled = false;
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    }
  });
}

function showResults(fraudProba, filledCount, totalFields, fieldsFilled, fullText, resultEl, messageEl, probEl, statusEl, isLocal) {
  const fraudPct = (fraudProba * 100).toFixed(1);
  const legitPct = (100 - fraudProba * 100).toFixed(1);

  resultEl.classList.remove("hidden", "success", "danger");

  if (fraudProba < 0.5) {
    resultEl.classList.add("success");
    messageEl.textContent = isLocal ? 
      "This job posting appears legitimate (local analysis)." : 
      "This job posting appears legitimate.";
  } else {
    resultEl.classList.add("danger");
    messageEl.textContent = isLocal ? 
      "Warning: high fraud probability detected (local analysis)." : 
      "Warning: high fraud probability detected.";
  }

  probEl.textContent =
    "Fraud probability: " +
    fraudPct +
    "% · Legitimate probability: " +
    legitPct +
    "%";

  // Добавляем рекомендацию
  const recommendation = getRecommendation(fraudProba, filledCount, totalFields, fieldsFilled, fullText);
  displayRecommendation(recommendation, fraudProba);

  statusEl.textContent = isLocal ? "Local analysis complete (no backend)." : "Analysis complete.";
}

// Локальный анализ вакансии на основе введенных данных - ИСПРАВЛЕННАЯ ВЕРСИЯ
function analyzeJobLocally(title, company_profile, description, requirements, 
                         benefits, location, salary_range, employment_type, industry) {
  
  let fraudIndicators = 0;
  let totalIndicators = 0;
  let fraudScore = 0;
  
  // 1. Анализ текста на мошеннические паттерны (самый важный фактор)
  const fullText = (title + " " + company_profile + " " + description + " " + 
                   requirements + " " + benefits).toLowerCase();
  
  const scamPatterns = [
    { pattern: /earn.*\$?\d+,?\d*\s*(per|a)\s*(week|month)/i, weight: 0.15, reason: "Unrealistic earnings promises" },
    { pattern: /no experience needed|no experience required/i, weight: 0.10, reason: "No experience required" },
    { pattern: /immediate (start|hiring|position)/i, weight: 0.08, reason: "Urgent hiring pressure" },
    { pattern: /(investment|fee|payment|money).*required|registration fee/i, weight: 0.25, reason: "Requests for payment" },
    { pattern: /multi.?level.?marketing|mlm|network marketing/i, weight: 0.20, reason: "MLM/pyramid scheme" },
    { pattern: /guaranteed.*income|guaranteed.*payment/i, weight: 0.18, reason: "Guaranteed income promises" },
    { pattern: /work from home|remote work|home based/i, weight: 0.03, reason: "Work from home mention" },
    { pattern: /apply now|contact now|call now/i, weight: 0.05, reason: "High pressure language" },
    { pattern: /flexible hours|flexible schedule/i, weight: 0.02, reason: "Flexible hours" },
    { pattern: /free.*training|free.*enrollment/i, weight: 0.07, reason: "Free training" },
    { pattern: /data entry|paid surveys|mystery shopping/i, weight: 0.10, reason: "Common scam job types" }
  ];
  
  let textScore = 0;
  let textWeight = 0;
  scamPatterns.forEach(item => {
    if (item.pattern.test(fullText)) {
      textScore += item.weight;
      textWeight += item.weight;
      fraudIndicators++;
    }
  });
  
  // Текстовый анализ составляет 40% от общего веса
  totalIndicators += 0.4;
  fraudScore += (textWeight > 0 ? Math.min(textScore / textWeight, 1) : 0.1) * 0.4;
  
  // 2. Анализ полноты информации (30% веса)
  let completenessScore = 0;
  let completenessWeight = 0;
  
  // Проверяем важные поля
  if (company_profile && company_profile.length > 50) completenessScore += 0.1; // Хороший профиль компании
  if (!company_profile || company_profile.length < 20) completenessScore -= 0.15; // Нет профиля
  completenessWeight += 0.1;
  
  if (location && location.length > 2) completenessScore += 0.05; // Есть локация
  if (!location || location.length < 2) completenessScore -= 0.1; // Нет локации
  completenessWeight += 0.05;
  
  if (salary_range && salary_range.length > 0) completenessScore += 0.05; // Есть зарплата
  if (!salary_range || salary_range.length === 0) completenessScore -= 0.05; // Нет зарплаты
  completenessWeight += 0.05;
  
  if (requirements && requirements.length > 30) completenessScore += 0.1; // Подробные требования
  if (!requirements || requirements.length < 10) completenessScore -= 0.1; // Нет требований
  completenessWeight += 0.1;
  
  // Нормализуем оценку полноты
  const normalizedCompleteness = completenessWeight > 0 ? 
    Math.max(0, Math.min((completenessScore / completenessWeight + 1) / 2, 1)) : 0.5;
  
  // Высокая полнота уменьшает вероятность мошенничества
  fraudScore += (1 - normalizedCompleteness) * 0.3;
  totalIndicators += 0.3;
  
  // 3. Анализ качества текста (20% веса)
  let qualityScore = 0;
  let qualityWeight = 0;
  
  // Длина текста
  const totalLength = fullText.length;
  if (totalLength < 100) {
    qualityScore += 0.8; // Слишком короткий - подозрительно
    fraudIndicators++;
  } else if (totalLength < 300) {
    qualityScore += 0.3;
  } else if (totalLength > 1000) {
    qualityScore += 0.1; // Длинный текст обычно нормальный
  }
  qualityWeight += 1;
  
  // Профессиональный язык
  const professionalTerms = /responsibilit|qualificat|experience|skill|develop|manag|project|team|client/i;
  if (professionalTerms.test(fullText)) {
    qualityScore -= 0.3; // Профессиональные термины уменьшают риск
  }
  qualityWeight += 0.3;
  
  const normalizedQuality = qualityWeight > 0 ? Math.min(qualityScore / qualityWeight, 1) : 0.2;
  fraudScore += normalizedQuality * 0.2;
  totalIndicators += 0.2;
  
  // 4. Анализ зарплаты (10% веса)
  let salaryScore = 0;
  let salaryWeight = 0;
  
  if (salary_range) {
    const salaryMatch = salary_range.match(/\$?(\d+,?\d+)/);
    if (salaryMatch) {
      const salary = parseInt(salaryMatch[1].replace(/,/g, ''));
      if (!isNaN(salary)) {
        salaryWeight = 1;
        // Проверяем реалистичность зарплаты
        if (salary < 10000) {
          salaryScore = 0.6; // Очень низкая зарплата
          fraudIndicators++;
        } else if (salary < 30000) {
          salaryScore = 0.2; // Низкая но возможная
        } else if (salary > 200000) {
          salaryScore = 0.7; // Нереально высокая
          fraudIndicators++;
        } else if (salary > 500000) {
          salaryScore = 0.9; // Очень подозрительная
          fraudIndicators++;
        } else {
          salaryScore = 0.1; // Нормальная зарплата
        }
      }
    }
  }
  
  const normalizedSalary = salaryWeight > 0 ? salaryScore : 0.3; // Если нет зарплаты - средний риск
  fraudScore += normalizedSalary * 0.1;
  totalIndicators += 0.1;
  
  // Рассчитываем итоговую вероятность
  let finalProba = totalIndicators > 0 ? fraudScore / totalIndicators : 0.15;
  
  // Корректируем на основе количества индикаторов
  if (fraudIndicators === 0) {
    finalProba = Math.max(0.05, finalProba * 0.5); // Нет индикаторов - низкий риск
  } else if (fraudIndicators === 1) {
    finalProba = Math.min(0.4, finalProba * 1.2); // Один индикатор
  } else if (fraudIndicators === 2) {
    finalProba = Math.min(0.6, finalProba * 1.5); // Два индикатора
  } else if (fraudIndicators >= 3) {
    finalProba = Math.min(0.85, finalProba * 2); // Много индикаторов
  }
  
  // Добавляем базовую вероятность и ограничиваем диапазон
  finalProba = Math.max(0.05, Math.min(finalProba, 0.9));
  
  // Учитываем заполненность формы
  const completenessRatio = filledCount / totalFields;
  if (completenessRatio < 0.3) {
    finalProba = 0.3; // Если мало данных, возвращаем средний риск
  }
  
  return finalProba;
}

// Функция для получения рекомендации на английском
function getRecommendation(fraudProba, filledCount, totalFields, fieldsFilled, fullText) {
  const completeness = (filledCount / totalFields) * 100;
  
  let recommendation = {};
  let confidence = "";
  
  // Определяем уровень уверенности
  if (fraudProba < 0.2) {
    confidence = "HIGH confidence";
  } else if (fraudProba < 0.4) {
    confidence = "MEDIUM confidence";
  } else if (fraudProba < 0.6) {
    confidence = "MEDIUM confidence";
  } else if (fraudProba < 0.8) {
    confidence = "MEDIUM confidence";
  } else {
    confidence = "HIGH confidence";
  }
  
  // Основная рекомендация по вероятности мошенничества
  if (fraudProba < 0.15) {
    recommendation = {
      title: "✅ SAFE - Likely legitimate job",
      text: "This job posting shows strong signs of legitimacy. Low fraud risk detected.",
      details: [
        "Professional language and detailed description",
        "Realistic salary and requirements",
        "Complete company information provided"
      ],
      color: "green"
    };
  } else if (fraudProba < 0.35) {
    recommendation = {
      title: "⚠️ MODERATE RISK - Proceed with caution",
      text: "Some minor concerns detected. Verify the company before applying.",
      details: [
        "Check company reviews online",
        "Verify contact information",
        "Look for official website and social media"
      ],
      color: "orange"
    };
  } else if (fraudProba < 0.55) {
    recommendation = {
      title: "⚠️ ELEVATED RISK - Be careful",
      text: "Multiple suspicious indicators found. Thorough verification recommended.",
      details: [
        "Research the company extensively",
        "Never pay any fees upfront",
        "Be cautious with personal information"
      ],
      color: "orange"
    };
  } else if (fraudProba < 0.75) {
    recommendation = {
      title: "❌ HIGH RISK - Likely fraudulent",
      text: "Strong signs of potential fraud detected. Not recommended.",
      details: [
        "Multiple scam patterns identified",
        "Avoid sharing sensitive information",
        "Consider reporting this posting"
      ],
      color: "red"
    };
  } else {
    recommendation = {
      title: "🚫 VERY HIGH RISK - Probable scam",
      text: "Clear fraudulent indicators detected. Strongly advise against applying.",
      details: [
        "Do not respond to this posting",
        "Report to job platform if possible",
        "Protect your personal information"
      ],
      color: "red"
    };
  }
  
  // Добавляем информацию о заполненности полей
  if (completeness < 40) {
    recommendation.details.push(`📝 Note: Only ${filledCount}/${totalFields} fields filled. More details would improve accuracy.`);
  } else if (completeness > 70) {
    recommendation.details.push(`✅ Good input: ${filledCount}/${totalFields} fields provided for accurate analysis.`);
  }
  
  // Проверяем конкретные проблемные поля
  const missingImportant = [];
  if (!fieldsFilled.company_profile) missingImportant.push("company profile");
  if (!fieldsFilled.location) missingImportant.push("location");
  
  if (missingImportant.length > 0 && fraudProba > 0.3) {
    recommendation.details.push(`⚠️ Missing important information: ${missingImportant.join(", ")}`);
  }
  
  // Анализ паттернов в тексте
  const scamIndicators = analyzeTextPatterns(fullText);
  if (scamIndicators.length > 0 && fraudProba > 0.4) {
    recommendation.details.push(`🔍 Detected patterns: ${scamIndicators.slice(0, 2).join(", ")}`);
  }
  
  recommendation.confidence = confidence;
  recommendation.completeness = completeness;
  
  return recommendation;
}

// Анализ текста на мошеннические паттерны
function analyzeTextPatterns(text) {
  const indicators = [];
  const textLower = text.toLowerCase();
  
  if (/earn.*\$?\d+,?\d*\s*(per|a)\s*(week|month)/i.test(textLower)) {
    indicators.push("High earnings promises");
  }
  if (/no experience needed|no experience required/i.test(textLower)) {
    indicators.push("No experience needed");
  }
  if (/investment.*required|fee.*required|payment.*required/i.test(textLower)) {
    indicators.push("Upfront payment requested");
  }
  if (/mlm|multi.?level.?marketing/i.test(textLower)) {
    indicators.push("MLM scheme");
  }
  if (/guaranteed.*income/i.test(textLower)) {
    indicators.push("Guaranteed income");
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
  } else if (fraudProba < 0.6) {
    recContainer.classList.add("recommendation-warning");
  } else {
    recContainer.classList.add("recommendation-danger");
  }
  
  // Создаем HTML для рекомендации
  recContainer.innerHTML = `
    <div class="recommendation-header">
      <h3>${recommendation.title}</h3>
      <div class="recommendation-confidence">Analysis confidence: ${recommendation.confidence}</div>
    </div>
    <div class="recommendation-body">
      <p class="recommendation-summary">${recommendation.text}</p>
      <div class="recommendation-details">
        <h4>Recommendations:</h4>
        <ul>
          ${recommendation.details.map(detail => `<li>${detail}</li>`).join('')}
        </ul>
      </div>
      ${recommendation.completeness < 60 ? 
        `<div class="completeness-warning">
          <strong>Tip:</strong> For better accuracy, fill all fields (${recommendation.completeness.toFixed(0)}% complete)
        </div>` : 
        `<div class="completeness-good">
          <strong>Good job!</strong> Comprehensive input (${recommendation.completeness.toFixed(0)}% complete) enabled detailed analysis.
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
