import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getAuthOptions } from '../auth-helper';
import { runFallbackTriage } from './fallback-engine';

const auth = getAuthOptions();
const PROJECT_ID = auth.projectId;
const LOCATION = process.env.GCP_LOCATION || 'us-central1';
const MODEL_NAME = 'gemini-2.5-flash';

let ai;
try {
  const clientOpts = {
    vertexai: true,
    project: PROJECT_ID,
    location: LOCATION
  };
  if (auth.credentials) {
    clientOpts.googleAuthOptions = { credentials: auth.credentials };
  }
  ai = new GoogleGenAI(clientOpts);
  console.log('Google Gen AI SDK initialized for GCP Vertex AI.');
} catch (err) {
  console.error('Google Gen AI SDK init error:', err);
}

// Negation-aware keyword matcher. For each occurrence of any keyword in `text`,
// inspect up to 35 characters of preceding text. If a sentence boundary
// (".", "!", "?", or a line break) is encountered first, the candidate is
// outside the current sentence's negation scope and is treated as positive.
// Otherwise, look for a negation cue ("no", "not", "n't", "without", "denies",
// "deny", "denied", "never", "no signs of", "negative for"). Returns true if
// at least one occurrence of a keyword is positive (i.e. not negated within
// the same sentence).
const NEGATION_CUES_PRECEDING = [
  'no ', 'no,', 'no.', 'no!', 'no?', '\nno ',
  'not ', "n't ", "n't,", "n't.", "n't!", "n't?",
  'without ', 'denies ', 'deny ', 'denied ', 'never ',
  'no signs of ', 'negative for ',
  'nahi ', 'nahin ', 'na ', 'नहीं ', 'नही ', 'ना ', 'बिना ', 'nahi,', 'nahin,', 'nahi.', 'nahin.'
];

const NEGATION_CUES_SUCCEEDING = [
  'nahi', 'nahin', 'na', 'normal', 'theek', 'no',
  'नहीं', 'नही', 'ना', 'ठीक', 'सामान्य'
];

const SENTENCE_BOUNDARY_REGEX = /[.!?]\s+[A-Z]|[\u0900-\u097F][.!?]\s*|[.!?]\s*$/;

function isKeywordPositive(text, keywords) {
  if (!text) return false;
  const t = text.toLowerCase();
  for (const kw of keywords) {
    if (!kw) continue;
    let idx = 0;
    while ((idx = t.indexOf(kw, idx)) !== -1) {
      const windowStart = Math.max(0, idx - 35);
      const preceding = t.slice(windowStart, idx);
      const crossedBoundaryPreceding = SENTENCE_BOUNDARY_REGEX.test(preceding);
      let negatedPreceding = false;
      if (!crossedBoundaryPreceding) {
        for (const cue of NEGATION_CUES_PRECEDING) {
          if (preceding.includes(cue)) { negatedPreceding = true; break; }
        }
      }
      
      const windowEnd = Math.min(t.length, idx + kw.length + 20);
      const succeeding = t.slice(idx + kw.length, windowEnd);
      const crossedBoundarySucceeding = SENTENCE_BOUNDARY_REGEX.test(succeeding);
      let negatedSucceeding = false;
      if (!crossedBoundarySucceeding) {
        for (const cue of NEGATION_CUES_SUCCEEDING) {
          const words = succeeding.split(/[^a-zA-Z0-9\u0900-\u097F]+/);
          if (words.some(w => cue === w || (cue.trim() && w === cue.trim()))) {
            negatedSucceeding = true;
            break;
          }
          if (succeeding.includes(cue)) {
            const cueIdx = succeeding.indexOf(cue);
            const charBefore = succeeding[cueIdx - 1];
            const charAfter = succeeding[cueIdx + cue.length];
            const isWordBoundary = (char) => !char || /[^a-zA-Z0-9\u0900-\u097F]/.test(char);
            if (isWordBoundary(charBefore) && isWordBoundary(charAfter)) {
              negatedSucceeding = true;
              break;
            }
          }
        }
      }
      if (!negatedPreceding && !negatedSucceeding) return true;
      idx += kw.length;
    }
  }
  return false;
}

