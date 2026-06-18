'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  ClipboardList,
  Stethoscope,
  Shield,
  Sliders,
  Mic,
  MicOff,
  Image as ImageIcon,
  Send,
  RefreshCw,
  Phone,
  PhoneOff,
  X,
  LogOut,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Volume2,
  Copy,
  Printer,
  ChevronRight,
  User,
  Cake,
  Clock,
  Zap,
  ScrollText,
  Tags,
  HeartPulse,
  RadioTower,
  Check,
  AlertOctagon,
  FileText,
  PlayCircle,
  ListChecks
} from 'lucide-react';

// Predefined Triage Guidelines
const urgencyGuidelines = {
  'Emergency Now': {
    title: 'Emergency: Seek Care Immediately',
    description: 'Based on the clinical indicators, you require immediate emergency medical attention. Call emergency services (e.g. 911 or 999) or proceed to the nearest Emergency Department immediately. Do not drive yourself.',
    whatToDo: 'Call emergency services (911 / 999) immediately or ask someone nearby to. Do not drive yourself. Chew an aspirin if you are not allergic and a cardiac cause is suspected.',
    redFlags: ['Loss of consciousness', 'Severe uncontrolled bleeding', 'Inability to breathe or speak', 'Sudden confusion or disorientation'],
    badgeClass: 'urgency-Emergency-Now'
  },
  'A&E Today': {
    title: 'Proceed to Accident & Emergency (A&E)',
    description: 'Your symptoms should be evaluated at an Accident & Emergency department today. Do not wait for a routine appointment.',
    whatToDo: 'Go to your nearest Accident & Emergency department now. Do not eat or drink until seen if surgery is possible. Bring a list of current medications and a contact for your GP.',
    redFlags: ['Sudden worsening of pain', 'Fainting or collapse', 'New neurological symptoms', 'Vomiting blood'],
    badgeClass: 'urgency-AE-Today'
  },
  'GP Urgent': {
    title: 'Urgent Same-Day GP Assessment',
    description: 'Please contact your General Practitioner (GP) or urgent care clinic for a same-day assessment.',
    whatToDo: 'Contact your GP surgery\'s urgent care line now for a same-day appointment, or visit an urgent care center. If symptoms worsen before you are seen, escalate to A&E.',
    redFlags: ['High fever that does not respond to medication', 'Breathing difficulty', 'New chest pain', 'Inability to keep fluids down'],
    badgeClass: 'urgency-GP-Urgent'
  },
  'GP Routine': {
    title: 'Routine GP Appointment',
    description: 'Please schedule a routine appointment with your GP in the coming days. Monitor your symptoms for any changes.',
    whatToDo: 'Book a routine appointment with your GP in the next few days. Keep a symptom diary noting timing, severity, and triggers. Continue any prescribed medication.',
    redFlags: ['Symptoms persisting beyond 2 weeks', 'Sudden worsening', 'New unexplained weight loss', 'Night sweats'],
    badgeClass: 'urgency-GP-Routine'
  },
  'Self-Care': {
    title: 'Self-Care & Home Monitoring',
    description: 'Your symptoms appear suitable for home care. Keep hydrated, rest, and monitor closely. Seek medical attention if symptoms worsen.',
    whatToDo: 'Rest, stay hydrated, and monitor your symptoms for 24–48 hours. Use over-the-counter pain relief as directed on the packaging.',
    redFlags: ['Symptoms persisting beyond 3 days', 'High fever above 39°C / 102°F', 'Symptoms spreading or worsening', 'New symptoms appearing'],
    badgeClass: 'urgency-Self-Care'
  },
  'Unspecified': {
    title: 'Awaiting Clinical Intake',
    description: 'Please describe your symptoms in the chat tab to begin. The AI assistant will collect details and classify the urgency tier.',
    whatToDo: null,
    redFlags: [],
    badgeClass: 'urgency-Unspecified'
  }
};

// Predefined Test Scenarios
const testCases = {
  cardiac: "I am having sudden sharp chest pain radiating down my left arm. It started about 10 minutes ago, and it is very severe.",
  atypical_chest_pain: "I have a sharp stabbing chest pain when coughing or taking a deep breath after having a common cold. The pain is worse when I press on it, but there is no arm pain or shortness of breath.",
  thunderclap: "I just got a sudden, extremely severe headache. It started instantly and feels like a thunderclap. It is the worst headache of my life.",
  tension_headache: "I have a mild, dull headache that started gradually this afternoon. I've been working on my laptop all day, no other symptoms.",
  stroke: "My grandmother has sudden numbness on the right side of her face and is having trouble speaking. Her speech is slurred.",
  cold: "I have a runny nose, scratchy throat, and a mild cough for the last 3 days. My breathing is fine, and I don't have a fever."
};

