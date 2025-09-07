

import { GoogleGenAI, Modality } from "@google/genai";
import type { Gender } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const base64ToGenerativePart = (base64Data: string, mimeType: string) => {
  return {
    inlineData: {
      data: base64Data.split(",")[1],
      mimeType,
    },
  };
};

export const filterFrameByGender = async (base64Image: string, gender: Gender): Promise<boolean> => {
  if (gender === 'All') {
    // If the filter is 'All', we don't need to call the API.
    // We just need to check if there is a prominent face.
    try {
        const model = 'gemini-2.5-flash';
        const prompt = `Analyze the image and determine if it contains a prominent human face. Respond with only one word: 'Yes' or 'No'.`;
        
        const imagePart = base64ToGenerativePart(base64Image, "image/jpeg");

        const response = await ai.models.generateContent({
          model,
          contents: { parts: [imagePart, { text: prompt }] },
        });

        const resultText = response.text.trim();
        return resultText.toLowerCase() === 'yes';
      } catch (error) {
        console.error('Error in face detection with Gemini:', error);
        return false;
      }
  }

  try {
    const model = 'gemini-2.5-flash';
    const prompt = `Analyze the image and determine if it contains a prominent human face. If it does, identify the gender. Respond with only one word: 'Male', 'Female', or 'None'.`;
    
    const imagePart = base64ToGenerativePart(base64Image, "image/jpeg");

    const response = await ai.models.generateContent({
      model,
      contents: { parts: [imagePart, { text: prompt }] },
    });

    const resultText = response.text.trim();
    return resultText.toLowerCase() === gender.toLowerCase();
  } catch (error) {
    console.error('Error in face filtering with Gemini:', error);
    // To avoid failing the whole batch, we treat an error as a non-match
    return false;
  }
};

export const enhanceImage = async (base64Image: string, referenceFrameBase64: string | undefined, shouldColorize: boolean): Promise<string | null> => {
  try {
    const model = 'gemini-2.5-flash-image-preview';
    
    const imagePart = base64ToGenerativePart(base64Image, "image/jpeg");
    const imageParts = [imagePart];
    let prompt: string;

    const colorizeInstruction = shouldColorize 
      ? "If the image is black and white or has faded colors, perform a realistic colorization. Restore natural, vibrant skin tones and colors. If the image already has good color, enhance the existing colors to make them richer and more lifelike."
      : "Do not change the colors of the image.";

    if (referenceFrameBase64) {
        const referenceImagePart = base64ToGenerativePart(referenceFrameBase64, "image/jpeg");
        imageParts.push(referenceImagePart);
        prompt = `You are an expert photo restoration AI. You are given two images: a primary low-quality image to enhance and a high-quality reference image for identity consistency. Your task is to restore the primary image so it looks like it was taken recently with a modern high-resolution DSLR camera.

**Core Objective:** Restore the primary image to a hyper-realistic, modern photograph, ensuring the person's identity perfectly matches the **reference image**.

**CRITICAL RULES - Adhere Strictly:**
1.  **Identity Preservation is Paramount:** The person's identity in the enhanced image MUST PERFECTLY AND IDENTICALLY MATCH the **reference image**. The reference image is the absolute ground truth for their facial structure, features, and unique expressions. DO NOT alter their appearance from the reference.
2.  **Technical Restoration (on the primary image):**
    - **Clarity & Detail:** Sharpen blurry areas, remove all noise and artifacts, restore fine details, and upscale to a high resolution.
    - **Texture:** Restore natural, realistic skin texture, individual hair strands, and eye details without creating a plastic or artificial look.
    - **Lighting & Tones:** Create balanced, natural lighting. The tones should be realistic and appealing.
    - **Color:** ${colorizeInstruction} Adjust colors to be vibrant and lifelike.
    - **Composition:** Render it as a freshly taken portrait with a sharp focus on the face and a soft, natural background blur (bokeh).
3.  **Final Output:**
    - The result must be ONLY the enhanced primary image. It must not be a merge or composite of the two images.
    - The final image must look like a real, modern photograph, not an AI-generated image.
    - No added text, watermarks, or logos.`;
    } else {
        prompt = `You are an expert photo restoration AI. Your task is to enhance this old photo so it looks like it was taken recently with a modern high-resolution DSLR camera.

**Core Objective:** Restore the image to a hyper-realistic, modern photograph while strictly preserving the person's identity from the original photo.

**CRITICAL RULES - Adhere Strictly:**
1.  **Identity Preservation is Paramount:** Strictly preserve the person’s face resemblance, identity, and natural features from the original image. The goal is restoration, not alteration. DO NOT beautify or change their appearance.
2.  **Technical Restoration:**
    - **Clarity & Detail:** Sharpen blurry areas, remove all noise and artifacts, restore fine details, and upscale to a high resolution.
    - **Texture:** Restore natural, realistic skin texture, individual hair strands, and eye details without creating a plastic or artificial look.
    - **Lighting & Tones:** Create balanced, natural lighting suitable for both daylight and indoor settings. The tones should be realistic and appealing.
    - **Color:** ${colorizeInstruction} Adjust colors to be vibrant and lifelike.
    - **Composition:** Render it as a freshly taken portrait with a sharp focus on the face and a soft, natural background blur (bokeh).
3.  **Final Output:**
    - The result must be ONLY the enhanced image.
    - The final image must look like a real, modern photograph, not an AI-generated image.
    - No added text, watermarks, or logos.`;
    }
    
    const parts = [{ text: prompt }, ...imageParts];

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const mimeType = part.inlineData.mimeType;
        const enhancedBase64 = part.inlineData.data;
        return `data:${mimeType};base64,${enhancedBase64}`;
      }
    }
    return null;
  } catch (error) {
    console.error('Error in image enhancement with Gemini:', error);
    return null;
  }
};