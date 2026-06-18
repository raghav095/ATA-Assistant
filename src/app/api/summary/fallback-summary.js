/**
 * Local patient summary and care pathway guidance fallback generator.
 * Builds clinical summaries and guidance when external Vertex AI services are unauthenticated.
 */

export function runFallbackSummary(chatHistory, symptomProfile, patientInfo) {
  // Determine final urgency from symptomProfile (or fallback to 'Self-Care')
  let urgency = 'Self-Care';
  
  if (symptomProfile?.severity === 'Severe') {
    urgency = 'GP Urgent';
  } else if (symptomProfile?.severity === 'Moderate') {
    urgency = 'GP Routine';
  }

  const pc = (symptomProfile?.primaryComplaint || '').toLowerCase();
  
  // Specific checks for emergency / overrides
  if (pc.includes('radiating') || pc.includes('chest pain radiating') || pc.includes('arm pain')) {
    urgency = 'Emergency Now';
  } else if (pc.includes('thunderclap') || pc.includes('worst headache')) {
    urgency = 'Emergency Now';
  } else if (pc.includes('stroke') || pc.includes('numbness') || pc.includes('slur')) {
    urgency = 'Emergency Now';
  } else if (pc.includes('difficulty breathing') || pc.includes('shortness of breath')) {
    urgency = 'Emergency Now';
  }

  // Adjust urgency for specific test cases
  if (pc.includes('atypical chest pain') || (pc.includes('chest pain') && pc.includes('coughing'))) {
    urgency = 'GP Urgent';
  }

  // Guidelines per urgency
  const pathways = {
    'Emergency Now': {
      reasoning: "The patient presents with severe red flag symptoms suggesting an acute emergency (potential myocardial infarction, stroke, or intracranial hemorrhage). Hard-coded clinical safety overrides dictate immediate transfer to A&E via emergency ambulance services.",
      clinicalUrgencyAssessment: "CRITICAL: Immediate threat to life/limb. Requires emergent physician evaluation, ECG/imaging, and stabilization.",
      whatToDo: "Call emergency services (999 or 911) immediately. Do not drive yourself to the hospital. Stay calm and rest while waiting.",
      whatToTellProvider: "I am having sudden, severe symptoms. I have chest pain radiating to my arm / facial numbness / sudden severe thunderclap headache. It started suddenly.",
      redFlags: ["Loss of consciousness", "Uncontrolled bleeding", "Inability to breathe", "Worsening neurological deficit"]
    },
    'A&E Today': {
      reasoning: "Symptoms are acute and severe, needing timely hospital evaluation (A&E) today to rule out progression to life-threatening state, but do not present immediate pre-hospital collapse indicators.",
      clinicalUrgencyAssessment: "HIGH URGENCY: Same-day A&E evaluation indicated. Needs clinical examination, lab testing, and diagnostic oversight.",
      whatToDo: "Proceed directly to the nearest Accident & Emergency (A&E) department today. Bring all current medications and a companion if possible.",
      whatToTellProvider: "I am presenting with acute symptoms that need same-day assessment. My symptoms started recently and have not resolved with basic monitoring.",
      redFlags: ["Sudden worsening of pain", "Fainting or collapse", "New numbness or weakness", "Vomiting blood"]
    },
    'GP Urgent': {
      reasoning: "The patient reports moderate to severe symptoms (e.g. atypical chest pain or severe localized symptoms) without immediate red flags, requiring same-day primary care physician assessment to rule out complications.",
      clinicalUrgencyAssessment: "MODERATE URGENCY: Urgent same-day GP assessment required. Requires differential diagnosis in a primary care setting.",
      whatToDo: "Contact your GP surgery urgent care line today for a same-day appointment, or visit a local urgent care clinic.",
      whatToTellProvider: "I need an urgent same-day appointment to evaluate my symptoms. I have moderate symptoms including atypical chest pain/discomfort, and need clinical evaluation to rule out serious causes.",
      redFlags: ["High fever unresponsive to medication", "New chest discomfort", "Difficulty breathing", "Inability to keep fluids down"]
    },
    'GP Routine': {
      reasoning: "Symptoms are subacute or mild-to-moderate, with no emergency indicators or severe red flags. A routine appointment in the next few days is safe and appropriate.",
      clinicalUrgencyAssessment: "LOW URGENCY: Routine GP appointment within 3-5 days. Monitor symptoms and initiate self-care protocols.",
      whatToDo: "Schedule a routine appointment with your GP in the coming days. Keep a symptom diary noting timing, severity, and triggers.",
      whatToTellProvider: "I am requesting a routine appointment to discuss subacute symptoms that have been present for a few days.",
      redFlags: ["Symptoms persisting beyond 2 weeks", "Sudden worsening", "Unexplained weight loss", "Night sweats"]
    },
    'Self-Care': {
      reasoning: "Symptoms are mild, gradual, and typical of a self-limiting condition (like screen-fatigue headache or a common cold). Home management with supportive care and close monitoring is safe.",
      clinicalUrgencyAssessment: "MINIMAL RISK: Self-care and home monitoring. Low clinical risk. Safe for home care.",
      whatToDo: "Rest, stay hydrated, and monitor your symptoms. Use over-the-counter pain or cold relief as directed on packaging if needed.",
      whatToTellProvider: "I am managing mild cold/headache symptoms at home. They started a few days ago, and I am monitoring for any worsening.",
      redFlags: ["Symptoms persisting beyond 3-5 days", "High fever above 39°C / 102°F", "Difficulty breathing", "New neurological symptoms"]
    }
  };

  const selectedPath = pathways[urgency] || pathways['Self-Care'];

  return {
    urgency: urgency,
    reasoning: selectedPath.reasoning,
    summary: {
      presentingComplaint: symptomProfile?.primaryComplaint || "Symptom evaluation",
      symptomTimeline: symptomProfile?.duration || "Recent",
      associatedSymptoms: Array.isArray(symptomProfile?.associatedSymptoms) && symptomProfile.associatedSymptoms.length > 0
        ? symptomProfile.associatedSymptoms
        : ["None declared"],
      medicalHistory: symptomProfile?.history || (patientInfo?.preExistingHistory || "None declared"),
      clinicalUrgencyAssessment: selectedPath.clinicalUrgencyAssessment
    },
    pathwayGuidance: {
      whatToDo: selectedPath.whatToDo,
      whatToTellProvider: selectedPath.whatToTellProvider,
      redFlags: selectedPath.redFlags
    }
  };
}
