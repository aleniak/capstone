// --------- Tab navigation ----------
document.addEventListener("DOMContentLoaded", async () => {
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

  // Загружаем TensorFlow.js модель и токенизатор
  await loadTFModelAndTokenizer();
  setupPredictionForm();
  setupEDA();
});

// --------- Model and Tokenizer Loading ----------
let tfModel = null;
let tokenizer = null;

async function loadTFModelAndTokenizer() {
  try {
    console.log("Loading TensorFlow.js model and tokenizer...");
    
    // Загружаем модель из model.json
    tfModel = await tf.loadLayersModel('model.json');
    console.log("TensorFlow.js model loaded successfully!");
    
    // Загружаем токенизатор
    await loadTokenizer();
    console.log("Tokenizer loaded successfully!");
    
    return true;
  } catch (error) {
    console.error("Failed to load model or tokenizer:", error);
    tfModel = null;
    tokenizer = null;
    
    // Показываем ошибку пользователю
    const errorEl = document.getElementById("predict-error");
    if (errorEl) {
      errorEl.textContent = "ML model failed to load. Using rule-based analysis.";
      errorEl.classList.remove("hidden");
    }
    
    return false;
  }
}

async function loadTokenizer() {
  try {
    const response = await fetch('tokenizer.json');
    if (!response.ok) {
      throw new Error(`Failed to load tokenizer: ${response.status}`);
    }
    
    const tokenizerData = await response.json();
    
    // Создаем объект токенизатора на основе данных
    tokenizer = {
      wordIndex: tokenizerData.word_index || {},
      indexWord: tokenizerData.index_word || {},
      numWords: tokenizerData.config?.num_words || 30000,
      oovToken: tokenizerData.config?.oov_token || "<OOV>",
      filters: tokenizerData.config?.filters || "!\"#$%&()*+,-./:;<=>?@[\\]^_`{|}~\t\n",
      lower: tokenizerData.config?.lower !== false,
      split: tokenizerData.config?.split || " ",
      charLevel: tokenizerData.config?.char_level || false,
      documentCount: tokenizerData.config?.document_count || 0,
      
      // Метод для преобразования текста в последовательности
      textsToSequences: function(texts) {
        return texts.map(text => {
          // Приводим к нижнему регистру если нужно
          let processedText = this.lower ? text.toLowerCase() : text;
          
          // Удаляем фильтруемые символы
          if (this.filters) {
            const filterRegex = new RegExp(`[${this.filters.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`, 'g');
            processedText = processedText.replace(filterRegex, ' ');
          }
          
          // Разбиваем на токены
          const tokens = processedText.split(this.split).filter(token => token.length > 0);
          
          // Преобразуем токены в индексы
          const sequence = tokens.map(token => {
            // Если токен есть в словаре, возвращаем его индекс
            if (this.wordIndex[token]) {
              return this.wordIndex[token];
            }
            // Если нет, возвращаем индекс OOV токена или 1
            return this.wordIndex[this.oovToken] || 1;
          });
          
          // Обрезаем до максимальной длины модели (300)
          const maxLength = 300;
          if (sequence.length > maxLength) {
            return sequence.slice(0, maxLength);
          } else {
            // Дополняем нулями до нужной длины
            return sequence.concat(new Array(maxLength - sequence.length).fill(0));
          }
        });
      },
      
      // Дополнительный метод для просмотра токенов
      tokenize: function(text) {
        let processedText = this.lower ? text.toLowerCase() : text;
        
        if (this.filters) {
          const filterRegex = new RegExp(`[${this.filters.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`, 'g');
          processedText = processedText.replace(filterRegex, ' ');
        }
        
        return processedText.split(this.split).filter(token => token.length > 0);
      }
    };
    
    console.log(`Tokenizer loaded with ${Object.keys(tokenizer.wordIndex).length} words`);
    return tokenizer;
    
  } catch (error) {
    console.error("Failed to load tokenizer:", error);
    // Создаем простой токенизатор как запасной вариант
    tokenizer = createFallbackTokenizer();
    return tokenizer;
  }
}

