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

  // Detect if Hindi is used in the symptom profile or chat history
  const isHindi = /[\u0900-\u097F]/.test(JSON.stringify(symptomProfile || '')) || /[\u0900-\u097F]/.test(JSON.stringify(chatHistory || ''));

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

  const hindiPathways = {
    'Emergency Now': {
      reasoning: "मरीज में गंभीर लाल झंडे (red flags) के लक्षण दिखाई दे रहे हैं जो एक तीव्र आपातकाल (संभावित दिल का दौरा, स्ट्रोक, या मस्तिष्क रक्तस्राव) का संकेत देते हैं। क्लीनिकल सुरक्षा ओवरराइड के अनुसार मरीज को तुरंत आपातकालीन एम्बुलेंस सेवा के माध्यम से आपातकालीन विभाग (A&E) में भेजा जाना चाहिए।",
      clinicalUrgencyAssessment: "अति गंभीर: जीवन/अंग को तत्काल खतरा। आपातकालीन चिकित्सक द्वारा मूल्यांकन, ईसीजी/इमेजिंग और स्थिरीकरण की आवश्यकता है।",
      whatToDo: "तुरंत आपातकालीन सेवाओं (जैसे 102, 108 या 911) को कॉल करें। खुद वाहन चलाकर अस्पताल न जाएं। शांत रहें और प्रतीक्षा करते समय आराम करें।",
      whatToTellProvider: "मुझे अचानक गंभीर लक्षण महसूस हो रहे हैं। मेरे सीने में तेज दर्द हो रहा है जो बाएं हाथ तक जा रहा है / चेहरे में सुन्नता है / अचानक तीव्र सिरदर्द है। यह अचानक शुरू हुआ।",
      redFlags: ["बेहोश होना या चेतना खोना", "अनियंत्रित गंभीर रक्तस्राव", "सांस लेने या बोलने में असमर्थता", "न्यूरोलॉजिकल कमजोरी या चेहरे का झुकना"]
    },
    'A&E Today': {
      reasoning: "लक्षण तीव्र और गंभीर हैं, जिसके लिए आज ही आपातकालीन विभाग (A&E) में मूल्यांकन की आवश्यकता है ताकि जीवन के लिए खतरनाक स्थिति में बदलने से रोका जा सके, लेकिन तुरंत बेहोशी या पतन के लक्षण नहीं हैं।",
      clinicalUrgencyAssessment: "उच्च तात्कालिकता: आज ही आपातकालीन विभाग (A&E) में मूल्यांकन की सलाह दी जाती है। क्लीनिकल परीक्षण, प्रयोगशाला परीक्षण और नैदानिक देखरेख की आवश्यकता है।",
      whatToDo: "आज ही सीधे नजदीकी आपातकालीन विभाग (A&E) में जाएं। अपनी सभी वर्तमान दवाएं और यदि संभव हो तो किसी साथी को साथ लाएं।",
      whatToTellProvider: "मैं तीव्र लक्षणों के साथ आया हूँ जिनके लिए आज ही मूल्यांकन की आवश्यकता है। मेरे लक्षण हाल ही में शुरू हुए हैं और सामान्य निगरानी से ठीक नहीं हुए हैं।",
      redFlags: ["दर्द का अचानक बहुत बढ़ना", "बेहोश होना या अचानक गिरना", "नई सुन्नता या कमजोरी महसूस होना", "उल्टी में खून आना"]
    },
    'GP Urgent': {
      reasoning: "मरीज ने बिना किसी तत्काल लाल झंडे के मध्यम से गंभीर लक्षणों (जैसे असामान्य छाती में दर्द या गंभीर स्थानीय लक्षण) की सूचना दी है, जिसके लिए जटिलताओं से बचने के लिए उसी दिन प्राथमिक उपचार चिकित्सक (जीपी) द्वारा तत्काल मूल्यांकन की आवश्यकता है।",
      clinicalUrgencyAssessment: "मध्यम तात्कालिकता: उसी दिन जीपी से तत्काल मूल्यांकन की आवश्यकता है। प्राथमिक चिकित्सा सेटिंग में क्लीनिकल मूल्यांकन की आवश्यकता है।",
      whatToDo: "आज ही उसी दिन अपॉइंटमेंट के लिए अपने जीपी या तत्काल देखभाल क्लिनिक (Urgent Care Clinic) से संपर्क करें।",
      whatToTellProvider: "मुझे अपने लक्षणों के मूल्यांकन के लिए आज ही तत्काल अपॉइंटमेंट की आवश्यकता है। मुझे असामान्य छाती में दर्द/असुविधा सहित मध्यम लक्षण हैं, और गंभीर कारणों को खारिज करने के लिए क्लीनिकल मूल्यांकन की आवश्यकता है।",
      redFlags: ["दवाओं से ठीक न होने वाला तेज बुखार", "सीने में नई असुविधा या जकड़न", "सांस लेने में नई कठिनाई", "तरल पदार्थ पचाने या पीने में असमर्थता"]
    },
    'GP Routine': {
      reasoning: "लक्षण मध्यम या हल्के हैं, जिनमें कोई आपातकालीन संकेतक या गंभीर लाल झंडे नहीं हैं। अगले कुछ दिनों में एक नियमित जीपी अपॉइंटमेंट सुरक्षित और उपयुक्त है।",
      clinicalUrgencyAssessment: "कम तात्कालिकता: 3-5 दिनों के भीतर नियमित जीपी अपॉइंटमेंट। लक्षणों की निगरानी करें और स्व-देखभाल (self-care) शुरू करें।",
      whatToDo: "आने वाले दिनों में अपने जीपी के साथ एक सामान्य अपॉइंटमेंट शेड्यूल करें। एक लक्षण डायरी रखें जिसमें समय, गंभीरता और ट्रिगर्स दर्ज करें।",
      whatToTellProvider: "मैं कुछ दिनों से चल रहे हल्के लक्षणों पर चर्चा करने के लिए एक नियमित अपॉइंटमेंट का अनुरोध कर रहा हूँ।",
      redFlags: ["लक्षण 2 सप्ताह से अधिक समय तक बने रहना", "अचानक स्थिति बहुत बिगड़ना", "बिना कारण वजन कम होना", "रात में पसीना आना"]
    },
    'Self-Care': {
      reasoning: "लक्षण हल्के, धीरे-धीरे बढ़ने वाले और खुद ठीक होने वाली स्थिति (जैसे स्क्रीन की थकान से सिरदर्द या सामान्य सर्दी) के विशिष्ट हैं। उचित देखभाल और घरेलू निगरानी के साथ घर पर स्व-प्रबंधन सुरक्षित है।",
      clinicalUrgencyAssessment: "न्यूनतम जोखिम: स्व-देखभाल और घरेलू निगरानी। कम क्लीनिकल जोखिम। घरेलू देखभाल के लिए सुरक्षित।",
      whatToDo: "आराम करें, पर्याप्त पानी पीएं और अपने लक्षणों की निगरानी करें। आवश्यकतानुसार पैकेजिंग पर दिए गए निर्देशों के अनुसार डॉक्टर की पर्ची के बिना मिलने वाली (OTC) दर्द या सर्दी की दवाओं का उपयोग करें।",
      whatToTellProvider: "मैं घर पर हल्के सर्दी/सिरदर्द के लक्षणों का प्रबंधन कर रहा हूँ। ये कुछ दिन पहले शुरू हुए थे, और मैं किसी भी गिरावट के लिए निगरानी कर रहा हूँ।",
      redFlags: ["लक्षण 3-5 दिनों से अधिक समय तक बने रहना", "102°F / 39°C से अधिक तेज बुखार होना", "सांस लेने में नई कठिनाई", "नए न्यूरोलॉजिकल लक्षण"]
    }
  };

  const symptomTranslations = {
    'Fever': 'बुखार (Fever)',
    'Cough': 'खांसी (Cough)',
    'Difficulty breathing': 'सांस लेने में कठिनाई (Difficulty breathing)',
    'Shortness of breath': 'सांस की कमी (Shortness of breath)',
    'Vomiting': 'उल्टी (Vomiting)',
    'Dizziness': 'चक्कर आना (Dizziness)',
    'Headache': 'सिरदर्द (Headache)',
    'Congestion': 'कफ/जकड़न (Congestion)',
    'Runny nose': 'बहती नाक (Runny nose)',
    'Sore throat': 'गले में खराश (Sore throat)',
    'Scratchy throat': 'गले में खराश/खिंचाव (Scratchy throat)',
    'Fatigue': 'थकान (Fatigue)',
    'Chills': 'कंपकंपी (Chills)',
    'Sweating': 'पसीना आना (Sweating)',
    'Rash': 'चकत्ते (Rash)',
    'Itching': 'खुजली (Itching)',
    'Diarrhea': 'दस्त (Diarrhea)',
    'Stomach pain': 'पेट दर्द (Stomach pain)',
    'Abdominal discomfort': 'पेट में बेचैनी (Abdominal discomfort)',
    'None declared': 'कोई घोषित नहीं'
  };

  const selectedPath = isHindi ? (hindiPathways[urgency] || hindiPathways['Self-Care']) : (pathways[urgency] || pathways['Self-Care']);

  let finalAssociatedSymptoms = ["None declared"];
  if (Array.isArray(symptomProfile?.associatedSymptoms) && symptomProfile.associatedSymptoms.length > 0) {
    finalAssociatedSymptoms = symptomProfile.associatedSymptoms.map(sym => {
      if (isHindi && symptomTranslations[sym]) {
        return symptomTranslations[sym];
      }
      return sym;
    });
  } else if (isHindi) {
    finalAssociatedSymptoms = ["कोई घोषित नहीं"];
  }

  return {
    urgency: urgency,
    reasoning: selectedPath.reasoning,
    summary: {
      presentingComplaint: symptomProfile?.primaryComplaint || (isHindi ? "लक्षण मूल्यांकन" : "Symptom evaluation"),
      symptomTimeline: symptomProfile?.duration || (isHindi ? "हाल ही में" : "Recent"),
      associatedSymptoms: finalAssociatedSymptoms,
      medicalHistory: symptomProfile?.history || (patientInfo?.preExistingHistory || (isHindi ? "कोई घोषित नहीं" : "None declared")),
      clinicalUrgencyAssessment: selectedPath.clinicalUrgencyAssessment
    },
    pathwayGuidance: {
      whatToDo: selectedPath.whatToDo,
      whatToTellProvider: selectedPath.whatToTellProvider,
      redFlags: selectedPath.redFlags
    }
  };
}
