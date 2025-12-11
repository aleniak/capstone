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

// --------- REAL PARSING with CORS proxy ----------
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
      // Парсим реальную страницу через CORS прокси
      const jobData = await parseRealJobPage(url);
      
      // Заполняем форму данными
      fillFormWithJobData(jobData);
      
      // Показываем превью
      showJobPreview(jobData, url);
      
      parseStatus.textContent = "✅ Job parsed successfully!";
      
    } catch (error) {
      console.error("Parse error:", error);
      
      // Пробуем альтернативный метод
      try {
        parseStatus.textContent = "Trying alternative method...";
        const jobData = await parseWithOpenGraph(url);
        
        fillFormWithJobData(jobData);
        showJobPreview(jobData, url);
        parseStatus.textContent = "✅ Job parsed (basic info)";
        
      } catch (secondError) {
        console.error("Second parse error:", secondError);
        
        // Используем mock данные как запасной вариант
        parseStatus.textContent = "Using sample data...";
        const jobData = getMockDataBasedOnURL(url);
        
        fillFormWithJobData(jobData);
        showJobPreview(jobData, url);
        parseStatus.textContent = "⚠️ Using sample data (parsing failed)";
        showParseError("Could not parse the page directly. Using sample data. You can edit the fields.");
      }
      
    } finally {
      parseButton.disabled = false;
      setTimeout(() => {
        parseStatus.textContent = "";
      }, 3000);
    }
  });
}

