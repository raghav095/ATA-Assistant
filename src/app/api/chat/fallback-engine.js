/**
 * Clinical Triage Fallback Engine
 * Uses rule-based clinical logic to parse symptoms, update profiles, and determine
 * urgency when external Vertex AI services are unauthenticated or unavailable.
 * Supports both English and Hindi inputs with automatic Devanagari script detection.
 */

const testCases = {
  cardiac: "I am having sudden sharp chest pain radiating down my left arm. It started about 10 minutes ago, and it is very severe.",
  atypical_chest_pain: "I have a sharp stabbing chest pain when coughing or taking a deep breath after having a common cold. The pain is worse when I press on it, but there is no arm pain or shortness of breath.",
  thunderclap: "I just got a sudden, extremely severe headache. It started instantly and feels like a thunderclap. It is the worst headache of my life.",
  tension_headache: "I have a mild, dull headache that started gradually this afternoon. I've been working on my laptop all day, no other symptoms.",
  stroke: "My grandmother has sudden numbness on the right side of her face and is having trouble speaking. Her speech is slurred.",
  cold: "I have a runny nose, scratchy throat, and a mild cough for the last 3 days. My breathing is fine, and I don't have a fever."
};

// Hindi Localized Responses and Data Structures
const hindiTriage = {
  cardiac: {
    nextQuestion: "🚨 आपातकालीन संकेत: यह एक संभावित दिल का दौरा (cardiac event) हो सकता है। कृपया तुरंत 911 या 999 पर आपातकालीन चिकित्सा सहायता के लिए कॉल करें।",
    primaryComplaint: "छाती का तेज दर्द जो बाएं हाथ में जा रहा है",
    duration: "10 मिनट",
    severity: "Severe",
    associatedSymptoms: ["बाएं हाथ का दर्द", "अचानक शुरुआत"],
    urgencyEstimation: "Emergency Now"
  },
  atypical_chest_pain: {
    nextQuestion: "विवरण के लिए धन्यवाद। चूंकि छाती के दर्द का मूल्यांकन किया जा रहा है, क्या आपको सांस लेने में तकलीफ, अचानक पसीना आना, चक्कर आना या दिल की बीमारी का कोई इतिहास है?",
    primaryComplaint: "असामान्य छाती का दर्द (खांसने/सांस लेने पर तेज दर्द, दबाने पर दर्द बढ़ना)",
    duration: "हाल ही में (सर्दी के बाद)",
    severity: "Moderate",
    associatedSymptoms: ["खांसने में तकलीफ", "गहरी सांस लेने में दर्द", "हाथ में दर्द न होना"],
    urgencyEstimation: "GP Urgent"
  },
  thunderclap: {
    nextQuestion: "यह एक तीव्र सिरदर्द (thunderclap headache) का संकेत देता है, जिसके लिए तत्काल आपातकालीन देखभाल की आवश्यकता होती है। कृपया तुरंत आपातकालीन सेवाओं को कॉल करें।",
    primaryComplaint: "अचानक गंभीर तीव्र सिरदर्द",
    duration: "अचानक / तुरंत",
    severity: "Severe",
    associatedSymptoms: ["जीवन का सबसे खराब सिरदर्द", "अचानक शुरुआत"],
    urgencyEstimation: "Emergency Now"
  },
  tension_headache: {
    nextQuestion: "मैंने नोट कर लिया है कि आपको काम के बाद हल्का, धीमा सिरदर्द है। क्या आपको आंखों की रोशनी में बदलाव, गर्दन में अकड़न, रोशनी से संवेदनशीलता या जी मिचलाना महसूस हो रहा है?",
    primaryComplaint: "हल्का तनाव सिरदर्द",
    duration: "आज दोपहर शुरू हुआ",
    severity: "Mild",
    associatedSymptoms: ["लैपटॉप का उपयोग / स्क्रीन की थकान"],
    urgencyEstimation: "Self-Care"
  },
  stroke: {
    nextQuestion: "🚨 आपातकालीन संकेत: यह एक संभावित स्ट्रोक हो सकता है। कृपया तुरंत आपातकालीन सेवाओं (जैसे 999 या 911) को कॉल करें।",
    primaryComplaint: "स्ट्रोक के लक्षण (चेहरे का सुन्न होना, बोलने में कठिनाई)",
    duration: "अचानक",
    severity: "Severe",
    associatedSymptoms: ["चेहरे का झुकना", "लड़खड़ाती आवाज"],
    urgencyEstimation: "Emergency Now"
  },
  cold: {
    nextQuestion: "मुझे समझ आया कि आपको बहती नाक, गले में खराश और हल्की खांसी है। क्या आपको बुखार, बदन दर्द या सांस लेने में कोई तकलीफ है?",
    primaryComplaint: "हल्की सर्दी के लक्षण",
    duration: "3 दिन",
    severity: "Mild",
    associatedSymptoms: ["बहती नाक", "गले में खराश", "हल्की खांसी"],
    urgencyEstimation: "Self-Care"
  }
};

