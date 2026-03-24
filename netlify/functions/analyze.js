exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return { statusCode: 500, body: JSON.stringify({ error: "API key not configured" }) };
  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) }; }
  const { reviews, reportDate } = body;
  const pb = (name, d) => d?.text ? `${name}:\n${d.text}` : `${name}: no data`;

  const prompt = `You are a senior customer insights analyst for Zoek Marketing. Parse reviews formatted as "STAR_RATING - review text". Calculate TRUE averages from individual star ratings.

REPORT DATE: ${reportDate || "not specified"}

REVIEWS:
${pb("GOOGLE", reviews?.google)}
${pb("WIX", reviews?.wix)}
${pb("TRUSTPILOT", reviews?.trustpilot)}
${pb("BBB", reviews?.bbb)}

Respond ONLY with raw JSON (no markdown):
{
  "overallScore": <true weighted avg 1.0-5.0>,
  "reviewCounts": { "google": <n or null>, "wix": <n or null>, "trustpilot": <n or null>, "bbb": <n or null> },
  "platformScores": { "google": <avg or null>, "wix": <avg or null>, "trustpilot": <avg or null>, "bbb": <avg or null> },
  "trend": "up"|"down"|"stable",
  "trendReason": "<one sentence>",
  "npsScore": <estimated NPS -100 to 100 based on star distribution>,
  "npsBreakdown": { "promoters": <pct>, "passives": <pct>, "detractors": <pct> },
  "topPositiveKeywords": ["<word>","<word>","<word>","<word>","<word>","<word>","<word>","<word>","<word>","<word>"],
  "topNegativeKeywords": ["<word>","<word>","<word>","<word>","<word>","<word>","<word>","<word>","<word>","<word>"],
  "whatsGoingRight": "<2-3 sentences>",
  "areaOfConcern": "<2-3 sentences>",
  "needsImmediateAttention": "<2-3 sentences or 'No critical issues identified'>",
  "overallSummary": "<3-4 sentence executive narrative>",
  "positiveTrendNotes": ["<observation about positive trend>","<another>"],
  "negativeTrendNotes": ["<observation about negative trend>","<another>"],
  "platforms": {
    "google": {
      "summary": "<2-3 sentences>",
      "positiveThemes": ["<theme>","<theme>","<theme>"],
      "negativeThemes": ["<theme>","<theme>","<theme>"],
      "positiveSnippets": ["<exact quote max 25 words>","<exact quote>","<exact quote>"],
      "negativeSnippets": ["<exact quote max 25 words>","<exact quote>","<exact quote>"],
      "actionItems": [
        {"action":"<specific action>","department":"Sales"|"Operations"|"Customer Success"|"Communications"|"Product/Delivery"|"Leadership"},
        {"action":"<specific action>","department":"<dept>"}
      ]
    },
    "wix": { "summary":"<2-3 sentences>","positiveThemes":["<t>","<t>","<t>"],"negativeThemes":["<t>","<t>","<t>"],"positiveSnippets":["<q>","<q>","<q>"],"negativeSnippets":["<q>","<q>","<q>"],"actionItems":[{"action":"<a>","department":"<d>"},{"action":"<a>","department":"<d>"}] },
    "trustpilot": { "summary":"<2-3 sentences>","positiveThemes":["<t>","<t>","<t>"],"negativeThemes":["<t>","<t>","<t>"],"positiveSnippets":["<q>","<q>","<q>"],"negativeSnippets":["<q>","<q>","<q>"],"actionItems":[{"action":"<a>","department":"<d>"},{"action":"<a>","department":"<d>"}] },
    "bbb": { "summary":"<2-3 sentences>","positiveThemes":["<t>","<t>"],"negativeThemes":["<t>","<t>"],"positiveSnippets":["<q>","<q>","<q>"],"negativeSnippets":["<q>","<q>","<q>"],"actionItems":[{"action":"<a>","department":"<d>"},{"action":"<a>","department":"<d>"}] }
  },
  "radar": {
    "areas": ["Sales","Operations","Customer Success","Communications","Product/Delivery"],
    "strengths": [<1-10>,<1-10>,<1-10>,<1-10>,<1-10>],
    "improvements": [<1-10>,<1-10>,<1-10>,<1-10>,<1-10>],
    "leadershipRecs": [{"area":"<area>","rec":"<constructive 1-2 sentence rec>","department":"<dept>","priority":"high"|"medium"|"low"}]
  },
  "positiveShoutouts": [{"name":"<full name if available>","reason":"<max 15 words>","platform":"<platform>","reviewStars":<star rating of that review>}],
  "negativeFlags": [{"name":"<name>","reason":"<max 15 words>","platform":"<platform>","severity":"low"|"medium"|"high"}]
}

CRITICAL RULES:
- Parse every "N - text" line to get TRUE star averages. Count each review.
- npsScore: 5★=promoter, 3-4★=passive, 1-2★=detractor. NPS = %promoters - %detractors
- positiveSnippets/negativeSnippets: real quotes from the reviews, not paraphrases. Use null if fewer than 3 available.
- positiveShoutouts: ONLY real names explicitly mentioned positively. Empty [] if none.
- negativeFlags: ONLY real names explicitly mentioned negatively. Empty [] if none.
- Deduplicate names across platforms — same person mentioned on multiple platforms = ONE entry with most recent platform.
- Platforms with no data: null scores, empty arrays for all fields.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json();
    if (!r.ok) return { statusCode: r.status, body: JSON.stringify({ error: d.error?.message || "API error" }) };
    const raw = d.content.map(i => i.text || "").join("").replace(/```json|```/g, "").trim();
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: raw };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Analysis failed", detail: e.message }) };
  }
};