async function parseRealJobPage(url) {
  console.log("Parsing real page:", url);
  
  // Специальная обработка для HH.ru
  if (url.includes('hh.ru')) {
    return await parseHHJob(url);
  }
  
  // Используем CORS прокси для других сайтов
  const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
  
  const response = await fetch(proxyUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const html = await response.text();
  console.log("HTML received, length:", html.length);
  
  // Создаем временный DOM для парсинга
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  return extractJobDataFromDOM(doc, url);
}

function extractJobDataFromDOM(doc, url) {
  const jobData = {
    title: "",
    company_profile: "",
    description: "",
    requirements: "",
    benefits: "",
    location: "",
    salary_range: "",
    employment_type: "",
    industry: "",
    source_url: url
  };
  
  // Парсим в зависимости от платформы
  if (url.includes('linkedin.com')) {
    return parseLinkedInDOM(doc, jobData);
  } else if (url.includes('indeed.com')) {
    return parseIndeedDOM(doc, jobData);
  } else if (url.includes('glassdoor.com')) {
    return parseGlassdoorDOM(doc, jobData);
  } else if (url.includes('career.habr.com') || url.includes('habr.com')) {
    return parseHabrCareerDOM(doc, jobData);
  } else if (url.includes('hh.ru')) {
    return parseHHDOM(doc, jobData);
  } else {
    // Общий парсинг для любых сайтов
    return parseGenericDOM(doc, jobData);
  }
}

// Специальный парсинг для HH.ru
async function parseHHJob(url) {
  console.log("Parsing HH.ru job with enhanced parser");
  
  try {
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    
    const response = await fetch(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log("HH.ru HTML received, length:", html.length);
    
    // Проверяем, что получили правильную страницу
    if (html.includes('vacancy-title') || html.includes('hh.ru/vacancy')) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      return parseHHDOM(doc, { source_url: url });
    } else {
      throw new Error("Not a valid HH.ru vacancy page");
    }
    
  } catch (error) {
    console.error("HH.ru parsing error:", error);
    throw error;
  }
}

function parseHHDOM(doc, jobData) {
  console.log("Parsing HH.ru job posting");
  
  // Заголовок вакансии
  jobData.title = doc.querySelector('h1[data-qa="vacancy-title"]')?.textContent?.trim() ||
                  doc.querySelector('.vacancy-title')?.textContent?.trim() ||
                  doc.querySelector('h1')?.textContent?.trim() ||
                  "Job Title";
  
  // Компания
  const companyName = doc.querySelector('[data-qa="vacancy-company-name"]')?.textContent?.trim() ||
                      doc.querySelector('.vacancy-company-name')?.textContent?.trim() ||
                      doc.querySelector('.company-name')?.textContent?.trim() ||
                      "";
  
  // Описание компании
  const companyInfo = doc.querySelector('[data-qa="vacancy-company-details"]')?.textContent?.trim() ||
                      doc.querySelector('.vacancy-company-details')?.textContent?.trim() ||
                      "";
  
  jobData.company_profile = `${companyName}${companyInfo ? ` - ${companyInfo}` : ''}`;
  
  // Описание вакансии
  const descriptionElement = doc.querySelector('[data-qa="vacancy-description"]') ||
                             doc.querySelector('.vacancy-description') ||
                             doc.querySelector('.g-user-content');
  
  if (descriptionElement) {
    // Получаем весь текст из описания
    jobData.description = descriptionElement.textContent?.trim() || "";
    
    // Пытаемся выделить требования и обязанности
    const text = jobData.description.toLowerCase();
    
    // Ищем требования (обычно начинаются с "Требования:", "Мы ждем:", "Обязанности:")
    const requirementsMatch = text.match(/(?:требования|ожидаем|ждем|нужно|обязанности)(.*?)(?:обязанности|условия|предлагаем|$)/si);
    if (requirementsMatch) {
      jobData.requirements = requirementsMatch[1].trim();
    }
    
    // Ищем условия/бенефиты
    const benefitsMatch = text.match(/(?:условия|предлагаем|бенефиты|мы предлагаем)(.*?)(?:требования|обязанности|$)/si);
    if (benefitsMatch) {
      jobData.benefits = benefitsMatch[1].trim();
    }
  } else {
    // Если не нашли специальный элемент, берем основной контент
    const mainContent = doc.querySelector('main') || doc.querySelector('.vacancy-page') || doc.body;
    jobData.description = mainContent.textContent?.substring(0, 3000).trim() || "";
  }
  
  // Локация
  jobData.location = doc.querySelector('[data-qa="vacancy-view-location"]')?.textContent?.trim() ||
                     doc.querySelector('.vacancy-address')?.textContent?.trim() ||
                     doc.querySelector('[data-qa="vacancy-serp__vacancy-address"]')?.textContent?.trim() ||
                     "";
  
  // Зарплата
  const salaryElement = doc.querySelector('[data-qa="vacancy-salary"]') ||
                        doc.querySelector('.vacancy-salary') ||
                        doc.querySelector('.bloko-header-section-3');
  
  if (salaryElement) {
    jobData.salary_range = salaryElement.textContent?.trim() || "";
  }
  
  // Тип занятости
  const employmentElements = doc.querySelectorAll('[data-qa="vacancy-view-employment-mode"]');
  if (employmentElements.length > 0) {
    const employmentTypes = Array.from(employmentElements).map(el => el.textContent?.trim()).filter(Boolean);
    jobData.employment_type = employmentTypes.join(', ');
  } else {
    // Пытаемся определить по тексту
    const text = jobData.description.toLowerCase();
    if (text.includes('удален') || text.includes('remote') || text.includes('дистанцион')) {
      jobData.employment_type = "Remote";
    } else if (text.includes('офис') || text.includes('office')) {
      jobData.employment_type = "Office";
    } else if (text.includes('гибрид') || text.includes('hybrid')) {
      jobData.employment_type = "Hybrid";
    }
  }
  
  // Опыт работы
  const experienceElement = doc.querySelector('[data-qa="vacancy-experience"]');
  if (experienceElement) {
    jobData.requirements = (jobData.requirements || "") + "\n" + experienceElement.textContent?.trim();
  }
  
  // Ключевые навыки
  const skillsElements = doc.querySelectorAll('[data-qa="bloko-tag__text"]');
  if (skillsElements.length > 0) {
    const skills = Array.from(skillsElements).map(el => el.textContent?.trim()).filter(Boolean);
    jobData.requirements = (jobData.requirements || "") + "\n\nSkills: " + skills.join(', ');
  }
  
  // Отрасль/индустрия
  const industryElements = doc.querySelectorAll('.bloko-tag_inversed');
  if (industryElements.length > 0) {
    const industries = Array.from(industryElements).map(el => el.textContent?.trim()).filter(Boolean);
    jobData.industry = industries.join(', ');
  }
  
  return jobData;
}

function parseLinkedInDOM(doc, jobData) {
  // LinkedIn парсинг
  jobData.title = doc.querySelector('h1')?.textContent?.trim() || 
                  doc.querySelector('.top-card-layout__title')?.textContent?.trim() ||
                  doc.querySelector('.jobs-unified-top-card__job-title')?.textContent?.trim() ||
                  "Job Title";
  
  const company = doc.querySelector('.topcard__org-name-link')?.textContent?.trim() ||
                  doc.querySelector('.top-card-layout__card .topcard__flavor')?.textContent?.trim() ||
                  doc.querySelector('.jobs-unified-top-card__company-name')?.textContent?.trim() ||
                  "Company";
  
  jobData.company_profile = `${company} - Information from LinkedIn`;
  
  // Описание
  const description = doc.querySelector('.description__text')?.textContent?.trim() ||
                      doc.querySelector('.show-more-less-html__markup')?.textContent?.trim() ||
                      doc.querySelector('.jobs-box__html-content')?.textContent?.trim() ||
                      doc.querySelector('.jobs-description-content__text')?.textContent?.trim() ||
                      "";
  
  jobData.description = description.substring(0, 2000);
  
  // Локация
  jobData.location = doc.querySelector('.topcard__flavor--bullet')?.textContent?.trim() ||
                     doc.querySelector('.job-details-jobs-unified-top-card__primary-description-container .job-details-jobs-unified-top-card__bullet')?.textContent?.trim() ||
                     doc.querySelector('.jobs-unified-top-card__workplace-type')?.textContent?.trim() ||
                     "";
  
  // Зарплата
  const salaryMatch = description.match(/\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s*(?:USD|€|£)?\s*(?:per|a)\s*(?:year|month|hour|week))/i);
  jobData.salary_range = salaryMatch ? salaryMatch[0] : "";
  
  return jobData;
}