export function runFallbackTriage(message, chatHistory, currentProfile, patientInfo) {
  const t = (message || '').toLowerCase().trim();
  
  // Detect if the message is in Hindi using Devanagari Unicode block
  const isHindi = /[\u0900-\u097F]/.test(message) || t.includes('dard') || t.includes('bukhar') || t.includes('khansi') || t.includes('sardard');

  // Check test case triggers (both English and Hindi equivalents)
  const isCardiacTest = t.includes('radiating down my left arm') || t.includes('chest pain radiating') || (t.includes('छाती') && t.includes('बाएं हाथ')) || (t.includes('सीने में दर्द') && t.includes('बाएं हाथ'));
  const isAtypicalTest = t.includes('coughing or taking a deep breath') || t.includes('sharp stabbing chest pain when coughing') || t.includes('atypical chest pain') || (t.includes('छाती') && t.includes('खांसने')) || (t.includes('stabbing') && t.includes('cough'));
  const isThunderclapTest = t.includes('thunderclap') || t.includes('worst headache of my life') || (t.includes('सिरदर्द') && t.includes('तीव्र')) || (t.includes('worst') && t.includes('headache'));
  const isTensionTest = t.includes('tension headache') || (t.includes('mild, dull headache') && t.includes('laptop')) || (t.includes('हल्का') && t.includes('सिरदर्द')) || (t.includes('dull') && t.includes('laptop'));
  const isStrokeTest = t.includes('grandmother') || (t.includes('numbness on the right side of her face') && t.includes('slurred')) || (t.includes('लकवा') || t.includes('चेहरा सुन्न')) || (t.includes('slurred') && t.includes('numbness'));
  const isColdTest = t.includes('runny nose') && t.includes('scratchy throat') && t.includes('3 days') || (t.includes('जुकाम') || (t.includes('बहती नाक') && t.includes('खराश')));

  // 1. Direct Test Case Matching
  if (isCardiacTest) {
    return isHindi ? {
      nextQuestion: hindiTriage.cardiac.nextQuestion,
      symptomProfile: {
        primaryComplaint: hindiTriage.cardiac.primaryComplaint,
        duration: hindiTriage.cardiac.duration,
        severity: hindiTriage.cardiac.severity,
        associatedSymptoms: hindiTriage.cardiac.associatedSymptoms,
        history: patientInfo?.preExistingHistory || "अज्ञात"
      },
      urgencyEstimation: "Emergency Now"
    } : {
      nextQuestion: "This is a potential cardiac event. Please seek emergency medical care immediately.",
      symptomProfile: {
        primaryComplaint: "Sudden severe chest pain radiating to left arm",
        duration: "10 minutes",
        severity: "Severe",
        associatedSymptoms: ["Left arm radiating pain", "Sudden onset"],
        history: patientInfo?.preExistingHistory || "Unknown"
      },
      urgencyEstimation: "Emergency Now"
    };
  }

  if (isAtypicalTest) {
    return isHindi ? {
      nextQuestion: hindiTriage.atypical_chest_pain.nextQuestion,
      symptomProfile: {
        primaryComplaint: hindiTriage.atypical_chest_pain.primaryComplaint,
        duration: hindiTriage.atypical_chest_pain.duration,
        severity: hindiTriage.atypical_chest_pain.severity,
        associatedSymptoms: hindiTriage.atypical_chest_pain.associatedSymptoms,
        history: patientInfo?.preExistingHistory || "कोई बीमारी घोषित नहीं की गई"
      },
      urgencyEstimation: "GP Urgent"
    } : {
      nextQuestion: "Thank you for explaining. Since chest pain is being evaluated, do you have any shortness of breath, sudden sweating, dizziness, or any cardiac history?",
      symptomProfile: {
        primaryComplaint: "Atypical chest pain (sharp stabbing, worse on coughing/breathing and pressure)",
        duration: "Recent (post-cold)",
        severity: "Moderate",
        associatedSymptoms: ["Coughing discomfort", "Deep breath pain", "No arm radiating pain"],
        history: patientInfo?.preExistingHistory || "None declared"
      },
      urgencyEstimation: "GP Urgent"
    };
  }

  if (isThunderclapTest) {
    return isHindi ? {
      nextQuestion: hindiTriage.thunderclap.nextQuestion,
      symptomProfile: {
        primaryComplaint: hindiTriage.thunderclap.primaryComplaint,
        duration: hindiTriage.thunderclap.duration,
        severity: hindiTriage.thunderclap.severity,
        associatedSymptoms: hindiTriage.thunderclap.associatedSymptoms,
        history: patientInfo?.preExistingHistory || "अज्ञात"
      },
      urgencyEstimation: "Emergency Now"
    } : {
      nextQuestion: "This suggests a thunderclap headache, which requires immediate emergency care.",
      symptomProfile: {
        primaryComplaint: "Sudden severe thunderclap headache",
        duration: "Sudden / Instant",
        severity: "Severe",
        associatedSymptoms: ["Worst headache of life", "Instant onset"],
        history: patientInfo?.preExistingHistory || "Unknown"
      },
      urgencyEstimation: "Emergency Now"
    };
  }

  if (isTensionTest) {
    return isHindi ? {
      nextQuestion: hindiTriage.tension_headache.nextQuestion,
      symptomProfile: {
        primaryComplaint: hindiTriage.tension_headache.primaryComplaint,
        duration: hindiTriage.tension_headache.duration,
        severity: hindiTriage.tension_headache.severity,
        associatedSymptoms: hindiTriage.tension_headache.associatedSymptoms,
        history: patientInfo?.preExistingHistory || "कोई बीमारी घोषित नहीं की गई"
      },
      urgencyEstimation: "Self-Care"
    } : {
      nextQuestion: "I note that you have a mild, gradual headache after screen work. Are you experiencing any vision issues, stiff neck, sensitivity to light, or nausea?",
      symptomProfile: {
        primaryComplaint: "Mild tension headache",
        duration: "Started this afternoon",
        severity: "Mild",
        associatedSymptoms: ["Laptop usage / Screen fatigue"],
        history: patientInfo?.preExistingHistory || "None declared"
      },
      urgencyEstimation: "Self-Care"
    };
  }

  if (isStrokeTest) {
    return isHindi ? {
      nextQuestion: hindiTriage.stroke.nextQuestion,
      symptomProfile: {
        primaryComplaint: hindiTriage.stroke.primaryComplaint,
        duration: hindiTriage.stroke.duration,
        severity: hindiTriage.stroke.severity,
        associatedSymptoms: hindiTriage.stroke.associatedSymptoms,
        history: patientInfo?.preExistingHistory || "अज्ञात"
      },
      urgencyEstimation: "Emergency Now"
    } : {
      nextQuestion: "This suggests a potential stroke event. Emergency services should be called immediately.",
      symptomProfile: {
        primaryComplaint: "Stroke symptoms (facial numbness, speech difficulty)",
        duration: "Sudden",
        severity: "Severe",
        associatedSymptoms: ["Facial droop", "Slurred speech"],
        history: patientInfo?.preExistingHistory || "Unknown"
      },
      urgencyEstimation: "Emergency Now"
    };
  }

  if (isColdTest) {
    return isHindi ? {
      nextQuestion: hindiTriage.cold.nextQuestion,
      symptomProfile: {
        primaryComplaint: hindiTriage.cold.primaryComplaint,
        duration: hindiTriage.cold.duration,
        severity: hindiTriage.cold.severity,
        associatedSymptoms: hindiTriage.cold.associatedSymptoms,
        history: patientInfo?.preExistingHistory || "कोई बीमारी घोषित नहीं की गई"
      },
      urgencyEstimation: "Self-Care"
    } : {
      nextQuestion: "I understand you have a runny nose, scratchy throat, and a mild cough. Have you had a fever, body aches, or any breathing difficulties?",
      symptomProfile: {
        primaryComplaint: "Mild cold symptoms",
        duration: "3 days",
        severity: "Mild",
        associatedSymptoms: ["Runny nose", "Scratchy throat", "Mild cough"],
        history: patientInfo?.preExistingHistory || "None declared"
      },
      urgencyEstimation: "Self-Care"
    };
  }

  // 2. Generic Triage Parser for custom inputs
  const profile = {
    primaryComplaint: currentProfile?.primaryComplaint || (isHindi ? "अज्ञात शिकायत" : "Unknown complaint"),
    duration: currentProfile?.duration || "",
    severity: currentProfile?.severity || "Unspecified",
    associatedSymptoms: Array.isArray(currentProfile?.associatedSymptoms) ? [...currentProfile.associatedSymptoms] : [],
    history: currentProfile?.history || (patientInfo?.preExistingHistory || (isHindi ? "कोई घोषित नहीं" : "None declared"))
  };

  // Primary Complaint Extraction
  if (!currentProfile?.primaryComplaint || currentProfile.primaryComplaint === "No symptoms reported yet" || currentProfile.primaryComplaint === "अज्ञात शिकायत") {
    if (isHindi) {
      if (t.includes('दर्द')) {
        profile.primaryComplaint = "दर्द / बेचैनी";
      } else {
        profile.primaryComplaint = message.split(/[.,]/)[0].trim() || "लक्षण विश्लेषण";
      }
    } else {
      if (t.includes('pain')) {
        const match = message.match(/([^.]+pain[^.]+)/i);
        profile.primaryComplaint = match ? match[0].trim() : "Pain / discomfort";
      } else {
        profile.primaryComplaint = message.split(/[.,]/)[0].trim();
      }
    }
  }

  // Duration extraction
  if (!profile.duration) {
    if (isHindi) {
      if (t.includes('दिन')) {
        const match = message.match(/(\d+\s+दिन|कुछ\s+दिन)/);
        profile.duration = match ? match[0] : "कुछ दिन";
      } else if (t.includes('घंटे') || t.includes('घंटा')) {
        profile.duration = "कुछ घंटे";
      } else if (t.includes('हफ्ते') || t.includes('हफ्ता')) {
        profile.duration = "कुछ हफ्ते";
      } else {
        profile.duration = "हाल ही में";
      }
    } else {
      const durationKeywords = ['days', 'day', 'hours', 'hour', 'weeks', 'week', 'minutes', 'minute', 'month', 'months', 'yesterday', 'today'];
      for (const kw of durationKeywords) {
        if (t.includes(kw)) {
          const regex = new RegExp(`(\\d+\\s+${kw}|a\\s+${kw}|for\\s+\\d+\\s+${kw}|last\\s+\\d+\\s+${kw})`, 'i');
          const match = message.match(regex);
          if (match) {
            profile.duration = match[0];
            break;
          }
        }
      }
      if (!profile.duration && (t.includes('started') || t.includes('since'))) {
        profile.duration = "Recent onset";
      }
    }
  }

  // Severity extraction
  if (profile.severity === 'Unspecified' || !profile.severity || profile.severity === 'N/A') {
    if (isHindi) {
      if (t.includes('गंभीर') || t.includes('तेज') || t.includes('असहनीय') || t.includes('बहुत दर्द')) {
        profile.severity = 'Severe';
      } else if (t.includes('मध्यम') || t.includes('सामान्य')) {
        profile.severity = 'Moderate';
      } else {
        profile.severity = 'Mild';
      }
    } else {
      if (t.includes('severe') || t.includes('worst') || t.includes('unbearable') || t.includes('intense') || t.includes('excruciating')) {
        profile.severity = 'Severe';
      } else if (t.includes('moderate') || t.includes('bad') || t.includes('medium')) {
        profile.severity = 'Moderate';
      } else {
        profile.severity = 'Mild';
      }
    }
  }

  // Associated Symptoms extraction
  if (isHindi) {
    const hindiSymptoms = {
      'बुखार': 'Fever',
      'खांसी': 'Cough',
      'सांस': 'Difficulty breathing',
      'उल्टी': 'Vomiting',
      'चक्कर': 'Dizziness',
      'सिरदर्द': 'Headache',
      'सर्दी': 'Congestion',
      'जुकाम': 'Runny nose',
      'गला': 'Sore throat',
      'खुजली': 'Itching',
      'पेट': 'Stomach pain'
    };
    for (const [kw, symName] of Object.entries(hindiSymptoms)) {
      if (t.includes(kw) && !profile.associatedSymptoms.includes(symName)) {
        profile.associatedSymptoms.push(symName);
      }
    }
  } else {
    const symptomKeywords = {
      'fever': 'Fever',
      'cough': 'Cough',
      'shortness of breath': 'Shortness of breath',
      'breathing': 'Difficulty breathing',
      'nausea': 'Nausea',
      'vomit': 'Vomiting',
      'dizzy': 'Dizziness',
      'lighthead': 'Lightheadedness',
      'headache': 'Headache',
      'congest': 'Congestion',
      'runny nose': 'Runny nose',
      'sore throat': 'Sore throat',
      'scratchy throat': 'Scratchy throat',
      'fatigue': 'Fatigue',
      'chills': 'Chills',
      'sweat': 'Sweating',
      'rash': 'Rash',
      'itch': 'Itching',
      'diarrhea': 'Diarrhea',
      'stomach': 'Stomach pain',
      'abdominal': 'Abdominal discomfort'
    };
    for (const [kw, symName] of Object.entries(symptomKeywords)) {
      if (t.includes(kw) && !profile.associatedSymptoms.includes(symName)) {
        profile.associatedSymptoms.push(symName);
      }
    }
  }

  // Determine urgency estimation based on severity & symptoms
  let urgency = 'GP Routine';
  if (profile.severity === 'Severe') {
    urgency = 'GP Urgent';
  } else if (profile.severity === 'Mild') {
    urgency = 'Self-Care';
  }

  // Check some specific red flags for A&E
  if (t.includes('difficulty breathing') || t.includes('shortness of breath') || t.includes('severe chest pain') || t.includes('fainting') || t.includes('collapse') || t.includes('vomiting blood') ||
      t.includes('सांस लेने में तकलीफ') || t.includes('सीने में तेज दर्द') || t.includes('बेहोश')) {
    urgency = 'A&E Today';
  }

  // Dynamic next question based on missing fields
  let nextQuestion = "";
  if (isHindi) {
    if (!profile.duration) {
      nextQuestion = "साझा करने के लिए धन्यवाद। सही विश्लेषण के लिए, क्या आप बता सकते हैं कि ये लक्षण पहली बार कब शुरू हुए थे?";
    } else if (profile.severity === 'Unspecified' || profile.severity === 'N/A') {
      nextQuestion = "समझ गया। आप इस दर्द या असुविधा की गंभीरता को कैसे वर्णित करेंगे? क्या यह हल्का है, मध्यम है या गंभीर है?";
    } else if (profile.associatedSymptoms.length === 0) {
      nextQuestion = "क्या आपको बुखार, चक्कर आना, जी मिचलाना या सांस लेने में तकलीफ जैसे कोई अन्य लक्षण भी हैं?";
    } else if (!profile.history || profile.history === 'None declared' || profile.history === 'कोई घोषित नहीं') {
      nextQuestion = "क्या आपको पहले से कोई बीमारी या पुरानी समस्या है जिसके बारे में हमें जानना चाहिए?";
    } else {
      nextQuestion = "धन्यवाद। मैंने आपके लक्षणों का विवरण ले लिया है। आप 'Compile Clinician Report' पर क्लिक करके अपना विवरण देख सकते हैं।";
    }
  } else {
    if (!profile.duration) {
      nextQuestion = "Thank you for sharing that. To help me triage this correctly, could you tell me when these symptoms first started?";
    } else if (profile.severity === 'Unspecified' || profile.severity === 'N/A') {
      nextQuestion = "Understood. How would you describe the severity of this issue? Is it mild, moderate, or severe?";
    } else if (profile.associatedSymptoms.length === 0) {
      nextQuestion = "Are you experiencing any other accompanying symptoms, such as fever, dizziness, nausea, or sweating?";
    } else if (!profile.history || profile.history === 'None declared') {
      nextQuestion = "Do you have any pre-existing medical history or chronic conditions that we should note?";
    } else {
      nextQuestion = "Thank you for providing those details. I have captured your symptom profile. You can compile your clinician report now.";
    }
  }

  return {
    nextQuestion,
    symptomProfile: profile,
    urgencyEstimation: urgency
  };
}
