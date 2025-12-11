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
  setupParseByLink();
  setupEDA();
});

// --------- Parse Job by Link ----------
function setupParseByLink() {
  const parseForm = document.getElementById("parse-form");
  const parseButton = document.getElementById("parse-button");
  const parseStatus = document.getElementById("parse-status");
  const parseError = document.getElementById("parse-error");
  const jobPreview = document.getElementById("job-preview");

  if (!parseForm) return;

  parseForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const urlInput = document.getElementById("job-url");
    const url = urlInput.value.trim();
    
    if (!url) {
      showParseError("Please enter a URL");
      return;
    }
    
    // Проверяем что это URL
    try {
      new URL(url);
    } catch {
      showParseError("Please enter a valid URL");
      return;
    }
    
    parseButton.disabled = true;
    parseStatus.textContent = "Parsing job posting...";
    parseError.classList.add("hidden");
    jobPreview.classList.add("hidden");
    
    try {
      // В реальном приложении здесь был бы запрос к серверу для парсинга
      // Для демо используем мок данные
      const jobData = await parseJobFromURL(url);
      
      // Заполняем форму данными
      fillFormWithJobData(jobData);
      
      // Показываем превью
      showJobPreview(jobData);
      
      parseStatus.textContent = "Job parsed successfully!";
      
    } catch (error) {
      console.error("Parse error:", error);
      showParseError("Failed to parse job. Please enter details manually or try another URL.");
      parseStatus.textContent = "Parse failed";
    } finally {
      parseButton.disabled = false;
      setTimeout(() => {
        parseStatus.textContent = "";
      }, 3000);
    }
  });
}

async function parseJobFromURL(url) {
  console.log("Parsing URL:", url);
  
  // В реальном приложении здесь был бы запрос к вашему бэкенду для парсинга
  // Например: const response = await fetch('/api/parse-job', { method: 'POST', body: JSON.stringify({ url }) });
  
  // Для демо используем мок данные
  await new Promise(resolve => setTimeout(resolve, 1000)); // Имитация загрузки
  
  // Определяем платформу по URL
  if (url.includes('linkedin.com')) {
    return parseMockLinkedInJob();
  } else if (url.includes('indeed.com')) {
    return parseMockIndeedJob();
  } else if (url.includes('glassdoor.com')) {
    return parseMockGlassdoorJob();
  } else {
    // Общий шаблон
    return parseMockGenericJob();
  }
}

function parseMockLinkedInJob() {
  return {
    title: "Senior Data Analyst",
    company_profile: "TechCorp Inc. is a leading technology company specializing in data solutions with over 1000 employees worldwide.",
    description: "We are looking for a Senior Data Analyst to join our analytics team. You will be responsible for analyzing large datasets, creating reports, and providing insights to drive business decisions.",
    requirements: "• 5+ years experience in data analysis\n• Proficiency in SQL and Python\n• Experience with data visualization tools (Tableau, Power BI)\n• Strong statistical analysis skills\n• Excellent communication skills",
    benefits: "• Competitive salary\n• Health insurance\n• 401(k) matching\n• Flexible work schedule\n• Professional development budget",
    location: "San Francisco, CA (Hybrid)",
    salary_range: "$120,000 - $150,000",
    employment_type: "Full-time",
    industry: "Information Technology"
  };
}

function parseMockIndeedJob() {
  return {
    title: "Marketing Manager",
    company_profile: "Growth Marketing Agency helps businesses scale through digital marketing strategies.",
    description: "Seeking a Marketing Manager to lead our client campaigns and internal marketing efforts.",
    requirements: "• Bachelor's degree in Marketing or related field\n• 3+ years marketing experience\n• Experience with Google Analytics and AdWords\n• Content creation skills",
    benefits: "• Health benefits\n• Paid time off\n• Remote work options",
    location: "Remote (US)",
    salary_range: "$80,000 - $100,000",
    employment_type: "Full-time",
    industry: "Marketing"
  };
}

function parseMockGlassdoorJob() {
  return {
    title: "Software Engineer",
    company_profile: "Innovative software company creating cutting-edge solutions for enterprise clients.",
    description: "Join our engineering team to develop scalable software applications.",
    requirements: "• Computer Science degree\n• 2+ years experience with JavaScript/Node.js\n• Knowledge of cloud platforms (AWS/Azure)\n• Agile development experience",
    benefits: "• Stock options\n• Comprehensive health coverage\n• Unlimited PTO\n• Home office stipend",
    location: "New York, NY",
    salary_range: "$130,000 - $180,000",
    employment_type: "Full-time",
    industry: "Software Development"
  };
}

function parseMockGenericJob() {
  return {
    title: "Customer Support Specialist",
    company_profile: "Fast-growing startup providing customer support solutions.",
    description: "Provide excellent customer service and support to our clients.",
    requirements: "• Excellent communication skills\n• Problem-solving ability\n• Customer service experience\n• Technical aptitude",
    benefits: "• Flexible hours\n• Training provided\n• Performance bonuses",
    location: "Chicago, IL",
    salary_range: "$45,000 - $55,000",
    employment_type: "Full-time",
    industry: "Customer Service"
  };
}

