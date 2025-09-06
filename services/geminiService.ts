
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

    const colorizeInstruction = shouldColorize ? " If the image is black and white or has poor colors, colorize it realistically and vibrantly." : "";

    if (referenceFrameBase64) {
        const referenceImagePart = base64ToGenerativePart(referenceFrameBase64, "image/jpeg");
        imageParts.push(referenceImagePart);
        prompt = `You are given two images. The first is the primary image to be enhanced. The second is a reference image.
        
        **Your task:** Enhance the primary image to the highest possible quality. Perform deblurring, improve sharpness, increase details, and upscale the resolution.${colorizeInstruction}
        
        **Strict Consistency Rules:**
        - You MUST use the second image as a strict reference for the person's appearance.
        - The person's facial features, clothing, and the overall color palette in your output MUST be consistent with the reference image.
        - Do not add, remove, or change any objects. Do not merge the two images.
        
        Do not add any text, logos, or watermarks. Only return the final, enhanced image.`;
    } else {
        prompt = `Enhance this image to the highest possible quality. Perform deblurring, improve sharpness, increase details, and upscale the resolution.${colorizeInstruction} Do not add any text, logos, or watermarks to the image. Only return the final image.`;
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
