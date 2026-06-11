import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';
import { getAuthOptions } from '../auth-helper';

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
} catch (err) {
  console.error('Vertex AI init error:', err);
}

export async function POST(request) {
  try {
    const { chatHistory, symptomProfile, patientInfo } = await request.json();

    const model = vertexAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            urgency: { 
              type: 'string', 
              enum: ['Emergency Now', 'A&E Today', 'GP Urgent', 'GP Routine', 'Self-Care'] 
            },
            reasoning: { type: 'string', description: 'Clinical reasoning behind the triage classification.' },
            summary: {
              type: 'object',
              properties: {
                presentingComplaint: { type: 'string' },
                symptomTimeline: { type: 'string' },
                associatedSymptoms: { type: 'array', items: { type: 'string' } },
                medicalHistory: { type: 'string' },
                clinicalUrgencyAssessment: { type: 'string' }
              },
              required: ['presentingComplaint', 'symptomTimeline', 'associatedSymptoms', 'medicalHistory', 'clinicalUrgencyAssessment']
            },
            pathwayGuidance: {
              type: 'object',
              properties: {
                whatToDo: { type: 'string', description: 'Step-by-step actionable advice for the patient.' },
                whatToTellProvider: { type: 'string', description: 'Brief script or bullet points for when they speak to a clinician.' },
                redFlags: { type: 'array', items: { type: 'string' }, description: 'Symptoms that should trigger immediate emergency re-routing if they develop.' }
              },
              required: ['whatToDo', 'whatToTellProvider', 'redFlags']
            }
          },
          required: ['urgency', 'reasoning', 'summary', 'pathwayGuidance']
        }
      }
    });

    let summaryPrompt = `You are a Senior Clinical Triage Officer. Generate a final structured Patient Summary and Care Pathway Guidance based on the symptom intake conversation history.
Evaluate the timeline, severity, history, and associated symptoms to provide a safe, accurate triage recommendation.

Format the output strictly as JSON.
`;

    if (patientInfo) {
      summaryPrompt += `
Patient Demographics:
- Name: ${patientInfo.name || 'Anonymous'}
- Age: ${patientInfo.age || 'Unknown'}
- Biological Sex: ${patientInfo.sex || 'Unknown'}
- Pre-existing Medical History: ${patientInfo.preExistingHistory || 'None declared'}
`;
    }

    summaryPrompt += `
Conversation History:
${chatHistory.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n')}

Last Symptom Profile:
${JSON.stringify(symptomProfile || {})}
`;

    const response = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }]
    });

    const responseText = response.response.candidates[0].content.parts[0].text;
    const resultJson = JSON.parse(responseText);

    return NextResponse.json(resultJson);
  } catch (error) {
    console.error('API Summary Error:', error);
    return NextResponse.json({ error: 'Failed to generate triage summary.', details: error.message }, { status: 500 });
  }
}
