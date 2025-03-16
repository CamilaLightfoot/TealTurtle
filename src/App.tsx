import React, { useRef } from "react";
import HandposeDemo from "./components/PoseDetection";

interface AppProps {}

const App: React.FC<AppProps> = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleHandGrab = () => {
    console.log("Grab event triggered!");
  };

  return <HandposeDemo onHandGrab={handleHandGrab} containerRef={containerRef} />;
};

export default App;
