import React, { useState, useRef, useEffect } from "react";
import ml5 from "ml5";
import p5 from "p5";

import { useOpenAI } from "./hooks/useOpenAI";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";

// Define the structure of a keypoint
interface Keypoint {
  x: number;
  y: number;
  name: string;
}

// Define the structure of hand tracking results
interface HandDetectionResult {
  keypoints: Keypoint[];
}

interface HandDetectionProps {
  onHandGrab?: (results: HandDetectionResult[]) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

declare global {
  interface Window {
    fingerTips: Keypoint[];
    knuckles: Keypoint[];
  }
}

window.fingerTips = [];
window.knuckles = [];

const HandDetection: React.FC<HandDetectionProps> = ({ onHandGrab, containerRef }) => {
  const [fistClosed, setFistClosed] = useState(false);
  const sketchRef = useRef<p5 | null>(null);
  const [aiResponse, setAiResponse] = useState<string>("");
  const [isAiResponding, setIsAiResponding] = useState(false); // Prevent multiple API calls.
  
  const { fetchAIResponse, isLoading, error } = useOpenAI();
  const { speakText } = useSpeechSynthesis();

  useEffect(() => {
    let handPose: any;
    let video: p5.Element;
    let hands: HandDetectionResult[] = [];
    let recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const startSpeechRecognition = () => {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  
      if (!SpeechRecognition) {
        console.error("❌ Speech recognition is not supported in this browser.");
        return;
      }
  
      recognition = new SpeechRecognition();
      recognition.lang = navigator.language || "en-US";
      recognition.continuous = true; // ✅ Keep listening continuously
      recognition.interimResults = false;
  
      let lastAiResponse = ""; // Prevent AI loops
  
      recognition.onresult = async (event: any) => {
        if (isAiResponding) return; // Prevent capturing AI's own speech
  
        setIsAiResponding(true);
  
        const spokenText = event.results[event.results.length - 1][0].transcript.trim();
        console.log("🎙️ User Said:", spokenText);
  
        // Detect language from spoken text
        const detectedLanguage = await detectLanguage(spokenText);
        console.log(`🌍 Detected Language: ${detectedLanguage}`);
  
        if (spokenText.toLowerCase() === lastAiResponse.toLowerCase()) {
          console.warn("⚠️ Ignoring AI's own response to prevent looping.");
          return;
        }
  
        handleDetectedSpeech(spokenText, detectedLanguage);
      };
  
      recognition.onerror = (error: any) => {
        console.error("⚠️ Speech Recognition Error:", error);
        setTimeout(() => {
          console.log("🔄 Restarting speech recognition after error...");
          recognition?.start();
        }, 2000);
      };
  
      // 🚀 Automatically pause during AI speech
      window.speechSynthesis.addEventListener("start", () => {
        console.log("🛑 Stopping speech recognition while AI is speaking...");
        recognition?.abort();
      });
  
      // ✅ Restart speech recognition after AI finishes speaking
      window.speechSynthesis.addEventListener("end", () => {
        console.log("✅ AI speech finished. Resuming speech recognition...");
        setTimeout(() => {
          recognition?.start();
        }, 4000); // ✅ 4-second delay to avoid AI loops
      });
  
      recognition.start();
    };

    const sketch = (p: p5) => {
      p.setup = () => {
        p.createCanvas(640, 480);
        video = p.createCapture(p.VIDEO);
        video.size(640, 480);
        video.hide(); // Hide the default video element

        // Initialize the handPose model
        handPose = ml5.handPose(video.elt, () => {
          console.log("✅ HandPose Model Loaded");
        });

        // Start detecting hands
        handPose.detectStart(video.elt, gotHands);
      };

      // Check if the hand forms a closed fist
      function isFistClosed(hand: HandDetectionResult) {
        try {
          window.fingerTips = hand.keypoints.filter((point) => point.name.includes("tip"));
          window.knuckles = hand.keypoints.filter((point) => point.name.includes("mcp"));
        } catch (error) {
          return { result: false, points: null };
        }

        if (window.fingerTips.length === 5 && window.knuckles.length === 5) {
          let avgFingerTipsY =
            window.fingerTips.reduce((sum, tip) => sum + tip.y, 0) / window.fingerTips.length;
          let avgKnucklesY =
            window.knuckles.reduce((sum, knuckle) => sum + knuckle.y, 0) / window.knuckles.length;

          //console.log(avgFingerTipsY);
          //console.log(avgKnucklesY);

          if (avgFingerTipsY > avgKnucklesY) {
            let centerX =
              window.fingerTips.reduce((sum, tip) => sum + tip.x, 0) / window.fingerTips.length;
            let centerY = avgFingerTipsY;
            return { result: true, points: { x: centerX, y: centerY } };
          }
        }

        return { result: false, points: null };
      }

      // Callback for when handPose outputs data
      function gotHands(results: HandDetectionResult[]) {
        hands = results;
        let fistStatus = false;
        if (results.length > 0) {
          fistStatus = isFistClosed(results[0]).result;
        }

        // Update the state to trigger UI changes
        setFistClosed(fistStatus);

        // Call the callback if a fist is detected
        if (fistStatus && onHandGrab) {
          onHandGrab(results);
        }
      }

      p.draw = () => {
        // Draw the webcam video onto the canvas
        p.image(video, 0, 0, p.width, p.height);

        // Draw all the tracked hand keypoints
        hands.forEach((hand) => {
          hand.keypoints.forEach((keypoint) => {
            p.fill(0, 255, 0);
            p.noStroke();
            p.circle(keypoint.x, keypoint.y, 10);
          });
        });
      };
    };

    // Instantiate the p5 sketch within the provided containerRef
    if (containerRef.current) {
      sketchRef.current = new p5(sketch, containerRef.current);
    }

    startSpeechRecognition();

    // Cleanup on unmount: remove the p5 sketch and speech recognition.
    return () => {
      if (sketchRef.current) {
        sketchRef.current.remove();
      }
      recognition?.stop();
    };
  }, [containerRef, onHandGrab]);
  
  async function handleDetectedSpeech(spokenText: string, language: string) {
  
    try {
      const aiText = await fetchAIResponse(spokenText);
      setAiResponse(aiText);

      await speakText(aiText, language);
    } catch (error) {
      console.error("Error processing AI response:", error);
    }
  }

  const detectLanguage = async (text: string): Promise<string> => {
    const AZURE_OPENAI_API_KEY = import.meta.env.VITE_AZURE_OPENAI_KEY;
    const AZURE_OPENAI_ENDPOINT = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT;
    const DEPLOYMENT_NAME = import.meta.env.VITE_DEPLOYMENT_NAME;
  
    const response = await fetch(`${AZURE_OPENAI_ENDPOINT}/openai/deployments/${DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_OPENAI_API_KEY,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are a language detection assistant. Identify the language of the given text and return only the language code (e.g., 'en' for English, 'es' for Spanish, 'fr' for French)." },
          { role: "user", content: text }
        ],
        max_tokens: 10
      }),
    });
  
    const data = await response.json();
    return data.choices[0]?.message?.content.trim() || "en"; // Default to English if detection fails
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh", // Full viewport height
        width: "100vw", // Full viewport width
        textAlign: "center",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <h1>Interactive AI for Kids and Hand Grab Demo</h1>
      <h3>AI Response: {aiResponse}</h3>
      
      {/* Centered container for p5.js canvas */}
      <div
        ref={containerRef}
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "500px", // Matches canvas size
          width: "640px",  // Matches canvas width
          position: "relative",
          backgroundColor: "black", // Just for debugging visibility
        }}
      />
      
      {fistClosed && <h3>Fist grabbed!</h3>}
    </div>
  );  
};

export default HandDetection;