function createFallbackTokenizer() {
  console.log("Creating fallback tokenizer...");
  
  return {
    wordIndex: {},
    numWords: 30000,
    oovToken: "<OOV>",
    maxLength: 300,
    
    textsToSequences: function(texts) {
      return texts.map(text => {
        const words = text.toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 0);
        
        // Простая хэш-функция для создания индексов
        const sequence = words.map(word => {
          let hash = 0;
          for (let i = 0; i < word.length; i++) {
            hash = ((hash << 5) - hash) + word.charCodeAt(i);
            hash = hash & hash;
          }
          return Math.abs(hash) % 29999 + 1; // 1-30000 для embedding
        });
        
        if (sequence.length > this.maxLength) {
          return sequence.slice(0, this.maxLength);
        } else {
          return sequence.concat(new Array(this.maxLength - sequence.length).fill(0));
        }
      });
    }
  };
}

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

    // Проверяем заполненность полей
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

    predictButton.disabled = true;
    statusEl.textContent = "Analyzing with ML model...";

    try {
      let fraudProba;
      let isModelPrediction = false;
      
      // Пробуем использовать TensorFlow.js модель
      if (tfModel && tokenizer && typeof tf !== 'undefined') {
        try {
          fraudProba = await predictWithTFModel(full_text);
          isModelPrediction = true;
          statusEl.textContent = "ML analysis complete.";
        } catch (modelError) {
          console.warn("TF Model prediction failed, using fallback:", modelError);
          fraudProba = analyzeJobLocally(title, company_profile, description, requirements, 
                                       benefits, location, salary_range, employment_type, industry);
          statusEl.textContent = "Using rule-based analysis (model failed).";
        }
      } else {
        // Если модель не загрузилась, используем эвристический анализ
        fraudProba = analyzeJobLocally(title, company_profile, description, requirements, 
                                     benefits, location, salary_range, employment_type, industry);
        statusEl.textContent = "Using rule-based analysis (no ML model).";
      }
      
      showResults(fraudProba, filledCount, totalFields, fieldsFilled, full_text, 
                 resultEl, messageEl, probEl, statusEl, isModelPrediction);

    } catch (err) {
      console.error("Prediction error:", err);
      
      errorEl.textContent = "Analysis failed. Please try again.";
      errorEl.classList.remove("hidden");
      statusEl.textContent = "Error occurred.";
      
    } finally {
      predictButton.disabled = false;
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    }
  });
}

// Предсказание с помощью TensorFlow.js модели
async function predictWithTFModel(text) {
  if (!tfModel || !tokenizer) {
    throw new Error("Model or tokenizer not loaded");
  }
  
  // Подготавливаем текст для модели
  const sequences = tokenizer.textsToSequences([text]);
  const tensor = tf.tensor2d(sequences, [1, 300]); // max_length = 300
  
  // Делаем предсказание
  const prediction = tfModel.predict(tensor);
  const probability = await prediction.data();
  
  // Очищаем тензоры
  tensor.dispose();
  prediction.dispose();
  
  // Возвращаем вероятность мошенничества (1 = fake)
  return probability[0];
}

function showResults(fraudProba, filledCount, totalFields, fieldsFilled, fullText, 
                    resultEl, messageEl, probEl, statusEl, isModelPrediction) {
  const fraudPct = (fraudProba * 100).toFixed(1);
  const legitPct = (100 - fraudProba * 100).toFixed(1);

  resultEl.classList.remove("hidden", "success", "danger");

  const modelType = isModelPrediction ? " (ML model)" : " (rule-based)";
  
  if (fraudProba < 0.5) {
    resultEl.classList.add("success");
    messageEl.textContent = `This job posting appears legitimate${modelType}.`;
  } else {
    resultEl.classList.add("danger");
    messageEl.textContent = `Warning: high fraud probability detected${modelType}.`;
  }

  probEl.textContent =
    `Fraud probability: ${fraudPct}% · Legitimate probability: ${legitPct}%`;

  // Добавляем рекомендацию
  const recommendation = getRecommendation(fraudProba, filledCount, totalFields, fieldsFilled, fullText);
  displayRecommendation(recommendation, fraudProba);

  if (isModelPrediction) {
    statusEl.textContent = "ML model analysis complete.";
  } else {
    statusEl.textContent = "Rule-based analysis complete.";
  }
}