function isProximityMatchPositive(text, symptoms, contexts, maxDistance = 15) {
  if (!text) return false;
  const t = text.toLowerCase();
  for (const sym of symptoms) {
    let symIdx = 0;
    while ((symIdx = t.indexOf(sym, symIdx)) !== -1) {
      for (const ctx of contexts) {
        let ctxIdx = 0;
        while ((ctxIdx = t.indexOf(ctx, ctxIdx)) !== -1) {
          let startIdx, endIdx;
          if (ctxIdx < symIdx) {
            startIdx = ctxIdx;
            endIdx = symIdx + sym.length;
          } else {
            startIdx = symIdx;
            endIdx = ctxIdx + ctx.length;
          }
          
          const distance = Math.max(0, Math.abs(ctxIdx - symIdx) - (ctxIdx < symIdx ? ctx.length : sym.length));
          if (distance <= maxDistance) {
            const windowStart = Math.max(0, startIdx - 35);
            const preceding = t.slice(windowStart, startIdx);
            const crossedBoundaryPreceding = SENTENCE_BOUNDARY_REGEX.test(preceding);
            let negatedPreceding = false;
            if (!crossedBoundaryPreceding) {
              for (const cue of NEGATION_CUES_PRECEDING) {
                if (preceding.includes(cue)) { negatedPreceding = true; break; }
              }
            }
            
            const windowEnd = Math.min(t.length, endIdx + 20);
            const succeeding = t.slice(endIdx, windowEnd);
            const crossedBoundarySucceeding = SENTENCE_BOUNDARY_REGEX.test(succeeding);
            let negatedSucceeding = false;
            if (!crossedBoundarySucceeding) {
              for (const cue of NEGATION_CUES_SUCCEEDING) {
                const words = succeeding.split(/[^a-zA-Z0-9\u0900-\u097F]+/);
                if (words.some(w => cue === w || (cue.trim() && w === cue.trim()))) {
                  negatedSucceeding = true;
                  break;
                }
                if (succeeding.includes(cue)) {
                  const cueIdx = succeeding.indexOf(cue);
                  const charBefore = succeeding[cueIdx - 1];
                  const charAfter = succeeding[cueIdx + cue.length];
                  const isWordBoundary = (char) => !char || /[^a-zA-Z0-9\u0900-\u097F]/.test(char);
                  if (isWordBoundary(charBefore) && isWordBoundary(charAfter)) {
                    negatedSucceeding = true;
                    break;
                  }
                }
              }
            }
            
            if (!negatedPreceding && !negatedSucceeding) {
              return true;
            }
          }
          ctxIdx += ctx.length;
        }
      }
      symIdx += sym.length;
    }
  }
  return false;
}

