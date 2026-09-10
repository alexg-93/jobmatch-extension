// test/matcher.test.js
// Unit tests for shared/matcher.js — pure matching/grounding/prompt logic
// shared by background.js and offscreen.js. Run with: node --test test/
//
// matcher.js attaches itself to `self.JobMatch` (so the same file works
// unmodified in the service worker and the offscreen document). Plain Node
// has no `self` global, so we shim it before requiring the file.

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

global.self = globalThis;
require("../shared/matcher.js");
const JobMatch = globalThis.JobMatch;

describe("canonicalize / formatSkill", () => {
  test("maps known synonyms to their canonical form", () => {
    assert.equal(JobMatch.canonicalize("ReactJS"), "react");
    assert.equal(JobMatch.canonicalize("Node.JS"), "node.js");
    assert.equal(JobMatch.canonicalize("Golang"), "go");
    assert.equal(JobMatch.canonicalize("k8s"), "kubernetes");
  });

  test("leaves unknown terms lowercased and untouched", () => {
    assert.equal(JobMatch.canonicalize("Some Custom Tool"), "some custom tool");
  });

  test("formats known skills using DISPLAY_NAMES", () => {
    assert.equal(JobMatch.formatSkill("typescript"), "TypeScript");
    assert.equal(JobMatch.formatSkill("postgres"), "PostgreSQL");
  });

  test("title-cases unknown skills as a fallback", () => {
    assert.equal(JobMatch.formatSkill("some custom tool"), "Some Custom Tool");
  });
});

describe("keywordMatch", () => {
  test("computes match percent from overlap between resume and job skills", () => {
    const resumeText = "Senior engineer with 5 years of experience in React and Node.js building REST APIs.";
    const jobText = "We need a candidate with React, TypeScript, and Docker experience. Requires 5+ years of experience.";

    const result = JobMatch.keywordMatch(resumeText, jobText, [], null);

    assert.equal(result.engine, "keyword");
    assert.equal(result.detectedJobSkills.length, 3);
    assert.deepEqual(result.matchedSkills, ["React"]);
    assert.deepEqual(result.missingSkills.sort(), ["Docker", "TypeScript"]);
    assert.equal(result.matchPercent, 33);
  });

  test("returns null matchPercent when no recognizable skills are found in the job", () => {
    const result = JobMatch.keywordMatch("Some resume text.", "A vague job posting with no listed technologies.", [], null);
    assert.equal(result.matchPercent, null);
    assert.ok(result.note);
  });

  test("respects custom skills supplied by the user's profile", () => {
    const result = JobMatch.keywordMatch(
      "I have shipped several projects using Splunk dashboards.",
      "Looking for a candidate experienced with Splunk.",
      ["Splunk"],
      null
    );
    assert.deepEqual(result.matchedSkills, ["Splunk"]);
  });
});

describe("ambiguous single-letter / overloaded terms", () => {
  test("detects Go only when used as the programming language", () => {
    assert.equal(JobMatch.isProgrammingGoInText("Experience with Go/Python backend development"), true);
    assert.equal(JobMatch.isProgrammingGoInText("We are going to hire a new engineer soon."), false);
  });

  test("keywordMatch does not false-positive on bare letters inside prose", () => {
    const result = JobMatch.keywordMatch(
      "I have contributed to open source projects before.",
      "We are going to hire someone great; c'mon and apply if you excel at teamwork.",
      [],
      null
    );
    assert.deepEqual(result.detectedJobSkills, []);
  });
});

describe("isSkillGroundedInJob", () => {
  const jobText = "We use Docker and SQL Server extensively.";
  const detected = ["Docker", "SQL Server"];

  test("grounds a skill already present in detectedJobSkills", () => {
    assert.equal(JobMatch.isSkillGroundedInJob("Docker", jobText, detected), true);
  });

  test("grounds a skill found via text search even if not pre-detected", () => {
    assert.equal(JobMatch.isSkillGroundedInJob("SQL", jobText, detected), true);
  });

  test("rejects a skill that never appears in the job text", () => {
    assert.equal(JobMatch.isSkillGroundedInJob("Kubernetes", jobText, detected), false);
  });

  test("supports Hebrew attached-prefix mentions", () => {
    assert.equal(JobMatch.isSkillGroundedInJob("React", "דרוש מפתח עם ניסיון ב-React ו-Node.js", []), true);
  });
});

describe("mergeMissingSkills", () => {
  test("drops AI-suggested skills that are not grounded in the job posting", () => {
    const merged = JobMatch.mergeMissingSkills(
      ["Kubernetes", "SQL"],
      ["Docker"],
      "We use Docker and SQL Server extensively.",
      ["Docker", "SQL Server"]
    );
    assert.deepEqual(Array.from(merged), ["SQL", "Docker"]);
    assert.deepEqual(merged.discardedAiSkills, ["Kubernetes"]);
  });

  test("sorts merged skills by priority tier (databases/languages before tooling)", () => {
    const merged = JobMatch.mergeMissingSkills([], ["Git", "PostgreSQL"], "Uses Git and PostgreSQL.", ["Git", "PostgreSQL"]);
    assert.deepEqual(Array.from(merged), ["PostgreSQL", "Git"]);
  });

  test("caps the result at 18 skills", () => {
    const many = Array.from({ length: 25 }, (_, i) => `custom-skill-${i}`);
    const jobText = many.join(" ");
    const merged = JobMatch.mergeMissingSkills([], many, jobText, many);
    assert.equal(merged.length, 18);
  });
});