function fillFormWithJobData(jobData) {
  // Заполняем все поля формы
  document.getElementById("title").value = jobData.title || "";
  document.getElementById("company_profile").value = jobData.company_profile || "";
  document.getElementById("description").value = jobData.description || "";
  document.getElementById("requirements").value = jobData.requirements || "";
  document.getElementById("benefits").value = jobData.befits || "";
  document.getElementById("location").value = jobData.location || "";
  document.getElementById("salary_range").value = jobData.salary_range || "";
  document.getElementById("employment_type").value = jobData.employment_type || "";
  document.getElementById("industry").value = jobData.industry || "";
}

function showJobPreview(jobData) {
  const preview = document.getElementById("job-preview");
  const content = document.getElementById("preview-content");
  
  content.innerHTML = `
    <div class="preview-section">
      <h4>📋 Job Preview</h4>
      <div class="preview-field">
        <strong>Title:</strong> ${jobData.title}
      </div>
      <div class="preview-field">
        <strong>Company:</strong> ${jobData.company_profile.substring(0, 100)}...
      </div>
      <div class="preview-field">
        <strong>Location:</strong> ${jobData.location}
      </div>
      <div class="preview-field">
        <strong>Salary:</strong> ${jobData.salary_range}
      </div>
      <div class="preview-field">
        <strong>Type:</strong> ${jobData.employment_type}
      </div>
      <p class="preview-note">Form filled automatically. You can edit any field before predicting.</p>
    </div>
  `;
  
  preview.classList.remove("hidden");
}

function showParseError(message) {
  const errorEl = document.getElementById("parse-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }
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
      // Пробуем бэкенд
      const response = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Backend not available");
      }

      const data = await response.json();
      const proba = data.fraud_proba || data.probability || data.fraud_probability || 0.5;
      
      showResult(proba, resultEl, messageEl, probEl, statusEl, false, {
        title, company_profile, description, requirements, benefits, 
        location, salary_range, employment_type, industry
      });
      
    } catch (err) {
      console.log("Using local analysis");
      // Локальный анализ на основе данных
      const fraudProba = localAnalysis(title, company_profile, description, requirements, 
                                      benefits, location, salary_range, employment_type, industry);
      
      showResult(fraudProba, resultEl, messageEl, probEl, statusEl, true, {
        title, company_profile, description, requirements, benefits, 
        location, salary_range, employment_type, industry
      });
    } finally {
      predictButton.disabled = false;
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    }
  });
}

function localAnalysis(title, company_profile, description, requirements, 
                      benefits, location, salary_range, employment_type, industry) {
  
  const text = (title + " " + company_profile + " " + description + " " + 
               requirements + " " + benefits).toLowerCase();
  
  let score = 0;
  let indicators = [];
  
  // Проверяем паттерны
  const patterns = [
    { regex: /earn.*\$\d+,?\d*\s*(per|a)\s*(week|month)/i, weight: 0.4, msg: "Unrealistic earnings promise" },
    { regex: /no experience needed|no experience required/i, weight: 0.3, msg: "No experience required" },
    { regex: /investment.*required|fee.*required|payment.*required/i, weight: 0.5, msg: "Upfront payment requested" },
    { regex: /mlm|multi.?level.?marketing/i, weight: 0.4, msg: "MLM scheme detected" },
    { regex: /guaranteed.*income/i, weight: 0.35, msg: "Guaranteed income" },
    { regex: /immediate (start|hiring|position)/i, weight: 0.2, msg: "Urgent hiring" },
    { regex: /apply now|contact now|call now/i, weight: 0.15, msg: "High-pressure language" },
    { regex: /work from home|remote work|home based/i, weight: 0.1, msg: "Work from home" }
  ];
  
  patterns.forEach(p => {
    if (p.regex.test(text)) {
      score += p.weight;
      indicators.push(p.msg);
    }
  });
  
  // Проверяем данные
  if (!company_profile || company_profile.length < 30) {
    score += 0.2;
    indicators.push("Missing company profile");
  }
  if (!salary_range) {
    score += 0.1;
    indicators.push("No salary information");
  }
  if (!location) {
    score += 0.1;
    indicators.push("No location specified");
  }
  if (description.length < 100) {
    score += 0.2;
    indicators.push("Very short description");
  }
  
  // Положительные признаки
  if (/experience.*required|qualification|degree/i.test(text)) {
    score -= 0.2;
    indicators.push("Professional requirements mentioned");
  }
  if (/benefits|insurance|401|retirement/i.test(text)) {
    score -= 0.15;
    indicators.push("Benefits package mentioned");
  }
  
  // Нормализуем
  let probability = Math.min(Math.max(0.1 + (score * 0.7), 0.05), 0.9);
  
  // Если название выглядит профессионально
  if (/engineer|developer|analyst|manager|specialist|director/i.test(title)) {
    probability *= 0.7;
  }
  
  // Сохраняем индикаторы
  window.lastAnalysisIndicators = indicators;
  
  return probability;
}