function checkSafetyGuardrails(text, symptomProfile, chatHistory) {
  const userTurns = (chatHistory || [])
    .filter(m => m && m.role === 'user' && typeof m.content === 'string')
    .map(m => m.content);
  const combined = [userTurns.join(' \n '), text || ''].filter(Boolean).join(' \n ');
  const t = combined.toLowerCase();
  const complaint = (symptomProfile?.primaryComplaint || '').toLowerCase();

  // 1. Cardiac check
  const cardiacPainSymptoms = ['dard', 'pain', 'khinchaav', 'khinchav', 'angina', 'खिंचाव', 'दर्द'];
  const cardiacPainContexts = ['seene', 'chhati', 'dil', 'chest', 'heart', 'सीने', 'छाती', 'दिल'];
  const cardiacPainDirect = [
    'chest pain', 'heart pain', 'angina',
    'seene me dard', 'chhati me dard', 'seene mein dard', 'chhati mein dard', 'dil me dard', 'dil mein dard', 'chest me dard',
    'सीने में दर्द', 'छाती में दर्द', 'छाती में खिंचाव', 'सीने में खिंचाव', 'दिल में दर्द'
  ];

  const hasChestPain = isKeywordPositive(t, cardiacPainDirect) || 
                       isProximityMatchPositive(t, cardiacPainSymptoms, cardiacPainContexts) ||
                       cardiacPainDirect.some(kw => complaint.includes(kw));

  const radiatingSymptoms = ['dard', 'pain', 'sunn', 'heavy', 'radiation', 'radiating', 'दर्द', 'सुन्न', 'भारी'];
  const radiatingContexts = [
    'haath', 'arm', 'shoulder', 'jaw', 'back', 'kandhe', 'gardan', 'jabde', 'peeth', 'left hand', 'left arm',
    'हाथ', 'कंधे', 'गर्दन', 'जबड़े', 'पीठ', 'बाएं हाथ', 'दाएं हाथ'
  ];
  const radiatingDirect = [
    'arm pain', 'pain in arm', 'pain radiating', 'shoulder pain', 'left arm', 'right arm', 'jaw pain', 'back pain',
    'haath me dard', 'haath mein dard', 'left hand me pain', 'arm me dard', 'left arm me dard', 'shoulder me dard', 'back me dard',
    'बाएं हाथ में दर्द', 'दाएं हाथ में दर्द', 'हाथ में दर्द', 'कंधे में दर्द', 'गर्दन में दर्द', 'जबड़े में दर्द', 'पीठ में दर्द'
  ];

  const hasRadiatingPain = isKeywordPositive(t, radiatingDirect) ||
                           isProximityMatchPositive(t, radiatingSymptoms, radiatingContexts);

  const crushingSymptoms = ['crushing', 'pressure', 'tightness', 'heavy', 'heaviness', 'bhari', 'bhaaripan', 'jakdan', 'dabav', 'दबाव', 'भारीपन', 'जकड़न'];
  const crushingContexts = ['seene', 'chhati', 'dil', 'chest', 'heart', 'सीने', 'छाती', 'दिल'];
  const crushingDirect = [
    'crushing', 'pressure', 'tightness',
    'bhari', 'bhaaripan', 'heavy', 'jakdan', 'dabav',
    'दबाव', 'भारीपन', 'जकड़न'
  ];

  const hasCrushing = isKeywordPositive(t, crushingDirect) ||
                      isProximityMatchPositive(t, crushingSymptoms, crushingContexts);

  const hasCardiacHistory = t.includes('heart condition') || t.includes('bypass') || t.includes('stent') ||
                            t.includes('बाईपास') || t.includes('स्टेंट') || t.includes('dil ki bimari');

  if (hasChestPain && (hasRadiatingPain || hasCardiacHistory || hasCrushing)) {
    return {
      triggered: true,
      reason: "Potential Cardiac Event (Chest Pain with Radiating Pain/Crushing Pressure)",
      message: "🚨 EMERGENCY OVERRIDE: Your symptoms suggest a potential acute coronary syndrome (heart attack). Please call emergency services (like 999 or 911) or proceed to the nearest Emergency Department (A&E) immediately. Do not drive yourself.",
      urgency: "Emergency Now"
    };
  }

  // 2. Stroke check
  const strokeSymptoms = ['slurred', 'slur', 'speech', 'drooping', 'droop', 'numb', 'weakness', 'paralysis', 'stroke', 'face drooping', 'sunn', 'lakwa', 'ladkhadana', 'dikkat', 'सुन्न', 'लकवा', 'लड़खड़ाना', 'कमजोरी', 'टेढ़ा'];
  const strokeContexts = ['speech', 'face', 'arm', 'hand', 'side', 'mouth', 'aawaz', 'chehra', 'muh', 'haath', 'bolne', 'bol', 'आवाज़', 'बोली', 'चेहरे', 'मुंह', 'हाथ', 'अंग'];
  const strokeDirect = [
    'slurred', 'slur', 'speech', 'drooping', 'droop', 'face numb', 'arm weakness',
    'weakness on one side', 'numbness on one side', 'paralysis', 'stroke', 'face drooping',
    'bolne me dikkat', 'bolne mein dikkat', 'aawaz ladkhadana', 'sunn', 'lakwa', 'ladkhadana',
    'बोलने में दिक्कत', 'आवाज़ लड़खड़ाना', 'बोल नहीं पा रहे', 'हकलाना', 'चेहरे का सुन्न होना', 'मुंह टेढ़ा होना', 'लकवा', 'चेहरे की कमजोरी', 'हाथ में कमजोरी', 'हाथ सुन्न होना'
  ];

  const hasStrokeSymptoms = isKeywordPositive(t, strokeDirect) ||
                            isProximityMatchPositive(t, strokeSymptoms, strokeContexts);

  if (hasStrokeSymptoms) {
    return {
      triggered: true,
      reason: "Potential Stroke Event (FAST Symptoms)",
      message: "🚨 EMERGENCY OVERRIDE: Your symptoms suggest a potential stroke. Remember FAST (Face drooping, Arm weakness, Speech difficulty, Time to call). Please call emergency services (like 999 or 911) immediately.",
      urgency: "Emergency Now"
    };
  }

  // 3. Thunderclap Headache check
  const headacheSymptoms = ['headache', 'migraine', 'pain', 'sir dard', 'sar dard', 'dard', 'सिरदर्द', 'दर्द'];
  const headacheContexts = ['sudden', 'worst', 'thunderclap', 'exploding', 'instant', 'achanak', 'tez', 'bhayankar', 'अचानक', 'तेज़', 'भयंकर', 'बुरा'];
  const headacheDirect = [
    'thunderclap', 'worst headache',
    'achanak tez sar dard', 'achanak sir dard', 'bhayankar sar dard', 'bhayankar sir dard',
    'अचानक तेज़ सिरदर्द', 'भयंकर सिरदर्द', 'अब तक का सबसे बुरा सिरदर्द'
  ];

  const isHeadache = t.includes('headache') || t.includes('migraine') || complaint.includes('headache') ||
                     t.includes('sir dard') || t.includes('sar dard') || complaint.includes('sir dard') ||
                     t.includes('सिरदर्द') || complaint.includes('सिरदर्द');

  const isThunderclap = isKeywordPositive(t, headacheDirect) ||
                        isProximityMatchPositive(t, headacheSymptoms, headacheContexts);

  if (isHeadache && isThunderclap) {
    return {
      triggered: true,
      reason: "Potential Subarachnoid Hemorrhage (Thunderclap Headache)",
      message: "🚨 EMERGENCY OVERRIDE: A sudden onset of the 'worst headache of your life' (thunderclap headache) requires immediate emergency evaluation. Please call emergency services (like 999 or 911) or proceed to the nearest Emergency Department (A&E) now.",
      urgency: "Emergency Now"
    };
  }

  // 4. Severe breathing difficulty
  const breathingSymptoms = ['shortness', 'difficulty', 'cant', "can't", 'struggling', 'gasping', 'asphyxia', 'takleef', 'dikkat', 'fulna', 'phulna', 'तकलीफ', 'फूलना', 'दिक्कत'];
  const breathingContexts = ['breath', 'breathing', 'saas', 'saans', 'साँस', 'सांस'];
  const breathingDirect = [
    'shortness of breath', 'difficulty breathing', "can't breathe", 'cant breathe',
    'struggling to breathe', 'gasping', 'asphyxia',
    'saas lene me takleef', 'saans lene mein takleef', 'saas fulna', 'saans phulna', 'saas lene me dikkat',
    'साँस लेने में तकलीफ', 'साँस फूलना', 'साँस की दिक्कत', 'सांस लेने में तकलीफ', 'सांस फूलना', 'सांस की दिक्कत'
  ];

  const hasBreathingDifficulty = isKeywordPositive(t, breathingDirect) ||
                                 isProximityMatchPositive(t, breathingSymptoms, breathingContexts);

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
      if (!ai) {
        throw new Error('Google Gen AI client not initialized');
      }

      let systemPrompt = `You are a Senior Clinical Triage Nurse with 15+ years of experience in emergency and primary-care settings. Your goal is to gather information about a patient's symptoms, classify their clinical urgency, and guide them to the right level of care with empathy and clarity.

Tone & Empathy:
- Open every assistant turn with a brief, genuine empathic acknowledgement (e.g. "I'm sorry to hear that", "That sounds uncomfortable", "Thank you for describing that"). One short sentence — do not overdo it.
- Use warm, plain language. Avoid robotic checklists.

Dialogue Discipline & Clinical Jargon Prevention (CRITICAL):
- Ask exactly ONE clear, concise question per turn. Never bundle multiple questions in a single response.
- Rule 7: Do NOT use complex medical jargon or clinical doctor terms (e.g., do not say dyspnea, paresthesia, syncope, angina, or similar professional terminology). Use simple, reassuring layperson terms that any patient can easily understand (e.g., ask "are you having trouble catching your breath?" instead of "are you experiencing dyspnea?"; ask "does the pain spread to your arm?" instead of "are you experiencing radiating paresthesia?"; ask "do you feel lightheaded or like you might pass out?" instead of "have you had any syncope?").
- Rule 8: Ask deep, detailed, and realistic clarifying questions based on the presenting complaint. Avoid generic, broad questions.
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

Language Rule & Lock (CRITICAL):
- Detect the language of the patient's input and their demographic preferences. If the patient communicates in Hindi or Hinglish, you MUST generate the conversational 'nextQuestion' in natural Hindi (using Devanagari script for Hindi, or Latin script / Hinglish for Hinglish, matching the style the user is speaking/typing). Lock the language for all subsequent responses to match their choice (do not flip-flop between Hindi/Hinglish and English mid-conversation). If they speak English, respond strictly in English.

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

      const contents = [];

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

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              nextQuestion: { type: 'STRING', description: 'The next clinical clarifying question to ask the patient.' },
              symptomProfile: {
                type: 'OBJECT',
                properties: {
                  primaryComplaint: { type: 'STRING', description: 'Brief summary of the primary complaint.' },
                  duration: { type: 'STRING', description: 'Duration of the symptoms.' },
                  severity: { type: 'STRING', enum: ['Mild', 'Moderate', 'Severe', 'Unspecified'] },
                  associatedSymptoms: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description: 'List of associated symptoms mentioned or inferred.'
                  },
                  history: { type: 'STRING', description: 'Relevant history or chronic conditions mentioned.' }
                },
                required: ['primaryComplaint', 'duration', 'severity', 'associatedSymptoms', 'history']
              },
              urgencyEstimation: {
                type: 'STRING',
                enum: ['Emergency Now', 'A&E Today', 'GP Urgent', 'GP Routine', 'Self-Care', 'Unspecified']
              }
            },
            required: ['nextQuestion', 'symptomProfile', 'urgencyEstimation']
          }
        }
      });

      const responseText = response.text;
      resultJson = JSON.parse(responseText);
    } catch (gcpError) {
      console.warn('Google Gen AI content generation failed, falling back to local clinical triage logic:', gcpError.message);
      resultJson = runFallbackTriage(message, chatHistory, symptomProfile, patientInfo);
    }

    return NextResponse.json(resultJson);
  } catch (error) {
    console.error('API Chat Error:', error);
    return NextResponse.json({ error: 'Failed to process triage conversation.', details: error.message }, { status: 500 });
  }
}
