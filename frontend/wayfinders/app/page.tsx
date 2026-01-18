"use client";

import { WayfindingMap } from "@/_components/wayfinding-map";
import { useState, useEffect } from "react";

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading time
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000); // 2 seconds

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6">
          {/* Logo/Company Name */}
          <div className="text-center">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent mb-2">
              Wayfinders
            </h1>
            <p className="text-muted-foreground text-lg">
              Not feeling the crowd? We got you.
            </p>
          </div>

          {/* Loading Spinner */}
          <div className="relative">
            <div className="size-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>

          {/* Loading Text */}
          <p className="text-sm text-muted-foreground animate-pulse">
            Thinking about your journey...
          </p>
        </div>
      </div>
    );
  }

  return <WayfindingMap />;
}