function parseIndeedDOM(doc, jobData) {
  // Indeed парсинг
  jobData.title = doc.querySelector('.jobsearch-JobInfoHeader-title')?.textContent?.trim() ||
                  doc.querySelector('h1')?.textContent?.trim() ||
                  "Job Title";
  
  const company = doc.querySelector('[data-company-name="true"]')?.textContent?.trim() ||
                  doc.querySelector('.jobsearch-InlineCompanyRating')?.textContent?.trim() ||
                  doc.querySelector('.companyOverviewLink')?.textContent?.trim() ||
                  "Company";
  
  jobData.company_profile = `${company} - Information from Indeed`;
  
  // Описание
  jobData.description = doc.querySelector('#jobDescriptionText')?.textContent?.trim() ||
                        doc.querySelector('.jobsearch-JobComponent-description')?.textContent?.trim() ||
                        doc.querySelector('.jobsearch-jobDescriptionText')?.textContent?.trim() ||
                        "";
  
  // Локация
  jobData.location = doc.querySelector('.jobsearch-JobInfoHeader-subtitle')?.textContent?.trim() ||
                     doc.querySelector('[data-testid="inlineHeader-companyLocation"]')?.textContent?.trim() ||
                     doc.querySelector('.jobsearch-JobInfoHeader-subtitle div')?.textContent?.trim() ||
                     "";
  
  // Зарплата
  jobData.salary_range = doc.querySelector('.salary-snippet-container')?.textContent?.trim() ||
                         doc.querySelector('[data-testid="inlineHeader-salaryInfo"]')?.textContent?.trim() ||
                         doc.querySelector('.jobsearch-JobMetadataHeader-item')?.textContent?.trim() ||
                         "";
  
  return jobData;
}