function showResult(probability, resultEl, messageEl, probEl, statusEl, isLocal, jobData) {
  const fraudPct = (probability * 100).toFixed(1);
  const legitPct = (100 - probability * 100).toFixed(1);

  resultEl.classList.remove("hidden", "success", "danger");

  if (probability < 0.5) {
    resultEl.classList.add("success");
    messageEl.textContent = isLocal ? 
      "✅ This job posting appears legitimate (local analysis)." : 
      "✅ This job posting appears legitimate.";
  } else {
    resultEl.classList.add("danger");
    messageEl.textContent = isLocal ? 
      "⚠️ Warning: high fraud probability detected (local analysis)." : 
      "⚠️ Warning: high fraud probability detected.";
  }

  probEl.textContent = `Fraud probability: ${fraudPct}% · Legitimate probability: ${legitPct}%`;
  
  // Добавляем детальный отчет
  addDetailedReport(probability, resultEl, jobData);
  
  statusEl.textContent = isLocal ? "Local analysis complete" : "Analysis complete";
}

function addDetailedReport(probability, resultEl, jobData) {
  const oldReport = document.getElementById("detailed-report");
  if (oldReport) oldReport.remove();
  
  const report = document.createElement("div");
  report.id = "detailed-report";
  report.className = "detailed-report";
  
  let riskLevel = "";
  let colorClass = "";
  
  if (probability < 0.2) {
    riskLevel = "VERY LOW RISK";
    colorClass = "report-safe";
  } else if (probability < 0.4) {
    riskLevel = "LOW RISK";
    colorClass = "report-safe";
  } else if (probability < 0.6) {
    riskLevel = "MEDIUM RISK";
    colorClass = "report-warning";
  } else if (probability < 0.8) {
    riskLevel = "HIGH RISK";
    colorClass = "report-danger";
  } else {
    riskLevel = "VERY HIGH RISK";
    colorClass = "report-danger";
  }
  
  const indicators = window.lastAnalysisIndicators || [];
  
  report.innerHTML = `
    <div class="report-header ${colorClass}">
      <h4>📊 Detailed Analysis Report</h4>
      <div class="risk-level">Risk Level: ${riskLevel}</div>
    </div>
    
    <div class="report-body">
      <div class="report-section">
        <h5>Job Summary</h5>
        <div class="job-summary">
          <p><strong>Title:</strong> ${jobData.title || "Not specified"}</p>
          <p><strong>Location:</strong> ${jobData.location || "Not specified"}</p>
          <p><strong>Salary:</strong> ${jobData.salary_range || "Not specified"}</p>
          <p><strong>Employment Type:</strong> ${jobData.employment_type || "Not specified"}</p>
        </div>
      </div>
      
      <div class="report-section">
        <h5>Analysis Indicators</h5>
        <div class="indicators-list">
          ${indicators.length > 0 ? 
            indicators.map(ind => `<div class="indicator">• ${ind}</div>`).join('') : 
            '<div class="indicator">No specific indicators detected</div>'
          }
        </div>
      </div>
      
      <div class="report-section">
        <h5>Recommendation</h5>
        <div class="recommendation">
          ${getRecommendationText(probability)}
        </div>
      </div>
      
      <div class="report-section">
        <h5>Verification Steps</h5>
        <div class="verification-steps">
          ${getVerificationSteps(probability)}
        </div>
      </div>
    </div>
  `;
  
  resultEl.appendChild(report);
}

function getRecommendationText(probability) {
  if (probability < 0.3) {
    return "✅ This job appears safe. Standard job application precautions apply.";
  } else if (probability < 0.5) {
    return "⚠️ Exercise normal caution. Verify company details and contact information.";
  } else if (probability < 0.7) {
    return "⚠️ High risk detected. Research the company thoroughly before applying.";
  } else {
    return "🚫 Very high risk. Likely fraudulent. Do not share personal or financial information.";
  }
}

function getVerificationSteps(probability) {
  const steps = [
    "✓ Check company website and social media",
    "✓ Search for company reviews on Glassdoor/LinkedIn",
    "✓ Verify job posting on company's official career page",
    "✓ Never pay money for job applications or training"
  ];
  
  if (probability > 0.5) {
    steps.push("✓ Be cautious of requests for personal information");
    steps.push("✓ Report suspicious postings to the platform");
  }
  
  return steps.map(step => `<div class="step">${step}</div>`).join('');
}

// --------- EDA logic ----------
function setupEDA() {
  // Простая EDA с фиксированными данными
  document.getElementById("total-count").textContent = "27,880";
  document.getElementById("real-count").textContent = "17,014";
  document.getElementById("fraud-count").textContent = "10,866";
}
