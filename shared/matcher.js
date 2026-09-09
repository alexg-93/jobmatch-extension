// shared/matcher.js
// Loaded both by background.js (service worker, via importScripts) and by
// offscreen.js (via a <script> tag). Must not use ES module import/export —
// attach everything to `self` so both contexts can read it the same way.

(function () {
  // A broad-ish default skills dictionary used by the free, offline fallback
  // matcher when on-device AI isn't available. Not exhaustive on purpose —
  // it's a safety net, not the primary engine. Extend from the popup's
  // "custom skills" box if you find your field is under-covered.
  const DEFAULT_SKILLS = [
    // Languages
    "javascript", "typescript", "python", "java", "kotlin", "swift", "objective-c",
    "c#", "c++", "go", "golang", "rust", "php", "ruby", "sql",
    // Mobile
    "react native", "flutter", "ios", "android", "expo", "expo eas", "swiftui",
    "jetpack compose", "xcode", "android studio",
    // Web / frontend
    "react", "reactjs", "next.js", "nextjs", "redux", "redux toolkit", "zustand", "tanstack query",
    "react query", "vue", "vuejs", "angular", "html", "css", "tailwind", "sass",
    // Backend
    "node.js", "nodejs", "express", "nestjs", "django", "flask", "spring boot",
    "graphql", "rest api", "grpc", "websockets", "microservices",
    // Data / infra
    "postgresql", "postgres", "mysql", "mongodb", "redis", "firebase", "supabase",
    "docker", "kubernetes", "k8s", "aws", "gcp", "azure", "ci/cd", "github actions",
    "terraform", "nginx",
    // AI / ML
    "machine learning", "llm", "rag", "openai api", "tensorflow", "pytorch",
    // Practice / process
    "agile", "scrum", "git", "unit testing", "jest", "cypress", "tdd",
    "system design", "security", "sentry",
    // Generic professional
    "project management", "communication", "leadership", "stakeholder management",
    "team lead", "mentoring", "hebrew", "english", "russian", "excel"
  ];

  function normalize(str) {
    return (str || "").toLowerCase();
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findMentions(text, terms) {
    const t = normalize(text);
    const found = new Set();
    for (const term of terms) {
      const norm = (term || "").trim().toLowerCase();
      if (!norm) continue;
      const boundaryEnd = /[+#]$/.test(norm) ? "[^\\p{L}\\p{N}+#]" : "[^\\p{L}\\p{N}]";
      // Support Hebrew attached prefixes (ב, ה, ו, ל, מ, ש, כ) commonly seen on Drushim (e.g. ב-React, בניהול)
      const pattern = new RegExp("(?:^|[^\\p{L}\\p{N}])(?:[בהולמשכ]-?)?" + escapeRegex(norm) + "(?:$|" + boundaryEnd + ")", "iu");
      if (pattern.test(" " + t + " ")) found.add(term);
    }
    return found;
  }

  // Pull extra candidate "skill-like" phrases out of a job description by
  // looking at comma / bullet separated lists near common requirement
  // headings. This lets the fallback matcher pick up terms that aren't in
  // DEFAULT_SKILLS at all (useful for non-tech Drushim listings too).
  function extractCandidatePhrases(jobText) {
    const lines = (jobText || "").split(/\n|•|·|- /);
    const candidates = new Set();
    for (const line of lines) {
      const clean = line.trim();
      if (!clean || clean.length > 80) continue;
      // Short, list-like lines are good skill/requirement candidates.
      if (clean.split(/\s+/).length <= 6) {
        candidates.add(clean.toLowerCase());
      }
    }
    return candidates;
  }

  const SYNONYMS = {
    "reactjs": "react",
    "nodejs": "node.js",
    "nextjs": "next.js",
    "vuejs": "vue",
    "golang": "go",
    "k8s": "kubernetes",
    "postgres": "postgresql",
    "amazon web services": "aws",
    "google cloud": "gcp"
  };

  function canonicalize(term) {
    const norm = (term || "").trim().toLowerCase();
    return SYNONYMS[norm] || norm;
  }

  function keywordMatch(resumeText, jobText, customSkills) {
    const dictionary = DEFAULT_SKILLS.concat(customSkills || []);
    const rawJobMentions = findMentions(jobText, dictionary);
    const rawResumeMentions = findMentions(resumeText, dictionary);

    const jobMentions = new Set([...rawJobMentions].map(canonicalize));
    const resumeMentions = new Set([...rawResumeMentions].map(canonicalize));

    const relevantToJob = [...jobMentions];
    const missing = relevantToJob.filter((s) => !resumeMentions.has(s));
    const matched = relevantToJob.filter((s) => resumeMentions.has(s));

    let matchPercent;
    if (relevantToJob.length === 0) {
      matchPercent = null; // not enough signal to score
    } else {
      matchPercent = Math.round((matched.length / relevantToJob.length) * 100);
    }

    const suggestions = missing.slice(0, 8).map(
      (skill) => `Mention "${skill}" explicitly if you have real experience with it — it's called out in the listing but not detected in your resume.`
    );

    return {
      engine: "keyword",
      matchPercent,
      matchedSkills: matched,
      missingSkills: missing,
      suggestions,
      note: relevantToJob.length === 0
        ? "Couldn't detect enough recognizable skill terms in this listing to score it confidently."
        : null
    };
  }

  // Builds the prompt sent to the on-device model (Gemini Nano via the
  // Prompt API) for per-job matching. Keeps the ask narrow and asks for
  // strict JSON so it's easy to parse.
  function buildMatchPrompt(resumeText, jobTitle, jobText) {
    const trimmedResume = (resumeText || "").slice(0, 6000);
    const trimmedJob = (jobText || "").slice(0, 4000);
    return [
      "You are a resume-to-job matching assistant. Compare the RESUME to the JOB POSTING.",
      "Respond with ONLY valid JSON, no markdown fences, no commentary, in this exact shape:",
      '{"matchPercent": <integer 0-100>, "missingSkills": [<string>, ...max 8], "suggestions": [<string>, ...max 5]}',
      "matchPercent reflects how well the resume's skills/experience fit this specific job.",
      "missingSkills are concrete skills/technologies/qualifications the job asks for that the resume does not show.",
      "suggestions are short, specific, actionable edits to the resume (not generic advice).",
      "",
      `JOB TITLE: ${jobTitle || "(untitled)"}`,
      `JOB POSTING:\n${trimmedJob}`,
      "",
      `RESUME:\n${trimmedResume}`
    ].join("\n");
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

  // Model output should be JSON, but strip stray markdown fences / prose
  // defensively before parsing, since small on-device models sometimes
  // don't follow formatting instructions perfectly.
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
    const mentions = [...rawMentions].map(canonicalize);
    const candidatePhrases = extractCandidatePhrases(resumeText);
    return [...new Set([...mentions, ...candidatePhrases])].slice(0, 60);
  }

  self.JobMatch = {
    DEFAULT_SKILLS,
    keywordMatch,
    buildMatchPrompt,
    buildSkillExtractionPrompt,
    extractJson,
    naiveSkillExtraction
  };
})();
