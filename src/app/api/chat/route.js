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

function checkSafetyGuardrails(text, symptomProfile) {
  const t = (text || '').toLowerCase();
  const complaint = (symptomProfile?.primaryComplaint || '').toLowerCase();
  
  // 1. Cardiac override (Chest Pain + Arm/Jaw Pain or Crushing descriptors)
  const hasChestPain = t.includes('chest pain') || t.includes('heart pain') || t.includes('angina') || complaint.includes('chest pain');
  const hasRadiatingPain = t.includes('arm pain') || t.includes('pain in arm') || t.includes('pain radiating') || t.includes('shoulder pain') || t.includes('left arm') || t.includes('right arm') || t.includes('jaw pain') || t.includes('back pain');
  const hasCardiacHistory = t.includes('heart condition') || t.includes('bypass') || t.includes('stent');

  if (hasChestPain && (hasRadiatingPain || hasCardiacHistory || t.includes('crushing') || t.includes('pressure') || t.includes('tightness'))) {
    return {
      triggered: true,
      reason: "Potential Cardiac Event (Chest Pain with Radiating Pain/Crushing Pressure)",
      message: "🚨 EMERGENCY OVERRIDE: Your symptoms suggest a potential acute coronary syndrome (heart attack). Please call emergency services (like 999 or 911) or proceed to the nearest Emergency Department (A&E) immediately. Do not drive yourself.",
      urgency: "Emergency Now"
    };
  }

  // 2. Stroke override (FAST symptoms)
  const hasStrokeSymptoms = t.includes('slur') || t.includes('speech') || t.includes('droop') || t.includes('face numb') || t.includes('arm weakness') || t.includes('weakness on one side') || t.includes('numbness on one side') || t.includes('paralysis') || t.includes('stroke') || t.includes('face drooping');
  if (hasStrokeSymptoms) {
    return {
      triggered: true,
      reason: "Potential Stroke Event (FAST Symptoms)",
      message: "🚨 EMERGENCY OVERRIDE: Your symptoms suggest a potential stroke. Remember FAST (Face drooping, Arm weakness, Speech difficulty, Time to call). Please call emergency services (like 999 or 911) immediately.",
      urgency: "Emergency Now"
    };
  }

  // 3. Thunderclap headache override
  const isHeadache = t.includes('headache') || t.includes('migraine') || complaint.includes('headache');
  const isThunderclap = t.includes('sudden') || t.includes('worst') || t.includes('thunderclap') || t.includes('exploding') || t.includes('instant');
  if (isHeadache && isThunderclap) {
    return {
      triggered: true,
      reason: "Potential Subarachnoid Hemorrhage (Thunderclap Headache)",
      message: "🚨 EMERGENCY OVERRIDE: A sudden onset of the 'worst headache of your life' (thunderclap headache) requires immediate emergency evaluation. Please call emergency services (like 999 or 911) or proceed to the nearest Emergency Department (A&E) now.",
      urgency: "Emergency Now"
    };
  }

  // 4. Severe breathing difficulty
  const hasBreathingDifficulty = t.includes('shortness of breath') || t.includes('difficulty breathing') || t.includes('cant breathe') || t.includes('struggling to breathe') || t.includes('gasping') || t.includes('asphyxia');
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
    const guardrailResult = checkSafetyGuardrails(message, symptomProfile);
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

      let systemPrompt = `You are a Senior Clinical Triage Nurse. Your goal is to gather information about a patient's symptoms and classify their clinical urgency.
  Follow these rules:
  1. Conduct symptom intake conversationally. Ask only ONE clear, concise question at a time.
  2. Ask adaptive clarifying questions to narrow down the urgency assessment (e.g., check for red flags, severity, timeline, and history).
  3. Do not prescribe treatments, diagnose conditions, or give definitive medical advice. Keep queries purely clinical and triage-focused.
  4. Keep the 'symptomProfile' object updated based on all info in the chat history and current message.
  5. Provide a professional, compassionate conversational response in 'nextQuestion'.
  6. Update the 'urgencyEstimation' as you gain confidence:
     - 'Emergency Now': immediate threat to life (will normally be bypassed by guardrails, but update if appropriate).
     - 'A&E Today': needs same-day emergency department attention.
     - 'GP Urgent': needs same-day general practitioner attention.
     - 'GP Routine': needs attention within a few days or a week.
     - 'Self-Care': can be managed at home with over-the-counter remedies and rest.
  
  Current state:
  - Symptom Profile: ${JSON.stringify(symptomProfile || {})}`;

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