function parseGenericDOM(doc, jobData) {
  // Общий парсинг для любых сайтов
  jobData.title = doc.querySelector('h1')?.textContent?.trim() ||
                  doc.querySelector('.job-title')?.textContent?.trim() ||
                  doc.querySelector('.title')?.textContent?.trim() ||
                  doc.querySelector('title')?.textContent?.trim() ||
                  "Job Title";
  
  // Ищем компанию
  const companyFromMeta = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
                          doc.querySelector('meta[name="author"]')?.getAttribute('content') ||
                          doc.querySelector('.company-name')?.textContent?.trim() ||
                          doc.querySelector('.employer')?.textContent?.trim() ||
                          "";
  
  jobData.company_profile = companyFromMeta || "Company information";
  
  // Собираем основной текст
  const mainContent = doc.querySelector('main') || 
                      doc.querySelector('article') || 
                      doc.querySelector('.content') ||
                      doc.querySelector('.job-description') ||
                      doc.body;
  
  const textContent = mainContent.textContent || "";
  
  // Берем текст как описание
  jobData.description = textContent.substring(0, 3000).trim();
  
  // Пытаемся найти зарплату (русские и английские форматы)
  const salaryRegex = /(от\s*)?(\d[\d\s]*)\s*(₽|руб|рублей|₴|грн|USD|\$|€|£|\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s*(?:per|a)\s*(?:year|month|hour|week)))/gi;
  const salaries = textContent.match(salaryRegex);
  jobData.salary_range = salaries ? salaries[0] : "";
  
  // Пытаемся найти локацию
  const locationRegex = /(Москва|Санкт-Петербург|Киев|Минск|Алматы|удален|remote|офис|гибрид|Location:?\s*([A-Za-z\s,]+))/i;
  const locationMatch = textContent.match(locationRegex);
  jobData.location = locationMatch ? locationMatch[1] || locationMatch[0] : "";
  
  // Пытаемся найти требования
  const requirementsMatch = textContent.match(/(?:requirements|qualifications|skills needed|требования|обязанности)(.*?)(?:benefits|responsibilities|$)/si);
  jobData.requirements = requirementsMatch ? requirementsMatch[1].trim() : "";
  
  // Пытаемся найти benefits
  const benefitsMatch = textContent.match(/(?:benefits|perks|what we offer|условия|предлагаем)(.*?)(?:requirements|responsibilities|$)/si);
  jobData.benefits = benefitsMatch ? benefitsMatch[1].trim() : "";
  
  return jobData;
}

// Альтернативный метод: парсинг через Open Graph и meta теги
async function parseWithOpenGraph(url) {
  const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
  const response = await fetch(proxyUrl);
  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const jobData = {
    title: "",
    company_profile: "",
    description: "",
    requirements: "",
    benefits: "",
    location: "",
    salary_range: "",
    employment_type: "",
    industry: "",
    source_url: url
  };
  
  // Извлекаем данные из meta тегов
  jobData.title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                  doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
                  doc.querySelector('title')?.textContent?.trim() ||
                  "Job Title";
  
  jobData.description = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
                        doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
                        doc.querySelector('meta[name="twitter:description"]')?.getAttribute('content') ||
                        "";
  
  const siteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || "";
  jobData.company_profile = siteName ? `Information from ${siteName}` : "Company information";
  
  return jobData;
}

// Запасной вариант: mock данные
function getMockDataBasedOnURL(url) {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('hh.ru')) {
    return {
      title: "Менеджер по продажам",
      company_profile: "ООО 'ТехноПрогресс' - ведущая IT-компания, специализирующаяся на разработке программного обеспечения.",
      description: "Мы ищем менеджера по продажам для развития клиентской базы и увеличения продаж наших IT-решений.\n\nОбязанности:\n- Поиск новых клиентов\n- Проведение переговоров и презентаций\n- Заключение договоров\n- Ведение клиентской базы\n\nТребования:\n- Опыт работы в продажах от 2 лет\n- Знание IT-рынка\n- Навыки ведения переговоров\n- Умение работать с CRM\n\nМы предлагаем:\n- Конкурентную зарплату + бонусы\n- Официальное трудоустройство\n- Обучение и развитие\n- Современный офис в центре города",
      requirements: "• Опыт работы в продажах от 2 лет\n• Знание IT-рынка\n• Навыки ведения переговоров\n• Умение работать с CRM-системами\n• Высшее образование",
      benefits: "• Конкурентная зарплата + бонусы\n• Официальное трудоустройство\n• Корпоративное обучение\n• ДМС\n• Современный офис в центре",
      location: "Москва, м. Тверская",
      salary_range: "от 120 000 ₽",
      employment_type: "Полная занятость",
      industry: "Информационные технологии"
    };
  }
  
  const mockJobs = [
    {
      title: "Senior Software Engineer",
      company_profile: "Tech Innovations Inc. - A leading technology company developing cutting-edge software solutions.",
      description: "We are looking for a Senior Software Engineer to join our team. You will be responsible for developing scalable applications, mentoring junior developers, and contributing to architectural decisions.",
      requirements: "• 5+ years of software development experience\n• Proficiency in JavaScript/Node.js or Python\n• Experience with cloud platforms (AWS, Azure)\n• Strong problem-solving skills\n• Excellent communication abilities",
      benefits: "• Competitive salary and stock options\n• Comprehensive health insurance\n• Flexible work hours\n• Remote work options\n• Professional development budget",
      location: "Remote (Global) or San Francisco, CA",
      salary_range: "$140,000 - $200,000",
      employment_type: "Full-time",
      industry: "Information Technology"
    },
    {
      title: "Data Analyst",
      company_profile: "Data Insights Corp - Specializing in data analytics and business intelligence solutions.",
      description: "Join our data team to analyze customer behavior, create reports, and provide insights to drive business growth.",
      requirements: "• 3+ years in data analysis\n• SQL and Python proficiency\n• Experience with data visualization tools\n• Statistical analysis skills",
      benefits: "• Health benefits\n• 401(k) matching\n• Paid time off\n• Training opportunities",
      location: "New York, NY (Hybrid)",
      salary_range: "$90,000 - $130,000",
      employment_type: "Full-time",
      industry: "Data Analytics"
    }
  ];
  
  // Выбираем по ключевым словам
  if (urlLower.includes('software') || urlLower.includes('engineer') || urlLower.includes('developer')) {
    return mockJobs[0];
  } else if (urlLower.includes('data') || urlLower.includes('analyst') || urlLower.includes('analytics')) {
    return mockJobs[1];
  }
  
  // Случайный выбор
  return mockJobs[Math.floor(Math.random() * mockJobs.length)];
}

