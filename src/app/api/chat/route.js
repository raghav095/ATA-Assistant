import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';
import { getAuthOptions } from '../auth-helper';
import { runFallbackTriage } from './fallback-engine';

const auth = getAuthOptions();
const PROJECT_ID = auth.projectId;
const LOCATION = process.env.GCP_LOCATION || 'us-central1';
const MODEL_NAME = 'gemini-2.5-flash';

let vertexAI;
try {
  const vertexOpts = { project: PROJECT_ID, location: LOCATION };
  if (auth.credentials) {
    vertexOpts.googleAuthOptions = { credentials: auth.credentials };
  }
  vertexAI = new VertexAI(vertexOpts);
  console.log('Vertex AI API initialized.');
} catch (err) {
  console.error('Vertex AI init error:', err);
}

// Negation-aware keyword matcher. For each occurrence of any keyword in `text`,
// inspect up to 35 characters of preceding text. If a sentence boundary
// (".", "!", "?", or a line break) is encountered first, the candidate is
// outside the current sentence's negation scope and is treated as positive.
// Otherwise, look for a negation cue ("no", "not", "n't", "without", "denies",
// "deny", "denied", "never", "no signs of", "negative for"). Returns true if
// at least one occurrence of a keyword is positive (i.e. not negated within
// the same sentence).
const NEGATION_CUES = [
  'no ', 'no,', 'no.', 'no!', 'no?', '\nno ',
  'not ', "n't ", "n't,", "n't.", "n't!", "n't?",
  'without ', 'denies ', 'deny ', 'denied ', 'never ',
  'no signs of ', 'negative for '
];
// A "real" sentence boundary is a punctuation mark followed by a space and an
// uppercase letter (or end of string). This avoids treating abbreviations
// like "e.g." or "Dr." as sentence endings.
const SENTENCE_BOUNDARY_REGEX = /[.!?]\s+[A-Z]|[.!?]\s*$/;

function isKeywordPositive(text, keywords) {
  if (!text) return false;
  const t = text.toLowerCase();
  for (const kw of keywords) {
    if (!kw) continue;
    let idx = 0;
    while ((idx = t.indexOf(kw, idx)) !== -1) {
      // Window: up to 35 chars before the keyword, plus a few trailing chars
      // to catch "n't" that wraps past the keyword boundary.
      const windowStart = Math.max(0, idx - 35);
      const preceding = t.slice(windowStart, idx);
      // If we cross a sentence boundary within the window, the keyword is in
      // a new sentence and the prior sentence's negation does not apply.
      const crossedBoundary = SENTENCE_BOUNDARY_REGEX.test(preceding);
      if (crossedBoundary) {
        idx += kw.length;
        continue;
      }
      // Check for any negation cue in the preceding window.
      let negated = false;
      for (const cue of NEGATION_CUES) {
        if (preceding.includes(cue)) { negated = true; break; }
      }
      if (!negated) return true; // found a positive (non-negated) occurrence
      idx += kw.length;
    }
  }
  return false;
}

