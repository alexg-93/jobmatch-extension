// shared/matcher.js
// Loaded both by background.js (service worker, via importScripts) and by
// offscreen.js (via a <script> tag). Must not use ES module import/export —
// attach everything to `self` so both contexts can read it the same way.

(function () {
  // A comprehensive skills dictionary used for deterministic matching,
  // prompt augmentation, and keyword fallback.
  const DEFAULT_SKILLS = [
    // Languages
    "javascript", "typescript", "python", "java", "kotlin", "swift", "objective-c",
    "c#", "c++", "c", "go", "golang", "rust", "php", "ruby", "scala", "perl", "r", "dart",
    // Databases & Storage (relational & NoSQL)
    "sql", "sql server", "microsoft sql server", "t-sql", "tsql", "pl/sql",
    "mysql", "postgresql", "postgres", "mongodb", "nosql", "relational databases",
    "redis", "elasticsearch", "sqlite", "oracle", "dynamodb", "cassandra", "mariadb",
    "firebase", "supabase", "neo4j",
    // Mobile
    "react native", "flutter", "ios", "android", "expo", "expo eas", "swiftui",
    "jetpack compose", "xcode", "android studio",
    // Web / Frontend
    "react", "reactjs", "react.js", "next.js", "nextjs", "redux", "redux toolkit", "zustand",
    "tanstack query", "react query", "vue", "vuejs", "vue.js", "angular", "angularjs", "svelte", "html", "css",
    "tailwind", "sass", "scss", "storybook",
    // Backend & Frameworks
    ".net", ".net core", "asp.net", "asp.net core", "entity framework", "linq",
    "node.js", "nodejs", "express", "nestjs", "fastapi", "django", "flask", "spring boot",
    "laravel", "ruby on rails", "graphql", "rest api", "restful api", "grpc", "websockets", "microservices",
    // Queues & Messaging & Streaming
    "rabbitmq", "rabbit mq", "kafka", "apache kafka", "sqs", "sns", "activemq", "redis pub/sub", "pub/sub",
    // DevOps, Cloud & Infra
    "docker", "kubernetes", "k8s", "aws", "amazon web services", "gcp", "google cloud", "azure",
    "ci/cd", "github actions", "gitlab ci", "jenkins", "terraform", "nginx", "linux",
    // AI / ML / Dev Assistants
    "machine learning", "deep learning", "llm", "rag", "openai api", "tensorflow", "pytorch",
    "github copilot", "copilot", "cursor ai", "cursor", "chatgpt",
    // Practice, Architecture & Process
    "agile", "scrum", "git", "github", "gitlab", "unit testing", "jest", "cypress", "playwright",
    "tdd", "system design", "software architecture", "oop", "solid", "clean code", "security", "sentry",
    // Generic Professional & Languages
    "project management", "communication", "leadership", "stakeholder management",
    "team lead", "mentoring", "hebrew", "english", "russian", "excel"
  ];

  const SYNONYMS = {
    "reactjs": "react",
    "react.js": "react",
    "nodejs": "node.js",
    "nextjs": "next.js",
    "vuejs": "vue",
    "vue.js": "vue",
    "angularjs": "angular",
    "golang": "go",
    "k8s": "kubernetes",
    "postgres": "postgresql",
    "amazon web services": "aws",
    "google cloud": "gcp",
    "tsql": "t-sql",
    "microsoft sql server": "sql server",
    "rabbit mq": "rabbitmq",
    "apache kafka": "kafka",
    "asp.net core": ".net",
    "asp.net": ".net",
    ".net core": ".net",
    "restful api": "rest api",
    "github actions": "ci/cd",
    "github copilot": "copilot",
    "cursor ai": "cursor"
  };

  const DISPLAY_NAMES = {
    "sql": "SQL",
    "sql server": "SQL Server",
    "t-sql": "T-SQL",
    "pl/sql": "PL/SQL",
    "nosql": "NoSQL",
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "elasticsearch": "Elasticsearch",
    "sqlite": "SQLite",
    "oracle": "Oracle",
    "dynamodb": "DynamoDB",
    "cassandra": "Cassandra",
    "mariadb": "MariaDB",
    "firebase": "Firebase",
    "supabase": "Supabase",
    "c#": "C#",
    "c++": "C++",
    "c": "C",
    ".net": ".NET",
    "entity framework": "Entity Framework",
    "linq": "LINQ",
    "rabbitmq": "RabbitMQ",
    "kafka": "Kafka",
    "sqs": "AWS SQS",
    "sns": "AWS SNS",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "python": "Python",
    "java": "Java",
    "kotlin": "Kotlin",
    "swift": "Swift",
    "objective-c": "Objective-C",
    "go": "Go",
    "rust": "Rust",
    "php": "PHP",
    "ruby": "Ruby",
    "scala": "Scala",
    "react": "React",
    "react native": "React Native",
    "flutter": "Flutter",
    "next.js": "Next.js",
    "vue": "Vue",
    "angular": "Angular",
    "svelte": "Svelte",
    "html": "HTML",
    "css": "CSS",
    "tailwind": "Tailwind CSS",
    "sass": "Sass",
    "node.js": "Node.js",
    "express": "Express",
    "nestjs": "NestJS",
    "fastapi": "FastAPI",
    "django": "Django",
    "flask": "Flask",
    "spring boot": "Spring Boot",
    "laravel": "Laravel",
    "graphql": "GraphQL",
    "rest api": "REST API",
    "grpc": "gRPC",
    "websockets": "WebSockets",
    "microservices": "Microservices",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "aws": "AWS",
    "gcp": "GCP",
    "azure": "Azure",
    "ci/cd": "CI/CD",
    "terraform": "Terraform",
    "linux": "Linux",
    "git": "Git",
    "github": "GitHub",
    "gitlab": "GitLab",
    "jest": "Jest",
    "cypress": "Cypress",
    "playwright": "Playwright",
    "tdd": "TDD",
    "oop": "OOP",
    "solid": "SOLID",
    "clean code": "Clean Code",
    "system design": "System Design",
    "storybook": "Storybook",
    "copilot": "GitHub Copilot",
    "cursor": "Cursor AI",
    "chatgpt": "ChatGPT",
    "llm": "LLM",
    "rag": "RAG",
    "agile": "Agile",
    "scrum": "SCRUM",
    "english": "English",
    "hebrew": "Hebrew",
    "excel": "Excel"
  };

  const SKILL_PRIORITY = {
    // Databases (Tier 1)
    "sql": 1, "sql server": 1, "t-sql": 1, "postgresql": 1, "mongodb": 1, "nosql": 1, "mysql": 1, "redis": 1, "elasticsearch": 1, "sqlite": 1, "oracle": 1, "dynamodb": 1,
    // Languages & Core Frameworks (Tier 2)
    "c#": 2, ".net": 2, "python": 2, "java": 2, "javascript": 2, "typescript": 2, "go": 2, "rust": 2, "c++": 2, "c": 2, "ruby": 2, "php": 2, "scala": 2, "swift": 2, "kotlin": 2,
    // Messaging & Queues (Tier 3)
    "rabbitmq": 3, "kafka": 3, "sqs": 3, "sns": 3,
    // Web Frameworks & Backend (Tier 4)
    "react": 4, "angular": 4, "vue": 4, "node.js": 4, "next.js": 4, "express": 4, "nestjs": 4, "django": 4, "flask": 4, "spring boot": 4, "entity framework": 4, "linq": 4, "microservices": 4, "rest api": 4, "graphql": 4,
    // Cloud & DevOps (Tier 5)
    "docker": 5, "kubernetes": 5, "aws": 5, "gcp": 5, "azure": 5, "ci/cd": 5, "terraform": 5, "linux": 5,
    // Tools & Testing (Tier 6)
    "git": 6, "github": 6, "jest": 6, "cypress": 6, "storybook": 6, "copilot": 6, "cursor": 6, "chatgpt": 6,
    // Architecture & Practices (Tier 7)
    "solid": 7, "oop": 7, "system design": 7, "clean code": 7,
    // Methodology & Language (Tier 8-9)
    "agile": 8, "scrum": 8, "english": 9, "hebrew": 9
  };

  function normalize(str) {
    return (str || "").toLowerCase();
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function canonicalize(term) {
    const norm = (term || "").trim().toLowerCase();
    return SYNONYMS[norm] || norm;
  }

  function formatSkill(term) {
    const norm = (term || "").trim().toLowerCase();
    const canon = canonicalize(norm);
    if (DISPLAY_NAMES[canon]) return DISPLAY_NAMES[canon];
    if (DISPLAY_NAMES[norm]) return DISPLAY_NAMES[norm];
    return norm.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function getSkillPriority(skill) {
    const norm = canonicalize((skill || "").toLowerCase().trim());
    return SKILL_PRIORITY[norm] || 5;
  }

  function findMentions(text, terms) {
    const t = normalize(text);
    const found = new Set();
    for (const term of terms) {
      const norm = (term || "").trim().toLowerCase();
      if (!norm) continue;
      // Prohibit + and # immediately following to avoid "c" matching "c#" or "c++"
      const boundaryEnd = "[^\\p{L}\\p{N}+#]";
      const boundaryStart = /^\./.test(norm) ? "(?:^|[^\\p{L}\\p{N}.])" : "(?:^|[^\\p{L}\\p{N}])";
      // Support Hebrew attached prefixes (ב, ה, ו, ל, מ, ש, כ) commonly seen on Drushim (e.g. ב-React, בניהול)
      const pattern = new RegExp(boundaryStart + "(?:[בהולמשכ]-?)?" + escapeRegex(norm) + "(?:$|" + boundaryEnd + ")", "iu");
      if (pattern.test(" " + t + " ")) found.add(term);
    }
    return found;
  }

  function normalizeSkillKey(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9+#]/g, "");
  }

  function mergeMissingSkills(aiSkills, detSkills) {
    const seen = new Set();
    const candidates = [];

    // 1. Process AI skills
    for (const item of aiSkills || []) {
      const clean = (item || "").trim();
      if (!clean) continue;
      const key = canonicalize(clean.toLowerCase());
      const norm = normalizeSkillKey(key);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        const displayName = DISPLAY_NAMES[key] || clean;
        candidates.push({ name: displayName, priority: getSkillPriority(key) });
      }
    }

    // 2. Add deterministic missing skills that the AI omitted
    for (const item of detSkills || []) {
      const clean = (item || "").trim();
      if (!clean) continue;
      const key = canonicalize(clean.toLowerCase());
      const norm = normalizeSkillKey(key);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        candidates.push({ name: formatSkill(clean), priority: getSkillPriority(key) });
      }
    }

    // Sort by priority (databases & core languages first), then take top 18
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates.map((c) => c.name).slice(0, 18);
  }

  // Pull extra candidate "skill-like" phrases out of a job description by
  // looking at comma / bullet separated lists near common requirement
  // headings.
  function extractCandidatePhrases(jobText) {
    const lines = (jobText || "").split(/\n|•|·|- /);
    const candidates = new Set();
    for (const line of lines) {
      const clean = line.trim();
      if (!clean || clean.length > 80) continue;
      if (clean.split(/\s+/).length <= 6) {
        candidates.add(clean.toLowerCase());
      }
    }
    return candidates;
  }

  function keywordMatch(resumeText, jobText, customSkills) {
    const dictionary = DEFAULT_SKILLS.concat(customSkills || []);
    const rawJobMentions = findMentions(jobText, dictionary);
    const rawResumeMentions = findMentions(resumeText, dictionary);

    const jobMentions = new Set([...rawJobMentions].map(canonicalize));
    const resumeMentions = new Set([...rawResumeMentions].map(canonicalize));

    const relevantToJob = [...jobMentions];
    const rawMissing = relevantToJob.filter((s) => !resumeMentions.has(s));
    const rawMatched = relevantToJob.filter((s) => resumeMentions.has(s));

    // Sort by priority
    rawMissing.sort((a, b) => getSkillPriority(a) - getSkillPriority(b));
    rawMatched.sort((a, b) => getSkillPriority(a) - getSkillPriority(b));

    let matchPercent;
    if (relevantToJob.length === 0) {
      matchPercent = null;
    } else {
      matchPercent = Math.round((rawMatched.length / relevantToJob.length) * 100);
    }

    const missingSkills = rawMissing.map(formatSkill).slice(0, 18);
    const matchedSkills = rawMatched.map(formatSkill);
    const detectedJobSkills = relevantToJob.map(formatSkill);

    const suggestions = missingSkills.slice(0, 6).map(
      (skill) => `Mention "${skill}" explicitly if you have real experience with it — it's called out in the listing but not detected in your resume.`
    );

    return {
      engine: "keyword",
      matchPercent,
      matchedSkills,
      missingSkills,
      detectedJobSkills,
      suggestions,
      note: relevantToJob.length === 0
        ? "Couldn't detect enough recognizable skill terms in this listing to score it confidently."
        : null
    };
  }

  // Builds the prompt sent to the on-device model (Gemini Nano via the
  // Prompt API) for per-job matching.
  function buildMatchPrompt(resumeText, jobTitle, jobText, detectedJobSkills) {
    const trimmedResume = (resumeText || "").slice(0, 6000);
    const trimmedJob = (jobText || "").slice(0, 4000);
    const detectedSkillsText = (Array.isArray(detectedJobSkills) && detectedJobSkills.length)
      ? `\nDETECTED KEY TECHNOLOGIES IN JOB:\n${detectedJobSkills.slice(0, 25).join(", ")}\n`
      : "";

    return [
      "You are a resume-to-job matching assistant. Compare the RESUME to the JOB POSTING.",
      "Respond with ONLY valid JSON, no markdown fences, no commentary, in this exact shape:",
      '{"matchPercent": <integer 0-100>, "missingSkills": [<string>, ...max 10], "suggestions": [<string>, ...max 5]}',
      "matchPercent reflects how well the resume's skills/experience fit this specific job.",
      "missingSkills are concrete technologies, qualifications, or tools the job asks for that the resume does NOT show.",
      "CRITICAL: Be comprehensive. Check Databases (SQL, NoSQL, etc.), Languages, Frameworks, Cloud, and Message Queues.",
      "suggestions are short, specific, actionable edits to the resume (not generic advice).",
      detectedSkillsText,
      `JOB TITLE: ${jobTitle || "(untitled)"}`,
      `JOB POSTING:\n${trimmedJob}`,
      "",
      `RESUME:\n${trimmedResume}`
    ].filter(Boolean).join("\n");
  }

  function buildSkillExtractionPrompt(resumeText) {
    const trimmed = (resumeText || "").slice(0, 8000);
    return [
      "Extract a flat list of concrete skills, technologies, tools, and qualifications from this resume.",
      "Respond with ONLY valid JSON: {\"skills\": [<string>, ...]}. Max 40 items. No commentary.",
      "",
      `RESUME:\n${trimmed}`
    ].join("\n");
  }

  function extractJson(rawText) {
    if (!rawText) return null;
    let text = rawText.trim();
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) return null;
    let jsonCandidate = text.slice(start, end + 1);
    // Sanitize trailing commas before closing braces/brackets commonly output by LLMs
    jsonCandidate = jsonCandidate.replace(/,(\s*[}\]])/g, "$1");
    try {
      return JSON.parse(jsonCandidate);
    } catch (e) {
      return null;
    }
  }

  function naiveSkillExtraction(resumeText, customSkills) {
    const dictionary = DEFAULT_SKILLS.concat(customSkills || []);
    const rawMentions = findMentions(resumeText, dictionary);
    const mentions = [...rawMentions].map(formatSkill);
    const candidatePhrases = extractCandidatePhrases(resumeText);
    return [...new Set([...mentions, ...candidatePhrases])].slice(0, 60);
  }

  self.JobMatch = {
    DEFAULT_SKILLS,
    SYNONYMS,
    DISPLAY_NAMES,
    formatSkill,
    canonicalize,
    keywordMatch,
    mergeMissingSkills,
    buildMatchPrompt,
    buildSkillExtractionPrompt,
    extractJson,
    naiveSkillExtraction
  };
})();
