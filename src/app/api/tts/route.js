import { NextResponse } from 'next/server';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { getAuthOptions } from '../auth-helper';

const auth = getAuthOptions();

let ttsClient;
try {
  const clientOpts = { projectId: auth.projectId };
  if (auth.credentials) {
    clientOpts.credentials = auth.credentials;
  }
  ttsClient = new TextToSpeechClient(clientOpts);
} catch (err) {
  console.error('TTS initialization error:', err);
}

export async function POST(request) {
  try {
    const { text } = await request.json();
    if (!text) {
      return NextResponse.json({ error: 'Text is required.' }, { status: 400 });
    }

    if (!ttsClient) {
      return NextResponse.json({ error: 'TTS Client not initialized.' }, { status: 500 });
    }

    const ttsRequest = {
      input: { text },
      voice: { languageCode: 'en-US', name: 'en-US-Wavenet-F' },
      audioConfig: { audioEncoding: 'MP3', pitch: 0, speakingRate: 1.05 },
    };

    const [response] = await ttsClient.synthesizeSpeech(ttsRequest);
    
    if (!response.audioContent) {
      throw new Error('No audio content returned from GCP TTS API.');
    }

    const audioContentBase64 = response.audioContent.toString('base64');
    return NextResponse.json({ audioContent: audioContentBase64 });
  } catch (error) {
    console.error('API TTS Route Error:', error);
    return NextResponse.json({ error: 'Failed to synthesize speech.', details: error.message }, { status: 500 });
  }
}
