// --------- Tab navigation ----------
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM loaded, initializing app...");
  
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

  // Загружаем модель и токенизатор
  await loadResources();
  setupPredictionForm();
  setupEDA();
});

// --------- Resource Loading ----------
let tfModel = null;
let tokenizer = null;

async function loadResources() {
  console.log("Starting resource loading...");
  
  // Проверяем, доступен ли TensorFlow.js
  if (typeof tf === 'undefined') {
    console.error("TensorFlow.js is not loaded!");
    showModelError("TensorFlow.js library not loaded. Check if CDN is working.");
    return false;
  }
  
  console.log("TensorFlow.js version:", tf.version_core);
  
  try {
    // Пробуем загрузить модель
    console.log("Attempting to load model from: model.json");
    tfModel = await tf.loadLayersModel('model.json');
    console.log("✓ TensorFlow.js model loaded successfully!");
    
    // Пробуем загрузить токенизатор
    console.log("Attempting to load tokenizer from: tokenizer.json");
    tokenizer = await loadTokenizer();
    
    if (tokenizer) {
      console.log(`✓ Tokenizer loaded with ${Object.keys(tokenizer.wordIndex).length} words`);
      
      // Показываем успешную загрузку
      const statusEl = document.getElementById("predict-status");
      if (statusEl) {
        statusEl.textContent = "✓ ML model loaded successfully!";
        statusEl.style.color = "#22c55e";
        setTimeout(() => { statusEl.textContent = ""; }, 3000);
      }
      
      return true;
    } else {
      console.warn("Tokenizer failed to load, using fallback");
      tokenizer = createFallbackTokenizer();
      return true;
    }
    
  } catch (error) {
    console.error("Resource loading failed:", error);
    
    // Показываем конкретную ошибку
    let errorMsg = "Failed to load ML resources. ";
    if (error.message.includes('404')) {
      errorMsg += "Model files not found. ";
    } else if (error.message.includes('CORS')) {
      errorMsg += "CORS issue. Serve files via HTTP server. ";
    } else if (error.message.includes('JSON')) {
      errorMsg += "Invalid model format. ";
    }
    errorMsg += "Using rule-based analysis.";
    
    showModelError(errorMsg);
    
    tfModel = null;
    tokenizer = createFallbackTokenizer();
    return false;
  }
}

