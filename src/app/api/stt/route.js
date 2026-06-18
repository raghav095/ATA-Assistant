import { NextResponse } from 'next/server';
import { SpeechClient } from '@google-cloud/speech';
import { getAuthOptions } from '../auth-helper';

const auth = getAuthOptions();

let speechClient;
try {
  const clientOpts = { projectId: auth.projectId };
  if (auth.credentials) {
    clientOpts.credentials = auth.credentials;
  }
  speechClient = new SpeechClient(clientOpts);
} catch (err) {
  console.error('STT initialization error:', err);
}

export async function POST(request) {
  try {
    const { audioContent, mimeType, languageCode } = await request.json();
    if (!audioContent) {
      return NextResponse.json({ error: 'Audio content (base64) is required.' }, { status: 400 });
    }

    if (!speechClient) {
      return NextResponse.json({ error: 'STT Client not initialized.', useBrowserFallback: true }, { status: 500 });
    }

    // Adaptive encoding configuration based on browser media recorder mime type
    let gcpEncoding = 'WEBM_OPUS';
    let configPayload = {
      languageCode: languageCode || 'en-US',
      alternativeLanguageCodes: ['hi-IN']
    };

    const mime = (mimeType || '').toLowerCase();
    if (mime.includes('webm')) {
      configPayload.encoding = 'WEBM_OPUS';
      configPayload.sampleRateHertz = 48000;
    } else {
      // For MP4, M4A, AAC (common in Safari/iOS), we use ENCODING_UNSPECIFIED.
      // Google Cloud STT can auto-detect the container headers for these formats.
      configPayload.encoding = 'ENCODING_UNSPECIFIED';
    }

    const sttRequest = {
      audio: { content: audioContent },
      config: configPayload,
    };

    const [response] = await speechClient.recognize(sttRequest);
    
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    return NextResponse.json({ text: transcription || '' });
  } catch (error) {
    console.error('API STT Route Error:', error);
    return NextResponse.json({ error: 'Failed to transcribe speech.', details: error.message, useBrowserFallback: true }, { status: 500 });
  }
}
