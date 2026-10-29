export interface TicketAnalysis {
  category: "PLUMBING" | "ELECTRICAL" | "CARPENTRY" | "APPLIANCE" | "CIVIL" | "OTHER";
  urgency: "EMERGENCY" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  acknowledgmentMessage: string;
}

const EMERGENCY_KEYWORDS = [
  "spark",
  "short circuit",
  "fire",
  "aag",
  "shock",
  "current",
  "flooding",
  "burst",
  "gas leak",
  "dhuan",
  "smoke",
  "cylinder",
];

const HIGH_KEYWORDS = [
  "overflow",
  "flush leak",
  "no water",
  "paani nahi",
  "main lock",
  "locked out",
  "tripping",
  "mcb",
  "broken tap",
  "seepage heavy",
  "geyser",
];

const CATEGORY_MAP: Record<string, string[]> = {
  PLUMBING: [
    "leak",
    "paani",
    "water",
    "tap",
    "nalka",
    "flush",
    "toilet",
    "commode",
    "sink",
    "pipe",
    "drain",
    "choke",
    "sewer",
    "bathroom",
    "shower",
  ],
  ELECTRICAL: [
    "mcb",
    "trip",
    "spark",
    "light",
    "fan",
    "switch",
    "socket",
    "power",
    "current",
    "wire",
    "bulb",
    "fuse",
    "inverter",
    "bijli",
  ],
  APPLIANCE: [
    "ac",
    "air conditioner",
    "cooling",
    "fridge",
    "refrigerator",
    "washing machine",
    "geyser",
    "microwave",
    "chimney",
    "ro",
    "purifier",
  ],
  CARPENTRY: [
    "door",
    "darwaza",
    "lock",
    "handle",
    "window",
    "khidki",
    "cupboard",
    "almirah",
    "hinge",
    "latch",
    "cabinet",
  ],
  CIVIL: [
    "seepage",
    "ceiling",
    "tile",
    "crack",
    "plaster",
    "dampness",
    "deewar",
    "wall",
    "leakage from roof",
  ],
};

/**
 * Fast Rule-Based NLP Classifier (Zero external latency & offline resilient)
 */
export const classifyIssueRuleBased = (text: string): TicketAnalysis => {
  const lower = text.toLowerCase();

  // 1. Determine Category
  let detectedCategory: TicketAnalysis["category"] = "OTHER";
  let maxMatches = 0;

  for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
    const matches = keywords.filter((k) => lower.includes(k)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedCategory = cat as TicketAnalysis["category"];
    }
  }

  // 2. Determine Urgency
  let detectedUrgency: TicketAnalysis["urgency"] = "MEDIUM";
  if (EMERGENCY_KEYWORDS.some((k) => lower.includes(k))) {
    detectedUrgency = "EMERGENCY";
  } else if (HIGH_KEYWORDS.some((k) => lower.includes(k))) {
    detectedUrgency = "HIGH";
  } else if (
    lower.includes("minor") ||
    lower.includes("squeak") ||
    lower.includes("slowly") ||
    lower.includes("small")
  ) {
    detectedUrgency = "LOW";
  }

  // 3. Generate Title
  const cleanSummary = text.trim().slice(0, 50);
  const title = `${detectedCategory.charAt(0) + detectedCategory.slice(1).toLowerCase()} Issue: ${cleanSummary}${text.length > 50 ? "..." : ""}`;

  // 4. Natural Indian WhatsApp Acknowledgment
  const urgencyWord =
    detectedUrgency === "EMERGENCY"
      ? "Emergency"
      : detectedUrgency === "HIGH"
        ? "High Priority"
        : "Normal";

  const acknowledgmentMessage = `Aapka issue register ho gaya hai (Category: ${detectedCategory}, Urgency: ${urgencyWord}). Property manager ko alert mil gaya hai, jaldi update milega.`;

  return {
    category: detectedCategory,
    urgency: detectedUrgency,
    title,
    acknowledgmentMessage,
  };
};

/**
 * Primary AI Analysis Entrypoint: Uses Gemini API if configured, otherwise falls back gracefully
 */
export const analyzeMaintenanceText = async (text: string): Promise<TicketAnalysis> => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey.trim().length > 0) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are an AI property maintenance classifier for Indian apartment buildings.
Analyze the following tenant message (written in English, Hindi, or Hinglish):
"${text}"

Return a strict JSON object with these keys only:
- "category": one of ["PLUMBING", "ELECTRICAL", "CARPENTRY", "APPLIANCE", "CIVIL", "OTHER"]
- "urgency": one of ["EMERGENCY", "HIGH", "MEDIUM", "LOW"]
- "title": a concise 4-7 word title in English summarizing the issue
- "acknowledgmentMessage": a reassuring polite message in Hinglish/English confirming the ticket category.

JSON:`,
                  },
                ],
              },
            ],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );

      if (response.ok) {
        const json: any = await response.json();
        const candidate = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidate) {
          const parsed = JSON.parse(candidate);
          return {
            category: parsed.category || "OTHER",
            urgency: parsed.urgency || "MEDIUM",
            title: parsed.title || "Maintenance Request",
            acknowledgmentMessage:
              parsed.acknowledgmentMessage ||
              "Aapka request note kar liya gaya hai. Manager will review shortly.",
          };
        }
      }
    } catch {
      // Fallback seamlessly to rule-based engine
    }
  }

  return classifyIssueRuleBased(text);
};

export const classifyMaintenanceMessage = analyzeMaintenanceText;