function showModelError(message) {
  console.warn(message);
  const errorEl = document.getElementById("predict-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }
}

async function loadTokenizer() {
  try {
    const response = await fetch('tokenizer.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const tokenizerData = await response.json();
    
    // Создаем токенизатор
    return {
      wordIndex: tokenizerData.word_index || {},
      numWords: tokenizerData.config?.num_words || 30000,
      oovToken: tokenizerData.config?.oov_token || "<OOV>",
      maxLength: 300,
      
      textsToSequences: function(texts) {
        return texts.map(text => {
          // Простая токенизация
          const words = text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 0);
          
          // Преобразуем в индексы
          const sequence = words.map(word => {
            return this.wordIndex[word] || 1; // 1 для OOV
          });
          
          // Обрезаем/дополняем
          if (sequence.length > this.maxLength) {
            return sequence.slice(0, this.maxLength);
          } else {
            return sequence.concat(new Array(this.maxLength - sequence.length).fill(0));
          }
        });
      }
    };
    
  } catch (error) {
    console.warn("Tokenizer load failed:", error);
    return null;
  }
}

function createFallbackTokenizer() {
  console.log("Creating fallback tokenizer");
  return {
    wordIndex: {},
    numWords: 30000,
    maxLength: 300,
    
    textsToSequences: function(texts) {
      return texts.map(text => {
        const words = text.toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 0);
        
        // Простая хэш-функция
        const sequence = words.map(word => {
          let hash = 0;
          for (let i = 0; i < word.length; i++) {
            hash = ((hash << 5) - hash) + word.charCodeAt(i);
            hash = hash & hash;
          }
          return Math.abs(hash) % 29999 + 1;
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

    // Проверяем заполненность
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
    statusEl.textContent = "Analyzing...";
    statusEl.style.color = "";

    try {
      let fraudProba;
      let isModelPrediction = false;
      
      console.log("Starting prediction...");
      
      if (tfModel && tokenizer) {
        console.log("Using TensorFlow.js model");
        try {
          fraudProba = await predictWithTFModel(full_text);
          isModelPrediction = true;
          console.log("Model prediction:", fraudProba);
          statusEl.textContent = "ML analysis complete.";
        } catch (modelError) {
          console.warn("Model prediction failed:", modelError);
          fraudProba = analyzeJobLocally(full_text);
          statusEl.textContent = "Using rule-based analysis.";
        }
      } else {
        console.log("Using rule-based analysis");
        fraudProba = analyzeJobLocally(full_text);
        statusEl.textContent = "Rule-based analysis complete.";
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

async function predictWithTFModel(text) {
  if (!tfModel || !tokenizer) {
    throw new Error("Model not ready");
  }
  
  console.log("Preparing text for model...");
  
  // Токенизируем
  const sequences = tokenizer.textsToSequences([text]);
  console.log("Tokenized sequence length:", sequences[0].length);
  
  // Создаем тензор
  const tensor = tf.tensor2d(sequences, [1, 300]);
  
  // Предсказываем
  console.log("Running model prediction...");
  const prediction = tfModel.predict(tensor);
  const probability = await prediction.data();
  
  // Очищаем
  tensor.dispose();
  prediction.dispose();
  
  console.log("Raw probability:", probability[0]);
  return probability[0];
}

function analyzeJobLocally(text) {
  console.log("Running local analysis");
  
  let fraudScore = 0;
  const textLower = text.toLowerCase();
  
  // Проверяем паттерны
  const patterns = [
    { regex: /earn.*\$?\d+,?\d*\s*(per|a)\s*(week|month)/i, weight: 0.4 },
    { regex: /no experience needed|no experience required/i, weight: 0.3 },
    { regex: /investment.*required|fee.*required|payment.*required/i, weight: 0.5 },
    { regex: /mlm|multi.?level.?marketing/i, weight: 0.4 },
    { regex: /guaranteed.*income/i, weight: 0.35 },
    { regex: /immediate (start|hiring|position)/i, weight: 0.2 },
    { regex: /apply now|contact now|call now/i, weight: 0.15 },
    { regex: /work from home|remote work|home based/i, weight: 0.1 },
    { regex: /flexible hours|flexible schedule/i, weight: 0.05 }
  ];
  
  let foundPatterns = 0;
  patterns.forEach(p => {
    if (p.regex.test(textLower)) {
      fraudScore += p.weight;
      foundPatterns++;
    }
  });
  
  let probability = 0.1; // Базовая вероятность
  
  if (foundPatterns > 0) {
    probability = Math.min(0.8, 0.1 + (fraudScore / foundPatterns) * 0.7);
  }
  
  // Корректировка по длине текста
  if (text.length < 100) probability += 0.2;
  if (text.length > 1000) probability -= 0.1;
  
  probability = Math.max(0.05, Math.min(probability, 0.9));
  console.log("Local analysis result:", probability);
  
  return probability;
}

function showResults(fraudProba, filledCount, totalFields, fieldsFilled, fullText, 
                    resultEl, messageEl, probEl, statusEl, isModelPrediction) {
  const fraudPct = (fraudProba * 100).toFixed(1);
  const legitPct = (100 - fraudProba * 100).toFixed(1);

  resultEl.classList.remove("hidden", "success", "danger");

  if (fraudProba < 0.5) {
    resultEl.classList.add("success");
    messageEl.textContent = isModelPrediction ? 
      "✅ This job appears legitimate (ML analysis)." : 
      "✅ This job appears legitimate (rule-based analysis).";
  } else {
    resultEl.classList.add("danger");
    messageEl.textContent = isModelPrediction ? 
      "⚠️ Warning: possible fraud detected (ML analysis)." : 
      "⚠️ Warning: possible fraud detected (rule-based analysis).";
  }

  probEl.textContent = `Fraud probability: ${fraudPct}% · Legitimate probability: ${legitPct}%`;

  // Простая рекомендация
  const recContainer = document.getElementById("recommendation-container");
  if (recContainer) recContainer.remove();
  
  const newRec = document.createElement("div");
  newRec.id = "recommendation-container";
  newRec.className = fraudProba < 0.5 ? "recommendation recommendation-safe" : 
                     fraudProba < 0.7 ? "recommendation recommendation-warning" : 
                     "recommendation recommendation-danger";
  
  let advice = "";
  if (fraudProba < 0.3) {
    advice = "This job appears safe. Standard precautions recommended.";
  } else if (fraudProba < 0.5) {
    advice = "Exercise normal caution. Verify company details.";
  } else if (fraudProba < 0.7) {
    advice = "Be cautious. Research the company thoroughly.";
  } else {
    advice = "High risk detected. Avoid sharing personal information.";
  }
  
  newRec.innerHTML = `
    <div class="recommendation-header">
      <h3>Recommendation</h3>
    </div>
    <div class="recommendation-body">
      <p>${advice}</p>
      <p><small>Analysis based on ${isModelPrediction ? 'ML model' : 'rule-based system'}. Fill all fields for best results.</small></p>
    </div>
  `;
  
  resultEl.appendChild(newRec);
}

// --------- EDA logic ----------
let fraudChart = null;
let lengthChart = null;
let lengthByClassChart = null;
let missingChart = null;

function setupEDA() {
  console.log("Setting up EDA...");
  
  const jsonPath = "data/eda_data.json";
  const edaError = document.getElementById("eda-error");
  const totalEl = document.getElementById("total-count");
  const realEl = document.getElementById("real-count");
  const fraudEl = document.getElementById("fraud-count");

  fetch(jsonPath)
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(edadata => {
      console.log("EDA data loaded");
      
      const realCount = edadata.class_counts?.Real || 0;
      const fraudCount = edadata.class_counts?.Fake || 0;
      const total = realCount + fraudCount;

      if (totalEl) totalEl.textContent = total.toLocaleString();
      if (realEl) realEl.textContent = realCount.toLocaleString();
      if (fraudEl) fraudEl.textContent = fraudCount.toLocaleString();

      // Простые графики
      renderSimpleCharts(edadata);
    })
    .catch(error => {
      console.warn("EDA load failed:", error);
      if (edaError) {
        edaError.textContent = "Dataset stats unavailable.";
        edaError.classList.remove("hidden");
      }
    });
}

function renderSimpleCharts(edadata) {
  // Простая реализация - можно заменить на Chart.js если нужно
  console.log("Rendering simple charts");
}

// Проверяем файлы
function checkFiles() {
  const files = ['model.json', 'tokenizer.json', 'group1-shard1of4.bin'];
  files.forEach(file => {
    fetch(file, { method: 'HEAD' })
      .then(res => console.log(`${file}: ${res.ok ? '✓ Found' : '✗ Missing'}`))
      .catch(() => console.log(`${file}: ✗ Error`));
  });
}

// Запускаем проверку при загрузке
setTimeout(checkFiles, 1000);