function fillFormWithJobData(jobData) {
  // Заполняем все поля формы
  document.getElementById("title").value = jobData.title || "";
  document.getElementById("company_profile").value = jobData.company_profile || "";
  document.getElementById("description").value = jobData.description || "";
  document.getElementById("requirements").value = jobData.requirements || "";
  document.getElementById("benefits").value = jobData.benefits || "";
  document.getElementById("location").value = jobData.location || "";
  document.getElementById("salary_range").value = jobData.salary_range || "";
  document.getElementById("employment_type").value = jobData.employment_type || "";
  document.getElementById("industry").value = jobData.industry || "";
}

function showJobPreview(jobData, url) {
  const preview = document.getElementById("job-preview");
  const content = document.getElementById("preview-content");
  
  const domain = new URL(url).hostname.replace('www.', '');
  
  content.innerHTML = `
    <div class="preview-section">
      <h4>📋 Parsed Job Preview</h4>
      <div class="preview-field">
        <strong>Source:</strong> <a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: none;">${domain}</a>
      </div>
      <div class="preview-field">
        <strong>Title:</strong> ${jobData.title || "Not found"}
      </div>
      <div class="preview-field">
        <strong>Company:</strong> ${(jobData.company_profile || "Not found").substring(0, 120)}${jobData.company_profile && jobData.company_profile.length > 120 ? '...' : ''}
      </div>
      <div class="preview-field">
        <strong>Location:</strong> ${jobData.location || "Not specified"}
      </div>
      <div class="preview-field">
        <strong>Salary:</strong> ${jobData.salary_range || "Not specified"}
      </div>
      <div class="preview-field">
        <strong>Type:</strong> ${jobData.employment_type || "Not specified"}
      </div>
      <p class="preview-note">Form filled automatically from the webpage. You can edit any field before predicting.</p>
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
      }, filledCount, totalFields);
      
    } catch (err) {
      console.log("Using local analysis");
      // Локальный анализ на основе данных
      const fraudProba = localAnalysis(title, company_profile, description, requirements, 
                                      benefits, location, salary_range, employment_type, industry);
      
      showResult(fraudProba, resultEl, messageEl, probEl, statusEl, true, {
        title, company_profile, description, requirements, benefits, 
        location, salary_range, employment_type, industry
      }, filledCount, totalFields);
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
  
  // Проверяем паттерны мошенничества
  const scamPatterns = [
    { regex: /earn.*\$?\d+,?\d*\s*(per|a)\s*(week|month)/i, weight: 0.4, msg: "Unrealistic earnings promise" },
    { regex: /no experience needed|no experience required/i, weight: 0.3, msg: "No experience required" },
    { regex: /investment.*required|fee.*required|payment.*required|send.*money/i, weight: 0.5, msg: "Upfront payment requested" },
    { regex: /mlm|multi.?level.?marketing|pyramid/i, weight: 0.4, msg: "MLM scheme detected" },
    { regex: /guaranteed.*income|guaranteed.*payment/i, weight: 0.35, msg: "Guaranteed income" },
    { regex: /immediate (start|hiring|position)/i, weight: 0.2, msg: "Urgent hiring pressure" },
    { regex: /apply now|contact now|call now/i, weight: 0.15, msg: "High-pressure language" },
    { regex: /work from home|remote work|home based/i, weight: 0.1, msg: "Work from home mentioned" }
  ];
  
  // Проверяем профессиональные признаки
  const professionalPatterns = [
    { regex: /experience.*required|qualification.*required|degree.*required/i, weight: -0.2, msg: "Professional requirements" },
    { regex: /benefits.*package|health.*insurance|401\(k\)|retirement/i, weight: -0.15, msg: "Comprehensive benefits" },
    { regex: /responsibilities|duties|role.*includes/i, weight: -0.12, msg: "Clear job responsibilities" },
    { regex: /team.*collaboration|work.*with.*team/i, weight: -0.1, msg: "Team collaboration mentioned" }
  ];
  
  scamPatterns.forEach(p => {
    if (p.regex.test(text)) {
      score += p.weight;
      indicators.push({type: "danger", text: p.msg});
    }
  });
  
  professionalPatterns.forEach(p => {
    if (p.regex.test(text)) {
      score += p.weight;
      indicators.push({type: "success", text: p.msg});
    }
  });
  
  // Проверяем данные
  if (!company_profile || company_profile.length < 30) {
    score += 0.2;
    indicators.push({type: "warning", text: "Missing or brief company profile"});
  }
  
  if (!salary_range) {
    score += 0.1;
    indicators.push({type: "warning", text: "No salary information"});
  } else {
    const salaryMatch = salary_range.match(/\$?(\d+,?\d+)/);
    if (salaryMatch) {
      const salary = parseInt(salaryMatch[1].replace(/,/g, ''));
      if (!isNaN(salary)) {
        if (salary < 10000) {
          score += 0.15;
          indicators.push({type: "warning", text: "Very low salary"});
        } else if (salary > 300000) {
          score += 0.25;
          indicators.push({type: "danger", text: "Unrealistically high salary"});
        }
      }
    }
  }
  
  if (!location) {
    score += 0.1;
    indicators.push({type: "warning", text: "No location specified"});
  }
  
  if (description.length < 100) {
    score += 0.2;
    indicators.push({type: "warning", text: "Very short description"});
  } else if (description.length > 500) {
    score -= 0.1;
  }
  
  if (!requirements || requirements.length < 20) {
    score += 0.15;
    indicators.push({type: "warning", text: "Missing or brief requirements"});
  }
  
  if (employment_type === "Other" || !employment_type) {
    score += 0.1;
  }
  
  // Нормализуем
  let probability = 0.15; // Базовая вероятность
  
  if (score > 0) {
    probability += Math.min(score, 1.5) * 0.6;
  } else {
    probability += score * 0.4; // Профессиональные признаки уменьшают вероятность
  }
  
  // Если название выглядит профессионально
  if (/engineer|developer|analyst|manager|specialist|director|architect/i.test(title.toLowerCase())) {
    probability *= 0.7;
  }
  
  // Ограничиваем диапазон
  probability = Math.max(0.05, Math.min(probability, 0.95));
  
  // Сохраняем индикаторы
  window.lastAnalysisIndicators = indicators;
  
  return probability;
}

function showResult(probability, resultEl, messageEl, probEl, statusEl, isLocal, jobData, filledCount, totalFields) {
  const fraudPct = (probability * 100).toFixed(1);
  const legitPct = (100 - probability * 100).toFixed(1);
  const completeness = Math.round((filledCount / totalFields) * 100);

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
  
  if (completeness < 50) {
    probEl.innerHTML += `<br><small style="color:#f59e0b;">Note: Only ${completeness}% of fields filled (${filledCount}/${totalFields})</small>`;
  } else if (completeness > 80) {
    probEl.innerHTML += `<br><small style="color:#10b981;">Good: ${completeness}% of fields filled</small>`;
  }
  
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
  let riskColor = "";
  
  if (probability < 0.2) {
    riskLevel = "VERY LOW RISK";
    colorClass = "report-safe";
    riskColor = "#10b981";
  } else if (probability < 0.4) {
    riskLevel = "LOW RISK";
    colorClass = "report-safe";
    riskColor = "#10b981";
  } else if (probability < 0.6) {
    riskLevel = "MEDIUM RISK";
    colorClass = "report-warning";
    riskColor = "#f59e0b";
  } else if (probability < 0.8) {
    riskLevel = "HIGH RISK";
    colorClass = "report-danger";
    riskColor = "#ef4444";
  } else {
    riskLevel = "VERY HIGH RISK";
    colorClass = "report-danger";
    riskColor = "#dc2626";
  }
  
  const indicators = window.lastAnalysisIndicators || [];
  const dangerIndicators = indicators.filter(i => i.type === "danger");
  const warningIndicators = indicators.filter(i => i.type === "warning");
  const successIndicators = indicators.filter(i => i.type === "success");
  
  report.innerHTML = `
    <div class="report-header ${colorClass}">
      <h4>📊 Detailed Analysis Report</h4>
      <div class="risk-level" style="color: ${riskColor};">Risk Level: ${riskLevel}</div>
    </div>
    
    <div class="report-body">
      <div class="report-section">
        <h5>Job Summary</h5>
        <div class="job-summary">
          <p><strong>Title:</strong> ${jobData.title || "Not specified"}</p>
          <p><strong>Location:</strong> ${jobData.location || "Not specified"}</p>
          <p><strong>Salary:</strong> ${jobData.salary_range || "Not specified"}</p>
          <p><strong>Employment Type:</strong> ${jobData.employment_type || "Not specified"}</p>
          <p><strong>Industry:</strong> ${jobData.industry || "Not specified"}</p>
        </div>
      </div>
      
      <div class="report-section">
        <h5>Analysis Indicators</h5>
        <div class="indicators-list">
          ${dangerIndicators.length > 0 ? `
            <div class="indicator-category">
              <strong style="color: #dc2626;">🚨 Red Flags (${dangerIndicators.length}):</strong>
              ${dangerIndicators.map(ind => `<div class="indicator danger">• ${ind.text}</div>`).join('')}
            </div>` : ''}
          
          ${warningIndicators.length > 0 ? `
            <div class="indicator-category">
              <strong style="color: #f59e0b;">⚠️ Warning Signs (${warningIndicators.length}):</strong>
              ${warningIndicators.map(ind => `<div class="indicator warning">• ${ind.text}</div>`).join('')}
            </div>` : ''}
          
          ${successIndicators.length > 0 ? `
            <div class="indicator-category">
              <strong style="color: #10b981;">✅ Positive Signs (${successIndicators.length}):</strong>
              ${successIndicators.map(ind => `<div class="indicator success">• ${ind.text}</div>`).join('')}
            </div>` : ''}
          
          ${indicators.length === 0 ? '<div class="indicator">No specific indicators detected</div>' : ''}
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
  if (probability < 0.2) {
    return "✅ <strong>SAFE</strong> - This job appears legitimate. Standard job application precautions apply.";
  } else if (probability < 0.4) {
    return "⚠️ <strong>LOW RISK</strong> - Exercise normal caution. Verify company details and contact information before applying.";
  } else if (probability < 0.6) {
    return "⚠️ <strong>MEDIUM RISK</strong> - Be cautious. Research the company thoroughly and verify the job posting on their official website.";
  } else if (probability < 0.8) {
    return "❌ <strong>HIGH RISK</strong> - Likely fraudulent. Avoid sharing personal information and do not make any payments.";
  } else {
    return "🚫 <strong>VERY HIGH RISK</strong> - Probable scam. Do not apply or share any personal/financial information.";
  }
}

function getVerificationSteps(probability) {
  const steps = [
    "✓ Check the company's official website and social media",
    "✓ Search for company reviews on Glassdoor, LinkedIn, or Indeed",
    "✓ Verify the job posting appears on the company's official career page",
    "✓ Never pay money for job applications, training, or certifications"
  ];
  
  if (probability > 0.4) {
    steps.push("✓ Be cautious of requests for excessive personal information early in the process");
    steps.push("✓ Look for consistent information across multiple sources");
  }
  
  if (probability > 0.6) {
    steps.push("✓ Report suspicious postings to the job platform");
    steps.push("✓ Consider checking with the Better Business Bureau (BBB)");
  }
  
  return steps.map(step => `<div class="step">${step}</div>`).join('');
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

// Инициализация при загрузке
console.log("JobShield initialized with enhanced HH.ru parsing");
