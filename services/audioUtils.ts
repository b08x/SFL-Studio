/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// --- Audio Encoding (Float32 -> Int16 PCM) ---

export function pcmEncode(input: Float32Array) {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
}

export function base64Encode(buffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// --- Audio Decoding (Base64 PCM -> AudioBuffer) ---

export function base64Decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

export function pcmToAudioBuffer(data: Uint8Array, ctx: AudioContext, sampleRate: number = 24000, numChannels: number = 1): AudioBuffer {
    const byteLength = data.byteLength;
    // Ensure 16-bit alignment
    const alignedLength = byteLength - (byteLength % 2);
    const dataInt16 = new Int16Array(data.buffer, data.byteOffset, alignedLength / 2);

    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            // Convert int16 to float32 (-1.0 to 1.0)
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}