export default function AegisTriageApp() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('tab-chat');
  
  // Patient Check-In / Demographic State
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [patientInfo, setPatientInfo] = useState({
    name: '',
    age: '',
    sex: 'Male',
    preExistingHistory: ''
  });
  const [checkInInput, setCheckInInput] = useState({
    name: '',
    age: '',
    sex: 'Male',
    preExistingHistory: ''
  });

  // Multimodal Image State
  const [selectedImage, setSelectedImage] = useState(null); // { base64, mimeType, fileName, fileSize }

  // Triage Dialogue & Profile State
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: 'Welcome to Aegis Clinical Triage. Please describe the symptoms you are experiencing today and tell me when they started.' }
  ]);
  const [symptomProfile, setSymptomProfile] = useState({
    primaryComplaint: '',
    duration: '',
    severity: '',
    associatedSymptoms: [],
    history: ''
  });
  const [currentUrgency, setCurrentUrgency] = useState('Unspecified');
  const [guardrailTriggered, setGuardrailTriggered] = useState(false);
  const [guardrailReason, setGuardrailReason] = useState('');
  const [guardrailMessage, setGuardrailMessage] = useState('');
  
  // Auditing & Logs State
  const [safetyAuditLogs, setSafetyAuditLogs] = useState([]);
  
  // Interaction State
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  
  // Handover Report State
  const [summaryReport, setSummaryReport] = useState(null);
  const [isCompilingSummary, setIsCompilingSummary] = useState(false);

  // Audio / Speech State
  const [voiceEnabled, setVoiceEnabled] = useState(false); // Off by default in standard chat
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const recordingTimeoutRef = useRef(null);
  // Bumped on every startVoiceSession. Async handlers (onstop, STT, TTS) capture
  // the generation they were launched under and bail out if it has changed —
  // prevents the "click exit, mic still flickers" race.
  const sessionGenerationRef = useRef(0);

  // Real-time Voice Session State
  const [voiceSessionActive, setVoiceSessionActive] = useState(false);
  const [voiceSessionStatus, setVoiceSessionStatus] = useState('idle'); // 'idle' | 'listening' | 'thinking' | 'speaking'
  const [useLocalSTT, setUseLocalSTT] = useState(false);
  const recognitionRef = useRef(null);

  // Chat scroll anchor ref
  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, isTyping]);

  useEffect(() => {
    // Load patient info from localStorage on mount
    try {
      const stored = localStorage.getItem('aegis_patient_info');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.name) {
          setPatientInfo(parsed);
          setCheckInInput(parsed);
          setIsCheckedIn(true);
          setSymptomProfile(prev => ({
            ...prev,
            history: parsed.preExistingHistory || ''
          }));
        }
      }
    } catch (e) {
      console.error('Failed to load patient info from localStorage', e);
    }
  }, []);

  // Toast Trigger Helper
  const triggerToast = (message) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 2500);
  };

  // Switch Active Tab
  const switchTab = (tabId) => {
    setActiveTab(tabId);
  };

  // Reset Dialog State
  const handleReset = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setChatHistory([
      { role: 'assistant', content: 'Welcome to Aegis Clinical Triage. Please describe the symptoms you are experiencing today and tell me when they started.' }
    ]);
    setSymptomProfile({
      primaryComplaint: '',
      duration: '',
      severity: '',
      associatedSymptoms: [],
      history: patientInfo?.preExistingHistory || ''
    });
    setSelectedImage(null);
    setCurrentUrgency('Unspecified');
    setGuardrailTriggered(false);
    setGuardrailReason('');
    setGuardrailMessage('');
    setSafetyAuditLogs([]);
    setSummaryReport(null);
    setUserInput('');
    setIsRecording(false);
    setVoiceSessionActive(false);
    setVoiceSessionStatus('idle');
    setIsTyping(false);
    triggerToast('Dialogue intake reset successfully.');
  };

  // Browser Speech Synthesis Fallback helper
  const speakTextBrowser = (text, onEndCallback) => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const enVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || 
                      voices.find(v => v.lang.startsWith('en')) || 
                      voices[0];
      if (enVoice) utterance.voice = enVoice;
      
      if (onEndCallback) {
        utterance.onend = onEndCallback;
        utterance.onerror = onEndCallback;
      }
      
      window.speechSynthesis.speak(utterance);
      currentAudioRef.current = {
        pause: () => window.speechSynthesis.cancel()
      };
    } else {
      if (onEndCallback) onEndCallback();
    }
  };

  // Browser Speech Recognition Fallback helper
  const startBrowserRecognition = (isSession, capturedGeneration) => {
    const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    if (!SpeechRecognition) {
      triggerToast('⚠️ Speech recognition not supported in this browser.');
      if (isSession) {
        setVoiceSessionActive(false);
        setVoiceSessionStatus('idle');
      }
      return;
    }

    if (currentAudioRef.current && currentAudioRef.current.pause) {
      currentAudioRef.current.pause();
    }

    // Cancel any active recognition first
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecording(true);
      if (isSession) {
        setVoiceSessionStatus('listening');
      } else {
        triggerToast('🎙️ Browser dictation active. Speak now...');
      }
    };

    recognition.onerror = (e) => {
      console.error('Browser Speech Recognition error:', e);
      if (capturedGeneration !== sessionGenerationRef.current) return;
      setIsRecording(false);
      if (e.error === 'no-speech') {
        triggerToast('⚠️ No speech detected.');
      } else {
        triggerToast('⚠️ Speech recognition error.');
      }
      if (isSession) {
        setVoiceSessionStatus('listening');
        startRecording(true); // resume listening automatically
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.onresult = async (event) => {
      if (capturedGeneration !== sessionGenerationRef.current) return;
      const transcript = event.results[0][0].transcript;
      if (isSession) {
        if (transcript && transcript.trim()) {
          await sendVoiceSessionMessage(transcript);
        } else {
          setVoiceSessionStatus('listening');
          triggerToast('⚠️ Speech not recognized. Try again.');
          startRecording(true);
        }
      } else {
        setUserInput(transcript);
        triggerToast('🎙️ Speech loaded. Click Send to submit.');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // GCP Speech Synthesize & Transcribe Handlers
  const speakText = async (text) => {
    if (!text) return;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await response.json();
      if (data.audioContent && !data.useBrowserFallback) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
        currentAudioRef.current = audio;
        audio.play();
      } else {
        speakTextBrowser(text);
      }
    } catch (err) {
      console.error('GCP TTS Error, using browser fallback:', err);
      speakTextBrowser(text);
    }
  };

  // Speaks text inside the interactive Voice Session call loop
  const speakTextSession = async (text, exitAfterSpeak = false) => {
    if (!text) return;
    const capturedGeneration = sessionGenerationRef.current;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    const runLocalTTS = () => {
      speakTextBrowser(text, () => {
        if (capturedGeneration !== sessionGenerationRef.current) return;
        currentAudioRef.current = null;
        if (exitAfterSpeak) {
          setVoiceSessionActive(false);
          setVoiceSessionStatus('idle');
          switchTab('tab-pathway');
          triggerToast('🚨 Urgency determined. Reviewing care pathway...');
        } else {
          startRecording(true);
        }
      });
    };

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await response.json();
      if (capturedGeneration !== sessionGenerationRef.current) return;
      if (data.audioContent && !data.useBrowserFallback) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
        currentAudioRef.current = audio;

        audio.onended = () => {
          currentAudioRef.current = null;
          if (capturedGeneration !== sessionGenerationRef.current) return;
          if (exitAfterSpeak) {
            setVoiceSessionActive(false);
            setVoiceSessionStatus('idle');
            switchTab('tab-pathway');
            triggerToast('🚨 Urgency determined. Reviewing care pathway...');
          } else {
            startRecording(true);
          }
        };

        audio.play();
      } else {
        runLocalTTS();
      }
    } catch (err) {
      console.error('TTS Play Error, using browser fallback:', err);
      if (capturedGeneration !== sessionGenerationRef.current) return;
      runLocalTTS();
    }
  };

  const startRecording = async (isSession = false) => {
    const capturedGeneration = sessionGenerationRef.current;

    if (useLocalSTT) {
      startBrowserRecognition(isSession, capturedGeneration);
      return;
    }

    audioChunksRef.current = [];
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = 'audio/webm';
      let options = {};
      
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
          options = { mimeType };
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
          options = { mimeType };
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
          options = { mimeType };
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (capturedGeneration !== sessionGenerationRef.current) return;
        const actualMime = mediaRecorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMime });
        stream.getTracks().forEach(track => track.stop());

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          if (capturedGeneration !== sessionGenerationRef.current) return;
          const base64Audio = reader.result.split(',')[1];

          if (isSession) {
            setVoiceSessionStatus('thinking');
          } else {
            setIsTyping(true);
          }

          try {
            const response = await fetch('/api/stt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioContent: base64Audio,
                mimeType: actualMime
              })
            });
            const data = await response.json();
            if (capturedGeneration !== sessionGenerationRef.current) return;

            if (data.useBrowserFallback) {
              setUseLocalSTT(true);
              startBrowserRecognition(isSession, capturedGeneration);
              return;
            }

            if (isSession) {
              if (data.text && data.text.trim()) {
                await sendVoiceSessionMessage(data.text);
              } else {
                setVoiceSessionStatus('listening');
                triggerToast('⚠️ Speech not recognized. Try speaking again.');
                startRecording(true);
              }
            } else {
              setIsTyping(false);
              if (data.text) {
                setUserInput(data.text);
                triggerToast('🎙️ Speech loaded. Click Send to submit.');
              } else {
                triggerToast('⚠️ Speech not recognized.');
              }
            }
          } catch (err) {
            console.error('STT Error, falling back to browser recognition:', err);
            if (capturedGeneration !== sessionGenerationRef.current) return;
            setUseLocalSTT(true);
            startBrowserRecognition(isSession, capturedGeneration);
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);

      if (isSession) {
        setVoiceSessionStatus('listening');
      } else {
        triggerToast('🎙️ Dictation active. Speak now...');
      }

      recordingTimeoutRef.current = setTimeout(() => {
        if (capturedGeneration !== sessionGenerationRef.current) return;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          stopRecording(isSession);
          triggerToast('⏱️ Max recording limit reached. Transcribing input...');
        }
      }, 25000);

    } catch (err) {
      console.error('Mic Access Error, trying browser fallback:', err);
      setUseLocalSTT(true);
      startBrowserRecognition(isSession, capturedGeneration);
    }
  };

  const stopRecording = (isSession = false) => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (useLocalSTT && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (isSession) {
        setVoiceSessionStatus('thinking');
      } else {
        triggerToast('🔄 Transcribing audio...');
      }
    }
  };

  const startVoiceSession = () => {
    if (isRecording) {
      stopRecording(false);
    }
    sessionGenerationRef.current += 1;
    setVoiceSessionActive(true);
    setVoiceSessionStatus('speaking');

    const lastAssistantMsg = [...chatHistory].reverse().find(m => m.role === 'assistant');
    if (lastAssistantMsg) {
      speakTextSession(lastAssistantMsg.content, false);
    } else {
      setVoiceSessionStatus('listening');
      startRecording(true);
    }
  };

  const endVoiceSession = () => {
    sessionGenerationRef.current += 1;
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (useLocalSTT && recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }
    if (isRecording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    }
    setVoiceSessionActive(false);
    setVoiceSessionStatus('idle');
    triggerToast('Voice session ended. Switched to text chat.');
  };

  // Submits patient words inside the voice session
  const sendVoiceSessionMessage = async (text) => {
    if (!text.trim()) return;

    const updatedHistory = [...chatHistory, { role: 'user', content: text }];
    setChatHistory(updatedHistory);
    setVoiceSessionStatus('thinking');
    runLocalAudit(text, chatHistory);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          chatHistory: chatHistory,
          symptomProfile: symptomProfile,
          patientInfo: patientInfo
        })
      });

      const data = await response.json();

      if (data.error) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: `⚠️ System Error: ${data.error}` }]);
        setVoiceSessionActive(false);
        setVoiceSessionStatus('idle');
        return;
      }

      setSymptomProfile(data.symptomProfile);
      setCurrentUrgency(data.urgencyEstimation || 'Unspecified');
      
      const isOverride = !!data.guardrailTriggered;
      setGuardrailTriggered(isOverride);
      
      const replyText = isOverride ? data.message : data.nextQuestion;
      
      if (isOverride) {
        setGuardrailReason(data.guardrailReason || '');
        setGuardrailMessage(data.message || '');
        setChatHistory(prev => [...prev, { role: 'assistant', content: data.message }]);
        setVoiceSessionStatus('speaking');
        await speakTextSession(replyText, true);
      } else {
        if (replyText) {
          setChatHistory(prev => [...prev, { role: 'assistant', content: replyText }]);
          setVoiceSessionStatus('speaking');
          await speakTextSession(replyText, false);
        } else {
          setVoiceSessionActive(false);
          setVoiceSessionStatus('idle');
          switchTab('tab-pathway');
        }
      }

    } catch (err) {
      console.error(err);
      setVoiceSessionStatus('listening');
      triggerToast('⚠️ Server connection error.');
    }
  };

  // Safety checker client logs preview
  // Negation-aware keyword matcher. Mirrors the server-side helper in
  // route.js so the Guardrails tab stays in sync with the Vertex AI override
  // decision. A keyword is "positive" only if at least one occurrence sits
  // inside a sentence that has no preceding negation cue within 35 chars.
  const NEGATION_CUES = [
    'no ', 'no,', 'no.', 'no!', 'no?', '\nno ',
    'not ', "n't ", "n't,", "n't.", "n't!", "n't?",
    'without ', 'denies ', 'deny ', 'denied ', 'never ',
    'no signs of ', 'negative for '
  ];
  const SENTENCE_BOUNDARY_REGEX = /[.!?]\s+[A-Z]|[.!?]\s*$/;
  const isKeywordPositive = (text, keywords) => {
    if (!text) return false;
    const t = text.toLowerCase();
    for (const kw of keywords) {
      if (!kw) continue;
      let idx = 0;
      while ((idx = t.indexOf(kw, idx)) !== -1) {
        const windowStart = Math.max(0, idx - 35);
        const preceding = t.slice(windowStart, idx);
        const crossedBoundary = SENTENCE_BOUNDARY_REGEX.test(preceding);
        if (crossedBoundary) { idx += kw.length; continue; }
        let negated = false;
        for (const cue of NEGATION_CUES) {
          if (preceding.includes(cue)) { negated = true; break; }
        }
        if (!negated) return true;
        idx += kw.length;
      }
    }
    return false;
  };

  const runLocalAudit = (text, history) => {
    // Aggregate the current message with prior user turns so a multi-turn
    // symptom combination (e.g. chest pain this turn, arm pain last turn)
    // surfaces in the audit log just as it would on the server.
    const userTurns = (history || [])
      .filter(m => m && m.role === 'user' && typeof m.content === 'string')
      .map(m => m.content);
    const combined = [userTurns.join(' \n '), text || ''].filter(Boolean).join(' \n ');
    const t = combined.toLowerCase();
    let matched = [];

    // 1. Cardiac check
    const hasChestPain = t.includes('chest pain') || t.includes('heart pain') || t.includes('angina');
    const hasRadiating = isKeywordPositive(t, [
      'arm pain', 'pain in arm', 'pain radiating', 'shoulder pain',
      'left arm', 'right arm', 'jaw pain'
    ]);
    const hasCrushing = isKeywordPositive(t, ['crushing', 'pressure', 'tightness']);
    if (hasChestPain && (hasRadiating || hasCrushing)) {
      matched.push("Potential Cardiac Event");
    }

    // 2. Stroke check
    const hasStroke = isKeywordPositive(t, [
      'slurred', 'slur', 'speech', 'drooping', 'droop',
      'face numb', 'arm weakness',
      'weakness on one side', 'numbness on one side', 'stroke', 'face drooping'
    ]);
    if (hasStroke) {
      matched.push("Potential Stroke (FAST)");
    }

    // 3. Thunderclap Headache check
    const isHeadache = t.includes('headache') || t.includes('migraine');
    const isSudden = isKeywordPositive(t, ['sudden', 'worst', 'thunderclap', 'exploding']);
    if (isHeadache && isSudden) {
      matched.push("Potential Thunderclap Headache");
    }

    // 4. Breathing check
    const isBreathing = isKeywordPositive(t, [
      'shortness of breath', 'difficulty breathing', "can't breathe", 'cant breathe',
      'struggling to breathe', 'gasping'
    ]);
    if (isBreathing) {
      matched.push("Potential Respiratory Distress");
    }

    const timestamp = new Date().toLocaleTimeString();
    const entry = {
      timestamp: timestamp,
      dialogueSnippet: text.length > 55 ? text.substring(0, 52) + "..." : text,
      matchedRules: matched.length > 0 ? matched.join(', ') : 'None matched',
      status: matched.length > 0 ? 'AUDIT OVERRIDE' : 'Audit Clear'
    };

    setSafetyAuditLogs(prev => [...prev, entry]);
  };

  // Message Send Controller
  const sendMessage = async (text) => {
    if (!text.trim()) return;

    // Append user message to log
    const userMsg = { role: 'user', content: text };
    if (selectedImage) {
      userMsg.image = selectedImage.base64;
      userMsg.imageMime = selectedImage.mimeType;
    }
    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);

    const activeImage = selectedImage;
    setSelectedImage(null);

    setUserInput('');
    setIsTyping(true);

    // Write audit log entry
    runLocalAudit(text, chatHistory);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          chatHistory: chatHistory,
          symptomProfile: symptomProfile,
          patientInfo: patientInfo,
          image: activeImage?.base64 || null,
          imageMime: activeImage?.mimeType || null
        })
      });

      const data = await response.json();
      setIsTyping(false);

      if (data.error) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: `⚠️ System Error: ${data.error}` }]);
        return;
      }

      // Sync state with backend response
      setSymptomProfile(data.symptomProfile);
      setCurrentUrgency(data.urgencyEstimation || 'Unspecified');
      
      const isOverride = !!data.guardrailTriggered;
      setGuardrailTriggered(isOverride);
      
      if (isOverride) {
        setGuardrailReason(data.guardrailReason || '');
        setGuardrailMessage(data.message || '');
        setChatHistory(prev => [...prev, { role: 'assistant', content: data.message }]);
        triggerToast("🚨 Safety override triggered! Auto-routing to Triage...");
        
        if (voiceEnabled) {
          speakText(data.message);
        }

        // Auto routing to Triage & Pathway
        setTimeout(() => {
          switchTab('tab-pathway');
        }, 1200);
      } else {
        if (data.nextQuestion) {
          setChatHistory(prev => [...prev, { role: 'assistant', content: data.nextQuestion }]);
          if (voiceEnabled) {
            speakText(data.nextQuestion);
          }
        }
      }

    } catch (err) {
      console.error(err);
      setIsTyping(false);
      setChatHistory(prev => [...prev, { role: 'assistant', content: '⚠️ Failed to reach Triage Server API.' }]);
    }
  };

  // Simulates Typing Action for Test Suite Cases
  const runTestSimulation = (text) => {
    handleReset();
    switchTab('tab-chat');

    setTimeout(() => {
      let currentString = '';
      let index = 0;
      const interval = setInterval(() => {
        if (index < text.length) {
          currentString += text[index];
          setUserInput(currentString);
          index++;
        } else {
          clearInterval(interval);
          setTimeout(() => {
            sendMessage(text);
          }, 300);
        }
      }, 10);
    }, 500);
  };

  // Compiles report details
  const compileReport = async () => {
    switchTab('tab-pathway');
    setIsCompilingSummary(true);

    try {
      const response = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatHistory: chatHistory,
          symptomProfile: symptomProfile,
          patientInfo: patientInfo
        })
      });

      const data = await response.json();
      setIsCompilingSummary(false);

      if (data.error) {
        triggerToast(`⚠️ Summary generation failed: ${data.error}`);
        return;
      }

      setSummaryReport(data);
      triggerToast('✅ Clinician Handover Report compiled.');

    } catch (err) {
      console.error(err);
      setIsCompilingSummary(false);
      triggerToast('⚠️ Server connection error.');
    }
  };

  // Copy clinician handover text
  const copyHandoverText = () => {
    if (!summaryReport?.pathwayGuidance?.whatToTellProvider) return;
    const script = summaryReport.pathwayGuidance.whatToTellProvider;
    navigator.clipboard.writeText(script).then(() => {
      triggerToast('✅ Clinician Handover Script copied to clipboard!');
    }).catch(() => {
      triggerToast('⚠️ Clipboard copy failed.');
    });
  };

  // Render variables
  const activeUrgencyGuide = urgencyGuidelines[currentUrgency] || urgencyGuidelines['Unspecified'];
  
  // Progress tracker active state step check
  const getProgressState = () => {
    if (activeTab === 'tab-pathway' && summaryReport) return 'summary';
    if (currentUrgency !== 'Unspecified' || guardrailTriggered) return 'triage';
    if (chatHistory.length > 2) return 'clarifying';
    return 'intake';
  };
  const activeProgressStep = getProgressState();

  const getProfileCompletion = () => {
    let score = 0;
    if (symptomProfile.primaryComplaint && symptomProfile.primaryComplaint !== 'No symptoms reported yet') score += 20;
    if (symptomProfile.duration && symptomProfile.duration !== 'N/A' && symptomProfile.duration !== '') score += 20;
    if (symptomProfile.severity && symptomProfile.severity !== 'N/A' && symptomProfile.severity !== 'Unspecified' && symptomProfile.severity !== '') score += 20;
    if (symptomProfile.associatedSymptoms && symptomProfile.associatedSymptoms.length > 0) score += 20;
    if (symptomProfile.history && symptomProfile.history !== 'None declared' && symptomProfile.history !== '') score += 20;
    return score;
  };
  const profileCompletion = getProfileCompletion();

  return (
    <>
      {!isCheckedIn && (
        <div className="checkin-overlay">
          <div className="checkin-modal">
            <div className="checkin-header">
              <h2>AEGIS Patient Intake</h2>
              <p>Please complete check-in registration to begin clinical triage.</p>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (!checkInInput.name.trim()) return;
              setPatientInfo(checkInInput);
              setSymptomProfile(prev => ({
                ...prev,
                history: checkInInput.preExistingHistory || ''
              }));
              setIsCheckedIn(true);
              try {
                localStorage.setItem('aegis_patient_info', JSON.stringify(checkInInput));
              } catch (err) {
                console.error('Failed to save patient info to localStorage', err);
              }
              triggerToast(`Welcome, ${checkInInput.name}. Begin intake dialog.`);
            }}>
              <div className="checkin-body">
                <div className="form-group">
                  <label htmlFor="patient-name-input">Full Name</label>
                  <input 
                    id="patient-name-input"
                    type="text" 
                    placeholder="e.g. Jane Doe" 
                    value={checkInInput.name}
                    onChange={(e) => setCheckInInput(prev => ({ ...prev, name: e.target.value }))}
                    required
                    autoComplete="off"
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label htmlFor="patient-age-input">Age</label>
                    <input 
                      id="patient-age-input"
                      type="number" 
                      placeholder="e.g. 45" 
                      min="0"
                      max="125"
                      value={checkInInput.age}
                      onChange={(e) => setCheckInInput(prev => ({ ...prev, age: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label htmlFor="patient-sex-input">Biological Sex</label>
                    <select 
                      id="patient-sex-input"
                      value={checkInInput.sex}
                      onChange={(e) => setCheckInInput(prev => ({ ...prev, sex: e.target.value }))}
                      required
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other / Intersex</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="patient-history-input">Pre-existing History & Chronic Conditions</label>
                  <textarea 
                    id="patient-history-input"
                    rows="3"
                    placeholder="e.g. Hypertension, Diabetes, Asthma, Heart Stent..." 
                    value={checkInInput.preExistingHistory}
                    onChange={(e) => setCheckInInput(prev => ({ ...prev, preExistingHistory: e.target.value }))}
                  ></textarea>
                </div>
              </div>
              <div className="checkin-footer">
                <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 2.5rem' }}>
                  Complete Check-In
                  <ChevronRight size={16} strokeWidth={2.4} style={{ marginLeft: '0.4rem' }} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="app-layout">
      {/* Toast Notification */}
      <div className={`toast-msg ${showToast ? 'show' : ''}`}>
        {toastMessage}
      </div>

      {/* Top App Bar */}
      <header className="app-topbar">
        <div className="topbar-brand">
          <div className="heartbeat-logo">
            <svg className={`ecg-logo-svg urgency-${currentUrgency.replace(/[\s&]+/g, '-')}`} viewBox="0 0 100 40">
              <path className="ecg-line" d="M0,20 L30,20 L35,10 L40,30 L45,5 L50,35 L55,20 L60,20 L65,15 L70,25 L75,20 L100,20"></path>
            </svg>
          </div>
          <div className="brand-text">
            <h2>AEGIS</h2>
            <span>SAFETY TRIAGE ENGINE</span>
          </div>
        </div>

        <nav className="topbar-nav">
          <div className="topbar-nav-track">
            <div className="topbar-nav-indicator" style={{ transform: `translateX(${['tab-chat','tab-profile','tab-pathway','tab-guardrails','tab-testing'].indexOf(activeTab) * 100}%)` }}></div>
            <button className={`topbar-nav-item ${activeTab === 'tab-chat' ? 'active' : ''}`} onClick={() => switchTab('tab-chat')}>
              <MessageSquare size={16} strokeWidth={2.2} />
              <span>Intake</span>
            </button>
            <button className={`topbar-nav-item ${activeTab === 'tab-profile' ? 'active' : ''}`} onClick={() => switchTab('tab-profile')}>
              <ClipboardList size={16} strokeWidth={2.2} />
              <span>Profile</span>
            </button>
            <button className={`topbar-nav-item ${activeTab === 'tab-pathway' ? 'active' : ''}`} onClick={() => switchTab('tab-pathway')}>
              <Stethoscope size={16} strokeWidth={2.2} />
              <span>Triage</span>
            </button>
            <button className={`topbar-nav-item ${activeTab === 'tab-guardrails' ? 'active' : ''}`} onClick={() => switchTab('tab-guardrails')}>
              <Shield size={16} strokeWidth={2.2} />
              <span>Guardrails</span>
            </button>
            <button className={`topbar-nav-item ${activeTab === 'tab-testing' ? 'active' : ''}`} onClick={() => switchTab('tab-testing')}>
              <Sliders size={16} strokeWidth={2.2} />
              <span>Validation</span>
            </button>
          </div>
        </nav>

        <div className="topbar-right">
          <div className="topbar-status-pill">
            <span className="status-dot green-pulse"></span>
            <span>System Online</span>
          </div>
          <div className="topbar-urgency-pill">
            <Activity size={14} strokeWidth={2.4} />
            <span>{currentUrgency}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="main-content-panel">
        <header className="content-header">
          <div className="header-title-container">
            <span className="tab-indicator-bullet"></span>
            <h1 id="page-title">
              {activeTab === 'tab-chat' && "Symptom Intake Dialogue"}
              {activeTab === 'tab-profile' && "Structured Patient Profile"}
              {activeTab === 'tab-pathway' && "Triage & Pathway Assessment"}
              {activeTab === 'tab-guardrails' && "Safety Auditing Console"}
              {activeTab === 'tab-testing' && "Validation & Verification Deck"}
            </h1>
          </div>

          {/* Progress Tracker */}
          <div className="progress-container">
            <button
              type="button"
              className={`progress-step ${activeProgressStep === 'intake' ? 'active' : 'completed'}`}
              onClick={() => switchTab('tab-chat')}
              title="Go to Intake"
            >
              <span className="step-num">1</span>
              <span className="step-label">Intake</span>
            </button>
            <div className={`progress-line ${['clarifying', 'triage', 'summary'].includes(activeProgressStep) ? 'completed' : ''}`}></div>

            <button
              type="button"
              className={`progress-step ${activeProgressStep === 'clarifying' ? 'active' : ['triage', 'summary'].includes(activeProgressStep) ? 'completed' : ''}`}
              onClick={() => switchTab('tab-chat')}
              title="Go to Clarifying Questions"
            >
              <span className="step-num">2</span>
              <span className="step-label">Clarifying</span>
            </button>
            <div className={`progress-line ${['triage', 'summary'].includes(activeProgressStep) ? 'completed' : ''}`}></div>

            <button
              type="button"
              className={`progress-step ${activeProgressStep === 'triage' ? 'active' : activeProgressStep === 'summary' ? 'completed' : ''}`}
              onClick={() => switchTab('tab-pathway')}
              title="Go to Triage Assessment"
            >
              <span className="step-num">3</span>
              <span className="step-label">Triage</span>
            </button>
            <div className={`progress-line ${activeProgressStep === 'summary' ? 'completed' : ''}`}></div>

            <button
              type="button"
              className={`progress-step ${activeProgressStep === 'summary' ? 'active' : ''}`}
              onClick={() => switchTab('tab-pathway')}
              title="Go to Handover Summary"
            >
              <span className="step-num">4</span>
              <span className="step-label">Summary</span>
            </button>
          </div>
        </header>

        <div className="content-body">
          {/* Tab 1: Intake Dialogue Chat */}
          {activeTab === 'tab-chat' && (
            <div className="card glass-card chat-card">
              {voiceSessionActive ? (
                /* Interactive Real-Time Voice Console */
                <div className="voice-session-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '2.5rem', minHeight: '480px', background: 'radial-gradient(circle, rgba(28,28,30,0.65) 0%, rgba(10,10,12,0.95) 100%)', position: 'relative' }}>
                  <button
                    onClick={endVoiceSession}
                    className="btn btn-secondary btn-sm"
                    style={{ position: 'absolute', top: '1.25rem', right: '1.25rem', borderColor: 'rgba(255,255,255,0.1)' }}
                  >
                    <X size={14} strokeWidth={2.4} style={{ marginRight: '0.35rem' }} />
                    Exit Session
                  </button>

                  <span style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1.5rem' }}>
                    Interactive Voice Session
                  </span>

                  <div className="voice-call-indicator-wrapper" style={{ position: 'relative', width: '140px', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem' }}>
                    <div className={`voice-call-ring ${voiceSessionStatus}`} />
                    <div className="voice-call-center">
                      {voiceSessionStatus === 'listening' && <Mic size={36} strokeWidth={1.8} />}
                      {voiceSessionStatus === 'thinking' && <RadioTower size={36} strokeWidth={1.8} />}
                      {voiceSessionStatus === 'speaking' && <Volume2 size={36} strokeWidth={1.8} />}
                    </div>
                  </div>

                  <h4 style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                    {voiceSessionStatus === 'listening' && 'Listening to symptoms...'}
                    {voiceSessionStatus === 'thinking' && 'Clinical evaluation in progress...'}
                    {voiceSessionStatus === 'speaking' && 'Clinical Agent speaking...'}
                  </h4>

                  <div style={{ maxWidth: '85%', textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.25rem 1.5rem', marginBottom: '2rem', minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ fontSize: '0.85rem', lineHeight: '1.6', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      "{chatHistory[chatHistory.length - 1]?.content}"
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    {voiceSessionStatus === 'listening' && (
                      <button
                        onClick={() => stopRecording(true)}
                        className="btn btn-primary"
                        style={{ padding: '0.75rem 2rem', borderRadius: '50px' }}
                      >
                        Tap when Done Speaking
                        <ChevronRight size={16} strokeWidth={2.4} style={{ marginLeft: '0.4rem' }} />
                      </button>
                    )}
                    {voiceSessionStatus === 'speaking' && (
                      <button
                        onClick={() => {
                          if (currentAudioRef.current) {
                            currentAudioRef.current.pause();
                            currentAudioRef.current = null;
                          }
                          startRecording(true);
                        }}
                        className="btn btn-secondary btn-sm"
                        style={{ borderRadius: '50px' }}
                      >
                        Skip and Speak
                      </button>
                    )}
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {voiceSessionStatus === 'listening' && 'Speak clearly. Tap above when you finish describing.'}
                      {voiceSessionStatus === 'thinking' && 'Verifying clinical safety rules via GCP...'}
                      {voiceSessionStatus === 'speaking' && 'Listening will resume automatically when speak ends.'}
                    </span>
                  </div>
                </div>
              ) : (
                /* Standard Chat Interface */
                <>
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="header-title-group">
                      <span className="pulse-icon"><Stethoscope size={18} strokeWidth={2.2} /></span>
                      <h3>Intake Dialogue Stream</h3>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={startVoiceSession}
                        className="btn btn-primary btn-sm"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                        title="Start hands-free real-time voice triage session"
                      >
                        <Phone size={14} strokeWidth={2.4} style={{ marginRight: '0.35rem' }} />
                        Voice Session
                      </button>
                      <button onClick={handleReset} className="btn btn-secondary btn-sm">
                        <RefreshCw size={13} strokeWidth={2.4} style={{ marginRight: '0.35rem' }} />
                        Reset Intake
                      </button>
                    </div>
                  </div>

                  <div className="chat-messages-container">
                    {chatHistory.map((msg, index) => (
                      <div key={index} className={`message ${msg.role}`}>
                        <div className="message-avatar">
                          {msg.role === 'user' ? <User size={16} strokeWidth={2.2} /> : <HeartPulse size={16} strokeWidth={2.2} />}
                        </div>
                        <div className="message-content" style={{ position: 'relative', paddingRight: msg.role === 'assistant' ? '2.5rem' : '1.1rem' }}>
                          <p>{msg.content}</p>
                          {msg.image && (
                            <div className="message-image-container">
                              <img src={`data:${msg.imageMime};base64,${msg.image}`} alt="Triage Attachment" />
                            </div>
                          )}
                          {msg.role === 'assistant' && (
                            <button
                              className="message-speak-btn"
                              onClick={() => speakText(msg.content)}
                              title="Speak message using GCP text-to-speech"
                            >
                              <Volume2 size={14} strokeWidth={2.2} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {isTyping && (
                      <div className="message assistant">
                        <div className="message-avatar"><HeartPulse size={16} strokeWidth={2.2} /></div>
                        <div className="message-content">
                          <div className="typing-indicator">
                            <span></span><span></span><span></span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Triage Completion Card — surfaces once the AI has set
                        a non-Unspecified urgency and the dialogue has not been
                        intercepted by a safety override. Gives the patient an
                        explicit in-chat hand-off to the care pathway report. */}
                    {currentUrgency !== 'Unspecified' && !guardrailTriggered && (
                      <div className="triage-complete-card" role="status" aria-live="polite">
                        <div className="triage-complete-header">
                          <span className="triage-complete-icon">
                            <CheckCircle2 size={18} strokeWidth={2.4} />
                          </span>
                          <div>
                            <h4>Clinical intake complete</h4>
                            <p>Estimated urgency: <strong>{activeUrgencyGuide.title}</strong></p>
                          </div>
                        </div>
                        <p className="triage-complete-body">
                          Based on your responses, we've drafted a triage assessment.
                          Review your care pathway and clinician handover report below.
                        </p>
                        <div className="triage-complete-actions">
                          <button
                            className="btn btn-primary"
                            onClick={() => { switchTab('tab-pathway'); compileReport(); }}
                            disabled={chatHistory.length < 2}
                          >
                            <FileText size={14} strokeWidth={2.4} style={{ marginRight: '0.4rem' }} />
                            View Care Pathway
                            <ChevronRight size={14} strokeWidth={2.4} style={{ marginLeft: '0.3rem' }} />
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => switchTab('tab-pathway')}
                            title="Open the Triage & Pathway tab"
                          >
                            See pathway only
                          </button>
                        </div>
                      </div>
                    )}

                    <div ref={chatBottomRef}></div>
                  </div>

                  {/* Suggestions Tag Pills */}
                  <div className="chat-suggestions">
                    <button className="suggestion-tag" onClick={() => runTestSimulation(testCases.cardiac)}>Chest & Arm Pain</button>
                    <button className="suggestion-tag" onClick={() => runTestSimulation(testCases.tension_headache)}>Screen Headache</button>
                    <button className="suggestion-tag" onClick={() => runTestSimulation(testCases.cold)}>Mild Cold Symptoms</button>
                  </div>

                  <div className="chat-input-area">
                    {selectedImage && (
                      <div className="image-preview-bar" style={{ marginBottom: '0.75rem', borderRadius: '8px' }}>
                        <div className="image-preview-thumbnail">
                          <img src={`data:${selectedImage.mimeType};base64,${selectedImage.base64}`} alt="Selected Preview" />
                          <button type="button" className="image-preview-remove" onClick={() => setSelectedImage(null)}>
                            <X size={10} strokeWidth={2.6} />
                          </button>
                        </div>
                        <div className="image-preview-info">
                          <span className="filename">{selectedImage.fileName}</span>
                          <span className="filesize">{selectedImage.fileSize}</span>
                        </div>
                      </div>
                    )}
                    <form onSubmit={(e) => { e.preventDefault(); sendMessage(userInput); }}>
                      <div className="chat-input-row input-row">
                        <input
                          type="text"
                          value={userInput}
                          onChange={(e) => setUserInput(e.target.value)}
                          placeholder={selectedImage ? "Add description or click Analyze..." : "Describe symptoms, severity, and duration..."}
                          disabled={isTyping || isRecording}
                          required={!selectedImage}
                          autoComplete="off"
                        />
                      </div>
                      <div className="chat-input-row action-row">
                        <button
                          type="button"
                          onClick={isRecording ? () => stopRecording(false) : () => startRecording(false)}
                          className={`btn ${isRecording ? 'btn-danger-recording' : 'btn-secondary'}`}
                          style={{ padding: '0.55rem 0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '42px' }}
                          disabled={isTyping}
                          title={isRecording ? 'Stop Recording' : 'Record symptoms via voice'}
                        >
                          {isRecording ? <MicOff size={15} strokeWidth={2.4} /> : <Mic size={15} strokeWidth={2.4} />}
                        </button>

                        <label
                          className="btn-upload-label"
                          title="Upload clinical image (e.g. rash, cut, swelling)"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '42px' }}
                        >
                          <ImageIcon size={15} strokeWidth={2.2} />
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  const base64 = reader.result.split(',')[1];
                                  const fileSizeKb = (file.size / 1024).toFixed(1) + ' KB';
                                  setSelectedImage({
                                    base64,
                                    mimeType: file.type,
                                    fileName: file.name,
                                    fileSize: fileSizeKb
                                  });
                                  triggerToast('📷 Skin/triage image attached.');
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>

                        <div style={{ flex: 1 }} />

                        <button type="submit" className="btn btn-primary" disabled={isTyping || isRecording || (!userInput.trim() && !selectedImage)}>
                          <span style={{ marginRight: '0.35rem' }}>Analyze</span>
                          <Send size={13} strokeWidth={2.4} />
                        </button>
                      </div>
                    </form>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab 2: Structured Patient Profile */}
          {activeTab === 'tab-profile' && (
            <div className="card glass-card profile-card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="header-title-group">
                  <span className="pulse-icon"><ClipboardList size={18} strokeWidth={2.2} /></span>
                  <h3>Structured Patient Profile (Live Data Model)</h3>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      try {
                        localStorage.removeItem('aegis_patient_info');
                      } catch (err) {
                        console.error(err);
                      }
                      setIsCheckedIn(false);
                      setPatientInfo({ name: '', age: '', sex: 'Male', preExistingHistory: '' });
                      setCheckInInput({ name: '', age: '', sex: 'Male', preExistingHistory: '' });
                      triggerToast('Patient checked out successfully.');
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                  >
                    <LogOut size={13} strokeWidth={2.4} style={{ marginRight: '0.35rem' }} />
                    Switch Patient
                  </button>
                  <div className="profile-completion-meter" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)' }}>Intake Progress:</span>
                    <div className="progress-bar-bg" style={{ width: '100px', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div className="progress-bar-fill" style={{ width: `${profileCompletion}%`, height: '100%', background: 'var(--color-self-care)', transition: 'width 0.4s ease' }}></div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--color-self-care)' }}>{profileCompletion}%</span>
                  </div>
                </div>
              </div>

              <div className="profile-dashboard-grid">
                <div className="profile-dashboard-item patient-name">
                  <div className="item-icon"><User size={20} strokeWidth={2} /></div>
                  <div className="item-text">
                    <span className="label">Patient Name</span>
                    <p className="value">{patientInfo.name || 'Anonymous'}</p>
                  </div>
                </div>

                <div className="profile-dashboard-item patient-demographics">
                  <div className="item-icon"><Cake size={20} strokeWidth={2} /></div>
                  <div className="item-text">
                    <span className="label">Age / Biological Sex</span>
                    <p className="value">{patientInfo.age ? `${patientInfo.age} yrs` : 'Unknown'} / {patientInfo.sex || 'Unknown'}</p>
                  </div>
                </div>

                <div className="profile-dashboard-item complaint">
                  <div className="item-icon"><Stethoscope size={20} strokeWidth={2} /></div>
                  <div className="item-text">
                    <span className="label">Primary Complaint Summary</span>
                    <p className="value">{symptomProfile.primaryComplaint || 'No symptoms reported yet'}</p>
                  </div>
                </div>

                <div className="profile-dashboard-item duration">
                  <div className="item-icon"><Clock size={20} strokeWidth={2} /></div>
                  <div className="item-text">
                    <span className="label">Symptom Timeline / Duration</span>
                    <p className="value">{symptomProfile.duration || 'N/A'}</p>
                  </div>
                </div>

                <div className="profile-dashboard-item severity">
                  <div className="item-icon"><Zap size={20} strokeWidth={2} /></div>
                  <div className="item-text">
                    <span className="label">Estimated Severity</span>
                    <p className="value">{symptomProfile.severity || 'N/A'}</p>
                  </div>
                </div>

                <div className="profile-dashboard-item history">
                  <div className="item-icon"><ScrollText size={20} strokeWidth={2} /></div>
                  <div className="item-text">
                    <span className="label">Relevant Medical History</span>
                    <p className="value">{symptomProfile.history || 'None declared'}</p>
                  </div>
                </div>

                <div className="profile-dashboard-item symptoms full-width">
                  <div className="item-icon"><Tags size={20} strokeWidth={2} /></div>
                  <div className="item-text">
                    <span className="label">Tracked Associated Symptoms Map</span>
                    <div className="tags-container">
                      {symptomProfile.associatedSymptoms?.length > 0 ? (
                        symptomProfile.associatedSymptoms.map((sym, index) => (
                          <span key={index} className="tag">{sym}</span>
                        ))
                      ) : (
                        <span className="no-tags">No secondary symptoms reported.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Triage & Pathway Assessment */}
          {activeTab === 'tab-pathway' && (
            <div className="pathway-view-layout">
              {/* Left Column: Triage Status Card */}
              <div className="pathway-left-panel">
                <div className="card glass-card status-evaluation-card">
                  <span className="sub-label">TRIAGE ASSESSMENT TIER</span>
                  <div className="status-badge-wrapper">
                    <div className={`status-badge-ring ${activeUrgencyGuide.badgeClass}`}>
                      {currentUrgency.toUpperCase()}
                    </div>
                    <div className="glow-sphere"></div>
                  </div>
                  <h2>{activeUrgencyGuide.title}</h2>
                  <p>{activeUrgencyGuide.description}</p>

                  {activeUrgencyGuide.whatToDo && (
                    <div className="pathway-inline-guidance">
                      <div className="pathway-inline-section do-section">
                        <h4><ListChecks size={13} strokeWidth={2.4} style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />What to do now</h4>
                        <p>{activeUrgencyGuide.whatToDo}</p>
                      </div>
                      {activeUrgencyGuide.redFlags && activeUrgencyGuide.redFlags.length > 0 && (
                        <div className="pathway-inline-section redflag-section">
                          <h4><AlertOctagon size={13} strokeWidth={2.4} style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />Red flag warnings</h4>
                          <ul>
                            {activeUrgencyGuide.redFlags.map((flag, idx) => (
                              <li key={idx}>{flag}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={compileReport}
                  className="btn btn-primary btn-full-width"
                  disabled={chatHistory.length < 2 || isCompilingSummary}
                >
                  {isCompilingSummary ? (
                    <>
                      <span className="compiling-spinner"></span>
                      Compiling Report...
                    </>
                  ) : (
                    <>
                      <FileText size={15} strokeWidth={2.4} style={{ marginRight: '0.5rem' }} />
                      Compile Clinician Report
                    </>
                  )}
                </button>
              </div>

              {/* Right Column: Handover Chart Page */}
              <div className="pathway-right-panel">
                <div className="card glass-card handover-report-card">
                  <div className="card-header">
                    <div className="header-title-group">
                      <span className="pulse-icon"><FileText size={18} strokeWidth={2.2} /></span>
                      <h3>Structured Handover Report</h3>
                    </div>
                    {summaryReport && (
                      <div className="report-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={copyHandoverText}>
                          <Copy size={13} strokeWidth={2.4} style={{ marginRight: '0.35rem' }} />
                          Copy Script
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
                          <Printer size={13} strokeWidth={2.4} style={{ marginRight: '0.35rem' }} />
                          Print Report
                        </button>
                      </div>
                    )}
                  </div>

                  {isCompilingSummary ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px' }}>
                      <div className="typing-indicator" style={{ transform: 'scale(1.5)', marginBottom: '1rem' }}>
                        <span></span><span></span><span></span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Compiling Triage Handover Chart via Vertex AI...</p>
                    </div>
                  ) : summaryReport ? (
                    <div className="report-paper">
                      <div className="report-meta">
                        <div className="report-meta-item">
                          <span className="label">Clinical Urgency Tier</span>
                          <span className={`value badge ${activeUrgencyGuide.badgeClass}`} style={{ marginTop: '0.25rem' }}>{summaryReport.urgency}</span>
                        </div>
                        <div className="report-meta-item">
                          <span className="label">Date & Time</span>
                          <span className="value">{new Date().toLocaleString()}</span>
                        </div>
                        <div className="report-meta-item">
                          <span className="label">Triage Authority</span>
                          <span className="value">Aegis AI System</span>
                        </div>
                      </div>

                      <div className="report-section">
                        <h3>Patient Demographics</h3>
                        <table>
                          <tbody>
                            <tr>
                              <td style={{ fontWeight: '700', width: '30%', color: '#4a5568' }}>Full Name</td>
                              <td>{patientInfo.name || 'Anonymous'}</td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: '700', color: '#4a5568' }}>Age / Biological Sex</td>
                              <td>{patientInfo.age ? `${patientInfo.age} yrs` : 'Unknown'} / {patientInfo.sex || 'Unknown'}</td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: '700', color: '#4a5568' }}>Pre-existing History</td>
                              <td>{patientInfo.preExistingHistory || 'None declared'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="report-section">
                        <h3>1. Clinical Presentation Summary</h3>
                        <table>
                          <tbody>
                            <tr>
                              <td style={{ fontWeight: '700', width: '30%', color: '#4a5568' }}>Presenting Complaint</td>
                              <td>{summaryReport.summary.presentingComplaint}</td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: '700', color: '#4a5568' }}>Timeline & Duration</td>
                              <td>{summaryReport.summary.symptomTimeline}</td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: '700', color: '#4a5568' }}>Associated Symptoms</td>
                              <td>
                                {summaryReport.summary.associatedSymptoms.map((sym, index) => (
                                  <span key={index} className="tag" style={{ marginRight: '0.25rem' }}>{sym}</span>
                                ))}
                              </td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: '700', color: '#4a5568' }}>Medical History</td>
                              <td>{summaryReport.summary.medicalHistory || 'None declared'}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="report-section">
                        <h3>2. Clinical Logic & Assessment</h3>
                        <p style={{ marginBottom: '0.75rem', lineHeight: '1.6', fontSize: '0.85rem', color: '#2d3748' }}>{summaryReport.summary.clinicalUrgencyAssessment}</p>
                        <div style={{ background: '#f7fafc', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                          <strong style={{ color: '#2d3748' }}>Clinical Triage Reasoning:</strong><br />
                          <span style={{ color: '#4a5568', lineHeight: '1.6', display: 'block', marginTop: '0.25rem' }}>{summaryReport.reasoning}</span>
                        </div>
                      </div>

                      <div className="report-section">
                        <h3>3. Action Plan & Pathway Guidance</h3>
                        <div style={{ marginBottom: '1.25rem' }}>
                          <h4 style={{ fontSize: '0.85rem', color: '#2d3748', marginBottom: '0.25rem', fontWeight: '700' }}>Patient Guidance Plan:</h4>
                          <p style={{ lineHeight: '1.6', fontSize: '0.85rem', color: '#4a5568' }}>{summaryReport.pathwayGuidance.whatToDo}</p>
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                          <h4 style={{ fontSize: '0.85rem', color: '#2d3748', marginBottom: '0.25rem', fontWeight: '700' }}>Patient Handover Script (Read to Clinician):</h4>
                          <blockquote id="provider-handover-script" style={{ borderLeft: '3px solid #3182ce', padding: '0.6rem 0.85rem', background: '#ebf8ff', color: '#2b6cb0', fontStyle: 'italic', fontSize: '0.85rem', borderRadius: '0 8px 8px 0', lineHeight: '1.5', marginTop: '0.25rem' }}>
                            "{summaryReport.pathwayGuidance.whatToTellProvider}"
                          </blockquote>
                        </div>

                        <div>
                          <h4 style={{ fontSize: '0.85rem', color: '#c53030', marginBottom: '0.25rem', fontWeight: '700' }}>Red Flag Warnings to Monitor:</h4>
                          <ul style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#c53030', lineHeight: '1.6' }}>
                            {summaryReport.pathwayGuidance.redFlags.map((rf, idx) => (
                              <li key={idx} style={{ marginBottom: '0.25rem' }}>{rf}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="handover-report-placeholder">
                      <div className="placeholder-content">
                        <FileText size={48} strokeWidth={1.2} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
                        <p>Clinical report has not been compiled yet.</p>
                        <small>Complete the symptoms intake dialogue, then click the Compile button on the left to review triage pathway reasoning.</small>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Safety Guardrails Monitoring Tab */}
          {activeTab === 'tab-guardrails' && (
            <div className="guardrails-dashboard-layout">
              <div className="card glass-card active-safety-card">
                <div className="card-header">
                  <div className="header-title-group">
                    <span className="pulse-icon"><Shield size={18} strokeWidth={2.2} /></span>
                    <h3>Hardcoded Safety Override Status</h3>
                  </div>
                </div>
                <div className="safety-dashboard-content">
                  <div className={`guardrail-banner ${guardrailTriggered ? 'danger' : 'safe'}`}>
                    <div className="guardrail-pulse-indicator"></div>
                    <div className="guardrail-content">
                      <h4>
                        {guardrailTriggered
                          ? <AlertOctagon size={14} strokeWidth={2.4} style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />
                          : <CheckCircle2 size={14} strokeWidth={2.4} style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />
                        }
                        Clinical Auditing Engine
                      </h4>
                      <p>{guardrailTriggered ? `CRITICAL TRIGGER: ${guardrailReason}` : 'Active monitoring. No override indicators detected in user dialogue.'}</p>
                    </div>
                  </div>

                  <div className="guardrails-checklist">
                    <h5>Audited Clinical Indicators</h5>
                    <div className="checklist-item">
                      <span className={`status-dot-indicator ${guardrailTriggered && guardrailReason.includes('Cardiac') ? 'danger' : 'safe'}`}></span>
                      <span className="rule-name">Cardiac Event (Chest Pain + Arm/Jaw Pain or Crushing Pressure)</span>
                    </div>
                    <div className="checklist-item">
                      <span className={`status-dot-indicator ${guardrailTriggered && guardrailReason.includes('Stroke') ? 'danger' : 'safe'}`}></span>
                      <span className="rule-name">Stroke FAST (Face Drooping, Arm Weakness, Slurred Speech)</span>
                    </div>
                    <div className="checklist-item">
                      <span className={`status-dot-indicator ${guardrailTriggered && guardrailReason.includes('Thunderclap') ? 'danger' : 'safe'}`}></span>
                      <span className="rule-name">Thunderclap Headache (Sudden Onset 'Worst Ever' Headache)</span>
                    </div>
                    <div className="checklist-item">
                      <span className={`status-dot-indicator ${guardrailTriggered && guardrailReason.includes('Respiratory') ? 'danger' : 'safe'}`}></span>
                      <span className="rule-name">Respiratory Distress (Severe Shortness of Breath)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Safety Audit Logs */}
              <div className="card glass-card audit-logs-card">
                <div className="card-header">
                  <div className="header-title-group">
                    <span className="pulse-icon"><ScrollText size={18} strokeWidth={2.2} /></span>
                    <h3>Safety Engine Real-Time Audit Logs</h3>
                  </div>
                </div>
                <div className="audit-logs-container">
                  {safetyAuditLogs.length > 0 ? (
                    safetyAuditLogs.map((log, index) => (
                      <div key={index} className={`audit-log-item ${log.status === 'AUDIT OVERRIDE' ? 'hit' : ''}`}>
                        <div className="log-meta">
                          <span>Timestamp: {log.timestamp}</span>
                          <span>Status: {log.status}</span>
                        </div>
                        <div className="log-msg">
                          <strong>Dialogue:</strong> "{log.dialogueSnippet}"<br />
                          <strong>Rules Audited:</strong> {log.matchedRules}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="log-placeholder">
                      <p>Awaiting clinical dialogue to write logs...</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: Validation Suite */}
          {activeTab === 'tab-testing' && (
            <div className="card glass-card test-deck-card">
              <div className="card-header">
                <div className="header-title-group">
                  <span className="pulse-icon"><Sliders size={18} strokeWidth={2.2} /></span>
                  <h3>Differential Verification Console</h3>
                </div>
                <span className="badge badge-info">Evaluation Deck</span>
              </div>

              <p className="section-description">Select from the structured symptom pairs below. The application will simulate the dialogue input, run checks through the safety override logic, evaluate clinical urgency via Vertex AI, and update the panels.</p>

              <div className="differential-tests-container">
                {/* Pair 1: Chest Pain */}
                <div className="differential-card">
                  <h4>Symptom Group 1: Chest Pain Diagnosis</h4>
                  <p className="diff-desc">Cardiac ischemia presents with radiating pain. Atypical chest pain post-cold lacks arm pain/crushing descriptors.</p>
                  <div className="diff-actions">
                    <div className="test-item danger-group">
                      <div className="test-meta">
                        <strong>Cardiac Emergency</strong>
                        <small>Symptom: Chest pain radiating to left arm</small>
                        <span className="expected-badge red">Expected: EMERGENCY NOW</span>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => runTestSimulation(testCases.cardiac)}>
                        <PlayCircle size={13} strokeWidth={2.4} style={{ marginRight: '0.35rem' }} />
                        Simulate Cardiac Test
                      </button>
                    </div>
                    <div className="test-item warning-group">
                      <div className="test-meta">
                        <strong>Atypical Chest Pain</strong>
                        <small>Symptom: Sharp chest pain when coughing</small>
                        <span className="expected-badge yellow">Expected: GP Urgent / GP Routine</span>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => runTestSimulation(testCases.atypical_chest_pain)}>
                        <PlayCircle size={13} strokeWidth={2.4} style={{ marginRight: '0.35rem' }} />
                        Simulate Atypical Test
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pair 2: Headaches */}
                <div className="differential-card">
                  <h4>Symptom Group 2: Headache Assessment</h4>
                  <p className="diff-desc">A sudden onset 'thunderclap' headache suggests vascular events. A slow, dull screen tension headache is low risk.</p>
                  <div className="diff-actions">
                    <div className="test-item danger-group">
                      <div className="test-meta">
                        <strong>Thunderclap Headache</strong>
                        <small>Symptom: Instant onset, worst-ever pain</small>
                        <span className="expected-badge red">Expected: EMERGENCY NOW</span>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => runTestSimulation(testCases.thunderclap)}>
                        <PlayCircle size={13} strokeWidth={2.4} style={{ marginRight: '0.35rem' }} />
                        Simulate Thunderclap Test
                      </button>
                    </div>
                    <div className="test-item routine-group">
                      <div className="test-meta">
                        <strong>Tension Headache</strong>
                        <small>Symptom: Mild gradual pain after work</small>
                        <span className="expected-badge blue">Expected: GP Routine / Self-Care</span>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => runTestSimulation(testCases.tension_headache)}>
                        <PlayCircle size={13} strokeWidth={2.4} style={{ marginRight: '0.35rem' }} />
                        Simulate Tension Test
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pair 3: Stroke and Respiratory */}
                <div className="differential-card">
                  <h4>Symptom Group 3: Stroke Screening & Respiratory</h4>
                  <p className="diff-desc">Speech slurring and localized facial numbness are immediate stroke triggers. Minor cold congestion is self-care.</p>
                  <div className="diff-actions">
                    <div className="test-item danger-group">
                      <div className="test-meta">
                        <strong>Stroke FAST</strong>
                        <small>Symptom: Sudden facial droop & slurred speech</small>
                        <span className="expected-badge red">Expected: EMERGENCY NOW</span>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => runTestSimulation(testCases.stroke)}>
                        <PlayCircle size={13} strokeWidth={2.4} style={{ marginRight: '0.35rem' }} />
                        Simulate Stroke Test
                      </button>
                    </div>
                    <div className="test-item green-group">
                      <div className="test-meta">
                        <strong>Mild Cold Symptoms</strong>
                        <small>Symptom: Runny nose, scratchy throat</small>
                        <span className="expected-badge green">Expected: Self-Care</span>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => runTestSimulation(testCases.cold)}>
                        <PlayCircle size={13} strokeWidth={2.4} style={{ marginRight: '0.35rem' }} />
                        Simulate Cold Test
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}