describe("filterGroundedSuggestions", () => {
  const jobText = "This role requires C# and .NET experience.";

  test("enriches a bare keyword suggestion into a full coaching sentence", () => {
    const result = JobMatch.filterGroundedSuggestions(["C#"], jobText, [], ["fallback suggestion"]);
    assert.equal(result.length, 2);
    assert.ok(result[0].length > 10, "bare skill should be expanded into a longer sentence");
    assert.match(result[0], /C#/);
  });

  test("drops suggestions that reference a discarded/hallucinated skill", () => {
    const result = JobMatch.filterGroundedSuggestions(
      ["Learn Kubernetes to strengthen your infrastructure skills for this role."],
      jobText,
      ["Kubernetes"],
      ["fallback suggestion"]
    );
    assert.deepEqual(result, ["fallback suggestion"]);
  });

  test("drops suggestions naming tech that isn't actually mentioned in the job", () => {
    const result = JobMatch.filterGroundedSuggestions(
      ["Highlight your AWS certification prominently on your resume for this position."],
      jobText,
      [],
      ["fallback suggestion"]
    );
    assert.deepEqual(result, ["fallback suggestion"]);
  });

  test("passes through well-formed grounded suggestions unchanged", () => {
    const result = JobMatch.filterGroundedSuggestions(
      [
        "Emphasize your production experience shipping C# and .NET services in your recent roles.",
        "Detail any REST API design work you have done with .NET to match this listing's core ask."
      ],
      jobText,
      [],
      []
    );
    assert.equal(result.length, 2);
  });
});

describe("filterGroundedItems", () => {
  test("strips leading bullet/number markers", () => {
    const result = JobMatch.filterGroundedItems(["- Strong React skills", "2) Great communicator"], "React and communication matter.", [], []);
    assert.deepEqual(result, ["Strong React skills", "Great communicator"]);
  });

  test("falls back when every item is discarded", () => {
    const result = JobMatch.filterGroundedItems(["Missing Kubernetes experience"], "No k8s here.", ["Kubernetes"], ["fallback gap"]);
    assert.deepEqual(result, ["fallback gap"]);
  });
});

describe("experience extraction", () => {
  test("extracts a minimum-years requirement from English text", () => {
    const req = JobMatch.extractRequiredExperience("This role requires 5+ years of experience.");
    assert.equal(req.minYears, 5);
    assert.equal(req.label, "5+ years");
  });

  test("extracts a range requirement", () => {
    const req = JobMatch.extractRequiredExperience("Looking for 3-5 years of experience.");
    assert.equal(req.minYears, 3);
    assert.equal(req.maxYears, 5);
    assert.equal(req.label, "3-5 years");
  });

  test("extracts a Hebrew minimum-years requirement", () => {
    const req = JobMatch.extractRequiredExperience("דרוש מועמד עם לפחות 3 שנות ניסיון בתחום.");
    assert.equal(req.minYears, 3);
    assert.equal(req.label, "3+ years");
  });

  test("extracts stated years of experience from a resume summary", () => {
    const cand = JobMatch.extractResumeExperience("Backend engineer with over 4 years of experience in distributed systems.");
    assert.equal(cand.years, 4);
    assert.equal(cand.source, "summary");
  });

  test("derives years of experience from resume date ranges", () => {
    const cand = JobMatch.extractResumeExperience("Software Engineer, Acme Corp, 2018 - 2022");
    assert.equal(cand.years, 4);
    assert.equal(cand.source, "dates");
  });

  test("prefers an explicit profile override over parsed text", () => {
    const cand = JobMatch.extractResumeExperience("No dates mentioned here.", 7);
    assert.equal(cand.years, 7);
    assert.equal(cand.source, "profile");
  });
});

describe("computeExperienceGap", () => {
  test("flags a deficit when the candidate has fewer years than required", () => {
    const gap = JobMatch.computeExperienceGap("Requires 6+ years of experience.", "Software Engineer, 2020 - 2022", null);
    assert.equal(gap.status, "deficit");
    assert.equal(gap.gapYears, 4);
    assert.match(gap.gapMessage, /-4 yrs/);
    assert.ok(gap.bridgingTip);
  });

  test("flags an advantage when the candidate exceeds requirements", () => {
    const gap = JobMatch.computeExperienceGap("Requires 2+ years of experience.", "irrelevant text", 5);
    assert.equal(gap.status, "match");
    assert.match(gap.strengthMessage, /Advantage/);
  });

  test("returns null when the job posting states no experience requirement", () => {
    const gap = JobMatch.computeExperienceGap("We're hiring a great teammate.", "5 years of experience.", null);
    assert.equal(gap, null);
  });
});

describe("extractJson", () => {
  test("parses plain JSON", () => {
    assert.deepEqual(JobMatch.extractJson('{"a":1}'), { a: 1 });
  });

  test("strips markdown code fences", () => {
    assert.deepEqual(JobMatch.extractJson("```json\n{\"a\":1}\n```"), { a: 1 });
  });

  test("strips <think> reasoning blocks before parsing", () => {
    assert.deepEqual(JobMatch.extractJson("<think>let me consider this</think>{\"a\":1}"), { a: 1 });
  });

  test("sanitizes trailing commas", () => {
    assert.deepEqual(JobMatch.extractJson('{"a":1,"b":[1,2,],}'), { a: 1, b: [1, 2] });
  });

  test("returns null for text with no JSON object", () => {
    assert.equal(JobMatch.extractJson("no json here at all"), null);
  });

  test("returns null for malformed JSON", () => {
    assert.equal(JobMatch.extractJson("{not valid json}"), null);
  });
});

describe("trimming helpers", () => {
  test("smartTrimText leaves short text untouched (aside from whitespace normalization)", () => {
    assert.equal(JobMatch.smartTrimText("Hello   world", 100), "Hello world");
  });

  test("smartTrimText bounds long text to roughly maxChars", () => {
    const long = "word ".repeat(500);
    const trimmed = JobMatch.smartTrimText(long, 100);
    assert.ok(trimmed.length <= 110);
  });

  test("trimJobPosting pulls a distant Requirements section forward instead of truncating it away", () => {
    const filler = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(40);
    const jobText = `${filler}Requirements: Need Python, SQL, and 5+ years experience.`;
    const trimmed = JobMatch.trimJobPosting(jobText, 800);
    assert.match(trimmed, /Requirements/);
  });
});

describe("buildMatchPrompt", () => {
  test("accepts positional arguments and includes job/resume content", () => {
    const prompt = JobMatch.buildMatchPrompt("My resume text", "Backend Engineer", "Job description text", ["Python"], null);
    assert.match(prompt, /JOB TITLE: Backend Engineer/);
    assert.match(prompt, /RESUME:\nMy resume text/);
    assert.match(prompt, /matchPercent/);
  });

  test("accepts an options object with equivalent results", () => {
    const prompt = JobMatch.buildMatchPrompt({
      resumeText: "My resume text",
      jobTitle: "Backend Engineer",
      jobText: "Job description text",
      detectedJobSkills: ["Python"]
    });
    assert.match(prompt, /JOB TITLE: Backend Engineer/);
  });
});

describe("normalizeAiMatchResult", () => {
  test("clamps an out-of-range matchPercent into 0-100", () => {
    const result = JobMatch.normalizeAiMatchResult({ matchPercent: 140, strengths: [], gaps: [], missingSkills: [], suggestions: [] });
    assert.equal(result.matchPercent, 100);
  });

  test("clamps a negative matchPercent to 0", () => {
    const result = JobMatch.normalizeAiMatchResult({ matchPercent: -20 });
    assert.equal(result.matchPercent, 0);
  });

  test("falls back to null for a non-numeric matchPercent", () => {
    const result = JobMatch.normalizeAiMatchResult({ matchPercent: "high" });
    assert.equal(result.matchPercent, null);
  });

  test("coerces non-array list fields to empty arrays instead of throwing", () => {
    const result = JobMatch.normalizeAiMatchResult({ matchPercent: 80, missingSkills: "SQL, React", strengths: null });
    assert.deepEqual(result.missingSkills, []);
    assert.deepEqual(result.strengths, []);
  });

  test("trims and drops blank entries from list fields", () => {
    const result = JobMatch.normalizeAiMatchResult({ suggestions: ["  Learn Docker.  ", "", "   "] });
    assert.deepEqual(result.suggestions, ["Learn Docker."]);
  });

  test("returns null for a non-object input", () => {
    assert.equal(JobMatch.normalizeAiMatchResult(null), null);
    assert.equal(JobMatch.normalizeAiMatchResult("not an object"), null);
  });
});

describe("mergeMissingSkills defensive handling", () => {
  test("does not iterate a string's characters if aiSkills is malformed (non-array)", () => {
    const merged = JobMatch.mergeMissingSkills("SQL, React", ["Docker"], "Uses Docker.", ["Docker"]);
    assert.deepEqual(Array.from(merged), ["Docker"]);
  });
});

describe("naiveSkillExtraction", () => {
  test("extracts recognizable skills from resume text", () => {
    const skills = JobMatch.naiveSkillExtraction("Proficient in Python, Docker, and stakeholder management.", []);
    assert.ok(skills.includes("Python"));
    assert.ok(skills.includes("Docker"));
    assert.ok(skills.includes("Stakeholder Management"));
  });
});