function checkSafetyGuardrails(text, symptomProfile, chatHistory) {
  // Aggregate the current message with prior user turns so that a multi-turn
  // symptom combination (e.g. chest pain this turn, arm pain last turn) still
  // triggers an override. Assistant messages are excluded — they don't carry
  // patient-asserted symptoms.
  const userTurns = (chatHistory || [])
    .filter(m => m && m.role === 'user' && typeof m.content === 'string')
    .map(m => m.content);
  const combined = [userTurns.join(' \n '), text || ''].filter(Boolean).join(' \n ');
  const t = combined.toLowerCase();
  const complaint = (symptomProfile?.primaryComplaint || '').toLowerCase();

  // Hindi keyword lists for safety override audit
  const hindiCardiacPain = ['सीने में दर्द', 'छाती में दर्द', 'छाती में खिंचाव', 'सीने में खिंचाव', 'दिल में दर्द'];
  const hindiCardiacRadiating = ['बाएं हाथ में दर्द', 'दाएं हाथ में दर्द', 'हाथ में दर्द', 'कंधे में दर्द', 'गर्दन में दर्द', 'जबड़े में दर्द', 'पीठ में दर्द'];
  const hindiCardiacCrushing = ['दबाव', 'भारीपन', 'जकड़न'];
  const hindiStroke = ['बोलने में दिक्कत', 'आवाज़ लड़खड़ाना', 'बोल नहीं पा रहे', 'हकलाना', 'चेहरे का सुन्न होना', 'मुंह टेढ़ा होना', 'लकवा', 'चेहरे की कमजोरी', 'हाथ में कमजोरी', 'हाथ सुन्न होना'];
  const hindiThunderclap = ['अचानक तेज़ सिरदर्द', 'भयंकर सिरदर्द', 'अब तक का सबसे बुरा सिरदर्द'];
  const hindiRespiratory = ['साँस लेने में तकलीफ', 'साँस फूलना', 'साँस की दिक्कत'];

  const matchesAny = (str, list) => list.some(keyword => str.includes(keyword));

  // 1. Cardiac override (Chest Pain + Arm/Jaw Pain or Crushing descriptors)
  const hasChestPain =
    t.includes('chest pain') || t.includes('heart pain') || t.includes('angina') ||
    complaint.includes('chest pain') ||
    matchesAny(t, hindiCardiacPain) || matchesAny(complaint, hindiCardiacPain);

  const hasRadiatingPain = isKeywordPositive(t, [
    'arm pain', 'pain in arm', 'pain radiating', 'shoulder pain',
    'left arm', 'right arm', 'jaw pain', 'back pain'
  ]) || matchesAny(t, hindiCardiacRadiating);

  const hasCardiacHistory = t.includes('heart condition') || t.includes('bypass') || t.includes('stent');
  const hasCrushing = isKeywordPositive(t, ['crushing', 'pressure', 'tightness']) || matchesAny(t, hindiCardiacCrushing);

  if (hasChestPain && (hasRadiatingPain || hasCardiacHistory || hasCrushing)) {
    return {
      triggered: true,
      reason: "Potential Cardiac Event (Chest Pain with Radiating Pain/Crushing Pressure)",
      message: "🚨 EMERGENCY OVERRIDE: Your symptoms suggest a potential acute coronary syndrome (heart attack). Please call emergency services (like 999 or 911) or proceed to the nearest Emergency Department (A&E) immediately. Do not drive yourself.",
      urgency: "Emergency Now"
    };
  }

  // 2. Stroke override (FAST symptoms)
  const hasStrokeSymptoms = isKeywordPositive(t, [
    'slurred', 'slur', 'speech', 'drooping', 'droop',
    'face numb', 'arm weakness',
    'weakness on one side', 'numbness on one side', 'paralysis',
    'stroke', 'face drooping'
  ]) || matchesAny(t, hindiStroke);

  if (hasStrokeSymptoms) {
    return {
      triggered: true,
      reason: "Potential Stroke Event (FAST Symptoms)",
      message: "🚨 EMERGENCY OVERRIDE: Your symptoms suggest a potential stroke. Remember FAST (Face drooping, Arm weakness, Speech difficulty, Time to call). Please call emergency services (like 999 or 911) immediately.",
      urgency: "Emergency Now"
    };
  }

  // 3. Thunderclap headache override
  const isHeadache = t.includes('headache') || t.includes('migraine') || complaint.includes('headache') || t.includes('सिरदर्द') || complaint.includes('सिरदर्द');
  const isThunderclap = isKeywordPositive(t, [
    'sudden', 'worst', 'thunderclap', 'exploding', 'instant'
  ]) || matchesAny(t, hindiThunderclap);

  if (isHeadache && isThunderclap) {
    return {
      triggered: true,
      reason: "Potential Subarachnoid Hemorrhage (Thunderclap Headache)",
      message: "🚨 EMERGENCY OVERRIDE: A sudden onset of the 'worst headache of your life' (thunderclap headache) requires immediate emergency evaluation. Please call emergency services (like 999 or 911) or proceed to the nearest Emergency Department (A&E) now.",
      urgency: "Emergency Now"
    };
  }

  // 4. Severe breathing difficulty
  const hasBreathingDifficulty = isKeywordPositive(t, [
    'shortness of breath', 'difficulty breathing', "can't breathe", 'cant breathe',
    'struggling to breathe', 'gasping', 'asphyxia'
  ]) || matchesAny(t, hindiRespiratory);

  if (hasBreathingDifficulty) {
    return {
      triggered: true,
      reason: "Potential Respiratory Distress",
      message: "🚨 EMERGENCY OVERRIDE: Severe difficulty breathing requires immediate emergency evaluation. Please call emergency services (like 999 or 911) or proceed to the nearest Emergency Department (A&E) now.",
      urgency: "Emergency Now"
    };
  }

  return { triggered: false };
}