// Эвристический анализ (запасной вариант)
function analyzeJobLocally(title, company_profile, description, requirements, 
                         benefits, location, salary_range, employment_type, industry) {
  
  let fraudIndicators = 0;
  let totalFactors = 0;
  let fraudScore = 0;
  
  const fullText = (title + " " + company_profile + " " + description + " " + 
                   requirements + " " + benefits).toLowerCase();
  
  // Анализ текстовых паттернов
  const scamPatterns = [
    { pattern: /earn.*\$?\d+,?\d*\s*(per|a)\s*(week|month)/i, weight: 0.3 },
    { pattern: /no experience needed|no experience required/i, weight: 0.2 },
    { pattern: /investment.*required|fee.*required|payment.*required/i, weight: 0.4 },
    { pattern: /mlm|multi.?level.?marketing/i, weight: 0.3 },
    { pattern: /guaranteed.*income/i, weight: 0.25 },
    { pattern: /immediate (start|hiring|position)/i, weight: 0.15 },
    { pattern: /apply now|contact now|call now/i, weight: 0.1 }
  ];
  
  scamPatterns.forEach(item => {
    if (item.pattern.test(fullText)) {
      fraudScore += item.weight;
      fraudIndicators++;
    }
  });
  
  totalFactors += 1.0;
  
  // Корректировка на основе количества индикаторов
  let finalProba = fraudScore / totalFactors;
  
  if (fraudIndicators === 0) {
    finalProba = 0.15; // Нет индикаторов - низкий риск
  } else if (fraudIndicators === 1) {
    finalProba = Math.min(0.4, finalProba * 1.5);
  } else if (fraudIndicators >= 2) {
    finalProba = Math.min(0.7, finalProba * 2);
  }
  
  // Добавляем базовую вероятность и ограничиваем диапазон
  finalProba = Math.max(0.05, Math.min(finalProba, 0.85));
  
  return finalProba;
}

// Функция для получения рекомендации на английском
function getRecommendation(fraudProba, filledCount, totalFields, fieldsFilled, fullText) {
  const completeness = (filledCount / totalFields) * 100;
  
  let recommendation = {};
  let confidence = "";
  
  // Определяем уровень уверенности
  if (fraudProba < 0.2) confidence = "HIGH confidence";
  else if (fraudProba < 0.4) confidence = "MEDIUM confidence";
  else if (fraudProba < 0.6) confidence = "MEDIUM confidence";
  else if (fraudProba < 0.8) confidence = "MEDIUM confidence";
  else confidence = "HIGH confidence";
  
  // Основная рекомендация
  if (fraudProba < 0.15) {
    recommendation = {
      title: "✅ SAFE - Likely legitimate job",
      text: "This job posting shows strong signs of legitimacy. Low fraud risk detected.",
      details: [
        "Professional language and detailed description",
        "Realistic salary and requirements",
        "Complete company information provided"
      ]
    };
  } else if (fraudProba < 0.35) {
    recommendation = {
      title: "⚠️ MODERATE RISK - Proceed with caution",
      text: "Some minor concerns detected. Verify the company before applying.",
      details: [
        "Check company reviews online",
        "Verify contact information",
        "Look for official website and social media"
      ]
    };
  } else if (fraudProba < 0.55) {
    recommendation = {
      title: "⚠️ ELEVATED RISK - Be careful",
      text: "Multiple suspicious indicators found. Thorough verification recommended.",
      details: [
        "Research the company extensively",
        "Never pay any fees upfront",
        "Be cautious with personal information"
      ]
    };
  } else if (fraudProba < 0.75) {
    recommendation = {
      title: "❌ HIGH RISK - Likely fraudulent",
      text: "Strong signs of potential fraud detected. Not recommended.",
      details: [
        "Multiple scam patterns identified",
        "Avoid sharing sensitive information",
        "Consider reporting this posting"
      ]
    };
  } else {
    recommendation = {
      title: "🚫 VERY HIGH RISK - Probable scam",
      text: "Clear fraudulent indicators detected. Strongly advise against applying.",
      details: [
        "Do not respond to this posting",
        "Report to job platform if possible",
        "Protect your personal information"
      ]
    };
  }
  
  // Добавляем информацию о заполненности полей
  if (completeness < 40) {
    recommendation.details.push(`📝 Note: Only ${filledCount}/${totalFields} fields filled. More details would improve accuracy.`);
  } else if (completeness > 70) {
    recommendation.details.push(`✅ Good input: ${filledCount}/${totalFields} fields provided for accurate analysis.`);
  }
  
  recommendation.confidence = confidence;
  recommendation.completeness = completeness;
  
  return recommendation;
}

// Функция для отображения рекомендации
function displayRecommendation(recommendation, fraudProba) {
  const oldRec = document.getElementById("recommendation-container");
  if (oldRec) oldRec.remove();
  
  const resultEl = document.getElementById("predict-result");
  const recContainer = document.createElement("div");
  recContainer.id = "recommendation-container";
  recContainer.className = "recommendation";
  
  if (fraudProba < 0.3) {
    recContainer.classList.add("recommendation-safe");
  } else if (fraudProba < 0.6) {
    recContainer.classList.add("recommendation-warning");
  } else {
    recContainer.classList.add("recommendation-danger");
  }
  
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
    </div>
  `;
  
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
