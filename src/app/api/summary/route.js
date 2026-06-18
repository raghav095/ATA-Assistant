import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getAuthOptions } from '../auth-helper';
import { runFallbackSummary } from './fallback-summary';

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
  console.log('Google Gen AI SDK initialized for Handover Summary.');
} catch (err) {
  console.error('Google Gen AI SDK init error:', err);
}

export async function POST(request) {
  try {
    const { chatHistory, symptomProfile, patientInfo, language } = await request.json();

    let resultJson;
    try {
      if (!ai) {
        throw new Error('Google Gen AI client not initialized');
      }

      const userLanguage = language || patientInfo?.language || 'English';

      let summaryPrompt = `You are a Senior Clinical Triage Officer. Generate a final structured Patient Summary and Care Pathway Guidance based on the symptom intake conversation history.
  Evaluate the timeline, severity, history, and associated symptoms to provide a safe, accurate triage recommendation.
  
  Format the output strictly as JSON.
  
  Language Customization Rule:
  The patient's preferred language is: ${userLanguage}.
  If the preferred language is Hindi or Hinglish, please output the patient-facing guidance (specifically the 'summary' fields and 'pathwayGuidance.whatToDo' / 'pathwayGuidance.whatToTellProvider') in natural, clear Hindi (Hindi Devanagari script or Hinglish Latin script matching how the patient was responding in the chat history) to ensure they can understand it. Keep the clinical reasoning or professional fields in English if desired, but prioritize the patient's language for patient-facing instructions.
  `;

      if (patientInfo) {
        summaryPrompt += `
  Patient Demographics:
  - Name: ${patientInfo.name || 'Anonymous'}
  - Age: ${patientInfo.age || 'Unknown'}
  - Biological Sex: ${patientInfo.sex || 'Unknown'}
  - Pre-existing Medical History: ${patientInfo.preExistingHistory || 'None declared'}
  - Preferred Language: ${userLanguage}
  `;
      }

      summaryPrompt += `
  Conversation History:
  ${chatHistory.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}
  
  Last Symptom Profile:
  ${JSON.stringify(symptomProfile || {})}
  `;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: summaryPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              urgency: { 
                type: 'STRING', 
                enum: ['Emergency Now', 'A&E Today', 'GP Urgent', 'GP Routine', 'Self-Care'] 
              },
              reasoning: { type: 'STRING', description: 'Clinical reasoning behind the triage classification.' },
              summary: {
                type: 'OBJECT',
                properties: {
                  presentingComplaint: { type: 'STRING' },
                  symptomTimeline: { type: 'STRING' },
                  associatedSymptoms: { type: 'ARRAY', items: { type: 'STRING' } },
                  medicalHistory: { type: 'STRING' },
                  clinicalUrgencyAssessment: { type: 'STRING' }
                },
                required: ['presentingComplaint', 'symptomTimeline', 'associatedSymptoms', 'medicalHistory', 'clinicalUrgencyAssessment']
              },
              pathwayGuidance: {
                type: 'OBJECT',
                properties: {
                  whatToDo: { type: 'STRING', description: 'Step-by-step actionable advice for the patient.' },
                  whatToTellProvider: { type: 'STRING', description: 'Brief script or bullet points for when they speak to a clinician.' },
                  redFlags: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Symptoms that should trigger immediate emergency re-routing if they develop.' }
                },
                required: ['whatToDo', 'whatToTellProvider', 'redFlags']
              }
            },
            required: ['urgency', 'reasoning', 'summary', 'pathwayGuidance']
          }
        }
      });

      const responseText = response.text;
      resultJson = JSON.parse(responseText);
    } catch (gcpError) {
      console.warn('Google Gen AI summary compilation failed, falling back to local summary logic:', gcpError.message);
      resultJson = runFallbackSummary(chatHistory, symptomProfile, patientInfo);
    }

    return NextResponse.json(resultJson);
  } catch (error) {
    console.error('API Summary Error:', error);
    return NextResponse.json({ error: 'Failed to generate triage summary.', details: error.message }, { status: 500 });
  }
}