export async function POST(request) {
  try {
    const { message, chatHistory, symptomProfile, patientInfo, image, imageMime } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    }

    // Safety Checks
    const guardrailResult = checkSafetyGuardrails(message, symptomProfile, chatHistory);
    if (guardrailResult.triggered) {
      return NextResponse.json({
        nextQuestion: null,
        symptomProfile: {
          primaryComplaint: symptomProfile?.primaryComplaint || message,
          duration: symptomProfile?.duration || "Sudden",
          severity: "Severe",
          associatedSymptoms: symptomProfile?.associatedSymptoms?.length > 0 ? symptomProfile.associatedSymptoms : ["Emergency indicators present"],
          history: symptomProfile?.history || (patientInfo?.preExistingHistory || "Unknown")
        },
        urgencyEstimation: "Emergency Now",
        guardrailTriggered: true,
        guardrailReason: guardrailResult.reason,
        message: guardrailResult.message
      });
    }

    let resultJson;
    try {
      if (!vertexAI) {
        throw new Error('Vertex AI client not initialized');
      }

      // Generate Adaptive Questions via Vertex AI
      const model = vertexAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              nextQuestion: { type: 'string', description: 'The next clinical clarifying question to ask the patient.' },
              symptomProfile: {
                type: 'object',
                properties: {
                  primaryComplaint: { type: 'string', description: 'Brief summary of the primary complaint.' },
                  duration: { type: 'string', description: 'Duration of the symptoms.' },
                  severity: { type: 'string', enum: ['Mild', 'Moderate', 'Severe', 'Unspecified'] },
                  associatedSymptoms: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of associated symptoms mentioned or inferred.'
                  },
                  history: { type: 'string', description: 'Relevant history or chronic conditions mentioned.' }
                },
                required: ['primaryComplaint', 'duration', 'severity', 'associatedSymptoms', 'history']
              },
              urgencyEstimation: {
                type: 'string',
                enum: ['Emergency Now', 'A&E Today', 'GP Urgent', 'GP Routine', 'Self-Care', 'Unspecified']
              }
            },
            required: ['nextQuestion', 'symptomProfile', 'urgencyEstimation']
          }
        }
      });

      let systemPrompt = `You are a Senior Clinical Triage Nurse with 15+ years of experience in emergency and primary-care settings. Your goal is to gather information about a patient's symptoms, classify their clinical urgency, and guide them to the right level of care with empathy and clarity.

Tone & Empathy:
- Open every assistant turn with a brief, genuine empathic acknowledgement (e.g. "I'm sorry to hear that", "That sounds uncomfortable", "Thank you for describing that"). One short sentence — do not overdo it.
- Use warm, plain language. Avoid robotic checklists.

Dialogue Discipline (CRITICAL):
- Ask exactly ONE clear, concise question per turn. Never bundle multiple questions in a single response.
- Do not re-ask about symptoms that are already populated in the 'symptomProfile' (primaryComplaint, duration, severity, associatedSymptoms, history). Review the profile before each question.
- Do not re-introduce yourself, repeat the greeting, or restate information the patient just gave you.
- The dialogue should graduate through three phases and then close:
  Phase 1 — Intake (turn 1): confirm or refine the primary complaint.
  Phase 2 — Clarifying (turns 2-3): target the most clinically decisive missing field (typically the red-flag discriminator — severity, radiation, associated symptoms, or relevant history).
  Phase 3 — Closing (final turn): once you have enough information to assign a non-'Unspecified' urgency, emit a final closing 'nextQuestion' that:
    * Acknowledges what the patient shared.
    * States the recommended care level in plain language (e.g. "Based on what you've described, this sounds like something you can manage at home with rest and fluids" or "I'm concerned this could be urgent — please head to A&E today").
    * Explicitly invites the patient to view their care pathway report: "Please tap 'View Care Pathway' below to see your full triage summary and next steps."
    * Do NOT ask any further clinical question in this closing turn.

Turn Budget:
- The intake should complete within 2-4 assistant turns total (1 intake + 1-2 clarifying + 1 closing). Do not loop on questions once you have enough to estimate urgency.
- The closing turn above is the signal that the conversation is finished. After that turn the patient will be routed to their care pathway report.

Clinical Discipline:
- Do not prescribe treatments, diagnose conditions, or give definitive medical advice. Keep queries purely clinical and triage-focused.
- Keep the 'symptomProfile' object updated and accurate based on all information in the chat history and the current message. Never leave a field stale when new information is available.

Urgency Tiers — update 'urgencyEstimation' as you gain confidence:
- 'Emergency Now': immediate threat to life (will normally be bypassed by guardrails, but update if appropriate).
- 'A&E Today': needs same-day emergency department attention.
- 'GP Urgent': needs same-day general practitioner attention.
- 'GP Routine': needs attention within a few days or a week.
- 'Self-Care': can be managed at home with over-the-counter remedies and rest.
- 'Unspecified': not enough information yet. Use this only during Phase 1-2 intake.

Closing Rule:
- Once you set 'urgencyEstimation' to any value other than 'Unspecified' AND the patient profile has primaryComplaint, duration, severity, and at least one associated symptom or history entry, you are in the closing phase. Emit the closing message described above and do not ask another question.

Language Rule (CRITICAL):
- Detect the language of the patient's input. If the patient communicates in Hindi (or Hinglish), you must generate the conversational 'nextQuestion' in natural Hindi. If the patient communicates in English, respond in English.

Current state:
- Symptom Profile: ${JSON.stringify(symptomProfile || {})}
- Patient urgency so far: ${symptomProfile ? 'see profile' : 'not yet estimated'}`;

      if (patientInfo) {
        systemPrompt += `
  - Patient Demographics:
    * Name: ${patientInfo.name || 'Anonymous'}
    * Age: ${patientInfo.age || 'Unknown'}
    * Biological Sex: ${patientInfo.sex || 'Unknown'}
    * Pre-existing Medical History: ${patientInfo.preExistingHistory || 'None declared'}`;
      }

      const contents = [
        { role: 'user', parts: [{ text: systemPrompt }] }
      ];

      if (chatHistory && chatHistory.length > 0) {
        chatHistory.forEach(msg => {
          const parts = [{ text: msg.content }];
          if (msg.image && msg.imageMime) {
            parts.push({
              inlineData: {
                mimeType: msg.imageMime,
                data: msg.image
              }
            });
          }
          contents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: parts
          });
        });
      }

      const userParts = [{ text: message }];
      if (image && imageMime) {
        userParts.push({
          inlineData: {
            mimeType: imageMime,
            data: image
          }
        });
      }

      contents.push({
        role: 'user',
        parts: userParts
      });

      const response = await model.generateContent({ contents });
      const responseText = response.response.candidates[0].content.parts[0].text;
      resultJson = JSON.parse(responseText);
    } catch (gcpError) {
      console.warn('Vertex AI content generation failed, falling back to local clinical triage logic:', gcpError.message);
      resultJson = runFallbackTriage(message, chatHistory, symptomProfile, patientInfo);
    }

    return NextResponse.json(resultJson);
  } catch (error) {
    console.error('API Chat Error:', error);
    return NextResponse.json({ error: 'Failed to process triage conversation.', details: error.message }, { status: 500 });
  }
}
